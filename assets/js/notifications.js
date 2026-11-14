'use strict';
(() => {
  const escape = App.esc;
  const icons = {
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 21h4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m4 12 4 4L19 5M12 16l2 2 7-7"/>',
    message: '<path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5a8.5 8.5 0 1 1 17 0Z"/><path d="M7 9h9M7 13h6"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  let bell, dialog, poll, request, data = null, filter = 'all', busy = false, failed = false, lastRender = '';
  const formatDate = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  };
  function mount() {
    const host = document.querySelector('.topbar .top-right');
    if (!host) return;
    if (!bell) {
      bell = document.createElement('button');
      bell.type = 'button'; bell.className = 'notifications-bell';
      bell.setAttribute('aria-label', 'Уведомления');
      bell.setAttribute('aria-haspopup', 'dialog');
      bell.setAttribute('aria-controls', 'notifications-panel');
      bell.setAttribute('aria-expanded', 'false');
      bell.innerHTML = `${icon('bell')}<span class="notifications-count" hidden></span>`;
      bell.addEventListener('click', open);
    }
    if (!bell.isConnected) host.prepend(bell);
  }
  function position() {
    if (!dialog?.open || !bell) return;
    const rect = bell.getBoundingClientRect();
    dialog.style.setProperty('--notifications-top', `${Math.min(rect.bottom + 12, Math.max(16, innerHeight - 380))}px`);
    dialog.style.setProperty('--notifications-right', `${Math.max(16, Math.min(innerWidth - rect.right, innerWidth - 456))}px`);
  }
  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'notifications-panel'; dialog.className = 'notifications-dialog';
    dialog.setAttribute('aria-labelledby', 'notifications-title');
    dialog.setAttribute('aria-describedby', 'notifications-description');
    dialog.innerHTML = `<header class="notifications-header"><span class="notifications-emblem">${icon('bell')}</span><div class="notifications-heading"><h2 id="notifications-title">Уведомления</h2><p id="notifications-description">Ответы и события на сайте</p></div><button type="button" class="notifications-close" aria-label="Закрыть уведомления" autofocus>${icon('close')}</button></header>
      <div class="notifications-toolbar"><div class="notifications-filters" role="group" aria-label="Показать уведомления"><button type="button" data-filter="all" aria-pressed="true">Все</button><button type="button" data-filter="unread" aria-pressed="false">Новые <span class="notifications-unread-total" hidden></span></button></div><button type="button" class="notifications-read-all" hidden>${icon('check')}<span>Прочитать все</span></button></div>
      <p class="notifications-feedback" role="alert" hidden></p><div class="notifications-list" aria-busy="false"></div><p class="sr-only notifications-status" role="status"></p>`;
    document.body.append(dialog);
    dialog.querySelector('.notifications-close').onclick = () => dialog.close();
    dialog.querySelector('.notifications-read-all').onclick = () => markRead(null);
    dialog.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (target?.dataset.filter) { filter = target.dataset.filter; render(); }
      if (target?.dataset.notification) markRead(Number(target.dataset.notification));
      if (target?.classList.contains('notifications-retry')) refresh();
    });
    let outside = false;
    const isOutside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
    dialog.addEventListener('pointerdown', event => { outside = event.target === dialog && isOutside(event); });
    dialog.addEventListener('click', event => { if (outside && event.target === dialog && isOutside(event)) dialog.close(); outside = false; });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('notifications-open');
      bell?.setAttribute('aria-expanded', 'false');
      bell?.focus({ preventScroll:true });
    });
    addEventListener('resize', position);
  }
  function open() {
    if (!dialog) createDialog();
    if (dialog.open) return;
    filter = 'all'; failed = false;
    dialog.querySelector('.notifications-feedback').hidden = true;
    dialog.showModal();
    document.documentElement.classList.add('notifications-open');
    bell.setAttribute('aria-expanded', 'true');
    position(); render(); refresh();
  }
  function emptyState(name, title, description, retry = false) {
    return `<div class="notifications-empty"><span class="notifications-empty-icon">${icon(name)}</span><h3>${title}</h3><p>${description}</p>${retry ? '<button type="button" class="notifications-retry">Попробовать снова</button>' : ''}</div>`;
  }
  function render() {
    const count = Math.max(0, Number(data?.unread) || 0);
    const badge = bell?.querySelector('.notifications-count');
    if (badge) {
      badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count);
      bell.setAttribute('aria-label', count ? `Уведомления: непрочитанных ${count}` : 'Уведомления');
    }
    if (!dialog?.open) return;
    dialog.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    const total = dialog.querySelector('.notifications-unread-total');
    total.hidden = !count; total.textContent = count > 99 ? '99+' : count;
    const readAll = dialog.querySelector('.notifications-read-all');
    readAll.hidden = !count; readAll.disabled = busy;
    readAll.setAttribute('aria-busy', String(busy));
    const list = dialog.querySelector('.notifications-list');
    list.setAttribute('aria-busy', String(!data && !failed));
    const key = JSON.stringify([data, filter, failed]);
    if (lastRender !== key) {
      lastRender = key;
      const activeId = list.contains(document.activeElement) ? document.activeElement.dataset.notification : null;
      const scroll = list.scrollTop;
      if (!data) {
        list.innerHTML = failed
          ? emptyState('error', 'Не удалось загрузить', 'Проверьте соединение и попробуйте ещё раз.', true)
          : '<div class="notifications-loading" role="status"><span></span><span></span><span></span><p>Загружаем уведомления…</p></div>';
      } else {
        const items = (Array.isArray(data.items) ? data.items : []).filter(n => filter !== 'unread' || !n.read_at);
        list.innerHTML = items.length ? items.map(n => {
          const title = escape(n.title || 'Уведомление');
          const copy = `<span class="notification-symbol">${icon('message')}</span><span class="notification-copy"><span class="notification-item-heading"><strong>${title}</strong>${n.read_at ? '' : '<span class="notification-indicator" aria-label="Непрочитанное"></span>'}</span><span class="notification-body">${escape(n.body)}</span><time>${escape(formatDate(n.created_at))}</time></span>`;
          return n.read_at ? `<article class="notification-item">${copy}</article>` : `<button type="button" class="notification-item unread" data-notification="${Number(n.id)}" aria-label="${title}. Отметить прочитанным">${copy}</button>`;
        }).join('') : filter === 'unread'
          ? emptyState('check', 'Всё прочитано', 'Новые уведомления появятся здесь.')
          : emptyState('bell', 'Пока тихо', 'Здесь появятся ответы и важные события на сайте.');
      }
      list.scrollTop = scroll;
      if (activeId) {
        const next = list.querySelector(`[data-notification="${Number(activeId)}"]`);
        (next || dialog.querySelector(`[data-filter="${filter}"]`)).focus({ preventScroll:true });
      }
    }
    list.querySelectorAll('[data-notification]').forEach(b => { b.disabled = busy; });
  }
  async function refresh() {
    if (request) return request;
    failed = false;
    if (!data) render();
    request = (async () => {
      try {
        data = await DB.rpc('my_notifications');
        if (!data) data = { items:[], unread:0 };
        if (dialog?.open) dialog.querySelector('.notifications-feedback').hidden = true;
      } catch (error) {
        failed = true;
        if (data && dialog?.open) showError('Не удалось обновить уведомления. Попробуйте открыть их ещё раз.');
      } finally { request = null; render(); }
    })();
    return request;
  }
  function showError(message) {
    const el = dialog.querySelector('.notifications-feedback');
    el.textContent = message; el.hidden = false;
  }
  async function markRead(id) {
    if (busy) return;
    const restoreFocus = dialog.contains(document.activeElement) && (document.activeElement.matches('[data-notification]') || document.activeElement.matches('.notifications-read-all'));
    busy = true; render();
    try {
      if (request) await request;
      await DB.rpc('mark_notifications_read', { p_id:id });
      await refresh();
      if (!failed) dialog.querySelector('.notifications-status').textContent = id === null ? 'Все уведомления прочитаны' : 'Уведомление прочитано';
    } catch (error) { showError('Не удалось отметить прочитанным. Попробуйте ещё раз.'); }
    finally {
      busy = false; render();
      if (restoreFocus && dialog.open && (document.activeElement === document.body || !dialog.contains(document.activeElement))) dialog.querySelector(`[data-filter="${filter}"]`).focus({ preventScroll:true });
    }
  }
  async function start() {
    mount();
    try { await DB.ensureVisitor(); await refresh(); poll = setInterval(() => { if (!document.hidden && !busy) refresh(); }, 20000); } catch {}
  }
  new MutationObserver(mount).observe(document.body, { childList:true, subtree:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && poll && !busy) refresh(); });
  start();
})();
