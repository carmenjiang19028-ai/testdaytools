(() => {
  const N = 12;
  const KEY = 'tdt-skills-checking-v1';
  const STATS = 'tdt-skills-checking-stats-v1';
  let seed = Date.now() % 1000000;
  let items = [], i = 0, answers = [], started = 0, elapsed = 0;
  let paused = false, mode = 'timed', timer = null;
  let startedTracked = false, completeTracked = false, attemptType = 'first';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
  const names = ['Avery Chen', 'Morgan Ellis', 'Jordan Patel', 'Taylor Brooks', 'Riley Nguyen', 'Casey Morgan', 'Samira Lopez', 'Drew Carter'];
  const codes = ['AX-2049', 'B7Q-018', 'KLM-552', 'R4-7102', 'NQ-8830', 'CDE-091'];
  function make() {
    items = [];
    for (let n = 0; n < N; n += 1) {
      const leftName = pick(names);
      const code = pick(codes);
      const isMatch = rng() > 0.45;
      const right = isMatch ? `${leftName} · ${code}` : `${pick(names.filter((x) => x !== leftName))} · ${code.slice(0, -1)}${(Number(code.at(-1)) + 1) % 10}`;
      items.push({ left: `${leftName} · ${code}`, right, truth: isMatch ? 'match' : 'mismatch', why: isMatch ? 'All visible characters match.' : 'At least one visible character differs.' });
    }
    i = 0; answers = []; elapsed = 0; paused = false; started = performance.now(); startedTracked = false; completeTracked = false; $('#pause').textContent = 'Pause'; render(); save();
  }
  function currentElapsed() { return elapsed + (started && !paused ? (performance.now() - started) / 1000 : 0); }
  function render() {
    const q = items[i]; if (!q) return;
    $('#left').textContent = q.left; $('#right').textContent = q.right;
    $('[data-qnum]').textContent = i + 1; $('[data-done]').textContent = `${answers.length} / ${N}`;
    $('[data-correct]').textContent = answers.filter((x) => x && x.ok).length;
    $('[data-rate]').textContent = currentElapsed() ? (answers.length / (currentElapsed() / 60)).toFixed(1) : '0.0';
    $('[data-accuracy]').textContent = answers.length ? `${Math.round(answers.filter((x) => x && x.ok).length / answers.length * 100)}%` : '—';
    $('[data-progress]').style.width = `${answers.length / N * 100}%`;
    const expired = mode === 'timed' && currentElapsed() >= 90;
    $('[data-timer]').textContent = mode === 'untimed' ? '—' : fmt(Math.max(0, 90 - currentElapsed()));
    $('[data-timer]').classList.toggle('paused', paused); $('[data-next]').disabled = !answers[i];
    $('[data-pause]').disabled = expired; $('[data-pause]').textContent = expired ? 'Time up' : (paused ? 'Resume' : 'Pause');
    $$('[data-answer]').forEach((b) => { b.disabled = !!answers[i] || expired; b.className = 'choice'; if (answers[i] && b.dataset.answer === answers[i].choice) b.classList.add(answers[i].ok ? 'correct' : answers[i].choice === 'unsure' ? 'neutral' : 'wrong'); });
    const f = $('[data-feedback]'); f.hidden = !answers[i]; if (answers[i]) f.innerHTML = `<strong>${answers[i].ok ? 'Correct decision.' : 'Review this comparison.'}</strong> ${q.why}`;
    historyView();
  }
  function answer(choice) { if (answers[i]) return; if (mode === 'timed' && currentElapsed() >= 90) { elapsed = 90; paused = true; render(); save(); return; } const q = items[i]; if (!startedTracked && typeof window.trackSkillStart === 'function') startedTracked = window.trackSkillStart('clerical_checking', attemptType); if (typeof window.trackSkillAnswer === 'function') window.trackSkillAnswer('clerical_checking'); answers[i] = { choice, ok: choice === q.truth }; render(); save(); }
  function next() { if (i < N - 1) { i += 1; render(); save(); } else finish(); }
  function finish() { if (answers.filter(Boolean).length < N || completeTracked) return; paused = true; recordRound(); if (typeof window.trackSkillComplete === 'function') completeTracked = window.trackSkillComplete('clerical_checking'); render(); save(false); }
  function historyView() {
    const h = JSON.parse(localStorage.getItem(STATS) || '{}');
    $('[data-history]').textContent = h.rounds ? `${h.rounds} saved round${h.rounds === 1 ? '' : 's'} · ${h.checks || 0} comparisons · ${h.correct || 0} correct.` : 'Not enough saved rounds yet.';
    const counts = h.errors || {};
    $('[data-errors]').innerHTML = Object.entries(counts).map(([k, v]) => `<li>${k.replace('_', ' ')}: ${v}</li>`).join('') || '<li>No error pattern recorded yet.</li>';
  }
  function save(active = true) { localStorage.setItem(KEY, JSON.stringify({ seed, items, i, answers, elapsed: currentElapsed(), paused, mode, started, roundActive: active, startedTracked, completeTracked, attemptType })); }
  function clear() { localStorage.removeItem(KEY); localStorage.removeItem(STATS); location.reload(); }
  function load() { const h = JSON.parse(localStorage.getItem(KEY) || 'null'); if (h && h.roundActive && h.items) { seed = h.seed; items = h.items; i = h.i; answers = h.answers; elapsed = h.elapsed || 0; paused = true; mode = h.mode || 'timed'; startedTracked = !!h.startedTracked; completeTracked = !!h.completeTracked; attemptType = h.attemptType || 'first'; $('#pause').textContent = 'Resume'; render(); } else make(); }
  function recordRound() {
    const h = JSON.parse(localStorage.getItem(STATS) || '{}'); const errors = h.errors || {};
    answers.forEach((a, n) => { if (!a || a.ok) return; const k = a.choice === 'unsure' ? 'omission' : (items[n].truth === 'mismatch' && a.choice === 'match' ? 'false_match' : 'false_mismatch'); errors[k] = (errors[k] || 0) + 1; });
    localStorage.setItem(STATS, JSON.stringify({ rounds: (h.rounds || 0) + 1, checks: (h.checks || 0) + N, correct: (h.correct || 0) + answers.filter((x) => x && x.ok).length, errors }));
  }
  $$('[data-answer]').forEach((b) => b.addEventListener('click', () => answer(b.dataset.answer)));
  $('[data-next]').addEventListener('click', next); $('[data-new]').addEventListener('click', () => { if (startedTracked && typeof window.trackSkillRetry === 'function') window.trackSkillRetry('clerical_checking'); attemptType = 'retry'; make(); }); $('[data-clear]').addEventListener('click', clear);
  $('[data-pause]').addEventListener('click', () => { if (paused) { paused = false; started = performance.now(); $('#pause').textContent = 'Pause'; } else { elapsed = currentElapsed(); paused = true; $('#pause').textContent = 'Resume'; } render(); save(); });
  $$('input[name=mode]').forEach((x) => x.addEventListener('change', (e) => { mode = e.target.value; make(); }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) { elapsed = currentElapsed(); paused = true; $('#pause').textContent = 'Resume'; render(); save(); } });
  timer = setInterval(() => { if (!paused && mode === 'timed' && currentElapsed() >= 90) { elapsed = 90; paused = true; render(); save(); } else render(); }, 500);
  load();
})();
