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
    const passScore = Number(quiz.dataset.passScore) || questions.length;
    const quizLabel = quiz.dataset.quizLabel || "practice round";
    const answered = new Set();
    const missedCategories = {};
    const storageKey = `tdt-mistakes:${window.location.pathname}:${quiz.dataset.modeId || quizLabel}`;
    let savedMistakes = [];
    let activeIndex = 0;
    let correct = 0;

    const escapeHtml = (value) =>
      String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);

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
      const prompt = question.dataset.prompt || question.querySelector("h3")?.textContent || "Practice question";
      const category = question.dataset.category || "Review topic";
      savedMistakes = savedMistakes.filter((item) => item.prompt !== prompt);
      savedMistakes.unshift({ prompt, category, savedAt: Date.now() });
      saveMistakes();
      renderMistakes();
    };

    const resolveMistake = (question) => {
      const prompt = question.dataset.prompt || question.querySelector("h3")?.textContent || "Practice question";
      const nextMistakes = savedMistakes.filter((item) => item.prompt !== prompt);
      if (nextMistakes.length === savedMistakes.length) return;
      savedMistakes = nextMistakes;
      saveMistakes();
      renderMistakes();
    };

    const renderActiveQuestion = () => {
      questions.forEach((question, index) => {
        const isActive = index === activeIndex;
        question.classList.toggle("is-active", isActive);
        question.setAttribute("aria-hidden", isActive ? "false" : "true");
      });

      if (position) position.textContent = `Question ${activeIndex + 1} of ${questions.length}`;
      if (prevButton) prevButton.disabled = activeIndex === 0;
      if (forwardButton) {
        const activeAnswered = answered.has(activeIndex);
        forwardButton.disabled = !activeAnswered;
        if (activeIndex === questions.length - 1) {
          forwardButton.textContent = activeAnswered ? "Review result" : "Answer to finish";
        } else {
          forwardButton.textContent = activeAnswered ? "Next question" : "Answer to continue";
        }
      }
    };

    const renderScore = () => {
      const answeredCount = answered.size;
      const total = questions.length;
      const missedCount = answeredCount - correct;
      const leftCount = Math.max(total - answeredCount, 0);
      const percent = answeredCount ? Math.round((correct / answeredCount) * 100) : 0;
      const complete = answeredCount === total;
      const resultText = complete
        ? `${correct} of ${total} correct · ${percent}%`
        : answeredCount
        ? `Score: ${correct} of ${answeredCount} answered · ${percent}% correct`
        : "Score: 0 of 0 answered";

      if (score) score.textContent = resultText;
      if (result) result.textContent = resultText;
      if (meter) meter.style.width = `${total ? Math.round((answeredCount / total) * 100) : 0}%`;
      if (answeredLabel) answeredLabel.textContent = `${answeredCount} of ${total} answered`;
      correctLabels.forEach((label) => {
        label.textContent = String(correct);
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
      if (!answeredCount) {
        next.textContent = `Answer ${quizLabel} questions first, then review weak areas.`;
      } else if (complete && correct >= passScore) {
        next.textContent = `Practice pass for this mode. Review explanations, then confirm rules in the official manual.`;
      } else if (complete && correct >= Math.max(passScore - 4, 1)) {
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
    };

    const resetQuiz = () => {
      answered.clear();
      Object.keys(missedCategories).forEach((key) => delete missedCategories[key]);
      correct = 0;
      activeIndex = 0;
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

    if (questions.length) {
      quiz.classList.add("is-enhanced");
      renderActiveQuestion();
    }
    renderScore();

    if (prevButton) {
      prevButton.addEventListener("click", () => {
        activeIndex = Math.max(0, activeIndex - 1);
        renderActiveQuestion();
      });
    }

    if (forwardButton) {
      forwardButton.addEventListener("click", () => {
        if (activeIndex < questions.length - 1) {
          activeIndex += 1;
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
      });
    }

    questions.forEach((question, index) => {
      question.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          if (answered.has(index)) return;
          answered.add(index);

          const isCorrect = Number(button.dataset.choice) === Number(question.dataset.answer);
          button.classList.add(isCorrect ? "is-correct" : "is-wrong");
          if (isCorrect) correct += 1;
          if (isCorrect) resolveMistake(question);
          if (!isCorrect) {
            const category = question.dataset.category || "this topic";
            missedCategories[category] = (missedCategories[category] || 0) + 1;
            rememberMistake(question);
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
        });
      });
    });
    loadMistakes();
    renderMistakes();
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
      button.addEventListener("click", () => activate(button.dataset.modeButton));
    });
  });
}

function initStateFilters() {
  document.querySelectorAll("[data-state-filter]").forEach((input) => {
    const scope = input.closest("[data-state-filter-scope]");
    if (!scope) return;

    const cards = Array.from(scope.querySelectorAll("[data-state-card]"));
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

initCountdowns();
initQuizzes();
initModeTools();
initStateFilters();
initSatScoreEstimators();
initSatGoalPlanners();
