import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Camera, RotateCcw, Upload } from 'lucide-react'

interface PanoramaCaptureProps {
  onCapture: (blob: Blob) => void
  onCancel: () => void
}

const TOTAL_FRAMES = 12
const CAPTURE_INTERVAL_MS = 2000 // 2s per frame = 24s total

export function PanoramaCapture({ onCapture, onCancel }: PanoramaCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const framesRef = useRef<ImageData[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [phase, setPhase] = useState<'init' | 'capturing' | 'processing' | 'error' | 'fallback'>('init')
  const [capturedCount, setCapturedCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [cameraReady, setCameraReady] = useState(false)

  // Start camera
  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => setCameraReady(true)
        }
      } catch {
        if (!cancelled) setPhase('fallback')
      }
    }

    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')!
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    framesRef.current.push(imageData)

    const count = framesRef.current.length
    setCapturedCount(count)

    if (count >= TOTAL_FRAMES) {
      if (timerRef.current) clearInterval(timerRef.current)
      stitchAndFinish()
    }
  }, [])

  const startCapturing = useCallback(() => {
    framesRef.current = []
    setCapturedCount(0)
    setPhase('capturing')
    // Capture immediately, then every interval
    captureFrame()
    timerRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS)
  }, [captureFrame])

  const stitchAndFinish = useCallback(() => {
    setPhase('processing')
    const frames = framesRef.current
    if (frames.length === 0) return

    const fw = frames[0].width
    const fh = frames[0].height
    const stitchCanvas = document.createElement('canvas')
    stitchCanvas.width = fw * frames.length
    stitchCanvas.height = fh
    const ctx = stitchCanvas.getContext('2d')!

    frames.forEach((frame, i) => {
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = fw
      tmpCanvas.height = fh
      tmpCanvas.getContext('2d')!.putImageData(frame, 0, 0)
      ctx.drawImage(tmpCanvas, i * fw, 0)
    })

    stitchCanvas.toBlob(blob => {
      if (blob) onCapture(blob)
    }, 'image/jpeg', 0.9)
  }, [onCapture])

  // Fallback: file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  const progress = Math.round((capturedCount / TOTAL_FRAMES) * 100)
  const circumference = 2 * Math.PI * 40

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Cancel button — always visible */}
      <button
        onClick={onCancel}
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Fallback: file upload */}
      {phase === 'fallback' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <Upload className="w-16 h-16 text-slate-400" />
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Camera Unavailable</h2>
            <p className="text-slate-400">Upload an equirectangular panorama image instead.</p>
          </div>
          <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-semibold transition-all">
            Choose Panorama File
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {/* Camera view */}
      {phase !== 'fallback' && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />

          {/* Overlay UI */}
          <div className="relative flex-1 flex flex-col items-center justify-between p-8">
            {/* Top instruction */}
            <div className="bg-black/60 backdrop-blur-md rounded-2xl px-6 py-3 mt-8 text-center">
              {phase === 'init' && (
                <p className="text-white font-semibold">
                  Stand in the room centre. Hold your arms half-outstretched.<br />
                  <span className="text-slate-300 text-sm">Press Capture and spin slowly in a full circle.</span>
                </p>
              )}
              {phase === 'capturing' && (
                <p className="text-white font-semibold">
                  Keep spinning slowly… <span className="text-indigo-300">{capturedCount}/{TOTAL_FRAMES} frames</span>
                </p>
              )}
              {phase === 'processing' && (
                <p className="text-white font-semibold">Stitching panorama…</p>
              )}
            </div>

            {/* Centre: progress ring */}
            {phase === 'capturing' && (
              <div className="flex flex-col items-center gap-4">
                <svg width="100" height="100" className="-rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#334155" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="#6366f1" strokeWidth="6"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - capturedCount / TOTAL_FRAMES)}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="text-white font-bold text-lg">{progress}%</span>
              </div>
            )}

            {phase === 'processing' && (
              <div className="flex items-center justify-center">
                <RotateCcw className="w-12 h-12 text-indigo-400 animate-spin" />
              </div>
            )}

            {/* Bottom controls */}
            <div className="flex flex-col items-center gap-4">
              {phase === 'init' && cameraReady && (
                <button
                  onClick={startCapturing}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-10 py-5 rounded-full font-bold text-lg flex gap-3 items-center shadow-2xl transition-all"
                >
                  <Camera className="w-6 h-6" />
                  Start Capture
                </button>
              )}
              {phase === 'init' && !cameraReady && (
                <div className="text-slate-400 text-sm animate-pulse">Starting camera…</div>
              )}
              {phase === 'capturing' && (
                <button
                  onClick={() => {
                    if (timerRef.current) clearInterval(timerRef.current)
                    if (framesRef.current.length > 0) stitchAndFinish()
                    else setPhase('init')
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-full font-semibold transition-all"
                >
                  Finish Early ({capturedCount} frames)
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {phase === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <p className="text-red-400 font-semibold">{errorMsg}</p>
          <button onClick={onCancel} className="text-slate-400 hover:text-white underline">
            Go back
          </button>
        </div>
      )}
    </div>
  )
}
