import fs from 'node:fs';

const args=process.argv.slice(2);
function option(name){const at=args.indexOf(name);return at<0?null:args[at+1];}
const filename=option('--file'),profile=option('--profile'),address=option('--url');
if(!filename||!profile||!address){
  console.error('Usage: node scripts/import-reviewed.mjs --file reviewed.json --profile PROFILE_ID --url http://127.0.0.1:PORT');
  process.exit(1);
}
try{
  const base=new URL(address);
  if(!['http:','https:'].includes(base.protocol)||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password)throw new Error('只接受本机心力日记服务地址。');
  const dataset=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  if(dataset.schemaVersion!==2||!Array.isArray(dataset.days)||!Array.isArray(dataset.raw))throw new Error('请提供 schemaVersion=2 的完整已整理资料。');
  const rawIds=new Set(dataset.raw.map(row=>row.id));
  if(rawIds.size!==dataset.raw.length)throw new Error('原始记录 ID 重复。');
  for(const day of dataset.days){
    const s=day.synthesis;
    if(!s||typeof s.overview!=='string'||!Array.isArray(s.sourceIds))throw new Error('缺少每日独立回顾：'+day.date);
    for(const id of s.sourceIds)if(!rawIds.has(id))throw new Error('回顾引用了不存在的来源：'+day.date);
    for(const point of [...(s.sections||[]),...(s.progress||[]),...(s.nextActions||[])]){
      if(!point.text||!Array.isArray(point.sourceIds)||!point.sourceIds.length||point.sourceIds.some(id=>!s.sourceIds.includes(id)))throw new Error('回顾要点来源不完整：'+day.date);
    }
  }
  const headers={'Accept':'application/json'};
  const sessionResponse=await fetch(new URL('/api/session',base),{headers,signal:AbortSignal.timeout(10000)});
  if(!sessionResponse.ok)throw new Error('无法取得本地服务会话，请确认服务正在运行。');
  const session=await sessionResponse.json();
  if(!session.csrfToken)throw new Error('本地服务未返回请求校验信息。');
  const response=await fetch(new URL('/api/import?profile='+encodeURIComponent(profile),base),{method:'POST',headers:{...headers,'Content-Type':'application/json','Origin':base.origin,'X-CSRF-Token':session.csrfToken},body:JSON.stringify(dataset),signal:AbortSignal.timeout(30000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:result.error?.message||'导入失败（'+response.status+'）。');
  console.log(JSON.stringify({imported:true,profile,days:dataset.days.length,raw:dataset.raw.length}));
}catch(error){console.error(error.message);process.exitCode=1;}
