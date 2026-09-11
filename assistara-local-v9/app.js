const form = document.getElementById("leadForm");
const success = document.getElementById("successMsg");

if (form && success) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    success.hidden = false;
    const button = form.querySelector("button");
    button.textContent = "Request captured ✓";
    button.disabled = true;
    success.scrollIntoView({behavior:"smooth", block:"nearest"});
  });
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
    if (resultLabels[2]) resultLabels[2].textContent = "VIRTUAL ASSISTANT COST / MONTH";

    if (note) note.textContent = "Virtual assistant cost is estimated at $28/hour. Illustrative only.";
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
