import { useRef, useEffect, useState, Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Box, RotateCcw, Loader2, Plus, Trash2, X, Home } from 'lucide-react'
import { useGLTF, ContactShadows, OrbitControls, Environment } from '@react-three/drei'
import * as THREE from 'three'
import { XR, createXRStore, useXR, XRDomOverlay } from '@react-three/xr'
import { DesktopEditor } from './DesktopEditor'

export interface ARModelInstance {
    id: string;
    name: string;
    url: string;
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
}

const store = createXRStore({
    hitTest: true,
})



const MODEL_LIBRARY = [
    { name: 'Duck', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb' },
    { name: 'Chair', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb' },
    { name: 'Box', url: 'fallback' }
]

const logs: string[] = []
const originalError = console.error
console.error = (...args) => {
    logs.push(args.map(a => String(a)).join(' '))
    originalError(...args)
}

function DraggableModel({ model, isSelected, onSelect }: { model: ARModelInstance, isSelected: boolean, onSelect: () => void }) {
    const { scene } = useGLTF(model.url)
    const meshRef = useRef<THREE.Group>(null!)

    // Instead of a ref, use useMemo to ensure the clone is updated if the scene changes
    const clonedScene = useMemo(() => scene.clone(), [scene])

    useFrame((state) => {
        if (meshRef.current) {
            // Selection bounce effect - apply to the base scale
            const baseScaleX = model.scale ? model.scale[0] : 0.5;
            const baseScaleY = model.scale ? model.scale[1] : 0.5;
            const baseScaleZ = model.scale ? model.scale[2] : 0.5;

            if (isSelected) {
                const bounce = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
                meshRef.current.scale.set(baseScaleX * bounce, baseScaleY * bounce, baseScaleZ * bounce)
            } else {
                meshRef.current.scale.set(baseScaleX, baseScaleY, baseScaleZ)
            }
        }
    })

    return (
        <group
            ref={meshRef}
            position={model.position}
            rotation={model.rotation || [0, 0, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <primitive object={clonedScene} />
        </group>
    )
}

function FallbackCube({ position, rotation, scale, isSelected, onSelect }: { position: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number], isSelected: boolean, onSelect: () => void }) {
    const meshRef = useRef<THREE.Mesh>(null!)
    useFrame((state) => {
        if (meshRef.current) {
            const baseScaleX = scale ? scale[0] : 0.5;
            const baseScaleY = scale ? scale[1] : 0.5;
            const baseScaleZ = scale ? scale[2] : 0.5;

            if (isSelected) {
                const bounce = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
                meshRef.current.scale.set(baseScaleX * bounce, baseScaleY * bounce, baseScaleZ * bounce)
            } else {
                meshRef.current.scale.set(baseScaleX, baseScaleY, baseScaleZ)
            }
        }
    })
    return (
        <mesh
            ref={meshRef}
            position={position}
            rotation={rotation || [0, 0, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={isSelected ? "orange" : "#a855f7"} />
        </mesh>
    )
}


function ARContent({
    models,
    onUpdatePosition,
    selectedId,
    setSelectedId,
    onSwitchMode
}: {
    models: ARModelInstance[],
    onUpdatePosition: (id: string, pos: [number, number, number]) => void,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    onSwitchMode: (m: 'editor' | 'viewer') => void
}) {
    const isAR = useXR((state) => state.mode === 'immersive-ar')

    return (
        <>
            <ambientLight intensity={1} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />

            {!isAR && (
                <>
                    <OrbitControls makeDefault />
                    <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
                    <mesh
                        rotation={[-Math.PI / 2, 0, 0]}
                        position={[0, -0.01, 0]}
                        onPointerDown={(e) => {
                            if (selectedId) {
                                onUpdatePosition(selectedId, [e.point.x, 0, e.point.z]);
                            }
                        }}
                    >
                        <planeGeometry args={[100, 100]} />
                        <meshBasicMaterial transparent opacity={0} />
                    </mesh>
                    <Environment preset="city" />
                </>
            )}

            <Suspense fallback={null}>
                <group position={isAR ? [0, 0, -3] : [0, 0, 0]}>
                    {models.map((model) => (
                        model.url === 'fallback' ?
                            <FallbackCube
                                key={model.id}
                                position={model.position}
                                rotation={model.rotation}
                                scale={model.scale}
                                isSelected={selectedId === model.id}
                                onSelect={() => setSelectedId(selectedId === model.id ? null : model.id)}
                            /> :
                            <DraggableModel
                                key={model.id}
                                model={model}
                                isSelected={selectedId === model.id}
                                onSelect={() => setSelectedId(selectedId === model.id ? null : model.id)}
                            />
                    ))}
                </group>
            </Suspense>

            <XRDomOverlay className="pointer-events-none w-full h-full">
                {/* 
                    IMPORTANT: Do NOT wrap this in {isAR && ...} — the XRDomOverlay content 
                    must already exist in the DOM when the XR session starts, otherwise 
                    the buttons never mount into the overlay and are invisible.
                    The overlay itself is only visible during XR, so no conditional needed.
                */}
                <div className="absolute top-8 w-full z-[100] px-4 flex justify-between items-start pointer-events-none">
                    {/* Left: Exit AR - goes home */}
                    <button
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            store.getState().session?.end();
                            setTimeout(() => { window.location.href = '/'; }, 500);
                        }}
                        className="bg-red-600 text-white px-5 py-3 rounded-full font-black uppercase tracking-widest shadow-2xl active:scale-95 pointer-events-auto flex items-center gap-2 text-sm"
                    >
                        <Home className="w-5 h-5" />
                        Exit
                    </button>

                    {/* Center: Status */}
                    <div className="bg-green-600/80 backdrop-blur-md px-4 py-2 rounded-2xl text-white font-bold flex items-center gap-2 shadow-2xl pointer-events-auto border border-white/20 text-xs">
                        <Box className="w-4 h-4" />
                        AR Mode Active
                    </div>

                    {/* Right: Go back to AR Camera view (non-immersive) */}
                    <button
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            store.getState().session?.end();
                            setTimeout(() => onSwitchMode('viewer'), 500);
                        }}
                        className="bg-slate-900/90 text-white px-5 py-3 rounded-full font-black uppercase tracking-widest shadow-2xl active:scale-95 pointer-events-auto border border-white/20 text-sm"
                    >
                        Back
                    </button>
                </div>
            </XRDomOverlay>
        </>
    )
}

function ARViewer({
    models,
    onUpdatePosition,
    selectedId,
    setSelectedId,
    onReset,
    onAddProduct,
    onDelete,
    onSwitchMode
}: {
    models: ARModelInstance[],
    onUpdatePosition: (id: string, pos: [number, number, number]) => void,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    onReset: () => void,
    onAddProduct: (item: typeof MODEL_LIBRARY[0]) => void,
    onDelete: (id: string) => void,
    onSwitchMode: (m: 'editor' | 'viewer') => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')
    const [showLibrary, setShowLibrary] = useState(false)

    useEffect(() => {
        async function setupCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    setCameraStatus('ok')
                }
            } catch (err) {
                console.error("Camera failed:", err)
                setCameraStatus('error')
            }
        }
        setupCamera()
        return () => {
            const stream = videoRef.current?.srcObject as MediaStream
            stream?.getTracks().forEach(track => track.stop())
        }
    }, [])

    return (
        <div className="relative w-full h-full bg-[#0f172a] overflow-hidden font-sans">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-0 opacity-40" />

            <div className="absolute top-24 w-full z-40 px-6 flex justify-start items-start pointer-events-none text-white">
                <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-xl pointer-events-auto">
                    <div className={`w-2 h-2 rounded-full ${cameraStatus === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                        {selectedId ? "Item Selected - Tap Floor to Move" : "Live Preview Sync"}
                    </span>
                </div>
                {selectedId && (
                    <button onClick={() => onDelete(selectedId)} className="pointer-events-auto ml-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-full border border-red-500/50 backdrop-blur-md">
                        <Trash2 className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="absolute inset-0 z-10 w-full h-full">
                <Canvas key="viewer-canvas" shadows camera={{ position: [5, 5, 5], fov: 45 }} gl={{ alpha: true }}>
                    <XR store={store}>
                        <ARContent
                            models={models}
                            onUpdatePosition={onUpdatePosition}
                            selectedId={selectedId}
                            setSelectedId={setSelectedId}
                            onSwitchMode={onSwitchMode}
                        />
                    </XR>
                </Canvas>
            </div>

            <div className="absolute bottom-10 w-full z-30 flex flex-col items-center gap-4 px-6 pointer-events-none">
                {showLibrary && (
                    <div className="w-full max-w-sm bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-white/10 p-4 mb-2 pointer-events-auto shadow-2xl">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h3 className="text-white font-bold text-sm">Library</h3>
                            <button onClick={() => setShowLibrary(false)} className="text-white/40"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {MODEL_LIBRARY.map((item) => (
                                <button
                                    key={item.name}
                                    onClick={() => { onAddProduct(item); setShowLibrary(false); }}
                                    className="flex flex-col items-center gap-2 p-3 bg-white/5 rounded-2xl border border-white/5 active:scale-95"
                                >
                                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
                                        <Box className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] text-white/70 font-bold uppercase">{item.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-4 pointer-events-auto">
                    <button onClick={() => setShowLibrary(true)} className="bg-white/10 text-white p-4 rounded-full border border-white/20 shadow-xl active:scale-90">
                        <Plus className="w-7 h-7" />
                    </button>
                    <button onClick={() => { store.enterAR(); }} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-10 py-5 rounded-full font-black text-xl flex gap-3 items-center shadow-2xl active:scale-95 uppercase tracking-tighter">
                        <Box className="w-7 h-7" />
                        Enter AR
                    </button>
                    <button onClick={onReset} className="bg-white/10 text-white p-4 rounded-full border border-white/20 shadow-xl active:scale-90">
                        <RotateCcw className="w-7 h-7" />
                    </button>
                </div>
            </div>

            {cameraStatus === 'loading' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f172a]">
                    <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                    <p className="text-white/90 font-black uppercase tracking-[0.3em] text-xs">Genesis AR Engine</p>
                </div>
            )}
        </div>
    )
}

export function CubeARPlayground() {
    const [models, setModels] = useState<ARModelInstance[]>([])
    const [viewMode, setViewMode] = useState(window.location.hash === '#editor' ? 'editor' : 'viewer')
    const [selectedId, setSelectedId] = useState<string | null>(null)

    useEffect(() => {
        const handleHash = () => setViewMode(window.location.hash === '#editor' ? 'editor' : 'viewer')
        window.addEventListener('hashchange', handleHash)
        return () => window.removeEventListener('hashchange', handleHash)
    }, [])

    useEffect(() => {
        const load = () => {
            const s = localStorage.getItem('genai_ar_models')
            if (s) setModels(JSON.parse(s))
        }
        load()
        window.addEventListener('storage', load)
        window.addEventListener('focus', load)
        return () => {
            window.removeEventListener('storage', load)
            window.removeEventListener('focus', load)
        }
    }, [])

    const addModelFromLibrary = (libItem: typeof MODEL_LIBRARY[0]) => {
        const m: ARModelInstance = {
            id: Math.random().toString(36).substring(7),
            name: libItem.name,
            url: libItem.url,
            position: [0, 0, -1]
        }
        const u = [...models, m]
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        setSelectedId(m.id)
    }

    const updateModelPosition = (id: string, pos: [number, number, number]) => {
        const u = models.map(m => m.id === id ? { ...m, position: pos } : m)
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
    }

    const resetStorage = () => {
        localStorage.removeItem('genai_ar_models')
        setModels([])
        setSelectedId(null)
        setIsPlaced(false)
    }

    const deleteSelected = (idToDelete: string) => {
        const u = models.filter(m => m.id !== idToDelete)
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        setSelectedId(null)
    }

    const isEditor = viewMode === 'editor'

    return (
        <div key={viewMode} className="relative w-full h-screen bg-[#0f172a] overflow-hidden font-sans">
            {isEditor ? (
                <div className="relative w-full h-screen">
                    <DesktopEditor />
                </div>
            ) : (
                <ARViewer
                    models={models}
                    onUpdatePosition={updateModelPosition}
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                    onReset={resetStorage}
                    onAddProduct={addModelFromLibrary}
                    onDelete={deleteSelected}
                    onSwitchMode={(mode) => {
                        window.location.hash = mode === 'editor' ? 'editor' : '';
                        setViewMode(mode);
                    }}
                />
            )}

            {/* Global Top Bar - Visible only when NOT in Immersive AR */}
            <div className="absolute top-6 w-full z-[100] px-6 flex justify-between items-center pointer-events-none">
                <a
                    href="/"
                    className="p-3 bg-slate-900/90 hover:bg-slate-800 text-white rounded-full border border-white/10 backdrop-blur-md shadow-2xl transition-all active:scale-90 pointer-events-auto shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center w-12 h-12"
                    title="Exit to Dashboard"
                >
                    <Home className="w-5 h-5 min-w-[20px]" />
                </a>

                <div className="flex gap-1 p-1 bg-slate-900/90 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl pointer-events-auto">
                    <button
                        onClick={async () => {
                            if (store.getState().session) await store.getState().session?.end();
                            setTimeout(() => {
                                window.location.hash = 'editor';
                                setViewMode('editor');
                            }, 50);
                        }}
                        className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'editor' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Desktop Editor
                    </button>
                    <button
                        onClick={async () => {
                            if (store.getState().session) await store.getState().session?.end();
                            setTimeout(() => {
                                window.location.hash = '';
                                setViewMode('viewer');
                            }, 50);
                        }}
                        className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'viewer' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        AR Camera
                    </button>
                </div>

                <div className="w-12 h-12"></div> {/* Spacer to keep switcher perfectly centered */}
            </div>
        </div>
    )
}
