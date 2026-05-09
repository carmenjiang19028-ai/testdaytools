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

initCountdowns();
initQuizzes();
initModeTools();
