import {bj,hash,pendingDataset,sourceRows} from './model.mjs';

export function unwrapPage(result) {
  if(result?.isError)throw new Error('MCP 工具报告错误，请检查心力球授权状态');
  let value=result?.structuredContent;
  if(!value) {
    const blocks=(result?.content||[]).filter(x=>x.type==='text');
    for(const block of blocks) {try {value=JSON.parse(block.text);break;}catch{}}
  }
  value ??= result;
  if(value?.ok===false||value?.body?.success===false||value?.success===false)throw new Error('心力球接口返回失败，本次查询未提交');
  const page=value?.body?.data ?? value?.data ?? value;
  if(!page || !Array.isArray(page.content) || !Number.isInteger(page.number) || !Number.isInteger(page.totalPages) || !Number.isInteger(page.totalElements) || typeof page.last!=='boolean')throw new Error('心力球分页响应格式不符合预期');
  return page;
}
export async function fetchEndpoint(client,name,start,end,onPage=()=>{}) {
  const pages=[],rows=[];
  let expectedPages=null,total=null;
  for(let page=0;page<1000;page++) {
    const args={end_time:end,page,size:100};if(start!==null)args.start_time=start;
    const result=await client.callTool({name,arguments:args},undefined,{timeout:60000});
    const data=unwrapPage(result);
    if(data.number!==page||data.totalPages<0||data.totalElements<0)throw new Error('分页顺序或计数异常');
    if(expectedPages===null) {expectedPages=Math.max(1,data.totalPages);total=data.totalElements;}
    if(expectedPages!==Math.max(1,data.totalPages)||total!==data.totalElements||data.last!==(page===expectedPages-1))throw new Error('查询期间分页发生变化，请重新同步');
    pages.push(result);rows.push(...data.content);onPage({endpoint:name,page:page+1,pages:expectedPages});
    if(data.last)break;
  }
  if(pages.length!==expectedPages||rows.length!==total)throw new Error('分页未完整返回，本次查询未提交');
  const key=name==='recall_memory'?'sessionId':'asrId';
  if(rows.some(r=>!r||typeof r[key]!=='string')||new Set(rows.map(r=>r[key])).size!==rows.length)throw new Error('来源 ID 缺失或重复');
  return {pages,rows};
}
export function queryRange(previous,end=Date.now(),options={}) {
  const todayStart=Date.parse(bj(end).slice(0,10)+'T00:00:00+08:00');
  let start=previous?.end ? Math.min(previous.end-21600000,todayStart-2*86400000) : todayStart-6*86400000;
  if(options.start!==undefined) {start=typeof options.start==='number'?options.start:Date.parse(options.start);if(!Number.isFinite(start)||start>end)throw new Error('查询开始时间无效');}
  if(end-start>3660*86400000)throw new Error('单次查询范围不能超过十年');
  return {start,end};
}
export async function synchronize({store,id,client,options={},onStatus=()=>{}}) {
  const old=store.source(id);const range=queryRange(old,Date.now(),options);
  const memory=await fetchEndpoint(client,'recall_memory',range.start,range.end,onStatus);
  const note=await fetchEndpoint(client,'recall_note',range.start,range.end,onStatus);
  const source={end:range.end,memory:[],note:[]};const counts={};
  for(const [kind,key,incoming] of [['memory','sessionId',memory],['note','asrId',note]]) {
    const merged=new Map(old[kind].map(row=>[row[key],row]));let added=0,revised=0;
    for(const row of incoming.rows) {if(!merged.has(row[key]))added++;else if(hash(merged.get(row[key]))!==hash(row))revised++;merged.set(row[key],row);}
    source[kind]=[...merged.values()].sort((a,b)=>a.startTime-b.startTime);
    counts[kind]={fetched:incoming.rows.length,added,revised,total:source[kind].length};
  }
  sourceRows(source); // Validate IDs, timestamps and transcript shapes before committing either endpoint.
  const dataset=pendingDataset(source,store.dataset(id));
  const received={start:range.start,end:range.end,previous:old.end,memory:memory.pages,note:note.pages};
  // Keep complete, unmodified MCP responses next to the recoverable pre-sync snapshot.
  const needsReview=dataset.raw.some(r=>r.reviewDisposition==='pending');
  const status={queryEnd:bj(range.end),reviewStatus:needsReview?'needs-review':dataset.raw.length?'complete':'empty',syncState:needsReview?'needs-review':'ready',counts,error:null};
  const snapshot=store.commit(id,{'received.json':received,'source.json':source,'dataset.json':dataset,'status.json':status},'before-sync');
  return {...status,snapshot};
}
