(function () {
  'use strict';
  const server = /^https?:$/.test(location.protocol);
  const builtin = window.HEARTBALL_DATA;
  const scopePath=location.pathname.slice(0,location.pathname.lastIndexOf('/')+1).toLowerCase();
  let scopeHash=2166136261;for(const char of scopePath){scopeHash^=char.charCodeAt(0);scopeHash=Math.imul(scopeHash,16777619);}
  const fileScope=(scopeHash>>>0).toString(36),activeKey='heartball-active-profile-v1:'+fileScope;
  const state = {profiles:[],activeProfileId:'builtin',data:null,status:null,settings:null,error:'',busy:false,csrf:'',db:null};
  let originFocus=null, pendingFile=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const emptyData=()=>({schemaVersion:2,syncedAt:null,today:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()),stats:{},days:[],raw:[],topics:[]});
  function validateData(value) {
    if(!value||!Array.isArray(value.days)||!Array.isArray(value.raw))throw new Error('请选择心力日记导出的 JSON 资料，文件需要包含 days 和 raw。');
    if(value.days.some(day=>!day||!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||!Array.isArray(day.events)))throw new Error('资料的日期或每日片段格式不完整，请重新导出。');
    if(value.raw.some(row=>!row||row.id==null||typeof row.source!=='string'))throw new Error('原始记录格式不完整，请重新导出。');
    return value;
  }
  const active=()=>state.profiles.find(p=>p.id===state.activeProfileId);
  const favoriteKey=()=> 'heartball-favorites-v2:'+(server?'server:':'file:'+fileScope+':')+state.activeProfileId;
  async function request(path,options={}) {
    const method=options.method||'GET';
    const headers={'Accept':'application/json'};
    if(method!=='GET'){headers['Content-Type']='application/json';if(state.csrf)headers['X-CSRF-Token']=state.csrf;}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
    let response;
    try{response=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',signal:controller.signal,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});}
    catch(error){throw new Error(error.name==='AbortError'?'服务响应较慢，请稍后查看状态。':'无法连接本地服务，请确认启动窗口仍在运行。');}
    finally{clearTimeout(timeout);}
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(value.error?.message||value.message||(typeof value.error==='string'?value.error:'操作未完成（'+response.status+'）'));
    return value;
  }
  const route=name=>'/api/'+name+'?profile='+encodeURIComponent(state.activeProfileId);
  async function openDb() {
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('当前浏览器不支持保存多份离线档案。'));return;}
      const r=indexedDB.open('heartball-profiles-v1-'+fileScope,1);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('profiles'))r.result.createObjectStore('profiles',{keyPath:'id'});};
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(new Error('当前浏览器未允许保存离线档案，请改用便携版启动程序。'));
    });
  }
  async function localStore(operation,value) {
    if(!state.db)throw new Error('离线存储不可用，当前原始档案仍可阅读。');
    return new Promise((resolve,reject)=>{
      const tx=state.db.transaction('profiles',operation==='getAll'?'readonly':'readwrite');
      const store=tx.objectStore('profiles'),r=operation==='getAll'?store.getAll():store.put(value);
      let result;r.onsuccess=()=>{result=r.result;};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('档案未能保存，请检查浏览器存储空间。'));tx.onabort=tx.onerror;
    });
  }
  function selectedName(){return active()?.name||state.data?.profile?.name||'我的本地记录';}
  function announce(message,isError=false){
    const node=document.getElementById('profile-message');if(node){node.textContent=message;node.classList.toggle('is-error',isError);}
  }
  function updateBadge(){
    const label=document.getElementById('profile-button-label');if(label)label.textContent=selectedName();
    document.getElementById('profile-button')?.setAttribute('aria-label','管理档案，当前：'+selectedName());
    document.getElementById('dataset-banner')?.remove();
    if(state.error||state.data?.isDemo){
      const banner=document.createElement('div');banner.id='dataset-banner';banner.className='dataset-banner';banner.setAttribute('role','status');
      banner.textContent=state.error||'示例资料 · 以下是虚构演示内容。点击右上角「档案」创建自己的记录。';
      document.getElementById('main')?.prepend(banner);
    }
  }
  async function initialize(){
    try{
      if(server){
        const session=await request('/api/session');state.csrf=session.csrfToken||session.token||'';
        const listing=await request('/api/profiles');state.profiles=listing.profiles||[];state.activeProfileId=listing.activeProfileId||state.profiles[0]?.id||'default';
        state.data=validateData(await request(route('data')));
        if(new URLSearchParams(location.search).get('connectionError')==='1')state.error='心力球授权未完成或已失效，请打开档案设置重新连接。';
      }else{
        try{state.db=await openDb();}catch(error){state.error=error.message;}
        const stored=state.db?await localStore('getAll'):[];
        const current=stored.find(p=>p.id==='builtin');
        state.profiles=[{id:'builtin',name:current?.name||builtin?.profile?.name||'我的本地记录',hasData:!!(current?.data?.raw?.length||builtin?.raw?.length)},...stored.filter(p=>p.id!=='builtin').map(p=>({id:p.id,name:p.name,hasData:!!p.data?.raw?.length}))];
        let last;try{last=localStorage.getItem(activeKey);}catch{}
        state.activeProfileId=state.profiles.some(p=>p.id===last)?last:'builtin';
        state.data=stored.find(p=>p.id===state.activeProfileId)?.data||(state.activeProfileId==='builtin'?builtin:emptyData())||emptyData();
        validateData(state.data);
        if(state.activeProfileId==='builtin'&&!state.data.isDemo&&!builtin?.isDemo){
          try{if(localStorage.getItem(favoriteKey())===null){const old=JSON.parse(localStorage.getItem('heartball-favorites-v1')||'[]');const ids=new Set([...state.data.raw.map(r=>String(r.id)),...state.data.days.flatMap(d=>(d.events||[]).map(e=>String(e.id)))]);localStorage.setItem(favoriteKey(),JSON.stringify(Array.isArray(old)?old.map(String).filter(id=>ids.has(id)):[]));}}catch{}
        }
      }
    }catch(error){state.error=error.message;state.data=emptyData();}
    updateBadge();return state.data;
  }
  function dialogMarkup(){
    return '<div class="profile-dialog-head"><div><span class="eyebrow">YOUR PRIVATE JOURNALS</span><h2 id="profile-title">我的档案</h2></div><button type="button" class="icon-button" data-profile-action="close" aria-label="关闭档案设置">×</button></div>'+
      '<p class="profile-intro">'+(server?'每份档案有独立的数据、连接设置和收藏。':'离线档案保存在当前浏览器。更换电脑前，请导出备份。')+'</p>'+
      '<p id="profile-message" class="profile-message" role="status" aria-live="polite">'+esc(state.error)+'</p>'+
      '<section class="profile-section" aria-label="选择档案"><div class="profile-list">'+state.profiles.map(p=>'<button class="profile-choice '+(p.id===state.activeProfileId?'selected':'')+'" data-profile-id="'+esc(p.id)+'" '+(p.id===state.activeProfileId?'aria-current="true"':'')+'><span class="profile-initial" aria-hidden="true">'+esc((p.name||'档').slice(0,1))+'</span><span><strong>'+esc(p.name)+'</strong><small>'+(p.id===state.activeProfileId?'当前档案':p.hasData?'已有记录':'等待导入或同步')+'</small></span><span class="profile-choice-mark">'+(p.id===state.activeProfileId?'使用中':'切换 ↗')+'</span></button>').join('')+'</div>'+
      '<form id="profile-create-form" class="profile-create"><label for="new-profile-name">新建档案</label><div><input id="new-profile-name" maxlength="40" placeholder="例如：我的日记" required><button class="button" type="submit">创建</button></div></form></section>'+
      '<section class="profile-section"><div class="profile-section-title"><h3>数据与整理</h3><span id="profile-review-state">'+(state.data?.raw?.length?state.data.raw.length+' 条原始记录':'尚无记录')+'</span></div>'+
      (server?'<p class="profile-help">先连接心力球并同步原文。每日回顾需要依据完整原话独立整理；仅同步原文时会标记为「待整理」。</p><div class="profile-action-row"><button class="button button-primary" data-profile-action="sync">同步原始记录</button><a class="button" href="'+route('review-packet')+'" download>下载原文整理包</a><button class="button" data-profile-action="refresh-status">刷新状态</button></div><div id="profile-sync-state" class="profile-sync-state" role="status"></div>':'<p class="profile-help">直接打开 HTML 时可以导入和阅读档案。连接心力球、同步原文请使用便携版启动程序。</p>')+
      '<details class="profile-import"><summary>导入已整理的资料</summary><p class="profile-help">选择心力日记 JSON 文件，再导入到当前档案「'+esc(selectedName())+'」。导入会更新这份档案的数据。</p><input type="file" id="profile-import-file" accept=".json,application/json" aria-label="选择心力日记 JSON 资料"><button class="button" data-profile-action="import">导入到当前档案</button></details></section>'+
      (server?'<section class="profile-section"><h3>连接心力球</h3><p class="profile-help">填入你自己的 MCP 服务地址。首次连接可能需要在授权页面登录。</p><form id="profile-settings-form"><label class="profile-field">MCP 服务地址<input id="setting-mcp" type="url" placeholder="https://…" autocomplete="off" required></label><div class="profile-action-row"><button class="button" type="submit">保存设置</button><button class="button" type="button" data-profile-action="connect">连接 / 授权</button></div></form><div id="profile-authorization" class="profile-authorization"></div></section>':'')+
      '<p class="profile-footnote">导出完整资料可在「全部记录 → 导出资料」操作。收藏按档案分别保存。</p>';
  }
  const dialog=document.createElement('dialog');dialog.id='profile-dialog';dialog.className='profile-dialog';dialog.setAttribute('aria-labelledby','profile-title');document.body.append(dialog);
  function close(){dialog.close();originFocus?.focus();}
  async function open(){
    await api.ready;originFocus=document.activeElement;dialog.innerHTML=dialogMarkup();
    if(!dialog.open)dialog.showModal();document.getElementById('new-profile-name')?.setAttribute('autocomplete','off');
    dialog.querySelector('[data-profile-action="close"]')?.focus();
    if(server)await loadServerDetails();
  }
  function statusText(value){
    if(!value)return '暂无同步状态。';
    const job=value.job||value.syncJob||value.lastJob||value.sync||{};
    const phase=value.syncState||job.status||job.state||value.status||'';
    const review=value.reviewStatus||value.curationStatus||value.review?.status;
    return [phase?'同步：'+({'running':'进行中','queued':'等待中','completed':'已完成','succeeded':'已完成','failed':'失败','idle':'尚未同步','syncing':'同步中','connecting':'连接中','ready':'原文已同步','needs-review':'原文已同步，待整理','error':'同步异常'}[phase]||phase):'',review?'整理：'+({'pending':'待整理','needs_review':'待整理','needs-review':'待整理','empty':'等待资料','reviewed':'已整理','curated':'已整理','complete':'已整理'}[review]||review):'',job.message||value.message||''].filter(Boolean).join(' · ')||'尚未运行同步。';
  }
  async function loadServerDetails(){
    try{
      const results=await Promise.allSettled([request(route('settings')),request(route('status'))]);
      if(!dialog.open)return;
      if(results[0].status==='fulfilled'){
        const settings=results[0].value;state.settings=settings;
        document.getElementById('setting-mcp').value=settings.mcpEndpoint||settings.mcp?.endpoint||settings.endpoint||'';
      }else announce(results[0].reason.message,true);
      if(results[1].status==='fulfilled'){state.status=results[1].value;document.getElementById('profile-sync-state').textContent=statusText(state.status);}
      else announce(results[1].reason.message,true);
    }catch(error){announce(error.message,true);}
  }
  async function busy(task){
    if(state.busy)return;state.busy=true;dialog.setAttribute('aria-busy','true');
    const buttons=[...dialog.querySelectorAll('button')].filter(b=>b.dataset.profileAction!=='close');buttons.forEach(b=>b.disabled=true);
    try{await task();}catch(error){announce(error.message,true);}
    finally{state.busy=false;dialog.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);}
  }
  async function switchProfile(id){
    if(id===state.activeProfileId)return;
    if(server)await request('/api/profiles/active',{method:'POST',body:{id}});
    else localStorage.setItem(activeKey,id);
    location.reload();
  }
  async function createProfile(name){
    name=name.trim();if(!name)throw new Error('请填写档案名称。');
    let id;
    if(server){const result=await request('/api/profiles',{method:'POST',body:{name}});id=result.profile?.id||result.id;if(!id)throw new Error('档案已提交，请刷新档案列表确认。');}
    else{id='local-'+(window.crypto?.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));await localStore('put',{id,name,data:emptyData(),createdAt:new Date().toISOString()});}
    await switchProfile(id);
  }
  async function importData(){
    const file=document.getElementById('profile-import-file')?.files?.[0]||pendingFile;
    if(!file)throw new Error('请先选择 JSON 资料文件。');
    if(file.size>64*1024*1024)throw new Error('文件超过 64 MB，请按资料库拆分后再导入。');
    const data=validateData(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
    if(server)await request(route('import'),{method:'POST',body:data});
    else await localStore('put',{id:state.activeProfileId,name:selectedName(),data,updatedAt:new Date().toISOString()});
    if(Array.isArray(data.favorites)){try{localStorage.setItem(favoriteKey(),JSON.stringify(data.favorites.map(String)));}catch{}}
    location.reload();
  }
  async function saveSettings(){
    const endpoint=document.getElementById('setting-mcp').value.trim();
    if(!endpoint)throw new Error('请先填写 MCP 服务地址。');
    let checked;try{checked=new URL(endpoint);}catch{throw new Error('MCP 服务地址格式不正确。');}
    if(!/^https?:$/.test(checked.protocol))throw new Error('服务地址需要以 https:// 或 http:// 开头。');
    await request(route('settings'),{method:'PUT',body:{mcp:{endpoint}}});
    state.settings={mcp:{endpoint}};announce('设置已保存，可以连接心力球。');
  }
  async function connect(){
    if(document.getElementById('setting-mcp').value.trim()!==(state.settings?.mcp?.endpoint||''))await saveSettings();
    const result=await request(route('mcp/connect'),{method:'POST',body:{}});
    const node=document.getElementById('profile-authorization');node.replaceChildren();
    const address=result.authorizationUrl||result.url;
    if(address){
      const url=new URL(address,location.href);if(!/^https?:$/.test(url.protocol))throw new Error('授权地址格式不正确。');
      const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='button button-primary';link.textContent='打开心力球授权页面';node.append(link);
      const help=document.createElement('p');help.className='profile-help';help.textContent='授权后回到这里，再点击「连接 / 授权」确认连接。';node.append(help);announce('请打开授权页面完成登录。');
    }else announce(result.connected?'心力球已连接。':result.message||'连接已提交，请刷新状态确认。');
  }
  async function sync(){
    const result=await request(route('sync'),{method:'POST',body:{}});
    const initial=result.job||result;announce('已发起同步，正在读取原始记录。');
    for(let i=0;i<180;i++){
      await new Promise(resolve=>setTimeout(resolve,1500));
      const value=await request(route('status'));state.status=value;
      const node=document.getElementById('profile-sync-state');if(node)node.textContent=statusText(value);
      const job=value.job||value.syncJob||value.lastJob||value.sync||value;
      const phase=value.syncState||job.status||job.state;
      if(['failed','error','cancelled'].includes(phase))throw new Error(job.error?.message||job.error||value.error||job.message||'同步未完成，请检查连接后重试。');
      if(['completed','succeeded','success','done','ready','needs-review'].includes(phase)){
        announce('原始记录已同步。请查看整理状态；待整理资料可下载原文整理包。');
        state.data=validateData(await request(route('data')));
        const reload=document.createElement('button');reload.className='button button-primary';reload.textContent='载入最新记录';reload.addEventListener('click',()=>location.reload());node?.append(document.createElement('br'),reload);
        return;
      }
      if(initial.status==='completed'&&!phase){location.reload();return;}
    }
    announce('同步仍在后台进行，可稍后点击「刷新状态」查看。');
  }
  dialog.addEventListener('click',event=>{
    const choice=event.target.closest('[data-profile-id]');if(choice){busy(()=>switchProfile(choice.dataset.profileId));return;}
    const action=event.target.closest('[data-profile-action]')?.dataset.profileAction;
    if(action==='close'){close();return;}
    if(action==='import')busy(importData);
    if(action==='refresh-status')busy(loadServerDetails);
    if(action==='connect')busy(connect);
    if(action==='sync')busy(sync);
    if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
  });
  dialog.addEventListener('submit',event=>{
    event.preventDefault();
    if(event.target.id==='profile-create-form')busy(()=>createProfile(document.getElementById('new-profile-name').value));
    if(event.target.id==='profile-settings-form')busy(saveSettings);
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.getElementById('profile-button')?.addEventListener('click',open);
  const api={get mode(){return server?'server':'file';},get activeProfileId(){return state.activeProfileId;},get profile(){return active();},get favoritesKey(){return favoriteKey();},get status(){return state.status;},open,request,statusText,refreshStatus:async()=>{if(server)state.status=await request(route('status'));return state.status;}};
  window.HeartballProfiles=api;api.ready=initialize();
})();

