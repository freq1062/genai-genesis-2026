import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { X, Box, RotateCcw, Loader2, Plus, Upload, Settings2 } from 'lucide-react'
import { useGLTF, ContactShadows, OrbitControls, Environment } from '@react-three/drei'
import { XR, createXRStore, useXR, XRDomOverlay } from '@react-three/xr'
import { useSceneStore } from '../store'
import type { ARModelInstance } from '../store'

const store = createXRStore({
    hitTest: false,
})

const MODEL_LIBRARY = [
    { name: 'Duck', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb' },
    { name: 'Chair', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb' },
    { name: 'Box', url: 'fallback' }
]

function StaticModel({ model, isSelected, onSelect }: { 
    model: ARModelInstance, 
    isSelected: boolean, 
    onSelect: () => void
}) {
    const { scene } = useGLTF(model.url !== 'fallback' ? model.url : 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb')
    
    return (
        <group 
            position={model.position} 
            rotation={model.rotation}
            scale={model.scale}
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
    )
}

function ARContent() {
    const models = useSceneStore((state) => state.models)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const isAR = useXR((state) => state.mode === 'immersive-ar')
    
    return (
        <>
            <ambientLight intensity={1} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            
            {!isAR && (
                <>
                    <OrbitControls makeDefault target={[0, 0, -1.5]} />
                    <ContactShadows position={[0, -0.5, 0]} opacity={0.4} scale={10} blur={2} far={4} />
                    <Environment preset="city" />
                </>
            )}

            <Suspense fallback={null}>
                {models.map((model) => (
                    <StaticModel 
                        key={model.id} 
                        model={model} 
                        isSelected={selectedId === model.id}
                        onSelect={() => setSelectedId(selectedId === model.id ? null : model.id)}
                    />
                ))}
            </Suspense>

            <XRDomOverlay className="pointer-events-none w-full h-full">
                <div className="absolute bottom-10 w-full flex flex-col items-center gap-4 pointer-events-none">
                    {isAR && (
                        <button
                            onPointerDown={(e) => { e.stopPropagation(); store.getState().session?.end(); }}
                            className="pointer-events-auto bg-red-600 text-white px-8 py-3 rounded-full font-bold shadow-xl"
                        >
                            Exit AR
                        </button>
                    )}
                </div>
            </XRDomOverlay>
        </>
    )
}

export function CubeARPlayground({ onOpenEditor }: { onOpenEditor: () => void }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const { addModel, resetScene } = useSceneStore()
    const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')
    const [showLibrary, setShowLibrary] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<string | null>(null)

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
    }, [])

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        setUploadStatus("Uploading...")
        const formData = new FormData()
        formData.append("file", file)
        try {
            const response = await fetch("http://localhost:8000/upload-image", { method: "POST", body: formData })
            const data = await response.json()
            setUploadStatus(`Success: ${data.classification}`)
        } catch (error) {
            console.error("Upload failed", error)
            setUploadStatus("Upload failed")
        }
    }

    const addModelFromLibrary = (libItem: typeof MODEL_LIBRARY[0]) => {
        const m: ARModelInstance = { 
            id: Math.random().toString(36).substring(7), 
            name: libItem.name,
            url: libItem.url, 
            position: [0, 0, -1.5],
            rotation: [0, 0, 0],
            scale: [0.5, 0.5, 0.5]
        }
        addModel(m)
        setShowLibrary(false)
    }

    return (
        <div className="relative w-full h-screen bg-[#020617] overflow-hidden font-sans">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-0 opacity-30" />

            <div className="absolute top-0 left-0 w-full p-6 z-40 flex justify-between items-start pointer-events-none">
                <div className="flex flex-col gap-2 pointer-events-auto">
                    <label className="bg-slate-900/90 backdrop-blur-xl border border-white/10 text-white px-5 py-3 rounded-2xl flex gap-2 items-center text-xs font-bold cursor-pointer shadow-2xl">
                        <Upload className="w-4 h-4 text-blue-400" />
                        {uploadStatus || "Upload Photo"}
                        <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
                    </label>
                </div>

                <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={onOpenEditor} className="bg-slate-900/90 backdrop-blur-xl border border-white/10 text-white px-5 py-3 rounded-2xl flex gap-2 items-center text-xs font-bold shadow-2xl">
                        <Settings2 className="w-4 h-4 text-purple-400" />
                        Edit Scene
                    </button>
                </div>
            </div>

            <div className="absolute inset-0 z-10 w-full h-full">
                <Canvas camera={{ position: [0, 0.5, 1], fov: 75 }} gl={{ alpha: true }}>
                    <XR store={store}>
                        <ARContent />
                    </XR>
                </Canvas>
            </div>

            <div className="absolute bottom-10 w-full z-40 flex flex-col items-center gap-4 px-6 pointer-events-none">
                {showLibrary && (
                    <div className="w-full max-w-sm bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-white/10 p-5 mb-2 pointer-events-auto shadow-2xl animate-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center mb-5 px-2">
                            <h3 className="text-white font-bold text-sm">Library</h3>
                            <button onClick={() => setShowLibrary(false)} className="text-white/40"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {MODEL_LIBRARY.map((item) => (
                                <button key={item.name} onClick={() => addModelFromLibrary(item)} className="flex flex-col items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5 active:scale-95">
                                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400"><Box className="w-6 h-6" /></div>
                                    <span className="text-[11px] text-white/70 font-bold uppercase">{item.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-5 pointer-events-auto">
                    <button onClick={() => setShowLibrary(true)} className="bg-white/10 text-white p-5 rounded-full border border-white/20 shadow-xl active:scale-90">
                        <Plus className="w-8 h-8" />
                    </button>
                    <button onClick={() => store.enterAR()} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-12 py-5 rounded-full font-black text-xl flex gap-3 items-center shadow-2xl active:scale-95 uppercase tracking-tighter">
                        <Box className="w-8 h-8" />
                        Enter AR
                    </button>
                    <button onClick={resetScene} className="bg-white/10 text-white p-5 rounded-full border border-white/20 shadow-xl active:scale-90">
                        <RotateCcw className="w-8 h-8" />
                    </button>
                </div>
            </div>

            {cameraStatus === 'loading' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#020617]">
                    <Loader2 className="w-14 h-14 text-blue-500 animate-spin mb-4" />
                    <p className="text-white/90 font-black uppercase tracking-[0.4em] text-xs">Genesis AR Engine</p>
                </div>
            )}
        </div>
    )
}
