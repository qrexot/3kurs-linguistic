'use strict';
window.AdminDesk=(()=>{
 const {$,esc,icon,toast}=App;
 const normalize=s=>String(s||'').toLowerCase().replace(/ё/g,'е');
 const message=e=>({content_conflict:'Материалы изменены в другой вкладке. Обновите список и повторите.',empty_lecture_text:'Нельзя опубликовать лекцию без основного текста.',restore_from_trash_first:'Сначала восстановите лекцию из корзины.',invalid_material_state:'Статус материала изменился. Обновите список.'}[e.message]||App.errorText(e));
 const saveFile=(name,data)=>{const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)};
 function dialog(title){const d=document.createElement('dialog');d.className='desk-dialog';d.innerHTML=`<header><h2>${esc(title)}</h2><button type="button" class="icon-btn" aria-label="Закрыть">${icon('close')}</button></header><div class="desk-dialog-body"></div>`;document.body.append(d);d.querySelector('header button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d}
 async function materials(ctx){
  let data=ctx.lectures,index=0,shown=[],filtered=[],working=false;const selected=new Set(),trash=ctx.trash;
  const subject=id=>ctx.subjects.find(x=>x.id===id)?.name||'Без предмета';

  $('#main').innerHTML=`<div class="page-head spread">
    <div>
      <h1>${trash?'Корзина':'Материалы'}</h1>
      <p class="muted" id="desk-meta-summary">${trash?'Удалённые материалы можно восстановить.':'Лекции, задания и материалы учебного процесса.'}</p>
    </div>
    <div class="row">
      ${!trash?`<a class="btn primary" href="editor.html">${icon('plus')} Новая лекция</a>`:''}
      <details class="more-menu">
        <summary class="btn ghost" style="min-height:40px">Экспорт ▾</summary>
        <div class="more-menu-popup">
          <button type="button" class="menu-item" id="desk-export">Выгрузить JSON</button>
          <button type="button" class="menu-item" id="desk-csv">Выгрузить CSV</button>
          <button type="button" class="menu-item" id="desk-audit">Проверить материалы</button>
        </div>
      </details>
    </div>
  </div>
  <section class="desk-filters unified-filter-bar">
    <label class="search">
      ${icon('search')}
      <input id="admin-search" type="search" placeholder="Поиск по названию, предмету, словам…" aria-label="Поиск материалов">
    </label>
    <button type="button" class="btn desk-filter-toggle" aria-controls="desk-filter-controls" aria-expanded="false">${icon("settings")} Фильтры <span id="desk-filter-total" hidden></span></button>
    <div class="desk-filter-controls" id="desk-filter-controls">
      <div class="custom-select-wrap">
        <select id="desk-subject" aria-label="Предмет">
          <option value="">Все предметы</option>
          ${ctx.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
        ${icon('chevron')}
      </div>
      <div class="custom-select-wrap">
        <select id="pub-filter" aria-label="Состояние">
          <option value="all">Все материалы</option>
          <option value="published">Опубликованы</option>
          <option value="draft">Черновики</option>
          <option value="assignment">С заданием</option>
          <option value="no-assignment">Без задания</option>
          <option value="issues">Требуют внимания</option>
        </select>
        ${icon('chevron')}
      </div>
      <div class="custom-select-wrap">
        <select id="desk-sort" aria-label="Сортировка">
          <option value="date">Сначала новые</option>
          <option value="old">Сначала старые</option>
          <option value="updated">Недавно изменённые</option>
          <option value="title">По названию</option>
        </select>
        ${icon('chevron')}
      </div>
      <button type="button" class="btn ghost icon-btn" id="desk-reset" title="Сбросить фильтры" aria-label="Сбросить фильтры">✕</button>
      <button type="button" class="btn ghost icon-btn" id="desk-refresh" title="Обновить список" aria-label="Обновить список">${icon('clock')}</button>
    </div>
    <input type="hidden" id="desk-week" value="">
    <input type="hidden" id="desk-from" value="">
    <input type="hidden" id="desk-to" value="">
    <input type="hidden" id="desk-page-size" value="50">
  </section>
  <div class="desk-selection floating-bulk-bar" id="desk-selection" hidden>
    <strong id="desk-selected-count"></strong>
    <div class="row">
      ${trash?'<button class="btn primary" data-bulk="restore">Восстановить</button>':'<button class="btn" data-bulk="publish">Опубликовать</button><button class="btn" data-bulk="unpublish">В черновики</button><button class="btn" data-bulk="subject">Сменить предмет</button><button class="btn danger" data-bulk="trash">В корзину</button>'}
      <button class="btn ghost" id="desk-unselect">Снять выбор</button>
    </div>
  </div>
  <div class="spread desk-results">
    <span id="desk-count" role="status" class="muted small"></span>
  </div>
  <div id="materials-list"></div>
  <nav class="desk-pagination" aria-label="Страницы материалов">
    <button class="btn btn-sm" id="desk-prev">← Назад</button>
    <span id="desk-page"></span>
    <button class="btn btn-sm" id="desk-next">Далее →</button>
  </nav>`;

  const filters=$('.desk-filters'),toggle=$('.desk-filter-toggle');
  toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));filters.classList.toggle('filters-expanded',open)};
  const filterIds=['admin-search','desk-subject','desk-week','pub-filter','desk-sort','desk-from','desk-to','desk-page-size'];
  const stateKey='admin-material-filters:'+(trash?'trash':'live');
  try{
    const state=JSON.parse(sessionStorage.getItem(stateKey)||'{}');
    for(const id of filterIds){
      const el=$('#'+id);
      if(el&&typeof state[id]==='string'){
        el.value=state[id];
        if(el.tagName==='SELECT'&&el.selectedIndex<0)el.selectedIndex=0;
      }
    }
    index=Math.max(0,Number(state.index)||0);
  }catch{}

  const incoming=new URLSearchParams(location.search);
  for(const [key,id] of [['status','pub-filter'],['subject','desk-subject'],['sort','desk-sort']]){
    if(incoming.has(key)){
      const el=$('#'+id);
      if(el){el.value=incoming.get(key);if(el.selectedIndex<0)el.selectedIndex=0;}
      index=0;
    }
  }

  function remember(){
    try{
      const state={index};
      for(const id of filterIds){const el=$('#'+id);if(el)state[id]=el.value;}
      sessionStorage.setItem(stateKey,JSON.stringify(state));
    }catch{}
  }

  function selection(){
    const n=selected.size;
    $('#desk-selection').hidden=!n;
    $('#desk-selected-count').textContent=`Выбрано: ${n}`;
    const all=$('#desk-all');
    if(all){
      all.checked=shown.length>0&&shown.every(l=>selected.has(l.id));
      all.indeterminate=!all.checked&&shown.some(l=>selected.has(l.id));
    }
  }

  function draw(){
    SearchUI.sync();
    const total=Number(!!$('#desk-subject').value)+Number($('#pub-filter').value!=='all')+Number($('#desk-sort').value!=='date');
    $('#desk-filter-total').hidden=!total;$('#desk-filter-total').textContent=total;
    const live=data.filter(l=>!l.deleted_at);
    const summary=$('#desk-meta-summary');
    if(summary){
      summary.textContent=trash
        ?'В корзине: '+(data.length-live.length)+' · Доступно восстановление'
        :'Всего: '+live.length+' · Опубликовано: '+live.filter(l=>l.published).length+' · Черновики: '+live.filter(l=>!l.published).length;
    }

    const duplicateIds=AdminKit.duplicates(data);
    const words=normalize($('#admin-search').value).trim().split(/\s+/).filter(Boolean);
    const status=$('#pub-filter').value;

    let rows=data.filter(l=>!!l.deleted_at===!!trash).filter(l=>{
      if($('#desk-subject').value&&l.subject_id!==$('#desk-subject').value)return false;
      if(status==='published'&&!l.published||status==='draft'&&l.published)return false;
      if(status==='assignment'&&!l.assignment_text?.trim()||status==='no-assignment'&&l.assignment_text?.trim())return false;
      if(status==='issues'&&!AdminKit.issues(l,ctx.subjects,ctx.weeks,duplicateIds).length)return false;
      const text=normalize([l.title,subject(l.subject_id),l.summary,l.lecture_text,l.full_text,l.assignment_text].join(' '));
      return words.every(w=>text.includes(w));
    });

    const sort=$('#desk-sort').value;
    rows.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ru'):sort==='old'?String(a.lecture_date).localeCompare(String(b.lecture_date)):String(sort==='updated'?b.updated_at:b.lecture_date).localeCompare(String(sort==='updated'?a.updated_at:a.lecture_date)));

    filtered=rows;
    const pageSize=50;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));
    index=Math.min(index,pages-1);
    shown=rows.slice(index*pageSize,index*pageSize+pageSize);
    remember();

    $('#desk-count').textContent=`Найдено: ${rows.length}`;
    $('#desk-page').textContent=`${index+1} / ${pages}`;
    $('#desk-prev').disabled=index===0;
    $('#desk-next').disabled=index===pages-1;

    $('#materials-list').innerHTML=shown.length?`<div class="desk-table modern-materials-table">
      <table>
        <thead>
          <tr>
            <th style="width:36px"><input id="desk-all" type="checkbox" aria-label="Выбрать все материалы"></th>
            <th>Материал</th>
            <th>Дата</th>
            <th>Содержимое</th>
            <th>Статус</th>
            <th style="width:130px">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${shown.map(l=>`<tr>
            <td><input type="checkbox" data-pick="${l.id}" ${selected.has(l.id)?'checked':''} aria-label="Выбрать: ${esc(l.title)}"></td>
            <td>
              <a class="desk-title" href="editor.html?id=${l.id}">${esc(l.title)}</a>
              <div class="desk-subtitle"><span class="subject-tag">${esc(subject(l.subject_id))}</span></div>
            </td>
            <td data-label="Дата">
              <div class="desk-date">${App.date(l.lecture_date,true)}</div>
              <small class="desk-time">${esc(l.starts_at?.slice(0,5)||"")}${l.pair_number?(l.starts_at?" · ":"")+l.pair_number+"-я пара":""}</small>
            </td>
            <td data-label="Содержимое">
              <div class="completeness-badges">
                <span class="comp-badge ${l.lecture_text?.trim()?'present':'absent'}">Лекция</span>
                <span class="comp-badge ${l.assignment_text?.trim()?'present':'absent'}">Задание</span>
                ${l.extra_text?.trim()||l.extra_images?.length?'<span class="comp-badge present">Фото</span>':''}
              </div>
            </td>
            <td data-label="Статус">
              <span class="desk-status ${l.published?'published':'draft'}">${l.deleted_at?'В корзине':l.published?'Опубликовано':'Черновик'}</span>
            </td>
            <td>
              <div class="desk-row-actions">
                ${trash?`<button class="btn primary btn-sm" data-restore="${l.id}">Восстановить</button>`:`<a class="btn btn-sm" href="editor.html?id=${l.id}">Изменить</a>`}
                <details class="more-menu">
                  <summary class="btn ghost icon-btn btn-sm" title="Действия">···</summary>
                  <div class="more-menu-popup">
                    ${!trash?`<button type="button" class="menu-item" data-preview="${l.id}">Посмотреть</button><button type="button" class="menu-item" data-duplicate="${l.id}">Создать копию</button>`:''}
                    <button type="button" class="menu-item" data-history="${l.id}">История изменений</button>
                    ${!trash?`<button type="button" class="menu-item danger" data-trash="${l.id}">В корзину</button>`:''}
                  </div>
                </details>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`:App.empty(trash?'Корзина пуста':'Материалы не найдены','Измените фильтры или добавьте новую лекцию.');

    document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>AdminKit.preview(data.find(l=>l.id===b.dataset.preview),ctx.subjects));
    $('#desk-all')?.addEventListener('change',e=>{shown.forEach(l=>e.target.checked?selected.add(l.id):selected.delete(l.id));draw();});
    document.querySelectorAll('[data-pick]').forEach(b=>b.onchange=()=>{b.checked?selected.add(b.dataset.pick):selected.delete(b.dataset.pick);selection();});
    document.querySelectorAll('[data-duplicate]').forEach(b=>b.onclick=async()=>{if(working)return;working=true;App.busy(b,true);try{const id=await DB.rpc('admin_duplicate_lecture',{p_id:b.dataset.duplicate});location.href='editor.html?id='+encodeURIComponent(id);}catch(e){toast(message(e));}finally{working=false;App.busy(b,false);}});
    document.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>history(b.dataset.history,refresh));
    document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>action('restore',[b.dataset.restore]));
    document.querySelectorAll('[data-trash]').forEach(b=>b.onclick=()=>action('trash',[b.dataset.trash]));
    selection();
  }

  async function refresh(){data=await ctx.reload();selected.clear();draw();}
  async function action(kind,ids=[...selected]){
    if(working||!ids.length)return;
    if(ids.length>100){toast('Выберите не больше 100 материалов за раз.');return;}
    const titles={publish:'Опубликовать материалы?',unpublish:'Снять материалы с публикации?',trash:'Переместить в корзину?',restore:'Восстановить материалы?',subject:'Сменить предмет'};
    const d=dialog(titles[kind]||'Действие с материалами'),body=d.querySelector('.desk-dialog-body');
    body.innerHTML=`<p>Выбрано материалов: ${ids.length}. ${kind==='trash'?'Материалы сохранятся в корзине.':kind==='restore'?'Материалы вернутся в черновики.':''}</p>${kind==='subject'?`<label class="form-field"><span>Новый предмет</span><select id="bulk-target">${ctx.subjects.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>`:''}<p class="desk-error" role="alert"></p><div class="desk-dialog-actions"><button class="btn" data-cancel>Отмена</button><button class="btn primary" data-confirm>Подтвердить</button></div>`;
    body.querySelector('[data-cancel]').onclick=()=>d.close();
    body.querySelector('[data-confirm]').onclick=async e=>{
      if(working)return;working=true;App.busy(e.target,true);
      try{
        const p_items=ids.map(id=>({id,updated_at:data.find(l=>l.id===id).updated_at}));
        const count=await DB.rpc('admin_material_action',{p_items,p_action:kind,p_target:body.querySelector('select')?.value||null});
        d.close();await refresh();toast(`Обновлено материалов: ${count}`);
      }catch(err){
        body.querySelector('.desk-error').textContent=message(err);
      }finally{
        working=false;App.busy(e.target,false);
      }
    };
  }

  let timer;
  $('#admin-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{index=0;selected.clear();draw();},130);};
  for(const id of ['desk-subject','pub-filter','desk-sort']){
    const el=$('#'+id);
    if(el)el.onchange=()=>{index=0;selected.clear();draw();};
  }
  $('#desk-reset').onclick=()=>{
    $('#admin-search').value='';
    $('#desk-subject').value='';
    $('#pub-filter').value='all';
    $('#desk-sort').value='date';
    selected.clear();index=0;draw();
  };
  $('#desk-prev').onclick=()=>{index--;draw();};
  $('#desk-next').onclick=()=>{index++;draw();};
  $('#desk-unselect').onclick=()=>{selected.clear();draw();};
  document.querySelectorAll('[data-bulk]').forEach(b=>b.onclick=()=>action(b.dataset.bulk));

  $('#desk-refresh').onclick=async e=>{
    App.busy(e.currentTarget,true);
    try{await refresh();toast('Список обновлён');}catch(err){toast(message(err));}finally{App.busy($('#desk-refresh'),false);}
  };

  $('#desk-audit').onclick=()=>AdminKit.audit({...ctx,lectures:data});
  $('#desk-csv').onclick=()=>AdminKit.csv(filtered,ctx.subjects,ctx.weeks);
  $('#desk-export').onclick=async e=>{
    const b=e.currentTarget;App.busy(b,true,'Подготовка…');
    try{
      const rows=await ctx.reload();
      const [about,exportSubjects,exportWeeks]=await Promise.all([DB.select('site_about','select=*&id=eq.1'),DB.select('subjects','select=*'),DB.select('weeks','select=*')]);
      saveFile('materials-'+new Date().toISOString().slice(0,10)+'.json',{format:'lecture-materials-v1',exported_at:new Date().toISOString(),subjects:exportSubjects,weeks:exportWeeks,lectures:rows,about});
      toast('Материалы выгружены');
    }catch(err){toast(message(err));}finally{App.busy(b,false);}
  };

  draw();
}

async function history(id,onRestore){
  const d=dialog('История материала'),body=d.querySelector('.desk-dialog-body');body.innerHTML='<p>Загружаем версии…</p>';
  try{
   const rows=await DB.select('lecture_revisions','select=id,saved_at&lecture_id=eq.'+encodeURIComponent(id)+'&order=id.desc&limit=100');
   body.innerHTML=rows.length?`<p class="muted">Последние 100 сохранений. Восстановленная версия станет черновиком.</p><div class="revision-layout"><div class="revision-list">${rows.map((r,i)=>`<button class="revision-choice" data-revision="${r.id}"><b>${i===0?'Последняя версия':'Сохранение'}</b><span>${esc(new Date(r.saved_at).toLocaleString('ru-RU'))}</span></button>`).join('')}</div><div id="revision-content"><p>Выберите сохранение.</p></div></div>`:'<p>История появится после установки обновления и сохранения лекции.</p>';
   let sequence=0;
   body.querySelectorAll('[data-revision]').forEach(b=>b.onclick=async()=>{const run=++sequence,preview=body.querySelector('#revision-content');preview.innerHTML='<p>Загрузка…</p>';body.querySelectorAll('[data-revision]').forEach(x=>x.classList.toggle('active',x===b));try{const [[r],[current]]=await Promise.all([DB.select('lecture_revisions','select=*&id=eq.'+b.dataset.revision),DB.select('lectures','select=id,updated_at,deleted_at&id=eq.'+encodeURIComponent(id))]);if(run!==sequence||!d.isConnected)return;const s=r.snapshot;preview.innerHTML=`<h3>${esc(s.title)}</h3><p class="muted">${App.date(s.lecture_date,true)} · ${s.published?'Опубликовано':'Черновик'}</p><details open><summary>Лекция</summary><div class="prose revision-text">${Markdown.render(s.lecture_text||'Текст отсутствует')}</div></details><details><summary>Полная транскрипция</summary><div class="prose revision-text">${Markdown.render(s.full_text||'Текст отсутствует')}</div></details><details><summary>Задание</summary><div class="prose revision-text">${Markdown.render(s.assignment_text||(Object.hasOwn(s,'assignment_text')?'Задание пока не добавлено.':'Эта версия сохранена до появления заданий. При восстановлении текущее задание сохранится.'))}</div></details><details><summary>Доп. материал</summary><div class="prose revision-text">${Markdown.render(s.extra_text||'Дополнительный текст отсутствует')}</div><div id="revision-gallery"></div></details><button class="btn primary" id="restore-revision">Восстановить эту версию</button><p class="desk-error" role="alert"></p>`;
    Extras.gallery(preview.querySelector('#revision-gallery'),s.extra_images);preview.querySelector('#restore-revision').onclick=async e=>{const button=e.currentTarget;if(!button.dataset.confirmed){button.dataset.confirmed='true';button.textContent='Подтвердить восстановление';preview.querySelector('.desk-error').textContent='Текущая версия останется в истории. Восстановленная лекция будет снята с публикации.';return}App.busy(button,true);try{await DB.rpc('admin_restore_revision',{p_revision:r.id,p_expected:current.updated_at});d.close();await onRestore?.();toast('Версия восстановлена как черновик')}catch(err){preview.querySelector('.desk-error').textContent=message(err)}finally{App.busy(button,false)}};
   }catch(err){if(run===sequence)preview.textContent=message(err)}});
  }catch(err){body.textContent=message(err)}
 }
 let filterIndex=0;
 function enhance(){const ids=[];document.querySelectorAll('#main select:not([data-enhanced]),.desk-dialog select:not([data-enhanced])').forEach(s=>{if(!s.id)s.id='admin-choice-'+(++filterIndex);if(!s.parentElement.classList.contains('custom-select-wrap')){const wrap=document.createElement('div');wrap.className='custom-select-wrap';s.before(wrap);wrap.append(s)}ids.push(s.id)});if(ids.length)SearchUI.init(ids)}
 new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
 return {materials,history,message};
})();
