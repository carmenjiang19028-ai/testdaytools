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
    const answered = new Set();
    const missedCategories = {};
    let correct = 0;

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
          correctButton.classList.add("is-correct");
          question.querySelectorAll("button").forEach((item) => {
            item.disabled = true;
          });

          const feedback = question.querySelector(".feedback");
          feedback.textContent = `${isCorrect ? "Correct." : "Not quite."} ${question.dataset.explanation}`;
          const missed = Object.entries(missedCategories)
            .sort((a, b) => b[1] - a[1])
            .map(([category]) => category)
            .slice(0, 3);
          const review = missed.length ? ` Review next: ${missed.join(", ")}.` : "";
          const complete = answered.size === questions.length ? " Practice complete." : "";
          score.textContent = `Score: ${correct} of ${answered.size} answered.${review}${complete}`;
        });
      });
    });
  });
}

initCountdowns();
initQuizzes();
