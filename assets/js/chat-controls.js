'use strict';
window.ChatControls = (() => {
  const {esc,icon} = App;
  const names = ['Пальма','Пальма на розовом','Полумесяц','Тёмный кактус','Кактус в горшке','Ракушка','Волна','Солнце','Искра'];
  const roles = {owner:'Владелец',admin:'Администратор',member:'Участник'};
  const durations = '<option value="15">15 минут</option><option value="60">1 час</option><option value="1440">1 день</option><option value="10080">7 дней</option>';
  function create({root,me,avatar,avatars,onGroup,onChange,onAvatar,explain}) {
    function panel(title) {
      root.querySelector('.chat-sheet')?.remove();
      const d = document.createElement('dialog');
      d.className = 'chat-sheet';
      d.setAttribute('aria-labelledby','chat-sheet-title');
      d.innerHTML = `<header><h2 id="chat-sheet-title">${esc(title)}</h2><button class="sheet-close" type="button" aria-label="Закрыть">${icon('close')}</button></header><div class="sheet-body"></div><p class="sheet-status" role="alert"></p>`;
      root.append(d);
      d.querySelector('.sheet-close').onclick = () => d.close();
      d.addEventListener('close', () => d.remove(),{once:true});
      d.showModal();
      return d;
    }
    async function submit(d, fn) {
      if (d.dataset.busy) return;
      d.dataset.busy='true';
      const body=d.querySelector('.sheet-body'), status=d.querySelector('.sheet-status');
      body.inert=true; status.textContent='';
      try { await fn(); }
      catch(e) { status.textContent=explain(e); }
      finally { body.inert=false; delete d.dataset.busy; }
    }
    function pickAvatar() {
      const d=panel('Аватар профиля'), body=d.querySelector('.sheet-body');
      body.innerHTML=`<form class="sheet-form"><fieldset class="avatar-grid"><legend class="sr-only">Выберите изображение</legend>${names.map((name,i)=>`<label title="${name}"><input required type="radio" name="avatar" value="${i+1}" ${avatars.get(me)===i+1?'checked':''}><img alt="${name}" src="assets/avatars/${i+1}.webp" width="72" height="72"></label>`).join('')}</fieldset><button class="chat-primary">Сохранить аватар</button></form>`;
      body.querySelector('form').onsubmit=e=>{
        e.preventDefault();
        const id=Number(e.currentTarget.elements.avatar.value);
        submit(d,async()=>{await DB.rpc('chat_set_avatar',{p_avatar:id});onAvatar(id);d.close();});
      };
    }
    function newGroup() {
      const d=panel('Новая группа'), body=d.querySelector('.sheet-body');
      body.innerHTML='<form class="sheet-form"><label>Название группы<input name="title" maxlength="64" required placeholder="Например, Практика речи"></label><p>После создания добавьте участников по юзернейму.</p><button class="chat-primary">Создать группу</button></form>';
      body.querySelector('form').onsubmit=e=>{
        e.preventDefault();const title=e.currentTarget.elements.title.value.trim();
        if (!title) return;
        submit(d,async()=>{const key=await DB.rpc('chat_group_create',{p_title:title});d.close();onGroup({key,title,role:'owner'});});
      };
    }
    function people(group) {
      const d=panel(group.title), body=d.querySelector('.sheet-body');
      const change=(action,target=null,minutes=null)=>DB.rpc('chat_group_change',{p_peer:group.key,p_action:action,p_target:target,p_minutes:minutes});
      async function load() {
        const rows=await DB.rpc('chat_group_people',{p_peer:group.key});
        if (!d.isConnected) return;
        const role=rows.find(r=>r.handle===me)?.role;
        const manager=role==='owner'||role==='admin';
        const memberRows=rows.map(person=>{
          const {handle,banned,muted_until:until}=person;
          avatars.set(handle,person.avatar);
          const muted=until&&new Date(until)>new Date();
          const canChange=manager&&handle!==me&&person.role!=='owner'&&(role==='owner'||person.role!=='admin');
          const actions=banned?[['unban','Снять бан']]:[
            ...(role==='owner'?[[person.role==='admin'?'demote':'promote',person.role==='admin'?'Снять права администратора':'Назначить администратором']]:[]),
            [muted?'unmute':'mute',muted?'Разрешить писать':'Запретить писать'],['kick','Исключить'],['ban','Забанить']
          ];
          const status=banned?'Забанен':muted?'Запрет писать до '+new Date(until).toLocaleString('ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):roles[person.role];
          return `<div class="group-person">${avatar(handle)}<div><strong>@${esc(handle)}</strong><small>${esc(status)}</small></div>
          ${canChange?`<select data-person="${esc(handle)}" aria-label="Действия для @${esc(handle)}"><option value="">Действия</option>${actions.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>`:''}</div>`;
        }).join('');
        body.innerHTML=`${manager?`<form class="group-add"><label for="group-user">Добавить участника</label><div><input id="group-user" name="handle" required maxlength="21" placeholder="@юзернейм" autocapitalize="none" spellcheck="false"><button class="btn" type="submit">Добавить</button></div></form>`:''}
          <h3>Участники · ${rows.filter(r=>!r.banned).length}</h3><div class="group-roster">${memberRows}</div>
          <button type="button" class="group-danger" data-exit>${role==='owner'?'Удалить группу':'Покинуть группу'}</button>`;
        const add=body.querySelector('form');
        if(add)add.onsubmit=e=>{e.preventDefault();const who=add.elements.handle.value.trim().replace(/^@/,'');submit(d,async()=>{await change('add',who);await load();onChange(group.key);});};
        body.onchange=e=>{
          const select=e.target.closest('[data-person]');
          if(!select||!select.value)return;
          const action=select.value,who=select.dataset.person,label=select.selectedOptions[0].textContent;
          confirmAction(label+' · @'+who,action,who);
        };
        body.querySelector('[data-exit]').onclick=()=>confirmAction(role==='owner'?'Удалить группу и всю её переписку?':'Покинуть группу?',role==='owner'?'delete':'leave',null);
      }
      function confirmAction(label,action,who) {
        body.onchange=null;
        body.innerHTML=`<form class="sheet-form"><h3>${esc(label)}</h3>${action==='mute'?`<label>Срок ограничения<select name="duration">${durations}</select></label>`:''}
        <div class="sheet-actions"><button type="button" class="btn" data-cancel>Отмена</button><button class="chat-primary">Подтвердить</button></div></form>`;
        body.querySelector('[data-cancel]').onclick=()=>submit(d,load);
        body.querySelector('form').onsubmit=e=>{e.preventDefault();const minutes=Number(e.currentTarget.elements.duration?.value)||null;
          submit(d,async()=>{await change(action,who,minutes);if(action==='delete'||action==='leave'){d.close();onChange(group.key,true);}else{await load();onChange(group.key);}});
        };
      }
      body.textContent='Загружаем участников…';submit(d,load);
    }
    return {pickAvatar,newGroup,people};
  }
  return {create};
})();
