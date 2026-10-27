'use strict';
/* Layout-only enhancements. No data writes or authorization changes. */
(()=>{
  function enhance(){
    const form=document.querySelector('#editor-form');
    if(!form||form.dataset.mobileLayout)return;
    form.dataset.mobileLayout='true';
    const toggle=form.querySelector('#btn-toggle-preview');
    const tools=form.querySelector('.editor-topline-right');
    if(toggle&&tools)tools.prepend(toggle);
    const previewHead=form.querySelector('#preview-pane .editor-topline');
    if(previewHead&&toggle){
      const back=document.createElement('button');back.type='button';back.className='btn ghost preview-return';back.textContent='К редактированию';
      back.onclick=()=>{toggle.click();form.querySelector('#source-text').scrollIntoView({block:'start',behavior:'instant'})};
      previewHead.append(back);
    }
    const title=form.querySelector('#lecture-title-input');
    if(title){
      const fit=()=>{title.style.height='auto';title.style.height=title.scrollHeight+'px'};
      title.addEventListener('input',fit);window.addEventListener('resize',fit,{passive:true});requestAnimationFrame(fit);
    }
    const footer=form.querySelector('.clean-footer');
    if(footer&&'ResizeObserver' in window){
      const observer=new ResizeObserver(()=>{
        document.body.style.setProperty('--editor-bar-height',footer.getBoundingClientRect().height+'px');
        if(!footer.isConnected)observer.disconnect();
      });
      observer.observe(footer);
    }
  }
  const main=document.querySelector('#main');
  if(main)new MutationObserver(enhance).observe(main,{childList:true,subtree:true});
  enhance();
  // Release fixed bars while the on-screen keyboard occupies the viewport.
  const viewport=window.visualViewport;
  if(viewport){
    let frame=0;
    const sync=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const editing=document.activeElement?.matches('input:not([type=checkbox]),textarea,[contenteditable=true]');
      const keyboard=editing&&viewport.scale===1&&window.innerHeight-viewport.height>140;
      document.body.classList.toggle('keyboard-open',!!keyboard);
    })};
    viewport.addEventListener('resize',sync,{passive:true});
    document.addEventListener('focusin',sync);document.addEventListener('focusout',sync);
  }
})();
