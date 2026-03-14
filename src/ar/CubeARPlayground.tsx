import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Camera, Move, X, Box, RotateCcw, Loader2 } from 'lucide-react'
import { useGLTF, ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { XR, createXRStore, useXRHitTest, useXR, XRDomOverlay } from '@react-three/xr'

export interface ARModelInstance {
    id: string;
    url: string;
    position: [number, number, number];
}

const store = createXRStore({
    hitTest: true,
})

const matrixHelper = new THREE.Matrix4()
const hitTestPosition = new THREE.Vector3()

function DraggableModel({ model }: { model: ARModelInstance }) {
    const { scene } = useGLTF(model.url)
    const meshRef = useRef<THREE.Group>(null!)
    const clonedScene = useRef(scene.clone())

    useFrame((state, delta) => {
        if (meshRef.current) meshRef.current.rotation.y += delta * 0.2
    })

    return (
        <group ref={meshRef} position={model.position}>
            <primitive object={clonedScene.current} />
        </group>
    )
}

function FallbackCube({ position }: { position: [number, number, number] }) {
    const meshRef = useRef<THREE.Mesh>(null!)
    useFrame((state, delta) => {
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * 0.2
            meshRef.current.rotation.y += delta * 0.2
        }
    })

    return (
        <mesh ref={meshRef} position={position}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color="#a855f7" roughness={0.2} metalness={0.1} />
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
    })

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

function ARContent({ models, onPlace }: { models: ARModelInstance[], onPlace: (pos: [number, number, number]) => void }) {
    const isAR = useXR((state) => state.mode === 'immersive-ar')

    return (
        <>
            <ambientLight intensity={1} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            
            {!isAR && (
                <>
                    <OrbitControls makeDefault />
                    <ContactShadows position={[0, -0.1, 0]} opacity={0.4} scale={10} blur={2} far={4} />
                </>
            )}

            <Suspense fallback={<FallbackCube position={[0, 0, 0]} />}>
                {models.length > 0 ? (
                    models.map((model) => <DraggableModel key={model.id} model={model} />)
                ) : (
                    <FallbackCube position={[0, 0, 0]} />
                )}
            </Suspense>

            <HitTestReticle onPlace={onPlace} />

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

export function CubeARPlayground() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [models, setModels] = useState<ARModelInstance[]>([])
    const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')

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

    useEffect(() => {
        const load = () => {
            const s = localStorage.getItem('genai_ar_models')
            if (s) setModels(JSON.parse(s))
        }
        load()
        window.addEventListener('storage', load)
        return () => window.removeEventListener('storage', load)
    }, [])

    const place = (pos: [number, number, number]) => {
        const m: ARModelInstance = { id: Math.random().toString(36).substring(7), url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb', position: pos }
        const u = [...models, m]
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
    }

    return (
        <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
            {/* Background Camera */}
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-0 opacity-50" />

            {/* Loading Indicator */}
            {cameraStatus === 'loading' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                    <p className="text-white font-medium">Initializing AR Engine...</p>
                </div>
            )}

            {/* 3D Scene */}
            <div className="absolute inset-0 z-10 w-full h-full">
                <Canvas camera={{ position: [0, 0.5, 1.5] }} gl={{ alpha: true }}>
                    <XR store={store}>
                        <ARContent models={models} onPlace={place} />
                    </XR>
                </Canvas>
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 w-full z-30 flex flex-col items-center gap-4 pointer-events-none">
                <div className="flex gap-3 pointer-events-auto">
                    <button
                        onClick={() => store.enterAR()}
                        className="bg-purple-600 text-white px-8 py-4 rounded-full font-bold text-lg flex gap-3 items-center shadow-2xl transition-transform active:scale-95"
                    >
                        <Box className="w-6 h-6" />
                        Enter AR
                    </button>
                    <button onClick={() => { localStorage.removeItem('genai_ar_models'); setModels([]) }} className="bg-white/10 text-white p-4 rounded-full border border-white/20">
                        <RotateCcw className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    )
}
