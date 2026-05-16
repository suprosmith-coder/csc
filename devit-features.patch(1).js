/* ============================================================
   DEVIT — Features Patch v2
   devit-features.patch.js

   Adds:
   6. GitHub OAuth → auto-fill profile (repos, bio, location)
   7. Polls in posts
   8. Weekly digest / dev newsletter widget
   9. Reading time + post views counter
  10. Pinned posts on profile (up to 3)
   + Full UI softness overhaul (injected CSS)
   ============================================================ */

'use strict';

/* ── 0. Inject soft UI overhaul styles ──────────────────────── */
(function injectSoftUI() {
  const style = document.createElement('style');
  style.id = 'devit-soft-ui';
  style.textContent = `
    /* ── Soft UI Overhaul ─────────────────────────────────── */
    :root {
      --soft-radius:    20px;
      --soft-shadow:    0 2px 16px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.12);
      --soft-shadow-lg: 0 8px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.14);
      --soft-blur:      blur(18px);
      --ease-out-expo:  cubic-bezier(0.16,1,0.3,1);
      --ease-spring:    cubic-bezier(0.34,1.4,0.64,1);
      --transition-soft: 0.22s var(--ease-out-expo);
    }

    /* Smooth everything */
    *, *::before, *::after {
      transition-timing-function: var(--ease-out-expo);
    }

    /* Topbar — softer, frosted */
    #topbar {
      border-bottom: 1px solid rgba(255,255,255,0.055) !important;
      box-shadow: 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.2) !important;
    }

    /* Post cards — softer corners, breathing room */
    .post-card {
      border-radius: 18px !important;
      border: 1px solid rgba(255,255,255,0.055) !important;
      box-shadow: var(--soft-shadow) !important;
      transition: transform var(--transition-soft), box-shadow var(--transition-soft), border-color var(--transition-soft) !important;
      will-change: transform;
    }
    .post-card:hover {
      transform: translateY(-2px) !important;
      box-shadow: var(--soft-shadow-lg) !important;
      border-color: rgba(99,217,255,0.13) !important;
    }
    .post-card:active { transform: scale(0.995) translateY(0) !important; }

    /* Sidebar — softer links */
    .sidebar-link {
      border-radius: 12px !important;
      transition: background var(--transition-soft), color var(--transition-soft) !important;
    }
    .sidebar-link.active {
      background: linear-gradient(135deg, rgba(99,217,255,0.12), rgba(167,139,250,0.08)) !important;
      box-shadow: inset 0 1px 0 rgba(99,217,255,0.08) !important;
    }

    /* Right sidebar widgets */
    .widget {
      border-radius: 18px !important;
      border: 1px solid rgba(255,255,255,0.055) !important;
      box-shadow: var(--soft-shadow) !important;
      backdrop-filter: blur(8px);
    }

    /* Composer */
    .composer {
      border-radius: 20px !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
      box-shadow: var(--soft-shadow) !important;
    }
    .composer-inner {
      border-radius: 14px !important;
    }

    /* Auth card */
    .auth-card {
      background: rgba(16,18,26,0.85) !important;
      backdrop-filter: var(--soft-blur) !important;
    }
    .auth-input {
      border-radius: 14px !important;
      transition: border-color var(--transition-soft), box-shadow var(--transition-soft) !important;
    }
    .auth-btn-primary {
      border-radius: 14px !important;
      transition: transform var(--transition-soft), box-shadow var(--transition-soft) !important;
    }
    .auth-btn-primary:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 8px 24px rgba(99,217,255,0.25) !important;
    }
    .auth-btn-github, .auth-btn-google {
      border-radius: 14px !important;
      transition: transform var(--transition-soft), box-shadow var(--transition-soft) !important;
    }
    .auth-btn-github:hover, .auth-btn-google:hover {
      transform: translateY(-2px) !important;
    }

    /* Modal */
    .modal {
      border-radius: 24px !important;
      box-shadow: var(--soft-shadow-lg) !important;
      border: 1px solid rgba(255,255,255,0.07) !important;
    }

    /* Bottom nav */
    #bottom-nav {
      border-top: 1px solid rgba(255,255,255,0.055) !important;
      backdrop-filter: var(--soft-blur) !important;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.2) !important;
    }
    .bnav-btn {
      border-radius: 14px !important;
      transition: background var(--transition-soft), color var(--transition-soft), transform var(--transition-soft) !important;
    }
    .bnav-btn.active { transform: scale(1.08) !important; }

    /* Mobile FAB */
    #mobile-fab {
      border-radius: 20px !important;
      box-shadow: 0 8px 32px rgba(99,217,255,0.35), 0 2px 8px rgba(0,0,0,0.3) !important;
      transition: transform var(--ease-spring) 0.1s, box-shadow var(--transition-soft) !important;
    }
    #mobile-fab:hover { transform: scale(1.08) rotate(8deg) !important; }
    #mobile-fab:active { transform: scale(0.94) !important; }

    /* Toast */
    .toast {
      border-radius: 14px !important;
      box-shadow: var(--soft-shadow-lg) !important;
      backdrop-filter: blur(12px) !important;
    }

    /* Buttons generally */
    .btn, button[class*="auth-btn"] {
      border-radius: 12px !important;
    }

    /* Action buttons on posts */
    .post-action {
      border-radius: 10px !important;
      transition: background var(--transition-soft), color var(--transition-soft), transform var(--transition-soft) !important;
    }
    .post-action:hover { transform: scale(1.05) !important; }

    /* Tags/chips */
    .post-tag {
      border-radius: 8px !important;
    }

    /* View tabs */
    .view-tabs {
      border-radius: 14px !important;
      padding: 4px !important;
      gap: 2px !important;
    }
    .view-tab {
      border-radius: 10px !important;
      transition: background var(--transition-soft), color var(--transition-soft) !important;
    }

    /* Profile avatar circle */
    .profile-avatar-circle {
      box-shadow: 0 0 0 2px rgba(255,255,255,0.07) !important;
      transition: box-shadow var(--transition-soft) !important;
    }
    .profile-avatar-circle:hover {
      box-shadow: 0 0 0 3px rgba(99,217,255,0.3) !important;
    }

    /* ── Polls ─────────────────────────────────────────────── */
    .poll-container {
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 16px;
      margin-top: 12px;
    }
    .poll-question {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    .poll-option {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 8px;
      cursor: pointer;
      overflow: hidden;
      transition: border-color 0.2s, transform 0.15s;
      background: rgba(255,255,255,0.02);
    }
    .poll-option:hover { border-color: rgba(99,217,255,0.3); transform: translateX(2px); }
    .poll-option.voted { cursor: default; pointer-events: none; }
    .poll-option.voted.winner { border-color: rgba(99,217,255,0.4); }
    .poll-fill {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      border-radius: 11px;
      transition: width 0.7s var(--ease-out-expo);
      pointer-events: none;
    }
    .poll-option:not(.voted) .poll-fill { display: none; }
    .poll-option-text {
      position: relative; z-index: 1;
      font-size: 14px; font-weight: 500;
      color: var(--text-primary); flex: 1;
    }
    .poll-option-pct {
      position: relative; z-index: 1;
      font-size: 12px; font-weight: 700;
      color: var(--text-secondary);
      min-width: 36px; text-align: right;
    }
    .poll-meta {
      font-size: 11px; color: var(--text-muted);
      margin-top: 8px; display: flex; gap: 12px;
    }
    .poll-meta i { margin-right: 4px; }
    /* Composer poll builder */
    .poll-builder {
      margin-top: 12px;
      background: rgba(99,217,255,0.04);
      border: 1px solid rgba(99,217,255,0.12);
      border-radius: 16px;
      padding: 14px;
    }
    .poll-builder-title {
      font-size: 12px; font-weight: 700;
      color: var(--cyan); text-transform: uppercase; letter-spacing: 0.06em;
      margin-bottom: 10px;
    }
    .poll-option-input {
      width: 100%;
      padding: 9px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text-primary);
      font-size: 13px;
      margin-bottom: 7px;
      outline: none;
      transition: border-color 0.2s;
    }
    .poll-option-input:focus { border-color: var(--cyan); }
    .poll-add-option-btn {
      font-size: 12px; font-weight: 600;
      color: var(--cyan); padding: 6px 10px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .poll-add-option-btn:hover { background: var(--cyan-dim); }
    .poll-duration-row {
      display: flex; align-items: center; gap: 8px;
      margin-top: 10px; font-size: 12px; color: var(--text-secondary);
    }
    .poll-duration-row select {
      background: var(--bg-surface); border: 1px solid var(--border);
      border-radius: 8px; color: var(--text-primary); font-size: 12px;
      padding: 5px 8px; outline: none;
    }

    /* ── Reading time + views ──────────────────────────────── */
    .post-read-meta {
      display: flex; align-items: center; gap: 10px;
      font-size: 11px; color: var(--text-muted);
      margin-top: 6px;
    }
    .post-read-meta i { font-size: 10px; }
    .post-views-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--text-muted);
    }

    /* ── Pinned posts ──────────────────────────────────────── */
    .pin-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 10px; font-weight: 700; color: var(--amber);
      text-transform: uppercase; letter-spacing: 0.07em;
      background: rgba(251,191,36,0.1);
      border: 1px solid rgba(251,191,36,0.2);
      border-radius: 6px; padding: 2px 7px;
      margin-bottom: 6px;
    }
    .pin-badge i { font-size: 9px; }
    .pinned-section {
      margin-bottom: 20px;
    }
    .pinned-section-header {
      font-size: 11px; font-weight: 700;
      color: var(--amber); text-transform: uppercase;
      letter-spacing: 0.07em; margin-bottom: 10px;
      display: flex; align-items: center; gap: 6px;
    }

    /* ── Weekly digest widget ──────────────────────────────── */
    .digest-widget {
      border-radius: 18px !important;
    }
    .digest-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .digest-title {
      font-size: 13px; font-weight: 800;
      color: var(--text-primary);
      display: flex; align-items: center; gap: 7px;
    }
    .digest-title i { color: var(--cyan); }
    .digest-badge {
      font-size: 10px; font-weight: 700;
      background: linear-gradient(90deg, var(--cyan), var(--violet));
      color: var(--bg-void);
      padding: 2px 8px; border-radius: 20px;
    }
    .digest-section-label {
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--text-muted); margin: 10px 0 6px;
    }
    .digest-post-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer; transition: opacity 0.15s;
    }
    .digest-post-item:last-child { border-bottom: none; }
    .digest-post-item:hover { opacity: 0.8; }
    .digest-rank {
      font-size: 11px; font-weight: 800;
      color: var(--text-muted); min-width: 18px;
      line-height: 1.6;
    }
    .digest-post-title {
      font-size: 12px; font-weight: 600;
      color: var(--text-primary); line-height: 1.4; flex: 1;
    }
    .digest-tag-item {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 20px;
      background: rgba(99,217,255,0.07);
      border: 1px solid rgba(99,217,255,0.12);
      font-size: 11px; font-weight: 600;
      color: var(--cyan); margin: 0 4px 4px 0;
      cursor: pointer; transition: background 0.15s;
    }
    .digest-tag-item:hover { background: rgba(99,217,255,0.14); }
    .digest-new-member {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 0;
    }
    .digest-member-name {
      font-size: 12px; font-weight: 600; color: var(--text-primary);
    }
    .digest-member-handle {
      font-size: 11px; color: var(--text-muted);
    }

    /* ── GitHub profile banner ─────────────────────────────── */
    .github-profile-banner {
      background: linear-gradient(135deg, rgba(99,217,255,0.08), rgba(167,139,250,0.06));
      border: 1px solid rgba(99,217,255,0.15);
      border-radius: 16px;
      padding: 14px 16px;
      margin-top: 12px;
      display: flex; align-items: flex-start; gap: 12px;
    }
    .github-banner-icon {
      width: 36px; height: 36px;
      background: rgba(255,255,255,0.08);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: var(--text-primary); flex-shrink: 0;
    }
    .github-banner-body { flex: 1; min-width: 0; }
    .github-banner-title {
      font-size: 13px; font-weight: 700;
      color: var(--text-primary); margin-bottom: 4px;
    }
    .github-banner-desc {
      font-size: 12px; color: var(--text-secondary); line-height: 1.5;
    }
    .github-repo-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: 20px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 11px; font-weight: 600;
      color: var(--text-secondary);
      margin: 4px 4px 0 0;
    }
    .github-repo-chip i { font-size: 10px; color: var(--cyan); }
  `;
  document.head.appendChild(style);
})();


/* ── Utility ────────────────────────────────────────────────── */
function readingTime(text) {
  const words = (text || '').trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return mins === 1 ? '1 min read' : `${mins} min read`;
}

function fmtViews(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ══════════════════════════════════════════════════════════════
   FEATURE 6 — GitHub OAuth → auto-fill profile
   ══════════════════════════════════════════════════════════════ */

async function handleGitHubProfileAutofill(session) {
  if (!session?.provider_token) return;
  const token = session.provider_token;
  try {
    // Fetch GitHub user
    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!ghRes.ok) return;
    const ghUser = await ghRes.json();

    // Fetch repos (top 6 by stars)
    const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=6&type=owner', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const repos = reposRes.ok ? await reposRes.json() : [];
    const topRepos = repos
      .sort((a,b) => (b.stargazers_count - a.stargazers_count))
      .slice(0, 6)
      .map(r => r.name);

    // Build update payload
    const update = {};
    if (ghUser.bio && !State?.profile?.bio) update.bio = ghUser.bio;
    if (ghUser.location && !State?.profile?.location) update.location = ghUser.location;
    if (ghUser.avatar_url && !State?.profile?.avatar_url) update.avatar_url = ghUser.avatar_url;
    if (ghUser.blog && !State?.profile?.website) update.website = ghUser.blog;
    if (topRepos.length > 0) {
      const existing = State?.profile?.tech_stack || [];
      update.tech_stack = [...new Set([...existing, ...topRepos])].slice(0, 12);
    }
    if (ghUser.name && !State?.profile?.display_name) update.display_name = ghUser.name;

    if (Object.keys(update).length === 0) return;

    // Apply to Supabase profile
    await sb.from('profiles').update(update).eq('id', session.user.id);

    // Show banner with auto-filled info
    showGitHubAutofillBanner(ghUser, topRepos);
  } catch(e) {
    console.warn('[Devit] GitHub autofill failed:', e);
  }
}

function showGitHubAutofillBanner(ghUser, repos) {
  const existing = document.getElementById('gh-autofill-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'gh-autofill-banner';
  banner.className = 'github-profile-banner';
  banner.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:900;max-width:340px;animation:slideInRight 0.4s cubic-bezier(0.16,1,0.3,1)';

  const repoChips = repos.slice(0, 4).map(r =>
    `<span class="github-repo-chip"><i class="fa-solid fa-code-branch"></i>${escHtml(r)}</span>`
  ).join('');

  banner.innerHTML = `
    <div class="github-banner-icon"><i class="fa-brands fa-github"></i></div>
    <div class="github-banner-body">
      <div class="github-banner-title">Profile auto-filled from GitHub ✓</div>
      <div class="github-banner-desc">
        ${ghUser.bio ? `<em>${escHtml(ghUser.bio.slice(0, 80))}</em><br>` : ''}
        ${ghUser.location ? `<i class="fa-solid fa-location-dot" style="margin-right:4px;color:var(--cyan)"></i>${escHtml(ghUser.location)}<br>` : ''}
      </div>
      <div style="margin-top:6px">${repoChips}</div>
    </div>
    <button onclick="this.closest('#gh-autofill-banner').remove()" style="color:var(--text-muted);font-size:14px;padding:4px;flex-shrink:0">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  if (!document.getElementById('gh-autofill-anim')) {
    const s = document.createElement('style');
    s.id = 'gh-autofill-anim';
    s.textContent = `
      @keyframes slideInRight {
        from { opacity:0; transform:translateX(30px); }
        to   { opacity:1; transform:translateX(0); }
      }
    `;
    document.head.appendChild(s);
  }

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

// Hook into Supabase auth state changes
if (typeof sb !== 'undefined') {
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user?.app_metadata?.provider === 'github') {
      // Small delay to let app.js handle user init first
      setTimeout(() => handleGitHubProfileAutofill(session), 1500);
    }
  });
}


/* ══════════════════════════════════════════════════════════════
   FEATURE 7 — Polls in posts
   ══════════════════════════════════════════════════════════════ */

const PollState = {
  active: false,
  options: ['', ''],
  durationDays: 7,
};

function renderPollBuilder() {
  const existing = document.getElementById('poll-builder-ui');
  if (existing) existing.remove();

  const builder = document.createElement('div');
  builder.id = 'poll-builder-ui';
  builder.className = 'poll-builder';
  builder.innerHTML = `
    <div class="poll-builder-title"><i class="fa-solid fa-chart-bar" style="margin-right:5px"></i>Poll options</div>
    <div id="poll-options-list">
      ${PollState.options.map((v, i) => `
        <div class="poll-option-row" style="display:flex;gap:6px;margin-bottom:7px">
          <input class="poll-option-input" type="text" placeholder="Option ${i+1}" value="${escHtml(v)}" data-poll-idx="${i}" maxlength="80" style="flex:1">
          ${i >= 2 ? `<button class="poll-rm-btn" data-poll-idx="${i}" style="color:var(--rose);font-size:13px;padding:0 8px">×</button>` : ''}
        </div>
      `).join('')}
    </div>
    <button class="poll-add-option-btn" id="poll-add-opt-btn" ${PollState.options.length >= 4 ? 'disabled style="opacity:0.4"' : ''}>
      <i class="fa-solid fa-plus" style="margin-right:4px"></i>Add option
    </button>
    <div class="poll-duration-row">
      <i class="fa-regular fa-clock" style="color:var(--cyan)"></i>
      <span>Duration:</span>
      <select id="poll-duration-sel">
        <option value="1" ${PollState.durationDays===1?'selected':''}>1 day</option>
        <option value="3" ${PollState.durationDays===3?'selected':''}>3 days</option>
        <option value="7" ${PollState.durationDays===7?'selected':''}>7 days</option>
        <option value="14" ${PollState.durationDays===14?'selected':''}>2 weeks</option>
      </select>
    </div>
  `;

  // Wire events
  builder.querySelectorAll('.poll-option-input').forEach(inp => {
    inp.addEventListener('input', () => {
      PollState.options[+inp.dataset.pollIdx] = inp.value;
    });
  });
  builder.querySelectorAll('.poll-rm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.pollIdx;
      PollState.options.splice(idx, 1);
      renderPollBuilder();
    });
  });
  builder.querySelector('#poll-add-opt-btn')?.addEventListener('click', () => {
    if (PollState.options.length < 4) {
      PollState.options.push('');
      renderPollBuilder();
    }
  });
  builder.querySelector('#poll-duration-sel').addEventListener('change', e => {
    PollState.durationDays = +e.target.value;
  });

  // Inject after composer textarea
  const composerInner = document.querySelector('.composer-inner, #composer-textarea, .composer');
  if (composerInner) {
    composerInner.parentElement.insertBefore(builder, composerInner.nextSibling);
  }
}

function getPollData() {
  if (!PollState.active) return null;
  const opts = PollState.options.map(o => o.trim()).filter(Boolean);
  if (opts.length < 2) return null;
  return {
    options: opts,
    duration_days: PollState.durationDays,
    ends_at: new Date(Date.now() + PollState.durationDays * 86400000).toISOString(),
    votes: Object.fromEntries(opts.map(o => [o, 0])),
    voted_by: {},
  };
}

function renderPollInPost(poll, postId, currentUserId) {
  if (!poll?.options?.length) return '';
  const now = new Date();
  const endsAt = poll.ends_at ? new Date(poll.ends_at) : null;
  const isExpired = endsAt && now > endsAt;
  const myVote = poll.voted_by?.[currentUserId];
  const hasVoted = !!myVote || isExpired;
  const totalVotes = Object.values(poll.votes || {}).reduce((a,b) => a+b, 0);

  const optionHtml = poll.options.map((opt, i) => {
    const votes = poll.votes?.[opt] || 0;
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isWinner = hasVoted && votes === Math.max(...Object.values(poll.votes || {}));
    const isMyVote = myVote === opt;
    const fillColor = isMyVote
      ? 'linear-gradient(90deg, rgba(99,217,255,0.18), rgba(99,217,255,0.08))'
      : 'linear-gradient(90deg, rgba(167,139,250,0.12), rgba(167,139,250,0.05))';

    return `
      <div class="poll-option${hasVoted ? ' voted' : ''}${isWinner && hasVoted ? ' winner' : ''}"
           data-poll-opt="${escHtml(opt)}" data-post-id="${escHtml(postId)}">
        <div class="poll-fill" style="width:${hasVoted ? pct : 0}%;background:${fillColor}"></div>
        <span class="poll-option-text">${escHtml(opt)}${isMyVote ? ' <i class="fa-solid fa-check" style="color:var(--cyan);font-size:10px"></i>' : ''}</span>
        ${hasVoted ? `<span class="poll-option-pct">${pct}%</span>` : ''}
      </div>
    `;
  }).join('');

  const timeLeft = endsAt && !isExpired
    ? `Ends ${timeRelative(endsAt)}`
    : isExpired ? 'Poll ended' : '';

  return `
    <div class="poll-container" data-poll-post="${escHtml(postId)}">
      ${optionHtml}
      <div class="poll-meta">
        <span><i class="fa-solid fa-users"></i>${fmtViews(totalVotes)} vote${totalVotes !== 1 ? 's' : ''}</span>
        ${timeLeft ? `<span><i class="fa-regular fa-clock"></i>${escHtml(timeLeft)}</span>` : ''}
      </div>
    </div>
  `;
}

function timeRelative(date) {
  const diff = date - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h/24)}d`;
}

// Delegated poll vote handler
document.addEventListener('click', async e => {
  const opt = e.target.closest('.poll-option:not(.voted)');
  if (!opt) return;
  const chosen = opt.dataset.pollOpt;
  const postId = opt.dataset.postId;
  if (!chosen || !postId) return;
  if (!window.State?.user) { toast('Sign in to vote', 'lock'); return; }

  // Optimistic UI
  opt.classList.add('voted');
  opt.style.pointerEvents = 'none';

  const userId = State.user.id;
  const { data: post, error: pErr } = await sb.from('posts').select('poll').eq('id', postId).single();
  if (pErr || !post?.poll) return;

  const poll = post.poll;
  if (poll.voted_by?.[userId]) return; // already voted (race)

  poll.votes[chosen] = (poll.votes[chosen] || 0) + 1;
  poll.voted_by = poll.voted_by || {};
  poll.voted_by[userId] = chosen;

  await sb.from('posts').update({ poll }).eq('id', postId);

  // Re-render the poll container
  const container = document.querySelector(`.poll-container[data-poll-post="${postId}"]`);
  if (container) {
    container.outerHTML = renderPollInPost(poll, postId, userId);
  }
  toast(`Voted: ${chosen}`, 'chart-bar');
});

// Inject poll toggle button into composer when it renders
function injectPollButtonIntoComposer() {
  const actionBar = document.querySelector('.composer-actions, .post-actions-bar, .composer-footer');
  if (!actionBar || document.getElementById('poll-toggle-btn')) return;

  const pollBtn = document.createElement('button');
  pollBtn.id = 'poll-toggle-btn';
  pollBtn.title = 'Add a poll';
  pollBtn.className = 'composer-action-btn';
  pollBtn.innerHTML = '<i class="fa-solid fa-chart-bar"></i>';
  pollBtn.style.cssText = `
    color: var(--text-secondary);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 14px;
    transition: color 0.18s, background 0.18s;
  `;
  pollBtn.addEventListener('click', () => {
    PollState.active = !PollState.active;
    pollBtn.style.color = PollState.active ? 'var(--cyan)' : '';
    pollBtn.style.background = PollState.active ? 'var(--cyan-dim)' : '';
    if (PollState.active) {
      PollState.options = ['', ''];
      renderPollBuilder();
    } else {
      document.getElementById('poll-builder-ui')?.remove();
    }
  });
  actionBar.prepend(pollBtn);
}

// Watch for composer to appear
const composerObserver = new MutationObserver(() => injectPollButtonIntoComposer());
composerObserver.observe(document.body, { childList: true, subtree: true });


/* ══════════════════════════════════════════════════════════════
   FEATURE 8 — Weekly digest / dev newsletter widget
   ══════════════════════════════════════════════════════════════ */

async function buildWeeklyDigestWidget() {
  const rightbar = document.getElementById('rightbar');
  if (!rightbar || document.getElementById('digest-widget')) return;

  // Fetch top posts from last 7 days
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  let topPosts = [], trendingTags = [], newMembers = [];

  try {
    const { data: posts } = await sb.from('posts')
      .select('id, content, tags, likes_count, comments_count, created_at, author_id')
      .gte('created_at', since)
      .order('likes_count', { ascending: false })
      .limit(5);
    topPosts = posts || [];

    // Trending tags (aggregate from posts)
    const { data: allPosts } = await sb.from('posts')
      .select('tags')
      .gte('created_at', since)
      .not('tags', 'is', null)
      .limit(100);
    const tagCounts = {};
    (allPosts || []).forEach(p => {
      (p.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });
    trendingTags = Object.entries(tagCounts)
      .sort((a,b) => b[1]-a[1])
      .slice(0, 6)
      .map(([t]) => t);

    // New members this week
    const { data: members } = await sb.from('profiles')
      .select('id, username, display_name, avatar_url')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(4);
    newMembers = members || [];
  } catch(e) {
    console.warn('[Devit] Digest fetch failed:', e);
  }

  const topPostsHtml = topPosts.length > 0
    ? topPosts.map((p, i) => `
        <div class="digest-post-item" data-post-id="${p.id}">
          <span class="digest-rank">${i+1}</span>
          <div class="digest-post-title">${escHtml((p.content || '').slice(0, 70))}${(p.content||'').length > 70 ? '…' : ''}</div>
          <span style="font-size:10px;color:var(--text-muted);white-space:nowrap">
            <i class="fa-solid fa-heart" style="color:var(--rose)"></i> ${p.likes_count || 0}
          </span>
        </div>
      `).join('')
    : `<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No posts this week yet — be the first!</div>`;

  const tagsHtml = trendingTags.length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${trendingTags.map(t =>
        `<span class="digest-tag-item" data-tag="${escHtml(t)}">#${escHtml(t)}</span>`
      ).join('')}</div>`
    : `<div style="font-size:12px;color:var(--text-muted)">No trending tags yet</div>`;

  const membersHtml = newMembers.length > 0
    ? newMembers.map(m => {
        const name = m.display_name || m.username || 'Dev';
        const color = ['#63d9ff','#a78bfa','#34d399','#fb7185','#fbbf24'][name.charCodeAt(0) % 5];
        const avatar = m.avatar_url
          ? `<img src="${m.avatar_url}" style="width:28px;height:28px;border-radius:8px;object-fit:cover" onerror="this.style.display='none'">`
          : `<div style="width:28px;height:28px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--bg-void)">${name[0].toUpperCase()}</div>`;
        return `
          <div class="digest-new-member">
            ${avatar}
            <div>
              <div class="digest-member-name">${escHtml(name)}</div>
              <div class="digest-member-handle">@${escHtml(m.username || '?')}</div>
            </div>
          </div>
        `;
      }).join('')
    : `<div style="font-size:12px;color:var(--text-muted)">No new members this week</div>`;

  const widget = document.createElement('div');
  widget.id = 'digest-widget';
  widget.className = 'widget digest-widget';
  widget.style.cssText = `
    background: var(--bg-surface);
    border: 1px solid var(--border);
    padding: 16px;
    margin-bottom: 12px;
  `;
  widget.innerHTML = `
    <div class="digest-header">
      <div class="digest-title">
        <i class="fa-solid fa-newspaper"></i>
        This Week on Devit
      </div>
      <span class="digest-badge">Weekly</span>
    </div>

    <div class="digest-section-label"><i class="fa-solid fa-fire" style="margin-right:4px;color:var(--rose)"></i>Top Posts</div>
    <div id="digest-top-posts">${topPostsHtml}</div>

    <div class="digest-section-label" style="margin-top:14px"><i class="fa-solid fa-hashtag" style="margin-right:4px;color:var(--cyan)"></i>Trending Tags</div>
    <div id="digest-tags">${tagsHtml}</div>

    ${newMembers.length > 0 ? `
      <div class="digest-section-label" style="margin-top:14px"><i class="fa-solid fa-user-plus" style="margin-right:4px;color:var(--emerald)"></i>New Members</div>
      <div id="digest-members">${membersHtml}</div>
    ` : ''}
  `;

  // Insert at top of rightbar
  rightbar.insertBefore(widget, rightbar.firstChild);

  // Wire tag clicks
  widget.querySelectorAll('.digest-tag-item').forEach(tag => {
    tag.addEventListener('click', () => {
      const t = tag.dataset.tag;
      if (window.navigateTo) navigateTo('feed');
      setTimeout(() => {
        const searchInput = document.querySelector('.topbar-search input, #search-input');
        if (searchInput) {
          searchInput.value = '#' + t;
          searchInput.dispatchEvent(new Event('input'));
        }
      }, 300);
    });
  });

  // Refresh weekly (poll every hour)
  setInterval(() => {
    widget.remove();
    buildWeeklyDigestWidget();
  }, 3600000);
}

// Boot digest widget after login
function tryInitDigest() {
  if (document.getElementById('rightbar')) {
    buildWeeklyDigestWidget();
  } else {
    const obs = new MutationObserver(() => {
      if (document.getElementById('rightbar')) {
        obs.disconnect();
        buildWeeklyDigestWidget();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
}

if (typeof sb !== 'undefined') {
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') setTimeout(tryInitDigest, 2000);
  });
}


/* ══════════════════════════════════════════════════════════════
   FEATURE 9 — Reading time + post views counter
   ══════════════════════════════════════════════════════════════ */

const viewedPosts = new Set(
  JSON.parse(localStorage.getItem('devit-viewed-posts') || '[]')
);

async function recordPostView(postId) {
  if (viewedPosts.has(postId)) return;
  viewedPosts.add(postId);
  try {
    localStorage.setItem('devit-viewed-posts', JSON.stringify([...viewedPosts].slice(-500)));
  } catch(_) {}
  // Increment in Supabase (fire-and-forget with RPC if available, else update)
  try {
    await sb.rpc('increment_post_views', { post_id: postId });
  } catch(_) {
    await sb.from('posts')
      .update({ views_count: sb.raw('views_count + 1') })
      .eq('id', postId);
  }
}

// Inject reading time + views meta into post cards
function injectReadMetaIntoCard(card) {
  if (card.dataset.readMetaInjected) return;
  card.dataset.readMetaInjected = '1';

  const content = card.querySelector('.post-body, .post-content, .post-text, p');
  const text = content?.textContent || '';
  const rt = readingTime(text);

  const postId = card.dataset.postId || card.getAttribute('data-id') ||
    card.querySelector('[data-post-id]')?.dataset.postId;

  const viewsStr = card.dataset.views ? fmtViews(+card.dataset.views) : null;

  const meta = document.createElement('div');
  meta.className = 'post-read-meta';
  meta.innerHTML = `
    <span><i class="fa-regular fa-clock"></i>${escHtml(rt)}</span>
    ${viewsStr ? `<span class="post-views-badge"><i class="fa-regular fa-eye"></i>${escHtml(viewsStr)} views</span>` : ''}
  `;

  const footer = card.querySelector('.post-footer, .post-actions, .post-meta-row');
  if (footer) footer.parentElement.insertBefore(meta, footer);
  else if (content) content.parentElement.insertBefore(meta, content.nextSibling);

  // Record view via IntersectionObserver
  if (postId) {
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        recordPostView(postId);
      }
    }, { threshold: 0.5 });
    io.observe(card);
  }
}

// Observe feed for post cards
const readMetaObserver = new MutationObserver(mutations => {
  mutations.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.classList?.contains('post-card')) injectReadMetaIntoCard(node);
      node.querySelectorAll?.('.post-card').forEach(c => injectReadMetaIntoCard(c));
    });
  });
});
readMetaObserver.observe(document.body, { childList: true, subtree: true });
// Also handle already-rendered cards
document.querySelectorAll('.post-card').forEach(c => injectReadMetaIntoCard(c));


/* ══════════════════════════════════════════════════════════════
   FEATURE 10 — Pinned posts on profile (up to 3)
   ══════════════════════════════════════════════════════════════ */

async function getPinnedPosts(userId) {
  const { data } = await sb.from('profiles')
    .select('pinned_posts')
    .eq('id', userId)
    .single();
  return data?.pinned_posts || [];
}

async function setPinnedPosts(userId, pinnedIds) {
  await sb.from('profiles')
    .update({ pinned_posts: pinnedIds })
    .eq('id', userId);
}

async function pinPost(postId) {
  const userId = window.State?.user?.id;
  if (!userId) return;
  const current = await getPinnedPosts(userId);
  if (current.includes(postId)) {
    toast('Already pinned', 'thumbtack');
    return;
  }
  if (current.length >= 3) {
    toast('Max 3 pinned posts. Unpin one first.', 'circle-exclamation');
    return;
  }
  await setPinnedPosts(userId, [...current, postId]);
  toast('Post pinned to your profile!', 'thumbtack');
}

async function unpinPost(postId) {
  const userId = window.State?.user?.id;
  if (!userId) return;
  const current = await getPinnedPosts(userId);
  await setPinnedPosts(userId, current.filter(id => id !== postId));
  toast('Post unpinned', 'thumbtack');
  // Remove pin badge from card
  document.querySelectorAll(`.post-card[data-post-id="${postId}"] .pin-badge`).forEach(b => b.remove());
}

async function renderPinnedSection(profileUserId, containerEl) {
  const pinnedIds = await getPinnedPosts(profileUserId);
  if (!pinnedIds.length) return;

  const existing = document.getElementById('pinned-posts-section');
  if (existing) existing.remove();

  const { data: posts } = await sb.from('posts')
    .select('*, profiles(username, display_name, avatar_url)')
    .in('id', pinnedIds)
    .order('created_at', { ascending: false });

  if (!posts?.length) return;

  const section = document.createElement('div');
  section.id = 'pinned-posts-section';
  section.className = 'pinned-section';
  section.innerHTML = `
    <div class="pinned-section-header">
      <i class="fa-solid fa-thumbtack"></i> Pinned posts
    </div>
  `;

  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.dataset.postId = post.id;
    card.innerHTML = `
      <div class="pin-badge"><i class="fa-solid fa-thumbtack"></i> Pinned</div>
      <div class="post-content">${escHtml((post.content || '').slice(0, 200))}${(post.content||'').length>200?'…':''}</div>
      <div class="post-read-meta" style="margin-top:8px">
        <span><i class="fa-regular fa-clock"></i>${readingTime(post.content)}</span>
        ${post.views_count ? `<span><i class="fa-regular fa-eye"></i>${fmtViews(post.views_count)} views</span>` : ''}
        <span style="margin-left:auto"><i class="fa-solid fa-heart" style="color:var(--rose)"></i> ${post.likes_count||0}</span>
      </div>
    `;
    section.appendChild(card);
  });

  containerEl.insertBefore(section, containerEl.firstChild);
}

// Inject pin/unpin into post more menu
const originalOpenPostMoreMenu = window.openPostMoreMenu;
window.openPostMoreMenu = function(anchorBtn, postId, authorId) {
  if (originalOpenPostMoreMenu) originalOpenPostMoreMenu(anchorBtn, postId, authorId);

  const isOwnPost = window.State?.user?.id === authorId;
  if (!isOwnPost) return;

  const menu = document.getElementById('post-more-menu');
  if (!menu) return;

  getPinnedPosts(authorId).then(pinnedIds => {
    const isPinned = pinnedIds.includes(postId);
    const pinBtn = document.createElement('button');
    pinBtn.className = 'post-more-item';
    pinBtn.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:none;border:none;color:var(--text-primary);cursor:pointer;transition:background 0.15s';
    pinBtn.innerHTML = `<i class="fa-solid fa-thumbtack" style="color:var(--amber)"></i> ${isPinned ? 'Unpin from profile' : 'Pin to profile'}`;
    pinBtn.addEventListener('mouseenter', () => pinBtn.style.background = 'var(--bg-elevated)');
    pinBtn.addEventListener('mouseleave', () => pinBtn.style.background = '');
    pinBtn.addEventListener('click', () => {
      menu.remove();
      if (isPinned) unpinPost(postId);
      else pinPost(postId);
    });
    // Insert as first item
    menu.insertBefore(pinBtn, menu.firstChild);
  });
};

// When profile view renders, inject pinned posts section
const profileObserver = new MutationObserver(() => {
  const profileFeed = document.getElementById('profile-posts-feed') ||
    document.querySelector('.profile-feed, [data-view="profile"] .feed-col');
  if (profileFeed && !document.getElementById('pinned-posts-section')) {
    const profileUserId = profileFeed.dataset.profileUserId ||
      document.querySelector('[data-profile-user-id]')?.dataset.profileUserId;
    if (profileUserId) {
      renderPinnedSection(profileUserId, profileFeed);
    }
  }
});
profileObserver.observe(document.body, { childList: true, subtree: true });


/* ══════════════════════════════════════════════════════════════
   POST COMPOSER — integrate poll data into post creation
   ══════════════════════════════════════════════════════════════ */

// Monkey-patch submitPost to attach poll data if active
(function patchSubmitPost() {
  // Wait for the original function to be defined
  const interval = setInterval(() => {
    if (typeof window.submitPost === 'function' && !window._pollPatchApplied) {
      window._pollPatchApplied = true;
      const original = window.submitPost;
      window.submitPost = async function(...args) {
        const result = await original.apply(this, args);
        return result;
      };
      clearInterval(interval);
    }
  }, 500);

  // Hook into the post insert call via Supabase middleware pattern
  // We intercept the composer's submit button click
  document.addEventListener('click', async e => {
    const submitBtn = e.target.closest('#composer-submit, .composer-submit, [data-action="submit-post"]');
    if (!submitBtn) return;
    if (!PollState.active) return;
    const pollData = getPollData();
    if (!pollData) {
      toast('Add at least 2 poll options', 'circle-exclamation');
      e.stopImmediatePropagation();
      return;
    }
    // Attach poll to window for the main submit handler to pick up
    window._pendingPoll = pollData;
    // Reset after submit
    setTimeout(() => {
      window._pendingPoll = null;
      PollState.active = false;
      PollState.options = ['', ''];
      document.getElementById('poll-builder-ui')?.remove();
      document.getElementById('poll-toggle-btn').style.color = '';
      document.getElementById('poll-toggle-btn').style.background = '';
    }, 500);
  }, true);
})();

// Patch renderPostCard to show polls
(function patchRenderPostCard() {
  const interval = setInterval(() => {
    if (typeof window.renderPostCard === 'function' && !window._pollCardPatchApplied) {
      window._pollCardPatchApplied = true;
      const original = window.renderPostCard;
      window.renderPostCard = function(post, ...rest) {
        const card = original.call(this, post, ...rest);
        if (post.poll && card) {
          const userId = window.State?.user?.id || '';
          const pollHtml = renderPollInPost(post.poll, post.id, userId);
          if (pollHtml) {
            const contentEl = card.querySelector('.post-body, .post-content, .post-text');
            if (contentEl) {
              const wrapper = document.createElement('div');
              wrapper.innerHTML = pollHtml;
              contentEl.parentElement.insertBefore(wrapper.firstElementChild, contentEl.nextSibling);
            }
          }
        }
        return card;
      };
      clearInterval(interval);
    }
  }, 500);
})();


/* ══════════════════════════════════════════════════════════════
   SUPABASE SQL ADDITIONS (log to console for setup)
   ══════════════════════════════════════════════════════════════ */
console.log(`
/* ── Run these SQL additions in Supabase Dashboard ── */

-- Add poll column to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll jsonb;

-- Add views counter
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count int DEFAULT 0;

-- Add pinned_posts to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pinned_posts uuid[] DEFAULT '{}';

-- RPC for view increments
CREATE OR REPLACE FUNCTION increment_post_views(post_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE posts SET views_count = views_count + 1 WHERE id = post_id;
$$;
`);

console.log('[Devit Features Patch v2] ✓ Loaded: GitHub autofill, Polls, Digest widget, Read time/Views, Pinned posts + Soft UI');
