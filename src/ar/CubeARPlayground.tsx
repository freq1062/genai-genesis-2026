import { useRef, useEffect, useState, Suspense, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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



export const MODEL_LIBRARY = [
    { name: 'Duck', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb' },
    { name: 'Chair', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb' },
    { name: 'Box', url: 'fallback' }
]

class TelemetrySync {
    ws: WebSocket | null = null;
    listeners: Set<(data: any) => void> = new Set();

    constructor() {
        if (typeof window !== 'undefined') {
            this.connect();
        }
    }

    connect() {
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ar-sync`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                this.listeners.forEach(l => l(data));
            } catch (err) { }
        };
        this.ws.onclose = () => {
            setTimeout(() => this.connect(), 1000);
        };
    }

    send(data: any) {
        if (this.ws && this.ws.readyState === 1) { // 1 = OPEN
            this.ws.send(JSON.stringify(data));
        }
    }

    subscribe(fn: (data: any) => void) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
}

export const telemetrySync = new TelemetrySync();

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
export function PositionTracker() {
    const lastUpdate = useRef(0)
    const lastPos = useRef<[number, number, number]>([0, 0, 0])
    const lastRot = useRef<[number, number, number]>([0, 0, 0])

    useFrame((state) => {
        // Only broadcast if THIS tab is the one being looked at (prevent sync loops)
        if (!document.hasFocus()) return

        const now = Date.now()
        if (now - lastUpdate.current > 33) {
            const pos = state.camera.position.toArray() as [number, number, number]
            const rot = (state.camera.rotation.toArray() as any).slice(0, 3) as [number, number, number]

            // Only update if difference is meaningful to prevent micro-jitter syncing
            const dPos = Math.sqrt(
                Math.pow(pos[0] - lastPos.current[0], 2) +
                Math.pow(pos[1] - lastPos.current[1], 2) +
                Math.pow(pos[2] - lastPos.current[2], 2)
            )
            const dRot = Math.abs(rot[1] - lastRot.current[1])

            if (dPos > 0.001 || dRot > 0.002) {
                // Keep local storage for backup/legacy
                localStorage.setItem('genai_user_pos', JSON.stringify({ position: pos, rotation: rot }))
                // Stream to WebSocket for true cross-device sync
                telemetrySync.send({ type: 'telemetry_pos', position: pos, rotation: rot })

                lastPos.current = [pos[0], pos[1], pos[2]]
                lastRot.current = [rot[0], rot[1], rot[2]]
            }
            lastUpdate.current = now
        }
    })
    return null
}

export function OrientationTracker({ enabled }: { enabled: boolean }) {
    const orientation = useRef({ alpha: 0, beta: 0, gamma: 0 })
    const damped = useRef({ alpha: 0, beta: 0, gamma: 0 })
    const initialYaw = useRef<number | null>(null)

    useFrame((state) => {
        if (!enabled) return

        // Shortest-path angle interpolation function to prevent 360->0 spinouts
        const lerpAngle = (a: number, b: number, t: number) => {
            const da = (b - a) % 360
            const shortestDiff = 2 * da % 360 - da
            return a + shortestDiff * t
        }

        // Stronger LERP for high stability (0.05 weighting)
        damped.current.alpha = lerpAngle(damped.current.alpha, orientation.current.alpha, 0.05)
        damped.current.beta = lerpAngle(damped.current.beta, orientation.current.beta, 0.05)
        damped.current.gamma = lerpAngle(damped.current.gamma, orientation.current.gamma, 0.05)

        const { alpha, beta, gamma } = damped.current

        // Establish baseline "Forward" on first move
        if (initialYaw.current === null && alpha !== 0) {
            initialYaw.current = alpha
        }

        const alphaRad = THREE.MathUtils.degToRad(alpha - (initialYaw.current || 0))
        const betaRad = THREE.MathUtils.degToRad(beta)
        const gammaRad = THREE.MathUtils.degToRad(gamma)

        // Smooth output to camera
        state.camera.rotation.set(betaRad - Math.PI / 2, alphaRad, gammaRad, 'YXZ')
    })

    useEffect(() => {
        if (!enabled) return

        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (e.alpha !== null) orientation.current.alpha = e.alpha
            if (e.beta !== null) orientation.current.beta = e.beta
            if (e.gamma !== null) orientation.current.gamma = e.gamma
        }
        window.addEventListener('deviceorientation', handleOrientation)
        return () => window.removeEventListener('deviceorientation', handleOrientation)
    }, [enabled])

    return null
}


function ARContent({
    models,
    onUpdatePosition,
    selectedId,
    setSelectedId,
    onSwitchMode,
    motionPermission,
    pendingModelTemplate,
    onDrop
}: {
    models: ARModelInstance[],
    onUpdatePosition: (id: string, pos: [number, number, number]) => void,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    onSwitchMode: (m: 'editor' | 'viewer') => void,
    motionPermission: 'granted' | 'prompt' | 'denied',
    pendingModelTemplate: typeof MODEL_LIBRARY[0] | null,
    onDrop: (pos: [number, number, number], rot: [number, number, number]) => void
}) {
    const isAR = useXR((state) => state.mode === 'immersive-ar')
    const { camera } = useThree()
    const enabledOrientation = motionPermission === 'granted'

    return (
        <>
            <ambientLight intensity={1} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />

            {/* ONLY run manual orientation tracker if NOT in immersive AR mode. 
                WebXR naturally handles 6DOF camera updates, so they would fight otherwise */}
            {!isAR && <OrientationTracker enabled={motionPermission === 'granted'} />}

            <PositionTracker />

            {!isAR && (
                <>
                    {!enabledOrientation && <OrbitControls makeDefault enableDamping={false} />}
                    <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
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
                            e.preventDefault();
                            e.stopPropagation();
                            const session = store.getState().session;
                            if (session) {
                                session.end().then(() => {
                                    window.location.href = '/';
                                });
                            } else {
                                window.location.href = '/';
                            }
                        }}
                        className="bg-red-600 text-white px-5 py-3 rounded-full font-black uppercase tracking-widest shadow-2xl active:scale-95 pointer-events-auto flex items-center gap-2 text-sm"
                    >
                        <Home className="w-5 h-5" />
                        Exit
                    </button>

                    {/* Center: Status or Drop Action */}
                    {pendingModelTemplate ? (
                        <button
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const pos = camera.position.toArray() as [number, number, number];
                                const rot = (camera.rotation.toArray() as any).slice(0, 3) as [number, number, number];
                                onDrop([pos[0], 0, pos[2]], [0, rot[1], 0]);
                            }}
                            className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-95 pointer-events-auto flex items-center gap-3 text-lg border-2 border-emerald-300 transform -translate-y-2 animate-bounce flex-shrink-0"
                        >
                            <Plus className="w-6 h-6" />
                            Drop {pendingModelTemplate.name} Here
                        </button>
                    ) : (
                        <div className="bg-green-600/80 backdrop-blur-md px-4 py-2 rounded-2xl text-white font-bold flex items-center gap-2 shadow-2xl pointer-events-auto border border-white/20 text-xs">
                            <Box className="w-4 h-4" />
                            AR Mode Active
                        </div>
                    )}

                    {/* Right: Go back to AR Camera view (non-immersive) */}
                    <div className="flex gap-3 items-center">
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
                        <button
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                store.getState().session?.end();
                                setTimeout(() => onSwitchMode('editor'), 500);
                            }}
                            className="bg-indigo-600 text-white px-5 py-3 rounded-full font-black uppercase tracking-widest shadow-2xl active:scale-95 pointer-events-auto border border-indigo-400/50 text-sm"
                        >
                            Editor
                        </button>
                    </div>
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
    onDelete
}: {
    models: ARModelInstance[],
    onUpdatePosition: (id: string, pos: [number, number, number]) => void,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    onReset: () => void,
    onAddProduct: (item: typeof MODEL_LIBRARY[0]) => void,
    onDelete: (id: string) => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')
    const [showLibrary, setShowLibrary] = useState(false)
    const [telemetry, setTelemetry] = useState<{ x: number, z: number, angle: number } | null>(null)
    const [motionPermission, setMotionPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt')

    const [isIpadDesktop, setIsIpadDesktop] = useState(false)

    useEffect(() => {
        // Detect if an iPad is pretending to be a Mac (Desktop Site feature).
        // Desktop Safari removes the `requestPermission` API explicitly, destroying the gyroscope.
        const isIpadOS = navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1;
        if (isIpadOS && typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
            setIsIpadDesktop(true)
        }
    }, [])

    const requestMotion = async () => {
        if (isIpadDesktop) {
            alert('Your iPad is in "Desktop Website" mode! Please tap the "Aa" icon in the URL bar and select "Request Mobile Website" so the gyroscope can turn on.')
            return;
        }

        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission()
                setMotionPermission(permission === 'granted' ? 'granted' : 'denied')
            } catch (e) {
                console.error("Motion permission error:", e)
                setMotionPermission('denied')
            }
        } else {
            setMotionPermission('granted') // Non-iOS or older
        }
    }

    useEffect(() => {
        const interval = setInterval(() => {
            const u = localStorage.getItem('genai_user_pos')
            if (u) {
                const data = JSON.parse(u)
                setTelemetry({
                    x: data.position[0],
                    z: data.position[2],
                    angle: data.rotation[1] * (180 / Math.PI)
                })
            }
        }, 100)
        return () => clearInterval(interval)
    }, [])


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

            <div className="absolute top-24 w-full z-40 px-6 flex flex-col items-start gap-2 pointer-events-none text-white">
                <div className="flex items-center gap-2">
                    <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-xl pointer-events-auto">
                        <div className={`w-2 h-2 rounded-full ${cameraStatus === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                            {pendingModelTemplate ? `Walking with ${pendingModelTemplate.name}` : selectedId ? "Object Selected" : "Live Preview Sync"}
                        </span>
                    </div>
                    {selectedId && (
                        <button onClick={() => onDelete(selectedId)} className="pointer-events-auto bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-full border border-red-500/50 backdrop-blur-md">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {telemetry && (
                    <div className="bg-slate-900/40 backdrop-blur-md px-4 py-1.5 rounded-xl border border-white/5 flex flex-col gap-1 shadow-xl pointer-events-auto">
                        <div className="flex gap-2 text-[9px] font-mono text-white/60">
                            <span>X: <span className="text-emerald-400">{telemetry.x.toFixed(2)}</span></span>
                            <span>Z: <span className="text-emerald-400">{telemetry.z.toFixed(2)}</span></span>
                            <span>ANG: <span className="text-emerald-400">{telemetry.angle.toFixed(1)}°</span></span>
                        </div>
                        {motionPermission === 'prompt' && !isIpadDesktop && (
                            <button
                                onClick={requestMotion}
                                className="text-[8px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-bold uppercase tracking-tighter"
                            >
                                Tap to Enable Motion Tracking
                            </button>
                        )}
                    </div>
                )}

                {isIpadDesktop && (
                    <div className="bg-red-900/90 backdrop-blur-xl p-4 rounded-xl border border-red-500 shadow-2xl pointer-events-auto mt-2 w-full max-w-sm">
                        <h3 className="text-white font-black uppercase text-sm mb-2 flex items-center gap-2">
                            <X className="w-5 h-5 text-red-400" />
                            iPad Desktop Mode Detected
                        </h3>
                        <p className="text-red-200 text-xs font-medium leading-relaxed">
                            Your iPad is hiding its gyroscope because it is pretending to be a Mac.
                        </p>
                        <ol className="list-decimal pl-4 mt-2 text-red-100 text-xs font-bold space-y-1">
                            <li>Tap the <strong className="text-white bg-red-800 px-1 rounded">Aa</strong> icon in your URL bar.</li>
                            <li>Tap <strong className="text-white">Request Mobile Website</strong>.</li>
                            <li>The page will refresh and sensors will work!</li>
                        </ol>
                    </div>
                )}
            </div>

            <div className="absolute inset-0 z-10 w-full h-full">
                <Canvas key="viewer-canvas" shadows camera={{ position: [0, 1.6, 0], fov: 45 }} gl={{ alpha: true }}>
                    <XR store={store}>
                        <ARContent
                            models={models}
                            onUpdatePosition={onUpdatePosition}
                            selectedId={selectedId}
                            setSelectedId={setSelectedId}
                            onSwitchMode={(mode) => {
                                if (mode === 'editor') window.location.hash = '#editor';
                                else window.location.hash = '#viewer';
                            }}
                            motionPermission={motionPermission}
                            pendingModelTemplate={pendingModelTemplate}
                            onDrop={onDrop}
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
    const [viewMode, setViewMode] = useState<'editor' | 'viewer'>(window.location.hash === '#viewer' ? 'viewer' : 'editor')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [isPlaced, setIsPlaced] = useState(false)

    useEffect(() => {
        const handleHash = () => setViewMode(window.location.hash === '#viewer' ? 'viewer' : 'editor')
        window.addEventListener('hashchange', handleHash)
        return () => window.removeEventListener('hashchange', handleHash)
    }, [])

    useEffect(() => {
        const load = () => {
            const s = localStorage.getItem('genai_ar_models')
            if (s) setModels(JSON.parse(s))
        }
        load()

        // Sync models across devices via WebSockets
        const unsubscribe = telemetrySync.subscribe((data) => {
            if (data.type === 'telemetry_models') {
                setModels(data.models);
                localStorage.setItem('genai_ar_models', JSON.stringify(data.models));
            }
        });

        window.addEventListener('storage', load)
        window.addEventListener('focus', load)
        return () => {
            unsubscribe();
            window.removeEventListener('storage', load)
            window.removeEventListener('focus', load)
        }
    }, [])

    const addModelFromLibrary = (libItem: typeof MODEL_LIBRARY[0]) => {
        setPendingModelTemplate(libItem)
        setSelectedId(null)
    }

    const dropModel = (pos: [number, number, number], rot: [number, number, number]) => {
        if (!pendingModelTemplate) return

        const m: ARModelInstance = {
            id: Math.random().toString(36).substring(7),
            name: pendingModelTemplate.name,
            url: pendingModelTemplate.url,
            position: pos,
            rotation: rot
        }
        const u = [...models, m]
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        telemetrySync.send({ type: 'telemetry_models', models: u }) // Broadcast to others
        setSelectedId(m.id)
        setPendingModelTemplate(null)
    }

    const updateModelPosition = (id: string, pos: [number, number, number]) => {
        const u = models.map(m => m.id === id ? { ...m, position: pos } : m)
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        telemetrySync.send({ type: 'telemetry_models', models: u }) // Broadcast to others
    }

    const resetStorage = () => {
        localStorage.removeItem('genai_ar_models')
        setModels([])
        telemetrySync.send({ type: 'telemetry_models', models: [] }) // Broadcast clear to others
        setSelectedId(null)
    }

    const deleteSelected = (idToDelete: string) => {
        const u = models.filter(m => m.id !== idToDelete)
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        telemetrySync.send({ type: 'telemetry_models', models: u }) // Broadcast delete to others
        setSelectedId(null)
    }

    const isEditor = viewMode === 'editor'

    return (
        <div key={viewMode} className="relative w-full h-screen bg-[#0f172a] font-sans">
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
                                window.location.hash = '#editor';
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
                                window.location.hash = '#viewer';
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
