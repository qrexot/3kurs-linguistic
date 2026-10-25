'use strict';
window.AdminKit=(()=>{
 const e=App.esc;
 function download(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
 const dateStamp=()=>new Date().toLocaleDateString('en-CA');
 function csv(rows,subjects,weeks){const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const columns=['Название','Предмет','Неделя','Дата','Статус','Лекция','Транскрипция','Задание','Доп. текст','Фотографий','Изменено'];const data=rows.map(l=>[l.title,subjects.find(x=>x.id===l.subject_id)?.name||'',weeks.find(x=>x.id===l.week_id)?.title||'',l.lecture_date,l.deleted_at?'Корзина':l.published?'Опубликовано':'Черновик',l.lecture_text?.trim()?'Да':'Нет',l.full_text?.trim()?'Да':'Нет',l.assignment_text?.trim()?'Да':'Нет',l.extra_text?.trim()?'Да':'Нет',l.extra_images?.length||0,l.updated_at||'']);download('materials-table-'+dateStamp()+'.csv','\ufeff'+[columns,...data].map(r=>r.map(safe).join(';')).join('\r\n'),'text/csv;charset=utf-8');App.toast('Таблица скачана. В ней метаданные, без полных текстов.')}
 function exportSelected(rows,subjects,weeks){download('selected-materials-'+dateStamp()+'.json',JSON.stringify({format:'lecture-selection-v1',exported_at:new Date().toISOString(),subjects:subjects.filter(s=>rows.some(l=>l.subject_id===s.id)),weeks:weeks.filter(w=>rows.some(l=>l.week_id===w.id)),lectures:rows},null,2),'application/json');App.toast('Выбранные материалы скачаны. Файлы фотографий в выгрузку не входят.')}
 function duplicates(rows){const keys=new Map();for(const l of rows.filter(x=>!x.deleted_at)){const key=[l.subject_id,l.lecture_date,String(l.title||'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ')].join('|');if(!keys.has(key))keys.set(key,[]);keys.get(key).push(l.id)}return new Set([...keys.values()].filter(v=>v.length>1).flat())}
 function issues(l,subjects,weeks,dups){const result=[];if(!l.title?.trim())result.push('Нет названия');if(!l.lecture_text?.trim())result.push('Нет текста лекции');if(!l.full_text?.trim())result.push('Нет транскрипции');if(!subjects.some(x=>x.id===l.subject_id))result.push('Предмет не найден');const w=weeks.find(x=>x.id===l.week_id);if(!w)result.push('Неделя не найдена');else if(l.lecture_date&&((w.starts_on&&l.lecture_date<w.starts_on)||(w.ends_on&&l.lecture_date>w.ends_on)))result.push('Дата вне выбранной недели');if(dups?.has(l.id))result.push('Совпадают тема, предмет и дата');return result}
 function modal(title){const d=document.createElement('dialog');d.className='desk-dialog kit-dialog';d.setAttribute('aria-label',title);d.innerHTML='<header><h2>'+e(title)+'</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">×</button></header><div class="desk-dialog-body"></div>';document.body.append(d);const opener=document.activeElement;d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>{d.remove();opener?.focus()},{once:true});d.showModal();return d}
 function preview(l,subjects){const d=modal('Предпросмотр материала'),body=d.querySelector('.desk-dialog-body'),modes=[['lecture_text','Лекция'],['full_text','Транскрипция'],['assignment_text','Задание'],['extra_text','Доп. материал']];body.innerHTML='<div class="kit-preview-head"><span class="kit-kicker">'+e(subjects.find(x=>x.id===l.subject_id)?.name||'Без предмета')+' · '+e(App.date(l.lecture_date))+'</span><h3>'+e(l.title)+'</h3><p>'+e(l.summary||'')+'</p><a class="btn" href="editor.html?id='+encodeURIComponent(l.id)+'">Открыть редактор ↗</a></div><div class="kit-tabs" role="tablist" aria-label="Версия текста">'+modes.map(([key,label])=>'<button type="button" role="tab" id="kit-tab-'+key+'" data-version="'+key+'" aria-controls="kit-preview-text">'+label+'</button>').join('')+'</div><article class="prose kit-preview-text" id="kit-preview-text" role="tabpanel"></article><div class="kit-preview-bottom"><span id="kit-preview-count"></span><button type="button" class="btn" id="kit-download-text">Скачать .md</button></div>';let current='lecture_text';function draw(){const text=l[current]||'';body.querySelectorAll('[data-version]').forEach(b=>{const on=b.dataset.version===current;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1});const host=body.querySelector('#kit-preview-text');host.setAttribute('aria-labelledby','kit-tab-'+current);host.innerHTML=text.trim()?Markdown.render(text):'<p class="muted">Эта версия пока не заполнена.</p>';if(current==='extra_text'&&l.extra_images?.length){const gallery=document.createElement('div');host.append(gallery);Extras.gallery(gallery,l.extra_images)}body.querySelector('#kit-preview-count').textContent=text.length.toLocaleString('ru-RU')+' символов';body.querySelector('#kit-download-text').disabled=!text.trim()}
 body.querySelectorAll('[data-version]').forEach((b,i)=>{b.onclick=()=>{current=b.dataset.version;draw()};b.onkeydown=ev=>{if(!['ArrowRight','ArrowLeft'].includes(ev.key))return;ev.preventDefault();const key=modes[(i+(ev.key==='ArrowRight'?1:3))%4][0];body.querySelector('[data-version='+key+']').click();body.querySelector('[data-version='+key+']').focus()}});body.querySelector('#kit-download-text').onclick=()=>download('lecture-'+current+'-'+dateStamp()+'.md',l[current]||'','text/markdown;charset=utf-8');draw()}
 function audit(ctx){const live=ctx.lectures.filter(l=>!l.deleted_at),dups=duplicates(live),rows=live.map(l=>({l,issues:issues(l,ctx.subjects,ctx.weeks,dups)})).filter(x=>x.issues.length);const d=modal('Проверка материалов'),body=d.querySelector('.desk-dialog-body');body.innerHTML='<p class="kit-audit-intro">Проверены '+live.length+' материалов. '+(rows.length?'Внимания требуют: '+rows.length+'.':'Структурных недочётов не найдено.')+' Это подсказки: проверка не оценивает содержание и ничего не меняет.</p><label class="form-field"><span>Показать</span><select id="kit-audit-filter"><option value="">Все замечания</option>'+[...new Set(rows.flatMap(x=>x.issues))].map(v=>'<option>'+e(v)+'</option>').join('')+'</select></label><div class="kit-audit-list"></div>';function draw(){const filter=body.querySelector('select').value;body.querySelector('.kit-audit-list').innerHTML=rows.filter(x=>!filter||x.issues.includes(filter)).map(({l,issues})=>'<div class="kit-audit-row"><div><a href="editor.html?id='+encodeURIComponent(l.id)+'">'+e(l.title||'Без названия')+'</a><p>'+issues.map(e).join(' · ')+'</p></div><button type="button" class="btn" data-audit-preview="'+e(l.id)+'">Посмотреть</button></div>').join('')||'<p class="muted">По этому условию замечаний нет.</p>';body.querySelectorAll('[data-audit-preview]').forEach(b=>b.onclick=()=>preview(live.find(l=>l.id===b.dataset.auditPreview),ctx.subjects))}body.querySelector('select').onchange=draw;draw()}
 function filterLink(status,subject=''){return 'index.html?status='+encodeURIComponent(status)+'&subject='+encodeURIComponent(subject)}
 async function overview(ctx){
  const live=ctx.lectures.filter(l=>!l.deleted_at),published=live.filter(l=>l.published),drafts=live.filter(l=>!l.published),dups=duplicates(live),needs=live.filter(l=>issues(l,ctx.subjects,ctx.weeks,dups).length),today=dateStamp();
  const future=live.filter(l=>l.lecture_date>=today).sort((a,b)=>a.lecture_date.localeCompare(b.lecture_date)).slice(0,5),recent=[...live].sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))).slice(0,6);

  document.querySelector('#main').innerHTML=`<div class="page-head spread kit-overview-head">
    <div>
      <h1>Обзор</h1>
      <p class="muted">Сводка материалов, статус сайта и расписание занятий</p>
    </div>
    <a class="btn primary" href="editor.html">${App.icon('plus')} Новая лекция</a>
  </div>
  <div class="kit-overview-metrics">
    <a class="kit-metric-card" href="${filterLink('all')}">
      <span class="kit-metric-label">Материалов</span>
      <strong class="kit-metric-val">${live.length}</strong>
      <span class="kit-metric-arrow">Список ↗</span>
    </a>
    <a class="kit-metric-card" href="${filterLink('published')}">
      <span class="kit-metric-label">Опубликовано</span>
      <strong class="kit-metric-val">${published.length}</strong>
      <span class="kit-metric-arrow">Список ↗</span>
    </a>
    <a class="kit-metric-card" href="${filterLink('draft')}">
      <span class="kit-metric-label">Черновиков</span>
      <strong class="kit-metric-val">${drafts.length}</strong>
      <span class="kit-metric-arrow">Список ↗</span>
    </a>
    <a class="kit-metric-card ${needs.length ? 'has-issues' : ''}" href="${filterLink('issues')}">
      <span class="kit-metric-label">Требуют внимания</span>
      <strong class="kit-metric-val">${needs.length}</strong>
      <span class="kit-metric-arrow">Список ↗</span>
    </a>
  </div>
  <div class="kit-overview-columns">
    <div class="kit-col-main">
      <section class="panel kit-section">
        <header class="spread align-center">
          <div><h2>Недавно изменены</h2></div>
          <a class="btn ghost btn-sm" href="index.html?sort=updated">Все материалы ↗</a>
        </header>
        <div class="kit-recent-list">
          ${recent.length ? recent.map(l=>`
            <div class="kit-recent-row">
              <div class="kit-recent-info">
                <a class="kit-recent-title" href="editor.html?id=${encodeURIComponent(l.id)}">${e(l.title)}</a>
                <div class="kit-recent-meta">
                  <span class="subject-chip-sm">${e(ctx.subjects.find(s=>s.id===l.subject_id)?.name||'Без предмета')}</span>
                  <span class="dot-sep">·</span>
                  <span>${e(App.date(l.lecture_date))}</span>
                  <span class="lecture-status-pill ${l.published?'published':'draft'}">${l.published?'● Опубликовано':'○ Черновик'}</span>
                </div>
              </div>
              <div class="kit-recent-actions">
                <button class="btn ghost btn-sm" data-kit-preview="${e(l.id)}" type="button">Смотреть</button>
                <a class="btn ghost btn-sm" href="editor.html?id=${encodeURIComponent(l.id)}">Изменить</a>
              </div>
            </div>
          `).join('') : '<p class="muted">Добавьте первую лекцию.</p>'}
        </div>
      </section>
      <section class="panel kit-section">
        <header><h2>Распределение по предметам</h2></header>
        <div class="kit-subject-grid">
          ${ctx.subjects.map(s=>{
            const rows=live.filter(l=>l.subject_id===s.id),n=rows.filter(l=>l.published).length,p=rows.length?Math.round(n/rows.length*100):0;
            return `<a class="kit-subject-card" href="${filterLink('all',s.id)}">
              <div class="kit-subject-top">
                <strong>${e(s.name)}</strong>
                <span class="kit-subject-stat">${n} из ${rows.length}</span>
              </div>
              <div class="kit-track"><i style="width:${p}%"></i></div>
            </a>`;
          }).join('')}
        </div>
      </section>
      <section class="panel kit-section">
        <header class="spread align-center">
          <div><h2>План занятий</h2></div>
          <a class="btn ghost btn-sm" href="schedule.html">Расписание ↗</a>
        </header>
        <div class="kit-planned-list">
          ${future.length ? future.map(l=>`
            <a class="kit-planned-row" href="editor.html?id=${encodeURIComponent(l.id)}">
              <time class="kit-planned-date">${e(App.date(l.lecture_date))}</time>
              <div class="kit-planned-body">
                <strong>${e(l.title)}</strong>
                <div class="kit-planned-sub">
                  <span>${e(ctx.subjects.find(s=>s.id===l.subject_id)?.name||'Без предмета')}</span>
                  <span class="dot-sep">·</span>
                  <span class="status-chip ${l.published?'published':'draft'}">${l.published?'Опубликовано':'Черновик'}</span>
                </div>
              </div>
              <span class="kit-arrow">↗</span>
            </a>
          `).join('') : '<p class="muted">Нет материалов с сегодняшней или будущей датой.</p>'}
        </div>
      </section>
    </div>
    <div class="kit-col-side">
      <section class="panel kit-section">
        <header class="spread align-center">
          <div><h2>Сайт и доступ</h2></div>
          <a class="btn ghost btn-sm" href="about.html">Настройки</a>
        </header>
        <div id="kit-site-status" role="status" class="kit-site-card">Проверяем состояние сайта…</div>
        <a class="kit-request-card" href="visitors.html">
          <div class="kit-request-info">
            <span>Заявки на доступ</span>
            <small>Посетители в очереди</small>
          </div>
          <b id="kit-pending" class="kit-pending-badge">…</b>
        </a>
        <div class="kit-shortcuts-clean">
          <span class="kit-shortcuts-label">Быстрые ссылки</span>
          <div class="kit-shortcuts-links">
            <a href="help.html" class="kit-shortcut-pill">${App.icon('book')} <span>Оформление</span></a>
            <a href="structure.html" class="kit-shortcut-pill">${App.icon('grid')} <span>Структура</span></a>
            <a href="trash.html" class="kit-shortcut-pill">${App.icon('close')} <span>Корзина</span></a>
          </div>
        </div>
      </section>
      <section class="panel kit-section">
        <header class="spread align-center">
          <div><h2>Качество материалов</h2></div>
          <button class="btn btn-sm" id="kit-audit" type="button">Проверить всё</button>
        </header>
        <div class="kit-health-clean">
          <a class="kit-health-row" href="${filterLink('no-lecture')}">
            <span>Без текста лекции</span>
            <b class="count-pill ${live.filter(l=>!l.lecture_text?.trim()).length?'warn':''}">${live.filter(l=>!l.lecture_text?.trim()).length}</b>
          </a>
          <a class="kit-health-row" href="${filterLink('no-full')}">
            <span>Без транскрипции</span>
            <b class="count-pill ${live.filter(l=>!l.full_text?.trim()).length?'warn':''}">${live.filter(l=>!l.full_text?.trim()).length}</b>
          </a>
          <a class="kit-health-row" href="${filterLink('duplicates')}">
            <span>Совпадающие материалы</span>
            <b class="count-pill ${dups.size?'warn':''}">${dups.size}</b>
          </a>
        </div>
        <p class="kit-footnote">Совпадение названия, предмета и даты — повод проверить, а не ошибка.</p>
      </section>
    </div>
  </div>`;

  document.querySelector('#kit-audit').onclick=()=>audit(ctx);
  document.querySelectorAll('[data-kit-preview]').forEach(b=>b.onclick=()=>preview(live.find(l=>l.id===b.dataset.kitPreview),ctx.subjects));
  const result=await Promise.allSettled([DB.rpc('site_status',{}),DB.rpc('admin_access_requests',{p_status:'pending',p_search:'',p_limit:1,p_offset:0})]);
  const status=document.querySelector('#kit-site-status');
  if(result[0].status==='fulfilled'&&typeof result[0].value?.paused==='boolean'){
    const paused=result[0].value.paused;
    status.innerHTML='<div class="kit-site-indicator '+(paused?'paused':'')+'"><i></i><div><strong>'+(paused?'Сайт временно отключён':'Сайт открыт')+'</strong><span>'+(paused?'Посетители видят экран ожидания.':'Одобренные посетители могут читать лекции.')+'</span></div></div>';
  }else status.textContent='Не удалось проверить состояние. Откройте настройки сайта.';
  document.querySelector('#kit-pending').textContent=result[1].status==='fulfilled'?String(result[1].value?.pending??result[1].value?.total??'—'):'—';
}
 return {csv,exportSelected,duplicates,issues,preview,audit,overview};
})();
