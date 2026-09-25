'use strict';
window.VisitorAccess=(()=>{
 const {$,esc,icon}=App;let state=null,timer=null,running=false,finished=false,resolveAccess,submitting=false,revision=0;
 const namePattern=/^[\p{L}\p{M}]+(?:[ ’'\-][\p{L}\p{M}]+)*$/u;
 function error(e){return /visitor_access_status|submit_access_request|schema cache|PGRST/.test(e.message)?'Владельцу нужно установить обновление 08 из ACCESS_UPDATE.html.':App.errorText(e)}
 function draw(){
  const host=$('#main');if(!host)return;
  const pending=state.state==='pending',rejected=state.state==='rejected',blocked=state.state==='blocked';
  document.body.classList.add('awaiting-access');
  host.innerHTML=`<section class="access-card" aria-labelledby="access-title"><div class="access-emblem">${icon(blocked?'lock':pending?'clock':'users')}</div><div class="eyebrow">Доступ к материалам</div><h1 id="access-title">${blocked?'Доступ ограничен':pending?'Заявка отправлена':rejected?'Заявка отклонена':'Давай познакомимся :)'}</h1><p class="access-lead">${blocked?'Напиши мне, чтобы разобраться с доступом.':pending?'Я посмотрю твою заявку и открою доступ к материалам. Немного подожди :)':rejected?'Можешь поправить данные и отправить мне заявку ещё раз.':'Введите ваши полные имя и фамилию. Доступ к курсу предоставляется после одобрения заявки'}</p>${pending?`<div class="access-person">${esc(state.last_name)} ${esc(state.first_name)}</div><p class="access-caption">Повторно отправлять заявку не нужно. Решение появится здесь автоматически.</p>`:''}${rejected?`<div class="access-reason"><span>Причина отказа</span><p>${esc(state.reason||'Я не оставил комментарий. Можешь отправить заявку ещё раз.')}</p></div>`:''}${!pending&&!blocked?`<form id="access-form"><label>Фамилия<input id="access-last" name="family-name" autocomplete="family-name" required maxlength="80" placeholder="Твоя фамилия полностью" value="${esc(state.last_name||'')}"></label><label>Имя<input id="access-first" name="given-name" autocomplete="given-name" required maxlength="80" placeholder="Твоё полное имя" value="${esc(state.first_name||'')}"></label><p class="access-caption">Мне будут видны твоё имя, посещения и примерные сведения об устройстве — так проще не путать гостей сайта.</p><button class="btn primary" id="access-submit" type="submit">${rejected?'Подать заявку повторно':'Отправить заявку'} ${icon('arrow')}</button></form>`:''}<p id="access-message" role="status" aria-live="polite"></p><button class="btn ghost" id="access-check" type="button">Проверить статус</button></section>`;
  $('#access-check').onclick=()=>check(true);
  $('#access-form')?.addEventListener('submit',async e=>{
   e.preventDefault();const first=$('#access-first').value.trim().replace(/\s+/g,' '),last=$('#access-last').value.trim().replace(/\s+/g,' '),b=$('#access-submit');
   if(!namePattern.test(first)||!namePattern.test(last)){ $('#access-message').textContent='Введите имя и фамилию полностью, без цифр, точек и инициалов.';return}
   b.disabled=true;submitting=true;revision++;$('#access-message').textContent='Отправляем…';
   try{state=await DB.rpc('submit_access_request',{p_first_name:first,p_last_name:last});if(state.state==='approved')finish();else draw()}
   catch(e){if($('#access-message'))$('#access-message').textContent=error(e);b.disabled=false}finally{submitting=false}
  });
 }
 function finish(){if(finished)return;finished=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);document.body.classList.remove('awaiting-access');resolveAccess?.(state)}
 async function check(manual=false){
  if(running||finished||submitting)return;running=true;const version=revision;const b=$('#access-check');if(b)b.disabled=true;
  try{const next=await DB.rpc('visitor_access_status');if(version!==revision||finished)return;if(next.state==='approved'){state=next;finish();return}const changed=JSON.stringify(next)!==JSON.stringify(state);state=next;if(changed)draw();else if(manual&&$('#access-message'))$('#access-message').textContent='Статус пока не изменился.'}
  catch(e){if(version===revision&&!finished&&$('#access-message'))$('#access-message').textContent=error(e)}
  finally{running=false;const b=$('#access-check');if(b)b.disabled=false}
 }
 function visible(){if(!document.hidden)check()}
 async function ensure(){
  state=await DB.rpc('visitor_access_status');if(state.state==='approved')return state;
  return new Promise(resolve=>{resolveAccess=resolve;draw();timer=setInterval(()=>{if(!document.hidden)check()},15000);document.addEventListener('visibilitychange',visible)})
 }
 return {ensure,error};
})();
