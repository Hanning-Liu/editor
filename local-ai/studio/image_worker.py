import argparse,json,time,os,zipfile
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps,ImageFilter
from scipy.ndimage import gaussian_filter
p=argparse.ArgumentParser();p.add_argument('job');a=p.parse_args();j=json.loads(Path(a.job).read_text());d=Path(a.job).parent;cfg=j['settings'];t=time.time();metrics={}
def emit(s):print(s,flush=True)
def image_save(im,name):
 f=d/(name+'.tmp.png');im.save(f);f.replace(d/name)
def seamless(im):
 ar=np.asarray(im.convert('RGB'),dtype=np.float32)
 if np.array_equal(ar[0],ar[-1]) and np.array_equal(ar[:,0],ar[:,-1]):return im.convert('RGB')
 ar=np.concatenate([ar,ar[:,::-1]],axis=1);ar=np.concatenate([ar,ar[::-1]],axis=0)
 im=Image.fromarray(np.uint8(ar)).resize(im.size,Image.Resampling.LANCZOS)
 ar=gaussian_filter(np.asarray(im,dtype=np.float32),sigma=(.65,.65,0),mode='wrap')
 edge=(ar[0]+ar[-1])/2;ar[0]=edge;ar[-1]=edge
 edge=(ar[:,0]+ar[:,-1])/2;ar[:,0]=edge;ar[:,-1]=edge
 return Image.fromarray(np.uint8(np.clip(ar,0,255)))
if j['type']!='pbr':
 if not (d/'raw.png').exists():
  emit('加载本地 FLUX.2 Klein 9B')
  from mflux.models.common.config import ModelConfig
  from mflux.models.flux2.variants import Flux2Klein
  klass=Flux2Klein
  model=klass(model_config=ModelConfig.from_name(model_name='flux2-klein-9b'),model_path=j['fluxPath'])
  emit('FLUX 正在生成图片')
  prompt=j['prompt']
  if j['type']=='material':prompt='Flat material albedo texture, top-down, even neutral lighting, no perspective, no shadows, no text. '+prompt
  else:prompt='Edit this exact reference image into a realistic architectural visualization. Keep the exact same isometric cutaway camera, perspective, roof visibility, wall silhouette, openings, room proportions and all existing furniture positions. Do not turn the image into a first-person interior photo. Do not add windows or doors. Change surface finish and lighting only. '+prompt
  kw=dict(seed=cfg['seed'],prompt=prompt,num_inference_steps=cfg['steps'],width=cfg['resolution'],height=cfg['resolution'] if j['type']=='material' else int(cfg['resolution']*3/4),guidance=1.)
  if j['type']=='render':
   ref=Image.open(d/'input.png');kw['height']=max(256,int(round((cfg['resolution']*ref.height/ref.width)/16))*16);kw['image_path']=str(d/'input.png');kw['image_strength']=cfg.get('imageStrength',.8)
  im=model.generate_image(**kw);im.save(str(d/'raw.png'))
  import mlx.core as mx
  metrics['peakMetalBytes']=mx.get_peak_memory()
 if j['type']=='render':
  im=Image.open(d/'raw.png').convert('RGB');image_save(im,'result.png');image_save(im.copy().resize((512,int(512*im.height/im.width))),'preview.png')
  out={'kind':'image','preview':'preview.png','files':['result.png','input.png'],'width':im.width,'height':im.height,'method':'flux2-klein-img2img','referenceStrength':cfg.get('imageStrength',.8),'sceneGeometryUnchanged':True}
 else:
  emit('处理周期边界并生成平铺预览')
  im=seamless(Image.open(d/'raw.png'));image_save(im,'basecolor.png')
  ar=np.array(im);edge=float(max(np.abs(ar[0].astype(float)-ar[-1]).mean(),np.abs(ar[:,0].astype(float)-ar[:,-1]).mean()))
  tiled=Image.new('RGB',(im.width*4,im.height*4))
  for x in range(4):
   for y in range(4):tiled.paste(im,(x*im.width,y*im.height))
  image_save(tiled.resize((1024,1024)),'tiled.png');image_save(im.resize((512,512)),'preview.png')
  out={'kind':'material','preview':'preview.png','files':['basecolor.png','tiled.png'],'maps':{'baseColor':'basecolor.png'},'method':'FLUX + mirrored periodic smoothing','seamEdgeMean':edge,'roughness':cfg['roughness'],'metalness':cfg['metalness'],'tileSizeMeters':cfg['tileSizeMeters']}
else:
 emit('从基础纹理估计高度、法线与粗糙度')
 im=Image.open(d/'input.png').convert('RGB');im=seamless(im);image_save(im,'basecolor.png');c=np.asarray(im,dtype=float)/255.;lum=c@np.array([.2126,.7152,.0722]);h=gaussian_filter(lum,1.2,mode='wrap');h=(h-h.min())/max(float(np.ptp(h)),1e-6)
 gx=(np.roll(h,-1,axis=1)-np.roll(h,1,axis=1))*.5;gy=(np.roll(h,-1,axis=0)-np.roll(h,1,axis=0))*.5
 v=np.stack([-gx*cfg['normalStrength'],gy*cfg['normalStrength'],np.ones_like(h)],axis=-1);v/=np.linalg.norm(v,axis=-1,keepdims=True)
 edge=(v[0]+v[-1])*.5;v[0]=edge;v[-1]=edge
 edge=(v[:,0]+v[:,-1])*.5;v[:,0]=edge;v[:,-1]=edge
 v/=np.linalg.norm(v,axis=-1,keepdims=True)
 image_save(Image.fromarray(np.uint8(np.clip((v*.5+.5)*255,0,255))),'normal.png');image_save(Image.fromarray(np.uint8(h*255)),'height.png')
 rough=np.clip(cfg['roughness']+(h-.5)*.1,0,1);metal=np.full_like(h,cfg['metalness'])
 ao=1.-.4*np.clip((gaussian_filter(h,4,mode='wrap')-h)*4,0,1)
 edge=(ao[0]+ao[-1])*.5;ao[0]=edge;ao[-1]=edge
 edge=(ao[:,0]+ao[:,-1])*.5;ao[:,0]=edge;ao[:,-1]=edge
 for name,arr in [('roughness.png',rough),('metalness.png',metal),('ao.png',ao)]:image_save(Image.fromarray(np.uint8(arr*255)),name)
 image_save(Image.fromarray(np.uint8(np.stack([ao,rough,metal],axis=-1)*255)),'orm.png')
 image_save(im.resize((512,512)),'preview.png')
 tiled=Image.new('RGB',(im.width*4,im.height*4))
 for x in range(4):
  for y in range(4):tiled.paste(im,(x*im.width,y*im.height))
 image_save(tiled.resize((1024,1024)),'tiled.png')
 maps={'baseColor':'basecolor.png','normal':'normal.png','roughness':'roughness.png','metalness':'metalness.png','height':'height.png','ao':'ao.png'}
 out={'kind':'material','preview':'preview.png','files':list(maps.values())+['tiled.png','orm.png'],'maps':maps,'method':'PBR estimated from base color; periodic gradients; metalness supplied by user','estimated':True,'roughness':cfg['roughness'],'metalness':cfg['metalness'],'tileSizeMeters':cfg['tileSizeMeters'],'normalStrength':cfg['normalStrength'],'seamEdgeMean':float(np.abs(np.asarray(im)[0].astype(float)-np.asarray(im)[-1]).mean())}
out['metrics']={**metrics,'seconds':round(time.time()-t,3)}
(d/'result.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
if out['kind']=='material':
 with zipfile.ZipFile(d/'material.zip','w',zipfile.ZIP_DEFLATED) as z:
  for name in out['files']+['result.json']:z.write(d/name,name)
 out['files'].append('material.zip');(d/'result.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
emit('图片处理完成')
