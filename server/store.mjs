import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {emptyData} from './model.mjs';

export function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(temporary,file);
}
export const readJson = (file,fallback) => fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')):fallback;
export class Store {
  constructor(root) {
    this.root=path.resolve(root);this.indexPath=path.join(this.root,'profiles.json');
    this.index=readJson(this.indexPath,{profiles:[],activeProfileId:null});
    if(!this.index.profiles.length)this.create('我的资料库');
  }
  profile(id=this.index.activeProfileId) {
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('资料库 ID 无效');
    const p=this.index.profiles.find(p=>p.id===id);if(!p)throw new Error('资料库不存在');return p;
  }
  file(id,name) {this.profile(id);if(!/^[a-z-]+\.json$/.test(name))throw new Error('存储文件名无效');return path.join(this.root,'profiles',id,name);}
  read(id,name,fallback) {return readJson(this.file(id,name),fallback);}
  write(id,name,value) {atomicWrite(this.file(id,name),value);}
  create(name) {
    if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw new Error('资料库名称应为1—60个字符');
    if(this.index.profiles.length>=50)throw new Error('资料库数量已达上限');
    const p={id:randomUUID(),name:name.trim(),createdAt:new Date().toISOString()};
    this.index.profiles.push(p);this.index.activeProfileId=p.id;atomicWrite(this.indexPath,this.index);
    this.write(p.id,'dataset.json',emptyData());
    this.write(p.id,'source.json',{end:null,memory:[],note:[]});
    return p;
  }
  activate(id) {this.profile(id);this.index.activeProfileId=id;atomicWrite(this.indexPath,this.index);}
  dataset(id) {return this.read(id,'dataset.json',emptyData());}
  source(id) {return this.read(id,'source.json',{end:null,memory:[],note:[]});}
  settings(id) {return this.read(id,'settings.json',{mcp:{endpoint:'https://beluga-server-cn.heytapmobi.com/beluga-mcp/gateway'}});}
  snapshot(id,label='before-update') {
    const dir=path.join(this.root,'profiles',id,'snapshots',Date.now()+'-'+randomUUID());
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    for(const name of ['dataset.json','source.json','status.json','received.json']) {const source=this.file(id,name);if(fs.existsSync(source))fs.copyFileSync(source,path.join(dir,name));}
    atomicWrite(path.join(dir,'meta.json'),{label,createdAt:new Date().toISOString()});
    return dir;
  }
  commit(id,files,label='before-update') {
    const before=new Map(Object.keys(files).map(name=>[name,fs.existsSync(this.file(id,name))?fs.readFileSync(this.file(id,name)):null]));
    const snapshot=this.snapshot(id,label);
    try {for(const [name,value] of Object.entries(files))this.write(id,name,value);}
    catch(error) {
      for(const [name,content] of before){const target=this.file(id,name);if(content===null){if(fs.existsSync(target))fs.unlinkSync(target);}else {const temporary=target+'.rollback.tmp';fs.writeFileSync(temporary,content,{mode:0o600});fs.renameSync(temporary,target);}}
      throw error;
    }
    return snapshot;
  }
}
