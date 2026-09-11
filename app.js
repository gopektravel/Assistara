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

if (hoursRange && valueRange && delegateRange) {
  const hoursOut = document.getElementById("hoursOut");
  const valueOut = document.getElementById("valueOut");
  const delegateOut = document.getElementById("delegateOut");
  const timeYear = document.getElementById("timeYear");
  const valueYear = document.getElementById("valueYear");
  const netYear = document.getElementById("netYear");
  const euro = new Intl.NumberFormat("en-IE", {style:"currency", currency:"EUR", maximumFractionDigits:0});

  function updateCalculator() {
    const hours = Math.max(1, Number(hoursRange.value) || 1);
    const ownValue = Math.max(0, Number(valueRange.value) || 0);
    const delegationCost = Math.max(0, Number(delegateRange.value) || 0);
    const yearlyHours = hours * 52;
    const grossValue = yearlyHours * ownValue;
    const netValue = yearlyHours * Math.max(0, ownValue - delegationCost);

    hoursOut.textContent = `${hours} ${hours === 1 ? "hr" : "hrs"}`;
    valueOut.textContent = euro.format(ownValue);
    delegateOut.textContent = euro.format(delegationCost);
    timeYear.textContent = `${yearlyHours.toLocaleString("en-US")} hrs`;
    valueYear.textContent = euro.format(grossValue);
    netYear.textContent = euro.format(netValue);
  }

  [hoursRange, valueRange, delegateRange].forEach((input) => input.addEventListener("input", updateCalculator));
  updateCalculator();
}
