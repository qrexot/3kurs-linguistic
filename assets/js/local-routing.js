/* Keep file:// visitor storage on one physical HTML file. */
'use strict';
(()=>{
 if(location.protocol!=='file:')return;
 const pages={'index.html':'library','subjects.html':'subjects','saved.html':'saved','lecture.html':'reader','privacy.html':'privacy'};
 const file=location.pathname.split('/').pop();
 if(!pages[file])return;
 if(file!=='index.html'){
  window.localRoutePending=true;
  const url=new URL('index.html',location.href);url.search=location.search;url.searchParams.set('view',pages[file]);url.hash=location.hash;
  location.replace(url.href);return;
 }
 const view=new URLSearchParams(location.search).get('view');
 if(Object.values(pages).includes(view))document.body.dataset.page=view;
 function rewrite(root){
  const links=root.matches?.('a[href]')?[root]:root.querySelectorAll?.('a[href]')||[];
  for(const a of links){
   const u=new URL(a.getAttribute('href'),location.href);
   const name=u.pathname.split('/').pop();
   if(u.protocol!=='file:'||!pages[name]||name==='index.html'||u.pathname.slice(0,u.pathname.lastIndexOf('/'))!==location.pathname.slice(0,location.pathname.lastIndexOf('/')))continue;
   u.pathname=u.pathname.replace(/[^/]+$/,'index.html');u.searchParams.set('view',pages[name]);a.href=u.href;
  }
 }
 rewrite(document);
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)rewrite(node)}).observe(document.body,{childList:true,subtree:true});
})();
