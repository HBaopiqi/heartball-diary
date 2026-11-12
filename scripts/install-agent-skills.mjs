import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['heartball-setup','heartball-sync'];
const directories={codex:'.agents',cursor:'.agents',claude:'.claude',trae:'.trae',qoder:'.qoder'};
const normalized=value=>process.platform==='win32'?value.toLowerCase():value;
function inside(root,file){const relative=path.relative(root,file);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('安装路径超出当前项目，已停止。');}
function inspect(root,file){
  inside(root,file);let current=root;let info=fs.lstatSync(root);
  if(info.isSymbolicLink()||!info.isDirectory()||normalized(fs.realpathSync(root))!==normalized(root))throw new Error('请从真实项目目录运行，不通过符号链接或目录联接安装。');
  const parts=path.relative(root,file).split(path.sep).filter(Boolean);
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);
    try{info=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    if(info.isSymbolicLink()||normalized(fs.realpathSync(current))!==normalized(current))throw new Error('目标或来源含符号链接，已停止：'+path.relative(root,current));
    if(i<parts.length-1&&!info.isDirectory())throw new Error('目录位置已被文件占用：'+path.relative(root,current));
  }
  return info;
}
function readTree(root,dir){
  if(!inspect(root,dir)?.isDirectory())throw new Error('找不到完整技能目录：'+path.relative(root,dir));
  const result=[];
  const walk=folder=>{for(const name of fs.readdirSync(folder).sort()){
    const file=path.join(folder,name),info=inspect(root,file),relative=path.relative(dir,file);
    if(info.isDirectory()){result.push({relative,type:'directory'});walk(file);}
    else if(info.isFile())result.push({relative,type:'file',contents:fs.readFileSync(file)});
    else throw new Error('技能中有不支持的文件类型。');
  }};
  walk(dir);if(!result.some(e=>e.relative==='SKILL.md'&&e.type==='file'))throw new Error('技能缺少 SKILL.md。');return result;
}
const identical=(a,b)=>a.length===b.length&&a.every((e,i)=>e.relative===b[i].relative&&e.type===b[i].type&&(e.type==='directory'||e.contents.equals(b[i].contents)));
function existing(root,dir,entries){
  if(!inspect(root,dir))return false;
  if(!identical(entries,readTree(root,dir)))throw new Error('目标技能已有不同内容，未覆盖：'+path.relative(root,dir)+'。请先备份并处理差异。');
  return true;
}
export function planAgentSkills({root=defaultRoot,agent}={}){
  if(!Object.hasOwn(directories,agent))throw new Error('不支持的 Agent；可选 codex、cursor、claude、trae、qoder。');
  root=path.resolve(root);
  const skills=names.map(name=>{
    const entries=readTree(root,path.join(root,'.agents','skills',name)),destination=path.join(root,directories[agent],'skills',name);
    return {name,entries,destination,existing:existing(root,destination,entries)};
  });
  return {root,agent,skills};
}
export function installAgentSkills(options={}){
  const plan=planAgentSkills(options),created=[],installed=[];
  const mkdir=dir=>{
    inside(plan.root,dir);let current=plan.root;
    for(const part of path.relative(plan.root,dir).split(path.sep).filter(Boolean)){
      current=path.join(current,part);const info=inspect(plan.root,current);
      if(info){if(!info.isDirectory())throw new Error('目标目录被文件占用。');}
      else{fs.mkdirSync(current);created.push({filename:current,type:'directory'});}
    }
  };
  try{
    for(const skill of plan.skills){
      if(existing(plan.root,skill.destination,skill.entries))continue;
      mkdir(path.dirname(skill.destination));inspect(plan.root,skill.destination);
      fs.mkdirSync(skill.destination);created.push({filename:skill.destination,type:'directory'});
      for(const entry of skill.entries){
        const filename=path.join(skill.destination,entry.relative);
        if(entry.type==='directory')mkdir(filename);
        else{mkdir(path.dirname(filename));inspect(plan.root,filename);fs.writeFileSync(filename,entry.contents,{flag:'wx'});created.push({filename,type:'file',contents:entry.contents});}
      }
      if(!identical(skill.entries,readTree(plan.root,skill.destination)))throw new Error('技能复制核对失败。');
      installed.push(skill.name);
    }
  }catch(error){
    for(const item of created.reverse()){
      try{const info=inspect(plan.root,item.filename);
        if(item.type==='file'&&info?.isFile()&&fs.readFileSync(item.filename).equals(item.contents))fs.unlinkSync(item.filename);
        else if(item.type==='directory'&&info?.isDirectory())fs.rmdirSync(item.filename);
      }catch{}
    }
    throw error;
  }
  return {agent:plan.agent,installed,unchanged:names.filter(n=>!installed.includes(n)),targets:plan.skills.map(s=>path.relative(plan.root,s.destination).split(path.sep).join('/'))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.length===1&&['--help','-h'].includes(args[0]))console.log('用法：node scripts/install-agent-skills.mjs --agent codex|cursor|claude|trae|qoder');
    else{
      if(args.length!==2||args[0]!=='--agent')throw new Error('用法：node scripts/install-agent-skills.mjs --agent codex|cursor|claude|trae|qoder');
      const result=installAgentSkills({agent:args[1]});
      console.log(result.installed.length?'已安装项目技能：'+result.installed.join('、'):'技能已就绪，无需复制或修改。');
      console.log('技能目录：\n'+result.targets.map(p=>'  '+p).join('\n'));
      console.log('请打开这个项目根目录，再刷新技能或重新进入 Agent 会话。');
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
