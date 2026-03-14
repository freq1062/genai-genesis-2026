import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Camera, AlertCircle, Move, Plus } from 'lucide-react'
import { DragControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Type definition for what the teammate's web app will save to localStorage
export interface ARModelInstance {
    id: string;
    url: string;
    initialPosition?: [number, number, number];
}

function DraggableModel({ model }: { model: ARModelInstance }) {
    const meshRef = useRef<THREE.Group>(null!)
    const { scene } = useGLTF(model.url)
    const [active, setActive] = useState(false)

    // Clone the scene so we can have multiple of the exact same model loaded without Three.js material clashing
    const clonedScene = useRef(scene.clone())

    useFrame((state, delta) => {
        if (!active && meshRef.current) {
            meshRef.current.rotation.y += delta * 0.2
        }
    })

    return (
        <DragControls
            onDragStart={() => setActive(true)}
            onDragEnd={() => setActive(false)}
        >
            <group
                ref={meshRef}
                position={model.initialPosition || [0, 0, 0]}
                scale={active ? 1.1 : 1}
            >
                <primitive object={clonedScene.current} />
            </group>
        </DragControls>
    )
}

function FallbackCube() {
    const meshRef = useRef<THREE.Mesh>(null!)
    const [hovered, setHover] = useState(false)
    const [active, setActive] = useState(false)

    useFrame((state, delta) => {
        if (!active) {
            meshRef.current.rotation.x += delta * 0.2
            meshRef.current.rotation.y += delta * 0.2
        }
    })

    return (
        <DragControls
            onDragStart={() => setActive(true)}
            onDragEnd={() => setActive(false)}
        >
            <mesh
                ref={meshRef}
                position={[0, 0, 0]}
                onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); }}
                onPointerOut={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(false); }}
            >
                <boxGeometry args={[1.5, 1.5, 1.5]} />
                <meshStandardMaterial
                    color={active ? "#a855f7" : hovered ? "#d8b4fe" : "#c084fc"}
                    wireframe={false}
                    roughness={0.2}
                    metalness={0.1}
                />
            </mesh>
        </DragControls>
    )
}

export function CubeARPlayground() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [models, setModels] = useState<ARModelInstance[]>([])

    // Sync models from LocalStorage
    useEffect(() => {
        const loadModels = () => {
            try {
                const stored = localStorage.getItem('genai_ar_models')
                if (stored) {
                    setModels(JSON.parse(stored))
                }
            } catch (err) {
                console.error("Failed to parse AR models from localStorage", err)
            }
        }

        // Load initially
        loadModels()

        // Listen for updates from the main React app (cross-tab interaction)
        window.addEventListener('storage', loadModels)

        // Also poll every 1s just in case it was updated on the exact same page
        const interval = setInterval(loadModels, 1000)

        return () => {
            window.removeEventListener('storage', loadModels)
            clearInterval(interval)
        }
    }, [])

    // Debug button to inject a mock chair model for testing
    const injectMockModel = () => {
        const newModel: ARModelInstance = {
            id: Math.random().toString(36).substring(7),
            url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
            initialPosition: [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0] // Randomize start position
        }
        const updated = [...models, newModel]
        localStorage.setItem('genai_ar_models', JSON.stringify(updated))
        setModels(updated) // State update forces re-render instantly instead of waiting for poll
    }

    useEffect(() => {
        let stream: MediaStream | null = null;

        async function setupCamera() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                })
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                }
            } catch (err: any) {
                console.error("Error accessing camera:", err)
                setErrorMsg(err.message || "Camera access denied. Are you on HTTP and not localhost?")
            }
        }
        setupCamera()

        return () => {
            // Cleanup camera on unmount
            if (stream) {
                stream.getTracks().forEach(track => track.stop())
            }
        }
    }, [])

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
            {/* Header */}
            <div className="absolute top-10 w-full z-20 flex flex-col items-center gap-3 pointer-events-none px-4">
                <div className="flex gap-2 items-center px-6 py-2 bg-slate-900/60 backdrop-blur-md rounded-full border border-slate-500/50 shadow-lg justify-center w-max">
                    <Camera className="w-5 h-5 text-slate-300" />
                    <span className="text-slate-100 font-medium tracking-wide text-center text-sm sm:text-base">
                        HTML5 Camera Fallback Test
                    </span>
                </div>

                {errorMsg && (
                    <div className="flex gap-2 items-center px-4 py-3 bg-red-900/80 backdrop-blur-md rounded-lg border border-red-500/50 shadow-lg max-w-sm pointer-events-auto mt-2">
                        <AlertCircle className="w-6 h-6 text-red-300 shrink-0" />
                        <p className="text-red-100 font-medium text-xs">
                            {errorMsg}. Try viewing this on localhost or enabling HTTPS! Web Browsers block standard HTML5 camera requests over raw IP.
                        </p>
                    </div>
                )}
            </div>

            {/* Background HTML5 Video Feed */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover z-0"
            />

            {/* Foreground 3D Canvas rendering a massive cube */}
            {/* Remove pointer-events-none from the Canvas container, but we need the CSS absolute positioning to overlay */}
            <div className="absolute inset-0 z-10 w-full h-full">
                <Canvas camera={{ position: [0, 0, 5] }} gl={{ alpha: true, antialias: true }}>
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[10, 10, 5]} intensity={1.5} />
                    <Suspense fallback={null}>
                        {models.length > 0 ? (
                            models.map((model) => (
                                <DraggableModel key={model.id} model={model} />
                            ))
                        ) : (
                            <FallbackCube />
                        )}
                    </Suspense>
                </Canvas>
            </div>

            <div className="absolute bottom-10 w-full z-20 flex flex-col items-center gap-4 pointer-events-none">
                <button
                    onClick={injectMockModel}
                    className="pointer-events-auto bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-full font-semibold shadow-lg backdrop-blur-md transition-all active:scale-95 flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Add Storage Dummy Model
                </button>

                <div className="bg-black/50 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10 text-white/90 text-sm font-medium flex items-center gap-2">
                    <Move className="w-4 h-4" />
                    Click and drag objects to move them
                </div>
            </div>
        </div>
    )
}
