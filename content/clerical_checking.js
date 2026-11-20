(() => {
  const N = 12;
  const LIMIT = 90;
  const SEPARATOR = ' · ';
  const KEY = 'tdt-skills-checking-v1';
  const STATS = 'tdt-skills-checking-stats-v1';
  let seed = Date.now() % 1000000;
  let items = [], i = 0, answers = [], started = 0, elapsed = 0;
  let paused = false, mode = 'timed', finished = false;
  let startedTracked = false, completeTracked = false, attemptType = 'first';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (a) => a[Math.floor(rng() * a.length)];
  function shuffle(values) {
    for (let j = values.length - 1; j > 0; j -= 1) {
      const k = Math.floor(rng() * (j + 1));
      [values[j], values[k]] = [values[k], values[j]];
    }
    return values;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const names = [
    ['Avery Chen', 'Avery Chan'], ['Morgan Ellis', 'Morgan Elles'], ['Jordan Patel', 'Jordan Patil'],
    ['Taylor Brooks', 'Taylor Brookes'], ['Riley Nguyen', 'Riley Ngu yen'], ['Casey Morgan', 'Casey Mordan'],
    ['Samira Lopez', 'Samira Lopes'], ['Drew Carter', 'Drew Carver'],
  ];
  const codes = ['AX-2049', 'B7Q-018', 'KLM-552', 'R4-7102', 'NQ-8830', 'CDE-091'];
  function changeCode(code, kind) {
    if (kind === 'digit') {
      const j = pick([...code].map((c, k) => /\d/.test(c) ? k : -1).filter(k => k !== -1));
      return code.slice(0, j) + ((Number(code[j]) + 1) % 10) + code.slice(j + 1);
    }
    const j = pick([...code].map((c, k) => /\d/.test(c) && /\d/.test(code[k + 1] || '') && c !== code[k + 1] ? k : -1).filter(k => k !== -1));
    return code.slice(0, j) + code[j + 1] + code[j] + code.slice(j + 2);
  }
  function differences(q) {
    const left = q.left.split(SEPARATOR), right = q.right.split(SEPARATOR);
    return left.flatMap((value, j) => {
      if (value === right[j] || right[j] === undefined) return [];
      const other = right[j];
      let prefix = 0, suffix = 0;
      while (prefix < Math.min(value.length, other.length) && value[prefix] === other[prefix]) prefix += 1;
      while (suffix < Math.min(value.length, other.length) - prefix && value.at(-1 - suffix) === other.at(-1 - suffix)) suffix += 1;
      return [{ j, prefix, suffix, left: value, right: other }];
    });
  }
  function explanation(diffs) {
    if (!diffs.length) return 'Both the name and record code match exactly.';
    return diffs.map(diff => {
      const field = diff.j === 0 ? 'Name' : 'Record code';
      const swap = diff.left.length === diff.right.length && diff.left.length - diff.prefix - diff.suffix === 2 &&
        diff.left[diff.prefix] === diff.right[diff.prefix + 1] && diff.left[diff.prefix + 1] === diff.right[diff.prefix];
      return `${field}: ${diff.left} versus ${diff.right}.${swap ? ' Two adjacent characters trade places.' : ''}`;
    }).join(' ');
  }
  function showRecord(element, text, diffs, side) {
    const fragments = [];
    for (const [j, value] of text.split(SEPARATOR).entries()) {
      if (j) fragments.push(SEPARATOR);
      const diff = diffs.find(d => d.j === j);
      if (!diff) { fragments.push(value); continue; }
      const end = value.length - diff.suffix;
      const marked = document.createElement('mark');
      marked.textContent = diff[side].slice(diff.prefix, end);
      fragments.push(value.slice(0, diff.prefix), marked, value.slice(end));
    }
    element.replaceChildren(...fragments);
  }
  function make() {
    const exact = 5 + Math.floor(rng() * 3);
    const kinds = ['name', 'digit', 'swap'];
    const queue = [...Array(exact).fill('exact'), ...kinds];
    while (queue.length < N) queue.push(pick(kinds));
    const records = shuffle(names.flatMap(pair => codes.map(code => [pair, code])));
    items = shuffle(queue).map((kind, n) => {
      const [[name, nearName], code] = records[n];
      const left = name + SEPARATOR + code;
      const right = (kind === 'name' ? nearName : name) + SEPARATOR + (kind === 'digit' || kind === 'swap' ? changeCode(code, kind) : code);
      const q = { left, right, truth: kind === 'exact' ? 'match' : 'mismatch' };
      return { ...q, why: explanation(differences(q)) };
    });
    i = 0; answers = []; elapsed = 0; paused = false; finished = false; started = performance.now(); startedTracked = false; completeTracked = false; render(); save();
  }
  function currentElapsed() { return elapsed + (started && !paused ? (performance.now() - started) / 1000 : 0); }
  function isExpired() { return mode === 'timed' && currentElapsed() >= LIMIT; }
  function renderClock() {
    const seconds = currentElapsed();
    $('[data-timer]').textContent = mode === 'untimed' ? '—' : fmt(Math.max(0, Math.ceil(LIMIT - seconds)));
    $('[data-rate]').textContent = seconds ? (answers.length / (seconds / 60)).toFixed(1) : '0.0';
  }
  function render() {
    const q = items[i]; if (!q) return;
    const expired = isExpired(), held = paused && !finished && !expired;
    const diffs = answers[i] ? differences(q) : [];
    showRecord($('#left'), held && !answers[i] ? 'Paused' : q.left, diffs, 'left');
    showRecord($('#right'), held && !answers[i] ? 'Resume to compare' : q.right, diffs, 'right');
    $('[data-qnum]').textContent = i + 1; $('[data-done]').textContent = `${answers.length} / ${N}`;
    $('[data-correct]').textContent = answers.filter((x) => x && x.ok).length;
    $('[data-accuracy]').textContent = answers.length ? `${Math.round(answers.filter((x) => x && x.ok).length / answers.length * 100)}%` : '—';
    $('[data-progress]').style.width = `${answers.length / N * 100}%`;
    renderClock();
    $('[data-timer]').classList.toggle('paused', paused);
    $('[data-next]').disabled = !answers[i] || held || finished;
    $('[data-next]').textContent = finished ? 'Round saved' : i === N - 1 ? 'Finish round' : 'Next comparison';
    $('[data-pause]').disabled = expired || finished;
    $('[data-pause]').textContent = finished ? 'Complete' : expired ? 'Time up' : held ? 'Resume' : 'Pause';
    $$('[data-answer]').forEach((b) => { b.disabled = !!answers[i] || expired || paused; b.className = 'choice'; if (answers[i] && b.dataset.answer === answers[i].choice) b.classList.add(answers[i].ok ? 'correct' : answers[i].choice === 'unsure' ? 'neutral' : 'wrong'); });
    const f = $('[data-feedback]'); f.hidden = !answers[i];
    if (answers[i]) {
      const heading = document.createElement('strong');
      heading.textContent = answers[i].ok ? 'Correct decision.' : 'Review this comparison.';
      f.replaceChildren(heading, ' ' + explanation(diffs));
    }
    historyView();
  }
  function answer(choice) { if (answers[i] || paused || finished) return; if (isExpired()) { elapsed = LIMIT; paused = true; render(); save(); return; } const q = items[i]; if (!startedTracked && typeof window.trackSkillStart === 'function') startedTracked = window.trackSkillStart('clerical_checking', attemptType); if (typeof window.trackSkillAnswer === 'function') window.trackSkillAnswer('clerical_checking'); answers[i] = { choice, ok: choice === q.truth }; render(); save(); }
  function next() { if (finished || !answers[i] || (paused && !isExpired())) return; if (i < N - 1) { i += 1; render(); save(); } else finish(); }
  function finish() { if (answers.filter(Boolean).length < N || finished) return; elapsed = mode === 'timed' ? Math.min(currentElapsed(), LIMIT) : currentElapsed(); paused = true; finished = true; recordRound(); if (!completeTracked && typeof window.trackSkillComplete === 'function') completeTracked = window.trackSkillComplete('clerical_checking'); render(); save(false); }
  function historyView() {
    const h = JSON.parse(localStorage.getItem(STATS) || '{}');
    $('[data-history]').textContent = h.rounds ? `${h.rounds} saved round${h.rounds === 1 ? '' : 's'} · ${h.checks || 0} comparisons · ${h.correct || 0} correct.` : 'Not enough saved rounds yet.';
    const counts = h.errors || {};
    $('[data-errors]').innerHTML = Object.entries(counts).map(([k, v]) => `<li>${k.replace('_', ' ')}: ${v}</li>`).join('') || '<li>No error pattern recorded yet.</li>';
  }
  function save(active = true) { localStorage.setItem(KEY, JSON.stringify({ seed, items, i, answers, elapsed: currentElapsed(), paused, mode, started, roundActive: active, startedTracked, completeTracked, attemptType })); }
  function clear() { localStorage.removeItem(KEY); localStorage.removeItem(STATS); location.reload(); }
  function load() { const h = JSON.parse(localStorage.getItem(KEY) || 'null'); if (h && h.roundActive && h.items) { seed = h.seed; items = h.items; i = h.i; answers = h.answers; elapsed = h.elapsed || 0; paused = true; mode = h.mode || 'timed'; startedTracked = !!h.startedTracked; completeTracked = !!h.completeTracked; attemptType = h.attemptType || 'first'; $$('input[name=mode]').forEach(x => { x.checked = x.value === mode; }); render(); } else make(); }
  function recordRound() {
    const h = JSON.parse(localStorage.getItem(STATS) || '{}'); const errors = h.errors || {};
    answers.forEach((a, n) => { if (!a || a.ok) return; const k = a.choice === 'unsure' ? 'omission' : (items[n].truth === 'mismatch' && a.choice === 'match' ? 'false_match' : 'false_mismatch'); errors[k] = (errors[k] || 0) + 1; });
    localStorage.setItem(STATS, JSON.stringify({ rounds: (h.rounds || 0) + 1, checks: (h.checks || 0) + N, correct: (h.correct || 0) + answers.filter((x) => x && x.ok).length, errors }));
  }
  $$('[data-answer]').forEach((b) => b.addEventListener('click', () => answer(b.dataset.answer)));
  $('[data-next]').addEventListener('click', next); $('[data-new]').addEventListener('click', () => { if (startedTracked && typeof window.trackSkillRetry === 'function') window.trackSkillRetry('clerical_checking'); if (startedTracked) attemptType = 'retry'; make(); }); $('[data-clear]').addEventListener('click', clear);
  $('[data-pause]').addEventListener('click', () => { if (finished || isExpired()) return; if (paused) { paused = false; started = performance.now(); } else { elapsed = currentElapsed(); paused = true; } render(); save(); });
  $$('input[name=mode]').forEach((x) => x.addEventListener('change', (e) => { mode = e.target.value; make(); }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) { elapsed = currentElapsed(); paused = true; render(); save(); } });
  setInterval(() => { if (!paused && isExpired()) { elapsed = LIMIT; paused = true; render(); save(); } else if (!paused) renderClock(); }, 500);
  load();
})();
