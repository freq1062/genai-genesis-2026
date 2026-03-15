
import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore, XRDomOverlay } from '@react-three/xr'
import { ARScene } from './components/ARScene'
import { About } from './components/About'
import { Box, X, HelpCircle } from 'lucide-react'

const store = createXRStore({
  customSessionInit: { optionalFeatures: ['camera-access'] }
})

function App() {
  const [showAbout, setShowAbout] = useState(false)

  return (
    <div className="relative w-full h-full bg-dark-bg overflow-hidden flex flex-col">
      {/* Header with all controls */}
      <header className="relative shadow-2xl z-20" style={{ backgroundColor: '#0A192F' }}>
        <div className="w-full py-4 flex items-center justify-between pl-0 pr-6">
          <div className="flex items-center gap-1">
            <img src="src/assets/Logo.png" alt="Logo" className="h-12 w-12 object-contain" />
            <div>
              <div className="text-white text-xl">
                <span className="font-bold">Synthe</span><span>Space</span>
              </div>
              <p className="text-white/70 text-xs">Realize your Mind Palace</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <a
              href="/ar.html"
              className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-lg flex gap-2 items-center transition-all duration-300 font-medium text-sm"
            >
              <Box className="w-4 h-4" />
              Make a room
            </a>
            <button
              onClick={() => setShowAbout(true)}
              className="bg-blue-800/60 hover:bg-blue-700/60 text-white px-4 py-2 rounded-lg flex gap-2 items-center transition-all duration-300 text-sm font-medium"
            >
              <HelpCircle className="w-4 h-4" />
              About
            </button>
          </div>
        </div>
      </header>

      <div className="absolute bottom-10 w-full z-10 flex justify-center pointer-events-none">
        <a
          href="/editor.html"
          className="pointer-events-auto bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/30 text-white px-8 py-4 rounded-full font-semibold text-xl flex gap-3 items-center shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
        >
          <Box className="w-6 h-6" />
          Create your own room
        </a>
      </div>

      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0 top-16">
        <Canvas camera={{ position: [0, 1.5, 3] }} gl={{ alpha: true }}>
          <XR store={store}>
            <XRDomOverlay className="fixed top-10 left-0 w-full flex justify-center z-50">
              <button
                onPointerDown={(e) => { e.stopPropagation(); store.getState().session?.end(); }}
                className="bg-red-500/90 hover:bg-red-500 text-white px-8 py-3 rounded-full font-bold flex gap-2 items-center shadow-xl backdrop-blur-md transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
                Exit AR
              </button>
            </XRDomOverlay>
            <ARScene />
          </XR>
        </Canvas>
      </div>

      {/* About Modal */}
      {showAbout && <About onClose={() => setShowAbout(false)} />}
    </div>
  )
}

export default App
