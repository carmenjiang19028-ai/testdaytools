const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../assets/app.js"), "utf8");

function storage(values = new Map()) {
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function control(value = "") {
  const listeners = new Map();
  return {
    value,
    addEventListener: (name, callback) => listeners.set(name, callback),
    fire: (name) => listeners.get(name)?.(),
  };
}

function loadApp({ session = storage(), local = storage(), pathname = "/sat-score-goal-planner.html", analytics = true } = {}) {
  const events = [];
  const timers = [];
  let now = 1000000;
  const controls = new Map([
    ["[data-goal-current]", control("1100")],
    ["[data-goal-target]", control("1300")],
    ["[data-goal-weeks]", control("8")],
    ["[data-goal-hours]", control("5")],
    ["[data-goal-button]", control()],
    ["[data-goal-save]", control()],
    ["[data-goal-saved-status]", control()],
  ]);
  const widget = { querySelector: (selector) => controls.get(selector) ?? null };
  const window = {
    location: { pathname, origin: "https://testdaytools.com", href: `https://testdaytools.com${pathname}` },
    sessionStorage: session,
    localStorage: local,
    addEventListener() {},
    setTimeout(callback) { timers.push(callback); return timers.length; },
  };
  if (analytics) window.gtag = (...args) => events.push(args);
  const context = vm.createContext({
    window,
    localStorage: local,
    URL,
    Date: class extends Date { static now() { return now; } },
    document: {
      querySelectorAll: (selector) => selector === "[data-sat-goal-planner]" ? [widget] : [],
      querySelector: () => null,
      addEventListener() {},
    },
  });
  vm.runInContext(source, context);
  return {
    events,
    controls,
    track: (name, params) => context.trackToolEvent(name, params),
    tick() { while (timers.length) timers.shift()(); },
    advance(milliseconds) { now += milliseconds; },
    milestones: () => events.filter((event) => event[1] === "study_value_milestone"),
  };
}

test("SAT goal generation followed by a successful save records the second action", () => {
  const app = loadApp();
  assert.equal(app.events.length, 0);
  app.controls.get("[data-goal-button]").fire("click");
  app.tick();
  assert.equal(app.milestones().length, 0);
  app.controls.get("[data-goal-save]").fire("click");
  app.tick();
  assert.equal(app.milestones().length, 1);
  const milestone = app.milestones()[0][2];
  assert.equal(milestone.milestone, "second_tool_action");
  assert.equal(milestone.first_action, "sat_goal_generated");
  assert.equal(milestone.second_action, "sat_goal_saved");
  assert.equal(milestone.page_path, "/sat-score-goal-planner.html");
  assert.equal(milestone.action_index, 2);
});

test("restoring a saved plan and editing an input do not count as explicit actions", () => {
  const local = storage();
  local.setItem("testdaytools_sat_goal_plan_v1", JSON.stringify({ current: 1200, target: 1400, weeks: 6, hours: 4 }));
  const app = loadApp({ local });
  assert.equal(app.controls.get("[data-goal-current]").value, 1200);
  app.controls.get("[data-goal-current]").fire("input");
  app.tick();
  assert.equal(app.events.length, 0);
});

test("events emitted by one action are grouped and the milestone fires only once", () => {
  const app = loadApp();
  app.track("resource_download");
  app.track("study_next_step_click");
  app.tick();
  assert.equal(app.milestones().length, 0);
  app.track("quiz_start");
  app.tick();
  assert.equal(app.milestones().length, 1);
  assert.equal(app.milestones()[0][2].first_action, "resource_download+study_next_step_click");
  app.track("resource_print");
  app.tick();
  assert.equal(app.milestones().length, 1);
});

test("a goal plan can be the first action before navigating to another tool", () => {
  const session = storage();
  const first = loadApp({ session });
  first.controls.get("[data-goal-button]").fire("click");
  first.tick();
  const next = loadApp({ session, pathname: "/road-signs-practice-test.html" });
  next.track("quiz_start");
  next.tick();
  assert.equal(next.milestones().length, 1);
  assert.equal(next.milestones()[0][2].first_action, "sat_goal_generated");
  assert.equal(next.milestones()[0][2].page_path, "/road-signs-practice-test.html");
});

test("an expired activity window starts a new action count", () => {
  const app = loadApp();
  app.track("quiz_start");
  app.tick();
  app.advance(30 * 60 * 1000 + 1);
  app.track("resource_download");
  app.tick();
  assert.equal(app.milestones().length, 0);
  app.track("resource_print");
  app.tick();
  assert.equal(app.milestones().length, 1);
  assert.equal(app.milestones()[0][2].first_action, "resource_download");
});

test("a failed local save does not count as a completed action", () => {
  const local = { getItem: () => null, setItem() { throw new Error("Storage blocked"); } };
  const app = loadApp({ local });
  app.controls.get("[data-goal-button]").fire("click");
  app.tick();
  app.controls.get("[data-goal-save]").fire("click");
  app.tick();
  assert.equal(app.events.some((event) => event[1] === "sat_goal_saved"), false);
  assert.equal(app.milestones().length, 0);
});

test("the planner still works when analytics is unavailable", () => {
  const app = loadApp({ analytics: false });
  app.controls.get("[data-goal-button]").fire("click");
  app.controls.get("[data-goal-save]").fire("click");
  app.tick();
  assert.equal(app.events.length, 0);
  assert.equal(app.controls.get("[data-goal-saved-status]").hidden, false);
});
