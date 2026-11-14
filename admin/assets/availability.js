'use strict';
window.SiteControl=(()=>{
 const copy=AccessPresentation,esc=App.esc;
 let section=null,state=null,busy=false,dirty=false,stale=false,timer=null,reading=false;
 const title=s=>s.paused?copy.closedTitle:copy.openTitle;
 const error=e=>/status_conflict/.test(e.message)?'Статус изменён в другой вкладке. Обновите его перед сохранением. Ваш текст останется в поле.':App.errorText(e);
 function valid(s){if(typeof s?.paused!=='boolean'||s.revision==null)throw new Error('Не удалось получить статус сайта.');return s}
 function updateSummary(s){
  for(const el of document.querySelectorAll('[data-access-status]')){el.textContent=title(s);el.dataset.closed=String(s.paused);el.title=title(s)}
  for(const text of document.querySelectorAll('[data-access-summary]'))text.textContent=s.paused?'Материалы доступны только через специальный вход.':'Посетители могут читать материалы без логина и пароля.';
 }
 function feedback(text){const el=section?.querySelector('#pause-admin-feedback');if(el)el.textContent=text}
 function updatePreview(){
  const input=section.querySelector('textarea'),text=copy.customMessage(input.value);
  section.querySelector('#access-preview-message').textContent=text;
  section.querySelector('#access-preview-message').hidden=!text;
  section.querySelector('#access-message-count').textContent=input.value.length+' / 600';
  section.querySelector('#access-save-state').textContent=dirty?'Есть несохранённые изменения':'Сообщение сохранено';
  section.querySelector('#pause-admin-save').disabled=!dirty||busy||stale;
 }
 function draw(){
  section.innerHTML=`<div class="access-heading"><div><span class="eyebrow">Доступ к материалам</span><h2>${esc(title(state))}</h2><p>${state.paused?'Обычные посетители видят экран отключения. Специальный вход продолжает работать.':'Материалы открыты для посетителей. Логин и пароль не требуются.'}</p></div><span class="access-state" data-access-status data-closed="${state.paused}">${state.paused?'Общий доступ отключён':'Общий доступ открыт'}</span></div>
  <div class="access-facts"><div><span>${state.paused?'Отключён с':'Последнее отключение'}</span><strong>${esc(copy.date(state.paused_at)||'Дата не записана')}</strong></div><div><span>Специальный вход</span><strong>По выданным логину и паролю</strong></div><div><span>Админ-панель</span><strong>Доступна владельцу</strong></div></div>
  <div class="access-mode-action"><div><h3>${state.paused?'Открыть материалы для всех':'Управление общим доступом'}</h3><p>${state.paused?'После включения посетителям не понадобится аккаунт.':'Отключение закроет общий доступ. Лекции и выданные специальные доступы сохранятся.'}</p></div><button type="button" class="btn ${state.paused?'primary':'ghost'}" id="pause-admin-toggle">${state.paused?'Включить общий доступ':'Отключить общий доступ'}</button></div>
  <div class="access-editor-grid"><div class="access-message-editor"><h3>Сообщение на экране отключения</h3><p class="muted small">Дополнительный текст под основным описанием. Пустое поле оставит только стандартный экран.</p><label class="form-field"><span>Ваше сообщение</span><textarea id="pause-admin-message" rows="5" maxlength="600" aria-describedby="access-message-count" placeholder="Например, как связаться для получения доступа">${esc(copy.customMessage(state.message))}</textarea></label><div class="access-message-meta"><span id="access-save-state" role="status"></span><span id="access-message-count"></span></div><div class="row pause-admin-actions"><button type="button" class="btn primary" id="pause-admin-save">Сохранить сообщение</button><button type="button" class="btn ghost" id="pause-admin-refresh">Обновить статус</button></div><p id="pause-admin-feedback" role="status" aria-live="polite"></p></div>
  <aside class="access-preview" aria-label="Предпросмотр экрана отключения"><div class="eyebrow">Что увидят посетители</div><span class="access-preview-label">${esc(copy.closedTitle)}</span><h3>${esc(copy.heading)}</h3><p>${esc(copy.lead)}</p><p>${esc(copy.copy)}</p><p id="access-preview-message"></p><div class="access-preview-links"><span>Написать в Telegram</span><span>Специальный доступ</span></div><p class="access-preview-date">${copy.date(state.paused_at)?'Последнее отключение: '+esc(copy.date(state.paused_at)):'Время отключения фиксируется при смене режима.'}</p></aside></div>
  <div class="access-special-link"><div><h3>Специальные аккаунты</h3><p>Для чтения при отключённом общем доступе. Доступ к админ-панели они не дают.</p></div><button class="btn" type="button" id="access-accounts">Управлять доступами ${App.icon('arrow')}</button></div>`;
  section.querySelector('textarea').oninput=()=>{dirty=section.querySelector('textarea').value.trim()!==copy.customMessage(state.message);updatePreview()};
  section.querySelector('#pause-admin-refresh').onclick=()=>load(true);
  section.querySelector('#pause-admin-save').onclick=()=>save(state.paused,true);
  section.querySelector('#pause-admin-toggle').onclick=confirmToggle;
  section.querySelector('#access-accounts').onclick=()=>ReaderAccounts.show();
  updatePreview();
 }
 async function load(manual=false){
  if(reading||busy)return;reading=true;
  try{
   const next=valid(await DB.rpc('site_status'));updateSummary(next);
   const draft=section?.querySelector('textarea')?.value,keepDraft=dirty;
   if(!section?.isConnected)return;
   if(!manual&&dirty&&state&&next.revision!==state.revision){stale=true;feedback('Настройки изменены в другой вкладке. Нажмите «Обновить статус»: ваш текст сохранится в поле.');section.querySelector('#pause-admin-toggle').disabled=true;updatePreview();return}
   if(manual||!state||next.revision!==state.revision){state=next;stale=false;draw();if(keepDraft&&draft!==undefined){section.querySelector('textarea').value=draft;dirty=draft.trim()!==copy.customMessage(state.message);updatePreview()}}
   if(manual)feedback(keepDraft?'Статус обновлён. Несохранённый текст сохранён в поле.':'Статус актуален.');
  }catch(e){if(section?.isConnected){if(!state){section.innerHTML='<h2>Общий доступ</h2><p role="alert">'+esc(error(e))+'</p><button class="btn" type="button">Повторить</button>';section.querySelector('button').onclick=()=>load(true)}else feedback('Не удалось обновить статус. '+error(e))}for(const el of document.querySelectorAll('[data-access-status]')){el.textContent='Статус не проверен';delete el.dataset.closed}}
  finally{reading=false}
 }
 function confirmToggle(){
  if(busy||stale)return;
  const paused=!state.paused,d=document.createElement('dialog'),opener=document.activeElement;
  d.className='confirm-dialog access-confirm';d.setAttribute('aria-labelledby','access-confirm-title');
  d.innerHTML=`<h2 id="access-confirm-title">${paused?'Отключить общий доступ?':'Открыть материалы для всех?'}</h2><p>${paused?'Посетители увидят экран отключения. Войти смогут пользователи со специальным доступом. Лекции сохранятся, админ-панель продолжит работать.':'Все посетители смогут читать материалы без логина и пароля. Специальные аккаунты сохранятся на случай следующего отключения.'}</p>${dirty?'<p class="access-confirm-note">Несохранённое сообщение останется в редакторе. Смена режима не публикует его.</p>':''}<div class="row"><button type="button" class="btn" data-cancel>Отмена</button><button type="button" class="btn primary" data-confirm>${paused?'Отключить доступ':'Открыть доступ'}</button></div>`;
  document.body.append(d);d.onclose=()=>{d.remove();opener?.focus()};d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('[data-confirm]').onclick=()=>{d.close();save(paused,false)};d.showModal();d.querySelector('[data-cancel]').focus();
 }
 async function save(paused,saveMessage){
  if(busy||stale)return;busy=true;
  const draft=section.querySelector('textarea').value,keepDraft=dirty&&!saveMessage;
  const message=saveMessage?(draft.trim()||copy.defaultMessage):state.message;
  section.querySelectorAll('button,textarea').forEach(el=>el.disabled=true);feedback('Сохраняем…');
  try{
   state=valid(await DB.rpc('admin_set_site_status',{p_paused:paused,p_message:message,p_revision:state.revision}));
   dirty=false;stale=false;draw();updateSummary(state);
   if(keepDraft){section.querySelector('textarea').value=draft;dirty=draft.trim()!==copy.customMessage(state.message)}
   feedback(saveMessage?'Сообщение сохранено.':title(state)+'.');App.toast(saveMessage?'Сообщение сохранено':title(state));
  }catch(e){if(/status_conflict/.test(e.message))stale=true;feedback(error(e))}
  finally{busy=false;section.querySelectorAll('button,textarea').forEach(el=>el.disabled=false);section.querySelector('#pause-admin-toggle').disabled=stale;updatePreview()}
 }
 async function mount(){
  section=document.createElement('section');section.className='panel site-control';section.id='site-control';section.innerHTML='<p role="status">Проверяем общий доступ…</p>';
  document.getElementById('about-form').before(section);state=null;dirty=false;stale=false;await load(true);
 }
 function summary(){
  if(!document.querySelector('.admin-access-link')){const a=document.createElement('a');a.href='about.html#access';a.className='admin-access-link';a.dataset.accessStatus='';a.textContent='Проверяем доступ…';document.querySelector('.topbar .top-right')?.prepend(a)}
  if(document.body.dataset.page==='overview'&&!document.querySelector('.access-overview')){const card=document.createElement('section');card.className='access-overview';card.innerHTML='<div><span class="eyebrow">Доступ к сайту</span><h2 data-access-status>Проверяем статус…</h2><p data-access-summary>Получаем текущие настройки.</p></div><a class="btn" href="about.html#access">Управлять доступом '+App.icon('arrow')+'</a>';document.querySelector('#main .page-head')?.after(card)}
  load();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&!document.body.classList.contains('admin-logged-out'))load()},15000);
 }
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 window.addEventListener('session-lost',()=>{clearInterval(timer);dirty=false});
 return {mount,summary};
})();
