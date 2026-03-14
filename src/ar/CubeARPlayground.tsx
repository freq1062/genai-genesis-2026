import { useRef, useEffect, useState, Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Box, RotateCcw, Loader2, Plus, Trash2, MapPin, X } from 'lucide-react'
import { useGLTF, ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { XR, createXRStore, useXRHitTest, useXR, XRDomOverlay } from '@react-three/xr'
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

const matrixHelper = new THREE.Matrix4()
const hitTestPosition = new THREE.Vector3()

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

function DraggableModel({ model, isSelected, onSelect, worldAnchor }: { model: ARModelInstance, isSelected: boolean, onSelect: () => void, worldAnchor: [number, number, number] }) {
    const { scene } = useGLTF(model.url)
    const meshRef = useRef<THREE.Group>(null!)

    // Instead of a ref, use useMemo to ensure the clone is updated if the scene changes
    const clonedScene = useMemo(() => scene.clone(), [scene])

    useFrame((state, delta) => {
        if (meshRef.current) {
            // Only rotate automatically if not selected or being actively manipulated
            if (!isSelected) {
                meshRef.current.rotation.y += delta * 0.2
            }

            // Selection bounce effect
            if (isSelected) {
                const s = (model.scale ? model.scale[0] : 0.5) * (1 + Math.sin(state.clock.elapsedTime * 5) * 0.1)
                meshRef.current.scale.set(s, s, s)
            } else {
                const s = model.scale ? model.scale[0] : 0.5
                meshRef.current.scale.set(s, s, s)
            }
        }
    })

    return (
        <group
            ref={meshRef}
            position={[
                model.position[0] + worldAnchor[0],
                model.position[1] + worldAnchor[1],
                model.position[2] + worldAnchor[2]
            ]}
            rotation={model.rotation || [0, 0, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <primitive object={clonedScene} />
        </group>
    )
}

function FallbackCube({ position, isSelected, onSelect, worldAnchor }: { position: [number, number, number], isSelected: boolean, onSelect: () => void, worldAnchor: [number, number, number] }) {
    const meshRef = useRef<THREE.Mesh>(null!)
    useFrame((state, delta) => {
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * 0.2
            meshRef.current.rotation.y += delta * 0.2
            const scale = isSelected ? (1 + Math.sin(state.clock.elapsedTime * 5) * 0.1) : 1
            meshRef.current.scale.set(scale, scale, scale)
        }
    })
    return (
        <mesh
            ref={meshRef}
            position={[
                position[0] + worldAnchor[0],
                position[1] + worldAnchor[1],
                position[2] + worldAnchor[2]
            ]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color={isSelected ? "orange" : "#a855f7"} roughness={0.2} metalness={0.1} />
        </mesh>
    )
}

function HitTestReticle({ onPlace }: { onPlace: (pos: [number, number, number]) => void }) {
    const reticleRef = useRef<THREE.Mesh>(null!)
    const isAR = useXR((state) => state.mode === 'immersive-ar')

    useXRHitTest((results, getWorldMatrix) => {
        if (isAR && results.length > 0 && reticleRef.current) {
            reticleRef.current.visible = true
            getWorldMatrix(matrixHelper, results[0])
            hitTestPosition.setFromMatrixPosition(matrixHelper)
            reticleRef.current.position.copy(hitTestPosition)
            reticleRef.current.rotation.x = -Math.PI / 2
        } else if (reticleRef.current) {
            reticleRef.current.visible = false
        }
    }, 'viewer')

    if (!isAR) return null

    return (
        <mesh
            ref={reticleRef}
            visible={false}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
                e.stopPropagation()
                onPlace([hitTestPosition.x, hitTestPosition.y, hitTestPosition.z])
            }}
        >
            <ringGeometry args={[0.08, 0.12, 32]} />
            <meshBasicMaterial color="lime" opacity={0.6} transparent side={THREE.DoubleSide} />
        </mesh>
    )
}

function ARContent({
    models,
    onUpdatePosition,
    selectedId,
    setSelectedId,
    worldAnchor,
    setWorldAnchor,
    isPlaced,
    setIsPlaced
}: {
    models: ARModelInstance[],
    onUpdatePosition: (id: string, pos: [number, number, number]) => void,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    worldAnchor: [number, number, number],
    setWorldAnchor: (pos: [number, number, number]) => void,
    isPlaced: boolean,
    setIsPlaced: (val: boolean) => void
}) {
    const isAR = useXR((state) => state.mode === 'immersive-ar')

    return (
        <>
            <ambientLight intensity={1} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />

            {!isAR && (
                <>
                    <OrbitControls makeDefault />
                    <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={10} blur={2} far={4} />
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
                </>
            )}

            <Suspense fallback={null}>
                {(isPlaced || !isAR) && models.map((model) => (
                    model.url === 'fallback' ?
                        <FallbackCube
                            key={model.id}
                            position={model.position}
                            isSelected={selectedId === model.id}
                            onSelect={() => setSelectedId(selectedId === model.id ? null : model.id)}
                            worldAnchor={isAR ? worldAnchor : [0, 0, 0]}
                        /> :
                        <DraggableModel
                            key={model.id}
                            model={model}
                            isSelected={selectedId === model.id}
                            onSelect={() => setSelectedId(selectedId === model.id ? null : model.id)}
                            worldAnchor={isAR ? worldAnchor : [0, 0, 0]}
                        />
                ))}
            </Suspense>

            <HitTestReticle onPlace={(pos) => {
                setWorldAnchor(pos);
                setIsPlaced(true);
            }} />

            <XRDomOverlay className="pointer-events-none w-full h-full">
                <div className="absolute bottom-10 w-full flex flex-col items-center gap-4 pointer-events-none">
                    {isAR && (
                        <div className="flex flex-col items-center gap-4">
                            {!isPlaced && (
                                <div className="bg-blue-600/90 backdrop-blur-md px-6 py-3 rounded-2xl text-white font-bold flex items-center gap-2 shadow-2xl animate-bounce">
                                    <MapPin className="w-5 h-5" />
                                    Tap Green Ring to Place Scene
                                </div>
                            )}
                            <button
                                onPointerDown={(e) => { e.stopPropagation(); store.getState().session?.end(); }}
                                className="pointer-events-auto bg-red-600 text-white px-8 py-3 rounded-full font-bold shadow-xl"
                            >
                                Exit AR
                            </button>
                        </div>
                    )}
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
    worldAnchor,
    setWorldAnchor,
    isPlaced,
    setIsPlaced,
    onReset,
    onAddProduct,
    onDelete
}: {
    models: ARModelInstance[],
    onUpdatePosition: (id: string, pos: [number, number, number]) => void,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    worldAnchor: [number, number, number],
    setWorldAnchor: (pos: [number, number, number]) => void,
    isPlaced: boolean,
    setIsPlaced: (val: boolean) => void,
    onReset: () => void,
    onAddProduct: (item: typeof MODEL_LIBRARY[0]) => void,
    onDelete: (id: string) => void
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
            // Stop camera stream on unmount
            const stream = videoRef.current?.srcObject as MediaStream
            stream?.getTracks().forEach(track => track.stop())
        }
    }, [])

    return (
        <div className="relative w-full h-full bg-[#0f172a] overflow-hidden font-sans">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-0 opacity-30" />

            <div className="absolute top-6 w-full z-40 px-6 flex justify-between items-start pointer-events-none text-white">
                <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-xl pointer-events-auto">
                    <div className={`w-2 h-2 rounded-full ${cameraStatus === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                        {selectedId ? "Item Selected - Tap Floor to Move" : "Live Preview Sync"}
                    </span>
                </div>
                {selectedId && (
                    <button onClick={() => onDelete(selectedId)} className="pointer-events-auto bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-full border border-red-500/50 backdrop-blur-md">
                        <Trash2 className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="absolute inset-0 z-10 w-full h-full">
                <Canvas key="viewer-canvas" camera={{ position: [0, 1.5, 3] }} gl={{ alpha: true }}>
                    <XR store={store}>
                        <ARContent
                            models={models}
                            onUpdatePosition={onUpdatePosition}
                            selectedId={selectedId}
                            setSelectedId={setSelectedId}
                            worldAnchor={worldAnchor}
                            setWorldAnchor={setWorldAnchor}
                            isPlaced={isPlaced}
                            setIsPlaced={setIsPlaced}
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
                    <button onClick={() => { setIsPlaced(false); store.enterAR(); }} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-10 py-5 rounded-full font-black text-xl flex gap-3 items-center shadow-2xl active:scale-95 uppercase tracking-tighter">
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
    const [worldAnchor, setWorldAnchor] = useState<[number, number, number]>([0, 0, 0])
    const [isPlaced, setIsPlaced] = useState(false)

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
            {/* Desktop / Mobile Switcher - Moved down to prevent overlap on mobile */}
            <div className="absolute top-20 left-6 z-50 flex gap-2">
                <button
                    onClick={() => { window.location.hash = ''; setViewMode('viewer'); }}
                    className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${viewMode === 'viewer' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-900/80 border-white/10 text-slate-400'}`}
                >
                    Viewer
                </button>
                <button
                    onClick={() => { window.location.hash = 'editor'; setViewMode('editor'); }}
                    className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${viewMode === 'editor' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-900/80 border-white/10 text-slate-400'}`}
                >
                    Editor
                </button>
            </div>

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
                    worldAnchor={worldAnchor}
                    setWorldAnchor={setWorldAnchor}
                    isPlaced={isPlaced}
                    setIsPlaced={setIsPlaced}
                    onReset={resetStorage}
                    onAddProduct={addModelFromLibrary}
                    onDelete={deleteSelected}
                />
            )}
        </div>
    )
}
