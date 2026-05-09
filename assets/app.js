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
    const position = quiz.querySelector("[data-quiz-position]");
    const answeredLabel = quiz.querySelector("[data-quiz-answered]");
    const prevButton = quiz.querySelector("[data-quiz-prev]");
    const forwardButton = quiz.querySelector("[data-quiz-forward]");
    const answered = new Set();
    const missedCategories = {};
    let activeIndex = 0;
    let correct = 0;

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
      const percent = answeredCount ? Math.round((correct / answeredCount) * 100) : 0;
      const resultText = answeredCount
        ? `Score: ${correct} of ${answeredCount} answered · ${percent}% correct`
        : "Score: 0 of 0 answered";

      if (score) score.textContent = resultText;
      if (result) result.textContent = resultText;
      if (meter) meter.style.width = `${total ? Math.round((answeredCount / total) * 100) : 0}%`;
      if (answeredLabel) answeredLabel.textContent = `${answeredCount} of ${total} answered`;

      const missed = Object.entries(missedCategories)
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category)
        .slice(0, 3);

      if (!next) return;
      if (!answeredCount) {
        next.textContent = "Answer the questions first, then review the categories you missed.";
      } else if (answeredCount === total && percent >= 85) {
        next.textContent = "Strong result. Review any missed explanations, then confirm final rules in the official manual.";
      } else if (answeredCount === total && percent >= 70) {
        next.textContent = missed.length
          ? `Good start. Review next: ${missed.join(", ")}.`
          : "Good start. Reread explanations once before test day.";
      } else if (answeredCount === total) {
        next.textContent = missed.length
          ? `Use this as a diagnostic. Review these categories first: ${missed.join(", ")}.`
          : "Use this as a diagnostic, then retake after reading the manual.";
      } else if (missed.length) {
        next.textContent = `Keep going. Current weak areas: ${missed.join(", ")}.`;
      } else {
        next.textContent = "So far, no weak area. Keep going.";
      }
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

    questions.forEach((question, index) => {
      question.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          if (answered.has(index)) return;
          answered.add(index);

          const isCorrect = Number(button.dataset.choice) === Number(question.dataset.answer);
          button.classList.add(isCorrect ? "is-correct" : "is-wrong");
          if (isCorrect) correct += 1;
          if (!isCorrect) {
            const category = question.dataset.category || "this topic";
            missedCategories[category] = (missedCategories[category] || 0) + 1;
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
  });
}

initCountdowns();
initQuizzes();
