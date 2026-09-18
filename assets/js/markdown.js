'use strict';
// Deliberately restricted Markdown. Raw HTML, images and arbitrary URL protocols are never rendered.
window.Markdown=(()=>{
 const e=App.esc;
 function inline(raw){let s=e(raw);const codes=[];s=s.replace(/`([^`]+)`/g,(_,v)=>{codes.push('<code>'+v+'</code>');return '\u0000'+(codes.length-1)+'\u0000'});s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/==([^=\n]+)==/g,'<mark>$1</mark>');return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>codes[+i]||'')}
 function render(raw){const lines=String(raw||'').replace(/\r/g,'').split('\n');let out=[],i=0,h=0;const labels={definition:'Определение',important:'Важно',example:'Пример',question:'К экзамену',note:'Заметка'};
  const cells=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());
  while(i<lines.length){let l=lines[i];if(!l.trim()){i++;continue}
   if(l.startsWith('```')){let code=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);i++;out.push('<pre><code>'+e(code.join('\n'))+'</code></pre>');continue}
   const block=l.match(/^:::(definition|important|example|question|note)\s*$/);if(block){let b=[];i++;while(i<lines.length&&lines[i].trim()!==':::')b.push(lines[i++]);i++;out.push(`<aside class="callout ${block[1]}"><div class="callout-label">${labels[block[1]]}</div>${render(b.join('\n'))}</aside>`);continue}
   const heading=l.match(/^(#{1,4})\s+(.+)$/);if(heading){let level=Math.min(heading[1].length+1,5);out.push(`<h${level} id="section-${++h}">${inline(heading[2])}</h${level}>`);i++;continue}
   if(/^\s*---+\s*$/.test(l)){out.push('<hr>');i++;continue}
   if(l.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){const heads=cells(l);i+=2;let rows=[];while(i<lines.length&&lines[i].includes('|'))rows.push('<tr>'+cells(lines[i++]).map(v=>'<td>'+inline(v)+'</td>').join('')+'</tr>');out.push('<div class="table-scroll"><table><thead><tr>'+heads.map(v=>'<th>'+inline(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>');continue}
   if(/^>\s?/.test(l)){let b=[];while(i<lines.length&&/^>\s?/.test(lines[i]))b.push(inline(lines[i++].replace(/^>\s?/,'')));out.push('<blockquote>'+b.join('<br>')+'</blockquote>');continue}
   if(/^\s*(?:[-*]|\d+\.)\s+/.test(l)){const ordered=/^\s*\d+\./.test(l),tag=ordered?'ol':'ul';let list=[];while(i<lines.length&&(ordered?/^\s*\d+\.\s+/:/^\s*[-*]\s+/).test(lines[i]))list.push('<li>'+inline(lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/,''))+'</li>');out.push(`<${tag}>${list.join('')}</${tag}>`);continue}
   let p=[inline(l)];i++;while(i<lines.length&&lines[i].trim()&&!/^(#{1,4}\s|:::|>|```|\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i])&&!(lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')))p.push(inline(lines[i++]));out.push('<p>'+p.join('<br>')+'</p>');
  }return out.join('');
 }
 return {render};
})();
