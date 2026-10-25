'use strict';
window.FormatTools=(()=>{
 const e=App.esc,items=[];
 const add=(id,name,group,hint,make)=>items.push({id,name,group,hint,make});
 const wrap=(a,b=a)=>(t)=>a+(t||'Текст')+b;

 add('bold','Жирный','Текст','**ключевое понятие**',wrap('**'));
 add('italic','Курсив','Текст','*пример или термин*',wrap('*'));
 add('highlight','Маркер','Текст','==важный фрагмент==',wrap('=='));
 add('underline','Подчёркивание','Текст','++подчёркнутый текст++',wrap('++'));
 add('strike','Зачёркивание','Текст','~~устаревший вариант~~',wrap('~~'));
 add('sup','Верхний индекс','Текст','x^2^',t=>t?'^'+t+'^':'x^2^');
 add('sub','Нижний индекс','Текст','H~2~O',t=>t?'~'+t+'~':'H~2~O');
 add('code','Строка кода','Текст','`термин или команда`',wrap('`'));
 add('key','Клавиша','Текст','{{Ctrl+C}}',t=>'{{'+(t||'Ctrl+C')+'}}');
 add('tag','Метка','Текст','{tag:Термин}',t=>'{tag:'+(t||'Термин')+'}');
 add('link','Ссылка','Текст','Текст со ссылкой на источник',t=>'['+(t||'Источник')+'](https://example.com)');

 for(let n=1;n<=4;n++)add('heading'+n,['Раздел','Подраздел','Малый заголовок','Подпункт'][n-1],'Структура','#'.repeat(n)+' Заголовок',t=>'\n\n'+'#'.repeat(n)+' '+(t||'Заголовок')+'\n\n');
 add('quote','Цитата','Структура','Отдельный фрагмент речи',t=>'\n\n'+(t||'Цитата из лекции.').split('\n').map(l=>'> '+l).join('\n')+'\n\n');
 add('divider','Разделитель','Структура','Тонкая линия между частями',()=> '\n\n---\n\n');

 add('list','Список','Списки','Пункты без нумерации',t=>'\n\n'+(t||'Первый пункт\nВторой пункт').split('\n').map(l=>'- '+l).join('\n')+'\n\n');
 add('ordered','Нумерация','Списки','Последовательность действий',t=>'\n\n'+(t||'Первый шаг\nВторой шаг').split('\n').map((l,i)=>(i+1)+'. '+l).join('\n')+'\n\n');
 add('nested','Вложенный список','Списки','Подпункты с отступом в два пробела',t=>'\n\n- '+(t||'Основной пункт')+'\n  - Пояснение\n  - Ещё одно пояснение\n- Следующий пункт\n\n');
 add('checklist','Чек-лист','Списки','Отметки задаёт автор: [ ] и [x]',t=>'\n\n- [ ] '+(t||'Что нужно подготовить')+'\n- [x] Что уже разобрали\n\n');
 add('glossary','Словарь терминов','Структура','Термин и его определение',t=>'\n\n'+(t||'Термин')+'\n: Определение термина.\nДругой термин\n: Ещё одно определение.\n\n');

 const hints={definition:'Термин и точное определение',important:'Главная мысль, которую нельзя пропустить',example:'Пример из материала',question:'Только явно названные вопросы к экзамену',note:'Короткое пояснение на полях',summary:'Выводы по разделу',rule:'Правило и условия применения',warning:'Ограничение или важная оговорка',tip:'Практический совет',mistake:'Типичная ошибка и её исправление',answer:'Ответ на поставленный вопрос',task:'Конкретное задание преподавателя',remember:'Что стоит выучить',translation:'Оригинал и перевод',pronunciation:'Произношение и транскрипция',source:'Откуда взята информация',formula:'Формула обычным текстом, без LaTeX',compare:'Сходства и различия',steps:'Порядок действий',timeline:'События по времени',dialogue:'Реплики собеседников',terms:'Ключевая лексика',verse:'Текст с сохранением строк'};
 const defaults={steps:'1. Первый шаг.\n2. Второй шаг.\n3. Проверка результата.',timeline:'- **Первая дата** — событие.\n- **Следующая дата** — изменение.',dialogue:'**Собеседник 1:** Реплика.\n**Собеседник 2:** Ответ.',translation:'**Оригинал:** Фраза из материала.\n**Перевод:** Её перевод.',terms:'Термин\n: Его значение.\nДругой термин\n: Его значение.',verse:'Первая строка.\nВторая строка.\nТретья строка.',formula:'x^2^ + y^2^ = z^2^',compare:'**Общее:** Что объединяет понятия.\n**Различие:** Чем они отличаются.'};

 for(const [id,name] of Object.entries(Markdown.labels))add(id,name,'Блоки',hints[id],t=>'\n\n:::'+id+'\n'+(t||defaults[id]||hints[id]+'.')+'\n:::\n\n');

 add('details','Раскрывающееся пояснение','Особое','Читатель открывает подробности нажатием',t=>'\n\n:::details Подробнее\n'+(t||'Пояснение, пример или ответ для самопроверки.')+'\n:::\n\n');
 add('columns','Два варианта рядом','Особое','На телефоне блоки идут друг под другом',t=>'\n\n:::columns Сравнение\n**Первый вариант**\n'+(t||'Его особенности.')+'\n|||\n**Второй вариант**\nЕго особенности.\n:::\n\n');
 add('three-columns','Три варианта рядом','Особое','Три компактных блока сравнения',()=> '\n\n:::columns Сравнение\n**Первый**\nОписание.\n|||\n**Второй**\nОписание.\n|||\n**Третий**\nОписание.\n:::\n\n');
 add('table','Таблица','Особое','Сопоставление терминов, правил и примеров',t=>'\n\n| Понятие | Пояснение |\n| --- | --- |\n| '+(t||'Термин')+' | Определение |\n| Другой термин | Пример |\n\n');
 add('table-align','Таблица с выравниванием','Особое','Слева, по центру и справа',()=> '\n\n| Понятие | Категория | Количество |\n| :--- | :---: | ---: |\n| Пример | A | 2 |\n\n');
 add('fence','Блок кода','Особое','Код сохраняет отступы и символы',t=>'\n\n```text\n'+(t||'Текст или код с отступами')+'\n```\n\n');
 add('footnote','Сноска','Особое','Пояснение в конце текста и обратная ссылка',t=>(t||'Фрагмент')+'[^note]\n\n[^note]: Пояснение к фрагменту.\n');

 add('lesson-template','План лекции','Шаблоны','Понятия → объяснение → пример → итог',()=> '\n\n# Тема\n\n:::definition\nКлючевое понятие и его определение.\n:::\n\n## Разбор\nОсновной материал.\n\n:::example\nПример из исходного текста.\n:::\n\n:::summary\n- Главная мысль.\n- Что важно запомнить.\n:::\n\n');
 add('self-check','Самопроверка','Шаблоны','Вопрос с раскрывающимся ответом',t=>'\n\n:::note Самопроверка\n'+(t||'Вопрос по материалу.')+'\n\n:::details Показать ответ\nОтвет из лекции.\n:::\n:::\n\n');
 add('word-card','Карточка слова','Шаблоны','Слово, произношение, перевод и пример',t=>'\n\n## '+(t||'Слово')+'\n\n:::pronunciation\nТранскрипция из материала.\n:::\n\n:::translation\nПеревод из материала.\n:::\n\n:::example\nПример употребления.\n:::\n\n');
 add('homework','Задание к паре','Шаблоны','Коротко: действие и срок, если он указан',()=> '\n\n:::task К следующей паре\n- [ ] Задание, которое назвал преподаватель.\n- [ ] Страницы или упражнения, если они указаны.\n:::\n\n');
 add('contrast','Ошибка и исправление','Шаблоны','Два блока с разбором',t=>'\n\n:::mistake\n'+(t||'Ошибочный вариант из лекции.')+'\n:::\n\n:::rule Как правильно\nИсправление и объяснение.\n:::\n\n');

 const prompt=`Ты — эксперт-методист и редактор учебных материалов. Твоя задача — профессионально оформить предоставленный учебный текст для студенческого сайта в стиле Claude Dark.

ПРАВИЛА И СТРУКТУРА:
1. Язык и точность: Русский язык, сохраняя термины, цитаты и примеры на языке оригинала. Категорически запрещено выдумывать факты, задания или примеры, которых не было в источнике.
2. В режиме «Лекция»: структурируй материал с понятной иерархией заголовков (##, ###), ключевыми акцентами, определениями и наглядными примерами.
3. В режиме «Полная транскрипция»: сохраняй реплики всех участников в хронологическом порядке без сокращений.
4. В режиме «Задание»: лаконично выдели конкретные задачи, номера страниц и сроки к следующей паре. Если задание не названо, напиши: «В записи задание к следующей паре не указано».
5. Формат ответа: возвращай ТОЛЬКО готовую Markdown-разметку, без вступительных или заключительных слов, и без внешнего обрамления в тройные кавычки.

ПОДДЕРЖИВАЕМЫЕ ЭЛЕМЕНТЫ ОФОРМЛЕНИЯ:
- Заголовки: ## Основной раздел, ### Подраздел, #### Пункт
- Выделения: **жирный**, *курсив*, ==маркер==, ++подчёркивание++, ~~зачёркивание~~, x^2^, H~2~O, \`код\`, {{Ctrl+C}}, {tag:Метка}
- Списки и чек-листы: - пункт, 1. шаг, - [ ] не сделано, - [x] сделано
- Словарь: Термин \\n : Определение
- Таблицы: | Колонка 1 | Колонка 2 | с выравниванием :---, :---:, ---:
- Смысловые блоки (Callouts): :::тип или :::тип Заголовок и закрываются :::
  Типы: definition, important, remember, example, rule, warning, tip, mistake, question, answer, task, summary, translation, pronunciation, dialogue, steps, timeline, terms, formula, verse, note, source
- Спойлеры: :::details Заголовок спойлера ... :::
- Сравнения: :::columns Заголовок ... ||| ... :::
- Блоки кода: \`\`\`язык ... \`\`\`
- Сноски: [^1] и [^1]: пояснение в конце документа

Не используй HTML-теги, картинки ![]() и формулы LaTeX.
Мой режим: [Лекция / Полная транскрипция / Задание].
Текст для обработки:`;

 const button=id=>{const x=items.find(x=>x.id===id);return '<button type="button" data-format="'+id+'" title="'+e(x.hint)+'">'+e(x.name)+'</button>'};
 function toolbar(){return '<div class="editor-bar format-toolbar" aria-label="Оформление текста">'+['bold','italic','highlight','heading2','list','important'].map(button).join('')+'<button type="button" class="format-more" id="format-open" aria-haspopup="dialog">Все варианты <span>'+items.length+'</span></button></div>'}

 async function copy(text){
  try{await navigator.clipboard.writeText(text);App.toast('Скопировано в буфер')}
  catch{
   const box=document.createElement('textarea');box.value=text;box.style.cssText='position:fixed;left:-9999px';document.body.append(box);box.select();
   const ok=document.execCommand('copy');box.remove();
   if(ok)App.toast('Скопировано в буфер');
   else downloadFile('prompt.txt',text);
  }
 }

 function downloadFile(name,text,type='text/plain;charset=utf-8'){
  try{
   const blob=new Blob([text],{type});
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');
   a.href=url;
   a.download=name;
   document.body.append(a);
   a.click();
   a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),2000);
   App.toast('Файл «'+name+'» скачан');
  }catch(err){
   App.toast('Ошибка скачивания файла');
  }
 }

 async function fetchOrFallback(url, fallback){
  try{
   const res=await fetch(url);
   if(res.ok)return await res.text();
  }catch{}
  return fallback;
 }

 function attach(source,onChange){
  let selection=null;
  function insert(id){const x=items.find(x=>x.id===id);if(!x)return;const a=selection?.[0]??source.selectionStart,z=selection?.[1]??source.selectionEnd,t=source.value.slice(a,z);let value=x.make(t);
   if(id==='footnote'){let n=1;while(source.value.includes('[^note'+n+']'))n++;value=value.replaceAll('[^note]','[^note'+n+']')}
   if(source.value.length-(z-a)+value.length>500000){App.toast('В тексте может быть до 500 000 символов');return}
   source.setRangeText(value,a,z,'end');selection=null;source.focus();onChange();
  }
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>insert(b.dataset.format));
  document.querySelector('#format-open').onclick=()=>{
   selection=[source.selectionStart,source.selectionEnd];
   const dialog=document.createElement('dialog');dialog.className='format-dialog';dialog.setAttribute('aria-labelledby','format-title');
   dialog.innerHTML='<div class="format-dialog-head"><div><div class="format-eyebrow">Редактор текста</div><h2 id="format-title">Выберите оформление</h2><p>Выделенный текст попадёт в выбранный блок.</p></div><button type="button" class="icon-btn" data-close aria-label="Закрыть">×</button></div><label class="format-search"><span>Найти вариант</span><input type="search" placeholder="Например, сноска или таблица" autocomplete="off"></label><div class="format-categories" aria-label="Категория"></div><div class="format-options"></div><div class="format-dialog-foot"><span>'+items.length+' вариантов</span> · <button type="button" class="format-foot-btn" id="dialog-copy-prompt">Копировать промпт ИИ</button> · <a href="help.html" target="_blank" rel="noopener">Инструкции и файлы для ИИ ↗</a></div>';
   document.body.append(dialog);let inserted=false,group='Все';const categories=['Все',...new Set(items.map(x=>x.group))];const input=dialog.querySelector('input'),opts=dialog.querySelector('.format-options'),tabs=dialog.querySelector('.format-categories');
   dialog.querySelector('#dialog-copy-prompt').onclick=()=>copy(prompt);
   function draw(){
    tabs.innerHTML=categories.map(c=>'<button type="button" aria-pressed="'+(c===group)+'" data-category="'+c+'">'+c+'</button>').join('');
    tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{group=b.dataset.category;draw();tabs.querySelector('[aria-pressed="true"]').focus()});
    const q=input.value.trim().toLocaleLowerCase('ru');
    const found=items.filter(x=>(group==='Все'||x.group===group)&&[x.name,x.hint,x.id].join(' ').toLocaleLowerCase('ru').includes(q));
    opts.innerHTML=found.map(x=>'<button type="button" class="format-option" data-id="'+x.id+'"><span class="format-option-group">'+x.group+'</span><strong>'+e(x.name)+'</strong><span>'+e(x.hint)+'</span></button>').join('')||'<p class="format-empty" role="status">Ничего не найдено. Попробуйте другое слово.</p>';
    opts.querySelectorAll('button').forEach(b=>b.onclick=()=>{inserted=true;insert(b.dataset.id);dialog.close()});
   }
   input.oninput=draw;dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.addEventListener('click',ev=>{if(ev.target===dialog){const b=dialog.getBoundingClientRect();if(ev.clientX<b.left||ev.clientX>b.right||ev.clientY<b.top||ev.clientY>b.bottom)dialog.close()}});
   dialog.addEventListener('close',()=>{dialog.remove();if(!inserted)document.querySelector('#format-open')?.focus();selection=null},{once:true});
   draw();dialog.showModal();input.focus();
  };
  source.addEventListener('keydown',ev=>{if(!(ev.ctrlKey||ev.metaKey)||ev.altKey||ev.shiftKey)return;const id={b:'bold',i:'italic',u:'underline'}[ev.key.toLowerCase()];if(id){ev.preventDefault();insert(id)}});
 }

 function help(root){
  root.innerHTML=`<div class="page-head">
   <div class="format-eyebrow">${items.length} способов оформить материал</div>
   <h1>Оформление текста</h1>
   <p>Выберите приём, посмотрите результат, скопируйте разметку или скачайте готовые инструкции для нейросети.</p>
  </div>
  <section class="panel format-prompt">
   <div class="format-prompt-head">
    <div class="format-eyebrow">Нейросети и искусственный интеллект</div>
    <h2>Инструменты для оформления через ИИ</h2>
    <p>Используйте Claude, ChatGPT или DeepSeek. Скачайте системный промпт, полную инструкцию по разметке или эталонный конспект для загрузки в проект или контекст.</p>
   </div>
   <div class="format-prompt-actions">
    <button class="btn primary" type="button" id="copy-prompt">Копировать промпт</button>
    <button class="btn" type="button" id="download-prompt">Скачать промпт (.txt)</button>
    <button class="btn" type="button" id="download-instructions">Скачать инструкцию (.md)</button>
    <button class="btn" type="button" id="download-example">Скачать эталон (.md)</button>
   </div>
   <details class="format-prompt-details">
    <summary>Посмотреть текст системного промпта</summary>
    <p class="format-prompt-text">${e(prompt)}</p>
   </details>
  </section>
  <label class="format-search">
   <span>Поиск по оформлению</span>
   <input id="format-help-search" type="search" placeholder="Таблица, определение, сноска…">
  </label>
  <div class="format-categories" id="format-help-categories"></div>
  <p class="small muted">Чек-листы показывают отметки автора. Формулы — обычный текст с индексами. В таблицах символ | пишется как \\|. Сноски размещайте в конце текста, вне блоков.</p>
  <div id="format-examples"></div>`;

  root.querySelector('#copy-prompt').onclick=()=>copy(prompt);

  root.querySelector('#download-prompt').onclick=async()=>{
   const text=await fetchOrFallback('PROMPT_FOR_AI.txt', prompt);
   downloadFile('PROMPT_FOR_AI.txt', text, 'text/plain;charset=utf-8');
  };

  root.querySelector('#download-instructions').onclick=async()=>{
   const text=await fetchOrFallback('INSTRUCTIONS_FOR_AI.md', prompt);
   downloadFile('INSTRUCTIONS_FOR_AI.md', text, 'text/markdown;charset=utf-8');
  };

  root.querySelector('#download-example').onclick=async()=>{
   const text=await fetchOrFallback('EXAMPLE.md', '# Тема лекции\n\n:::definition\nОпределение понятия.\n:::\n');
   downloadFile('EXAMPLE_LECTURE.md', text, 'text/markdown;charset=utf-8');
  };

  let group='Все';
  const cats=root.querySelector('#format-help-categories'),search=root.querySelector('#format-help-search'),examples=root.querySelector('#format-examples');
  function draw(){
   cats.innerHTML=['Все',...new Set(items.map(x=>x.group))].map(c=>'<button type="button" data-category="'+c+'" aria-pressed="'+(c===group)+'">'+c+'</button>').join('');
   cats.querySelectorAll('button').forEach(b=>b.onclick=()=>{group=b.dataset.category;draw();cats.querySelector('[aria-pressed="true"]').focus()});
   const q=search.value.trim().toLowerCase(),found=items.filter(x=>(group==='Все'||x.group===group)&&(x.name+' '+x.hint+' '+x.id).toLowerCase().includes(q));
   examples.innerHTML=found.map(x=>'<section class="panel format-example"><div class="format-example-head"><div><span class="format-eyebrow">'+x.group+'</span><h2>'+e(x.name)+'</h2><p>'+e(x.hint)+'</p></div><button type="button" class="btn" data-copy="'+x.id+'">Копировать</button></div><div class="format-example-grid"><pre class="help-code">'+e(x.make('').trim())+'</pre><div class="prose">'+Markdown.render(x.make(''))+'</div></div></section>').join('')||'<p role="status">Вариантов не найдено.</p>';
   examples.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(items.find(x=>x.id===b.dataset.copy).make('').trim()));
  }
  search.oninput=draw;
  draw();
 }

 return {toolbar,attach,help,prompt,items,copy,downloadFile};
})();
