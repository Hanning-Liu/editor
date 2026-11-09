import fs from 'node:fs/promises';import {PLUGINS,allowedNames,BLOCKED} from '../tool-registry.mjs';
const root=new URL('./',import.meta.url),read=async file=>{try{return JSON.parse(await fs.readFile(new URL(file,root),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
const inventory=JSON.parse(await fs.readFile(new URL('../all-tools.json',import.meta.url),'utf8'));
const names=allowedNames({plugins:PLUGINS.map(p=>p.id)}),evidence=new Map(),attempts=[];
const add=(name,ok,file,kind)=>{attempts.push({name,ok,file,kind});if(ok){const e=evidence.get(name)||[];e.push({file,kind});evidence.set(name,e)}};
for(const file of ['native-results.json','extended-results.json','retry-results.json','remaining-results.json']){const d=await read(file);for(const r of d?.results||[])add(r.name,r.ok,file,'MCP execution with persisted test scene')}
for(const file of ['procedural-result.json','migration-result.json','migration-persisted-result.json']){const d=await read(file);if(d)add(d.name,d.ok,file,file==='migration-result.json'?'MCP in-memory legacy roof fixture':'MCP execution with persisted test scene')}
const glb=await read('glb-validation.json');if(glb)add('export_glb',glb.passed,'glb-validation.json','Browser exporter; validated downloaded GLB container and meshes');
for(const r of (await read('vision-results.json'))?.results||[])add(r.name,r.ok,'vision-results.json','Real local Qwen MCP sampling; schema validated, photo dimensions are estimates');
const qwen=[];for(const file of ['building.json','roof-visual.json','custom-and-stair.json','stair-and-export.json','custom-simple.json','undo-qwen.json','redo-qwen.json']){const d=await read(file);if(!d)continue;const events=d.currentEvents||[];qwen.push({file,status:d.run?.status,runId:d.run?.id,calls:events.filter(e=>e.type==='tool'&&e.state==='done').map(e=>e.name),errors:events.filter(e=>e.type==='tool'&&e.state==='error').map(e=>e.name)});for(const e of events.filter(e=>e.type==='tool'&&e.state==='done')){if(names.has(e.name))add(e.name,true,file,'Actual Qwen autonomous tool call via web Chat')}}
const rows=inventory.map(t=>({name:t.name,group:PLUGINS.find(p=>p.tools.includes(t.name))?.name||'读取与测量',modelAvailable:names.has(t.name),boundary:BLOCKED.get(t.name)||null,verified:!!evidence.get(t.name),evidence:evidence.get(t.name)||[]}));
const report={generatedAt:new Date().toISOString(),nativeTotal:rows.length,modelAvailable:names.size,helpers:['discover_tools','read_pascal_resource'],boundaries:BLOCKED.size,verifiedNormal:rows.filter(r=>r.modelAvailable&&r.verified).length,unverifiedNormal:rows.filter(r=>r.modelAvailable&&!r.verified).map(r=>r.name),qwen,attempts,rows};
await fs.writeFile(new URL('tool-matrix.json',root),JSON.stringify(report,null,2));
let text='# Qwen 建模工具接入与验收矩阵\n\n'+`更新时间：${report.generatedAt}\n\nPascal MCP ${rows.length} 项；Qwen 正常建模工具 ${names.size} 项；目录/规范辅助工具 2 项；项目管理边界 7 项。\n\n`;
text+='验收口径：执行成功代表所列测试输入和场景成立，不代表所有参数组合。屋顶迁移同时使用原生 MCP 内存夹具和持久化项目验证，其他建模使用持久化测试项目；图片分析调用本地 Qwen。照片尺寸估计不作为实测。\n\n| 工具 | 分类 | 接入状态 | 执行验证 |\n|---|---|---|---|\n';for(const r of rows)text+=`| \`${r.name}\` | ${r.group} | ${r.modelAvailable?'Qwen 可自主调用':r.boundary} | ${r.verified?'通过；'+[...new Set(r.evidence.map(e=>e.file))].join('、'):'不开放给模型'} |\n`;
text+='\n完整参数见 ../all-tools.json；原始执行输入与返回见同目录 JSON。初始错误与修正后的成功记录分别保留，不能把无效传参的拒绝视为接口不可用。\n';
await fs.writeFile(new URL('TOOL-MATRIX.md',root),text);
console.log(JSON.stringify({total:report.nativeTotal,available:report.modelAvailable,verified:report.verifiedNormal,missing:report.unverifiedNormal,qwen:report.qwen},null,2));
