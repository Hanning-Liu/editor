"""Render a canonical, tightly aligned +Y-up glTF asset into its X/Z plan image."""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

job_path = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
job = json.loads(job_path.read_text())
folder = job_path.parent
model = folder / 'model.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(model))
bpy.context.view_layer.update()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and len(o.data.vertices)]
if not meshes:
    raise RuntimeError('模型没有可用于俯视图的网格')
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
size = hi - lo
actual = [size.x, size.z, size.y]  # Blender Z-up -> Pascal/glTF Y-up: width, height, depth.
expected = json.loads(sys.argv[sys.argv.index('--') + 2])
if any(not math.isfinite(v) or v <= 1e-5 for v in actual):
    raise RuntimeError('模型尺寸无效，不能生成俯视图')
if any(abs(a-e) > max(.001, abs(e)*.01) for a,e in zip(actual,expected)):
    raise RuntimeError('GLB 实际尺寸与资产尺寸不一致，已停止生成，避免图标比例错误')
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.render.resolution_x = max(16, round(768 * size.x / max(size.x, size.y)))
scene.render.resolution_y = max(16, round(768 * size.y / max(size.x, size.y)))
scene.render.resolution_percentage = 100
# Pixel aspect compensates for rounding, so the camera's footprint remains exactly width × depth.
ratio = size.y / size.x * scene.render.resolution_x / scene.render.resolution_y
# Blender clamps pixel aspects to >= 1: compensate on the other axis when rounding makes ratio < 1.
scene.render.pixel_aspect_x = max(1,1/ratio)
scene.render.pixel_aspect_y = max(1,ratio)
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
world = bpy.data.worlds.new('Plan neutral light')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.7,.7,.7,1)
scene.world = world
center = (lo + hi)*.5
span = max(size)
cam_data = bpy.data.cameras.new('Canonical plan camera')
cam_data.type = 'ORTHO'
cam_data.sensor_fit = 'HORIZONTAL'
cam_data.ortho_scale = size.x
cam_data.clip_start = .001
cam_data.clip_end = max(100,span*10)
cam = bpy.data.objects.new('Canonical plan camera', cam_data)
scene.collection.objects.link(cam)
cam.location = (center.x,center.y,hi.z+span*2)
cam.rotation_euler = (0,0,0)  # Image top = Blender +Y = glTF -Z, right = glTF +X.
scene.camera = cam
frame = cam_data.view_frame(scene=scene)
frame_width = max(v.x for v in frame)-min(v.x for v in frame)
cam_data.ortho_scale *= size.x/frame_width
frame = cam_data.view_frame(scene=scene)
fw = max(v.x for v in frame)-min(v.x for v in frame)
fh = max(v.y for v in frame)-min(v.y for v in frame)
if abs(fw-size.x)>1e-5 or abs(fh-size.y)>1e-5:
    raise RuntimeError('正交相机与模型宽深未对齐')
for name,location,power in [('Key',(center.x-span,center.y-span,hi.z+span*2),60),('Fill',(center.x+span,center.y+span,hi.z+span*2),35)]:
    light = bpy.data.lights.new(name,'AREA')
    light.energy = power*span*span
    light.size = span*2
    obj = bpy.data.objects.new(name,light)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (center-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath = str(folder/'floorplan.tmp.png')
bpy.ops.render.render(write_still=True)
image = bpy.data.images.load(scene.render.filepath,check_existing=False)
import numpy as np
pixels = np.empty(len(image.pixels),dtype=np.float32)
image.pixels.foreach_get(pixels)
rgba = pixels.reshape((-1,4))
coverage = float(np.mean(rgba[:,3]>.02))
if not np.isfinite(rgba).all() or coverage < .001:
    raise RuntimeError('俯视图为空或不透明度无效')
(folder/'floorplan.tmp.png').replace(folder/'floorplan.png')
metadata = {
    'projectionVersion':2,'modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),
    'projection':'orthographic','imageTop':'glTF -Z','imageRight':'glTF +X',
    'dimensions':list(expected),'boundsBlenderXYZ':[list(lo),list(hi)],
    'worldWidth':fw,'worldDepth':fh,'pixelWidth':image.size[0],'pixelHeight':image.size[1],
    'pixelAspect':[scene.render.pixel_aspect_x,scene.render.pixel_aspect_y],'alphaCoverage':coverage,'paddingMeters':0,
}
(folder/'floorplan.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print('正交俯视图已完成，宽深、朝向与最终 GLB 对齐',flush=True)
