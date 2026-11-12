(async () => {
  'use strict';
  const icons = {
    book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m4 0h2m-8 4h2"/>',
    layers: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    leaf: '<path d="M19 4C6 1 2 12 7 17s16 1 12-13ZM5 20l10-10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
    progress: '<path d="M4 19h16M6 15v-4m6 4V5m6 10V8"/>',
    spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/>'
  };
  const icon = name => `<span data-icon="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.book}</svg></span>`;
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]:empty').forEach(node => {
      node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[node.dataset.icon] || icons.book}</svg>`;
    });
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
  const plain = value => window.HeartballMarkdown ? window.HeartballMarkdown.plain(text(value)) : text(value);
  const root = document.getElementById('page-content');
  const data = window.HeartballProfiles ? await window.HeartballProfiles.ready : window.HEARTBALL_DATA;
  const favoritesKey = window.HeartballProfiles?.favoritesKey || 'heartball-favorites-v1';
  hydrateIcons();
  if (!data || !Array.isArray(data.days) || !Array.isArray(data.raw)) {
    root.innerHTML = '<div class="load-error"><h1>资料还没有载入</h1><p>请把 index.html、app.js、styles.css 和 data.js 放在同一个文件夹，再打开 index.html。</p></div>';
    return;
  }
  const days = [...data.days].sort((a,b) => a.date.localeCompare(b.date));
  const byDate = new Map(days.map(day => [day.date, day]));
  const rawById = new Map(data.raw.map(row => [String(row.id), row]));
  data.raw.forEach(row => {
    rawById.set(String(row.id).replace(/^(note|memory)-/, ''), row);
    if (row.originalId) rawById.set(String(row.originalId), row);
  });
  const allEvents = days.flatMap(day => (day.events || []).map(event => ({...event, date:day.date})));
  const eventById = new Map(allEvents.map(event => [String(event.id), event]));
  const categories = ['学习','创作','生活','交流','其他'];
  const sourceNames = {note:'随口记', memory:'全时记'};
  const categoryClasses = {学习:'study',创作:'create',生活:'life',交流:'talk',其他:'other'};
  const weekday = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const getNowDate = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const today = getNowDate();
  const latest = days.at(-1)?.date || today;
  let favoriteIds = new Set();
  let persistent = true;
  try { favoriteIds = new Set(JSON.parse(localStorage.getItem(favoritesKey) || '[]').map(String)); } catch { persistent = false; }
  const state = {view:['daily','calendar','archive','progress','favorites'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'daily', date:latest, month:latest.slice(0,7), category:'全部', query:'', source:'all', from:'', to:'', showFiltered:false, favoritesOnly:false, topic:'all', favoriteQuery:'', page:1};
  let detail = null;
  let detailTab = 'clean';
  let lastFocus = null;
  let toastTimer;
  const dialog = document.getElementById('detail-dialog');
  function dateParts(date) { return date.split('-').map(Number); }
  function dateObject(date) { const [y,m,d] = dateParts(date); return new Date(Date.UTC(y,m-1,d)); }
  function shiftMonth(month, amount) {
    const [y,m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y,m-1+amount,1));
    return next.toISOString().slice(0,7);
  }
  function monthLabel(month) { const [y,m] = month.split('-').map(Number); return `${y} 年 ${m} 月`; }
  function dateLabel(date) { const [y,m,d] = dateParts(date); return `${y} 年 ${m} 月 ${d} 日`; }
  function stampDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value).slice(0,10);
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed);
  }
  function stampTime(value) {
    if (!value) return '--:--';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value).slice(11,16) || '--:--';
    return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(parsed);
  }
  function interval(row) {
    const first = stampTime(row.start);
    if (row.source === 'note') return '记录于 ' + first;
    const end = stampTime(row.end || row.start);
    const endDate = stampDate(row.end || row.start);
    return first + '–' + (endDate !== stampDate(row.start) ? endDate.slice(5).replace('-','/') + ' ' : '') + end + ' · 记录时段';
  }
  function monthCells(month) {
    const [y,m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y,m-1,1));
    const offset = (first.getUTCDay()+6)%7;
    return Array.from({length:42}, (_,i) => new Date(Date.UTC(y,m-1,1-offset+i)).toISOString().slice(0,10));
  }
  function setView(view) { state.view = view; location.hash = view; render(); }
  function selectDate(date, view = 'daily') { state.date = date; state.month = date.slice(0,7); state.category='全部'; setView(view); }
  function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message; node.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 2900);
  }
  function dateActions() {
    return '<div class="heading-actions"><label class="quick-date"><span>选择日期</span><input id="day-picker" type="date" value="'+state.date+'" aria-label="跳转到日期"></label><button class="button" data-action="latest">最近记录</button><button class="button" data-action="export-day">'+icon('download')+'导出日报</button></div>';
  }
  function heading(english, title, subtitle, actions = '') {
    return `<div class="page-heading"><div><span class="eyebrow">${english}</span><h1>${title}</h1><p>${subtitle}</p></div>${actions}</div>`;
  }
  function empty(title, description, withLatest = false) {
    return `<div class="empty-state">${icon('book')}<h3>${esc(title)}</h3><p>${esc(description)}</p>${withLatest ? '<button class="button" data-action="latest">查看最近记录</button>' : ''}</div>`;
  }
  function categoryLabel(category) { return `<span class="category-label ${categoryClasses[category] || ''}">${esc(category || '其他')}</span>`; }
  function miniCalendar() {
    return `<section class="mini-calendar" aria-label="选择日期"><div class="calendar-bar"><h3>${monthLabel(state.month)}</h3><div class="calendar-controls"><button class="icon-button" data-action="month-prev" aria-label="上个月">${icon('left')}</button><button class="icon-button" data-action="month-next" aria-label="下个月">${icon('right')}</button></div></div><div class="weekday-grid" aria-hidden="true">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="mini-days">${monthCells(state.month).map(date=>{
      const found = byDate.get(date); const count = found?.events?.length || 0;
      return `<button class="mini-day ${date.slice(0,7)!==state.month?'other':''} ${date===state.date?'selected':''} ${date===today?'today':''} ${found?'has-data':''}" data-date="${date}" aria-label="${dateLabel(date)}，${count} 条整理记录" ${date===state.date?'aria-pressed="true"':''}>${Number(date.slice(8))}</button>`;
    }).join('')}</div><div class="mini-legend"><i></i>有记录的日子，值得回看<button class="text-button" data-action="calendar" style="margin-left:auto;font-size:8px">展开</button></div></section>`;
  }
  function renderEvent(event, index) {
    const start = stampTime(event.start); const favorite = favoriteIds.has(String(event.id));
    return `<article class="timeline-event" style="animation-delay:${Math.min(index,10)*25}ms"><div class="event-clock">${start}<small>${event.source==='note'?'记录时刻':(stampDate(event.end || event.start)!==stampDate(event.start)?stampDate(event.end||event.start).slice(5)+' ':'')+stampTime(event.end || event.start)+' 结束'}</small></div><button class="event-card" data-event="${esc(event.id)}" aria-label="查看记录 ${esc(event.title)}"><span class="event-meta">${categoryLabel(event.category)}<span>${esc(event.status || '已记录')}</span>${event.retrospective?'<span>当天回顾</span>':''}</span><span class="event-arrow">↗</span><h3>${esc(event.title || '日常片段')}</h3><p>${esc(event.text || '')}</p><span class="event-footer"><span>${icon('clock')}${esc(interval(event))}</span><span>${sourceNames[event.source] || '记录'}${favorite?' · 已收藏':''}</span></span></button></article>`;
  }
  function synthesisSources(ids) {
    return `<div class="synthesis-sources">${(ids||[]).map(id=>rawById.get(String(id))).filter(Boolean).map(row=>`<button class="source-link" data-raw="${esc(row.id)}" aria-label="核对来源：${esc(row.title)}">${sourceNames[row.source]} · ${stampTime(row.start)} ↗</button>`).join('')}</div>`;
  }
  function synthesisView(day) {
    const synthesis=day?.synthesis,sections=synthesis?.sections||[];
    const points=(kind,number,title,subtitle,rows,missing)=>{
      const itemHtml=item=>'<li>'+(item.title?'<h5>'+esc(item.title)+'</h5>':'')+'<p>'+esc(item.text)+'</p>'+synthesisSources(item.sourceIds)+'</li>';
      const primary=kind==='highlights'?rows.slice(0,3):rows;
      const rest=kind==='highlights'?rows.slice(3):[];
      return '<section class="daily-brief daily-'+kind+'"><div class="brief-heading"><span class="brief-number">'+number+'</span><div><h4>'+title+'</h4><p>'+subtitle+'</p></div><span class="brief-count">'+rows.length+'</span></div>'+
        (rows.length?'<ol class="brief-list">'+primary.map(itemHtml).join('')+'</ol>':'<p class="brief-empty">'+missing+'</p>')+
        (rest.length?'<details class="brief-more"><summary>展开其余 '+rest.length+' 个主题</summary><ol class="brief-list">'+rest.map(itemHtml).join('')+'</ol></details>':'')+'</section>';
    };
    return '<div class="daily-briefs">'+points('highlights','01','当天重点','值得回看的事情与交流',sections,'这一天还没有整理出重点。')+points('progress','02','实际进展','记录中已经发生的变化',synthesis?.progress||[],'这一天暂未记录明确的实际进展。')+points('next','03','当时的后续安排','保留这一天提出的下一步',synthesis?.nextActions||[],'这一天没有明确记下后续安排。')+'</div>'+(synthesis?.coverageNote?'<p class="coverage-note">'+esc(synthesis.coverageNote)+'</p>':'');
  }
  function stripTime(event) {
    const start=stampTime(event.start);if(event.source==='note'||!event.end)return start;
    const prefix=stampDate(event.end)!==stampDate(event.start)?stampDate(event.end).slice(5).replace('-','/')+' ':'';
    return start+'–'+prefix+stampTime(event.end);
  }
  function horizontalTimeline(events) {
    return '<section class="day-strip" aria-label="这一天的横向时间轴"><div class="strip-heading"><div><span class="eyebrow">THE DAY AT A GLANCE</span><h3>这一天，做了什么</h3></div><div class="strip-controls"><button class="icon-button" data-action="strip-prev" aria-label="时间轴向前滚动">'+icon('left')+'</button><button class="icon-button" data-action="strip-next" aria-label="时间轴向后滚动">'+icon('right')+'</button></div></div><div class="day-strip-track" id="day-strip-track" tabindex="0" aria-label="按记录时间排列的片段，可左右滚动">'+(events.map((event,index)=>'<button class="strip-event" data-event="'+esc(event.id)+'" data-strip-id="'+esc(event.id)+'" aria-label="'+esc(stripTime(event))+' '+esc(event.title)+'"><span class="strip-time">'+stripTime(event)+'</span><span class="strip-line"><i></i></span><span class="strip-event-card"><span class="strip-index">'+String(index+1).padStart(2,'0')+'</span>'+categoryLabel(event.category)+'<strong>'+esc(event.title||'日常片段')+'</strong><span class="strip-kind">'+(event.source==='note'?'随口记 · 记录时点':'全时记 · 记录时段')+(favoriteIds.has(String(event.id))?' · 已收藏':'')+'<span>↗</span></span></span></button>').join('')||'<p class="strip-empty">这一天还没有整理片段。选择有记录的日期，看看那天做了什么。</p>')+'</div><div class="strip-footer"><span>按记录时间排列，点击查看详情</span>'+(events.length>1?'<span class="strip-scroll-hint">左右滑动查看更多 <span aria-hidden="true">↔</span></span>':'')+'</div></section>';
  }
  function dailyView() {
    const day = byDate.get(state.date);
    const events = [...(day?.events || [])].sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    const displayed = events.filter(event=>state.category==='全部'||event.category===state.category);
    const cat = [...new Set(events.map(event=>event.category).filter(Boolean))];
    const [y,m,d] = dateParts(state.date);
    const isToday = state.date === today;
    const noteCount = day?.coverage?.noteCount ?? events.filter(e=>e.source==='note').length;
    const rawCount = day?.rawCount ?? data.raw.filter(r=>r.date===state.date).length;
    let period = '';
    const timeline = displayed.map((event,index)=>{
      const h = Number(stampTime(event.start).slice(0,2));
      const nextPeriod = h<6?'凌晨':h<12?'上午':h<18?'下午':'晚上';
      const marker = nextPeriod!==period ? `<div class="period-marker">${nextPeriod}</div>` : '';
      period = nextPeriod; return marker + renderEvent(event,index);
    }).join('');
    const prev = [...days].reverse().find(item=>item.date<state.date)?.date;
    const next = days.find(item=>item.date>state.date)?.date;
    const review = day?.review || (events.length ? '这一天的记录已经按时间整理在下方。点击每个片段，可以查看完整内容与原始转写。' : '这一天暂时没有可整理的记录。');
    return heading('YOUR DAILY JOURNAL','把一天，慢慢看清',isToday?'今天尚未结束，记录会随着下一次同步补充。':'回到某一天，看看留下了哪些片段。',dateActions()) + `<div class="daily-grid"><div class="daily-main"><section class="date-hero"><div class="date-number">${String(d).padStart(2,'0')}<small>${y} · ${String(m).padStart(2,'0')}</small></div><div class="date-hero-copy"><h2>${weekday[dateObject(state.date).getUTCDay()] }，${isToday?'今天仍在继续':'回看这一天'}</h2><p>${events.length} 个日常片段${isToday?' · 尚未结束':''}</p><div class="day-tags">${cat.map(c=>`<span class="day-tag">${esc(c)}</span>`).join('')}</div></div><div class="hero-decoration" aria-hidden="true"><span></span><span></span><span></span></div></section>${horizontalTimeline(events)}<section class="review-card"><div class="card-head"><h3>${icon('book')}每日回顾</h3><small>综合全天记录</small></div><div class="review-text">${esc(review)}</div>${synthesisView(day)}</section><section class="timeline-section"><div class="section-title"><div><h2>一天的足迹</h2><p>按记录时刻与记录时段排列</p></div><span class="record-total">${displayed.length} 条片段</span></div><div class="filter-row" aria-label="筛选活动类别">${['全部',...categories.filter(c=>cat.includes(c))].map(c=>`<button class="chip ${state.category===c?'active':''}" data-category="${c}" aria-pressed="${state.category===c}">${c}</button>`).join('')}</div><div class="timeline-list">${timeline || empty(events.length?'这个类别还没有记录':'留白，也是一天的一部分',events.length?'换一个类别，继续回看这一天。':'可以选择日历中有记录的日期。',!events.length)}</div><div class="day-pagination"><button class="button button-quiet" ${prev?`data-date="${prev}"`:'disabled'}>${icon('left')}上一个记录日</button><button class="button button-quiet" ${next?`data-date="${next}"`:'disabled'}>下一个记录日${icon('right')}</button></div></section></div><aside class="day-aside">${miniCalendar()}<section class="reflection-card"><span class="eyebrow">LITTLE MOMENTS, REAL LIFE</span><p>那些小小的日常，<br>慢慢成为生活。</p><small>给记忆留一个位置</small><div class="reflection-rings" aria-hidden="true"></div></section><div class="aside-stats"><div class="stat-tile"><span>这一天的原始记录</span><strong>${rawCount}<small>条</small></strong></div><div class="stat-tile"><span>当天随口记</span><strong>${noteCount}<small>条</small></strong></div></div><div class="aside-note"><strong>每一段回顾，都能找到出处。</strong><br>点击片段查看原文。时间轴展示记录覆盖的时段，实际活动时长以原文为准。</div></aside></div>`;
  }
  function calendarView() {
    const monthDays = days.filter(day=>day.date.startsWith(state.month));
    return heading('THE DAYS WE KEEP','翻开日历','每一个标记，都是生活留下的线索。',`<div class="heading-actions"><button class="button" data-action="today-month">本月</button><button class="button button-primary" data-action="latest">最近的一天${icon('right')}</button></div>`) + `<section class="calendar-full"><div class="calendar-bar"><h2>${monthLabel(state.month)}</h2><span class="month-list-count">${monthDays.length} 天留下记录</span><div class="calendar-controls"><button class="icon-button" data-action="month-prev" aria-label="上个月">${icon('left')}</button><button class="icon-button" data-action="month-next" aria-label="下个月">${icon('right')}</button></div></div><div class="weekday-grid" aria-hidden="true">${['星期一','星期二','星期三','星期四','星期五','星期六','星期日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="month-grid">${monthCells(state.month).map(date=>{
      const found = byDate.get(date); const events=found?.events||[];
      return `<button class="month-day ${date.slice(0,7)!==state.month?'other':''} ${date===state.date?'selected':''} ${date===today?'today':''}" data-date="${date}" aria-label="${dateLabel(date)}，${events.length} 条整理记录，查看当天"><span class="month-date">${Number(date.slice(8))}</span>${events.length?`<span class="month-count">${events.length} 条</span><div class="month-preview">${esc(events[0].title)}</div><span class="month-dots">${events.slice(0,5).map(()=>'<i></i>').join('')}</span>`:found?'<div class="month-preview">有原始记录</div>':''}</button>`;
    }).join('')}</div><p class="calendar-description">点击日期查看每日回顾和时间轴，圆点表示已整理的记录。</p></section>`;
  }
  function eventCategory(row) {
    return row.category || eventById.get(String(row.id))?.category || allEvents.find(e=>(e.sourceIds||[]).some(id=>rawById.get(String(id))?.id===row.id))?.category || '其他';
  }
  function archiveRows() {
    const q = state.query.trim().toLocaleLowerCase();
    return data.raw.filter(row=>{
      const date=row.date||stampDate(row.start);
      if (!state.showFiltered && row.filteredReason) return false;
      if (state.source!=='all' && row.source!==state.source) return false;
      if (state.category!=='全部' && eventCategory(row)!==state.category) return false;
      if (state.from && date<state.from || state.to && date>state.to) return false;
      if (state.favoritesOnly && !favoriteIds.has(String(row.id)) && !allEvents.some(e=>favoriteIds.has(String(e.id))&&(e.sourceIds||[]).some(id=>rawById.get(String(id))?.id===row.id))) return false;
      if (!q) return true;
      return [row.title,row.text,row.rawText,row.originalSummary,date].some(value=>text(value).toLocaleLowerCase().includes(q));
    }).sort((a,b)=>String(b.start).localeCompare(String(a.start)));
  }
  function archiveView() {
    const rows=archiveRows();const limit=30;const visible=rows.slice(0,state.page*limit);
    return heading('YOUR PERSONAL ARCHIVE','生活，自有线索','搜索一个词，找回一段对话、一次想法或某一天。',`<div class="heading-actions"><button class="button" data-action="export-all">${icon('download')}导出资料</button></div>`) + `<section><div class="archive-toolbar"><label class="archive-search">${icon('search')}<input type="search" id="archive-query" placeholder="搜索标题、内容或转写原文" value="${esc(state.query)}" aria-label="搜索记录"></label><select id="source-filter" class="select" aria-label="记录来源"><option value="all">全部来源</option><option value="note" ${state.source==='note'?'selected':''}>随口记</option><option value="memory" ${state.source==='memory'?'selected':''}>全时记</option></select><select id="category-filter" class="select" aria-label="活动类别">${['全部',...categories].map(c=>`<option value="${c}" ${state.category===c?'selected':''}>${c==='全部'?'全部类别':c}</option>`).join('')}</select><label class="date-filter">从<input type="date" id="from-date" value="${state.from}" aria-label="开始日期"></label><label class="date-filter">至<input type="date" id="to-date" value="${state.to}" aria-label="结束日期"></label><label class="toggle-label"><input type="checkbox" id="favorites-filter" ${state.favoritesOnly?'checked':''}>仅看收藏</label><label class="toggle-label"><input type="checkbox" id="filtered-toggle" ${state.showFiltered?'checked':''}>包含已过滤片段</label><button class="button button-quiet" data-action="reset-filters">重置搜索与日期</button></div><div class="archive-info"><span>${rows.length} 条匹配记录</span><span>按时间从近到远</span></div><div class="archive-list">${visible.map(row=>`<button class="archive-row" data-raw="${esc(row.id)}" aria-label="查看 ${esc(row.title || '原始记录')}"><span class="archive-date">${esc(row.date||stampDate(row.start))}<small>${stampTime(row.start)}</small></span><span><h3>${esc(row.title || '原始记录')}</h3><p>${esc(row.text || row.rawText || '查看原始内容')}</p><span class="archive-badges"><span>${sourceNames[row.source]||'记录'}</span>${categoryLabel(eventCategory(row))}${row.filteredReason?'<span class="filtered-badge">已过滤 · '+esc(row.filteredReason)+'</span>':''}${favoriteIds.has(String(row.id))?'<span>已收藏</span>':''}</span></span><span>↗</span></button>`).join('')||empty(state.from&&state.to&&state.from>state.to?'日期范围需要调整':'还没有找到这段记忆',state.from&&state.to&&state.from>state.to?'请选择早于结束日期的开始日期。':'试试其他关键词，或清除筛选条件。')}</div>${visible.length<rows.length?`<div style="text-align:center;margin-top:24px"><button class="button" data-action="load-more">再看一些 · 还有 ${rows.length-visible.length} 条</button></div>`:''}</section>`;
  }
  function favoriteRecords() {
    return [...favoriteIds].map(id=>{const row=eventById.get(String(id))||rawById.get(String(id));return row?{...row,favoriteKey:String(id),favoriteSource:eventById.has(String(id))?'event':'raw'}:null;}).filter(Boolean).sort((a,b)=>String(b.start).localeCompare(String(a.start)));
  }
  function updateFavoriteCount() {const count=document.getElementById('favorite-count');if(count)count.textContent=favoriteRecords().length;}
  function favoritesView() {
    const all=favoriteRecords(),q=state.favoriteQuery.trim().toLocaleLowerCase(),rows=all.filter(row=>!q||[row.title,row.text,row.rawText,row.date,stampDate(row.start)].some(value=>text(value).toLocaleLowerCase().includes(q)));
    return heading('KEPT FOR ANOTHER DAY','值得，再看一次','把想留住的片段放在这里，随时回来翻看。','<div class="heading-actions"><button class="button" data-action="latest">'+icon('book')+'去每日回顾</button></div>')+'<section class="favorites-page"><div class="favorites-intro"><span class="favorites-symbol">'+icon('bookmark')+'</span><div><strong>'+all.length+' <span>条收藏</span></strong><p>在记录详情中点击「收藏」，片段就会出现在这里。</p></div></div><div class="archive-toolbar"><label class="archive-search">'+icon('search')+'<input id="favorite-query" type="search" value="'+esc(state.favoriteQuery)+'" aria-label="搜索我的收藏" placeholder="在收藏中查找"></label>'+(q?'<button class="button" data-action="clear-favorite-search">清除搜索</button>':'')+'</div><div class="archive-info"><span>'+(q?rows.length+' 条匹配收藏':'按记录时间从近到远')+'</span><span>保存在当前浏览器</span></div><div class="favorite-list">'+(rows.map(row=>'<article class="favorite-card" data-favorite-card="'+esc(row.favoriteKey)+'"><button class="favorite-open" data-favorite-open="'+esc(row.favoriteKey)+'" aria-label="查看收藏 '+esc(row.title)+'"><span class="favorite-date">'+esc(row.date||stampDate(row.start))+'<span>'+stripTime(row)+'</span></span><h3>'+esc(plain(row.title||'收藏记录'))+'</h3><p>'+esc(plain(row.text||row.rawText||'打开查看完整内容'))+'</p><span class="favorite-meta">'+categoryLabel(row.category||eventCategory(row))+'<span>'+(sourceNames[row.source]||'记录')+'</span><span class="favorite-read">阅读全文 ↗</span></span></button><button class="favorite-remove" data-favorite-remove="'+esc(row.favoriteKey)+'" aria-label="取消收藏 '+esc(row.title)+'">'+icon('bookmark')+'<span>已收藏</span></button></article>').join('')||empty(q?'收藏里还没有这个片段':'把值得重读的片段，留在这里',q?'换一个词试试，或清除搜索。':'打开一条记录，点击详情里的「收藏」即可保存。',!q))+'</div></section>';
  }
  function getTopics() {
    if (Array.isArray(data.topics) && data.topics.length) return data.topics;
    return categories.map(category=>({id:category,title:category,events:allEvents.filter(e=>e.category===category)})).filter(t=>t.events.length);
  }
  function progressView() {
    const topics=getTopics();const selected=topics.find(t=>String(t.id)===state.topic);
    const events=selected ? [...(selected.events||[])].sort((a,b)=>String(b.start).localeCompare(String(a.start))) : [];
    return heading('THREADS OF YOUR DAYS','进展，慢慢发生','把相关的片段放在一起，回看一件事如何继续。',`<div class="heading-actions"><button class="button" data-action="favorites">${icon('bookmark')}我的收藏</button></div>`) + `<div class="topic-grid">${topics.map(topic=>{
      const entries=topic.events||[];const last=[...entries].sort((a,b)=>String(b.start).localeCompare(String(a.start)))[0];
      return `<button class="topic-card ${state.topic===String(topic.id)?'active':''}" data-topic="${esc(topic.id)}"><span class="topic-icon">${icon(topic.title.includes('学')?'book':topic.title.includes('创')?'spark':'progress')}</span><h2>${esc(topic.title)}</h2><p>${esc(topic.summary || '查看这个主题下的实际记录与计划。')}</p><div><span>${entries.length} 个片段</span><span>${last?esc(last.date || stampDate(last.start)):'暂无记录'} ↗</span></div></button>`;
    }).join('')||empty('暂时没有主题进展','有更多整理记录后，这里会显示相关的生活线索。')}</div>${selected?`<section class="topic-detail"><div class="section-title"><h2>${esc(selected.title)}的记录</h2><span class="record-total">按最近发生的记录排列</span></div><div class="archive-list">${events.map(event=>`<button class="archive-row" data-topic-event="${esc(event.id)}"><span class="archive-date">${esc(event.date||stampDate(event.start))}<small>${stampTime(event.start)}</small></span><span><h3>${esc(event.title)}</h3><p>${esc(event.text)}</p><span class="archive-badges">${categoryLabel(event.category)}<span>${esc(event.status||'已记录')}</span></span></span><span>↗</span></button>`).join('')||empty('这个主题暂时没有片段','可以选择其他主题。')}</div></section>`:''}`;
  }
  function render(preserveScroll = false) {
    const scroll = window.scrollY;
    const stripScroll = preserveScroll ? document.getElementById('day-strip-track')?.scrollLeft || 0 : 0;
    root.innerHTML = `<div class="page-enter">${state.view==='favorites'?favoritesView():state.view==='calendar'?calendarView():state.view==='archive'?archiveView():state.view==='progress'?progressView():dailyView()}</div>`;
    const reflection = root.querySelector('.reflection-card');
    if (reflection) {
      const entries = byDate.get(state.date)?.events || [];
      const plans = entries.filter(entry => entry.status === '计划');
      if (plans.length) {
        reflection.innerHTML = '<span class="eyebrow">当时记下的计划</span><div class="plan-list">' + plans.slice(0,3).map(entry => `<button data-event="${esc(entry.id)}">${esc(entry.title)}<span>↗</span></button>`).join('') + '</div><small>点击查看当时的原话</small><div class="reflection-rings" aria-hidden="true"></div>';
      } else if (entries.length) {
        const starts = entries.map(entry=>entry.start).filter(Boolean).sort();
        const ends = entries.map(entry=>entry.end || entry.start).filter(Boolean).sort();
        const last = ends.at(-1);
        const lastLabel = (stampDate(last) !== state.date ? stampDate(last).slice(5) + ' ' : '') + stampTime(last);
        reflection.innerHTML = '<span class="eyebrow">当天记录范围</span><p class="record-range">' + stampTime(starts[0]) + '<span>—</span>' + lastLabel + '</p><small>记录分布在这段时间内，点击时间轴核对。</small><div class="reflection-rings" aria-hidden="true"></div>';
      } else {
        reflection.innerHTML = '<span class="eyebrow">当天记录范围</span><p>这一天等待记录</p><button class="button" data-action="latest">查看最近记录 ↗</button>';
      }
    }
    document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===state.view;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
    document.getElementById('view-label').textContent = {daily:'每日回顾',calendar:'日历',archive:'全部记录',progress:'进展',favorites:'我的收藏'}[state.view];
    updateFavoriteCount();
    const strip = document.getElementById('day-strip-track');
    if (preserveScroll && strip) strip.scrollTo({left:stripScroll,behavior:'instant'});
    initDayStrip();
    window.scrollTo(0, preserveScroll ? scroll : 0);
  }
  function showDetail(row, source = 'event') {
    if (!row) return;
    detail = {...row,date:row.date||stampDate(row.start),detailSource:source}; detailTab='clean';if(!dialog.open)lastFocus=document.activeElement;
    document.getElementById('detail-title').textContent=plain(row.title||'记录详情');
    document.getElementById('detail-eyebrow').textContent=sourceNames[row.source]||'记录详情';
    document.getElementById('detail-meta').replaceChildren();
    for (const item of [dateLabel(detail.date),interval(row),row.status,row.filteredReason?'已过滤 · '+row.filteredReason:null].filter(Boolean)) {
      const span=document.createElement('span');span.textContent=item;document.getElementById('detail-meta').append(span);
    }
    document.getElementById('detail-sources').textContent='来源 ID · '+(row.sourceIds?.length?row.sourceIds.join(' / '):row.id);
    document.getElementById('detail-tabs').hidden=false;
    document.querySelector('.dialog-actions').hidden=false;
    document.getElementById('go-to-day').hidden=false;
    document.getElementById('favorite-record').hidden=false;
    renderDetail();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;document.getElementById('close-dialog').focus();
  }
  function detailContext(row) {
    const ids=new Set([row.id,...(row.sourceIds||[])].map(id=>rawById.get(String(id))?.id||String(id)));
    const synthesis=byDate.get(row.date||stampDate(row.start))?.synthesis;
    const related=entries=>(entries||[]).filter(entry=>entry.sourceIds.some(id=>ids.has(rawById.get(String(id))?.id||id)));
    const curated=eventById.get(row.id)||allEvents.find(e=>e.sourceIds?.some(id=>ids.has(rawById.get(String(id))?.id||id)));
    return {ids,overview:curated?.text||(!row.filteredReason?row.text:'')||'',sections:related(synthesis?.sections),progress:related(synthesis?.progress),nextActions:related(synthesis?.nextActions)};
  }
  function summaryCopy(row) {
    const content=detailContext(row);
    return [content.overview,...content.sections.flatMap(s=>[s.title,s.text]),...(content.progress.length?['当天进展',...content.progress.map(s=>s.text)]:[]),...(content.nextActions.length?['当时的后续安排',...content.nextActions.map(s=>s.text)]:[])].filter(Boolean).map(plain).join('\n\n');
  }
  function renderDetail() {
    document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===detailTab));
    const body=document.getElementById('detail-body');body.replaceChildren();body.classList.remove('sync-body');
    const add=(parent,title,content,formatted=true)=>{
      if(!content)return;
      const section=document.createElement('section');section.className='detail-summary-section';
      if(title){const h=document.createElement('h3');h.textContent=plain(title);section.append(h);}
      const block=document.createElement('div');block.className=formatted?'formatted-content':'transcript-text';
      if(formatted&&window.HeartballMarkdown)block.append(window.HeartballMarkdown.render(text(content)));else block.textContent=text(content);
      section.append(block);parent.append(section);return section;
    };
    if (detailTab==='raw') {
      const linked=(detail.sourceIds||[]).map(id=>rawById.get(String(id))).filter(Boolean);
      if(linked.length){linked.forEach(row=>add(body,(sourceNames[row.source]||'来源')+' · '+interval(row),row.rawText||'这条记录没有转写原文。',false));}
      else add(body,'转写原文',detail.rawText||'这条记录没有转写原文。',false);
    } else {
      const content=detailContext(detail),own=document.createElement('div');own.className='own-summary';body.append(own);
      const intro=document.createElement('p');intro.className='summary-method';intro.textContent='依据原始转写整理 · 保留事情、进展和有价值的交流';own.append(intro);
      add(own,'记录概览',content.overview||detail.filteredReason||'这段记录暂时没有可核实的内容，可切换到转写原文查看。');
      content.sections.forEach(section=>{
        const block=add(own,section.title,section.text),sources=document.createElement('div');sources.className='synthesis-sources';
        section.sourceIds.map(id=>rawById.get(String(id))).filter(Boolean).forEach(row=>{const button=document.createElement('button');button.className='source-link';button.dataset.relatedRaw=row.id;button.textContent=(sourceNames[row.source]||'来源')+' · '+stampTime(row.start)+' ↗';button.setAttribute('aria-label','核对来源：'+plain(row.title));sources.append(button);});
        if(block)block.append(sources);
      });
      const addPoints=(title,items)=>{if(!items.length)return;const section=document.createElement('section');section.className='detail-summary-section';const h=document.createElement('h3');h.textContent=title;const ul=document.createElement('ul');ul.className='detail-points';items.forEach(item=>{const li=document.createElement('li');li.textContent=plain(item.text);ul.append(li);});section.append(h,ul);own.append(section);};
      addPoints('当天进展',content.progress);addPoints('当时的后续安排',content.nextActions);
      const linked=(detail.sourceIds||[]).map(id=>rawById.get(String(id))).filter(Boolean);
      const references=detail.originalSummary?[{content:detail.originalSummary,label:'心力球自动摘要'}]:linked.filter(row=>row.originalSummary).map(row=>({content:row.originalSummary,label:'心力球自动摘要 · '+stampTime(row.start)}));
      if(references.length){const reference=document.createElement('details');reference.className='machine-summary';const label=document.createElement('summary');label.textContent='心力球自动摘要 · 参考';reference.append(label);references.forEach(item=>add(reference,item.label,item.content));body.append(reference);}
    }
    document.getElementById('favorite-record').innerHTML=icon('bookmark')+'<span>'+(favoriteIds.has(String(detail.favoriteKey || detail.id))?'已收藏':'收藏')+'</span>';
    document.getElementById('favorite-record').setAttribute('aria-pressed',favoriteIds.has(String(detail.favoriteKey || detail.id)));
  }
  function closeDetail() { dialog.close(); if(lastFocus?.isConnected)lastFocus.focus(); }
  function showSyncInfo() {
    if(window.HeartballSyncInfo)window.HeartballSyncInfo.open(data);
    else toast('同步信息模块未载入，请刷新页面后重试。');
  }
  function download(name, content, mime) {
    const url=URL.createObjectURL(new Blob([content],{type:mime}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  async function exportDay() {
    const day=byDate.get(state.date);if(!day){toast('这一天没有可导出的记录');return;}
    if(window.HeartballReport?.exportDay){try{await window.HeartballReport.exportDay({...day,date:state.date},data);toast('日报已导出');}catch(error){toast(error.message||'日报导出未完成，请重试。');}return;}
    toast('日报模块未加载，请刷新页面后重试。');
  }
  function exportAll() {
    download('心力日记_资料_'+stampDate(data.syncedAt)+'.json',JSON.stringify({...data,favorites:[...favoriteIds]},null,2),'application/json;charset=utf-8');toast('完整资料已导出');
  }
  function changeFavorite(id) {
    id=String(id);if(favoriteIds.has(id))favoriteIds.delete(id);else favoriteIds.add(id);
    try{localStorage.setItem(favoritesKey,JSON.stringify([...favoriteIds]));persistent=true;}catch{persistent=false;}
    if(detail&&dialog.open)renderDetail();render(true);
    toast(persistent?(favoriteIds.has(id)?'已加入我的收藏':'已取消收藏'):'本次收藏已保留，当前浏览器无法持久保存');
  }
  function toggleFavorite() {if(detail)changeFavorite(detail.favoriteKey||detail.id);}
  function initDayStrip() {
    const track=document.getElementById('day-strip-track');if(!track)return;
    const update=()=>{const previous=root.querySelector('[data-action="strip-prev"]'),next=root.querySelector('[data-action="strip-next"]');if(previous)previous.disabled=track.scrollLeft<=2;if(next)next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;};
    track.onscroll=update;requestAnimationFrame(update);
  }
  async function copyRecord() {
    if(!detail)return;const value=plain(detail.title)+'\n'+dateLabel(detail.date)+' '+interval(detail)+'\n\n'+(detailTab==='raw'?detail.rawText||document.getElementById('detail-body').textContent:summaryCopy(detail));
    try{await navigator.clipboard.writeText(value);toast('记录已复制');}catch{
      const area=document.createElement('textarea');area.value=value;area.style.cssText='position:fixed;opacity:0';dialog.append(area);area.select();const copied=document.execCommand('copy');area.remove();toast(copied?'记录已复制':'复制未成功，可在详情中选择文字复制');
    }
  }
  function setSearch(value, fromGlobal=false) {
    state.query=value;state.page=1;document.getElementById('global-query').value=value;
    if(fromGlobal){state.category='全部';state.source='all';state.from='';state.to='';state.favoritesOnly=false;state.showFiltered=true;setView('archive');return;}
    const active=document.getElementById('archive-query');
    const selection=[active?.selectionStart ?? value.length,active?.selectionEnd ?? value.length];
    render(true);const input=document.getElementById('archive-query');input?.focus();
    input?.setSelectionRange(selection[0],selection[1]);
  }
  document.getElementById('main-nav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;state.category='全部';setView(button.dataset.view);});
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();setView('daily');});
  document.getElementById('search-form').addEventListener('submit',event=>{event.preventDefault();setSearch(document.getElementById('global-query').value,true);});
  root.addEventListener('click',event=>{
    const remove=event.target.closest('[data-favorite-remove]');if(remove){changeFavorite(remove.dataset.favoriteRemove);return;}
    const favorite=event.target.closest('[data-favorite-open]');if(favorite){const row=favoriteRecords().find(item=>item.favoriteKey===favorite.dataset.favoriteOpen);showDetail(row,row?.favoriteSource);return;}
    const date=event.target.closest('[data-date]');if(date){selectDate(date.dataset.date);return;}
    const item=event.target.closest('[data-event]');if(item){showDetail(eventById.get(item.dataset.event));return;}
    const raw=event.target.closest('[data-raw]');if(raw){showDetail(rawById.get(raw.dataset.raw),'raw');return;}
    const topicEvent=event.target.closest('[data-topic-event]');if(topicEvent){showDetail(getTopics().flatMap(t=>t.events||[]).find(e=>String(e.id)===topicEvent.dataset.topicEvent));return;}
    const topic=event.target.closest('[data-topic]');if(topic){state.topic=topic.dataset.topic;render(true);root.querySelector('.topic-detail')?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
    const category=event.target.closest('[data-category]');if(category){state.category=category.dataset.category;render(true);return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(!action)return;
    switch(action){
      case 'today':selectDate(today);break;
      case 'latest':selectDate(latest);break;
      case 'calendar':setView('calendar');break;
      case 'today-month':state.month=today.slice(0,7);render(true);break;
      case 'month-prev':state.month=shiftMonth(state.month,-1);render(true);break;
      case 'month-next':state.month=shiftMonth(state.month,1);render(true);break;
      case 'export-day':exportDay();break;
      case 'export-all':exportAll();break;
      case 'load-more':state.page++;render(true);break;
      case 'favorites':setView('favorites');break;
      case 'clear-favorite-search':state.favoriteQuery='';render(true);document.getElementById('favorite-query')?.focus();break;
      case 'strip-prev':case 'strip-next':{const track=document.getElementById('day-strip-track');track?.scrollBy({left:(action==='strip-next'?1:-1)*Math.max(220,track.clientWidth*.75),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});break;}
      case 'reset-filters':Object.assign(state,{query:'',source:'all',category:'全部',from:'',to:'',favoritesOnly:false,showFiltered:false,page:1});document.getElementById('global-query').value='';render(true);break;
    }
  });
  function favoriteSearch(value) {
    state.favoriteQuery=value;const current=document.getElementById('favorite-query'),selection=[current?.selectionStart??value.length,current?.selectionEnd??value.length];render(true);const input=document.getElementById('favorite-query');input?.focus();input?.setSelectionRange(...selection);
  }
  root.addEventListener('input',event=>{if(event.isComposing)return;if(event.target.id==='archive-query')setSearch(event.target.value);if(event.target.id==='favorite-query')favoriteSearch(event.target.value);});
  root.addEventListener('compositionend',event=>{if(event.target.id==='archive-query')setSearch(event.target.value);if(event.target.id==='favorite-query')favoriteSearch(event.target.value);});
  root.addEventListener('change',event=>{
    if(event.target.id==='day-picker'){if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))selectDate(event.target.value);return;}
    const fields={'source-filter':'source','category-filter':'category','from-date':'from','to-date':'to','filtered-toggle':'showFiltered','favorites-filter':'favoritesOnly'};
    const field=fields[event.target.id];if(!field)return;state[field]=event.target.type==='checkbox'?event.target.checked:event.target.value;state.page=1;render(true);
  });
  document.getElementById('close-dialog').addEventListener('click',closeDetail);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDetail();}});
  document.getElementById('detail-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-tab]');if(tab&&detail){detailTab=tab.dataset.tab;renderDetail();}});
  document.getElementById('detail-body').addEventListener('click',event=>{const source=event.target.closest('[data-related-raw]');if(source)showDetail(rawById.get(source.dataset.relatedRaw),'raw');});
  document.getElementById('go-to-day').addEventListener('click',()=>{if(detail){const date=detail.date;closeDetail();selectDate(date);}});
  document.getElementById('favorite-record').addEventListener('click',toggleFavorite);
  document.getElementById('copy-record').addEventListener('click',copyRecord);
  document.getElementById('sync-info').addEventListener('click',showSyncInfo);
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!dialog.open&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();document.getElementById('global-query').focus();}});
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(['daily','calendar','archive','progress','favorites'].includes(view)&&view!==state.view){state.view=view;render();}});
  window.addEventListener('storage',event=>{if(event.key!==favoritesKey)return;try{favoriteIds=new Set(JSON.parse(event.newValue||'[]').map(String));}catch{return;}if(detail&&dialog.open)renderDetail();render(true);});
  window.addEventListener('resize',()=>initDayStrip());
  document.getElementById('archive-count').textContent=data.raw.length;
  document.getElementById('sidebar-stats').textContent=days.length+' 天 · '+data.raw.length+' 条记录';
  document.getElementById('footer-sync').textContent=data.syncedAt?'查询截至 '+stampDate(data.queryEnd||data.syncedAt)+' '+stampTime(data.queryEnd||data.syncedAt)+' · 北京时间':'等待导入或同步记录';
  render();
})();
