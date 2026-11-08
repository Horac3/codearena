// apps/extension/media/arena.js
// Webview script for the CodeArena panel. Loaded with the page's CSP nonce.
//
// The panel's CSP blocks inline event handlers (onclick="…"), so every clickable element
// carries data-action (plus data-* arguments) and one delegated listener below dispatches it.
// All text that comes from the server or from question files goes through escHtml().

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  const content = document.getElementById('content');

  function post(type, payload) { vscode.postMessage({ type, payload }); }

  // ── Click dispatch ────────────────────────────────────────────────────────

  const actions = {
    nav: (el) => post({ daily: 'OPEN_DAILY', duel: 'OPEN_DUEL_LOBBY', practice: 'OPEN_PRACTICE', weekly: 'OPEN_WEEKLY', rank: 'OPEN_RANK' }[el.dataset.mode]),
    'daily-choose': (el) => dailyChoose(Number(el.dataset.i)),
    'daily-next': () => dailyNext(),
    'daily-skip': () => dailySkip(),
    'set-rounds': (el) => setRounds(el, Number(el.dataset.r)),
    'create-duel': () => createDuel(),
    'copy-link': (el) => navigator.clipboard.writeText(el.dataset.link || '').catch(() => {}),
    'duel-answer': (el) => submitDuelAnswer(Number(el.dataset.i)),
    'weekly-choose': (el) => weeklyChoose(Number(el.dataset.i)),
    'weekly-next': () => weeklyNext(),
    'open-daily': () => post('OPEN_DAILY'),
    'open-duel-lobby': () => post('OPEN_DUEL_LOBBY'),
  };

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled || el.classList.contains('locked')) return;
    const handler = actions[el.dataset.action];
    if (handler) handler(el);
  });

  // ── Message bus ───────────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};
    switch (type) {
      case 'DAILY_LOADED':        renderDaily(payload.questions); break;
      case 'DAILY_RESULT':        renderDailyResult(payload); break;
      case 'DAILY_ERROR':         renderMessage('Daily Blitz', payload.message); break;
      case 'DUEL_LOBBY':          renderDuelLobby(); break;
      case 'DUEL_CREATED':        renderDuelCreated(payload); break;
      case 'DUEL_JOINING':        renderDuelWaiting(); break;
      case 'DUEL_ERROR':          renderMessage('Duel', payload.message, 'open-duel-lobby', 'Back to lobby'); break;
      case 'DUEL_READY':          renderDuelReady(payload); break;
      case 'COUNTDOWN':           renderCountdown(payload.seconds); break;
      case 'QUESTION':            renderDuelQuestion(payload); break;
      case 'SCORE_UPDATE':        updateScores(payload); break;
      case 'DUEL_END':            renderDuelEnd(payload); break;
      case 'PLAYER_DISCONNECTED': showDuelBanner(payload.message); break;
      case 'PLAYER_RECONNECTED':  showDuelBanner(''); break;
      case 'WEEKLY_LOADED':       renderWeekly(payload); break;
      case 'WEEKLY_RESULT':       renderWeeklyResult(payload); break;
      case 'RANK_LOADED':         renderRank(payload); break;
      case 'PRACTICE':            renderMessage('Practice', 'Practice mode is coming soon. Try the Daily Blitz or challenge someone to a duel.', 'open-daily', 'Daily Blitz'); break;
      case 'ERROR':               renderMessage('Something went wrong', payload.message); break;
    }
  });

  // ── Shared rendering ─────────────────────────────────────────────────────

  const diffLabels = { 1: 'easy', 2: 'medium', 3: 'hard' };

  function questionBody(q, action, total, index) {
    return `
      <div class="card-header">
        <div class="row-gap">
          <span class="topic-tag">${escHtml(q.topic)}</span>
          <span class="diff diff-${Number(q.difficulty) || 1}">${diffLabels[q.difficulty] || ''}</span>
        </div>
        <span class="card-meta" id="timer-label">${total ? `Q${index + 1} of ${total}` : ''}</span>
      </div>
      <div class="question-stem">${escHtml(q.stem)}</div>
      ${q.code ? `<div class="code-block">${escHtml(q.code)}</div>` : ''}
      <div class="options" id="opts">
        ${(q.options || []).map((opt, i) => `
          <div class="option" data-action="${action}" data-i="${i}">
            <div class="option-key">${String.fromCharCode(65 + i)}</div>
            <span>${escHtml(opt)}</span>
          </div>`).join('')}
      </div>`;
  }

  function lockOptions(selected) {
    document.querySelectorAll('.option').forEach((o, i) => {
      o.classList.add('locked');
      if (i === selected) o.classList.add('selected');
    });
  }

  function renderMessage(title, message, action, label) {
    stopTimer();
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">${escHtml(title)}</div></div>
        <p class="muted">${escHtml(message)}</p>
        ${action ? `<div class="btn-row"><button class="btn btn-primary" data-action="${action}">${escHtml(label)}</button></div>` : ''}
      </div>`;
  }

  // ── Daily blitz ───────────────────────────────────────────────────────────
  // Answers are collected here and scored by the server on submit (the client never has the key).

  let daily = { questions: [], current: 0, answers: {}, answered: false };

  function renderDaily(questions) {
    if (!questions || questions.length === 0) {
      renderMessage('Daily Blitz', 'No questions are available today. Check back later.');
      return;
    }
    daily = { questions, current: 0, answers: {}, answered: false };
    renderDailyQuestion();
  }

  function renderDailyQuestion() {
    const q = daily.questions[daily.current];
    if (!q) { submitDaily(); return; }
    const last = daily.current === daily.questions.length - 1;
    content.innerHTML = `
      <div class="progress-row">
        <div class="progress-dots">
          ${daily.questions.map((_, i) =>
            `<div class="dot ${i < daily.current ? 'done' : i === daily.current ? 'current' : ''}"></div>`).join('')}
        </div>
      </div>
      <div class="timer-bar-bg"><div class="timer-bar" id="tbar"></div></div>
      <div class="card">
        ${questionBody(q, 'daily-choose')}
        <div class="btn-row">
          <button class="btn btn-primary" id="next-btn" data-action="daily-next" disabled>
            ${last ? 'Submit answers' : 'Next question →'}
          </button>
          <button class="btn btn-ghost" data-action="daily-skip">Skip</button>
        </div>
      </div>`;
    startTimer(60, () => dailySkip());
  }

  function dailyChoose(choice) {
    if (daily.answered) return;
    daily.answered = true;
    stopTimer();
    daily.answers[daily.questions[daily.current].id] = choice;
    lockOptions(choice);
    document.getElementById('next-btn').disabled = false;
  }

  function dailyNext() {
    daily.current++;
    daily.answered = false;
    renderDailyQuestion();
  }

  function dailySkip() {
    stopTimer();
    dailyNext();
  }

  function submitDaily() {
    stopTimer();
    content.innerHTML = '<div class="loading">Scoring your answers</div>';
    post('DAILY_SUBMIT', { answers: daily.answers });
  }

  function renderDailyResult(r) {
    const byId = Object.fromEntries(daily.questions.map((q) => [q.id, q]));
    content.innerHTML = `
      <div class="completion">
        <div class="completion-score">${r.score}/${r.total}</div>
        <div class="completion-sub">🔥 ${r.streak}-day streak</div>
        <div class="xp-earned">+${r.pointsEarned} XP earned</div>
      </div>
      ${(r.results || []).map((res) => {
        const q = byId[res.questionId] || {};
        const opts = q.options || [];
        return `
        <div class="card">
          <div class="question-stem">${res.correct ? '✓' : '✗'} ${escHtml(q.stem || res.questionId)}</div>
          <p class="muted">Your answer: ${res.choice === null ? 'skipped' : escHtml(opts[res.choice])}
            ${res.correct ? '' : ` · Correct: ${escHtml(opts[res.answer])}`}</p>
          <div class="explanation visible">${escHtml(res.explanation)}</div>
        </div>`;
      }).join('')}
      <div class="btn-row"><button class="btn btn-primary" data-action="open-duel-lobby">Challenge someone ⚔</button></div>`;
  }

  // ── Duel lobby ────────────────────────────────────────────────────────────

  let duelRounds = 7;

  function renderDuelLobby() {
    const topics = ['mixed', 'dsa', 'systems', 'cs-fundamentals', 'networking'];
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">Create a duel ⚔</div></div>
        <div class="field">
          <label class="label" for="duel-topic">Topic</label>
          <select id="duel-topic" class="select">
            ${topics.map((t) => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <span class="label">Rounds</span>
          <div class="row-gap">
            ${[5, 7].map((r) => `<button class="btn btn-ghost rounds-btn ${r === duelRounds ? 'active' : ''}" data-action="set-rounds" data-r="${r}">${r} rounds</button>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary" data-action="create-duel">Generate invite link →</button>
      </div>`;
  }

  function setRounds(el, r) {
    document.querySelectorAll('.rounds-btn').forEach((b) => b.classList.remove('active'));
    el.classList.add('active');
    duelRounds = r;
  }

  function createDuel() {
    const topic = document.getElementById('duel-topic').value;
    content.innerHTML = '<div class="loading">Creating duel</div>';
    post('CREATE_DUEL', { topic, rounds: duelRounds });
  }

  function renderDuelCreated(data) {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">Duel created ⚔</div></div>
        <p class="muted">Share this link with your opponent. Keep this panel open: the duel starts when they accept.</p>
        <div class="invite-link">
          <span>${escHtml(data.inviteLink)}</span>
          <span class="copy-btn" data-action="copy-link" data-link="${escHtml(data.inviteLink)}">Copy</span>
        </div>
        <p class="muted small">The link is also on your clipboard.</p>
      </div>`;
  }

  // ── Duel in progress ──────────────────────────────────────────────────────

  let duel = { you: null, players: [], scores: {}, currentQ: null };

  function renderDuelWaiting() {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">Joining duel…</div></div>
        <p class="muted">Connecting to the room.</p>
      </div>`;
  }

  function renderDuelReady(data) {
    duel.you = data.you;
    duel.players = data.players || [];
    duel.players.forEach((p) => { duel.scores[p.userId] = p.score || 0; });
    content.innerHTML = '<div class="loading">Get ready</div>';
  }

  function me() { return duel.players.find((p) => p.userId === duel.you) || duel.players[0] || {}; }
  function opponent() { return duel.players.find((p) => p.userId !== duel.you) || {}; }

  let cdInterval;
  function renderCountdown(seconds) {
    let s = seconds;
    content.innerHTML = `
      <div class="countdown">
        <div class="countdown-num" id="cd">${s}</div>
        <div class="muted">Get ready…</div>
      </div>`;
    clearInterval(cdInterval);
    cdInterval = setInterval(() => {
      s--;
      const el = document.getElementById('cd');
      if (el) el.textContent = s > 0 ? s : 'GO!';
      if (s <= 0) clearInterval(cdInterval);
    }, 1000);
  }

  function renderDuelQuestion(data) {
    clearInterval(cdInterval);
    const { question: q, index, total, timerMs } = data;
    duel.currentQ = q;
    const a = me(), b = opponent();
    content.innerHTML = `
      <div class="duel-header">
        <div class="player-chip">
          <div class="avatar av-a">${escHtml((a.username || '?').slice(0, 2).toUpperCase())}</div>
          <span class="name-a">${escHtml(a.username || 'You')} (you)</span>
        </div>
        <div>
          <div class="score-display" id="score-display"></div>
          <div class="score-sub">Q${index + 1} of ${total}</div>
        </div>
        <div class="player-chip">
          <div class="avatar av-b">${escHtml((b.username || '?').slice(0, 2).toUpperCase())}</div>
          <span class="name-b">${escHtml(b.username || 'Opponent')}</span>
        </div>
      </div>
      <div class="duel-banner" id="duel-banner"></div>
      <div class="duel-progress-bar">
        <div class="dp-a" id="dpa"></div>
        <div class="dp-b" id="dpb"></div>
      </div>
      <div class="card">
        <div class="timer-bar-bg"><div class="timer-bar" id="tbar"></div></div>
        ${questionBody(q, 'duel-answer')}
      </div>`;
    updateScores(duel.scores);
    // Display only: the server runs the real timer and moves on when it expires.
    startTimer(Math.max(1, Math.round((timerMs || 60000) / 1000)));
  }

  function submitDuelAnswer(choice) {
    if (!duel.currentQ) return;
    lockOptions(choice);
    stopTimer();
    post('SUBMIT_ANSWER', { questionId: duel.currentQ.id, choice, elapsedMs: elapsedSecs * 1000 });
    duel.currentQ = null;
  }

  function updateScores(scores) {
    Object.assign(duel.scores, scores || {});
    const sA = duel.scores[me().userId] || 0;
    const sB = duel.scores[opponent().userId] || 0;
    const t = sA + sB || 1;
    const dpa = document.getElementById('dpa');
    const dpb = document.getElementById('dpb');
    const sd = document.getElementById('score-display');
    if (dpa) dpa.style.width = Math.round((sA / t) * 100) + '%';
    if (dpb) dpb.style.width = Math.round((sB / t) * 100) + '%';
    if (sd) sd.textContent = sA + ' · ' + sB;
  }

  function showDuelBanner(message) {
    const el = document.getElementById('duel-banner');
    if (el) {
      el.textContent = message || '';
      el.classList.toggle('visible', !!message);
    }
  }

  function renderDuelEnd(data) {
    stopTimer();
    const you = duel.you;
    const sA = data.scores[me().userId] || 0;
    const sB = data.scores[opponent().userId] || 0;
    const headline = data.winner === 'draw' ? 'Draw!' : data.winner === you ? 'You win! 🎉' : 'Opponent wins';
    const points = (data.pointsAwarded || {})[you];
    const sub = data.reason === 'forfeit' ? (data.winner === you ? 'Your opponent forfeited.' : 'You forfeited by leaving.') : '';
    content.innerHTML = `
      <div class="completion">
        <div class="completion-score">${headline}</div>
        <div class="versus">${sA} <span class="muted">vs</span> ${sB}</div>
        ${sub ? `<div class="completion-sub">${escHtml(sub)}</div>` : ''}
        ${typeof points === 'number' ? `<div class="xp-earned">${points >= 0 ? '+' : ''}${points} rank points</div>` : ''}
        <div class="btn-row center">
          <button class="btn btn-primary" data-action="open-duel-lobby">Rematch</button>
          <button class="btn btn-ghost" data-action="open-daily">Daily blitz</button>
        </div>
      </div>`;
  }

  // ── Weekly competition ───────────────────────────────────────────────────

  let weekly = { questions: [], current: 0, answers: {}, answered: false, label: '' };

  function renderWeekly(data) {
    if (!data || !data.active) {
      renderMessage('Weekly competition', 'No competition is running right now. A new one opens every Thursday.');
      return;
    }
    weekly = { questions: data.questions || [], current: 0, answers: {}, answered: false, label: data.competition.themeLabel };
    renderWeeklyQuestion();
  }

  function renderWeeklyQuestion() {
    const q = weekly.questions[weekly.current];
    if (!q) {
      content.innerHTML = '<div class="loading">Submitting</div>';
      post('WEEKLY_SUBMIT', { answers: weekly.answers });
      return;
    }
    content.innerHTML = `
      <div class="card">
        <p class="muted small">${escHtml(weekly.label)}</p>
        ${questionBody(q, 'weekly-choose', weekly.questions.length, weekly.current)}
        <div class="btn-row">
          <button class="btn btn-primary" id="next-btn" data-action="weekly-next" disabled>
            ${weekly.current === weekly.questions.length - 1 ? 'Submit answers' : 'Next question →'}
          </button>
        </div>
      </div>`;
  }

  function weeklyChoose(choice) {
    if (weekly.answered) return;
    weekly.answered = true;
    weekly.answers[weekly.questions[weekly.current].id] = choice;
    lockOptions(choice);
    document.getElementById('next-btn').disabled = false;
  }

  function weeklyNext() {
    weekly.current++;
    weekly.answered = false;
    renderWeeklyQuestion();
  }

  function renderWeeklyResult(r) {
    renderMessage('Weekly competition', `You scored ${r.score}/${r.total}. Final ranks and points are announced when the competition closes on Monday.`);
  }

  // ── Rank profile ─────────────────────────────────────────────────────────

  function renderRank(r) {
    content.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">${escHtml(r.tierTitle)}</div><span class="card-meta">Tier ${r.rankTier}</span></div>
        <div class="xp-earned">${r.rankPoints} rank points</div>
        <div class="timer-bar-bg"><div class="timer-bar" id="rank-bar"></div></div>
        <p class="muted">${r.nextTierTitle ? `${r.progressToNext}% of the way to ${escHtml(r.nextTierTitle)} (${r.nextTierPoints} pts)` : 'Top tier reached.'}</p>
        <p class="muted">🔥 ${r.streak}-day streak · ${r.weeklyXp} XP this week</p>
      </div>`;
    const bar = document.getElementById('rank-bar');
    if (bar) bar.style.width = Math.max(0, Math.min(100, r.progressToNext)) + '%';
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  let timerInterval, elapsedSecs = 0;

  function startTimer(seconds, onExpire) {
    elapsedSecs = 0;
    let remaining = seconds;
    updateTimerBar(remaining, seconds);
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remaining--;
      elapsedSecs++;
      updateTimerBar(remaining, seconds);
      const label = document.getElementById('timer-label');
      if (label) {
        const m = Math.floor(Math.max(remaining, 0) / 60);
        const s = Math.max(remaining, 0) % 60;
        label.textContent = m + ':' + String(s).padStart(2, '0');
        label.classList.toggle('urgent', remaining <= 10);
      }
      if (remaining <= 0) {
        clearInterval(timerInterval);
        if (onExpire) onExpire();
      }
    }, 1000);
  }

  function stopTimer() { clearInterval(timerInterval); }

  function updateTimerBar(remaining, total) {
    const bar = document.getElementById('tbar');
    if (!bar) return;
    const pct = Math.max(0, Math.round((remaining / total) * 100));
    bar.style.width = pct + '%';
    bar.className = 'timer-bar' + (pct <= 25 ? ' urgent' : pct <= 50 ? ' warn' : '');
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  post('READY');
})();
