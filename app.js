const favicon = document.querySelector('link[rel="icon"]') || document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = '/assistara-logo.svg?v=4';
if (!favicon.parentNode) document.head.appendChild(favicon);

const shortcutFavicon = document.querySelector('link[rel="shortcut icon"]') || document.createElement('link');
shortcutFavicon.rel = 'shortcut icon';
shortcutFavicon.type = 'image/svg+xml';
shortcutFavicon.href = '/assistara-logo.svg?v=4';
if (!shortcutFavicon.parentNode) document.head.appendChild(shortcutFavicon);

const criticalMobileStyles = document.createElement("style");
criticalMobileStyles.textContent = `
.mobile-academy-cta{display:none}
.objection-wrap{display:none!important}
.success{display:none!important}
@media (max-width:760px){
  html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
  .logo-strip{display:none!important}
  .float-card{display:none!important}
  .hero-visual{overflow:hidden!important;width:100%!important;max-width:100%!important;min-height:auto!important}
  .system-card{width:100%!important;max-width:100%!important;transform:none!important}
  .nav-links{display:none!important}
  .site-header{padding:10px 0 6px!important}
  .nav{margin-bottom:0!important}
  .mobile-academy-cta{display:flex!important;position:static!important;transform:none!important;width:max-content!important;max-width:calc(100% - 40px)!important;margin:14px auto 0!important;z-index:20!important;align-items:center!important;justify-content:center!important;background:#ffd51f!important;color:#171717!important;border-radius:999px!important;padding:11px 18px!important;font-size:12px!important;font-weight:800!important;line-height:1.1!important;white-space:nowrap!important;box-shadow:0 8px 20px rgba(0,0,0,.08)!important}
  .hero{grid-template-columns:1fr!important;max-width:100%!important;overflow:hidden!important;padding-top:18px!important}
  .hero-copy{min-width:0!important}
  .shell{max-width:100%!important}
  .eyebrow{margin-top:0!important;margin-bottom:0!important}
  h1{margin-top:20px!important;margin-bottom:18px!important}
  .hero-sub{margin-top:0!important;margin-bottom:0!important}
  .hero-actions{margin-top:24px!important;margin-bottom:0!important}
  .trust-row{margin-top:22px!important}
}
`;
document.head.appendChild(criticalMobileStyles);

const LEAD_ENDPOINT = "https://script.google.com/macros/s/AKfycbzrCdpuv2z7BGYEIKOJjDx6V6pzOatdtnQ_xFl6fH8NITuJTmbPuNQtI7gux1EU7-rl/exec";

for (const brand of document.querySelectorAll('.brand')) {
  brand.innerHTML = `<img class="mark" src="/assistara-logo.svg" alt=""><span>Assistaras</span>`;
}

const mainNav = document.querySelector('.nav');
const siteHeader = document.querySelector('.site-header');
if (mainNav && siteHeader && !document.querySelector('.mobile-academy-cta')) {
  const mobileAcademy = document.createElement('a');
  mobileAcademy.className = 'mobile-academy-cta';
  mobileAcademy.href = '/academy';
  mobileAcademy.textContent = 'Become a Virtual Assistant →';
  siteHeader.insertAdjacentElement('afterend', mobileAcademy);
}

const form = document.getElementById("leadForm");
const success = document.getElementById("successMessage");
if (form && success) {
  const note = form.querySelector(".form-note");
  const button = form.querySelector('button[type="submit"]');
  success.hidden = true;
  success.style.setProperty("display", "none", "important");
  if (note) note.textContent = "We’ll review your request and follow up with the next step.";
  success.innerHTML = `<b>Request received. We’ll be in touch soon.</b>`;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form), payload = new URLSearchParams();
    payload.set("name",formData.get("name")||"");
    payload.set("email",formData.get("email")||"");
    payload.set("company",formData.get("company")||"");
    payload.set("tasks",formData.get("tasks")||"");
    payload.set("support",formData.get("hours")||"Not sure yet");
    const originalText = button.textContent;
    button.textContent = "Sending…";
    button.disabled = true;
    success.hidden = true;
    success.style.setProperty("display", "none", "important");
    try {
      await fetch(LEAD_ENDPOINT,{method:"POST",mode:"no-cors",body:payload});
      button.textContent = "Request sent ✓";
      success.hidden = false;
      success.style.setProperty("display", "flex", "important");
      form.reset();
      success.scrollIntoView({behavior:"smooth",block:"nearest"});
    } catch(error) {
      button.textContent = originalText;
      button.disabled = false;
      success.innerHTML = `<b>Couldn’t send that yet.</b><span>Please try again in a moment.</span>`;
      success.hidden = false;
      success.style.setProperty("display", "flex", "important");
    }
  });
}
const matchCopy=document.querySelector(".match-copy"); if(matchCopy){const kicker=matchCopy.querySelector(".section-kicker"),title=matchCopy.querySelector("h2"),paragraph=matchCopy.querySelector("p"),points=matchCopy.querySelectorAll(".match-points div");if(kicker)kicker.textContent="FIND YOUR VIRTUAL ASSISTANT";if(title)title.textContent="Ready to buy back your time?";if(paragraph)paragraph.textContent="Tell us what keeps pulling you back into the day-to-day. We’ll help define what can be delegated and match you with a trained virtual assistant who can take ownership of it.";if(points[0])points[0].innerHTML="<span>✓</span> Get repeatable work off your plate";if(points[1])points[1].innerHTML="<span>✓</span> Protect more time for growth, decisions and relationships";if(points[2])points[2].innerHTML="<span>✓</span> Get matched around the work you actually need handled"}
const hoursRange=document.getElementById("hoursRange"),valueRange=document.getElementById("valueRange");if(hoursRange&&valueRange){const calculator=document.getElementById("savingsCalculator"),hoursOut=document.getElementById("hoursOut"),valueOut=document.getElementById("valueOut"),timeYear=document.getElementById("timeYear"),valueYear=document.getElementById("valueYear"),netYear=document.getElementById("netYear"),usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}),DELEGATION_RATE=28;if(calculator){const title=calculator.querySelector("h3"),intro=calculator.querySelector(".calc-intro"),labels=calculator.querySelectorAll(".calc-control"),resultLabels=calculator.querySelectorAll(".calc-results small"),note=calculator.querySelector(".calc-note"),topline=calculator.querySelector(".calc-topline small");if(topline)topline.textContent="TIME COST CALCULATOR";if(title)title.textContent="How much is doing it yourself costing you?";if(intro)intro.textContent="Answer two simple questions. See how much time you could get back, and what it would cost to hand that work off.";if(labels[0])labels[0].querySelector("b").textContent="How many hours a week do you spend on work someone else could handle?";if(labels[1])labels[1].querySelector("b").textContent="What is one hour of your time worth?";if(labels[2])labels[2].style.display="none";if(resultLabels[0])resultLabels[0].textContent="HOURS YOU GET BACK / YEAR";if(resultLabels[1])resultLabels[1].textContent="WHAT YOUR TIME IS WORTH / YEAR";if(resultLabels[2])resultLabels[2].textContent="ESTIMATED VIRTUAL ASSISTANT COST / MONTH";if(note)note.textContent="Estimate only. Final pricing depends on your needs and level of support."}function updateCalculator(){const hours=Math.max(1,Number(hoursRange.value)||1),ownValue=Math.max(0,Number(valueRange.value)||0),yearlyHours=hours*52,ownTimeValue=yearlyHours*ownValue,monthlyAssistantCost=yearlyHours*DELEGATION_RATE/12;hoursOut.textContent=`${hours} ${hours===1?"hr":"hrs"}`;valueOut.textContent=usd.format(ownValue);timeYear.textContent=`${yearlyHours.toLocaleString("en-US")} hrs`;valueYear.textContent=usd.format(ownTimeValue);netYear.textContent=`${usd.format(monthlyAssistantCost)} / mo`}[hoursRange,valueRange].forEach(input=>input.addEventListener("input",updateCalculator));updateCalculator()}
const navLinks=document.querySelector(".nav-links");if(navLinks&&!navLinks.querySelector('[href="/academy"]')){const academyNav=document.createElement("a");academyNav.href="/academy";academyNav.textContent="Become a Virtual Assistant";navLinks.appendChild(academyNav)}
const matchSection=document.querySelector(".match-wrap");if(matchSection&&!document.getElementById("academyTeaser")){const teaser=document.createElement("section");teaser.id="academyTeaser";teaser.style.cssText="padding:34px 0;background:#171717;color:#fff";teaser.innerHTML=`<div class="shell" style="display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap"><div style="max-width:760px"><div class="section-kicker" style="color:#aaa;margin-bottom:10px">WANT TO BE ON THE OTHER SIDE?</div><h3 style="font-size:clamp(25px,3vw,38px);letter-spacing:-.035em;margin-bottom:8px">Build a skill you can sell from anywhere.</h3><p style="margin:0;color:#bbb;font-size:17px;line-height:1.55">Learn professional virtual assistant skills, build proof, learn how to find clients and become eligible to be considered for suitable Assistaras opportunities.</p></div><a class="btn btn-yellow" href="/academy">Become a Virtual Assistant →</a></div>`;matchSection.parentNode.insertBefore(teaser,matchSection)}

const objectionSection=document.querySelector('.objection-wrap');
if(objectionSection){objectionSection.remove();}

const problemSection=document.querySelector('.problem');
if(problemSection){
  const title=problemSection.querySelector('h2');
  const lead=problemSection.querySelector('.section-lead');
  if(title) title.innerHTML="Your best hours are going to your cheapest work.";
  if(lead) lead.innerHTML="<strong>Doing everything yourself is not free.</strong> Every hour spent on work someone else could handle is an hour you can’t spend <strong>selling, creating, negotiating or growing.</strong>";
}