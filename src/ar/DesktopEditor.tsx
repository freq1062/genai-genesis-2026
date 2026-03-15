import { useRef, useState, useEffect, Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, TransformControls, ContactShadows, Grid, useGLTF, Environment } from '@react-three/drei'
import { Box, Move, RotateCw, Maximize, Trash2, Monitor, Smartphone, LayoutGrid, Settings2, X } from 'lucide-react'
import * as THREE from 'three'
import type { ARModelInstance } from './CubeARPlayground'
import { MODEL_LIBRARY, telemetrySync } from './CubeARPlayground'

function EditableModel({ model, isSelected, onSelect, onUpdate, mode }: {
    model: ARModelInstance,
    isSelected: boolean,
    onSelect: () => void,
    onUpdate: (updates: Partial<ARModelInstance>) => void,
    mode: 'translate' | 'rotate' | 'scale'
}) {
    // Avoid useGLTF crash if url is fallback
    const { scene } = useGLTF(model.url !== 'fallback' ? model.url : 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb')
    const meshRef = useRef<THREE.Group>(null!)

    // Handle gizmo updates
    const onTransformChange = () => {
        if (!meshRef.current) return
        const pos = meshRef.current.position.toArray() as [number, number, number]
        const rot = meshRef.current.rotation.toArray().slice(0, 3) as [number, number, number]
        const scl = meshRef.current.scale.toArray() as [number, number, number]
        onUpdate({ position: pos, rotation: rot, scale: scl })
    }

    return (
        <>
            {isSelected && (
                <TransformControls
                    object={meshRef.current}
                    mode={mode}
                    onMouseUp={onTransformChange}
                />
            )}
            <group
                ref={meshRef}
                position={model.position}
                rotation={model.rotation || [0, 0, 0]}
                scale={model.scale || [0.5, 0.5, 0.5]}
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
            >
                {model.url === 'fallback' ? (
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color={isSelected ? "orange" : "#a855f7"} />
                    </mesh>
                ) : (
                    <primitive object={scene.clone()} />
                )}
            </group>
        </>
    )
}

function UserIndicator({ position, rotation, active }: { position?: [number, number, number], rotation?: [number, number, number], active?: boolean }) {
    const groupRef = useRef<THREE.Group>(null!)

    // Convert raw arrays to Three.js Math objects for advanced interpolation
    const targetPos = useMemo(() => {
        const p = position || [0, 0, 0]
        // ONLY use X and Z for floor tracking. Lock Y to 0 so the indicator stays on the ground.
        return new THREE.Vector3(p[0], 0, p[2])
    }, [position])

    const targetQuat = useMemo(() => {
        const r = rotation || [0, 0, 0]
        // ONLY use Y-axis rotation (Yaw). Discard X (Pitch) and Z (Roll) so it doesn't tip over.
        const euler = new THREE.Euler(0, r[1], 0, 'YXZ')
        return new THREE.Quaternion().setFromEuler(euler)
    }, [rotation])

    useFrame((_state, delta) => {
        if (!groupRef.current) return

        // Time-scaled dampening formula for ultra-smooth chasing (frame-rate independent)
        const dampFactor = 1 - Math.exp(-15 * delta)

        // Fluid positional movement
        groupRef.current.position.lerp(targetPos, dampFactor)

        // Fluid rotational movement (Spherical Linear Interpolation completely eliminates 360 wrap jumps)
        groupRef.current.quaternion.slerp(targetQuat, dampFactor)
    })

    return (
        <group ref={groupRef}>
            {/* Body */}
            <mesh position={[0, 0.8, 0]}>
                <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
                <meshStandardMaterial
                    color={active ? "#10b981" : "#6366f1"}
                    emissive={active ? "#10b981" : "#6366f1"}
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.8}
                />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.4, 0]}>
                <sphereGeometry args={[0.18, 16, 16]} />
                <meshStandardMaterial
                    color={active ? "#10b981" : "#6366f1"}
                    emissive={active ? "#10b981" : "#6366f1"}
                    emissiveIntensity={0.8}
                />
            </mesh>
            {/* Visor/Eyes (Making direction VERY obvious) */}
            <mesh position={[0, 1.45, -0.15]}>
                <boxGeometry args={[0.2, 0.05, 0.1]} />
                <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} />
            </mesh>
            {/* Directonal Pointer (showing vision) */}
            <mesh position={[0, 1.4, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.1, 0.4, 16]} />
                <meshStandardMaterial color={active ? "#34d399" : "#818cf8"} />
            </mesh>
            {/* Base Ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[0.4, 0.45, 32]} />
                <meshBasicMaterial color={active ? "#10b981" : "#6366f1"} transparent opacity={0.5} />
            </mesh>
        </group>
    )
}

export function DesktopEditor({
    models,
    onAddModel,
    onUpdateModel,
    onDeleteModel
}: {
    models: ARModelInstance[],
    onAddModel: (item: typeof MODEL_LIBRARY[0]) => void,
    onUpdateModel: (id: string, updates: Partial<ARModelInstance>) => void,
    onDeleteModel: (id: string) => void
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
    const [remoteUser, setRemoteUser] = useState<{ position: [number, number, number], rotation: [number, number, number] } | null>(null)
    const [motionPermission, setMotionPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt')

    const requestMotion = async () => {
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission()
                setMotionPermission(permission === 'granted' ? 'granted' : 'denied')
            } catch (e) {
                console.error("Motion permission error:", e)
                setMotionPermission('denied')
            }
        } else {
            setMotionPermission('granted')
        }
    }

    // Sync from WebSockets for remote user only
    useEffect(() => {
        // Real-time Telemetry Sync via WebSocket
        const unsub = telemetrySync.subscribe((data) => {
            if (data.type === 'telemetry_pos') {
                setRemoteUser({
                    position: data.position,
                    rotation: data.rotation
                })
            }
        })

        return () => {
            unsub()
        }
    }, [])

    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)

    return (
        <div className="flex h-screen w-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
            {/* User Indicator Legend & Telemetry (Moved to Root for max visibility) */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none md:top-24 md:left-4 md:-translate-x-0">
                <div className={`backdrop-blur-xl border px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl transition-all pointer-events-auto justify-center ${remoteUser ? 'bg-emerald-900/40 border-emerald-500/30' : 'bg-slate-900/40 border-slate-700/30'}`}>
                    <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_rgba(0,0,0,0.5)] ${remoteUser ? 'bg-emerald-500 shadow-emerald-500' : 'bg-slate-500'}`} />
                    <span className={`text-[12px] font-black uppercase tracking-widest ${remoteUser ? 'text-emerald-200' : 'text-slate-300'}`}>
                        {remoteUser ? "Live Link Active" : "Telemetry Module"}
                    </span>
                </div>

                {motionPermission === 'prompt' && (
                    <button
                        onClick={requestMotion}
                        className="pointer-events-auto w-full text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl border border-indigo-400 font-black uppercase shadow-lg transition-all active:scale-95"
                    >
                        Enable Live Mirroring
                    </button>
                )}
            </div>

            {/* Mobile Sidebar Toggle */}
            <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`absolute top-40 left-6 z-[70] bg-indigo-600 p-4 rounded-2xl shadow-2xl border border-indigo-400/30 transition-all active:scale-90 ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
                <LayoutGrid className="w-6 h-6 text-white" />
            </button>

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 w-80 flex flex-col border-r border-slate-800 bg-[#020617] z-[60] transition-transform duration-300 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:relative md:translate-x-0'}`}>
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl">
                        <LayoutGrid className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-none">AR Stage</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-black">Editor</p>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="ml-auto text-slate-500 hover:text-white p-2 transition-colors"><X className="w-6 h-6" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Library */}
                    <section>
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Assets Library</h2>
                        <div className="grid grid-cols-2 gap-2">
                            {MODEL_LIBRARY.map(item => (
                                <button
                                    key={item.name}
                                    onClick={() => { onAddModel(item); setSelectedId(null); }}
                                    className="flex flex-col items-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-800 transition-all hover:border-slate-700 active:scale-95 group"
                                >
                                    <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                        <Box className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-bold">{item.name}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Scene Tree */}
                    <section>
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Scene Tree</h2>
                        <div className="space-y-1">
                            {models.length === 0 && (
                                <p className="text-xs text-slate-600 italic px-2">No objects in scene</p>
                            )}
                            {models.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => setSelectedId(m.id)}
                                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${selectedId === m.id ? 'bg-indigo-600/20 border border-indigo-500/50 text-white' : 'hover:bg-slate-900 border border-transparent'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${selectedId === m.id ? 'bg-indigo-400' : 'bg-slate-700'}`} />
                                        <span className="text-xs font-bold tracking-tight">{m.name}</span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDeleteModel(m.id); if (selectedId === m.id) setSelectedId(null); }}
                                        className="p-1 hover:text-red-400 text-slate-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* System Status & Telemetry Footer */}
                <div className="border-t border-slate-800 bg-[#070b1d] p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">System Status</span>
                        </div>
                        <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] transition-all duration-500 ${remoteUser ? 'bg-emerald-500 shadow-emerald-500/50 animate-pulse' : 'bg-slate-700 shadow-transparent'}`} />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                            <p className="text-[8px] text-slate-600 font-bold mb-0.5">LAT / X</p>
                            <p className="text-[10px] font-mono font-bold text-slate-300">
                                {remoteUser?.position[0].toFixed(2) || '0.00'}
                            </p>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                            <p className="text-[8px] text-slate-600 font-bold mb-0.5">LON / Z</p>
                            <p className="text-[10px] font-mono font-bold text-slate-300">
                                {remoteUser?.position[2].toFixed(2) || '0.00'}
                            </p>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                            <p className="text-[8px] text-slate-600 font-bold mb-0.5">YAW / DEG</p>
                            <p className="text-[10px] font-mono font-bold text-slate-300">
                                {remoteUser?.rotation ? ((remoteUser.rotation[1] * 180) / Math.PI).toFixed(1) : '0.0'}°
                            </p>
                        </div>
                        <div className="bg-indigo-900/20 p-2 rounded-lg border border-indigo-500/20 col-span-3">
                            <p className="text-[8px] text-indigo-400 font-bold mb-0.5 uppercase tracking-tighter">Scene Persistence Units</p>
                            <p className="text-[10px] font-mono font-bold text-indigo-200">
                                {models.length} Nodes Synchronized
                            </p>
                        </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                        {motionPermission === 'prompt' && (
                            <button
                                onClick={requestMotion}
                                className="w-full h-8 flex items-center justify-center gap-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                            >
                                <Smartphone className="w-3 h-3" />
                                Calibrate Mobile
                            </button>
                        )}
                        <button
                            onClick={() => { if (confirm("Hard reset engine state?")) { localStorage.clear(); location.reload(); } }}
                            className="w-full text-[8px] text-slate-600 hover:text-red-400 font-bold uppercase tracking-[0.2em] text-center p-1 transition-colors"
                        >
                            Emergency Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 relative flex flex-col bg-slate-950">
                {/* Toolbar */}
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 p-1.5 rounded-2xl flex gap-1 shadow-2xl">
                    <button
                        onClick={() => setMode('translate')}
                        className={`p-3 rounded-xl transition-all ${mode === 'translate' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}`}
                    >
                        <Move className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setMode('rotate')}
                        className={`p-3 rounded-xl transition-all ${mode === 'rotate' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}`}
                    >
                        <RotateCw className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setMode('scale')}
                        className={`p-3 rounded-xl transition-all ${mode === 'scale' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}`}
                    >
                        <Maximize className="w-5 h-5" />
                    </button>
                </div>

                {/* Perspective Toggle */}
                <div className="absolute top-24 right-6 z-30 flex gap-2">
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl">
                        <Monitor className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desktop Master</span>
                    </div>
                </div>

                {/* 3D Canvas */}
                <Canvas key="editor-canvas" shadows camera={{ position: [5, 5, 5], fov: 45 }}>
                    <color attach="background" args={['#020617']} />
                    <gridHelper args={[100, 100, "#334155", "#1e293b"]} position={[0, 0, 0]} />
                    <Grid
                        infiniteGrid
                        fadeDistance={50}
                        sectionSize={1}
                        sectionColor="#475569"
                        cellColor="#1e293b"
                        sectionThickness={1.5}
                    />
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
                    <Environment preset="city" />

                    {motionPermission !== 'granted' && <OrbitControls makeDefault />}

                    <Suspense fallback={null}>
                        {models.map(m => (
                            <EditableModel
                                key={m.id}
                                model={m}
                                isSelected={selectedId === m.id}
                                onSelect={() => setSelectedId(m.id)}
                                onUpdate={(updates) => onUpdateModel(m.id, updates)}
                                mode={mode}
                            />
                        ))}
                        <UserIndicator
                            position={remoteUser?.position}
                            rotation={remoteUser?.rotation} // Restored live rotation
                            active={!!remoteUser}
                        />
                    </Suspense>

                    <Grid infiniteGrid fadeDistance={20} sectionColor="#1e293b" cellColor="#0f172a" />
                    <OrbitControls makeDefault />
                    <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
                </Canvas>

                {/* Selection HUD */}
                {selectedId && (
                    <div className="absolute bottom-6 right-6 w-64 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl z-30 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Transform</span>
                            <Settings2 className="w-4 h-4 text-slate-600" />
                        </div>
                        {models.find(m => m.id === selectedId) && (
                            <div className="space-y-3">
                                <div>
                                    <p className="text-[10px] text-slate-500 mb-1">Position</p>
                                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">X: {models.find(m => m.id === selectedId)!.position[0].toFixed(2)}</div>
                                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">Y: {models.find(m => m.id === selectedId)!.position[1].toFixed(2)}</div>
                                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">Z: {models.find(m => m.id === selectedId)!.position[2].toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
