import { Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, Environment } from '@react-three/drei';
import { Box, Home, Plus } from 'lucide-react';
import { XRDomOverlay, useXR } from '@react-three/xr';
import { PositionTracker } from './PositionTracker';
import { OrientationTracker } from './OrientationTracker';
import { DraggableModel } from '../components/DraggableModel';
import { FallbackCube } from '../components/FallbackCube';
import { store } from './xrStore';
import type { ARModelInstance } from './types';
import { MODEL_LIBRARY } from './constants';

export function ARContent({
    models,
    selectedId,
    setSelectedId,
    onSwitchMode,
    motionPermission,
    pendingModelTemplate,
    onDrop
}: {
    models: ARModelInstance[],
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    onSwitchMode: (m: 'editor' | 'viewer') => void,
    motionPermission: 'granted' | 'prompt' | 'denied',
    pendingModelTemplate: typeof MODEL_LIBRARY[0] | null,
    onDrop: (pos: [number, number, number], rot: [number, number, number]) => void
}) {
    const isAR = useXR((state) => state.mode === 'immersive-ar' || !!state.session)
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
                {/* Always render the group but only make it visible in AR mode. 
                    Removed the [0, 0, -3] offset to ensure objects appear at their actual coordinates. */}
                <group visible={isAR}>
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
                <div className="absolute top-8 w-full z-[100] px-4 grid grid-cols-3 items-start pointer-events-none">
                    {/* Left: Exit AR - goes home */}
                    <div className="flex justify-start">
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
                    </div>

                    {/* Center: Status or Drop Action */}
                    <div className="flex justify-center">
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
                            <div className="bg-green-600/80 backdrop-blur-md px-4 py-2 rounded-2xl text-white font-bold flex items-center gap-2 shadow-2xl pointer-events-auto border border-white/20 text-xs whitespace-nowrap">
                                <Box className="w-4 h-4" />
                                AR Mode Active
                            </div>
                        )}
                    </div>

                    {/* Right: Go back to AR Camera view (non-immersive) */}
                    <div className="flex justify-end">
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
                </div>
            </XRDomOverlay>
        </>
    )
}
