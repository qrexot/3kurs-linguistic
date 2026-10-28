'use strict';
(()=>{
 let dialog;
 function open(){
  if(dialog?.open)return;
  dialog=document.createElement('dialog');
  dialog.className='visitor-dialog announcement-dialog';
  dialog.innerHTML=`<header><h2>Уведомление посетителям</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button></header><div class="visitor-dialog-body"><p class="muted">Объявление появится в колокольчике у существующих посетителей, у которых есть доступ к сайту.</p><form><label class="visitor-field">Заголовок<input name="title" maxlength="80" required placeholder="Например, новости сайта"></label><label class="visitor-field">Сообщение<textarea name="body" maxlength="300" rows="4" required placeholder="Напишите короткое сообщение"></textarea></label><p class="muted" data-count>0 / 300</p><button type="submit" class="btn primary">Отправить уведомление</button><p role="status" aria-live="polite" data-status></p></form></div>`;
  document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();dialog=null},{once:true});
  const form=dialog.querySelector('form'),body=form.elements.body,status=form.querySelector('[data-status]');
  body.addEventListener('input',()=>{form.querySelector('[data-count]').textContent=body.value.length+' / 300'});
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   const title=form.elements.title.value.trim(),message=body.value.trim(),button=form.querySelector('[type=submit]');
   if(!title||!message){status.textContent='Заполните заголовок и сообщение.';return}
   button.disabled=true;status.textContent='Отправляем…';
   try {const sent=await DB.rpc('admin_send_announcement',{p_title:title,p_body:message});form.reset();form.querySelector('[data-count]').textContent='0 / 300';status.textContent='Отправлено посетителям: '+Number(sent); }
   catch(error){status.textContent=App.errorText(error)}
   finally{button.disabled=false}
  });
  dialog.showModal();
 }
 const main=document.querySelector('#main');
 function mount(){
  const head=main?.querySelector('.page-head');
  if(!head||head.querySelector('#announcement-open'))return;
  const b=document.createElement('button');b.id='announcement-open';b.type='button';b.className='btn';b.textContent='Отправить уведомление';b.onclick=open;head.append(b);
 }
 if(main){new MutationObserver(mount).observe(main,{childList:true,subtree:true});mount()}
})();
