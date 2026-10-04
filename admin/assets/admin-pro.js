'use strict';
(()=>{
  const PAGE_META={
    overview:{title:'Обзор',hint:'Состояние сайта'},
    schedule:{title:'Расписание',hint:'Пары и следующие занятия'},
    lectures:{title:'Материалы',hint:'Лекции и публикации'},
    editor:{title:'Редактор',hint:'Создание материала'},
    structure:{title:'Недели и предметы',hint:'Структура учебного года'},
    visitors:{title:'Посетители',hint:'Доступ и активность'},
    stats:{title:'Статистика',hint:'Просмотры и активность'},
    help:{title:'Оформление текста',hint:'Подсказки по разметке'},
    about:{title:'О сайте',hint:'Настройки и состояние'},
    trash:{title:'Корзина',hint:'Удалённые материалы'}
  };
  const page=document.body.dataset.page||'overview';
  const $=(q,r=document)=>r.querySelector(q);
  const $$=(q,r=document)=>[...r.querySelectorAll(q)];

  function icon(name){
    const paths={
      search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
      plus:'<path d="M12 5v14M5 12h14"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      arrow:'<path d="m9 5 7 7-7 7"/>'
    };
    return `<svg class="pro-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
  }

  const publicHome=location.pathname.includes('/public/admin/')?'../index.html':'../index.html';
  const commands=[
    {title:'Обзор',group:'Работа',href:'overview.html',keys:'G O'},
    {title:'Материалы',group:'Работа',href:'index.html',keys:'G M'},
    {title:'Новая лекция',group:'Работа',href:'editor.html',keys:'N'},
    {title:'Расписание',group:'Работа',href:'schedule.html',keys:'G R'},
    {title:'Недели и предметы',group:'Организация',href:'structure.html',keys:''},
    {title:'Посетители',group:'Организация',href:'visitors.html',keys:''},
    {title:'Статистика',group:'Организация',href:'stats.html',keys:''},
    {title:'Оформление текста',group:'Система',href:'help.html',keys:''},
    {title:'О сайте',group:'Система',href:'about.html',keys:''},
    {title:'Корзина',group:'Система',href:'trash.html',keys:''},
    {title:'Открыть сайт',group:'Система',href:publicHome,keys:''}
  ];

  function setupSidebar(){
    const side=$('.sidebar'),nav=$('.side-nav');
    if(!side||!nav||side.dataset.proReady)return;
    side.dataset.proReady='true';

    const mark=$('.side-mark',side);
    if(mark){
      const old=mark.querySelector('span');
      if(old){
        const brand=document.createElement('div');
        brand.className='pro-brand-copy';
        brand.innerHTML='<strong>Админ-панель</strong><small>Учебные материалы</small>';
        old.replaceWith(brand);
      }
      const search=document.createElement('button');
      search.type='button';
      search.className='pro-nav-search';
      search.innerHTML=`${icon('search')}<span>Найти раздел</span><kbd>Ctrl K</kbd>`;
      search.addEventListener('click',openPalette);
      mark.after(search);
    }

    $$('.pro-nav-label',nav).forEach(el=>el.remove());
    const links=$$('a',nav);
    const byFile=new Map();
    links.forEach(a=>{
      const href=(a.getAttribute('href')||'').split('/').pop();
      if(href)byFile.set(href,a);
    });
    const groups=[
      ['РАБОТА',['overview.html','index.html','schedule.html']],
      ['ОРГАНИЗАЦИЯ',['structure.html','visitors.html','stats.html']],
      ['СИСТЕМА',['help.html','about.html','trash.html']]
    ];
    nav.innerHTML='';
    groups.forEach(([label,files])=>{
      const title=document.createElement('div');
      title.className='pro-nav-label';
      title.textContent=label;
      nav.append(title);
      files.forEach(file=>{
        const a=byFile.get(file);
        if(!a)return;
        a.title='';
        nav.append(a);
      });
    });
  }

  function setupTopbar(){
    const top=$('.topbar'),right=$('.top-right');
    if(!top||!right||top.dataset.proReady)return;
    top.dataset.proReady='true';
    const meta=PAGE_META[page]||PAGE_META.overview;
    const crumb=$('.crumb',top);
    if(crumb)crumb.innerHTML=`<b>${meta.title}</b><small>${meta.hint}</small>`;

    const search=document.createElement('button');
    search.type='button';
    search.className='pro-command-trigger';
    search.setAttribute('aria-label','Найти раздел');
    search.title='Найти раздел · Ctrl+K';
    search.innerHTML=`${icon('search')}<span>Поиск</span><kbd>Ctrl K</kbd>`;
    search.addEventListener('click',openPalette);

    const create=document.createElement('a');
    create.className='pro-top-create';
    create.href='editor.html';
    create.innerHTML=`${icon('plus')}<span>Новая лекция</span>`;
    right.prepend(create);
    right.prepend(search);
  }

  let palette=null;
  function ensurePalette(){
    if(palette)return palette;
    palette=document.createElement('dialog');
    palette.className='pro-command';
    palette.innerHTML=`
      <div class="pro-command-box">
        <div class="pro-command-search">
          ${icon('search')}
          <input type="search" placeholder="Куда перейти?" autocomplete="off" aria-label="Поиск по админ-панели">
          <button type="button" aria-label="Закрыть">${icon('close')}</button>
        </div>
        <div class="pro-command-list"></div>
        <div class="pro-command-foot"><span>↑↓ выбрать</span><span>Enter открыть</span><span>Esc закрыть</span></div>
      </div>`;
    document.body.append(palette);

    const input=$('input',palette),close=$('button',palette),list=$('.pro-command-list',palette);
    const draw=()=>{
      const q=input.value.trim().toLowerCase();
      const rows=commands.filter(c=>(c.title+' '+c.group).toLowerCase().includes(q));
      list.innerHTML=rows.length?rows.map((c,i)=>`
        <a href="${c.href}" class="${i===0?'is-selected':''}">
          <span><strong>${c.title}</strong><small>${c.group}</small></span>
          ${c.keys?`<kbd>${c.keys}</kbd>`:'<span class="pro-command-chevron">'+icon('arrow')+'</span>'}
        </a>`).join(''):'<div class="pro-command-empty">Ничего не найдено</div>';
    };
    input.addEventListener('input',draw);
    close.addEventListener('click',()=>palette.close());
    palette.addEventListener('click',e=>{if(e.target===palette)palette.close()});
    palette.addEventListener('close',()=>{input.value='';draw()});
    input.addEventListener('keydown',e=>{
      const items=$$('a',list);
      if(!items.length)return;
      let i=items.findIndex(a=>a.classList.contains('is-selected'));
      if(i<0)i=0;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();
        items[i]?.classList.remove('is-selected');
        i=(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items[i].classList.add('is-selected');
        items[i].scrollIntoView({block:'nearest'});
      }else if(e.key==='Enter'){
        e.preventDefault();
        (items[i]||items[0]).click();
      }
    });
    draw();
    return palette;
  }

  function openPalette(){
    const d=ensurePalette();
    if(!d.open)d.showModal();
    requestAnimationFrame(()=>d.querySelector('input')?.focus());
  }

  function setupKeyboard(){
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
        e.preventDefault();
        openPalette();
      }
    });
  }

  function setupMobile(){
    const nav=$('.mobile-nav');
    if(!nav||nav.dataset.proReady)return;
    nav.dataset.proReady='true';
    const overview=document.createElement('a');
    overview.href='overview.html';
    overview.innerHTML='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7"/></svg><span>Обзор</span>';
    if(page==='overview')overview.classList.add('active');
    nav.prepend(overview);
  }

  function addFilterHeader(){
    const filters=$('.desk-filters');
    if(!filters||filters.dataset.proReady)return;
    filters.dataset.proReady='true';
    const head=document.createElement('div');
    head.className='pro-filter-head';
    head.innerHTML='<strong>Фильтры</strong><button type="button" class="pro-filter-toggle">Свернуть</button>';
    filters.prepend(head);
    const toggle=$('.pro-filter-toggle',filters);
    toggle?.addEventListener('click',()=>{
      const collapsed=filters.classList.toggle('is-collapsed');
      toggle.textContent=collapsed?'Показать':'Свернуть';
    });
  }

  function decorate(){
    const head=$('#main .page-head');
    if(head)head.classList.add('pro-page-head');
    $$('#main .panel').forEach(p=>p.classList.add('pro-panel'));
    addFilterHeader();
  }

  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate()});
  });

  function boot(){
    document.body.classList.add('pro-admin');
    setupSidebar();
    setupTopbar();
    setupMobile();
    setupKeyboard();
    decorate();
    const main=$('#main');
    if(main)observer.observe(main,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
