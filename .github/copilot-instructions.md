# Copilot Instructions

## Project Overview

AR e-commerce visualization tool: users upload a 2D product photo → backend generates a 3D GLB mesh via AI → frontend places it in the user's real environment via WebXR.

## Architecture

**Two separate runtimes:**

- **Frontend** (`src/`, `index.html`) — React 19 + TypeScript + Vite. Two entry points:
  - `src/main.tsx` → `App.tsx`: the main app with upload UI, 3D canvas, and AR entry.
  - `src/ar/main.tsx` → `CubeARPlayground.tsx`: an isolated experimental AR playground (separate from main app flow).
- **Backend** (`backend/`) — Python FastAPI + Celery package. `main.py` is the FastAPI app; background work runs in Celery workers backed by Redis.

**Backend package layout:**

```
backend/
  main.py              # FastAPI app, CORS, lifespan (calls init_db), POST /upload-image
  celery_app.py        # Celery config — broker=Redis, includes all 4 task routers
  db/
    postgres.py        # SQLAlchemy async engine + Scene/Asset models + init_db()
    mongo.py           # Motor async client + get_products_collection()
  routers/
    tasks.py           # GET /tasks/{task_id} — Celery result polling
    scrape.py          # POST /scrape-product — queues scrape_task
    generate.py        # POST /generate-asset — queues generate_asset_task
    room.py            # POST /reconstruct-room — queues reconstruct_room_task
    orchestrate.py     # POST /design-room — queues design_room_task
  services/
    hunyuan.py         # Hunyuan3D Gradio client (singleton)
    scraper.py         # Playwright async scraper + Gemini dimension parser
    sfm.py             # DepthAnything V2 room reconstruction (OpenCV SIFT fallback)
    placement.py       # Trimesh greedy floor placement
```

**Endpoints:**

All endpoints except `/upload-image` are async — they return `{"task_id": "...", "status": "pending"}` immediately. Poll `GET /tasks/{task_id}` for status/result.

| Endpoint | Input | What it does |
|---|---|---|
| `POST /upload-image` | multipart image | Gemini detect → rembg → Hunyuan `/generation_all` → returns GLB bytes (synchronous) |
| `POST /scrape-product` | `{"url": "..."}` | Playwright → Gemini parse → MongoDB; result: `{name, price_usd, dimensions_m, materials, image_urls}` |
| `POST /generate-asset` | multipart image + `caption`, `dimensions_m`, `seed` | Hunyuan `/shape_generation` → GLB saved to `backend/generated_assets/` |
| `POST /reconstruct-room` | 6 multipart images: `front/back/left/right/ceiling/floor` | DepthAnything V2 → `{width_m, depth_m, height_m, floor_area_m2, bounding_box}` |
| `POST /design-room` | `{"scene_id": "...", "prompt": "..."}` | Gemini parse → parallel scrape → Hunyuan generation → Trimesh placement → full scene graph |
| `GET /tasks/{task_id}` | — | Returns `{status, result}` for any queued task |

**Frontend state & AR flow:**

- Zustand store (`src/store.ts`) manages placed scene objects with `addObject`, `updateObjectPosition`, and `getSceneGraph` (serializes to JSON).
- `ARScene` component handles both **desktop mode** (OrbitControls + raycast to `y=0` plane) and **WebXR AR mode** (hit-test reticle) with the same component — `useXR(state => state.mode)` drives the branch.
- `CubeARPlayground` shares AR models via `localStorage` key `genai_ar_models`.

## Dev Commands

### Frontend (repo root)

```bash
npm run dev       # Vite dev server (HMR disabled — see note below)
npm run build     # tsc -b && vite build
npm run lint      # ESLint
```

### Backend

```bash
# FastAPI server
source .venv/bin/activate   # venv is at repo root, not backend/
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Celery worker (required for all endpoints except /upload-image)
source .venv/bin/activate
cd backend
celery -A celery_app worker --loglevel=info

# Install Playwright browsers (one-time)
playwright install chromium
```

The backend reads `backend/.env` (see `backend/.env.example`). Required env vars:

- `GOOGLE_API_KEY` — Gemini (SDK auto-discovers from env, no explicit arg needed).
- `HF_TOKEN` or `HUGGINGFACEHUB_API_TOKEN` — authenticated Hunyuan3D Space access (avoids ZeroGPU quota errors).
- `REDIS_URL` — defaults to `redis://localhost:6379/0`.
- `DATABASE_URL` — PostgreSQL async DSN (asyncpg).
- `MONGO_URI` — MongoDB connection string.

## Key Conventions

- **Python venv is at `.venv/` in the repo root**, not inside `backend/`. There is also a `backend/venv/` that is separate — always activate `.venv` from root.
- **Vite HMR is disabled** (`hmr: false` in `vite.config.ts`) intentionally to prevent crashes when running through a tunnel.
- The **Hunyuan `Client` is a module-level singleton** (`_hunyuan_client` in `services/hunyuan.py`) to avoid repeated Space startup overhead across requests. Don't refactor it into per-request construction.
- **Placed objects use `Date.now()` as IDs** in `ARScene`. The `PlacedObject` component lerps toward `hitTestPosition` (a module-level `THREE.Vector3`) while dragging — this shared vector is updated by `useXRHitTest`.
- Tailwind CSS v4 is loaded via the `@tailwindcss/vite` plugin (not PostCSS). No `tailwind.config.js` file.
- Frontend calls the backend at `http://localhost:8000` hardcoded in `App.tsx`.
- **All Celery tasks use sync code** — even for async services (e.g. `scraper.py`), tasks spin up `asyncio.new_event_loop()` since Celery workers don't have a running event loop.
- **Bytes in Celery tasks must be base64-encoded** — Celery's JSON serializer can't handle raw bytes. Encode with `base64.b64encode(data).decode()` before queuing; decode with `base64.b64decode(b64_str)` inside the task.
- **PostgreSQL is accessed via two drivers**: async `asyncpg` (via SQLAlchemy `create_async_engine`) in FastAPI lifespan/routes, and sync `psycopg2-binary` (via `create_engine`) inside Celery tasks.
- **Hunyuan `/shape_generation` vs `/generation_all`**: `generate_glb_shape_only()` uses `/shape_generation` with `octree_resolution` scaled to physical dimensions (`min(512, max(128, int(longest_dim_cm * 8.5)))`). `/upload-image` still uses `/generation_all` via `generate_glb_with_hunyuan()`.
- **`generated_assets/`** is created at runtime by tasks; it is not in version control.
- **Gemini client**: always instantiate as `genai.Client()` with no arguments — the SDK discovers `GOOGLE_API_KEY` from the environment automatically.
