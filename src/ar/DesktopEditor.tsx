import { useRef, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, TransformControls, ContactShadows, Grid, useGLTF, Environment } from '@react-three/drei'
import { Box, Move, RotateCw, Maximize, Trash2, Settings2, ArrowLeft } from 'lucide-react'
import * as THREE from 'three'
import { useSceneStore } from '../store'
import type { ARModelInstance } from '../store'

const MODEL_LIBRARY = [
    { name: 'Duck', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb' },
    { name: 'Chair', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb' },
    { name: 'Box', url: 'fallback' }
]

function EditableModel({ model, isSelected, onSelect, onUpdate, mode }: {
    model: ARModelInstance,
    isSelected: boolean,
    onSelect: () => void,
    onUpdate: (id: string, updates: Partial<ARModelInstance>) => void,
    mode: 'translate' | 'rotate' | 'scale'
}) {
    const { scene } = useGLTF(model.url !== 'fallback' ? model.url : 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb')
    const meshRef = useRef<THREE.Group>(null!)

    const onTransformChange = () => {
        if (!meshRef.current) return
        const pos = meshRef.current.position.toArray() as [number, number, number]
        const rot = meshRef.current.rotation.toArray().slice(0, 3) as [number, number, number]
        const scl = meshRef.current.scale.toArray() as [number, number, number]
        onUpdate(model.id, { position: pos, rotation: rot, scale: scl })
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
        </>
    )
}

export function DesktopEditor({ onBack }: { onBack: () => void }) {
    const { models, addModel, updateModel, deleteModel, resetScene } = useSceneStore()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate')

    const addNewModel = (item: typeof MODEL_LIBRARY[0]) => {
        const m: ARModelInstance = {
            id: Math.random().toString(36).substring(7),
            name: item.name,
            url: item.url,
            position: [0, 0, -1.5],
            rotation: [0, 0, 0],
            scale: [0.5, 0.5, 0.5]
        }
        addModel(m)
        setSelectedId(m.id)
    }

    return (
        <div className="flex h-screen w-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
            <div className="w-80 flex flex-col border-r border-slate-800 bg-[#020617] z-[60]">
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="font-bold text-lg leading-none text-white">Editor</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-black">Configure Scene</p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <section>
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Library</h2>
                        <div className="grid grid-cols-2 gap-2">
                            {MODEL_LIBRARY.map(item => (
                                <button key={item.name} onClick={() => addNewModel(item)} className="flex flex-col items-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-800 transition-all active:scale-95">
                                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400"><Box className="w-5 h-5" /></div>
                                    <span className="text-[10px] font-bold uppercase">{item.name}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 px-2">Scene Tree</h2>
                        <div className="space-y-1">
                            {models.map(m => (
                                <div key={m.id} onClick={() => setSelectedId(m.id)} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer ${selectedId === m.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'hover:bg-slate-900'}`}>
                                    <span className="text-xs font-bold">{m.name}</span>
                                    <button onClick={(e) => { e.stopPropagation(); deleteModel(m.id); if(selectedId === m.id) setSelectedId(null); }} className="p-1 hover:text-red-400 text-slate-500"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
                <button onClick={() => { if (confirm("Clear scene?")) resetScene(); }} className="p-4 text-[9px] text-red-500/50 hover:text-red-500 font-bold uppercase tracking-[0.2em] text-center border-t border-slate-900">Reset Everything</button>
            </div>

            <div className="flex-1 relative flex flex-col bg-slate-950">
                <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 p-1.5 rounded-2xl flex gap-1 shadow-2xl">
                    <button onClick={() => setMode('translate')} className={`p-3 rounded-xl transition-all ${mode === 'translate' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}><Move className="w-5 h-5" /></button>
                    <button onClick={() => setMode('rotate')} className={`p-3 rounded-xl transition-all ${mode === 'rotate' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}><RotateCw className="w-5 h-5" /></button>
                    <button onClick={() => setMode('scale')} className={`p-3 rounded-xl transition-all ${mode === 'scale' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}><Maximize className="w-5 h-5" /></button>
                </div>

                <Canvas shadows camera={{ position: [3, 3, 3], fov: 45 }}>
                    <color attach="background" args={['#020617']} />
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
                    <Environment preset="city" />
                    <Suspense fallback={null}>
                        {models.map(m => (
                            <EditableModel key={m.id} model={m} isSelected={selectedId === m.id} onSelect={() => setSelectedId(m.id)} onUpdate={updateModel} mode={mode} />
                        ))}
                    </Suspense>
                    <Grid infiniteGrid fadeDistance={20} sectionColor="#1e293b" cellColor="#0f172a" />
                    <OrbitControls makeDefault />
                    <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
                </Canvas>

                {selectedId && models.find(m => m.id === selectedId) && (
                    <div className="absolute bottom-6 right-6 w-64 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl z-30 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Transform</span>
                            <Settings2 className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="space-y-3">
                            <div>
                                <p className="text-[10px] text-slate-500 mb-1">Scale: {models.find(m => m.id === selectedId)!.scale[0].toFixed(2)}</p>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${Math.min(models.find(m => m.id === selectedId)!.scale[0] * 50, 100)}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
