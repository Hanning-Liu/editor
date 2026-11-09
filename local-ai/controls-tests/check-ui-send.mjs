import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3002',id='613bfb3b5f9a',api=base+'/api/local-chat?sceneId='+id;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});const page=await browser.newPage({viewport:{width:1512,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let posted;
page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('?sceneId='+id))posted=r.postDataJSON()});
async function check(name,v){await page.getByRole('checkbox',{name,exact:true}).setChecked(v);await page.waitForFunction(()=>!document.querySelector('[aria-label="房间与门窗"]')?.disabled);}
try{
const before=await(await fetch(base+'/api/scenes/'+id)).json();await page.goto(base+'/project/'+id,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Chat',exact:true}).waitFor();for(let i=0;i<3&&!await page.getByTestId('local-chat').isVisible();i++){await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(500)}await page.getByRole('textbox',{name:'给本地 AI 的指令'}).waitFor();await page.waitForTimeout(800);
await page.getByRole('button',{name:'插件',exact:true}).click();await check('房间与门窗',false);await check('家具布局',false);await page.getByRole('button',{name:'关闭设置',exact:true}).click();
await page.getByLabel('选择附件',{exact:true}).setInputFiles({name:'网页端验收.txt',mimeType:'text/plain',buffer:Buffer.from('UI CODE 9271')});await page.getByRole('button',{name:'移除附件 网页端验收.txt',exact:true}).waitFor();
await page.getByRole('textbox',{name:'给本地 AI 的指令'}).fill('只回答文本附件 UI CODE 后的四位编号，不要调用工具，不要修改场景。');await page.getByRole('button',{name:'发送',exact:true}).click();console.log('UI request sent',JSON.stringify(posted));
await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="给本地 AI 的指令"]')?.disabled,null,{timeout:180000});const h=await(await fetch(api)).json();assert.ok(h.messages.at(-1).content.includes('9271'));assert.equal(posted.preferences.effort,'fast');assert.equal(posted.attachments.length,1);assert.ok(!h.context.tools.includes('move_node')&&!h.context.tools.includes('create_room'));assert.ok(h.calls.at(-1).usage.prompt_tokens>0);
const after=await(await fetch(base+'/api/scenes/'+id)).json();assert.equal(before.graphHash,after.graphHash);
await page.getByRole('button',{name:'插件',exact:true}).click();await check('房间与门窗',true);await check('家具布局',true);await page.getByRole('button',{name:'关闭设置',exact:true}).click();
await page.getByRole('button',{name:'上下文详情',exact:true}).click();await page.waitForTimeout(1000);await page.screenshot({path:'controls-tests/final-context.png'});
await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.getByRole('button',{name:'模型和推理强度',exact:true}).click();await page.screenshot({path:'controls-tests/final-model.png'});
await writeFile('controls-tests/ui-send-result.json',JSON.stringify({passed:true,realModelReply:h.messages.at(-1).content,postedPreferences:posted.preferences,attachmentSent:true,actualTools:h.context.tools,latestUsage:h.calls.at(-1).usage,sceneUnchanged:true,errors},null,2));console.log('PASS: browser attachment to real Qwen round trip');
}catch(e){console.log('DEBUG',await page.getByTestId('local-chat').innerText());await page.screenshot({path:'controls-tests/send-error.png'});throw e;}finally{await browser.close()}
