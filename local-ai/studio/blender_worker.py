import bpy,sys,json,math,ast,time
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];job_path=Path(args[0]);j=json.loads(job_path.read_text());d=job_path.parent;t=__import__('time').time()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
if j['type']=='blender':
 source=(d/'source.py').read_text();tree=ast.parse(source)
 allowed={'bpy','bmesh','math','mathutils','random'}
 for n in ast.walk(tree):
  if isinstance(n,ast.Import) and any(a.name.split('.')[0] not in allowed for a in n.names):raise RuntimeError('模型代码包含不支持的模块')
  if isinstance(n,ast.ImportFrom) and (n.module or '').split('.')[0] not in allowed:raise RuntimeError('模型代码包含不支持的模块')
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id in {'exec','eval','open','compile','__import__'}:raise RuntimeError('模型代码包含不支持的调用')
  if isinstance(n,ast.Attribute) and (n.attr.startswith('__') or n.attr in {'save_as_mainfile','open_mainfile','read_factory_settings'}):raise RuntimeError('模型代码不能管理文件')
 scope={'__name__':'studio_generated'};exec(compile(tree,'studio_module','exec'),scope)
 if not callable(scope.get('build')):raise RuntimeError('Qwen代码必须定义build(params)')
 scope['build']({'width':j['settings']['width'],'depth':j['settings']['depth'],'height':j['settings']['height']})
else:
 bpy.ops.import_scene.gltf(filepath=str(d/'trellis.glb'))
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH' and len(obj.data.vertices)==0:bpy.data.objects.remove(obj,do_unlink=True)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes:raise RuntimeError('没有可导出的网格')
def bounds():
 pts=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
 lo=Vector([min(v[i] for v in pts) for i in range(3)]);hi=Vector([max(v[i] for v in pts) for i in range(3)]);return lo,hi
bpy.context.view_layer.update();lo,hi=bounds();size=hi-lo
if min(size)<1e-5:raise RuntimeError('模型退化成薄片，不能作为完整物体导入')
original=list(size)
scale=Vector([j['settings']['width']/size.x,j['settings']['depth']/size.y,j['settings']['height']/size.z]) if j['type']=='blender' else Vector([j['settings']['width']/size.x]*3)
for o in meshes:
 o.location=Vector([o.location[i]*scale[i] for i in range(3)]);o.scale=Vector([o.scale[i]*scale[i] for i in range(3)])
bpy.context.view_layer.update();lo,hi=bounds();offset=Vector([-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z])
for o in meshes:o.location+=offset
bpy.context.view_layer.update();total=sum(len(o.data.polygons) for o in meshes);limit=j['settings']['faceLimit']
if total>limit:
 for o in meshes:
  bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Studio simplification','DECIMATE');m.ratio=limit/total;bpy.ops.object.modifier_apply(modifier=m.name)
for o in meshes:
 if not o.data.materials:
  m=bpy.data.materials.new('slot_finish');m.diffuse_color=(.55,.32,.14,1);o.data.materials.append(m)
# Pascal discovers editable model surfaces from slot_ material names.
for material in {m for o in meshes for m in o.data.materials if m}:
 if not material.name.lower().startswith('slot_'):
  import re
  material.name='slot_'+re.sub('[^a-z0-9_]+','_',material.name.lower()).strip('_')
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=str(d/'model.glb'),export_format='GLB',use_selection=True,export_yup=True)
lo,hi=bounds();size=hi-lo;center=Vector([0,0,size.z*.45]);radius=max(size)*1.8
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
world=bpy.data.worlds.new('Studio world');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.25,.25,1)
cam_data=bpy.data.cameras.new('Studio camera');cam=bpy.data.objects.new('Studio camera',cam_data);scene.collection.objects.link(cam);cam.location=Vector([radius,-radius,radius*.8])+center;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.type='ORTHO';cam_data.ortho_scale=max(size)*1.6;scene.camera=cam
for name,pos,power in [('Key',(radius,-radius,radius*1.5),70),('Fill',(-radius,-radius,radius),40),('Rim',(0,radius,radius*1.5),50)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=radius;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=Vector(pos)+center;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(d/'preview.png');scene.render.film_transparent=True
bpy.ops.wm.save_as_mainfile(filepath=str(d/'source.blend'));bpy.ops.render.render(write_still=True)
result={'kind':'model','preview':'preview.png','files':['model.glb','source.blend']+(['source.py'] if j['type']=='blender' else ['input.png']),'dimensions':[round(size.x,5),round(size.z,5),round(size.y,5)],'originalDimensionsBlenderXYZ':original,'faces':sum(len(o.data.polygons) for o in meshes),'method': 'Qwen generated bpy' if j['type']=='blender' else 'TRELLIS.2 + Blender normalization','metrics':{'postprocessSeconds':round(__import__('time').time()-t,3)}}
if j.get('generatorOrientation'):result['generatorOrientation']={**j['generatorOrientation'],'frontLocal':[0,0,1],'coordinateFrame':'glb-local'}
(d/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('Studio 模型整理完成',flush=True)
