'use strict';
window.SearchUI=(()=>{
 const controls=[];let opened=null;
 function close(restore=false){if(!opened)return;const c=opened;opened=null;c.menu.hidden=true;c.button.setAttribute('aria-expanded','false');c.wrap.classList.remove('menu-open');if(restore)c.button.focus()}
 function sync(){for(const c of controls){c.label.textContent=c.select.selectedOptions[0]?.textContent||'';c.button.setAttribute('aria-label',c.name+': '+c.label.textContent);c.options.forEach((b,i)=>{const chosen=i===c.select.selectedIndex;b.setAttribute('aria-selected',String(chosen));b.classList.toggle('selected',chosen)})}}
 function open(c,index){close();sync();opened=c;c.menu.hidden=false;c.button.setAttribute('aria-expanded','true');c.wrap.classList.add('menu-open');const at=index??Math.max(0,c.select.selectedIndex);c.options[at]?.focus({preventScroll:true});c.options[at]?.scrollIntoView({block:'nearest'})}
 function init(ids=['week-filter','sort']){
  for(const id of ids){
   const select=document.getElementById(id);if(!select||select.dataset.enhanced)continue;
   select.dataset.enhanced='true';const name=select.getAttribute('aria-label')||select.labels?.[0]?.querySelector('span')?.textContent||select.labels?.[0]?.childNodes[0]?.textContent?.trim()||'Выбрать значение';const wrap=select.parentElement;wrap.classList.add('styled-filter');select.hidden=true;
   const button=document.createElement('button');button.type='button';button.className='filter-trigger';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',id+'-options');button.setAttribute('aria-label',name);button.innerHTML='<span></span>'+App.icon('chevron');
   const menu=document.createElement('div');menu.id=id+'-options';menu.className='filter-menu';menu.role='listbox';menu.setAttribute('aria-label',name);menu.hidden=true;
   const c={select,wrap,button,menu,name,label:button.querySelector('span'),options:[]};
   for(const [i,opt] of Array.from(select.options).entries()){
    const item=document.createElement('button');item.type='button';item.role='option';item.tabIndex=-1;item.className='filter-option';item.textContent=opt.textContent;
    item.onclick=()=>{select.selectedIndex=i;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true)};
    menu.append(item);c.options.push(item);
   }
   button.onclick=()=>opened===c?close():open(c);
   button.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(c,e.key==='ArrowUp'?c.options.length-1:undefined)}};
   let prefix='',prefixTimer;
   menu.onkeydown=e=>{
    let next=c.options.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return}
    if(e.key==='Tab'){close();return}
    if(e.key==='ArrowDown')next=(next+1)%c.options.length;
    else if(e.key==='ArrowUp')next=(next-1+c.options.length)%c.options.length;
    else if(e.key==='Home')next=0;else if(e.key==='End')next=c.options.length-1;
    else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&e.key!==' '){clearTimeout(prefixTimer);prefix+=e.key.toLocaleLowerCase('ru');prefixTimer=setTimeout(()=>prefix='',600);next=c.options.findIndex(b=>b.textContent.toLocaleLowerCase('ru').startsWith(prefix));if(next<0)return}
    else return;
    e.preventDefault();c.options[next]?.focus();
   };
   select.addEventListener('change',sync);wrap.append(button,menu);controls.push(c);
  }sync();
 }
 document.addEventListener('pointerdown',e=>{if(opened&&!opened.wrap.contains(e.target))close()});
 document.addEventListener('focusin',e=>{if(opened&&!opened.wrap.contains(e.target))close()});
 return {init,sync};
})();
