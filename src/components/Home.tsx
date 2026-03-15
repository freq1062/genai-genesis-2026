import { Box, Zap, Boxes } from 'lucide-react'

interface HomeProps {
  onEnterApp: () => void
}

export function Home({ onEnterApp }: HomeProps) {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Header */}
      <header className="relative bg-gradient-to-r from-blue-900 via-blue-700 to-indigo-600 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 py-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg backdrop-blur-md flex items-center justify-center border border-white/30">
              <Boxes className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">SyntheSpace</h1>
              <p className="text-blue-100 text-sm">AR E-commerce Visualization</p>
            </div>
          </div>
          <button
            onClick={onEnterApp}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/40 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="max-w-5xl mx-auto px-6 py-16 space-y-12">
        {/* Hero Section */}
        <section className="space-y-6">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-20"></div>
            <div className="relative bg-black/50 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-8">
              <h2 className="text-3xl font-bold mb-4 text-blue-300">Visualize Products in Your Space</h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                Transform how customers experience e-commerce. Upload a product photo and watch as our AI technology converts it into a 3D model that can be placed directly in the user's real environment using augmented reality.
              </p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section>
          <h2 className="text-2xl font-bold mb-8 text-center text-white">How It Works</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <div className="group bg-gradient-to-br from-blue-900/40 to-transparent border border-blue-500/30 rounded-xl p-6 hover:border-blue-400/60 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/40 transition-all">
                  <Zap className="w-6 h-6 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-white">Smart AI Detection</h3>
                  <p className="text-gray-400">Our AI scans your product image, detects the item, and generates a high-quality 3D mesh instantly.</p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group bg-gradient-to-br from-indigo-900/40 to-transparent border border-indigo-500/30 rounded-xl p-6 hover:border-indigo-400/60 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/40 transition-all">
                  <Boxes className="w-6 h-6 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-white">3D Model Generation</h3>
                  <p className="text-gray-400">Advanced algorithms create realistic 3D models optimized for real-time rendering in your browser.</p>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group bg-gradient-to-br from-blue-900/40 to-transparent border border-blue-500/30 rounded-xl p-6 hover:border-blue-400/60 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/40 transition-all">
                <Boxes className="w-6 h-6 text-blue-300" />
              </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-white">AR Placement</h3>
                  <p className="text-gray-400">Use WebXR to place products in real-world environments and see them rendered in augmented reality.</p>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="group bg-gradient-to-br from-indigo-900/40 to-transparent border border-indigo-500/30 rounded-xl p-6 hover:border-indigo-400/60 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/40 transition-all">
                  <Box className="w-6 h-6 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-white">Scene Management</h3>
                  <p className="text-gray-400">Build entire room scenes with multiple products, control lighting, and save your designs.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Use Section */}
        <section className="space-y-6">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl blur opacity-20"></div>
            <div className="relative bg-black/50 backdrop-blur-xl border border-indigo-500/30 rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-4 text-indigo-300">Why SyntheSpace?</h2>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                  Reduce product returns with immersive AR visualization
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                  Boost customer confidence and engagement
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                  Powered by cutting-edge AI and WebXR technology
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                  Works on modern devices with WebXR support
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center space-y-6 pb-12">
          <h2 className="text-3xl font-bold text-white">Ready to Transform E-Commerce?</h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Start creating stunning AR product visualizations in minutes. Upload a photo, generate a 3D model, and place it in real environments.
          </p>
          <button
            onClick={onEnterApp}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-12 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl shadow-blue-500/30"
          >
            <Box className="w-5 h-5" />
            Launch App
          </button>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-blue-900/50 bg-black/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center text-gray-500 text-sm">
          <p>SyntheSpace © 2026 • Powered by AI and WebXR</p>
        </div>
      </footer>
    </div>
  )
}
