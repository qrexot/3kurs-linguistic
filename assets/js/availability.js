'use strict';
window.SiteAvailability=(()=>{
 let paused=false,checking=false,timer=null,bootResolve=null,booted=false,lastMessage='';
 const host=()=>document.getElementById('site-pause');
 function screen(message,isError=false){
  document.body.classList.add('site-paused');const app=document.getElementById('app');if(app){app.inert=true;app.hidden=true}
  let panel=host();if(!panel){panel=document.createElement('main');panel.id='site-pause';panel.tabIndex=-1;panel.innerHTML=`<section class="pause-card" aria-labelledby="pause-heading"><div class="pause-status"><span></span>Небольшая пауза</div><div class="pause-art" aria-hidden="true"><div class="pause-orbit"></div><div class="pause-core"><i></i><i></i></div><span class="pause-satellite"></span></div><h1 id="pause-heading">Скоро вернёмся<span>:</span>)</h1><p id="pause-message"></p><button class="btn" id="pause-check">Проверить доступ</button><p id="pause-feedback" role="status" aria-live="polite"></p><div class="pause-note">Страница откроется автоматически,<br>когда сайт снова заработает.</div></section><footer>made by <strong>Leonard</strong></footer>`;document.body.append(panel);document.getElementById('pause-check').onclick=()=>check(true);panel.focus({preventScroll:true})}
  panel.classList.toggle('pause-error',isError);document.getElementById('pause-heading').textContent=isError?'Не удалось проверить доступ':'Скоро вернёмся :)';document.getElementById('pause-message').textContent=message;
 }
 async function check(manual=false){
  if(checking)return;checking=true;const button=document.getElementById('pause-check');if(button)button.disabled=true;
  try{const s=await DB.request('/rest/v1/rpc/site_status',{method:'POST',body:'{}',headers:{Authorization:'Bearer '+CONFIG.key}},false);
   if(!s||typeof s.paused!=='boolean')throw new Error('Некорректный ответ сервера');
   if(s.paused){if(!paused){paused=true;window.dispatchEvent(new Event('site-paused'))}if(!host()||s.message!==lastMessage||host().classList.contains('pause-error'))screen(s.message);lastMessage=s.message;if(manual)document.getElementById('pause-feedback').textContent='Сайт пока на паузе. Можно оставить эту страницу открытой.'}
   else if(paused||host()){location.reload();return}else if(!booted){booted=true;bootResolve?.()}
  }catch(e){if(!booted&&!paused)screen(/site_status|schema cache/.test(e.message)?'Владельцу нужно установить SQL 10 из SITE_PAUSE_UPDATE.html.':'Проверьте подключение к интернету и попробуйте ещё раз.',true);else if(host())document.getElementById('pause-feedback').textContent='Не удалось проверить статус. Повторим автоматически.'}
  finally{checking=false;const b=document.getElementById('pause-check');if(b)b.disabled=false}
 }
 function start(){return new Promise(resolve=>{bootResolve=resolve;check();timer=setInterval(()=>{if(!document.hidden)check()},10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});window.addEventListener('online',()=>check())})}
 return {start,get paused(){return paused}};
})();
