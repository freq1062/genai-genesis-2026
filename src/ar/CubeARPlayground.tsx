import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import { DesktopEditor } from './DesktopEditor';
import { ARViewer } from './ARViewer';
import { store } from './xrStore';
import { telemetrySync } from './telemetry';
import { MODEL_LIBRARY } from './constants';
import type { ARModelInstance } from './types';

export type { ARModelInstance };

export function CubeARPlayground() {
    const [models, setModels] = useState<ARModelInstance[]>([])
    const [viewMode, setViewMode] = useState<'editor' | 'viewer'>(window.location.hash === '#viewer' ? 'viewer' : 'editor')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [pendingModelTemplate, setPendingModelTemplate] = useState<typeof MODEL_LIBRARY[0] | null>(null)

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

        // If this is an Editor, broadcast current state on mount so newly connected viewers get it
        if (window.location.hash !== '#viewer') {
            const current = localStorage.getItem('genai_ar_models')
            if (current) {
                try {
                    telemetrySync.send({ type: 'telemetry_models', models: JSON.parse(current) })
                } catch (e) { }
            }
        }

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
            rotation: rot,
            scale: [1, 1, 1]
        }
        const u = [...models, m]
        localStorage.setItem('genai_ar_models', JSON.stringify(u))
        setModels(u)
        telemetrySync.send({ type: 'telemetry_models', models: u })
        setSelectedId(m.id)
        setPendingModelTemplate(null)
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
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                    onReset={resetStorage}
                    onAddProduct={addModelFromLibrary}
                    onDelete={deleteSelected}
                    pendingModelTemplate={pendingModelTemplate}
                    onDrop={dropModel}
                />
            )}

            {/* Global Top Bar - Visible only when NOT in Immersive AR */}
            <div className="absolute top-6 w-full z-[100] px-6 flex justify-center items-center pointer-events-none">
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

                <a
                    href="/"
                    className="absolute right-6 p-3 bg-slate-900/90 hover:bg-slate-800 text-white rounded-full border border-white/10 backdrop-blur-md shadow-2xl transition-all active:scale-90 pointer-events-auto shadow-[0_0_15px_rgba(0,0,0,0.5)] flex items-center justify-center w-12 h-12"
                    title="Exit to Dashboard"
                >
                    <Home className="w-5 h-5 min-w-[20px]" />
                </a>
            </div>
        </div>
    )
}
