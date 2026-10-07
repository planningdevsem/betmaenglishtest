/* =====================================================================
   BETMA ENGLISH – Online English Placement Test
   Vanilla JavaScript, no framework. Open index.html directly to test.

   Sections of this file
   1. CONFIG + ANSWER KEY
   2. State + localStorage
   3. Helpers (modal, formatting)
   4. Candidate information
   5. Navigation
   6. Timers
   7. Answers, progress, warnings
   8. Audio (listening) – play once, no seeking
   9. Writing word count
   10. Review, submit, scoring, result
   11. Init
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   1. CONFIG + ANSWER KEY
   --------------------------------------------------------------------- */
const STORAGE_KEY = 'betma_english_test_v1';
const SUBMISSION_URL = 'https://script.google.com/macros/s/AKfycbxIlOmcoG8zs5XTDbct5F7IyqMm9djPQCpfO-wFzzgcoJKTjqWc3JjSEfwD2Q-wsIn0nA/exec';
const SKILLS = ['listening', 'reading', 'writing'];
const SKILL_NAME = { listening: 'LISTENING', reading: 'READING', writing: 'WRITING' };
const TIME_LIMIT = { listening: 40 * 60, reading: 60 * 60, writing: 60 * 60 }; // seconds
const TOTAL_Q = { listening: 35, reading: 40, writing: 2 };
const WRITING_TARGET = { 1: 120, 2: 250 };

/*
   ANSWER KEY  –  FILL THIS IN BEFORE REAL USE.
   The original test1.html does NOT contain an answer key, so nothing was
   invented here. Enter the correct letter ('A', 'B', 'C' or 'D') for every
   question. Until a section is completely filled in, its score is shown as
   "—" and the result page says the answer key is not configured.

   NOTE: this file is public once hosted (e.g. GitHub Pages), so students
   could read the key in the browser. For a real exam, move scoring to a
   server in a later version.
*/
const ANSWER_KEY = {
  listening: {
    1: '', 2: '', 3: '', 4: '', 5: '',
    6: '', 7: '', 8: '', 9: '', 10: '',
    11: '', 12: '', 13: '', 14: '', 15: '',
    16: '', 17: '', 18: '', 19: '', 20: '',
    21: '', 22: '', 23: '', 24: '', 25: '',
    26: '', 27: '', 28: '', 29: '', 30: '',
    31: '', 32: '', 33: '', 34: '', 35: '',
  },
  reading: {
    1: '', 2: '', 3: '', 4: '', 5: '',
    6: '', 7: '', 8: '', 9: '', 10: '',
    11: '', 12: '', 13: '', 14: '', 15: '',
    16: '', 17: '', 18: '', 19: '', 20: '',
    21: '', 22: '', 23: '', 24: '', 25: '',
    26: '', 27: '', 28: '', 29: '', 30: '',
    31: '', 32: '', 33: '', 34: '', 35: '',
    36: '', 37: '', 38: '', 39: '', 40: '',
  }
};

/* ---------------------------------------------------------------------
   2. STATE + localStorage
   --------------------------------------------------------------------- */
function newState() {
  return {
    version: 1,
    candidate: { name: '', phone: '', email: '', studentId: '' },
    started: false,
    startTime: null,
    submitTime: null,
    submitted: false,
    screen: 'information',      // information | listening | reading | writing | review | result
    lastSkill: 'listening',     // where "Back to test" returns to
    answers: { listening: {}, reading: {} },   // { questionNumber: 'A'..'D' }
    writing: { task1: '', task2: '' },
    // used = seconds already spent in the section; since = timestamp while the clock is running
    timers: {
      listening: { used: 0, since: null, started: false, expired: false },
      reading:   { used: 0, since: null, started: false, expired: false },
      writing:   { used: 0, since: null, started: false, expired: false }
    },
    audio: {},                  // { p1: 'playing' | 'played', ... }
    scores: null
  };
}

let storageOK = true;
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const base = newState();
      // shallow-merge so older/partial saves never break the app
      return Object.assign(base, saved, {
        candidate: Object.assign(base.candidate, saved.candidate),
        answers: Object.assign(base.answers, saved.answers),
        writing: Object.assign(base.writing, saved.writing),
        timers: Object.assign(base.timers, saved.timers)
      });
    }
  } catch (e) { storageOK = false; }
  return newState();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { storageOK = false; }
}
let state = loadState();

/* ---------------------------------------------------------------------
   3. Helpers
   --------------------------------------------------------------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const isSkill = s => SKILLS.indexOf(s) !== -1;
const pad = n => String(n).padStart(2, '0');

function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
}
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + 'h ' : '') + pad(m) + 'm ' + pad(r) + 's';
}
function fmtDate(ts) { return ts ? new Date(ts).toLocaleString() : '—'; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Generic modal. buttons = [{label, cls, onClick}] */
function showModal(title, messageHtml, buttons) {
  $('#modal-title').textContent = title;
  $('#modal-msg').innerHTML = messageHtml;
  const actions = $('#modal-actions');
  actions.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ' + (b.cls || 'btn-secondary');
    btn.textContent = b.label;
    btn.addEventListener('click', () => { closeModal(); if (b.onClick) b.onClick(); });
    actions.appendChild(btn);
  });
  $('#modal').hidden = false;
  const first = actions.querySelector('button');
  if (first) first.focus();
}
function closeModal() { $('#modal').hidden = true; }

/* ---------------------------------------------------------------------
   4. Candidate information
   --------------------------------------------------------------------- */
function validateInfo() {
  let ok = true;
  const name = $('#f-name').value.trim();
  const phone = $('#f-phone').value.trim();
  const email = $('#f-email').value.trim();
  $('#err-name').textContent = '';
  $('#err-phone').textContent = '';
  $('#err-email').textContent = '';

  if (!name) { $('#err-name').textContent = 'Vui lòng nhập họ và tên.'; ok = false; }
  const digits = phone.replace(/\D/g, '');
  if (!phone) { $('#err-phone').textContent = 'Vui lòng nhập số điện thoại.'; ok = false; }
  else if (!/^[0-9+\-.()\s]+$/.test(phone) || digits.length < 8 || digits.length > 15) {
    $('#err-phone').textContent = 'Số điện thoại không hợp lệ.'; ok = false;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('#err-email').textContent = 'Email không hợp lệ.'; ok = false;
  }
  return ok;
}

function startTest(e) {
  e.preventDefault();
  if (!validateInfo()) return;
  state.candidate = {
    name: $('#f-name').value.trim(),
    phone: $('#f-phone').value.trim(),
    email: $('#f-email').value.trim(),
    studentId: $('#f-sid').value.trim()
  };
  state.started = true;
  state.startTime = Date.now();
  save();
  go('listening', { skipConfirm: true });
}

function renderInfoScreen() {
  const c = state.candidate;
  $('#f-name').value = c.name; $('#f-phone').value = c.phone;
  $('#f-email').value = c.email; $('#f-sid').value = c.studentId;
  // once the test has started the details are locked (read-only)
  $$('#info-form input').forEach(i => { i.readOnly = state.started; });
  $('#btn-start').hidden = state.started;
  $('#btn-continue').hidden = !state.started;
  $('#storage-warning').hidden = storageOK;
}

/* ---------------------------------------------------------------------
   5. Navigation
   --------------------------------------------------------------------- */
function audioIsPlaying() {
  return $$('.audio-box audio').some(a => !a.paused && !a.ended);
}

/* Public entry point: checks rules, then calls doGo(). */
function go(target, opts) {
  opts = opts || {};
  if (state.submitted && target !== 'result') return;
  if (!state.started && target !== 'information') return;

  // Do not leave Listening while an audio is playing (it can't be paused/replayed).
  if (state.screen === 'listening' && target !== 'listening' && audioIsPlaying()) {
    showModal('Audio is playing', '<p>Please wait until the audio finishes before leaving the Listening section.</p>',
      [{ label: 'OK', cls: 'btn-primary' }]);
    return;
  }
  // First time entering a section: confirm that its timer starts now.
  if (isSkill(target) && !state.timers[target].started && !opts.skipConfirm) {
    const mins = TIME_LIMIT[target] / 60;
    showModal('Start ' + SKILL_NAME[target] + '?',
      '<p>You have <strong>' + mins + ' minutes</strong> for this section. The timer starts now and runs only while you are inside this section.</p>',
      [{ label: 'Cancel' }, { label: 'Start', cls: 'btn-primary', onClick: () => doGo(target) }]);
    return;
  }
  doGo(target);
}

function doGo(target) {
  if (isSkill(state.screen)) { stopClock(state.screen); state.lastSkill = state.screen; }
  state.screen = target;
  if (isSkill(target)) {
    const t = state.timers[target];
    if (!t.expired) { t.started = true; if (!t.since) t.since = Date.now(); }
  }
  save();
  render();
  window.scrollTo(0, 0);
}

function render() {
  $$('.screen').forEach(el => { el.hidden = (el.id !== 'screen-' + state.screen); });
  if (state.screen === 'information') renderInfoScreen();
  if (state.screen === 'review') renderReview();
  if (state.screen === 'result') renderResult();
  updateNav();
  updateProgress();
  applyLocks();
  updateTimerDisplay();
  const chip = $('#candidate-chip');
  chip.hidden = !state.started;
  chip.textContent = state.candidate.name;
}

function updateNav() {
  $$('.nav-btn').forEach(b => {
    const t = b.dataset.nav;
    b.classList.toggle('active', t === state.screen);
    // before the test starts, or after submission, only the relevant tab is usable
    b.disabled = state.submitted ? true : (!state.started && t !== 'information');
  });
}

/* ---------------------------------------------------------------------
   6. Timers
   Each section has its own countdown. It runs only while the candidate is inside
   that section. The running clock is stored as a timestamp (`since`), so a page
   refresh does NOT reset it; time spent with the page closed also counts.
   --------------------------------------------------------------------- */
function remaining(skill) {
  const t = state.timers[skill];
  let used = t.used;
  if (t.since) used += (Date.now() - t.since) / 1000;
  return Math.max(0, TIME_LIMIT[skill] - used);
}
function stopClock(skill) {
  const t = state.timers[skill];
  if (t.since) { t.used += (Date.now() - t.since) / 1000; t.since = null; }
}

function updateTimerDisplay() {
  const box = $('#timer');
  if (!isSkill(state.screen) || state.submitted) { box.hidden = true; return; }
  box.hidden = false;
  const rem = remaining(state.screen);
  $('#timer-skill').textContent = '– ' + SKILL_NAME[state.screen];
  $('#timer-value').textContent = fmtClock(rem);
  box.classList.toggle('low', rem <= 300 && rem > 0);
  box.classList.toggle('over', rem <= 0);
}

function tick() {
  if (state.submitted || !isSkill(state.screen)) return;
  const skill = state.screen;
  updateTimerDisplay();
  if (!state.timers[skill].expired && remaining(skill) <= 0) expireSection(skill);
}

function expireSection(skill) {
  const t = state.timers[skill];
  stopClock(skill);
  t.expired = true;
  t.used = TIME_LIMIT[skill];
  stopAllAudio();
  save();
  applyLocks();
  updateTimerDisplay();
  updateProgress();

  const allExpired = SKILLS.every(s => state.timers[s].expired);
  if (allExpired) {
    showModal('Time is up',
      '<p>Time is up for all sections. Your test will now be submitted automatically.</p>',
      [{ label: 'OK', cls: 'btn-primary', onClick: () => submitTest() }]);
    return;
  }
  const next = SKILLS.find(s => s !== skill && !state.timers[s].expired);
  showModal('Time is up for ' + SKILL_NAME[skill],
    '<p>Your answers in this section are now locked.</p>' +
    (next ? '<p>You can continue with the ' + SKILL_NAME[next] + ' section.</p>' : ''),
    next
      ? [{ label: 'Go to ' + SKILL_NAME[next], cls: 'btn-primary', onClick: () => go(next) },
         { label: 'Go to Review', onClick: () => go('review') }]
      : [{ label: 'Go to Review', cls: 'btn-primary', onClick: () => go('review') }]);
}

/* Disable all inputs of sections whose time has expired (or of everything after submit). */
function applyLocks() {
  SKILLS.forEach(skill => {
    const locked = state.submitted || state.timers[skill].expired;
    const screen = $('#screen-' + skill);
    screen.classList.toggle('locked', locked);
    $$('input[type=radio], textarea', screen).forEach(el => { el.disabled = locked; });
    const note = $('[data-lock="' + skill + '"]');
    if (note) note.hidden = !locked;
    if (locked) $$('.audio-btn', screen).forEach(b => { b.disabled = true; });
  });
}

/* ---------------------------------------------------------------------
   7. Answers, progress, warnings
   --------------------------------------------------------------------- */
function answeredCount(skill) {
  if (skill === 'writing') {
    return (state.writing.task1.trim() ? 1 : 0) + (state.writing.task2.trim() ? 1 : 0);
  }
  return Object.keys(state.answers[skill]).length;
}
function unansweredList(skill) {
  const out = [];
  for (let n = 1; n <= TOTAL_Q[skill]; n++) if (!state.answers[skill][n]) out.push(n);
  return out;
}

function updateProgress() {
  SKILLS.forEach(skill => {
    const done = answeredCount(skill), total = TOTAL_Q[skill];
    const label = $('[data-prog="' + skill + '"]');
    if (label) label.textContent = done + '/' + total;

    // warning banner for unanswered questions
    const warn = $('[data-warn="' + skill + '"]');
    if (warn) {
      const left = total - done;
      if (left > 0 && state.started) {
        const what = skill === 'writing' ? (left === 1 ? 'task' : 'tasks') : (left === 1 ? 'question' : 'questions');
        warn.textContent = 'Progress ' + done + '/' + total + '. You have ' + left + ' unanswered ' + what + '.';
        warn.hidden = false;
      } else warn.hidden = true;
    }
    // question palette (numbered buttons)
    if (skill !== 'writing') {
      $$('[data-palette="' + skill + '"] .pal-btn').forEach(b => {
        b.classList.toggle('done', !!state.answers[skill][b.dataset.q]);
      });
      $$('.q-card[data-skill="' + skill + '"]').forEach(card => {
        card.classList.toggle('answered', !!state.answers[skill][card.dataset.q]);
      });
    }
  });
}

function buildPalettes() {
  ['listening', 'reading'].forEach(skill => {
    const wrap = $('[data-palette="' + skill + '"]');
    for (let n = 1; n <= TOTAL_Q[skill]; n++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pal-btn'; b.dataset.q = n; b.textContent = n;
      b.setAttribute('aria-label', 'Go to question ' + n);
      b.addEventListener('click', () => scrollToQuestion(skill, n));
      wrap.appendChild(b);
    }
  });
}
function scrollToQuestion(skill, n) {
  const el = document.getElementById(skill + '-q' + n);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Restore saved answers into the DOM after load */
function restoreAnswers() {
  ['listening', 'reading'].forEach(skill => {
    Object.keys(state.answers[skill]).forEach(n => {
      const r = $('input[name="' + skill + '-' + n + '"][value="' + state.answers[skill][n] + '"]');
      if (r) r.checked = true;
    });
  });
  $('#writing-task1').value = state.writing.task1;
  $('#writing-task2').value = state.writing.task2;
  updateWordCount(1); updateWordCount(2);
}

/* ---------------------------------------------------------------------
   8. Audio (Listening)
   Rules simulated: plays once, no pause, no seeking, no replay, no download button.
   Browser limits (cannot be 100% enforced client-side):
   - The .mp3 URL is visible to anyone who opens developer tools, so a determined user
     can still download it. Truly preventing this needs server-side streaming.
   - If the page is refreshed while an audio is playing, that audio is treated as "played".
   --------------------------------------------------------------------- */
function stopAllAudio() {
  $$('.audio-box').forEach(box => {
    const a = $('audio', box);
    const key = 'p' + box.dataset.part;
    if (state.audio[key] === 'playing') { state.audio[key] = 'played'; }
    a.pause();
    setAudioPlayedUI(box);
  });
}
function setAudioPlayedUI(box) {
  const key = 'p' + box.dataset.part;
  if (state.audio[key] !== 'played') return;
  $('.audio-btn', box).disabled = true;
  $('.audio-btn', box).textContent = 'Audio played';
  $('.audio-bar-fill', box).style.width = '100%';
  $('.audio-status', box).textContent = 'Audio played';
  box.classList.add('played');
}

function initAudio() {
  $$('.audio-box').forEach(box => {
    const key = 'p' + box.dataset.part;
    const audio = $('audio', box);
    const btn = $('.audio-btn', box);
    const fill = $('.audio-bar-fill', box);
    const timeEl = $('.audio-time', box);
    const status = $('.audio-status', box);
    let lastTime = 0;
    let available = true;

    audio.controls = false;                         // no native controls (no seek bar / download menu)
    box.addEventListener('contextmenu', e => e.preventDefault());

    // Refreshed during playback => cannot replay: mark as played.
    if (state.audio[key] === 'playing') { state.audio[key] = 'played'; save(); }
    setAudioPlayedUI(box);

    // Missing file: show a clear message, keep everything else working.
    function markUnavailable() {
      if (state.audio[key] === 'played' || !(audio.error || audio.networkState === 3)) return;
      available = false;
      btn.disabled = true;
      box.classList.add('unavailable');
      status.textContent = 'Audio file not available.';
    }
    audio.addEventListener('error', markUnavailable);
    // The error event may already have fired before this script ran, so also check now and shortly after.
    markUnavailable();
    setTimeout(markUnavailable, 600);
    setTimeout(markUnavailable, 2000);

    btn.addEventListener('click', () => {
      if (!available || state.audio[key] === 'played' || state.audio[key] === 'playing') return;
      audio.play().then(() => {
        state.audio[key] = 'playing'; save();
        btn.disabled = true;
        btn.textContent = 'Playing…';
        status.textContent = 'Playing – it cannot be paused or replayed.';
        box.classList.add('playing');
      }).catch(() => { status.textContent = 'Audio file not available.'; });
    });

    audio.addEventListener('timeupdate', () => {
      if (!audio.seeking) lastTime = audio.currentTime;
      if (audio.duration) fill.style.width = Math.min(100, (audio.currentTime / audio.duration) * 100) + '%';
      const s = Math.floor(audio.currentTime);
      timeEl.textContent = Math.floor(s / 60) + ':' + pad(s % 60);
    });
    // No seeking: jump back to where playback was.
    audio.addEventListener('seeking', () => {
      if (Math.abs(audio.currentTime - lastTime) > 0.5) audio.currentTime = lastTime;
    });
    // No pausing: resume if something pauses it before the end.
    audio.addEventListener('pause', () => {
      const nearEnd = audio.duration && audio.currentTime >= audio.duration - 0.3;
      if (state.audio[key] === 'playing' && !audio.ended && !nearEnd) audio.play().catch(() => {});
    });
    audio.addEventListener('ended', () => {
      state.audio[key] = 'played'; save();
      box.classList.remove('playing');
      setAudioPlayedUI(box);
    });
  });
}

/* ---------------------------------------------------------------------
   9. Writing word count (support only – Writing is never auto-scored)
   --------------------------------------------------------------------- */
function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
function updateWordCount(task) {
  const text = $('#writing-task' + task).value;
  const n = countWords(text);
  $('#wc' + task).textContent = n;
  $('#wct' + task).classList.toggle('reached', n >= WRITING_TARGET[task]);
}

/* ---------------------------------------------------------------------
   10. Review, submit, scoring, result
   --------------------------------------------------------------------- */
function renderReview() {
  state.reviewVisited = true;
  const rows = [];
  ['listening', 'reading'].forEach(skill => {
    const total = TOTAL_Q[skill], done = answeredCount(skill), miss = unansweredList(skill);
    const links = miss.map(n => '<button type="button" class="link-btn" data-jump="' + skill + ':' + n + '">' + n + '</button>').join(' ');
    rows.push(
      '<div class="review-row"><div class="review-head"><h3>' + SKILL_NAME[skill] + '</h3>' +
      '<span class="review-time">Time remaining: ' + fmtClock(remaining(skill)) + (state.timers[skill].expired ? ' (time is up)' : '') + '</span></div>' +
      '<div class="review-stats"><div><strong>' + total + '</strong> questions</div>' +
      '<div><strong>' + done + '</strong> answered</div>' +
      '<div class="' + (miss.length ? 'bad' : 'good') + '"><strong>' + miss.length + '</strong> unanswered</div></div>' +
      (miss.length ? '<div class="review-missing">Unanswered: ' + links + '</div>' : '') + '</div>');
  });
  const w1 = countWords(state.writing.task1), w2 = countWords(state.writing.task2);
  const wl = (n, w) => state.writing['task' + n].trim() ? '<span class="good">Completed</span> (' + w + ' words)' : '<span class="bad">Not completed</span>';
  rows.push(
    '<div class="review-row"><div class="review-head"><h3>WRITING</h3>' +
    '<span class="review-time">Time remaining: ' + fmtClock(remaining('writing')) + (state.timers.writing.expired ? ' (time is up)' : '') + '</span></div>' +
    '<div class="review-stats review-writing"><div>Task 1 – ' + wl(1, w1) + '</div><div>Task 2 – ' + wl(2, w2) + '</div></div></div>');
  $('#review-body').innerHTML = rows.join('');
  $$('#review-body [data-jump]').forEach(b => b.addEventListener('click', () => {
    const parts = b.dataset.jump.split(':');
    go(parts[0]);
    setTimeout(() => scrollToQuestion(parts[0], parts[1]), 80);
  }));
  save();
}

function confirmSubmit() {
  const miss = unansweredList('listening').length + unansweredList('reading').length;
  let extra = '';
  if (miss) extra = '<p class="modal-extra">You still have ' + miss + ' unanswered question' + (miss === 1 ? '' : 's') + '.</p>';
  showModal('Submit test',
    '<p>Are you sure you want to submit your test? You cannot change your answers after submission.</p>' + extra,
    [{ label: 'Cancel' }, { label: 'Submit', cls: 'btn-primary', onClick: () => submitTest() }]);
}

/* Scoring: compares answers with ANSWER_KEY. Writing is NEVER scored automatically. */
function scoreSkill(skill) {
  const key = ANSWER_KEY[skill];
  const total = TOTAL_Q[skill];
  let configured = 0, correct = 0;
  for (let n = 1; n <= total; n++) {
    const k = String(key[n] || '').trim().toUpperCase();
    if (/^[A-D]$/.test(k)) {
      configured++;
      if (state.answers[skill][n] === k) correct++;
    }
  }
  return { correct: correct, total: total, configured: configured, complete: configured === total };
}

function submitTest() {
  if (state.submitted) return;
  SKILLS.forEach(stopClock);
  stopAllAudio();
  const L = scoreSkill('listening'), R = scoreSkill('reading');
  state.scores = {
    listening: L, reading: R,
    objective: (L.complete && R.complete) ? L.correct + R.correct : null,
    objectiveTotal: 75,
    writing: 'Waiting for teacher assessment'
  };
  state.submitTime = Date.now();
  state.submitted = true;
  state.screen = 'result';
  save();
  render();
  window.scrollTo(0, 0);
}

function renderResult() {
  const s = state.scores || { listening: scoreSkill('listening'), reading: scoreSkill('reading') };
  const val = (r, tot) => (r.complete ? r.correct : '—') + '/' + tot;
  const obj = (s.listening.complete && s.reading.complete) ? (s.listening.correct + s.reading.correct) : '—';
  const keyMissing = !(s.listening.complete && s.reading.complete);
  $('#result-body').innerHTML =
    '<div class="result-line"><span>Candidate</span><strong>' + escapeHtml(state.candidate.name) + '</strong></div>' +
    '<div class="result-grid">' +
    '<div class="score-box"><span>Listening</span><strong>' + val(s.listening, 35) + '</strong></div>' +
    '<div class="score-box"><span>Reading</span><strong>' + val(s.reading, 40) + '</strong></div>' +
    '<div class="score-box score-main"><span>Objective Score</span><strong>' + obj + '/75</strong></div></div>' +
    '<div class="result-line"><span>Writing</span><strong>Waiting for teacher assessment</strong></div>' +
    '<div class="result-line"><span>Completion time</span><strong>' + fmtDuration((state.submitTime || Date.now()) - state.startTime) + '</strong></div>' +
    (keyMissing ? '<p class="result-note">Answer key is not configured yet (see ANSWER_KEY in script.js), so objective scores cannot be calculated.</p>' : '');
}

function downloadResult() {
  const data = {
    candidate: state.candidate,
    startTime: state.startTime ? new Date(state.startTime).toISOString() : null,
    submitTime: state.submitTime ? new Date(state.submitTime).toISOString() : null,
    answers: state.answers,
    writing: state.writing,
    scores: state.scores,
    secondsUsed: { listening: Math.round(state.timers.listening.used), reading: Math.round(state.timers.reading.used), writing: Math.round(state.timers.writing.used) }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const safe = (state.candidate.name || 'candidate').replace(/[^\w\-]+/g, '_');
  a.href = URL.createObjectURL(blob);
  a.download = 'betma-test-' + safe + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function startNew() {
  showModal('Start a new test?',
    '<p>This will delete the saved answers and result stored in this browser. Download the result file first if you need it.</p>',
    [{ label: 'Cancel' }, { label: 'Delete & start new', cls: 'btn-primary', onClick: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      location.reload();
    } }]);
}

/* ---------------------------------------------------------------------
   11. Init
   --------------------------------------------------------------------- */
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }

function setTopbarHeight() {
  document.documentElement.style.setProperty('--topbar-h', $('#topbar').offsetHeight + 'px');
}

function init() {
  buildPalettes();
  restoreAnswers();
  initAudio();

  // Candidate form
  $('#info-form').addEventListener('submit', startTest);
  $('#btn-continue').addEventListener('click', () => go(state.lastSkill || 'listening'));

  // Navigation tabs
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.nav;
    if (t === 'submit') {            // SUBMIT always passes through the Review page first
      go('review');
      setTimeout(() => $('#btn-submit').focus(), 50);
    } else go(t);
  }));
  $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

  // Radio answers (event delegation)
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('input[type=radio][data-skill]')) {
      state.answers[el.dataset.skill][el.dataset.q] = el.value;
      save(); updateProgress();
    }
  });
  // Writing textareas
  $$('.writing-input').forEach(t => t.addEventListener('input', () => {
    const task = t.dataset.task;
    state.writing['task' + task] = t.value;
    updateWordCount(task);
    updateProgress();
    saveSoon();
  }));

  // Review / result buttons
  $('#btn-back-test').addEventListener('click', () => go(state.lastSkill || 'listening'));
  $('#btn-submit').addEventListener('click', confirmSubmit);
  $('#btn-download').addEventListener('click', downloadResult);
  $('#btn-new').addEventListener('click', startNew);

  window.addEventListener('beforeunload', save);
  window.addEventListener('resize', setTopbarHeight);

  // Resume a previous session
  if (state.submitted) state.screen = 'result';
  else if (!state.started) state.screen = 'information';
  render();
  setTopbarHeight();

  // Section clocks tick once per second; handles expiry after refresh as well.
  setInterval(tick, 500);
  tick();
}

document.addEventListener('DOMContentLoaded', init);
