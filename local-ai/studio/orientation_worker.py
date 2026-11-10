import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
folder=Path(sys.argv[sys.argv.index('--')+1]);out=folder/'orientation-views';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(folder/'model.glb'));bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)]
if not meshes:raise RuntimeError('没有可识别的网格')
points=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);size=hi-lo;center=(lo+hi)/2;radius=max(size)*2.2
# The imported GLB's local [x,y,z] becomes Blender [x,-z,y]. Use known poses, not inferred image axes.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.device='CPU'
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
world=bpy.data.worlds.new('Orientation neutral');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.7,.7,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8
camdata=bpy.data.cameras.new('Evidence camera');cam=bpy.data.objects.new('Evidence camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=max(size)*1.6
# Symmetric illumination prevents lighting direction from becoming a front cue.
for i,p in enumerate([(1,1,2),(-1,1,2),(1,-1,2),(-1,-1,2)]):
 data=bpy.data.lights.new('Light'+str(i),'AREA');data.energy=40;data.size=radius;obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=center+Vector(p)*radius;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
# Principal geometry axes make the candidate directions follow a baked mesh rotation.
import numpy as np
samples=[]
for obj in meshes:
 step=max(1,len(obj.data.vertices)//4000)
 samples.extend([(obj.matrix_world@obj.data.vertices[k].co) for k in range(0,len(obj.data.vertices),step)])
xy=np.array([[p.x,-p.y] for p in samples]);cov=np.cov(xy.T);values,vectors=np.linalg.eigh(cov);ratio=float(values[-1]/max(values[0],1e-9))
axis=vectors[:,-1];base=math.atan2(float(axis[0]),float(axis[1])) if ratio>1.15 else 0
views=[]
for i in range(8):
 yaw=base+i*math.pi/4;front=[round(math.sin(yaw),8),0,round(math.cos(yaw),8)]
 cam.location=center+Vector((front[0]*radius,-front[2]*radius,radius*.28));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
 filename='orientation-v'+str(i)+'.png';scene.render.filepath=str(folder/filename);bpy.ops.render.render(write_still=True)
 views.append({'id':i,'file':filename,'frontLocal':front,'cameraGlbLocal':[cam.location.x,-0.0+cam.location.z,-cam.location.y],'yawDegrees':round(math.degrees(yaw)%360,6)})
(folder/'orientation-views.json').write_text(json.dumps({'version':1,'coordinateFrame':'glb-local','dimensions':[size.x,size.z,size.y],'principalAxisRatio':ratio,'views':views},indent=2))
print('朝向多视图渲染完成',flush=True)
