# SyntheSpace - AR E-commerce Visualization Tool

An AI-powered AR e-commerce application that transforms 2D product images into interactive 3D models and places them in users' real environments via WebXR.

## Project Overview

**Frontend**: React 19 + TypeScript + Vite with WebXR AR support
**Backend**: Python FastAPI + Celery for async task processing
**3D Engine**: Three.js with room visualization and object placement
**AI Integration**: Hunyuan3D for mesh generation, Gemini for image analysis

### Features
- Upload 2D product images → AI generates 3D GLB meshes
- Desktop viewer for room design and AR preview
- WebXR support for real mobile AR experiences
- Scrape product details from URLs with dimension parsing
- Room reconstruction from multi-angle photos
- AI-powered room design with automatic furniture placement

---

## Prerequisites

- **Node.js** 18+ (for frontend)
- **Python** 3.10+ (for backend)
- **Redis** (for Celery task queue)
- **PostgreSQL** (for scene database)
- **MongoDB** (for product data)
- API keys:
  - `GOOGLE_API_KEY` for Gemini
  - `HF_TOKEN` for Hugging Face (Hunyuan3D access)

---

## Frontend Setup

### Installation

```bash
# Install dependencies
npm install
```

### Environment Variables

No `.env` file needed for frontend—backend URL is hardcoded to `http://localhost:8000`

### Development

```bash
# Start Vite dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

### Entry Points

- **Main App** (`src/main.tsx`) → `App.tsx`: Upload UI, 3D canvas, AR entry
- **AR Playground** (`src/ar/main.tsx`) → `CubeARPlayground.tsx`: Experimental AR editor

---

## Backend Setup

### Installation

```bash
# Navigate to backend
cd backend

# Activate Python venv (from repo root)
source .venv/bin/activate  # macOS/Linux
# or
.venv\Scripts\activate  # Windows

# Install dependencies (from repo root)
pip install -r backend/requirements.txt

# Install Playwright browsers (one-time)
playwright install chromium
```

### Environment Variables

Create `backend/.env` with:

```env
GOOGLE_API_KEY=your_gemini_api_key
HF_TOKEN=your_huggingface_token
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql+asyncpg://user:password@localhost/genai_db
MONGO_URI=mongodb://localhost:27017/genai_products
```

### Running the Backend

```bash
# Terminal 1: Start FastAPI server
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start Celery worker (required for async tasks)
cd backend
celery -A celery_app worker --loglevel=info

# Terminal 3 (Optional): Start Redis
redis-server
```

### API Endpoints

| Endpoint | Method | Input | Purpose |
|----------|--------|-------|---------|
| `/upload-image` | POST | Image file | Syncs: Detect → Remove BG → Generate GLB |
| `/scrape-product` | POST | `{"url": "..."}` | Queued: Scrape → Parse → Store to MongoDB |
| `/generate-asset` | POST | Image + caption + dimensions | Queued: Generate 3D model via Hunyuan |
| `/reconstruct-room` | POST | 6 room images | Queued: DepthAnything V2 → Room dimensions |
| `/design-room` | POST | `{"scene_id": "...", "prompt": "..."}` | Queued: AI design → Scrape → Generate → Place |
| `/tasks/{task_id}` | GET | — | Poll async task status/result |

---

## Key Architecture Notes

- **Two runtimes**: Frontend (React/Vite) and Backend (FastAPI) are separate
- **Vite HMR disabled** (`hmr: false` in `vite.config.ts`) for tunnel compatibility
- **Hunyuan client is a singleton** to avoid repeated Space startup overhead
- **Celery uses JSON serialization**: Bytes must be base64-encoded before queuing
- **Two DB drivers**: `asyncpg` in FastAPI, `psycopg2-binary` in Celery tasks
- **Floor as thin box geometry** (`args=[10, 0.05, 10]`) to avoid rendering artifacts

---

## Development Workflow

### Testing Frontend
1. Start frontend: `npm run dev`
2. Open `http://localhost:5173` in browser
3. For AR testing on mobile: expose via tunnel (Cloudflare/ngrok)

### Testing Backend APIs
1. Start FastAPI server and Celery worker
2. Use endpoints at `http://localhost:8000/docs` (auto-generated Swagger)
3. For sync endpoint `/upload-image`, get immediate GLB response
4. For others, get `task_id` → poll `/tasks/{task_id}` for results

### Building for Production

```bash
# Frontend
npm run build
# Output: dist/

# Backend
# Deploy with Docker/Uvicorn + Celery workers + Redis
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Grid/floor twitching | Use thin box geometry, not plane |
| White wall appearing | Check floor side={THREE.DoubleSide} |
| Hunyuan quota errors | Ensure `HF_TOKEN` is set for authenticated access |
| Celery tasks not running | Verify Redis is running and `REDIS_URL` is correct |
| Images not saving | Ensure `backend/generated_assets/` directory exists |

---

## Project Structure

```
.
├── src/                    # Frontend source
│   ├── main.tsx           # Main app entry
│   ├── ar/                # AR-specific components
│   │   ├── main.tsx
│   │   ├── CubeARPlayground.tsx
│   │   └── DesktopEditor.tsx
│   ├── components/        # Shared components
│   │   └── ARScene.tsx    # 3D room with furniture/lighting
│   └── store.ts           # Zustand state management
├── backend/               # Backend source
│   ├── main.py           # FastAPI app
│   ├── celery_app.py     # Celery config
│   ├── db/               # Database clients
│   ├── routers/          # API endpoints
│   └── services/         # AI/scraping services
├── index.html            # Landing page
├── vite.config.ts        # Vite config (HMR disabled)
└── tailwind.config.js    # Tailwind CSS v4
```

---

## License

Proprietary
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
