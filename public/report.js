/* Offline A4 PDF export; Chinese pages are embedded as high-resolution images. */
(() => {
  'use strict';
  const W=794,H=1123,M=62,BOTTOM=1045,SCALE=2;
  const C={ink:'#1c304b',text:'#304052',muted:'#697586',line:'#dce1e7',gold:'#ae7b3d'};
  const FONT='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Noto Sans SC",sans-serif';
  const enc=new TextEncoder(),arr=value=>Array.isArray(value)?value:[],str=value=>value==null?'':String(value);
  function plain(value){
    if(window.HeartballMarkdown?.plain)return window.HeartballMarkdown.plain(str(value)).trim();
    return str(value).replace(/^\s{0,3}#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/`([^`]+)`/g,'$1').trim();
  }
  function stamp(value){
    if(value==null||value==='')return '';
    const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  }
  function period(row,full=false){
    const start=stamp(row.start),end=stamp(row.end);if(!start)return '时间未标注';
    return (full?start:start.slice(11))+(end&&end!==start?' - '+(start.slice(0,10)===end.slice(0,10)?end.slice(11):end.slice(5)):'');
  }
  function validate(day){
    if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(str(day.date))||stamp(day.date+'T12:00:00+08:00').slice(0,10)!==day.date)throw new Error('请先选择有效的日报日期。');
  }
  function catalog(day,data){
    const rows=new Map(),s=day.synthesis||{};
    for(const row of arr(data?.raw))for(const alias of [row.id,row.sourceId,row.originalId,str(row.id).replace(/^(memory|note)-/,'')])if(alias!=null)rows.set(str(alias),row);
    const ids=[...new Set([...arr(s.sourceIds),...arr(s.sections).flatMap(item=>arr(item.sourceIds)),...arr(s.progress).flatMap(item=>arr(item.sourceIds)),...arr(s.nextActions).flatMap(item=>arr(item.sourceIds)),...arr(day.events).flatMap(item=>arr(item.sourceIds).length?item.sourceIds:[item.id])].filter(Boolean).map(id=>str(rows.get(str(id))?.id||id)))];
    return ids.map((id,index)=>({id,number:index+1,row:rows.get(id)}));
  }
  class Layout{
    constructor(date){this.date=date;this.pages=[];this.records=[];this.page(true);}
    font(size=17,weight=400){this.ctx.font=`${weight} ${size}px ${FONT}`;this.ctx.textBaseline='top';}
    text(value,x,y,size=17,color=C.text,weight=400){this.font(size,weight);this.ctx.fillStyle=color;this.ctx.fillText(value,x,y);this.records.push({page:this.pageIndex+1,text:value,x,y,size});}
    page(first=false){
      const canvas=document.createElement('canvas');canvas.width=W*SCALE;canvas.height=H*SCALE;
      this.ctx=canvas.getContext('2d',{alpha:false});if(!this.ctx)throw new Error('当前浏览器无法创建日报画布。');
      this.ctx.scale(SCALE,SCALE);this.ctx.fillStyle='#ffffff';this.ctx.fillRect(0,0,W,H);this.pages.push(canvas);this.pageIndex=this.pages.length-1;this.y=88;
      if(first){
        const [year,month,day]=this.date.split('-').map(Number);
        this.text('心力日记  /  每日报告',M,52,14,C.muted,500);this.text(`${year} 年 ${month} 月 ${day} 日`,M,91,32,C.ink,600);
        const weekday=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',weekday:'long'}).format(new Date(this.date+'T12:00:00+08:00'));
        this.text(weekday+'  ·  从记录，看见生活',M,139,15,C.muted);this.ctx.fillStyle=C.gold;this.ctx.fillRect(M,176,44,3);this.ctx.fillStyle=C.line;this.ctx.fillRect(M+54,177,W-M*2-54,1);this.y=201;
      }else{
        this.text('心力日记  /  每日报告',M,39,12,C.muted,500);this.font(12);this.text(this.date,W-M-this.ctx.measureText(this.date).width,39,12,C.muted);this.ctx.fillStyle=C.line;this.ctx.fillRect(M,65,W-M*2,1);
      }
    }
    ensure(height){if(this.y+height>BOTTOM)this.page();}
    lines(value,width,size=17,weight=400){
      this.font(size,weight);const output=[];
      for(const paragraph of plain(value).replace(/\r/g,'').split('\n')){
        if(!paragraph.trim()){if(output.length&&output.at(-1)!=='')output.push('');continue;}
        let line='';
        for(const character of Array.from(paragraph.trim())){
          const next=line+character;
          if(line&&this.ctx.measureText(next).width>width-size){
            if(/^[，。！？、；：）》】」』”’…,.!?;:)\]}]/.test(character)&&this.ctx.measureText(next).width<=width){output.push(next);line='';continue;}
            const space=line.lastIndexOf(' '),tail=space>=0?line.slice(space+1):'';
            if(space>line.length/2&&/^[A-Za-z0-9][A-Za-z0-9_./:@-]*$/.test(tail+character)){output.push(line.slice(0,space));line=tail+character;}
            else{output.push(line);line=character;}
          }else line=next;
        }
        if(line)output.push(line);
      }
      return output;
    }
    paragraph(value,options={}){
      const {size=17,lineHeight=29,color=C.text,indent=0,after=15,weight=400}=options;
      const lines=this.lines(value,W-M*2-indent,size,weight);if(!lines.length)return;
      if(lines.length<=4)this.ensure(lines.reduce((sum,line)=>sum+(line?lineHeight:lineHeight/2),0));
      for(const line of lines){const height=line?lineHeight:lineHeight/2;this.ensure(height);if(line)this.text(line,M+indent,this.y,size,color,weight);this.y+=height;}
      this.y+=after;
    }
    heading(value,number=''){
      const lines=this.lines(value,W-M*2-42,21,600);this.ensure(lines.length*32+74);this.y+=9;this.ctx.fillStyle=C.gold;this.ctx.fillRect(M,this.y+4,3,20);
      if(number)this.text(number,M+13,this.y+3,13,C.gold,600);
      for(const line of lines){this.text(line,M+(number?41:16),this.y,21,C.ink,600);this.y+=32;}this.y+=12;
    }
    references(ids,sources){
      const numbers=[...new Set(arr(ids).map(id=>sources.find(row=>row.id===str(id))?.number).filter(Boolean))];
      if(numbers.length)this.paragraph('来源 '+numbers.map(number=>`[${number}]`).join(' '),{size:12,lineHeight:20,color:C.muted,after:17});
    }
    timeline(events){
      for(const event of events){
        const title=this.lines(event.title||'未命名记录',W-M*2-151,16,500),times=this.lines(period(event),132,13),meta=[event.category,event.status].filter(Boolean).join(' · ');
        const height=Math.max(title.length*26+(meta?24:0),times.length*23)+19;this.ensure(height);const top=this.y;
        times.forEach((line,index)=>this.text(line,M,top+index*23+2,13,C.muted));title.forEach((line,index)=>this.text(line,M+151,top+index*26,16,C.text,500));
        if(meta)this.text(meta,M+151,top+title.length*26+2,12,C.muted);this.y+=height;this.ctx.fillStyle=C.line;this.ctx.fillRect(M,this.y-8,W-M*2,0.7);
      }this.y+=8;
    }
    sourceCatalog(sources){
      const gap=28,width=(W-M*2-gap)/2;
      for(let index=0;index<sources.length;index+=2){
        const cells=sources.slice(index,index+2).map(source=>{
          const row=source.row,name=row?.source==='note'?'随口记':row?.source==='memory'?'全时记':'原始记录';
          const label=this.lines(`[${source.number}] ${name}${row?' · '+period(row,true):''}`,width,12),id=this.lines(source.id,width,10);
          return {label,id,height:label.length*21+id.length*18+15};
        });
        const height=Math.max(...cells.map(cell=>cell.height));this.ensure(height);const top=this.y;
        cells.forEach((cell,column)=>{const x=M+column*(width+gap);cell.label.forEach((line,i)=>this.text(line,x,top+i*21,12,C.text));cell.id.forEach((line,i)=>this.text(line,x,top+cell.label.length*21+i*18,10,C.muted));});
        this.y+=height;
      }
    }
    finish(){
      for(let index=0;index<this.pages.length;index++){
        this.ctx=this.pages[index].getContext('2d');this.pageIndex=index;this.ctx.fillStyle=C.line;this.ctx.fillRect(M,1070,W-M*2,1);this.text('依据原始记录整理  ·  北京时间',M,1084,11,C.muted);
        const label=`${index+1} / ${this.pages.length}`;this.font(11);this.text(label,W-M-this.ctx.measureText(label).width,1084,11,C.muted);
      }return this.pages;
    }
  }
  async function pageImage(canvas){
    if(typeof CompressionStream==='function'){
      const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,rgb=new Uint8Array(canvas.width*canvas.height*3);
      for(let source=0,target=0;source<rgba.length;source+=4){rgb[target++]=rgba[source];rgb[target++]=rgba[source+1];rgb[target++]=rgba[source+2];}
      const stream=new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));return {bytes:new Uint8Array(await new Response(stream).arrayBuffer()),filter:'FlateDecode'};
    }
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.97));if(!blob)throw new Error('日报图像生成失败，请重试。');return {bytes:new Uint8Array(await blob.arrayBuffer()),filter:'DCTDecode'};
  }
  function unicodeHex(value){let output='FEFF';for(let index=0;index<value.length;index++)output+=value.charCodeAt(index).toString(16).padStart(4,'0');return output;}
  async function encodePdf(pages,date,onProgress){
    const chunks=[],offsets=[0];let position=0;
    function append(value){const bytes=typeof value==='string'?enc.encode(value):value;chunks.push(bytes);position+=bytes.length;}
    function object(id,content){offsets[id]=position;append(`${id} 0 obj\n${content}\nendobj\n`);}
    function stream(id,dictionary,bytes){offsets[id]=position;append(`${id} 0 obj\n<< ${dictionary} /Length ${bytes.length} >>\nstream\n`);append(bytes);append('\nendstream\nendobj\n');}
    append(new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${4+i*3} 0 R`).join(' ')}] >>`);
    object(3,`<< /Title <${unicodeHex(date+' 心力日记 · 每日报告')}> /Creator (Heartball Diary) /Producer (Heartball local PDF exporter) >>`);
    for(let index=0;index<pages.length;index++){
      const canvas=pages[index],image=await pageImage(canvas),id=4+index*3;
      object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im0 ${id+2} 0 R >> >> /Contents ${id+1} 0 R >>`);
      stream(id+1,'',enc.encode('q\n595.276 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n'));
      stream(id+2,`/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter}`,image.bytes);
      onProgress?.(index+1,pages.length);await new Promise(resolve=>setTimeout(resolve,0));
    }
    const xref=position,count=4+pages.length*3;append(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for(let index=1;index<count;index++)append(String(offsets[index]).padStart(10,'0')+' 00000 n \n');
    append(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);return new Blob(chunks,{type:'application/pdf'});
  }
  async function createDayPdf(day,data,options={}){
    validate(day);if(document.fonts?.ready)await document.fonts.ready;
    const layout=new Layout(day.date),synthesis=day.synthesis||{},sources=catalog(day,data),coverage=day.coverage||{},counts=[];
    if(Number.isFinite(coverage.memoryCount))counts.push(`全时记 ${coverage.memoryCount} 段`);if(Number.isFinite(coverage.noteCount))counts.push(`随口记 ${coverage.noteCount} 条`);
    if(Number.isFinite(coverage.reviewedSourceCount)&&Number.isFinite(coverage.sourceCount))counts.push(`已整理 ${coverage.reviewedSourceCount} / ${coverage.sourceCount} 个来源`);
    if(counts.length)layout.paragraph(counts.join('  ·  '),{size:13,lineHeight:23,color:C.muted,after:13});
    if(day.date===stamp(new Date()).slice(0,10))layout.paragraph('当天尚未结束，以下内容截至本次取得的记录。',{size:13,lineHeight:23,color:C.gold,after:11});
    layout.heading('一天概览');layout.paragraph(synthesis.overview||day.review||'这一天还没有已整理的回顾。取得原始记录并完成整理后，可以再次导出日报。');
    arr(synthesis.sections).forEach((section,index)=>{if(!plain(section.text))return;layout.heading(section.title||'当天事项',String(index+1).padStart(2,'0'));layout.paragraph(section.text,{after:5});layout.references(section.sourceIds,sources);});
    function points(title,values){const items=arr(values).filter(item=>plain(item.text));if(!items.length)return;layout.heading(title);for(const item of items){layout.paragraph('• '+plain(item.text),{indent:5,after:3});layout.references(item.sourceIds,sources);}}
    points('当天进展',synthesis.progress);points('当时的后续安排',synthesis.nextActions);
    const events=[...arr(day.events)].sort((a,b)=>str(a.start).localeCompare(str(b.start)));if(events.length){layout.heading('一天的时间线');layout.timeline(events);}
    layout.heading('记录范围与依据');if(plain(synthesis.coverageNote))layout.paragraph(synthesis.coverageNote,{size:14,lineHeight:25,color:C.muted,after:9});
    const query=stamp(data?.queryEnd||data?.syncedAt);if(query)layout.paragraph('查询截至：'+query+'（北京时间）',{size:13,lineHeight:23,color:C.muted,after:9});
    if(sources.length){
      if(sources.length>2){layout.ensure(90);layout.paragraph('下列编号对应本报告引用的原始来源，可在日记网站中核对完整转写。',{size:13,lineHeight:23,color:C.muted,after:12});}
      layout.sourceCatalog(sources);
    }else layout.paragraph('尚无可引用的原始来源。本报告不补写没有记录的经历。',{size:13,lineHeight:23,color:C.muted});
    const pages=layout.finish(),blob=await encodePdf(pages,day.date,options.onProgress),result={blob,filename:'心力日记_日报_'+day.date+'.pdf',pageCount:pages.length};
    if(options.inspect)result.layout=layout.records;pages.forEach(canvas=>{canvas.width=0;canvas.height=0;});return result;
  }
  let busy=false;
  async function exportDay(day,data){
    if(busy)throw new Error('日报正在生成，请稍候。');busy=true;const announce=detail=>window.dispatchEvent(new CustomEvent('heartball-report-progress',{detail}));announce({state:'building'});
    try{
      const result=await createDayPdf(day,data,{onProgress:(page,total)=>announce({state:'building',page,total})}),url=URL.createObjectURL(result.blob),link=document.createElement('a');
      link.href=url;link.download=result.filename;link.style.display='none';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);announce({state:'done',pageCount:result.pageCount});return {filename:result.filename,pageCount:result.pageCount};
    }catch(error){announce({state:'error',message:error.message});throw error;}finally{busy=false;}
  }
  window.HeartballReport=Object.freeze({createDayPdf,exportDay});
})();
