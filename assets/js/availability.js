'use strict';
window.SiteAvailability=(()=>{
 let paused=false,checking=false,bootResolve,booted=false,lastMessage='',bypass=false;
 const host=()=>document.getElementById('site-pause');
 const defaultMessage='Сайт временно отключён администратором. Чуть позже всё снова заработает. Спасибо за терпение :)';
 const errors={credentials:'Неверный логин или пароль.',paused:'У этого аккаунта нет доступа во время паузы.',bound:'Этот аккаунт закреплён за другим браузером.',browser_in_use:'В этом браузере закреплён другой аккаунт. Обратитесь к владельцу.',capacity:'Достигнут лимит браузеров для этого аккаунта.',rate_limit:'Слишком много попыток. Попробуйте через 15 минут.',denied:'Доступ ограничен.',storage:'Разрешите хранение данных сайта и попробуйте снова.',session:'Сессия завершена. Обновите страницу.'};
 function screen(message,isError=false){
  document.body.classList.add('site-paused');
  const app=document.getElementById('app');if(app){app.inert=true;app.hidden=true}
  let panel=host();
  if(!panel){
   panel=document.createElement('main');panel.id='site-pause';panel.tabIndex=-1;
   panel.innerHTML=`<div class="pause-layout"><div class="pause-top"><button type="button" class="pause-admin" id="pause-admin">Вход администратора</button></div>
   <section class="pause-card" aria-labelledby="pause-heading"><div class="pause-label"><span></span><span id="pause-label-text">ОБЩИЙ ДОСТУП ОТКЛЮЧЁН</span></div>
   <div class="pause-illustration" aria-hidden="true"><span class="pause-orbit pause-orbit-one"></span><span class="pause-orbit pause-orbit-two"></span><div class="pause-face"><i class="pause-eye"></i><i class="pause-eye"></i><i class="pause-mouth"></i><i class="pause-tear"></i></div><span class="pause-star pause-star-one">•</span><span class="pause-star pause-star-two">•</span></div>
   <h1 id="pause-heading">Пока здесь <em>тихо</em> <span>:(</span></h1><p class="pause-lead" id="pause-lead">Я отключил общий доступ к сайту.</p><p class="pause-copy" id="pause-copy">Конспекты и информация о лекциях сохранились. Ты можешь написать мне в Telegram, а при наличии специального доступа — войти на сайт.</p>
   <p class="pause-custom" id="pause-message" hidden></p>
   <a class="pause-telegram" href="https://t.me/seltux" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.4 3.4 2.9 10.5c-1.3.5-1.3 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.1.8.8.8.5 0 .7-.2 1-.4l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.8c.3-1.2-.5-1.8-1.5-1.4ZM8.1 13.2l10-6.3c.5-.3.9-.1.5.2l-8.3 7.5-.3 3.3-1.9-4.7Z"/></svg><span>Написать в Telegram</span><span class="pause-telegram-name">@seltux</span></a>
   <div class="pause-options"><button type="button" id="pause-check" class="pause-text-button">Проверить ещё раз</button><span aria-hidden="true">·</span><button type="button" id="pause-special-open" class="pause-text-button">Специальный доступ</button></div><p id="pause-feedback" role="status" aria-live="polite"></p><p class="pause-note">Если общий доступ будет открыт, страница обновится автоматически.</p></section></div>`;
   document.body.append(panel);
   panel.querySelector('#pause-check').onclick=()=>check(true);
   panel.querySelector('#pause-admin').onclick=()=>document.querySelector('.owner-entry')?.click();
   panel.querySelector('#pause-special-open').onclick=specialLogin;
   panel.focus({preventScroll:true});
  }
  panel.classList.toggle('pause-error',isError);
  panel.querySelector('#pause-label-text').textContent=isError?'НЕТ СОЕДИНЕНИЯ':'ОБЩИЙ ДОСТУП ОТКЛЮЧЁН';
  panel.querySelector('#pause-heading').innerHTML=isError?'Не удалось <em>подключиться</em> <span>:(</span>':'Пока здесь <em>тихо</em> <span>:(</span>';
  panel.querySelector('#pause-lead').textContent=isError?'Не удалось проверить доступ к сайту.':'Я отключил общий доступ к сайту.';
  panel.querySelector('#pause-copy').textContent=isError?'Проверь подключение к интернету или попробуй ещё раз.':'Конспекты и информация о лекциях сохранились. Ты можешь написать мне в Telegram, а при наличии специального доступа — войти на сайт.';
  const custom=panel.querySelector('#pause-message');custom.hidden=isError||!message||message===defaultMessage;custom.textContent=custom.hidden?'':message;
  panel.querySelector('.pause-note').hidden=isError;
 }
 function unscreen(){
  host()?.remove();document.body.classList.remove('site-paused');
  const app=document.getElementById('app');if(app){app.inert=false;app.hidden=false}
 }
 async function specialLogin(){
  if(document.getElementById('pause-special-dialog'))return;
  const d=document.createElement('dialog');d.id='pause-special-dialog';d.className='pause-login-dialog';d.setAttribute('aria-labelledby','pause-login-title');
  d.innerHTML=`<form class="pause-login-form"><div class="pause-login-top"><div><span class="pause-login-kicker">ДОСТУП ВО ВРЕМЯ ПАУЗЫ</span><h2 id="pause-login-title">Специальный вход</h2></div><button type="button" class="pause-login-close" aria-label="Закрыть">✕</button></div><p>Для аккаунта, которому владелец разрешил доступ к материалам во время отключения сайта.</p><label>Логин<input name="login" required maxlength="16" autocomplete="username" autocapitalize="none" spellcheck="false"></label><label>Пароль<input name="password" type="password" required maxlength="72" autocomplete="current-password"></label><p class="pause-login-error" role="alert"></p><button class="pause-login-submit" type="submit">Войти в материалы</button></form>`;
  document.body.append(d);d.querySelector('.pause-login-close').onclick=()=>d.close();d.addEventListener('close',()=>{d.remove();document.getElementById('pause-special-open')?.focus({preventScroll:true})});
  d.querySelector('form').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]'),error=form.querySelector('.pause-login-error');
   button.disabled=true;error.textContent='Проверяем доступ…';
   try{
    await DB.usePauseIdentity();
    await DB.ensureVisitor();
    const result=await DB.rpc('reader_login',{p_login:form.elements.login.value.trim(),p_password:form.elements.password.value});
    form.elements.password.value='';
    if(!result?.ok){error.textContent=errors[result?.code]||'Не удалось войти. Попробуйте снова.';return}
    if(!await DB.rpc('reader_pause_access')){error.textContent='У этого аккаунта нет доступа во время паузы.';return}
    d.close();bypass=true;paused=false;
    if(booted){DB.carryReaderProof();location.reload();return}
    unscreen();booted=true;bootResolve?.();
   }catch(x){error.textContent='Не удалось проверить доступ. Проверьте соединение и попробуйте снова.'}
   finally{button.disabled=false}
  };
  d.showModal();d.querySelector('[name=login]').focus({preventScroll:true});
 }
 async function check(manual=false){
  if(checking)return;checking=true;const b=document.getElementById('pause-check');if(b)b.disabled=true;
  try{
   const s=await DB.request('/rest/v1/rpc/site_status',{method:'POST',body:'{}',headers:{Authorization:'Bearer '+CONFIG.key}},false);
   if(!s||typeof s.paused!=='boolean')throw new Error('status');
   if(s.paused){
    let allowed=false;if(DB.session){try{allowed=await DB.rpc('reader_pause_access')===true}catch{}}
    if(allowed){bypass=true;paused=false;if(host())unscreen();if(!booted){booted=true;bootResolve?.()}return}
    bypass=false;
    if(!paused){paused=true;if(booted)window.dispatchEvent(new Event('site-paused'))}
    if(!host()||s.message!==lastMessage||host().classList.contains('pause-error'))screen(s.message);
    lastMessage=s.message;
    if(manual)document.getElementById('pause-feedback').textContent='Общий доступ отключён.';
   }else if(paused||host()){location.reload();return}
   else if(!booted){booted=true;bootResolve?.()}
  }catch(e){
   if(!booted&&!paused)screen('',true);
   else if(host())document.getElementById('pause-feedback').textContent='Не удалось проверить статус. Попробуем снова.';
  }finally{checking=false;const button=document.getElementById('pause-check');if(button)button.disabled=false}
 }
 function start(){return new Promise(resolve=>{bootResolve=resolve;check();setInterval(()=>{if(!document.hidden)check()},10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});window.addEventListener('online',()=>check())})}
 return {start,get paused(){return paused},get bypass(){return bypass}};
})();
