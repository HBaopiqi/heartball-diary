import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Store,atomicWrite} from './store.mjs';
import {emptyData,validateDataset,reviewPacket,rawDates} from './model.mjs';
import {McpConnections,validateEndpoint} from './mcp.mjs';
import {synchronize} from './sync.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.ico':'image/x-icon'};
const busyStates=new Set(['connecting','syncing']);
function errorMessage(error){
  // Never echo transport responses, URLs, tokens or raw records into the browser/log.
  const known=['资料库','文字','来源','每日','摘要','回顾','主题','导入','同步','查询','分页','心力球','MCP 地址','MCP 未','需要','该 MCP','授权','单次','已','请求','状态','服务器','文件'];
  const message=String(error?.message||'');
  return known.some(p=>message.startsWith(p))&&message.length<180&&!/https?:\/\//i.test(message)?message:'连接或操作未完成，请检查网络、服务地址和授权后重试。';
}
function send(res,status,value){const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);}
function constantEqual(a,b){const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&timingSafeEqual(aa,bb);}
async function jsonBody(req){
  if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw new Error('请求须使用 application/json');
  let length=0;const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>64*1024*1024)throw new Error('导入资料超过64MB，请分资料库处理');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('请求 JSON 无效');}
}
export async function createApp({dataDir=process.env.HEARTBALL_DATA_DIR||path.join(root,'data'),publicDir=path.join(root,'public'),host='127.0.0.1',port=Number(process.env.PORT||3210),mcpFactory}={}){
  if(!['127.0.0.1','::1'].includes(host))throw new Error('服务器只允许绑定本机回环地址');
  const store=new Store(dataDir);const csrfToken=randomBytes(32).toString('hex');const jobs=new Map();let origin,mcp;
  function profileId(url){return store.profile(url.searchParams.get('profile')||store.index.activeProfileId).id;}
  function status(id){
    const data=store.dataset(id);const saved=store.read(id,'status.json',{});const job=jobs.get(id);
    const times=data.raw.flatMap(r=>[r.start,r.end]).filter(x=>Number.isFinite(Date.parse(x))).sort((a,b)=>Date.parse(a)-Date.parse(b));
    const pending=data.raw.some(r=>r.reviewDisposition==='pending');
    const reviewStatus=pending?'needs-review':data.raw.length?'complete':'empty';
    return {queryEnd:saved.queryEnd||data.syncedAt||null,rawCoverageStart:times[0]||null,rawCoverageEnd:times.at(-1)||null,memoryCount:data.raw.filter(r=>r.source==='memory').length,noteCount:data.raw.filter(r=>r.source==='note').length,rawCount:data.raw.length,reviewedSourceCount:data.raw.filter(r=>r.reviewDisposition!=='pending').length,dayCount:data.days.length,reviewStatus,syncState:job?.syncState||saved.syncState||'idle',error:job?.error||saved.error||null,connected:mcp?.sessions?.has(id)||false,progress:job?.progress||null,lastResult:saved.counts||null};
  }
  function profiles(){return {profiles:store.index.profiles.map(p=>({...p,hasData:store.dataset(p.id).raw.length>0,mcpConfigured:Boolean(store.settings(p.id).mcp?.endpoint),active:p.id===store.index.activeProfileId})),activeProfileId:store.index.activeProfileId,csrfToken};}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('cross-origin-resource-policy','same-origin');res.setHeader('x-frame-options','DENY');
    try{
      const url=new URL(req.url,origin);const route=url.pathname;const oauthCallback=route==='/api/mcp/callback'&&req.method==='GET';
      const expected=new URL(origin);const allowedHosts=new Set([expected.host,`localhost:${expected.port}`]);
      if(!allowedHosts.has(req.headers.host)||(req.headers['sec-fetch-site']==='cross-site'&&!oauthCallback))return send(res,403,{error:'请求来源不被允许'});
      const requestOrigin=req.headers.origin;
      if(requestOrigin&&!oauthCallback&&requestOrigin!==origin&&requestOrigin!==`http://localhost:${expected.port}`)return send(res,403,{error:'请求来源不被允许'});
      const isMutation=!['GET','HEAD'].includes(req.method);
      if(isMutation&&!constantEqual(req.headers['x-csrf-token'],csrfToken))return send(res,403,{error:'请求校验已失效，请刷新页面'});
      if(route==='/api/health')return send(res,200,{ok:true,mode:'local',version:'0.1.0'});
      if(route==='/api/profiles/session'||route==='/api/session')return send(res,200,{csrfToken,activeProfileId:store.index.activeProfileId});
      if(route==='/api/profiles'&&req.method==='GET')return send(res,200,profiles());
      if(route==='/api/profiles'&&req.method==='POST'){const p=store.create((await jsonBody(req)).name);return send(res,201,{profile:p,...profiles()});}
      if(route==='/api/profiles/active'&&req.method==='POST'){store.activate((await jsonBody(req)).id);return send(res,200,profiles());}
      if(route==='/api/mcp/callback'&&req.method==='GET'){
        try{const id=await mcp.callback(url.searchParams);store.activate(id);store.write(id,'status.json',{...store.read(id,'status.json',{}),syncState:'idle',error:null});res.writeHead(303,{location:'/?profile='+encodeURIComponent(id)+'&connected=1'});res.end();}
        catch(error){res.writeHead(303,{location:'/?connectionError=1'});res.end();}return;
      }
      if(route.startsWith('/api/')){
        const id=profileId(url);
        if(route==='/api/data'&&req.method==='GET')return send(res,200,store.dataset(id));
        if(route==='/api/status'&&req.method==='GET')return send(res,200,status(id));
        if(route==='/api/settings'&&req.method==='GET')return send(res,200,{mcp:{endpoint:store.settings(id).mcp.endpoint},ai:{supported:false},reviewMode:'skill-import'});
        if(route==='/api/settings'&&req.method==='PUT'){
          if(busyStates.has(jobs.get(id)?.syncState))return send(res,409,{error:'同步进行中，请完成后修改设置'});
          const body=await jsonBody(req);const endpoint=validateEndpoint(body.mcp?.endpoint||body.endpoint);
          const old=store.settings(id);
          if(endpoint!==old.mcp.endpoint){await mcp.close(id);store.write(id,'oauth.json',{});}
          store.write(id,'settings.json',{mcp:{endpoint}});return send(res,200,{mcp:{endpoint},reviewMode:'skill-import'});
        }
        if(route==='/api/mcp/connect'&&req.method==='POST'){
          await jsonBody(req);if(busyStates.has(jobs.get(id)?.syncState))return send(res,409,{error:'连接或同步正在进行'});
          jobs.set(id,{syncState:'connecting'});
          try{const result=await mcp.connect(id);jobs.set(id,{syncState:'idle'});return send(res,200,result);}
          catch(error){jobs.set(id,{syncState:'error',error:errorMessage(error)});throw error;}
        }
        if(route==='/api/mcp/disconnect'&&req.method==='POST'){await jsonBody(req);await mcp.close(id);store.write(id,'oauth.json',{});jobs.set(id,{syncState:'idle'});return send(res,200,{connected:false});}
        if(route==='/api/sync'&&req.method==='POST'){
          const options=await jsonBody(req);if(busyStates.has(jobs.get(id)?.syncState))return send(res,409,{error:'同步正在进行'});
          jobs.set(id,{syncState:'syncing'});
          (async()=>{
            try{const client=await mcp.client(id);const result=await synchronize({store,id,client,options,onStatus:progress=>jobs.set(id,{syncState:'syncing',progress})});
              const {snapshot,...publicResult}=result;store.write(id,'status.json',{...publicResult,error:null});jobs.set(id,{syncState:result.syncState});
            }catch(error){const message=errorMessage(error);jobs.set(id,{syncState:'error',error:message});store.write(id,'status.json',{...store.read(id,'status.json',{}),syncState:'error',error:message});}
          })();
          return send(res,202,{started:true,profileId:id});
        }
        if(route==='/api/import'&&req.method==='POST'){
          if(busyStates.has(jobs.get(id)?.syncState))return send(res,409,{error:'同步进行中，请稍后导入'});
          const body=await jsonBody(req);const data=validateDataset(body.dataset||body);const current=store.dataset(id);const next=new Map(data.raw.map(r=>[r.id,r]));
          for(const r of current.raw){const updated=next.get(r.id);if(!updated)throw new Error('导入资料缺少已归档来源，请导入完整资料');for(const key of ['source','sourceId','originalId','date','start','end','rawText','originalSummary','originalTitle'])if((updated[key]??'')!==(r[key]??''))throw new Error('导入资料改变了来源原始字段，请重新获取原文包');if(JSON.stringify(rawDates(updated))!==JSON.stringify(rawDates(r)))throw new Error('导入资料改变了来源日期，请重新获取原文包');if(r.sourceHash&&updated.sourceHash!==r.sourceHash)throw new Error('导入资料的来源版本已过期，请重新整理');}
          const complete=!data.raw.some(r=>r.reviewDisposition==='pending');
          store.commit(id,{'dataset.json':data,'status.json':{...store.read(id,'status.json',{}),queryEnd:data.syncedAt,syncState:complete?'ready':'needs-review',error:null}},'before-import');jobs.delete(id);
          return send(res,200,{imported:true,rawCount:data.raw.length,dayCount:data.days.length,reviewStatus:complete?'complete':'needs-review'});
        }
        if(route==='/api/review-packet'&&req.method==='GET'){
          res.setHeader('content-disposition',`attachment; filename="heartball-review-${id}.json"`);return send(res,200,reviewPacket(store.source(id),store.dataset(id)));
        }
        return send(res,404,{error:'接口不存在'});
      }
      if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'请求方法不支持'});
      if(route==='/data.js'){res.writeHead(200,{'content-type':mime['.js'],'cache-control':'no-store'});return res.end('window.HEARTBALL_DATA = '+JSON.stringify(emptyData())+';');}
      if(route==='/data.json')return send(res,200,emptyData());
      let requested;try{requested=decodeURIComponent(route);}catch{return send(res,400,{error:'文件路径无效'});}
      const relative=requested==='/'?'index.html':requested.replace(/^\//,'');const target=path.resolve(publicDir,relative);
      if(!target.startsWith(path.resolve(publicDir)+path.sep)||relative.split(/[\\/]/).some(x=>x.startsWith('.'))||!mime[path.extname(target)]||!fs.existsSync(target)||!fs.statSync(target).isFile())return send(res,404,{error:'文件不存在'});
      res.writeHead(200,{'content-type':mime[path.extname(target)],'cache-control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(target).pipe(res);
    }catch(error){send(res,400,{error:errorMessage(error)});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  const actualPort=server.address().port;origin=`http://${host==='::1'?'[::1]':host}:${actualPort}`;mcp=mcpFactory?mcpFactory(store,origin):new McpConnections(store,origin);
  return {server,store,origin,csrfToken,async close(){await mcp.closeAll?.();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp();console.log('心力日记已启动：'+app.origin);console.log('资料保存在本机；关闭此终端可停止服务。');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
