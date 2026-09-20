'use strict';
window.Extras=(()=>{
 const bucket='lecture-extras',cache=new Map(),runs=new WeakMap();
 const validPath=p=>typeof p==='string'&&/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(p);
 const normalize=items=>Array.isArray(items)?items.filter(x=>x&&validPath(x.path)).slice(0,20).map(x=>({path:x.path,caption:String(x.caption||'').slice(0,500)})):[];
 const route=p=>p.split('/').map(encodeURIComponent).join('/');
 async function signed(path){
  if(!validPath(path))throw new Error('Некорректный путь фотографии');
  const key=(DB.session?.user?.id||'')+':'+path,hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.url;
  const data=await DB.request('/storage/v1/object/sign/'+bucket+'/'+route(path),{method:'POST',body:JSON.stringify({expiresIn:300})});
  const value=data?.signedURL||data?.signedUrl;if(!value)throw new Error('Не удалось открыть фотографию');
  const url=new URL(value.startsWith('/')?CONFIG.url+'/storage/v1'+value:value,CONFIG.url);
  if(url.origin!==new URL(CONFIG.url).origin)throw new Error('Некорректный адрес фотографии');
  cache.set(key,{url:url.href,until:Date.now()+240000});return url.href;
 }
 function openImage(url,caption){
  const d=document.createElement('dialog');d.className='photo-dialog';d.setAttribute('aria-label','Просмотр фотографии');
  d.innerHTML='<button class="photo-close" type="button" aria-label="Закрыть фотографию">'+App.icon('close')+'</button><div class="photo-viewport"><img alt=""></div><p></p>';
  const image=d.querySelector('img');image.src=url;image.alt=caption||'Дополнительный материал';d.querySelector('p').textContent=caption;
  document.body.append(d);const old=document.activeElement;
  d.querySelector('button').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d||e.target.classList.contains('photo-viewport'))d.close()});
  d.addEventListener('close',()=>{d.remove();old?.isConnected&&old.focus({preventScroll:true})});d.showModal();
 }
 function gallery(host,items){
  if(!host)return;const token={};runs.set(host,token);const photos=normalize(items);host.className='extra-gallery';host.innerHTML='';
  photos.forEach((photo,i)=>{
   const figure=document.createElement('figure');figure.innerHTML='<button type="button" class="photo-open" aria-label="Открыть фотографию '+(i+1)+'"><span class="photo-placeholder">Загрузка фото…</span></button><figcaption></figcaption>';
   figure.querySelector('figcaption').textContent=photo.caption;host.append(figure);const button=figure.querySelector('button');
   const load=async()=>{button.disabled=true;try{const url=await signed(photo.path);if(runs.get(host)!==token||!host.isConnected)return;const img=document.createElement('img');img.alt=photo.caption||'Фото '+(i+1);img.loading='lazy';img.decoding='async';img.src=url;img.onerror=()=>{if(!img.isConnected)return;button.textContent='Фото не загрузилось. Повторить';cache.delete((DB.session?.user?.id||'')+':'+photo.path);button.onclick=load};button.replaceChildren(img);button.onclick=async()=>{try{openImage(await signed(photo.path),photo.caption)}catch(e){App.toast(App.errorText(e))}}}catch{if(runs.get(host)!==token)return;button.textContent='Не удалось загрузить. Повторить';button.onclick=load}finally{button.disabled=false}};load();
  });
 }
 function editor(host,initial,onChange){
  let items=normalize(initial),busy=false;
  host.innerHTML='<div class="extra-upload-head"><div><h3>Фотографии</h3><p>JPG, PNG или WebP · до 8 МБ на фото · до 20 фото</p></div><label class="btn extra-upload-button">Добавить фото<input type="file" accept="image/jpeg,image/png,image/webp" multiple class="extra-files"></label></div><p class="extra-upload-status" role="status" aria-live="polite"></p><div class="extra-edit-list"></div><p class="small muted">Фото появятся на сайте после сохранения лекции. Удаление из списка сохраняет файл для истории версий.</p>';
  const list=host.querySelector('.extra-edit-list'),input=host.querySelector('input'),status=host.querySelector('[role=status]');
  function draw(){
   list.innerHTML='';items.forEach((item,i)=>{const row=document.createElement('div');row.className='extra-edit-row';row.innerHTML='<div class="extra-thumb"></div><div class="extra-photo-fields"><label>Подпись к фото '+(i+1)+'<input type="text" maxlength="500" placeholder="Например, страница учебника"></label><div class="extra-photo-actions"><button type="button" class="btn" data-up aria-label="Переместить фото выше">↑</button><button type="button" class="btn" data-down aria-label="Переместить фото ниже">↓</button><button type="button" class="btn" data-remove>Убрать</button></div></div>';
    list.append(row);gallery(row.querySelector('.extra-thumb'),[item]);const caption=row.querySelector('input');caption.value=item.caption;caption.disabled=busy;caption.oninput=()=>{item.caption=caption.value;onChange()};
    for(const b of row.querySelectorAll('button[data-up],button[data-down],button[data-remove]'))b.disabled=busy;
    row.querySelector('[data-up]').disabled=busy||i===0;row.querySelector('[data-down]').disabled=busy||i===items.length-1;
    row.querySelector('[data-up]').onclick=()=>{[items[i-1],items[i]]=[items[i],items[i-1]];draw();onChange()};row.querySelector('[data-down]').onclick=()=>{[items[i+1],items[i]]=[items[i],items[i+1]];draw();onChange()};row.querySelector('[data-remove]').onclick=()=>{items.splice(i,1);draw();onChange()};
   });input.disabled=busy||items.length>=20;
  }
  input.onchange=async()=>{
   const files=Array.from(input.files||[]);input.value='';if(!files.length||busy)return;
   if(items.length+files.length>20){status.textContent='Можно добавить не больше 20 фотографий.';return}
   busy=true;draw();const errors=[];let added=0;
   try{for(const [i,file] of files.entries()){
    status.textContent='Загрузка '+(i+1)+' из '+files.length+'…';
    try{if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Выберите JPG, PNG или WebP');if(file.size>8388608||!file.size)throw new Error('Размер фото должен быть от 1 байта до 8 МБ');
     const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());const ok=file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!ok)throw new Error('Файл не соответствует формату изображения');
     const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=DB.session.user.id+'/'+crypto.randomUUID()+'.'+ext;
     await DB.request('/storage/v1/object/'+bucket+'/'+route(path),{method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
     items.push({path,caption:''});added++;onChange();
    }catch(e){errors.push(file.name+': '+App.errorText(e))}
   }}finally{busy=false;draw();status.textContent=(added?'Загружено: '+added+'. Сохраните лекцию. ':'')+errors.join(' · ')}
  };
  draw();return {get:()=>items.map(x=>({...x})),set:value=>{if(busy)return;items=normalize(value);draw()},get busy(){return busy}};
 }
 return {gallery,editor,normalize};
})();
