 'use strict';
(()=>{
 document.addEventListener('keydown',e=>{
  const typing=e.target.closest('input,textarea,select,[contenteditable="true"]');
  if(e.key==='/'&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const input=document.querySelector('#search,#admin-search,#visitor-search');if(input){e.preventDefault();input.focus({preventScroll:false})}}
 });
 const status=document.createElement('div');status.className='connection-status';status.role='status';status.hidden=true;document.body.append(status);
 function connection(){status.hidden=navigator.onLine;status.textContent='Нет подключения к интернету. Новые данные появятся после восстановления связи.'}
 window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
 if(document.body.dataset.admin==='true'){
  document.querySelectorAll('.side-nav a.active,.mobile-nav a.active').forEach(a=>a.setAttribute('aria-current','page'));
  const main=document.querySelector('#main');if(main)main.tabIndex=-1;
  const skip=document.createElement('a');skip.href='#main';skip.className='skip-link';skip.textContent='К содержимому';document.body.prepend(skip);
 }
})();

(()=>{const button=document.getElementById('admin-more'),menu=document.getElementById('admin-menu');if(!button||!menu)return;
button.addEventListener('click',()=>{menu.showModal();button.setAttribute('aria-expanded','true')});
document.getElementById('admin-menu-close').addEventListener('click',()=>menu.close());
menu.addEventListener('close',()=>button.setAttribute('aria-expanded','false'));
menu.addEventListener('click',e=>{if(e.target!==menu)return;const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)menu.close()});
matchMedia('(min-width:761px)').addEventListener('change',e=>{if(e.matches&&menu.open)menu.close()});
})();
