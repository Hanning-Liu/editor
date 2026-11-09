import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const api='http://127.0.0.1:3002/api/local-chat?sceneId=613bfb3b5f9a';
const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'只回答之前那张图片中的四位验证码，以及之前说明.txt中的 TEXT CODE 四位编号。不要调用工具，不要修改场景。',preferences:{modelId:'qwen38',effort:'fast',plugins:['inspect']}})});assert.equal(r.status,200);
const events=(await r.text()).trim().split('\n').map(x=>JSON.parse(x));const reply=events.findLast(e=>e.type==='reply'),c=events.find(e=>e.type==='context');assert.ok(reply?.text.includes('4827')&&reply?.text.includes('5193'));assert.equal(c.context.attachments.length,3);
await fetch(api+'&action=preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId:'qwen38',effort:'fast',plugins:['rooms','furniture','inspect']})});
await writeFile('controls-tests/history-result.json',JSON.stringify({passed:true,reply:reply.text,historyAttachmentCount:c.context.attachments.length,attachments:c.context.attachments,preferencesRestored:true},null,2));console.log('PASS: previous image and text replay, complete context attachment list');
