import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PLUGINS,allowedNames,BLOCKED,guardCall,toolSchema} from '../tool-registry.mjs';import {preferences} from '../chat-features.mjs';
const all=JSON.parse(readFileSync(new URL('../all-tools.json',import.meta.url))),names=allowedNames({plugins:PLUGINS.map(p=>p.id)});
test('all normal tools are categorized, with explicit project boundaries',()=>{assert.equal(names.size,87);assert.equal(BLOCKED.size,7);assert.deepEqual(all.map(t=>t.name).filter(n=>!names.has(n)&&!BLOCKED.has(n)),[])});
test('complete native input schemas, including advanced roof/window/object parameters',()=>{for(const t of all.filter(t=>names.has(t.name))){const expected=structuredClone(t.inputSchema);delete expected.$schema;assert.deepEqual(toolSchema(t).function.parameters,expected,t.name)}});
test('existing user plugin opt-outs remain; new groups migrate once',async()=>{const p=await preferences({plugins:['inspect']});assert.ok(!p.plugins.includes('rooms'));assert.ok(p.plugins.includes('geometry'));const closed=await preferences({...p,plugins:['inspect'],toolsetVersion:3});assert.deepEqual(closed.plugins,['inspect']);assert.ok(!allowedNames(closed).has('add_object'))});
test('batch calls cannot bypass plugin or current-project boundaries',()=>{assert.throws(()=>guardCall('run_batch',{calls:[{tool:'clear_scene'}]},names,'current'));assert.throws(()=>guardCall('run_batch',{calls:[{tool:'get_project_status',input:{id:'other'}}]},names,'current'));assert.throws(()=>guardCall('save_scene',{projectId:'other'},names,'current'));assert.throws(()=>guardCall('author_scene',{sceneId:'other'},names,'current'));assert.doesNotThrow(()=>guardCall('get_project_status',{id:'current'},names,'current'))});
test('normal deletion stays available while preserving project roots',()=>{const nodes={root:{type:'building'},wall:{type:'wall'}};assert.throws(()=>guardCall('delete_node',{id:'root'},names,'current',nodes));assert.throws(()=>guardCall('apply_patch',{patches:[{op:'update',id:'root',data:{children:[]}}]},names,'current',nodes));assert.doesNotThrow(()=>guardCall('delete_node',{id:'wall'},names,'current',nodes))});

const {requiresSceneEdit}=await import('../tool-registry.mjs');
test('preservation instructions do not disable edit checks or turn reads into writes',()=>{
 assert.equal(requiresSceneEdit('添加展示台，不要修改房间和屋顶。'),true);
 assert.equal(requiresSceneEdit('创建楼梯，检查是否成功。'),true);
 assert.equal(requiresSceneEdit('能否帮我创建一面墙？'),true);
 assert.equal(requiresSceneEdit('读取画布里的建筑面积，不要修改场景。'),false);
 assert.equal(requiresSceneEdit('只读：检查楼层，不要修改场景。'),false);
 assert.equal(requiresSceneEdit('如何创建一个房间？'),false);
});

test('v2 preferences gain Studio without restoring opted-out native groups',async()=>{const p=await preferences({plugins:['inspect'],toolsetVersion:2});assert.deepEqual(p.plugins,['inspect','studio']);assert.equal(p.toolsetVersion,3);});
