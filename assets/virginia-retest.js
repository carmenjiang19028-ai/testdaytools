(() => {
  const controls = document.querySelector("[data-va-retest-controls]");
  if (!controls) return;

  const form = controls.querySelector("form");
  const age = controls.querySelector("[data-va-retest-age]");
  const failures = controls.querySelector("[data-va-retest-failures]");
  const date = controls.querySelector("[data-va-retest-date]");
  const dateHint = document.querySelector("#virginia-retest-date-hint");
  const result = controls.querySelector("[data-va-retest-result]");
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: "long", day: "numeric", year: "numeric",
  });
  const defaultText = result.textContent;

  function virginiaToday() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const piece = (type) => parts.find(part => part.type === type).value;
    return `${piece("year")}-${piece("month")}-${piece("day")}`;
  }

  form.addEventListener("input", () => {
    const afterThree = failures.value === "three-plus";
    const turning = age.value === "turning";
    date.disabled = afterThree || turning;
    if (date.disabled) date.value = "";
    dateHint.textContent = afterThree ? "Not needed after three or more failures."
      : turning ? "Confirm an age transition with Virginia DMV." : "Use the date on your official exam record.";
    result.textContent = defaultText;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (failures.value === "three-plus") {
      result.textContent = "No date from this tool. If you already completed approved classroom training after your third failure, confirm your certificate with DMV. Otherwise, complete the required training before retesting.";
      return;
    }
    if (failures.value !== "one-two" || !age.value) {
      result.textContent = "Choose your age situation and how many official knowledge exams you failed.";
      return;
    }
    if (age.value === "turning") {
      result.textContent = "Confirm your birthday situation with Virginia DMV before booking. This tool does not select a date for an age transition.";
      return;
    }
    const failedOn = new Date(`${date.value}T00:00:00Z`);
    const today = virginiaToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || !Number.isFinite(failedOn.getTime())
        || failedOn.toISOString().slice(0, 10) !== date.value || date.value > today) {
      result.textContent = "Enter a valid past or current Virginia exam date.";
      return;
    }
    // The 15 complete days start after the failure date.
    failedOn.setUTCDate(failedOn.getUTCDate() + (age.value === "minor" ? 16 : 1));
    result.textContent = `Earliest by the waiting rule: ${dayFormatter.format(failedOn)}. Check office hours and appointment availability.`;
  });
  date.max = virginiaToday();
  controls.hidden = false;
})();
