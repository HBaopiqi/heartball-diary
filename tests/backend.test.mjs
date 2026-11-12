import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/index.mjs';
import {emptyData,pendingDataset,validateDataset} from '../server/model.mjs';
import {fetchEndpoint,synchronize} from '../server/sync.mjs';

const tempRoot=path.dirname(fileURLToPath(import.meta.url));
function fixture(t){const root=fs.mkdtempSync(path.join(tempRoot,'backend-temp-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function page(content,number=0,totalPages=1,totalElements=content.length){return {content:[{type:'text',text:JSON.stringify({ok:true,body:{success:true,data:{content,number,totalPages,totalElements,last:number===Math.max(1,totalPages)-1}}})}]};}
function memory(id='m1',start=Date.parse('2026-11-11T23:58:00+08:00')){return {sessionId:id,startTime:start,endTime:start+240000,results:[{title:'服务自动标题',brief:'机器摘要不能冒充独立回顾',sentences:[{startTime:start,text:'我收拾了书桌。',isHost:true,speaker:1},{startTime:start+180000,text:'明天准备背单词。',isHost:false,speaker:2}]}]};}
function note(id='n1'){return {asrId:id,startTime:Date.parse('2026-11-12T00:03:00+08:00'),endTime:Date.parse('2026-11-12T00:03:20+08:00'),asrText:JSON.stringify({text:'准备睡觉。'}),llmText:JSON.stringify({topic:'睡前',smoothed_text:'自动整理'})};}

test('pagination reads all pages and rejects unstable totals and missing page',async()=>{
  const calls=[];const client={callTool:async({arguments:a})=>{calls.push(a.page);return page([memory('m'+a.page)],a.page,2,2);}};
  const result=await fetchEndpoint(client,'recall_memory',100,200);assert.equal(result.rows.length,2);assert.deepEqual(calls,[0,1]);
  await assert.rejects(()=>fetchEndpoint({callTool:async()=>page([],0,2,1)},'recall_memory',100,200),/分页/);
});

test('both endpoints must succeed before archive and sync marker change',async t=>{
  const store=new Store(fixture(t));const id=store.index.activeProfileId;
  const initial=JSON.stringify(store.source(id));
  await assert.rejects(()=>synchronize({store,id,client:{callTool:async({name})=>name==='recall_memory'?page([memory()]):{isError:true}}}),/MCP/);
  assert.equal(JSON.stringify(store.source(id)),initial);assert.equal(store.dataset(id).raw.length,0);
  const result=await synchronize({store,id,client:{callTool:async({name})=>page(name==='recall_memory'?[memory()]:[note()])}});
  assert.equal(result.reviewStatus,'needs-review');assert.equal(store.dataset(id).raw.length,2);assert.equal(store.dataset(id).days.length,2);
  assert.equal(store.dataset(id).days[1].coverage.sentenceCount,1);assert.match(store.dataset(id).days[0].review,/等待/);
  assert.equal(store.read(id,'received.json',{}).memory.length,1);assert.ok(store.source(id).end);
});

test('bounded sync preserves records imported without canonical service JSON',()=>{
  const prior=pendingDataset({end:Date.now(),memory:[memory('old',Date.parse('2025-01-01T12:00:00+08:00'))],note:[]});
  prior.raw[0].reviewDisposition='included';delete prior.raw[0].sourceHash;prior.days[0].synthesis.overview='已整理的历史';
  const next=pendingDataset({end:Date.now(),memory:[memory('new')],note:[]},prior);
  assert.equal(next.raw.length,2);assert.ok(next.days.some(d=>d.date==='2025-01-01'));
  assert.equal(next.days.find(d=>d.date==='2025-01-01').synthesis.overview,'已整理的历史');
});

test('a write failure restores the whole archive transaction',async t=>{
  const store=new Store(fixture(t));const id=store.index.activeProfileId;const source=JSON.stringify(store.source(id));const dataset=JSON.stringify(store.dataset(id));
  const write=store.write.bind(store);store.write=(target,name,value)=>{if(name==='dataset.json')throw new Error('simulated disk failure');write(target,name,value);};
  await assert.rejects(()=>synchronize({store,id,client:{callTool:async({name})=>page(name==='recall_memory'?[memory()]:[note()])}}),/disk failure/);
  assert.equal(JSON.stringify(store.source(id)),source);assert.equal(JSON.stringify(store.dataset(id)),dataset);assert.equal(store.read(id,'received.json',null),null);
});

test('dataset validator rejects broken citations and duplicate IDs',()=>{
  const data=pendingDataset({end:Date.now(),memory:[memory()],note:[]});
  assert.equal(validateDataset(data).raw.length,1);
  const invalid=structuredClone(data);invalid.days[0].synthesis.sections=[{text:'伪来源',sourceIds:['missing']}];
  assert.throws(()=>validateDataset(invalid),/来源/);
  invalid.raw.push(invalid.raw[0]);assert.throws(()=>validateDataset(invalid),/重复/);
});

test('legacy bare references normalize, while missing review status or day coverage is rejected',()=>{
  const data=pendingDataset({end:Date.now(),memory:[memory()],note:[]});
  for(const r of data.raw){r.reviewDisposition='included';delete r.dates;}
  for(const d of data.days){d.synthesis.sourceIds=['m1'];d.synthesis.sections=[{title:'事项',text:'按原话整理的内容',sourceIds:['m1']}];}
  const normalized=validateDataset(data);assert.deepEqual(normalized.raw[0].dates,['2026-11-11','2026-11-12']);assert.deepEqual(normalized.days[1].synthesis.sections[0].sourceIds,['memory-m1']);
  const noStatus=structuredClone(normalized);delete noStatus.raw[0].reviewDisposition;assert.throws(()=>validateDataset(noStatus),/审阅状态/);
  const incomplete=structuredClone(normalized);incomplete.days.pop();assert.throws(()=>validateDataset(incomplete),/遗漏/);
  const noRefs=structuredClone(normalized);noRefs.days[0].synthesis.sourceIds=[];assert.throws(()=>validateDataset(noRefs),/全部来源/);
  const noOverview=structuredClone(normalized);noOverview.days[0].synthesis.overview=' ';assert.throws(()=>validateDataset(noOverview),/不能为空/);
});

test('HTTP profiles isolate data, enforce origin/CSRF, and never serve private files',async t=>{
  const dataDir=fixture(t);const publicDir=path.join(dataDir,'public');fs.mkdirSync(publicDir);fs.writeFileSync(path.join(publicDir,'index.html'),'<h1>test</h1>');
  let callbackProfile;
  const fake=()=>({sessions:new Map(),close:async()=>{},closeAll:async()=>{},connect:async()=>({connected:true}),client:async()=>({callTool:async()=>page([])}),callback:async params=>{if(params.get('state')!=='valid-fixture-state')throw new Error('授权会话无效');return callbackProfile;}});
  const app=await createApp({dataDir,publicDir,port:0,mcpFactory:fake});t.after(()=>app.close());
  const request=(route,options={})=>fetch(app.origin+route,options);
  const session=await (await request('/api/profiles')).json();assert.ok(session.activeProfileId);assert.equal(session.profiles.length,1);
  const headers={'content-type':'application/json','x-csrf-token':session.csrfToken,origin:app.origin};
  assert.equal((await request('/api/profiles',{method:'POST',headers:{'content-type':'application/json'},body:'{"name":"blocked"}'})).status,403);
  assert.equal((await request('/api/profiles',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:'{"name":"blocked"}'})).status,403);
  const hostileHostStatus=await new Promise((resolve,reject)=>{const req=http.get(app.origin+'/api/profiles',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(hostileHostStatus,403);
  const second=await (await request('/api/profiles',{method:'POST',headers,body:JSON.stringify({name:'第二个资料库'})})).json();
  const data=pendingDataset({end:Date.now(),memory:[memory()],note:[]});
  let response=await request('/api/import?profile='+session.activeProfileId,{method:'POST',headers,body:JSON.stringify(data)});assert.equal(response.status,200);
  assert.equal((await (await request('/api/data?profile='+second.activeProfileId)).json()).raw.length,0);
  assert.equal((await (await request('/api/data?profile='+session.activeProfileId)).json()).raw.length,1);
  response=await request('/api/import?profile='+session.activeProfileId,{method:'POST',headers,body:JSON.stringify(emptyData())});assert.equal(response.status,400);
  const modified=structuredClone(data);modified.raw[0].originalSummary='changed';response=await request('/api/import?profile='+session.activeProfileId,{method:'POST',headers,body:JSON.stringify(modified)});assert.equal(response.status,400);
  callbackProfile=session.activeProfileId;
  response=await request('/api/mcp/callback?state=valid-fixture-state&code=fixture',{headers:{'sec-fetch-site':'cross-site'},redirect:'manual'});assert.equal(response.status,303);assert.match(response.headers.get('location'),new RegExp(session.activeProfileId));
  assert.equal((await (await request('/api/profiles')).json()).activeProfileId,session.activeProfileId);
  response=await request('/api/mcp/callback?state=wrong&code=fixture',{headers:{'sec-fetch-site':'cross-site'},redirect:'manual'});assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/?connectionError=1');
  assert.equal((await request('/api/data',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await request('/api/data?profile=../profiles.json')).status,400);
  assert.equal((await request('/../profiles.json')).status,404);
  assert.equal((await request('/data.js')).status,200);assert.match(await (await request('/data.js')).text(),/"raw":\[\]/);
  const packet=await (await request('/api/review-packet?profile='+session.activeProfileId)).json();assert.equal(packet.format,'heartball-review-packet-v1');assert.equal(packet.dataset.raw.length,1);
  const settings=await (await request('/api/settings?profile='+session.activeProfileId)).json();assert.equal(settings.ai.supported,false);assert.equal('tokens'in settings,false);
});
