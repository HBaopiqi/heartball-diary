import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectRoot,nodeSupported,inspectDependencies,selectedPort,inspectPort} from './doctor.mjs';

export function installDependencies(root){
  const args=['ci','--no-audit','--no-fund','--fetch-timeout=30000','--fetch-retries=1'];
  return process.platform==='win32'
    ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd '+args.join(' ')],{cwd:root,stdio:'inherit',windowsHide:true,timeout:300000})
    :spawnSync('npm',args,{cwd:root,stdio:'inherit',timeout:300000});
}
export async function setup({root=projectRoot,inspect=inspectDependencies,install=installDependencies,version=process.versions.node,log=console.log}={}){
  if(!nodeSupported(version))throw new Error('请先安装 Node.js 22 或更新的 LTS 版本：https://nodejs.org/en/download');
  const before=await inspect(root);
  if(before.lockMismatch)throw new Error(before.reason);
  if(before.ready){log('项目依赖已经可用，跳过重复安装。');return {ready:true,installed:false};}
  log('正在按锁文件安装依赖，请保留此窗口。首次安装需要联网。');
  const result=install(root);
  if(result.error||result.status!==0)throw new Error('依赖安装未完成。请检查上方 npm 报错、Node/npm、网络和目录权限，再运行 npm run setup。');
  const after=await inspect(root);if(!after.ready)throw new Error(after.reason);
  log('依赖安装完成。');return {ready:true,installed:true};
}
export async function launch({root=projectRoot,port=selectedPort(),inspect=inspectPort,run=(file,args,options)=>spawnSync(file,args,options),log=console.log}={}){
  const state=await inspect(port);
  if(state.state==='service'){log(`已有服务在 http://127.0.0.1:${port} 响应，请核对资料库；本次没有另启服务。`);return {reused:true};}
  if(state.state!=='available')throw new Error(state.message);
  log('启动后请打开终端显示的网址；保持窗口运行，按 Ctrl+C 停止。');
  const result=run(process.execPath,[path.join(root,'server/index.mjs')],{cwd:root,stdio:'inherit',timeout:0,windowsHide:true,env:{...process.env,PORT:String(port)}});
  if(result.error||result.status!==0&&result.status!==130&&result.signal!=='SIGINT')throw new Error('本地服务已退出，请检查上方错误或运行 npm run doctor。');
  return {reused:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.slice(2).some(a=>a!=='--start'))throw new Error('用法：node scripts/setup.mjs [--start]');await setup();if(process.argv.includes('--start'))await launch();else console.log('下一步：npm start；环境排查：npm run doctor。');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
