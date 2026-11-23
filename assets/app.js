function cleanAnalyticsValue(value, fallback = "unknown") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, 100);
}

function analyticsPathFromHref(href) {
  if (!href) return "";
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? `${url.pathname}${url.hash || ""}` : url.hostname;
  } catch (error) {
    return String(href).split("?")[0].slice(0, 100);
  }
}

const VALUE_PATH_STORAGE_KEY = "tdt-value-path:v1";
const VALUE_PATH_TIMEOUT_MS = 30 * 60 * 1000;
const VALUE_PATH_EVENTS = new Set([
  "quiz_start",
  "resource_download",
  "resource_print",
  "flashcard_mark",
  "study_state_change",
  "study_next_step_click",
  "sat_plan_generated",
  "sat_plan_saved",
  "sat_date_selected",
  "sat_august_plan_generated",
  "sat_august_plan_saved",
  "sat_goal_generated",
  "sat_goal_saved",
  "dmv_score_checked",
  "mastery_review_start",
]);
let pendingValueAction = null;

function meaningfulToolUse(eventName, params) {
  const pagePath = params.page_path || window.location.pathname || "/";
  let tool = "";
  if (eventName === "quiz_start") tool = "picture_quiz";
  if (eventName === "flashcard_mark") tool = "sign_flashcards";
  if (eventName === "dmv_score_checked") tool = "passing_score_calculator";
  if (["sat_goal_generated", "sat_goal_saved"].includes(eventName)) tool = "sat_goal_planner";
  if (["sat_plan_generated", "sat_plan_saved"].includes(eventName)) tool = "sat_date_planner";
  if (["sat_august_plan_generated", "sat_august_plan_saved"].includes(eventName)) tool = "sat_seasonal_planner";
  if (["resource_download", "resource_print"].includes(eventName)) {
    tool = pagePath === "/sat-test-dates-2026-2027.html" ? "sat_date_planner"
      : pagePath === "/sat-august-22-2026-planning.html" ? "sat_seasonal_planner"
      : "printable_resource";
  }
  if (!tool) return null;
  return { tool, pagePath, action: eventName, resource: params.resource || "" };
}

function readValuePathState() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(VALUE_PATH_STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.actions)) return { actions: [], toolUses: [], lastActionAt: 0 };
    if (saved.lastActionAt && Date.now() - saved.lastActionAt > VALUE_PATH_TIMEOUT_MS) {
      return { actions: [], toolUses: [], lastActionAt: 0 };
    }
    return {
      actions: saved.actions.slice(-20),
      toolUses: Array.isArray(saved.toolUses) ? saved.toolUses.filter((use) => use?.tool && use?.pagePath).slice(0, 10) : [],
      secondToolTracked: saved.secondToolTracked === true,
      lastActionAt: Number(saved.lastActionAt) || 0,
    };
  } catch (error) {
    return { actions: [], toolUses: [], lastActionAt: 0 };
  }
}

function writeValuePathState(state) {
  try {
    window.sessionStorage.setItem(VALUE_PATH_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Analytics remains optional when browser storage is blocked.
  }
}

function queueValuePathAction(eventName, params) {
  if (!VALUE_PATH_EVENTS.has(eventName)) return;
  if (!pendingValueAction) {
    pendingValueAction = {
      events: [],
      toolUses: [],
      pagePath: params.page_path,
      timer: window.setTimeout(flushValuePathAction, 0),
    };
  }
  pendingValueAction.events.push(eventName);
  const use = meaningfulToolUse(eventName, params);
  if (use) pendingValueAction.toolUses.push(use);
}

function flushValuePathAction() {
  const pending = pendingValueAction;
  pendingValueAction = null;
  if (!pending || typeof window.gtag !== "function") return;

  const state = readValuePathState();
  const actionName = [...new Set(pending.events)].join("+");
  state.actions.push({ name: actionName, at: Date.now() });
  state.actions = state.actions.slice(-20);
  state.lastActionAt = Date.now();
  // One gesture is one use; navigation and another mode of the same tool are not new tools.
  const use = pending.toolUses[0];
  if (use && !state.toolUses.some((previous) => previous.tool === use.tool)) state.toolUses.push(use);
  const secondToolReached = state.toolUses.length >= 2 && !state.secondToolTracked;
  if (secondToolReached) state.secondToolTracked = true;
  writeValuePathState(state);

  if (state.actions.length === 2) {
    window.gtag("event", "study_value_milestone", {
      page_path: pending.pagePath || window.location.pathname || "/",
      milestone: "second_tool_action",
      first_action: state.actions[0].name,
      second_action: actionName,
      action_index: 2,
      transport_type: "beacon",
    });
  }
  if (secondToolReached) {
    const first = state.toolUses[0];
    const second = state.toolUses[1];
    window.gtag("event", "study_second_tool_used", {
      page_path: second.pagePath,
      first_tool: first.tool,
      second_tool: second.tool,
      first_page_path: first.pagePath,
      first_action: first.action,
      second_action: second.action,
      first_resource: first.resource,
      tool: second.tool,
      source_section: first.tool,
      target_path: second.pagePath,
      section: first.tool,
      target: first.pagePath,
      activity_window: "browser_tab_30min",
      transport_type: "beacon",
    });
  }
}

window.addEventListener("pagehide", flushValuePathAction);

function trackToolEvent(eventName, params = {}) {
  if (typeof window.gtag !== "function") return;
  const safeParams = {
    page_path: window.location.pathname || "/",
    transport_type: "beacon",
  };

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "number" || typeof value === "boolean") {
      safeParams[key] = value;
      return;
    }
    safeParams[key] = cleanAnalyticsValue(value);
  });

  window.gtag("event", eventName, safeParams);
  queueValuePathAction(eventName, safeParams);
}

function initScoreEntryTracking() {
  document.querySelectorAll('a[href*="dmv-permit-test-passing-score-calculator.html"]').forEach((link) => {
    link.addEventListener("click", () => {
      let source = "internal_link";
      try {
        source = new URL(link.href, window.location.href).searchParams.get("source") || source;
      } catch (error) {
        // The destination still works when URL parsing is unavailable.
      }
      trackToolEvent("score_tool_entry_click", {
        source,
        target: analyticsPathFromHref(link.href),
      });
    });
  });

  document.querySelectorAll(".score-entry-grid a").forEach((link) => {
    link.addEventListener("click", () => {
      trackToolEvent("score_direct_answer_click", {
        answer: link.querySelector("span")?.textContent || "score_calculator",
        target: analyticsPathFromHref(link.href),
      });
    });
  });
}

const DMV_JOURNEY_STORAGE_KEY = "tdt-dmv-journey:v1";
const DMV_MASTERY_STORAGE_KEY = "tdt-dmv-mastery:v1";
const DMV_BASELINE_SIZE = 10;
const DAY_MS = 86400000;
const RECENT_PRACTICE_KEY = "tdt-recent-practice";

function createLocalPracticeId() {
  return Array.from(window.crypto.getRandomValues(new Uint32Array(4)),
    (part) => part.toString(16).padStart(8, "0")).join("");
}

function readRecentPractice() {
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_PRACTICE_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function recentPracticeHref(progress) {
  if (typeof progress?.href !== "string" || !/^[a-z0-9-]+\.html(?:\?[^#]*)?#practice$/.test(progress.href)) return "";
  if (!progress.draft) return progress.href;
  const href = new URL(progress.href, window.location.href);
  href.searchParams.set("resume", "1");
  return href.pathname.split("/").pop() + href.search + href.hash;
}

function normalizeDmvState(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function annotateDmvStateLink(link, option, path) {
  if (!link || !option) return;
  link.dataset.dmvStateLink = "true";
  link.dataset.dmvState = option.dataset.state || option.value || option.textContent.trim();
  link.dataset.dmvPath = path;
}

function localDayStamp(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readDmvMastery() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DMV_MASTERY_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        items: saved.items && typeof saved.items === "object" ? saved.items : {},
        updatedAt: Number(saved.updatedAt) || 0,
      };
    }
  } catch (error) {
    // Quizzes still work without a persistent review queue.
  }
  return { items: {}, updatedAt: 0 };
}

function saveDmvMastery(mastery) {
  const recentItems = Object.entries(mastery.items || {})
    .sort(([, a], [, b]) => Number(b?.updatedAt) - Number(a?.updatedAt))
    .slice(0, 400);
  mastery.items = Object.fromEntries(recentItems);
  mastery.updatedAt = Date.now();
  try {
    window.localStorage.setItem(DMV_MASTERY_STORAGE_KEY, JSON.stringify(mastery));
  } catch (error) {
    return;
  }
  document.dispatchEvent(new CustomEvent("tdt:dmv-mastery", { detail: mastery }));
}

function masteryToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 220);
}

function questionMasteryId(question, state = "") {
  const prompt = question.dataset.prompt || question.querySelector("h3")?.textContent || "question";
  const answer = question.querySelector(`[data-choice="${question.dataset.answer}"]`)?.textContent || "answer";
  return `${normalizeDmvState(state) || "general"}|${masteryToken(prompt)}|${masteryToken(answer)}`;
}

function isDmvReviewDue(record, now) {
  const dueAt = Number(record?.dueAt);
  return Number.isFinite(dueAt) && dueAt > 0 && dueAt <= now;
}

function getDmvMasterySummary(state = "", mastery = readDmvMastery()) {
  const selectedState = normalizeDmvState(state);
  const now = Date.now();
  const records = Object.entries(mastery.items).filter(([, item]) => {
    const itemState = normalizeDmvState(item?.state);
    return !selectedState || itemState === selectedState || itemState === "general";
  });
  const items = records.map(([, item]) => item);
  // The same prompt and correct answer can appear in shared and state practice.
  const distinct = new Set(records.map(([id]) => id.slice(id.indexOf("|") + 1)));
  const learning = items.filter((item) => !Number(item.reliableAt));
  const dueItems = items
    .filter((item) => isDmvReviewDue(item, now))
    .sort((a, b) => Number(a.dueAt) - Number(b.dueAt) || Number(a.updatedAt) - Number(b.updatedAt));
  return {
    attempted: distinct.size,
    learning: learning.length,
    reliable: items.length - learning.length,
    due: dueItems.length,
    dueItem: dueItems[0] || null,
  };
}

function recordQuestionMastery({ question, correct, state, label, mode }) {
  const mastery = readDmvMastery();
  const id = questionMasteryId(question, state);
  const now = Date.now();
  const previous = mastery.items[id] || {};
  const priorCorrect = Number(previous.correctStreak) || 0;
  const priorDue = Number(previous.dueAt);
  // Immediate retries are practice, not a separate recall at the scheduled time.
  const scheduledRecall = priorCorrect > 0 && isDmvReviewDue(previous, now);
  const correctStreak = correct ? Math.max(1, priorCorrect + Number(scheduledRecall)) : 0;
  const dueAt = !correct ? now
    : priorCorrect > 0 && Number.isFinite(priorDue) && priorDue > now ? priorDue
    : now + (correctStreak >= 2 ? 7 : 1) * DAY_MS;
  const becameReliable = correctStreak >= 2 && !Number(previous.reliableAt);
  const pageName = window.location.pathname.split("/").pop() || "dmv-practice.html";
  mastery.items[id] = {
    state: normalizeDmvState(state) || "general",
    prompt: cleanAnalyticsValue(question.dataset.prompt || question.querySelector("h3")?.textContent, "Practice question"),
    category: cleanAnalyticsValue(question.dataset.category, "Review topic"),
    label: cleanAnalyticsValue(label, "DMV practice"),
    href: `${pageName}?mode=${encodeURIComponent(mode || "default")}&focus=due#practice`,
    attempts: (Number(previous.attempts) || 0) + 1,
    misses: (Number(previous.misses) || 0) + (correct ? 0 : 1),
    correctStreak,
    dueAt,
    reliableAt: correctStreak >= 2 ? Number(previous.reliableAt) || now : 0,
    updatedAt: now,
  };
  saveDmvMastery(mastery);
  return { record: mastery.items[id], becameReliable };
}

function readDmvJourney() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DMV_JOURNEY_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        state: normalizeDmvState(saved.state),
        days: saved.days && typeof saved.days === "object" ? saved.days : {},
        sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
        weak: saved.weak && typeof saved.weak === "object" ? saved.weak : {},
        updatedAt: Number(saved.updatedAt) || 0,
      };
    }
  } catch (error) {
    // The study path still works as a one-visit tool when storage is blocked.
  }
  return { state: "", days: {}, sessions: [], weak: {}, updatedAt: 0 };
}

function saveDmvJourney(journey) {
  const recentDays = Object.entries(journey.days || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30);
  journey.days = Object.fromEntries(recentDays);
  journey.sessions = (journey.sessions || []).slice(0, 20);
  journey.updatedAt = Date.now();
  try {
    window.localStorage.setItem(DMV_JOURNEY_STORAGE_KEY, JSON.stringify(journey));
  } catch (error) {
    return;
  }
  document.dispatchEvent(new CustomEvent("tdt:dmv-progress", { detail: journey }));
}

function setDmvJourneyState(value) {
  const state = normalizeDmvState(value);
  if (!state) return;
  const journey = readDmvJourney();
  if (journey.state === state) return;
  journey.state = state;
  try {
    window.localStorage.setItem("tdt-dmv-test-day:last-state", state);
  } catch (error) {
    // State still changes for this visit when storage is blocked.
  }
  saveDmvJourney(journey);
  document.dispatchEvent(new CustomEvent("tdt:dmv-state", { detail: { state } }));
}

function recordDmvAnswer({ correct, category, state }) {
  const journey = readDmvJourney();
  const selectedState = normalizeDmvState(state || journey.state);
  if (selectedState) journey.state = selectedState;
  const stamp = localDayStamp();
  const day = journey.days[stamp] || { answered: 0, correct: 0, sessions: 0 };
  day.answered = (Number(day.answered) || 0) + 1;
  day.correct = (Number(day.correct) || 0) + (correct ? 1 : 0);
  journey.days[stamp] = day;
  if (!correct && category) {
    journey.weak[category] = (Number(journey.weak[category]) || 0) + 1;
  }
  saveDmvJourney(journey);
}

function recordDmvSession({ roundId, label, href, total, correct, missed, weak, state, mode, fullRound, practiceTargetMet }) {
  const journey = readDmvJourney();
  const previousIndex = journey.sessions.findIndex((session) => session.roundId === roundId);
  const previous = journey.sessions[previousIndex];
  if (previous && (previous.fullRound || !fullRound)) return;
  const selectedState = normalizeDmvState(state || journey.state);
  if (selectedState) journey.state = selectedState;
  const completedAt = Date.now();
  const stamp = localDayStamp(completedAt);
  const previousStamp = previous ? localDayStamp(previous.completedAt) : "";
  if (previous) {
    journey.sessions.splice(previousIndex, 1);
    if (previousStamp !== stamp && journey.days[previousStamp]) {
      const day = journey.days[previousStamp];
      day.sessions = Math.max(0, (Number(day.sessions) || 0) - 1);
    }
  }
  if (previousStamp !== stamp) {
    const day = journey.days[stamp] || { answered: 0, correct: 0, sessions: 0 };
    day.sessions = (Number(day.sessions) || 0) + 1;
    journey.days[stamp] = day;
  }
  const percent = total ? Math.round((correct / total) * 100) : 0;
  journey.sessions.unshift({
    roundId,
    label,
    href,
    total,
    correct,
    missed,
    percent,
    weak: Array.isArray(weak) ? weak.slice(0, 3) : [],
    state: selectedState,
    mode,
    fullRound,
    practiceTargetMet,
    completedAt,
  });
  saveDmvJourney(journey);
}

function closestAnalyticsSection(element) {
  const section = element.closest(
    ".pocket-tabs, .home-quick-links, .pocket-tool-list, .home-state-preview-actions, .home-bottom-nav, .home-tool-roles, .home-start, .home-popular, .state-card-actions"
  );
  if (!section) return "home";
  if (section.classList.contains("pocket-tabs")) return "hero_tabs";
  if (section.classList.contains("home-quick-links")) return "hero_quick_links";
  if (section.classList.contains("pocket-tool-list")) return "diagnostic_tool_list";
  if (section.classList.contains("home-state-preview-actions")) return "state_preview";
  if (section.classList.contains("home-bottom-nav")) return "mobile_bottom_nav";
  if (section.classList.contains("home-tool-roles")) return "tool_roles";
  if (section.classList.contains("home-start")) return "start_cards";
  if (section.classList.contains("home-popular")) return "popular_tools";
  if (section.classList.contains("state-card-actions")) return "state_cards";
  return "home";
}

function isOfficialSourceLink(link) {
  const text = cleanAnalyticsValue(link.textContent || link.getAttribute("aria-label") || "", "");
  const href = link.getAttribute("href") || "";
  if (link.matches("[data-workbench-source], [data-study-source], [data-requirements-source], [data-score-source], [data-dmv-manual-link], [data-dmv-pack-official]")) {
    return true;
  }
  if (/official|source|manual|handbook/i.test(text)) return /^https?:\/\//i.test(href);
  try {
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin) return false;
    return /dmv|dps|mvc|flhsmv|penndot|ilsos|ny\.gov|ca\.gov|tx|pa\.gov|nj\.gov|collegeboard/i.test(url.hostname);
  } catch (error) {
    return false;
  }
}

function initAnalyticsEvents() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;

    if (document.body.classList.contains("home-page") && link.closest(".pocket-tabs, .home-quick-links, .pocket-tool-list, .home-state-preview-actions, .home-bottom-nav, .home-tool-roles, .home-start, .home-popular, .state-card-actions")) {
      const target = analyticsPathFromHref(link.getAttribute("href"));
      trackToolEvent("home_tool_click", {
        section: closestAnalyticsSection(link),
        target,
        link_text: link.textContent,
      });
      if (target.startsWith("/road-signs-practice-test.html") || ["/new-york-dmv-road-signs-practice.html", "/sat-august-22-2026-planning.html"].includes(target)) {
        const priorityPath = target.includes("road-signs-practice-test")
          ? "road_signs_picture_test"
          : target.includes("new-york")
            ? "new_york_road_signs"
            : "august_sat_2026";
        trackToolEvent("home_priority_path_click", {
          path: priorityPath,
          section: closestAnalyticsSection(link),
          target,
        });
      }
    }

    if (link.matches("[data-resource-download]")) {
      trackToolEvent("resource_download", {
        resource: link.dataset.resourceDownload,
        target: analyticsPathFromHref(link.getAttribute("href")),
      });
    }

    if (link.matches("[data-dmv-state-link]")) {
      trackToolEvent("dmv_state_path_click", {
        state: link.dataset.dmvState,
        path: link.dataset.dmvPath,
        target: analyticsPathFromHref(link.getAttribute("href")),
      });
    }

    if (isOfficialSourceLink(link)) {
      trackToolEvent("official_source_click", {
        target: analyticsPathFromHref(link.href),
        link_text: link.textContent,
        section: closestAnalyticsSection(link),
      });
    }
  });
}

function initPrintableResources() {
  document.querySelectorAll("[data-print-page]").forEach((button) => {
    button.addEventListener("click", () => {
      trackToolEvent("resource_print", {
        resource: "dmv_road_signs_cheat_sheet",
      });
      window.print();
    });
  });
}

function initCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach((box) => {
    const target = new Date(box.dataset.countdown).getTime();
    const value = box.querySelector("[data-countdown-value]");
    if (!value || Number.isNaN(target)) return;

    const render = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        value.textContent = "Available now";
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      value.textContent = `${days} days ${hours} hours`;
    };

    render();
    window.setInterval(render, 60000);
  });
}

function shuffleChoiceButtons(group) {
  if (!group) return;
  const choices = Array.from(group.children);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  group.append(...choices);
}

const MISSED_SIGN_CARDS_KEY = "tdt-missed-sign-cards";
const DMV_PERMIT_PROCESS_TOPICS = new Set(["Exam readiness", "Florida licensing", "MVC process", "Learner license rules"]);

function initQuizzes() {
  const siteHeader = document.querySelector(".site-header");
  document.querySelectorAll("[data-quiz]").forEach((quiz) => {
    const questions = Array.from(quiz.querySelectorAll(".question"));
    const score = quiz.querySelector(".quiz-score");
    const result = quiz.querySelector("[data-quiz-result]");
    const next = quiz.querySelector("[data-quiz-next]");
    const meter = quiz.querySelector("[data-quiz-meter]");
    const breakdown = quiz.querySelector("[data-quiz-breakdown]");
    const position = quiz.querySelector("[data-quiz-position]");
    const answeredLabel = quiz.querySelector("[data-quiz-answered]");
    const correctLabels = Array.from(quiz.querySelectorAll("[data-quiz-correct]"));
    const missedLabels = Array.from(quiz.querySelectorAll("[data-quiz-missed]"));
    const leftLabels = Array.from(quiz.querySelectorAll("[data-quiz-left]"));
    const mistakesBox = quiz.querySelector("[data-quiz-mistakes]");
    const clearMistakesButton = quiz.querySelector("[data-quiz-clear-mistakes]");
    const prevButton = quiz.querySelector("[data-quiz-prev]");
    const forwardButton = quiz.querySelector("[data-quiz-forward]");
    const resetButton = quiz.querySelector("[data-quiz-reset]");
    const filterSelect = quiz.querySelector("[data-quiz-filter]");
    const shuffleButton = quiz.querySelector("[data-quiz-shuffle]");
    const reviewMistakesButton = quiz.querySelector("[data-quiz-review-mistakes]");
    const timerButton = quiz.querySelector("[data-quiz-timer]");
    const timerLabel = quiz.querySelector("[data-quiz-timer-label]");
    const timerAnnouncement = quiz.querySelector("[data-quiz-timer-announcement]");
    const jumpList = quiz.querySelector("[data-quiz-jump-list]");
    const nextPlanTitle = quiz.querySelector("[data-quiz-next-title]");
    const nextPlanCopy = quiz.querySelector("[data-quiz-next-copy]");
    const nextPlanAction = quiz.querySelector("[data-quiz-next-action]");
    const missedCardsAction = quiz.querySelector("[data-quiz-missed-cards]");
    const masteryDue = quiz.querySelector("[data-quiz-mastery-due]");
    const masteryLearning = quiz.querySelector("[data-quiz-mastery-learning]");
    const masteryReliable = quiz.querySelector("[data-quiz-mastery-reliable]");
    const passScore = Number(quiz.dataset.passScore) || questions.length;
    const quizLabel = quiz.dataset.quizLabel || "practice round";
    const isDmvQuiz = quiz.dataset.domain === "dmv";
    const shuffleChoices = () => questions.forEach(question => shuffleChoiceButtons(question.querySelector(".choices")));
    if (isDmvQuiz) shuffleChoices();
    const sheetFocuses = new Map(
      questions.filter((question) => question.dataset.sheetFocus)
        .map((question) => [question.dataset.sheetFocus, question.dataset.sheetLabel]),
    );
    const answered = new Set();
    const correctAnswers = new Set();
    const wrongAnswers = new Set();
    const pickedAnswers = new Map();
    const storageKey = `tdt-mistakes:${window.location.pathname}:${quiz.dataset.modeId || quizLabel}`;
    let draftSignature;
    let savedMistakes = [];
    let mistakeStorageAvailable = true;
    let activeSequence = questions.map((_, index) => index);
    let fullSequence = activeSequence;
    let activePosition = 0;
    let toolMessage = "";
    const timerLength = 10 * 60 * 1000;
    let timerId = 0;
    let timerRemaining = timerLength;
    let timerDeadline = 0;
    let timerComplete = false;
    let quizStartedTracked = false;
    let quizHalfwayTracked = false;
    let quizCompletedTracked = false;
    let savedRound = null;
    let ownedDraftSnapshot = "";
    let keepFullProgress = false;
    let tenQuestionsTracked = false;
    let nextRoundFocus = "";
    let missedCardIds = [];

    const escapeHtml = (value) =>
      String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);

    const questionPrompt = (question) =>
      question.dataset.prompt || question.querySelector("h3")?.textContent || "Practice question";

    const questionSign = (question) => question.querySelector(".question-visual .sign-art");
    const signIdentifiers = (question) => {
      const sign = questionSign(question);
      if (!sign) return [];
      const label = sign.getAttribute("aria-label");
      const key = sign.dataset.quizImageKey;
      // Older saves may contain either the original label or the revised reading cue.
      return key ? [`image:${key}`, label, sign.dataset.quizLegacyLabel] : [label];
    };
    const mistakeId = (question, sign = signIdentifiers(question)[0] || "") => JSON.stringify([
      questionMasteryId(question, quiz.dataset.state),
      question.dataset.category || "Review topic",
      sign,
    ]);
    const oldMistakeIds = new Map();
    questions.forEach(question => {
      const id = mistakeId(question);
      for (const label of signIdentifiers(question).slice(1).filter(Boolean)) {
        const oldId = mistakeId(question, label);
        const previous = oldMistakeIds.get(oldId);
        oldMistakeIds.set(oldId, previous === undefined || previous === id ? id : null);
      }
    });

    const getActiveQuestionIndex = () => activeSequence[activePosition];

    const focusQuizContent = (target, start = target) => {
      if (!target || !start) return;
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      const headerBottom = Math.max(0, siteHeader?.getBoundingClientRect().bottom ?? 0);
      const targetRect = target.getBoundingClientRect();
      const startTop = start.getBoundingClientRect().top;
      const top = targetRect.bottom - startTop + 24 > window.innerHeight - headerBottom ? targetRect.top : startTop;
      const bottom = targetRect.bottom;
      if (top < headerBottom + 8 || bottom > window.innerHeight - 8) {
        window.scrollBy(0, top - headerBottom - 12);
      }
    };

    const focusActiveQuestion = () => {
      const question = questions[getActiveQuestionIndex()];
      focusQuizContent(question?.querySelector("h3"), question);
    };

    const pageName = window.location.pathname.split("/").pop() || "index.html";
    const mode = quiz.closest("[data-mode-panel]")?.dataset.modePanel;
    const supportsBaseline = isDmvQuiz && pageName === "road-signs-practice-test.html" && mode === "road-signs-core";

    const roundHref = (focus = "all") => {
      const params = new URLSearchParams();
      if (mode) params.set("mode", mode);
      if (focus !== "all") params.set("focus", focus);
      return `${pageName}${params.size ? `?${params}` : ""}#practice`;
    };

    const comparisonHref = (concept) => {
      const params = new URLSearchParams({ concept, return: pageName });
      if (mode) params.set("return_mode", mode);
      return `road-sign-learning-loop.html?${params}#learning-loop`;
    };

    const roundSignature = () => draftSignature ??= JSON.stringify(questions.map((question) => [
      questionPrompt(question), question.dataset.answer, question.dataset.explanation,
      question.dataset.category, question.dataset.sheetFocus,
      signIdentifiers(question)[0],
      // Drafts use authored choice IDs, not the current display order.
      ...Array.from(question.querySelectorAll("[data-choice]"))
        .sort((left, right) => Number(left.dataset.choice) - Number(right.dataset.choice))
        .map(button => button.textContent),
    ]));

    const matchesRoundSignature = (saved, version) => {
      const current = roundSignature();
      if (saved === current) return true;
      if (typeof saved !== "string") return false;
      try {
        const previous = JSON.parse(saved);
        const rows = JSON.parse(current);
        // Feedback is rendered from the current question. Older v1 drafts may not record the image clue.
        return Array.isArray(previous) && previous.length === rows.length && previous.every((row, index) =>
          Array.isArray(row) && row.length === rows[index].length &&
          row.every((value, field) => {
            if (field === 2 || value === rows[index][field]) return true;
            return field === 5 && ((version === 1 && value === null) || signIdentifiers(questions[index]).includes(value));
          }));
      } catch (error) {
        return false;
      }
    };

    const showCheckedAnswer = (index, button) => {
      const question = questions[index];
      const picked = Number(button.dataset.choice);
      const isCorrect = picked === Number(question.dataset.answer);
      pickedAnswers.set(index, picked);
      answered.add(index);
      (isCorrect ? correctAnswers : wrongAnswers).add(index);
      button.classList.add(isCorrect ? "is-correct" : "is-wrong");
      question.querySelector(`[data-choice="${question.dataset.answer}"]`)?.classList.add("is-correct");
      question.querySelectorAll("[data-choice]").forEach(choice => { choice.disabled = true; });
      const feedback = question.querySelector(".feedback");
      if (feedback) feedback.textContent = `${isCorrect ? "Correct." : "Not quite."} ${question.dataset.explanation}`;
      question.querySelector("[data-quiz-source]")?.removeAttribute("hidden");
      return { isCorrect, feedback };
    };

    const masteryRecords = () => {
      if (!isDmvQuiz) return [];
      const items = readDmvMastery().items;
      return questions.map((question) => items[questionMasteryId(question, quiz.dataset.state)] || null);
    };

    const dueQuestionIndexes = () => {
      const now = Date.now();
      return masteryRecords()
        .map((record, index) => ({ index, record }))
        .filter(({ record }) => isDmvReviewDue(record, now))
        .map(({ index }) => index);
    };

    const renderMasteryStats = () => {
      if (!isDmvQuiz) return;
      const currentRecords = masteryRecords();
      const now = Date.now();
      const records = currentRecords.filter(Boolean);
      const dueCount = records.filter((record) => isDmvReviewDue(record, now)).length;
      const reliableCount = records.filter((record) => Number(record.reliableAt)).length;
      const learningCount = records.length - reliableCount;
      if (masteryDue) masteryDue.textContent = String(dueCount);
      if (masteryLearning) masteryLearning.textContent = String(learningCount);
      if (masteryReliable) masteryReliable.textContent = String(reliableCount);
      if (reviewMistakesButton) reviewMistakesButton.disabled = dueCount === 0;
    };

    const loadMistakes = () => {
      if (!mistakeStorageAvailable) return;
      let stored;
      try {
        stored = window.localStorage.getItem(storageKey);
      } catch (error) {
        mistakeStorageAvailable = false;
        return;
      }
      try {
        const parsed = stored ? JSON.parse(stored) : [];
        const entries = Array.isArray(parsed) ? parsed : [];
        const seen = new Set();
        savedMistakes = entries.filter(item => typeof item?.prompt === "string").map((item) => {
          if (typeof item.questionId === "string" && item.questionId) {
            const id = oldMistakeIds.get(item.questionId);
            return id ? { ...item, questionId: id } : item;
          }
          // Older entries know only the prompt and category; do not guess when they match more than one item.
          const matching = questions.filter(question => questionPrompt(question) === item.prompt &&
            (question.dataset.category || "Review topic") === item.category);
          return matching.length === 1 ? { ...item, questionId: mistakeId(matching[0]) } : item;
        }).filter(({ questionId }) => {
          if (!questionId) return true;
          if (seen.has(questionId)) return false;
          seen.add(questionId);
          return true;
        });
      } catch (error) {
        savedMistakes = [];
      }
      return stored;
    };

    const saveMistakes = () => {
      savedMistakes = savedMistakes.slice(0, Math.max(12, questions.length));
      if (!mistakeStorageAvailable) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(savedMistakes));
      } catch (error) {
        mistakeStorageAvailable = false;
      }
    };

    const renderMistakes = () => {
      if (!mistakesBox) return;
      if (!savedMistakes.length) {
        mistakesBox.innerHTML = "<span>No saved mistakes yet.</span>";
        if (clearMistakesButton) clearMistakesButton.disabled = true;
        return;
      }
      if (clearMistakesButton) clearMistakesButton.disabled = false;
      const previewCount = 5;
      const preview = savedMistakes
        .slice(0, previewCount)
        .map((item) => {
          const compareLink = item.conceptId
            ? `<a href="${escapeHtml(comparisonHref(item.conceptId))}">Compare this distinction</a>`
            : "";
          return `<article><strong>${escapeHtml(item.category)}</strong><span>${escapeHtml(item.prompt)}</span>${compareLink}</article>`;
        })
        .join("");
      mistakesBox.innerHTML = preview + (savedMistakes.length > previewCount
        ? `<span>Showing ${previewCount} of ${savedMistakes.length} saved entries. Choose Saved mistakes to retry questions still in this round.</span>`
        : "");
    };

    const rememberMistake = (question) => {
      loadMistakes();
      const prompt = questionPrompt(question);
      const category = question.dataset.category || "Review topic";
      const questionId = mistakeId(question);
      savedMistakes = savedMistakes.filter((item) => item.questionId !== questionId);
      savedMistakes.unshift({ questionId, prompt, category, conceptId: question.dataset.conceptId || "", savedAt: Date.now() });
      saveMistakes();
      renderMistakes();
    };

    const resolveMistake = (question) => {
      loadMistakes();
      const questionId = mistakeId(question);
      const nextMistakes = savedMistakes.filter((item) => item.questionId !== questionId);
      if (nextMistakes.length === savedMistakes.length) return;
      savedMistakes = nextMistakes;
      saveMistakes();
      renderMistakes();
    };

    const renderQuestionNavigator = () => {
      if (!jumpList) return;
      if (!activeSequence.length) {
        jumpList.innerHTML = '<span>No questions in this focus area yet.</span>';
        return;
      }

      jumpList.innerHTML = activeSequence
        .map((questionIndex, positionIndex) => {
          const statusClass = correctAnswers.has(questionIndex)
            ? " is-correct"
            : wrongAnswers.has(questionIndex)
            ? " is-wrong"
            : answered.has(questionIndex)
            ? " is-answered"
            : "";
          const activeClass = positionIndex === activePosition ? " is-active" : "";
          return `<button type="button" class="question-jump${statusClass}${activeClass}" data-quiz-jump="${positionIndex}" aria-label="Go to question ${positionIndex + 1}">${positionIndex + 1}</button>`;
        })
        .join("");

      jumpList.querySelectorAll("[data-quiz-jump]").forEach((button) => {
        button.addEventListener("click", () => {
          activePosition = Number(button.dataset.quizJump) || 0;
          renderActiveQuestion();
          focusActiveQuestion();
          saveMovedCursor();
        });
      });
    };

    const setActiveSequence = (indexes, message = "") => {
      activeSequence = indexes;
      if (indexes.length === questions.length) fullSequence = indexes;
      activePosition = 0;
      toolMessage = message;
      renderScore();
      renderActiveQuestion();
    };

    const renderActiveQuestion = () => {
      const activeQuestionIndex = getActiveQuestionIndex();
      questions.forEach((question, index) => {
        const isActive = index === activeQuestionIndex;
        question.classList.toggle("is-active", isActive);
        question.setAttribute("aria-hidden", isActive ? "false" : "true");
      });

      if (!activeSequence.length) {
        if (position) position.textContent = "No questions in this focus area";
        if (prevButton) prevButton.disabled = true;
        if (forwardButton) {
          forwardButton.disabled = true;
          forwardButton.textContent = "Choose another focus";
        }
        renderQuestionNavigator();
        return;
      }

      if (position) position.textContent = `Question ${activePosition + 1} of ${activeSequence.length}`;
      if (prevButton) prevButton.disabled = activePosition === 0;
      if (forwardButton) {
        const activeAnswered = answered.has(activeQuestionIndex);
        forwardButton.disabled = !activeAnswered;
        if (activePosition === activeSequence.length - 1) {
          forwardButton.textContent = activeAnswered ? "Review result" : "Answer to finish";
        } else {
          forwardButton.textContent = activeAnswered ? "Next question" : "Answer to continue";
        }
      }
      renderQuestionNavigator();
    };

    const renderScore = () => {
      const activeTotal = activeSequence.length;
      const answeredCount = activeSequence.filter((index) => answered.has(index)).length;
      const correctCount = activeSequence.filter((index) => correctAnswers.has(index)).length;
      const missedIndexes = activeSequence.filter((index) => wrongAnswers.has(index));
      const missedCount = missedIndexes.length;
      const leftCount = Math.max(activeTotal - answeredCount, 0);
      const percent = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
      const complete = activeTotal > 0 && answeredCount === activeTotal;
      if (missedCardsAction) {
        missedCardIds = complete
          ? [...new Set(missedIndexes.map(index => questions[index].dataset.flashcardKey).filter(Boolean))]
          : [];
        missedCardsAction.hidden = !missedCardIds.length;
        if (missedCardIds.length) {
          missedCardsAction.textContent = `Review ${missedCardIds.length} missed sign card${missedCardIds.length === 1 ? "" : "s"}`;
        }
      }
      const halfwayReached = activeTotal > 1 && answeredCount >= Math.ceil(activeTotal / 2);
      const focus = filterSelect?.value || "all";
      const focusedDmv = isDmvQuiz && focus !== "all";
      const baseline = supportsBaseline && focus === "baseline";
      const effectivePassScore = isDmvQuiz ? passScore : Math.min(passScore, Math.max(activeTotal - 1, 1));
      const practiceTargetMet = !focusedDmv && correctCount >= effectivePassScore;
      nextRoundFocus = complete && focusedDmv && !baseline && !missedCount ? "all" : "";
      const resultText = !activeTotal
        ? "No questions selected"
        : complete
        ? `${correctCount} of ${activeTotal} correct · ${percent}%`
        : answeredCount
        ? `Score: ${correctCount} of ${answeredCount} answered · ${percent}% correct`
        : "Score: 0 of 0 answered";

      if (answeredCount >= 10 && !tenQuestionsTracked) {
        tenQuestionsTracked = true;
        const milestoneParams = {
          milestone: "ten_questions_attempted",
          tool: quizLabel,
          mode: quiz.dataset.modeId || "default",
          total: activeTotal,
          answered: answeredCount,
        };
        trackToolEvent("study_value_milestone", milestoneParams);
        trackToolEvent("study_ten_questions_attempted", milestoneParams);
      }

      if (halfwayReached && !quizHalfwayTracked) {
        quizHalfwayTracked = true;
        trackToolEvent("quiz_halfway", {
          tool: quizLabel,
          mode: quiz.dataset.modeId || "default",
          focus: filterSelect?.value || "all",
          total: activeTotal,
          answered: answeredCount,
          correct: correctCount,
          missed: missedCount,
        });
      }

      const justCompleted = complete && !quizCompletedTracked;
      if (justCompleted) {
        quizCompletedTracked = true;
        trackToolEvent("quiz_complete", {
          tool: quizLabel,
          mode: quiz.dataset.modeId || "default",
          focus: filterSelect?.value || "all",
          total: activeTotal,
          answered: answeredCount,
          correct: correctCount,
          missed: missedCount,
          passed: practiceTargetMet,
        });
      }

      if (score) score.textContent = resultText;
      if (result) result.textContent = resultText;
      if (meter) meter.style.width = `${activeTotal ? Math.round((answeredCount / activeTotal) * 100) : 0}%`;
      if (answeredLabel) answeredLabel.textContent = activeTotal ? `${answeredCount} of ${activeTotal} answered` : "0 answered";
      correctLabels.forEach((label) => {
        label.textContent = String(correctCount);
      });
      missedLabels.forEach((label) => {
        label.textContent = String(missedCount);
      });
      leftLabels.forEach((label) => {
        label.textContent = String(leftCount);
      });
      quiz.classList.toggle("is-complete", complete);

      const missedCategories = new Map();
      missedIndexes.forEach((index) => {
        const category = questions[index].dataset.category || "Review topic";
        missedCategories.set(category, (missedCategories.get(category) || 0) + 1);
      });
      const missed = [...missedCategories]
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category)
        .slice(0, 3);

      if (isDmvQuiz && complete && (!savedRound || (!focusedDmv && !savedRound.fullRound))) {
        // Keep one local record if a learner expands a finished focus set to the full round.
        const id = savedRound?.id || createLocalPracticeId();
        savedRound = { id, fullRound: !focusedDmv };
        recordDmvSession({
          roundId: id,
          label: focusedDmv ? `${quizLabel} (${filterSelect.selectedOptions[0].textContent})` : quizLabel,
          href: roundHref(focus),
          total: activeTotal,
          correct: correctCount,
          missed: missedCount,
          weak: missed,
          state: quiz.dataset.state,
          mode: quiz.dataset.modeId,
          fullRound: !focusedDmv,
          practiceTargetMet,
        });
      }

      if (breakdown) {
        if (!answeredCount) {
          breakdown.innerHTML = '<span class="breakdown-note">Weak areas will appear here after missed answers.</span>';
        } else if (!missed.length) {
          breakdown.innerHTML = '<span class="breakdown-chip is-clear">No missed categories yet</span>';
        } else {
          breakdown.innerHTML = missed
            .map((category) => `<span class="breakdown-chip">${escapeHtml(category)}</span>`)
            .join("");
        }
      }

      if (!next) return;
      if (toolMessage) {
        next.textContent = toolMessage;
      } else if (!activeTotal) {
        next.textContent = "Choose all categories or answer questions first, then review saved mistakes.";
      } else if (!answeredCount) {
        next.textContent = `Answer ${quizLabel} questions first, then review weak areas.`;
      } else if (complete && focusedDmv) {
        next.textContent = missedCount
          ? `Focused review: revisit ${missed.join(", ")}. This is not a full-round score.`
          : "Focused review: no misses in this set. Try all questions before judging your overall readiness.";
      } else if (complete && isDmvQuiz) {
        next.textContent = practiceTargetMet
          ? `Practice target met: ${passScore} of ${activeTotal} required for this round. This is not an official exam result.`
          : `Practice target: ${passScore} of ${activeTotal} for this round. Review ${missed.join(", ") || "the questions you missed"} before trying again.`;
      } else if (complete && practiceTargetMet) {
        next.textContent = `Practice pass for this mode. Review explanations, then confirm rules in the official manual.`;
      } else if (complete && correctCount >= Math.max(effectivePassScore - 3, 1)) {
        next.textContent = missed.length
          ? `Close result. Review next: ${missed.join(", ")}.`
          : "Close result. Reread explanations once before test day.";
      } else if (complete) {
        next.textContent = missed.length
          ? `Use this as a diagnostic. Review these categories first: ${missed.join(", ")}.`
          : "Use this as a diagnostic, then retake after reading the manual.";
      } else if (missed.length) {
        next.textContent = `Keep going. Saved mistakes now point to: ${missed.join(", ")}.`;
      } else {
        next.textContent = "So far, no weak area. Keep going.";
      }

      if (nextPlanTitle && nextPlanCopy && nextPlanAction && isDmvQuiz) {
        const state = normalizeDmvState(quiz.dataset.state || readDmvJourney().state);
        const missedQuestions = missedIndexes.map(index => questions[index]);
        const imageMisses = missedQuestions.filter(questionSign);
        if (baseline && (!activeTotal || (complete && !missedCount))) {
          nextPlanTitle.textContent = "Continue your study path";
          nextPlanCopy.textContent = "Use your baseline to choose your next practice step.";
          nextPlanAction.href = "dmv-practice.html#dmv-journey-title";
          nextPlanAction.textContent = "Open your study path";
        } else if (!complete) {
          nextPlanTitle.textContent = answeredCount ? "Finish the current evidence" : "Create a real baseline";
          nextPlanCopy.textContent = answeredCount
            ? `${leftCount} questions remain. Finish before switching tools so the weak-area result is reliable.`
            : "Answer this round before choosing another tool. The next action will use your real misses.";
          nextPlanAction.href = "#practice";
          nextPlanAction.textContent = answeredCount ? "Continue this round" : "Start this round";
        } else if (imageMisses.length) {
          const allVisual = imageMisses.length === missedCount;
          const concept = imageMisses[0].dataset.conceptId;
          if (allVisual && concept && imageMisses.every(question => question.dataset.conceptId === concept)) {
            nextPlanTitle.textContent = "Compare the sign distinction you missed";
            nextPlanCopy.textContent = "Work through the sign comparison and its action questions, then come back to retry the saved mistakes from this round.";
            nextPlanAction.href = comparisonHref(concept);
            nextPlanAction.textContent = "Open targeted comparison";
          } else {
            nextRoundFocus = "saved";
            nextPlanTitle.textContent = allVisual ? "Retry the signs you missed" : "Review both sign and rule mistakes";
            nextPlanCopy.textContent = allVisual
              ? "Re-answer the saved picture questions in this round. Before choosing, name the clue you see and what it tells you to do."
              : "Retry the saved questions in this mode. Use the explanations to separate sign recognition from driving rules.";
            nextPlanAction.href = roundHref("saved");
            nextPlanAction.textContent = "Retry saved questions";
          }
        } else if (state && missedCount && document.getElementById("official-details") &&
          missedQuestions.every((question) => DMV_PERMIT_PROCESS_TOPICS.has(question.dataset.category))) {
          nextPlanTitle.textContent = "Review the official test and permit requirements";
          nextPlanCopy.textContent = "These misses were about the test or permit process, not driving decisions. Check the state guidance before planning your visit.";
          nextPlanAction.href = "#official-details";
          nextPlanAction.textContent = "Read the state test details";
        } else if (missedCount) {
          nextPlanTitle.textContent = `Repair ${missed[0] || "the weak rule area"}`;
          nextPlanCopy.textContent = "Turn the missed category into a short state-aware plan before taking another full round.";
          nextPlanAction.href = `dmv-permit-test-study-plan.html?${new URLSearchParams(state ? { state, focus: "rules" } : { focus: "rules" })}#study-plan`;
          nextPlanAction.textContent = "Build a focused plan";
        } else if (nextRoundFocus === "all") {
          nextPlanTitle.textContent = "Practice all questions";
          nextPlanCopy.textContent = "A clean focus set is useful, but it does not cover all of the topics in this practice round.";
          nextPlanAction.href = roundHref();
          nextPlanAction.textContent = "Start full practice round";
        } else if (state) {
          nextPlanTitle.textContent = "Move from score to test-day readiness";
          nextPlanCopy.textContent = "A clean round is useful evidence. Now confirm official rules, documents, and visit logistics for your state.";
          nextPlanAction.href = `dmv-test-day-checklist.html?state=${encodeURIComponent(state)}#dmv-checklist`;
          nextPlanAction.textContent = "Open state checklist";
        } else {
          nextPlanTitle.textContent = "Apply the result to your state";
          nextPlanCopy.textContent = "Choose a state path for official-source context, state questions, and final checklist planning.";
          nextPlanAction.href = "dmv-practice.html#state-paths";
          nextPlanAction.textContent = "Choose your state";
        }
      } else if (nextPlanTitle && nextPlanCopy && nextPlanAction) {
        if (!complete) {
          nextPlanTitle.textContent = answeredCount ? "Finish this round" : "Create a baseline";
          nextPlanCopy.textContent = answeredCount
            ? `${leftCount} questions remain before the result is useful.`
            : "Complete the current round before choosing another study block.";
          nextPlanAction.href = "#practice";
          nextPlanAction.textContent = answeredCount ? "Continue this round" : "Start this round";
        } else if (missedCount) {
          nextPlanTitle.textContent = `Review ${missed[0] || "missed questions"}`;
          nextPlanCopy.textContent = "Use the saved-mistake filter and reread the explanation before adding new practice.";
          nextPlanAction.href = "#practice";
          nextPlanAction.textContent = "Review this result";
        } else {
          nextPlanTitle.textContent = "Protect the clean result";
          nextPlanCopy.textContent = "Use a later timed round to confirm the score instead of repeating immediately.";
          nextPlanAction.href = "#practice";
          nextPlanAction.textContent = "Plan another round";
        }
      }
    };

    const saveRecentPractice = () => {
      try {
        const selectedFocus = filterSelect?.value || "all";
        const visiblePicks = activeSequence.filter(index => pickedAnswers.has(index));
        // A category view must not replace a full-round draft or drop answers in other categories.
        if (isDmvQuiz && pickedAnswers.size && (selectedFocus === "all" || visiblePicks.length < pickedAnswers.size)) {
          keepFullProgress = true;
        }
        const focus = keepFullProgress ? "all" : selectedFocus;
        const sequence = focus === selectedFocus ? activeSequence : fullSequence;
        const activeTotal = sequence.length;
        const picks = sequence.filter(index => pickedAnswers.has(index)).map(index => [index, pickedAnswers.get(index)]);
        const answeredCount = picks.length;
        const correctCount = sequence.filter((index) => correctAnswers.has(index)).length;
        const missedCount = sequence.filter((index) => wrongAnswers.has(index)).length;
        const label = focus === "all" ? quizLabel : `${quizLabel} · ${filterSelect.selectedOptions[0].textContent}`;
        const draft = isDmvQuiz && answeredCount > 0 && answeredCount < activeTotal ? {
          version: 2,
          revision: createLocalPracticeId(),
          scope: roundHref(),
          signature: roundSignature(),
          sequence,
          position: Math.max(0, sequence.indexOf(getActiveQuestionIndex())),
          picks,
          halfway: quizHalfwayTracked,
          ten: tenQuestionsTracked,
          completed: quizCompletedTracked,
          focusedRoundId: savedRound?.fullRound === false ? savedRound.id : undefined,
        } : undefined;

        const snapshot = JSON.stringify({
          label,
          href: roundHref(focus),
          state: quiz.dataset.state || "",
          answered: answeredCount,
          total: activeTotal,
          correct: correctCount,
          missed: missedCount,
          draft,
          updatedAt: Date.now(),
        });
        window.localStorage.setItem(RECENT_PRACTICE_KEY, snapshot);
        ownedDraftSnapshot = draft ? snapshot : "";
      } catch (error) {
        // Practice still works when browser storage is blocked.
      }
    };

    const saveMovedCursor = () => {
      if (isDmvQuiz && activeSequence.some(index => pickedAnswers.has(index))) saveRecentPractice();
    };

    const restoreRecentPractice = () => {
      if (!isDmvQuiz) return;
      const requested = new URLSearchParams(window.location.search);
      const mode = quiz.closest("[data-mode-panel]")?.dataset.modePanel || null;
      if (requested.get("resume") !== "1" || requested.get("mode") !== mode) return;
      const progress = readRecentPractice();
      const focus = filterSelect?.value || "all";
      const draft = progress?.href === roundHref(focus) ? progress.draft : null;
      const canUseDraft = [1, 2].includes(draft?.version) && draft.scope === roundHref() &&
        matchesRoundSignature(draft.signature, draft.version) && Array.isArray(draft.sequence) && Array.isArray(draft.picks);
      if (canUseDraft) {
        const sequence = new Set(draft.sequence);
        const picks = new Map();
        if (sequence.size === draft.sequence.length && draft.picks.length > 0 && draft.picks.length < sequence.size &&
            Number.isInteger(draft.position) && draft.position >= 0 && draft.position < sequence.size &&
            draft.sequence.every(index => Number.isInteger(index) && questions[index])) {
          for (const pick of draft.picks) {
            if (!Array.isArray(pick)) break;
            const [index, value] = pick;
            if (!sequence.has(index) || !Number.isInteger(value) || picks.has(index)) break;
            const button = questions[index].querySelector(`[data-choice="${value}"]`);
            if (!button) break;
            picks.set(index, button);
          }
          if (picks.size === draft.picks.length) {
            ownedDraftSnapshot = JSON.stringify(progress);
            activeSequence = draft.sequence;
            if (activeSequence.length === questions.length) fullSequence = activeSequence;
            activePosition = draft.position;
            keepFullProgress = focus === "all";
            // Restore the saved display without replaying answered-question side effects.
            picks.forEach((button, index) => showCheckedAnswer(index, button));
            quizStartedTracked = true;
            quizHalfwayTracked = draft.halfway === true || picks.size >= Math.ceil(sequence.size / 2);
            tenQuestionsTracked = draft.ten === true || picks.size >= 10;
            quizCompletedTracked = draft.completed === true;
            if (typeof draft.focusedRoundId === "string" && /^[a-f0-9]{32}$/.test(draft.focusedRoundId)) {
              savedRound = { id: draft.focusedRoundId, fullRound: false };
            }
            toolMessage = "Unfinished round restored from this browser.";
            renderScore();
            renderActiveQuestion();
            return;
          }
        }
      }
      toolMessage = "This saved round is no longer available. You can start a fresh round here.";
      renderScore();
    };

    const resetQuiz = () => {
      answered.clear();
      correctAnswers.clear();
      wrongAnswers.clear();
      pickedAnswers.clear();
      activePosition = 0;
      toolMessage = "";
      quizStartedTracked = false;
      quizHalfwayTracked = false;
      quizCompletedTracked = false;
      savedRound = null;
      ownedDraftSnapshot = "";
      keepFullProgress = false;
      tenQuestionsTracked = false;
      questions.forEach((question) => {
        question.querySelectorAll("button").forEach((button) => {
          button.disabled = false;
          button.classList.remove("is-correct", "is-wrong");
        });
        const feedback = question.querySelector(".feedback");
        if (feedback) feedback.textContent = "";
        question.querySelector("[data-quiz-source]")?.setAttribute("hidden", "");
      });
      renderScore();
      renderActiveQuestion();
    };

    const allQuestionIndexes = () => questions.map((_, index) => index);

    const populateFilterOptions = () => {
      if (!filterSelect) return;
      const categories = [...new Set(questions.map((question) => question.dataset.category || "Permit basics"))].sort();
      filterSelect.replaceChildren();
      [
        ["all", "All categories"],
        ...(supportsBaseline ? [["baseline", "Finish baseline with new questions"]] : []),
        ...(isDmvQuiz ? [["due", "Review due"]] : []),
        ["saved", "Saved mistakes"],
        ...Array.from(sheetFocuses, ([value, label]) => [value, `Study sheet: ${label}`]),
        ...categories.map((category) => [category, category]),
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        filterSelect.append(option);
      });
    };

    const applyFocusFilter = (value) => {
      toolMessage = "";
      if (value === "baseline" && supportsBaseline) {
        const mastery = readDmvMastery();
        const state = readDmvJourney().state;
        const remaining = Math.max(DMV_BASELINE_SIZE - getDmvMasterySummary(state, mastery).attempted, 0);
        const seen = new Set();
        const newIndexes = allQuestionIndexes().filter((index) => {
          const question = questions[index];
          const generalId = questionMasteryId(question);
          if (seen.has(generalId) || mastery.items[generalId] ||
              (state && mastery.items[questionMasteryId(question, state)])) return false;
          seen.add(generalId);
          return true;
        }).slice(0, remaining);
        resetQuiz();
        setActiveSequence(newIndexes, newIndexes.length
          ? "Only questions you have not answered in this study path are included."
          : "Your baseline is already complete. Open your study path or choose All categories.");
        return;
      }
      if (value === "due" && isDmvQuiz) {
        const dueIndexes = dueQuestionIndexes();
        resetQuiz();
        setActiveSequence(
          dueIndexes,
          dueIndexes.length
            ? "Due questions loaded, including any scheduled weekly checks."
            : "No questions are due in this mode. Continue with a focused round or return when the next review opens."
        );
        return;
      }
      if (value === "saved") {
        const ids = new Set(savedMistakes.map(item => item.questionId));
        const savedIndexes = allQuestionIndexes().filter(index => ids.has(mistakeId(questions[index])));
        resetQuiz();
        setActiveSequence(
          savedIndexes,
          savedIndexes.length
            ? "Saved mistakes loaded. Answer a question correctly to remove it from your saved list."
            : "No saved mistakes for this mode yet. Answer questions first or switch back to all categories."
        );
        return;
      }
      const nextSequence = value === "all"
        ? allQuestionIndexes()
        : sheetFocuses.has(value)
        ? allQuestionIndexes().filter((index) => questions[index].dataset.sheetFocus === value)
        : allQuestionIndexes().filter((index) => (questions[index].dataset.category || "Permit basics") === value);
      setActiveSequence(nextSequence);
    };

    const applyInitialFocus = () => {
      if (!filterSelect) return;
      let initialFocus = "";
      try {
        initialFocus = (new URLSearchParams(window.location.search).get("focus") || "").trim();
      } catch (error) {
        initialFocus = "";
      }
      if (!initialFocus) return;
      const match = Array.from(filterSelect.options).find(
        (option) => option.value.toLowerCase() === initialFocus.toLowerCase()
      );
      if (!match) return;
      filterSelect.value = match.value;
      applyFocusFilter(match.value);
    };

    const shuffleActiveSequence = () => {
      const shuffled = [...activeSequence];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      setActiveSequence(shuffled, shuffled.length ? "Question order shuffled for this focus area." : "");
      saveMovedCursor();
    };

    const renderTimer = () => {
      if (!timerLabel) return;
      if (timerComplete) {
        timerLabel.textContent = "Time is up. Finish the current question, then review.";
        return;
      }
      if (!timerDeadline) {
        timerLabel.textContent = "Untimed practice";
        return;
      }
      const remainingSeconds = Math.ceil(timerRemaining / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = String(remainingSeconds % 60).padStart(2, "0");
      const time = `${minutes}:${seconds}`;
      timerLabel.textContent = timerId ? `${time} left in this round` : `Paused at ${time}`;
    };

    const announceTimer = (message) => {
      if (timerAnnouncement) timerAnnouncement.textContent = message;
    };

    const stopTimer = () => {
      window.clearInterval(timerId);
      timerId = 0;
    };

    const tickTimer = () => {
      timerRemaining = Math.max(timerDeadline - Date.now(), 0);
      if (!timerRemaining) {
        stopTimer();
        timerComplete = true;
        timerButton.textContent = "Restart timer";
        announceTimer("Time is up. Finish the current question, then review.");
      }
      renderTimer();
    };

    const toggleTimer = () => {
      if (!timerButton) return;
      if (timerId) {
        tickTimer();
        if (!timerComplete) {
          stopTimer();
          timerButton.textContent = "Resume timer";
          renderTimer();
          announceTimer("Timer paused.");
        }
        return;
      }
      const resuming = timerDeadline && !timerComplete;
      if (timerComplete) {
        timerComplete = false;
        timerRemaining = timerLength;
      }
      timerButton.textContent = "Pause timer";
      timerDeadline = Date.now() + timerRemaining;
      timerId = window.setInterval(tickTimer, 1000);
      renderTimer();
      announceTimer(resuming ? "Timer resumed." : "10-minute timer started.");
    };

    if (questions.length) {
      quiz.classList.add("is-enhanced");
      renderActiveQuestion();
    }
    renderScore();

    if (prevButton) {
      prevButton.addEventListener("click", () => {
        activePosition = Math.max(0, activePosition - 1);
        renderActiveQuestion();
        focusActiveQuestion();
        saveMovedCursor();
      });
    }

    if (forwardButton) {
      forwardButton.addEventListener("click", () => {
        if (activePosition < activeSequence.length - 1) {
          activePosition += 1;
          renderActiveQuestion();
          focusActiveQuestion();
          saveMovedCursor();
          return;
        }
        focusQuizContent(result);
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        const draftToDiscard = ownedDraftSnapshot;
        if (isDmvQuiz) shuffleChoices();
        if (supportsBaseline && filterSelect?.value === "baseline") {
          applyFocusFilter("baseline");
        } else {
          resetQuiz();
        }
        // A fresh or stale tab must not discard a draft another tab last saved.
        if (draftToDiscard && draftToDiscard === JSON.stringify(readRecentPractice())) saveRecentPractice();
      });
    }

    if (clearMistakesButton) {
      clearMistakesButton.addEventListener("click", () => {
        const before = loadMistakes();
        renderMistakes();
        if (!savedMistakes.length || !window.confirm("Clear this round's saved mistakes? Your answers and scheduled review will stay unchanged.")) return;
        if (loadMistakes() !== before) {
          renderMistakes();
          toolMessage = "Saved mistakes changed while you were confirming. Nothing was cleared.";
          renderScore();
          return;
        }
        savedMistakes = [];
        saveMistakes();
        renderMistakes();
        if (filterSelect?.value === "saved") applyFocusFilter("saved");
      });
    }

    if (mistakesBox) {
      window.addEventListener("storage", (event) => {
        if (event.key !== storageKey && event.key !== null) return;
        loadMistakes();
        renderMistakes();
      });
    }

    if (filterSelect) {
      filterSelect.addEventListener("change", () => {
        if (filterSelect.value === "saved") {
          loadMistakes();
          renderMistakes();
        }
        applyFocusFilter(filterSelect.value);
        saveMovedCursor();
      });
    }

    if (shuffleButton) {
      shuffleButton.addEventListener("click", shuffleActiveSequence);
    }

    if (reviewMistakesButton) {
      reviewMistakesButton.addEventListener("click", () => {
        const target = isDmvQuiz ? "due" : "saved";
        if (filterSelect) filterSelect.value = target;
        applyFocusFilter(target);
        if (isDmvQuiz) {
          trackToolEvent("mastery_review_start", {
            tool: quizLabel,
            state: quiz.dataset.state || "general",
            due: dueQuestionIndexes().length,
          });
        }
      });
    }

    if (timerButton) {
      timerButton.addEventListener("click", toggleTimer);
    }

    if (nextPlanAction) {
      nextPlanAction.addEventListener("click", (event) => {
        trackToolEvent("study_next_step_click", {
          surface: "quiz_next_plan",
          tool: quizLabel,
          mode: quiz.dataset.modeId || "default",
          state: quiz.dataset.state || "",
          complete: quiz.classList.contains("is-complete"),
          target: analyticsPathFromHref(nextPlanAction.href),
        });
        if (nextRoundFocus && filterSelect && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          const focus = nextRoundFocus;
          filterSelect.value = focus;
          if (focus === "all") resetQuiz();
          applyFocusFilter(focus);
          focusActiveQuestion();
        }
      });
    }

    missedCardsAction?.addEventListener("click", () => {
      if (!missedCardIds.length) return;
      try {
        // Keep the missed sign IDs in this tab, not in the URL or analytics.
        window.sessionStorage.setItem(MISSED_SIGN_CARDS_KEY, JSON.stringify({ mode, signIds: missedCardIds }));
      } catch (error) {
        // The deck still opens normally when this browser blocks storage.
      }
    });

    questions.forEach((question, index) => {
      question.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          if (answered.has(index)) return;
          if (!quizStartedTracked) {
            quizStartedTracked = true;
            trackToolEvent("quiz_start", {
              tool: quizLabel,
              mode: quiz.dataset.modeId || "default",
              focus: filterSelect?.value || "all",
              total: activeSequence.length || questions.length,
            });
          }
          toolMessage = "";

          const { isCorrect, feedback } = showCheckedAnswer(index, button);
          if (isCorrect) {
            resolveMistake(question);
          } else {
            rememberMistake(question);
          }
          if (isDmvQuiz) {
            recordDmvAnswer({
              correct: isCorrect,
              category: question.dataset.category || "Review topic",
              state: quiz.dataset.state,
            });
            const masteryResult = recordQuestionMastery({
              question,
              correct: isCorrect,
              state: quiz.dataset.state,
              label: quizLabel,
              mode: quiz.dataset.modeId,
            });
            if (masteryResult.becameReliable) {
              trackToolEvent("question_mastered", {
                tool: quizLabel,
                state: quiz.dataset.state || "general",
                category: question.dataset.category || "Review topic",
              });
            }
            renderMasteryStats();
          }

          renderScore();
          renderActiveQuestion();
          focusQuizContent(feedback);
          saveRecentPractice();
        });
      });
    });
    loadMistakes();
    populateFilterOptions();
    applyInitialFocus();
    restoreRecentPractice();
    renderMistakes();
    renderMasteryStats();
    renderTimer();
  });
}

function initModeTools() {
  document.querySelectorAll("[data-mode-tool]").forEach((tool) => {
    const buttons = Array.from(tool.querySelectorAll("[data-mode-button]"));
    const panels = Array.from(tool.querySelectorAll("[data-mode-panel]"));
    const tabList = tool.querySelector('[role="tablist"]');
    const setTabStop = (chosen) => {
      buttons.forEach((button) => {
        if (button.getAttribute("role") === "tab") button.tabIndex = button === chosen ? 0 : -1;
      });
    };
    const activate = (mode) => {
      buttons.forEach((button) => {
        const active = button.dataset.modeButton === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        const active = panel.dataset.modePanel === mode;
        panel.classList.toggle("is-active", active);
        if (panel.getAttribute("role") === "tabpanel") panel.hidden = !active;
        else panel.setAttribute("aria-hidden", active ? "false" : "true");
      });
      setTabStop(buttons.find((button) => button.dataset.modeButton === mode));
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        activate(button.dataset.modeButton);
        trackToolEvent("practice_mode_select", {
          mode: button.dataset.modeButton,
          label: button.textContent,
        });
      });
    });

    tabList?.addEventListener("keydown", (event) => {
      const index = buttons.indexOf(event.target);
      if (index < 0 || event.target.getAttribute("role") !== "tab" || event.altKey || event.metaKey || event.ctrlKey) return;
      let target;
      if (event.key === "ArrowLeft") target = buttons[(index - 1 + buttons.length) % buttons.length];
      if (event.key === "ArrowRight") target = buttons[(index + 1) % buttons.length];
      if (event.key === "Home") target = buttons[0];
      if (event.key === "End") target = buttons[buttons.length - 1];
      if (!target) return;
      event.preventDefault();
      setTabStop(target);
      target.focus();
    });
    tabList?.addEventListener("focusout", (event) => {
      if (!tabList.contains(event.relatedTarget)) {
        setTabStop(buttons.find((button) => button.getAttribute("aria-selected") === "true"));
      }
    });

    const controls = tool.querySelector("[data-practice-controls]");
    if (controls?.querySelector("[data-quiz-filter] option")) {
      controls.hidden = false;
      tool.querySelector("[data-practice-fallback]").hidden = true;
    }

    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      return;
    }
    const requestedMode = params.get("mode");
    if (requestedMode && buttons.some((button) => button.dataset.modeButton === requestedMode)) {
      activate(requestedMode);
      return;
    }
    const focus = (params.get("focus") || "").trim().toLowerCase();
    if (!focus || ["all", "saved", "due"].includes(focus)) return;
    // Quiz filters are populated before modes initialize, including study-sheet groups.
    const matchingPanel = panels.find((panel) =>
      Array.from(panel.querySelectorAll("[data-quiz-filter] option")).some((option) => option.value.toLowerCase() === focus)
    );
    if (matchingPanel) {
      activate(matchingPanel.dataset.modePanel);
    }
  });
}

function initStateFilters() {
  document.querySelectorAll("[data-state-filter]").forEach((input) => {
    const scope = input.closest("[data-state-filter-scope]");
    if (!scope) return;

    const cards = Array.from(scope.querySelectorAll("[data-state-card], [data-requirements-row], [data-score-row]"));
    const empty = scope.querySelector("[data-state-empty]");

    const filterCards = () => {
      const query = input.value.trim().toLowerCase();
      let visibleCount = 0;

      cards.forEach((card) => {
        const label = (card.dataset.stateName || card.textContent || "").toLowerCase();
        const visible = !query || label.includes(query);
        card.hidden = !visible;
        card.classList.toggle("is-hidden-by-filter", !visible);
        if (visible) visibleCount += 1;
      });

      if (empty) empty.hidden = visibleCount !== 0;
    };

    input.addEventListener("input", filterCards);
    filterCards();
  });
}

function initPracticeWorkbenches() {
  document.querySelectorAll("[data-practice-workbench]").forEach((workbench) => {
    const stateSelect = workbench.querySelector("[data-workbench-state]");
    const primary = workbench.querySelector("[data-workbench-primary]");
    const secondary = workbench.querySelector("[data-workbench-secondary]");
    const checklist = workbench.querySelector("[data-workbench-checklist]");
    const source = workbench.querySelector("[data-workbench-source]");
    const agency = workbench.querySelector("[data-workbench-agency]");
    const planTitle = workbench.querySelector("[data-workbench-plan-title]");
    const planCopy = workbench.querySelector("[data-workbench-plan-copy]");

    const selectSavedState = () => {
      if (!stateSelect) return;
      const savedState = readDmvJourney().state;
      if (!savedState) return;
      const match = Array.from(stateSelect.options).find(
        (option) => normalizeDmvState(option.value || option.textContent) === savedState,
      );
      if (match) stateSelect.value = match.value;
    };

    const updateStateLinks = () => {
      const selected = stateSelect?.selectedOptions?.[0];
      if (!selected) return;
      const stateName = selected.textContent.trim();
      if (primary) {
        primary.href = selected.dataset.practiceUrl || primary.href;
        annotateDmvStateLink(primary, selected, "practice");
      }
      if (secondary) {
        secondary.href = selected.dataset.signUrl || secondary.href;
        annotateDmvStateLink(secondary, selected, "road_signs");
      }
      if (checklist) {
        checklist.href = selected.dataset.checklistUrl || checklist.href;
        annotateDmvStateLink(checklist, selected, "checklist");
      }
      if (source) {
        source.href = selected.dataset.sourceUrl || source.href;
        source.textContent = selected.dataset.sourceLabel ? "Official source" : "Source finder";
      }
      if (agency) agency.textContent = selected.dataset.agency || "State agency";
      if (planTitle) planTitle.textContent = `${stateName} permit-test path`;
      if (planCopy) {
        planCopy.textContent = `Use ${selected.dataset.agency || "the state agency"} for final rules, then practice questions, signs, and checklist items in order.`;
      }
    };

    stateSelect?.addEventListener("change", () => {
      updateStateLinks();
      setDmvJourneyState(stateSelect.value);
      trackToolEvent("study_state_change", { state: normalizeDmvState(stateSelect.value) });
    });
    document.addEventListener("tdt:dmv-state", (event) => {
      const requested = normalizeDmvState(event.detail?.state);
      const match = Array.from(stateSelect?.options || []).find(
        (option) => normalizeDmvState(option.value || option.textContent) === requested,
      );
      if (match && stateSelect.value !== match.value) {
        stateSelect.value = match.value;
        updateStateLinks();
      }
    });
    selectSavedState();
    updateStateLinks();
  });
}

function initMiniSignDrills() {
  document.querySelectorAll("[data-mini-sign-drill]").forEach((drill) => {
    const questions = Array.from(drill.querySelectorAll("[data-mini-question]"));
    if (!questions.length) return;
    const scoreLabel = drill.querySelector("[data-mini-drill-score]");
    const feedback = drill.querySelector("[data-mini-drill-feedback]");
    const nextButton = drill.querySelector("[data-mini-drill-next]");
    const focusLink = drill.querySelector("[data-mini-drill-focus-link]");
    const speedLink = drill.querySelector("[data-mini-drill-speed-link]");
    const missedFocus = new Set();
    let activeIndex = 0;
    let correct = 0;
    let answered = 0;

    const updateReviewLinks = () => {
      const missedRegulatory = missedFocus.has("Regulatory signs");
      const missedSpeed = missedFocus.has("Speed signs");
      if (focusLink) {
        focusLink.hidden = missedSpeed && !missedRegulatory;
        const params = new URLSearchParams({ mode: "road-signs-core" });
        if (missedRegulatory) params.set("focus", "Regulatory signs");
        focusLink.href = `road-signs-practice-test.html?${params}#practice`;
        focusLink.textContent = missedRegulatory ? "Practice regulatory signs" : "Full road signs test";
      }
      if (speedLink) speedLink.hidden = !missedSpeed;
    };

    const updateNextButton = () => {
      if (!nextButton) return;
      nextButton.disabled = questions[activeIndex].dataset.answered !== "true";
      nextButton.textContent = answered === questions.length ? "Restart drill" : "Next sign";
    };

    const showQuestion = ({ focus = false } = {}) => {
      questions.forEach((question, index) => {
        const active = index === activeIndex;
        question.classList.toggle("is-active", active);
        question.setAttribute("aria-hidden", active ? "false" : "true");
      });
      if (feedback) feedback.textContent = "Choose the driver's action.";
      updateNextButton();
      if (focus) questions[activeIndex].querySelector("[data-mini-prompt]")?.focus({ preventScroll: true });
    };

    const updateScore = () => {
      if (scoreLabel) scoreLabel.textContent = `${correct}/${questions.length}`;
    };

    questions.forEach((question) => {
      question.querySelectorAll("[data-mini-choice]").forEach((button) => {
        button.addEventListener("click", () => {
          if (question.dataset.answered === "true") return;
          question.dataset.answered = "true";
          answered += 1;
          const isCorrect = Number(button.dataset.miniChoice) === Number(question.dataset.miniAnswer);
          if (isCorrect) correct += 1;
          if (!isCorrect && question.dataset.miniFocus) {
            missedFocus.add(question.dataset.miniFocus);
          }
          trackToolEvent("mini_diagnostic_answer", {
            tool: "road_sign_mini_diagnostic",
            question_index: questions.indexOf(question) + 1,
            focus: question.dataset.miniFocus || "road_signs",
            correct: isCorrect,
            answered,
            total: questions.length,
          });
          button.classList.add(isCorrect ? "is-correct" : "is-wrong");
          const correctButton = question.querySelector(`[data-mini-choice="${question.dataset.miniAnswer}"]`);
          correctButton?.classList.add("is-correct");
          question.querySelectorAll("[data-mini-choice]").forEach((choice) => {
            choice.disabled = true;
          });
          if (feedback) {
            const result = answered === questions.length ? ` Round complete: ${correct} correct out of ${questions.length}.` : "";
            feedback.textContent = `${isCorrect ? "Correct." : "Not quite."} ${question.dataset.miniExplanation}${result}`;
          }
          updateScore();
          updateReviewLinks();
          updateNextButton();
          nextButton?.focus({ preventScroll: true });
        });
      });
    });

    nextButton?.addEventListener("click", () => {
      if (questions[activeIndex].dataset.answered !== "true") return;
      if (answered < questions.length) {
        activeIndex += 1;
      } else {
        activeIndex = 0;
        correct = 0;
        answered = 0;
        missedFocus.clear();
        questions.forEach((question) => {
          delete question.dataset.answered;
          question.querySelectorAll("[data-mini-choice]").forEach((choice) => {
            choice.disabled = false;
            choice.classList.remove("is-correct", "is-wrong");
          });
        });
        updateScore();
        updateReviewLinks();
      }
      showQuestion({ focus: true });
    });

    updateScore();
    updateReviewLinks();
    showQuestion();
  });
}

function signSearchWords(value) {
  return value.normalize("NFKC").toLowerCase().replace(/\buturn\b/g, "u turn").match(/[a-z0-9]+/g) || [];
}

function matchesSignSearch(words, terms) {
  return terms.every((term) => words.some((word) =>
    word === term || ((term.length > 1 || terms.length === 1) && word.startsWith(term))));
}

function initSignLookups() {
  document.querySelectorAll("[data-sign-lookup]").forEach((lookup) => {
    const search = lookup.querySelector("[data-sign-search]");
    const filterButtons = Array.from(lookup.querySelectorAll("[data-sign-filter]"));
    const cards = Array.from(lookup.querySelectorAll("[data-sign-card]"));
    const searchable = cards.map((card) => signSearchWords(card.dataset.signQuery || ""));
    const count = lookup.querySelector("[data-sign-count]");
    const empty = lookup.querySelector("[data-sign-empty]");
    const countLabel = lookup.dataset.signCountLabel || "sign";
    let activeFilter = "all";

    const render = () => {
      const terms = signSearchWords(search?.value || "");
      let shown = 0;
      cards.forEach((card, index) => {
        const matchesFilter = activeFilter === "all" || card.dataset.signFilterKey === activeFilter;
        const visible = matchesFilter && matchesSignSearch(searchable[index], terms);
        card.hidden = !visible;
        if (visible) shown += 1;
      });
      if (count) count.textContent = `${shown} ${countLabel}${shown === 1 ? "" : "s"} shown`;
      if (empty) empty.hidden = shown !== 0;
      filterButtons.forEach((button) => {
        const active = button.dataset.signFilter === activeFilter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    };

    search?.addEventListener("input", render);
    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.signFilter || "all";
        render();
      });
    });
    render();
  });
}

function initRoadSignFlashcards() {
  document.querySelectorAll("[data-road-sign-flashcards]").forEach((deck) => {
    const cards = Array.from(deck.querySelectorAll("[data-flashcard]"));
    const searchable = cards.map((card) => signSearchWords(card.dataset.cardQuery || ""));
    const filterSelect = deck.querySelector("[data-flashcard-filter]");
    const searchInput = deck.querySelector("[data-flashcard-search]");
    const resetButton = deck.querySelector("[data-flashcard-reset]");
    const resetDialog = deck.querySelector("[data-flashcard-reset-dialog]");
    const prevButton = deck.querySelector("[data-flashcard-prev]");
    const nextButton = deck.querySelector("[data-flashcard-next]");
    const knownButton = deck.querySelector("[data-flashcard-known-button]");
    const reviewButton = deck.querySelector("[data-flashcard-review-button]");
    const position = deck.querySelector("[data-flashcard-position]");
    const knownCount = deck.querySelector("[data-flashcard-known]");
    const reviewCount = deck.querySelector("[data-flashcard-review]");
    const visibleCount = deck.querySelector("[data-flashcard-visible]");
    const message = deck.querySelector("[data-flashcard-message]");
    const empty = deck.querySelector("[data-flashcard-empty]");
    const missedSummary = deck.querySelector("[data-flashcard-missed-summary]");
    const missedNote = deck.querySelector("[data-flashcard-missed-note]");
    const missedReturn = deck.querySelector("[data-flashcard-missed-return]");
    const announcement = deck.querySelector("[data-flashcard-announcement]");
    const storageKey = "tdt-road-sign-flashcards";
    let known = new Set();
    let review = new Set();
    let useSavedMarks = true;
    let activeIndexes = cards.map((_, index) => index);
    let activePosition = 0;

    const load = () => {
      if (!useSavedMarks) return;
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
        known = new Set(Array.isArray(saved?.known) ? saved.known : []);
        review = new Set(Array.isArray(saved?.review) ? saved.review : []);
      } catch (error) {
        // Keep the current session's marks if saved data cannot be read.
      }
    };

    const save = () => {
      if (!useSavedMarks) return false;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({
          known: Array.from(known),
          review: Array.from(review),
          updatedAt: Date.now(),
        }));
        return true;
      } catch (error) {
        useSavedMarks = false;
        return false;
      }
    };

    const cardId = (card) => card?.dataset.cardId || "";
    const fromMissedQuiz = window.location.hash === "#missed-sign-cards";
    const missedCardIds = new Set();
    if (fromMissedQuiz) {
      try {
        const selection = JSON.parse(window.sessionStorage.getItem(MISSED_SIGN_CARDS_KEY) || "null");
        if (["road-signs-starter", "road-signs-core"].includes(selection?.mode) && Array.isArray(selection.signIds)) {
          const supportedIds = new Set(cards.map(cardId));
          selection.signIds.filter(id => supportedIds.has(id)).forEach(id => missedCardIds.add(id));
          if (missedCardIds.size && filterSelect) {
            const option = new Option("Missed in this round", "missed");
            filterSelect.append(option);
            filterSelect.value = option.value;
          }
          if (missedCardIds.size && missedReturn) {
            const query = new URLSearchParams({ mode: selection.mode, focus: "saved" });
            missedReturn.href = `road-signs-practice-test.html?${query}#practice`;
          }
        }
      } catch (error) {
        // An absent or invalid handoff must not stop regular flashcard practice.
      }
    }
    const activeCard = () => cards[activeIndexes[activePosition]];
    const answerToggle = (card) => card?.querySelector("[data-flashcard-flip]");
    const isRevealed = (card) => answerToggle(card)?.getAttribute("aria-expanded") === "true";
    const setRevealed = (card, open) => {
      const toggle = answerToggle(card);
      const front = card?.querySelector(".flashcard-front");
      const back = card?.querySelector(".flashcard-back");
      if (!toggle || !front || !back) return;
      front.hidden = open;
      back.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Show picture" : "Reveal answer";
      if (announcement && card === activeCard()) {
        announcement.textContent = open ? back.innerText.trim() : "";
      }
    };
    const focusCard = () => (answerToggle(activeCard()) || filterSelect)?.focus({ preventScroll: true });

    const render = () => {
      cards.forEach((card, index) => {
        const active = activeIndexes[activePosition] === index;
        const id = cardId(card);
        card.hidden = !active;
        card.classList.toggle("is-active", active);
        card.classList.toggle("is-known", known.has(id));
        card.classList.toggle("is-review", review.has(id));
        card.setAttribute("aria-hidden", active ? "false" : "true");
      });

      const current = activeCard();
      const total = activeIndexes.length;
      if (position) position.textContent = total ? `${activePosition + 1} of ${total}` : "0 of 0";
      if (knownCount) knownCount.textContent = String(known.size);
      if (reviewCount) reviewCount.textContent = String(review.size);
      if (resetButton) resetButton.disabled = !known.size && !review.size;
      if (visibleCount) visibleCount.textContent = String(total);
      if (fromMissedQuiz && missedSummary && missedNote) {
        const showMissed = filterSelect?.value === "missed";
        missedSummary.hidden = Boolean(missedCardIds.size) && !showMissed;
        const note = showMissed
          ? total ? `Missed sign card ${activePosition + 1} of ${total}. Your quiz score is unchanged.` : "No missed sign cards match this search."
          : "No matching cards from a quiz are available in this tab. The regular deck is shown.";
        if (missedNote.textContent !== note) missedNote.textContent = note;
        if (missedReturn) missedReturn.hidden = !showMissed;
      }
      if (empty) {
        empty.hidden = total !== 0;
        empty.textContent = filterSelect?.value === "review" && !review.size
          ? "No saved review cards."
          : "No cards match this filter.";
      }
      if (prevButton) prevButton.disabled = activePosition === 0 || total === 0;
      if (nextButton) nextButton.disabled = activePosition >= total - 1 || total === 0;
      if (knownButton) knownButton.disabled = !isRevealed(current);
      if (reviewButton) reviewButton.disabled = !isRevealed(current);
      if (message) {
        const id = cardId(current);
        const status = known.has(id) ? "Marked as known."
          : review.has(id) ? useSavedMarks ? "Saved for review." : "Marked for review." : "";
        message.textContent = useSavedMarks ? status
          : `${status} Browser storage is unavailable. New marks stay in this session.`.trim();
      }
    };

    const applyFilters = (start = 0, retainCard = false) => {
      const previousIndex = retainCard ? activeIndexes[activePosition] : undefined;
      const filter = filterSelect?.value || "all";
      const terms = signSearchWords(searchInput?.value || "");
      activeIndexes = cards
        .map((card, index) => ({ card, index }))
        .filter(({ card, index }) => {
          const matchesFilter = filter === "review" ? review.has(cardId(card))
            : filter === "missed" ? missedCardIds.has(cardId(card))
            : filter === "all" || card.dataset.cardFilter === filter;
          return matchesFilter && matchesSignSearch(searchable[index], terms);
        })
        .map(({ index }) => index);
      const matchedPosition = activeIndexes.indexOf(previousIndex);
      activePosition = matchedPosition < 0
        ? Math.min(start, Math.max(activeIndexes.length - 1, 0)) : matchedPosition;
      if (matchedPosition < 0) {
        cards.forEach((card) => setRevealed(card, false));
        if (announcement) announcement.textContent = "";
      }
      render();
    };

    cards.forEach((card) => {
      answerToggle(card)?.addEventListener("click", () => {
        setRevealed(card, !isRevealed(card));
        render();
      });
    });

    const markActive = (status) => {
      const current = activeCard();
      if (!isRevealed(current)) return;
      const id = cardId(current);
      load();
      if (status === "known") {
        known.add(id);
        review.delete(id);
      } else {
        review.add(id);
        known.delete(id);
      }
      save();
      trackToolEvent("flashcard_mark", {
        tool: "road_sign_flashcards",
        status,
        filter: filterSelect?.value || "all",
        visible_cards: activeIndexes.length,
      });
      if (filterSelect?.value === "review") {
        applyFilters(activePosition, status !== "known");
        if (status === "known") focusCard();
      } else {
        render();
      }
    };

    knownButton?.addEventListener("click", () => markActive("known"));
    reviewButton?.addEventListener("click", () => markActive("review"));
    const moveCard = (offset) => {
      setRevealed(activeCard(), false);
      activePosition = Math.max(0, Math.min(activePosition + offset, activeIndexes.length - 1));
      render();
      focusCard();
    };
    prevButton?.addEventListener("click", () => moveCard(-1));
    nextButton?.addEventListener("click", () => moveCard(1));
    const clearMarks = () => {
      known = new Set();
      review = new Set();
      const persisted = save();
      applyFilters(activePosition, true);
      if (message) message.textContent = persisted ? "Saved marks cleared."
        : "Marks cleared for this session only. Browser storage could not be updated.";
      filterSelect?.focus({ preventScroll: true });
    };
    resetButton?.addEventListener("click", () => {
      if (typeof resetDialog?.showModal === "function") {
        resetDialog.returnValue = "";
        resetDialog.showModal();
      } else if (window.confirm("Clear all Known and Review marks saved in this browser?")) {
        clearMarks();
      }
    });
    resetDialog?.addEventListener("close", () => {
      if (resetDialog.returnValue === "clear") clearMarks();
    });
    filterSelect?.addEventListener("change", () => applyFilters());
    searchInput?.addEventListener("input", () => applyFilters());
    window.addEventListener("storage", (event) => {
      if (!useSavedMarks || (event.key !== storageKey && event.key !== null)) return;
      const previous = activeCard();
      const focused = document.activeElement;
      const restoreFocus = previous?.contains(focused)
        || [knownButton, reviewButton, prevButton, nextButton, resetButton].includes(focused);
      load();
      applyFilters(activePosition, true);
      if (restoreFocus && (previous !== activeCard() || focused.disabled)) focusCard();
    });

    load();
    applyFilters();
  });
}

function initWorksheetReturns() {
  const answer = new URLSearchParams(window.location.search).get("return");
  if (!answer) return;
  document.querySelectorAll("[data-worksheet-return]").forEach((container) => {
    if (!container.dataset.worksheetReturn.split(" ").includes(answer)) return;
    const link = container.querySelector("a");
    if (!link) return;
    const destination = new URL(link.href);
    destination.hash = answer;
    link.setAttribute("href", destination.pathname.split("/").pop() + destination.hash);
    container.hidden = false;
  });
}

function initRecentPracticeCards() {
  document.querySelectorAll("[data-recent-practice]").forEach((card) => {
    const title = card.querySelector("[data-recent-practice-title]");
    const meta = card.querySelector("[data-recent-practice-meta]");
    const link = card.querySelector("[data-recent-practice-link]");
    const progress = readRecentPractice();
    const href = recentPracticeHref(progress);
    if (!href) return;

    const answered = Number(progress.answered) || 0;
    const total = Number(progress.total) || 0;
    const correct = Number(progress.correct) || 0;
    const missed = Number(progress.missed) || 0;

    if (title) title.textContent = progress.label || "Recent practice";
    if (meta) {
      const counts = total
        ? `${answered} of ${total} answered · ${correct} correct · ${missed} missed`
        : `${correct} correct · ${missed} missed`;
      meta.textContent = progress.draft ? `${counts} · Saved in this browser` : `Last result: ${counts}`;
    }
    if (link) {
      link.href = href;
      link.textContent = progress.draft ? "Resume unfinished round" : "Open practice set";
    }
  });
}

function initDmvJourneyDashboards() {
  document.querySelectorAll("[data-dmv-journey]").forEach((dashboard) => {
    const stateSelect = dashboard.querySelector("[data-journey-state]");
    const kicker = dashboard.querySelector("[data-journey-kicker]");
    const title = dashboard.querySelector("[data-journey-title]");
    const copy = dashboard.querySelector("[data-journey-copy]");
    const primary = dashboard.querySelector("[data-journey-primary]");
    const source = dashboard.querySelector("[data-journey-source]");
    const answered = dashboard.querySelector("[data-journey-answered]");
    const accuracy = dashboard.querySelector("[data-journey-accuracy]");
    const sessions = dashboard.querySelector("[data-journey-sessions]");
    const streak = dashboard.querySelector("[data-journey-streak]");
    const due = dashboard.querySelector("[data-journey-due]");
    const reliable = dashboard.querySelector("[data-journey-reliable]");
    const recentBox = dashboard.querySelector("[data-journey-recent]");
    const recentTitle = dashboard.querySelector("[data-journey-recent-title]");
    const recentMeta = dashboard.querySelector("[data-journey-recent-meta]");
    const recentLink = dashboard.querySelector("[data-journey-recent-link]");
    const reviewBox = dashboard.querySelector("[data-journey-review]");
    const reviewTitle = dashboard.querySelector("[data-journey-review-title]");
    const reviewCopy = dashboard.querySelector("[data-journey-review-copy]");
    const reviewLink = dashboard.querySelector("[data-journey-review-link]");
    const homeShortcuts = Array.from(document.querySelectorAll("[data-home-state-shortcut]"), (link) => ({
      link, destination: link.getAttribute("href"),
    }));
    let selectedHere = false;
    const steps = Object.fromEntries(
      Array.from(dashboard.querySelectorAll("[data-journey-step]")).map((step) => [step.dataset.journeyStep, step]),
    );

    const setStep = (name, status, complete = false, active = false) => {
      const step = steps[name];
      if (!step) return;
      const label = step.querySelector("[data-journey-step-status]");
      if (label) label.textContent = status;
      step.classList.toggle("is-complete", complete);
      step.classList.toggle("is-active", active);
    };

    const checklistCount = (state) => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(`tdt-dmv-test-day:${state}`) || "null");
        return Array.isArray(saved?.checked) ? saved.checked.length : 0;
      } catch (error) {
        return 0;
      }
    };

    const countStreak = (days) => {
      let count = 0;
      const cursor = new Date();
      if (!Number(days[localDayStamp(cursor.getTime())]?.answered)) {
        cursor.setDate(cursor.getDate() - 1);
      }
      while (count < 30) {
        const stamp = localDayStamp(cursor.getTime());
        if (!Number(days[stamp]?.answered)) break;
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return count;
    };

    const selectState = (state) => {
      const requested = normalizeDmvState(state);
      const match = Array.from(stateSelect?.options || []).find((option) => option.value === requested);
      if (match) stateSelect.value = match.value;
    };

    const render = () => {
      const journey = readDmvJourney();
      selectState(journey.state);
      const option = stateSelect?.selectedOptions?.[0];
      if (!option) return;
      const state = option.value;
      const stateLabel = option.dataset.label || option.textContent.trim();
      homeShortcuts.forEach(({ link, destination }) => {
        if (!selectedHere && journey.state !== state) {
          link.setAttribute("href", destination);
          return;
        }
        const target = new URL(destination, window.location.href);
        target.searchParams.set("state", state);
        link.setAttribute("href", destination.split(/[?#]/, 1)[0] + target.search + target.hash);
      });
      const today = journey.days[localDayStamp()] || { answered: 0, correct: 0, sessions: 0 };
      const answeredToday = Number(today.answered) || 0;
      const correctToday = Number(today.correct) || 0;
      const missedToday = Math.max(answeredToday - correctToday, 0);
      const accuracyToday = answeredToday ? Math.round((correctToday / answeredToday) * 100) : 0;
      const stateSessions = journey.sessions.filter((session) => !session.state || session.state === state);
      const recent = stateSessions[0] || null;
      const recentPractice = readRecentPractice();
      const draftState = normalizeDmvState(recentPractice?.state);
      const resumeHref = recentPractice?.draft && (!draftState || draftState === "general" || draftState === state)
        ? recentPracticeHref(recentPractice)
        : "";
      const mastery = getDmvMasterySummary(state);
      const baselineCount = Math.min(mastery.attempted, DMV_BASELINE_SIZE);
      const baselineComplete = baselineCount === DMV_BASELINE_SIZE;
      const twoWeeksAgo = Date.now() - 14 * 86400000;
      const permitPage = option.dataset.mixedPracticeUrl || "";
      const targetRounds = stateSessions.filter((session) => (
        permitPage && session.state === state && session.mode === "mock" &&
        session.fullRound === true && session.practiceTargetMet === true &&
        String(session.href || "").split(/[?#]/, 1)[0] === permitPage &&
        Number(session.completedAt) >= twoWeeksAgo
      )).length;
      const readyCount = checklistCount(state);
      const weak = recent
        ? recent.weak?.[0] || ""
        : Object.entries(journey.weak).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || "";

      if (source) source.href = option.dataset.sourceUrl || source.href;
      if (answered) answered.textContent = `${answeredToday} ${answeredToday === 1 ? "question" : "questions"}`;
      if (accuracy) accuracy.textContent = answeredToday ? `${accuracyToday}% today` : "No baseline";
      if (sessions) sessions.textContent = `${stateSessions.length} ${stateSessions.length === 1 ? "round" : "rounds"}`;
      const streakCount = countStreak(journey.days);
      if (streak) streak.textContent = `${streakCount} ${streakCount === 1 ? "day" : "days"}`;
      if (due) due.textContent = `${mastery.due} ${mastery.due === 1 ? "question" : "questions"}`;
      if (reliable) reliable.textContent = `${mastery.reliable} ${mastery.reliable === 1 ? "question" : "questions"}`;

      setStep("warmup", baselineComplete ? "Complete" : `${baselineCount} of ${DMV_BASELINE_SIZE}`, baselineComplete, !baselineComplete);
      if (mastery.due) {
        setStep("review", `${mastery.due} due`, false, baselineComplete);
      } else if (baselineComplete) {
        setStep("review", "Queue clear", true, false);
      } else if (weak) {
        setStep("review", `Review ${weak}`, false, false);
      } else {
        setStep("review", "Waiting", false, false);
      }
      setStep("passes", permitPage ? `${Math.min(targetRounds, 2)} of 2` : "Not available", targetRounds >= 2, Boolean(permitPage) && baselineComplete && targetRounds < 2 && !mastery.due);
      const checklistNext = targetRounds >= 2 || (!permitPage && baselineComplete && !mastery.due);
      setStep("ready", `${readyCount} of 12`, readyCount >= 12, checklistNext && readyCount < 12);

      if (recent && recentBox) {
        recentBox.hidden = false;
        if (recentTitle) recentTitle.textContent = recent.label || "Completed practice round";
        if (recentMeta) {
          const weakText = recent.weak?.length ? ` · review ${recent.weak.join(", ")}` : " · no missed categories";
          recentMeta.textContent = `${recent.correct} of ${recent.total} correct · ${recent.percent}%${weakText}`;
        }
        if (recentLink) recentLink.href = recent.href || option.dataset.practiceUrl || "dmv-practice.html";
      } else if (recentBox) {
        recentBox.hidden = true;
      }

      if (mastery.dueItem && reviewBox) {
        reviewBox.hidden = false;
        if (reviewTitle) reviewTitle.textContent = `${mastery.due} ${mastery.due === 1 ? "question needs" : "questions need"} another round`;
        if (reviewCopy) {
          reviewCopy.textContent = `${mastery.dueItem.category || "Review topic"}: ${mastery.dueItem.prompt || "Return to the saved practice question."}`;
        }
        if (reviewLink) reviewLink.href = mastery.dueItem.href || "road-signs-practice-test.html?focus=due#practice";
      } else if (reviewBox) {
        reviewBox.hidden = true;
      }

      if (mastery.due && mastery.dueItem) {
        kicker.textContent = "Review queue ready";
        title.textContent = `Review ${mastery.due} due ${mastery.due === 1 ? "question" : "questions"}`;
        copy.textContent = "Retry misses now. For a question you answered correctly, return when its next check is due rather than repeating it immediately.";
        primary.href = mastery.dueItem.href || option.dataset.practiceUrl || "dmv-practice.html";
        primary.textContent = "Start due review";
      } else if (!mastery.attempted) {
        kicker.textContent = `Start ${stateLabel} prep today`;
        title.textContent = "Take the 10-question road-sign diagnostic";
        copy.textContent = "A short first round creates a baseline and reveals which sign family or rule deserves the next ten minutes.";
        primary.href = "road-signs-practice-test.html?mode=road-signs-starter#practice";
        primary.textContent = "Start 10 questions";
      } else if (!baselineComplete) {
        kicker.textContent = "Finish the baseline";
        title.textContent = `${DMV_BASELINE_SIZE - baselineCount} new ${baselineCount === DMV_BASELINE_SIZE - 1 ? "question" : "questions"} to finish your baseline`;
        copy.textContent = "Repeating a question you have already answered does not advance the baseline.";
        primary.href = resumeHref || "road-signs-practice-test.html?mode=road-signs-core&focus=baseline#practice";
        primary.textContent = resumeHref ? "Resume unfinished round" : "Practice new questions";
      } else if (missedToday && weak) {
        kicker.textContent = "Best next study block";
        title.textContent = `Repair ${weak}`;
        copy.textContent = `Use the ${stateLabel} practice path and official source to fix the rule, then retake a focused round.`;
        primary.href = option.dataset.practiceUrl || "dmv-practice.html";
        primary.textContent = `Review ${stateLabel} rules`;
      } else if (!permitPage) {
        kicker.textContent = "Use your state handbook";
        title.textContent = `Confirm ${stateLabel} exam requirements`;
        copy.textContent = "This path includes sign practice but not a full state mixed round. Check the official handbook and confirm the documents, appointment, and rules for your test.";
        primary.href = option.dataset.checklistUrl || "dmv-test-day-checklist.html";
        primary.textContent = "Open test-day checklist";
      } else if (targetRounds < 2) {
        kicker.textContent = "Check the full practice set";
        title.textContent = targetRounds ? "Meet the practice target once more" : "Meet the full practice target";
        copy.textContent = "Use the full mixed practice for your state. Focused, signs-only and warm-up rounds do not count here. This is a study benchmark, not an official exam result.";
        primary.href = `${permitPage}?mode=mock#practice`;
        primary.textContent = `Start ${stateLabel} mixed practice`;
      } else if (readyCount < 12) {
        kicker.textContent = "Move from score to test day";
        title.textContent = `Finish the ${stateLabel} readiness checklist`;
        copy.textContent = "You met both practice targets. Confirm the official exam rules, documents, appointment details, and arrival logistics before test day.";
        primary.href = option.dataset.checklistUrl || "dmv-test-day-checklist.html";
        primary.textContent = "Continue checklist";
      } else {
        kicker.textContent = "Readiness path complete";
        title.textContent = "Protect the result with one calm final review";
        copy.textContent = "Use the official source for changes, then stop cramming and keep the final practice short.";
        primary.href = option.dataset.practiceUrl || "dmv-practice.html";
        primary.textContent = "Run final review";
      }
    };

    stateSelect?.addEventListener("change", () => {
      selectedHere = true;
      setDmvJourneyState(stateSelect.value);
      render();
      trackToolEvent("study_state_change", { state: stateSelect.value, surface: "journey_dashboard" });
    });
    primary?.addEventListener("click", () => {
      trackToolEvent("study_next_step_click", {
        state: stateSelect?.value || "unknown",
        target: analyticsPathFromHref(primary.href),
      });
    });
    reviewLink?.addEventListener("click", () => {
      trackToolEvent("mastery_review_start", {
        state: stateSelect?.value || "unknown",
        surface: "journey_dashboard",
        target: analyticsPathFromHref(reviewLink.href),
      });
    });
    document.addEventListener("tdt:dmv-progress", render);
    document.addEventListener("tdt:dmv-mastery", render);
    document.addEventListener("tdt:dmv-state", (event) => {
      selectState(event.detail?.state);
      render();
    });
    render();
  });
}

function initDmvDailyQuestions() {
  document.querySelectorAll("[data-dmv-daily-question]").forEach((widget) => {
    const cards = Array.from(widget.querySelectorAll("[data-daily-card]"));
    const stateSelect = widget.querySelector("[data-daily-state]");
    const dateLabel = widget.querySelector("[data-daily-date]");
    const title = widget.querySelector("[data-daily-title]");
    const note = widget.querySelector("[data-daily-note]");
    const nextButton = widget.querySelector("[data-daily-next]");
    const today = new Date();
    const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS);
    const dateText = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    let offset = 0;

    if (stateSelect) {
      const requested = new URLSearchParams(window.location.search).get("state");
      const preferred = normalizeDmvState(requested ?? readDmvJourney().state);
      if (Array.from(stateSelect.options).some(option => option.value === preferred)) stateSelect.value = preferred;
    }
    const visibleCards = () => cards.filter(card => card.dataset.state === (stateSelect?.value || "all"));

    const render = () => {
      const matches = visibleCards();
      if (!matches.length) return;
      const active = matches[(dayNumber + offset) % matches.length];
      cards.forEach((card) => {
        const isActive = card === active;
        card.hidden = !isActive;
        card.classList.toggle("is-active", isActive);
        card.setAttribute("aria-hidden", isActive ? "false" : "true");
      });

      const stateName = active.dataset.stateLabel || stateSelect?.selectedOptions?.[0]?.textContent?.trim() || "DMV";
      const category = active.dataset.category || "Permit basics";
      if (dateLabel) dateLabel.textContent = offset ? `${dateText} · Extra practice` : `${dateText} · Today's question`;
      if (title) title.textContent = `${stateName}: ${category}`;
      if (note) note.textContent = `Prompt ${offset + 1} of ${matches.length}`;
      return active;
    };

    cards.forEach((card) => {
      shuffleChoiceButtons(card.querySelector(".daily-choice-grid"));
      card.querySelectorAll("[data-daily-choice]").forEach((button) => {
        button.addEventListener("click", () => {
          if (card.dataset.answered === "true") return;
          card.dataset.answered = "true";
          const answer = Number(card.dataset.answer);
          const choice = Number(button.dataset.dailyChoice);
          const correct = answer === choice;
          button.classList.add(correct ? "is-correct" : "is-wrong");
          const correctButton = card.querySelector(`[data-daily-choice="${answer}"]`);
          correctButton?.classList.add("is-correct");
          card.querySelectorAll("[data-daily-choice]").forEach((choiceButton) => {
            choiceButton.disabled = true;
          });
          const feedback = card.querySelector("[data-daily-feedback]");
          const explanation = card.querySelector("[data-daily-explanation]");
          if (explanation) explanation.hidden = false;
          card.querySelector("[data-daily-source]")?.removeAttribute("hidden");
          if (feedback) {
            feedback.textContent = correct
              ? "Correct."
              : "Not quite. Review the explanation below.";
            feedback.tabIndex = -1;
            feedback.focus();
          }
        });
      });
    });

    stateSelect?.addEventListener("change", () => {
      offset = 0;
      render();
    });
    nextButton?.addEventListener("click", () => {
      const count = visibleCards().length;
      if (count < 2) return;
      offset = (offset + 1) % count;
      const heading = render()?.querySelector("h3");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    });
    if (render()) {
      widget.querySelectorAll("[data-daily-interactive]").forEach(element => { element.hidden = false; });
      const selfCheck = widget.querySelector("[data-daily-self-check]");
      if (selfCheck) selfCheck.hidden = true;
    }
  });
}

const DMV_STUDY_DAYS = ["3", "7", "14", "21"];
const DMV_STUDY_FOCUS = new Map([
  ["mixed", "Choose from your misses"],
  ["road-signs", "Road-sign recognition"],
  ["rules", "Rules and right-of-way"],
  ["score", "Passing-score confidence"],
  ["documents", "Documents and logistics"],
]);

function initDmvMistakeLogs() {
  document.querySelectorAll("[data-dmv-mistake-log]").forEach((tool) => {
    const form = tool.querySelector("[data-mistake-form]");
    const stateSelect = tool.querySelector("[data-mistake-state]");
    const topicSelect = tool.querySelector("[data-mistake-topic]");
    const promptInput = tool.querySelector("[data-mistake-prompt]");
    const fixInput = tool.querySelector("[data-mistake-fix]");
    const list = tool.querySelector("[data-mistake-list]");
    const total = tool.querySelector("[data-mistake-total]");
    const totalLabel = tool.querySelector("[data-mistake-total-label]");
    const topLabel = tool.querySelector("[data-mistake-top-label]");
    const topTopic = tool.querySelector("[data-mistake-top-topic]");
    const next = tool.querySelector("[data-mistake-next]");
    const stateLabel = tool.querySelector("[data-mistake-state-label]");
    const rule = tool.querySelector("[data-mistake-rule]");
    const source = tool.querySelector("[data-mistake-source]");
    const practice = tool.querySelector("[data-mistake-practice]");
    const signs = tool.querySelector("[data-mistake-signs]");
    const plan = tool.querySelector("[data-mistake-plan]");
    const checklist = tool.querySelector("[data-mistake-checklist]");
    const copyButton = tool.querySelector("[data-mistake-copy]");
    const saveStatus = tool.querySelector("[data-mistake-save-status]");
    const storageKey = "tdt-dmv-mistake-log";
    const params = new URLSearchParams(window.location.search);
    let entries = [];
    let storageAvailable = true;

    const escapeHtml = (value) =>
      String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);

    const selectedState = () => stateSelect?.selectedOptions?.[0];
    const selectedTopicLabel = () => topicSelect?.selectedOptions?.[0]?.textContent?.trim() || "Review topic";

    const load = () => {
      if (!storageAvailable) return;
      let raw;
      try {
        raw = window.localStorage.getItem(storageKey);
      } catch (error) {
        storageAvailable = false;
        return;
      }
      try {
        const saved = JSON.parse(raw || "[]");
        entries = Array.isArray(saved) ? saved.filter(entry => entry && typeof entry.prompt === "string") : [];
      } catch (error) {
        entries = [];
      }
    };

    const save = () => {
      if (!storageAvailable) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 30)));
      } catch (error) {
        storageAvailable = false;
      }
    };

    const reviewFor = (entry) => {
      const drill = Array.from(topicSelect?.options || []).find(option => option.value === entry.topic)?.dataset;
      if (drill?.reviewHref) return [drill.reviewHref, drill.reviewLabel];
      const state = Array.from(stateSelect?.options || []).find(option => option.value === entry.state)?.dataset;
      if (!state) return ["dmv-practice.html", "Open DMV practice"];
      const label = state.stateLabel;
      if (entry.topic === "right-of-way") {
        if (state.rightOfWayUrl) return [state.rightOfWayUrl, `Practice ${label} right-of-way rules`];
        if (state.rightOfWayCase) return [state.rightOfWayCase, `Review the ${label} right-of-way case`];
        return [state.sourceUrl, `Read the ${label} handbook`];
      }
      if (entry.topic === "score") return [state.scoreUrl, `Check the ${label} score rule`];
      if (entry.topic === "road-signs" || entry.topic === "regulatory-signs") {
        return [state.signsUrl, `Open ${label} sign practice`];
      }
      if (entry.topic === "documents" || entry.topic === "documents-appointment" || entry.topic === "course-exam-permit") {
        if (entry.state === "florida") {
          return entry.topic === "course-exam-permit"
            ? ["florida-class-e-knowledge-exam-tlsae.html#florida-course-path", "Check Florida course steps"]
            : ["florida-dmv-permit-documents-checklist.html#florida-document-route", "Check Florida documents"];
        }
        return [state.checklistUrl, `Open the ${label} checklist`];
      }
      if (state.mixedUrl) return [state.mixedUrl, `Open ${label} mixed practice`];
      return [state.sourceUrl, `Read the ${label} handbook`];
    };

    const renderLinks = () => {
      const option = selectedState();
      if (!option) return;
      if (stateLabel) stateLabel.textContent = option.dataset.stateLabel || option.textContent.trim();
      if (rule) rule.textContent = option.dataset.rule || "Confirm with official source.";
      if (source) source.href = option.dataset.sourceUrl || "#";
      if (practice) {
        [practice.href, practice.textContent] = reviewFor({ state: option.value });
      }
      if (signs) signs.href = option.dataset.signsUrl || "road-signs-practice-test.html";
      if (plan) {
        const planParams = new URLSearchParams({ state: option.value });
        const days = params.get("days");
        const focus = params.get("focus");
        if (DMV_STUDY_DAYS.includes(days)) planParams.set("days", days);
        if (DMV_STUDY_FOCUS.has(focus)) planParams.set("focus", focus);
        plan.href = `dmv-permit-test-study-plan.html?${planParams}#study-plan`;
      }
      if (checklist) checklist.href = option.dataset.checklistUrl || "dmv-test-day-checklist.html";
    };

    const render = () => {
      renderLinks();
      if (saveStatus) saveStatus.hidden = storageAvailable;
      if (totalLabel) totalLabel.textContent = storageAvailable ? "Total saved" : "Notes in this tab";
      if (total) total.textContent = String(entries.length);
      const option = selectedState();
      if (topLabel && option) topLabel.textContent = `Top ${option.dataset.stateLabel} weak area`;
      const counts = new Map();
      for (const entry of entries) {
        if (entry.state === option?.value) counts.set(entry.topicLabel, (counts.get(entry.topicLabel) || 0) + 1);
      }
      const strongest = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (topTopic) topTopic.textContent = strongest ? strongest[0] : "None yet";
      if (next) {
        next.textContent = strongest
          ? `Review ${strongest[0]} before the next full practice round.`
          : "Save a mistake for this state to get a next action.";
      }

      if (!list) return;
      if (!entries.length) {
        list.innerHTML = "<p>No saved mistakes yet. Add one missed question or weak topic above.</p>";
        return;
      }

      list.innerHTML = entries
        .map((entry, index) => {
          const [href, label] = reviewFor(entry);
          return `<article>
            <div>
              <span>${escapeHtml(entry.stateLabel || "Selected state")} · ${escapeHtml(entry.topicLabel || "Review topic")}</span>
              <strong>${escapeHtml(entry.prompt)}</strong>
              <p>${escapeHtml(entry.fix || "Add the correct rule before your next review round.")}</p>
            </div>
            <div class="mistake-log-entry-actions">
              <a href="${escapeHtml(href)}">${escapeHtml(label)}</a>
              <button type="button" data-mistake-remove="${index}">Remove</button>
            </div>
          </article>`;
        })
        .join("");

      list.querySelectorAll("[data-mistake-remove]").forEach((button) => {
        const record = JSON.stringify(entries[Number(button.dataset.mistakeRemove)]);
        button.addEventListener("click", () => {
          load();
          // The row index can change in another tab; delete only the note shown on this row.
          const currentIndex = entries.findIndex(entry => JSON.stringify(entry) === record);
          if (currentIndex !== -1) {
            entries.splice(currentIndex, 1);
            save();
          }
          render();
        });
      });
    };

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const option = selectedState();
      if (!option) return;
      const prompt = promptInput?.value.trim() || `${selectedTopicLabel()} review`;
      const fix = fixInput?.value.trim() || "";
      load();
      entries.unshift({
        state: option.value,
        stateLabel: option.dataset.stateLabel || option.textContent.trim(),
        topic: topicSelect?.value || "other",
        topicLabel: selectedTopicLabel(),
        prompt,
        fix,
        practiceUrl: option.dataset.practiceUrl || "dmv-practice.html",
        signsUrl: option.dataset.signsUrl || "road-signs-practice-test.html",
        checklistUrl: option.dataset.checklistUrl || "dmv-test-day-checklist.html",
        savedAt: Date.now(),
      });
      entries = entries.slice(0, 30);
      if (promptInput) promptInput.value = "";
      if (fixInput) fixInput.value = "";
      save();
      render();
    });

    copyButton?.addEventListener("click", async () => {
      load();
      render();
      const lines = entries.length
        ? entries.map((entry, index) => `${index + 1}. ${entry.stateLabel} - ${entry.topicLabel}: ${entry.prompt}${entry.fix ? ` | Fix: ${entry.fix}` : ""}`)
        : ["No DMV mistakes saved yet."];
      const text = `DMV mistake review plan\n${lines.join("\n")}`;
      try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = "Copied";
        window.setTimeout(() => {
          copyButton.textContent = "Copy review plan";
        }, 1400);
      } catch (error) {
        copyButton.textContent = "Copy unavailable";
        window.setTimeout(() => {
          copyButton.textContent = "Copy review plan";
        }, 1400);
      }
    });

    const requestedState = normalizeDmvState(params.get("state"));
    if (requestedState && Array.from(stateSelect?.options || []).some(option => option.value === requestedState)) {
      stateSelect.value = requestedState;
    }
    stateSelect?.addEventListener("change", render);
    window.addEventListener("storage", (event) => {
      if (event.key !== storageKey && event.key !== null) return;
      load();
      render();
    });
    load();
    render();
  });
}

function initDmvStudyPlanners() {
  document.querySelectorAll("[data-dmv-study-plan]").forEach((planner) => {
    const stateSelect = planner.querySelector("[data-study-state]");
    const daysSelect = planner.querySelector("[data-study-days]");
    const weakSelect = planner.querySelector("[data-study-weak]");
    const agency = planner.querySelector("[data-study-agency]");
    const rule = planner.querySelector("[data-study-rule]");
    const focus = planner.querySelector("[data-study-focus-label]");
    const checkpoint = planner.querySelector("[data-study-checkpoint]");
    const source = planner.querySelector("[data-study-source]");
    const practice = planner.querySelector("[data-study-practice]");
    const signs = planner.querySelector("[data-study-signs]");
    const checklist = planner.querySelector("[data-study-checklist]");
    const score = planner.querySelector("[data-study-score]");
    const planList = planner.querySelector("[data-study-plan-list]");

    const baselineHref = planner.dataset.studyBaselineHref;

    const setLink = (element, href) => {
      if (element && href) element.href = href;
    };

    const buildSteps = (days, weak, state, data) => {
      const logParams = new URLSearchParams({ state, days, focus: weak });
      const logHref = `dmv-permit-test-mistake-log.html?${logParams}#mistake-log`;
      const repeatLink = [baselineHref, "Repeat the 10-sign baseline"];
      const checkLink = [data.scoreUrl, "Compare with state rule"];
      const checklistLink = [data.checklistUrl, "Open test-day checklist"];
      const recheckStart = days === 3 ? 3 : days - 2;
      const focusEnd = days >= 14 ? 5 : recheckStart - 1;
      const signCheck = data.signTotal
        ? ` For an exam-format result, verify the sign condition: ${data.signCorrect} of ${data.signTotal} sign questions are required${data.signIncluded === "true" ? ", and those answers count in the overall score." : " in the separate sign section."}`
        : "";
      const assignments = {
        mixed: ["Pick one repeated mistake", "If you missed a sign, name it and state the action. If you missed a rule, write the situation and what you should do. Re-answer that item before starting a new set.", logHref, "Record a missed item"],
        "road-signs": ["Recall signs before reading labels", "Name each slow sign and say the driver action before revealing the explanation. Group two similar signs, then explain the difference without looking.", data.signsUrl, "Practice road signs"],
        rules: ["Explain the rule you missed", "Write one missed rule as a situation and an action, then check it in the state source. Change one detail and decide whether your action stays the same.", logHref, "Record a missed rule"],
        score: ["Compare like with like", "Write down correct answers and question count. Compare only practice rounds of the same length and scope. A sign-only score is not a full knowledge-test result.", ...checkLink],
        documents: ["Resolve one missing item", "For any missing ID, residency proof or other requirement, check which substitutes the agency accepts and who must attend. Resolve it before the last day.", data.sourceUrl, "Open official source"],
      };
      const [title, body, href, cta] = assignments[weak] || assignments.mixed;
      const steps = [
        [1, 1, "Check logistics and take a baseline", "Check the appointment and required documents first. Then take the 10-question sign baseline and write down one mistake you can explain after reading the feedback.", [checklistLink, [baselineHref, "Start 10 sign questions"]]],
        [2, focusEnd, title, body, [[href, cta]]],
      ];
      if (focusEnd + 1 < recheckStart) {
        steps.push([focusEnd + 1, recheckStart - 1, "Recall again after a break", "On two separate study days, re-answer saved mistakes without notes. Keep any item you still miss or cannot explain on your short review list.", [[logHref, "Open mistake log"]]]);
      }
      if (days > 3) {
        steps.push(data.mixedPracticeUrl
          ? [recheckStart, days - 1, "Recheck the score before test day", `Repeat the same 10 signs to check recall. For broader practice, record the mixed score separately. Apply the official rule only when the length and sections match the official format.${signCheck}`, [repeatLink, [data.mixedPracticeUrl, "Open mixed practice"], checkLink]]
          : [recheckStart, days - 1, "Recheck rules and signs separately", "This site has no full mixed practice set for this state. Explain one rule from the official manual, then repeat the same 10 signs from day one. Compare the two scores as recall, not as readiness for a full exam.", [repeatLink, [data.sourceUrl, "Check the official manual"]]]);
      }
      const finalReview = days === 3
        ? `Repeat the same 10 signs from day one to check recall. Check the official rule separately.${signCheck} Then confirm documents, appointment and arrival details.`
        : "Review only the items you still miss. Confirm documents, appointment and arrival details instead of starting another long session.";
      const finalLinks = days === 3
        ? [repeatLink, data.mixedPracticeUrl ? checkLink : [data.sourceUrl, "Check the official manual"], checklistLink]
        : [checklistLink];
      steps.push([days, days, "Close the remaining gaps", finalReview, finalLinks]);
      return steps;
    };

    const render = () => {
      const selected = stateSelect?.selectedOptions?.[0];
      if (!selected || !planList) return;
      const days = Math.max(Number(daysSelect?.value) || 7, 1);
      const weak = weakSelect?.value || "mixed";
      if (agency) agency.textContent = selected.dataset.agency || "State agency";
      if (rule) rule.textContent = selected.dataset.rule || "Confirm with official source";
      if (focus) focus.textContent = DMV_STUDY_FOCUS.get(weak) || DMV_STUDY_FOCUS.get("mixed");
      if (checkpoint) checkpoint.textContent = `Day ${days}: final checklist`;

      setLink(source, selected.dataset.sourceUrl);
      setLink(practice, selected.dataset.mixedPracticeUrl);
      if (practice) practice.hidden = !selected.dataset.mixedPracticeUrl;
      setLink(signs, selected.dataset.signsUrl);
      setLink(checklist, selected.dataset.checklistUrl);
      setLink(score, selected.dataset.scoreUrl);
      annotateDmvStateLink(practice, selected, "practice");
      annotateDmvStateLink(signs, selected, "road_signs");
      annotateDmvStateLink(checklist, selected, "checklist");
      annotateDmvStateLink(score, selected, "score");

      const steps = buildSteps(days, weak, selected.value, selected.dataset);
      planList.replaceChildren();
      steps.forEach(([start, end, stepTitle, stepBody, actions]) => {
        const item = document.createElement("li");
        const range = document.createElement("span");
        range.className = "eyebrow";
        range.setAttribute("data-study-range", "");
        range.textContent = start === end ? `Day ${start}` : `Days ${start}-${end}`;
        const title = document.createElement("strong");
        const body = document.createElement("span");
        const links = document.createElement("div");
        links.className = "study-plan-actions";
        title.textContent = stepTitle;
        body.textContent = stepBody;
        actions.forEach(([href, cta]) => {
          const link = document.createElement("a");
          link.href = href;
          link.textContent = cta;
          links.append(link);
        });
        item.append(range, title, body, links);
        planList.append(item);
      });
    };

    try {
      const params = new URLSearchParams(window.location.search);
      const requestedState = normalizeDmvState(params.get("state"));
      const savedState = requestedState || readDmvJourney().state;
      const stateOption = Array.from(stateSelect?.options || []).find(
        (option) => normalizeDmvState(option.value || option.dataset.state || option.textContent) === savedState,
      );
      if (stateOption) stateSelect.value = stateOption.value;
      const requestedDays = params.get("days");
      if (daysSelect && DMV_STUDY_DAYS.includes(requestedDays)) daysSelect.value = requestedDays;
      const requestedFocus = params.get("focus");
      if (weakSelect && DMV_STUDY_FOCUS.has(requestedFocus)) {
        weakSelect.value = requestedFocus;
      }
    } catch (error) {
      // Use the default planner state if URL parsing is unavailable.
    }
    stateSelect?.addEventListener("change", () => {
      setDmvJourneyState(stateSelect.value);
      render();
    });
    [daysSelect, weakSelect].forEach((input) => input?.addEventListener("change", render));
    render();
  });
}

function initDmvRequirementsFinders() {
  document.querySelectorAll("[data-dmv-requirements]").forEach((widget) => {
    const stateSelect = widget.querySelector("[data-requirements-state]");
    const agency = widget.querySelector("[data-requirements-agency]");
    const stateTitle = widget.querySelector("[data-requirements-state-title]");
    const focus = widget.querySelector("[data-requirements-focus]");
    const format = widget.querySelector("[data-requirements-format]");
    const formatNote = widget.querySelector("[data-requirements-format-note]");
    const pass = widget.querySelector("[data-requirements-pass]");
    const passNote = widget.querySelector("[data-requirements-pass-note]");
    const target = widget.querySelector("[data-requirements-target]");
    const documents = widget.querySelector("[data-requirements-documents]");
    const source = widget.querySelector("[data-requirements-source]");
    const practice = widget.querySelector("[data-requirements-practice]");
    const signs = widget.querySelector("[data-requirements-signs]");
    const checklist = widget.querySelector("[data-requirements-checklist]");
    const score = widget.querySelector("[data-requirements-score]");

    const setStateFromQuery = () => {
      if (!stateSelect) return;
      let requested = "";
      try {
        requested = new URLSearchParams(window.location.search).get("state") || "";
      } catch (error) {
        requested = "";
      }
      if (!requested) return;
      const normalized = requested.trim().toLowerCase().replace(/\s+/g, "-");
      const match = Array.from(stateSelect.options).find((option) => {
        const label = option.textContent.trim().toLowerCase().replace(/\s+/g, "-");
        return option.value === normalized || label === normalized;
      });
      if (match) stateSelect.value = match.value;
    };

    const render = () => {
      const option = stateSelect?.selectedOptions?.[0];
      if (!option) return;
      const stateName = option.textContent.trim();
      if (agency) agency.textContent = option.dataset.agency || "State agency";
      if (stateTitle) stateTitle.textContent = `${stateName} permit-test requirements`;
      if (focus) focus.textContent = option.dataset.focus || "Use the official source for the final test-day details.";
      if (format) format.textContent = option.dataset.format || "Confirm with official source";
      if (formatNote) formatNote.textContent = option.dataset.formatText || (option.dataset.source ? `Source context: ${option.dataset.source}` : "");
      if (pass) pass.textContent = option.dataset.pass || "Confirm with official source";
      if (passNote) passNote.textContent = option.dataset.passText || "Passing rules can change. Open the official source before test day.";
      if (target) target.textContent = option.dataset.mixedPracticeUrl
        ? option.dataset.practiceTarget || "See the target on the practice page"
        : "No full mixed practice set here";
      if (documents) documents.textContent = option.dataset.documents || "Confirm accepted documents with the official source.";
      if (source) {
        source.href = option.dataset.sourceUrl || "#";
        source.textContent = option.dataset.sourceLabel || "Official source";
      }
      if (practice) {
        practice.hidden = !option.dataset.mixedPracticeUrl;
        if (option.dataset.mixedPracticeUrl) {
          practice.href = option.dataset.mixedPracticeUrl;
          annotateDmvStateLink(practice, option, "practice");
        }
      }
      if (signs) {
        signs.href = option.dataset.signUrl || signs.href;
        annotateDmvStateLink(signs, option, "road_signs");
      }
      if (checklist) {
        checklist.href = option.dataset.checklistUrl || checklist.href;
        annotateDmvStateLink(checklist, option, "checklist");
      }
      if (score) {
        score.href = option.dataset.scoreUrl || score.href;
        annotateDmvStateLink(score, option, "score");
      }
    };

    setStateFromQuery();
    stateSelect?.addEventListener("change", render);
    render();
  });
}

function initDmvScoreCalculators() {
  const formatPercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });
  document.querySelectorAll("[data-dmv-score-calculator]").forEach((widget) => {
    const stateSelect = widget.querySelector("[data-score-state]");
    const agency = widget.querySelector("[data-score-agency]");
    const rule = widget.querySelector("[data-score-rule]");
    const note = widget.querySelector("[data-score-note]");
    const source = widget.querySelector("[data-score-source]");
    const practice = widget.querySelector("[data-score-practice]");
    const testDayLink = widget.querySelector("[data-score-checklist]");
    const questions = widget.querySelector("[data-score-questions]");
    const correctNeeded = widget.querySelector("[data-score-correct]");
    const miss = widget.querySelector("[data-score-miss]");
    const correctInput = widget.querySelector("[data-score-input-correct]");
    const totalInput = widget.querySelector("[data-score-input-total]");
    const correctLabel = widget.querySelector("[data-score-correct-label]");
    const totalLabel = widget.querySelector("[data-score-total-label]");
    const lengthLabel = widget.querySelector("[data-score-length-label]");
    const lengthNote = widget.querySelector("[data-score-length-note]");
    const sectionBox = widget.querySelector("[data-score-section]");
    const sectionInput = widget.querySelector("[data-score-section-correct]");
    const sectionLabel = widget.querySelector("[data-score-section-label]");
    const sectionNote = widget.querySelector("[data-score-section-note]");
    const useOfficial = widget.querySelector("[data-score-use-official]");
    const scoreForm = widget.querySelector("form.score-panel");
    const countAnswer = widget.querySelector("[data-score-count-answer]");
    const percent = widget.querySelector("[data-score-percent]");
    const status = widget.querySelector("[data-score-status]");
    const message = widget.querySelector("[data-score-message]");
    const mixedResult = widget.querySelector("[data-score-mixed-result]");
    const mixedMessage = widget.querySelector("[data-score-mixed-message]");
    const nextStep = widget.querySelector("[data-score-next]");
    const nextTitle = widget.querySelector("[data-score-next-title]");
    const nextCopy = widget.querySelector("[data-score-next-copy]");
    const nextLink = widget.querySelector("[data-score-next-link]");
    let scoreChecked = false;

    const currentOption = () => stateSelect?.selectedOptions?.[0];

    const setStateFromQuery = () => {
      if (!stateSelect) return;
      let requested = "";
      try {
        requested = new URLSearchParams(window.location.search).get("state") || "";
      } catch (error) {
        requested = "";
      }
      if (!requested) return;
      const normalized = requested.trim().toLowerCase().replace(/\s+/g, "-");
      const match = Array.from(stateSelect.options).find((option) => {
        const label = option.textContent.trim().toLowerCase().replace(/\s+/g, "-");
        return option.value === normalized || label === normalized;
      });
      if (match) stateSelect.value = match.value;
    };

    const thresholdFor = (option, total) => {
      const officialQuestions = Number(option?.dataset.questions) || 0;
      const officialCorrect = Number(option?.dataset.correct) || 0;
      const requiredPercent = Number(option?.dataset.percent) || 0;
      if (officialQuestions && officialCorrect && total === officialQuestions) return officialCorrect;
      if (officialQuestions && officialCorrect) return Math.ceil((total * officialCorrect) / officialQuestions);
      if (requiredPercent) return Math.ceil((total * requiredPercent) / 100);
      if (officialCorrect) return officialCorrect;
      return total;
    };

    const renderScore = () => {
      const option = currentOption();
      if (!option) return;
      if (mixedResult) mixedResult.hidden = true;
      const total = Number(totalInput?.value);
      const correct = Number(correctInput?.value);
      const validTotal = totalInput?.value.trim() !== "" && Number.isInteger(total) && total >= 1 && total <= 100;
      const validCorrect = correctInput?.value.trim() !== "" && Number.isInteger(correct) && correct >= 0 && correct <= total;
      const sectionQuestions = Number(option.dataset.sectionQuestions) || 0;
      const sectionNeeded = Number(option.dataset.sectionCorrect) || 0;
      const separateRule = sectionQuestions > 0;
      const signsIncluded = option.dataset.sectionIncluded === "true";
      const primaryTopic = option.dataset.primaryTopic;
      const minimum = Number(option.dataset.minimumQuestions) || 0;
      const belowMinimum = validTotal && total < minimum;
      const minimumNote = belowMinimum
        ? `This is below the ${minimum}-question minimum and is practice math only.`
        : `${minimum} is the minimum, not a fixed length. Use the count shown for your actual exam.`;
      const fixedLength = minimum ? 0 : Number(option.dataset.questions);
      const officialLength = validTotal && fixedLength > 0 && total === fixedLength;
      const scaledLength = validTotal && fixedLength > 0 && !officialLength;
      const needed = validTotal ? thresholdFor(option, total) : 0;
      if (countAnswer) {
        const missed = total - needed;
        const topic = primaryTopic ? ` on ${primaryTopic}` : "";
        const scope = separateRule
          ? " The road-sign requirement still applies; this only calculates the main score."
          : "";
        const estimate = minimum ? ` ${minimumNote}`
          : scaledLength
          ? " This is scaled practice math, not the official test format."
          : !option.dataset.questions ? " Confirm your current test length with the state." : "";
        countAnswer.hidden = !validTotal;
        countAnswer.textContent = validTotal
          ? `For ${total} ${total === 1 ? "question" : "questions"}${topic}: need ${needed} correct; can miss up to ${missed}.${scope}${estimate}`
          : "";
      }
      const checkSection = separateRule && officialLength;
      const sectionValue = sectionInput?.value.trim() || "";
      const sectionCorrect = Number(sectionValue);
      const sectionKnown = checkSection && sectionValue !== "";
      const signOnly = sectionKnown && !signsIncluded && correctInput?.value.trim() === "" && !correctInput.validity.badInput;
      if (sectionBox) sectionBox.hidden = !checkSection;
      if (sectionInput) sectionInput.max = String(sectionQuestions);
      if (sectionLabel) sectionLabel.textContent = `Road signs correct (out of ${sectionQuestions})`;
      if (sectionNote) {
        sectionNote.textContent = signsIncluded
          ? `Need at least ${sectionNeeded} of ${sectionQuestions} signs correct, included in the total above.`
          : `Need at least ${sectionNeeded} of ${sectionQuestions} signs correct in the separate section. Leave the ${primaryTopic} score blank if you only took signs.`;
      }

      totalInput?.setAttribute("aria-invalid", String(scoreChecked && !validTotal));
      correctInput?.setAttribute("aria-invalid", String(scoreChecked && !validCorrect && !signOnly));
      sectionInput?.setAttribute("aria-invalid", "false");
      const invalidScore = (text) => {
        if (percent) percent.textContent = "--";
        if (status) status.textContent = "Check the question counts";
        if (message) message.textContent = text;
        if (nextStep) nextStep.hidden = true;
        return null;
      };
      if (!validTotal || (!validCorrect && !signOnly)) {
        if (scoreChecked) {
          return invalidScore("Enter a whole-number total from 1 to 100 and a correct-answer count from 0 to that total.");
        }
        if (percent) percent.textContent = "--";
        if (status) status.textContent = "Enter your practice score.";
        if (message) message.textContent = "";
        if (nextStep) nextStep.hidden = true;
        return null;
      }
      if (checkSection && (sectionInput?.validity.badInput ||
          (sectionKnown && (!Number.isInteger(sectionCorrect) || sectionCorrect < 0 || sectionCorrect > sectionQuestions)))) {
        sectionInput?.setAttribute("aria-invalid", "true");
        return invalidScore(`Enter a whole-number road-sign score from 0 to ${sectionQuestions}.`);
      }
      // New York's sign answers are part of, not additional to, the overall score.
      if (sectionKnown && signsIncluded
          && (sectionCorrect > correct || correct - sectionCorrect > total - sectionQuestions)) {
        sectionInput?.setAttribute("aria-invalid", "true");
        return invalidScore("The road-sign score and overall score do not match. Include the sign answers in the total correct count.");
      }

      const pct = formatPercent.format(signOnly ? sectionCorrect / sectionQuestions : correct / total);
      const gap = signOnly ? 0 : Math.max(0, needed - correct);
      const sectionGap = sectionKnown ? Math.max(0, sectionNeeded - sectionCorrect) : 0;
      const incomplete = separateRule && (!checkSection || !sectionKnown);
      const outcome = gap || sectionGap ? "below_target" : incomplete ? "section_unverified" : "target_met";
      const scoreLabel = signOnly ? " on signs" : primaryTopic ? ` on ${primaryTopic}` : separateRule ? " overall" : "";
      if (percent) percent.textContent = `${pct}${scoreLabel}`;
      if (status) {
        const cushion = correct - needed;
        const target = belowMinimum || scaledLength ? "the scaled practice target" : "the selected state target";
        status.textContent = gap
          ? `${gap} more correct answer${gap === 1 ? "" : "s"} needed`
          : sectionGap
            ? `${sectionGap} more road-sign answer${sectionGap === 1 ? "" : "s"} needed`
          : signOnly
            ? "Road-sign target met; one section not checked"
            : incomplete
              ? scaledLength ? "Scaled practice target met; road-sign rule not checked" : "Score target met; road-sign rule not checked"
              : cushion > 0
                ? `Above ${target}`
                : `Meets ${target}`;
      }
      if (message) {
        const stateName = option.dataset.state || option.textContent.trim();
        const ruleText = option.dataset.rule || "the official passing rule";
        if (gap) {
          message.textContent = `${stateName} target: ${ruleText}. For a ${total}-question practice round, aim for at least ${needed} correct.`;
        } else {
          const cushion = correct - needed;
          message.textContent = `${stateName} target met for this practice length. Cushion: ${cushion} question${cushion === 1 ? "" : "s"} above the target.`;
        }
        if (separateRule) {
          const sectionMessage = !checkSection
            ? "This custom-length round only checks the practice percentage. Use the official section length and enter the road-sign score to check both conditions."
            : !sectionKnown
              ? "Enter the road-sign score before treating the full practice result as meeting both conditions."
              : `Road signs: ${sectionCorrect} of ${sectionQuestions} correct; at least ${sectionNeeded} required.`;
          const primary = signOnly ? `No ${primaryTopic} score entered.` :
            `${primaryTopic ? primaryTopic[0].toUpperCase() + primaryTopic.slice(1) : "Overall"}: ${correct} of ${total} correct; ${needed} needed.`;
          message.textContent = `${stateName}. ${primary} ${sectionMessage}`;
        } else if (minimum) {
          message.textContent += ` ${minimumNote}`;
        } else if (!officialLength && option.dataset.questions) {
          message.textContent += " This is scaled to your practice length, not an official-format score.";
        }
      }
      const mixedNeeded = Number(option.dataset.mixedCorrect);
      const matchingMixedLength = mixedNeeded > 0 && total === Number(option.dataset.mixedQuestions);
      const mixedGap = mixedNeeded - correct;
      const metMixedGoal = matchingMixedLength && mixedGap <= 0;
      if (mixedResult && mixedMessage && scoreChecked && matchingMixedLength && !signOnly) {
        const result = mixedGap > 0
          ? `${mixedGap} more correct answer${mixedGap === 1 ? "" : "s"} to reach it`
          : "goal met";
        mixedMessage.textContent = `If you took our full mixed set, its practice goal is ${mixedNeeded}/${total}: ${result}. This does not establish whether you would pass the official test.`;
        mixedResult.hidden = false;
      }
      if (nextStep) nextStep.hidden = !scoreChecked;
      if (nextTitle && nextCopy && nextLink) {
        const stateName = option.dataset.state || option.textContent.trim();
        const needsPractice = belowMinimum || outcome !== "target_met";
        const hasMixed = Boolean(option.dataset.mixedPracticeUrl);
        const hasPermitGuide = option.dataset.testDayIsPermitGuide === "true";
        let nextPath = needsPractice ? "practice" : "checklist";
        nextTitle.textContent = needsPractice
          ? hasMixed ? `Review and retake ${stateName} mixed practice` : `Review ${stateName} rules and signs separately`
          : hasPermitGuide ? `Review the ${stateName} permit steps` : "Turn this result into a final readiness check";
        nextCopy.textContent = needsPractice
          ? hasMixed
            ? "Take the mixed set and record both correct answers and total questions before comparing a new result."
            : "The link below is road-sign practice, not a full knowledge test. Use the official source to review the rest of the exam."
          : hasPermitGuide ? "A practice result is not an official pass or a permit. Check the required steps before your visit."
            : "Review the official source and test-day details before relying on one practice score.";
        nextLink.href = needsPractice
          ? option.dataset.practiceUrl || nextLink.href
          : option.dataset.checklistUrl || nextLink.href;
        nextLink.textContent = needsPractice
          ? (hasMixed ? `Open ${stateName} mixed practice` : "Open road-sign practice")
          : hasPermitGuide && option.dataset.testDayLabel ? option.dataset.testDayLabel : "Open test-day checklist";
        if (belowMinimum) {
          nextTitle.textContent = `Try a longer ${stateName} practice round`;
          nextCopy.textContent = `A round below ${minimum} questions is not a full knowledge test. Use a longer set before comparing your preparation with the written test.`;
          if (!hasMixed && option.dataset.officialPracticeUrl) {
            nextCopy.textContent = `A round below ${minimum} questions is not a full knowledge test. Use the official study questions to cover road rules and signs.`;
            nextLink.href = option.dataset.officialPracticeUrl;
            nextLink.textContent = `Open ${stateName} study questions`;
          }
        } else if (scaledLength) {
          nextTitle.textContent = primaryTopic ? `Practice ${primaryTopic} in the state format` : "Compare with the state test format";
          if (hasMixed && !metMixedGoal) {
            nextCopy.textContent = `This round does not match the ${fixedLength}-question format. Use mixed practice to cover both rules and signs; keep its score separate from the official rule.`;
            nextLink.href = option.dataset.mixedPracticeUrl;
            nextLink.textContent = `Open ${stateName} mixed practice`;
          } else {
            const sample = option.dataset.officialPracticeUrl;
            nextCopy.textContent = primaryTopic
              ? `Review ${primaryTopic} with the state material. This round cannot check the separate road-sign requirement.`
              : `This round does not match the ${fixedLength}-question format. Check the state guidance before treating it as evidence of readiness.`;
            nextLink.href = sample || option.dataset.sourceUrl;
            nextLink.textContent = sample ? `Open ${option.dataset.agency} sample practice` : `Check ${stateName} test information`;
          }
          nextPath = "practice";
        }
        if ((needsPractice || scaledLength) && !belowMinimum && metMixedGoal) {
          nextTitle.textContent = "Review the official rule before your next round";
          nextCopy.textContent = "If this was our mixed set, you already met its practice goal. Check the official test format and passing requirements separately.";
        }
        if (checkSection && sectionGap > 0) {
          nextTitle.textContent = "Review the road signs you missed";
          nextCopy.textContent = gap
            ? `The ${primaryTopic || "overall"} score also needs work. Raising it will not replace the separate sign requirement.`
            : "Use sign practice to learn the images and their meanings. This drill is not the official scoring section.";
          nextLink.href = signsIncluded ? `${option.dataset.signUrl}#practice` : option.dataset.signUrl;
          nextLink.textContent = `Open ${stateName} road-sign practice`;
          nextPath = "road_signs";
        } else if (checkSection && option.dataset.officialPracticeUrl && (gap || signOnly)) {
          nextTitle.textContent = gap ? `Review ${primaryTopic}` : `Practice ${primaryTopic} next`;
          nextCopy.textContent = sectionKnown
            ? "The sign target is met. Use official sample material for the other section; one section cannot make up for the other."
            : "Review the section that is below target. Enter your sign score when you have it to check the other requirement.";
          nextLink.href = option.dataset.officialPracticeUrl;
          nextLink.textContent = `Open ${option.dataset.agency} sample practice`;
          nextPath = "practice";
        } else if (checkSection && !sectionKnown && !gap) {
          nextTitle.textContent = "Check the missing road-sign score";
          nextCopy.textContent = "The score above reaches its target, but there is not enough information to check the road-sign rule.";
          nextLink.href = "#score-section-correct";
          nextLink.textContent = "Enter the road-sign score";
          nextPath = "";
        }
        if (nextPath) {
          annotateDmvStateLink(nextLink, option, nextPath);
        } else {
          delete nextLink.dataset.dmvStateLink;
          delete nextLink.dataset.dmvState;
          delete nextLink.dataset.dmvPath;
        }
      }
      // A sign-only comparison has no whole-round count to send as dmv_score_checked.
      return signOnly ? null : { outcome, sectionCorrect: sectionKnown ? sectionCorrect : null };
    };

    const renderState = () => {
      const option = currentOption();
      if (!option) return;
      const officialQuestions = option.dataset.questions || "";
      const officialCorrect = option.dataset.correct || "";
      const minimum = option.dataset.minimumQuestions;
      if (correctLabel) correctLabel.textContent = option.dataset.primaryScoreLabel || "Practice correct";
      if (totalLabel) totalLabel.textContent = option.dataset.primaryTotalLabel || "Practice total";
      const separateSections = Number(option.dataset.sectionQuestions) > 0 && option.dataset.sectionIncluded !== "true";
      if (lengthLabel) lengthLabel.textContent = minimum ? "Minimum written-test length"
        : separateSections ? option.dataset.primaryTotalLabel : "Official length";
      if (lengthNote) lengthNote.textContent = separateSections
        ? "Length of this section only. The road-sign section has its own passing requirement."
        : minimum ? "The actual test length may be longer."
          : "Questions on the state knowledge test when the source gives a fixed number.";
      if (sectionInput) sectionInput.value = "";
      if (agency) agency.textContent = option.dataset.agency || "State agency";
      if (rule) rule.textContent = option.dataset.rule || "Confirm with official source";
      if (note) note.textContent = option.dataset.note || "Use the official source for the final passing rule.";
      if (questions) questions.textContent = minimum ? `${minimum}+` : officialQuestions || "Use source";
      if (correctNeeded) correctNeeded.textContent = minimum ? `${option.dataset.percent}%`
        : officialCorrect || (option.dataset.rule || "Use source");
      if (miss) miss.textContent = option.dataset.miss || "Confirm with official source";
      if (source) {
        source.href = option.dataset.sourceUrl || "#";
        source.textContent = option.dataset.sourceLabel || "Official source";
      }
      if (practice) {
        practice.href = option.dataset.practiceUrl || practice.href;
        practice.textContent = option.dataset.mixedPracticeUrl ? "Mixed practice" : "Road-sign practice";
        annotateDmvStateLink(practice, option, "practice");
      }
      if (testDayLink) {
        testDayLink.href = option.dataset.checklistUrl || testDayLink.href;
        testDayLink.textContent = option.dataset.testDayLabel || "Test-day checklist";
        annotateDmvStateLink(testDayLink, option, "checklist");
      }
      if (totalInput) totalInput.value = "";
      if (correctInput) correctInput.value = "";
      if (useOfficial) {
        useOfficial.disabled = !officialQuestions;
        useOfficial.textContent = minimum ? `Example: ${minimum} questions`
          : officialQuestions ? `Fill ${officialQuestions} questions` : "Enter your own total";
      }
      renderScore();
    };

    stateSelect?.addEventListener("change", () => {
      scoreChecked = false;
      renderState();
      trackToolEvent("study_state_change", {
        state: stateSelect.value,
        surface: "dmv_score_calculator",
      });
    });
    const editScore = () => {
      scoreChecked = false;
      renderScore();
    };
    correctInput?.addEventListener("input", editScore);
    totalInput?.addEventListener("input", editScore);
    sectionInput?.addEventListener("input", editScore);
    useOfficial?.addEventListener("click", () => {
      const option = currentOption();
      const officialQuestions = Number(option?.dataset.questions) || 0;
      if (officialQuestions && totalInput) totalInput.value = String(officialQuestions);
      editScore();
    });
    scoreForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      scoreChecked = true;
      const result = renderScore();
      if (!result) return;
      const option = currentOption();
      trackToolEvent("dmv_score_checked", {
        state: option?.value || "unknown",
        practice_correct: Number(correctInput?.value) || 0,
        practice_total: Number(totalInput?.value) || 0,
        result: result.outcome,
        road_sign_correct: result.sectionCorrect,
      });
    });
    nextLink?.addEventListener("click", () => {
      trackToolEvent("study_next_step_click", {
        state: currentOption()?.value || "unknown",
        surface: "dmv_score_calculator",
        target: analyticsPathFromHref(nextLink.href),
      });
    });
    setStateFromQuery();
    renderState();
  });
}

function initDmvChecklists() {
  document.querySelectorAll("[data-dmv-checklist]").forEach((widget) => {
    const stateSelect = widget.querySelector("[data-dmv-checklist-state]");
    const manualLabel = widget.querySelector("[data-dmv-manual-label]");
    const examFormat = widget.querySelector("[data-dmv-exam-format]");
    const focusArea = widget.querySelector("[data-dmv-focus-area]");
    const agencyName = widget.querySelector("[data-dmv-agency-name]");
    const documentHint = widget.querySelector("[data-dmv-document-hint]");
    const appointmentHint = widget.querySelector("[data-dmv-appointment-hint]");
    const retakeHint = widget.querySelector("[data-dmv-retake-hint]");
    const manualLink = widget.querySelector("[data-dmv-manual-link]");
    const permitLink = widget.querySelector("[data-dmv-permit-link]");
    const signLink = widget.querySelector("[data-dmv-sign-link]");
    const scoreLink = document.querySelector("[data-checklist-score-link]");
    const score = widget.querySelector("[data-dmv-ready-score]");
    const message = widget.querySelector("[data-dmv-ready-message]");
    const nextStep = widget.querySelector("[data-dmv-next-step]");
    const resetButton = widget.querySelector("[data-dmv-checklist-reset]");
    const copyButton = widget.querySelector("[data-dmv-copy-checklist]");
    const printButton = widget.querySelector("[data-dmv-print-checklist]");
    const printPlan = widget.nextElementSibling?.matches("[data-dmv-print-plan]") ? widget.nextElementSibling : null;
    const checks = Array.from(widget.querySelectorAll("[data-dmv-check]"));
    const packType = widget.querySelector("[data-dmv-pack-type]");
    const packAgency = widget.querySelector("[data-dmv-pack-agency]");
    const packTitle = widget.querySelector("[data-dmv-pack-title]");
    const packSummary = widget.querySelector("[data-dmv-pack-summary]");
    const packOfficial = widget.querySelector("[data-dmv-pack-official]");
    const packNext = widget.querySelector("[data-dmv-pack-next]");
    const copyPackButton = widget.querySelector("[data-dmv-copy-pack]");
    const resetPackButton = widget.querySelector("[data-dmv-reset-pack]");
    const packRows = Array.from(widget.querySelectorAll("[data-dmv-pack-row]"));
    const packItems = Array.from(widget.querySelectorAll("[data-dmv-pack-item]"));
    const lastStateKey = "tdt-dmv-test-day:last-state";

    const storageKey = () => `tdt-dmv-test-day:${stateSelect?.value || "default"}`;
    const documentPackStorageKey = () => `tdt-dmv-document-pack:${stateSelect?.value || "default"}:${packType?.value || "default"}`;

    const selectedOption = () => stateSelect?.selectedOptions?.[0];
    const selectedPackType = () => packType?.selectedOptions?.[0];
    const visiblePackItems = () => packItems.filter((item) => !item.closest("[data-dmv-pack-row]")?.hidden);
    const documentSource = (option = selectedOption()) => {
      if (packType?.value === "real-id" && option?.dataset.realIdUrl) {
        return { url: option.dataset.realIdUrl, label: "official REAL ID document requirements" };
      }
      return { url: option?.dataset.manualUrl || "", label: option?.dataset.manualLabel || "official source" };
    };

    const preparePrintPlan = () => {
      const option = selectedOption();
      if (!printPlan || !option) return;
      const field = (name) => printPlan.querySelector(`[data-dmv-print-${name}]`);
      const setText = (name, value) => {
        const target = field(name);
        if (target) target.textContent = value || "";
      };
      const setItems = (name, countName, items) => {
        const list = field(name);
        if (!list) return;
        list.replaceChildren(...items.map((item) => {
          const row = document.createElement("li");
          const box = document.createElement("span");
          box.className = "dmv-print-box";
          box.setAttribute("aria-hidden", "true");
          box.textContent = item.checked ? "X" : "";
          row.append(box, item.closest("label")?.querySelector("strong")?.textContent || item.value);
          return row;
        }));
        const ready = items.filter((item) => item.checked).length;
        setText(countName, `${ready} of ${items.length} marked ready`);
      };
      const applicant = selectedPackType();
      const permitPath = !applicant || ["first-permit", "minor"].includes(applicant.value);
      setText("title", `${option.textContent.trim()} DMV test-day plan`);
      setText("format", permitPath ? option.dataset.format
        : "Use the permit-test checks only if your state requires a knowledge test for this visit.");
      const official = field("source");
      if (official) {
        const { url, label } = documentSource(option);
        official.href = url || "#";
        official.textContent = url || label;
      }
      setItems("checks", "check-count", checks);
      const documents = visiblePackItems();
      const pack = field("pack");
      if (pack) pack.hidden = !documents.length;
      setText("pack-title", applicant?.textContent.trim() || "Document pack");
      setText("pack-detail", applicant?.dataset.packDetail);
      setItems("pack-items", "pack-count", documents);
      const notes = field("notes");
      if (notes) notes.hidden = !permitPath;
      setText("documents", option.dataset.documents);
      setText("appointment", option.dataset.appointment);
      setText("retake", option.dataset.retake);
      document.body.classList.add("dmv-checklist-print-ready");
    };

    const setStateIfAvailable = (rawValue) => {
      if (!stateSelect || !rawValue) return false;
      const requested = String(rawValue).trim().toLowerCase().replace(/\s+/g, "-");
      const match = Array.from(stateSelect.options).find((option) => {
        const optionLabel = option.textContent.trim().toLowerCase().replace(/\s+/g, "-");
        return option.value === requested || optionLabel === requested;
      });
      if (!match) return false;
      stateSelect.value = match.value;
      return true;
    };

    const save = () => {
      try {
        const checked = checks.filter((check) => check.checked).map((check) => check.value);
        window.localStorage.setItem(storageKey(), JSON.stringify({ checked, updatedAt: Date.now() }));
      } catch (error) {
        // The checklist remains usable when local storage is unavailable.
      }
    };

    const load = () => {
      let saved = null;
      try {
        saved = JSON.parse(window.localStorage.getItem(storageKey()) || "null");
      } catch (error) {
        saved = null;
      }
      const checked = new Set(Array.isArray(saved?.checked) ? saved.checked : []);
      checks.forEach((check) => {
        check.checked = checked.has(check.value);
      });
    };

    const render = () => {
      const checkedCount = checks.filter((check) => check.checked).length;
      const total = checks.length || 1;
      const percent = Math.round((checkedCount / total) * 100);
      const firstOpen = checks.find((check) => !check.checked);
      const firstLabel = firstOpen?.closest("label")?.querySelector("strong")?.textContent || "";

      if (score) score.textContent = `${percent}%`;
      if (message) {
        if (percent === 100) {
          message.textContent = "Checklist complete. Do a calm final review, then use the official source for anything that changed.";
        } else if (percent >= 70) {
          message.textContent = "Close to ready. Finish the remaining logistics and weak-area checks before test day.";
        } else if (percent >= 35) {
          message.textContent = "Partly ready. Use the state practice and sign review links before relying on this score.";
        } else {
          message.textContent = "Start with the official source, then complete one practice round before test day.";
        }
      }
      if (nextStep) {
        nextStep.textContent = firstLabel ? `Next: ${firstLabel}` : "All checklist items are marked ready.";
      }
    };

    const saveDocumentPack = () => {
      if (!packItems.length) return;
      try {
        const checked = visiblePackItems().filter((item) => item.checked).map((item) => item.value);
        window.localStorage.setItem(documentPackStorageKey(), JSON.stringify({ checked, updatedAt: Date.now() }));
      } catch (error) {
        // The document pack still works when local storage is blocked.
      }
    };

    const loadDocumentPack = () => {
      if (!packItems.length) return;
      let saved = null;
      try {
        saved = JSON.parse(window.localStorage.getItem(documentPackStorageKey()) || "null");
      } catch (error) {
        saved = null;
      }
      const checked = new Set(Array.isArray(saved?.checked) ? saved.checked : []);
      packItems.forEach((item) => {
        item.checked = checked.has(item.value);
      });
    };

    const renderDocumentPack = () => {
      if (!packItems.length) return;
      const option = selectedOption();
      const typeOption = selectedPackType();
      const type = packType?.value || "default";

      packRows.forEach((row) => {
        const scopes = (row.dataset.scopes || "all").split(/\s+/).filter(Boolean);
        row.hidden = !(scopes.includes("all") || scopes.includes(type));
      });

      const visible = visiblePackItems();
      const checked = visible.filter((item) => item.checked);
      const stateName = option?.textContent?.trim() || "selected state";
      const agency = option?.dataset.agency || "State agency";
      const typeLabel = typeOption?.textContent?.trim() || "selected path";
      const typeDetail = typeOption?.dataset.packDetail || "Confirm the exact accepted documents with the official source.";

      if (packAgency) packAgency.textContent = agency;
      if (packTitle) packTitle.textContent = `${stateName} ${typeLabel}`;
      if (packSummary) {
        packSummary.textContent = `${visible.length} document checks for this path. ${typeDetail}`;
      }
      if (packOfficial) {
        const { url, label } = documentSource(option);
        packOfficial.href = url || "#";
        packOfficial.textContent = `Open ${label}`;
      }
      if (packNext) {
        const firstOpen = visible.find((item) => !item.checked);
        const label = firstOpen?.closest("label")?.querySelector("strong")?.textContent || "";
        packNext.textContent = label
          ? `Next document check: ${label}`
          : "All visible document checks are marked ready for this path.";
      }
      checked.forEach((item) => {
        const row = item.closest("[data-dmv-pack-row]");
        if (row?.hidden) item.checked = false;
      });
    };

    const updateState = () => {
      const option = selectedOption();
      if (!option) return;
      try {
        window.localStorage.setItem(lastStateKey, option.value);
      } catch (error) {
        // Ignore storage errors; the selected state still updates on the page.
      }
      if (manualLabel) manualLabel.textContent = option.dataset.manualLabel || "Official state source";
      if (examFormat) examFormat.textContent = option.dataset.format || "";
      if (focusArea) focusArea.textContent = option.dataset.focus ? `Review focus: ${option.dataset.focus}` : "";
      if (agencyName) agencyName.textContent = option.dataset.agency || "State agency";
      if (documentHint) documentHint.textContent = option.dataset.documents || "Confirm ID, residency, forms, and fees with the official source.";
      if (appointmentHint) appointmentHint.textContent = option.dataset.appointment || "Check appointment, payment, and arrival instructions before you leave.";
      if (retakeHint) retakeHint.textContent = option.dataset.retake || "Know what happens if you need another attempt.";
      if (manualLink) manualLink.href = option.dataset.manualUrl || "#";
      if (scoreLink) {
        const target = new URL(scoreLink.href);
        target.searchParams.set("state", option.value);
        scoreLink.href = target.href;
      }
      if (permitLink) {
        permitLink.hidden = !option.dataset.mixedPracticeUrl;
        if (option.dataset.mixedPracticeUrl) {
          permitLink.href = option.dataset.mixedPracticeUrl;
          annotateDmvStateLink(permitLink, option, "practice");
        }
      }
      if (signLink) {
        signLink.href = option.dataset.signUrl || signLink.href;
        annotateDmvStateLink(signLink, option, "road_signs");
      }
      load();
      render();
      loadDocumentPack();
      renderDocumentPack();
    };

    stateSelect?.addEventListener("change", updateState);
    checks.forEach((check) => {
      check.addEventListener("change", () => {
        save();
        render();
        trackToolEvent("checklist_item_toggle", {
          tool: "dmv_test_day_checklist",
          state: stateSelect?.value || "default",
          checked: check.checked,
          checked_count: checks.filter((item) => item.checked).length,
          total: checks.length,
        });
      });
    });
    resetButton?.addEventListener("click", () => {
      checks.forEach((check) => {
        check.checked = false;
      });
      save();
      render();
    });
    copyButton?.addEventListener("click", async () => {
      const option = selectedOption();
      const checked = checks.filter((check) => check.checked);
      const open = checks.filter((check) => !check.checked);
      const lines = [
        `DMV test-day plan: ${option?.textContent?.trim() || "selected state"}`,
        `Official source: ${documentSource(option).url}`,
        "",
        "Ready:",
        ...(checked.length ? checked.map((check) => `- ${check.closest("label")?.querySelector("strong")?.textContent || check.value}`) : ["- Nothing marked ready yet"]),
        "",
        "Still to confirm:",
        ...(open.length ? open.map((check) => `- ${check.closest("label")?.querySelector("strong")?.textContent || check.value}`) : ["- All checklist items are marked ready"]),
      ];
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        copyButton.textContent = "Copied";
        window.setTimeout(() => {
          copyButton.textContent = "Copy plan";
        }, 1800);
      } catch (error) {
        copyButton.textContent = "Copy unavailable";
        window.setTimeout(() => {
          copyButton.textContent = "Copy plan";
        }, 1800);
      }
    });
    printButton?.addEventListener("click", () => {
      preparePrintPlan();
      window.print();
    });
    if (printPlan) window.addEventListener("beforeprint", preparePrintPlan);
    packType?.addEventListener("change", () => {
      loadDocumentPack();
      renderDocumentPack();
    });
    packItems.forEach((item) => {
      item.addEventListener("change", () => {
        saveDocumentPack();
        renderDocumentPack();
        trackToolEvent("checklist_item_toggle", {
          tool: "dmv_document_pack",
          state: stateSelect?.value || "default",
          pack_type: packType?.value || "default",
          checked: item.checked,
          checked_count: visiblePackItems().filter((packItem) => packItem.checked).length,
          total: visiblePackItems().length,
        });
      });
    });
    resetPackButton?.addEventListener("click", () => {
      visiblePackItems().forEach((item) => {
        item.checked = false;
      });
      saveDocumentPack();
      renderDocumentPack();
    });
    copyPackButton?.addEventListener("click", async () => {
      const option = selectedOption();
      const typeLabel = selectedPackType()?.textContent?.trim() || "selected path";
      const visible = visiblePackItems();
      const checked = visible.filter((item) => item.checked);
      const open = visible.filter((item) => !item.checked);
      const labelFor = (item) => item.closest("label")?.querySelector("strong")?.textContent || item.value;
      const lines = [
        `DMV document pack: ${option?.textContent?.trim() || "selected state"} - ${typeLabel}`,
        `Official source: ${documentSource(option).url}`,
        "",
        "Ready:",
        ...(checked.length ? checked.map((item) => `- ${labelFor(item)}`) : ["- Nothing marked ready yet"]),
        "",
        "Still to confirm:",
        ...(open.length ? open.map((item) => `- ${labelFor(item)}`) : ["- All visible document checks are marked ready"]),
      ];
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        copyPackButton.textContent = "Copied";
        window.setTimeout(() => {
          copyPackButton.textContent = "Copy document pack";
        }, 1800);
      } catch (error) {
        copyPackButton.textContent = "Copy unavailable";
        window.setTimeout(() => {
          copyPackButton.textContent = "Copy document pack";
        }, 1800);
      }
    });

    let hasUrlState = false;
    try {
      hasUrlState = setStateIfAvailable(new URLSearchParams(window.location.search).get("state"));
    } catch (error) {
      hasUrlState = false;
    }

    try {
      const lastState = window.localStorage.getItem(lastStateKey);
      if (!hasUrlState) {
        setStateIfAvailable(lastState);
      }
    } catch (error) {
      // Ignore storage issues and use the default state.
    }

    updateState();
  });
}

function initSatReviewRecords() {
  document.querySelectorAll("[data-sat-review-record]").forEach((widget) => {
    const record = widget.querySelector("textarea");
    const copy = widget.querySelector("[data-sat-review-copy]");
    const status = widget.querySelector("[data-sat-review-copy-status]");
    if (!record || !copy || !status) return;
    copy.hidden = false;
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(record.value);
        status.textContent = "Blank record copied.";
      } catch {
        record.focus();
        record.select();
        status.textContent = "Automatic copy is unavailable. Copy the selected text.";
      }
    });
  });
}

function initSatScoreCalculators() {
  document.querySelectorAll("[data-sat-score-calculator]").forEach((widget) => {
    const form = widget.querySelector("form");
    const inputs = [...form.querySelectorAll("input")];
    const total = widget.querySelector("[data-sat-total]");
    const gap = widget.querySelector("[data-sat-gap]");
    const rwNeeded = widget.querySelector("[data-sat-rw-needed]");
    const mathNeeded = widget.querySelector("[data-sat-math-needed]");
    const status = widget.querySelector("[data-sat-score-status]");
    const sectionMax = 800;
    const formatNeeded = (score) => score > sectionMax ? `${score} (over ${sectionMax})` : String(score);

    const render = (submitted = false) => {
      const invalid = inputs.filter((input) => !input.validity.valid);
      inputs.forEach((input) => {
        const showError = !input.validity.valid &&
          (submitted || input.value !== "" || input.validity.badInput);
        if (showError) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
      });
      if (invalid.length) {
        [total, gap, rwNeeded, mathNeeded].forEach((output) => { output.textContent = "--"; });
        status.textContent = submitted || invalid.some((input) => input.hasAttribute("aria-invalid"))
          ? "Use 200 to 800 for each section and 400 to 1600 for the target, in steps of 10."
          : "Enter both practice section scores and your target.";
        if (submitted) invalid[0].focus();
        return;
      }

      const [rw, math, target] = inputs.map((input) => input.valueAsNumber);
      const practiceTotal = rw + math;
      const difference = target - practiceTotal;
      const rwWithSameMath = target - math;
      const mathWithSameRw = target - rw;
      total.textContent = String(practiceTotal);
      gap.textContent = `${Math.max(difference, 0)} points`;
      rwNeeded.textContent = difference > 0 ? formatNeeded(rwWithSameMath) : "No increase";
      mathNeeded.textContent = difference > 0 ? formatNeeded(mathWithSameRw) : "No increase";
      if (rwWithSameMath > sectionMax && mathWithSameRw > sectionMax) {
        const minimum = target - sectionMax;
        const exampleRw = Math.floor(target / 2 / 10) * 10;
        const exampleMath = target - exampleRw;
        status.textContent = minimum === sectionMax
          ? `Both sections must reach ${sectionMax} for a total of ${target}. This is score arithmetic, not a prediction.`
          : `Both sections must improve. Each needs at least ${minimum}; the two scores still have to add up to ${target}. For example, ${exampleRw} in Reading and Writing plus ${exampleMath} in Math. This is a score split, not a prediction.`;
        return;
      }
      status.textContent = difference === 0
        ? "This practice total matches your target."
        : difference < 0
          ? `This practice total is ${-difference} points above your target.`
          : "Each section target assumes the other score stays the same.";
    };

    form.addEventListener("input", () => render());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      render(true);
    });
    render();
  });
}

function initSatSuperscoreComparisons() {
  document.querySelectorAll("[data-sat-superscore]").forEach((widget) => {
    const form = widget.querySelector("form");
    const result = widget.querySelector(".sat-superscore-result");
    const sittings = Array.from(form.querySelectorAll("[data-superscore-sitting]"), (row, index) => ({
      label: `Sitting ${index + 1}`,
      inputs: Array.from(row.querySelectorAll("input")),
    }));
    const policy = form.querySelector("[data-superscore-policy]");
    const output = (name) => widget.querySelector(`[data-superscore-${name}]`);
    const single = output("single");
    const combined = output("combined");
    const singleSource = output("single-source");
    const combinedSource = output("combined-source");
    const status = output("status");
    const guidance = output("guidance");
    const format = (score) => score.toLocaleString("en-US");
    const labels = (records) => records.map(record => record.label).join(" / ");

    const render = (submitted = false) => {
      let firstError;
      const records = [];
      for (const [index, sitting] of sittings.entries()) {
        const active = index === 0 || sitting.inputs.some(input => input.value !== "" || input.validity.badInput);
        const invalid = input => active && (input.value === "" || !input.validity.valid);
        for (const input of sitting.inputs) {
          const error = invalid(input);
          if (error && (submitted || input.value !== "" || input.validity.badInput)) input.setAttribute("aria-invalid", "true");
          else input.removeAttribute("aria-invalid");
          if (error && !firstError) firstError = { input, label: sitting.label };
        }
        if (!active || sitting.inputs.some(invalid)) continue;
        const [rw, math] = sitting.inputs.map(input => input.valueAsNumber);
        records.push({ label: sitting.label, rw, math, total: rw + math });
      }
      if (firstError) {
        single.textContent = "--";
        combined.textContent = "--";
        singleSource.textContent = "";
        combinedSource.textContent = "";
        guidance.textContent = "";
        status.textContent = submitted || sittings.some(sitting => sitting.inputs.some(input => input.value !== "" || input.validity.badInput))
          ? `${firstError.label}: enter both scores, 200 to 800 in steps of 10, or leave an optional sitting blank.`
          : "Enter the two scores from sitting 1 to begin.";
        if (submitted) firstError.input.focus();
        return false;
      }

      const best = Math.max(...records.map(record => record.total));
      const rw = Math.max(...records.map(record => record.rw));
      const math = Math.max(...records.map(record => record.math));
      const gain = rw + math - best;
      const repeatedBest = records.filter(record => record.rw === rw && record.math === math);
      single.textContent = format(best);
      singleSource.textContent = labels(records.filter(record => record.total === best));
      combined.textContent = format(rw + math);
      combinedSource.textContent = `${rw} Reading and Writing (${labels(records.filter(record => record.rw === rw))}) + ${math} Math (${labels(records.filter(record => record.math === math))})`;
      status.textContent = records.length === 1 ? "One sitting entered. Add another to compare test dates."
        : gain === 0 ? "Combining the highest sections does not increase the best single-date total."
        : `Combining the sections is ${gain} points higher than your best single-date total.`;

      if (policy.value === "single") {
        guidance.textContent = "Use the single-date total for this comparison. Confirm which complete reports the college requires.";
      } else if (policy.value === "combined") {
        guidance.textContent = repeatedBest.length
          ? `One date can supply both highs: ${labels(repeatedBest)}. Confirm whether the college also requires other dates.`
          : "The highs come from different dates. If official reports are required, use complete reports that include both highs. Check whether the college also requires other dates.";
      } else {
        guidance.textContent = "Verify the college's evaluation and reporting policies before using the combined number or ordering reports.";
      }
      return true;
    };

    form.addEventListener("input", () => render());
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (render(true)) result.focus();
    });
    form.addEventListener("reset", event => {
      event.preventDefault();
      sittings.forEach(sitting => sitting.inputs.forEach(input => { input.value = ""; }));
      policy.value = "unknown";
      render();
    });
    render();
  });
}

function initSatGoalPlanners() {
  document.querySelectorAll("[data-sat-goal-planner]").forEach((widget) => {
    const inputs = ["current", "target", "weeks", "hours"].map((name) => [name, widget.querySelector(`[data-goal-${name}]`)]);
    const headline = widget.querySelector("[data-goal-headline]");
    const gap = widget.querySelector("[data-goal-gap]");
    const weekly = widget.querySelector("[data-goal-weekly]");
    const totalHours = widget.querySelector("[data-goal-total-hours]");
    const nextStep = widget.querySelector("[data-goal-next-step]");
    const plan = widget.querySelector("[data-goal-plan]");
    const button = widget.querySelector("[data-goal-button]");
    const saveButton = widget.querySelector("[data-goal-save]");
    const savedStatus = widget.querySelector("[data-goal-saved-status]");
    const storageKey = "testdaytools_sat_goal_plan_v1";

    const readPlan = () => inputs.every(([, input]) => input.validity.valid)
      ? Object.fromEntries(inputs.map(([name, input]) => [name, input.valueAsNumber]))
      : null;

    const render = (track = false) => {
      const values = readPlan();
      inputs.forEach(([, input]) => {
        if (input.validity.valid) input.removeAttribute("aria-invalid");
        else input.setAttribute("aria-invalid", "true");
      });
      if (button) button.disabled = !values;
      if (saveButton) saveButton.disabled = !values;
      if (!values) {
        if (headline) headline.textContent = "Enter valid scores, weeks, and study hours.";
        if (nextStep) nextStep.textContent = "Use scores in steps of 10 and whole numbers for weeks and hours, within the ranges shown.";
        [gap, weekly, totalHours].forEach((output) => { if (output) output.textContent = "--"; });
        plan?.replaceChildren();
        if (savedStatus) savedStatus.hidden = true;
        return;
      }
      const { current, target, weeks, hours } = values;
      const scoreGap = Math.max(target - current, 0);
      const perWeek = Math.ceil(scoreGap / weeks / 10) * 10;
      const total = weeks * hours;

      if (headline) {
        headline.textContent = scoreGap ? `${scoreGap} points over ${weeks} ${weeks === 1 ? "week" : "weeks"}` : "Target already reached";
      }
      if (gap) gap.textContent = scoreGap ? `${scoreGap} points` : "0 points";
      if (weekly) weekly.textContent = scoreGap ? `${perWeek} points` : "Maintain";
      if (totalHours) totalHours.textContent = `${total} hours`;
      if (nextStep) {
        nextStep.textContent = scoreGap
          ? "The weekly gap is the score gap divided by weeks, rounded up to a multiple of 10. It is a planning reference, not a score prediction. Recheck with timed practice."
          : "Your entered score already meets your target. Use timed practice to check that it holds.";
      }
      if (plan) {
        const weakBlock = scoreGap <= 80 ? "Review the two most repeated misses." : "Choose the weaker SAT section and one repeated question type.";
        const practiceBlock = hours <= 3 ? "Protect two short focused sessions each week." : `Use about ${Math.max(2, Math.round(hours * 0.6))} hours for targeted repair before full-test work.`;
        const checkBlock = weeks <= 2 ? "Use one timed check before test day and protect Bluebook setup." : "Run one timed checkpoint each week and update the inputs with new evidence.";
        plan.innerHTML = `<li><strong>Focus</strong><span>${weakBlock}</span></li><li><strong>Weekly work</strong><span>${practiceBlock}</span></li><li><strong>Checkpoint</strong><span>${checkBlock}</span></li>`;
      }
      if (track) {
        trackToolEvent("sat_goal_generated", {
          score_gap: scoreGap,
          weeks,
          weekly_hours: hours,
          points_per_week: perWeek,
        });
      }
    };

    inputs.forEach(([, input]) => input.addEventListener("input", () => {
      if (savedStatus) savedStatus.hidden = true;
      render();
    }));
    button?.addEventListener("click", () => render(true));
    saveButton?.addEventListener("click", () => {
      const values = readPlan();
      if (!values) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(values));
        if (savedStatus) {
          savedStatus.hidden = false;
          savedStatus.textContent = "Saved in this browser. Return here to update the same plan after your next timed practice test.";
        }
        trackToolEvent("sat_goal_saved", {
          score_gap: Math.max(values.target - values.current, 0),
          weeks: values.weeks,
          weekly_hours: values.hours,
        });
      } catch (error) {
        if (savedStatus) {
          savedStatus.hidden = false;
          savedStatus.textContent = "This browser blocked local saving. Your plan is still visible on this page.";
        }
      }
    });
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && inputs.every(([name]) => Number.isFinite(saved[name]))) {
        const defaults = inputs.map(([, input]) => input.value);
        inputs.forEach(([name, input]) => { input.value = saved[name]; });
        if (!readPlan()) {
          inputs.forEach(([, input], index) => { input.value = defaults[index]; });
        } else if (savedStatus) {
          savedStatus.hidden = false;
          savedStatus.textContent = "Saved plan loaded from this browser.";
        }
      }
    } catch (error) {
      // Ignore unavailable or malformed browser-local state.
    }
    render();
  });
}

function satEasternDate(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const datePart = (type) => parts.find((part) => part.type === type).value;
  return `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
}

function satRegistrationStatus(event, now = new Date()) {
  const easternDate = satEasternDate(now);
  if (easternDate > event.lateDate) return "closed";
  if (easternDate > event.registrationDate) return "late";
  return "regular";
}

function initSatAnticipatedFall() {
  document.querySelectorAll("[data-sat-fall-dates]").forEach((section) => {
    const controls = section.querySelector("[data-sat-fall-controls]");
    const deadline = section.querySelector("[data-sat-fall-deadline]");
    const status = section.querySelector("[data-sat-fall-status]");
    if (!controls || !deadline || !status) return;
    const dates = Array.from(section.querySelectorAll("[data-sat-fall-gap]"), (result) => {
      const testDate = result.closest("tr").querySelector("time").dateTime;
      return { testDay: Date.parse(`${testDate}T00:00:00Z`), result };
    });
    const render = () => {
      const deadlineDay = deadline.valueAsNumber;
      const hasDeadline = Number.isFinite(deadlineDay);
      for (const { testDay, result } of dates) {
        // The date control supplies UTC midnight, so DST and display time zone do not affect gaps.
        const gap = (deadlineDay - testDay) / DAY_MS;
        result.textContent = !hasDeadline ? "--"
          : gap < 0 ? "After deadline"
          : gap === 0 ? "Same calendar day"
          : `${gap} ${gap === 1 ? "day" : "days"} before`;
      }
      status.textContent = hasDeadline ? "Calendar-day gaps updated." : "";
    };
    deadline.addEventListener("input", render);
    controls.hidden = false;
    render();
  });
}

function initSatDatePlanners() {
  document.querySelectorAll("[data-sat-date-planner]").forEach((widget) => {
    const dataNode = widget.querySelector("[data-sat-date-data]");
    const stageSelect = widget.querySelector("[data-sat-stage]");
    const deadlineSelect = widget.querySelector("[data-sat-deadline]");
    const readinessSelect = widget.querySelector("[data-sat-readiness]");
    const retakeInput = widget.querySelector("[data-sat-retake]");
    const waitForScoreInput = widget.querySelector("[data-sat-wait-for-score]");
    const deviceLoanInput = widget.querySelector("[data-sat-device-loan]");
    const buildButton = widget.querySelector("[data-sat-plan-button]");
    const headline = widget.querySelector("[data-sat-plan-headline]");
    const reason = widget.querySelector("[data-sat-plan-reason]");
    const picks = widget.querySelector("[data-sat-plan-picks]");
    const primaryDate = widget.querySelector("[data-sat-primary-date]");
    const primaryDeadline = widget.querySelector("[data-sat-primary-deadline]");
    const primaryDevice = widget.querySelector("[data-sat-primary-device]");
    const primaryScore = widget.querySelector("[data-sat-primary-score]");
    const backupDate = widget.querySelector("[data-sat-backup-date]");
    const backupDeadline = widget.querySelector("[data-sat-backup-deadline]");
    const backupDevice = widget.querySelector("[data-sat-backup-device]");
    const backupScore = widget.querySelector("[data-sat-backup-score]");
    const retakeWindowNote = widget.querySelector("[data-sat-retake-window]");
    const saveButton = widget.querySelector("[data-sat-plan-save]");
    const calendarButton = widget.querySelector("[data-sat-date-calendar]");
    const registerLink = widget.querySelector("[data-sat-register-link]");
    const savedStatus = widget.querySelector("[data-sat-saved-status]");
    const storageKey = "tdt-sat-date-plan:v1";
    let events = [];
    let currentPlan = null;

    try {
      events = JSON.parse(dataNode?.textContent || "[]");
    } catch (error) {
      events = [];
    }
    if (!events.length) return;

    // SAT dates are calendar days, not local instants or elapsed hours across DST.
    const calendarDay = (value) => Date.parse(`${value}T00:00:00Z`);
    const dateLabel = (value) => new Date(calendarDay(value)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const monthKey = (event) => `${event.date.slice(0, 4)}-${event.date.slice(5, 7)}`;
    const readinessDays = { ready: 14, focused: 42, starting: 70 };
    const deviceLoanDays = 30;
    const deviceDeadline = (event) => new Date(calendarDay(event.date) - deviceLoanDays * DAY_MS).toISOString().slice(0, 10);
    const deviceText = (event) => `Register and finish the College Board device request by ${dateLabel(deviceDeadline(event))}. Device approval is not guaranteed.`;
    const showDeviceDeadline = (node, event, needsDevice) => {
      if (!node) return;
      node.hidden = !event || !needsDevice;
      node.textContent = node.hidden ? "" : deviceText(event);
    };
    const showScoreRelease = (node, event) => {
      if (!node) return;
      node.hidden = !event?.scoreReleaseDate;
      node.textContent = node.hidden ? "" : `Scheduled student score release: ${dateLabel(event.scoreReleaseDate)}.`;
    };
    const backupWindow = (primary, backup, needsDevice) => {
      const release = primary.scoreReleaseDate;
      const loanCutoff = needsDevice ? deviceDeadline(backup) : "";
      const usesLoanCutoff = loanCutoff && loanCutoff <= backup.lateDate;
      const cutoff = usesLoanCutoff ? loanCutoff : backup.lateDate;
      const action = usesLoanCutoff ? "device request" : "late registration";
      if (!release) return { canWait: false, note: "A scheduled student score release is not listed for the primary date." };
      // Same-day score availability cannot be relied on to meet a cutoff.
      if (release === cutoff) {
        return { canWait: false, note: `The backup's ${action} cutoff and scheduled first score release both fall on ${dateLabel(cutoff)}. Do not rely on seeing the score before that cutoff.` };
      }
      if (release > cutoff) {
        return { canWait: false, note: `The backup's ${action} cutoff is ${dateLabel(cutoff)}, before the scheduled first score release on ${dateLabel(release)}.` };
      }
      if (usesLoanCutoff) {
        return { canWait: true, note: `If the first score posts as scheduled, it will be before the backup's device request cutoff on ${dateLabel(cutoff)}. Confirm seats and device availability.` };
      }
      if (release >= backup.registrationDate) {
        return { canWait: true, note: `Do not count on regular registration if you wait for the first score. Check seats and fees for late registration by ${dateLabel(cutoff)}.` };
      }
      return { canWait: true, note: `The first score is scheduled before the backup's regular registration cutoff on ${dateLabel(backup.registrationDate)}. Check actual score and seat availability.` };
    };
    const preferredKeys = (stage, deadline) => {
      if (stage === "junior_first") return ["2027-03", "2027-05", "2027-06"];
      if (stage === "junior_retake") return ["2027-05", "2027-06", "2027-03"];
      if (stage === "rising_senior" || stage === "senior") {
        if (deadline === "early") return ["2026-08", "2026-09", "2026-10", "2026-11"];
        if (deadline === "regular") return ["2026-10", "2026-11", "2026-12"];
        return ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
      }
      return events.map(monthKey);
    };
    const registrationText = (event, now) => {
      if (satRegistrationStatus(event, now) === "late") {
        return `Regular deadline passed; late deadline ${dateLabel(event.lateDate)} at 11:59 p.m. ET`;
      }
      return `Register by ${dateLabel(event.registrationDate)}; late deadline ${dateLabel(event.lateDate)} (both 11:59 p.m. ET)`;
    };
    const stageReason = (stage, deadline) => {
      if (stage === "junior_first" || stage === "junior_retake") return "Use the preparation time to review practice results before committing to this test.";
      if (deadline === "early") return "This date meets your study runway, but may be too late for early applications. Confirm each college's final accepted test date and score-send deadline.";
      if (deadline === "regular") return "This date meets your study runway. Confirm that its score-release and score-send timing meet each college's regular-decision policy.";
      return "This is the earliest listed date that fits the preparation runway you selected.";
    };

    const clearPlan = (message, detail) => {
      currentPlan = null;
      if (headline) headline.textContent = message;
      if (reason) reason.textContent = detail;
      if (picks) picks.hidden = true;
      if (retakeWindowNote) {
        retakeWindowNote.hidden = true;
        retakeWindowNote.textContent = "";
      }
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Save this plan";
      }
      if (calendarButton) calendarButton.disabled = true;
      if (savedStatus) savedStatus.hidden = true;
    };

    const buildPlan = ({ track = true } = {}) => {
      const now = new Date();
      const today = calendarDay(satEasternDate(now));
      const daysUntil = (value) => (calendarDay(value) - today) / DAY_MS;
      const stage = stageSelect?.value || "other";
      const deadline = deadlineSelect?.value || "unsure";
      const readiness = readinessSelect?.value || "focused";
      const wantsRetake = Boolean(retakeInput?.checked);
      const waitForScore = wantsRetake && Boolean(waitForScoreInput?.checked);
      const needsDevice = Boolean(deviceLoanInput?.checked);
      const minimumDays = readinessDays[readiness] || readinessDays.focused;
      const eligibleForRegistration = events
        .filter((event) => satRegistrationStatus(event, now) !== "closed" && daysUntil(event.date) >= minimumDays)
        .sort((a, b) => a.date.localeCompare(b.date));
      const valid = needsDevice
        ? eligibleForRegistration.filter((event) => daysUntil(event.date) >= deviceLoanDays)
        : eligibleForRegistration;
      const priorities = preferredKeys(stage, deadline);
      const preferred = priorities
        .map((key) => valid.find((event) => monthKey(event) === key))
        .filter(Boolean);
      const primary = preferred[0] || valid[0] || null;

      if (!primary) {
        if (needsDevice && eligibleForRegistration.length) {
          clearPlan("No listed date still fits the device request deadline", "Check College Board for a later date, or ask your school, family or a friend about a Bluebook-compatible device. There is no guarantee of a device from College Board.");
        } else {
          clearPlan("No listed date fits that runway", "Check College Board for later dates, or choose a shorter runway only if it fits your preparation.");
        }
        return;
      }

      const backups = wantsRetake ? valid.filter((event) => event.date > primary.date)
        .map((event) => ({ event, ...backupWindow(primary, event, needsDevice) })) : [];
      const firstBackup = backups[0];
      const choice = waitForScore ? backups.find((entry) => entry.canWait) : firstBackup;
      const backup = choice?.event || null;
      currentPlan = { stage, deadline, readiness, wantsRetake, waitForScore, needsDevice, primary, backup, createdAt: Date.now() };
      if (headline) headline.textContent = `${primary.label} matches your study runway`;
      if (reason) {
        reason.textContent = `${stageReason(stage, deadline)} It is ${daysUntil(primary.date)} calendar days away (U.S. Eastern time), meeting the ${minimumDays}-day minimum you chose.`;
      }
      if (primaryDate) primaryDate.textContent = primary.label;
      if (primaryDeadline) primaryDeadline.textContent = registrationText(primary, now);
      showDeviceDeadline(primaryDevice, primary, needsDevice);
      showScoreRelease(primaryScore, primary);
      const noAfterScore = waitForScore && firstBackup && !choice;
      if (backupDate) {
        backupDate.textContent = backup?.label || (noAfterScore ? "No listed date fits after scores"
          : wantsRetake ? "No later listed date" : "Not requested");
      }
      if (backupDeadline) {
        backupDeadline.textContent = backup ? registrationText(backup, now)
          : noAfterScore ? "Check later official dates or consider an earlier primary date if you are prepared."
          : "You can rebuild the plan whenever your timeline changes.";
      }
      showDeviceDeadline(backupDevice, backup, needsDevice);
      showScoreRelease(backupScore, backup);
      if (retakeWindowNote) {
        const skipped = firstBackup && firstBackup !== choice
          ? `Skipped ${firstBackup.event.label}: ${firstBackup.note} ` : "";
        const result = choice ? choice.note + (choice.canWait ? "" : " Reserve before the cutoff or choose a later date.") : "";
        retakeWindowNote.hidden = !firstBackup;
        retakeWindowNote.textContent = (skipped + result).trim();
      }
      if (picks) picks.hidden = false;
      if (saveButton) saveButton.disabled = false;
      if (calendarButton) calendarButton.disabled = false;
      if (savedStatus) savedStatus.hidden = true;

      if (track) {
        trackToolEvent("sat_plan_generated", {
          stage,
          deadline,
          readiness,
          primary_date: primary.date,
          backup_date: backup?.date || "none",
        });
      }
    };

    const updateRetakePreference = () => {
      if (waitForScoreInput) waitForScoreInput.disabled = !retakeInput?.checked;
    };
    const focusPlanResult = () => {
      headline?.focus({ preventScroll: true });
      headline?.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const checkPlanBeforeAction = () => {
      if (!currentPlan) return false;
      const now = new Date();
      const today = satEasternDate(now);
      const { primary, backup, needsDevice } = currentPlan;
      for (const event of [primary, backup].filter(Boolean)) {
        const lateClosed = satRegistrationStatus(event, now) === "closed";
        const loanClosed = needsDevice && today > deviceDeadline(event);
        if (lateClosed || loanClosed) {
          const cutoff = lateClosed
            ? `The late registration deadline on ${dateLabel(event.lateDate)} has passed.`
            : `The College Board device request cutoff on ${dateLabel(deviceDeadline(event))} has passed.`;
          clearPlan(`${event.label} no longer fits this plan`,
            `${cutoff} Build a new plan for current dates. Any previously saved plan is unchanged.`);
          focusPlanResult();
          return false;
        }
      }
      if (primaryDeadline) primaryDeadline.textContent = registrationText(primary, now);
      if (backup && backupDeadline) backupDeadline.textContent = registrationText(backup, now);
      return true;
    };
    [stageSelect, deadlineSelect, readinessSelect, retakeInput, waitForScoreInput, deviceLoanInput].forEach((input) => {
      input?.addEventListener("change", () => {
        updateRetakePreference();
        clearPlan("Build a plan for these choices", "Build again before saving or downloading a date.");
      });
    });
    buildButton?.addEventListener("click", () => {
      buildPlan();
      focusPlanResult();
    });
    saveButton?.addEventListener("click", () => {
      if (!checkPlanBeforeAction()) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(currentPlan));
        if (savedStatus) {
          savedStatus.textContent = `Saved in this browser: ${currentPlan.primary.label}${currentPlan.backup ? ` with ${currentPlan.backup.label} as backup` : ""}.`;
          savedStatus.hidden = false;
        }
        saveButton.textContent = "Plan saved";
        window.setTimeout(() => {
          saveButton.textContent = "Save this plan";
        }, 1800);
        trackToolEvent("sat_plan_saved", {
          primary_date: currentPlan.primary.date,
          backup_date: currentPlan.backup?.date || "none",
        });
        trackToolEvent("study_state_change", { state: "sat_date_plan_saved" });
      } catch (error) {
        if (savedStatus) {
          savedStatus.textContent = "This browser blocked saving. The date plan still works for this visit.";
          savedStatus.hidden = false;
        }
      }
    });
    calendarButton?.addEventListener("click", () => {
      if (!checkPlanBeforeAction()) return;
      const event = currentPlan.primary;
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      const nextDay = new Date(calendarDay(event.date) + DAY_MS).toISOString().slice(0, 10).replace(/-/g, "");
      const startDay = event.date.replace(/-/g, "");
      const escapeIcs = (value) => String(value).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
      const entry = (uid, timing, title, description, url, transparent = false) => [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        ...timing,
        `SUMMARY:${escapeIcs(title)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        `URL:${url}`,
        ...(transparent ? ["TRANSP:TRANSPARENT"] : []),
        "END:VEVENT",
      ];
      const scheduleUrl = "https://satsuite.collegeboard.org/sat/dates-deadlines";
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TestDayTools//SAT Date Planner//EN",
        "CALSCALE:GREGORIAN",
        ...entry(`sat-${event.date}@testdaytools.com`, [`DTSTART;VALUE=DATE:${startDay}`, `DTEND;VALUE=DATE:${nextDay}`],
          `SAT - ${event.label}`, event.description, scheduleUrl),
        ...(event.calendarDeadlines || []).flatMap(deadline => entry(
          deadline.uid, [`DTSTART:${deadline.utc}`],
          deadline.title, deadline.description, deadline.url, true)),
      ];
      if (currentPlan.needsDevice) {
        const deviceDay = deviceDeadline(event);
        const deviceEnd = new Date(calendarDay(deviceDay) + DAY_MS).toISOString().slice(0, 10);
        lines.push(...entry(`sat-${startDay}-device-request@testdaytools.com`,
          [`DTSTART;VALUE=DATE:${deviceDay.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${deviceEnd.replace(/-/g, "")}`],
          `SAT device request cutoff - ${event.label}`, deviceText(event),
          "https://satsuite.collegeboard.org/sat/device-lending", true));
      }
      lines.push("END:VCALENDAR", "");
      const encoder = new TextEncoder();
      const fold = (line) => {
        let result = "", size = 0;
        for (const char of line) {
          const bytes = encoder.encode(char).length;
          if (size + bytes > 75) {
            result += "\r\n ";
            size = 1;
          }
          result += char;
          size += bytes;
        }
        return result;
      };
      const ics = lines.map(fold).join("\r\n");
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      const download = document.createElement("a");
      download.href = url;
      download.download = `sat-${event.date}.ics`;
      document.body.appendChild(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      trackToolEvent("sat_date_selected", { action: "calendar_download", primary_date: event.date });
      trackToolEvent("resource_download", { resource: "sat_primary_date_calendar", target: download.download });
    });
    registerLink?.addEventListener("click", () => {
      trackToolEvent("study_next_step_click", {
        action: "official_sat_registration",
        primary_date: currentPlan?.primary?.date || "not_generated",
      });
      if (currentPlan) {
        trackToolEvent("sat_date_selected", { action: "official_registration", primary_date: currentPlan.primary.date });
      }
    });

    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (saved?.primary?.date && events.some((event) => event.date === saved.primary.date)) {
        if (stageSelect && saved.stage) stageSelect.value = saved.stage;
        if (deadlineSelect && saved.deadline) deadlineSelect.value = saved.deadline;
        if (readinessSelect && saved.readiness) readinessSelect.value = saved.readiness;
        if (retakeInput) retakeInput.checked = Boolean(saved.wantsRetake);
        if (waitForScoreInput) waitForScoreInput.checked = saved.waitForScore === true;
        if (deviceLoanInput) deviceLoanInput.checked = saved.needsDevice === true;
        buildPlan({ track: false });
        if (savedStatus && currentPlan) {
          const datesUnchanged = currentPlan.primary.date === saved.primary.date && currentPlan.backup?.date === saved.backup?.date;
          savedStatus.textContent = datesUnchanged
            ? `Saved in this browser: ${currentPlan.primary.label}${currentPlan.backup ? ` with ${currentPlan.backup.label} as backup` : ""}.`
            : "A new date suggestion replaced the old result on screen. This suggestion is not saved yet.";
          savedStatus.hidden = false;
        }
      }
    } catch (error) {
      // A fresh plan remains available when saved browser data cannot be read.
    }
    updateRetakePreference();
  });
}

function initSatAugustReadiness() {
  document.querySelectorAll("[data-sat-august-readiness]").forEach((tool) => {
    const registration = tool.querySelector("[data-august-registration]");
    const device = tool.querySelector("[data-august-device]");
    const id = tool.querySelector("[data-august-id]");
    const route = tool.querySelector("[data-august-route]");
    const buildButton = tool.querySelector("[data-august-plan-button]");
    const saveButton = tool.querySelector("[data-august-plan-save]");
    const calendarLink = tool.querySelector("[data-august-calendar]");
    const registerLink = tool.querySelector("[data-august-register]");
    const statusLabel = tool.querySelector("[data-august-status-label]");
    const statusHeadline = tool.querySelector("[data-august-status-headline]");
    const statusDetail = tool.querySelector("[data-august-status-detail]");
    const planHeadline = tool.querySelector("[data-august-plan-headline]");
    const planReason = tool.querySelector("[data-august-plan-reason]");
    const planSteps = tool.querySelector("[data-august-plan-steps]");
    const savedStatus = tool.querySelector("[data-august-saved-status]");
    const storageKey = "tdt-sat-august-2026:v1";

    const dates = {
      regular: new Date(tool.dataset.regularDeadline).getTime(),
      late: new Date(tool.dataset.lateDeadline).getTime(),
      setup: new Date(tool.dataset.setupStart).getTime(),
      test: new Date(tool.dataset.testStart).getTime(),
      testEnd: new Date(tool.dataset.testEnd).getTime(),
      score: new Date(tool.dataset.scoreDate).getTime(),
    };
    if (Object.values(dates).some(Number.isNaN)) return;

    let currentPlan = null;

    const currentWindow = (now = Date.now()) => {
      if (now <= dates.regular) return "regular_registration";
      if (now <= dates.late) return "late_registration";
      if (now < dates.setup) return "registered_preparation";
      if (now < dates.test) return "exam_setup";
      if (now < dates.testEnd) return "test_day";
      if (now < dates.score) return "score_wait";
      return "scores_available";
    };

    const renderStatus = () => {
      const now = Date.now();
      const windowName = currentWindow(now);
      const hoursLeft = Math.max(0, Math.ceil((dates.late - now) / 3600000));
      const daysLeft = Math.floor(hoursLeft / 24);
      const remainingHours = hoursLeft % 24;
      const status = {
        regular_registration: [
          "Registration window",
          "Regular registration is still open",
          "College Board lists August 7 at 11:59 p.m. ET as the regular deadline and August 11 as the late deadline.",
        ],
        late_registration: [
          "Late-registration window",
          "Late registration and changes are open",
          `${daysLeft ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} ` : ""}${remainingHours} hour${remainingHours === 1 ? "" : "s"} remain until August 11 at 11:59 p.m. ET. Seat availability can still vary.`,
        ],
        registered_preparation: [
          "Preparation window",
          "August registration has closed",
          "Registered students should resolve device, physical ID, and route issues before Bluebook exam setup opens on August 17.",
        ],
        exam_setup: [
          "Exam-setup window",
          "Complete Bluebook exam setup now",
          "Generate the admission ticket, confirm the center address and arrival time, and save an accessible copy before August 22.",
        ],
        test_day: [
          "Test day",
          "Follow the admission ticket's arrival time",
          "Bring the charged testing device, physical photo ID, ticket, and required supplies. Check for center changes before leaving.",
        ],
        score_wait: [
          "Score window",
          "The August SAT is complete",
          "College Board lists September 4 as the scheduled score release. Use the wait to compare college deadlines and backup dates.",
        ],
        scores_available: [
          "Next decision",
          "Review the August score and deadline fit",
          "Compare the score with your target and each college's policy before paying for another administration.",
        ],
      }[windowName];
      if (statusLabel) statusLabel.textContent = status[0];
      if (statusHeadline) statusHeadline.textContent = status[1];
      if (statusDetail) statusDetail.textContent = status[2];
      return windowName;
    };

    const buildPlan = ({ track = true } = {}) => {
      if (!registration || !device || !id || !route || !planHeadline || !planReason || !planSteps) return;
      const windowName = renderStatus();
      const registrationValue = registration.value;
      const deviceValue = device.value;
      const idValue = id.value;
      const routeValue = route.value;
      const steps = [];
      let gapCount = 0;

      if (registrationValue !== "registered") {
        gapCount += 1;
        if (["regular_registration", "late_registration"].includes(windowName)) {
          steps.push({
            title: registrationValue === "unsure" ? "Confirm your registration today" : "Check late registration now",
            text: "Open the official College Board registration flow before August 11 at 11:59 p.m. ET and verify whether a test-center seat is available.",
          });
        } else {
          steps.push({
            title: "Use September 12 as the first backup",
            text: "August registration has closed. College Board lists August 28 as the regular deadline and September 1 as the late deadline for September 12.",
          });
        }
      }

      if (deviceValue === "not_ready") {
        gapCount += 1;
        steps.push({ title: "Resolve Bluebook before the final week", text: "Install or update Bluebook, sign in on the testing device, and fix password or compatibility issues before exam setup." });
      } else if (deviceValue === "installed") {
        gapCount += 1;
        steps.push({ title: "Finish the device check", text: "Confirm Bluebook opens, the device can stay charged for roughly three hours, and you can unlock it without another device." });
      } else if (deviceValue === "borrowed") {
        steps.push({ title: "Follow the loaned-device arrival instructions", text: "College Board's sample schedule asks students with an approved loaned device to arrive 30 minutes earlier. Your admission ticket is the final instruction." });
      }

      if (idValue !== "ready") {
        gapCount += 1;
        steps.push({
          title: idValue === "missing" ? "Get an acceptable physical photo ID" : "Verify the current ID rules",
          text: "The ID must be an original physical document with a recognizable photo and the same full legal name shown on the admission ticket.",
        });
      }

      if (routeValue !== "ready") {
        gapCount += 1;
        steps.push({ title: "Confirm the center and ride", text: "Use the admission ticket for the exact address and arrival time, then plan a backup ride and enough travel buffer." });
      }

      if (registrationValue === "registered") {
        if (Date.now() < dates.setup) {
          steps.push({ title: "Set an August 17 exam-setup reminder", text: "Between August 17 and 21, open Bluebook, complete exam setup, and print or email the admission ticket." });
        } else if (Date.now() < dates.test) {
          steps.push({ title: "Complete exam setup now", text: "Generate the admission ticket in Bluebook and confirm the center address and arrival time before test day." });
        }
      }

      if (Date.now() < dates.test) {
        steps.push({ title: "Protect the final night", text: "Charge the device, pack the power cord, physical ID, ticket, pens or pencils, calculator if desired, water, and a snack." });
        steps.push({ title: "Check for a center change", text: "Review Bluebook, email, My SAT, and the test-center website before leaving on August 22." });
      } else {
        steps.push({ title: "Use September 4 as the score checkpoint", text: "Compare the released score with your target and application deadlines before deciding on a retake." });
      }

      const headline = registrationValue !== "registered" && !["regular_registration", "late_registration"].includes(windowName)
        ? "Pivot from August registration to the next useful date"
        : gapCount
          ? `${gapCount} readiness item${gapCount === 1 ? "" : "s"} need attention`
          : "Core logistics are confirmed";
      planHeadline.textContent = headline;
      planReason.textContent = gapCount
        ? "Work from the first item downward. Deadline and admission risks come before extra practice."
        : "Keep the setup window, ticket, final-night pack, and center-change check on the calendar.";
      planSteps.replaceChildren(...steps.map((step) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        const text = document.createElement("span");
        title.textContent = step.title;
        text.textContent = step.text;
        item.append(title, text);
        return item;
      }));
      planSteps.hidden = false;
      if (saveButton) saveButton.disabled = false;
      currentPlan = {
        registration: registrationValue,
        device: deviceValue,
        id: idValue,
        route: routeValue,
        window: windowName,
        headline,
        steps,
        updatedAt: Date.now(),
      };
      if (savedStatus) savedStatus.hidden = true;

      if (track) {
        trackToolEvent("sat_august_plan_generated", {
          registration: registrationValue,
          device: deviceValue,
          id_status: idValue,
          route: routeValue,
          timeline_window: windowName,
          readiness_gaps: gapCount,
        });
      }
    };

    buildButton?.addEventListener("click", () => buildPlan());
    saveButton?.addEventListener("click", () => {
      if (!currentPlan) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(currentPlan));
        if (savedStatus) {
          savedStatus.textContent = "Plan saved in this browser. Reopen this page to review the same readiness choices.";
          savedStatus.hidden = false;
        }
        saveButton.textContent = "Plan saved";
        window.setTimeout(() => { saveButton.textContent = "Save this plan"; }, 1800);
        trackToolEvent("sat_august_plan_saved", { timeline_window: currentPlan.window, step_count: currentPlan.steps.length });
        trackToolEvent("study_state_change", { state: "sat_august_plan_saved" });
      } catch (error) {
        if (savedStatus) {
          savedStatus.textContent = "This browser blocked saving. The plan still works for this visit.";
          savedStatus.hidden = false;
        }
      }
    });
    calendarLink?.addEventListener("click", () => {
      trackToolEvent("study_next_step_click", { action: "download_august_sat_timeline", timeline_window: currentPlan?.window || currentWindow() });
    });
    registerLink?.addEventListener("click", () => {
      trackToolEvent("study_next_step_click", { action: "official_august_sat_time", timeline_window: currentPlan?.window || currentWindow() });
    });

    renderStatus();
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved === "object") {
        if (registration && saved.registration) registration.value = saved.registration;
        if (device && saved.device) device.value = saved.device;
        if (id && saved.id) id.value = saved.id;
        if (route && saved.route) route.value = saved.route;
        buildPlan({ track: false });
        if (savedStatus) {
          savedStatus.textContent = "Saved plan restored from this browser.";
          savedStatus.hidden = false;
        }
      }
    } catch (error) {
      // A fresh plan remains available when local storage is blocked.
    }
  });
}

initAnalyticsEvents();
initPrintableResources();
initCountdowns();
initQuizzes();
initModeTools();
initStateFilters();
initPracticeWorkbenches();
initMiniSignDrills();
initSignLookups();
initRoadSignFlashcards();
initWorksheetReturns();
initDmvDailyQuestions();
initDmvMistakeLogs();
initDmvStudyPlanners();
initRecentPracticeCards();
initDmvJourneyDashboards();
initDmvRequirementsFinders();
initDmvScoreCalculators();
initScoreEntryTracking();
initDmvChecklists();
initSatReviewRecords();
initSatScoreCalculators();
initSatSuperscoreComparisons();
initSatGoalPlanners();
initSatDatePlanners();
initSatAnticipatedFall();
initSatAugustReadiness();
