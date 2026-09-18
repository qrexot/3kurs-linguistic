'use strict';
(async()=>{
 const {$,esc,icon,date,number,toast,errorText,storage,empty}=App;
 const page=document.body.dataset.page,params=new URLSearchParams(location.search);
 let subjects=[],weeks=[],lectures=[],profile=null,visit=null,selected=params.get('subject')||'',search='',week='',current=null,mode='lecture',poll=null,tracking=null,activity=Date.now(),hiddenAt=0,locked=false;
 const favorites=()=>storage.get('lecture-favorites',[]);
 const sub=id=>subjects.find(s=>s.id===id)?.name||'Предмет';const wk=id=>weeks.find(w=>w.id===id)?.title||'Неделя';
 function shell(){const nav=[['library','index.html','grid','Все лекции'],['subjects','subjects.html','book','Предметы'],['saved','saved.html','star','Избранное']];const links=nav.map(([id,file,ic,label])=>`<a href="${file}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`).join('');$('#app').innerHTML=`<aside class="sidebar"><a class="side-mark" href="index.html" aria-label="Все лекции"><div class="mark">${icon('book')}</div><span>Материалы</span></a><div class="nav-label">БИБЛИОТЕКА</div><nav class="side-nav" aria-label="Основная навигация">${links}</nav><div class="side-bottom">made by <strong>Leonard</strong><br><a href="privacy.html">О посещениях и данных</a></div></aside><div class="shell"><header class="topbar"><div class="crumb">Материалы ${icon('chevron')} <b>${({library:'Все лекции',subjects:'Предметы',saved:'Избранное',reader:'Чтение',privacy:'О данных'})[page]}</b></div><a class="top-right top-help" href="privacy.html">О материалах</a></header><main class="content" id="main">${UI.skeleton(page)}</main>${App.footer()}</div><nav class="mobile-nav" aria-label="Основная навигация на телефоне">${links}</nav>`}
 function fail(e){$('#main').innerHTML=empty(e.message==='blocked'?'Доступ ограничен':'Не удалось открыть материалы',errorText(e),`<button class="btn primary" id="retry">Попробовать снова</button>`);$('#retry')?.addEventListener('click',()=>location.reload())}
 function lock(){locked=true;clearInterval(poll);clearInterval(tracking);lectures=[];current=null;$('#main').innerHTML=empty('Доступ ограничен','Владелец ограничил доступ для этого посетителя.');document.title='Доступ ограничен'}
 function meta(l){return `<div class="lecture-meta"><span>${date(l.lecture_date,true)}</span><span class="sep"></span><span>${esc(wk(l.week_id))}</span>${l.pair_number?`<span class="sep"></span><span>${l.pair_number}-я пара</span>`:''}${l.starts_at?`<span class="sep"></span><span>${esc(l.starts_at.slice(0,5))}</span>`:''}</div>`}
 function cleanText(t){return (t||'').replace(/:::[\w-]*|\b[A-Za-z0-9_-]+\b|[#*`~>|_=-]/g,' ').replace(/\s+/g,' ')}
 function getMatchSnippet(text,query,len=140){
  if(!text||!query)return '';
  const idx=text.toLocaleLowerCase('ru').indexOf(query);
  if(idx==='-1'||idx===-1)return '';
  const start=Math.max(0,idx-45),end=Math.min(text.length,idx+query.length+85);
  let snippet=text.slice(start,end).trim();
  if(start>0)snippet='… '+snippet;
  if(end<text.length)snippet=snippet+' …';
  const escapedSnippet=esc(snippet);
  const escapedQ=esc(query).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return escapedSnippet.replace(new RegExp('('+escapedQ+')','gi'),'<mark>$1</mark>');
 }
 function card(l,i){
  const saved=favorites().includes(l.id);
  const q=search.toLocaleLowerCase('ru').trim();
  let snippetHtml='';
  let badgeHtml='';
  if(q){
   const inTitle=l.title.toLocaleLowerCase('ru').includes(q);
   const inSummary=(l.summary||'').toLocaleLowerCase('ru').includes(q);
   const inSubject=sub(l.subject_id).toLocaleLowerCase('ru').includes(q);
   if(l._matchText){
    badgeHtml=`<span class="search-match-badge">${icon('search')} найдено в тексте</span>`;
    snippetHtml=`<div class="search-snippet">${l._matchText}</div>`;
   }else if(inTitle){
    badgeHtml=`<span class="search-match-badge">в заголовке</span>`;
   }else if(inSummary){
    badgeHtml=`<span class="search-match-badge">в описании</span>`;
   }else if(inSubject){
    badgeHtml=`<span class="search-match-badge">по предмету</span>`;
   }
  }
  return `<div class="lecture-row" data-lecture-date="${esc(l.lecture_date)}"><div class="lecture-time"><span>${l.starts_at?esc(l.starts_at.slice(0,5)):'—'}</span><small>${l.pair_number?`${l.pair_number}-я пара`:'Занятие'}</small></div><div class="lecture-info"><a class="lecture-link" href="lecture.html?id=${encodeURIComponent(l.id)}"><span class="subject-name">${esc(sub(l.subject_id))}</span><h3>${esc(l.title)}</h3>${snippetHtml||(l.summary?`<p class="summary">${esc(l.summary)}</p>`:'')}<div class="lecture-meta"><span>${esc(wk(l.week_id))}</span>${badgeHtml}</div></a></div><button class="icon-btn ${saved?'saved':''}" data-save="${esc(l.id)}" aria-pressed="${saved}" aria-label="${saved?'Убрать из избранного':'В избранное'}">${icon('star')}</button></div>`;
 }
 function bindSave(){document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>{const id=b.dataset.save;let ids=favorites(),was=ids.includes(id);ids=was?ids.filter(v=>v!==id):[...ids,id];storage.set('lecture-favorites',ids);b.classList.toggle('saved',!was);b.setAttribute('aria-pressed',String(!was));b.setAttribute('aria-label',was?'В избранное':'Убрать из избранного');UI.announce(was?'Убрано из избранного':'Добавлено в избранное');if(page==='saved')drawList()})}

 function dateGroups(list){
  const groups=new Map();
  for(const l of list){const day=l.lecture_date||'';if(!groups.has(day))groups.set(day,[]);groups.get(day).push(l)}
  const ascending=$('#sort')?.value==='old';
  const days=[...groups.keys()].sort((a,b)=>ascending?a.localeCompare(b):b.localeCompare(a));
  let lastMonth='';
  return days.map(day=>{
   const items=groups.get(day).slice().sort((a,b)=>{
    const ta=a.starts_at||'99:99',tb=b.starts_at||'99:99';
    return ta.localeCompare(tb)||(a.pair_number||99)-(b.pair_number||99)||a.title.localeCompare(b.title,'ru');
   });
   const d=new Date(day+'T12:00:00'),valid=!Number.isNaN(d.getTime());
   const month=valid?day.slice(0,7):'unknown';
   const monthLabel=valid?new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(d).replace(/\s*г\.$/,''):'Без даты';
   const monthHead=month!==lastMonth?`<h2 class="month-heading">${esc(monthLabel)}</h2>`:'';lastMonth=month;
   const dayNum=valid?String(d.getDate()).padStart(2,'0'):'—';
   const dayMonth=valid?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(d).replace(/^\d+\s*/,''):'';
   const weekday=valid?new Intl.DateTimeFormat('ru-RU',{weekday:'long'}).format(d):'Без даты';
   return `${monthHead}<details open class="date-group" data-date="${esc(day)}" aria-label="${esc(valid?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(d):'Без даты')}"><summary class="date-label"><time datetime="${esc(day)}"><strong>${dayNum}</strong><span>${esc(dayMonth)}<small>${esc(weekday)}</small></span></time><span class="day-count">${number(items.length,['занятие','занятия','занятий'])}</span>${icon('chevron','day-chevron')}</summary><div class="lecture-list">${items.map(card).join('')}</div></details>`;
  }).join('');
 }
 function library(){
  const view=UI.listState(); selected=params.get('subject')||view.subject||''; search=view.search||''; week=view.week||'';
  const saved=page==='saved';
  $('#main').innerHTML=`<div class="page-head library-heading"><div><div class="eyebrow">${saved?'Для повторения':'Материалы занятий'}</div><h1>${saved?'Избранное':'Лекции'}</h1><p>${saved?'Сохранено в этом браузере.':'По датам, предметам и неделям.'}</p></div>${!saved?`<div class="library-counts"><span><b>${lectures.length}</b> ${number(lectures.length,['лекция','лекции','лекций']).split(' ').slice(1).join(' ')}</span><span><b>${subjects.length}</b> ${number(subjects.length,['предмет','предмета','предметов']).split(' ').slice(1).join(' ')}</span></div>`:''}</div><section class="library-browser" aria-label="Список лекций"><div class="toolbar"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Поиск по темам и текстам" aria-label="Поиск по теме, словам и тексту лекций" autocomplete="off"></label><div class="custom-select-wrap"><select id="week-filter" aria-label="Неделя"><option value="">Все недели</option>${weeks.map(w=>`<option value="${esc(w.id)}">${esc(w.title)}</option>`).join('')}</select>${icon('chevron')}</div><div class="custom-select-wrap"><select id="sort" aria-label="Сортировка"><option value="new">Сначала новые</option><option value="old">Сначала ранние</option></select>${icon('chevron')}</div></div><div class="chips" aria-label="Фильтр по предмету"><button class="chip ${!selected?'active':''}" data-subject="" aria-pressed="${!selected}">Все предметы</button>${subjects.map(s=>`<button class="chip ${selected===s.id?'active':''}" data-subject="${esc(s.id)}" aria-pressed="${selected===s.id}">${esc(s.name)}</button>`).join('')}</div><div class="results-line"><span>По датам</span><div class="results-actions"><span id="result-count" aria-live="polite"></span><button id="collapse-days" class="text-button" type="button">Свернуть дни</button></div></div><div id="list"></div></section>`;
  $('#search').value=search; $('#week-filter').value=week; week=$('#week-filter').value; $('#sort').value=view.sort||'new';
  $('#search').addEventListener('input',e=>{search=e.target.value;drawList()});
  $('#week-filter').onchange=e=>{week=e.target.value;drawList()};$('#sort').onchange=drawList;
  document.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{selected=b.dataset.subject;document.querySelectorAll('[data-subject]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});drawList()});drawList();UI.restoreList();
 }
 function drawList(){
  const q=search.toLocaleLowerCase('ru').trim();
  const words=q?q.split(/\s+/).filter(Boolean):[];
  let list=lectures.filter(l=>{
   if(page==='saved'&&!favorites().includes(l.id))return false;
   if(selected&&l.subject_id!==selected)return false;
   if(week&&l.week_id!==week)return false;
   delete l._matchText;
   if(!q)return true;
   const metaStr=[l.title,l.summary,sub(l.subject_id)].join(' ').toLocaleLowerCase('ru');
   if(words.length>1){
    const allWordsInMeta=words.every(w=>metaStr.includes(w));
    if(allWordsInMeta)return true;
   }
   if(metaStr.includes(q))return true;
   const cleanLec=cleanText(l.lecture_text);
   const cleanFull=cleanText(l.full_text);
   const snipLec=getMatchSnippet(cleanLec,q);
   if(snipLec){l._matchText=snipLec;return true;}
   const snipFull=getMatchSnippet(cleanFull,q);
   if(snipFull){l._matchText=snipFull;return true;}
   if(words.length>1){
    const allInLec=words.every(w=>cleanLec.toLocaleLowerCase('ru').includes(w));
    if(allInLec){l._matchText=getMatchSnippet(cleanLec,words[0]);return true;}
    const allInFull=words.every(w=>cleanFull.toLocaleLowerCase('ru').includes(w));
    if(allInFull){l._matchText=getMatchSnippet(cleanFull,words[0]);return true;}
   }
   return false;
  });
  if($('#sort')?.value==='old')list=list.slice().reverse();
  $('#result-count').textContent=number(list.length,['занятие','занятия','занятий']);
  $('#list').innerHTML=list.length?dateGroups(list):empty(page==='saved'&&!favorites().length?'Пока ничего не сохранено':'Лекции не найдены',page==='saved'&&!favorites().length?'Нажмите на звёздочку рядом с лекцией.':lectures.length?'Попробуйте другой запрос или выберите все предметы.':'Когда владелец опубликует материалы, они появятся здесь.');
  bindSave();UI.listRendered();
 }
 function subjectPage(){$('#main').innerHTML=`<div class="page-head"><h1>Предметы</h1><p>Все занятия по одной дисциплине — рядом.</p></div>${subjects.length?`<div class="subjects-grid">${subjects.map((s,i)=>{const n=lectures.filter(l=>l.subject_id===s.id).length;return `<a class="subject-card" href="index.html?subject=${encodeURIComponent(s.id)}"><div class="spread"><span class="eyebrow">${String(i+1).padStart(2,'0')}</span>${icon('book')}</div><h2>${esc(s.name)}</h2><div class="spread"><span>${number(n,['лекция','лекции','лекций'])}</span>${icon('arrow')}</div></a>`}).join('')}</div>`:empty('Предметов пока нет','Они появятся после добавления владельцем.')}`}
 async function reader(){const id=params.get('id');current=(await DB.select('lectures','select=*&id=eq.'+encodeURIComponent(id||'')+'&published=eq.true'))[0];if(!current){$('#main').innerHTML=empty('Лекция недоступна','Возможно, она ещё не опубликована или была удалена.',`<a class="btn" href="index.html">Все лекции</a>`);return}const l=current;document.title=l.title;$('#main').innerHTML=`<a class="back-link" href="index.html">${icon('back')} Все лекции</a><div class="read-layout"><article><header class="reader-head"><span class="badge">${esc(sub(l.subject_id))}</span><h1>${esc(l.title)}</h1>${l.summary?`<p class="description">${esc(l.summary)}</p>`:''}${meta(l)}</header><div class="reader-controls"><div class="tabs" role="tablist" aria-label="Версия транскрипции"><button role="tab" id="tab-lecture" aria-controls="reading-text" aria-selected="true" data-mode="lecture" class="active">Лекция</button><button role="tab" id="tab-full" aria-controls="reading-text" aria-selected="false" data-mode="full">Полная транскрипция</button></div><div class="reader-tools"><button class="icon-btn" id="font-down" aria-label="Уменьшить текст">A-</button><button class="icon-btn" id="font-up" aria-label="Увеличить текст">A+</button><button class="icon-btn save-reader ${favorites().includes(l.id)?'saved':''}" data-save="${esc(l.id)}" aria-label="В избранное">${icon('star')}</button></div></div><div class="prose" id="reading-text" role="tabpanel" aria-labelledby="tab-lecture" tabindex="0"></div><div class="reading-end spread"><span>Конец материала</span><button class="btn ghost" id="scroll-top">Наверх</button></div></article><aside class="toc"><details open><summary>В этой лекции</summary><nav id="toc-links" aria-label="Оглавление"></nav></details></aside></div><div class="progress" id="reading-progress"></div>`;
  let font=Number(storage.get('lecture-font',17));if(!Number.isFinite(font))font=17;font=Math.min(24,Math.max(16,font));const setFont=()=>{$('#reading-text').style.fontSize=font+'px';storage.set('lecture-font',font)};$('#font-down').onclick=()=>{font=Math.max(16,font-1);setFont()};$('#font-up').onclick=()=>{font=Math.min(24,font+1);setFont()};setFont();$('#scroll-top').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});document.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>{mode=b.dataset.mode;drawText()};b.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const other=$(`[data-mode="${mode==='lecture'?'full':'lecture'}"]`);other.click();other.focus()}}});bindSave();drawText();window.addEventListener('scroll',()=>{const denom=document.documentElement.scrollHeight-innerHeight;const p=$('#reading-progress');if(p)p.style.width=(denom>0?Math.min(100,scrollY/denom*100):100)+'%'},{passive:true})}
 function drawText(){if(!current||locked)return;const text=mode==='lecture'?current.lecture_text:current.full_text;$('#reading-text').innerHTML=text?Markdown.render(text):'<p class="muted">Эта версия пока не добавлена.</p>';$('#reading-text').setAttribute('aria-labelledby','tab-'+mode);document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});const headings=Array.from($('#reading-text').querySelectorAll('h2,h3'));headings.forEach((h,i)=>h.id='reading-section-'+i);$('#toc-links').innerHTML=headings.map(h=>`<a href="#${h.id}">${esc(h.textContent)}</a>`).join('')||'<span class="small muted">Нет разделов</span>';UI.readerRendered(current.id,mode);if(visit)DB.rpc('record_view',{p_session:visit,p_lecture:current.id,p_mode:mode}).catch(()=>{})}
 function privacy(){$('#main').innerHTML=`<a class="back-link" href="index.html">${icon('back')} К материалам</a><div class="read-layout"><article class="prose"><h1>О посещениях и данных</h1><p>Материалы открываются без регистрации. При первом посещении создаётся технический анонимный идентификатор. Он сохраняется в браузере и позволяет владельцу учитывать посещения и ограничивать доступ.</p><h2>Что видит владелец</h2><ul><li>Анонимный код посетителя и даты посещений.</li><li>Открытые лекции и выбранную версию текста.</li><li>Приблизительное активное время и тип устройства: телефон или компьютер.</li></ul><p>Сайт не запрашивает имя, телефон, адрес электронной почты или геолокацию посетителя. Собственная аналитика сайта не записывает IP-адреса.</p><h2>Как считается время</h2><p>Открытая вкладка не равна чтению. Время учитывается приблизительно, пока вкладка видима и недавно было взаимодействие. Это не подтверждает внимание, личность или присутствие человека.</p><h2>Данные в браузере</h2><p>В браузере хранятся анонимная сессия, список избранного, размер текста и настройка режима чтения. На время открытой вкладки также запоминаются фильтры, свёрнутые дни и позиция в лекциях. Тексты лекций намеренно не сохраняются для автономного чтения. После очистки данных браузера избранное и идентификатор могут быть потеряны.</p><h2>Хранение и удаление</h2><p>Владелец может удалить журнал посещений в админке; автоматическая очистка не включена. Для запроса удаления сообщите владельцу свой код посетителя.</p><div class="callout"><div class="callout-label">Ваш идентификатор</div><p id="visitor-code"></p></div><p>Блокировка относится к техническому идентификатору и не является постоянной блокировкой человека.</p></article></div>`;$('#visitor-code').textContent=DB.session?.user?.id||'Появится после первого открытия материалов.'}
 async function track(){visit=await DB.rpc('start_visit',{p_device:matchMedia('(pointer:coarse)').matches?'Телефон / планшет':'Компьютер'});tracking=setInterval(async()=>{if(!visit||locked)return;const active=!document.hidden&&Date.now()-activity<90000;try{await DB.rpc('heartbeat',{p_session:visit,p_active:active})}catch(e){if(/blocked|access_denied/.test(e.message))lock()}},20000);['pointerdown','keydown','scroll','touchstart'].forEach(ev=>window.addEventListener(ev,()=>activity=Date.now(),{passive:true}));document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else{activity=Date.now();if(hiddenAt)hiddenAt=0}if(visit)DB.rpc('heartbeat',{p_session:visit,p_active:false}).catch(()=>{})})}
 shell();if(page==='privacy'){privacy();return}
 try{await DB.ensureVisitor();profile=await DB.profile();if(profile.blocked){lock();return}const loaded=await Promise.all([DB.select('subjects','select=*&order=sort_order.asc,name.asc'),DB.select('weeks','select=*&order=sort_order.desc,starts_on.desc'),DB.select('lectures','select=id,subject_id,week_id,title,lecture_date,starts_at,pair_number,summary,lecture_text,full_text,published&published=eq.true&order=lecture_date.desc,starts_at.desc&limit=1000')]);[subjects,weeks,lectures]=loaded;try{await track()}catch(e){toast('Материалы открыты. Статистика временно недоступна.')}poll=setInterval(async()=>{if(document.hidden||locked)return;try{const p=await DB.profile();if(p.blocked)lock()}catch{}},20000);lectures.sort((a,b)=>(b.lecture_date+(b.starts_at||'')).localeCompare(a.lecture_date+(a.starts_at||'')));if(page==='subjects')subjectPage();else if(page==='reader')await reader();else library();UI.ready();}catch(e){fail(e)}
 window.addEventListener('session-lost',()=>{locked=true;clearInterval(poll);clearInterval(tracking);$('#main').innerHTML=empty('Сессия завершена','Обновите страницу, чтобы снова открыть материалы.','<button class="btn" onclick="location.reload()">Обновить</button>')});
 window.addEventListener('offline',()=>toast('Нет интернета. Новые материалы пока не загрузятся.'));
})();

