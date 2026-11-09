import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {setTimeout as delay} from 'node:timers/promises';
const base='http://127.0.0.1:3002',id='613bfb3b5f9a',api=base+'/api/local-chat?sceneId='+id;
const get=async()=>await(await fetch(api)).json();
const scene=async()=>await(await fetch(base+'/api/scenes/'+id)).json();
const before=await scene(),initial=await get();assert.equal(Object.values(before.graph.nodes).filter(n=>n.type==='roof').length,0,'Do not replay roof creation');
await writeFile('reliability-tests/scene-before-roof.json',JSON.stringify(before,null,2));
const prefs={...initial.preferences,effort:'fast',plugins:[...new Set([...initial.preferences.plugins,'roofs'])]};await fetch(api+'&action=preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(prefs)});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1512,height:1000}});
try{
 await page.goto(base+'/project/'+id,{waitUntil:'domcontentloaded'});const chat=page.getByRole('button',{name:'Chat',exact:true});await chat.waitFor();for(let i=0;i<4&&!await page.getByTestId('local-chat').isVisible();i++){await chat.click();await page.waitForTimeout(500)}
 await page.waitForFunction(()=>!!document.querySelector('textarea[aria-label="给本地 AI 的指令"]')&&!document.querySelector('textarea[aria-label="给本地 AI 的指令"]').disabled);
 assert.equal(await page.getByTestId('local-chat').getByText('已停止。已执行的场景修改仍保留。',{exact:false}).count(),0,'old development stops should be folded');
 await page.getByRole('textbox',{name:'给本地 AI 的指令'}).fill('给当前房间创建一个坡屋顶。使用双坡屋顶，采用工具默认40度坡度、0.3米挑檐，保留已有墙和家具。先检查有无屋顶，已有则不要重复创建，完成后校验。');await page.getByRole('button',{name:'发送',exact:true}).click();
 let running;for(let i=0;i<30;i++){running=await get();if(running.running&&running.run?.status==='running')break;await delay(200)}assert.ok(running.running);const runId=running.run.id;console.log('started',runId);
 await browser.close();await delay(1000);const detached=await get();assert.ok(detached.running||detached.run.status==='completed');assert.notEqual(detached.run.status,'cancelled');console.log('browser closed; backend continued');
 const deadline=Date.now()+480000;let h;
 while(Date.now()<deadline){h=await get();if(!h.running)break;await delay(3000)}assert.ok(!h.running,'roof run timed out');assert.equal(h.run.id,runId);assert.equal(h.run.status,'completed',h.messages.at(-1).content);
 const after=await scene(),nodes=Object.values(after.graph.nodes),roofs=nodes.filter(n=>n.type==='roof'),segments=nodes.filter(n=>n.type==='roof-segment');assert.equal(roofs.length,1);assert.ok(segments.length>=1);assert.ok(h.currentEvents.some(e=>e.name==='create_roof'&&e.state==='done'));
 for(const n of Object.values(before.graph.nodes)){if(n.type==='item')assert.deepEqual(after.graph.nodes[n.id].position,n.position);if(n.type==='wall'){assert.deepEqual(after.graph.nodes[n.id].start,n.start);assert.deepEqual(after.graph.nodes[n.id].end,n.end)}}
 const check=h.currentEvents.findLast(e=>e.name==='verify_scene'&&e.state==='done');assert.ok(check?.result.valid);
 await writeFile('reliability-tests/roof-result.json',JSON.stringify({passed:true,runId,continuedAfterBrowserClose:true,oldTestsFolded:true,versionBefore:before.version,versionAfter:after.version,roofs,segments,check:check.result,reply:h.messages.at(-1).content},null,2));console.log('PASS: actual roof created, checked, browser disconnect did not cancel');
}finally{await browser.close().catch(()=>{});const h=await get();if(!h.running)await fetch(api+'&action=preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...initial.preferences,plugins:[...new Set([...initial.preferences.plugins,'roofs'])]})});}
