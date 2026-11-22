'use strict';
/* Shared visitor/admin wording. Authorization remains on the server. */
window.AccessPresentation=Object.freeze({
 closedTitle:'Общий доступ отключён',
 openTitle:'Вход по аккаунту',
 heading:'Пока здесь тихо :(',
 lead:'Я отключил общий доступ к сайту.',
 copy:'Конспекты и информация о лекциях сохранились. Ты можешь написать мне в Telegram.',
 defaultMessage:'Общий доступ к сайту отключён. При наличии специального доступа можно войти в материалы.',
 customMessage(value){
  const text=String(value||'').trim();
  return [this.defaultMessage,'Сайт временно отключён администратором. Чуть позже всё снова заработает. Спасибо за терпение :)'].includes(text)?'':text;
 },
 date(value){
  if(!value||!Number.isFinite(new Date(value).getTime()))return '';
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(value))+' МСК';
 }
});
