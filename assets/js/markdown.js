'use strict';
// Local, bounded Markdown renderer. User HTML and executable URLs remain plain text.
window.Markdown=(()=>{
 const e=App.esc;let sequence=0;
 const labels={definition:'Определение',important:'Важно',example:'Пример',question:'К экзамену',note:'Заметка',summary:'Краткий итог',rule:'Правило',warning:'Обратите внимание',tip:'Подсказка',mistake:'Частая ошибка',answer:'Ответ',task:'Задание',remember:'Запомнить',translation:'Перевод',pronunciation:'Произношение',source:'Источник',formula:'Формула',compare:'Сравнение',steps:'По шагам',timeline:'Хронология',dialogue:'Диалог',terms:'Термины',verse:'Текст для разбора'};
 function inline(raw,ctx,depth=0,notes=true){
  raw=String(raw).replace(/\u0000/g,'');if(depth>6)return e(raw);const tokens=[],codeRaw=[];const hold=html=>'\u0000'+(tokens.push(html)-1)+'\u0000';
  raw=raw.replace(/`([^`\n]+)`/g,(_,v)=>{codeRaw[tokens.length]=v;return hold('<code>'+e(v)+'</code>')});
  raw=raw.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,text,url)=>hold('<a href="'+e(url)+'" target="_blank" rel="noopener noreferrer">'+inline(text.replace(/\u0000(\d+)\u0000/g,(_,i)=>'`'+codeRaw[+i]+'`'),ctx,depth+1,false)+'</a>'));
  if(notes)raw=raw.replace(/\[\^([A-Za-z0-9_-]{1,40})\]/g,(all,key)=>{if(!ctx.notes.has(key))return all;if(!ctx.used.includes(key))ctx.used.push(key);const n=ctx.used.indexOf(key)+1,id=ctx.prefix+'-ref-'+key+'-'+(++ctx.ref);ctx.refs[key]??=[];ctx.refs[key].push(id);return hold(`<sup class="md-note-ref"><a id="${id}" href="#${ctx.prefix}-note-${key}" aria-label="Сноска ${n}">${n}</a></sup>`)});
  let s=e(raw);
  for(const [pattern,tag] of [[/\*\*([^*\n]+)\*\*/g,'strong'],[/~~([^~\n]+)~~/g,'del'],[/\+\+([^+\n]+)\+\+/g,'u'],[/==([^=\n]+)==/g,'mark'],[/\*([^*\n]+)\*/g,'em'],[/\^([^\^\n]+)\^/g,'sup'],[/~([^~\n]+)~/g,'sub']])s=s.replace(pattern,'<'+tag+'>$1</'+tag+'>');
  s=s.replace(/\{\{([^{}\n]+)\}\}/g,'<kbd>$1</kbd>').replace(/\{tag:([^{}\n]+)\}/g,'<span class="md-tag">$1</span>');
  // Multiple passes restore tokens held inside link labels without exposing raw HTML.
  for(let j=0;j<8&&/\u0000\d+\u0000/.test(s);j++)s=s.replace(/\u0000(\d+)\u0000/g,(_,i)=>tokens[+i]||'');
  return s;
 }
 const cells=l=>l.trim().replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(v=>v.trim().replace(/\\\|/g,'|'));
 const separator=l=>{const a=cells(l||'');return a.length>0&&a.every(x=>/^:?-{3,}:?$/.test(x))};
 const item=l=>l.match(/^(\s*)([-*]|\d+[.)])\s+(.+)$/);
 function blocks(lines,ctx,depth=0){
  if(depth>10)return '<p>'+e(lines.join('\n'))+'</p>';let out=[],i=0;
  const inf=t=>inline(t,ctx);
  function list(indent,level=0){let first=item(lines[i]),ordered=/\d/.test(first[2]),tag=ordered?'ol':'ul',start=ordered?Math.min(100000,parseInt(first[2],10)):1,parts=[];
   while(i<lines.length){let m=item(lines[i]);if(!m||m[1].length!==indent||/\d/.test(m[2])!==ordered)break;
    const task=m[3].match(/^\[([ xX])\]\s+(.*)$/);let content=task?`<span class="md-checkbox" role="img" aria-label="${task[1]===' '?'Не выполнено':'Выполнено'}">${task[1]===' '?'○':'✓'}</span><span>${inf(task[2])}</span>`:inf(m[3]);i++;
    while(i<lines.length){let child=item(lines[i]);if(child&&child[1].length>indent){if(level+depth>=8){content+='<br>'+inf(child[3]);i++}else content+=list(child[1].length,level+1);continue}if(lines[i].trim()&&!child&&/^\s+/.test(lines[i])&&lines[i].match(/^\s*/)[0].length>indent){content+='<br>'+inf(lines[i].trim());i++;continue}break}
    parts.push('<li'+(task?' class="md-task '+(task[1]===' '?'':'checked')+'"':'')+'>'+content+'</li>');
   }return '<'+tag+(ordered&&start!==1?' start="'+start+'"':'')+'>'+parts.join('')+'</'+tag+'>';
  }
  const special=(line,next)=>/^(#{1,6}\s|:::|>|```|\s*(?:[-*]|\d+[.)])\s|\s*---+\s*$)/.test(line)||(line.includes('|')&&separator(next))||(next&&/^:\s+/.test(next));
  while(i<lines.length){let l=lines[i];if(!l.trim()){i++;continue}
   if(/^```/.test(l)){const lang=l.slice(3).trim();let code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;out.push('<div class="md-code">'+(lang?'<div class="md-code-label">'+e(lang.slice(0,40))+'</div>':'')+'<pre><code>'+e(code.join('\n'))+'</code></pre></div>');continue}
   const block=l.match(/^:::([a-z]+)(?:\s+(.+))?\s*$/);
   if(block&&(Object.hasOwn(labels,block[1])||['details','columns'].includes(block[1]))){const kind=block[1],title=block[2]?.trim()||labels[kind]|| (kind==='details'?'Подробнее':'Сравнение');let b=[],nest=1,fenced=false;i++;
    while(i<lines.length){let line=lines[i++];if(/^```/.test(line))fenced=!fenced;if(!fenced){if(/^:::[a-z]+(?:\s|$)/.test(line))nest++;if(line.trim()===':::'){nest--;if(!nest)break}}b.push(line)}
    if(kind==='details')out.push('<details class="md-details"><summary>'+inf(title)+'</summary><div>'+blocks(b,ctx,depth+1)+'</div></details>');
    else if(kind==='columns'){let parts=[[]],n=0,code=false;for(const line of b){if(/^```/.test(line))code=!code;if(!code){if(/^:::[a-z]+(?:\s|$)/.test(line))n++;if(line.trim()===':::')n--}if(!code&&n===0&&line.trim()==='|||'&&parts.length<3)parts.push([]);else parts.at(-1).push(line)}out.push('<section class="md-comparison"><div class="callout-label">'+inf(title)+'</div><div class="md-columns">'+parts.map(x=>'<div>'+blocks(x,ctx,depth+1)+'</div>').join('')+'</div></section>')}
    else out.push('<aside class="callout '+kind+'"><div class="callout-label">'+inf(title)+'</div>'+blocks(b,ctx,depth+1)+'</aside>');continue;
   }
   const heading=l.match(/^(#{1,6})\s+(.+)$/);if(heading){const level=Math.min(heading[1].length+1,6);out.push(`<h${level} id="${ctx.prefix}-section-${++ctx.h}">${inf(heading[2])}</h${level}>`);i++;continue}
   if(/^\s*---+\s*$/.test(l)){out.push('<hr>');i++;continue}
   if(l.includes('|')&&separator(lines[i+1])){const heads=cells(l),align=cells(lines[i+1]).map(x=>x.startsWith(':')&&x.endsWith(':')?'center':x.endsWith(':')?'right':'left');i+=2;let rows=[];while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()!=='|||'){const row=cells(lines[i++]);rows.push('<tr>'+heads.map((_,j)=>'<td class="md-align-'+(align[j]||'left')+'">'+inf(row[j]||'')+'</td>').join('')+'</tr>')}
    out.push('<div class="table-scroll" tabindex="0" role="region" aria-label="Таблица, можно прокручивать"><table><thead><tr>'+heads.map((v,j)=>'<th scope="col" class="md-align-'+(align[j]||'left')+'">'+inf(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>');continue}
   if(/^>\s?/.test(l)){let b=[];while(i<lines.length&&/^>\s?/.test(lines[i]))b.push(lines[i++].replace(/^>\s?/,''));out.push('<blockquote>'+blocks(b,ctx,depth+1)+'</blockquote>');continue}
   if(item(l)){out.push(list(item(l)[1].length));continue}
   if(i+1<lines.length&&/^:\s+/.test(lines[i+1])){let terms=[];while(i+1<lines.length&&/^:\s+/.test(lines[i+1])){const term=lines[i++];let definitions=[];while(i<lines.length&&/^:\s+/.test(lines[i]))definitions.push('<dd>'+inf(lines[i++].replace(/^:\s+/,''))+'</dd>');terms.push('<dt>'+inf(term)+'</dt>'+definitions.join(''))}out.push('<dl class="md-terms">'+terms.join('')+'</dl>');continue}
   let p=[inf(l)];i++;while(i<lines.length&&lines[i].trim()&&!special(lines[i],lines[i+1]))p.push(inf(lines[i++]));out.push('<p>'+p.join('<br>')+'</p>');
  }return out.join('');
 }
 function render(raw){const ctx={prefix:'md-'+(++sequence),notes:new Map(),used:[],refs:Object.create(null),h:0,ref:0};let fenced=false,nest=0;const lines=[];
  for(const line of String(raw||'').replace(/\r/g,'').replace(/\t/g,'    ').split('\n')){if(/^```/.test(line))fenced=!fenced;if(!fenced){if(/^:::[a-z]+(?:\s|$)/.test(line))nest++;if(line.trim()===':::')nest=Math.max(0,nest-1)}const note=!fenced&&nest===0&&line.match(/^\[\^([A-Za-z0-9_-]{1,40})\]:\s*(.*)$/);if(note)ctx.notes.set(note[1],note[2]);else lines.push(line)}
  let html=blocks(lines,ctx);if(ctx.used.length)html+='<section class="md-footnotes" aria-label="Сноски"><h3>Примечания</h3><ol>'+ctx.used.map((key,i)=>'<li id="'+ctx.prefix+'-note-'+key+'">'+inline(ctx.notes.get(key),ctx,0,false)+' '+ctx.refs[key].map((id,j)=>'<a class="md-note-back" href="#'+id+'" aria-label="Вернуться к сноске '+(i+1)+(j?' ('+(j+1)+')':'')+'">↩</a>').join(' ')+'</li>').join('')+'</ol></section>';return html;
 }
 function reveal(target){for(let parent=target?.parentElement;parent;parent=parent.parentElement)if(parent.matches('details'))parent.open=true;return target}
 function copyText(root){if(!root)return '';const clone=root.cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));clone.querySelectorAll('details').forEach(x=>x.open=true);clone.querySelectorAll('.md-note-back').forEach(x=>x.remove());clone.style.cssText='position:fixed;left:-99999px;top:0;width:700px;pointer-events:none';clone.setAttribute('aria-hidden','true');document.body.append(clone);try{return clone.innerText}finally{clone.remove()}}
 return {render,labels,reveal,copyText};
})();
