import sys
import requests
from pathlib import Path

BASE_URL = "https://toddler-trainers-named-aware.trycloudflare.com"

EXAMPLES_DIR = Path(__file__).parent / "examples"


def test_full_pipeline(image_path: str):
    print("Testing Phase 1: Generation...")
    with open(image_path, "rb") as img:
        resp = requests.post(f"{BASE_URL}/generate", files={"image": img}, timeout=300)

    if resp.status_code != 200:
        print(f"Generation failed ({resp.status_code}): {resp.text}")
        sys.exit(1)

    data = resp.json()
    project_id = data["project_id"]
    asset_id = data["asset_id"]
    print(f"Manifest saved. Project: {project_id}  Asset: {asset_id}")

    print("Testing Phase 2: Hydration...")
    hydrate_resp = requests.post(
        f"{BASE_URL}/hydrate/{project_id}/{asset_id}", timeout=300
    )

    if hydrate_resp.status_code == 200:
        print(f"Hydration successful. ZIP size: {len(hydrate_resp.content):,} bytes")
    else:
        print(f"Hydration failed ({hydrate_resp.status_code}): {hydrate_resp.text}")
        sys.exit(1)


if __name__ == "__main__":
    image = sys.argv[1] if len(sys.argv) > 1 else str(EXAMPLES_DIR / "cabinet.png")
    test_full_pipeline(image)