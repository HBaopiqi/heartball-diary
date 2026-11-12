(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastFocus=null,currentData=null;
  const dialog=document.createElement('dialog');
  dialog.id='sync-dialog';dialog.className='sync-dialog';dialog.setAttribute('aria-labelledby','sync-dialog-title');
  dialog.innerHTML='<div class="profile-dialog-head"><div><span class="eyebrow">ABOUT YOUR RECORDS</span><h2 id="sync-dialog-title">同步与资料信息</h2></div><button type="button" class="icon-button" id="close-sync-dialog" aria-label="关闭同步信息">×</button></div><div id="sync-dialog-content"></div><div class="sync-dialog-actions"><button class="button button-primary" id="sync-open-profiles">管理档案与同步</button><button class="button" id="sync-dialog-done">知道了</button></div>';
  document.body.append(dialog);
  function stamp(value){
    if(!value)return '未记录';
    const date=new Date(value);if(Number.isNaN(date.getTime()))return '未记录';
    return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  }
  function bounds(rows){
    const valid=value=>value&&Number.isFinite(new Date(value).getTime());
    const starts=rows.map(row=>row.start).filter(valid).sort((a,b)=>new Date(a)-new Date(b));
    const ends=rows.map(row=>row.end||row.start).filter(valid).sort((a,b)=>new Date(a)-new Date(b));
    return {start:starts[0],end:ends.at(-1)};
  }
  function render(data,status){
    const raw=Array.isArray(data.raw)?data.raw:[],days=Array.isArray(data.days)?data.days:[];
    const range=bounds(raw),events=days.reduce((sum,day)=>sum+(day.events||[]).length,0);
    const queryEnd=status?.queryEnd||status?.lastSync?.queryEnd||status?.sync?.queryEnd||data.queryEnd||data.sync?.queryEnd||data.syncedAt;
    const reviewed=Number.isFinite(data.stats?.reviewedSourceCount)?data.stats.reviewedSourceCount:null;
    const reviewStatus=status?.reviewStatus||status?.review?.status||data.reviewStatus;
    let reviewText=reviewed===null?'整理状态未提供':reviewed>=raw.length&&raw.length?'当前资料已整理':raw.length?'有原文待整理':'等待资料';
    if(['pending','needs_review','needs-review','raw_only'].includes(reviewStatus))reviewText='原文已同步，等待整理';
    if(['reviewed','curated','complete','completed'].includes(reviewStatus))reviewText='当前资料已整理';
    const card=(name,value,sub)=>'<article class="sync-stat"><span>'+name+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></article>';
    const name=window.HeartballProfiles?.profile?.name||data.profile?.name||'当前档案';
    document.getElementById('sync-dialog-content').innerHTML='<p class="sync-intro">'+esc(name)+' · '+(window.HeartballProfiles?.mode==='server'?'便携版服务':'离线阅读')+(data.isDemo?' · 虚构示例资料':'')+'</p>'+
      '<div class="sync-stat-grid">'+card('原始记录',raw.length+' 条',raw.filter(row=>row.source==='memory').length+' 段全时记 · '+raw.filter(row=>row.source==='note').length+' 条随口记')+card('每日整理',days.length+' 天',events+' 个时间轴片段')+card('整理状态',reviewText,reviewed===null?'打开每日回顾核对整理内容':'已审阅 '+Math.min(reviewed,raw.length)+' / '+raw.length+' 条原始记录')+'</div>'+
      '<section class="sync-range"><h3>查询时间与实际资料</h3><dl><div><dt>查询截至</dt><dd id="sync-query-end">'+esc(stamp(queryEnd))+'</dd></div><div><dt>已载入原文起点</dt><dd>'+esc(stamp(range.start))+'</dd></div><div><dt>已载入原文终点</dt><dd id="sync-raw-end">'+esc(stamp(range.end))+'</dd></div></dl><p>以上时间均为北京时间。查询覆盖到某个时刻，不表示原文已返回到同一时刻；后续整理完成的录音可能在下次同步时补回。</p></section>'+
      '<section class="sync-guide"><h3>怎样使用这份日记</h3><ol><li><strong>回看一天</strong><p>在每日回顾选择日期，横向时间轴按记录时间排列。点击片段可看内容整理，也能切换转写原文核对。</p></li><li><strong>留住线索</strong><p>在详情中收藏记录，之后从「我的收藏」找到它；全部记录支持关键词、来源与日期筛选。</p></li><li><strong>更新与整理</strong><p>'+(window.HeartballProfiles?.mode==='server'?'在档案设置中连接心力球并同步原始记录。若标记待整理，下载原文整理包，使用 heartball-sync 完整阅读后生成回顾，再导入已整理资料。':'在心力球项目聊天中说「同步心力球」或「整理今天」，完成整理后刷新页面；也可以在档案设置中导入其他已整理的 JSON 资料。')+'</p></li></ol></section>'+
      '<p class="sync-footnote">每日回顾依据原始话语独立归纳；自动摘要保留为可展开的参考。计划与实际完成分别呈现，收藏按档案隔离保存。</p>';
  }
  function close(){dialog.close();lastFocus?.focus();}
  async function open(data){
    currentData=data;lastFocus=document.activeElement;render(data,window.HeartballProfiles?.status);
    if(!dialog.open)dialog.showModal();document.getElementById('close-sync-dialog').focus();
    if(window.HeartballProfiles?.mode==='server'){
      try{const status=await window.HeartballProfiles.refreshStatus();if(dialog.open&&currentData===data)render(data,status);}
      catch(error){if(dialog.open){const message=document.createElement('p');message.className='profile-message is-error';message.textContent='服务状态暂未取得，以上为当前载入的资料。';document.getElementById('sync-dialog-content').append(message);}}
    }
  }
  document.getElementById('close-sync-dialog').addEventListener('click',close);
  document.getElementById('sync-dialog-done').addEventListener('click',close);
  document.getElementById('sync-open-profiles').addEventListener('click',()=>{close();window.HeartballProfiles?.open();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
  window.HeartballSyncInfo={open};
})();

