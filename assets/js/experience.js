'use strict';
window.UI=(()=>{
 const {$,esc,icon,storage}=App;
 const viewKey=()=>'lecture-view:'+document.body.dataset.page+':'+(new URLSearchParams(location.search).get('subject')||'');
 const get=(k,d={})=>{try{return JSON.parse(sessionStorage.getItem(k))||d}catch{return d}};
 const set=(k,v)=>{try{sessionStorage.setItem(k,JSON.stringify(v))}catch{}};
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 let initialList=true,restoreFrame=0,restoreInnerFrame=0,anchorFrame=0,readerId=null,readerMode=null,readingReady=false,readerTimer,progressFrame=0;
 let activeListKey=viewKey();
 const listState=()=>get(activeListKey);
 function beginList(){cancelAnimationFrame(restoreFrame);cancelAnimationFrame(restoreInnerFrame);cancelAnimationFrame(anchorFrame);activeListKey=viewKey();initialList=true;return listState()}
 function announce(text){let live=$('#ui-announcement');if(!live){live=document.createElement('div');live.id='ui-announcement';live.className='sr-only';live.role='status';document.body.append(live)}live.textContent=text}
 function saveList(){if(!$('#search'))return;const old=listState();set(activeListKey,{...old,search:$('#search').value,sort:$('#sort').value,subject:$('#subject-filter')?.value||'',tasksOnly:$('#tasks-only')?.getAttribute('aria-pressed')==='true',visibleLimit:Number($('#list')?.dataset.visibleLimit)||40,y:scrollY})}
 function restoreList(){const state=listState();restoreFrame=requestAnimationFrame(()=>{restoreInnerFrame=requestAnimationFrame(()=>{window.scrollTo({top:state.y||0,behavior:'instant'});initialList=false})})}
 function listRendered(){
  const state=listState(),closed=new Set(state.closed||[]),query=$('#search')?.value.trim();
  document.querySelectorAll('.date-group').forEach(group=>{
   group.open=!!query||!closed.has(group.dataset.date);
   group.ontoggle=()=>{if(!group.isConnected)return;if(query){updateCollapse();return}const next=listState();const days=new Set(next.closed||[]);if(group.open)days.delete(group.dataset.date);else days.add(group.dataset.date);set(activeListKey,{...next,closed:[...days]});updateCollapse()};
  });
  const button=$('#collapse-days');if(button)button.onclick=()=>{const groups=[...document.querySelectorAll('.date-group')];const open=groups.some(x=>x.open);groups.forEach(x=>x.open=!open);updateCollapse()};
  updateCollapse();if(!initialList)saveList();
 }
 function updateCollapse(){const b=$('#collapse-days');if(!b)return;const groups=[...document.querySelectorAll('.date-group')];b.hidden=!groups.length;b.textContent=groups.some(x=>x.open)?'Свернуть дни':'Развернуть дни';b.setAttribute('aria-label',b.textContent)}
 function skeleton(kind){if(kind==='privacy')return '';return `<div class="loading-layout ${kind==='reader'?'reading-skeleton':''}" role="status" aria-label="Загружаем материалы" aria-busy="true"><span class="sr-only">Загружаем материалы…</span><div class="sk sk-heading"></div><div class="sk sk-description"></div><div class="sk sk-toolbar"></div><div class="sk sk-filter"></div>${[1,2,3].map(()=>'<div class="sk-row"><div class="sk sk-date"></div><div><div class="sk sk-subject"></div><div class="sk sk-title"></div><div class="sk sk-copy"></div></div></div>').join('')}</div>`}
 function ready(){const main=$('#main');if(main){main.classList.remove('content-ready');void main.offsetWidth;main.classList.add('content-ready')}}
 function readerState(){return storage.get('lecture-position:'+readerId)||get('lecture-position:'+readerId)}
 function saveReader(){if(!readerId||!$('#reading-text')||!readingReady)return;const old=readerState();const value={...old,mode:readerMode,[readerMode]:scrollY};set('lecture-position:'+readerId,value);storage.set('lecture-position:'+readerId,value);storage.set('lecture-last-read',{id:readerId,mode:readerMode,at:Date.now()})}
 function readerRendered(id,mode){
  const first=!$('#reading-actions');readerId=id;readerMode=mode;readingReady=false;
  if(!$('#reading-actions')){
   const actions=document.createElement('div');actions.id='reading-actions';actions.className='reading-actions';actions.innerHTML=`<div class="reader-action-buttons"><button type="button" class="reader-action" id="focus-reading" aria-pressed="false">${icon('book')}<span>Режим чтения</span></button><button type="button" class="reader-action" id="open-contents">${icon('menu')}<span>Содержание</span></button></div><span class="read-percent" id="read-percent" aria-label="Прогресс чтения">0%</span>`;$('.reader-head').after(actions);
   const dialog=document.createElement('dialog');dialog.id='contents-dialog';dialog.className='contents-dialog';dialog.setAttribute('aria-labelledby','contents-title');dialog.innerHTML=`<div class="contents-head"><h2 id="contents-title">Содержание</h2><button type="button" class="icon-btn" id="close-contents" aria-label="Закрыть содержание">${icon('close')}</button></div><nav id="mobile-contents" aria-label="Разделы лекции"></nav>`;$('#main').append(dialog);
   $('#focus-reading').onclick=()=>{const on=!document.body.classList.contains('reading-focus');document.body.classList.toggle('reading-focus',on);storage.set('lecture-focus',on);syncFocus();requestAnimationFrame(progress)};
   $('#open-contents').onclick=()=>{dialog.showModal();document.documentElement.classList.add('contents-open')};$('#close-contents').onclick=()=>dialog.close();dialog.addEventListener('close',()=>document.documentElement.classList.remove('contents-open'));dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
   document.body.classList.toggle('reading-focus',storage.get('lecture-focus',false)===true);syncFocus();
  }
  const headings=[...$('#reading-text').querySelectorAll('h2,h3')];$('#mobile-contents').innerHTML=headings.length?headings.map(h=>`<button type="button" class="contents-link ${h.tagName==='H3'?'subheading':''}" data-heading="${esc(h.id)}"><span class="contents-label">${esc(h.textContent)}</span></button>`).join(''):'<p class="muted">В этой версии нет разделов.</p>';
  $('#mobile-contents').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#contents-dialog').close();document.documentElement.classList.remove('contents-open');jumpToHeading(document.getElementById(b.dataset.heading))});
  $('#open-contents').hidden=!headings.length;
  $('.toc').hidden=!headings.length;
  cancelAnimationFrame(restoreFrame);cancelAnimationFrame(restoreInnerFrame);restoreFrame=requestAnimationFrame(()=>{restoreInnerFrame=requestAnimationFrame(()=>{const y=Number(readerState()[readerMode]);if(Number.isFinite(y))window.scrollTo({top:y,behavior:'instant'});else if(!first)window.scrollTo({top:Math.max(0,$('.reader-controls').getBoundingClientRect().top+scrollY-12),behavior:'instant'});else window.scrollTo({top:0,behavior:'instant'});readingReady=true;if(location.hash)followHash();progress()})});
 }
 function syncFocus(){const active=document.body.classList.contains('reading-focus'),b=$('#focus-reading');if(!b)return;b.setAttribute('aria-pressed',String(active));b.querySelector('span').textContent=active?'Обычный вид':'Режим чтения'}
 function progress(){
  const body=$('#reading-text'),label=$('#read-percent');
  if(!body||!label)return;
  const {top,height}=body.getBoundingClientRect();
  const visible=Math.max(0,Math.min(height,innerHeight-top));
  const fraction=height>0?visible/height:0;
  const percent=Math.round(fraction*100);
  label.textContent=percent+'%';
  label.setAttribute('aria-label','Прочитано примерно '+percent+'%');
  $('#reading-progress').style.transform='scaleX('+fraction+')';
  let active;
  for(const heading of body.querySelectorAll('h2,h3')){
   if(heading.getClientRects().length&&heading.getBoundingClientRect().top<160)active=heading.id;
  }
  document.querySelectorAll('#toc-links a').forEach(link=>{
   const on=link.hash==='#'+active;
   link.classList.toggle('current-section',on);
   if(on)link.setAttribute('aria-current','location');
   else link.removeAttribute('aria-current');
  });
 }
 window.addEventListener('resize',progress,{passive:true});
 window.addEventListener('scroll',()=>{if(readerId){if(!progressFrame)progressFrame=requestAnimationFrame(()=>{progressFrame=0;progress()});clearTimeout(readerTimer);readerTimer=setTimeout(saveReader,180)}},{passive:true});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(restoreFrame);saveList();saveReader()});
 function jumpToHeading(target){
  if(!target?.closest('#reading-text'))return;cancelAnimationFrame(restoreFrame);cancelAnimationFrame(restoreInnerFrame);cancelAnimationFrame(anchorFrame);
  Markdown.reveal(target);readingReady=true;
  const url=new URL(location.href);url.hash=target.id;history.replaceState(history.state,'',url.href);
  anchorFrame=requestAnimationFrame(()=>{if(!target.isConnected)return;const controls=$('.reading-actions');
   const offset=document.body.classList.contains('reading-focus')?controls.offsetHeight+22:($('.topbar')?.offsetHeight||0)+22;
   window.scrollTo({top:target.getBoundingClientRect().top+scrollY-offset,behavior:reduced()?'instant':'smooth'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});progress()});
 }
 function followHash(){let id;try{id=decodeURIComponent(location.hash.slice(1))}catch{return}jumpToHeading(document.getElementById(id))}
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a&&$('#search'))saveList();if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const href=a.getAttribute('href');if(href?.startsWith('#')){let id;try{id=decodeURIComponent(href.slice(1))}catch{return}const target=document.getElementById(id);if(target?.closest('#reading-text')){e.preventDefault();jumpToHeading(target)}}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){saveList();saveReader()}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('reading-focus')&&!$('#contents-dialog')?.open){document.body.classList.remove('reading-focus');storage.set('lecture-focus',false);syncFocus()}});
 let searchAnimations=[];
 function searchState(value){const box=$('.search-field'),clear=$('#clear-search');if(!box||!clear)return;const filled=!!value;box.classList.toggle('has-query',filled);clear.hidden=!filled}
 function searchResults(){
  searchAnimations.forEach(a=>a.cancel());searchAnimations=[];if(reduced())return;
  const list=$('#list');if(!list||typeof list.animate!=='function')return;
  // Animate one surface, avoiding a separate animation for every lecture.
  searchAnimations.push(list.animate([{opacity:.65,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'}));

 }
 return {searchState,searchResults,saveList,beginList,listState,restoreList,listRendered,announce,skeleton,ready,readerRendered,saveReader,jumpToHeading,followHash,progress};
})();
