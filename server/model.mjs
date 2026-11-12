import {createHash} from 'node:crypto';

export const bj = value => new Date(Number(value) + 28800000).toISOString().replace('Z', '+08:00');
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate=value=>datePattern.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function rawDates(row){
  if(Array.isArray(row.dates)&&row.dates.length){if(row.dates.some(d=>!validDate(d)))throw new Error('来源跨日日期无效');return [...new Set(row.dates)].sort();}
  return [bj(Date.parse(row.start)).slice(0,10)];
}
const string = (v, max = 2000000) => {
  if (typeof v !== 'string' || v.length > max) throw new Error('文字字段格式或长度不正确');
  return v;
};
export function decoded(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {text: String(value || '')}; }
}
export function emptyData() {
  return {schemaVersion:2, syncedAt:null, today:bj(Date.now()).slice(0,10), stats:{rawCount:0,filteredCount:0,noteCount:0,memoryCount:0,eventCount:0,dayCount:0,reviewedSourceCount:0}, days:[],raw:[],topics:[]};
}
export function sourceRows(source) {
  return ['memory','note'].flatMap(kind => (source[kind] || []).map(row => {
    const originalId = String(kind === 'memory' ? row.sessionId : row.asrId);
    if (!originalId || originalId === 'undefined') throw new Error('来源缺少稳定 ID');
    const start = Number(row.startTime ?? row.createTime);
    const end = Number(row.endTime ?? start);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('来源时间无效');
    const sentences = kind === 'memory' ? (row.results || []).flatMap((result, ri) => (result.sentences || []).map((s, si) => ({...s,resultIndex:ri,sentenceIndex:si}))) : [];
    const dates = [...new Set([bj(start).slice(0,10), ...sentences.filter(s => s.text?.trim()).map(s => bj(Number(s.startTime ?? start)).slice(0,10))])].sort();
    return {id:`${kind}-${originalId}`, originalId, kind, row, start, end, dates, sentences, sourceHash:hash(row)};
  })).sort((a,b) => a.start-b.start || a.id.localeCompare(b.id));
}
export function transcript(r) {
  if (r.kind === 'note') return String(decoded(r.row.asrText).text || decoded(r.row.asrText).asrText || '');
  return r.sentences.map(s => `[${bj(Number(s.startTime ?? r.start))}] 结果${s.resultIndex} #${s.sentenceIndex} 说话人${s.speaker ?? '未标注'} isHost=${s.isHost ?? '未知'}：${s.text || ''}`).join('\n');
}
export function rawRecord(r) {
  const summary = r.kind === 'note' ? decoded(r.row.llmText) : null;
  const originalTitle = r.kind === 'note' ? summary.topic || '' : (r.row.results || []).map(x => x.title || '').filter(Boolean).join(' / ');
  const originalSummary = r.kind === 'note' ? [summary.smoothed_text, summary.structured_content].filter(Boolean).join('\n\n') : (r.row.results || []).map(x => x.summaryMarkdown || x.brief || '').filter(Boolean).join('\n\n');
  const rawText = transcript(r);
  return {id:r.id, sourceId:r.originalId, date:bj(r.start).slice(0,10), start:bj(r.start),end:bj(r.end),source:r.kind,title:originalTitle || '待整理记录',text:rawText.slice(0,240),rawText,originalTitle,originalSummary,reviewDisposition:'pending',filteredReason:null,category:'其他',sourceHash:r.sourceHash,dates:r.dates};
}
export function pendingDataset(source, previous = emptyData()) {
  const rows = sourceRows(source);
  const previousRaw = new Map(previous.raw.map(r => [r.id,r]));
  const rowIds=new Set(rows.map(r=>r.id));
  const unchanged = new Set([...previous.raw.filter(r=>!rowIds.has(r.id)&&r.reviewDisposition!=='pending').map(r=>r.id), ...rows.filter(r => previousRaw.get(r.id)?.sourceHash === r.sourceHash && previousRaw.get(r.id)?.reviewDisposition !== 'pending').map(r => r.id)]);
  // Imported archives may not have the service's original JSON. Retain these raw
  // rows and their reviewed dates when a later bounded MCP query omits them.
  const raw = [...previous.raw.filter(r=>!rowIds.has(r.id)),...rows.map(r => unchanged.has(r.id) ? previousRaw.get(r.id) : rawRecord(r))].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const dates = [...new Set([...previous.days.map(d=>d.date),...rows.flatMap(r => r.dates)])].sort();
  const previousDays = new Map(previous.days.map(d => [d.date,d]));
  const days = dates.map(date => {
    const old = previousDays.get(date);
    const sources = rows.filter(r => r.dates.includes(date));
    const archiveRows=raw.filter(r=>(r.dates||[r.date]).includes(date)||(!rowIds.has(r.id)&&old?.synthesis?.sourceIds?.includes(r.id)));
    const ids = archiveRows.map(r => r.id);
    const keep = old && ids.every(id => unchanged.has(id)) && JSON.stringify([...old.synthesis.sourceIds].sort()) === JSON.stringify([...ids].sort());
    if (keep) return old;
    return {date,review:'原始记录已同步，等待依据全天原话整理每日回顾。',synthesis:{overview:'原始记录已同步，等待依据全天原话整理每日回顾。',sections:[],progress:[],nextActions:[],sourceIds:ids,coverageNote:'已保存全部返回原文。请使用随包 Skill 整理并导入回顾；未返回的时段不代表没有活动。'},coverage:{sourceCount:ids.length,reviewedSourceCount:0,memoryCount:archiveRows.filter(r=>r.source==='memory').length,noteCount:archiveRows.filter(r=>r.source==='note').length,sentenceCount:sources.reduce((n,r)=>n+r.sentences.filter(s=>bj(Number(s.startTime??r.start)).slice(0,10)===date).length,0)},events:[],rawCount:raw.filter(r=>r.date===date).length,filteredCount:0};
  });
  const topics = previous.topics.map(t => ({...t,events:t.events.filter(e => unchanged.has(e.sourceIds?.[0] || e.id))})).filter(t=>t.events.length);
  return {...emptyData(),syncedAt:source.end ? bj(source.end):null,raw,days,topics,stats:{rawCount:raw.length,filteredCount:raw.filter(r=>r.filteredReason).length,noteCount:raw.filter(r=>r.source==='note').length,memoryCount:raw.filter(r=>r.source==='memory').length,eventCount:days.reduce((n,d)=>n+d.events.length,0),dayCount:days.length,reviewedSourceCount:raw.filter(r=>r.reviewDisposition!=='pending').length}};
}
export function validateDataset(input) {
  if (!input || input.schemaVersion !== 2 || !Array.isArray(input.raw) || !Array.isArray(input.days) || !Array.isArray(input.topics)) throw new Error('需要 schemaVersion:2 的完整日记资料');
  if (input.raw.length > 50000 || input.days.length > 36600) throw new Error('导入资料过大');
  const data = JSON.parse(JSON.stringify(input));
  const ids = new Set();const aliases=new Map();
  for (const r of data.raw) {
    string(r.id,200); if (!r.id || ids.has(r.id)) throw new Error('来源 ID 重复或为空'); ids.add(r.id);
    if (!['memory','note'].includes(r.source) || !validDate(r.date)) throw new Error('来源类型或日期无效');
    if (!Number.isFinite(Date.parse(r.start)) || !Number.isFinite(Date.parse(r.end)) || Date.parse(r.end)<Date.parse(r.start)) throw new Error('来源时间无效');
    string(r.title,5000);string(r.text);string(r.rawText);string(r.originalSummary || '');
    if(!['included','context','filtered','pending'].includes(r.reviewDisposition))throw new Error('来源审阅状态无效');
    const possibleAliases=[r.id,r.sourceId,r.originalId,r.id.replace(/^(memory|note)-/,'')].filter(Boolean);
    const startDate=bj(Date.parse(r.start)).slice(0,10),endDate=bj(Date.parse(r.end)).slice(0,10);
    // Older exports omit sentence-level dates. Retain their already referenced
    // cross-day material without claiming that silent recording tails have text.
    if(!Array.isArray(r.dates)||!r.dates.length)r.dates=[...new Set([r.date,...data.days.filter(d=>Array.isArray(d.synthesis?.sourceIds)&&d.synthesis.sourceIds.some(id=>possibleAliases.includes(id))&&d.date>=startDate&&d.date<=endDate).map(d=>d.date)])].sort();
    r.dates=rawDates(r);if(r.dates.some(d=>d<startDate||d>endDate))throw new Error('来源跨日日期超出录音时段');
    if(!r.dates.includes(r.date))throw new Error('来源日期未包含记录开始日');
    for(const alias of [r.id,r.sourceId,r.originalId,r.id.replace(/^(memory|note)-/,'')].filter(Boolean)) {if(aliases.has(alias)&&aliases.get(alias)!==r.id)aliases.set(alias,null);else aliases.set(alias,r.id);}
  }
  const dates = new Set();
  const checkRefs = refs => {if(!Array.isArray(refs))throw new Error('摘要引用格式无效');const result=refs.map(id=>ids.has(id)?id:aliases.get(id));if(result.some(id=>!id))throw new Error('摘要引用不存在或含糊的来源');return [...new Set(result)];};
  for (const d of data.days) {
    if (!validDate(d.date) || dates.has(d.date)) throw new Error('每日日期重复或无效');dates.add(d.date);
    if (!d.synthesis || !Array.isArray(d.events)) throw new Error('缺少每日回顾或事件');
    string(d.synthesis.overview);if(!d.synthesis.overview.trim())throw new Error('每日概览不能为空');d.synthesis.sourceIds=checkRefs(d.synthesis.sourceIds);
    const expected=data.raw.filter(r=>r.dates.includes(d.date));
    if(JSON.stringify([...d.synthesis.sourceIds].sort())!==JSON.stringify(expected.map(r=>r.id).sort()))throw new Error('每日回顾未覆盖当天全部来源');
    for (const name of ['sections','progress','nextActions']) {
      if (!Array.isArray(d.synthesis[name])) throw new Error('每日回顾结构无效');
      for (const p of d.synthesis[name]) {string(p.text);p.sourceIds=checkRefs(p.sourceIds);if (!p.sourceIds.length || p.sourceIds.some(id=>!d.synthesis.sourceIds.includes(id))) throw new Error('回顾要点缺少当天来源');}
    }
    for (const e of d.events) {string(e.id,200);string(e.title,5000);string(e.text);e.sourceIds=checkRefs(e.sourceIds);if(!e.sourceIds.length||e.sourceIds.some(id=>!d.synthesis.sourceIds.includes(id)))throw new Error('来源事件未引用当天来源');if(!Number.isFinite(Date.parse(e.start))||!Number.isFinite(Date.parse(e.end))||Date.parse(e.end)<Date.parse(e.start))throw new Error('来源事件时间无效');if(!Array.isArray(e.topics))throw new Error('来源事件主题无效');}
    d.review=d.synthesis.overview;
    d.coverage={sourceCount:expected.length,reviewedSourceCount:expected.filter(r=>r.reviewDisposition!=='pending').length,memoryCount:expected.filter(r=>r.source==='memory').length,noteCount:expected.filter(r=>r.source==='note').length,sentenceCount:Number.isInteger(d.coverage?.sentenceCount)&&d.coverage.sentenceCount>=0?d.coverage.sentenceCount:0};
  }
  if(data.raw.some(r=>r.dates.some(date=>!dates.has(date))))throw new Error('每日回顾遗漏来源日期');
  for (const t of data.topics) {string(t.id,5000);string(t.title,5000);string(t.summary||'');if(!Array.isArray(t.events))throw new Error('主题结构无效');for(const e of t.events)e.sourceIds=checkRefs(e.sourceIds);}
  if (data.syncedAt && !Number.isFinite(Date.parse(data.syncedAt))) throw new Error('同步时间无效');
  data.stats={rawCount:data.raw.length,filteredCount:data.raw.filter(r=>r.filteredReason).length,noteCount:data.raw.filter(r=>r.source==='note').length,memoryCount:data.raw.filter(r=>r.source==='memory').length,eventCount:data.days.reduce((n,d)=>n+d.events.length,0),dayCount:data.days.length,reviewedSourceCount:data.raw.filter(r=>r.reviewDisposition&&r.reviewDisposition!=='pending').length};
  return data;
}
export function reviewPacket(source, dataset) {
  return {format:'heartball-review-packet-v1',queryEnd:source.end || null,instructions:'依据所有sentences/asrText独立整理；自动摘要只作参考；按北京时间区分跨日，区分本人/他人/背景、完成/计划。导入完整schemaVersion2资料，保留全部raw及来源ID。',source:source,sourceIndex:sourceRows(source).map(r=>({id:r.id,sourceHash:r.sourceHash,dates:r.dates,sentenceCount:r.sentences.length})),dataset};
}
