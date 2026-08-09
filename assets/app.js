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
}

const DMV_JOURNEY_STORAGE_KEY = "tdt-dmv-journey:v1";
const DMV_MASTERY_STORAGE_KEY = "tdt-dmv-mastery:v1";
const DAY_MS = 86400000;

function normalizeDmvState(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
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

function getDmvMasterySummary(state = "") {
  const selectedState = normalizeDmvState(state);
  const now = Date.now();
  const items = Object.values(readDmvMastery().items).filter((item) => {
    const itemState = normalizeDmvState(item?.state);
    return !selectedState || itemState === selectedState || itemState === "general";
  });
  const learning = items.filter((item) => !Number(item.reliableAt));
  const dueItems = learning
    .filter((item) => Number(item.dueAt) <= now)
    .sort((a, b) => Number(a.dueAt) - Number(b.dueAt) || Number(a.updatedAt) - Number(b.updatedAt));
  return {
    attempted: items.length,
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
  const correctStreak = correct ? (Number(previous.correctStreak) || 0) + 1 : 0;
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
    dueAt: correct ? now + (correctStreak >= 2 ? 7 * DAY_MS : DAY_MS) : now,
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

function recordDmvSession({ label, href, total, correct, missed, weak, state }) {
  const journey = readDmvJourney();
  const selectedState = normalizeDmvState(state || journey.state);
  if (selectedState) journey.state = selectedState;
  const stamp = localDayStamp();
  const day = journey.days[stamp] || { answered: 0, correct: 0, sessions: 0 };
  day.sessions = (Number(day.sessions) || 0) + 1;
  journey.days[stamp] = day;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  journey.sessions.unshift({
    label,
    href,
    total,
    correct,
    missed,
    percent,
    weak: Array.isArray(weak) ? weak.slice(0, 3) : [],
    state: selectedState,
    completedAt: Date.now(),
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
      trackToolEvent("home_tool_click", {
        section: closestAnalyticsSection(link),
        target: analyticsPathFromHref(link.getAttribute("href")),
        link_text: link.textContent,
      });
    }

    if (link.matches("[data-resource-download]")) {
      trackToolEvent("resource_download", {
        resource: link.dataset.resourceDownload,
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

function initQuizzes() {
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
    const jumpList = quiz.querySelector("[data-quiz-jump-list]");
    const nextPlanTitle = quiz.querySelector("[data-quiz-next-title]");
    const nextPlanCopy = quiz.querySelector("[data-quiz-next-copy]");
    const nextPlanAction = quiz.querySelector("[data-quiz-next-action]");
    const masteryDue = quiz.querySelector("[data-quiz-mastery-due]");
    const masteryLearning = quiz.querySelector("[data-quiz-mastery-learning]");
    const masteryReliable = quiz.querySelector("[data-quiz-mastery-reliable]");
    const passScore = Number(quiz.dataset.passScore) || questions.length;
    const quizLabel = quiz.dataset.quizLabel || "practice round";
    const isDmvQuiz = quiz.dataset.domain === "dmv";
    const answered = new Set();
    const correctAnswers = new Set();
    const wrongAnswers = new Set();
    const missedCategories = {};
    const storageKey = `tdt-mistakes:${window.location.pathname}:${quiz.dataset.modeId || quizLabel}`;
    const recentPracticeKey = "tdt-recent-practice";
    let savedMistakes = [];
    let activeSequence = questions.map((_, index) => index);
    let activePosition = 0;
    let toolMessage = "";
    let timerId = 0;
    let timerRemaining = 10 * 60;
    let timerComplete = false;
    let quizStartedTracked = false;
    let quizHalfwayTracked = false;
    let quizCompletedTracked = false;

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

    const getActiveQuestionIndex = () => activeSequence[activePosition];

    const masteryRecords = () => {
      if (!isDmvQuiz) return [];
      const items = readDmvMastery().items;
      return questions.map((question) => items[questionMasteryId(question, quiz.dataset.state)] || null);
    };

    const dueQuestionIndexes = () => {
      const now = Date.now();
      return masteryRecords()
        .map((record, index) => ({ index, record }))
        .filter(({ record }) => record && !Number(record.reliableAt) && Number(record.dueAt) <= now)
        .map(({ index }) => index);
    };

    const renderMasteryStats = () => {
      if (!isDmvQuiz) return;
      const currentRecords = masteryRecords();
      const now = Date.now();
      const records = currentRecords.filter(Boolean);
      const dueCount = currentRecords.filter(
        (record) => record && !Number(record.reliableAt) && Number(record.dueAt) <= now
      ).length;
      const reliableCount = records.filter((record) => Number(record.reliableAt)).length;
      const learningCount = records.length - reliableCount;
      if (masteryDue) masteryDue.textContent = String(dueCount);
      if (masteryLearning) masteryLearning.textContent = String(learningCount);
      if (masteryReliable) masteryReliable.textContent = String(reliableCount);
      if (reviewMistakesButton) reviewMistakesButton.disabled = dueCount === 0;
    };

    const loadMistakes = () => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        savedMistakes = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(savedMistakes)) savedMistakes = [];
      } catch (error) {
        savedMistakes = [];
      }
    };

    const saveMistakes = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(savedMistakes.slice(0, 12)));
      } catch (error) {
        // Browser storage can be unavailable in private modes; the quiz still works without it.
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
      mistakesBox.innerHTML = savedMistakes
        .slice(0, 5)
        .map((item) => `<article><strong>${escapeHtml(item.category)}</strong><span>${escapeHtml(item.prompt)}</span></article>`)
        .join("");
    };

    const rememberMistake = (question) => {
      const prompt = questionPrompt(question);
      const category = question.dataset.category || "Review topic";
      savedMistakes = savedMistakes.filter((item) => item.prompt !== prompt);
      savedMistakes.unshift({ prompt, category, savedAt: Date.now() });
      saveMistakes();
      renderMistakes();
    };

    const resolveMistake = (question) => {
      const prompt = questionPrompt(question);
      const nextMistakes = savedMistakes.filter((item) => item.prompt !== prompt);
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
        });
      });
    };

    const setActiveSequence = (indexes, message = "") => {
      activeSequence = indexes;
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
      const missedCount = activeSequence.filter((index) => wrongAnswers.has(index)).length;
      const leftCount = Math.max(activeTotal - answeredCount, 0);
      const percent = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
      const complete = activeTotal > 0 && answeredCount === activeTotal;
      const halfwayReached = activeTotal > 1 && answeredCount >= Math.ceil(activeTotal / 2);
      const effectivePassScore = Math.min(passScore, Math.max(activeTotal - 1, 1));
      const resultText = !activeTotal
        ? "No questions selected"
        : complete
        ? `${correctCount} of ${activeTotal} correct · ${percent}%`
        : answeredCount
        ? `Score: ${correctCount} of ${answeredCount} answered · ${percent}% correct`
        : "Score: 0 of 0 answered";

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
          passed: correctCount >= effectivePassScore,
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

      const missed = Object.entries(missedCategories)
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category)
        .slice(0, 3);

      if (justCompleted && isDmvQuiz) {
        const pageName = window.location.pathname.split("/").pop() || "index.html";
        recordDmvSession({
          label: quizLabel,
          href: `${pageName}#practice`,
          total: activeTotal,
          correct: correctCount,
          missed: missedCount,
          weak: missed,
          state: quiz.dataset.state,
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
      } else if (complete && correctCount >= effectivePassScore) {
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
        const signMiss = missed.some((category) => /sign|warning|regulatory|turn|speed|road|railroad|school/i.test(category));
        if (!complete) {
          nextPlanTitle.textContent = answeredCount ? "Finish the current evidence" : "Create a real baseline";
          nextPlanCopy.textContent = answeredCount
            ? `${leftCount} questions remain. Finish before switching tools so the weak-area result is reliable.`
            : "Answer this round before choosing another tool. The next action will use your real misses.";
          nextPlanAction.href = "#practice";
          nextPlanAction.textContent = answeredCount ? "Continue this round" : "Start this round";
        } else if (missedCount && signMiss) {
          nextPlanTitle.textContent = `Review ${missed[0] || "missed signs"}`;
          nextPlanCopy.textContent = "Use visual flashcards once, then return to the saved-mistake filter instead of restarting a random test.";
          nextPlanAction.href = "dmv-road-sign-flashcards.html";
          nextPlanAction.textContent = "Open sign flashcards";
        } else if (missedCount) {
          nextPlanTitle.textContent = `Repair ${missed[0] || "the weak rule area"}`;
          nextPlanCopy.textContent = "Turn the missed category into a short state-aware plan before taking another full round.";
          nextPlanAction.href = state ? `dmv-permit-test-study-plan.html?state=${encodeURIComponent(state)}` : "dmv-permit-test-study-plan.html";
          nextPlanAction.textContent = "Build a focused plan";
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
        const pageName = window.location.pathname.split("/").pop() || "index.html";
        const selectedFocus = filterSelect?.value || "all";
        const activeTotal = activeSequence.length || questions.length;
        const answeredCount = activeSequence.filter((index) => answered.has(index)).length;
        const correctCount = activeSequence.filter((index) => correctAnswers.has(index)).length;
        const missedCount = activeSequence.filter((index) => wrongAnswers.has(index)).length;
        const hasFocus = selectedFocus && selectedFocus !== "all" && selectedFocus !== "saved";
        const href = hasFocus
          ? `${pageName}?focus=${encodeURIComponent(selectedFocus)}#practice`
          : `${pageName}#practice`;
        const label = hasFocus ? `${quizLabel} · ${selectedFocus}` : quizLabel;

        window.localStorage.setItem(recentPracticeKey, JSON.stringify({
          label,
          href,
          answered: answeredCount,
          total: activeTotal,
          correct: correctCount,
          missed: missedCount,
          updatedAt: Date.now(),
        }));
      } catch (error) {
        // Practice still works when browser storage is blocked.
      }
    };

    const resetQuiz = () => {
      answered.clear();
      correctAnswers.clear();
      wrongAnswers.clear();
      Object.keys(missedCategories).forEach((key) => delete missedCategories[key]);
      activePosition = 0;
      toolMessage = "";
      quizStartedTracked = false;
      quizHalfwayTracked = false;
      quizCompletedTracked = false;
      questions.forEach((question) => {
        question.querySelectorAll("button").forEach((button) => {
          button.disabled = false;
          button.classList.remove("is-correct", "is-wrong");
        });
        const feedback = question.querySelector(".feedback");
        if (feedback) feedback.textContent = "";
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
        ...(isDmvQuiz ? [["due", "Review due"]] : []),
        ["saved", "Saved mistakes"],
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
      if (value === "due" && isDmvQuiz) {
        const dueIndexes = dueQuestionIndexes();
        resetQuiz();
        setActiveSequence(
          dueIndexes,
          dueIndexes.length
            ? "Due questions loaded. Two correct rounds are required before a question becomes reliable."
            : "No questions are due in this mode. Continue with a focused round or return when the next review opens."
        );
        return;
      }
      if (value === "saved") {
        loadMistakes();
        const prompts = new Set(savedMistakes.map((item) => item.prompt));
        const savedIndexes = allQuestionIndexes().filter((index) => prompts.has(questionPrompt(questions[index])));
        resetQuiz();
        setActiveSequence(
          savedIndexes,
          savedIndexes.length
            ? "Saved mistakes loaded. Re-answer these questions, then clear the mistake bank when they feel easy."
            : "No saved mistakes for this mode yet. Answer questions first or switch back to all categories."
        );
        return;
      }
      const nextSequence = value === "all"
        ? allQuestionIndexes()
        : allQuestionIndexes().filter((index) => (questions[index].dataset.category || "Permit basics") === value);
      setActiveSequence(nextSequence);
    };

    const applyInitialFocus = () => {
      if (!filterSelect) return;
      let initialFocus = "";
      try {
        initialFocus = new URLSearchParams(window.location.search).get("focus") || "";
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
    };

    const renderTimer = () => {
      if (!timerLabel) return;
      if (timerComplete) {
        timerLabel.textContent = "Time is up. Finish the current question, then review.";
        return;
      }
      if (!timerId && timerRemaining === 10 * 60) {
        timerLabel.textContent = "Untimed practice";
        return;
      }
      const minutes = Math.floor(timerRemaining / 60);
      const seconds = String(timerRemaining % 60).padStart(2, "0");
      timerLabel.textContent = `${minutes}:${seconds} left in this round`;
    };

    const toggleTimer = () => {
      if (!timerButton) return;
      if (timerComplete) {
        timerComplete = false;
        timerRemaining = 10 * 60;
      }
      if (timerId) {
        window.clearInterval(timerId);
        timerId = 0;
        timerButton.textContent = "Resume timer";
        renderTimer();
        return;
      }
      timerButton.textContent = "Pause timer";
      timerId = window.setInterval(() => {
        timerRemaining = Math.max(timerRemaining - 1, 0);
        if (timerRemaining === 0) {
          window.clearInterval(timerId);
          timerId = 0;
          timerComplete = true;
          timerButton.textContent = "Restart timer";
        }
        renderTimer();
      }, 1000);
      renderTimer();
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
      });
    }

    if (forwardButton) {
      forwardButton.addEventListener("click", () => {
        if (activePosition < activeSequence.length - 1) {
          activePosition += 1;
          renderActiveQuestion();
          return;
        }
        const summary = quiz.querySelector(".quiz-summary");
        if (summary) summary.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", resetQuiz);
    }

    if (clearMistakesButton) {
      clearMistakesButton.addEventListener("click", () => {
        savedMistakes = [];
        saveMistakes();
        renderMistakes();
        if (filterSelect?.value === "saved") applyFocusFilter("saved");
      });
    }

    if (filterSelect) {
      filterSelect.addEventListener("change", () => applyFocusFilter(filterSelect.value));
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
          answered.add(index);
          toolMessage = "";

          const isCorrect = Number(button.dataset.choice) === Number(question.dataset.answer);
          button.classList.add(isCorrect ? "is-correct" : "is-wrong");
          if (isCorrect) {
            correctAnswers.add(index);
            resolveMistake(question);
          }
          if (!isCorrect) {
            wrongAnswers.add(index);
            const category = question.dataset.category || "this topic";
            missedCategories[category] = (missedCategories[category] || 0) + 1;
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

          const correctButton = question.querySelector(`[data-choice="${question.dataset.answer}"]`);
          if (correctButton) correctButton.classList.add("is-correct");
          question.querySelectorAll("button").forEach((item) => {
            item.disabled = true;
          });

          const feedback = question.querySelector(".feedback");
          feedback.textContent = `${isCorrect ? "Correct." : "Not quite."} ${question.dataset.explanation}`;
          renderScore();
          renderActiveQuestion();
          saveRecentPractice();
        });
      });
    });
    loadMistakes();
    populateFilterOptions();
    applyInitialFocus();
    renderMistakes();
    renderMasteryStats();
    renderTimer();
  });
}

function initModeTools() {
  document.querySelectorAll("[data-mode-tool]").forEach((tool) => {
    const buttons = Array.from(tool.querySelectorAll("[data-mode-button]"));
    const panels = Array.from(tool.querySelectorAll("[data-mode-panel]"));
    const activate = (mode) => {
      buttons.forEach((button) => {
        const active = button.dataset.modeButton === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        const active = panel.dataset.modePanel === mode;
        panel.classList.toggle("is-active", active);
        panel.setAttribute("aria-hidden", active ? "false" : "true");
      });
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

    let requestedMode = "";
    try {
      requestedMode = new URLSearchParams(window.location.search).get("mode") || "";
    } catch (error) {
      requestedMode = "";
    }
    if (requestedMode && buttons.some((button) => button.dataset.modeButton === requestedMode)) {
      activate(requestedMode);
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
      if (primary) primary.href = selected.dataset.practiceUrl || primary.href;
      if (secondary) secondary.href = selected.dataset.signUrl || secondary.href;
      if (checklist) checklist.href = selected.dataset.checklistUrl || checklist.href;
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
    const scoreLabel = drill.querySelector("[data-mini-drill-score]");
    const feedback = drill.querySelector("[data-mini-drill-feedback]");
    const nextButton = drill.querySelector("[data-mini-drill-next]");
    const focusLink = drill.querySelector("[data-mini-drill-focus-link]");
    const missedFocus = {};
    let activeIndex = 0;
    let correct = 0;
    let answered = 0;

    const bestMissedFocus = () =>
      Object.entries(missedFocus)
        .sort((a, b) => b[1] - a[1])
        .map(([focus]) => focus)[0] || "";

    const updateFocusLink = () => {
      if (!focusLink) return;
      const focus = bestMissedFocus();
      if (!focus) {
        focusLink.href = "road-signs-practice-test.html#practice";
        focusLink.textContent = "Full road signs test";
        return;
      }
      focusLink.href = `road-signs-practice-test.html?focus=${encodeURIComponent(focus)}#practice`;
      focusLink.textContent = `Practice ${focus.toLowerCase()}`;
    };

    const showQuestion = () => {
      questions.forEach((question, index) => {
        const active = index === activeIndex;
        question.classList.toggle("is-active", active);
        question.setAttribute("aria-hidden", active ? "false" : "true");
      });
      if (nextButton) {
        nextButton.textContent = activeIndex === questions.length - 1 ? "Review path" : "Next sign";
      }
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
            missedFocus[question.dataset.miniFocus] = (missedFocus[question.dataset.miniFocus] || 0) + 1;
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
            feedback.textContent = `${isCorrect ? "Correct." : "Not quite."} ${question.dataset.miniExplanation}`;
          }
          updateScore();
          updateFocusLink();
        });
      });
    });

    nextButton?.addEventListener("click", () => {
      if (activeIndex < questions.length - 1) {
        activeIndex += 1;
        showQuestion();
        return;
      }
      if (feedback) {
        feedback.textContent = answered
          ? `Mini diagnostic complete: ${correct} of ${questions.length}. Open the full practice test or pick a state below.`
          : "Answer the mini diagnostic first, then choose a full practice path.";
      }
    });

    updateScore();
    updateFocusLink();
    showQuestion();
  });
}

function initSignLookups() {
  document.querySelectorAll("[data-sign-lookup]").forEach((lookup) => {
    const search = lookup.querySelector("[data-sign-search]");
    const filterButtons = Array.from(lookup.querySelectorAll("[data-sign-filter]"));
    const cards = Array.from(lookup.querySelectorAll("[data-sign-card]"));
    const count = lookup.querySelector("[data-sign-count]");
    const empty = lookup.querySelector("[data-sign-empty]");
    const countLabel = lookup.dataset.signCountLabel || "sign";
    let activeFilter = "all";

    const render = () => {
      const term = (search?.value || "").trim().toLowerCase();
      let shown = 0;
      cards.forEach((card) => {
        const matchesFilter = activeFilter === "all" || card.dataset.signFilterKey === activeFilter;
        const matchesSearch = !term || (card.dataset.signQuery || "").includes(term);
        const visible = matchesFilter && matchesSearch;
        card.hidden = !visible;
        if (visible) shown += 1;
      });
      if (count) count.textContent = `${shown} ${countLabel}${shown === 1 ? "" : "s"} shown`;
      if (empty) empty.hidden = shown !== 0;
      filterButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.signFilter === activeFilter);
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
    const filterSelect = deck.querySelector("[data-flashcard-filter]");
    const searchInput = deck.querySelector("[data-flashcard-search]");
    const resetButton = deck.querySelector("[data-flashcard-reset]");
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
    const storageKey = "tdt-road-sign-flashcards";
    let known = new Set();
    let review = new Set();
    let activeIndexes = cards.map((_, index) => index);
    let activePosition = 0;

    const load = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
        known = new Set(Array.isArray(saved?.known) ? saved.known : []);
        review = new Set(Array.isArray(saved?.review) ? saved.review : []);
      } catch (error) {
        known = new Set();
        review = new Set();
      }
    };

    const save = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({
          known: Array.from(known),
          review: Array.from(review),
          updatedAt: Date.now(),
        }));
      } catch (error) {
        // Flashcards remain usable when browser storage is unavailable.
      }
    };

    const cardId = (card) => card?.dataset.cardId || "";
    const activeCard = () => cards[activeIndexes[activePosition]];

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
      if (visibleCount) visibleCount.textContent = String(total);
      if (empty) empty.hidden = total !== 0;
      if (prevButton) prevButton.disabled = activePosition === 0 || total === 0;
      if (nextButton) nextButton.disabled = activePosition >= total - 1 || total === 0;
      if (knownButton) knownButton.disabled = !current;
      if (reviewButton) reviewButton.disabled = !current;
      if (current && message) {
        const id = cardId(current);
        if (known.has(id)) {
          message.textContent = "Marked as known. Move to the next card or open the matching quiz.";
        } else if (review.has(id)) {
          message.textContent = "Saved for review. Retake this sign family after the deck.";
        }
      }
    };

    const applyFilters = () => {
      const filter = filterSelect?.value || "all";
      const term = (searchInput?.value || "").trim().toLowerCase();
      activeIndexes = cards
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => {
          const matchesFilter = filter === "all" || card.dataset.cardFilter === filter;
          const matchesSearch = !term || (card.dataset.cardQuery || "").includes(term);
          return matchesFilter && matchesSearch;
        })
        .map(({ index }) => index);
      activePosition = 0;
      cards.forEach((card) => card.classList.remove("is-flipped"));
      if (message) {
        message.textContent = activeIndexes.length
          ? "Flip the card, then mark Know or Review again."
          : "No cards match this filter yet.";
      }
      render();
    };

    cards.forEach((card) => {
      card.querySelector("[data-flashcard-flip]")?.addEventListener("click", () => {
        card.classList.toggle("is-flipped");
      });
    });

    const markActive = (status) => {
      const current = activeCard();
      if (!current) return;
      const id = cardId(current);
      if (status === "known") {
        known.add(id);
        review.delete(id);
      } else {
        review.add(id);
        known.delete(id);
      }
      save();
      render();
      trackToolEvent("flashcard_mark", {
        tool: "road_sign_flashcards",
        status,
        filter: filterSelect?.value || "all",
        visible_cards: activeIndexes.length,
      });
    };

    knownButton?.addEventListener("click", () => markActive("known"));
    reviewButton?.addEventListener("click", () => markActive("review"));
    prevButton?.addEventListener("click", () => {
      activePosition = Math.max(activePosition - 1, 0);
      render();
    });
    nextButton?.addEventListener("click", () => {
      activePosition = Math.min(activePosition + 1, Math.max(activeIndexes.length - 1, 0));
      render();
    });
    resetButton?.addEventListener("click", () => {
      known = new Set();
      review = new Set();
      save();
      cards.forEach((card) => card.classList.remove("is-flipped"));
      if (message) message.textContent = "Deck reset. Start again with the visible cards.";
      render();
    });
    filterSelect?.addEventListener("change", applyFilters);
    searchInput?.addEventListener("input", applyFilters);

    load();
    applyFilters();
  });
}

function initRecentPracticeCards() {
  document.querySelectorAll("[data-recent-practice]").forEach((card) => {
    const title = card.querySelector("[data-recent-practice-title]");
    const meta = card.querySelector("[data-recent-practice-meta]");
    const link = card.querySelector("[data-recent-practice-link]");
    let progress = null;

    try {
      progress = JSON.parse(window.localStorage.getItem("tdt-recent-practice") || "null");
    } catch (error) {
      progress = null;
    }

    if (!progress || !progress.href) return;

    const answered = Number(progress.answered) || 0;
    const total = Number(progress.total) || 0;
    const correct = Number(progress.correct) || 0;
    const missed = Number(progress.missed) || 0;

    if (title) title.textContent = progress.label || "Recent practice";
    if (meta) {
      meta.textContent = total
        ? `${answered} of ${total} answered · ${correct} correct · ${missed} missed`
        : `${correct} correct · ${missed} missed`;
    }
    if (link) {
      link.href = progress.href;
      link.textContent = answered ? "Continue practice" : "Start practice";
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
      const today = journey.days[localDayStamp()] || { answered: 0, correct: 0, sessions: 0 };
      const answeredToday = Number(today.answered) || 0;
      const correctToday = Number(today.correct) || 0;
      const missedToday = Math.max(answeredToday - correctToday, 0);
      const accuracyToday = answeredToday ? Math.round((correctToday / answeredToday) * 100) : 0;
      const stateSessions = journey.sessions.filter((session) => !session.state || session.state === state);
      const recent = stateSessions[0] || null;
      const mastery = getDmvMasterySummary(state);
      const baselineCount = Math.min(mastery.attempted, 10);
      const twoWeeksAgo = Date.now() - 14 * 86400000;
      const passes = stateSessions.filter(
        (session) => Number(session.completedAt) >= twoWeeksAgo && Number(session.total) >= 10 && Number(session.percent) >= 80,
      ).length;
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

      setStep("warmup", baselineCount >= 10 ? "Complete" : `${baselineCount} of 10`, baselineCount >= 10, baselineCount < 10);
      if (mastery.due) {
        setStep("review", `${mastery.due} due`, false, baselineCount >= 10);
      } else if (baselineCount >= 10) {
        setStep("review", "Queue clear", true, false);
      } else if (weak) {
        setStep("review", `Review ${weak}`, false, false);
      } else {
        setStep("review", "Waiting", false, false);
      }
      setStep("passes", `${Math.min(passes, 2)} of 2`, passes >= 2, baselineCount >= 10 && passes < 2 && !mastery.due);
      setStep("ready", `${readyCount} of 12`, readyCount >= 12, passes >= 2 && readyCount < 12);

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
        title.textContent = `Repair ${mastery.due} due ${mastery.due === 1 ? "question" : "questions"}`;
        copy.textContent = "Return to the exact questions that still need evidence. Two correct rounds are required before they count as reliable.";
        primary.href = mastery.dueItem.href || option.dataset.practiceUrl || "dmv-practice.html";
        primary.textContent = "Start due review";
      } else if (!mastery.attempted) {
        kicker.textContent = `Start ${stateLabel} prep today`;
        title.textContent = "Take the 10-question road-sign diagnostic";
        copy.textContent = "A short first round creates a baseline and reveals which sign family or rule deserves the next ten minutes.";
        primary.href = "road-signs-practice-test.html#practice";
        primary.textContent = "Start 10 questions";
      } else if (mastery.attempted < 10) {
        kicker.textContent = "Finish the baseline";
        title.textContent = `${10 - mastery.attempted} different questions left before switching tools`;
        copy.textContent = "Attempt different questions so the weak-area recommendation cannot be inflated by repeating one familiar item.";
        primary.href = recent?.href || option.dataset.practiceUrl || "road-signs-practice-test.html#practice";
        primary.textContent = "Continue practice";
      } else if (missedToday && weak) {
        kicker.textContent = "Best next study block";
        title.textContent = `Repair ${weak}`;
        copy.textContent = `Use the ${stateLabel} practice path and official source to fix the rule, then retake a focused round.`;
        primary.href = option.dataset.practiceUrl || "dmv-practice.html";
        primary.textContent = `Review ${stateLabel} rules`;
      } else if (passes < 2) {
        kicker.textContent = "Confirm the result";
        title.textContent = "Pass one more focused round";
        copy.textContent = "Two recent 80%+ rounds are a better readiness signal than one clean attempt.";
        primary.href = option.dataset.practiceUrl || "dmv-practice.html";
        primary.textContent = `Take ${stateLabel} practice`;
      } else if (readyCount < 12) {
        kicker.textContent = "Move from score to test day";
        title.textContent = `Finish the ${stateLabel} readiness checklist`;
        copy.textContent = "Your practice evidence is strong enough to shift attention to official rules, documents, appointment details, and arrival logistics.";
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
    const dayNumber = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
    let offset = 0;

    const resetCard = (card) => {
      card.dataset.answered = "false";
      card.querySelectorAll("[data-daily-choice]").forEach((button) => {
        button.disabled = false;
        button.classList.remove("is-correct", "is-wrong");
      });
      const feedback = card.querySelector("[data-daily-feedback]");
      const explanation = card.querySelector("[data-daily-explanation]");
      if (feedback) feedback.textContent = "";
      if (explanation) explanation.hidden = true;
    };

    const visibleCards = () => {
      const selectedState = stateSelect?.value || "all";
      if (selectedState === "all") return cards;
      const stateCards = cards.filter((card) => card.dataset.state === selectedState);
      return stateCards.length ? stateCards : cards.filter((card) => card.dataset.state === "all");
    };

    const render = () => {
      const matches = visibleCards();
      if (!matches.length) return;
      const active = matches[(dayNumber + offset) % matches.length];
      cards.forEach((card) => {
        const isActive = card === active;
        card.hidden = !isActive;
        card.classList.toggle("is-active", isActive);
        card.setAttribute("aria-hidden", isActive ? "false" : "true");
        if (isActive) resetCard(card);
      });

      const stateName = active.dataset.stateLabel || stateSelect?.selectedOptions?.[0]?.textContent?.trim() || "DMV";
      const category = active.dataset.category || "Permit basics";
      if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (title) title.textContent = `${stateName}: ${category}`;
      if (note) note.textContent = "Answer first, then use the explanation to choose the next practice path.";
    };

    cards.forEach((card) => {
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
          if (feedback) {
            feedback.textContent = correct
              ? "Correct. Open the full practice path if you want a longer round."
              : "Not quite. Review the explanation, then practice this topic.";
          }
        });
      });
    });

    stateSelect?.addEventListener("change", () => {
      offset = 0;
      render();
    });
    nextButton?.addEventListener("click", () => {
      offset += 1;
      render();
    });
    render();
  });
}

function initDmvMistakeLogs() {
  document.querySelectorAll("[data-dmv-mistake-log]").forEach((tool) => {
    const form = tool.querySelector("[data-mistake-form]");
    const stateSelect = tool.querySelector("[data-mistake-state]");
    const topicSelect = tool.querySelector("[data-mistake-topic]");
    const promptInput = tool.querySelector("[data-mistake-prompt]");
    const fixInput = tool.querySelector("[data-mistake-fix]");
    const list = tool.querySelector("[data-mistake-list]");
    const total = tool.querySelector("[data-mistake-total]");
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
    const storageKey = "tdt-dmv-mistake-log";
    let entries = [];

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
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
        entries = Array.isArray(saved) ? saved : [];
      } catch (error) {
        entries = [];
      }
    };

    const save = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 30)));
      } catch (error) {
        // The log is a convenience layer; the page still works when storage is unavailable.
      }
    };

    const resolvePracticeHref = (entry) => {
      if (
        entry.topic === "road-signs" ||
        entry.topic === "regulatory-signs" ||
        entry.topic === "wrong-way-entry" ||
        entry.topic === "one-way-lane-direction" ||
        entry.topic === "school-pedestrian-crossing" ||
        entry.topic === "speed-advisory-speed"
      ) {
        return entry.signsUrl;
      }
      if (entry.topic === "documents" || entry.topic === "documents-appointment") return entry.checklistUrl;
      if (entry.topic === "course-exam-permit") {
        return entry.state === "florida" ? "florida-class-e-knowledge-exam-tlsae.html" : entry.checklistUrl;
      }
      if (entry.topic === "score") return "dmv-permit-test-passing-score-calculator.html";
      return entry.practiceUrl;
    };

    const safeRelativeHref = (href) => {
      const value = String(href || "").trim();
      return value && !value.includes(":") ? value : "dmv-practice.html";
    };

    const renderLinks = () => {
      const option = selectedState();
      if (!option) return;
      if (stateLabel) stateLabel.textContent = option.dataset.stateLabel || option.textContent.trim();
      if (rule) rule.textContent = option.dataset.rule || "Confirm with official source.";
      if (source) source.href = option.dataset.sourceUrl || "#";
      if (practice) practice.href = option.dataset.practiceUrl || "dmv-practice.html";
      if (signs) signs.href = option.dataset.signsUrl || "road-signs-practice-test.html";
      if (plan) plan.href = "dmv-permit-test-study-plan.html";
      if (checklist) checklist.href = option.dataset.checklistUrl || "dmv-test-day-checklist.html";
    };

    const render = () => {
      renderLinks();
      if (total) total.textContent = String(entries.length);
      const counts = entries.reduce((acc, entry) => {
        acc[entry.topicLabel] = (acc[entry.topicLabel] || 0) + 1;
        return acc;
      }, {});
      const strongest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (topTopic) topTopic.textContent = strongest ? strongest[0] : "None yet";
      if (next) {
        next.textContent = strongest
          ? `Review ${strongest[0]} before the next full practice round.`
          : "Save a mistake to get a next action.";
      }

      if (!list) return;
      if (!entries.length) {
        list.innerHTML = "<p>No saved mistakes yet. Add one missed question or weak topic above.</p>";
        return;
      }

      list.innerHTML = entries
        .map((entry, index) => {
          const href = safeRelativeHref(resolvePracticeHref(entry));
          return `<article>
            <div>
              <span>${escapeHtml(entry.stateLabel || "Selected state")} · ${escapeHtml(entry.topicLabel || "Review topic")}</span>
              <strong>${escapeHtml(entry.prompt)}</strong>
              <p>${escapeHtml(entry.fix || "Add the correct rule before your next review round.")}</p>
            </div>
            <div class="mistake-log-entry-actions">
              <a href="${escapeHtml(href)}">Practice</a>
              <button type="button" data-mistake-remove="${index}">Remove</button>
            </div>
          </article>`;
        })
        .join("");

      list.querySelectorAll("[data-mistake-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          entries.splice(Number(button.dataset.mistakeRemove), 1);
          save();
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

    stateSelect?.addEventListener("change", render);
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
    const dailyQuestions = planner.querySelector("[data-study-daily-questions]");
    const signMinutes = planner.querySelector("[data-study-sign-minutes]");
    const checkpoint = planner.querySelector("[data-study-checkpoint]");
    const source = planner.querySelector("[data-study-source]");
    const practice = planner.querySelector("[data-study-practice]");
    const signs = planner.querySelector("[data-study-signs]");
    const checklist = planner.querySelector("[data-study-checklist]");
    const score = planner.querySelector("[data-study-score]");
    const planList = planner.querySelector("[data-study-plan-list]");

    const weakLabels = {
      "mixed": "mixed readiness",
      "road-signs": "road-sign recognition",
      "rules": "rules and right-of-way",
      "score": "passing-score confidence",
      "documents": "documents and logistics",
    };

    const linkMap = {
      source,
      practice,
      signs,
      checklist,
      score,
    };

    const setLink = (element, href) => {
      if (element && href) element.href = href;
    };

    const appendStep = (steps, title, body, href, cta) => {
      steps.push({ title, body, href, cta });
    };

    const buildSteps = (stateName, days, weak, selected, perDay) => {
      const steps = [];
      appendStep(
        steps,
        "Start with the official source",
        `Confirm ${stateName} format, passing rule, documents, fees, and retake rules before trusting any practice shortcut.`,
        selected.dataset.sourceUrl,
        "Open source",
      );
      appendStep(
        steps,
        "Run one diagnostic round",
        `Answer about ${perDay} questions without pausing for notes. Save missed topics as the plan focus.`,
        selected.dataset.practiceUrl,
        "Practice",
      );

      if (weak === "road-signs") {
        appendStep(
          steps,
          "Make sign recognition automatic",
          "Use flashcards first, then answer image sign questions until stop, yield, warning, school, service, and work-zone signs feel quick.",
          selected.dataset.signsUrl,
          "Road signs",
        );
      } else if (weak === "rules") {
        appendStep(
          steps,
          "Review rules through missed questions",
          "Focus on right-of-way, speed, turning, lane use, parking, safe following distance, and alcohol or drug rules from your missed answers.",
          selected.dataset.practiceUrl,
          "Retake practice",
        );
      } else if (weak === "score") {
        appendStep(
          steps,
          "Check the score margin",
          "Use the passing-score calculator after each round. If the result is barely above target, retake only the weakest category before another full round.",
          selected.dataset.scoreUrl,
          "Score check",
        );
      } else if (weak === "documents") {
        appendStep(
          steps,
          "Remove test-day blockers",
          "Build the document pack early. A prepared applicant can still lose the visit to missing ID, residency proof, appointment rules, or payment details.",
          selected.dataset.checklistUrl,
          "Checklist",
        );
      } else {
        appendStep(
          steps,
          "Split review between signs and rules",
          "Spend one block on visual road signs and one block on missed rule categories. Do not keep rereading topics you already answer quickly.",
          "dmv-road-sign-flashcards.html",
          "Flashcards",
        );
      }

      if (days <= 3) {
        appendStep(
          steps,
          "Final 24-hour pass",
          "Take one focused review round, recheck the official source, then finish documents, appointment, fees, and arrival timing.",
          selected.dataset.checklistUrl,
          "Final checklist",
        );
      } else if (days <= 7) {
        appendStep(
          steps,
          "Midweek checkpoint",
          "By the middle of the plan, your practice score should be above the passing target with fewer slow sign-recognition answers.",
          selected.dataset.scoreUrl,
          "Check score",
        );
        appendStep(
          steps,
          "Final two-day review",
          "Retake missed categories, drill signs once more, then switch from studying to logistics so test day is not rushed.",
          selected.dataset.checklistUrl,
          "Checklist",
        );
      } else {
        appendStep(
          steps,
          "Weekly checkpoint",
          "At the end of each week, compare your score margin, missed categories, and slow sign cards before choosing the next practice block.",
          selected.dataset.scoreUrl,
          "Score check",
        );
        appendStep(
          steps,
          "Last-week conversion",
          "Move from broad reading to timed practice, sign recognition, and checklist readiness. Long plans still need a tight final week.",
          selected.dataset.checklistUrl,
          "Checklist",
        );
      }

      return steps;
    };

    const render = () => {
      const selected = stateSelect?.selectedOptions?.[0];
      if (!selected || !planList) return;
      const days = Math.max(Number(daysSelect?.value) || 7, 1);
      const weak = weakSelect?.value || "mixed";
      const stateName = selected.dataset.state || selected.textContent.trim();
      const questions = Math.max(Number(selected.dataset.questions) || 40, 18);
      const perDay = Math.max(10, Math.ceil((questions * (days <= 3 ? 2.2 : 2)) / days));
      const signTime = weak === "road-signs" ? 20 : days <= 3 ? 18 : 12;

      if (agency) agency.textContent = selected.dataset.agency || "State agency";
      if (rule) rule.textContent = selected.dataset.rule || "Confirm with official source";
      if (dailyQuestions) dailyQuestions.textContent = `${perDay} questions/day`;
      if (signMinutes) signMinutes.textContent = `${signTime} minutes/day`;
      if (checkpoint) {
        checkpoint.textContent = days <= 3 ? "Official source today" : days <= 7 ? "Midweek score check" : "Weekly checkpoint";
      }

      setLink(source, selected.dataset.sourceUrl);
      setLink(practice, selected.dataset.practiceUrl);
      setLink(signs, selected.dataset.signsUrl);
      setLink(checklist, selected.dataset.checklistUrl);
      setLink(score, selected.dataset.scoreUrl);

      const steps = buildSteps(stateName, days, weak, selected, perDay);
      planList.replaceChildren();
      steps.forEach((step, index) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        const body = document.createElement("span");
        title.textContent = `${index + 1}. ${step.title}`;
        body.textContent = step.body;
        item.append(title, body);
        if (step.href && step.cta) {
          const link = document.createElement("a");
          link.href = step.href;
          link.textContent = step.cta;
          item.append(link);
        }
        planList.append(item);
      });

      planner.dataset.currentFocus = weakLabels[weak] || weakLabels.mixed;
    };

    try {
      const requestedState = normalizeDmvState(new URLSearchParams(window.location.search).get("state"));
      const savedState = requestedState || readDmvJourney().state;
      const stateOption = Array.from(stateSelect?.options || []).find(
        (option) => normalizeDmvState(option.value || option.dataset.state || option.textContent) === savedState,
      );
      if (stateOption) stateSelect.value = stateOption.value;
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
      if (target) target.textContent = option.dataset.practiceTarget || "32 of 40 on mock exam";
      if (documents) documents.textContent = option.dataset.documents || "Confirm accepted documents with the official source.";
      if (source) {
        source.href = option.dataset.sourceUrl || "#";
        source.textContent = option.dataset.sourceLabel || "Official source";
      }
      if (practice) practice.href = option.dataset.practiceUrl || practice.href;
      if (signs) signs.href = option.dataset.signUrl || signs.href;
      if (checklist) checklist.href = option.dataset.checklistUrl || checklist.href;
    };

    setStateFromQuery();
    stateSelect?.addEventListener("change", render);
    render();
  });
}

function initDmvScoreCalculators() {
  document.querySelectorAll("[data-dmv-score-calculator]").forEach((widget) => {
    const stateSelect = widget.querySelector("[data-score-state]");
    const agency = widget.querySelector("[data-score-agency]");
    const rule = widget.querySelector("[data-score-rule]");
    const note = widget.querySelector("[data-score-note]");
    const source = widget.querySelector("[data-score-source]");
    const practice = widget.querySelector("[data-score-practice]");
    const checklist = widget.querySelector("[data-score-checklist]");
    const questions = widget.querySelector("[data-score-questions]");
    const correctNeeded = widget.querySelector("[data-score-correct]");
    const miss = widget.querySelector("[data-score-miss]");
    const correctInput = widget.querySelector("[data-score-input-correct]");
    const totalInput = widget.querySelector("[data-score-input-total]");
    const useOfficial = widget.querySelector("[data-score-use-official]");
    const percent = widget.querySelector("[data-score-percent]");
    const status = widget.querySelector("[data-score-status]");
    const message = widget.querySelector("[data-score-message]");

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
      if (requiredPercent) return Math.ceil((total * requiredPercent) / 100);
      if (officialCorrect) return officialCorrect;
      return total;
    };

    const renderScore = () => {
      const option = currentOption();
      if (!option) return;
      const total = Math.max(1, Math.min(100, Number(totalInput?.value) || 1));
      const correct = Math.max(0, Math.min(total, Number(correctInput?.value) || 0));
      if (correctInput && Number(correctInput.value) !== correct) correctInput.value = String(correct);
      if (totalInput && Number(totalInput.value) !== total) totalInput.value = String(total);

      const needed = thresholdFor(option, total);
      const pct = Math.round((correct / total) * 100);
      const gap = Math.max(0, needed - correct);
      if (percent) percent.textContent = `${pct}%`;
      if (status) status.textContent = gap ? `${gap} more correct answer${gap === 1 ? "" : "s"} needed` : "Above the selected state target";
      if (message) {
        const stateName = option.dataset.state || option.textContent.trim();
        const ruleText = option.dataset.rule || "the official passing rule";
        if (gap) {
          message.textContent = `${stateName} target: ${ruleText}. For a ${total}-question practice round, aim for at least ${needed} correct.`;
        } else {
          const cushion = correct - needed;
          message.textContent = `${stateName} target met for this practice length. Cushion: ${cushion} question${cushion === 1 ? "" : "s"} above the target.`;
        }
      }
    };

    const renderState = () => {
      const option = currentOption();
      if (!option) return;
      const officialQuestions = option.dataset.questions || "";
      const officialCorrect = option.dataset.correct || "";
      if (agency) agency.textContent = option.dataset.agency || "State agency";
      if (rule) rule.textContent = option.dataset.rule || "Confirm with official source";
      if (note) note.textContent = option.dataset.note || "Use the official source for the final passing rule.";
      if (questions) questions.textContent = officialQuestions || "Use source";
      if (correctNeeded) correctNeeded.textContent = officialCorrect || (option.dataset.rule || "Use source");
      if (miss) miss.textContent = option.dataset.miss || "Confirm with official source";
      if (source) {
        source.href = option.dataset.sourceUrl || "#";
        source.textContent = option.dataset.sourceLabel || "Official source";
      }
      if (practice) practice.href = option.dataset.practiceUrl || practice.href;
      if (checklist) checklist.href = option.dataset.checklistUrl || checklist.href;
      const targetTotal = Number(officialQuestions) || 40;
      const targetCorrect = Number(officialCorrect) || thresholdFor(option, targetTotal);
      if (totalInput) totalInput.value = String(targetTotal);
      if (correctInput) correctInput.value = String(targetCorrect);
      renderScore();
    };

    stateSelect?.addEventListener("change", renderState);
    correctInput?.addEventListener("input", renderScore);
    totalInput?.addEventListener("input", renderScore);
    useOfficial?.addEventListener("click", () => {
      const option = currentOption();
      const officialQuestions = Number(option?.dataset.questions) || 0;
      const officialCorrect = Number(option?.dataset.correct) || 0;
      if (officialQuestions && totalInput) totalInput.value = String(officialQuestions);
      if (officialCorrect && correctInput) correctInput.value = String(officialCorrect);
      renderScore();
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
    const score = widget.querySelector("[data-dmv-ready-score]");
    const message = widget.querySelector("[data-dmv-ready-message]");
    const nextStep = widget.querySelector("[data-dmv-next-step]");
    const resetButton = widget.querySelector("[data-dmv-checklist-reset]");
    const copyButton = widget.querySelector("[data-dmv-copy-checklist]");
    const printButton = widget.querySelector("[data-dmv-print-checklist]");
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
      const sourceLabel = option?.dataset.manualLabel || "official source";
      const typeLabel = typeOption?.textContent?.trim() || "selected path";
      const typeDetail = typeOption?.dataset.packDetail || "Confirm the exact accepted documents with the official source.";

      if (packAgency) packAgency.textContent = agency;
      if (packTitle) packTitle.textContent = `${stateName} ${typeLabel}`;
      if (packSummary) {
        packSummary.textContent = `${visible.length} document checks for this path. ${typeDetail}`;
      }
      if (packOfficial) {
        packOfficial.href = option?.dataset.manualUrl || "#";
        packOfficial.textContent = `Open ${sourceLabel}`;
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
      if (permitLink) permitLink.href = option.dataset.permitUrl || permitLink.href;
      if (signLink) signLink.href = option.dataset.signUrl || signLink.href;
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
        `Official source: ${manualLink?.href || option?.dataset.manualUrl || ""}`,
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
      window.print();
    });
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
        `Official source: ${packOfficial?.href || option?.dataset.manualUrl || ""}`,
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

function initSatScoreEstimators() {
  document.querySelectorAll("[data-sat-estimator]").forEach((widget) => {
    const rwInput = widget.querySelector("[data-sat-rw]");
    const mathInput = widget.querySelector("[data-sat-math]");
    const targetInput = widget.querySelector("[data-sat-target]");
    const totalBand = widget.querySelector("[data-sat-total-band]");
    const rwBand = widget.querySelector("[data-sat-rw-band]");
    const mathBand = widget.querySelector("[data-sat-math-band]");
    const gap = widget.querySelector("[data-sat-gap]");
    const nextStep = widget.querySelector("[data-sat-next-step]");
    const button = widget.querySelector("[data-sat-estimate-button]");

    const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);
    const roundTen = (value) => Math.round(value / 10) * 10;
    const sectionBand = (correct, total) => {
      const percent = clamp(correct, 0, total) / total;
      const center = 200 + (percent * 600);
      const uncertainty = percent > 0.84 || percent < 0.25 ? 40 : 30;
      return {
        low: clamp(roundTen(center - uncertainty), 200, 800),
        high: clamp(roundTen(center + uncertainty), 200, 800),
        center: clamp(roundTen(center), 200, 800),
      };
    };
    const formatBand = (band) => `${band.low}-${band.high}`;

    const render = () => {
      const rw = sectionBand(clamp(rwInput?.value, 0, 54), 54);
      const math = sectionBand(clamp(mathInput?.value, 0, 44), 44);
      const totalLow = rw.low + math.low;
      const totalHigh = rw.high + math.high;
      const target = clamp(targetInput?.value, 400, 1600);
      const estimatedCenter = rw.center + math.center;
      const targetGap = Math.max(target - estimatedCenter, 0);

      if (totalBand) totalBand.textContent = `${totalLow}-${totalHigh}`;
      if (rwBand) rwBand.textContent = formatBand(rw);
      if (mathBand) mathBand.textContent = formatBand(math);
      if (gap) gap.textContent = targetGap ? `${targetGap}+ points` : "On pace";
      if (nextStep) {
        if (!targetGap) {
          nextStep.textContent = "Your practice inputs are near or above the target range. Protect timing, accuracy, and test-day logistics.";
        } else if (targetGap <= 80) {
          nextStep.textContent = "Close gap. Focus on the weaker section and review every missed practice question before adding new drills.";
        } else {
          nextStep.textContent = "Large gap. Use a longer runway, official practice tests, and section-specific review before choosing a test date.";
        }
      }
    };

    [rwInput, mathInput, targetInput].forEach((input) => input?.addEventListener("input", render));
    button?.addEventListener("click", render);
    render();
  });
}

function initSatGoalPlanners() {
  document.querySelectorAll("[data-sat-goal-planner]").forEach((widget) => {
    const currentInput = widget.querySelector("[data-goal-current]");
    const targetInput = widget.querySelector("[data-goal-target]");
    const weeksInput = widget.querySelector("[data-goal-weeks]");
    const hoursInput = widget.querySelector("[data-goal-hours]");
    const headline = widget.querySelector("[data-goal-headline]");
    const gap = widget.querySelector("[data-goal-gap]");
    const weekly = widget.querySelector("[data-goal-weekly]");
    const totalHours = widget.querySelector("[data-goal-total-hours]");
    const nextStep = widget.querySelector("[data-goal-next-step]");
    const button = widget.querySelector("[data-goal-button]");
    const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);

    const render = () => {
      const current = clamp(currentInput?.value, 400, 1600);
      const target = clamp(targetInput?.value, 400, 1600);
      const weeks = clamp(weeksInput?.value, 1, 24);
      const hours = clamp(hoursInput?.value, 1, 30);
      const scoreGap = Math.max(target - current, 0);
      const perWeek = Math.ceil(scoreGap / weeks / 10) * 10;
      const total = weeks * hours;

      if (headline) {
        headline.textContent = scoreGap ? `${scoreGap} points over ${weeks} weeks` : "Target already reached";
      }
      if (gap) gap.textContent = scoreGap ? `${scoreGap} points` : "0 points";
      if (weekly) weekly.textContent = scoreGap ? `${perWeek} points` : "Maintain";
      if (totalHours) totalHours.textContent = `${total} hours`;
      if (nextStep) {
        if (!scoreGap) {
          nextStep.textContent = "Use practice to maintain accuracy and avoid test-day logistics mistakes.";
        } else if (perWeek <= 20 && hours >= 4) {
          nextStep.textContent = "Reasonable sprint. Keep a weekly review loop and retest under timing.";
        } else if (perWeek <= 40) {
          nextStep.textContent = "Aggressive but possible for some students. Narrow the plan to the section with the clearest missed-question pattern.";
        } else {
          nextStep.textContent = "High-pressure target. Consider a later test date, a smaller target, or more weekly practice time.";
        }
      }
    };

    [currentInput, targetInput, weeksInput, hoursInput].forEach((input) => input?.addEventListener("input", render));
    button?.addEventListener("click", render);
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
    const buildButton = widget.querySelector("[data-sat-plan-button]");
    const headline = widget.querySelector("[data-sat-plan-headline]");
    const reason = widget.querySelector("[data-sat-plan-reason]");
    const picks = widget.querySelector("[data-sat-plan-picks]");
    const primaryDate = widget.querySelector("[data-sat-primary-date]");
    const primaryDeadline = widget.querySelector("[data-sat-primary-deadline]");
    const backupDate = widget.querySelector("[data-sat-backup-date]");
    const backupDeadline = widget.querySelector("[data-sat-backup-deadline]");
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

    const dateAtNoon = (value) => new Date(`${value}T12:00:00`);
    const dateLabel = (value) => dateAtNoon(value).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = (value) => Math.ceil((dateAtNoon(value).getTime() - today.getTime()) / DAY_MS);
    const monthKey = (event) => `${event.date.slice(0, 4)}-${event.date.slice(5, 7)}`;
    const readinessDays = { ready: 14, focused: 42, starting: 70 };
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
    const registrationText = (event) => {
      const regularPassed = dateAtNoon(event.registrationDate) < today;
      if (regularPassed) return `Regular deadline passed; late deadline ${dateLabel(event.lateDate)}`;
      return `Register by ${dateLabel(event.registrationDate)}; late deadline ${dateLabel(event.lateDate)}`;
    };
    const stageReason = (stage, deadline) => {
      if (stage === "junior_first") return "Spring gives a first-time junior room to review the score and test again.";
      if (stage === "junior_retake") return "This spring date leaves a later administration available if another retake is useful.";
      if (deadline === "early") return "This fall date preserves more room before early application deadlines.";
      if (deadline === "regular") return "This date fits a regular-decision timeline while keeping registration visible.";
      return "This is the earliest listed date that fits the preparation runway you selected.";
    };

    const buildPlan = ({ track = true } = {}) => {
      const stage = stageSelect?.value || "other";
      const deadline = deadlineSelect?.value || "unsure";
      const readiness = readinessSelect?.value || "focused";
      const wantsRetake = Boolean(retakeInput?.checked);
      const minimumDays = readinessDays[readiness] || readinessDays.focused;
      const valid = events
        .filter((event) => dateAtNoon(event.lateDate) >= today && daysUntil(event.date) >= minimumDays)
        .sort((a, b) => a.date.localeCompare(b.date));
      const priorities = preferredKeys(stage, deadline);
      const preferred = priorities
        .map((key) => valid.find((event) => monthKey(event) === key))
        .filter(Boolean);
      const primary = preferred[0] || valid[0] || null;
      const backup = wantsRetake && primary
        ? valid.find((event) => event.date > primary.date) || null
        : null;

      if (!primary) {
        currentPlan = null;
        if (headline) headline.textContent = "No listed date fits that runway";
        if (reason) reason.textContent = "Shorten the preparation runway or check College Board for a later testing year.";
        if (picks) picks.hidden = true;
        if (saveButton) saveButton.disabled = true;
        if (calendarButton) calendarButton.disabled = true;
        return;
      }

      currentPlan = { stage, deadline, readiness, wantsRetake, primary, backup, createdAt: Date.now() };
      if (headline) headline.textContent = `${primary.label} is the strongest fit`;
      if (reason) {
        reason.textContent = `${stageReason(stage, deadline)} It is ${daysUntil(primary.date)} days away, matching the ${minimumDays}+ day runway you chose.`;
      }
      if (primaryDate) primaryDate.textContent = primary.label;
      if (primaryDeadline) primaryDeadline.textContent = registrationText(primary);
      if (backupDate) backupDate.textContent = backup?.label || (wantsRetake ? "No later listed date" : "Not requested");
      if (backupDeadline) {
        backupDeadline.textContent = backup ? registrationText(backup) : "You can rebuild the plan whenever your timeline changes.";
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

    buildButton?.addEventListener("click", () => buildPlan());
    saveButton?.addEventListener("click", () => {
      if (!currentPlan) return;
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
      if (!currentPlan) return;
      const event = currentPlan.primary;
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      const nextDay = new Date(dateAtNoon(event.date).getTime() + DAY_MS).toISOString().slice(0, 10).replace(/-/g, "");
      const startDay = event.date.replace(/-/g, "");
      const escapeIcs = (value) => String(value).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TestDayTools//SAT Date Planner//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:sat-${event.date}@testdaytools.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${startDay}`,
        `DTEND;VALUE=DATE:${nextDay}`,
        `SUMMARY:${escapeIcs(`SAT - ${event.label}`)}`,
        `DESCRIPTION:${escapeIcs(event.description)}`,
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n");
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
        buildPlan({ track: false });
        if (savedStatus && currentPlan) {
          savedStatus.textContent = `Saved in this browser: ${currentPlan.primary.label}${currentPlan.backup ? ` with ${currentPlan.backup.label} as backup` : ""}.`;
          savedStatus.hidden = false;
        }
      }
    } catch (error) {
      // A fresh plan remains available when saved browser data cannot be read.
    }
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
      trackToolEvent("study_next_step_click", { action: "official_august_sat_registration", timeline_window: currentPlan?.window || currentWindow() });
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
initDmvDailyQuestions();
initDmvMistakeLogs();
initDmvStudyPlanners();
initRecentPracticeCards();
initDmvJourneyDashboards();
initDmvRequirementsFinders();
initDmvScoreCalculators();
initDmvChecklists();
initSatScoreEstimators();
initSatGoalPlanners();
initSatDatePlanners();
initSatAugustReadiness();
