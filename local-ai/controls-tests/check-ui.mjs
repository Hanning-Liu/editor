import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3002',id='613bfb3b5f9a',api=base+'/api/local-chat?sceneId='+id;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1512,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function openChat(){await page.getByRole('button',{name:'Chat',exact:true}).waitFor();for(let i=0;i<3&&!await page.getByTestId('local-chat').isVisible();i++){await page.getByRole('button',{name:'Chat',exact:true}).click();await page.waitForTimeout(500)}await page.getByRole('textbox',{name:'给本地 AI 的指令'}).waitFor();await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="给本地 AI 的指令"]')?.disabled);}
async function pref(){await page.waitForTimeout(200);return (await(await fetch(api)).json()).preferences;}
async function setPlugin(name,value){const c=page.getByRole('checkbox',{name,exact:true});await c.setChecked(value);await page.waitForFunction(()=>!document.querySelector('[aria-label="房间与门窗"]')?.disabled);}
try{
await page.goto(base+'/project/'+id,{waitUntil:'domcontentloaded'});await openChat();await page.waitForTimeout(1500);
await page.getByRole('button',{name:'插件',exact:true}).click();assert.ok(await page.getByRole('checkbox',{name:'场景检查',exact:true}).isDisabled());
await setPlugin('房间与门窗',true);await setPlugin('家具布局',true);assert.deepEqual(new Set((await pref()).plugins),new Set(['rooms','furniture','inspect']));await page.screenshot({path:'controls-tests/plugins.png'});
await page.getByRole('button',{name:'模型和推理强度',exact:true}).click();const select=page.getByRole('combobox',{name:'对话模型',exact:true});assert.equal(await select.inputValue(),'qwen38');assert.equal(await select.locator('option').count(),1);
await page.getByRole('button',{name:'推理强度：深入',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="对话模型"]')?.disabled);assert.equal((await pref()).effort,'deep');await page.screenshot({path:'controls-tests/model.png'});
await page.getByRole('button',{name:'推理强度：快速',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="对话模型"]')?.disabled);assert.equal((await pref()).effort,'fast');
await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.getByLabel('选择附件',{exact:true}).setInputFiles({name:'网页附件测试.txt',mimeType:'text/plain',buffer:Buffer.from('UI ATTACHMENT TEST 9271')});await page.getByRole('button',{name:'移除附件 网页附件测试.txt',exact:true}).waitFor();await page.screenshot({path:'controls-tests/attachment.png'});await page.getByRole('button',{name:'移除附件 网页附件测试.txt',exact:true}).click();
await page.getByRole('button',{name:'上下文详情',exact:true}).click();await page.getByTestId('chat-context').getByText('当前场景',{exact:false}).waitFor();const ctx=await page.getByTestId('chat-context').innerText();assert.ok(ctx.includes('3,193')&&ctx.includes('262,144'));assert.ok(ctx.includes('未报告'));await page.screenshot({path:'controls-tests/context.png'});
await page.reload({waitUntil:'domcontentloaded'});await openChat();assert.equal((await pref()).effort,'fast');await page.getByRole('button',{name:'插件',exact:true}).click();assert.ok(await page.getByRole('checkbox',{name:'家具布局',exact:true}).isChecked());await page.getByRole('button',{name:'关闭设置',exact:true}).click();
await page.getByTestId('local-chat').evaluate(el=>{el.children[1].scrollTop=el.children[1].scrollHeight});await page.screenshot({path:'controls-tests/toolbar.png'});
assert.equal(errors.length,0);await writeFile('controls-tests/ui-result.json',JSON.stringify({passed:true,pluginsPersisted:true,reasoningPersisted:true,modelSelector:true,attachmentPickerAndRemoval:true,realContextUsage:true,refreshRestored:true,errors},null,2));console.log('PASS: browser controls and persistence');
}catch(e){console.log('DEBUG',await page.locator('body').innerText());await page.screenshot({path:'controls-tests/ui-error.png'});throw e;}finally{await browser.close()}
