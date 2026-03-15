import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { ARScene } from './components/ARScene'

const store = createXRStore()

function App() {
  const [isAR, setIsAR] = useState(false)

  return (
    <div className="w-full h-screen">
      <Canvas>
        <XR store={store}>
          <ARScene />
        </XR>
      </Canvas>
      <button 
        onClick={() => {
          store.enterAR()
          setIsAR(true)
        }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full"
      >
        {isAR ? "In AR" : "Enter AR"}
      </button>
    </div>
  )
}

export default App
