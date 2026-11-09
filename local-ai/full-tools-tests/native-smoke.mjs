import {createMcpSession} from '../mcp-session.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const {client:c,transport}=createMcpSession();transport.stderr?.on('data',d=>process.stderr.write(d));
const results=[];let sceneId;
function payload(r){if(r.structuredContent)return r.structuredContent;const s=r.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');try{return JSON.parse(s)}catch{return {text:s}}}
async function call(name,args={}){try{const r=await c.callTool({name,arguments:args},{timeout:180000});const p=payload(r);const ok=!r.isError && p.ok!==false && !p.error;results.push({name,args,ok,result:r.content?.some(b=>b.type==='image')?{...p,images:r.content.filter(b=>b.type==='image').length}:p});console.log(ok?'PASS':'FAIL',name,ok?'':JSON.stringify(p).slice(0,450));await writeFile('full-tools-tests/native-results.json',JSON.stringify({sceneId,results},null,2));return p;}catch(e){results.push({name,args,ok:false,error:e.message});console.log('FAIL',name,e.message.slice(0,250));return {error:e.message};}}
const graph=async()=>payload(await c.callTool({name:'get_scene',arguments:{}}));
try{
 await c.connect(transport);const p=await call('create_project',{name:'工具执行器独立验收-20261109'});sceneId=p.id;const level=p.defaultLevelId;
 await call('create_room',{levelId:level,name:'执行器测试客厅',polygon:[[0,0],[8,0],[8,8],[0,8]],wallHeight:3});
 const g=await graph(),nodes=Object.values(g.nodes),walls=nodes.filter(n=>n.type==='wall'),zone=nodes.find(n=>n.type==='zone'),slab=nodes.find(n=>n.type==='slab'),building=nodes.find(n=>n.type==='building');
 await writeFile('full-tools-tests/native-fixture.json',JSON.stringify({id:sceneId,level,zone:zone.id,walls:walls.map(n=>n.id),slab:slab?.id,building:building.id},null,2));
 for(const [name,args] of [['get_scene',{}],['list_levels',{}],['get_level_summary',{levelId:level}],['get_walls',{levelId:level}],['get_zones',{levelId:level}],['get_node',{id:zone.id}],['find_by_type',{type:'wall'}],['get_site',{}],['list_units',{}],['list_collections',{}],['list_templates',{}],['list_scenes',{}],['get_project_status',{id:sceneId}],['measure',{fromId:walls[0].id,toId:walls[2].id}],['set_checkpoint',{name:'before-more-tools'}],['search_assets',{query:'sofa',limit:2}],['search_materials',{queries:['wood']}],['add_door',{wallId:walls[0].id,t:0.3,width:0.9,height:2.1}],['add_window',{wallId:walls[1].id,t:0.3,width:1.2,height:1.2,sillHeight:0.9}],['add_wall',{levelId:level,start:[10,0],end:[12,0],height:3}],['add_fence',{levelId:level,points:[[0,-2],[8,-2]],height:1,style:'picket'}],['add_column',{level:level,x:7,z:7,height:3,crossSection:'square',width:0.2,depth:0.2}],['create_stair',{levelId:level,toLevelId:null,x:6,z:1,height:2.5,width:0.9,layout:'straight'}],['create_unit',{name:'测试单元',memberZoneIds:[zone.id]}],['edit_collection',{name:'验收墙体',add:[walls[0].id]}]])await call(name,args);
 let gg=await graph(),stair=Object.values(gg.nodes).find(n=>n.type==='stair'),unit=Object.values(gg.nodes).find(n=>n.type==='unit');
 if(stair){await call('measure_stair',{stairId:stair.id});await call('fit_stair',{stairId:stair.id,width:0.9});}
 if(unit) await call('set_unit_members',{unitId:unit.id,memberZoneIds:[zone.id]});
 await call('set_zone_intent',{zoneId:zone.id,patch:{name:'执行器客厅'}});
 await call('paint',{targets:[walls[0].id],role:'wall-inside',color:'#88bbdd',exact:true});
 await call('lock_outside_faces',{levelId:level});
 await call('add_level',{name:'测试二楼',height:3});
 await call('create_roof',{levelId:level,roofType:'gable',pitch:35,overhang:0.3});
 await call('move_roofs_to_roof_level',{levelId:level});
 await call('view_assets',{ids:['sofa']});
 await call('view_scene',{from:'south-west',maxPx:768});
 await call('export_json',{pretty:false});
 await call('export_glb',{});
 await call('check_collisions',{});await call('verify_scene',{});
 await call('save_scene',{id:sceneId,name:p.name,saveMode:'checkpoint'});
 console.log('RESULT',results.filter(x=>x.ok).length+'/'+results.length,sceneId);
}finally{await c.close();}
