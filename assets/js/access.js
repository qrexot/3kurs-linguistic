'use strict';
window.VisitorAccess=(()=>{
 const {esc,icon}=App;
 const messages={credentials:'Неверный логин или пароль.',bound:'Этот аккаунт уже закреплён за другим браузером. Обратитесь к владельцу.',browser_in_use:'В этом браузере уже закреплён другой аккаунт. Обратитесь к владельцу.',rate_limit:'Слишком много попыток. Попробуйте через 15 минут.',denied:'Доступ ограничен владельцем.',storage:'Разрешите сохранение данных сайта и откройте страницу снова.',session:'Сессия завершена. Обновите страницу.'};
 function error(e){return /reader_access_status|reader_login|schema cache/.test(e.message)?'Вход временно недоступен. Попробуйте позже.':App.errorText(e)}
 async function status(){return DB.rpc('reader_access_status')}
 async function ensure(){
  const current=await status();if(current?.allowed){document.body.classList.remove('awaiting-access');return current}
  document.title='Материалы · Вход';document.body.classList.add('awaiting-access');
  const main=document.querySelector('#main');
  main.innerHTML=`<section class="access-card reader-login" aria-labelledby="access-title"><div class="access-emblem">${icon('lock')}</div><div class="eyebrow">Личный доступ</div><h1 id="access-title">Вход в материалы</h1><p class="access-lead">Введите логин и пароль, полученные от владельца.</p><form id="reader-login-form"><label for="reader-login">Логин<input id="reader-login" name="login" required maxlength="16" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Ваш логин"></label><label for="reader-password">Пароль<div class="reader-password-field"><input id="reader-password" name="password" type="password" required minlength="3" maxlength="72" autocomplete="current-password" placeholder="Ваш пароль"><button class="reader-reveal" type="button" aria-label="Показать пароль">Показать</button></div></label><button class="btn primary" type="submit">Войти ${icon('arrow')}</button><p id="reader-login-error" role="alert" aria-live="polite"></p></form><p class="reader-login-note">После первого входа доступ закрепится за этим браузером. Смена Wi-Fi или мобильной сети не мешает входу. Для смены браузера обратитесь к владельцу.</p></section>`;
  const form=main.querySelector('form'),password=form.elements.password;
  form.querySelector('.reader-reveal').onclick=e=>{const show=password.type==='password';password.type=show?'text':'password';e.currentTarget.textContent=show?'Скрыть':'Показать';e.currentTarget.setAttribute('aria-label',show?'Скрыть пароль':'Показать пароль')};
  return new Promise(resolve=>{let busy=false;form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=form.querySelector('[type=submit]'),message=form.querySelector('#reader-login-error');button.disabled=true;message.textContent='Проверяем…';try{const answer=await DB.rpc('reader_login',{p_login:form.elements.login.value.trim(),p_password:password.value});if(!answer?.ok){message.textContent=messages[answer?.code]||'Не удалось войти.';return}password.value='';const checked=await status();if(!checked?.allowed){message.textContent='Доступ ограничен. Обратитесь к владельцу.';return}document.body.classList.remove('awaiting-access');resolve(checked)}catch(x){message.textContent=error(x)}finally{busy=false;button.disabled=false}}});
 }
 return {ensure,status,error};
})();
