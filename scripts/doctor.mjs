import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function nodeSupported(version=process.versions.node){return Number(version.split('.')[0])>=22;}
export function inspectNpm(root=projectRoot){
  const command=process.platform==='win32'?process.env.ComSpec||'cmd.exe':'npm';
  const args=process.platform==='win32'?['/d','/s','/c','npm.cmd --version']:['--version'];
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
  const version=String(result.stdout||'').trim();return {ready:result.status===0&&/^\d+\./.test(version),version:result.status===0?version:null};
}
export function selectedPort(value=process.env.PORT||'3210'){
  if(!/^\d+$/.test(String(value))||Number(value)<1||Number(value)>65535)throw new Error('PORT 应为 1 到 65535 的整数，例如 3210。');
  return Number(value);
}
export async function inspectDependencies(root=projectRoot){
  try{
    const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
    const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    for(const [name,wanted]of Object.entries(pkg.dependencies||{})){
      if(lock.packages?.['']?.dependencies?.[name]!==wanted)return {ready:false,reason:'package.json 与锁文件不一致，请重新下载完整版本。',lockMismatch:true};
    }
    for(const [relative,info]of Object.entries(lock.packages||{})){
      if(!relative||info.optional||info.link||!info.version)continue;
      const target=path.resolve(root,relative);
      if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('锁文件路径无效');
      const installed=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8'));
      if(installed.version!==info.version)return {ready:false,reason:'依赖版本与锁文件不同，需要重新安装。'};
    }
    const require=createRequire(path.join(root,'package.json'));
    await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')).href);
    return {ready:true,reason:'项目依赖完整，可启动。'};
  }catch{return {ready:false,reason:'缺少依赖或依赖无法加载，请运行 npm run setup。'};}
}
export async function inspectPort(port){
  const free=await new Promise((resolve,reject)=>{
    const probe=net.createServer();probe.once('error',e=>e.code==='EADDRINUSE'?resolve(false):reject(e));
    probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));
  });
  if(free)return {state:'available',message:'端口空闲，可以启动。'};
  try{
    const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(2000),redirect:'error'});
    const value=await response.json();
    if(response.ok&&value.ok===true&&value.mode==='local'&&typeof value.version==='string')return {state:'service',message:'已有兼容的心力日记服务响应，请确认它属于你要使用的项目目录。'};
  }catch{}
  return {state:'occupied',message:'端口被其他程序占用；请换一个 PORT，不要结束不认识的进程。'};
}
export async function diagnose({root=projectRoot,port=selectedPort()}={}){
  const dependencies=await inspectDependencies(root);
  const npm=inspectNpm(root);
  let endpoint;try{endpoint=await inspectPort(port);}catch{endpoint={state:'unavailable',message:'无法检查本机端口，请检查本机权限或使用其他 PORT。'};}
  const node={version:process.versions.node,supported:nodeSupported()};
  return {ok:node.supported&&npm.ready&&dependencies.ready&&['available','service'].includes(endpoint.state),node,npm,dependencies,port,endpoint,url:`http://127.0.0.1:${port}`,dataDirectory:path.resolve(process.env.HEARTBALL_DATA_DIR||path.join(root,'data'))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=await diagnose();
    if(process.argv.includes('--json'))console.log(JSON.stringify(result));
    else{
      console.log(`Node.js ${result.node.version}：${result.node.supported?'符合要求':'请安装 Node.js 22 或更新 LTS 版本'}`);
      console.log(result.npm.ready?'npm '+result.npm.version+'：可用。':'npm 不可用，请安装完整的 Node.js LTS 并重新打开终端。');
      console.log(result.dependencies.reason);console.log(`端口 ${result.port}：${result.endpoint.message}`);
      console.log('本地地址：'+result.url);console.log('数据目录：'+result.dataDirectory);
      console.log('此检查不读取心力球记录，也不代表账号已授权。');
    }
    if(!result.ok)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
