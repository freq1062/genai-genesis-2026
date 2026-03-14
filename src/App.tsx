
import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore, XRDomOverlay } from '@react-three/xr'
import { ARScene } from './components/ARScene'
import { Box, Layers, Upload, Save, X } from 'lucide-react'
import { useSceneStore } from './store'

const store = createXRStore({
  customSessionInit: { optionalFeatures: ['camera-access'] }
})

function App() {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadStatus("Uploading...")
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch("http://localhost:8000/upload-image", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()
      setUploadStatus(`Uploaded: ${data.classification}`)
      console.log("Upload response:", data)
    } catch (error) {
      console.error("Upload failed", error)
      setUploadStatus("Upload failed")
    }
  }

  const handleSaveScene = () => {
    const sceneGraph = useSceneStore.getState().getSceneGraph()
    const blob = new Blob([sceneGraph], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "scene-graph.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative w-full h-full bg-dark-bg overflow-hidden flex flex-col">
      {/* HUD UI overlay */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 flex justify-between items-center bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2 drop-shadow-md">
          <Layers className="w-8 h-8 text-blue-400" />
          AR Scene Builder
        </h1>
        <div className="flex gap-4 items-center pointer-events-auto">
          {uploadStatus && <span className="text-white/80 text-sm font-medium">{uploadStatus}</span>}
          <label className="cursor-pointer bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white px-5 py-2.5 rounded-xl flex gap-2 items-center transition-all duration-300">
            <Upload className="w-5 h-5" />
            Upload Photo
            <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
          </label>
          <a
            href="/ar.html"
            className="bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)] text-white px-5 py-2.5 rounded-xl flex gap-2 items-center transition-all duration-300 font-bold"
          >
            <Box className="w-5 h-5" />
            AR Sandbox
          </a>
          <button
            onClick={handleSaveScene}
            className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl flex gap-2 items-center transition-all duration-300"
          >
            <Save className="w-5 h-5" />
            Save Scene
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 w-full z-10 flex justify-center pointer-events-none">
        <button
          className="pointer-events-auto bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/30 text-white px-8 py-4 rounded-full font-semibold text-xl flex gap-3 items-center shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
          onClick={() => store.enterAR()}
        >
          <Box className="w-6 h-6" />
          Enter AR
        </button>
      </div>

      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0">
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
    </div>
  )
}

export default App
