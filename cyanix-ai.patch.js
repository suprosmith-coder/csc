/* ================================================================
   DEVIT — Cyanix AI Agentic Patch
   cyanix-ai.patch.js

   Features:
   ① Edit / Delete own posts (inline editor)
   ② UpVote / DownVote replacing heart likes
   ③ Cyanix AI panel — Code Review, Auto-Docs, Collab Predict
   ④ Full mobile + desktop responsive layout

   AI Backend: Groq via Supabase Edge Function
   ================================================================ */

'use strict';

/* ── Wait for core app to be ready ──────────────────────────── */
function waitForDevit(fn, tries = 0) {
  if (typeof window.buildPostCard === 'function' && typeof window.State !== 'undefined') {
    fn();
  } else if (tries < 80) {
    setTimeout(() => waitForDevit(fn, tries + 1), 150);
  } else {
    console.warn('[Cyanix] Devit core not found after timeout');
  }
}

waitForDevit(() => {

/* ================================================================
   § 1 — STYLES INJECTION
   ================================================================ */
const style = document.createElement('style');
style.textContent = `
/* ── Vote buttons ─────────────────────────────────────────── */
.vote-group {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 999px;
  padding: 3px;
}
.vote-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: none;
  background: none;
  color: var(--text-muted, #4a5070);
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4,0,0.2,1);
  white-space: nowrap;
  line-height: 1;
  letter-spacing: 0.02em;
}
.vote-btn svg { flex-shrink: 0; transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1); }
.vote-btn:hover { background: rgba(255,255,255,0.06); }
.vote-btn.upvoted {
  color: var(--emerald, #34d399);
  background: rgba(52,211,153,0.1);
}
.vote-btn.upvoted svg { transform: translateY(-2px); }
.vote-btn.downvoted {
  color: var(--rose, #fb7185);
  background: rgba(251,113,133,0.1);
}
.vote-btn.downvoted svg { transform: translateY(2px); }
.vote-divider {
  width: 1px;
  height: 14px;
  background: rgba(255,255,255,0.1);
  flex-shrink: 0;
}
.vote-score {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #8b92b8);
  padding: 0 6px;
  min-width: 20px;
  text-align: center;
  transition: color 0.2s;
}
.vote-score.positive { color: var(--emerald, #34d399); }
.vote-score.negative { color: var(--rose, #fb7185); }

/* ── Post action row with votes ───────────────────────────── */
.post-actions-v2 {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 12px;
  flex-wrap: wrap;
}

/* ── Post more-menu with edit/delete ──────────────────────── */
.post-ctx-menu {
  position: fixed;
  z-index: 9000;
  background: var(--bg-float, #1f2433);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 6px;
  min-width: 180px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4);
  animation: ctxIn 0.15s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes ctxIn {
  from { opacity:0; transform: scale(0.92) translateY(-6px); }
  to   { opacity:1; transform: scale(1) translateY(0); }
}
.post-ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 9px;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #f0f2ff);
  cursor: pointer;
  transition: background 0.12s;
  text-align: left;
}
.post-ctx-item:hover { background: rgba(255,255,255,0.07); }
.post-ctx-item.danger { color: var(--rose, #fb7185); }
.post-ctx-item.danger:hover { background: rgba(251,113,133,0.1); }
.post-ctx-item i { width: 16px; text-align: center; }

/* ── Inline edit mode ─────────────────────────────────────── */
.post-edit-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
}
.post-edit-textarea {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(99,217,255,0.3);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text-primary, #f0f2ff);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  min-height: 80px;
  outline: none;
  transition: border-color 0.18s;
}
.post-edit-textarea:focus { border-color: rgba(99,217,255,0.6); }
.post-edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.post-edit-save {
  padding: 6px 16px;
  background: linear-gradient(135deg, var(--cyan, #63d9ff), var(--violet, #a78bfa));
  border: none;
  border-radius: 8px;
  color: #050508;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.post-edit-save:hover { opacity: 0.9; transform: translateY(-1px); }
.post-edit-cancel {
  padding: 6px 14px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-secondary, #8b92b8);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.post-edit-cancel:hover { background: rgba(255,255,255,0.1); }
.post-edited-tag {
  font-size: 10px;
  color: var(--text-muted, #4a5070);
  font-style: italic;
  margin-left: 4px;
}

/* ============================================================
   CYANIX AI PANEL
   ============================================================ */

/* ── FAB trigger button ───────────────────────────────────── */
#cyanix-fab {
  position: fixed;
  bottom: 88px;
  right: 20px;
  z-index: 800;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg, #63d9ff 0%, #a78bfa 50%, #fb7185 100%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(99,217,255,0.35), 0 2px 8px rgba(0,0,0,0.4);
  transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
  animation: cyanixPulse 3s ease-in-out infinite;
}
@keyframes cyanixPulse {
  0%, 100% { box-shadow: 0 8px 32px rgba(99,217,255,0.35), 0 0 0 0 rgba(99,217,255,0.4); }
  50%       { box-shadow: 0 8px 32px rgba(99,217,255,0.5), 0 0 0 8px rgba(99,217,255,0); }
}
#cyanix-fab:hover { transform: scale(1.1) rotate(5deg); }
#cyanix-fab:active { transform: scale(0.95); }
#cyanix-fab svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }

/* Desktop: push fab above the bottom-nav */
@media (min-width: 769px) {
  #cyanix-fab { bottom: 28px; right: 28px; width: 58px; height: 58px; }
}

/* ── Drawer overlay ───────────────────────────────────────── */
#cyanix-overlay {
  position: fixed;
  inset: 0;
  z-index: 850;
  background: rgba(5,5,8,0.7);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
#cyanix-overlay.open { opacity: 1; pointer-events: all; }

/* ── Panel ────────────────────────────────────────────────── */
#cyanix-panel {
  position: fixed;
  z-index: 860;
  background: var(--bg-surface, #10121a);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s;
  border: 1px solid rgba(99,217,255,0.15);
}

/* Mobile: bottom sheet */
@media (max-width: 768px) {
  #cyanix-panel {
    bottom: 0; left: 0; right: 0;
    height: 90dvh;
    border-radius: 24px 24px 0 0;
    transform: translateY(100%);
    border-bottom: none;
    border-left: none;
    border-right: none;
  }
  #cyanix-panel.open { transform: translateY(0); }
}

/* Desktop: right sidebar panel */
@media (min-width: 769px) {
  #cyanix-panel {
    top: 0; right: 0; bottom: 0;
    width: 420px;
    max-width: 42vw;
    border-radius: 0;
    border-top: none;
    border-right: none;
    border-bottom: none;
    transform: translateX(100%);
    box-shadow: -16px 0 64px rgba(0,0,0,0.5);
  }
  #cyanix-panel.open { transform: translateX(0); }
}

/* ── Panel header ─────────────────────────────────────────── */
.cyanix-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(99,217,255,0.06), rgba(167,139,250,0.04));
}
.cyanix-logo {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, #63d9ff, #a78bfa, #fb7185);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(99,217,255,0.3);
}
.cyanix-title-block { flex: 1; min-width: 0; }
.cyanix-title {
  font-family: 'Syne', var(--font-display, sans-serif);
  font-size: 17px;
  font-weight: 800;
  background: linear-gradient(90deg, #63d9ff, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}
.cyanix-subtitle {
  font-size: 11px;
  color: var(--text-muted, #4a5070);
  margin-top: 1px;
  letter-spacing: 0.03em;
}
.cyanix-close {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.06);
  color: var(--text-muted, #4a5070);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.cyanix-close:hover { background: rgba(255,255,255,0.1); color: var(--text-primary, #f0f2ff); }

/* Mobile drag handle */
@media (max-width: 768px) {
  .cyanix-handle {
    display: block;
    width: 40px; height: 4px;
    background: rgba(255,255,255,0.12);
    border-radius: 2px;
    margin: 10px auto 0;
    flex-shrink: 0;
  }
}
@media (min-width: 769px) {
  .cyanix-handle { display: none; }
}

/* ── Tabs ─────────────────────────────────────────────────── */
.cyanix-tabs {
  display: flex;
  gap: 0;
  padding: 12px 16px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  overflow-x: auto;
  flex-shrink: 0;
}
.cyanix-tabs::-webkit-scrollbar { height: 0; }
.cyanix-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted, #4a5070);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.cyanix-tab i { font-size: 12px; }
.cyanix-tab:hover { color: var(--text-secondary, #8b92b8); }
.cyanix-tab.active {
  color: var(--cyan, #63d9ff);
  border-bottom-color: var(--cyan, #63d9ff);
}

/* ── Panel body ───────────────────────────────────────────── */
.cyanix-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cyanix-body::-webkit-scrollbar { width: 3px; }
.cyanix-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

/* ── Section card ─────────────────────────────────────────── */
.cyanix-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  padding: 16px;
  transition: border-color 0.2s;
}
.cyanix-card:hover { border-color: rgba(99,217,255,0.15); }
.cyanix-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.cyanix-card-icon {
  width: 34px; height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}
.icon-review  { background: rgba(99,217,255,0.12); color: var(--cyan, #63d9ff); }
.icon-docs    { background: rgba(167,139,250,0.12); color: var(--violet, #a78bfa); }
.icon-collab  { background: rgba(52,211,153,0.12);  color: var(--emerald, #34d399); }
.cyanix-card-title {
  font-family: 'Syne', var(--font-display, sans-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #f0f2ff);
  line-height: 1.2;
}
.cyanix-card-desc {
  font-size: 11px;
  color: var(--text-muted, #4a5070);
  margin-top: 1px;
}

/* ── Input within cards ───────────────────────────────────── */
.cyanix-input {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text-primary, #f0f2ff);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.18s;
  margin-bottom: 10px;
}
.cyanix-input:focus { border-color: rgba(99,217,255,0.4); }
.cyanix-input::placeholder { color: var(--text-muted, #4a5070); }
.cyanix-textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.5;
}

/* ── Action button ────────────────────────────────────────── */
.cyanix-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 16px;
  border: none;
  border-radius: 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s;
  width: 100%;
}
.cyanix-btn-cyan {
  background: linear-gradient(135deg, rgba(99,217,255,0.2), rgba(99,217,255,0.1));
  border: 1px solid rgba(99,217,255,0.3);
  color: var(--cyan, #63d9ff);
}
.cyanix-btn-cyan:hover { background: linear-gradient(135deg, rgba(99,217,255,0.28), rgba(99,217,255,0.16)); border-color: rgba(99,217,255,0.5); }
.cyanix-btn-violet {
  background: linear-gradient(135deg, rgba(167,139,250,0.2), rgba(167,139,250,0.1));
  border: 1px solid rgba(167,139,250,0.3);
  color: var(--violet, #a78bfa);
}
.cyanix-btn-violet:hover { background: linear-gradient(135deg, rgba(167,139,250,0.28), rgba(167,139,250,0.16)); border-color: rgba(167,139,250,0.5); }
.cyanix-btn-emerald {
  background: linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.1));
  border: 1px solid rgba(52,211,153,0.3);
  color: var(--emerald, #34d399);
}
.cyanix-btn-emerald:hover { background: linear-gradient(135deg, rgba(52,211,153,0.28), rgba(52,211,153,0.16)); border-color: rgba(52,211,153,0.5); }
.cyanix-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
.cyanix-btn:not(:disabled):active { transform: scale(0.97); }

/* ── AI response bubble ───────────────────────────────────── */
.cyanix-response {
  margin-top: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(99,217,255,0.12);
  border-radius: 12px;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary, #8b92b8);
  display: none;
  animation: cyanixFadeIn 0.3s ease;
}
.cyanix-response.visible { display: block; }
@keyframes cyanixFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cyanix-response pre {
  background: rgba(0,0,0,0.3) !important;
  border: 1px solid rgba(99,217,255,0.1) !important;
  border-radius: 8px !important;
  padding: 10px 12px !important;
  overflow-x: auto;
  font-size: 12px !important;
  margin: 10px 0 !important;
  color: var(--text-code, #a5f3fc) !important;
  font-family: 'JetBrains Mono', monospace !important;
  white-space: pre-wrap;
  word-break: break-word;
}
.cyanix-response strong { color: var(--text-primary, #f0f2ff); }
.cyanix-response .rating-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 10px;
}
.rating-excellent { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
.rating-good      { background: rgba(99,217,255,0.15); color: #63d9ff; border: 1px solid rgba(99,217,255,0.3); }
.rating-fair      { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
.rating-needs-work{ background: rgba(251,113,133,0.15); color: #fb7185; border: 1px solid rgba(251,113,133,0.3); }

/* ── Spinner ──────────────────────────────────────────────── */
.cyanix-spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Collaborator card ────────────────────────────────────── */
.collab-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  margin-bottom: 8px;
  transition: border-color 0.2s;
}
.collab-card:hover { border-color: rgba(52,211,153,0.25); }
.collab-match-badge {
  margin-left: auto;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(52,211,153,0.12);
  color: #34d399;
  border: 1px solid rgba(52,211,153,0.25);
  flex-shrink: 0;
}
.collab-info { flex: 1; min-width: 0; }
.collab-name { font-size: 13px; font-weight: 700; color: var(--text-primary, #f0f2ff); }
.collab-skills { font-size: 11px; color: var(--text-muted, #4a5070); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Tag chips ────────────────────────────────────────────── */
.cyanix-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cyanix-tag {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--text-secondary, #8b92b8);
}
.cyanix-tag.active { background: rgba(99,217,255,0.1); border-color: rgba(99,217,255,0.3); color: var(--cyan, #63d9ff); }

/* ── Powered-by footer ────────────────────────────────────── */
.cyanix-footer {
  padding: 12px 18px;
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.cyanix-footer-text {
  font-size: 11px;
  color: var(--text-muted, #4a5070);
  display: flex;
  align-items: center;
  gap: 5px;
}
.cyanix-footer-text strong {
  background: linear-gradient(90deg, #63d9ff, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Dismiss any open ctx menu on outside click ───────────── */
#cyanix-ctx-backdrop {
  position: fixed; inset: 0; z-index: 8999;
  display: none;
}
#cyanix-ctx-backdrop.open { display: block; }
`;
document.head.appendChild(style);


/* ================================================================
   § 2 — BUILD THE CYANIX AI PANEL DOM
   ================================================================ */
function buildCyanixPanel() {
  if (document.getElementById('cyanix-panel')) return;

  // FAB button
  const fab = document.createElement('button');
  fab.id = 'cyanix-fab';
  fab.setAttribute('aria-label', 'Open Cyanix AI');
  fab.title = 'Cyanix AI';
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L4 7V12C4 16.42 7.58 20.74 12 22C16.42 20.74 20 16.42 20 12V7L12 2Z" fill="white" opacity="0.9"/>
      <path d="M9 11L11 13L15 9" stroke="#050508" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  document.body.appendChild(fab);

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'cyanix-overlay';
  document.body.appendChild(overlay);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'cyanix-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Cyanix AI Assistant');
  panel.innerHTML = `
    <div class="cyanix-handle" aria-hidden="true"></div>
    <div class="cyanix-header">
      <div class="cyanix-logo" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 7V12C4 16.42 7.58 20.74 12 22C16.42 20.74 20 16.42 20 12V7L12 2Z" fill="white" opacity="0.9"/>
          <path d="M9 11L11 13L15 9" stroke="#050508" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="cyanix-title-block">
        <div class="cyanix-title">Cyanix AI</div>
        <div class="cyanix-subtitle">Agentic intelligence for devs</div>
      </div>
      <button class="cyanix-close" id="cyanix-close-btn" aria-label="Close Cyanix AI">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <div class="cyanix-tabs" role="tablist">
      <button class="cyanix-tab active" data-cyanix-tab="review" role="tab" aria-selected="true">
        <i class="fa-solid fa-magnifying-glass-code"></i> Review
      </button>
      <button class="cyanix-tab" data-cyanix-tab="docs" role="tab" aria-selected="false">
        <i class="fa-solid fa-file-lines"></i> Docs
      </button>
      <button class="cyanix-tab" data-cyanix-tab="collab" role="tab" aria-selected="false">
        <i class="fa-solid fa-users-rays"></i> Collab
      </button>
    </div>

    <div class="cyanix-body" id="cyanix-body">
      <!-- Rendered by JS per tab -->
    </div>

    <div class="cyanix-footer">
      <div class="cyanix-footer-text">
        <i class="fa-solid fa-bolt" style="color:#63d9ff;font-size:10px"></i>
        Powered by <strong>Cyanix AI</strong> · llama-3.3-70b
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Ctx backdrop
  const ctxBack = document.createElement('div');
  ctxBack.id = 'cyanix-ctx-backdrop';
  document.body.appendChild(ctxBack);

  // Wire up open/close
  fab.addEventListener('click', () => toggleCyanixPanel(true));
  overlay.addEventListener('click', () => toggleCyanixPanel(false));
  document.getElementById('cyanix-close-btn').addEventListener('click', () => toggleCyanixPanel(false));

  // Tab switching
  document.querySelectorAll('[data-cyanix-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-cyanix-tab]').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      renderCyanixTab(tab.dataset.cyanixTab);
    });
  });

  // Render default tab
  renderCyanixTab('review');
}

function toggleCyanixPanel(open) {
  const panel = document.getElementById('cyanix-panel');
  const overlay = document.getElementById('cyanix-overlay');
  if (!panel || !overlay) return;
  if (open) {
    panel.classList.add('open');
    overlay.classList.add('open');
    panel.focus();
  } else {
    panel.classList.remove('open');
    overlay.classList.remove('open');
  }
}

/* ================================================================
   § 3 — CYANIX TAB RENDERERS
   ================================================================ */
function renderCyanixTab(tab) {
  const body = document.getElementById('cyanix-body');
  if (!body) return;

  if (tab === 'review')  body.innerHTML = renderReviewTab();
  if (tab === 'docs')    body.innerHTML = renderDocsTab();
  if (tab === 'collab')  body.innerHTML = renderCollabTab();

  wireUpTabLogic(tab);
}

/* ── Review Tab ───────────────────────────────────────────── */
function renderReviewTab() {
  return `
    <div class="cyanix-card">
      <div class="cyanix-card-header">
        <div class="cyanix-card-icon icon-review"><i class="fa-solid fa-magnifying-glass-code"></i></div>
        <div>
          <div class="cyanix-card-title">AI Code Review</div>
          <div class="cyanix-card-desc">Instant analysis of snippets or GitHub PRs</div>
        </div>
      </div>
      <textarea
        id="cyanix-code-input"
        class="cyanix-input cyanix-textarea"
        placeholder="Paste your code snippet here…"
        rows="5"
      ></textarea>
      <div style="margin-bottom:10px">
        <label style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.04em;text-transform:uppercase;display:block;margin-bottom:5px">Or paste a GitHub PR URL</label>
        <input id="cyanix-pr-url" class="cyanix-input" placeholder="https://github.com/owner/repo/pull/123" style="margin-bottom:0">
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.04em;text-transform:uppercase;display:block;margin-bottom:6px">Focus areas</label>
        <div class="cyanix-tags" id="cyanix-review-tags">
          <button class="cyanix-tag active" data-tag="security">Security</button>
          <button class="cyanix-tag active" data-tag="perf">Performance</button>
          <button class="cyanix-tag" data-tag="style">Code Style</button>
          <button class="cyanix-tag" data-tag="logic">Logic Bugs</button>
          <button class="cyanix-tag" data-tag="types">Types</button>
          <button class="cyanix-tag" data-tag="tests">Testability</button>
        </div>
      </div>
      <button class="cyanix-btn cyanix-btn-cyan" id="cyanix-review-btn">
        <i class="fa-solid fa-bolt"></i> Run Code Review
      </button>
      <div class="cyanix-response" id="cyanix-review-result"></div>
    </div>
  `;
}

/* ── Docs Tab ─────────────────────────────────────────────── */
function renderDocsTab() {
  return `
    <div class="cyanix-card">
      <div class="cyanix-card-header">
        <div class="cyanix-card-icon icon-docs"><i class="fa-solid fa-file-lines"></i></div>
        <div>
          <div class="cyanix-card-title">Auto Documentation</div>
          <div class="cyanix-card-desc">Generate READMEs, API docs, and JSDoc</div>
        </div>
      </div>
      <input id="cyanix-project-name" class="cyanix-input" placeholder="Project / repo name (e.g. my-auth-lib)">
      <textarea
        id="cyanix-project-code"
        class="cyanix-input cyanix-textarea"
        placeholder="Paste your main file, exports, or describe what the project does…"
        rows="5"
      ></textarea>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.04em;text-transform:uppercase;display:block;margin-bottom:6px">Output type</label>
        <div class="cyanix-tags" id="cyanix-doc-type">
          <button class="cyanix-tag active" data-doctype="readme">README.md</button>
          <button class="cyanix-tag" data-doctype="jsdoc">JSDoc</button>
          <button class="cyanix-tag" data-doctype="api">API Docs</button>
          <button class="cyanix-tag" data-doctype="changelog">CHANGELOG</button>
        </div>
      </div>
      <button class="cyanix-btn cyanix-btn-violet" id="cyanix-docs-btn">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Docs
      </button>
      <div class="cyanix-response" id="cyanix-docs-result"></div>
    </div>
  `;
}

/* ── Collab Tab ───────────────────────────────────────────── */
function renderCollabTab() {
  return `
    <div class="cyanix-card">
      <div class="cyanix-card-header">
        <div class="cyanix-card-icon icon-collab"><i class="fa-solid fa-users-rays"></i></div>
        <div>
          <div class="cyanix-card-title">Predictive Collaboration</div>
          <div class="cyanix-card-desc">Find devs who complement your stack & style</div>
        </div>
      </div>
      <input id="cyanix-collab-skills" class="cyanix-input" placeholder="Your skills (e.g. React, Node, Postgres)">
      <textarea
        id="cyanix-collab-project"
        class="cyanix-input cyanix-textarea"
        placeholder="Describe your project or what you're building…"
        rows="3"
      ></textarea>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:0.04em;text-transform:uppercase;display:block;margin-bottom:6px">Looking for</label>
        <div class="cyanix-tags" id="cyanix-collab-needs">
          <button class="cyanix-tag active" data-need="backend">Backend</button>
          <button class="cyanix-tag" data-need="frontend">Frontend</button>
          <button class="cyanix-tag" data-need="devops">DevOps</button>
          <button class="cyanix-tag" data-need="ml">ML / AI</button>
          <button class="cyanix-tag" data-need="design">Design</button>
          <button class="cyanix-tag" data-need="mobile">Mobile</button>
        </div>
      </div>
      <button class="cyanix-btn cyanix-btn-emerald" id="cyanix-collab-btn">
        <i class="fa-solid fa-magnifying-glass-chart"></i> Find Collaborators
      </button>
      <div class="cyanix-response" id="cyanix-collab-result"></div>
    </div>
  `;
}

/* ── Wire up tab interactions ─────────────────────────────── */
function wireUpTabLogic(tab) {
  // Tag toggles (exclusive single-select for doc type, multi for rest)
  document.querySelectorAll('.cyanix-tags .cyanix-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const group = tag.closest('.cyanix-tags');
      // Doc type is single-select
      if (group.id === 'cyanix-doc-type') {
        group.querySelectorAll('.cyanix-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
      } else {
        tag.classList.toggle('active');
      }
    });
  });

  if (tab === 'review') {
    document.getElementById('cyanix-review-btn')?.addEventListener('click', runCodeReview);
  }
  if (tab === 'docs') {
    document.getElementById('cyanix-docs-btn')?.addEventListener('click', runAutoDocs);
  }
  if (tab === 'collab') {
    document.getElementById('cyanix-collab-btn')?.addEventListener('click', runCollabPredict);
  }
}

/* ================================================================
   § 4 — CYANIX AI API CALLS  (via Supabase Edge Function → Groq)
   ================================================================ */

// ── Update this to your deployed Supabase edge function URL ──
const CYANIX_EDGE_FN_URL = 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/cyanix-ai';

async function callCyanixAI(systemPrompt, userMessage, resultEl, btnEl, btnOrigHtml) {
  resultEl.classList.remove('visible');
  resultEl.innerHTML = '';
  btnEl.disabled = true;
  btnEl.innerHTML = `<span class="cyanix-spinner"></span> Analyzing…`;

  try {
    // Grab the Supabase session JWT for auth (optional but recommended)
    const session =
      (typeof window.sb?.auth?.session === 'function' && window.sb.auth.session()) ||
      (await window.sb?.auth?.getSession())?.data?.session ||
      null;
    const authHeader = session?.access_token
      ? { 'Authorization': `Bearer ${session.access_token}` }
      : {};

    const resp = await fetch(CYANIX_EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ system: systemPrompt, message: userMessage })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    resultEl.innerHTML = formatAIResponse(data.text || '');
    resultEl.classList.add('visible');
  } catch (err) {
    resultEl.innerHTML = `<span style="color:var(--rose)"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message || 'Request failed — check your connection'}</span>`;
    resultEl.classList.add('visible');
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = btnOrigHtml;
  }
}

function formatAIResponse(text) {
  // Convert **bold**, `code`, and code fences
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code>${escHtml(code.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, `<code style="background:rgba(0,0,0,0.3);padding:2px 5px;border-radius:4px;font-family:monospace;font-size:12px;color:#a5f3fc">$1</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Code Review ──────────────────────────────────────────── */
async function runCodeReview() {
  const code = document.getElementById('cyanix-code-input')?.value?.trim();
  const prUrl = document.getElementById('cyanix-pr-url')?.value?.trim();
  const tags = [...document.querySelectorAll('#cyanix-review-tags .cyanix-tag.active')].map(t => t.dataset.tag).join(', ');
  const resultEl = document.getElementById('cyanix-review-result');
  const btnEl = document.getElementById('cyanix-review-btn');

  if (!code && !prUrl) {
    resultEl.innerHTML = '<span style="color:var(--amber)"><i class="fa-solid fa-circle-exclamation"></i> Paste code or a GitHub PR URL first.</span>';
    resultEl.classList.add('visible');
    return;
  }

  const input = prUrl || code;
  const system = `You are Cyanix AI, an expert code review assistant for Devit, a developer social platform.
Be concise, practical, and direct. Format with sections:
1. Start with a one-line quality badge: [EXCELLENT], [GOOD], [FAIR], or [NEEDS WORK]
2. Key issues (bullet list, prioritized)
3. Quick wins (actionable fixes)
4. One positive observation
Use markdown-style **bold** for important points and \`backticks\` for code references.`;

  const userMsg = prUrl
    ? `Review this GitHub PR: ${prUrl}\nFocus areas: ${tags || 'general'}`
    : `Review this code focusing on ${tags || 'general quality'}:\n\n\`\`\`\n${input}\n\`\`\``;

  await callCyanixAI(system, userMsg, resultEl, btnEl,
    '<i class="fa-solid fa-bolt"></i> Run Code Review');
}

/* ── Auto Docs ────────────────────────────────────────────── */
async function runAutoDocs() {
  const name = document.getElementById('cyanix-project-name')?.value?.trim() || 'project';
  const code = document.getElementById('cyanix-project-code')?.value?.trim();
  const docType = document.querySelector('#cyanix-doc-type .cyanix-tag.active')?.dataset?.doctype || 'readme';
  const resultEl = document.getElementById('cyanix-docs-result');
  const btnEl = document.getElementById('cyanix-docs-btn');

  if (!code) {
    resultEl.innerHTML = '<span style="color:var(--amber)"><i class="fa-solid fa-circle-exclamation"></i> Describe the project or paste some code first.</span>';
    resultEl.classList.add('visible');
    return;
  }

  const docLabels = { readme: 'README.md', jsdoc: 'JSDoc comments', api: 'API documentation', changelog: 'CHANGELOG.md' };
  const system = `You are Cyanix AI, a documentation specialist for Devit.
Generate high-quality ${docLabels[docType] || 'README'} documentation.
For README: include badges, description, quick start, usage examples, and contributing.
For JSDoc: add proper @param, @returns, @example.
For API Docs: describe endpoints, params, and responses.
For CHANGELOG: use Keep a Changelog format.
Be specific, concise, and developer-friendly. Use markdown.`;

  await callCyanixAI(system,
    `Project: **${name}**\nGenerate ${docLabels[docType]} based on:\n\n${code}`,
    resultEl, btnEl, '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Docs');
}

/* ── Collab Predict ───────────────────────────────────────── */
async function runCollabPredict() {
  const skills = document.getElementById('cyanix-collab-skills')?.value?.trim();
  const project = document.getElementById('cyanix-collab-project')?.value?.trim();
  const needs = [...document.querySelectorAll('#cyanix-collab-needs .cyanix-tag.active')].map(t => t.dataset.need).join(', ');
  const resultEl = document.getElementById('cyanix-collab-result');
  const btnEl = document.getElementById('cyanix-collab-btn');

  if (!skills && !project) {
    resultEl.innerHTML = '<span style="color:var(--amber)"><i class="fa-solid fa-circle-exclamation"></i> Tell us your skills and project first.</span>';
    resultEl.classList.add('visible');
    return;
  }

  const system = `You are Cyanix AI, a predictive collaboration engine for Devit.
Given a developer's profile, suggest ideal collaborator personas and outreach strategy.
Format response as:
1. **Ideal Collaborator Profile** — describe the perfect match in 2 sentences
2. **Complementary Skills Needed** — bullet list
3. **Where to Find Them** — specific communities, GitHub topics, hashtags
4. **Outreach Message Template** — a short personalized intro they can adapt
5. **Red Flags to Avoid** — 2-3 compatibility anti-patterns
Keep it concrete and actionable for a developer community context.`;

  await callCyanixAI(system,
    `My skills: ${skills || 'not specified'}\nProject: ${project || 'not specified'}\nLooking for: ${needs || 'general'}`,
    resultEl, btnEl, '<i class="fa-solid fa-magnifying-glass-chart"></i> Find Collaborators');
}


/* ================================================================
   § 5 — PATCH buildPostCard → UpVote / DownVote + Edit / Delete
   ================================================================ */

const _origBuildPostCard = window.buildPostCard;

window.buildPostCard = function(post, profile, isLiked = false, isBookmarked = false) {
  // Call original to get the card
  const card = _origBuildPostCard.call(this, post, profile, isLiked, isBookmarked);
  if (!card) return card;

  // ── Replace heart with UpVote / DownVote ─────────────────
  const likeBtn = card.querySelector('.like-btn');
  if (likeBtn) {
    const actionsRow = likeBtn.closest('.post-actions');
    const likeCount  = parseInt(likeBtn.querySelector('.like-count')?.textContent || '0') || 0;

    // Retrieve any stored vote from sessionStorage for optimistic UI
    const storedVote  = sessionStorage.getItem(`vote:${post.id}`) || 'none'; // 'up'|'down'|'none'
    const storedDelta = sessionStorage.getItem(`votedelta:${post.id}`);
    const displayScore = storedDelta !== null ? likeCount + parseInt(storedDelta) : likeCount;

    const voteGroup = document.createElement('span');
    voteGroup.className = 'vote-group';
    voteGroup.setAttribute('role', 'group');
    voteGroup.setAttribute('aria-label', 'Vote on post');
    voteGroup.innerHTML = `
      <button class="vote-btn upvote-btn ${storedVote === 'up' ? 'upvoted' : ''}" aria-label="Upvote" title="Upvote">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${storedVote === 'up' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
        <span class="upvote-label">Up</span>
      </button>
      <span class="vote-score ${displayScore > 0 ? 'positive' : displayScore < 0 ? 'negative' : ''}" aria-live="polite">${fmtNum(displayScore)}</span>
      <div class="vote-divider" aria-hidden="true"></div>
      <button class="vote-btn downvote-btn ${storedVote === 'down' ? 'downvoted' : ''}" aria-label="Downvote" title="Downvote">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${storedVote === 'down' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span class="downvote-label">Down</span>
      </button>
    `;

    likeBtn.replaceWith(voteGroup);

    // Vote logic
    let voteState  = storedVote;
    let voteScore  = displayScore;
    const scoreEl  = voteGroup.querySelector('.vote-score');
    const upBtn    = voteGroup.querySelector('.upvote-btn');
    const downBtn  = voteGroup.querySelector('.downvote-btn');

    function updateVoteUI() {
      upBtn.classList.toggle('upvoted', voteState === 'up');
      upBtn.querySelector('svg').setAttribute('fill', voteState === 'up' ? 'currentColor' : 'none');
      downBtn.classList.toggle('downvoted', voteState === 'down');
      downBtn.querySelector('svg').setAttribute('fill', voteState === 'down' ? 'currentColor' : 'none');
      scoreEl.textContent = fmtNum(voteScore);
      scoreEl.className = `vote-score ${voteScore > 0 ? 'positive' : voteScore < 0 ? 'negative' : ''}`;
      sessionStorage.setItem(`vote:${post.id}`, voteState);
      sessionStorage.setItem(`votedelta:${post.id}`, voteScore - likeCount);
    }

    upBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const prev = voteState;
      if (voteState === 'up') {
        voteState = 'none'; voteScore--;
        await window.sb?.from('post_likes').delete().eq('post_id', post.id).eq('user_id', window.State?.user?.id);
      } else {
        if (voteState === 'down') voteScore++; // undo downvote
        voteState = 'up'; voteScore++;
        await window.sb?.from('post_likes').upsert({ post_id: post.id, user_id: window.State?.user?.id, vote: 1 }, { onConflict: 'post_id,user_id' });
        if (post.author_id !== window.State?.user?.id) {
          window.sb?.from('notifications').insert({ user_id: post.author_id, actor_id: window.State?.user?.id, type: 'like', post_id: post.id });
        }
      }
      upBtn.style.transform = 'scale(1.35)';
      setTimeout(() => upBtn.style.transform = '', 200);
      updateVoteUI();
    });

    downBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (voteState === 'down') {
        voteState = 'none'; voteScore++;
        await window.sb?.from('post_likes').delete().eq('post_id', post.id).eq('user_id', window.State?.user?.id);
      } else {
        if (voteState === 'up') voteScore--; // undo upvote
        voteState = 'down'; voteScore--;
        await window.sb?.from('post_likes').upsert({ post_id: post.id, user_id: window.State?.user?.id, vote: -1 }, { onConflict: 'post_id,user_id' });
      }
      downBtn.style.transform = 'scale(1.3)';
      setTimeout(() => downBtn.style.transform = '', 200);
      updateVoteUI();
    });
  }

  // ── Add Edit option to own post menu ────────────────────
  const isOwnPost = post.author_id === window.State?.user?.id;
  if (isOwnPost) {
    const deleteBtn = card.querySelector('.post-delete-btn');
    if (deleteBtn) {
      // Replace plain X delete btn with … menu for own posts
      const newMoreBtn = document.createElement('button');
      newMoreBtn.className = 'post-more-btn own-post-more';
      newMoreBtn.dataset.pid = post.id;
      newMoreBtn.title = 'Post options';
      newMoreBtn.style.cssText = 'margin-left:auto;color:var(--text-muted);font-size:14px;padding:4px 8px;border-radius:6px;transition:color 0.15s';
      newMoreBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
      deleteBtn.replaceWith(newMoreBtn);

      newMoreBtn.addEventListener('click', e => {
        e.stopPropagation();
        openOwnPostMenu(newMoreBtn, post, profile, card);
      });
    }
  }

  return card;
};

/* ── Number formatter ─────────────────────────────────────── */
function fmtNum(n) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}


/* ================================================================
   § 6 — OWN POST CONTEXT MENU (Edit / Delete / Pin)
   ================================================================ */
function openOwnPostMenu(anchor, post, profile, card) {
  // Remove any existing menu
  document.querySelector('.post-ctx-menu')?.remove();
  document.getElementById('cyanix-ctx-backdrop').classList.remove('open');

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'post-ctx-menu';
  menu.setAttribute('role', 'menu');
  menu.style.cssText = `
    top: ${Math.min(rect.bottom + 4, window.innerHeight - 180)}px;
    right: ${window.innerWidth - rect.right}px;
  `;

  menu.innerHTML = `
    <button class="post-ctx-item" id="ctx-edit" role="menuitem">
      <i class="fa-solid fa-pen-to-square" style="color:var(--cyan)"></i> Edit post
    </button>
    <button class="post-ctx-item" id="ctx-copy-link" role="menuitem">
      <i class="fa-solid fa-link" style="color:var(--violet)"></i> Copy link
    </button>
    <div style="height:1px;background:rgba(255,255,255,0.07);margin:4px 8px"></div>
    <button class="post-ctx-item danger" id="ctx-delete" role="menuitem">
      <i class="fa-solid fa-trash-can"></i> Delete post
    </button>
  `;

  document.body.appendChild(menu);
  const backdrop = document.getElementById('cyanix-ctx-backdrop');
  backdrop.classList.add('open');

  function closeMenu() {
    menu.remove();
    backdrop.classList.remove('open');
  }

  backdrop.onclick = closeMenu;

  menu.querySelector('#ctx-edit').onclick = () => {
    closeMenu();
    openInlineEditor(post, card);
  };

  menu.querySelector('#ctx-copy-link').onclick = () => {
    closeMenu();
    navigator.clipboard?.writeText(window.location.origin + '/post/' + post.id)
      .then(() => typeof toast === 'function' && toast('Link copied!', 'link'));
  };

  menu.querySelector('#ctx-delete').onclick = async () => {
    closeMenu();
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const { error } = await window.sb?.from('posts').delete().eq('id', post.id);
    if (!error) {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      card.style.transition = '0.3s ease';
      setTimeout(() => card.remove(), 300);
      typeof toast === 'function' && toast('Post deleted', 'trash');
    }
  };
}

/* ── Inline editor ────────────────────────────────────────── */
function openInlineEditor(post, card) {
  const contentEl = card.querySelector('.post-content');
  if (!contentEl) return;

  const originalHtml = contentEl.innerHTML;
  const originalText = post.content || '';

  const editor = document.createElement('div');
  editor.className = 'post-edit-area';
  editor.innerHTML = `
    <textarea class="post-edit-textarea" aria-label="Edit post content">${originalText}</textarea>
    <div class="post-edit-actions">
      <button class="post-edit-cancel">Cancel</button>
      <button class="post-edit-save"><i class="fa-solid fa-check"></i> Save</button>
    </div>
  `;

  contentEl.replaceWith(editor);
  editor.querySelector('textarea').focus();

  editor.querySelector('.post-edit-cancel').onclick = () => {
    editor.replaceWith(contentEl);
  };

  editor.querySelector('.post-edit-save').onclick = async () => {
    const newText = editor.querySelector('textarea').value.trim();
    if (!newText) { typeof toast === 'function' && toast('Post cannot be empty', 'circle-exclamation'); return; }
    if (newText === originalText) { editor.replaceWith(contentEl); return; }

    const saveBtn = editor.querySelector('.post-edit-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const { error } = await window.sb?.from('posts')
      .update({ content: newText })
      .eq('id', post.id)
      .eq('author_id', window.State?.user?.id);

    if (error) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save';
      typeof toast === 'function' && toast('Failed to save: ' + error.message, 'circle-exclamation');
      return;
    }

    post.content = newText; // update in-memory reference
    const newContentEl = document.createElement('div');
    newContentEl.className = 'post-content';
    newContentEl.innerHTML = window.escapeHtml
      ? window.escapeHtml(newText).replace(/#(\w+)/g,'<span class="hashtag">#$1</span>').replace(/@(\w+)/g,'<span class="mention">@$1</span>')
      : newText;

    // Add edited tag
    const editedTag = document.createElement('span');
    editedTag.className = 'post-edited-tag';
    editedTag.textContent = '(edited)';
    newContentEl.appendChild(editedTag);

    editor.replaceWith(newContentEl);
    typeof toast === 'function' && toast('Post updated!', 'pen-to-square');
  };
}


/* ================================================================
   § 7 — INJECT SIDEBAR LINK ON DESKTOP
   ================================================================ */
function injectDesktopSidebarLink() {
  // Only inject once
  if (document.getElementById('cyanix-sidebar-link')) return;
  const sidebar = document.querySelector('.sidebar-nav, .sidebar, [class*="sidebar"]');
  if (!sidebar) return;

  const link = document.createElement('button');
  link.id = 'cyanix-sidebar-link';
  link.className = 'sidebar-link';
  link.style.cssText = 'background: linear-gradient(135deg, rgba(99,217,255,0.08), rgba(167,139,250,0.06)); border: 1px solid rgba(99,217,255,0.15); border-radius: 12px; margin: 4px 8px; transition: all 0.2s;';
  link.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
      <path d="M12 2L4 7V12C4 16.42 7.58 20.74 12 22C16.42 20.74 20 16.42 20 12V7L12 2Z" fill="#63d9ff" opacity="0.8"/>
      <path d="M9 11L11 13L15 9" stroke="#050508" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span style="background:linear-gradient(90deg,#63d9ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:700">Cyanix AI</span>
  `;
  link.setAttribute('aria-label', 'Open Cyanix AI');
  link.addEventListener('click', () => toggleCyanixPanel(true));
  sidebar.appendChild(link);
}


/* ================================================================
   § 8 — INIT
   ================================================================ */
buildCyanixPanel();

// Try to inject sidebar link after a short delay for DOM settle
setTimeout(injectDesktopSidebarLink, 1200);

// Re-inject if sidebar re-renders
const _sidebarObserver = new MutationObserver(() => {
  if (!document.getElementById('cyanix-sidebar-link')) {
    injectDesktopSidebarLink();
  }
});
_sidebarObserver.observe(document.body, { childList: true, subtree: false });

console.log('[Cyanix AI Patch] ✓ Loaded — Edit/Delete posts · UpVote/DownVote · Cyanix AI agentic panel · Groq via Supabase Edge Function');

}); // end waitForDevit
