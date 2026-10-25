'use strict';
(()=>{
 if(window.localRoutePending)return;
 const sessionKey='lecture-admin-session';

 const button=document.createElement('button');
 button.type='button';
 button.className='owner-entry';
 button.innerHTML='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>Вход</span>';
 button.setAttribute('aria-label','Вход администратора');
 button.setAttribute('aria-haspopup','dialog');
 button.setAttribute('aria-controls','owner-login');

 const modal=document.createElement('dialog');
 modal.id='owner-login';
 modal.className='owner-login';
 modal.setAttribute('aria-labelledby','owner-title');
 modal.innerHTML=`
  <div class="owner-modal-card">
    <div class="owner-card-header">
      <div class="owner-brand">
        <div class="owner-emblem" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        </div>
        <div>
          <h2 id="owner-title">Вход для владельца</h2>
          <p class="owner-kicker">Панель управления</p>
        </div>
      </div>
      <button type="button" class="owner-close" aria-label="Закрыть окно входа">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <p class="owner-description">Введите данные администратора, чтобы открыть редактор и настройки библиотеки.</p>
    <form id="owner-form">
      <label for="owner-email" class="owner-field">
        <span>Почта</span>
        <input id="owner-email" name="email" type="email" autocomplete="username" placeholder="admin@example.com" required maxlength="254" autocapitalize="none" spellcheck="false">
      </label>
      <label for="owner-password" class="owner-field">
        <span>Пароль</span>
        <div class="owner-password-wrap">
          <input id="owner-password" name="password" type="password" autocomplete="current-password" placeholder="Введите пароль" required maxlength="256">
          <button type="button" class="owner-reveal" aria-label="Показать пароль" aria-pressed="false">Показать</button>
        </div>
      </label>
      <p class="owner-message" role="status" aria-live="polite"></p>
      <button type="submit" class="owner-submit">
        <span>Войти в кабинет</span>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
      </button>
    </form>
    <p class="owner-note">Доступ только для владельца материалов</p>
  </div>
 `;

 document.body.append(modal);
 let controller=null,busy=false,closing=false,closeTimer;
 const form=modal.querySelector('form'),password=form.elements.password,message=modal.querySelector('.owner-message'),submit=modal.querySelector('[type=submit]'),reveal=modal.querySelector('.owner-reveal');

 function mount(){
  const topbar=document.querySelector('#app:not([hidden]) .top-right');
  if(topbar){
   if(button.parentElement!==topbar)topbar.prepend(button);
   button.classList.remove('owner-floating');
   button.style.display='';
   return;
  }
  const side=document.querySelector('#app:not([hidden]) .side-bottom');
  if(side){
   if(button.parentElement!==side)side.prepend(button);
   button.classList.remove('owner-floating');
   button.style.display='';
   return;
  }
  const loading=document.querySelector('.loading');
  if(!loading){
   if(button.parentElement!==document.body)document.body.append(button);
   button.classList.add('owner-floating');
   button.style.display='';
  }else{
   button.style.display='none';
  }
 }

 mount();
 window.addEventListener('resize',mount);
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});

 function resetPassword(){
  password.value='';
  password.type='password';
  reveal.textContent='Показать';
  reveal.setAttribute('aria-pressed','false');
  reveal.setAttribute('aria-label','Показать пароль');
 }

 function stop(){
  controller?.abort();
  controller=null;
  busy=false;
  submit.disabled=false;
  submit.querySelector('span').textContent='Войти в кабинет';
  form.removeAttribute('aria-busy');
 }

 function lockScroll(){
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
 }
 function unlockScroll(){
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
 }

 function close(){
  if(!modal.open||closing)return;
  closing=true;
  stop();
  resetPassword();
  unlockScroll();
  modal.classList.add('is-closing');
  closeTimer=setTimeout(()=>{
   modal.close();
   modal.classList.remove('is-closing');
   closing=false;
   button.focus({preventScroll:true});
  },matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);
 }

 button.onclick=()=>{
  clearTimeout(closeTimer);
  closing=false;
  modal.classList.remove('is-closing');
  message.textContent='';
  resetPassword();
  lockScroll();
  modal.showModal();
  form.elements.email.focus({preventScroll:true});
 };

 modal.querySelector('.owner-close').onclick=close;
 modal.addEventListener('cancel',e=>{e.preventDefault();close()});
 modal.addEventListener('close',()=>{unlockScroll();stop();resetPassword()});
 modal.addEventListener('click',e=>{
  if(e.target===modal){
   const r=modal.querySelector('.owner-modal-card').getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();
  }
 });

 reveal.onclick=()=>{
  const show=password.type==='password';
  password.type=show?'text':'password';
  reveal.textContent=show?'Скрыть':'Показать';
  reveal.setAttribute('aria-pressed',String(show));
  reveal.setAttribute('aria-label',show?'Скрыть пароль':'Показать пароль');
  password.focus();
 };

 async function request(path,options,signal){
  const response=await fetch(CONFIG.url+path,{
   ...options,
   signal,
   headers:{apikey:CONFIG.key,'Content-Type':'application/json',...options.headers}
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
   const error=new Error(
    response.status===429?'Слишком много попыток. Подождите немного и попробуйте снова.':
    response.status>=500?'Сервис входа временно недоступен. Попробуйте позже.':
    'Не удалось войти. Проверьте почту и пароль.'
   );
   throw error;
  }
  return data;
 }

 async function revoke(token){
  if(!token)return;
  try{
   await fetch(CONFIG.url+'/auth/v1/logout?scope=local',{
    method:'POST',
    headers:{apikey:CONFIG.key,Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(5000)
   });
  }catch{}
 }

 form.onsubmit=async ev=>{
  ev.preventDefault();
  if(busy)return;
  busy=true;
  controller=new AbortController();
  const activeController=controller,signal=activeController.signal;
  const timeout=setTimeout(()=>activeController.abort(),20000);
  let session=null,stored=false;
  submit.disabled=true;
  submit.querySelector('span').textContent='Проверяем доступ…';
  form.setAttribute('aria-busy','true');
  message.textContent='';

  try{
   session=await request('/auth/v1/token?grant_type=password',{
    method:'POST',
    body:JSON.stringify({email:form.elements.email.value.trim(),password:password.value})
   },signal);

   if(!session?.access_token||!session?.user?.id)throw new Error('Сервис не подтвердил вход. Попробуйте ещё раз.');

   const profiles=await request('/rest/v1/profiles?select=id,is_admin,blocked&id=eq.'+encodeURIComponent(session.user.id),{
    headers:{Authorization:'Bearer '+session.access_token}
   },signal);

   if(!Array.isArray(profiles)||!profiles.some(p=>p.id===session.user.id&&p.is_admin===true&&p.blocked===false)){
    throw new Error('У этого аккаунта нет прав доступа к управлению.');
   }

   if(signal.aborted)return;
   const value=JSON.stringify({...session,expires_at:session.expires_at||Math.floor(Date.now()/1000)+(session.expires_in||3600)});

   try{
    localStorage.setItem(sessionKey,value);
    if(localStorage.getItem(sessionKey)!==value)throw new Error();
   }catch{
    throw new Error('Разрешите хранение данных в браузере и попробуйте снова.');
   }

   stored=true;
   resetPassword();
   submit.querySelector('span').textContent='Вход выполнен…';
   location.assign(new URL('admin/overview.html',location.href).href);
  }catch(error){
   if(controller===activeController&&modal.open&&!closing){
    message.textContent=signal.aborted?'Проверка заняла слишком много времени. Попробуйте снова.':
     error instanceof TypeError?'Не удалось подключиться. Проверьте интернет.':
     error.message;
   }
   if(controller===activeController)resetPassword();
  }finally{
   clearTimeout(timeout);
   if(session&&!stored)void revoke(session.access_token);
   if(!stored&&controller===activeController)stop();
  }
 };
})();
