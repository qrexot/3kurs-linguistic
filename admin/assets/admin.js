'use strict';
(async()=>{
 const {$,esc,icon,date,toast,busy,errorText,empty}=App;
 const page=document.body.dataset.page,params=new URLSearchParams(location.search);
 let subjects=[],weeks=[],lectures=[],profile=null,dirty=false;
 const subject=id=>subjects.find(x=>x.id===id)?.name||'—';const week=id=>weeks.find(x=>x.id===id)?.title||'—';
 const time=v=>v?new Date(v).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
 const timeShort=v=>v?new Date(v).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',year:'numeric'}):'—';
 const guard=fn=>async function(e){try{return await fn.call(this,e)}catch(err){toast(window.AdminDesk?AdminDesk.message(err):errorText(err));console.error(err)}};
 function download(name,text,type='text/plain'){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
 function confirmAction(title,description){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='confirm-dialog';d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(description)}</p><div class="row"><button class="btn" data-answer="no">Отмена</button><button class="btn primary" data-answer="yes">Подтвердить</button></div>`;document.body.append(d);const close=v=>{d.close();d.remove();resolve(v)};d.addEventListener('cancel',e=>{e.preventDefault();close(false)});d.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>close(b.dataset.answer==='yes'));d.showModal()})}

 function shell(){AdminStudio.shell()}

 async function base(){
  [subjects,weeks]=await Promise.all([DB.select('subjects','select=*&order=sort_order.asc,name.asc'),DB.select('weeks','select=*&order=sort_order.desc,starts_on.desc')]);
  lectures=[];let offset=0;
  while(true){const rows=await DB.select('lectures','select=id,title,summary,subject_id,week_id,lecture_date,starts_at,pair_number,lecture_text,full_text,assignment_text,extra_text,extra_images,published,created_at,updated_at,deleted_at&order=lecture_date.desc,id.asc&limit=1000&offset='+offset);lectures.push(...rows);if(rows.length<1000)break;offset+=1000}
  if(lectures.length&&!Object.hasOwn(lectures[0],'deleted_at'))throw new Error('Установите обновление 05_admin_workspace.sql из ADMIN_UPDATE.html. Данные сохранятся.');
 }
 async function materials(){await AdminDesk.materials({lectures,subjects,weeks,trash:page==='trash',reload:async()=>{await base();return lectures}})}
 async function structure(){
  const plural=(n,o,f,m)=>{const mod10=n%10,mod100=n%100;if(mod10===1&&mod100!==11)return o;if(mod10>=2&&mod10<=4&&(mod100<10||mod100>=20))return f;return m};
  $('#main').innerHTML=`<div class="page-head spread">
    <div>
      <h1>Недели и предметы</h1>
      <p class="muted">Структура семестра, учебные недели и дисциплины</p>
    </div>
  </div>
  <div class="structure-grid">
    <section class="panel structure-panel">
      <div class="structure-panel-head">
        <div>
          <h2>Предметы</h2>
          <p class="muted small">Учебные дисциплины для группировки лекций</p>
        </div>
        <span class="structure-badge-pill" id="subjects-badge">0</span>
      </div>
      <form class="structure-form" id="subject-form">
        <input type="hidden" name="id">
        <label class="form-field">
          <span>Название предмета</span>
          <input name="name" maxlength="100" required placeholder="Например, Лексикология" autocomplete="off">
        </label>
        <div class="structure-form-actions">
          <button class="btn primary" type="submit" id="subject-btn-save">${icon('plus')} <span>Добавить предмет</span></button>
          <button class="btn ghost" type="button" id="subject-reset" hidden>Отмена</button>
        </div>
      </form>
      <div id="subjects-list" class="structure-items-list"></div>
    </section>

    <section class="panel structure-panel">
      <div class="structure-panel-head">
        <div>
          <h2>Учебные недели</h2>
          <p class="muted small">Даты и периоды занятий</p>
        </div>
        <span class="structure-badge-pill" id="weeks-badge">0</span>
      </div>
      <form class="structure-form stack" id="week-form">
        <input type="hidden" name="id">
        <label class="form-field">
          <span>Название недели</span>
          <input name="title" maxlength="100" required placeholder="Например, Неделя 1" autocomplete="off">
        </label>
        <div class="form-grid">
          <label class="form-field">
            <span>Начало недели</span>
            <input type="date" name="starts_on" required>
          </label>
          <label class="form-field">
            <span>Конец недели</span>
            <input type="date" name="ends_on" required>
          </label>
        </div>
        <label class="form-field">
          <span>Порядковый номер</span>
          <input type="number" name="sort_order" value="${weeks.length+1}" min="0" max="10000" required>
        </label>
        <div class="structure-form-actions">
          <button class="btn primary" type="submit" id="week-btn-save">${icon('plus')} <span>Добавить неделю</span></button>
          <button class="btn ghost" type="button" id="week-reset" hidden>Отмена</button>
        </div>
      </form>
      <div id="weeks-list" class="structure-items-list"></div>
    </section>
  </div>`;

  const draw=()=>{
    $('#subjects-badge').textContent=subjects.length;
    $('#weeks-badge').textContent=weeks.length;

    $('#subjects-list').innerHTML=subjects.map(s=>{
      const cnt=lectures.filter(l=>!l.deleted_at&&l.subject_id===s.id).length;
      return `<div class="structure-item" id="sub-item-${s.id}">
        <div class="structure-item-info">
          <strong class="structure-item-title">${esc(s.name)}</strong>
          <span class="structure-item-count">${cnt} ${plural(cnt,'материал','материала','материалов')}</span>
        </div>
        <div class="structure-item-actions">
          <button class="btn ghost btn-sm" data-edit-sub="${s.id}" type="button" aria-label="Изменить ${esc(s.name)}">${icon('settings')} <span>Изменить</span></button>
          <button class="btn ghost btn-sm btn-icon-only text-danger" data-del-sub="${s.id}" type="button" aria-label="Удалить ${esc(s.name)}">${icon('close')}</button>
        </div>
      </div>`;
    }).join('')||'<p class="muted small">Добавьте первый предмет выше.</p>';

    $('#weeks-list').innerHTML=weeks.map(w=>{
      const cnt=lectures.filter(l=>!l.deleted_at&&l.week_id===w.id).length;
      return `<div class="structure-item" id="week-item-${w.id}">
        <div class="structure-item-info">
          <div class="structure-item-title-row">
            <strong class="structure-item-title">${esc(w.title)}</strong>
            <span class="structure-sort-pill">#${w.sort_order??'—'}</span>
          </div>
          <div class="structure-item-meta">
            <span>${date(w.starts_on)} — ${date(w.ends_on)}</span>
            <span class="dot-sep">·</span>
            <span>${cnt} ${plural(cnt,'материал','материала','материалов')}</span>
          </div>
        </div>
        <div class="structure-item-actions">
          <button class="btn ghost btn-sm" data-edit-week="${w.id}" type="button" aria-label="Изменить ${esc(w.title)}">${icon('settings')} <span>Изменить</span></button>
          <button class="btn ghost btn-sm btn-icon-only text-danger" data-del-week="${w.id}" type="button" aria-label="Удалить ${esc(w.title)}">${icon('close')}</button>
        </div>
      </div>`;
    }).join('')||'<p class="muted small">Добавьте первую неделю выше.</p>';

    document.querySelectorAll('[data-edit-sub]').forEach(b=>b.onclick=()=>{
      const s=subjects.find(x=>x.id===b.dataset.editSub),f=$('#subject-form');
      f.elements.id.value=s.id;
      f.elements.name.value=s.name;
      $('#subject-reset').hidden=false;
      $('#subject-btn-save').innerHTML=icon('check')+' <span>Сохранить</span>';
      document.querySelectorAll('.structure-item.is-editing').forEach(el=>el.classList.remove('is-editing'));
      $('#sub-item-'+s.id)?.classList.add('is-editing');
      f.elements.name.focus();
    });

    document.querySelectorAll('[data-edit-week]').forEach(b=>b.onclick=()=>{
      const w=weeks.find(x=>x.id===b.dataset.editWeek),f=$('#week-form');
      ['id','title','starts_on','ends_on','sort_order'].forEach(k=>f.elements[k].value=w[k]);
      $('#week-reset').hidden=false;
      $('#week-btn-save').innerHTML=icon('check')+' <span>Сохранить</span>';
      document.querySelectorAll('.structure-item.is-editing').forEach(el=>el.classList.remove('is-editing'));
      $('#week-item-'+w.id)?.classList.add('is-editing');
      f.elements.title.focus();
    });

    for(const kind of ['sub','week'])document.querySelectorAll(`[data-del-${kind}]`).forEach(b=>b.onclick=guard(async()=>{
      const id=b.getAttribute('data-del-'+kind);
      if(!await confirmAction('Удалить '+(kind==='sub'?'предмет?':'неделю?'),'Удалить можно только пустой раздел. Если в нём есть занятия, сначала перенесите их.'))return;
      try{
        await DB.remove(kind==='sub'?'subjects':'weeks',id);
        await base();
        draw();
        toast('Удалено');
      }catch(e){
        if(e.code==='23503')throw new Error('В этом разделе есть лекции. Перенесите или удалите их перед удалением раздела.');
        throw e;
      }
    }));
  };

  for(const kind of ['subject','week']){
    $('#'+kind+'-reset').onclick=()=>{
      const f=$('#'+kind+'-form');
      f.reset();
      f.elements.id.value='';
      $('#'+kind+'-reset').hidden=true;
      $('#'+kind+'-btn-save').innerHTML=icon('plus')+' <span>Добавить '+(kind==='subject'?'предмет':'неделю')+'</span>';
      document.querySelectorAll('.structure-item.is-editing').forEach(el=>el.classList.remove('is-editing'));
    };
    $('#'+kind+'-form').onsubmit=guard(async e=>{
      e.preventDefault();
      const f=e.target,table=kind==='subject'?'subjects':'weeks',id=f.elements.id.value;
      const payload=kind==='subject'?{name:f.elements.name.value.trim()}:{title:f.elements.title.value.trim(),starts_on:f.elements.starts_on.value,ends_on:f.elements.ends_on.value,sort_order:Number(f.elements.sort_order.value)};
      if(!(payload.name||payload.title))throw new Error('Введите название.');
      if(kind==='week'&&payload.ends_on<payload.starts_on)throw new Error('Конец недели не может быть раньше начала.');
      const b=f.querySelector('[type=submit]');
      busy(b,true);
      try{
        if(id)await DB.update(table,id,payload);
        else await DB.insert(table,payload);
        f.reset();
        f.elements.id.value='';
        $('#'+kind+'-reset').hidden=true;
        $('#'+kind+'-btn-save').innerHTML=icon('plus')+' <span>Добавить '+(kind==='subject'?'предмет':'неделю')+'</span>';
        document.querySelectorAll('.structure-item.is-editing').forEach(el=>el.classList.remove('is-editing'));
        await base();
        draw();
        toast('Сохранено');
      }catch(e){
        if(e.code==='23505')throw new Error('Раздел с таким названием уже существует.');
        throw e;
      }finally{
        busy(b,false);
      }
    });
  }
  draw();
 }
 
async function editor(){
  let id=params.get('id'),item=id?(await DB.select('lectures','select=*&id=eq.'+encodeURIComponent(id)))[0]:null;
  if(item?.deleted_at){$('#main').innerHTML=empty('Материал в корзине','Сначала восстановите его как черновик.','<a class="btn primary" href="trash.html">Открыть корзину</a>');return}
  if(id&&!item){$('#main').innerHTML=empty('Лекция не найдена');return}
  if(!subjects.length||!weeks.length){$('#main').innerHTML=empty('Добавьте структуру','Для занятия нужен хотя бы один предмет и одна неделя.','<a href="structure.html" class="btn primary">Добавить предметы и недели</a>');return}

  const findWeekForDate=d=>weeks.find(w=>d>=w.starts_on&&d<=w.ends_on)?.id||weeks[0]?.id||'';
  const l=item||{title:'',subject_id:subjects[0].id,week_id:findWeekForDate(AdminSchedule.today()),lecture_date:AdminSchedule.today(),summary:'',lecture_text:'',full_text:'',assignment_text:'',extra_text:'',extra_images:[],published:false};
  if(!item){
    const dateParam=params.get('date');
    if(/^\d{4}-\d{2}-\d{2}$/.test(dateParam||'')&&Number.isFinite(Date.parse(dateParam+'T00:00:00Z'))&&new Date(dateParam+'T00:00:00Z').toISOString().slice(0,10)===dateParam){
      l.lecture_date=dateParam;
      l.week_id=findWeekForDate(dateParam);
    }
    const subjectId=params.get('subject');
    if(subjects.some(x=>x.id===subjectId))l.subject_id=subjectId;
  }

  let textMode='lecture_text';
  const texts={lecture_text:l.lecture_text||'',full_text:l.full_text||'',assignment_text:l.assignment_text||'',extra_text:l.extra_text||''};
  let timer=null,photos=null,draftTimer=null,submitting=false,editorVersion=0;
  let draftKey='lecture-draft:'+CONFIG.url+':'+DB.session.user.id+':'+(id||'new');

  $('#main').innerHTML=`<div class="editor-header-nav spread">
    <a class="back-link" href="index.html">${icon('back')} К материалам</a>
    <div class="row editor-header-badges">
      <span class="lecture-status-badge ${l.published?'published':'draft'}" id="status-badge">${l.published?'● Опубликовано':'○ Черновик'}</span>
      <a class="btn ghost btn-sm" href="help.html" target="_blank" rel="noopener">Правила оформления ↗</a>
    </div>
  </div>
  <form id="editor-form" class="clean-editor-canvas" autocomplete="off">
    <label class="sr-only" for="lecture-title-input">Тема занятия</label><textarea name="title" id="lecture-title-input" class="doc-title-input" rows="2" maxlength="180" required placeholder="Тема занятия…" autocomplete="off">${esc(l.title)}</textarea>
    <div class="property-strip">
      <label class="prop-item">
        <span class="prop-label">Предмет</span>
        <div class="custom-select-wrap">
          <select name="subject_id" id="lecture-subject">
            ${subjects.map(s=>`<option value="${s.id}" ${s.id===l.subject_id?'selected':''}>${esc(s.name)}</option>`).join('')}
          </select>
          ${icon('chevron')}
        </div>
      </label>
      <label class="prop-item">
        <span class="prop-label">Дата</span>
        <input name="lecture_date" type="date" value="${esc(l.lecture_date)}" required id="lecture-date">
      </label>
      <div class="prop-item prop-week-badge" id="auto-week-badge" title="Неделя синхронизируется автоматически с выбранной датой">
        <span class="prop-label">Неделя</span>
        <span class="week-chip" id="auto-week-text">${esc(week(l.week_id))}</span>
        <input type="hidden" name="week_id" id="lecture-week-id" value="${l.week_id}">
      </div>
      <div class="prop-spacer"></div>
      <button type="button" class="btn magic-btn" id="btn-smart-paste" title="Вставить готовый ответ от нейросети (Claude, ChatGPT)">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
        <span>Вставить из нейросети</span>
      </button>
      <button type="button" class="btn ghost btn-extra-toggle" id="btn-toggle-extra" aria-expanded="false">
        <span>Детали ▾</span>
      </button>
    </div>
    <div class="property-drawer" id="property-drawer" hidden>
      <div class="form-grid">
        <label class="form-field">
          <span>Начало пары</span>
          <input name="starts_at" type="time" value="${esc(l.starts_at?.slice(0,5)||'')}">
        </label>
        <label class="form-field">
          <span>Номер пары</span>
          <input name="pair_number" type="number" min="1" max="12" value="${l.pair_number||''}" placeholder="1">
        </label>
        <label class="form-field wide">
          <span>Краткое описание (необязательно)</span>
          <textarea name="summary" maxlength="500" rows="2" placeholder="О чём это занятие…">${esc(l.summary)}</textarea>
        </label>
      </div>
    </div>
    <div class="editor-grid" id="editor-layout">
      <section class="editor-pane">
        <div class="editor-topline">
          <div class="tabs modern-editor-tabs" aria-label="Версия текста">
            <button type="button" class="active" data-edit-mode="lecture_text">
              <span class="tab-indicator" id="dot-lecture"></span>
              <span>Лекция</span>
            </button>
            <button type="button" data-edit-mode="assignment_text">
              <span class="tab-indicator" id="dot-assignment"></span>
              <span>Задание</span>
            </button>
            <button type="button" data-edit-mode="full_text">
              <span class="tab-indicator" id="dot-full"></span>
              <span>Транскрипция</span>
            </button>
            <button type="button" data-edit-mode="extra_text">
              <span class="tab-indicator" id="dot-extra"></span>
              <span id="tab-label-extra">Фото</span>
            </button>
          </div>
          <div class="editor-topline-right">
            <label class="upload-label" title="Загрузить текстовый файл">Загрузить .txt / .md<input type="file" id="import-text" accept=".txt,.md,text/plain,text/markdown"></label>
          </div>
        </div>
        <div class="assignment-help" id="assignment-help" hidden>
          <div class="spread">
            <p>Задание к следующей паре. Студенты увидят его на сайте в отдельной вкладке.</p>
            <button type="button" class="btn ghost btn-sm" id="btn-copy-task-prompt">Скопировать промпт задания</button>
          </div>
        </div>
        <section id="extra-editor" class="extra-editor" aria-label="Фотографии к лекции" hidden></section>
        ${FormatTools.toolbar()}
        <textarea id="source-text" maxlength="500000" aria-label="Текст выбранной версии" spellcheck="true" placeholder="Вставьте текст лекции в Markdown…"></textarea>
        <div class="spread small muted editor-meta-bar">
          <span id="text-count">0 символов</span>
          <span id="draft-status" class="muted">Локальный черновик включён</span>
        </div>
      </section>
      <section class="editor-pane preview-pane" id="preview-pane">
        <div class="editor-topline">
          <span>Предпросмотр</span>
          ${icon('book')}
        </div>
        <div class="editor-preview prose" id="preview-text"></div>
      </section>
    </div>
    <div class="editor-bottom clean-footer">
      <div class="footer-left">
        <span class="save-status-pill" id="save-status">
          <span class="status-dot"></span>
          <span id="status-text">${id?'Сохранено':'Новое занятие'}</span>
        </span>
      </div>
      <div class="footer-right">
        <button type="button" class="btn ghost btn-preview-toggle" id="btn-toggle-preview" title="Показать или скрыть предпросмотр">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          <span id="preview-toggle-text">Скрыть просмотр</span>
        </button>
        <button type="button" class="btn btn-save-draft" id="btn-save-draft">Сохранить</button>
        <button type="button" class="btn primary btn-publish" id="btn-publish-lecture">${icon('check')} Опубликовать</button>
        <details class="more-menu">
          <summary class="btn ghost icon-btn" title="Дополнительно">···</summary>
          <div class="more-menu-popup">
            <button type="button" class="menu-item" id="editor-history" ${!id?'disabled':''}>История версий</button>
            ${id?'<button type="button" class="menu-item danger" id="delete-lecture">В корзину</button>':''}
          </div>
        </details>
      </div>
    </div>
  </form>`;

  const f=$('#editor-form'),source=$('#source-text');
  function updateTabDots(){
    texts[textMode]=source.value;
    $('#dot-lecture')?.classList.toggle('active-dot',!!texts.lecture_text?.trim());
    $('#dot-assignment')?.classList.toggle('active-dot',!!texts.assignment_text?.trim());
    $('#dot-full')?.classList.toggle('active-dot',!!texts.full_text?.trim());
    const count=photos?.get()?.length||0;
    $('#dot-extra')?.classList.toggle('active-dot',!!(texts.extra_text?.trim()||count));
    const label=$('#tab-label-extra');
    if(label)label.textContent=count?`Фото (${count})`:'Фото';
  }
  function preview(){
    texts[textMode]=source.value;
    $('#assignment-help').hidden=textMode!=='assignment_text';
    $('#extra-editor').hidden=textMode!=='extra_text';
    source.setAttribute('aria-label',textMode==='assignment_text'?'Задание к следующей паре':'Текст выбранной версии');
    $('#preview-text').innerHTML=Markdown.render(source.value);
    if(textMode==='extra_text'&&photos){
      const gallery=document.createElement('div');
      $('#preview-text').append(gallery);
      Extras.gallery(gallery,photos.get());
    }
    $('#text-count').textContent=source.value.length.toLocaleString('ru-RU')+' символов';
    updateTabDots();
  }
  function changed(){
    editorVersion++;
    dirty=true;
    $('#status-text').textContent='Есть несохранённые изменения';
    $('#save-status').classList.remove('saved-ok');
    clearTimeout(draftTimer);
    draftTimer=setTimeout(persistDraft,600);
  }
  source.value=texts[textMode]||'';
  preview();

  const draftFields=['title','subject_id','week_id','lecture_date','starts_at','pair_number','summary'];
  function draftValue(){
    texts[textMode]=source.value;
    return {
      fields:Object.fromEntries(draftFields.map(k=>[k,f.elements[k].value])),
      texts:{...texts},
      extra_images:photos?.get()||[],
      published:l.published,
      base:item?.updated_at||null,
      savedAt:new Date().toISOString()
    };
  }
  function persistDraft(){
    if(!dirty)return;
    try{
      localStorage.setItem(draftKey,JSON.stringify(draftValue()));
      $('#draft-status').textContent='Локальная копия · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    }catch{
      $('#draft-status').textContent='Локальная копия не сохранена';
    }
  }

  function syncWeekFromDate(){
    const curDate=f.elements.lecture_date.value;
    const matched=weeks.find(w=>curDate>=w.starts_on&&curDate<=w.ends_on);
    if(matched){
      f.elements.week_id.value=matched.id;
      $('#auto-week-text').textContent=matched.title;
    }else if(weeks.length){
      $('#auto-week-text').textContent=week(f.elements.week_id.value);
    }
  }
  f.elements.lecture_date.addEventListener('change',()=>{syncWeekFromDate();changed();});
  f.elements.subject_id.addEventListener('change',changed);
  f.elements.title.addEventListener('input',changed);

  if((l.starts_at||l.pair_number||l.summary)&&!matchMedia('(max-width: 760px)').matches){
    $('#property-drawer').hidden=false;
    $('#btn-toggle-extra').setAttribute('aria-expanded','true');
    $('#btn-toggle-extra span').textContent='Детали ▴';
  }
  $('#btn-toggle-extra').onclick=()=>{
    const drawer=$('#property-drawer'),open=drawer.hidden;
    drawer.hidden=!open;
    $('#btn-toggle-extra').setAttribute('aria-expanded',String(open));
    $('#btn-toggle-extra span').textContent=open?'Детали ▴':'Детали ▾';
  };

  let previewVisible=!matchMedia('(max-width: 1000px)').matches;
  const syncPreview=()=>{
    $('#editor-layout').classList.toggle('hide-preview',!previewVisible);
    $('#preview-pane').hidden=!previewVisible;
    $('#preview-toggle-text').textContent=previewVisible?'Скрыть просмотр':'Предпросмотр';
    $('#btn-toggle-preview').setAttribute('aria-expanded',String(previewVisible));
  };
  syncPreview();
  $('#btn-toggle-preview').onclick=()=>{
    previewVisible=!previewVisible;
    syncPreview();
    if(previewVisible&&matchMedia('(max-width: 1000px)').matches)$('#preview-pane').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };

  // Smart Paste
  $('#btn-smart-paste').onclick=()=>{
    const d=document.createElement('dialog');
    d.className='desk-dialog smart-paste-dialog';
    d.setAttribute('aria-label','Вставка из нейросети');
    d.innerHTML=`<header><h2>✨ Вставка ответа нейросети</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button></header><div class="desk-dialog-body"><p class="muted">Вставьте весь ответ Claude или ChatGPT. Система автоматически разберёт тему занятия, текст лекции и домашнее задание.</p><textarea id="smart-paste-input" rows="12" placeholder="Вставьте скопированный ответ нейросети сюда…"></textarea><div class="desk-dialog-actions"><button type="button" class="btn ghost" data-close>Отмена</button><button type="button" class="btn primary" id="btn-apply-smart-paste">Разобрать и вставить</button></div></div>`;
    document.body.append(d);
    const textarea=d.querySelector('#smart-paste-input');
    textarea.focus();
    d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
    d.addEventListener('close',()=>d.remove(),{once:true});
    d.querySelector('#btn-apply-smart-paste').onclick=()=>{
      const raw=textarea.value.trim();
      if(!raw){toast('Вставьте текст для разбора');return;}
      let text=raw,extractedTitle='',extractedAssignment='',extractedSummary='';
      const taskBlock=text.match(/:::task\s*([\s\S]*?):::/i);
      if(taskBlock){
        extractedAssignment=taskBlock[1].trim();
        text=text.replace(/:::task\s*[\s\S]*?:::/i,'').trim();
      }else{
        const taskHeading=text.match(/(?:^|\n)#{1,3}\s*(?:Задание|Домашнее задание|Д\/З|Что сделать к следующей паре)[^\n]*\n([\s\S]*?)(?=(?:\n#{1,3}\s)|$)/i);
        if(taskHeading){
          extractedAssignment=taskHeading[1].trim();
          text=text.replace(taskHeading[0],'').trim();
        }
      }
      const titleMatch=text.match(/^(?:#\s*|Тема:\s*)([^\n]+)/i);
      if(titleMatch){
        extractedTitle=titleMatch[1].trim();
        text=text.replace(/^(?:#\s*|Тема:\s*)[^\n]+\n*/i,'').trim();
      }
      const summaryMatch=text.match(/^:::(?:summary|note)\s*([\s\S]*?):::/i);
      if(summaryMatch){
        extractedSummary=summaryMatch[1].trim();
        text=text.replace(/^:::(?:summary|note)\s*[\s\S]*?:::\n*/i,'').trim();
      }
      if(extractedTitle&&(!f.elements.title.value||f.elements.title.value.startsWith('Лекция'))){
        f.elements.title.value=extractedTitle;
      }
      if(extractedAssignment)texts.assignment_text=extractedAssignment;
      if(extractedSummary&&!f.elements.summary.value)f.elements.summary.value=extractedSummary;
      texts.lecture_text=text;
      source.value=texts[textMode]||'';
      updateTabDots();
      preview();
      changed();
      d.close();
      toast('Текст'+(extractedAssignment?' и задание':'')+' успешно вставлены!');
    };
    d.showModal();
  };

  $('#btn-copy-task-prompt')?.addEventListener('click',()=>{
    const taskPrompt='Из этой транскрипции выпиши только то, что преподаватель явно задал или попросил подготовить к следующей паре. Коротко: до 5 пунктов, без вступления. Сохрани номера упражнений, страницы, названия и сроки, если они названы. Не добавляй своих заданий и не выдавай примеры с занятия за домашнюю работу. Если задание не названо, напиши: «В записи задание к следующей паре не указано». Если фрагмент неразборчив, прямо отметь это.';
    navigator.clipboard.writeText(taskPrompt).then(()=>toast('Промпт задания скопирован в буфер!'));
  });

  const savedDraft=App.storage.get(draftKey);
  if(savedDraft){
    const banner=document.createElement('div');
    banner.className='draft-recovery';
    banner.innerHTML=`<div><strong>Есть локальный черновик</strong><p>Он не опубликован. ${(savedDraft.base!==item?.updated_at&&id?'Сохранённая версия могла измениться. ':'')}Восстановите его для проверки или удалите эту локальную копию.</p></div><div class="row"><button type="button" class="btn primary" data-recover>Восстановить</button><button type="button" class="btn ghost" data-discard>Удалить копию</button></div>`;
    $('#editor-form').before(banner);
    banner.querySelector('[data-recover]').onclick=()=>{
      draftFields.forEach(k=>{if(savedDraft.fields?.[k]!=null)f.elements[k].value=savedDraft.fields[k];});
      texts.lecture_text=savedDraft.texts?.lecture_text||'';
      texts.full_text=savedDraft.texts?.full_text||'';
      texts.assignment_text=savedDraft.texts?.assignment_text??l.assignment_text??'';
      texts.extra_text=savedDraft.texts?.extra_text??l.extra_text??'';
      photos.set(savedDraft.extra_images??l.extra_images??[]);
      source.value=texts[textMode]||'';
      syncWeekFromDate();
      updateTabDots();
      preview();
      changed();
      banner.remove();
      toast('Черновик восстановлен');
    };
    banner.querySelector('[data-discard]').onclick=async()=>{
      if(!await confirmAction('Удалить локальную копию?','Сохранённая лекция в базе останется без изменений.'))return;
      App.storage.del(draftKey);
      banner.remove();
    };
  }

  photos=Extras.editor($('#extra-editor'),l.extra_images,()=>{changed();updateTabDots();if(textMode==='extra_text')preview();});
  window.addEventListener('save-draft-now',persistDraft);
  window.addEventListener('pagehide',()=>{clearTimeout(draftTimer);persistDraft();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  f.addEventListener('input',changed);
  source.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(preview,220);});
  document.querySelectorAll('[data-edit-mode]').forEach(b=>b.onclick=()=>{
    texts[textMode]=source.value;
    textMode=b.dataset.editMode;
    source.value=texts[textMode]||'';
    document.querySelectorAll('[data-edit-mode]').forEach(x=>x.classList.toggle('active',x===b));
    preview();
  });
  FormatTools.attach(source,()=>{changed();preview();});

  $('#import-text').onchange=guard(async e=>{
    const file=e.target.files[0];
    if(!file)return;
    if(file.size>2000000)throw new Error('Выберите текстовый файл до 2 МБ.');
    const text=await file.text();
    if(text.length>500000)throw new Error('Максимум 500 000 символов на одну версию.');
    if(source.value&&!await confirmAction('Заменить текст?','Текущая версия в редакторе будет заменена содержимым файла.'))return;
    source.value=text;
    updateTabDots();
    changed();
    preview();
    e.target.value='';
    toast('Файл успешно загружен в редактор');
  });

  async function saveLecture(publish){
    if(submitting)return;
    texts[textMode]=source.value;
    const titleVal=f.elements.title.value.trim();
    if(!titleVal){toast('Введите тему занятия');f.elements.title.focus();return;}
    if(publish&&!texts.lecture_text.trim()){toast('Для публикации нужен текст лекции');return;}
    if(photos.busy){toast('Дождитесь завершения загрузки фотографий');return;}

    const dateVal=f.elements.lecture_date.value;
    const subVal=f.elements.subject_id.value;
    const pairVal=f.elements.pair_number.value;
    const timeVal=f.elements.starts_at.value;

    const clashes=lectures.filter(x=>!x.deleted_at&&x.id!==id&&x.lecture_date===dateVal&&((timeVal&&x.starts_at?.slice(0,5)===timeVal)||(pairVal&&Number(x.pair_number)===Number(pairVal))));
    if(clashes.length&&!await confirmAction('В это время уже есть занятие',clashes.map(x=>x.title).join(', ')+'. Сохранить ещё один материал на эту пару?'))return;

    submitting=true;
    const targetBtn=publish?$('#btn-publish-lecture'):$('#btn-save-draft');
    busy(targetBtn,true);
    try{
      const targetWeek=findWeekForDate(dateVal);
      const payload={
        title:titleVal,
        subject_id:subVal,
        week_id:targetWeek,
        lecture_date:dateVal,
        starts_at:timeVal||null,
        pair_number:pairVal?Number(pairVal):null,
        summary:f.elements.summary.value.trim(),
        ...texts,
        extra_images:photos.get(),
        published:!!publish
      };

      let rows;
      if(id){
        rows=await DB.update('lectures',id,payload);
      }else{
        rows=await DB.insert('lectures',payload);
      }
      if(!rows?.[0])throw new Error('Сохранение не подтверждено сервером.');

      const existingIdx = lectures.findIndex(x=>x.id===rows[0].id);
      if(existingIdx >= 0) lectures[existingIdx] = rows[0];
      else lectures.unshift(rows[0]);

      const previousDraftKey=draftKey;
      item=rows[0];
      id=item.id;
      l.published=payload.published;
      draftKey='lecture-draft:'+CONFIG.url+':'+DB.session.user.id+':'+id;
      dirty=false;

      $('#editor-history').disabled=false;
      $('#status-badge').className='lecture-status-badge '+(payload.published?'published':'draft');
      $('#status-badge').textContent=payload.published?'● Опубликовано':'○ Черновик';
      $('#status-text').textContent='Сохранено · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      $('#save-status').classList.add('saved-ok');
      clearTimeout(draftTimer);
      App.storage.del(previousDraftKey);
      App.storage.del(draftKey);
      $('#draft-status').textContent='Все изменения сохранены в базе';
      toast(payload.published?'Лекция опубликована!':'Черновик сохранён!');
      if(!params.get('id')){
        params.set('id',id);
        history.replaceState(null,'','editor.html?id='+encodeURIComponent(id));
      }
    }catch(err){
      toast(errorText(err));
      console.error(err);
    }finally{
      submitting=false;
      busy(targetBtn,false);
    }
  }

  $('#btn-save-draft').onclick=()=>saveLecture(false);
  $('#btn-publish-lecture').onclick=()=>saveLecture(true);
  f.onsubmit=e=>{e.preventDefault();saveLecture(l.published);};

  $('#editor-history').onclick=async()=>{
    if(dirty&&!await confirmAction('Открыть историю?','Перед восстановлением версии сохраните важные правки.'))return;
    persistDraft();
    await AdminDesk.history(id,async()=>{dirty=false;location.reload();});
  };

  $('#delete-lecture')?.addEventListener('click',guard(async()=>{
    if(!await confirmAction('Переместить в корзину?','Сохранённые тексты и история останутся в базе.'))return;
    await DB.rpc('admin_material_action',{p_items:[{id,updated_at:item.updated_at}],p_action:'trash'});
    clearTimeout(draftTimer);
    App.storage.del(draftKey);
    dirty=false;
    location.href='index.html';
  }));
}

 async function visitors(){await VisitorAdmin.start()}

 async function stats(){
  $('#main').innerHTML=`<div class="page-head spread">
    <div>
      <h1>Статистика</h1>
      <p class="muted">Просмотры, активность аудитории и популярные темы</p>
    </div>
    <div class="custom-select-wrap" style="max-width:180px">
      <select id="stats-range" aria-label="Период статистики">
        <option value="7">За 7 дней</option>
        <option value="30" selected>За 30 дней</option>
        <option value="90">За 90 дней</option>
      </select>
      ${icon('chevron')}
    </div>
  </div>
  <div id="stats-content"></div>
  <div class="stats-footer-panel">
    <p class="admin-notice">Активное время приблизительное и считается с момента обновления учёта. IP и геопозиция получены от внешних сервисов и могут указывать на VPN или сеть провайдера.</p>
    <div class="admin-actions">
      <button class="btn ghost btn-sm" id="export-stats">Скачать JSON</button>
      <button class="btn ghost btn-sm text-danger" id="clear-stats">Очистить историю старше 90 дней</button>
    </div>
  </div>`;

  let data,requestId=0;
  const load=async()=>{
    const run=++requestId,r=await DB.rpc('admin_stats',{p_days:Number($('#stats-range').value)});
    if(run!==requestId)return;
    data=r;
    const max=Math.max(1,...(data.popular||[]).map(p=>Number(p.views)));
    $('#stats-content').innerHTML=`
      <div class="stats-summary-grid">
        <div class="stats-metric-card">
          <span class="stats-metric-label">Посетители</span>
          <strong class="stats-metric-val">${Number(data.visitors||0).toLocaleString('ru-RU')}</strong>
        </div>
        <div class="stats-metric-card">
          <span class="stats-metric-label">Посещения</span>
          <strong class="stats-metric-val">${Number(data.visits||0).toLocaleString('ru-RU')}</strong>
        </div>
        <div class="stats-metric-card">
          <span class="stats-metric-label">Открытий лекций</span>
          <strong class="stats-metric-val">${Number(data.views||0).toLocaleString('ru-RU')}</strong>
        </div>
        <div class="stats-metric-card">
          <span class="stats-metric-label">Активных минут</span>
          <strong class="stats-metric-val">${Math.floor((data.seconds||0)/60).toLocaleString('ru-RU')}</strong>
        </div>
      </div>

      <div class="stats-grid">
        <section class="panel stats-section">
          <header><h2>Чаще открывают</h2></header>
          <div class="stats-bars-list">
            ${(data.popular||[]).length ? (data.popular||[]).map((p,idx)=>`
              <div class="bar-row">
                <div class="spread align-center bar-row-head">
                  <div class="row align-center gap-8">
                    <span class="bar-rank">#${idx+1}</span>
                    <span class="bar-title">${esc(p.lecture_title)}</span>
                  </div>
                  <b class="bar-count">${p.views}</b>
                </div>
                <div class="bar-track"><div class="bar-fill" style="width:${Number(p.views)/max*100}%"></div></div>
              </div>
            `).join('') : '<p class="muted small">Пока нет открытий за выбранный период.</p>'}
          </div>

          <div class="stats-devices-block">
            <h3>Устройства</h3>
            <div class="stats-device-grid">
              <div class="stats-device-item">
                <span class="device-name">Телефон</span>
                <strong>${data.mobile||0}</strong>
              </div>
              <div class="stats-device-item">
                <span class="device-name">Планшет</span>
                <strong>${data.tablet||0}</strong>
              </div>
              <div class="stats-device-item">
                <span class="device-name">Компьютер</span>
                <strong>${data.desktop||0}</strong>
              </div>
            </div>
          </div>

          ${(data.top_countries||[]).length ? `
            <div class="stats-countries-block">
              <h3>Страны</h3>
              <div class="stats-countries-list">
                ${(data.top_countries||[]).map(c=>`
                  <div class="spread align-center small stats-country-row">
                    <span class="muted">${esc(c.country_code||'')} ${esc(c.country)}</span>
                    <strong>${c.devices}</strong>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </section>

        <section class="panel stats-section">
          <header><h2>Последняя активность</h2></header>
          <div class="stats-activity-list">
            ${(data.recent||[]).length ? (data.recent||[]).map(v=>`
              <div class="activity-item">
                <div class="activity-main">
                  <p class="activity-title">${esc(v.lecture_title)}</p>
                  <div class="activity-meta">
                    <span class="activity-mode ${v.mode}">${v.mode==='extra'?'Доп. материал':v.mode==='assignment'?'Задание':v.mode==='lecture'?'Лекция':'Полный текст'}</span>
                    <span class="dot-sep">·</span>
                    <span class="activity-device">${esc(v.device_name)}</span>
                  </div>
                </div>
                <time class="activity-time">${time(v.created_at)}</time>
              </div>
            `).join('') : '<p class="muted small">Здесь появится история чтения лекций.</p>'}
          </div>
        </section>
      </div>`;
  };

  $('#stats-range').onchange=guard(load);
  $('#export-stats').onclick=()=>{
    if(data)download('statistics.json',JSON.stringify({exported_at:new Date().toISOString(),days:Number($('#stats-range').value),...data},null,2),'application/json');
  };
  $('#clear-stats').onclick=guard(async()=>{
    if(!await confirmAction('Удалить старую историю?','События и снимки старше 90 дней будут удалены. Материалы и имена посетителей сохранятся.'))return;
    const before=new Date(Date.now()-90*86400000).toISOString(),count=await DB.rpc('clear_old_events',{p_before:before});
    toast('Удалено событий: '+count);
    await load();
  });
  await load();
 }
 
function help(){FormatTools.help($('#main'))}

 async function about(){
  const rows=await DB.select('site_about','select=*&id=eq.1');if(!rows?.[0])throw new Error('Сначала выполните admin/setup/04_update.sql в Supabase.');let record=rows[0],editVersion=0;
  $('#main').innerHTML=`<div class="page-head spread"><div><div class="eyebrow">Настройки публикации</div><h1>О сайте</h1><p>Изменения появятся на сайте после сохранения.</p></div><a class="btn ghost" href="../privacy.html" target="_blank" rel="noopener">Открыть страницу ↗</a></div><form id="about-form"><div class="about-editor-grid"><section class="panel"><label class="form-field"><span>Заголовок</span><input id="about-title" maxlength="120" required></label><label class="form-field about-field"><span>Описание</span><textarea id="about-body" rows="12" maxlength="20000" aria-describedby="about-hint"></textarea></label><p id="about-hint" class="small muted">Абзацы разделяйте пустой строкой. **Жирный**, *курсив*, ## заголовок, списки и цитаты поддерживаются.</p><span id="about-count" class="small muted"></span></section><section class="panel about-preview"><div class="eyebrow">Предпросмотр</div><h2 id="about-preview-title"></h2><article id="about-preview-body" class="prose"></article></section></div><div class="about-savebar"><span id="about-state" role="status">Сохранено</span><button class="btn primary" id="about-save" type="submit">${icon('check')} Сохранить изменения</button></div></form>`;
  await SiteControl.mount();
  const title=$('#about-title'),body=$('#about-body'),state=$('#about-state');title.value=record.title;body.value=record.body;
  const preview=()=>{$('#about-preview-title').textContent=title.value;$('#about-preview-body').innerHTML=Markdown.render(body.value);$('#about-count').textContent=body.value.length.toLocaleString('ru-RU')+' / 20 000';};preview();let timer;
  $('#about-form').oninput=()=>{dirty=true;editVersion++;state.textContent='Есть несохранённые изменения';clearTimeout(timer);timer=setTimeout(preview,100)};
  $('#about-form').onsubmit=guard(async e=>{e.preventDefault();const version=editVersion,b=$('#about-save'),payload={p_title:title.value.trim(),p_body:body.value,p_revision:record.revision};if(!payload.p_title)throw new Error('Введите заголовок');busy(b,true);state.textContent='Сохраняем…';try{record=await DB.rpc('save_site_about',payload);if(!record?.revision)throw new Error('Сервер не подтвердил сохранение');dirty=editVersion!==version;state.textContent=dirty?'Есть новые несохранённые изменения':'Сохранено · '+time(record.updated_at);toast('Описание обновлено')}catch(err){state.textContent=err.message==='content_conflict'?'Описание изменено в другой вкладке. Скопируйте свой текст и обновите страницу.':'Не удалось сохранить. Ваш текст остался в редакторе.';if(err.message!=='content_conflict')toast(errorText(err))}finally{busy(b,false)}});
 }
 function loginScreen(message=''){
  document.body.classList.add('admin-logged-out');
  $('#main').innerHTML=`
    <div class="login-container">
      <section class="login-card panel">
        <div class="login-brand">
          <div class="login-logo-spark">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
            </svg>
          </div>
          <h1>Панель управления</h1>
          <p class="login-subtitle">Авторизация владельца и редакторов</p>
        </div>
        <form id="admin-login" class="login-form stack">
          <label class="form-field">
            <span>Электронная почта</span>
            <input name="email" type="email" autocomplete="username" required placeholder="admin@example.com" autofocus>
          </label>
          <label class="form-field">
            <span>Пароль</span>
            <input name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
          </label>
          <p id="login-message" class="login-alert" role="status" ${message?'':'hidden'}>${esc(message)}</p>
          <button class="btn primary btn-full-width" type="submit">Войти в панель</button>
        </form>
        <div class="login-footer">
          <a href="../index.html" class="back-to-site">← На сайт</a>
        </div>
      </section>
    </div>`;

  $('#admin-login').onsubmit=async e=>{
    e.preventDefault();
    const f=e.target,b=f.querySelector('button'),msgEl=$('#login-message');
    if(msgEl){msgEl.hidden=true;msgEl.textContent='';}
    busy(b,true,'Входим…');
    try{
      await DB.login(f.elements.email.value.trim(),f.elements.password.value);
      await start();
    }catch(err){
      if(msgEl){
        msgEl.textContent=errorText(err);
        msgEl.hidden=false;
      }
    }finally{
      busy(b,false);
    }
  };
 }
 
async function start(){shell();if(!DB.session){if(page==='help'){help();AdminStudio.enhance();return}loginScreen();return}try{profile=await DB.profile();if(profile.is_admin!==true||profile.blocked!==false){await DB.logout();loginScreen('У этого аккаунта нет прав администратора.');return}document.body.classList.remove('admin-logged-out');document.querySelectorAll('.account-chip').forEach(x=>x.textContent=profile.display_name||'Администратор');if(['schedule','overview','lectures','trash','structure','editor'].includes(page))await base();await ({schedule:()=>AdminSchedule.planner({lectures,subjects,weeks}),overview:()=>AdminKit.overview({lectures,subjects,weeks}),lectures:materials,trash:materials,structure,editor,visitors,stats,help,about}[page]||materials)();AdminStudio.enhance()}catch(e){$('#main').innerHTML=empty('Не удалось загрузить',(/extra_text|extra_images|lecture-extras/.test(e.message)?'Выполните SQL 07 из EXTRAS_UPDATE.html. Старые данные сохранятся.':/assignment_text/.test(e.message)?'Выполните SQL 06 из TASKS_UPDATE.html. Старые данные сохранятся.':/deleted_at|lecture_revisions|admin_material|schema cache/.test(e.message)?'Примените 05_admin_workspace.sql из ADMIN_UPDATE.html. Не запускайте заново 01_setup.sql.':errorText(e)),' <button class="btn" id="reload">Повторить</button>');$('#reload').onclick=()=>location.reload()}}

 document.querySelectorAll('[data-admin-logout]').forEach(b=>b.onclick=guard(async()=>{if(dirty&&!await confirmAction('Выйти без сохранения?','Несохранённые изменения будут потеряны.'))return;dirty=false;await DB.logout();loginScreen()}));
 window.addEventListener('session-lost',()=>{window.dispatchEvent(new Event('save-draft-now'));dirty=false;loginScreen('Сессия завершена. Войдите снова.')});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 try{await start()}catch(e){$('#app').innerHTML=`<main class="login-wrap"><p style="color:#ffb3b3">${esc(errorText(e))}</p><button class="btn" onclick="location.reload()">Повторить</button></main>`}
})();
