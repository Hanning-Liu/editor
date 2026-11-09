import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {writeFile} from 'node:fs/promises';
const id='7282523591b5',base='http://127.0.0.1:3002';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});const page=await browser.newPage({viewport:{width:1280,height:900}});
try{
const before=await(await fetch(base+'/api/scenes/'+id)).json();
await page.goto(base+'/project/'+id,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Chat',exact:true}).waitFor(); await page.waitForTimeout(700); for(let i=0;i<3 && !await page.getByTestId('local-chat').isVisible();i++){await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(500);}
await page.getByRole('textbox',{name:'给本地 AI 的指令'}).fill('只读取当前房间并介绍，不要修改。');await page.getByRole('button',{name:'发送',exact:true}).click();
console.log('sent read'); await page.getByRole('button',{name:'停止',exact:true}).click();console.log('clicked stop');
await page.waitForFunction(()=>document.querySelector('[data-testid="local-chat"]')?.textContent?.includes('已停止。已执行的场景修改仍保留。'),null,{timeout:15000});
console.log('stop visible'); const after=await(await fetch(base+'/api/scenes/'+id)).json();assert.equal(before.graphHash,after.graphHash);
await page.goto(base+'/project/613bfb3b5f9a',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Chat',exact:true}).waitFor(); await page.waitForTimeout(700); for(let i=0;i<3 && !await page.getByTestId('local-chat').isVisible();i++){await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(500);}await page.waitForFunction(()=>document.querySelector('[data-testid="local-chat"]')?.textContent?.includes('把刚放置的这张沙发沿X正方向移动0.5米'),null,{timeout:15000});
assert.equal((await page.getByTestId('local-chat').innerText()).includes('只读取当前房间并介绍，不要修改。'),false);
await page.screenshot({path:'web-chat-final.png'}); await page.getByRole('tab',{name:'2D',exact:true}).click(); await page.waitForTimeout(1500); await page.screenshot({path:'web-chat-2d.png'});await writeFile('web-stop-check.json',JSON.stringify({passed:true,stop:true,unchangedGraph:true,sceneSwitchIsolation:true},null,2));
}catch(e){console.log('DEBUG',await page.locator('body').innerText());await page.screenshot({path:'web-stop-debug.png'});throw e;}finally{await browser.close()}
