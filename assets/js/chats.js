'use strict';
window.Chats = (() => {
  const {esc, icon} = App;
  const errors = {
    handle_taken: 'Этот юзернейм уже занят. Попробуйте другой.',
    handle_fixed: 'За аккаунтом уже закреплён юзернейм. Откройте чаты заново.',
    invalid_code: 'Проверьте юзернейм и код восстановления.',
    invalid_handle: 'Начните с латинской буквы. Можно использовать цифры и нижнее подчёркивание.',
    unknown_peer: 'Профиль с таким юзернеймом не найден.',
    self_chat: 'Введите юзернейм собеседника.',
    invalid_message: 'Введите от 1 до 2000 символов.',
    slow_down: 'Отправлено много сообщений подряд. Подождите полминуты.'
  };
  const explain = error => errors[error.message] || App.errorText(error);
  const clock = new Intl.DateTimeFormat('ru', {hour:'2-digit', minute:'2-digit'});
  const calendar = new Intl.DateTimeFormat('ru', {day:'numeric', month:'long', year:'numeric'});
  function avatar(handle) {
    if (!handle) return '<span class="chat-avatar channel" aria-hidden="true">#</span>';
    const tones = ['sand','sage','iris','blue'];
    const tone = tones[Array.from(handle).reduce((sum,c) => sum + c.charCodeAt(0),0) % tones.length];
    return `<span class="chat-avatar ${tone}" aria-hidden="true">${esc(handle.slice(0,2).toUpperCase())}</span>`;
  }
  let dispose;

  function close() {
    dispose?.();
    dispose = null;
  }

  async function open(main) {
    close();
    document.title = 'Чаты · Материалы занятий';
    const root = document.createElement('section');
    root.className = 'chats';
    root.innerHTML = '<h1>Чаты</h1><p role="status">Открываем переписки…</p>';
    main.replaceChildren(root);
    const $ = selector => root.querySelector(selector);
    let active = true, timer, me, room, threads = [], lastList = '';
    const drafts = new Map();
    const phone = matchMedia('(max-width:720px), (max-width:960px) and (max-height:540px) and (pointer:coarse)');
    const viewport = window.visualViewport;
    const host = main.closest('#app');
    const chatRoute = location.pathname + location.search;
    function fitViewport() {
      if (phone.matches && viewport && viewport.scale === 1) {
        host.style.setProperty('--chat-visible-height', viewport.height + 'px');
        host.style.setProperty('--chat-visible-top', viewport.offsetTop + 'px');
      } else {
        host.style.removeProperty('--chat-visible-height');
        host.style.removeProperty('--chat-visible-top');
      }
    }
    function showList() {
      root.dataset.pane = 'list';
      $('.chat-row[aria-current=true]')?.focus({preventScroll:true});
    }
    function restorePane() {
      if (!room || !phone.matches || location.pathname + location.search !== chatRoute) return;
      const peer = history.state?.chatPeer;
      if (typeof peer === 'string') select(peer || null, null, false);
      else showList();
    }
    function backToList() {
      if (typeof history.state?.chatPeer === 'string') history.back();
      else showList();
    }
    const visible = () => { if (!document.hidden && room) sync(room); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    dispose = () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('popstate', restorePane);
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
      phone.removeEventListener('change', fitViewport);
      host.style.removeProperty('--chat-visible-height');
      host.style.removeProperty('--chat-visible-top');
      root.remove();
    };

    function onboarding(restore = false, handle = '') {
      const secret = crypto.randomUUID().replaceAll('-', '');
      root.dataset.screen = 'account';
      root.innerHTML = `<div class="chat-welcome">
        <header class="chat-intro"><span class="chat-emblem">${icon('chat')}</span><h1>${restore ? 'Вернуться в чаты' : 'Профиль для чатов'}</h1>
        <p>${restore ? 'Введите данные своего профиля, чтобы открыть переписки.' : 'Выберите имя для общего чата и личных сообщений.'}</p></header>
        <form class="chat-signup">
          <div class="chat-field"><label for="chat-handle">Юзернейм</label>
            <div class="chat-control"><span aria-hidden="true">@</span><input id="chat-handle" name="handle" required minlength="3" maxlength="20" pattern="[A-Za-z][A-Za-z0-9_]{2,19}" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ваше имя латиницей" value="${esc(handle)}" aria-describedby="chat-name-help"></div>
            <p class="chat-hint" id="chat-name-help">${restore ? 'Тот же юзернейм, что и при регистрации.' : 'От 3 до 20 символов: латинские буквы, цифры и _. Имя выбирается один раз.'}</p>
          </div>
          ${restore ? `<div class="chat-field"><label for="chat-key">Код восстановления</label><div class="chat-control"><input id="chat-key" type="password" name="secret" required autocomplete="off" spellcheck="false" placeholder="Вставьте сохранённый код"></div></div>` :
          `<div class="chat-keybox"><div class="chat-key-title">${icon('lock')}<label for="chat-key">Код восстановления</label></div>
          <p class="chat-hint">Сохраните для входа с другого устройства.</p>
          <div class="chat-keyrow"><input id="chat-key" name="secret" type="password" readonly value="${secret}" autocomplete="off">
            <button type="button" class="chat-tool" data-reveal aria-label="Показать код" title="Показать код" aria-pressed="false">Показать</button>
            <button type="button" class="chat-copy" data-copy>Копировать</button></div>
          <span class="chat-hint" role="status" data-copy-status></span>
          <label class="chat-check"><input type="checkbox" required> Я сохранил код</label></div>`}
          <p class="chat-error" role="alert"></p><button class="chat-primary" type="submit">${restore ? 'Восстановить доступ' : 'Создать профиль'} ${icon('arrow')}</button>
          <button type="button" class="chat-link" data-switch>${restore ? 'Создать новый профиль' : 'У меня уже есть профиль'}</button>
        </form></div>`;
      const form = $('form');
      $('[data-switch]').onclick = () => onboarding(!restore, form.elements.handle.value);
      if (!restore) {
        const field = form.elements.secret, reveal = $('[data-reveal]');
        function show(showCode) {
          field.type = showCode ? 'text' : 'password';
          reveal.textContent = showCode ? 'Скрыть' : 'Показать';
          reveal.setAttribute('aria-pressed',String(showCode));
          reveal.setAttribute('aria-label',reveal.title = reveal.textContent + ' код');
        }
        reveal.onclick = () => show(field.type === 'password');
        $('[data-copy]').onclick = async () => {
          const status = $('[data-copy-status]');
          try {
            await navigator.clipboard.writeText(field.value);
            status.textContent = 'Код скопирован';
          } catch {
            show(true); field.focus(); field.select();
            status.textContent = 'Код выделен. Скопируйте его вручную.';
          }
        };
      }
      form.onsubmit = async event => {
        event.preventDefault();
        const button = form.querySelector('[type=submit]');
        button.disabled = true;
        form.querySelector('[data-switch]').disabled = true;
        try {
          me = await DB.rpc('chat_join', {p_handle:form.elements.handle.value.trim(), p_code:form.elements.secret.value.trim().toLowerCase(), p_restore:restore});
          if (active) workspace();
        } catch (e) { form.querySelector('[role=alert]').textContent = explain(e); }
        finally { button.disabled = false; form.querySelector('[data-switch]').disabled = false; }
      };
    }

    function workspace() {
      root.dataset.screen = 'inbox';
      root.innerHTML = `<div class="chat-work"><aside class="chat-side" aria-label="Список чатов">
        <div class="chat-sidehead"><h1>Чаты</h1><form class="chat-search">${icon('search')}
        <label class="sr-only" for="chat-peer">Юзернейм собеседника</label><input id="chat-peer" enterkeyhint="go" required maxlength="21" placeholder="Найти по юзернейму" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="submit" title="Открыть личную переписку" aria-label="Открыть личную переписку">${icon('arrow')}</button></form>
        <p class="chat-error chat-search-error" role="alert"></p></div>
        <div class="chat-rooms"></div>
        <div class="chat-identity">${avatar(me)}<div><small>Мой профиль</small><strong>@${esc(me)}</strong></div></div>
        </aside><section class="chat-thread" aria-label="Переписка"></section></div>`;
      $('.chat-search').onsubmit = async event => {
        event.preventDefault();
        const input = $('#chat-peer'), peer = input.value.trim().replace(/^@/,'').toLowerCase();
        if (!peer) return;
        const searchButton = event.currentTarget.querySelector('button');
        searchButton.disabled = true;
        $('.chat-search-error').textContent = '';
        try {
          const rows = await DB.rpc('chat_feed', {p_peer:peer});
          if (active) { input.value = ''; input.blur(); select(peer, rows); }
        } catch (e) { if (active) $('.chat-search-error').textContent = explain(e); }
        finally { searchButton.disabled = false; }
      };
      $('.chat-rooms').onclick = event => {
        const button = event.target.closest('[data-room]');
        if (button) select(button.dataset.room || null);
      };
      fitViewport();
      viewport?.addEventListener('resize', fitViewport);
      viewport?.addEventListener('scroll', fitViewport);
      phone.addEventListener('change', fitViewport);
      window.addEventListener('popstate', restorePane);
      const initialPeer = phone.matches ? history.state?.chatPeer : null;
      select(initialPeer || null, null, false);
      if (phone.matches && typeof initialPeer !== 'string') root.dataset.pane = 'list';
      timer = setInterval(visible, 4000);
    }

    function list() {
      const item = (peer, preview, sentAt) => {
        const title = peer ? '@' + peer : 'Общий чат';
        return `<button type="button" data-room="${esc(peer || '')}" class="chat-row" aria-current="${room.peer === peer}">
          ${avatar(peer)}<span class="chat-row-text"><b>${esc(title)}</b><small>${esc(preview)}</small></span>${sentAt ? `<time datetime="${esc(sentAt)}">${new Date(sentAt).toDateString() === new Date().toDateString() ? clock.format(new Date(sentAt)) : App.date(sentAt)}</time>` : ''}</button>`;
      };
      let rows = threads;
      if (room.peer && !rows.some(t => t.peer === room.peer)) rows = [{peer:room.peer,preview:'Новая переписка'}, ...rows];
      const html = item(null, 'Все участники курса') + '<h3>Личные сообщения</h3>' + (rows.length ? rows.map(t => item(t.peer,t.preview,t.sent_at)).join('') : `<div class="chat-note"><span class="chat-note-icon" aria-hidden="true">${icon('chat')}</span><p>Введите @юзернейм в поиске, чтобы начать переписку.</p></div>`);
      if (lastList !== html) {
        $('.chat-rooms').innerHTML = html;
        lastList = html;
      }
    }

    function select(peer, initial, remember = true) {
      if (phone.matches && remember) {
        const next = {...history.state, chatPeer:peer || ''};
        if (typeof history.state?.chatPeer === 'string') history.replaceState(next, '');
        else history.pushState(next, '');
      }
      const state = {peer, posts:[], loaded:false, older:false, pending:false, syncing:false};
      room = state;
      const name = peer ? '@' + peer : 'Общий чат';
      root.dataset.pane = 'thread';
      $('.chat-thread').innerHTML = `<header class="chat-threadhead"><button class="chat-back" type="button" aria-label="К списку переписок">${icon('back')}</button>
        ${avatar(peer)}<div><h2>${esc(name)}</h2><small>${peer ? 'Личная переписка' : '3 курс · Лингвистика'}</small></div></header>
        <div class="chat-log" tabindex="0" aria-label="История сообщений"><button type="button" class="chat-older chat-link" hidden>Предыдущие сообщения</button><div class="chat-posts"></div></div>
        <form class="chat-compose"><p class="chat-feedback" role="status"></p><div class="chat-inputrow"><textarea rows="1" maxlength="2000" aria-label="Сообщение" placeholder="${peer ? 'Сообщение для @' + esc(peer) : 'Сообщение в общий чат'}"></textarea><button type="submit" aria-label="Отправить сообщение" title="Отправить сообщение">${icon('arrow')}</button></div></form>`;
      const form = $('.chat-compose'), field = $('textarea');
      form.addEventListener('pointerdown', e => {
        if (e.target.closest('button') && document.activeElement === field) e.preventDefault();
      });
      field.value = drafts.get(peer)?.text || '';
      const button = form.querySelector('button');
      const update = () => {
        button.disabled = !field.value.trim() || state.pending;
        field.style.height = 'auto';
        if (field.value) field.style.height = Math.min(field.scrollHeight, 120) + 'px';
      };
      field.oninput = () => { drafts.set(peer, {text:field.value,nonce:crypto.randomUUID()}); update(); };
      update();
      field.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); if (!button.disabled) form.requestSubmit(); }
      };
      form.onsubmit = async e => {
        e.preventDefault();
        const draft = drafts.get(peer);
        if (!draft?.text.trim() || state.pending) return;
        state.pending = true; update();
        try {
          await DB.rpc('chat_send', {p_peer:peer,p_body:draft.text,p_nonce:draft.nonce});
          if (drafts.get(peer) === draft) {
            drafts.delete(peer);
            if (active && room.peer === peer) { $('textarea').value = ''; if (room !== state) $('.chat-compose button').disabled = true; }
          }
          if (active && room === state) { state.scrollEnd = true; await sync(state); }
        } catch (err) { if (active && room === state) $('.chat-feedback').textContent = explain(err); }
        finally { state.pending = false; update(); }
      };
      $('.chat-back').onclick = backToList;
      $('.chat-older').onclick = () => older(state);
      $('.chat-posts').onclick = e => {
        const author = e.target.closest('[data-author]');
        if (author) select(author.dataset.author);
      };
      list();
      if (initial) receive(state,initial,true);
      sync(state);
    }

    function draw(state) {
      let day = '';
      const html = state.posts.map(p => {
        const time = new Date(p.sent_at), date = calendar.format(time);
        const divider = day !== date ? `<div class="chat-day">${esc(date)}</div>` : '';
        day = date;
        const mine = p.sender === me;
        const author = !state.peer && !mine ? `<button type="button" data-author="${esc(p.sender)}">@${esc(p.sender)}</button>` : '';
        return `${divider}<article class="chat-post ${mine ? 'mine' : ''}">${author}<p>${esc(p.body)}</p><time datetime="${esc(p.sent_at)}">${clock.format(time)}</time></article>`;
      }).join('');
      $('.chat-posts').innerHTML = html || `<div class="chat-empty"><div class="chat-art" aria-hidden="true"><span class="chat-art-back"></span><span class="chat-art-front"><i></i><i></i><i></i></span></div><h3>${state.peer ? 'Начните переписку' : 'Начните обсуждение'}</h3><p>${state.peer ? 'Отправьте первое сообщение @' + esc(state.peer) + '.' : 'Задайте вопрос или поделитесь новостью с курсом.'}</p></div>`;
      $('.chat-older').hidden = !state.older;
    }

    function receive(state, rows, first) {
      const log = $('.chat-log');
      const stick = first || state.scrollEnd || log.scrollHeight - log.scrollTop - log.clientHeight < 75;
      if (first) { state.posts = [...rows].reverse(); state.older = rows.length === 50; }
      else state.posts.push(...rows);
      state.loaded = true;
      if (first || rows.length) draw(state);
      if (stick) log.scrollTop = log.scrollHeight;
      state.scrollEnd = false;
    }

    async function older(state) {
      const log = $('.chat-log'), button = $('.chat-older');
      button.disabled = true;
      try {
        const rows = await DB.rpc('chat_feed',{p_peer:state.peer,p_before:state.posts[0].id});
        if (!active || state !== room) return;
        const height = log.scrollHeight, top = log.scrollTop;
        state.posts.unshift(...rows.reverse());
        state.older = rows.length === 50;
        draw(state);
        log.scrollTop = top + log.scrollHeight - height;
      } catch (e) { if (active && state === room) $('.chat-feedback').textContent = explain(e); }
      finally { button.disabled = false; }
    }

    async function sync(state) {
      if (state.syncing || !active || room !== state) return;
      state.syncing = true;
      try {
        const [rows, nextThreads] = await Promise.all([
          DB.rpc('chat_feed',{p_peer:state.peer,p_after:state.loaded ? state.posts.at(-1)?.id || 0 : null}),
          DB.rpc('chat_threads')
        ]);
        if (!active || room !== state) return;
        receive(state,rows,!state.loaded);
        threads = nextThreads; list(); $('.chat-feedback').textContent = '';
      } catch (e) {
        if (active && state === room) $('.chat-feedback').textContent = explain(e);
      } finally { state.syncing = false; }
    }

    try {
      me = await DB.rpc('chat_handle');
      if (active) { if (me) workspace(); else onboarding(); }
    } catch (e) {
      if (!active) return;
      root.innerHTML = `<h1>Чаты</h1><p role="alert">${esc(explain(e))}</p><button class="btn">Попробовать снова</button>`;
      $('button').onclick = () => open(main);
    }
  }
  window.addEventListener('pagehide', close);
  return {open, close};
})();
