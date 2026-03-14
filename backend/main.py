import asyncio
import os
import tempfile

from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from gradio_client import Client, handle_file

try:
    from rembg import remove as rembg_remove
except ImportError:
    rembg_remove = None

app = FastAPI(title="AR Scene Builder Backend")

# Allow requests from the local Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from dotenv import load_dotenv

load_dotenv()
HUNYUAN_SPACE_ID = "tencent/Hunyuan3D-2"

# Reuse Space client between requests to avoid repeated startup overhead.
_hunyuan_client: Client | None = None


def get_hunyuan_client() -> Client:
    global _hunyuan_client
    if _hunyuan_client is None:
        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")
        _hunyuan_client = Client(HUNYUAN_SPACE_ID, token=hf_token)
    return _hunyuan_client


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


def _extract_file_path(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("path", "name", "orig_name"):
            candidate = value.get(key)
            if isinstance(candidate, str) and os.path.exists(candidate):
                return candidate
        for nested in value.values():
            path = _extract_file_path(nested)
            if path:
                return path
    if isinstance(value, list):
        for item in value:
            path = _extract_file_path(item)
            if path:
                return path
    return None


def _coerce_existing_file_path(value, field_name: str) -> str:
    path = _extract_file_path(value)
    if not path or not os.path.exists(path):
        raise RuntimeError(f"Hunyuan output field '{field_name}' did not contain a valid file path.")
    return path


def generate_glb_with_hunyuan(image_data: bytes, object_name: str) -> bytes:
    with tempfile.TemporaryDirectory() as tmpdir:
        input_png = os.path.join(tmpdir, "input.png")
        with open(input_png, "wb") as f:
            f.write(image_data)

        client = get_hunyuan_client()

        generation_result = None
        generation_errors: list[str] = []

        # The public Space can intermittently throw NameError on one generation mode.
        # Retry with safer variants before failing the request.
        generation_attempts = [
            (object_name, False),
            (object_name, True),
            (None, True),
        ]

        for caption, check_box_rembg in generation_attempts:
            try:
                generation_result = client.predict(
                    caption,
                    handle_file(input_png),
                    None,
                    None,
                    None,
                    None,
                    30,
                    5.0,
                    1234,
                    256,
                    check_box_rembg,
                    8000,
                    True,
                    api_name="/generation_all",
                )
                break
            except Exception as e:
                generation_errors.append(
                    f"caption={caption!r}, rembg={check_box_rembg}: {type(e).__name__}: {e}"
                )

        if generation_result is None:
            # Last-resort fallback: single-file mesh generation endpoint.
            try:
                shape_result = client.predict(
                    object_name,
                    handle_file(input_png),
                    None,
                    None,
                    None,
                    None,
                    30,
                    5.0,
                    1234,
                    256,
                    True,
                    8000,
                    True,
                    api_name="/shape_generation",
                )
                if isinstance(shape_result, (list, tuple)) and len(shape_result) >= 1:
                    generation_result = (shape_result[0], shape_result[0])
            except Exception as e:
                generation_errors.append(
                    f"shape_generation fallback: {type(e).__name__}: {e}"
                )

        if generation_result is None:
            raise RuntimeError(
                "Hunyuan generation failed across all retries: " + " | ".join(generation_errors)
            )

        if not isinstance(generation_result, (list, tuple)) or len(generation_result) < 2:
            raise RuntimeError(
                "Hunyuan /generation_all returned unexpected payload shape."
            )

        file_out = _coerce_existing_file_path(generation_result[0], "file_out")
        file_out2 = _coerce_existing_file_path(generation_result[1], "file_out2")

        # generation_result contains at least shape and texture files in first two positions.
        # /on_export_click expects Gradio FileData mappings, not raw strings.
        try:
            export_result = client.predict(
                handle_file(file_out),
                handle_file(file_out2),
                "glb",
                False,
                False,
                10000,
                api_name="/on_export_click",
            )
        except Exception as e:
            raise RuntimeError(
                f"Hunyuan /on_export_click failed ({type(e).__name__}): {e}"
            ) from e

        # /on_export_click returns (html_str, filepath) — the GLB is always at index 1.
        if not isinstance(export_result, (list, tuple)) or len(export_result) < 2:
            raise RuntimeError("Hunyuan /on_export_click returned unexpected shape.")
        glb_path = _extract_file_path(export_result[1])
        if not glb_path or not os.path.exists(glb_path):
            raise RuntimeError(f"Hunyuan export completed but GLB path was not found. export_result[1]={export_result[1]!r}")

        with open(glb_path, "rb") as f:
            return f.read()

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
