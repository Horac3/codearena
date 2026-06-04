// apps/extension/src/panels/webview-content.ts
import * as vscode from 'vscode';

export function getWebviewContent(
  mode: string,
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
): string {
  const nonce = getNonce();
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'nonce-${nonce}' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             script-src 'nonce-${nonce}';
             connect-src https://api.codearena.never9to5ive.com wss://api.codearena.never9to5ive.com;"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" nonce="${nonce}"/>
  <title>CodeArena</title>
  <style nonce="${nonce}">
    :root {
      --bg:        #0d0f14;
      --bg2:       #13161e;
      --bg3:       #1a1e2a;
      --border:    #252a38;
      --border2:   #2e3447;
      --green:     #00e5a0;
      --green-dim: #00e5a033;
      --amber:     #f5a623;
      --amber-dim: #f5a62322;
      --red:       #ff4d6a;
      --red-dim:   #ff4d6a22;
      --blue:      #4d9fff;
      --purple:    #a78bfa;
      --text:      #e2e8f0;
      --text-muted:#6b7280;
      --text-dim:  #374151;
      --mono:      'JetBrains Mono', monospace;
      --sans:      'Space Grotesk', sans-serif;
      --radius:    8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ── Layout ── */
    #app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    .top-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .logo { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--green); letter-spacing: 0.08em; }
    .logo span { color: var(--text-muted); }

    .nav-tabs { display: flex; gap: 2px; margin-left: auto; }
    .nav-tab {
      font-family: var(--mono); font-size: 11px; padding: 5px 12px;
      border-radius: 5px; cursor: pointer; color: var(--text-muted);
      border: 1px solid transparent; background: none;
      transition: all 0.15s;
    }
    .nav-tab:hover { color: var(--text); background: var(--bg3); }
    .nav-tab.active { color: var(--green); border-color: var(--border2); background: var(--bg3); }

    .content { flex: 1; overflow-y: auto; padding: 20px; }

    /* ── Cards ── */
    .card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 12px;
    }
    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .card-title { font-weight: 600; font-size: 13px; color: var(--text); }
    .card-meta  { font-family: var(--mono); font-size: 11px; color: var(--text-muted); }

    /* ── Question ── */
    .question-stem {
      font-size: 14px; line-height: 1.7; color: var(--text);
      margin-bottom: 14px;
    }
    .code-block {
      background: var(--bg);
      border: 1px solid var(--border2);
      border-radius: 6px;
      padding: 12px 14px;
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.7;
      color: #9cdcfe;
      margin-bottom: 14px;
      overflow-x: auto;
      white-space: pre;
    }
    .kw  { color: #569cd6; }
    .fn  { color: #dcdcaa; }
    .str { color: #ce9178; }
    .num { color: #b5cea8; }
    .cm  { color: #6a9955; }

    /* ── Options ── */
    .options { display: flex; flex-direction: column; gap: 8px; }
    .option {
      display: flex; align-items: flex-start; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 6px; padding: 10px 12px;
      cursor: pointer; font-size: 13px;
      transition: border-color 0.15s, background 0.15s;
      user-select: none;
    }
    .option:hover { border-color: var(--blue); }
    .option.selected { border-color: var(--green); background: var(--green-dim); color: var(--green); }
    .option.correct  { border-color: var(--green); background: var(--green-dim); }
    .option.wrong    { border-color: var(--red);   background: var(--red-dim); color: var(--red); }
    .option-key {
      width: 22px; height: 22px; border-radius: 4px; flex-shrink: 0;
      background: var(--border2); display: flex; align-items: center;
      justify-content: center; font-family: var(--mono); font-size: 10px;
      color: var(--text-muted); font-weight: 600;
    }
    .option.selected .option-key,
    .option.correct  .option-key { background: var(--green); color: var(--bg); }
    .option.wrong    .option-key { background: var(--red);   color: #fff; }

    /* ── Progress ── */
    .progress-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .progress-dots { display: flex; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border2); }
    .dot.done    { background: var(--green); }
    .dot.current { background: var(--amber); }
    .xp-badge {
      margin-left: auto; font-family: var(--mono); font-size: 11px;
      color: var(--amber); background: var(--amber-dim);
      border: 1px solid var(--amber); border-radius: 20px;
      padding: 2px 10px;
    }

    /* ── Timer ── */
    .timer-bar-bg { height: 3px; background: var(--border2); border-radius: 2px; margin-bottom: 14px; }
    .timer-bar    { height: 100%; border-radius: 2px; background: var(--green); transition: width 1s linear, background 0.5s; }
    .timer-bar.warn  { background: var(--amber); }
    .timer-bar.urgent{ background: var(--red); }
    .timer-label { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }
    .timer-label.urgent { color: var(--red); }

    /* ── Buttons ── */
    .btn {
      font-family: var(--sans); font-size: 13px; font-weight: 500;
      padding: 8px 18px; border-radius: 6px; cursor: pointer;
      border: 1px solid; transition: opacity 0.15s, transform 0.1s;
    }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: var(--green); border-color: var(--green); color: var(--bg); }
    .btn-ghost   { background: none; border-color: var(--border2); color: var(--text-muted); }
    .btn-ghost:hover { color: var(--text); border-color: var(--text-muted); }
    .btn-danger  { background: var(--red-dim); border-color: var(--red); color: var(--red); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-row { display: flex; gap: 8px; margin-top: 14px; }

    /* ── Explanation ── */
    .explanation {
      background: var(--bg3); border-left: 3px solid var(--green);
      border-radius: 0 6px 6px 0; padding: 10px 14px;
      font-size: 13px; line-height: 1.6; color: var(--text-muted);
      margin-top: 12px; display: none;
    }
    .explanation.visible { display: block; }

    /* ── Duel ── */
    .duel-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: var(--bg2);
      border-bottom: 1px solid var(--border); margin-bottom: 16px;
    }
    .player-chip { display: flex; align-items: center; gap: 8px; }
    .avatar {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700;
    }
    .av-a { background: #0e639c; color: #fff; }
    .av-b { background: #6a2a8a; color: #fff; }
    .score-display {
      font-family: var(--mono); font-size: 24px; font-weight: 700;
      color: var(--text); text-align: center;
    }
    .score-sub { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 2px; }
    .duel-progress-bar {
      height: 6px; border-radius: 3px; overflow: hidden;
      background: var(--border2); margin: 12px 0; display: flex;
    }
    .dp-a { background: #0e639c; transition: width 0.4s; }
    .dp-b { background: #9333ea; transition: width 0.4s; }

    /* ── Invite box ── */
    .invite-box {
      border: 1px dashed var(--border2); border-radius: var(--radius);
      padding: 16px; text-align: center; margin-top: 12px;
    }
    .invite-link {
      font-family: var(--mono); font-size: 11px; color: var(--blue);
      background: var(--bg); border: 1px solid var(--border2);
      border-radius: 4px; padding: 8px 12px; margin: 10px 0;
      display: flex; justify-content: space-between; align-items: center;
    }
    .copy-btn { font-size: 11px; color: var(--text-muted); cursor: pointer; }
    .copy-btn:hover { color: var(--text); }

    /* ── Leaderboard ── */
    .lb-table { width: 100%; border-collapse: collapse; }
    .lb-table th { font-size: 11px; font-family: var(--mono); color: var(--text-muted); text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); letter-spacing: 0.06em; text-transform: uppercase; }
    .lb-table td { font-size: 12px; padding: 8px; border-bottom: 1px solid var(--border); }
    .lb-table tr:last-child td { border-bottom: none; }
    .lb-table tr.me td { color: var(--green); }
    .lb-table tr:hover td { background: var(--bg3); }
    .rank-medal { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 10px; font-weight: 700; }
    .rank-1 { background: #dcdcaa; color: #1e1e1e; }
    .rank-2 { background: #9d9d9d; color: #1e1e1e; }
    .rank-3 { background: #ce9178; color: #1e1e1e; }
    .rank-n { background: var(--border2); color: var(--text-muted); }
    .streak-fire { color: var(--amber); }
    .duel-chip {
      font-size: 10px; color: var(--blue); border: 1px solid var(--blue);
      border-radius: 10px; padding: 2px 8px; cursor: pointer;
      background: none; font-family: var(--sans);
      transition: background 0.15s;
    }
    .duel-chip:hover { background: #4d9fff22; }

    /* ── Streak banner ── */
    .streak-banner {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: var(--amber-dim);
      border: 1px solid var(--amber); border-radius: var(--radius);
      margin-bottom: 14px;
    }
    .streak-num { font-family: var(--mono); font-size: 28px; font-weight: 700; color: var(--amber); }
    .streak-label { font-size: 12px; color: var(--text-muted); }
    .level-chip { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--green); }

    /* ── Empty / loading ── */
    .loading { text-align: center; padding: 40px 0; color: var(--text-muted); font-size: 13px; }
    .loading::after { content: '...'; animation: dots 1.2s infinite; }
    @keyframes dots { 0%,20%{content:'.'} 40%,60%{content:'..'} 80%,100%{content:'...'} }

    /* ── Difficulty badge ── */
    .diff {
      font-family: var(--mono); font-size: 10px; padding: 2px 7px;
      border-radius: 10px; font-weight: 600;
    }
    .diff-1 { background: #00e5a022; color: var(--green); border: 1px solid var(--green); }
    .diff-2 { background: var(--amber-dim); color: var(--amber); border: 1px solid var(--amber); }
    .diff-3 { background: var(--red-dim); color: var(--red); border: 1px solid var(--red); }
    .topic-tag { font-family: var(--mono); font-size: 10px; color: var(--text-muted); padding: 2px 7px; background: var(--bg3); border-radius: 10px; }

    /* ── Completion screen ── */
    .completion { text-align: center; padding: 32px 16px; }
    .completion-score { font-family: var(--mono); font-size: 48px; font-weight: 700; color: var(--green); }
    .completion-sub { color: var(--text-muted); margin: 8px 0 24px; font-size: 13px; }
    .xp-earned { font-family: var(--mono); font-size: 20px; color: var(--amber); margin-bottom: 20px; }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
  </style>
</head>
<body>
<div id="app">
  <div class="top-bar">
    <div class="logo">CODE<span>ARENA</span> ⚡</div>
    <div class="nav-tabs">
      <button class="nav-tab ${mode === 'daily' ? 'active' : ''}"      onclick="navigate('daily')">Daily</button>
      <button class="nav-tab ${mode === 'duel-lobby' || mode === 'duel-active' ? 'active' : ''}" onclick="navigate('duel')">Duel</button>
      <button class="nav-tab ${mode === 'practice' ? 'active' : ''}"   onclick="navigate('practice')">Practice</button>
      <button class="nav-tab" onclick="navigate('leaderboard')">Ranks</button>
    </div>
  </div>
  <div class="content" id="content">
    <div class="loading">Loading</div>
  </div>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

// ── Navigation ────────────────────────────────────────────────────────────

function navigate(mode) {
  const types = { daily: 'OPEN_DAILY', duel: 'OPEN_DUEL_LOBBY', practice: 'OPEN_PRACTICE' };
  if (types[mode]) post(types[mode]);
}

// ── Message bus ───────────────────────────────────────────────────────────

function post(type, payload) { vscode.postMessage({ type, payload }); }

window.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  switch (type) {
    case 'DAILY_LOADED':    renderDaily(payload.questions); break;
    case 'DUEL_CREATED':    renderDuelLobby(payload); break;
    case 'DUEL_INVITE_LOADED': renderDuelWaiting(payload.invite); break;
    case 'DUEL_READY':      renderDuelReady(payload); break;
    case 'COUNTDOWN':       renderCountdown(payload.seconds); break;
    case 'QUESTION':        renderDuelQuestion(payload); break;
    case 'SCORE_UPDATE':    updateScores(payload); break;
    case 'DUEL_END':        renderDuelEnd(payload); break;
    case 'PLAYER_DISCONNECTED': renderDisconnected(payload); break;
    case 'EXECUTION_RESULT': renderExecutionResult(payload); break;
    case 'EXECUTION_ERROR':  renderExecutionError(payload); break;
  }
});

// ── Daily blitz ───────────────────────────────────────────────────────────

let state = { questions: [], current: 0, score: 0, answered: false, totalXp: 0 };

function renderDaily(questions) {
  state = { questions, current: 0, score: 0, answered: false, totalXp: 0 };
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.current];
  if (!q) { renderCompletion(); return; }

  const diffLabels = { 1: 'easy', 2: 'medium', 3: 'hard' };
  const c = document.getElementById('content');
  c.innerHTML = \`
    <div class="progress-row">
      <div class="progress-dots">
        \${state.questions.map((_, i) =>
          \`<div class="dot \${i < state.current ? 'done' : i === state.current ? 'current' : ''}"></div>\`
        ).join('')}
      </div>
      <div class="xp-badge">+\${state.totalXp} XP</div>
    </div>
    <div class="timer-bar-bg"><div class="timer-bar" id="tbar"></div></div>
    <div class="card">
      <div class="card-header">
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="topic-tag">\${q.topic}</span>
          <span class="diff diff-\${q.difficulty}">\${diffLabels[q.difficulty]}</span>
        </div>
        <span class="card-meta" id="timer-label">1:00</span>
      </div>
      <div class="question-stem">\${q.stem}</div>
      \${q.code ? \`<div class="code-block">\${escHtml(q.code)}</div>\` : ''}
      <div class="options" id="opts">
        \${q.options.map((opt, i) => \`
          <div class="option" data-i="\${i}" onclick="selectMCQ(this, \${i})">
            <div class="option-key">\${String.fromCharCode(65+i)}</div>
            <span>\${escHtml(opt)}</span>
          </div>\`).join('')}
      </div>
      <div class="explanation" id="exp">\${escHtml(q.explanation)}</div>
      <div class="btn-row">
        <button class="btn btn-primary" id="next-btn" disabled onclick="nextQuestion()">
          \${state.current < state.questions.length - 1 ? 'Next question →' : 'See results'}
        </button>
        <button class="btn btn-ghost" onclick="skipQuestion()">Skip</button>
      </div>
    </div>\`;
  startTimer(60);
}

function selectMCQ(el, choice) {
  if (state.answered) return;
  state.answered = true;
  stopTimer();

  const q = state.questions[state.current];
  const correct = q.answer === choice;

  document.querySelectorAll('.option').forEach((o, i) => {
    if (i === q.answer) o.classList.add('correct');
    else if (i === choice && !correct) o.classList.add('wrong');
    o.style.pointerEvents = 'none';
  });

  document.getElementById('exp').classList.add('visible');

  if (correct) {
    state.score++;
    const xp = 50 + Math.round(30 * Math.max(0, 1 - elapsedSecs / 60));
    state.totalXp += xp;
  }

  document.getElementById('next-btn').disabled = false;
}

function nextQuestion() {
  state.current++;
  state.answered = false;
  renderQuestion();
}

function skipQuestion() {
  state.current++;
  state.answered = false;
  renderQuestion();
}

function renderCompletion() {
  const pct = Math.round((state.score / state.questions.length) * 100);
  document.getElementById('content').innerHTML = \`
    <div class="completion">
      <div class="completion-score">\${state.score}/\${state.questions.length}</div>
      <div class="completion-sub">You answered \${pct}% correctly</div>
      <div class="xp-earned">+\${state.totalXp} XP earned</div>
      <button class="btn btn-primary" onclick="post('OPEN_DAILY')">Play again tomorrow</button>
    </div>\`;
}

// ── Duel lobby ────────────────────────────────────────────────────────────

function renderDuelLobby(data) {
  const c = document.getElementById('content');
  if (data && data.inviteLink) {
    c.innerHTML = \`
      <div class="card">
        <div class="card-header"><div class="card-title">Duel created ⚔</div></div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Share this link with your opponent. The duel starts when they accept.</p>
        <div class="invite-link">
          <span>\${data.inviteLink}</span>
          <span class="copy-btn" onclick="copyLink('\${data.inviteLink}')">Copy</span>
        </div>
        <p style="font-size:11px;color:var(--text-muted);">VS Code link also copied to clipboard.</p>
      </div>\`;
    return;
  }

  const topics = ['mixed','dsa','systems','cs-fundamentals','networking'];
  c.innerHTML = \`
    <div class="card">
      <div class="card-header"><div class="card-title">Create a duel ⚔</div></div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Topic</label>
        <select id="duel-topic" style="width:100%;background:var(--bg3);color:var(--text);border:1px solid var(--border2);border-radius:6px;padding:8px 10px;font-size:13px;">
          \${topics.map(t => \`<option value="\${t}">\${t}</option>\`).join('')}
        </select>
      </div>
      <div style="margin-bottom:18px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Rounds</label>
        <div style="display:flex;gap:8px;">
          \${[5,7].map(r => \`<button class="btn btn-ghost rounds-btn" data-r="\${r}" onclick="setRounds(this,\${r})">\${r} rounds</button>\`).join('')}
        </div>
      </div>
      <button class="btn btn-primary" onclick="createDuel()">Generate invite link →</button>
    </div>\`;

  document.querySelector('[data-r="7"]').classList.add('active');
  document.querySelector('[data-r="7"]').style.borderColor = 'var(--green)';
  document.querySelector('[data-r="7"]').style.color = 'var(--green)';
  window._duelRounds = 7;
}

function setRounds(el, r) {
  document.querySelectorAll('.rounds-btn').forEach(b => {
    b.style.borderColor = ''; b.style.color = '';
  });
  el.style.borderColor = 'var(--green)';
  el.style.color = 'var(--green)';
  window._duelRounds = r;
}

function createDuel() {
  const topic = document.getElementById('duel-topic').value;
  post('CREATE_DUEL', { topic, rounds: window._duelRounds || 7 });
}

function copyLink(link) {
  navigator.clipboard.writeText(link).catch(() => {});
}

// ── Duel in-progress ──────────────────────────────────────────────────────

let duelState = { roomId: null, scores: {}, players: [], total: 0 };

function renderDuelWaiting(invite) {
  duelState.roomId = invite.id;
  document.getElementById('content').innerHTML = \`
    <div class="card">
      <div class="card-header"><div class="card-title">Joining duel…</div></div>
      <p style="font-size:13px;color:var(--text-muted);">Connecting to room. Waiting for host to start…</p>
    </div>\`;
}

function renderDuelReady(data) {
  duelState.players = data.players;
  duelState.players.forEach(p => { duelState.scores[p.userId] = 0; });
  document.getElementById('content').innerHTML = \`
    <div class="loading">Get ready</div>\`;
}

let cdInterval;
function renderCountdown(seconds) {
  let s = seconds;
  document.getElementById('content').innerHTML = \`
    <div style="text-align:center;padding:60px 0;">
      <div style="font-family:var(--mono);font-size:72px;font-weight:700;color:var(--green)" id="cd">\${s}</div>
      <div style="color:var(--text-muted);margin-top:12px;">Get ready…</div>
    </div>\`;
  cdInterval = setInterval(() => {
    s--;
    const el = document.getElementById('cd');
    if (el) el.textContent = s > 0 ? s : 'GO!';
    if (s <= 0) clearInterval(cdInterval);
  }, 1000);
}

function renderDuelQuestion(data) {
  clearInterval(cdInterval);
  const { question: q, index, total } = data;
  duelState.total = total;
  duelState.currentQ = q;

  const [pA, pB] = duelState.players;
  const sA = duelState.scores[pA?.userId] || 0;
  const sB = duelState.scores[pB?.userId] || 0;
  const totalScore = sA + sB || 1;

  document.getElementById('content').innerHTML = \`
    <div class="duel-header">
      <div class="player-chip">
        <div class="avatar av-a">\${(pA?.userId||'?').slice(0,2).toUpperCase()}</div>
        <span style="font-size:12px;color:#4ec9b0">\${pA?.userId||'You'}</span>
      </div>
      <div>
        <div class="score-display">\${sA} · \${sB}</div>
        <div class="score-sub">Q\${index+1} of \${total}</div>
      </div>
      <div class="player-chip">
        <div class="avatar av-b">\${(pB?.userId||'?').slice(0,2).toUpperCase()}</div>
        <span style="font-size:12px;color:#c586c0">\${pB?.userId||'Opponent'}</span>
      </div>
    </div>
    <div class="duel-progress-bar">
      <div class="dp-a" id="dpa" style="width:\${Math.round(sA/totalScore*100)}%"></div>
      <div class="dp-b" id="dpb" style="width:\${Math.round(sB/totalScore*100)}%"></div>
    </div>
    <div class="card">
      <div class="timer-bar-bg"><div class="timer-bar" id="tbar"></div></div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;">
        <span class="topic-tag">\${q.topic}</span>
        <span class="timer-label" id="timer-label">1:00</span>
      </div>
      <div class="question-stem">\${q.stem}</div>
      \${q.code ? \`<div class="code-block">\${escHtml(q.code)}</div>\` : ''}
      <div class="options" id="opts">
        \${(q.options||[]).map((opt, i) => \`
          <div class="option" data-i="\${i}" onclick="submitDuelAnswer(\${i})">
            <div class="option-key">\${String.fromCharCode(65+i)}</div>
            <span>\${escHtml(opt)}</span>
          </div>\`).join('')}
      </div>
    </div>\`;

  startTimer(60, () => {
    post('QUESTION_TIMEOUT', { roomId: duelState.roomId, questionId: q.id });
  });
}

function submitDuelAnswer(choice) {
  if (!duelState.currentQ) return;
  document.querySelectorAll('.option').forEach(o => { o.classList.add('selected'); o.style.pointerEvents = 'none'; });
  document.querySelectorAll('.option')[choice].classList.add('selected');
  stopTimer();
  post('SUBMIT_ANSWER', {
    roomId: duelState.roomId,
    questionId: duelState.currentQ.id,
    choice,
    elapsedMs: elapsedSecs * 1000,
  });
}

function updateScores(scores) {
  Object.assign(duelState.scores, scores);
  const [pA, pB] = duelState.players;
  const sA = scores[pA?.userId] || 0;
  const sB = scores[pB?.userId] || 0;
  const t = sA + sB || 1;
  const dpa = document.getElementById('dpa');
  const dpb = document.getElementById('dpb');
  if (dpa) dpa.style.width = Math.round(sA/t*100) + '%';
  if (dpb) dpb.style.width = Math.round(sB/t*100) + '%';
}

function renderDuelEnd(data) {
  stopTimer();
  const [pA, pB] = duelState.players;
  const sA = data.scores[pA?.userId] || 0;
  const sB = data.scores[pB?.userId] || 0;
  const winner = data.winner === 'draw' ? 'Draw!' : data.winner === (pA?.userId) ? 'You win! 🎉' : 'Opponent wins';
  document.getElementById('content').innerHTML = \`
    <div class="completion">
      <div class="completion-score">\${winner}</div>
      <div style="font-family:var(--mono);font-size:20px;margin:16px 0;color:var(--text)">\${sA} <span style="color:var(--text-muted)">vs</span> \${sB}</div>
      <div class="xp-earned">+\${data.winner !== 'draw' ? (sA > sB ? '100' : '20') : '50'} XP</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="btn btn-primary" onclick="post('OPEN_DUEL_LOBBY')">Rematch</button>
        <button class="btn btn-ghost" onclick="post('OPEN_DAILY')">Daily blitz</button>
      </div>
    </div>\`;
}

function renderDisconnected(data) {
  document.getElementById('content').innerHTML = \`
    <div class="completion">
      <div style="font-size:32px;margin-bottom:16px;">⚡</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Opponent disconnected</div>
      <div style="color:var(--text-muted);margin-bottom:24px;font-size:13px;">\${data.message}</div>
      <button class="btn btn-primary" onclick="post('OPEN_DUEL_LOBBY')">Back to lobby</button>
    </div>\`;
}

// ── Execution results (coding challenges) ─────────────────────────────────

function renderExecutionResult(r) {
  const existing = document.getElementById('exec-results');
  const html = \`
    <div id="exec-results" style="margin-top:12px;">
      <div style="font-family:var(--mono);font-size:12px;margin-bottom:8px;color:\${r.failed===0?'var(--green)':'var(--amber)'}">
        \${r.passed}/\${r.total} tests passed · \${r.executionMs}ms · +\${r.xpAwarded} XP
      </div>
      \${r.results.map(t => \`
        <div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-family:var(--mono);font-size:11px;color:\${t.passed?'var(--green)':'var(--red)'}">\${t.passed?'✓':'✗'}</span>
          <div>
            <div style="font-size:12px;">\${escHtml(t.name)}</div>
            \${t.error ? \`<div style="font-family:var(--mono);font-size:11px;color:var(--red);margin-top:3px;">\${escHtml(t.error)}</div>\` : ''}
          </div>
        </div>\`).join('')}
    </div>\`;
  if (existing) existing.outerHTML = html;
  else document.getElementById('content').insertAdjacentHTML('beforeend', html);
}

function renderExecutionError(data) {
  document.getElementById('content').insertAdjacentHTML('beforeend',
    \`<div style="margin-top:12px;font-family:var(--mono);font-size:12px;color:var(--red);background:var(--red-dim);border:1px solid var(--red);border-radius:6px;padding:10px 12px;">\${escHtml(data.message)}</div>\`);
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
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      label.textContent = m + ':' + String(s).padStart(2,'0');
      label.className = 'timer-label' + (remaining <= 10 ? ' urgent' : '');
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
  const pct = Math.round((remaining / total) * 100);
  bar.style.width = pct + '%';
  bar.className = 'timer-bar' + (pct <= 25 ? ' urgent' : pct <= 50 ? ' warn' : '');
}

// ── Utils ─────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
</script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
