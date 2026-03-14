import asyncio
import hashlib
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from dotenv import load_dotenv

from services.hunyuan import generate_glb_with_hunyuan
from routers import tasks, scrape, generate, room, orchestrate, hydrate, portability

try:
    from rembg import remove as rembg_remove
except ImportError:
    rembg_remove = None

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import railtracks as rt
    rt.enable_logging("INFO")
    yield


app = FastAPI(title="Asset Forge Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router)
app.include_router(scrape.router)
app.include_router(generate.router)
app.include_router(room.router)
app.include_router(orchestrate.router)
app.include_router(hydrate.router)
app.include_router(portability.router)


def detect_main_object(image_data: bytes, mime_type: str) -> tuple[str, str]:
    try:
        client = genai.Client()
        prompt = (
            "Identify the primary object in this image. "
            "If there is no clear object, respond EXACTLY as NONE|None. "
            "Otherwise respond ONLY in this format: <object>|<category>. "
            "Category must be one of: Furniture, Clothing, Electronics, Vehicle, Animal, Other."
        )
        text_part: types.Part = types.Part(text=prompt)
        image_part: types.Part = types.Part(
            inlineData=types.Blob(data=image_data, mime_type=mime_type)
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=types.Content(role="user", parts=[text_part, image_part]),
        )
        text = (response.text or "").strip()
    except Exception as e:
        print(f"Gemini object detection error: {e}")
        return "Unknown object", "Other"

    if not text or text.upper().startswith("NONE"):
        return "NONE", "None"

    if "|" in text:
        obj, category = text.split("|", 1)
        return obj.strip(), category.strip()

    return text.strip(), "Other"


def remove_background_for_hunyuan(image_data: bytes) -> tuple[bytes, bool]:
    if rembg_remove is None:
        return image_data, False

    try:
        cleaned = rembg_remove(image_data)
        cleaned_bytes = cleaned if isinstance(cleaned, bytes) else None
        if cleaned_bytes is None:
            return image_data, False
        return cleaned_bytes, True
    except Exception as e:
        print(f"Background removal error: {e}")
        return image_data, False


@app.post("/generate")
async def generate(file: UploadFile = File(...)):
    """
    Synchronous generate endpoint used by the frontend and test suite.

    Accepts a product image, generates a 3D GLB via the lab API, persists a
    seed receipt + proxy mesh, and returns {project_id, asset_id} so the
    caller can later call POST /hydrate/{project_id}/{asset_id}.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    image_data = await file.read()

    from services.local_api import generate_and_await, get_model_weight_hash
    from services.storage_manager import StorageManager

    seed = int(hashlib.sha256(image_data[:256]).hexdigest(), 16) % (2**31)
    octree_resolution = 256

    try:
        glb_bytes = await asyncio.to_thread(
            generate_and_await,
            image_data,
            None,          # caption
            seed,
            octree_resolution,
            30,            # steps
            5.0,           # guidance_scale
            lambda msg: print(f"[generate] {msg}"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"3D generation failed: {e}")

    project_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    sm = StorageManager(project_id)
    sm.save_asset_manifest(
        asset_id=asset_id,
        input_image_hash=hashlib.sha256(image_data).hexdigest(),
        seed=seed,
        model_version=os.getenv("LOCAL_MODEL_VERSION", "hunyuan3d-v2.1"),
        model_weight_hash=get_model_weight_hash(),
        inference_params={"octree_resolution": octree_resolution, "steps": 30, "guidance_scale": 5.0},
    )
    sm.save_image(asset_id, image_data)
    sm.save_proxy(asset_id, glb_bytes)

    return {"project_id": project_id, "asset_id": asset_id}


@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be an image.")

    image_data = await file.read()

    # 1) Identify object first so we can reject non-object images and provide a prompt hint.
    object_name, category = detect_main_object(image_data, file.content_type)
    if object_name.upper() == "NONE":
        raise HTTPException(status_code=400, detail="No clear object found in the image.")

    # 2) Remove background before 3D generation to improve mesh quality.
    processed_image, bg_removed = remove_background_for_hunyuan(image_data)

    # 3) Generate GLB via Hunyuan3D Space and return the file directly.
    try:
        glb_bytes = await asyncio.to_thread(generate_glb_with_hunyuan, processed_image, object_name)
    except Exception as e:
        error_text = str(e)
        if "zerogpu" in error_text.lower() and "quota" in error_text.lower():
            raise HTTPException(
                status_code=429,
                detail=(
                    "3D generation quota reached on the public Hunyuan Space. "
                    "Set HF_TOKEN (or HUGGINGFACEHUB_API_TOKEN) in backend/.env and retry."
                ),
            ) from e
        raise HTTPException(status_code=502, detail=f"3D generation failed: {error_text}") from e

    safe_name = (object_name or "generated_model").strip().replace(" ", "_")
    filename = f"{safe_name}.glb"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Detected-Object": object_name,
        "X-Detected-Category": category,
        "X-Background-Removed": "true" if bg_removed else "false",
    }
    return Response(content=glb_bytes, media_type="model/gltf-binary", headers=headers)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
