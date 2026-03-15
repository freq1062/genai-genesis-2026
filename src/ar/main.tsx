import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { CubeARPlayground } from './CubeARPlayground'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <CubeARPlayground onOpenEditor={() => { window.location.href = '/' }} />
    </StrictMode>,
)
