Project Name: Asset Forge - Railtracks Orchestrator
Framework: RailtownAI/railtracks
Environment: /virtual/minalex/ar_env/

Task 1: Define the Tool-First Scraper (Railtracks Nodes)

    Convert the Playwright scraper into a @rt.function_node.

    Define a 'Product Parser' tool that takes raw HTML/text and uses an LLM to extract JSON dimensions (metric), materials, and price.

    Integrate these into a rt.agent_node named "Shopping Scout".

Task 2: The Agentic Designer (Orchestrator Node)

    Create a high-level "Interior Designer" agent node.

    Equip it with three specialized tools:

        Shopping Scout: To find and price furniture.

        Asset Forge Generator: To call the local Hunyuan3D-V2.1 /generate endpoint.

        Spatial Validator: To run the trimesh planarity and center-of-mass checks.

Task 3: The Design Workflow (Pythonic Control Flow)

    Implement a @rt.session decorated function orchestrate_room_design(budget, style_prompt).

    The Logic:

        First, call the Shopping Scout to find items under budget.

        Parallelize (using Railtracks' built-in parallelization) the 3D generation for the selected items.

        Pass the output meshes through the Spatial Validator.

        Return a final Manifest.json and .zip payload.

Task 4: Observability & Technical Depth (Prize Targets)

    Ensure all nodes log execution data for Railtracks Viz.

    The Flex: Add a 'Retry Policy' using Railtracks' built-in error handling. If the 3D generation fails (OOM), the agent should automatically retry with a lower octree_resolution.

    Moorcheh Prize: Log the VRAM efficiency inside the Railtracks execution history to prove memory management on the 4080.
