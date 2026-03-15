1. Install the python client (docs) if you don't already have it installed.

$ pip install gradio_client

2. Find the API endpoint below corresponding to your desired function in the app. Copy the code snippet, replacing the placeholder values with your own input data. If this is a private Space, you may need to pass your Hugging Face token as well (read more). Or use the to automatically generate your API requests.
   api_name: /lambda

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda"
)
print(result)

Accepts 0 parameters:
Returns 1 element
api_name: /lambda_1

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda_1"
)
print(result)

Accepts 0 parameters:
Returns 1 element
api_name: /shape_generation

from gradio_client import Client, handle_file

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
caption=None,
image=None,
mv_image_front=None,
mv_image_back=None,
mv_image_left=None,
mv_image_right=None,
steps=30,
guidance_scale=5,
seed=1234,
octree_resolution=256,
check_box_rembg=True,
num_chunks=8000,
randomize_seed=True,
api_name="/shape_generation"
)
print(result)

Accepts 13 parameters:

caption str | None Default: None

The input value that is provided in the "Text Prompt" Textbox component.

image filepath | None Default: None

The input value that is provided in the "Image" Image component.

mv_image_front filepath | None Default: None

The input value that is provided in the "Front" Image component.

mv_image_back filepath | None Default: None

The input value that is provided in the "Back" Image component.

mv_image_left filepath | None Default: None

The input value that is provided in the "Left" Image component.

mv_image_right filepath | None Default: None

The input value that is provided in the "Right" Image component.

steps float Default: 30

The input value that is provided in the "Inference Steps" Slider component.

guidance_scale float Default: 5

The input value that is provided in the "Guidance Scale" Number component.

seed float Default: 1234

The input value that is provided in the "Seed" Slider component.

octree_resolution float Default: 256

The input value that is provided in the "Octree Resolution" Slider component.

check_box_rembg bool Default: True

The input value that is provided in the "Remove Background" Checkbox component.

num_chunks float Default: 8000

The input value that is provided in the "Number of Chunks" Slider component.

randomize_seed bool Default: True

The input value that is provided in the "Randomize seed" Checkbox component.
Returns tuple of 4 elements

[0] filepath

The output value that appears in the "File" File component.

[1] str

The output value that appears in the "Output" Html component.

[2] Dict[Any, Any]

The output value that appears in the "Mesh Stats" Json component.

[3] float

The output value that appears in the "Seed" Slider component.
api_name: /lambda_2

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda_2"
)
print(result)

Accepts 0 parameters:
Returns tuple of 3 elements

[0] bool

The output value that appears in the "Include Texture" Checkbox component.

[1] bool

The output value that appears in the "Simplify Mesh" Checkbox component.

[2] filepath

The output value that appears in the "Download" Downloadbutton component.
api_name: /lambda_3

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda_3"
)
print(result)

Accepts 0 parameters:
Returns 1 element
api_name: /generation_all

from gradio_client import Client, handle_file

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
caption=None,
image=None,
mv_image_front=None,
mv_image_back=None,
mv_image_left=None,
mv_image_right=None,
steps=30,
guidance_scale=5,
seed=1234,
octree_resolution=256,
check_box_rembg=True,
num_chunks=8000,
randomize_seed=True,
api_name="/generation_all"
)
print(result)

Accepts 13 parameters:

caption str | None Default: None

The input value that is provided in the "Text Prompt" Textbox component.

image filepath | None Default: None

The input value that is provided in the "Image" Image component.

mv_image_front filepath | None Default: None

The input value that is provided in the "Front" Image component.

mv_image_back filepath | None Default: None

The input value that is provided in the "Back" Image component.

mv_image_left filepath | None Default: None

The input value that is provided in the "Left" Image component.

mv_image_right filepath | None Default: None

The input value that is provided in the "Right" Image component.

steps float Default: 30

The input value that is provided in the "Inference Steps" Slider component.

guidance_scale float Default: 5

The input value that is provided in the "Guidance Scale" Number component.

seed float Default: 1234

The input value that is provided in the "Seed" Slider component.

octree_resolution float Default: 256

The input value that is provided in the "Octree Resolution" Slider component.

check_box_rembg bool Default: True

The input value that is provided in the "Remove Background" Checkbox component.

num_chunks float Default: 8000

The input value that is provided in the "Number of Chunks" Slider component.

randomize_seed bool Default: True

The input value that is provided in the "Randomize seed" Checkbox component.
Returns tuple of 5 elements

[0] filepath

The output value that appears in the "File" File component.

[1] filepath

The output value that appears in the "File" File component.

[2] str

The output value that appears in the "Output" Html component.

[3] Dict[Any, Any]

The output value that appears in the "Mesh Stats" Json component.

[4] float

The output value that appears in the "Seed" Slider component.
api_name: /lambda_4

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda_4"
)
print(result)

Accepts 0 parameters:
Returns tuple of 3 elements

[0] bool

The output value that appears in the "Include Texture" Checkbox component.

[1] bool

The output value that appears in the "Simplify Mesh" Checkbox component.

[2] filepath

The output value that appears in the "Download" Downloadbutton component.
api_name: /lambda_5

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda_5"
)
print(result)

Accepts 0 parameters:
Returns 1 element
api_name: /on_gen_mode_change

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
value="Turbo",
api_name="/on_gen_mode_change"
)
print(result)

Accepts 1 parameter:

value Literal['Turbo', 'Fast', 'Standard'] Default: "Turbo"

The input value that is provided in the "Generation Mode" Radio component.
Returns 1 element

float

The output value that appears in the "Inference Steps" Slider component.
api_name: /on_decode_mode_change

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
value="Standard",
api_name="/on_decode_mode_change"
)
print(result)

Accepts 1 parameter:

value Literal['Low', 'Standard', 'High'] Default: "Standard"

The input value that is provided in the "Decoding Mode" Radio component.
Returns 1 element

float

The output value that appears in the "Octree Resolution" Slider component.
api_name: /lambda_6

from gradio_client import Client

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
api_name="/lambda_6"
)
print(result)

Accepts 0 parameters:
Returns 1 element
api_name: /on_export_click

from gradio_client import Client, handle_file

client = Client("tencent/Hunyuan3D-2")
result = client.predict(
file_out=handle_file('https://github.com/gradio-app/gradio/raw/main/test/test_files/sample_file.pdf'),
file_out2=handle_file('https://github.com/gradio-app/gradio/raw/main/test/test_files/sample_file.pdf'),
file_type="glb",
reduce_face=False,
export_texture=False,
target_face_num=10000,
api_name="/on_export_click"
)
print(result)

Accepts 6 parameters:

file_out filepath Required

The input value that is provided in the "File" File component.

file_out2 filepath Required

The input value that is provided in the "File" File component.

file_type Literal['glb', 'obj', 'ply', 'stl'] Default: "glb"

The input value that is provided in the "File Type" Dropdown component.

reduce_face bool Default: False

The input value that is provided in the "Simplify Mesh" Checkbox component.

export_texture bool Default: False

The input value that is provided in the "Include Texture" Checkbox component.

target_face_num float Default: 10000

The input value that is provided in the "Target Face Number" Slider component.
Returns tuple of 2 elements

[0] str

The output value that appears in the "Output" Html component.

[1] filepath

The output value that appears in the "Download" Downloadbutton component.
