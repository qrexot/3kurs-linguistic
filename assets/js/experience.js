'use strict';
window.UI=(()=>{
 const {$,esc,icon,storage}=App;const page=document.body.dataset.page;
 const viewKey='lecture-view:'+page+':'+(new URLSearchParams(location.search).get('subject')||'');
 const get=(k,d={})=>{try{return JSON.parse(sessionStorage.getItem(k))||d}catch{return d}};
 const set=(k,v)=>{try{sessionStorage.setItem(k,JSON.stringify(v))}catch{}};
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 let initialList=true,restoreFrame=0,readerId=null,readerMode=null,readingReady=false,readerTimer,progressFrame=0;
 const listState=()=>get(viewKey);
 function announce(text){let live=$('#ui-announcement');if(!live){live=document.createElement('div');live.id='ui-announcement';live.className='sr-only';live.role='status';document.body.append(live)}live.textContent=text}
 function saveList(){if(!$('#search'))return;const old=listState();set(viewKey,{...old,search:$('#search').value,week:$('#week-filter').value,sort:$('#sort').value,subject:$('.chip.active')?.dataset.subject||'',y:scrollY})}
 function restoreList(){const state=listState();requestAnimationFrame(()=>{restoreFrame=requestAnimationFrame(()=>{window.scrollTo({top:state.y||0,behavior:'instant'});initialList=false})})}
 function listRendered(){
  const state=listState(),closed=new Set(state.closed||[]),query=$('#search')?.value.trim();
  document.querySelectorAll('.date-group').forEach(group=>{
   group.open=!!query||!closed.has(group.dataset.date);
   group.addEventListener('toggle',()=>{if(query)return;const next=listState();const days=new Set(next.closed||[]);if(group.open)days.delete(group.dataset.date);else days.add(group.dataset.date);set(viewKey,{...next,closed:[...days]});updateCollapse()});
  });
  const button=$('#collapse-days');if(button)button.onclick=()=>{const groups=[...document.querySelectorAll('.date-group')];const open=groups.some(x=>x.open);groups.forEach(x=>x.open=!open);updateCollapse()};
  updateCollapse();if(!initialList)saveList();
 }
 function updateCollapse(){const b=$('#collapse-days');if(!b)return;const groups=[...document.querySelectorAll('.date-group')];b.hidden=!groups.length;b.textContent=groups.some(x=>x.open)?'Свернуть дни':'Развернуть дни';b.setAttribute('aria-label',b.textContent)}
 function skeleton(kind){if(kind==='privacy')return '';return `<div class="loading-layout ${kind==='reader'?'reading-skeleton':''}" role="status" aria-label="Загружаем материалы" aria-busy="true"><span class="sr-only">Загружаем материалы…</span><div class="sk sk-heading"></div><div class="sk sk-description"></div><div class="sk sk-toolbar"></div><div class="sk sk-filter"></div>${[1,2,3].map(()=>'<div class="sk-row"><div class="sk sk-date"></div><div><div class="sk sk-subject"></div><div class="sk sk-title"></div><div class="sk sk-copy"></div></div></div>').join('')}</div>`}
 function ready(){const main=$('#main');if(main){main.classList.add('content-ready');setTimeout(()=>main.classList.remove('content-ready'),230)}}
 function readerState(){return get('lecture-position:'+readerId)}
 function saveReader(){if(!readerId||!$('#reading-text')||!readingReady)return;const old=readerState();set('lecture-position:'+readerId,{...old,mode:readerMode,[readerMode]:scrollY})}
 function readerRendered(id,mode){
  const first=readerId!==id;if(!first&&readerMode!==mode&&readingReady)saveReader();readerId=id;readerMode=mode;readingReady=false;
  if(!$('#reading-actions')){
   const actions=document.createElement('div');actions.id='reading-actions';actions.className='reading-actions';actions.innerHTML=`<div class="reader-action-buttons"><button type="button" class="reader-action" id="focus-reading" aria-pressed="false">${icon('book')}<span>Режим чтения</span></button><button type="button" class="reader-action" id="open-contents">${icon('menu')}<span>Содержание</span></button></div><span class="read-percent" id="read-percent" aria-label="Прогресс чтения">0%</span>`;$('.reader-head').after(actions);
   const dialog=document.createElement('dialog');dialog.id='contents-dialog';dialog.className='contents-dialog';dialog.setAttribute('aria-labelledby','contents-title');dialog.innerHTML=`<div class="contents-head"><h2 id="contents-title">Содержание</h2><button type="button" class="icon-btn" id="close-contents" aria-label="Закрыть содержание">${icon('close')}</button></div><nav id="mobile-contents" aria-label="Разделы лекции"></nav>`;$('#main').append(dialog);
   $('#focus-reading').onclick=()=>{const on=!document.body.classList.contains('reading-focus');document.body.classList.toggle('reading-focus',on);storage.set('lecture-focus',on);syncFocus()};
   $('#open-contents').onclick=()=>dialog.showModal();$('#close-contents').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
   document.body.classList.toggle('reading-focus',storage.get('lecture-focus',false)===true);syncFocus();
  }
  const headings=[...$('#reading-text').querySelectorAll('h2,h3')];$('#mobile-contents').innerHTML=headings.length?headings.map((h,i)=>`<button type="button" class="contents-link ${h.tagName==='H3'?'subheading':''}" data-heading="${esc(h.id)}"><span>${String(i+1).padStart(2,'0')}</span>${esc(h.textContent)}</button>`).join(''):'<p class="muted">В этой версии нет разделов.</p>';
  $('#mobile-contents').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#contents-dialog').close();document.getElementById(b.dataset.heading)?.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start'})});
  const saved=readerState();if(first&&saved.mode&&saved.mode!==mode){const tab=$(`[data-mode="${saved.mode==='full'?'full':'lecture'}"]`);if(tab){tab.click();return}}
  cancelAnimationFrame(restoreFrame);restoreFrame=requestAnimationFrame(()=>requestAnimationFrame(()=>{const y=Number(readerState()[readerMode]);if(Number.isFinite(y))window.scrollTo({top:y,behavior:'instant'});else if(!first)window.scrollTo({top:Math.max(0,$('.reader-controls').getBoundingClientRect().top+scrollY-12),behavior:'instant'});readingReady=true;progress()}));
 }
 function syncFocus(){const active=document.body.classList.contains('reading-focus'),b=$('#focus-reading');if(!b)return;b.setAttribute('aria-pressed',String(active));b.querySelector('span').textContent=active?'Обычный вид':'Режим чтения'}
 function progress(){const text=$('#reading-text'),label=$('#read-percent');if(!text||!label)return;const top=text.getBoundingClientRect().top+scrollY,bottom=top+text.offsetHeight;const p=Math.max(0,Math.min(100,Math.round((scrollY+innerHeight-top)/Math.max(1,bottom-top)*100)));label.textContent=p+'%';label.setAttribute('aria-label','Прочитано примерно '+p+'%');const headings=[...text.querySelectorAll('h2,h3')];let active=headings[0]?.id;for(const h of headings){if(h.getBoundingClientRect().top<160)active=h.id}document.querySelectorAll('#toc-links a').forEach(a=>{const on=a.hash==='#'+active;a.classList.toggle('current-section',on);if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
 window.addEventListener('scroll',()=>{if(readerId){if(!progressFrame)progressFrame=requestAnimationFrame(()=>{progressFrame=0;progress()});clearTimeout(readerTimer);readerTimer=setTimeout(saveReader,180)}},{passive:true});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(restoreFrame);saveList();saveReader()});
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a&&$('#search'))saveList()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){saveList();saveReader()}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('reading-focus')&&!$('#contents-dialog')?.open){document.body.classList.remove('reading-focus');storage.set('lecture-focus',false);syncFocus()}});
 let searchAnimations=[];
 function searchState(value){const box=$('.search-box'),clear=$('#clear-search');if(!box||!clear)return;const filled=!!value;box.classList.toggle('has-query',filled);clear.hidden=!filled}
 function searchResults(){
  searchAnimations.forEach(a=>a.cancel());searchAnimations=[];if(reduced())return;
  const list=$('#list');if(!list||typeof list.animate!=='function')return;
  // Animate one surface, avoiding a separate animation for every lecture.
  searchAnimations.push(list.animate([{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:190,easing:'cubic-bezier(.2,.7,.2,1)'}));
  const count=$('#result-count');if(count)searchAnimations.push(count.animate([{opacity:.4},{opacity:1}],{duration:160}));
 }
 return {searchState,searchResults,listState,restoreList,listRendered,announce,skeleton,ready,readerRendered};
})();
