// apps/extension/src/panels/webview-content.ts
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

export function getWebviewContent(
  mode: string,
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
): string {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'arena.js'),
  );
  const tab = (name: string, label: string, active: boolean) =>
    `<button class="nav-tab ${active ? 'active' : ''}" data-action="nav" data-mode="${name}">${label}</button>`;
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'nonce-${nonce}' https://fonts.googleapis.com;
             font-src https://fonts.gstatic.com;
             img-src ${webview.cspSource} https: data:;
             script-src 'nonce-${nonce}' ${webview.cspSource};"/>
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

    /* ── Helpers (no inline style attributes: the CSP blocks them) ── */
    .row-gap { display: flex; gap: 8px; align-items: center; }
    .muted { color: var(--text-muted); font-size: 13px; margin-bottom: 12px; }
    .small { font-size: 11px; }
    .field { margin-bottom: 16px; }
    .label { font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 6px; }
    .select { width: 100%; background: var(--bg3); color: var(--text); border: 1px solid var(--border2); border-radius: 6px; padding: 8px 10px; font-size: 13px; }
    .rounds-btn.active { border-color: var(--green); color: var(--green); }
    .option.locked { pointer-events: none; }
    .countdown { text-align: center; padding: 60px 0; }
    .countdown-num { font-family: var(--mono); font-size: 72px; font-weight: 700; color: var(--green); margin-bottom: 12px; }
    .versus { font-family: var(--mono); font-size: 20px; margin: 16px 0; color: var(--text); }
    .name-a { font-size: 12px; color: #4ec9b0; }
    .name-b { font-size: 12px; color: #c586c0; }
    .btn-row.center { justify-content: center; }
    .duel-banner { display: none; margin-bottom: 10px; padding: 8px 12px; border: 1px solid var(--amber); background: var(--amber-dim); color: var(--amber); border-radius: 6px; font-size: 12px; }
    .duel-banner.visible { display: block; }
    .card + .card { margin-top: 12px; }

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
      ${tab('daily', 'Daily', mode === 'daily')}
      ${tab('duel', 'Duel', mode === 'duel-lobby' || mode === 'duel-active')}
      ${tab('weekly', 'Weekly', mode === 'weekly')}
      ${tab('rank', 'Rank', mode === 'rank')}
    </div>
  </div>
  <div class="content" id="content">
    <div class="loading">Loading</div>
  </div>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  return randomBytes(16).toString('hex');
}
