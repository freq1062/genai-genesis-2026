import os
import tempfile

from gradio_client import Client, handle_file

HUNYUAN_SPACE_ID = "tencent/Hunyuan3D-2"

_hunyuan_client: Client | None = None


def get_hunyuan_client() -> Client:
    global _hunyuan_client
    if _hunyuan_client is None:
        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")
        _hunyuan_client = Client(HUNYUAN_SPACE_ID, token=hf_token)
    return _hunyuan_client


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
            raise RuntimeError("Hunyuan /generation_all returned unexpected payload shape.")

        file_out = _coerce_existing_file_path(generation_result[0], "file_out")
        file_out2 = _coerce_existing_file_path(generation_result[1], "file_out2")

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

        if not isinstance(export_result, (list, tuple)) or len(export_result) < 2:
            raise RuntimeError("Hunyuan /on_export_click returned unexpected shape.")
        glb_path = _extract_file_path(export_result[1])
        if not glb_path or not os.path.exists(glb_path):
            raise RuntimeError(
                f"Hunyuan export completed but GLB path was not found. export_result[1]={export_result[1]!r}"
            )

        with open(glb_path, "rb") as f:
            return f.read()


def generate_glb_shape_only(
    image_data: bytes,
    caption: str | None,
    dimensions_m: list[float] | None,
) -> bytes:
    longest_dim_cm = max(dimensions_m) * 100 if dimensions_m else 30
    octree_resolution = min(256, max(64, int(longest_dim_cm * 4.25)))
    num_chunks = min(20000, max(2000, octree_resolution * 30))

    with tempfile.TemporaryDirectory() as tmpdir:
        # Only write image file if we actually have image data
        if image_data:
            input_png = os.path.join(tmpdir, "input.png")
            with open(input_png, "wb") as f:
                f.write(image_data)
            image_arg = handle_file(input_png)
        else:
            image_arg = None  # text-only generation via caption

        client = get_hunyuan_client()
        result = client.predict(
            caption,
            image_arg,
            None,
            None,
            None,
            None,
            30,
            5.0,
            1234,
            octree_resolution,
            True,
            num_chunks,
            True,
            api_name="/shape_generation",
        )

        glb_path = _extract_file_path(result[0])
        if not glb_path or not os.path.exists(glb_path):
            raise RuntimeError(f"Shape generation did not return a valid file path. result[0]={result[0]!r}")

        with open(glb_path, "rb") as f:
            return f.read()
