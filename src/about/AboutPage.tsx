import { ArrowLeft, Box } from 'lucide-react'

export function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black text-white">
      {/* Header */}
      <header className="relative shadow-2xl z-20" style={{ backgroundColor: '#0A192F' }}>
        <div className="w-full py-4 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-white/70 hover:text-white transition-colors"
              title="Back to home"
            >
              <ArrowLeft className="w-6 h-6" />
            </a>
            <div className="flex items-center gap-1">
              <img src="src/assets/Logo.png" alt="Logo" className="h-12 w-12 object-contain" />
              <div>
                <div className="text-white text-xl">
                  <span className="font-bold">Synthe</span><span>Space</span>
                </div>
                <p className="text-white/70 text-xs">Realize your Mind Palace</p>
              </div>
            </div>
          </div>
          <a
            href="/ar.html"
            className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-lg flex gap-2 items-center transition-all duration-300 font-medium text-sm"
          >
            <Box className="w-4 h-4" />
            Make a room
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        {/* Title Section */}
        <section className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            About SyntheSpace
          </h1>
          <p className="text-xl text-blue-200">Realize your Mind Palace</p>
        </section>

        {/* Mission */}
        <section className="space-y-4">
          <h2 className="text-3xl font-bold text-white">Our Mission</h2>
          <p className="text-gray-300 text-lg leading-relaxed">
            SyntheSpace is a AI-powered but human-centric platform that transforms how customers experience e-commerce by bringing products and visions to life in augmented reality. We eliminate the gap between online shopping and in-person purchasing by letting users visualize products in their own spaces before buying. 
            Additionally, users can create a room from scratch, allowing them design any space they can imagine, filled with any objects they want. Our goal is to empower users to <em>realize their "Mind Palace"</em> - any space they can envision
            in their mind's eye can become a reality.
          </p>
        </section>

        {/* How It Works */}
        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-6 hover:bg-blue-900/50 transition-colors">
              <h3 className="text-blue-300 font-semibold mb-2 text-lg">1. Scan</h3>
              <p className="text-gray-400">Scan your environment to create a digital representation of your space as an empty room</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-6 hover:bg-blue-900/50 transition-colors">
              <h3 className="text-blue-300 font-semibold mb-2 text-lg">2. Upload</h3>
              <p className="text-gray-400">Upload a photo of any product (furniture, decorations, equipment, etc.)</p>
            </div>
            <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-6 hover:bg-indigo-900/50 transition-colors">
              <h3 className="text-indigo-300 font-semibold mb-2 text-lg">3. Generate</h3>
              <p className="text-gray-400">Our ML model creates a 3D asset that can be used instantly</p>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-6 hover:bg-blue-900/50 transition-colors">
              <h3 className="text-blue-300 font-semibold mb-2 text-lg">4. Place</h3>
              <p className="text-gray-400">Position the asset in your room however you like in our easy-to-use editor</p>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-6 hover:bg-indigo-900/50 transition-colors w-full md:w-1/2">
              <h3 className="text-indigo-300 font-semibold mb-2 text-lg">5. Visualize</h3>
              <p className="text-gray-400">See it in real-world context with WebXR - visualize the space you created in your own environment</p>
            </div>
          </div>
        </section>

        {/* Technology */}
        <section className="space-y-4">
          <h2 className="text-3xl font-bold text-white">Powered By</h2>
          <ul className="space-y-3 text-gray-300 text-lg">
            <li className="flex items-center gap-3">
              <span className="w-3 h-3 bg-blue-400 rounded-full flex-shrink-0"></span>
              Uses the Hunyuan3D-2 ML model for 3D generation
            </li>
            <li className="flex items-center gap-3">
              <span className="w-3 h-3 bg-indigo-400 rounded-full flex-shrink-0"></span>
              WebXR for immersive AR experiences
            </li>
            <li className="flex items-center gap-3">
              <span className="w-3 h-3 bg-blue-400 rounded-full flex-shrink-0"></span>
              Real-time 3D rendering with Three.js
            </li>
            <li className="flex items-center gap-3">
              <span className="w-3 h-3 bg-indigo-400 rounded-full flex-shrink-0"></span>
              Uses Railtracks  for Agentic framework and orchestration
            </li>
          </ul>
        </section>

        {/* Benefits */}
        <section className="space-y-4">
          <h2 className="text-3xl font-bold text-white">Benefits</h2>
          <ul className="space-y-3 text-gray-300 text-lg">
            <li className="flex items-center gap-3">
              <span className="text-blue-400 text-xl">✓</span>
              Reduce product returns
            </li>
            <li className="flex items-center gap-3">
              <span className="text-blue-400 text-xl">✓</span>
              Increase customer confidence
            </li>
            <li className="flex items-center gap-3">
              <span className="text-blue-400 text-xl">✓</span>
              Exercises creativity and spatial reasoning
            </li>
            <li className="flex items-center gap-3">
              <span className="text-blue-400 text-xl">✓</span>
              Works on modern mobile devices
            </li>
          </ul>
        </section>

        {/* Footer Note */}
        <div className="border-t border-blue-500/20 pt-8 text-center">
          <p className="text-gray-400">
            SyntheSpace © 2026 • Realize your Mind Palace
          </p>
        </div>
      </main>
    </div>
  )
}
