/* ============================================================
   DEVIT — New Features Patch
   devit-new-features.patch.js

   Features:
   1. Commenting System + Quick Reactions (emoji + upvotes)
   2. Tagging & Search (posts, snippets, users by tag)
   3. Welcome Tour (step-by-step onboarding spotlight)
   4. Profile Setup Wizard (GitHub, DevScore, personalisation)
   ============================================================ */

'use strict';

/* ── CSS Injection ─────────────────────────────────────────── */
(function injectCSS() {
  const style = document.createElement('style');
  style.textContent = `
/* ══════════════════════════════════════════════════════════════
   COMMENTS & REACTIONS
══════════════════════════════════════════════════════════════ */

/* Comment thread toggle button */
.comment-toggle-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-secondary);
  padding: 5px 10px; border-radius: 20px;
  transition: background 0.15s, color 0.15s;
  background: transparent;
}
.comment-toggle-btn:hover {
  background: rgba(99,217,255,0.08); color: var(--cyan);
}
.comment-toggle-btn i { font-size: 14px; }
.comment-toggle-btn .comment-count {
  font-size: 12px; font-weight: 600;
}

/* Comment thread panel */
.comment-thread {
  display: none; flex-direction: column; gap: 0;
  border-top: 1px solid var(--border);
  margin-top: 12px; padding-top: 12px;
  animation: threadSlide 0.25s cubic-bezier(0.34,1.2,0.64,1);
}
.comment-thread.open { display: flex; }
@keyframes threadSlide {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Individual comment */
.comment-item {
  display: flex; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  animation: commentFadeIn 0.2s ease;
}
.comment-item:last-child { border-bottom: none; }
@keyframes commentFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.comment-body { flex: 1; min-width: 0; }
.comment-author {
  font-size: 12.5px; font-weight: 700; color: var(--text-primary);
  display: inline; margin-right: 6px;
}
.comment-author:hover { color: var(--cyan); cursor: pointer; }
.comment-time {
  font-size: 11px; color: var(--text-muted);
}
.comment-text {
  font-size: 13.5px; color: var(--text-secondary);
  line-height: 1.5; margin-top: 2px; word-break: break-word;
}
.comment-actions {
  display: flex; align-items: center; gap: 6px; margin-top: 4px;
}
.comment-like-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--text-muted); padding: 2px 6px;
  border-radius: 10px; transition: background 0.15s, color 0.15s;
}
.comment-like-btn:hover { background: rgba(251,113,133,0.1); color: var(--rose); }
.comment-like-btn.liked { color: var(--rose); }
.comment-like-btn i { font-size: 12px; }
.comment-delete-btn {
  font-size: 11px; color: var(--text-muted); padding: 2px 6px;
  border-radius: 10px; transition: background 0.15s, color 0.15s;
}
.comment-delete-btn:hover { background: rgba(251,113,133,0.1); color: var(--rose); }

/* Comment composer */
.comment-composer {
  display: flex; gap: 8px; align-items: flex-start;
  padding-top: 10px; margin-top: 4px;
}
.comment-input {
  flex: 1; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 20px; padding: 8px 14px;
  font-size: 13.5px; color: var(--text-primary); resize: none;
  min-height: 38px; max-height: 120px; overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  line-height: 1.4;
}
.comment-input:focus {
  outline: none; border-color: var(--border-active);
  box-shadow: 0 0 0 3px var(--cyan-dim);
}
.comment-input::placeholder { color: var(--text-muted); }
.comment-submit-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--cyan); color: var(--bg-void);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; transition: transform 0.2s, opacity 0.15s;
  flex-shrink: 0; margin-top: 1px;
}
.comment-submit-btn:hover { transform: scale(1.1); }
.comment-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* ── REACTIONS ── */
.reactions-row {
  display: flex; align-items: center; gap: 4px;
  flex-wrap: wrap; margin-top: 8px;
}
.reaction-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 20px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  font-size: 13px; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s; user-select: none;
}
.reaction-chip:hover { border-color: rgba(99,217,255,0.3); background: rgba(99,217,255,0.06); }
.reaction-chip.reacted {
  background: rgba(99,217,255,0.1); border-color: rgba(99,217,255,0.35);
  color: var(--cyan);
}
.reaction-chip .emoji { font-size: 15px; line-height: 1; }
.reaction-chip .rcount { font-size: 11.5px; font-weight: 700; }

.reaction-add-btn {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--bg-elevated); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: var(--text-muted);
  cursor: pointer; transition: all 0.15s;
}
.reaction-add-btn:hover { border-color: var(--cyan-glow); color: var(--cyan); transform: scale(1.1); }

.emoji-picker-popup {
  position: absolute; z-index: 500;
  background: var(--bg-float); border: 1px solid var(--border);
  border-radius: 16px; padding: 10px;
  display: flex; flex-wrap: wrap; gap: 4px; max-width: 220px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  animation: emojiIn 0.2s cubic-bezier(0.34,1.4,0.64,1);
}
@keyframes emojiIn {
  from { opacity: 0; transform: scale(0.85) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.emoji-option {
  width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; cursor: pointer; transition: background 0.12s;
}
.emoji-option:hover { background: rgba(255,255,255,0.08); }

/* ══════════════════════════════════════════════════════════════
   TAGS
══════════════════════════════════════════════════════════════ */
.post-tags {
  display: flex; flex-wrap: wrap; gap: 5px;
  margin-top: 8px;
}
.post-tag {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 10px; border-radius: 20px;
  background: var(--violet-dim); border: 1px solid rgba(167,139,250,0.2);
  font-size: 12px; font-weight: 600; color: var(--violet);
  cursor: pointer; transition: all 0.15s;
}
.post-tag:hover { background: rgba(167,139,250,0.2); }
.post-tag::before { content: '#'; opacity: 0.7; }

/* Tag input inside composer */
.tag-input-row {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 6px 10px; border-radius: 10px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  min-height: 36px; cursor: text;
  transition: border-color 0.15s;
}
.tag-input-row:focus-within { border-color: var(--border-active); }
.tag-input-row .tag-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 12px;
  background: var(--violet-dim); border: 1px solid rgba(167,139,250,0.25);
  font-size: 12px; font-weight: 600; color: var(--violet);
}
.tag-input-row .tag-pill button {
  color: var(--violet); opacity: 0.6; font-size: 10px; padding: 0 1px;
}
.tag-input-row .tag-pill button:hover { opacity: 1; }
.tag-real-input {
  flex: 1; min-width: 80px; background: transparent;
  border: none; outline: none; font-size: 13px;
  color: var(--text-primary); font-family: inherit;
}
.tag-real-input::placeholder { color: var(--text-muted); }

/* ── Tag suggestions dropdown ── */
.tag-suggestions {
  position: absolute; z-index: 400;
  background: var(--bg-float); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  min-width: 180px; max-height: 220px; overflow-y: auto;
  animation: tagDropIn 0.18s cubic-bezier(0.34,1.3,0.64,1);
}
@keyframes tagDropIn {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tag-suggestion-item {
  padding: 9px 14px; cursor: pointer; font-size: 13px;
  color: var(--text-secondary); display: flex; align-items: center; gap: 8px;
  transition: background 0.12s;
}
.tag-suggestion-item:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }
.tag-suggestion-item .tag-count {
  margin-left: auto; font-size: 11px; color: var(--text-muted);
}

/* ══════════════════════════════════════════════════════════════
   SEARCH PANEL
══════════════════════════════════════════════════════════════ */
#search-panel {
  position: fixed; inset: 0; z-index: 800;
  background: rgba(5,5,8,0.85); backdrop-filter: blur(16px);
  display: none; align-items: flex-start; justify-content: center;
  padding-top: 80px;
}
#search-panel.open { display: flex; }
.search-box {
  width: 640px; max-width: 95vw;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 20px; overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7);
  animation: searchBoxIn 0.28s cubic-bezier(0.34,1.3,0.64,1);
}
@keyframes searchBoxIn {
  from { opacity: 0; transform: translateY(-20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.search-input-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px; border-bottom: 1px solid var(--border);
}
.search-input-row i { font-size: 18px; color: var(--text-muted); flex-shrink: 0; }
#global-search-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 18px; font-family: var(--font-body); color: var(--text-primary);
  font-weight: 500;
}
#global-search-input::placeholder { color: var(--text-muted); }
.search-close-btn {
  font-size: 13px; color: var(--text-muted); padding: 5px 9px;
  border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border);
  transition: color 0.15s;
}
.search-close-btn:hover { color: var(--text-primary); }

.search-filter-tabs {
  display: flex; gap: 2px; padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.search-filter-tab {
  padding: 6px 13px; border-radius: 10px; font-size: 12.5px;
  font-weight: 600; color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
}
.search-filter-tab:hover { color: var(--text-primary); }
.search-filter-tab.active {
  background: var(--bg-elevated); color: var(--cyan);
}

.search-results {
  max-height: 400px; overflow-y: auto; padding: 8px;
}
.search-result-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 12px; border-radius: 12px;
  cursor: pointer; transition: background 0.12s;
}
.search-result-item:hover { background: var(--bg-elevated); }
.search-result-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--bg-float); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--cyan); flex-shrink: 0;
}
.search-result-body { flex: 1; min-width: 0; }
.search-result-title {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.search-result-sub {
  font-size: 12px; color: var(--text-muted); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.search-result-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 8px;
  background: var(--violet-dim); color: var(--violet);
  border: 1px solid rgba(167,139,250,0.2); flex-shrink: 0; align-self: center;
}
.search-empty {
  padding: 40px 20px; text-align: center;
  color: var(--text-muted); font-size: 14px;
}
.search-empty i { font-size: 28px; display: block; margin-bottom: 8px; }
.search-shortcuts {
  display: flex; gap: 16px; padding: 10px 18px;
  border-top: 1px solid var(--border); flex-wrap: wrap;
}
.search-shortcut {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: var(--text-muted);
}
.search-kbd {
  background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 5px; padding: 1px 6px; font-size: 10.5px;
  font-family: var(--font-mono); color: var(--text-secondary);
}
.trending-tags {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.trending-tags-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 8px;
}
.trending-tags-list { display: flex; flex-wrap: wrap; gap: 6px; }
.trending-tag-btn {
  padding: 4px 10px; border-radius: 16px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.trending-tag-btn:hover {
  background: var(--violet-dim); border-color: rgba(167,139,250,0.3); color: var(--violet);
}

/* ── Search trigger button in topbar ── */
#search-trigger-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; border-radius: 20px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  color: var(--text-muted); font-size: 13px; cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  font-family: var(--font-body);
}
#search-trigger-btn:hover { border-color: rgba(99,217,255,0.3); color: var(--cyan); }
#search-trigger-btn kbd {
  font-size: 10px; background: var(--bg-float); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 5px; font-family: var(--font-mono);
  color: var(--text-muted);
}

/* ══════════════════════════════════════════════════════════════
   WELCOME TOUR
══════════════════════════════════════════════════════════════ */
#tour-overlay {
  position: fixed; inset: 0; z-index: 9000; pointer-events: none;
}
.tour-backdrop {
  position: absolute; inset: 0;
  background: rgba(5,5,8,0.75);
  backdrop-filter: blur(2px);
  pointer-events: all;
}
.tour-spotlight {
  position: absolute;
  border-radius: 16px;
  box-shadow:
    0 0 0 4000px rgba(5,5,8,0.75),
    0 0 0 2px var(--cyan),
    0 0 24px var(--cyan-glow);
  pointer-events: none;
  transition: all 0.4s cubic-bezier(0.34,1.1,0.64,1);
  background: transparent;
}
.tour-tooltip {
  position: absolute; pointer-events: all;
  background: var(--bg-float);
  border: 1px solid var(--border-active);
  border-radius: 18px; padding: 20px 22px;
  width: 300px; max-width: 90vw;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,217,255,0.1);
  animation: tooltipIn 0.35s cubic-bezier(0.34,1.4,0.64,1);
}
@keyframes tooltipIn {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.tour-tooltip-step {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--cyan); margin-bottom: 6px;
}
.tour-tooltip-title {
  font-family: var(--font-display); font-size: 17px; font-weight: 800;
  color: var(--text-primary); margin-bottom: 8px; line-height: 1.3;
}
.tour-tooltip-body {
  font-size: 13.5px; color: var(--text-secondary); line-height: 1.6;
  margin-bottom: 16px;
}
.tour-tooltip-actions {
  display: flex; align-items: center; gap: 8px;
}
.tour-btn-next {
  flex: 1; padding: 9px; border-radius: 10px;
  background: var(--cyan); color: var(--bg-void);
  font-size: 13.5px; font-weight: 700;
  transition: transform 0.2s, box-shadow 0.2s;
}
.tour-btn-next:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,217,255,0.35); }
.tour-btn-skip {
  padding: 9px 14px; border-radius: 10px;
  color: var(--text-muted); font-size: 13px;
  transition: color 0.15s;
}
.tour-btn-skip:hover { color: var(--text-secondary); }
.tour-dots {
  display: flex; gap: 5px; align-items: center; margin-right: auto;
}
.tour-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--bg-elevated); border: 1px solid var(--border);
  transition: all 0.2s;
}
.tour-dot.active {
  background: var(--cyan); border-color: var(--cyan);
  width: 18px; border-radius: 3px;
}

/* ══════════════════════════════════════════════════════════════
   PROFILE SETUP WIZARD
══════════════════════════════════════════════════════════════ */
#setup-wizard-overlay {
  position: fixed; inset: 0; z-index: 8500;
  background: rgba(5,5,8,0.92); backdrop-filter: blur(20px);
  display: flex; align-items: center; justify-content: center;
}
.setup-wizard {
  width: 540px; max-width: 96vw; max-height: 90vh;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 24px; overflow: hidden;
  box-shadow: 0 40px 100px rgba(0,0,0,0.8);
  animation: wizardIn 0.4s cubic-bezier(0.34,1.2,0.64,1);
}
@keyframes wizardIn {
  from { opacity: 0; transform: scale(0.93) translateY(24px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.wizard-progress-bar {
  height: 3px;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
  transition: width 0.5s cubic-bezier(0.34,1.1,0.64,1);
}
.wizard-header {
  padding: 28px 32px 0;
  display: flex; flex-direction: column; gap: 4px;
}
.wizard-step-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--cyan);
}
.wizard-title {
  font-family: var(--font-display); font-size: 24px; font-weight: 900;
  color: var(--text-primary); line-height: 1.2;
}
.wizard-subtitle {
  font-size: 14px; color: var(--text-secondary); margin-top: 4px; line-height: 1.5;
}
.wizard-body {
  padding: 24px 32px 28px; overflow-y: auto; max-height: calc(90vh - 180px);
}
.wizard-footer {
  padding: 0 32px 24px;
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  border-top: 1px solid var(--border); padding-top: 16px;
}
.wizard-btn-back {
  padding: 10px 18px; border-radius: 12px;
  color: var(--text-secondary); font-size: 14px; font-weight: 600;
  transition: color 0.15s;
}
.wizard-btn-back:hover { color: var(--text-primary); }
.wizard-btn-next {
  padding: 10px 22px; border-radius: 12px;
  background: var(--cyan); color: var(--bg-void);
  font-size: 14px; font-weight: 800;
  transition: transform 0.2s, box-shadow 0.2s, background 0.15s;
}
.wizard-btn-next:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,217,255,0.35); }
.wizard-btn-skip {
  padding: 10px 14px; border-radius: 12px;
  color: var(--text-muted); font-size: 13px;
  transition: color 0.15s;
}
.wizard-btn-skip:hover { color: var(--text-secondary); }

/* Wizard: GitHub connect */
.wizard-github-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 18px; border-radius: 14px;
  border: 1.5px solid var(--border); background: var(--bg-elevated);
  cursor: pointer; transition: all 0.2s;
}
.wizard-github-card:hover {
  border-color: rgba(99,217,255,0.35); background: rgba(99,217,255,0.04);
  transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.wizard-github-card.connected {
  border-color: var(--emerald); background: rgba(52,211,153,0.06);
}
.wizard-github-card.connected .wizard-github-status { color: var(--emerald); }
.wizard-github-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: #1a1e26; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
}
.wizard-github-text { flex: 1; }
.wizard-github-title { font-size: 14.5px; font-weight: 700; color: var(--text-primary); }
.wizard-github-desc { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
.wizard-github-status { font-size: 12px; font-weight: 700; color: var(--text-muted); }

/* Wizard: DevScore prefs */
.devscore-pref-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.devscore-pref-card {
  padding: 14px 16px; border-radius: 14px;
  border: 1.5px solid var(--border); background: var(--bg-elevated);
  cursor: pointer; transition: all 0.2s; user-select: none;
}
.devscore-pref-card:hover { border-color: rgba(99,217,255,0.25); }
.devscore-pref-card.selected {
  border-color: var(--cyan); background: var(--cyan-dim);
}
.devscore-pref-icon { font-size: 22px; margin-bottom: 6px; }
.devscore-pref-title { font-size: 13.5px; font-weight: 700; color: var(--text-primary); }
.devscore-pref-desc { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; line-height: 1.4; }

/* Wizard: Avatar + bio */
.wizard-avatar-picker {
  display: flex; align-items: center; gap: 20px; margin-bottom: 20px;
}
.wizard-avatar-preview {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--bg-elevated); border: 2px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 900; color: var(--text-muted);
  overflow: hidden; flex-shrink: 0;
  transition: border-color 0.2s;
}
.wizard-avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
.wizard-avatar-upload-btn {
  padding: 9px 16px; border-radius: 10px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
  transition: all 0.15s;
}
.wizard-avatar-upload-btn:hover { color: var(--text-primary); border-color: rgba(255,255,255,0.15); }

.wizard-input {
  width: 100%; padding: 11px 14px; border-radius: 12px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  font-size: 14px; color: var(--text-primary); font-family: var(--font-body);
  transition: border-color 0.15s, box-shadow 0.15s; margin-bottom: 12px;
}
.wizard-input:focus {
  outline: none; border-color: var(--border-active);
  box-shadow: 0 0 0 3px var(--cyan-dim);
}
.wizard-input::placeholder { color: var(--text-muted); }
.wizard-textarea {
  resize: none; height: 90px;
}
.wizard-label {
  font-size: 11.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 6px;
  display: block;
}

/* Wizard: tech stack chips */
.tech-stack-picker { display: flex; flex-wrap: wrap; gap: 7px; }
.tech-chip {
  padding: 5px 12px; border-radius: 20px;
  background: var(--bg-elevated); border: 1.5px solid var(--border);
  font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s; user-select: none;
}
.tech-chip:hover { border-color: rgba(99,217,255,0.3); color: var(--cyan); }
.tech-chip.selected {
  background: var(--cyan-dim); border-color: rgba(99,217,255,0.4); color: var(--cyan);
}

/* Wizard: final step celebrate */
.wizard-celebrate {
  text-align: center; padding: 16px 0;
}
.wizard-celebrate-emoji { font-size: 56px; display: block; margin-bottom: 12px; animation: celebratePop 0.5s cubic-bezier(0.34,1.7,0.64,1); }
@keyframes celebratePop {
  from { transform: scale(0.3) rotate(-20deg); opacity: 0; }
  to   { transform: scale(1) rotate(0deg); opacity: 1; }
}
.wizard-celebrate-title {
  font-family: var(--font-display); font-size: 26px; font-weight: 900;
  color: var(--text-primary); margin-bottom: 8px;
}
.wizard-celebrate-body {
  font-size: 14px; color: var(--text-secondary); line-height: 1.6; max-width: 340px; margin: 0 auto;
}
  `;
  document.head.appendChild(style);
})();


/* ══════════════════════════════════════════════════════════════
   1. COMMENTS & REACTIONS
══════════════════════════════════════════════════════════════ */

const REACTION_EMOJIS = ['👍','🔥','🚀','💡','❤️','😂','🎉','👀'];

/* ── Reaction state (in-memory, backed by Supabase post_reactions table) ── */
const ReactionsState = { cache: {} }; // keyed by post_id

async function loadReactions(postId) {
  if (ReactionsState.cache[postId]) return ReactionsState.cache[postId];
  try {
    const { data } = await window.sb.from('post_reactions')
      .select('emoji, user_id')
      .eq('post_id', postId);
    const map = {};
    (data || []).forEach(r => {
      if (!map[r.emoji]) map[r.emoji] = [];
      map[r.emoji].push(r.user_id);
    });
    ReactionsState.cache[postId] = map;
    return map;
  } catch {
    return {};
  }
}

async function toggleReaction(postId, emoji) {
  const uid = window.State?.user?.id;
  if (!uid) { window.toast('Sign in to react', 'circle-info'); return; }
  const cache = ReactionsState.cache[postId] || {};
  const users = cache[emoji] || [];
  const alreadyReacted = users.includes(uid);
  if (alreadyReacted) {
    await window.sb.from('post_reactions').delete()
      .eq('post_id', postId).eq('user_id', uid).eq('emoji', emoji);
    cache[emoji] = users.filter(u => u !== uid);
  } else {
    await window.sb.from('post_reactions').upsert({ post_id: postId, user_id: uid, emoji });
    cache[emoji] = [...users, uid];
  }
  ReactionsState.cache[postId] = cache;
  return cache;
}

function renderReactions(postId, container) {
  loadReactions(postId).then(map => {
    const uid = window.State?.user?.id || '';
    let html = '<div class="reactions-row">';
    REACTION_EMOJIS.forEach(emoji => {
      const users = map[emoji] || [];
      if (users.length === 0) return;
      const reacted = users.includes(uid);
      html += `<button class="reaction-chip${reacted ? ' reacted' : ''}" data-emoji="${emoji}" title="${emoji} ${users.length}">
        <span class="emoji">${emoji}</span>
        <span class="rcount">${users.length}</span>
      </button>`;
    });
    html += `<button class="reaction-add-btn" title="Add reaction"><i class="fa-regular fa-face-smile"></i></button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.reaction-chip').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await toggleReaction(postId, btn.dataset.emoji);
        renderReactions(postId, container);
      });
    });
    container.querySelector('.reaction-add-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      showEmojiPicker(e.currentTarget, async (emoji) => {
        await toggleReaction(postId, emoji);
        renderReactions(postId, container);
      });
    });
  });
}

function showEmojiPicker(anchorEl, onPick) {
  document.querySelector('.emoji-picker-popup')?.remove();
  const popup = document.createElement('div');
  popup.className = 'emoji-picker-popup';
  REACTION_EMOJIS.forEach(emoji => {
    const opt = document.createElement('button');
    opt.className = 'emoji-option';
    opt.textContent = emoji;
    opt.addEventListener('click', e => {
      e.stopPropagation();
      onPick(emoji);
      popup.remove();
    });
    popup.appendChild(opt);
  });
  document.body.appendChild(popup);
  const rect = anchorEl.getBoundingClientRect();
  popup.style.top = (rect.bottom + 6 + window.scrollY) + 'px';
  popup.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
  const close = (e) => {
    if (!popup.contains(e.target) && e.target !== anchorEl) {
      popup.remove();
      document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

/* ── Comments ── */
const CommentsState = { cache: {} }; // keyed by postId

async function loadComments(postId) {
  try {
    const { data } = await window.sb
      .from('comments')
      .select('*, profiles(username, display_name, avatar_url, is_github)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    CommentsState.cache[postId] = data || [];
    return CommentsState.cache[postId];
  } catch {
    return [];
  }
}

async function submitComment(postId, text) {
  const uid = window.State?.user?.id;
  if (!uid || !text.trim()) return null;
  const { data, error } = await window.sb.from('comments').insert({
    post_id: postId, author_id: uid, content: text.trim()
  }).select('*, profiles(username, display_name, avatar_url, is_github)').single();
  if (error) { window.toast('Could not post comment', 'circle-exclamation'); return null; }
  if (!CommentsState.cache[postId]) CommentsState.cache[postId] = [];
  CommentsState.cache[postId].push(data);
  return data;
}

async function deleteComment(commentId, postId) {
  await window.sb.from('comments').delete().eq('id', commentId);
  if (CommentsState.cache[postId]) {
    CommentsState.cache[postId] = CommentsState.cache[postId].filter(c => c.id !== commentId);
  }
}

function renderCommentThread(postId, threadEl) {
  loadComments(postId).then(comments => {
    const uid = window.State?.user?.id || '';
    const listHtml = comments.map(c => {
      const p = c.profiles || {};
      const name = p.display_name || p.username || 'User';
      const initials = window.avatarInitials ? window.avatarInitials(name) : name.slice(0,2).toUpperCase();
      const avatarHtml = window.avatarHtml ? window.avatarHtml(p, 28) : `<div style="width:28px;height:28px;border-radius:50%;background:#444;display:flex;align-items:center;justify-content:center;font-size:11px">${initials}</div>`;
      const isOwn = c.author_id === uid;
      const ts = window.timeAgo ? window.timeAgo(c.created_at) : '';
      return `
        <div class="comment-item" data-comment-id="${c.id}">
          ${avatarHtml}
          <div class="comment-body">
            <div>
              <span class="comment-author">${name}</span>
              <span class="comment-time">${ts}</span>
            </div>
            <div class="comment-text">${escHtmlLocal(c.content)}</div>
            <div class="comment-actions">
              ${isOwn ? `<button class="comment-delete-btn" data-id="${c.id}"><i class="fa-solid fa-trash-can"></i> Delete</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    threadEl.innerHTML = listHtml + `
      <div class="comment-composer">
        <textarea class="comment-input" placeholder="Write a comment…" rows="1"></textarea>
        <button class="comment-submit-btn" title="Post comment"><i class="fa-solid fa-paper-plane"></i></button>
      </div>`;

    // Auto-grow textarea
    const ta = threadEl.querySelector('.comment-input');
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    });

    // Submit
    const submitBtn = threadEl.querySelector('.comment-submit-btn');
    const doSubmit = async () => {
      const txt = ta.value.trim();
      if (!txt) return;
      submitBtn.disabled = true;
      const newComment = await submitComment(postId, txt);
      if (newComment) {
        ta.value = '';
        ta.style.height = '';
        renderCommentThread(postId, threadEl);
        // update count badge
        updateCommentCountBadge(postId);
      }
      submitBtn.disabled = false;
    };
    submitBtn.addEventListener('click', doSubmit);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSubmit(); }
    });

    // Delete
    threadEl.querySelectorAll('.comment-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await deleteComment(btn.dataset.id, postId);
        renderCommentThread(postId, threadEl);
        updateCommentCountBadge(postId);
      });
    });
  });
}

function updateCommentCountBadge(postId) {
  const card = document.querySelector(`[data-post-id="${postId}"]`);
  if (!card) return;
  const badge = card.querySelector('.comment-count');
  if (badge) badge.textContent = (CommentsState.cache[postId] || []).length;
}

function escHtmlLocal(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Inject comment + reaction areas into post cards ── */
function injectCommentAndReactionAreas(card) {
  const postId = card.dataset.postId;
  if (!postId || card.dataset.commentInjected) return;
  card.dataset.commentInjected = '1';

  // Reactions container
  const reactionsContainer = document.createElement('div');
  reactionsContainer.className = 'post-reactions-container';
  reactionsContainer.dataset.postId = postId;

  // Comment toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'comment-toggle-btn';
  toggleBtn.innerHTML = `<i class="fa-regular fa-comment"></i><span class="comment-count">0</span>`;

  // Thread container
  const threadEl = document.createElement('div');
  threadEl.className = 'comment-thread';

  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = threadEl.classList.contains('open');
    if (!isOpen) {
      threadEl.classList.add('open');
      renderCommentThread(postId, threadEl);
    } else {
      threadEl.classList.remove('open');
    }
  });

  // Find the post actions bar (likes row) to insert after
  const actionsRow = card.querySelector('.post-actions, .post-footer, .post-meta-row');
  if (actionsRow) {
    actionsRow.appendChild(toggleBtn);
    actionsRow.insertAdjacentElement('afterend', reactionsContainer);
    reactionsContainer.insertAdjacentElement('afterend', threadEl);
  } else {
    card.appendChild(reactionsContainer);
    card.appendChild(toggleBtn);
    card.appendChild(threadEl);
  }

  // Load comment count
  loadComments(postId).then(comments => {
    const badge = card.querySelector('.comment-count');
    if (badge) badge.textContent = comments.length;
  });

  // Render reactions
  renderReactions(postId, reactionsContainer);
}

/* Watch for new post cards */
const commentObserver = new MutationObserver(mutations => {
  mutations.forEach(m => m.addedNodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches?.('.post-card') && node.dataset.postId) {
      injectCommentAndReactionAreas(node);
    }
    node.querySelectorAll?.('.post-card[data-post-id]').forEach(injectCommentAndReactionAreas);
  }));
});
commentObserver.observe(document.body, { childList: true, subtree: true });
// Also scan existing cards
document.querySelectorAll('.post-card[data-post-id]').forEach(injectCommentAndReactionAreas);


/* ══════════════════════════════════════════════════════════════
   2. TAGGING & SEARCH
══════════════════════════════════════════════════════════════ */

/* ── Tag parser / renderer ── */
function parseTags(text) {
  const matches = text.match(/#([a-zA-Z0-9_]+)/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

function renderTagsInCard(card) {
  const postId = card.dataset.postId;
  if (!postId || card.dataset.tagsInjected) return;
  // Look for tags in content
  const contentEl = card.querySelector('.post-body, .post-content, .post-text');
  if (!contentEl) return;
  const tags = parseTags(contentEl.textContent || '');
  if (tags.length === 0) return;
  card.dataset.tagsInjected = '1';
  const tagsEl = document.createElement('div');
  tagsEl.className = 'post-tags';
  tags.slice(0, 5).forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'post-tag';
    btn.textContent = tag;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openSearchPanel('#' + tag);
    });
    tagsEl.appendChild(btn);
  });
  contentEl.insertAdjacentElement('afterend', tagsEl);
}

const tagObserver = new MutationObserver(mutations => {
  mutations.forEach(m => m.addedNodes.forEach(node => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches?.('.post-card')) renderTagsInCard(node);
    node.querySelectorAll?.('.post-card').forEach(renderTagsInCard);
  }));
});
tagObserver.observe(document.body, { childList: true, subtree: true });
document.querySelectorAll('.post-card').forEach(renderTagsInCard);

/* ── Tag composer widget ── */
window.DevitTagComposer = {
  tags: [],
  attach(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tag-input-row';
    wrapper.style.position = 'relative';

    const input = document.createElement('input');
    input.className = 'tag-real-input';
    input.placeholder = 'Add tags… (e.g. react, python)';
    wrapper.appendChild(input);
    container.appendChild(wrapper);

    const suggestions = document.createElement('div');
    suggestions.className = 'tag-suggestions';
    suggestions.style.display = 'none';
    wrapper.appendChild(suggestions);

    const popularTags = ['javascript','python','react','typescript','rust','go','css','html','nodejs','webdev','ai','ml','devops','linux','opensource'];

    function renderPills() {
      wrapper.querySelectorAll('.tag-pill').forEach(p => p.remove());
      window.DevitTagComposer.tags.forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.innerHTML = `#${tag} <button data-tag="${tag}">×</button>`;
        pill.querySelector('button').addEventListener('click', () => {
          window.DevitTagComposer.tags = window.DevitTagComposer.tags.filter(t => t !== tag);
          renderPills();
        });
        wrapper.insertBefore(pill, input);
      });
    }

    input.addEventListener('input', () => {
      const q = input.value.replace(/^#/, '').toLowerCase();
      if (!q) { suggestions.style.display = 'none'; return; }
      const matches = popularTags.filter(t => t.startsWith(q) && !window.DevitTagComposer.tags.includes(t));
      if (!matches.length) { suggestions.style.display = 'none'; return; }
      suggestions.innerHTML = matches.slice(0, 6).map(t =>
        `<div class="tag-suggestion-item" data-tag="${t}"><i class="fa-solid fa-hashtag" style="font-size:11px;color:var(--violet)"></i>${t}</div>`
      ).join('');
      suggestions.style.display = '';
      suggestions.querySelectorAll('.tag-suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          addTag(item.dataset.tag);
          input.value = '';
          suggestions.style.display = 'none';
        });
      });
    });

    input.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && input.value.trim()) {
        e.preventDefault();
        addTag(input.value.replace(/[,#\s]/g,'').toLowerCase());
        input.value = '';
        suggestions.style.display = 'none';
      }
    });

    function addTag(tag) {
      if (!tag || window.DevitTagComposer.tags.includes(tag) || window.DevitTagComposer.tags.length >= 5) return;
      window.DevitTagComposer.tags.push(tag);
      renderPills();
    }

    wrapper.addEventListener('click', () => input.focus());
    return wrapper;
  }
};

/* ── Global Search Panel ── */
const TRENDING_TAGS = ['javascript','react','python','webdev','rust','typescript','ai','opensource','linux','devops'];

function buildSearchPanel() {
  if (document.getElementById('search-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'search-panel';
  panel.innerHTML = `
    <div class="search-box">
      <div class="search-input-row">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="global-search-input" placeholder="Search posts, users, tags…" autocomplete="off" spellcheck="false">
        <button class="search-close-btn" id="search-close-btn">Esc</button>
      </div>
      <div class="search-filter-tabs">
        <button class="search-filter-tab active" data-filter="all">All</button>
        <button class="search-filter-tab" data-filter="posts">Posts</button>
        <button class="search-filter-tab" data-filter="users">Users</button>
        <button class="search-filter-tab" data-filter="tags">Tags</button>
      </div>
      <div class="trending-tags" id="search-trending">
        <div class="trending-tags-label"><i class="fa-solid fa-fire"></i> Trending Tags</div>
        <div class="trending-tags-list">
          ${TRENDING_TAGS.map(t => `<button class="trending-tag-btn" data-tag="${t}">#${t}</button>`).join('')}
        </div>
      </div>
      <div class="search-results" id="search-results">
        <div class="search-empty"><i class="fa-regular fa-compass"></i>Start typing to search…</div>
      </div>
      <div class="search-shortcuts">
        <span class="search-shortcut"><kbd class="search-kbd">↑↓</kbd> Navigate</span>
        <span class="search-shortcut"><kbd class="search-kbd">Enter</kbd> Select</span>
        <span class="search-shortcut"><kbd class="search-kbd">Esc</kbd> Close</span>
        <span class="search-shortcut"><kbd class="search-kbd">/</kbd> Open search</span>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const input = panel.querySelector('#global-search-input');
  let activeFilter = 'all';
  let searchDebounce;

  panel.querySelector('#search-close-btn').addEventListener('click', closeSearchPanel);
  panel.addEventListener('click', e => { if (e.target === panel) closeSearchPanel(); });

  panel.querySelectorAll('.search-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.search-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      doSearch(input.value.trim());
    });
  });

  panel.querySelectorAll('.trending-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = '#' + btn.dataset.tag;
      doSearch('#' + btn.dataset.tag);
      input.focus();
    });
  });

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => doSearch(input.value.trim()), 200);
  });

  async function doSearch(q) {
    const resultsEl = document.getElementById('search-results');
    const trendingEl = document.getElementById('search-trending');
    if (!q) {
      trendingEl.style.display = '';
      resultsEl.innerHTML = '<div class="search-empty"><i class="fa-regular fa-compass"></i>Start typing to search…</div>';
      return;
    }
    trendingEl.style.display = 'none';
    resultsEl.innerHTML = '<div class="search-empty"><i class="fa-solid fa-spinner fa-spin"></i>Searching…</div>';

    const isTagSearch = q.startsWith('#');
    const cleanQ = isTagSearch ? q.slice(1) : q;
    let results = [];

    try {
      if ((activeFilter === 'all' || activeFilter === 'posts') && !isTagSearch) {
        const { data: posts } = await window.sb
          .from('posts').select('id, content, created_at, author_id, profiles(username, display_name)')
          .ilike('content', `%${cleanQ}%`).limit(5);
        (posts || []).forEach(p => results.push({ type: 'post', item: p }));
      }
      if (activeFilter === 'all' || activeFilter === 'posts' || isTagSearch) {
        const { data: tagPosts } = await window.sb
          .from('posts').select('id, content, created_at, profiles(username, display_name)')
          .ilike('content', `%#${cleanQ}%`).limit(5);
        (tagPosts || []).forEach(p => {
          if (!results.find(r => r.item?.id === p.id))
            results.push({ type: 'post', item: p, matchedTag: cleanQ });
        });
      }
      if ((activeFilter === 'all' || activeFilter === 'users') && !isTagSearch) {
        const { data: users } = await window.sb
          .from('profiles').select('id, username, display_name, avatar_url, bio, is_github')
          .or(`username.ilike.%${cleanQ}%,display_name.ilike.%${cleanQ}%`).limit(4);
        (users || []).forEach(u => results.push({ type: 'user', item: u }));
      }
      if (activeFilter === 'all' || activeFilter === 'tags') {
        const tagMatches = TRENDING_TAGS.filter(t => t.startsWith(cleanQ.toLowerCase()));
        tagMatches.slice(0, 3).forEach(t => results.push({ type: 'tag', item: t }));
      }
    } catch (err) {
      console.warn('[Devit Search]', err);
    }

    if (!results.length) {
      resultsEl.innerHTML = `<div class="search-empty"><i class="fa-regular fa-face-frown-open"></i>No results for "<strong>${escHtmlLocal(q)}</strong>"</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(r => {
      if (r.type === 'post') {
        const p = r.item;
        const author = p.profiles?.display_name || p.profiles?.username || 'Unknown';
        const snippet = (p.content || '').slice(0, 80);
        return `<div class="search-result-item" data-type="post" data-id="${p.id}">
          <div class="search-result-icon"><i class="fa-regular fa-file-lines"></i></div>
          <div class="search-result-body">
            <div class="search-result-title">${escHtmlLocal(snippet)}…</div>
            <div class="search-result-sub">by @${escHtmlLocal(author)}</div>
          </div>
          ${r.matchedTag ? `<span class="search-result-tag">#${r.matchedTag}</span>` : ''}
        </div>`;
      }
      if (r.type === 'user') {
        const u = r.item;
        const name = u.display_name || u.username || 'User';
        const initials = (name.slice(0,2) || 'U').toUpperCase();
        return `<div class="search-result-item" data-type="user" data-id="${u.id}">
          <div class="search-result-icon" style="font-size:13px;font-weight:900;color:var(--text-primary)">${u.avatar_url ? `<img src="${u.avatar_url}" style="width:36px;height:36px;border-radius:10px;object-fit:cover">` : initials}</div>
          <div class="search-result-body">
            <div class="search-result-title">${escHtmlLocal(name)} ${u.is_github ? '<i class="fa-brands fa-github" style="font-size:11px;color:var(--text-muted)"></i>' : ''}</div>
            <div class="search-result-sub">@${escHtmlLocal(u.username || '')} ${u.bio ? '· ' + u.bio.slice(0,40) : ''}</div>
          </div>
        </div>`;
      }
      if (r.type === 'tag') {
        return `<div class="search-result-item" data-type="tag" data-tag="${r.item}">
          <div class="search-result-icon" style="color:var(--violet)"><i class="fa-solid fa-hashtag"></i></div>
          <div class="search-result-body">
            <div class="search-result-title">#${r.item}</div>
            <div class="search-result-sub">Explore posts tagged with #${r.item}</div>
          </div>
        </div>`;
      }
      return '';
    }).join('');

    // Result click handlers
    resultsEl.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        closeSearchPanel();
        const type = item.dataset.type;
        if (type === 'tag') {
          if (typeof window.switchView === 'function') window.switchView('feed');
          window.toast('#' + item.dataset.tag, 'hashtag');
        }
        // Other types would navigate to post/user view
      });
    });
  }
}

function openSearchPanel(prefill = '') {
  const panel = document.getElementById('search-panel');
  if (!panel) { buildSearchPanel(); }
  document.getElementById('search-panel').classList.add('open');
  const input = document.getElementById('global-search-input');
  if (prefill) { input.value = prefill; input.dispatchEvent(new Event('input')); }
  setTimeout(() => input?.focus(), 50);
}

function closeSearchPanel() {
  document.getElementById('search-panel')?.classList.remove('open');
}

window.openSearchPanel = openSearchPanel;
window.closeSearchPanel = closeSearchPanel;

/* ── Keyboard shortcut / → search ── */
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
    e.preventDefault(); openSearchPanel();
  }
  if (e.key === 'Escape') closeSearchPanel();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearchPanel(); }
});

/* ── Inject search trigger into topbar ── */
function injectSearchTrigger() {
  const topbar = document.getElementById('topbar') || document.querySelector('.topbar, nav.top-nav');
  if (!topbar || topbar.querySelector('#search-trigger-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'search-trigger-btn';
  btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><span style="opacity:0.6">Search…</span><kbd>/</kbd>`;
  btn.addEventListener('click', () => openSearchPanel());
  // Insert after logo area
  const logo = topbar.querySelector('.topbar-logo, .brand, .logo');
  if (logo) logo.insertAdjacentElement('afterend', btn);
  else topbar.insertAdjacentElement('afterbegin', btn);
}

const topbarObserver = new MutationObserver(() => injectSearchTrigger());
topbarObserver.observe(document.body, { childList: true, subtree: true });
injectSearchTrigger();

/* Build the search panel DOM */
buildSearchPanel();


/* ══════════════════════════════════════════════════════════════
   3. WELCOME TOUR
══════════════════════════════════════════════════════════════ */

const TOUR_STEPS = [
  {
    selector: '#bottom-nav [data-nav="feed"], .bnav-btn[data-nav="feed"]',
    title: 'Your Workspace Feed',
    body: 'This is your activity hub — see what teammates are shipping, post updates, and review code all in one place.',
    position: 'top',
  },
  {
    selector: '#mobile-fab, .composer-btn, [data-action="new-post"]',
    title: 'Create a Post',
    body: 'Tap here to log what you\'re building — a snippet, a dev log, a question, or a poll. Add tags to reach the right audience.',
    position: 'top',
  },
  {
    selector: '#bottom-nav [data-nav="explore"], .bnav-btn[data-nav="explore"]',
    title: 'Discover & Explore',
    body: 'Find trending projects, search by tag like #react or #rust, and discover developers worth following.',
    position: 'top',
  },
  {
    selector: '#search-trigger-btn, #bottom-nav [data-nav="explore"]',
    title: 'Powerful Search',
    body: 'Press <strong>/</strong> or <strong>⌘K</strong> anytime to search posts, users, and tags instantly.',
    position: 'bottom',
  },
  {
    selector: '#bottom-nav [data-nav="links"], .bnav-btn[data-nav="links"]',
    title: 'Collab — Your Dev Network',
    body: 'Link up with other developers for pair programming, code reviews, and project collaboration.',
    position: 'top',
  },
  {
    selector: '#bottom-nav [data-nav="notifications"], .bnav-btn[data-nav="notifications"]',
    title: 'Your Inbox',
    body: 'Reactions, comments, link requests, and mentions land here. Zero noise, only the stuff that matters.',
    position: 'top',
  },
  {
    selector: '#bottom-nav [data-nav="profile"], .bnav-btn[data-nav="profile"]',
    title: 'Your Dev Profile',
    body: 'Your public dev card — activity log, DevScore, pinned posts, and GitHub stats all in one place.',
    position: 'top',
  },
];

let tourStep = 0;
let tourEl = null;

function buildTourOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.innerHTML = `
    <div class="tour-spotlight" id="tour-spotlight"></div>
    <div class="tour-tooltip" id="tour-tooltip">
      <div class="tour-tooltip-step" id="tour-step-label"></div>
      <div class="tour-tooltip-title" id="tour-tooltip-title"></div>
      <div class="tour-tooltip-body" id="tour-tooltip-body"></div>
      <div class="tour-tooltip-actions">
        <div class="tour-dots" id="tour-dots"></div>
        <button class="tour-btn-skip" id="tour-skip-btn">Skip</button>
        <button class="tour-btn-next" id="tour-next-btn">Next</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  tourEl = overlay;

  overlay.querySelector('#tour-skip-btn').addEventListener('click', endTour);
  overlay.querySelector('#tour-next-btn').addEventListener('click', () => {
    tourStep++;
    if (tourStep >= TOUR_STEPS.length) { endTour(true); return; }
    renderTourStep();
  });
}

function renderTourStep() {
  if (!tourEl) return;
  const step = TOUR_STEPS[tourStep];
  const target = document.querySelector(step.selector);

  const spotlight = tourEl.querySelector('#tour-spotlight');
  const tooltip = tourEl.querySelector('#tour-tooltip');

  // Dots
  const dotsEl = tourEl.querySelector('#tour-dots');
  dotsEl.innerHTML = TOUR_STEPS.map((_, i) =>
    `<div class="tour-dot${i === tourStep ? ' active' : ''}"></div>`
  ).join('');

  tourEl.querySelector('#tour-step-label').textContent = `Step ${tourStep + 1} of ${TOUR_STEPS.length}`;
  tourEl.querySelector('#tour-tooltip-title').textContent = step.title;
  tourEl.querySelector('#tour-tooltip-body').innerHTML = step.body;
  tourEl.querySelector('#tour-next-btn').textContent = tourStep === TOUR_STEPS.length - 1 ? 'Finish 🎉' : 'Next';

  if (target) {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    spotlight.style.cssText = `
      left: ${rect.left - pad + window.scrollX}px;
      top: ${rect.top - pad + window.scrollY}px;
      width: ${rect.width + pad * 2}px;
      height: ${rect.height + pad * 2}px;
    `;
    // Position tooltip
    const tooltipW = 300;
    let left = rect.left + rect.width / 2 - tooltipW / 2;
    let top;
    if (step.position === 'top' || rect.bottom > window.innerHeight * 0.6) {
      top = rect.top - 10 - 200 + window.scrollY;
    } else {
      top = rect.bottom + 16 + window.scrollY;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));
    top = Math.max(12, top);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  } else {
    // Center if no target
    spotlight.style.cssText = 'display:none';
    tooltip.style.left = '50%';
    tooltip.style.top = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
  }
}

function startTour() {
  if (document.getElementById('tour-overlay')) return;
  tourStep = 0;
  buildTourOverlay();
  renderTourStep();
  localStorage.setItem('devit-tour-done', '1');
}

function endTour(completed = false) {
  tourEl?.remove();
  tourEl = null;
  if (completed) window.toast('Tour complete! Go build something great 🚀', 'rocket');
}

window.startDevitTour = startTour;

/* Auto-show tour for first-time users (after login) */
function maybeShowTour() {
  if (localStorage.getItem('devit-tour-done')) return;
  // Small delay to let app render
  setTimeout(startTour, 1200);
}

/* ══════════════════════════════════════════════════════════════
   4. PROFILE SETUP WIZARD
══════════════════════════════════════════════════════════════ */

const WIZARD_STEPS = [
  { id: 'welcome',    label: 'Welcome' },
  { id: 'github',     label: 'GitHub' },
  { id: 'devscore',   label: 'DevScore' },
  { id: 'profile',    label: 'Profile' },
  { id: 'stack',      label: 'Tech Stack' },
  { id: 'done',       label: 'Done' },
];

const TECH_OPTIONS = [
  'JavaScript','TypeScript','Python','Rust','Go','Java','C++','C#','Ruby','Swift',
  'Kotlin','PHP','Dart','React','Vue','Angular','Next.js','Node.js','Django','FastAPI',
  'PostgreSQL','MongoDB','Redis','Docker','Kubernetes','AWS','GCP','Linux','Git','GraphQL',
];

const DEVSCORE_PREFS = [
  { id: 'commits', icon: '📦', title: 'Commits & PRs', desc: 'Track GitHub activity and pull requests' },
  { id: 'posts',   icon: '✍️', title: 'Posts & Logs',   desc: 'Weight dev logs and knowledge sharing' },
  { id: 'reviews', icon: '🔍', title: 'Code Reviews',   desc: 'Credit given for reviewing others\' code' },
  { id: 'collab',  icon: '🤝', title: 'Collaboration',  desc: 'Pair sessions and link activity' },
];

const WizardState = {
  step: 0,
  githubConnected: false,
  devscorePrefs: ['commits','posts'],
  displayName: '',
  username: '',
  bio: '',
  avatarUrl: '',
  techStack: [],
};

function buildSetupWizard() {
  if (document.getElementById('setup-wizard-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'setup-wizard-overlay';
  overlay.innerHTML = `
    <div class="setup-wizard" id="setup-wizard">
      <div class="wizard-progress-bar" id="wizard-progress-bar" style="width:${100 / WIZARD_STEPS.length}%"></div>
      <div class="wizard-header">
        <div class="wizard-step-label" id="wizard-step-label"></div>
        <div class="wizard-title" id="wizard-title"></div>
        <div class="wizard-subtitle" id="wizard-subtitle"></div>
      </div>
      <div class="wizard-body" id="wizard-body"></div>
      <div class="wizard-footer">
        <button class="wizard-btn-skip" id="wizard-skip-btn">Skip setup</button>
        <button class="wizard-btn-back" id="wizard-back-btn" style="display:none">Back</button>
        <button class="wizard-btn-next" id="wizard-next-btn">Continue</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#wizard-skip-btn').addEventListener('click', closeSetupWizard);
  overlay.querySelector('#wizard-back-btn').addEventListener('click', () => {
    if (WizardState.step > 0) { WizardState.step--; renderWizardStep(); }
  });
  overlay.querySelector('#wizard-next-btn').addEventListener('click', wizardNext);

  renderWizardStep();
}

function renderWizardStep() {
  const step = WIZARD_STEPS[WizardState.step];
  const total = WIZARD_STEPS.length;
  const pct = Math.round(((WizardState.step + 1) / total) * 100);

  document.getElementById('wizard-progress-bar').style.width = pct + '%';
  document.getElementById('wizard-step-label').textContent = `Step ${WizardState.step + 1} of ${total}`;
  document.getElementById('wizard-back-btn').style.display = WizardState.step > 0 && WizardState.step < total - 1 ? '' : 'none';
  document.getElementById('wizard-skip-btn').style.display = WizardState.step < total - 1 ? '' : 'none';

  const nextBtn = document.getElementById('wizard-next-btn');
  nextBtn.textContent = WizardState.step === total - 1 ? 'Go to my profile 🚀' : 'Continue';

  let title, subtitle, bodyHtml;

  switch (step.id) {
    case 'welcome':
      title = 'Welcome to Devit 👋';
      subtitle = 'Let\'s get your dev profile set up in under 2 minutes.';
      bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:14px">
          ${['Connect your GitHub to auto-fill your profile', 'Set your DevScore preferences', 'Pick your tech stack', 'Add a bio and avatar'].map((item, i) =>
            `<div style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:var(--bg-elevated);border:1px solid var(--border)">
               <div style="width:32px;height:32px;border-radius:10px;background:var(--cyan-dim);border:1px solid rgba(99,217,255,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:var(--cyan);flex-shrink:0">${i+1}</div>
               <span style="font-size:13.5px;color:var(--text-secondary)">${item}</span>
             </div>`).join('')}
        </div>`;
      break;

    case 'github':
      title = 'Connect GitHub';
      subtitle = 'Auto-fill your profile, display contribution stats, and unlock the GitHub badge.';
      const isGH = WizardState.githubConnected || window.State?.profile?.is_github;
      bodyHtml = `
        <div class="wizard-github-card${isGH ? ' connected' : ''}" id="wizard-github-connect">
          <div class="wizard-github-icon"><i class="fa-brands fa-github" style="color:var(--text-primary)"></i></div>
          <div class="wizard-github-text">
            <div class="wizard-github-title">GitHub Account</div>
            <div class="wizard-github-desc">${isGH ? 'Connected — your profile is synced' : 'Click to connect via GitHub OAuth'}</div>
          </div>
          <div class="wizard-github-status">${isGH ? '<i class="fa-solid fa-circle-check"></i> Connected' : '<i class="fa-brands fa-github"></i> Connect'}</div>
        </div>
        <div style="margin-top:16px;padding:14px;border-radius:14px;background:var(--bg-elevated);border:1px solid var(--border)">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">What you unlock</div>
          ${['GitHub avatar + display name auto-fill','Contribution heatmap on your profile','GitHub badge on your posts and avatar','DevScore GitHub multiplier'].map(item =>
            `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin-bottom:6px">
               <i class="fa-solid fa-check" style="color:var(--emerald);font-size:11px;flex-shrink:0"></i>${item}
             </div>`).join('')}
        </div>`;
      break;

    case 'devscore':
      title = 'DevScore Preferences';
      subtitle = 'Choose which activities contribute most to your DevScore.';
      bodyHtml = `<div class="devscore-pref-grid" id="devscore-pref-grid">
        ${DEVSCORE_PREFS.map(p => `
          <div class="devscore-pref-card${WizardState.devscorePrefs.includes(p.id) ? ' selected' : ''}" data-pref="${p.id}">
            <div class="devscore-pref-icon">${p.icon}</div>
            <div class="devscore-pref-title">${p.title}</div>
            <div class="devscore-pref-desc">${p.desc}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:14px;font-size:12.5px;color:var(--text-muted)">Select all that apply. You can change this later in Settings.</div>`;
      break;

    case 'profile':
      title = 'Build Your Profile';
      subtitle = 'Tell the community who you are.';
      const avatarPreview = WizardState.avatarUrl
        ? `<img src="${WizardState.avatarUrl}" alt="avatar">`
        : `<span style="font-size:26px;font-weight:900;color:var(--cyan)">${(WizardState.displayName || WizardState.username || '?').slice(0,2).toUpperCase()}</span>`;
      bodyHtml = `
        <div class="wizard-avatar-picker">
          <div class="wizard-avatar-preview" id="wizard-avatar-preview">${avatarPreview}</div>
          <div>
            <button class="wizard-avatar-upload-btn" id="wizard-avatar-btn"><i class="fa-solid fa-upload"></i> Upload photo</button>
            <input type="file" id="wizard-avatar-file" accept="image/*" style="display:none">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:5px">JPG, PNG or GIF · Max 2MB</div>
          </div>
        </div>
        <label class="wizard-label">Display Name</label>
        <input class="wizard-input" id="wizard-display-name" placeholder="How should we call you?" value="${WizardState.displayName}" maxlength="40">
        <label class="wizard-label">Username</label>
        <input class="wizard-input" id="wizard-username" placeholder="your-handle" value="${WizardState.username}" maxlength="30">
        <label class="wizard-label">Bio</label>
        <textarea class="wizard-input wizard-textarea" id="wizard-bio" placeholder="I build things with code and coffee…" maxlength="160">${WizardState.bio}</textarea>
        <label class="wizard-label">Location</label>
        <input class="wizard-input" id="wizard-location" placeholder="City, Country" maxlength="60">
      `;
      break;

    case 'stack':
      title = 'Your Tech Stack';
      subtitle = 'Pick the languages and tools you work with.';
      bodyHtml = `
        <div class="tech-stack-picker" id="tech-stack-picker">
          ${TECH_OPTIONS.map(t => `<button class="tech-chip${WizardState.techStack.includes(t) ? ' selected' : ''}" data-tech="${t}">${t}</button>`).join('')}
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">Selected: <span id="tech-count">${WizardState.techStack.length}</span> / 10</div>`;
      break;

    case 'done':
      title = 'You\'re all set!';
      subtitle = '';
      bodyHtml = `
        <div class="wizard-celebrate">
          <span class="wizard-celebrate-emoji">🚀</span>
          <div class="wizard-celebrate-title">Profile complete!</div>
          <div class="wizard-celebrate-body">Your dev profile is ready. Start sharing what you're building, connect with other devs, and let your DevScore climb.</div>
        </div>`;
      break;
  }

  document.getElementById('wizard-title').textContent = title;
  document.getElementById('wizard-subtitle').textContent = subtitle;
  document.getElementById('wizard-body').innerHTML = bodyHtml;

  // Step-specific listeners
  if (step.id === 'github') {
    document.getElementById('wizard-github-connect')?.addEventListener('click', async () => {
      if (WizardState.githubConnected || window.State?.profile?.is_github) return;
      // Trigger GitHub OAuth via Supabase
      await window.sb?.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.href } });
    });
  }

  if (step.id === 'devscore') {
    document.querySelectorAll('.devscore-pref-card').forEach(card => {
      card.addEventListener('click', () => {
        const pref = card.dataset.pref;
        if (WizardState.devscorePrefs.includes(pref)) {
          WizardState.devscorePrefs = WizardState.devscorePrefs.filter(p => p !== pref);
          card.classList.remove('selected');
        } else {
          WizardState.devscorePrefs.push(pref);
          card.classList.add('selected');
        }
      });
    });
  }

  if (step.id === 'profile') {
    document.getElementById('wizard-avatar-btn')?.addEventListener('click', () => {
      document.getElementById('wizard-avatar-file')?.click();
    });
    document.getElementById('wizard-avatar-file')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        WizardState.avatarUrl = ev.target.result;
        const preview = document.getElementById('wizard-avatar-preview');
        if (preview) preview.innerHTML = `<img src="${ev.target.result}" alt="avatar">`;
      };
      reader.readAsDataURL(file);
    });
  }

  if (step.id === 'stack') {
    document.querySelectorAll('.tech-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tech = chip.dataset.tech;
        if (WizardState.techStack.includes(tech)) {
          WizardState.techStack = WizardState.techStack.filter(t => t !== tech);
          chip.classList.remove('selected');
        } else if (WizardState.techStack.length < 10) {
          WizardState.techStack.push(tech);
          chip.classList.add('selected');
        } else {
          window.toast('Max 10 technologies', 'circle-info');
        }
        const countEl = document.getElementById('tech-count');
        if (countEl) countEl.textContent = WizardState.techStack.length;
      });
    });
  }
}

async function wizardNext() {
  const step = WIZARD_STEPS[WizardState.step];

  // Collect data before advancing
  if (step.id === 'profile') {
    WizardState.displayName = document.getElementById('wizard-display-name')?.value.trim() || '';
    WizardState.username = document.getElementById('wizard-username')?.value.trim() || '';
    WizardState.bio = document.getElementById('wizard-bio')?.value.trim() || '';
    const location = document.getElementById('wizard-location')?.value.trim() || '';

    if (WizardState.displayName || WizardState.bio || location) {
      const uid = window.State?.user?.id;
      if (uid) {
        const update = {};
        if (WizardState.displayName) update.display_name = WizardState.displayName;
        if (WizardState.bio) update.bio = WizardState.bio;
        if (location) update.location = location;
        if (WizardState.username) update.username = WizardState.username;
        await window.sb?.from('profiles').update(update).eq('id', uid);
        if (window.State) {
          window.State.profile = { ...window.State.profile, ...update };
        }
      }
    }
  }

  if (step.id === 'stack' && WizardState.techStack.length) {
    const uid = window.State?.user?.id;
    if (uid) {
      await window.sb?.from('profiles').update({ tech_stack: WizardState.techStack }).eq('id', uid);
    }
  }

  if (step.id === 'done') {
    closeSetupWizard();
    window.toast('Profile set up! Welcome to Devit 🎉', 'rocket');
    // Offer tour
    setTimeout(() => {
      if (!localStorage.getItem('devit-tour-done')) startTour();
    }, 800);
    return;
  }

  WizardState.step++;
  renderWizardStep();
}

function closeSetupWizard() {
  document.getElementById('setup-wizard-overlay')?.remove();
  localStorage.setItem('devit-setup-done', '1');
}

function startSetupWizard() {
  if (document.getElementById('setup-wizard-overlay')) return;
  WizardState.step = 0;
  // Pre-fill from existing profile
  const profile = window.State?.profile;
  if (profile) {
    WizardState.displayName = profile.display_name || '';
    WizardState.username    = profile.username || '';
    WizardState.bio         = profile.bio || '';
    WizardState.avatarUrl   = profile.avatar_url || '';
    WizardState.techStack   = profile.tech_stack || [];
    WizardState.githubConnected = profile.is_github || false;
  }
  buildSetupWizard();
}

window.startDevitSetupWizard = startSetupWizard;

/* Auto-launch wizard for new users who haven't set up their profile */
function maybeShowSetupWizard() {
  if (localStorage.getItem('devit-setup-done')) return;
  const profile = window.State?.profile;
  if (!profile) return;
  const isIncomplete = !profile.display_name || !profile.bio || !(profile.tech_stack?.length);
  if (isIncomplete) setTimeout(startSetupWizard, 1500);
}

/* ══════════════════════════════════════════════════════════════
   HOOK INTO AUTH EVENTS
══════════════════════════════════════════════════════════════ */
(function hookIntoAuth() {
  // Poll for user session becoming available (after login)
  let lastUser = null;
  const authPoll = setInterval(() => {
    const user = window.State?.user;
    if (user && !lastUser) {
      lastUser = user;
      // Give app time to fully render
      setTimeout(() => {
        maybeShowSetupWizard();
        maybeShowTour();
      }, 2000);
    }
    if (!user) lastUser = null;
  }, 500);
})();

/* ══════════════════════════════════════════════════════════════
   SUPABASE SQL ADDITIONS (log to console)
══════════════════════════════════════════════════════════════ */
console.log(`
/* ── Run in Supabase Dashboard > SQL Editor ── */

-- Post reactions table (emoji reactions)
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id   uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  user_id   uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  emoji     text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reactions read"   ON post_reactions FOR SELECT USING (true);
CREATE POLICY "Auth reactions insert"   ON post_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own reactions delete"    ON post_reactions FOR DELETE  USING (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE post_reactions;

-- Add devscore_prefs and is_setup_done to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS devscore_prefs text[]  DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setup_complete  boolean DEFAULT false;
`);

console.log('[Devit New Features Patch] ✓ Loaded: Comments, Reactions, Tagging, Search, Welcome Tour, Profile Wizard');
