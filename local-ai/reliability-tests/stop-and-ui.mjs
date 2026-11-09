import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';import{writeFile}from'node:fs/promises';
const base='http://127.0.0.1:3002',id='7282523591b5',api=base+'/api/local-chat?sceneId='+id;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});const page=await browser.newPage({viewport:{width:1512,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function open(id){await page.goto(base+'/project/'+id,{waitUntil:'domcontentloaded'});const button=page.getByRole('button',{name:'Chat',exact:true});await button.waitFor();for(let i=0;i<4&&!await page.getByTestId('local-chat').isVisible();i++){await button.click();await page.waitForTimeout(500)}await page.getByRole('textbox',{name:'给本地 AI 的指令'}).waitFor();await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="给本地 AI 的指令"]')?.disabled);}
try{
const previous=await(await fetch(api)).json();const before=await(await fetch(base+'/api/scenes/'+id)).json();await open(id);await page.getByRole('textbox',{name:'给本地 AI 的指令'}).fill('仅检查当前场景，不要修改。');await page.getByRole('button',{name:'发送',exact:true}).click();let accepted;for(let i=0;i<50;i++){accepted=await(await fetch(api)).json();if(accepted.running&&accepted.run?.id!==previous.run?.id)break;await delay(100)}assert.ok(accepted.running);const expectedRun=accepted.run.id;await page.getByRole('button',{name:'停止',exact:true}).click();
let h;for(let i=0;i<100;i++){h=await(await fetch(api)).json();if(h.run?.id===expectedRun&&!h.running&&h.run.status==='cancelled')break;await delay(100)}assert.equal(h.run.status,'cancelled');assert.equal(h.run.reason,'user_cancelled');assert.equal(h.messages.at(-1).actor,'system');const after=await(await fetch(base+'/api/scenes/'+id)).json();assert.equal(before.graphHash,after.graphHash);
await open('613bfb3b5f9a');await page.waitForFunction(()=>document.querySelector('canvas')?.width>0,null,{timeout:45000});await page.waitForTimeout(5000);
console.log((await page.locator('body').innerText()).slice(-2300));
await page.getByTestId('local-chat').evaluate(e=>e.children[1].scrollTop=e.children[1].scrollHeight);await page.screenshot({path:'reliability-tests/roof-ui.png'});
await writeFile('reliability-tests/stop-result.json',JSON.stringify({passed:true,explicitUserCancel:true,stopActor:'system',sceneUnchanged:true,errors},null,2));console.log('PASS explicit stop and UI');
}catch(e){console.log('DEBUG',await page.locator('body').innerText());await page.screenshot({path:'reliability-tests/ui-error.png'});throw e}finally{await browser.close()}
