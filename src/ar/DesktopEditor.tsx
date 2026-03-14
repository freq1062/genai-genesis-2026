import { useRef, useState, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, TransformControls, ContactShadows, Grid, useGLTF, Environment } from '@react-three/drei'
import { Box, Move, RotateCw, Maximize, Trash2, Monitor, Smartphone, LayoutGrid, Settings2, X } from 'lucide-react'
import * as THREE from 'three'

interface ARModelInstance {
    id: string;
    name: string;
    url: string;
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
}

const MODEL_LIBRARY = [
    { name: 'Duck', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb' },
    { name: 'Chair', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb' },
    { name: 'Box', url: 'fallback' }
]

function EditableModel({ model, isSelected, onSelect, onUpdate, mode }: {
    model: ARModelInstance,
    isSelected: boolean,
    onSelect: () => void,
    onUpdate: (updates: Partial<ARModelInstance>) => void,
    mode: 'translate' | 'rotate' | 'scale'
}) {
    const { scene } = useGLTF(model.url === 'fallback' ? '' : model.url)
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

export function DesktopEditor() {
    const [models, setModels] = useState<ARModelInstance[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate')

    // Sync from LocalStorage
    useEffect(() => {
        const load = () => {
            const s = localStorage.getItem('genai_ar_models')
            if (s) setModels(JSON.parse(s))
        }
        load()
        window.addEventListener('storage', load)
        return () => window.removeEventListener('storage', load)
    }, [])

    const updateModel = (id: string, updates: Partial<ARModelInstance>) => {
        const u = models.map(m => m.id === id ? { ...m, ...updates } : m)
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
    }

    const addModel = (item: typeof MODEL_LIBRARY[0]) => {
        const m: ARModelInstance = {
            id: Math.random().toString(36).substring(7),
            name: item.name,
            url: item.url,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [0.5, 0.5, 0.5]
        }
        const u = [...models, m]
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        setSelectedId(m.id)
    }

    const deleteModel = (id: string) => {
        const u = models.filter(m => m.id !== id)
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        setSelectedId(null)
    }

    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)

    return (
        <div className="flex h-screen w-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
            {/* Mobile Sidebar Toggle */}
            <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="absolute top-6 left-6 z-50 md:hidden bg-indigo-600 p-3 rounded-xl shadow-2xl border border-indigo-400/30"
            >
                <LayoutGrid className="w-5 h-5 text-white" />
            </button>

            {/* Sidebar */}
            <div className={`fixed md:relative h-full w-80 flex flex-col border-r border-slate-800 bg-[#020617] z-40 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-xl">
                        <LayoutGrid className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-none">AR Stage</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-black">Desktop Editor</p>
                    </div>
                    {window.innerWidth <= 768 && (
                        <button onClick={() => setSidebarOpen(false)} className="ml-auto text-slate-500"><X className="w-5 h-5" /></button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Library */}
                    <section>
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Assets Library</h2>
                        <div className="grid grid-cols-2 gap-2">
                            {MODEL_LIBRARY.map(item => (
                                <button
                                    key={item.name}
                                    onClick={() => addModel(item)}
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
                                        onClick={(e) => { e.stopPropagation(); deleteModel(m.id); }}
                                        className="p-1 hover:text-red-400 text-slate-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-950/50">
                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                        <Smartphone className="w-4 h-4" />
                        <span>MOBILE SYNC ACTIVE</span>
                    </div>
                </div>
                <button
                    onClick={() => { if (confirm("Clear everything?")) { localStorage.clear(); location.reload(); } }}
                    className="p-4 text-[9px] text-red-500/50 hover:text-red-500 font-bold uppercase tracking-[0.2em] text-center border-t border-slate-900"
                >
                    Hard Reset Engine
                </button>
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 relative flex flex-col bg-slate-950">
                {/* Toolbar */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 p-1.5 rounded-2xl flex gap-1 shadow-2xl">
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
                <div className="absolute top-6 right-6 z-30 flex gap-2">
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 px-4 py-2 rounded-xl flex items-center gap-3 shadow-xl">
                        <Monitor className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desktop Master</span>
                    </div>
                </div>

                {/* 3D Canvas */}
                <Canvas key="editor-canvas" shadows camera={{ position: [5, 5, 5], fov: 45 }}>
                    <color attach="background" args={['#020617']} />
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
                    <Environment preset="city" />

                    <Suspense fallback={null}>
                        {models.map(m => (
                            <EditableModel
                                key={m.id}
                                model={m}
                                isSelected={selectedId === m.id}
                                onSelect={() => setSelectedId(m.id)}
                                onUpdate={(updates) => updateModel(m.id, updates)}
                                mode={mode}
                            />
                        ))}
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
