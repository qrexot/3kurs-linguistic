'use strict';
(()=>{
 function group(nav){
  if(!nav||nav.querySelector(':scope > .admin-nav-group'))return;
  const links=[...nav.querySelectorAll(':scope > a')];if(!links.length)return;
  const specs=[['Работа','index.html|editor.html|structure.html|schedule.html|trash.html|help.html'],['Люди и статистика','visitors.html|stats.html'],['Настройки','about.html']];
  for(const div of nav.querySelectorAll(':scope > .quiet-nav-divider'))div.remove();
  for(const [title,paths] of specs){const set=new Set(paths.split('|')),items=links.filter(a=>set.has((a.getAttribute('href')||'').split('?')[0]));if(!items.length)continue;const details=document.createElement('details');details.className='admin-nav-group';details.open=items.some(x=>x.classList.contains('active'));const summary=document.createElement('summary');summary.textContent=title;details.append(summary);for(const link of items)details.append(link);nav.append(details)}
 }
 for(const nav of [document.querySelector('.sidebar .side-nav'),document.querySelector('#admin-menu nav')]){if(!nav)continue;group(nav);new MutationObserver(()=>group(nav)).observe(nav,{childList:true})}
})();
