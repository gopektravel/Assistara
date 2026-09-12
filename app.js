document.querySelectorAll(".form-note").forEach(el=>el.remove());

const favicon=document.querySelector('link[rel="icon"]')||document.createElement('link');
favicon.rel='icon';favicon.type='image/svg+xml';favicon.href='/assistara-logo.svg?v=6';
if(!favicon.parentNode)document.head.appendChild(favicon);

const shortcutFavicon=document.querySelector('link[rel="shortcut icon"]')||document.createElement('link');
shortcutFavicon.rel='shortcut icon';shortcutFavicon.type='image/svg+xml';shortcutFavicon.href='/assistara-logo.svg?v=6';
if(!shortcutFavicon.parentNode)document.head.appendChild(shortcutFavicon);

const criticalMobileStyles=document.createElement('style');
criticalMobileStyles.textContent=`
.objection-wrap{display:none!important}
.success{display:none!important}
.mobile-academy-cta{display:none!important}
@media(max-width:760px){
  html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
  .announcement{display:none!important}
  .mobile-academy-cta{display:none!important}
  .logo-strip{display:none!important}
  .float-card{display:none!important}
  .nav-links{display:none!important}
  .nav>.btn,.nav .btn-small{display:none!important}
  .site-header{padding:10px 0!important;background:rgba(251,250,246,.97)!important}
  .site-header .shell{width:calc(100% - 28px)!important}
  .nav{min-height:60px!important;margin:0!important;border-radius:20px!important;padding:9px 14px!important}
  .nav .brand{font-size:19px!important;gap:9px!important}
  .nav .mark{width:34px!important;height:34px!important}
  .hero{display:block!important;max-width:100%!important;padding:42px 0 70px!important;overflow:hidden!important}
  .hero-copy{min-width:0!important;max-width:100%!important}
  .hero .eyebrow{display:none!important}
  .hero-proofline{display:none!important}
  .hero h1{font-size:clamp(54px,15vw,68px)!important;line-height:.94!important;letter-spacing:-.06em!important;margin:0 0 24px!important;max-width:360px!important}
  .hero h1 span:after{height:12px!important;bottom:1px!important}
  .hero-sub{font-size:18px!important;line-height:1.5!important;color:#5f5b57!important;max-width:390px!important;margin:0!important}
  .hero-actions{display:block!important;margin-top:30px!important}
  .hero-actions .btn{width:100%!important;min-height:58px!important;font-size:17px!important;padding:17px 22px!important}
  .hero-actions .text-link{display:none!important}
  .trust-row{display:none!important}
  .hero-visual{display:none!important}
}
`;
document.head.appendChild(criticalMobileStyles);

for(const brand of document.querySelectorAll('.brand')){
  brand.innerHTML=`<img class="mark" src="/assistara-logo.svg" alt=""><span>Assistara</span>`;
}

if(window.matchMedia('(max-width:760px)').matches){
  document.querySelectorAll('.mobile-academy-cta').forEach(el=>el.remove());
  const heroSub=document.querySelector('.hero-sub');
  if(heroSub)heroSub.textContent='Delegate the repeatable work. Keep your time for what moves the business forward.';
}

const LEAD_ENDPOINT='https://script.google.com/macros/s/AKfycbzrCdpuv2z7BGYEIKOJjDx6V6pzOatdtnQ_xFl6fH8NITuJTmbPuNQtI7gux1EU7-rl/exec';
const form=document.getElementById('leadForm');
const success=document.getElementById('successMessage');
if(form&&success){
  form.querySelector('.form-note')?.remove();
  const button=form.querySelector('button[type="submit"]');
  success.hidden=true;
  success.style.setProperty('display','none','important');
  success.innerHTML='<b>Request received. We’ll be in touch soon.</b>';
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const fd=new FormData(form),payload=new URLSearchParams();
    payload.set('name',fd.get('name')||'');
    payload.set('email',fd.get('email')||'');
    payload.set('company',fd.get('company')||'');
    payload.set('tasks',fd.get('tasks')||'');
    payload.set('support',fd.get('hours')||'Not sure yet');
    const original=button.textContent;
    button.textContent='Sending…';button.disabled=true;
    success.hidden=true;success.style.setProperty('display','none','important');
    try{
      await fetch(LEAD_ENDPOINT,{method:'POST',mode:'no-cors',body:payload});
      button.textContent='Request sent ✓';
      success.hidden=false;success.style.setProperty('display','flex','important');
      form.reset();success.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){
      button.textContent=original;button.disabled=false;
      success.innerHTML='<b>Couldn’t send that yet.</b><span>Please try again in a moment.</span>';
      success.hidden=false;success.style.setProperty('display','flex','important');
    }
  });
}

const matchCopy=document.querySelector('.match-copy');
if(matchCopy){
  const kicker=matchCopy.querySelector('.section-kicker'),title=matchCopy.querySelector('h2'),paragraph=matchCopy.querySelector('p'),points=matchCopy.querySelectorAll('.match-points div');
  if(kicker)kicker.textContent='FIND YOUR VIRTUAL ASSISTANT';
  if(title)title.textContent='Ready to buy back your time?';
  if(paragraph)paragraph.textContent='Tell us what keeps pulling you back into the day-to-day. We’ll help define what can be delegated and match you with a trained virtual assistant who can take ownership of it.';
  if(points[0])points[0].innerHTML='<span>✓</span> Get repeatable work off your plate';
  if(points[1])points[1].innerHTML='<span>✓</span> Protect more time for growth, decisions and relationships';
  if(points[2])points[2].innerHTML='<span>✓</span> Get matched around the work you actually need handled';
}

const hoursRange=document.getElementById('hoursRange'),valueRange=document.getElementById('valueRange');
if(hoursRange&&valueRange){
  const calculator=document.getElementById('savingsCalculator'),hoursOut=document.getElementById('hoursOut'),valueOut=document.getElementById('valueOut'),timeYear=document.getElementById('timeYear'),valueYear=document.getElementById('valueYear'),netYear=document.getElementById('netYear'),usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}),RATE=28;
  if(calculator){
    const title=calculator.querySelector('h3'),intro=calculator.querySelector('.calc-intro'),labels=calculator.querySelectorAll('.calc-control'),results=calculator.querySelectorAll('.calc-results small'),note=calculator.querySelector('.calc-note'),top=calculator.querySelector('.calc-topline small');
    if(top)top.textContent='TIME COST CALCULATOR';
    if(title)title.textContent='How much is doing it yourself costing you?';
    if(intro)intro.textContent='Answer two simple questions. See how much time you could get back, and what it would cost to hand that work off.';
    if(labels[0])labels[0].querySelector('b').textContent='How many hours a week do you spend on work someone else could handle?';
    if(labels[1])labels[1].querySelector('b').textContent='What is one hour of your time worth?';
    if(labels[2])labels[2].style.display='none';
    if(results[0])results[0].textContent='HOURS YOU GET BACK / YEAR';
    if(results[1])results[1].textContent='WHAT YOUR TIME IS WORTH / YEAR';
    if(results[2])results[2].textContent='ESTIMATED VIRTUAL ASSISTANT COST / MONTH';
    if(note)note.textContent='Estimate only. Final pricing depends on your needs and level of support.';
  }
  function updateCalculator(){
    const h=Math.max(1,Number(hoursRange.value)||1),v=Math.max(0,Number(valueRange.value)||0),yh=h*52;
    hoursOut.textContent=`${h} ${h===1?'hr':'hrs'}`;
    valueOut.textContent=usd.format(v);
    timeYear.textContent=`${yh.toLocaleString('en-US')} hrs`;
    valueYear.textContent=usd.format(yh*v);
    netYear.textContent=`${usd.format(yh*RATE/12)} / mo`;
  }
  [hoursRange,valueRange].forEach(i=>i.addEventListener('input',updateCalculator));updateCalculator();
}

const navLinks=document.querySelector('.nav-links');
if(navLinks&&!navLinks.querySelector('[href="/academy"]')){
  const a=document.createElement('a');a.href='/academy';a.textContent='Become a Virtual Assistant';navLinks.appendChild(a);
}

const matchSection=document.querySelector('.match-wrap');
if(matchSection&&!document.getElementById('academyTeaser')){
  const teaser=document.createElement('section');teaser.id='academyTeaser';teaser.style.cssText='padding:34px 0;background:#171717;color:#fff';
  teaser.innerHTML=`<div class="shell" style="display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap"><div style="max-width:760px"><div class="section-kicker" style="color:#aaa;margin-bottom:10px">WANT TO BE ON THE OTHER SIDE?</div><h3 style="font-size:clamp(25px,3vw,38px);letter-spacing:-.035em;margin-bottom:8px">Build a skill you can sell from anywhere.</h3><p style="margin:0;color:#bbb;font-size:17px;line-height:1.55">Learn professional virtual assistant skills, build proof, learn how to find clients and become eligible to be considered for suitable Assistara opportunities.</p></div><a class="btn btn-yellow" href="/academy">Become a Virtual Assistant →</a></div>`;
  matchSection.parentNode.insertBefore(teaser,matchSection);
}

const objection=document.querySelector('.objection-wrap');if(objection)objection.remove();
const problem=document.querySelector('.problem');
if(problem){
  const t=problem.querySelector('h2'),l=problem.querySelector('.section-lead');
  if(t)t.innerHTML='Your best hours are going to your cheapest work.';
  if(l)l.innerHTML='<strong>Doing everything yourself is not free.</strong> Every hour spent on work someone else could handle is an hour you can’t spend <strong>selling, creating, negotiating or growing.</strong>';
}

const siteFooter=document.querySelector('body > footer');
if(siteFooter){
  siteFooter.innerHTML=`<div class="shell assistara-footer-main"><div class="assistara-footer-brand"><a class="brand" href="#top"><img class="mark" src="/assistara-logo.svg" alt=""><span>Assistara</span></a><p>Buy back your time. More room to grow. More freedom to live.</p></div><div class="assistara-footer-links"><span>EXPLORE</span><a href="#how">How it works</a><a href="#roles">What you can delegate</a><a href="/academy">Assistara Academy</a></div><div class="assistara-footer-contact"><span>NEED HELP?</span><a class="assistara-email" href="mailto:support@getassistara.com">support@getassistara.com <b>↗</b></a><a class="assistara-footer-cta" href="/academy">Become a Virtual Assistant <b>→</b></a></div></div><div class="shell assistara-footer-bottom"><span>© 2026 Assistara</span><span>Trained. Vetted. Matched around your work.</span></div>`;
}
