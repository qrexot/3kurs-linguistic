'use strict';
window.DB = (()=>{
 const admin=document.body.dataset.admin==='true', key=admin?'lecture-admin-session':'lecture-visitor-session';
 let session=App.storage.get(key),refreshPromise=null;
 function save(s){session=s?.access_token?{...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)}:null;if(session)App.storage.set(key,session);else App.storage.del(key)}
 async function request(path,options={},auth=true,retry=true){
  if(auth&&session&&session.expires_at<Date.now()/1000+45)await refresh();
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),18000);
  try{const r=await fetch(CONFIG.url+path,{...options,signal:abort.signal,headers:{apikey:CONFIG.key,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+(session?.access_token||CONFIG.key)}:{}),...options.headers}});
   const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{data=null}
   if(r.status===401&&auth&&session&&retry){await refresh();return request(path,options,auth,false)}
   if(!r.ok){const e=new Error(data?.msg||data?.message||data?.error_description||data?.error||`Ошибка сервера (${r.status})`);e.status=r.status;e.code=data?.code;throw e}return data;
  }finally{clearTimeout(timer)}
 }
 async function refresh(){if(refreshPromise)return refreshPromise;refreshPromise=(async()=>{const current=App.storage.get(key)||session;try{if(!current?.refresh_token)throw new Error('session_expired');save(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:current.refresh_token})},false))}catch(e){if(e.status===400||e.status===401||e.message==='session_expired'){save(null);window.dispatchEvent(new Event('session-lost'))}throw e}})().finally(()=>refreshPromise=null);return refreshPromise}
 async function ensureVisitor(){if(!session)save(await request('/auth/v1/signup',{method:'POST',body:JSON.stringify({data:{source:'lecture-browser'}})},false));if(!session)throw new Error('Анонимный доступ недоступен. Обратитесь к владельцу.');if(session.expires_at<Date.now()/1000+45)await refresh();return session}
 async function login(email,password){save(await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false));return session}
 async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST'})}finally{save(null)}}
 function select(table,query=''){return request('/rest/v1/'+table+'?'+query)}
 function rpc(name,args={}){return request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)})}
 function insert(table,data){return request('/rest/v1/'+table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(data)})}
 function update(table,id,data){return request('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(data)})}
 function remove(table,id){return request('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=representation'}})}
 async function profile(){if(!session?.user?.id)throw new Error('session_expired');const rows=await select('profiles','select=*&id=eq.'+session.user.id);if(!rows[0])throw new Error('Профиль не найден. Проверьте настройку базы.');return rows[0]}
 window.addEventListener('storage',e=>{if(e.key===key){session=App.storage.get(key);if(!session)window.dispatchEvent(new Event('session-lost'))}});
 return {request,ensureVisitor,login,logout,select,rpc,insert,update,remove,profile,get session(){return session}};
})();
