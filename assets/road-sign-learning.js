(() => {
  const root = document.querySelector('[data-learning-loop]');
  const dataNode = document.querySelector('[data-loop-curriculum]');
  if (!root || !dataNode) return;
  let curriculum;
  try { curriculum = JSON.parse(dataNode.textContent); } catch { return; }
  const params = new URLSearchParams(location.search);
  const requested = params.get('concept') || '';
  const lessons = curriculum.lessons.filter(item => !requested || item.id === requested);
  const selectedLessons = lessons.length ? lessons : curriculum.lessons;
  const returnValue = params.get('return') || 'road-signs-practice-test.html';
  const returnPath = /^[a-z0-9-]+\.html$/.test(returnValue) ? returnValue : 'road-signs-practice-test.html';
  const fromSheet = returnPath === 'dmv-road-signs-cheat-sheet.html';
  const returnMode = params.get('return_mode');
  const fromRound = returnValue === 'road-signs-practice-test.html' &&
    ['road-signs-starter', 'road-signs-core'].includes(returnMode);
  const returnHref = fromRound
    ? `${returnPath}?${new URLSearchParams({ mode: returnMode, focus: 'saved' })}#practice`
    : fromSheet ? returnPath : `${returnPath}#practice`;
  const returnLabel = fromRound ? 'Retry saved mistakes in this round' :
    fromSheet ? 'Return to the study sheet' : 'Return to picture practice';
  const key = `tdt-learning-loop:v2:${lessons.length && requested ? requested : 'all'}`;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = name => root.querySelector(`[data-loop-${name}]`);
  const stage = get('stage');
  const next = get('next');
  const report = document.querySelector('[data-loop-report]');
  const steps = selectedLessons.flatMap(lesson => [
    { lesson, question: lesson.diagnosis, phase: 1 },
    { lesson, phase: 2 },
    ...lesson.applications.map(question => ({ lesson, question, phase: 3 })),
  ]);
  const questions = steps.filter(step => step.question);
  const shuffleOptions = count => {
    const order = Array.from({ length: count }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order;
  };
  const validOrder = (order, count) => Array.isArray(order) && order.length === count &&
    new Set(order).size === count && order.every(index => Number.isInteger(index) && index >= 0 && index < count);
  const newSession = () => ({ version: curriculum.version, index: 0, answers: {}, exposures: {}, optionOrders: {} });
  let state = newSession();
  let storageAvailable = true;
  try {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (error) {
      if (error.name !== 'SyntaxError') throw error;
    }
    if (saved?.version === curriculum.version) {
      if (saved.answers && typeof saved.answers === 'object' && !Array.isArray(saved.answers)) {
        for (const [index, { question }] of questions.entries()) {
          const answer = saved.answers[question.id];
          if (answer && Number.isInteger(answer.selected) && answer.selected >= 0 && answer.selected < question.options.length) {
            state.answers[question.id] = { selected: answer.selected, correct: answer.selected === 0 };
            if (!saved.optionOrders) {
              // Keep the displayed positions of answers submitted before option orders were saved.
              const offset = (index % 2) + 1;
              state.optionOrders[question.id] = question.options.map((_, i) => (i + offset) % question.options.length);
            }
          }
          const savedOrder = saved.optionOrders?.[question.id];
          if (validOrder(savedOrder, question.options.length)) state.optionOrders[question.id] = savedOrder;
          const exposure = saved.exposures?.[question.id];
          if (Number.isSafeInteger(exposure) && exposure > 0) state.exposures[question.id] = exposure;
        }
      }
      if (Number.isInteger(saved.index) && saved.index >= 0 && saved.index <= steps.length) state.index = saved.index;
    }
  } catch { storageAvailable = false; }
  // A stale or edited completion flag cannot skip an unanswered situation.
  const skipped = steps.findIndex((step, index) => index < state.index && step.question && !state.answers[step.question.id]);
  if (skipped !== -1) state.index = skipped;
  let selected = null;
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { storageAvailable = false; }
  };
  const sourceLink = lesson => `<a href="${esc(lesson.sourceUrl)}">${esc(lesson.sourceLabel)}</a>`;
  const visuals = ids => ids.map(id => {
    const sign = curriculum.signs[id];
    return `<figure><img src="${esc(sign.image)}" alt="${esc(sign.label)} road sign" width="220" height="160"><figcaption>${esc(sign.label)}</figcaption></figure>`;
  }).join('');
  const answeredCount = () => questions.filter(({ question }) => state.answers[question.id]).length;
  const applicationCount = () => questions.filter(step => step.phase === 3 && state.answers[step.question.id]).length;
  const reportText = () => [
    'TestDayTools road-sign study record',
    `Question set checked: ${curriculum.checkedOn}. Original practice, not an official exam result.`,
    ...selectedLessons.flatMap(lesson => [
      `\n${lesson.title}`,
      ...[lesson.diagnosis, ...lesson.applications].flatMap(question => {
        const answer = state.answers[question.id];
        if (!answer) return [];
        return [question.prompt, `Your answer: ${question.options[answer.selected].text}`,
          `Result: ${answer.correct ? 'Correct in this session' : 'Review needed'}`,
          `Reason: ${question.options[answer.selected].why}`,
          `Rule: ${question.options[0].text}`];
      }),
      `Source: ${lesson.sourceLabel} - ${lesson.sourceUrl}`,
    ]),
    '\nNext check: explain each missed decision without this record, then use a different practice question. Repeating a saved answer is not proof of exam readiness.',
  ].join('\n');
  const renderReport = () => {
    report.hidden = answeredCount() === 0;
    report.querySelector('[data-loop-report-list]').innerHTML = selectedLessons.map(lesson => {
      const answered = [lesson.diagnosis, ...lesson.applications].filter(q => state.answers[q.id]);
      if (!answered.length) return '';
      return `<article class="learning-record"><h3>${esc(lesson.title)}</h3>${answered.map(question => {
        const answer = state.answers[question.id];
        return `<div class="learning-record-answer"><h4>${esc(question.prompt)}</h4><p><strong>${answer.correct ? 'Correct in this session' : 'Review needed'}</strong></p><p>Your answer: ${esc(question.options[answer.selected].text)}</p><p>${esc(question.options[answer.selected].why)}</p>${answer.correct ? '' : `<p>Keep this rule: ${esc(question.options[0].text)}</p>`}</div>`;
      }).join('')}<p class="contrast-source">${sourceLink(lesson)}</p></article>`;
    }).join('');
    report.querySelector('[data-loop-report-text]').value = reportText();
  };
  const render = () => {
    const step = steps[state.index];
    const q = step?.question;
    if (q && !state.optionOrders[q.id]) state.optionOrders[q.id] = shuffleOptions(q.options.length);
    persist();
    renderReport();
    const complete = state.index === steps.length;
    stage.classList.toggle('is-complete', complete);
    get('progress').textContent = `${answeredCount()} of ${questions.length} questions`;
    get('status').textContent = storageAvailable
      ? 'Saved only in this browser. Repeated practice is not a pass prediction.'
      : 'Browser storage is unavailable. This round still works, but may not survive a refresh.';
    get('print').disabled = answeredCount() === 0;
    if (complete) {
      get('phase-label').textContent = 'Session complete';
      get('title').textContent = 'Review your decisions';
      get('copy').textContent = 'Use the record below to explain the choices you missed before continuing your review.';
      stage.innerHTML = `<p class="learning-complete">You answered all ${selectedLessons.length * 2} sign situations across ${selectedLessons.length} distinction${selectedLessons.length === 1 ? '' : 's'}. This is a record of this practice, not certified mastery.</p><p><a href="${esc(returnHref)}">${returnLabel}</a></p>`;
      next.disabled = true;
      next.textContent = 'Session complete';
      return;
    }
    const lesson = step.lesson;
    get('phase-label').textContent = `Phase ${step.phase} of 3 · ${({1:'Compare',2:'Work through the distinction',3:'Apply'})[step.phase]}`;
    get('title').textContent = lesson.title.split(':')[0];
    get('copy').textContent = step.phase === 3
      ? `${applicationCount()} of ${selectedLessons.length * 2} sign situations answered.`
      : 'Separate the visual clue from the decision the driver must make.';
    if (step.phase === 2) {
      stage.innerHTML = `<article class="learning-card"><div class="learning-card-visual learning-contrast-visual">${visuals(lesson.diagnosis.images)}</div><div class="learning-card-copy"><h3 tabindex="-1" data-loop-question-title>A worked situation</h3><p>${esc(lesson.scene)}</p><p><strong>Clue:</strong> ${esc(lesson.cue)}</p><p><strong>Decision:</strong> ${esc(lesson.decision)}</p><p>${esc(lesson.reason)}</p><p class="contrast-source">${sourceLink(lesson)}</p></div></article>`;
      next.disabled = false;
      next.textContent = 'Try the situations';
      return;
    }
    const answer = state.answers[q.id];
    const order = state.optionOrders[q.id];
    stage.innerHTML = `<article class="learning-card" data-loop-question="${esc(q.id)}"><div class="learning-card-visual learning-contrast-visual">${visuals(q.images)}</div><div class="learning-card-copy"><span>${step.phase === 1 ? 'Compare the controls' : 'A changed situation'}</span><h3 tabindex="-1" data-loop-question-title>${esc(q.prompt)}</h3><div class="learning-options" role="group" aria-label="Answer choices">${order.map(i => `<button type="button" data-loop-option="${i}" aria-pressed="${(answer?.selected ?? selected) === i}" ${answer ? 'disabled' : ''} class="${(answer?.selected ?? selected) === i ? 'is-selected' : ''}">${esc(q.options[i].text)}</button>`).join('')}</div><div class="learning-feedback" data-loop-feedback role="status" aria-live="polite">${answer ? `<strong>${answer.correct ? 'Correct in this situation.' : 'Not quite. Review this decision.'}</strong><p>${esc(q.options[answer.selected].why)}</p>${answer.correct ? '' : `<p>Keep this rule: ${esc(q.options[0].text)}</p>`}<p class="contrast-source">${sourceLink(lesson)}</p>` : ''}</div></div></article>`;
    stage.querySelectorAll('[data-loop-option]').forEach(button => button.addEventListener('click', () => {
      if (state.answers[q.id]) return;
      selected = Number(button.dataset.loopOption);
      stage.querySelectorAll('[data-loop-option]').forEach(item => {
        item.classList.toggle('is-selected', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      next.disabled = false;
      next.textContent = 'Check answer';
    }));
    next.disabled = !answer && selected === null;
    next.textContent = answer ? (state.index === steps.length - 1 ? 'Finish session' : 'Continue') : selected === null ? 'Choose an answer' : 'Check answer';
  };
  next.addEventListener('click', event => {
    if (event.detail > 1 || state.index >= steps.length) return;
    const step = steps[state.index];
    if (step.question && !state.answers[step.question.id]) {
      if (selected === null) return;
      state.answers[step.question.id] = { selected, correct: selected === 0 };
      state.exposures[step.question.id] = (state.exposures[step.question.id] || 0) + 1;
      render();
      return;
    }
    state.index += step.phase === 1 && state.answers[step.question.id].correct ? 2 : 1;
    selected = null;
    render();
    const complete = state.index === steps.length;
    const heading = complete ? get('title') : stage.querySelector('[data-loop-question-title]');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    (complete ? heading : stage)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  get('reset').addEventListener('click', () => {
    state = newSession();
    selected = null;
    render();
  });
  get('print').addEventListener('click', () => { if (answeredCount()) window.print(); });
  report.querySelector('[data-loop-copy-record]').addEventListener('click', async () => {
    const text = report.querySelector('[data-loop-report-text]');
    try {
      await navigator.clipboard.writeText(text.value);
      report.querySelector('[data-loop-copy-status]').textContent = 'Study record copied.';
    } catch {
      text.hidden = false;
      text.focus();
      text.select();
      report.querySelector('[data-loop-copy-status]').textContent = 'The study record is selected.';
    }
  });
  render();
})();
