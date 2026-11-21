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
    const visible = () => { if (!document.hidden && room) sync(room); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    dispose = () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
      root.remove();
    };

    function onboarding(restore = false) {
      const secret = crypto.randomUUID().replaceAll('-', '');
      root.innerHTML = `<h1>Чаты</h1><div class="chat-welcome"><div class="chat-intro"><span class="chat-emblem">${icon('chat')}</span>
        <h2>Переписка курса</h2><p>Обсуждайте занятия в общем чате или напишите одногруппнику лично.</p></div>
        <form class="chat-signup"><h3>${restore ? 'Восстановление профиля' : 'Ваш профиль'}</h3>
        <label>Юзернейм<input name="handle" required minlength="3" maxlength="20" pattern="[A-Za-z][A-Za-z0-9_]{2,19}" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="например, leonard"></label>
        <p class="chat-hint">От 3 до 20 знаков. Первая — латинская буква. Юзернейм закрепляется навсегда.</p>
        ${restore ? '<label>Код восстановления<input name="secret" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>' :
        `<label>Код восстановления<input name="secret" class="chat-code" readonly value="${secret}"></label><p class="chat-hint">Сохраните код в личном месте. Он открывает доступ к перепискам на новом устройстве.</p>
        <label class="chat-check"><input type="checkbox" required> Я сохранил код</label>`}
        <p class="chat-error" role="alert"></p><button class="btn primary" type="submit">${restore ? 'Восстановить доступ' : 'Закрепить юзернейм'}</button>
        <button type="button" class="chat-link" data-switch>${restore ? 'Создать профиль' : 'У меня уже есть профиль'}</button></form></div>`;
      $('[data-switch]').onclick = () => onboarding(!restore);
      const form = $('form');
      if (!restore) form.elements.secret.onclick = () => form.elements.secret.select();
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
      root.innerHTML = `<header class="chat-pagehead"><h1>Чаты</h1><span class="chat-identity">@${esc(me)}</span></header>
        <div class="chat-work"><aside class="chat-side" aria-label="Список чатов"><h2>Переписки</h2>
        <form class="chat-search"><label class="sr-only" for="chat-peer">Юзернейм собеседника</label><input id="chat-peer" required maxlength="21" placeholder="@юзернейм" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="submit" aria-label="Открыть личную переписку">${icon('arrow')}</button></form>
        <p class="chat-error chat-search-error" role="alert"></p>
        <div class="chat-rooms"></div></aside><section class="chat-thread" aria-label="Переписка"></section></div>`;
      $('.chat-search').onsubmit = async event => {
        event.preventDefault();
        const input = $('#chat-peer'), peer = input.value.trim().replace(/^@/,'').toLowerCase();
        if (!peer) return;
        const searchButton = event.currentTarget.querySelector('button');
        searchButton.disabled = true;
        $('.chat-search-error').textContent = '';
        try {
          const rows = await DB.rpc('chat_feed', {p_peer:peer});
          if (active) { input.value = ''; select(peer, rows); }
        } catch (e) { if (active) $('.chat-search-error').textContent = explain(e); }
        finally { searchButton.disabled = false; }
      };
      $('.chat-rooms').onclick = event => {
        const button = event.target.closest('[data-room]');
        if (button) select(button.dataset.room || null);
      };
      select(null);
      timer = setInterval(visible, 4000);
    }

    function list() {
      const item = (peer, preview) => {
        const title = peer ? '@' + peer : 'Общий чат';
        return `<button type="button" data-room="${esc(peer || '')}" class="chat-row" aria-current="${room.peer === peer}">
          <span class="chat-avatar">${peer ? esc(peer[0].toUpperCase()) : icon('users')}</span><span class="chat-row-text"><b>${esc(title)}</b><small>${esc(preview)}</small></span></button>`;
      };
      let rows = threads;
      if (room.peer && !rows.some(t => t.peer === room.peer)) rows = [{peer:room.peer,preview:'Новая переписка'}, ...rows];
      const html = item(null, 'Весь курс') + '<h3>Личные сообщения</h3>' + (rows.length ? rows.map(t => item(t.peer,t.preview)).join('') : '<p class="chat-note">Здесь появятся ваши переписки.</p>');
      if (lastList !== html) {
        $('.chat-rooms').innerHTML = html;
        lastList = html;
      }
    }

    function select(peer, initial) {
      const state = {peer, posts:[], loaded:false, older:false, pending:false, syncing:false};
      room = state;
      const name = peer ? '@' + peer : 'Общий чат';
      root.dataset.pane = 'thread';
      $('.chat-thread').innerHTML = `<header class="chat-threadhead"><button class="chat-back" type="button" aria-label="К списку переписок">${icon('back')}</button>
        <span class="chat-avatar">${peer ? esc(peer[0].toUpperCase()) : icon('users')}</span><div><h2>${esc(name)}</h2><small>${peer ? 'Личная переписка' : 'Для всех участников курса'}</small></div></header>
        <div class="chat-log" tabindex="0" aria-label="История сообщений"><button type="button" class="chat-older chat-link" hidden>Предыдущие сообщения</button><div class="chat-posts"></div></div>
        <form class="chat-compose"><p class="chat-feedback" role="status"></p><div class="chat-inputrow"><textarea rows="1" maxlength="2000" aria-label="Сообщение" placeholder="Написать сообщение…"></textarea><button type="submit" aria-label="Отправить сообщение">${icon('arrow')}</button></div></form>`;
      const form = $('.chat-compose'), field = $('textarea');
      field.value = drafts.get(peer)?.text || '';
      const button = form.querySelector('button');
      const update = () => { button.disabled = !field.value.trim() || state.pending; };
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
      $('.chat-back').onclick = () => { root.dataset.pane = 'list'; $('#chat-peer').focus(); };
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
      $('.chat-posts').innerHTML = html || `<div class="chat-empty">${icon(state.peer ? 'lock' : 'chat')}<h3>${state.peer ? 'Начните переписку' : 'Пока нет сообщений'}</h3><p>${state.peer ? 'Ваше сообщение увидит @' + esc(state.peer) + '.' : 'Напишите первое сообщение курсу.'}</p></div>`;
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
