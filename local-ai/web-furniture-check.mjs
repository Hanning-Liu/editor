import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile,writeFile } from 'node:fs/promises';
const scene=JSON.parse(await readFile('web-test-scene.json','utf8'));const base='http://127.0.0.1:3002';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1512,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const graph=async()=>await(await fetch(base+'/api/scenes/'+scene.id)).json();
async function send(text){await page.getByRole('textbox',{name:'给本地 AI 的指令'}).fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="给本地 AI 的指令"]')?.disabled,null,{timeout:480000});console.log('TURN', (await page.getByTestId('local-chat').innerText()).slice(-2200));}
try{
const before=await graph();assert.equal(Object.values(before.graph.nodes).filter(n=>n.type==='wall').length,4,'room must exist before furniture test');
await page.goto(base+'/project/'+scene.id,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Chat',exact:true}).waitFor(); await page.waitForTimeout(700); for(let i=0;i<3 && !await page.getByTestId('local-chat').isVisible();i++){await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(500);}
if(!Object.values(before.graph.nodes).some(n=>n.type==='item')) await send('搜索目录中的沙发（英文 sofa，最多3个结果），选择一个真实资产，在当前客厅中心 x=2、z=1.5 放置一张沙发，不要再建房间。检查是否放置成功。');
const placed=await graph();const items=Object.values(placed.graph.nodes).filter(n=>n.type==='item'||n.type==='procedural-item');console.log('ITEMS',JSON.stringify(items).slice(0,3000));assert.equal(items.length,1,'exactly one sofa');
const item=items[0];await send('把刚放置的这张沙发沿X正方向移动0.5米，Z不变，不要新增家具，完成后检查。');
const moved=await graph();const after=moved.graph.nodes[item.id];assert.ok(Math.abs(after.position[0]-item.position[0]-0.5)<0.001,'x delta');assert.equal(after.position[2],item.position[2],'z unchanged');
await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Chat',exact:true}).waitFor(); await page.waitForTimeout(700); for(let i=0;i<3 && !await page.getByTestId('local-chat').isVisible();i++){await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(500);}await page.getByText('把刚放置的这张沙发沿X正方向移动0.5米，Z不变，不要新增家具，完成后检查。',{exact:true}).last().waitFor();
await page.screenshot({path:'web-chat-furniture.png'});
await writeFile('web-furniture-check.json',JSON.stringify({passed:true,sceneId:scene.id,before:before.version,placed:placed.version,moved:moved.version,itemId:item.id,from:item.position,to:after.position,historyRestored:true,errors},null,2));
}finally{await browser.close()}
