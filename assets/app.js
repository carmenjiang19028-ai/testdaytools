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
    const passScore = Number(quiz.dataset.passScore) || questions.length;
    const quizLabel = quiz.dataset.quizLabel || "practice round";
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
      const effectivePassScore = Math.min(passScore, Math.max(activeTotal - 1, 1));
      const resultText = !activeTotal
        ? "No questions selected"
        : complete
        ? `${correctCount} of ${activeTotal} correct · ${percent}%`
        : answeredCount
        ? `Score: ${correctCount} of ${answeredCount} answered · ${percent}% correct`
        : "Score: 0 of 0 answered";

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
      if (value === "saved") {
        loadMistakes();
        const prompts = new Set(savedMistakes.map((item) => item.prompt));
        const savedIndexes = allQuestionIndexes().filter((index) => prompts.has(questionPrompt(questions[index])));
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
        if (filterSelect) filterSelect.value = "saved";
        applyFocusFilter("saved");
      });
    }

    if (timerButton) {
      timerButton.addEventListener("click", toggleTimer);
    }

    questions.forEach((question, index) => {
      question.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          if (answered.has(index)) return;
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
      button.addEventListener("click", () => activate(button.dataset.modeButton));
    });
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

    stateSelect?.addEventListener("change", updateStateLinks);
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

    [stateSelect, daysSelect, weakSelect].forEach((input) => input?.addEventListener("change", render));
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

initCountdowns();
initQuizzes();
initModeTools();
initStateFilters();
initPracticeWorkbenches();
initMiniSignDrills();
initSignLookups();
initRoadSignFlashcards();
initDmvStudyPlanners();
initRecentPracticeCards();
initDmvRequirementsFinders();
initDmvScoreCalculators();
initDmvChecklists();
initSatScoreEstimators();
initSatGoalPlanners();
