import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { CubeARPlayground } from './ar/CubeARPlayground'
import { DesktopEditor } from './ar/DesktopEditor'

function App() {
    const [view, setView] = useState<'playground' | 'editor'>('playground')

    return (
        <>
            {view === 'playground' ? (
                <CubeARPlayground onOpenEditor={() => setView('editor')} />
            ) : (
                <DesktopEditor onBack={() => setView('playground')} />
            )}
        </>
    )
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
