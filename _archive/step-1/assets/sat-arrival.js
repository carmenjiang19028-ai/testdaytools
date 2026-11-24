(() => {
  const tool = document.querySelector("[data-sat-arrival]");
  if (!tool) return;
  const get = name => tool.querySelector(`[data-arrival-${name}]`);
  const form = tool.querySelector("form");
  const fields = [get("time"), get("travel"), get("walk"), get("buffer")];
  const result = get("result");
  const status = get("status");
  const note = "Enter your confirmed arrival time and the three durations.";
  const clearResult = () => {
    result.hidden = true;
    status.textContent = note;
    fields.forEach(field => field.removeAttribute("aria-invalid"));
  };
  const showTime = (minutes) => {
    const clock = (minutes + 1440) % 1440;
    const hour = Math.floor(clock / 60);
    const minute = String(clock % 60).padStart(2, "0");
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}${minutes < 0 ? " (previous day)" : ""}`;
  };
  form.addEventListener("input", clearResult);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearResult();
    const invalid = fields.find(field => !field.validity.valid || !Number.isFinite(field.valueAsNumber));
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      status.textContent = invalid === fields[0] ? "Enter the confirmed arrival time in hours and minutes."
        : `Enter a whole number of minutes from 0 to ${invalid.max} in the highlighted field.`;
      invalid.focus();
      return;
    }
    const [time, travel, walk, buffer] = fields.map(field => field.valueAsNumber);
    const target = time / 60000 - buffer;
    const site = target - walk;
    const depart = showTime(site - travel);
    get("depart").textContent = depart;
    get("site").textContent = showTime(site);
    get("target").textContent = showTime(target);
    result.hidden = false;
    status.textContent = `Leave by ${depart}. ${buffer ? `Your plan includes a ${buffer}-minute buffer.` : "No extra buffer is included."}`;
    if (status.getBoundingClientRect().bottom > window.innerHeight) {
      status.scrollIntoView({ block: "center", behavior: "instant" });
    }
  });
  get("controls").hidden = false;
})();
