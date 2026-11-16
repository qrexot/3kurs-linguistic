'use strict';
window.AdminStudio=(()=>{
 const $=s=>document.querySelector(s),e=App.esc;
 const navigation=[
  {label:'Рабочее пространство',items:[['overview.html','Обзор','grid'],['index.html','Материалы','book'],['structure.html','Предметы','grid'],['schedule.html','Расписание','clock']]},
  {label:'Управление сайтом',items:[['visitors.html','Посетители','users'],['stats.html','Статистика','chart'],['about.html','Настройки сайта','settings']]},
  {label:'Дополнительно',items:[['help.html','Оформление текста','file'],['trash.html','Корзина','close']]}
 ];
 function make(tag,cls,html){const el=document.createElement(tag);el.className=cls;el.innerHTML=html;return el}
 function fold(nodes,title,cls=''){nodes=nodes.filter(Boolean);if(!nodes.length)return null;const d=make('details','quiet-fold '+cls,'<summary>'+e(title)+'</summary><div class="quiet-fold-body"></div>');nodes[0].before(d);nodes.forEach(n=>d.lastElementChild.append(n));return d}
 function shell(){
  if(document.body.classList.contains('quiet-admin'))return;
  document.body.classList.add('quiet-admin');
  const path=location.pathname.split('/').pop()||'overview.html';
  const current=path==='editor.html'?'index.html':path;
  const all=navigation.flatMap(group=>group.items);
  const currentTitle=path==='editor.html'?'Редактор':(all.find(item=>item[0]===path)?.[1]||'Управление');
  function section(group){
   const el=make('div','admin-nav-section','');
   const title=make('div','admin-nav-heading',e(group.label));el.append(title);
   group.items.forEach(([href,label,ic])=>{const link=make('a','admin-nav-link',App.icon(ic)+'<span>'+e(label)+'</span>');link.href=href;if(href===current){link.classList.add('active');link.setAttribute('aria-current','page')}el.append(link)});
   return el;
  }
  const nav=$('.side-nav');
  if(nav){
   nav.setAttribute('aria-label','Разделы панели управления');nav.replaceChildren(...navigation.map(section));
   const brand=$('.side-mark');if(brand){brand.innerHTML='<div class="mark">'+App.icon('claude')+'</div><span class="admin-brand-copy"><strong>Материалы</strong><small>Панель управления</small></span>';brand.href='overview.html'}
   $('.nav-label')?.remove();
   const bottom=$('.side-bottom');if(bottom)bottom.innerHTML='<a href="../index.html">'+App.icon('out')+'<span>Открыть сайт</span>'+App.icon('arrow')+'</a>';
   const shortcut=make('a','admin-create-shortcut',App.icon('plus')+'<span>Новая лекция</span>');shortcut.href='editor.html';nav.before(shortcut);
  }
  const crumb=$('.crumb');if(crumb)crumb.innerHTML='<span>Управление</span>'+App.icon('chevron')+'<b>'+e(currentTitle)+'</b>';
  const menu=$('#admin-menu nav');if(menu){menu.setAttribute('aria-label','Разделы панели управления');menu.replaceChildren(...navigation.map(section));const add=make('a','admin-menu-create',App.icon('plus')+'<span>Новая лекция</span>');add.href='editor.html';menu.prepend(add)}
  const mobile=$('.mobile-nav'),more=$('#admin-more');if(mobile&&more){
   mobile.replaceChildren();
   for(const [href,title,ic] of [['overview.html','Обзор','grid'],['index.html','Материалы','book'],['editor.html','Добавить','plus'],['visitors.html','Посетители','users']]){
    const a=make('a','',App.icon(ic)+'<span>'+title+'</span>');a.href=href;
    if(path===href){a.classList.add('active');a.setAttribute('aria-current','page')}mobile.append(a);
   }
   if(!['overview.html','index.html','editor.html','visitors.html'].includes(path)){more.classList.add('current');more.setAttribute('aria-current','page')}else{more.classList.remove('current');more.removeAttribute('aria-current')}
   mobile.append(more);
  }
  document.addEventListener('click',ev=>document.querySelectorAll('.quiet-more[open], .more-menu[open]').forEach(d=>{if(!d.contains(ev.target))d.open=false}));
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')document.querySelectorAll('.quiet-more[open], .more-menu[open]').forEach(d=>{if(d.contains(document.activeElement))d.querySelector('summary')?.focus();d.open=false})});
 }
 function overview(){}
 function materials(){const head=$('#main .page-head');if(head)head.querySelector('h1').textContent=document.body.dataset.page==='trash'?'Корзина':'Материалы';}
 function editor(){document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key==='s'){ev.preventDefault();document.querySelector('#btn-save-draft')?.click();}});}
 function structure(){}
 function settings(){const form=$('#about-form'),control=$('#site-control');if(!form||!control)return;const bar=make('div','quiet-tabs','');[['Общий доступ',control],['Описание сайта',form]].forEach(([label,target],i)=>{const b=make('button','',label);b.type='button';b.onclick=()=>{form.hidden=target!==form;control.hidden=target!==control;bar.querySelectorAll('button').forEach((x,n)=>x.setAttribute('aria-pressed',String(n===i)))};bar.append(b)});control.before(bar);(location.hash==='#description'?bar.lastElementChild:bar.firstElementChild).click();$('.page-head h1').textContent='Настройки сайта';$('.page-head p').textContent='Общий доступ, разрешённые IP, специальный вход и описание сайта.';}
 function enhance(){const main=$('#main');if(!main?.firstElementChild||main.firstElementChild.dataset.quiet)return;main.firstElementChild.dataset.quiet='true';const page=document.body.dataset.page;main.querySelectorAll('.page-head .eyebrow,.page-head .kit-kicker').forEach(x=>x.remove());if(page==='overview')overview();if(['lectures','trash'].includes(page))materials();if(page==='editor')editor();if(page==='structure')structure();if(page==='about')settings();if(page==='visitors'){$('.page-head h1').textContent='Посетители'}if(page==='stats')fold([$('#clear-stats')],'Очистка истории','quiet-danger')}
 return {shell,enhance};
})();
