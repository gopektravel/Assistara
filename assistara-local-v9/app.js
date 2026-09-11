const LEAD_ENDPOINT = "https://script.google.com/macros/s/AKfycbzrCdpuv2z7BGYEIKOJjDx6V6pzOatdtnQ_xFl6fH8NITuJTmbPuNQtI7gux1EU7-rl/exec";

const form = document.getElementById("leadForm");
const success = document.getElementById("successMsg");

if (form && success) {
  const note = form.querySelector(".form-note");
  const button = form.querySelector('button[type="submit"]');
  if (note) note.textContent = "We’ll review your request and follow up with the next step.";
  success.innerHTML = `<b>Thanks — your request is in.</b><span>We’ll review what you want to delegate and follow up with the next step.</span>`;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = new URLSearchParams();
    payload.set("name", formData.get("name") || "");
    payload.set("email", formData.get("email") || "");
    payload.set("company", formData.get("company") || "");
    payload.set("tasks", formData.get("tasks") || "");
    payload.set("support", formData.get("hours") || "Not sure yet");
    const originalText = button.textContent;
    button.textContent = "Sending…";
    button.disabled = true;
    success.hidden = true;
    try {
      await fetch(LEAD_ENDPOINT, {method: "POST", mode: "no-cors", body: payload});
      button.textContent = "Request sent ✓";
      success.hidden = false;
      form.reset();
      success.scrollIntoView({behavior:"smooth", block:"nearest"});
    } catch (error) {
      button.textContent = originalText;
      button.disabled = false;
      success.innerHTML = `<b>Couldn’t send that yet.</b><span>Please try again in a moment.</span>`;
      success.hidden = false;
    }
  });
}

const matchCopy = document.querySelector(".match-copy");
if (matchCopy) {
  const kicker = matchCopy.querySelector(".section-kicker");
  const title = matchCopy.querySelector("h2");
  const paragraph = matchCopy.querySelector("p");
  const points = matchCopy.querySelectorAll(".match-points div");
  if (kicker) kicker.textContent = "FIND YOUR VIRTUAL ASSISTANT";
  if (title) title.textContent = "Ready to buy back your time?";
  if (paragraph) paragraph.textContent = "Tell us what keeps pulling you back into the day-to-day. We’ll help define what can be delegated and match you with a trained virtual assistant who can take ownership of it.";
  if (points[0]) points[0].innerHTML = "<span>✓</span> Get repeatable work off your plate";
  if (points[1]) points[1].innerHTML = "<span>✓</span> Protect more time for growth, decisions and relationships";
  if (points[2]) points[2].innerHTML = "<span>✓</span> Get matched around the work you actually need handled";
}

const hoursRange = document.getElementById("hoursRange");
const valueRange = document.getElementById("valueRange");
const delegateRange = document.getElementById("delegateRange");

if (hoursRange && valueRange) {
  const calculator = document.getElementById("savingsCalculator");
  const hoursOut = document.getElementById("hoursOut");
  const valueOut = document.getElementById("valueOut");
  const timeYear = document.getElementById("timeYear");
  const valueYear = document.getElementById("valueYear");
  const netYear = document.getElementById("netYear");
  const usd = new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:0});
  const DELEGATION_RATE = 28;
  if (calculator) {
    const title = calculator.querySelector("h3");
    const intro = calculator.querySelector(".calc-intro");
    const labels = calculator.querySelectorAll(".calc-control");
    const resultLabels = calculator.querySelectorAll(".calc-results small");
    const note = calculator.querySelector(".calc-note");
    const topline = calculator.querySelector(".calc-topline small");
    if (topline) topline.textContent = "TIME COST CALCULATOR";
    if (title) title.textContent = "How much is doing it yourself costing you?";
    if (intro) intro.textContent = "Answer two simple questions. See how much time you could get back, and what it would cost to hand that work off.";
    if (labels[0]) labels[0].querySelector("b").textContent = "How many hours a week do you spend on work someone else could handle?";
    if (labels[1]) labels[1].querySelector("b").textContent = "What is one hour of your time worth?";
    if (labels[2]) labels[2].style.display = "none";
    if (resultLabels[0]) resultLabels[0].textContent = "HOURS YOU GET BACK / YEAR";
    if (resultLabels[1]) resultLabels[1].textContent = "WHAT YOUR TIME IS WORTH / YEAR";
    if (resultLabels[2]) resultLabels[2].textContent = "ESTIMATED VIRTUAL ASSISTANT COST / MONTH";
    if (note) note.textContent = "Estimate only. Final pricing depends on your needs and level of support.";
  }
  function updateCalculator() {
    const hours = Math.max(1, Number(hoursRange.value) || 1);
    const ownValue = Math.max(0, Number(valueRange.value) || 0);
    const yearlyHours = hours * 52;
    const ownTimeValue = yearlyHours * ownValue;
    const monthlyAssistantCost = (yearlyHours * DELEGATION_RATE) / 12;
    hoursOut.textContent = `${hours} ${hours === 1 ? "hr" : "hrs"}`;
    valueOut.textContent = usd.format(ownValue);
    timeYear.textContent = `${yearlyHours.toLocaleString("en-US")} hrs`;
    valueYear.textContent = usd.format(ownTimeValue);
    netYear.textContent = `${usd.format(monthlyAssistantCost)} / mo`;
  }
  [hoursRange, valueRange].forEach((input) => input.addEventListener("input", updateCalculator));
  updateCalculator();
}

const navLinks = document.querySelector(".nav-links");
if (navLinks && !navLinks.querySelector('[href="/academy"]')) {
  const academyNav = document.createElement("a");
  academyNav.href = "/academy";
  academyNav.textContent = "Become a Virtual Assistant";
  navLinks.appendChild(academyNav);
}

const matchSection = document.querySelector(".match-wrap");
if (matchSection && !document.getElementById("academyTeaser")) {
  const teaser = document.createElement("section");
  teaser.id = "academyTeaser";
  teaser.style.cssText = "padding:34px 0;background:#171717;color:#fff";
  teaser.innerHTML = `<div class="shell" style="display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap"><div style="max-width:760px"><div class="section-kicker" style="color:#aaa;margin-bottom:10px">WANT TO BE ON THE OTHER SIDE?</div><h3 style="font-size:clamp(25px,3vw,38px);letter-spacing:-.035em;margin-bottom:8px">Build a skill you can sell from anywhere.</h3><p style="margin:0;color:#bbb;font-size:17px;line-height:1.55">Learn professional virtual assistant skills, build proof, learn how to find clients and become eligible to be considered for suitable Assistara opportunities.</p></div><a class="btn btn-yellow" href="/academy">Become a Virtual Assistant →</a></div>`;
  matchSection.parentNode.insertBefore(teaser, matchSection);
}
