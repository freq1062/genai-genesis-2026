Project Title: Asset Forge Backend Orchestrator
Core Objective

Develop a Python-based asynchronous backend that manages the lifecycle of 3D asset generation, spatial room mapping (without LiDAR), and agentic product sourcing. The backend must bridge the gap between 2D shopping data and "Production-Ready" 3D spatial environments.

1.  Component Architecture
    A. Spatial Reconstruction & "Blender Mode" Engine

        Monocular SLAM/SfM Service: Implement a backend service that accepts a series of "6-wall" image uploads (Front, Back, Left, Right, Ceiling, Floor).

        Parallax-Based Depth Estimator: Instead of LiDAR, use a Structure-from-Motion (SfM) approach (e.g., using OpenCV or COLMAP bindings) to calculate the room's bounding box volume based on camera movement parallax.

        Blender Mode State Manager: A JSON-based scene graph that stores the coordinates, rotation, and scale of every generated 3D object within the reconstructed room coordinates.

B. Agentic Web Scraper & Product Extractor

    Shopping Intelligence Agent: A Playwright or Selenium-based scraper capable of navigating e-commerce URLs provided by the user.

    Semantic Data Parser: An LLM-driven extractor that pulls the "Physical Truth" of a product:

        Dimensions: Parse strings like "24.5 x 12 x 30 in" into a standard metric (Meters) float array.

        Materials: Extract material keywords (e.g., "Oak Wood," "Stainless Steel") to inform the 3D generation's PBR settings.

    Budgetary Search Logic: Implement a search orchestrator that takes natural language (e.g., "Cozy home for $500") and queries shopping APIs/scrapers to find the best-matching physical items.

C. 3D Generation Interface (Hunyuan3D-V2)

    API Wrapper: Implement the gradio_client logic provided in the specs to call /shape_generation.

    Parameter Mapping: Map the "Physical Truth" (Dimensions) from the scraper to the octree_resolution and num_chunks parameters to ensure scale-accurate generation.

    Local Migration Path: The code must be modular to allow swapping client.predict for a local subprocess or torch call on an RTX 4080 once API limits are reached.

2. Technical Specifications for Implementation
   Feature Requirement
   Concurrency Use FastAPI with Celery or Redis Queue to handle long-running 3D generations and scraping tasks asynchronously.
   Data Persistence PostgreSQL to store "Scene Sandboxes" and MongoDB for raw scraped product metadata.
   Spatial Math Use NumPy and Trimesh for parallax calculations and to verify that generated models fit within the room's "6-wall" boundaries.
   Memory Management Strictly implement torch.cuda.empty_cache() hooks for the eventual local transition to 16GB VRAM.
3. Implementation Roadmap for Copilot CLI

   Phase 1: The Product Scraper. Build the /scrape-product endpoint that takes a URL and returns a JSON of dimensions, materials, and price.

   Phase 2: The Hunyuan3D Bridge. Build the /generate-asset endpoint using the Gradio Client, mapping scraped dimensions to the 3D scale.

   Phase 3: The Parallax Room Mapper. Build the /reconstruct-room endpoint that accepts the 6-view room images and returns a 3D bounding box of the user's surroundings.

   Phase 4: The Agentic Orchestrator. Build the /design-room endpoint that takes a budget/style string, scrapes items, generates assets, and places them in the room JSON.
