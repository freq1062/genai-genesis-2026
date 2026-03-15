Migrate the Asset Forge 3D generation logic from a public API to our Local Lab Cloud.

1.  The Switch:

    Replace the gradio_client call with a standard httpx or requests POST call to http://dh2020pc01.utm.utoronto.ca:8000/generate.

    Update the /generate-asset endpoint to be asynchronous.

2.  The Workflow:

    When a request arrives:

        Log the metadata into MongoDB.

        Dispatch the 3D generation task to the Celery/Redis queue on the lab machine.

        Use a 'Polling' or 'Webhook' pattern to notify the frontend when the 1MB GLB is ready in the /virtual/minalex/outputs folder.

3.  Added Value (BorderPass Prize):

    Implement a /sandbox/reset endpoint that uses PostgreSQL to restore a scene to its default 'Empty 6-Wall' state.

    Add 'Role-Based Access' checks to ensure only the user who scanned the room can place 3D objects in it.

4.  Performance: Since the local API is 3x faster than HF, remove the long timeout logic and replace it with a 30-second 'Optimization Status' update to the user.
