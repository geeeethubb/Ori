'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const config = window.ORI_PITCH || {};
  const slides = $$('.slide');
  let current = 0;
  let toastTimeout;
  let elapsed = 0;
  let startedAt = null;
  const localClips = new Map();
  const notes = [
    ["We’re building Ori: an AI companion that turns your interests and everyday needs into personal apps. Our vision is a phone that becomes distinctly yours, starting on the phone you already own.", "Open with the promise. The visual is a brand illustration, not a product screenshot."],
    ["Think about the last thing you saved because you wanted to try it. A song. A photo. An idea. The intention is real, but acting on it still means finding a tool, setting it up, and making it fit. Our hypothesis is that this gap stops people from turning curiosity into something they actually do.", "Make this personal with one brief, true example. We have not measured the prevalence or size of this problem yet."],
    ["Ori starts before you know exactly what app you need. You share a thought or some context. The Playground helps you explore useful possibilities. Then you shape a personal tool around the activity. Sometimes that means creating an app; sometimes it means using one you already have, or simply keeping an idea.", "These are illustrative interface elements. Don't imply automatic access to social accounts or all AI conversations."],
    ["Here’s the journey we want to make effortless. I want to notice light on my walks. Ori helps turn that interest into Light, a photography journal. I can preview it and make a meaningful change before creating it. The important step is going from a vague interest to something useful and personal.", "Play clip 1 if added. Otherwise say 'This is the intended flow, illustrated here.' Record a real create flow before using present-tense execution claims."],
    ["Creation is only the beginning. The next test is whether I can use the tool, save something that matters, and adapt it as my needs change. Here I want to save a photo and observation, change the app, and show that the original entry remains. A personal tool has to preserve the work that makes it personal.", "Play clip 2. Show the same real record before and after the revision. Concept artwork is not evidence of persistence."],
    ["And the return journey matters just as much. The goal is to leave Ori, tap Light from my phone’s home screen, and continue where I left off. That’s the experience we’re building toward: apps made for you, one tap away.", "Play a real device recording if available. If this hasn't been verified, use 'the goal' and 'phone-accessible web app'; do not claim an OS replacement."],
    ["Our first audience is AI-comfortable students with several active interests and commitments. I can recruit directly through communities I’m already part of, including Founders, T&M, and IBC. The first pilot is fifty users. We’ll help each person get one useful outcome, then measure whether they return on a later day and continue using it in week four.", "Fifty users is a proposed cohort, not existing traction. These communities are recruitment access, not partners. The problem size and broader market still need evidence."],
    ["The pricing hypothesis is a fourteen-day full trial, then seven dollars fifty per month for two months, then fifteen dollars per month. We’re testing whether continued usefulness earns payment after the novelty of creation wears off. We’ll measure actual conversion, renewal at full price, and cost to serve, rather than treating app generation as proof of a business.", "Preserve the exact price ladder. Payment, billing implementation, and margins are unvalidated. The next $15 renewal is distinct from the first $15 charge."],
    ["The technical approach is a shared foundation: user-chosen context informs a structured app definition, and a reusable runtime renders the experience and stores its records. The key engineering test is continuity across use, revision, and reopening. The apps can feel different while relying on common capabilities.", "This is architecture direction from the existing deck. Check the current code before adding implementation-specific claims. A bounded earlier audit is not a fresh device test."],
    ["Velocity helped challenge our assumptions: whether to reuse an app instead of creating another, how revisions should preserve records, and what would demonstrate repeat value. That shaped both the product decisions and the pilot we plan to run.", "Describe documented research and design contributions. Don't say every recommendation was implemented or claim quantified time savings."],
    ["The next step is an eight-week pilot with fifty users, to earn evidence of repeated use and real payment. Ori: your phone, your story.", "Pause. Leave the closing scene visible for questions. Product and repository links appear when configured in Setup or config.js."]
  ];
  const time = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const startTime = i => slides.slice(0,i).reduce((sum,s) => sum + Number(s.dataset.time),0);
  const notify = message => { clearTimeout(toastTimeout); $('#toast').textContent=message; $('#toast').hidden=false; toastTimeout=setTimeout(()=>$('#toast').hidden=true,4500); };
  const safeUrl = value => {
    if (!value || !String(value).trim()) return '';
    try { const u=new URL(String(value).trim());return ['http:','https:'].includes(u.protocol)?u.href:''; } catch { return ''; }
  };
  const readSaved = () => { try {return JSON.parse(localStorage.getItem('ori-pitch-links-v1') || '{}') || {};}catch{return {};}};
  const saved = readSaved();
  const links = {appUrl:safeUrl(saved.appUrl ?? config.appUrl),githubUrl:safeUrl(saved.githubUrl ?? config.githubUrl)};
  function renderLinks(){
    const holder=$('#closing-links');holder.replaceChildren();
    for (const [key,label] of [['appUrl','Open Ori ↗'],['githubUrl','View GitHub ↗']]) {
      if(!links[key]) continue;
      const a=document.createElement('a');a.href=links[key];a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';holder.append(a);
    }
    $('#app-url').value=links.appUrl;$('#github-url').value=links.githubUrl;
  }
  renderLinks();
  $$('[data-presenter]').forEach(el=>el.textContent=config.presenter || 'Zuyu Liu');
  const dots=$('#progress-dots'),grid=$('#overview-grid');
  slides.forEach((slide,i)=>{
    const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',`Slide ${i+1}: ${slide.dataset.title}`);dot.title=slide.dataset.title;dot.addEventListener('click',()=>go(i));dots.append(dot);
    const card=document.createElement('button');card.type='button';
    const info=document.createElement('span');const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');const duration=document.createElement('span');duration.textContent=`${slide.dataset.time}s`;info.append(number,duration);
    const name=document.createElement('b');name.textContent=slide.dataset.title;card.append(info,name);card.addEventListener('click',()=>{$('#overview').close();go(i);});grid.append(card);
  });
  function syncNotes(){
    $('#notes-title').textContent=slides[current].dataset.title;
    $('#notes-body').textContent=notes[current][0];$('#notes-cue').textContent=notes[current][1];
    $('#slide-timing').textContent=`SCENE ${current+1} / ${slides.length} · ${slides[current].dataset.time} SECONDS · TARGET ${time(startTime(current))}–${time(startTime(current+1))}`;
    $('#notes-prev').disabled=current===0;$('#notes-next').disabled=current===slides.length-1;
  }
  function collapseMedia(){ $$('.media-shell.expanded').forEach(el=>{el.classList.remove('expanded');el.querySelector('.media-expand').textContent='Expand ↗';}); }
  function go(index,updateHash=true){
    current=Math.max(0,Math.min(slides.length-1,index));collapseMedia();
    slides.forEach((slide,i)=>{const active=i===current;slide.hidden=!active;slide.classList.toggle('active',active);if(active)slide.scrollTop=0;else slide.querySelectorAll('video').forEach(v=>v.pause());});
    $$('#progress-dots button').forEach((b,i)=>b.setAttribute('aria-current',String(i===current)));
    $$('#overview-grid button').forEach((b,i)=>b.setAttribute('aria-current',String(i===current)));
    $('#slide-count').textContent=`${String(current+1).padStart(2,'0')} / ${slides.length}`;
    $('#slide-name').textContent=slides[current].dataset.title;$('#deck-progress-fill').style.width=`${(current+1)/slides.length*100}%`;
    $('#prev-btn').disabled=current===0;$('#next-btn').disabled=current===slides.length-1;
    $('#slide-announcement').textContent=`Slide ${current+1} of ${slides.length}: ${slides[current].dataset.title}`;
    document.title=`Ori — ${slides[current].dataset.title}`;syncNotes();
    if(updateHash){try{history.replaceState(null,'',`#${current+1}`);}catch{}}
  }
  function openDialog(id){collapseMedia();$$('dialog[open]').forEach(d=>d.close());$$('video').forEach(v=>v.pause());$(id).showModal();}
  $('#next-btn').addEventListener('click',()=>go(current+1));$('#prev-btn').addEventListener('click',()=>go(current-1));
  $('#notes-next').addEventListener('click',()=>go(current+1));$('#notes-prev').addEventListener('click',()=>go(current-1));
  $('[data-go]').addEventListener('click',()=>go(0));
  $('#overview-btn').addEventListener('click',()=>openDialog('#overview'));$('#setup-btn').addEventListener('click',()=>openDialog('#setup'));$('#notes-btn').addEventListener('click',()=>openDialog('#notes'));
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();}));
  async function present(){
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();return;}catch{}}
    document.body.classList.toggle('in-presentation');$('#present-btn').textContent=document.body.classList.contains('in-presentation')?'Exit presentation':'Present ⛶';notify(document.body.classList.contains('in-presentation')?'Full screen is unavailable here. Presentation layout is active.':'Presentation layout closed.');
  }
  $('#present-btn').addEventListener('click',present);
  document.addEventListener('fullscreenchange',()=>{document.body.classList.toggle('in-presentation',!!document.fullscreenElement);$('#present-btn').textContent=document.fullscreenElement?'Exit full screen ⛶':'Present ⛶';});
  function currentSeconds(){return Math.floor(elapsed+(startedAt===null?0:(performance.now()-startedAt)/1000));}
  function renderTimer(){const seconds=currentSeconds();$('#timer-display').textContent=time(seconds);$('.timer-bar').classList.toggle('over-time',seconds>240);$('#timer-toggle').textContent=startedAt===null?(elapsed?'Resume':'Start timer'):'Pause';}
  $('#timer-toggle').addEventListener('click',()=>{if(startedAt===null)startedAt=performance.now();else{elapsed+=(performance.now()-startedAt)/1000;startedAt=null;}renderTimer();});
  $('#timer-reset').addEventListener('click',()=>{elapsed=0;startedAt=null;renderTimer();});setInterval(renderTimer,250);
  $('#settings-form').addEventListener('submit',e=>{e.preventDefault();const app=safeUrl($('#app-url').value),github=safeUrl($('#github-url').value);if(($('#app-url').value&&!app)||($('#github-url').value&&!github)){notify('Use a complete http:// or https:// URL.');return;}links.appUrl=app;links.githubUrl=github;let persistent=true;try{localStorage.setItem('ori-pitch-links-v1',JSON.stringify(links));}catch{persistent=false;}renderLinks();$('#save-status').textContent=persistent?'Saved for this browser.':'Set for this tab; browser storage is unavailable.';});
  function setClip(key,src,isLocal=false,fileName=''){
    const shell=$(`.media-shell[data-clip="${key}"]`),video=shell.querySelector('video'),image=shell.querySelector('img');
    video.pause();shell.querySelector('.media-error')?.remove();video.removeAttribute('src');video.load();
    video.hidden=!src;image.hidden=!!src;shell.classList.toggle('has-video',!!src);
    shell.querySelector('.media-label').textContent=src?(isLocal?'LOCAL PRODUCT RECORDING · THIS TAB ONLY':'PRODUCT RECORDING'):'CONCEPT REFERENCE · RECORDING NOT ADDED';
    const footer=shell.closest('.slide').querySelector('.slide-bottom>span:last-child');
    footer.textContent=src?'Product recording · narrated live by the presenter.':(key==='reopen'?'Home-screen delivery must be demonstrated on the actual device.':'Concept reference until replaced with a product recording.');
    if(src){video.src=src;video.load();}
    $(`[data-remove="${key}"]`).hidden=!isLocal;
    const caption=$(`[data-upload="${key}"]`).closest('.upload-row').querySelector('span');
    if(!caption.dataset.defaultText)caption.dataset.defaultText=caption.textContent;
    caption.textContent=isLocal?fileName:caption.dataset.defaultText;
  }
  $$('.media-shell').forEach(shell=>{
    const key=shell.dataset.clip;const video=shell.querySelector('video');
    video.addEventListener('error',()=>{if(!video.getAttribute('src'))return;video.hidden=true;shell.querySelector('img').hidden=false;shell.classList.remove('has-video');shell.querySelector('.media-label').textContent='CLIP UNAVAILABLE · SHOWING CONCEPT REFERENCE';const footer=shell.closest('.slide').querySelector('.slide-bottom>span:last-child');footer.textContent='Recording could not load. The visual shown is an illustrative concept reference.';notify('That clip could not play. Try an H.264 MP4, or check its published path.');});
    shell.querySelector('.media-expand').addEventListener('click',()=>{const expanded=shell.classList.contains('expanded');collapseMedia();if(!expanded){shell.classList.add('expanded');shell.querySelector('.media-expand').textContent='Close ✕';}});
    const configured=config.clips?.[key];if(configured){try{const u=new URL(configured,location.href);if(['http:','https:','file:'].includes(u.protocol))setClip(key,configured);}catch{}}
  });
  $$('[data-upload]').forEach(input=>input.addEventListener('change',()=>{const file=input.files[0];if(!file)return;if(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v)$/i.test(file.name)){notify('Choose a video file. H.264 MP4 is recommended.');input.value='';return;}const key=input.dataset.upload;if(localClips.has(key))URL.revokeObjectURL(localClips.get(key));const url=URL.createObjectURL(file);localClips.set(key,url);setClip(key,url,true,file.name);notify('Clip added for this tab. No file was uploaded.');}));
  $$('[data-remove]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.remove;if(localClips.has(key)){URL.revokeObjectURL(localClips.get(key));localClips.delete(key);}$(`[data-upload="${key}"]`).value='';setClip(key,config.clips?.[key]||'');}));
  window.addEventListener('pagehide',()=>{$$('video').forEach(v=>v.pause());});
  document.addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    if($('dialog[open]'))return;
    if(/INPUT|TEXTAREA|SELECT|VIDEO/.test(e.target.tagName)||e.target.isContentEditable)return;
    if(e.key===' '&&/BUTTON|A/.test(e.target.tagName))return;
    if(e.key==='Escape'){collapseMedia();if(!document.fullscreenElement){document.body.classList.remove('in-presentation');$('#present-btn').textContent='Present ⛶';}return;}
    if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();go(current+1);}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(current-1);}
    else if(e.key==='Home'){e.preventDefault();go(0);}
    else if(e.key==='End'){e.preventDefault();go(slides.length-1);}
    else if(e.key.toLowerCase()==='o'){e.preventDefault();openDialog('#overview');}
    else if(e.key.toLowerCase()==='n'){e.preventDefault();openDialog('#notes');}
    else if(e.key.toLowerCase()==='f'){e.preventDefault();present();}
    else if(e.key===' '){e.preventDefault();const v=slides[current].querySelector('video:not([hidden])');if(v){if(v.paused)v.play().catch(()=>notify('Use the video play button to start this clip.'));else v.pause();}else go(current+1);}
  });
  window.addEventListener('hashchange',()=>{const i=Number(location.hash.slice(1))-1;if(Number.isInteger(i)&&i>=0&&i<slides.length)go(i,false);});
  const initial=Number(location.hash.slice(1))-1;go(Number.isInteger(initial)&&initial>=0&&initial<slides.length?initial:0,false);
})();
