'use strict';
window.NameGate=(()=>{
 let pending=null,dialog=null,checking=false;
 async function check(){if(!DB.session)return false;return !!(await DB.rpc('my_name_requirement'))}
 function show(){if(pending)return pending;pending=new Promise(resolve=>{dialog=document.createElement('dialog');dialog.className='name-gate';dialog.setAttribute('aria-labelledby','name-gate-title');dialog.innerHTML='<form id="name-gate-form"><h2 id="name-gate-title">Укажите имя и фамилию</h2><p>Администратор попросил указать ваши данные, чтобы продолжить пользоваться сайтом.</p><label>Имя<input name="first" autocomplete="given-name" maxlength="80" required></label><label>Фамилия<input name="last" autocomplete="family-name" maxlength="80" required></label><p class="name-gate-error" role="alert"></p><button type="submit">Продолжить</button></form>';document.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{await DB.rpc('submit_required_name',{p_first_name:f.elements.first.value.trim(),p_last_name:f.elements.last.value.trim()});dialog.close();dialog.remove();dialog=null;pending=null;resolve();location.reload()}catch(x){f.querySelector('.name-gate-error').textContent=App.errorText(x);b.disabled=false}};dialog.showModal()});return pending}
 async function ensure(){await DB.ensureVisitor();if(await check())await show()}
 setInterval(async()=>{if(document.hidden||checking||!DB.session||pending)return;checking=true;try{if(await check())await show()}catch{}finally{checking=false}},15000);
 return {ensure};
})();
