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
 let page=initResolved.page,params=initResolved.params;let routePath=location.pathname+location.search;
 let subjects=[],weeks=[],lectures=[],profile=null,deviceId=null,currentIp='',selected=params.get('subject')||'',search='',current=null,mode='lecture',poll=null,tracking=null,activity=Date.now(),hiddenAt=0,locked=false,accessReady=false;
 const CATALOG_CACHE='lecture_catalog_v3';
 function getCachedCatalog(){try{const r=sessionStorage.getItem(CATALOG_CACHE);if(!r)return null;const d=JSON.parse(r);if(d&&Array.isArray(d.lectures)&&d.lectures.length&&Date.now()-d.ts<600000)return d}catch{}return null}
 function setCachedCatalog(s,w,l){try{sessionStorage.setItem(CATALOG_CACHE,JSON.stringify({subjects:s,weeks:w,lectures:l,ts:Date.now()}))}catch{}}
 const searchCache=new WeakMap();
 let tasksOnly=false,visibleLimit=40,lastFilter='';
 const hasTask=l=>!!l.assignment_text?.trim();
 const favorites=()=>storage.get('lecture-favorites',[]);
 const sub=id=>subjects.find(s=>s.id===id)?.name||'Предмет';
 const versions={lecture:'Лекция',full:'Полная транскрипция',assignment:'Задание',extra:'Доп. материалы'};
 const versionText=(lecture,version)=>lecture?.[version+'_text'];
 const searchVersions={lecture:'В лекции',full:'В транскрипции',assignment:'В задании',extra:'В доп. материалах'};
 const subjectHref=id=>'index.html?subject='+encodeURIComponent(id);
 const lectureHref=(id,version)=>'lecture.html?id='+encodeURIComponent(id)+(version?'&mode='+version:'');
 const countLectures=n=>number(n,['лекция','лекции','лекций']);
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
  const nav=[['library','index.html','grid','Все лекции'],['subjects','subjects.html','book','Предметы'],['saved','saved.html','star','Избранное']];
  const links=nav.map(([id,file,ic,label])=>{const on=page===id||(page==='reader'&&id==='library');return `<a href="${file}" class="${on?'active':''}" ${on?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`}).join('');
  $('#app').innerHTML=`<a class="skip-link" href="#main">К материалам</a><aside class="sidebar"><a class="side-mark" href="index.html" aria-label="Материалы занятий"><div class="mark">${icon('book')}</div><span>Конспекты</span></a><nav class="side-nav" aria-label="Основная навигация">${links}</nav><div class="side-bottom"><span>made by <strong>Leonard</strong></span><a href="privacy.html">О сайте ${icon("arrow")}</a></div></aside><div class="shell"><header class="topbar"><div class="crumb"><a class="crumb-root" href="index.html">Материалы</a> ${icon('chevron')} <b>${({library:'Все лекции',subjects:'Предметы',saved:'Избранное',reader:'Чтение',privacy:'О сайте'})[page]}</b></div><div class="top-right"><a class="top-help" href="privacy.html">О сайте</a></div></header><main class="content" id="main" tabindex="-1">${UI.skeleton(page)}</main>${App.footer()}</div><nav class="mobile-nav" aria-label="Основная навигация на телефоне">${links}</nav>`;
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
   page=resolved.page;params=resolved.params;routePath=location.pathname+location.search;selected=params.get('subject')||'';
   document.body.dataset.page=page;updateChrome(page);if(deviceId)DB.rpc('record_navigation',{p_device_id:deviceId,p_page:page}).catch(()=>{});if(page!=='reader')document.body.classList.remove('reading-focus');
   if(main&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    main.classList.add('is-transitioning');
    await new Promise(r=>setTimeout(r,40));
   }
   if(page==='subjects')subjectPage();
   else if(page==='reader')await reader();
   else if(page==='privacy')await privacy();
   else library();
   if(page!=='library'&&page!=='saved'&&page!=='reader')window.scrollTo({top:0,behavior:'instant'});
   UI.ready();
  }catch(err){
   console.warn('Navigation fallback:',err);
   location.href=target.href;
  }finally{
   if(main)main.classList.remove('is-transitioning');
   isNavigating=false;
  }
 }
 function fail(e){document.documentElement.classList.remove('access-boot');if(window.VisitorAccess&&/visitor_access_status|submit_access_request/.test(e.message))e=new Error(VisitorAccess.error(e));$('#main').innerHTML=empty(e.message==='blocked'?'Доступ ограничен':'Не удалось открыть материалы',errorText(e),`<button class="btn primary" id="retry">Попробовать снова</button>`);$('#retry')?.addEventListener('click',()=>location.reload())}
 function lock(){try{sessionStorage.removeItem(CATALOG_CACHE)}catch{}document.body.classList.add('awaiting-access');locked=true;clearInterval(poll);clearInterval(tracking);lectures=[];current=null;$('#main').innerHTML=empty('Доступ ограничен','Владелец ограничил доступ для этого посетителя.');document.title='Доступ ограничен'}
 function meta(l){const values=[l.lecture_date?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(l.lecture_date+'T12:00:00')):'Без даты',l.pair_number?`${l.pair_number}-я пара`:'',l.starts_at?l.starts_at.slice(0,5):''].filter(Boolean);return `<div class="lecture-meta" aria-label="Дата и время занятия">${values.map(value=>`<span>${esc(value)}</span>`).join('<span class="sep" aria-hidden="true">·</span>')}</div>`}
 const normalizeSearch=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
 function cleanText(t){return (t||'').replace(/:::[\w-]*|[#*`~>|_=-]/g,' ').replace(/\s+/g,' ')}
 function getMatchSnippet(text,term){
  const index=normalizeSearch(text).indexOf(term);
  if(index<0)return '';
  const start=Math.max(0,index-40),end=Math.min(text.length,index+term.length+70);
  return (start?'… ':'')+esc(text.slice(start,index))+'<mark>'+esc(text.slice(index,index+term.length))+'</mark>'+esc(text.slice(index+term.length,end))+(end<text.length?' …':'');
 }
 function card(l){
  const saved=favorites().includes(l.id),match=l._searchMatch;
  const snippetHtml=match?`<p class="search-snippet">${match.snippet}</p>`:'';
  const badgeHtml=match?`<span class="search-match-badge">${icon('search')}${searchVersions[match.version]}</span>`:'';
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
      <a class="lecture-link" href="${lectureHref(l.id,match?.version)}">
        <h3>${esc(l.title)}</h3>
        ${snippetHtml}
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
  const version=resumed?(Object.hasOwn(versions,recent.mode)?recent.mode:'lecture'):null;
  return `<a class="resume-card hero-feature" href="${lectureHref(item.id,version)}"><div class="feature-top"><span class="eyebrow">${icon(resumed?'book':'clock')}${label}</span><span class="feature-arrow">${icon('arrow')}</span></div><div class="feature-copy"><h2>${esc(item.title)}</h2><p>${esc(sub(item.subject_id))} <span aria-hidden="true">·</span> ${esc(version?versions[version]:date(item.lecture_date))}</p></div></a>`;
 }
 function library(){
  const view=UI.beginList(); selected=view.subject??params.get('subject')??''; search=view.search||''; tasksOnly=view.tasksOnly===true;visibleLimit=Math.max(40,Number(view.visibleLimit)||40);if(selected&&!subjects.some(s=>s.id===selected))selected='';
  const saved=page==='saved';
  const heading=selected?sub(selected):'Конспекты';
  $('#main').innerHTML=`
   <header class="page-head library-heading ${saved?'saved-heading':''}">
    <div class="hero-lead">
     ${saved?'':`<div class="eyebrow">3 курс <span aria-hidden="true">·</span> Лингвистика</div>`}
     <h1>${esc(saved?'Избранное':heading)}</h1>
     <p>${saved?'Лекции, сохранённые в этом браузере.':selected?countLectures(lectures.filter(l=>l.subject_id===selected).length):`${countLectures(lectures.length)} <span aria-hidden="true">·</span> ${number(subjects.length,['предмет','предмета','предметов'])}`}</p>
    </div>
    ${!saved?resumeCard():''}
   </header>
   <section class="library-browser" aria-label="Список лекций">
    <div class="filter-panel">
     <div class="search-field" role="search">
      <span class="search-symbol" aria-hidden="true">${icon('search')}</span>
      <input id="search" type="search" placeholder="Поиск по лекциям и текстам" aria-label="Поиск по лекциям и текстам" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-controls="list">
      <span class="search-shortcut" aria-hidden="true">/</span>
      <button id="clear-search" class="search-dismiss" type="button" aria-label="Очистить поиск" hidden>${icon('close')}</button>
     </div>
     <div class="catalog-filters">
      <div class="custom-select-wrap"><select id="subject-filter" aria-label="Предмет"><option value="">Все предметы</option>${subjects.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>${icon('chevron')}</div>
      <div class="custom-select-wrap"><select id="sort" aria-label="Сортировка"><option value="new">Новые сверху</option><option value="old">Ранние сверху</option></select>${icon('chevron')}</div>
      <button type="button" class="task-filter" id="tasks-only" aria-pressed="${tasksOnly}">${icon('book')}<span>С заданием</span></button>
     </div>
    </div>
    <div class="results-line">
     <span id="result-count" aria-live="polite"></span>
     <div class="results-actions">
      <button class="text-button reset-filters" id="reset-filters" type="button" hidden>Сбросить</button>
      <button id="collapse-days" class="text-button" type="button">Свернуть дни</button>
     </div>
    </div>
    <div id="list"></div>
    <div class="load-more" id="load-more-wrap" hidden><span id="shown-count"></span><button class="btn" type="button" id="load-more">Показать ещё</button></div>
   </section>`;
  $('#subject-filter').value=selected;
  $('#subject-filter').onchange=e=>{selected=e.target.value;drawList(true)};
  $('#tasks-only').onclick=()=>{tasksOnly=!tasksOnly;drawList(true)};
  $('#load-more').onclick=()=>{visibleLimit+=40;drawList()};
  $('#reset-filters').onclick=()=>{search='';selected='';tasksOnly=false;$('#search').value='';$('#sort').value='new';drawList()};
  $('#search').value=search; $('#sort').value=view.sort||'new';
  let composing=false,searchTimer;const input=$('#search'),field=$('.search-field');
  field.addEventListener('click',e=>{if(e.target===field)input.focus({preventScroll:true})});
  const runSearch=()=>{
   clearTimeout(searchTimer);
   if(!field.isConnected||locked)return;
   try{drawList(true)}finally{field.classList.remove('is-searching');$('#list').setAttribute('aria-busy','false')}
  };
  const updateSearch=()=>{search=input.value;UI.searchState(search);clearTimeout(searchTimer);field.classList.add('is-searching');$('#list').setAttribute('aria-busy','true');searchTimer=setTimeout(runSearch,160)};
  input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(searchTimer);field.classList.remove('is-searching');$('#list').setAttribute('aria-busy','false')});
  input.addEventListener('compositionend',()=>{composing=false;updateSearch()});
  input.addEventListener('input',()=>{if(!composing)updateSearch()});
  $('#clear-search').onclick=()=>{input.value='';search='';UI.searchState('');runSearch();input.focus({preventScroll:true})};
  input.addEventListener('keydown',e=>{if(e.isComposing||composing)return;if(e.key==='Escape'&&input.value){e.preventDefault();$('#clear-search').click()}else if(e.key==='Enter'){e.preventDefault();search=input.value;runSearch()}});
  $('#sort').onchange=drawList;
  lastFilter='';
  drawList();
  UI.restoreList();
 }
 function searchIndex(l){
  let indexed=searchCache.get(l);
  if(indexed)return indexed;
  const texts={
   lecture:cleanText(l.lecture_text),full:cleanText(l.full_text),assignment:cleanText(l.assignment_text),
   extra:cleanText((l.extra_text||'')+' '+Extras.normalize(l.extra_images).map(image=>image.caption).join(' '))
  };
  const sections=Object.entries(texts).map(([version,text])=>({version,text,normalized:normalizeSearch(text)}));
  const meta=normalizeSearch([l.title,l.summary,sub(l.subject_id),l.lecture_date].join(' '));
  indexed={meta,sections,all:[meta,...sections.map(section=>section.normalized)].join(' ')};
  searchCache.set(l,indexed);
  return indexed;
 }
 function drawList(animate=false){
  $('#subject-filter').value=selected;
  UI.searchState(search);
  $('#tasks-only').setAttribute('aria-pressed',String(tasksOnly));
  const oldest=$('#sort').value==='old';
  const signature=JSON.stringify([search,selected,tasksOnly,oldest]);
  if(lastFilter&&lastFilter!==signature)visibleLimit=40;
  lastFilter=signature;
  $('#reset-filters').hidden=!(search.trim()||selected||tasksOnly||oldest);
  if(page==='library'){
   const name=selected?sub(selected):'Конспекты';
   $('.hero-lead h1').textContent=name;
   $('.hero-lead p').textContent=selected?countLectures(lectures.filter(l=>l.subject_id===selected).length):
    countLectures(lectures.length)+' · '+number(subjects.length,['предмет','предмета','предметов']);
   const feature=$('.hero-feature');
   if(feature)feature.hidden=!!selected;
   $('.library-heading').classList.toggle('with-feature',!!feature&&!selected);
  }
  const words=normalizeSearch(search).trim().split(/\s+/).filter(Boolean);
  const savedIds=new Set(favorites());
  const list=lectures.filter(l=>{
   if(page==='saved'&&!savedIds.has(l.id))return false;
   if(tasksOnly&&!hasTask(l))return false;
   if(selected&&l.subject_id!==selected)return false;
   l._searchMatch=null;
   if(!words.length)return true;
   const indexed=searchIndex(l);
   if(!words.every(word=>indexed.all.includes(word)))return false;
   const missing=words.filter(word=>!indexed.meta.includes(word));
   if(missing.length){
    const section=indexed.sections.find(part=>missing.every(word=>part.normalized.includes(word)))||
     indexed.sections.find(part=>missing.some(word=>part.normalized.includes(word)));
    if(section){
     const term=missing.find(word=>section.normalized.includes(word));
     l._searchMatch={version:section.version,snippet:getMatchSnippet(section.text,term)};
    }
   }
   return true;
  });
  if(oldest)list.reverse();
  $('#result-count').textContent=number(list.length,['занятие','занятия','занятий']);
  $('#list').innerHTML=list.length?dateGroups(list.slice(0,visibleLimit)):empty(page==='saved'&&!favorites().length?'Пока ничего не сохранено':'Лекции не найдены',page==='saved'&&!favorites().length?'Нажмите на звёздочку рядом с лекцией.':lectures.length?'Попробуйте другой запрос или выберите все предметы.':'Когда владелец опубликует материалы, они появятся здесь.');
  $('#load-more-wrap').hidden=list.length<=visibleLimit;$('#shown-count').textContent=`Показано ${Math.min(visibleLimit,list.length)} из ${list.length}`;$('#list').dataset.visibleLimit=visibleLimit;
  bindSave();UI.listRendered();if(animate===true)UI.searchResults();
 }
 function subjectPage(){
  document.title='Предметы — материалы занятий';
  const stats=new Map();
  for(const lecture of lectures){
   const info=stats.get(lecture.subject_id)||{count:0,last:null};
   info.count++;
   if(!info.last&&lecture.lecture_date)info.last=lecture.lecture_date;
   stats.set(lecture.subject_id,info);
  }
  const cards=subjects.map(subject=>{
   const {count,last}=stats.get(subject.id)||{count:0,last:null};
   return `<a class="subject-card" href="${subjectHref(subject.id)}">
    <span class="subject-icon">${icon('book')}</span>
    <h2>${esc(subject.name)}</h2>
    <div class="subject-stats"><span>${countLectures(count)}</span>${last?`<span>· ${esc(date(last,true))}</span>`:''}${icon('arrow')}</div>
   </a>`;
  }).join('');
  $('#main').innerHTML=`<header class="page-head collection-heading"><h1>Предметы</h1><p>${number(subjects.length,['предмет','предмета','предметов'])}</p></header>${cards?`<div class="subjects-grid">${cards}</div>`:empty('Предметов пока нет','Они появятся после добавления владельцем.')}`;
 }
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
  const available=Object.keys(versions).filter(version=>{
   if(version==='lecture')return true;
   if(version==='extra')return !!l.extra_text?.trim()||Extras.normalize(l.extra_images).length>0;
   return !!versionText(l,version)?.trim();
  });
  const requested=params.get('mode'),previous=storage.get('lecture-position:'+id)?.mode;
  if(Object.hasOwn(versions,requested)&&!available.includes(requested))available.push(requested);
  mode=available.includes(requested)?requested:available.includes(previous)?previous:'lecture';
  const isSaved=favorites().includes(l.id);
  const tabs=available.map(version=>`<button role="tab" id="tab-${version}" aria-controls="reading-text" data-mode="${version}">${versions[version]}</button>`).join('');
  $('#main').innerHTML=`<a class="back-link" href="index.html">${icon('back')} Все лекции</a><div class="read-layout"><article><header class="reader-head"><a class="badge" href="${subjectHref(l.subject_id)}">${esc(sub(l.subject_id))}</a><h1>${esc(l.title)}</h1>${meta(l)}</header><div class="reader-controls"><div class="tabs" role="tablist" aria-label="Материалы занятия">${tabs}</div><div class="reader-tools"><button class="icon-btn" id="font-down" aria-label="Уменьшить текст">A-</button><button class="icon-btn" id="font-up" aria-label="Увеличить текст">A+</button><button class="icon-btn save-reader ${isSaved?'saved':''}" data-save="${esc(l.id)}" aria-pressed="${isSaved}" aria-label="${isSaved?'Убрать из избранного':'В избранное'}">${icon('star')}</button></div></div><div class="copy-text-bar"><span id="copy-version-label">Текст лекции</span><button class="btn" id="copy-reading" type="button">Скопировать текст</button><span id="copy-status" class="sr-only" role="status" aria-live="polite"></span></div><div class="prose" id="reading-text" role="tabpanel" aria-labelledby="tab-lecture" tabindex="0"></div><div class="reading-end spread"><span>Конец материала</span><button class="btn ghost" id="scroll-top">Наверх</button></div></article><aside class="toc"><details open><summary>В этой лекции</summary><nav id="toc-links" aria-label="Оглавление"></nav></details></aside></div><div class="related-lectures" id="related-lectures" aria-label="Другие лекции по предмету"></div><div class="progress" id="reading-progress"></div>`;
  const related=lectures.filter(x=>x.subject_id===l.subject_id&&x.id!==l.id).slice(0,2);
  $('#related-lectures').innerHTML=related.length?`<h2>Ещё по этому предмету</h2><div>${related.map(x=>`<a href="lecture.html?id=${encodeURIComponent(x.id)}"><span>${date(x.lecture_date,true)}</span><strong>${esc(x.title)}</strong>${icon('arrow')}</a>`).join('')}</div>`:'';
  const reading=$('#reading-text'),copyButton=$('#copy-reading');
  for(const event of ['copy','cut','contextmenu','dragstart','selectstart'])reading.addEventListener(event,e=>e.preventDefault());
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
   finally{copyButton.disabled=locked||!versionText(current,mode)?.trim()}
  };
  let font=Number(storage.get('lecture-font',19));if(!Number.isFinite(font))font=19;font=Math.min(24,Math.max(16,font));
  const setFont=()=>{
   reading.style.fontSize=font+'px';
   $('#font-down').disabled=font===16;
   $('#font-up').disabled=font===24;
   storage.set('lecture-font',font);
   UI.progress();
  };
  $('#font-down').onclick=()=>{font=Math.max(16,font-1);setFont()};
  $('#font-up').onclick=()=>{font=Math.min(24,font+1);setFont()};
  setFont();
  $('#scroll-top').onclick=()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  const tabButtons=[...document.querySelectorAll('[data-mode]')];
  tabButtons.forEach((button,index)=>{
   button.onclick=()=>{
    if(mode===button.dataset.mode)return;
    UI.saveReader();
    mode=button.dataset.mode;
    const url=new URL(location.href);
    url.searchParams.set('mode',mode);
    url.hash='';
    history.replaceState(history.state,'',url);
    params=url.searchParams;
    routePath=url.pathname+url.search;
    drawText();
   };
   button.onkeydown=e=>{
    const last=tabButtons.length-1;
    const positions={ArrowLeft:index===0?last:index-1,ArrowRight:index===last?0:index+1,Home:0,End:last};
    if(!Object.hasOwn(positions,e.key))return;
    e.preventDefault();
    const next=tabButtons[positions[e.key]];
    next.click();
    next.focus({preventScroll:true});
   };
  });
  bindSave();
  drawText();
 }
 function drawText(){
  if(!current||locked)return;
  const reading=$('#reading-text'),text=versionText(current,mode)?.trim();
  $('#copy-reading').disabled=!text;
  $('#copy-status').textContent='';
  const rendered=text?Markdown.render(text):'';
  if(mode==='extra'&&(text||Extras.normalize(current.extra_images).length)){
   reading.innerHTML='<div class="extra-copy">'+rendered+'</div><div id="extra-gallery"></div>';
   Extras.gallery($('#extra-gallery'),current.extra_images);
  }else{
   const emptyText=mode==='assignment'?'Задание пока не добавлено.':'Эта версия пока не добавлена.';
   reading.innerHTML=rendered||'<p class="muted">'+emptyText+'</p>';
  }
  reading.setAttribute('aria-labelledby','tab-'+mode);
  const words=reading.innerText.trim().split(/\s+/).filter(Boolean).length;
  const duration=text&&mode!=='assignment'?' · ≈ '+Math.max(1,Math.ceil(words/180))+' мин чтения':'';
  $('#copy-version-label').textContent=versions[mode]+duration;
  document.querySelectorAll('[data-mode]').forEach(button=>{
   const active=button.dataset.mode===mode;
   button.classList.toggle('active',active);
   button.setAttribute('aria-selected',String(active));
   button.tabIndex=active?0:-1;
  });
  const headings=[...reading.querySelectorAll('h2,h3')];
  headings.forEach((heading,index)=>heading.id='reading-section-'+index);
  $('#toc-links').innerHTML=headings.map(heading=>`<a class="${heading.tagName==='H3'?'toc-subheading':''}" href="#${heading.id}">${esc(heading.textContent)}</a>`).join('');
  UI.readerRendered(current.id,mode);
  if(deviceId)DB.rpc('log_lecture_view',{p_device_id:deviceId,p_lecture_id:current.id,p_mode:mode,p_ip:currentIp}).catch(()=>{});
 }
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
 // Content is never rendered from cache before server-side authorization.
 let cached=null;
 try{sessionStorage.removeItem(CATALOG_CACHE)}catch{}
 document.body.classList.add('awaiting-access');

 try{
  await DB.ensureVisitor();
  await NameGate.ensure();
  await VisitorAccess.ensure();
  profile=await DB.profile();
  if(profile.blocked){lock();return}
  try{await track()}catch(e){if(/blocked|access_denied/.test(e.message)){lock();return}toast('Связь со статистикой временно недоступна.')}
  if(locked)return;
  const loaded=await Promise.all([
   DB.select('subjects','select=*&order=sort_order.asc,name.asc'),
   DB.select('weeks','select=*&order=sort_order.desc,starts_on.desc'),
   DB.select('lectures','select=id,subject_id,week_id,title,lecture_date,starts_at,pair_number,summary,lecture_text,full_text,assignment_text,extra_text,extra_images,published&published=eq.true&order=lecture_date.desc,starts_at.desc&limit=1000')
  ]);
  const [newSubs,newWks,newLecs]=loaded;
  newLecs.sort((a,b)=>(b.lecture_date+(b.starts_at||'')).localeCompare(a.lecture_date+(a.starts_at||'')));
  if(locked)return;
  subjects=newSubs;weeks=newWks;lectures=newLecs;
  accessReady=true;
  // Do not persist lecture text in browser storage.


  poll=setInterval(async()=>{
   if(document.hidden||locked)return;
   try{const access=await VisitorAccess.status();if(!access?.allowed){try{sessionStorage.removeItem(CATALOG_CACHE)}catch{}location.reload();return}const p=await DB.profile();if(p.blocked){locked=true;clearInterval(poll);clearInterval(tracking);location.reload()}}catch{lock()}
  },20000);

  if(!cached){
   if(page==='subjects')subjectPage();
   else if(page==='reader')await reader();
   else if(page==='privacy')await privacy();
   else library();
   document.body.classList.remove('awaiting-access');document.documentElement.classList.remove('access-boot');
   UI.ready();
  }
 }catch(e){if(!cached)fail(e)}

 document.addEventListener('copy',event=>{
  const reading=$('#reading-text'),selection=window.getSelection();
  if(reading&&selection?.rangeCount&&selection.getRangeAt(0).intersectsNode(reading))event.preventDefault();
 });
 document.addEventListener('click',ev=>{
  if(!accessReady||locked||ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;
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
  if(!accessReady||locked)return;
  if(location.pathname+location.search===routePath){UI.followHash();return}
  navigateTo(location.href,{pop:true});
 });

 window.addEventListener('session-lost',()=>{try{sessionStorage.removeItem(CATALOG_CACHE)}catch{}document.body.classList.add('awaiting-access');subjects=[];weeks=[];lectures=[];current=null;locked=true;clearInterval(poll);clearInterval(tracking);$('#main').innerHTML=empty('Сессия завершена','Обновите страницу, чтобы снова открыть материалы.','<button class="btn" onclick="location.reload()">Обновить</button>')});
 window.addEventListener('offline',()=>toast('Нет интернета. Новые материалы пока не загрузятся.'));
})();
