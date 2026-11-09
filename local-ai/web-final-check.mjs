import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='http://127.0.0.1:3002',id='613bfb3b5f9a';
const s=await(await fetch(base+'/api/scenes/'+id)).json();const nodes=Object.values(s.graph.nodes),items=nodes.filter(n=>n.type==='item'),walls=nodes.filter(n=>n.type==='wall');
assert.equal(walls.length,4);assert.ok(walls.every(n=>n.height===2.5));assert.equal(items.length,1);assert.deepEqual(items[0].position,[2.5,0,1.5]);
const h=JSON.parse(await readFile('chat-data/'+id+'.json','utf8'));const move=h.events.findLast(e=>e.name==='move_node'&&e.state==='done');assert.deepEqual(move.result.position,items[0].position);
assert.ok(h.messages.some(m=>m.grounded&&m.content.includes('0.5')));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});const page=await browser.newPage({viewport:{width:1512,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.goto(base+'/project/'+id,{waitUntil:'domcontentloaded'});const chat=page.getByRole('button',{name:'Chat',exact:true});await chat.waitFor();await page.waitForTimeout(1000);for(let i=0;i<3&&!await page.getByTestId('local-chat').isVisible();i++){await chat.click();await page.waitForTimeout(500)}
await page.waitForFunction(()=>document.querySelector('[data-testid="local-chat"]')?.textContent?.includes('把刚放置的这张沙发沿X正方向移动0.5米'),null,{timeout:15000});
await page.waitForFunction(()=>document.querySelector('canvas')?.width>0,null,{timeout:60000});await page.waitForTimeout(7000);
await page.getByTestId('local-chat').evaluate(el=>{const scroller=el.children[1];scroller.scrollTop=scroller.scrollHeight});await page.screenshot({path:'web-chat-final.png'});
await page.getByRole('tab',{name:'2D',exact:true}).click();await page.waitForTimeout(3000);await page.screenshot({path:'web-chat-2d.png'});
assert.equal(errors.length,0);
await writeFile('web-furniture-check.json',JSON.stringify({passed:true,sceneId:id,version:s.version,itemId:items[0].id,from:[2,0,1.5],to:items[0].position,actualToolMove:move.result,historyRestored:true,canvas:true,errors},null,2));
console.log('PASS: geometry, real move, history restore, 3D/2D rendering');
}finally{await browser.close()}
