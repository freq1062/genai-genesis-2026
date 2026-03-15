export function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-gradient-to-br from-slate-900 to-black border border-blue-500/30 rounded-2xl max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-900 via-blue-700 to-indigo-600 p-8 border-b border-blue-500/30 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">About SyntheSpace</h1>
            <p className="text-blue-100 text-sm mt-1">AR E-commerce Visualization Platform</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Mission */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Our Mission</h2>
            <p className="text-gray-300 leading-relaxed">
              SyntheSpace transforms how customers experience e-commerce by bringing products to life in augmented reality. We eliminate the gap between online shopping and in-person purchasing by letting users visualize products in their own spaces before buying.
            </p>
          </section>

          {/* How It Works */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">How It Works</h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-blue-300 font-semibold mb-2">1. Upload</h3>
                <p className="text-gray-400">Capture a photo of any product</p>
              </div>
              <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-lg p-4">
                <h3 className="text-indigo-300 font-semibold mb-2">2. Generate</h3>
                <p className="text-gray-400">AI creates a 3D model instantly</p>
              </div>
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-blue-300 font-semibold mb-2">3. Place</h3>
                <p className="text-gray-400">Position it in your AR environment</p>
              </div>
              <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-lg p-4">
                <h3 className="text-indigo-300 font-semibold mb-2">4. Visualize</h3>
                <p className="text-gray-400">See it in real-world context with WebXR</p>
              </div>
            </div>
          </section>

          {/* Technology */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Powered By</h2>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                Advanced AI models for 3D generation
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                WebXR for immersive AR experiences
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                Real-time 3D rendering with Three.js
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                Cloud infrastructure for fast processing
              </li>
            </ul>
          </section>

          {/* Benefits */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-3">Benefits</h2>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                Reduce product returns
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                Increase customer confidence
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                Boost engagement and conversion
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">✓</span>
                Works on modern mobile devices
              </li>
            </ul>
          </section>

          {/* Footer Note */}
          <div className="border-t border-blue-500/20 pt-6">
            <p className="text-gray-400 text-sm">
              SyntheSpace © 2026 • Built for the future of e-commerce
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
