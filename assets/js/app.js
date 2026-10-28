'use strict';
(async()=>{
 if(window.localRoutePending)return;
 const {$,esc,icon,date,number,toast,errorText,storage,empty}=App;
 function resolvePage(urlStr=location.href){
  try{
   const u=new URL(urlStr,location.href),vp=u.searchParams.get('view');
   if(vp&&['library','subjects','saved','reader','privacy'].includes(vp))return {page:vp,params:u.searchParams};
   const path=u.pathname.split('/').pop().toLowerCase();
   if(path==='subjects.html')return {page:'subjects',params:u.searchParams};
   if(path==='saved.html')return {page:'saved',params:u.searchParams};
   if(path==='lecture.html'||u.searchParams.has('id'))return {page:'reader',params:u.searchParams};
   if(path==='privacy.html')return {page:'privacy',params:u.searchParams};
   return {page:'library',params:u.searchParams};
  }catch{return {page:'library',params:new URLSearchParams()}}
 }
 const initResolved=resolvePage();
 let page=initResolved.page,params=initResolved.params;
 let subjects=[],weeks=[],lectures=[],profile=null,deviceId=null,currentIp='',selected=params.get('subject')||'',search='',current=null,mode='lecture',poll=null,tracking=null,activity=Date.now(),hiddenAt=0,locked=false,accessReady=false;
 const CATALOG_CACHE='lecture_catalog_v2';
 function getCachedCatalog(){try{const r=sessionStorage.getItem(CATALOG_CACHE);if(!r)return null;const d=JSON.parse(r);if(d&&Array.isArray(d.lectures)&&d.lectures.length&&Date.now()-d.ts<600000)return d}catch{}return null}
 function setCachedCatalog(s,w,l){try{sessionStorage.setItem(CATALOG_CACHE,JSON.stringify({subjects:s,weeks:w,lectures:l,ts:Date.now()}))}catch{}}
 const searchCache=new WeakMap();
 let tasksOnly=false,visibleLimit=40,lastFilter='';
 const hasTask=l=>!!l.assignment_text?.trim();
 const favorites=()=>storage.get('lecture-favorites',[]);
 const sub=id=>subjects.find(s=>s.id===id)?.name||'Предмет';const wk=id=>weeks.find(w=>w.id===id)?.title||'Неделя';
 function updateChrome(p){
  const titles={library:'Все лекции',subjects:'Предметы',saved:'Избранное',reader:'Чтение',privacy:'О сайте'};
  const b=document.querySelector('.topbar .crumb b');if(b)b.textContent=titles[p]||'Все лекции';
  document.querySelectorAll('.side-nav a, .mobile-nav a').forEach(a=>{
   const href=a.getAttribute('href')||'';
   const active=(p==='library'&&(href.includes('index.html')||href==='./'))||
                (p==='reader'&&(href.includes('index.html')||href==='./'))||
                (p==='subjects'&&href.includes('subjects.html'))||
                (p==='saved'&&href.includes('saved.html'));
   a.classList.toggle('active',!!active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
 }
 function shell(){
  const nav=[['library','index.html','grid','Все лекции'],['subjects','subjects.html','book','Предметы'],['saved','saved.html','star','Избранное'],['chat','chat.html','users','Чат']];
  const links=nav.map(([id,file,ic,label])=>{const on=page===id||(page==='reader'&&id==='library');return `<a href="${file}" class="${on?'active':''}" ${on?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`}).join('');
  $('#app').innerHTML=`<a class="skip-link" href="#main">К материалам</a><aside class="sidebar"><a class="side-mark" href="index.html" aria-label="Материалы занятий"><div class="mark">${icon('sparkle')}</div><span>Материалы</span></a><div class="nav-label">БИБЛИОТЕКА</div><nav class="side-nav" aria-label="Основная навигация">${links}</nav><div class="side-bottom"><span>made by <strong>Leonard</strong></span><a href="privacy.html">О сайте ${icon("arrow")}</a></div></aside><div class="shell"><header class="topbar"><div class="crumb"><a class="crumb-root" href="index.html">Материалы</a> ${icon('chevron')} <b>${({library:'Все лекции',subjects:'Предметы',saved:'Избранное',reader:'Чтение',privacy:'О сайте'})[page]}</b></div><div class="top-right"><a class="top-help" href="privacy.html">О сайте</a></div></header><main class="content" id="main" tabindex="-1">${UI.skeleton(page)}</main>${App.footer()}</div><nav class="mobile-nav" aria-label="Основная навигация на телефоне">${links}</nav>`;
 }
 let isNavigating=false;
 async function navigateTo(href,{replace=false,pop=false}={}){
  const target=new URL(href,location.href);
  const resolved=resolvePage(target.href);
  const main=$('#main');
  if(isNavigating){
   location.href=target.href;
   return;
  }
  isNavigating=true;
  try{
   if(page==='reader')UI.saveReader();
   else if(page==='library'||page==='saved')UI.saveList();
   if(!pop){
    if(replace)history.replaceState({url:target.href},'',target.href);
    else history.pushState({url:target.href},'',target.href);
   }
   page=resolved.page;params=resolved.params;selected=params.get('subject')||'';
   document.body.dataset.page=page;updateChrome(page);if(deviceId)DB.rpc('record_navigation',{p_device_id:deviceId,p_page:page}).catch(()=>{});if(page!=='reader')document.body.classList.remove('reading-focus');
   if(main&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    main.classList.add('is-transitioning');
    await new Promise(r=>setTimeout(r,40));
   }
   if(page==='subjects')subjectPage();
   else if(page==='reader')await reader();
   else if(page==='privacy')await privacy();
   else library();
   if(page==='library'||page==='saved')UI.restoreList();
   else if(page!=='reader')window.scrollTo({top:0,behavior:'instant'});
   UI.ready();
  }catch(err){
   console.warn('Navigation fallback:',err);
   location.href=target.href;
  }finally{
   if(main)main.classList.remove('is-transitioning');
   isNavigating=false;
  }
 }
 function fail(e){if(window.VisitorAccess&&/visitor_access_status|submit_access_request/.test(e.message))e=new Error(VisitorAccess.error(e));$('#main').innerHTML=empty(e.message==='blocked'?'Доступ ограничен':'Не удалось открыть материалы',errorText(e),`<button class="btn primary" id="retry">Попробовать снова</button>`);$('#retry')?.addEventListener('click',()=>location.reload())}
 function lock(){locked=true;clearInterval(poll);clearInterval(tracking);lectures=[];current=null;$('#main').innerHTML=empty('Доступ ограничен','Владелец ограничил доступ для этого посетителя.');document.title='Доступ ограничен'}
 function meta(l){return `<div class="lecture-meta"><span>${date(l.lecture_date,true)}</span><span class="sep"></span><span>${esc(wk(l.week_id))}</span>${l.pair_number?`<span class="sep"></span><span>${l.pair_number}-я пара</span>`:''}${l.starts_at?`<span class="sep"></span><span>${esc(l.starts_at.slice(0,5))}</span>`:''}</div>`}
 const normalizeSearch=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
 function cleanText(t){return (t||'').replace(/:::[\w-]*|[#*`~>|_=-]/g,' ').replace(/\s+/g,' ')}
 function getMatchSnippet(text,query,len=140){
  if(!text||!query)return '';
  const idx=normalizeSearch(text).indexOf(normalizeSearch(query));
  if(idx==='-1'||idx===-1)return '';
  const start=Math.max(0,idx-45),end=Math.min(text.length,idx+query.length+85);
  let snippet=text.slice(start,end).trim();
  if(start>0)snippet='… '+snippet;
  if(end<text.length)snippet=snippet+' …';
  const escapedSnippet=esc(snippet);
  const escapedQ=esc(query).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return escapedSnippet.replace(new RegExp('('+escapedQ.replace(/е/g,'[её]')+')','gi'),'<mark>$1</mark>');
 }
 function card(l,i){
  const saved=favorites().includes(l.id);
  const q=normalizeSearch(search).trim();
  let snippetHtml='';
  let badgeHtml='';
  if(q){
   const inTitle=normalizeSearch(l.title).includes(q);
   const inSummary=normalizeSearch(l.summary).includes(q);
   const inSubject=normalizeSearch(sub(l.subject_id)).includes(q);
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
  const extraCount=Extras.normalize(l.extra_images).length;
  const extraLink=(l.extra_text?.trim()||extraCount)?`<a class="extra-link" href="lecture.html?id=${encodeURIComponent(l.id)}&mode=extra">${icon('file')} Доп. материал${extraCount?'<span>'+extraCount+' фото</span>':''}</a>`:'';
  const taskLink=hasTask(l)?`<a class="task-link" href="lecture.html?id=${encodeURIComponent(l.id)}&mode=assignment">${icon('arrow')} Задание</a>`:'';
  const timeStr=l.starts_at?esc(l.starts_at.slice(0,5)):'';
  const pairStr=l.pair_number?`${l.pair_number}-я пара`:'Занятие';

  return `<div class="lecture-row" data-lecture-date="${esc(l.lecture_date)}">
    <div class="lecture-time">
      <span class="time-main">${timeStr||'—'}</span>
      <span class="pair-tag">${pairStr}</span>
    </div>
    <div class="lecture-info">
      <div class="lecture-card-top">
        <span class="subject-badge">${esc(sub(l.subject_id))}</span>
        ${badgeHtml}
      </div>
      <a class="lecture-link" href="lecture.html?id=${encodeURIComponent(l.id)}">
        <h3>${esc(l.title)}</h3>
        ${snippetHtml||(l.summary?`<p class="summary">${esc(l.summary)}</p>`:'')}
      </a>
      ${taskLink||extraLink?`<div class="material-links">${taskLink}${extraLink}</div>`:''}
    </div>
    <button class="icon-btn ${saved?'saved':''}" data-save="${esc(l.id)}" aria-pressed="${saved}" aria-label="${saved?'Убрать из избранного':'В избранное'}">${icon('star')}</button>
  </div>`;
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
   const dayDate=valid?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(d):'—';
   const weekday=valid?new Intl.DateTimeFormat('ru-RU',{weekday:'long'}).format(d):'';
   return `${monthHead}<details open class="date-group" data-date="${esc(day)}" aria-label="${esc(valid?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(d):'Без даты')}"><summary class="date-label"><div class="date-label-content"><span class="date-title">${esc(dayDate)}</span><span class="date-dot">·</span><span class="date-sub">${esc(weekday)}</span></div><span class="day-count">${number(items.length,['занятие','занятия','занятий'])}</span>${icon('chevron','day-chevron')}</summary><div class="lecture-list">${items.map(card).join('')}</div></details>`;
  }).join('');
 }
 function resumeCard(){
  if(page!=='library'||!lectures.length)return '';
  const recent=storage.get('lecture-last-read'),resumed=recent&&lectures.find(l=>l.id===recent.id),item=resumed||lectures[0];
  const label=resumed?'Продолжить чтение':'Последнее занятие';
  const version=resumed?({extra:'Доп. материал',assignment:'Задание',full:'Полная транскрипция',lecture:'Лекция'}[recent.mode]||'Лекция'):date(item.lecture_date,true);
  return `<a class="resume-card hero-feature" href="lecture.html?id=${encodeURIComponent(item.id)}${resumed&&['lecture','full','assignment','extra'].includes(recent.mode)?'&mode='+recent.mode:''}"><div class="feature-top"><span class="eyebrow">${label}</span><span class="feature-arrow">${icon('arrow')}</span></div><div class="feature-art" aria-hidden="true"><svg viewBox="0 0 360 92" fill="none"><path d="M1 73h358" stroke="currentColor" opacity=".2"/><g stroke="currentColor" stroke-width="1.1"><rect x="189" y="13" width="105" height="63" rx="5" transform="rotate(-9 189 13)" opacity=".35"/><rect x="205" y="10" width="105" height="63" rx="5" transform="rotate(-4 205 10)" opacity=".55"/><rect x="220" y="7" width="105" height="63" rx="5" fill="#e6eadf"/><path d="M235 24h40m-40 9h74m-74 9h63m-63 9h48" opacity=".6"/><circle cx="53" cy="44" r="22"/><path d="M53 12v64M21 44h64M30 21l46 46M30 67l46-46"/><path d="M102 44h73m-8-5 8 5-8 5" opacity=".4"/></g></svg></div><div class="feature-copy"><span class="feature-subject">${esc(sub(item.subject_id))}</span><h2>${esc(item.title)}</h2><p>${esc(version)}</p></div></a>`;
 }
 function library(){
  const view=UI.beginList(); selected=params.get('subject')||view.subject||''; search=view.search||''; tasksOnly=view.tasksOnly===true;visibleLimit=Math.max(40,Number(view.visibleLimit)||40);if(selected&&!subjects.some(s=>s.id===selected))selected='';
  const saved=page==='saved';
  $('#main').innerHTML=`<div class="page-head library-heading ${saved?'saved-heading':''}"><div class="hero-lead"><div class="eyebrow"><span class="section-dot" aria-hidden="true"></span>${saved?'Личная подборка':'Материалы занятий'}</div><h1>${saved?'Избранное':'Материалы занятий'}</h1><p>${saved?'Всё, к чему хочется вернуться. Сохранено в этом браузере.':'Коротко о главном. Подробно — обо всём.'}</p>${!saved?`<div class="library-counts"><span><b>${lectures.length}</b> ${number(lectures.length,['лекция','лекции','лекций']).split(' ').slice(1).join(' ')}</span><span><b>${subjects.length}</b> ${number(subjects.length,['предмет','предмета','предметов']).split(' ').slice(1).join(' ')}</span><span class="hero-caption">По датам и темам</span></div>`:''}</div>${resumeCard()}</div><section class="library-browser" aria-label="Список лекций"><div class="filter-panel"><div class="toolbar"><div class="search-field" role="search"><span class="search-symbol" aria-hidden="true">${icon('search')}</span><input id="search" type="search" placeholder="Поиск по лекциям и текстам" aria-label="Поиск по теме, словам и тексту лекций" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-controls="list" aria-describedby="search-description"><span class="search-shortcut" aria-hidden="true">/</span><button id="clear-search" class="search-dismiss" type="button" aria-label="Очистить поиск" hidden>${icon('close')}</button></div><button class="btn library-filter-toggle" id="library-filter-toggle" type="button" aria-expanded="false" aria-controls="library-filter-options">${icon('settings')}<span>Фильтры</span><span id="filter-total" hidden></span></button></div><div class="library-filter-options" id="library-filter-options"><div class="custom-select-wrap library-sort"><select id="sort" aria-label="Сортировка"><option value="new">Сначала новые</option><option value="old">Сначала ранние</option></select>${icon('chevron')}</div><div class="mobile-subject-field custom-select-wrap"><select id="mobile-subject" aria-label="Предмет"><option value="">Все предметы</option>${subjects.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>${icon('chevron')}</div><div class="chips" aria-label="Фильтр по предмету"><button class="chip ${!selected?'active':''}" data-subject="" aria-pressed="${!selected}">Все предметы</button>${subjects.map(s=>`<button class="chip ${selected===s.id?'active':''}" data-subject="${esc(s.id)}" aria-pressed="${selected===s.id}">${esc(s.name)}</button>`).join('')}</div><div class="library-quick-filters"><button type="button" class="task-filter" id="tasks-only" aria-pressed="${tasksOnly}">${icon('book')}<span>С заданием</span><span class="task-total">${lectures.filter(hasTask).length}</span></button><span class="search-hint" id="search-description">Ищет во всех текстах и подписях к фото</span></div></div></div><div class="results-line"><button class="text-button reset-filters" id="reset-filters" type="button" hidden>Сбросить фильтры</button><span id="list-caption">Хронология</span><div class="results-actions"><span id="result-count" aria-live="polite"></span><button id="collapse-days" class="text-button" type="button">Свернуть дни</button></div></div><div id="list"></div><div class="load-more" id="load-more-wrap" hidden><span id="shown-count"></span><button class="btn" type="button" id="load-more">Показать ещё</button></div></section>`;
  const filterToggle=$('#library-filter-toggle'),filterPanel=$('.filter-panel');
  filterToggle.onclick=()=>{const open=filterToggle.getAttribute('aria-expanded')!=='true';filterToggle.setAttribute('aria-expanded',String(open));filterPanel.classList.toggle('filters-expanded',open)};
  $('#mobile-subject').value=selected;
  $('#mobile-subject').onchange=e=>{selected=e.target.value;document.querySelectorAll('[data-subject]').forEach(b=>{const on=b.dataset.subject===selected;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});drawList(true)};
  $('#tasks-only').onclick=()=>{tasksOnly=!tasksOnly;drawList(true)};
  $('#load-more').onclick=()=>{visibleLimit+=40;drawList()};
  $('#reset-filters').onclick=()=>{search='';selected='';tasksOnly=false;$('#search').value='';$('#sort').value='new';document.querySelectorAll('[data-subject]').forEach(b=>{const on=b.dataset.subject==='';b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});drawList()};
  $('#search').value=search; $('#sort').value=view.sort||'new';
  let composing=false,searchTimer;const input=$('#search'),field=$('.search-field');
  field.addEventListener('click',e=>{if(e.target===field)input.focus({preventScroll:true})});
  const runSearch=()=>{clearTimeout(searchTimer);try{drawList(true)}finally{field.classList.remove('is-searching');$('#list').setAttribute('aria-busy','false')}};
  const updateSearch=()=>{search=input.value;UI.searchState(search);clearTimeout(searchTimer);field.classList.add('is-searching');$('#list').setAttribute('aria-busy','true');searchTimer=setTimeout(runSearch,160)};
  input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(searchTimer);field.classList.remove('is-searching');$('#list').setAttribute('aria-busy','false')});
  input.addEventListener('compositionend',()=>{composing=false;updateSearch()});
  input.addEventListener('input',()=>{if(!composing)updateSearch()});
  $('#clear-search').onclick=()=>{input.value='';search='';UI.searchState('');runSearch();input.focus({preventScroll:true})};
  input.addEventListener('keydown',e=>{if(e.isComposing||composing)return;if(e.key==='Escape'&&input.value){e.preventDefault();$('#clear-search').click()}else if(e.key==='Enter'){e.preventDefault();search=input.value;runSearch()}});
  $('#sort').onchange=drawList;
  document.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{selected=b.dataset.subject;document.querySelectorAll('[data-subject]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});drawList()});SearchUI.init(['sort','mobile-subject']);drawList();UI.restoreList();
 }
 function drawList(animate=false){
  SearchUI.sync();UI.searchState(search);const filtered=!!(search.trim()||selected||tasksOnly);$('#tasks-only').setAttribute('aria-pressed',String(tasksOnly));const signature=JSON.stringify([search,selected,tasksOnly,$('#sort')?.value]);if(lastFilter&&lastFilter!==signature)visibleLimit=40;lastFilter=signature;$('#reset-filters').hidden=!filtered;$('#list-caption').hidden=filtered;
  const q=normalizeSearch(search).trim();
  const words=q?q.split(/\s+/).filter(Boolean):[];
  const savedIds=new Set(favorites());
  let list=lectures.filter(l=>{
   if(page==='saved'&&!savedIds.has(l.id))return false;
   if(tasksOnly&&!hasTask(l))return false;
   if(selected&&l.subject_id!==selected)return false;
   delete l._matchText;
   if(!q)return true;
   let indexed=searchCache.get(l);
   if(!indexed){const lecture=cleanText(l.lecture_text),full=cleanText(l.full_text),assignment=cleanText(l.assignment_text),extra=cleanText((l.extra_text||'')+' '+Extras.normalize(l.extra_images).map(x=>x.caption).join(' '));indexed={lecture,full,assignment,extra,extraIndex:normalizeSearch(extra),assignmentIndex:normalizeSearch(assignment),meta:normalizeSearch([l.title,l.summary,sub(l.subject_id),wk(l.week_id),l.lecture_date].join(' ')),lectureIndex:normalizeSearch(lecture),fullIndex:normalizeSearch(full)};searchCache.set(l,indexed)}
   const combined=indexed.combined||(indexed.combined=indexed.meta+' '+indexed.lectureIndex+' '+indexed.fullIndex+' '+indexed.assignmentIndex+' '+indexed.extraIndex);
   if(!words.every(w=>combined.includes(w)))return false;
   if(!words.every(w=>indexed.meta.includes(w))){
    const term=words.find(w=>!indexed.meta.includes(w));
    l._matchText=getMatchSnippet(indexed.lecture,term)||getMatchSnippet(indexed.full,term)||getMatchSnippet(indexed.assignment,term)||getMatchSnippet(indexed.extra,term);
   }
   return true;
  });
  if($('#sort')?.value==='old')list=list.slice().reverse();
  const mobileSubject=$('#mobile-subject');if(mobileSubject)mobileSubject.value=selected;
  const filterTotal=$('#filter-total'),activeFilters=Number(!!selected)+Number(tasksOnly)+Number($('#sort')?.value==='old');if(filterTotal){filterTotal.hidden=!activeFilters;filterTotal.textContent=activeFilters;}
  $('#result-count').textContent=number(list.length,['занятие','занятия','занятий']);
  $('#list').innerHTML=list.length?dateGroups(list.slice(0,visibleLimit)):empty(page==='saved'&&!favorites().length?'Пока ничего не сохранено':'Лекции не найдены',page==='saved'&&!favorites().length?'Нажмите на звёздочку рядом с лекцией.':lectures.length?'Попробуйте другой запрос или выберите все предметы.':'Когда владелец опубликует материалы, они появятся здесь.');
  $('#load-more-wrap').hidden=list.length<=visibleLimit;$('#shown-count').textContent=`Показано ${Math.min(visibleLimit,list.length)} из ${list.length}`;$('#list').dataset.visibleLimit=visibleLimit;
  bindSave();UI.listRendered();if(animate===true)UI.searchResults();
 }
 function subjectPage(){document.title='Предметы — материалы занятий';$('#main').innerHTML=`<div class="page-head collection-heading"><div class="eyebrow"><span class="section-dot" aria-hidden="true"></span>По дисциплинам</div><h1>Предметы<span class="heading-period" aria-hidden="true">.</span></h1><p>Каждая тема — на своём месте.</p></div>${subjects.length?`<div class="subjects-grid">${subjects.map((s,i)=>{const items=lectures.filter(l=>l.subject_id===s.id),n=items.length;const latest=items[0]?.lecture_date;return `<a class="subject-card" data-tone="${i%3}" href="index.html?subject=${encodeURIComponent(s.id)}"><div class="subject-cover" aria-hidden="true"><span class="subject-number">${String(i+1).padStart(2,'0')}</span><span class="subject-orbit">${icon('book')}</span></div><h2>${esc(s.name)}</h2><p class="subject-last">${latest?'Последнее занятие · '+esc(date(latest,true)):'Материалы появятся здесь'}</p><div class="spread"><span>${number(n,['лекция','лекции','лекций'])}</span>${icon('arrow')}</div></a>`}).join('')}</div>`:empty('Предметов пока нет','Они появятся после добавления владельцем.')}`}
 async function reader(){
  const id=params.get('id');
  current=lectures.find(l=>l.id===id);
  if(!current&&id){
   try{current=(await DB.select('lectures','select=*&id=eq.'+encodeURIComponent(id)+'&published=eq.true'))[0]}catch{}
  }
  if(!current){
   $('#main').innerHTML=empty('Лекция недоступна','Возможно, она ещё не опубликована или была удалена.',`<a class="btn" href="index.html">Все лекции</a>`);
   return;
  }
  const l=current;
  document.title=l.title+' — материалы занятий';
  $('#main').innerHTML=`<a class="back-link" href="index.html">${icon('back')} Все лекции</a><div class="read-layout"><article><header class="reader-head"><span class="badge">${esc(sub(l.subject_id))}</span><h1>${esc(l.title)}</h1>${l.summary?`<p class="description">${esc(l.summary)}</p>`:''}${meta(l)}</header><div class="reader-controls"><div class="tabs" role="tablist" aria-label="Версия транскрипции"><button role="tab" id="tab-lecture" aria-controls="reading-text" aria-selected="true" data-mode="lecture" class="active">Лекция</button><button role="tab" id="tab-full" aria-controls="reading-text" aria-selected="false" data-mode="full">Полная транскрипция</button><button role="tab" id="tab-assignment" aria-controls="reading-text" aria-selected="false" data-mode="assignment">Задание</button><button role="tab" id="tab-extra" aria-controls="reading-text" aria-selected="false" data-mode="extra">Доп. материал</button></div><div class="reader-tools"><button class="icon-btn" id="font-down" aria-label="Уменьшить текст">A-</button><button class="icon-btn" id="font-up" aria-label="Увеличить текст">A+</button><button class="icon-btn save-reader ${favorites().includes(l.id)?'saved':''}" data-save="${esc(l.id)}" aria-label="В избранное">${icon('star')}</button></div></div><div class="copy-text-bar"><span id="copy-version-label">Текст лекции</span><button class="btn" id="copy-reading" type="button">Скопировать текст</button><span id="copy-status" class="sr-only" role="status" aria-live="polite"></span></div><div class="prose" id="reading-text" role="tabpanel" aria-labelledby="tab-lecture" tabindex="0"></div><div class="reading-end spread"><span>Конец материала</span><button class="btn ghost" id="scroll-top">Наверх</button></div></article><aside class="toc"><details open><summary>В этой лекции</summary><nav id="toc-links" aria-label="Оглавление"></nav></details></aside></div><div class="related-lectures" id="related-lectures" aria-label="Другие лекции по предмету"></div><div class="progress" id="reading-progress"></div>`;
  const related=lectures.filter(x=>x.subject_id===l.subject_id&&x.id!==l.id).slice(0,2);
  $('#related-lectures').innerHTML=related.length?`<h2>Ещё по этому предмету</h2><div>${related.map(x=>`<a href="lecture.html?id=${encodeURIComponent(x.id)}"><span>${date(x.lecture_date,true)}</span><strong>${esc(x.title)}</strong>${icon('arrow')}</a>`).join('')}</div>`:'';
  const reading=$('#reading-text'),copyButton=$('#copy-reading');
  for(const event of ['copy','cut','contextmenu','dragstart','selectstart'])reading.addEventListener(event,e=>e.preventDefault());
  document.addEventListener('copy',e=>{
   const selection=window.getSelection();
   if(selection?.rangeCount&&selection.getRangeAt(0).intersectsNode(reading))e.preventDefault();
  });
  copyButton.onclick=async()=>{
   if(copyButton.disabled||locked)return;
   const text=Markdown.copyText(mode==='extra'?reading.querySelector('.extra-copy'):reading),version=mode;
   copyButton.disabled=true;
   try{
    let copied=false;
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);copied=true}catch{}}
    if(!copied){
     const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.className='clipboard-buffer';area.setAttribute('aria-label','Копируемый текст');document.body.append(area);
     const x=scrollX,y=scrollY;
     try{area.focus({preventScroll:true});area.select();area.setSelectionRange(0,area.value.length);copied=document.execCommand('copy')}finally{area.remove();copyButton.focus({preventScroll:true});window.scrollTo(x,y)}
    }
    if(!copied)throw new Error('copy_failed');
    const message=version==='extra'?'Дополнительный текст скопирован':version==='assignment'?'Задание скопировано':version==='lecture'?'Текст лекции скопирован':'Полная транскрипция скопирована';
    $('#copy-status').textContent=message;toast(message);
   }catch{const message='Не удалось скопировать. Разрешите браузеру доступ к буферу обмена и попробуйте снова.';$('#copy-status').textContent=message;toast(message)}
   finally{copyButton.disabled=locked||!(mode==='extra'?current.extra_text:mode==='assignment'?current.assignment_text:mode==='lecture'?current.lecture_text:current.full_text)?.trim()}
  };
  let font=Number(storage.get('lecture-font',19));if(!Number.isFinite(font))font=19;font=Math.min(24,Math.max(16,font));
  const setFont=()=>{$('#reading-text').style.fontSize=font+'px';storage.set('lecture-font',font)};
  $('#font-down').onclick=()=>{font=Math.max(16,font-1);setFont()};
  $('#font-up').onclick=()=>{font=Math.min(24,font+1);setFont()};
  setFont();
  $('#scroll-top').onclick=()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  document.querySelectorAll('[data-mode]').forEach(b=>{
   b.onclick=()=>{UI.saveReader();mode=b.dataset.mode;drawText()};
   b.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const modes=['lecture','full','assignment','extra'];const other=$(`[data-mode="${modes[(modes.indexOf(mode)+(e.key==='ArrowRight'?1:modes.length-1))%modes.length]}"]`);other.click();other.focus()}}
  });
  bindSave();
  if(['lecture','full','assignment','extra'].includes(params.get('mode')))mode=params.get('mode');
  drawText();
 }
 function drawText(){if(!current||locked)return;const text=mode==='extra'?current.extra_text:mode==='assignment'?current.assignment_text:mode==='lecture'?current.lecture_text:current.full_text;$('#copy-reading').disabled=!text?.trim();$('#copy-version-label').textContent=mode==='extra'?'Доп. материал':mode==='assignment'?'Задание':mode==='lecture'?'Текст лекции':'Полная транскрипция';$('#copy-status').textContent='';$('#reading-text').innerHTML=text?.trim()?Markdown.render(text):(mode==='assignment'?'<p class="muted">Задание пока не добавлено.</p>':'<p class="muted">Эта версия пока не добавлена.</p>');if(mode==='extra'){const host=$('#reading-text');host.innerHTML='<div class="extra-copy">'+(text?.trim()?Markdown.render(text):'')+'</div><div id="extra-gallery"></div>';Extras.gallery($('#extra-gallery'),current.extra_images);if(!text?.trim()&&!Extras.normalize(current.extra_images).length)host.innerHTML='<p class="muted">Дополнительные материалы пока не добавлены.</p>';}$('#reading-text').setAttribute('aria-labelledby','tab-'+mode);const words=$('#reading-text').innerText.trim().split(/\s+/).filter(Boolean).length;$('#copy-version-label').textContent=(mode==='extra'?'Доп. материал':mode==='assignment'?'Задание':mode==='lecture'?'Лекция':'Полная транскрипция')+(text?.trim()&&mode!=='assignment'?' · ≈ '+Math.max(1,Math.ceil(words/180))+' мин чтения':'');document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});const headings=Array.from($('#reading-text').querySelectorAll('h2,h3'));headings.forEach((h,i)=>h.id='reading-section-'+i);$('#toc-links').innerHTML=headings.map(h=>`<a href="#${h.id}">${esc(h.textContent)}</a>`).join('')||'<span class="small muted">Нет разделов</span>';UI.readerRendered(current.id,mode);if(deviceId)DB.rpc('log_lecture_view',{p_device_id:deviceId,p_lecture_id:current.id,p_mode:mode,p_ip:currentIp}).catch(()=>{})}
 let aboutDataCache=null;
 async function privacy(){
  if(aboutDataCache){renderAbout(aboutDataCache);return}
  $('#main').innerHTML='<div class="about-layout"><div class="loading" role="status">Загружаем описание…</div></div>';
  try{
   const rows=await DB.request('/rest/v1/site_about?select=title,body,updated_at&id=eq.1',{headers:{Authorization:'Bearer '+CONFIG.key}},false);
   if(!rows?.[0])throw new Error('Описание ещё не опубликовано');
   aboutDataCache=rows[0];renderAbout(aboutDataCache);
  }catch(e){
   $('#main').innerHTML=empty('Не удалось загрузить описание','Попробуйте ещё раз через несколько секунд.','<button class="btn" id="about-retry">Повторить</button>');
   $('#about-retry').onclick=privacy;
  }
 }
 function renderAbout(info){
  document.title=info.title+' — материалы занятий';
  $('#main').innerHTML=`<div class="about-layout"><a class="back-link" href="index.html">${icon('back')} К материалам</a><header class="about-heading"><span class="eyebrow">От автора</span><h1>${esc(info.title)}</h1></header><article class="prose about-copy">${Markdown.render(info.body)}</article><p class="analytics-disclosure">Сайт сохраняет сведения о посещениях: открытые страницы и материалы, примерное время с открытой видимой вкладкой и технические данные браузера и устройства. Для определения примерного региона используется IP-адрес; данные о сети могут быть неточны и обрабатываются внешними сервисами. Сведения о просмотренных материалах и сети доступны владельцу сайта. Время является оценкой и может отличаться при потере связи или использовании нескольких вкладок.</p><div class="about-signature">made by <strong>Leonard</strong></div></div>`;
  UI.ready();
 }


 /* ─── Fingerprint ─── */
 async function buildFingerprint(){return 'auth:'+DB.session.user.id}

 /* ─── Сбор технических данных ─── */
 function getDeviceInfo(){
  const ua=navigator.userAgent;
  let os='';
  if(/Windows/i.test(ua))os='Windows';
  else if(/iPhone|iPad/i.test(ua))os='iOS';
  else if(/Android/i.test(ua))os='Android';
  else if(/Mac OS X/i.test(ua))os='macOS';
  else if(/Linux/i.test(ua))os='Linux';
  else os='Other';
  let browser='';
  if(/Edg\//i.test(ua))browser='Edge';
  else if(/OPR\//i.test(ua)||/Opera/i.test(ua))browser='Opera';
  else if(/YaBrowser/i.test(ua))browser='Яндекс';
  else if(/Chrome/i.test(ua))browser='Chrome';
  else if(/Safari/i.test(ua))browser='Safari';
  else if(/Firefox/i.test(ua))browser='Firefox';
  else browser='Other';
  const isTouch='ontouchstart' in window||navigator.maxTouchPoints>0;
  const isCoarse=matchMedia('(pointer:coarse)').matches;
  let deviceType='desktop';
  if(isCoarse){
   if(/tablet|ipad|playbook|silk/i.test(ua)||(screen.width>=768&&screen.height>=768))deviceType='tablet';
   else deviceType='mobile';
  }
  return{
   ua:ua.slice(0,512),
   os,browser,
   deviceType,
   screen:screen.width+'x'+screen.height,
   lang:(navigator.languages||[navigator.language]).slice(0,3).join(','),
   timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'',
   referrer:(document.referrer||'').slice(0,500),
   entryPage:(location.pathname+location.search).slice(0,500),
   hwCores:navigator.hardwareConcurrency||null,
   deviceMem:navigator.deviceMemory>=1?Math.round(navigator.deviceMemory):null,
   dark:matchMedia('(prefers-color-scheme:dark)').matches,
   touch:isTouch
  };
 }

 /* ─── Получение IP и Geo с мульти-фоллбэком (CORS + HTTPS) ─── */
 async function fetchGeo(){
  // 1. Попытка через ipwho.is (бесплатный, HTTPS, CORS, подробное гео)
  try{
   const r=await fetch('https://ipwho.is/',{signal:AbortSignal.timeout(3500)});
   if(r.ok){
    const d=await r.json();
    if(d&&d.success!==false&&d.ip){
     return{ip:d.ip||'',country:d.country||'',countryCode:d.country_code||'',city:d.city||'',isp:d.connection?.isp||d.connection?.org||''};
    }
   }
  }catch(e){}

  // 2. Попытка через freeipapi.com (запасной geo)
  try{
   const r=await fetch('https://freeipapi.com/api/json',{signal:AbortSignal.timeout(3500)});
   if(r.ok){
    const d=await r.json();
    if(d&&d.ipAddress){
     return{ip:d.ipAddress||'',country:d.countryName||'',countryCode:d.countryCode||'',city:d.cityName||'',isp:''};
    }
   }
  }catch(e){}

  // 3. Гарантированный резерв: ipify.org (только чистый IP)
  try{
   const r=await fetch('https://api.ipify.org?format=json',{signal:AbortSignal.timeout(3000)});
   if(r.ok){
    const d=await r.json();
    if(d&&d.ip)return{ip:d.ip,country:'',countryCode:'',city:'',isp:''};
   }
  }catch(e){}

  return{ip:'',country:'',countryCode:'',city:'',isp:''};
 }

 /* ─── Основной трекинг ─── */
 async function track(){
  const fingerprint=await buildFingerprint();
  const dev=getDeviceInfo();
  const geo={ip:'',country:'',countryCode:'',city:'',isp:''};
  currentIp=geo.ip;

  const result=await DB.rpc('upsert_device',{
   p_fingerprint:fingerprint,
   p_ip:geo.ip,
   p_country:geo.country,
   p_country_code:geo.countryCode,
   p_city:geo.city,
   p_isp:geo.isp,
   p_ua:dev.ua,
   p_device_type:dev.deviceType,
   p_os:dev.os,
   p_browser:dev.browser,
   p_screen:dev.screen,
   p_lang:dev.lang,
   p_timezone:dev.timezone,
   p_referrer:dev.referrer,
   p_entry_page:dev.entryPage,
   p_hw_cores:dev.hwCores,
   p_device_mem:dev.deviceMem,
   p_dark:dev.dark,
   p_touch:dev.touch
  });

  if(!result?.device_id)throw new Error('Не удалось зарегистрировать сессию');
  if(result.blocked){lock();return}
  deviceId=result.device_id;
  fetchGeo().then(async g=>{if(locked||!g.ip)return;currentIp=g.ip;await DB.rpc('update_device_network',{p_device_id:deviceId,p_ip:g.ip,p_country:g.country,p_country_code:g.countryCode,p_city:g.city,p_isp:g.isp})}).catch(()=>{});

  // Count time while a page is visible; the database timestamps each transition.
  const presenceId=crypto.randomUUID();
  let presenceQueue=Promise.resolve();
  const tick=visible=>{if(!deviceId||locked)return Promise.resolve();presenceQueue=presenceQueue.catch(()=>{}).then(()=>DB.rpc('device_presence_tick',{p_device_id:deviceId,p_session_id:presenceId,p_visible:visible}));return presenceQueue};
  await tick(!document.hidden);
  tracking=setInterval(()=>{if(deviceId&&!locked&&!document.hidden)tick(true).catch(()=>{})},15000);
  document.addEventListener('visibilitychange',()=>{tick(!document.hidden).catch(()=>{})});
  window.addEventListener('pagehide',()=>{if(!deviceId||locked)return;DB.request('/rest/v1/rpc/device_presence_tick',{method:'POST',keepalive:true,body:JSON.stringify({p_device_id:deviceId,p_session_id:presenceId,p_visible:false})}).catch(()=>{})});

 }

 window.addEventListener('site-paused',()=>{locked=true;clearInterval(poll);clearInterval(tracking);lectures=[];current=null});
 SiteAvailability.start().catch(()=>{});

 shell();
 const cached=getCachedCatalog();
 if(cached){
  subjects=cached.subjects||[];
  weeks=cached.weeks||[];
  lectures=cached.lectures||[];
  if(page==='subjects')subjectPage();
  else if(page==='reader')await reader();
  else if(page==='privacy')await privacy();
  else library();
  UI.ready();
 }

 try{
  await DB.ensureVisitor();
  profile=await DB.profile();
  if(profile.blocked){lock();return}
  try{await track()}catch(e){if(/blocked|access_denied/.test(e.message)){lock();return}toast('Связь со статистикой временно недоступна.')}
  if(locked)return;
  // Access is automatic for non-blocked sessions.
  if(locked)return;
  accessReady=true;

  const loaded=await Promise.all([
   DB.select('subjects','select=*&order=sort_order.asc,name.asc'),
   DB.select('weeks','select=*&order=sort_order.desc,starts_on.desc'),
   DB.select('lectures','select=id,subject_id,week_id,title,lecture_date,starts_at,pair_number,summary,lecture_text,full_text,assignment_text,extra_text,extra_images,published&published=eq.true&order=lecture_date.desc,starts_at.desc&limit=1000')
  ]);
  const [newSubs,newWks,newLecs]=loaded;
  newLecs.sort((a,b)=>(b.lecture_date+(b.starts_at||'')).localeCompare(a.lecture_date+(a.starts_at||'')));
  subjects=newSubs;weeks=newWks;lectures=newLecs;
  setCachedCatalog(subjects,weeks,lectures);

  poll=setInterval(async()=>{
   if(document.hidden||locked)return;
   try{const p=await DB.profile();if(p.blocked){locked=true;clearInterval(poll);clearInterval(tracking);location.reload()}}catch{}
  },20000);

  if(!cached){
   if(page==='subjects')subjectPage();
   else if(page==='reader')await reader();
   else if(page==='privacy')await privacy();
   else library();
   UI.ready();
  }
 }catch(e){if(!cached)fail(e)}

 let readingBarFrame=0;
 window.addEventListener('scroll',()=>{
  if(page!=='reader'||readingBarFrame)return;
  readingBarFrame=requestAnimationFrame(()=>{
   readingBarFrame=0;
   const denom=document.documentElement.scrollHeight-innerHeight;
   const p=$('#reading-progress');
   if(p)p.style.transform='scaleX('+(denom>0?Math.max(0,Math.min(1,scrollY/denom)):1)+')';
  });
 },{passive:true});

 document.addEventListener('click',ev=>{
  if(ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;
  const a=ev.target.closest('a[href]');
  if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
  const rawHref=a.getAttribute('href');
  if(!rawHref||rawHref.startsWith('#')||rawHref.startsWith('mailto:')||rawHref.startsWith('tel:')||rawHref.startsWith('javascript:'))return;
  let target;
  try{target=new URL(a.href,location.href)}catch{return}
  if(target.protocol!==location.protocol)return;
  if(location.protocol!=='file:'&&target.origin!==location.origin)return;
  if(location.protocol==='file:'){
   const curDir=location.pathname.slice(0,location.pathname.lastIndexOf('/'));
   const targetDir=target.pathname.slice(0,target.pathname.lastIndexOf('/'));
   if(curDir!==targetDir)return;
  }
  if(target.pathname.includes('/admin/'))return;
  const isAppUrl=/index\.html|lecture\.html|subjects\.html|saved\.html|privacy\.html|^(\/[^.]*)?$/.test(target.pathname);
  if(!isAppUrl)return;
  ev.preventDefault();
  navigateTo(target.href);
 });

 window.addEventListener('popstate',()=>{
  navigateTo(location.href,{pop:true});
 });

 window.addEventListener('session-lost',()=>{locked=true;clearInterval(poll);clearInterval(tracking);$('#main').innerHTML=empty('Сессия завершена','Обновите страницу, чтобы снова открыть материалы.','<button class="btn" onclick="location.reload()">Обновить</button>')});
 window.addEventListener('offline',()=>toast('Нет интернета. Новые материалы пока не загрузятся.'));
})();
