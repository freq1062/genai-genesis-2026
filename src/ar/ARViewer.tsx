import { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Box, RotateCcw, Loader2, Plus, Trash2, X } from 'lucide-react';
import { XR } from '@react-three/xr';
import { ARContent } from './ARContent';
import { store } from './xrStore';
import type { ARModelInstance } from './types';
import { MODEL_LIBRARY } from './constants';

export function ARViewer({
    models,
    selectedId,
    setSelectedId,
    onReset,
    onAddProduct,
    onDelete,
    pendingModelTemplate,
    onDrop
}: {
    models: ARModelInstance[],
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    onReset: () => void,
    onAddProduct: (item: typeof MODEL_LIBRARY[0]) => void,
    onDelete: (id: string) => void,
    pendingModelTemplate: typeof MODEL_LIBRARY[0] | null,
    onDrop: (pos: [number, number, number], rot: [number, number, number]) => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')
    const [showLibrary, setShowLibrary] = useState(false)
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

    // Removed local dropModel logic - now using onDrop prop from parent

    return (
        <div className="relative w-full h-full bg-[#0f172a] overflow-hidden font-sans">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover z-0 opacity-40" />

            <div className="absolute bottom-6 left-6 z-40 flex flex-col items-start gap-2 pointer-events-none text-white opacity-50 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                    <div className="bg-slate-900/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 shadow-xl pointer-events-auto">
                        <div className={`w-1.5 h-1.5 rounded-full ${cameraStatus === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[8px] font-bold uppercase tracking-wider text-white/70">
                            {pendingModelTemplate ? `Walking with ${pendingModelTemplate.name}` : selectedId ? "Object Selected" : "Sync Active"}
                        </span>
                    </div>
                    {selectedId && (
                        <button onClick={() => onDelete(selectedId)} className="pointer-events-auto bg-red-500/20 hover:bg-red-500/40 text-red-400 p-1.5 rounded-full border border-red-500/50 backdrop-blur-md">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {motionPermission === 'prompt' && !isIpadDesktop && (
                    <button
                        onClick={requestMotion}
                        className="pointer-events-auto bg-emerald-500/50 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl border border-emerald-500/50 font-bold uppercase tracking-tight text-[8px] shadow-lg active:scale-95"
                    >
                        Enable Motion Tracking
                    </button>
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
