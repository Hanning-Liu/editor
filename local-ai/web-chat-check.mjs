import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const scene=JSON.parse(await readFile('web-test-scene.json','utf8'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1512,height:1000}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message.slice(0,600))});
try{
await page.goto('http://127.0.0.1:3002/project/'+scene.id,{waitUntil:'domcontentloaded',timeout:120000});
console.log('loaded',await page.title());await page.waitForTimeout(5000);
console.log((await page.locator('body').innerText()).slice(0,3500));
await page.getByRole('button',{name:'Chat',exact:true}).click({timeout:45000});
await page.getByRole('textbox',{name:'给本地 AI 的指令'}).fill('在当前空白场景画一个4米×3米的客厅，墙高2.5米。完成后检查，不要重复创建。');
await page.getByRole('button',{name:'发送',exact:true}).click();console.log('sent-room');
await page.getByRole('textbox',{name:'给本地 AI 的指令'}).waitFor({state:'visible'});
await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="给本地 AI 的指令"]')?.disabled,null,{timeout:480000});
console.log('room complete', (await page.getByTestId('local-chat').innerText()).slice(-4500));
const stored=await (await fetch('http://127.0.0.1:3002/api/scenes/'+scene.id)).json();
const walls=Object.values(stored.graph.nodes).filter(n=>n.type==='wall');assert.equal(walls.length,4);assert.ok(walls.every(w=>w.height===2.5));
await page.screenshot({path:'web-chat-room.png'});
await writeFile('web-chat-check.json',JSON.stringify({sceneId:scene.id,errors,text:await page.getByTestId('local-chat').innerText()},null,2));
}finally{await browser.close()}
