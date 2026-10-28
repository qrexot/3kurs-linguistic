'use strict';
(async()=>{
 try{
  await DB.ensureVisitor();const ua=navigator.userAgent||'';
  const os=/Windows/i.test(ua)?'Windows':/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'';
  const browser=/Edg/i.test(ua)?'Edge':/Firefox/i.test(ua)?'Firefox':/Chrome/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'';
  const type=/iPad|Tablet/i.test(ua)?'tablet':/Android|iPhone|Mobile/i.test(ua)?'mobile':'desktop';
  const d=await DB.rpc('upsert_device',{p_fingerprint:'auth:'+DB.session.user.id,p_device_type:type,p_os:os,p_browser:browser,p_ua:ua,p_screen:screen.width+'x'+screen.height,p_lang:navigator.language||'',p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'',p_entry_page:'chat'});
  if(!d?.device_id||d.blocked)return;const session=crypto.randomUUID(),id=d.device_id;let queue=Promise.resolve();
  const tick=visible=>{queue=queue.catch(()=>{}).then(()=>DB.rpc('device_presence_tick',{p_device_id:id,p_session_id:session,p_visible:visible}));return queue};
  await tick(!document.hidden);setInterval(()=>{if(!document.hidden)tick(true).catch(()=>{})},15000);
  document.addEventListener('visibilitychange',()=>tick(!document.hidden).catch(()=>{}));
  window.addEventListener('pagehide',()=>DB.request('/rest/v1/rpc/device_presence_tick',{method:'POST',keepalive:true,body:JSON.stringify({p_device_id:id,p_session_id:session,p_visible:false})}).catch(()=>{}));
 }catch(e){console.warn('Статистика посещения временно недоступна')}
})();
