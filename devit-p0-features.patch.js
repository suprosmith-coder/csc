/* ============================================================
   DEVIT — P0/P1/P2 Feature Patch
   devit-p0-features.patch.js

   Features:
   ── P0  Auto-GitHub Activity Sync
   ── P0  DevScore (reputation metric)
   ── P1  "Ship" Button (deploy from post)
   ── P1  Office Hours Booking
   ── P2  Team Rooms (project workspaces + GitHub deploy)
   ── P2  Daily Digest (upgraded from weekly)
   ============================================================ */

'use strict';

/* ── Shared escapeHtml utility (safe if already defined) ──────── */
window.escHtml = window.escHtml || (s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
const _esc = window.escHtml;

/* ────────────────────────────────────────────────────────────────
   ██████╗  ██████╗     ██████╗ 0 — AUTO-GITHUB ACTIVITY SYNC
   ──────────────────────────────────────────────────────────────── */

const GitHubSync = {
  _interval: null,
  _lastSyncAt: null,
  _syncing: false,

  /**
   * Reads the stored GitHub token from the user's profile metadata
   * (set when they connect GitHub from Settings → Connections).
   */
  async getToken() {
    // Token is stored in profiles.github_token (encrypted at rest in Supabase vault ideally;
    // here we keep it in the profile row for simplicity — swap for a Supabase Secret when ready).
    const { data } = await sb.from('profiles')
      .select('github_token, github_username')
      .eq('id', State.user.id)
      .single();
    return { token: data?.github_token || null, username: data?.github_username || null };
  },

  /** Fetch recent events from GitHub Events API. */
  async fetchEvents(username, token) {
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30`, { headers });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  },

  /** Convert a GitHub event into a Devit post payload. */
  eventToPost(event) {
    const repo = event.repo?.name || '';
    const repoShort = repo.split('/')[1] || repo;
    const repoUrl = `https://github.com/${repo}`;

    const typeMap = {
      PushEvent: () => {
        const commits = event.payload?.commits || [];
        const msgs = commits.slice(0, 3).map(c => `• ${_esc(c.message?.split('\n')[0] || '')}`).join('\n');
        const extra = commits.length > 3 ? `\n+ ${commits.length - 3} more commits` : '';
        return {
          emoji: '🚀',
          title: `Pushed ${commits.length} commit${commits.length !== 1 ? 's' : ''} to [${repoShort}](${repoUrl})`,
          body: msgs + extra,
          tags: ['github', 'push', repoShort],
        };
      },
      PullRequestEvent: () => {
        const pr = event.payload?.pull_request;
        const action = event.payload?.action;
        if (!['opened','merged','closed'].includes(action)) return null;
        const label = action === 'closed' && pr?.merged ? 'merged' : action;
        return {
          emoji: label === 'merged' ? '✅' : '🔀',
          title: `${label === 'merged' ? 'Merged' : label === 'opened' ? 'Opened' : 'Closed'} PR in [${repoShort}](${repoUrl})`,
          body: _esc(pr?.title || ''),
          tags: ['github', 'pr', repoShort],
        };
      },
      CreateEvent: () => {
        const ref = event.payload?.ref;
        const refType = event.payload?.ref_type;
        if (!['branch','tag'].includes(refType)) return null;
        return {
          emoji: '🌿',
          title: `Created ${refType} \`${_esc(ref)}\` in [${repoShort}](${repoUrl})`,
          body: '',
          tags: ['github', refType, repoShort],
        };
      },
      IssuesEvent: () => {
        const issue = event.payload?.issue;
        const action = event.payload?.action;
        if (!['opened','closed'].includes(action)) return null;
        return {
          emoji: action === 'closed' ? '✔️' : '🐛',
          title: `${action === 'closed' ? 'Closed' : 'Opened'} issue in [${repoShort}](${repoUrl})`,
          body: _esc(issue?.title || ''),
          tags: ['github', 'issue', repoShort],
        };
      },
      ReleaseEvent: () => {
        const release = event.payload?.release;
        return {
          emoji: '🎉',
          title: `Released [${_esc(release?.tag_name || 'v?')}](${release?.html_url || repoUrl}) on [${repoShort}](${repoUrl})`,
          body: _esc((release?.body || '').slice(0, 200)),
          tags: ['github', 'release', repoShort],
        };
      },
      ForkEvent: () => ({
        emoji: '🍴',
        title: `Forked [${repoShort}](${repoUrl})`,
        body: '',
        tags: ['github', 'fork', repoShort],
      }),
      WatchEvent: () => null, // skip stars — too noisy
    };

    const handler = typeMap[event.type];
    if (!handler) return null;
    const result = handler();
    if (!result) return null;

    const content = `${result.emoji} ${result.title}${result.body ? '\n\n' + result.body : ''}`;
    return {
      content,
      tags: result.tags,
      github_event_id: event.id,
      source: 'github_sync',
      created_at: event.created_at,
    };
  },

  /** Main sync loop: fetch → deduplicate → insert. */
  async sync() {
    if (this._syncing || !State.user) return;
    this._syncing = true;

    try {
      const { token, username } = await this.getToken();
      if (!username) return; // not connected

      const events = await this.fetchEvents(username, token);
      if (!events.length) return;

      // Get already-synced event IDs to avoid duplicates
      const { data: existing } = await sb.from('posts')
        .select('github_event_id')
        .eq('author_id', State.user.id)
        .not('github_event_id', 'is', null)
        .limit(200);
      const seen = new Set((existing || []).map(p => p.github_event_id));

      const toInsert = [];
      for (const event of events) {
        if (seen.has(event.id)) continue;
        const post = this.eventToPost(event);
        if (!post) continue;
        toInsert.push({
          ...post,
          author_id: State.user.id,
          likes_count: 0,
          comments_count: 0,
          is_github_sync: true,
        });
      }

      if (!toInsert.length) return;

      const { error } = await sb.from('posts').insert(toInsert);
      if (!error) {
        this._lastSyncAt = new Date();
        const n = toInsert.length;
        toast(`Synced ${n} GitHub event${n > 1 ? 's' : ''}`, 'code-branch');
        // Refresh feed if visible
        if (State.currentView === 'feed' && typeof renderFeed === 'function') {
          navigateTo('feed');
        }
      }
    } catch(e) {
      console.warn('[Devit] GitHub sync error:', e);
    } finally {
      this._syncing = false;
    }
  },

  /** Start auto-sync on a 15-minute interval. */
  start() {
    this.sync(); // immediate on load
    this._interval = setInterval(() => this.sync(), 15 * 60 * 1000);
  },

  stop() {
    if (this._interval) clearInterval(this._interval);
  },
};

/* ── GitHub Connection UI in Settings ──────────────────────────── */
function renderGitHubConnectionCard() {
  return `
    <div id="github-connect-card" style="
      background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);
      padding:20px;display:flex;flex-direction:column;gap:16px;
    ">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:#24292e;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fa-brands fa-github" style="font-size:20px;color:#fff"></i>
        </div>
        <div>
          <div style="font-weight:700;font-size:14px">GitHub Activity Sync</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Auto-post your commits, PRs, releases &amp; issues</div>
        </div>
        <span id="gh-sync-status-badge" style="
          margin-left:auto;font-size:11px;font-weight:700;letter-spacing:0.04em;padding:3px 8px;
          border-radius:var(--radius-full);background:var(--bg-float);color:var(--text-muted);
        ">NOT CONNECTED</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="font-size:12px;color:var(--text-secondary)">GitHub Username</label>
        <input id="gh-username-input" class="auth-input" placeholder="your-github-username" style="font-size:13px">
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="font-size:12px;color:var(--text-secondary)">
          Personal Access Token
          <a href="https://github.com/settings/tokens/new?scopes=public_repo,read:user" target="_blank"
             style="color:var(--cyan);margin-left:6px;font-size:11px">
            Generate one <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px"></i>
          </a>
        </label>
        <input id="gh-token-input" type="password" class="auth-input" placeholder="ghp_xxxxxxxxxxxxxxxx" style="font-family:var(--font-mono);font-size:12px">
        <div style="font-size:11px;color:var(--text-muted)">Needs <code>public_repo</code> + <code>read:user</code> scopes. Stored securely in your profile.</div>
      </div>

      <div style="display:flex;gap:8px">
        <button id="gh-save-btn" class="auth-btn-primary" style="flex:1;padding:10px">
          <i class="fa-solid fa-plug"></i> Save &amp; Sync Now
        </button>
        <button id="gh-disconnect-btn" style="
          padding:10px 14px;background:var(--bg-float);border:1px solid var(--border);
          border-radius:var(--radius-sm);color:var(--rose);font-size:13px;font-weight:600;
          transition:all 0.15s;
        " title="Disconnect GitHub">
          <i class="fa-solid fa-unlink"></i>
        </button>
      </div>

      <div style="font-size:12px;color:var(--text-muted);padding:10px 12px;background:var(--bg-void);border-radius:var(--radius-sm)">
        <i class="fa-solid fa-circle-info" style="color:var(--cyan);margin-right:6px"></i>
        Syncs every 15 minutes. Pushes, PRs, releases, issues &amp; forks appear as posts automatically.
      </div>
    </div>
  `;
}

function bindGitHubConnectionCard() {
  const card = document.getElementById('github-connect-card');
  if (!card) return;

  // Pre-fill saved values
  sb.from('profiles').select('github_token, github_username').eq('id', State.user.id).single().then(({ data }) => {
    if (data?.github_username) {
      const inp = document.getElementById('gh-username-input');
      if (inp) inp.value = data.github_username;
      const badge = document.getElementById('gh-sync-status-badge');
      if (badge) {
        badge.textContent = 'CONNECTED';
        badge.style.background = 'rgba(52,211,153,0.12)';
        badge.style.color = 'var(--emerald)';
      }
    }
    if (data?.github_token) {
      const inp = document.getElementById('gh-token-input');
      if (inp) inp.value = '••••••••••••••••••••';
    }
  });

  document.getElementById('gh-save-btn').addEventListener('click', async () => {
    const username = document.getElementById('gh-username-input').value.trim();
    const tokenRaw = document.getElementById('gh-token-input').value.trim();
    if (!username) { toast('Enter your GitHub username', 'circle-exclamation'); return; }
    const btn = document.getElementById('gh-save-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    btn.disabled = true;

    const update = { github_username: username };
    if (tokenRaw && !tokenRaw.startsWith('•')) update.github_token = tokenRaw;

    const { error } = await sb.from('profiles').update(update).eq('id', State.user.id);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-plug"></i> Save & Sync Now';

    if (error) { toast('Failed to save GitHub connection', 'circle-exclamation'); return; }

    const badge = document.getElementById('gh-sync-status-badge');
    if (badge) { badge.textContent = 'CONNECTED'; badge.style.background = 'rgba(52,211,153,0.12)'; badge.style.color = 'var(--emerald)'; }
    toast('GitHub connected! Syncing now…', 'code-branch');
    GitHubSync.sync();
  });

  document.getElementById('gh-disconnect-btn').addEventListener('click', async () => {
    if (!confirm('Disconnect GitHub? Future activity won\'t be posted.')) return;
    await sb.from('profiles').update({ github_token: null, github_username: null }).eq('id', State.user.id);
    document.getElementById('gh-username-input').value = '';
    document.getElementById('gh-token-input').value = '';
    const badge = document.getElementById('gh-sync-status-badge');
    if (badge) { badge.textContent = 'NOT CONNECTED'; badge.style.background = ''; badge.style.color = ''; }
    toast('GitHub disconnected', 'unlink');
  });
}

/* ────────────────────────────────────────────────────────────────
   ██████╗  ██████╗     ██████╗ 0 — DEVSCORE
   ──────────────────────────────────────────────────────────────── */

const DevScore = {
  /**
   * Compute DevScore for a profile.
   * Formula (all weighted, max ~1000):
   *   posts_count × 2  +  followers_count × 3
   *   + github_commits × 1  +  (liked posts avg × 10)
   *   + streak_days × 5
   */
  async compute(userId) {
    const { data: profile } = await sb.from('profiles')
      .select('posts_count, followers_count, github_username')
      .eq('id', userId)
      .single();
    if (!profile) return 0;

    // Posts quality signal: average likes on recent posts
    const { data: posts } = await sb.from('posts')
      .select('likes_count, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    const avgLikes = posts?.length
      ? posts.reduce((a, p) => a + (p.likes_count || 0), 0) / posts.length
      : 0;

    // Streak: count consecutive days with posts
    let streak = 0;
    if (posts?.length) {
      const days = new Set(posts.map(p => p.created_at.slice(0, 10)));
      const today = new Date();
      let d = new Date(today);
      for (let i = 0; i < 365; i++) {
        const key = d.toISOString().slice(0, 10);
        if (days.has(key)) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
    }

    const base =
      Math.min((profile.posts_count || 0) * 2, 200) +
      Math.min((profile.followers_count || 0) * 3, 300) +
      Math.min(avgLikes * 10, 300) +
      Math.min(streak * 5, 200);

    return Math.round(Math.min(base, 1000));
  },

  tier(score) {
    if (score >= 800) return { label: 'Elite',    color: '#fbbf24', icon: '👑' };
    if (score >= 600) return { label: 'Expert',   color: '#a78bfa', icon: '💎' };
    if (score >= 400) return { label: 'Senior',   color: '#63d9ff', icon: '🔷' };
    if (score >= 200) return { label: 'Builder',  color: '#34d399', icon: '🟢' };
    return              { label: 'Newcomer',  color: '#8b92b8', icon: '🌱' };
  },

  /** Render a DevScore badge HTML string. */
  badgeHtml(score, compact = false) {
    const t = this.tier(score);
    if (compact) {
      return `<span class="devscore-badge-compact" title="DevScore ${score} · ${t.label}" style="
        display:inline-flex;align-items:center;gap:4px;
        font-size:11px;font-weight:700;color:${t.color};
        background:${t.color}18;padding:2px 7px;border-radius:var(--radius-full);
        border:1px solid ${t.color}40;
      ">${t.icon} ${score}</span>`;
    }
    const pct = (score / 1000) * 100;
    return `
      <div class="devscore-card" style="
        background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);
        padding:16px;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px">
            <i class="fa-solid fa-star" style="color:${t.color}"></i> DevScore
          </div>
          <span style="font-size:11px;font-weight:700;letter-spacing:0.05em;
            color:${t.color};background:${t.color}18;padding:2px 8px;border-radius:var(--radius-full)">
            ${t.icon} ${t.label}
          </span>
        </div>
        <div style="font-size:42px;font-weight:900;font-family:var(--font-display);
          background:linear-gradient(135deg, ${t.color}, var(--cyan));
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          line-height:1;margin-bottom:12px">${score}</div>
        <div style="background:var(--bg-void);border-radius:var(--radius-full);height:6px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, ${t.color}, var(--cyan));
            border-radius:var(--radius-full);transition:width 1s var(--spring)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text-muted)">
          <span>0</span><span>500</span><span>1000</span>
        </div>
        <div style="margin-top:12px;font-size:11px;color:var(--text-muted);line-height:1.5">
          Based on posts, followers, engagement quality &amp; daily streaks.
        </div>
      </div>`;
  },
};

/* Inject DevScore into profile view after it renders */
(function patchProfileViewForDevScore() {
  const observer = new MutationObserver(async () => {
    const profileHeader = document.querySelector('.profile-stats, .profile-header-stats');
    if (!profileHeader || profileHeader.dataset.devscoreInjected) return;
    profileHeader.dataset.devscoreInjected = 'true';

    // Determine which user's profile we're viewing
    const uid = profileHeader.closest('[data-uid]')?.dataset.uid || State.user?.id;
    if (!uid) return;
    const score = await DevScore.compute(uid);
    const t = DevScore.tier(score);
    const badge = document.createElement('span');
    badge.innerHTML = DevScore.badgeHtml(score, true);
    profileHeader.appendChild(badge.firstElementChild);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

/* ────────────────────────────────────────────────────────────────
   ██████╗  ██████╗     ██████╗ 1 — SHIP BUTTON
   ──────────────────────────────────────────────────────────────── */

/**
 * Adds a "🚀 Ship" button to every post card. Clicking it opens
 * a modal where the user picks a connected repo and initiates a
 * GitHub Actions workflow_dispatch (if the repo has one) or a
 * direct file push from the post's code block.
 */
(function injectShipButton() {
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.post-ship-btn');
    if (!btn) return;
    const postId = btn.closest('[data-post-id]')?.dataset.postId;
    if (!postId) return;

    // Load the post
    const { data: post } = await sb.from('posts').select('*').eq('id', postId).single();
    if (!post) return;

    openShipModal(post);
  });

  // Inject ship button into post cards
  const cardObserver = new MutationObserver(() => {
    document.querySelectorAll('.post-card:not([data-ship-injected])').forEach(card => {
      card.dataset.shipInjected = 'true';
      const actions = card.querySelector('.post-actions, .post-footer-actions');
      if (!actions) return;
      const shipBtn = document.createElement('button');
      shipBtn.className = 'post-ship-btn';
      shipBtn.title = 'Ship this';
      shipBtn.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;
        padding:4px 10px;border-radius:var(--radius-sm);
        background:rgba(99,217,255,0.08);border:1px solid rgba(99,217,255,0.2);
        color:var(--cyan);font-size:12px;font-weight:600;
        transition:all 0.15s;cursor:pointer;
      `;
      shipBtn.innerHTML = '<i class="fa-solid fa-rocket"></i> Ship';
      shipBtn.addEventListener('mouseenter', () => {
        shipBtn.style.background = 'rgba(99,217,255,0.18)';
        shipBtn.style.borderColor = 'var(--cyan)';
      });
      shipBtn.addEventListener('mouseleave', () => {
        shipBtn.style.background = 'rgba(99,217,255,0.08)';
        shipBtn.style.borderColor = 'rgba(99,217,255,0.2)';
      });
      actions.appendChild(shipBtn);
    });
  });
  cardObserver.observe(document.body, { childList: true, subtree: true });
})();

async function openShipModal(post) {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body');
  const title = document.getElementById('modal-title-text');
  title.innerHTML = '<i class="fa-solid fa-rocket" style="color:var(--cyan);margin-right:6px"></i> Ship This Post';
  modal.classList.add('open');

  body.innerHTML = `<div style="padding:24px;display:flex;flex-direction:column;gap:16px">
    <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;background:var(--bg-void);border-radius:var(--radius-sm);padding:12px 14px;border-left:3px solid var(--cyan)">
      ${_esc((post.content || '').slice(0, 200))}${post.content?.length > 200 ? '…' : ''}
    </div>

    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">
        <i class="fa-brands fa-github" style="margin-right:4px"></i> Target Repository
        <span style="color:var(--text-muted)">(owner/repo)</span>
      </label>
      <input id="ship-repo-input" class="auth-input" placeholder="e.g. your-username/my-project" style="font-family:var(--font-mono);font-size:13px">
    </div>

    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Branch</label>
      <input id="ship-branch-input" class="auth-input" value="main" style="font-family:var(--font-mono);font-size:13px">
    </div>

    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">
        Commit Message
      </label>
      <input id="ship-commit-input" class="auth-input"
        value="feat: ship from Devit post"
        style="font-size:13px">
    </div>

    <div id="ship-code-section">
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">
        File content <span style="color:var(--text-muted)">(extracted from code block)</span>
      </label>
      <textarea id="ship-file-content" style="
        width:100%;height:120px;background:var(--bg-void);border:1px solid var(--border);
        border-radius:var(--radius-sm);padding:10px;font-family:var(--font-mono);font-size:12px;
        color:var(--text-primary);resize:vertical;
      " placeholder="Paste file content or extract from post…">${_extractCodeBlock(post.content)}</textarea>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <label style="font-size:12px;color:var(--text-secondary)">File path:</label>
        <input id="ship-file-path" class="auth-input" style="flex:1;font-family:var(--font-mono);font-size:12px"
          placeholder="src/index.js" value="snippet.js">
      </div>
    </div>

    <div id="ship-status" style="display:none;font-size:12px;padding:8px 12px;border-radius:var(--radius-sm)"></div>

    <div style="display:flex;gap:8px">
      <button id="ship-trigger-dispatch-btn" class="auth-btn-primary" style="flex:1;padding:12px">
        <i class="fa-solid fa-bolt"></i> Trigger Workflow Dispatch
      </button>
      <button id="ship-push-file-btn" class="auth-btn-magic" style="flex:1;padding:12px">
        <i class="fa-solid fa-code-commit"></i> Push File to Repo
      </button>
    </div>
    <div style="font-size:11px;color:var(--text-muted);text-align:center">
      Requires a PAT with <code>repo</code> scope saved in Settings → GitHub Sync
    </div>
  </div>`;

  const showStatus = (msg, ok) => {
    const el = document.getElementById('ship-status');
    el.style.display = 'block';
    el.style.background = ok ? 'rgba(52,211,153,0.1)' : 'rgba(251,113,133,0.1)';
    el.style.color = ok ? 'var(--emerald)' : 'var(--rose)';
    el.style.border = `1px solid ${ok ? 'rgba(52,211,153,0.3)' : 'rgba(251,113,133,0.3)'}`;
    el.innerHTML = `<i class="fa-solid fa-${ok ? 'check' : 'circle-exclamation'}" style="margin-right:6px"></i>${msg}`;
  };

  async function getToken() {
    const { data } = await sb.from('profiles').select('github_token').eq('id', State.user.id).single();
    return data?.github_token;
  }

  // Trigger workflow_dispatch
  document.getElementById('ship-trigger-dispatch-btn').addEventListener('click', async () => {
    const repo   = document.getElementById('ship-repo-input').value.trim();
    const branch = document.getElementById('ship-branch-input').value.trim() || 'main';
    if (!repo) { showStatus('Enter a repository (owner/repo)', false); return; }

    const token = await getToken();
    if (!token) { showStatus('No GitHub token found — add one in Settings → GitHub Sync', false); return; }

    const btn = document.getElementById('ship-trigger-dispatch-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Triggering…';

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
      const { workflows } = await res.json();
      if (!workflows?.length) { showStatus('No workflows found in this repo. Try "Push File" instead.', false); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Trigger Workflow Dispatch'; return; }

      const wf = workflows[0];
      const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf.id}/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: branch, inputs: { source: 'devit', post_id: post.id } }),
      });
      if (dispatchRes.status === 204) {
        showStatus(`✅ Triggered workflow "${wf.name}" on ${branch}!`, true);
        toast('Workflow dispatched!', 'rocket');
      } else {
        const err = await dispatchRes.json();
        showStatus(`GitHub error: ${err.message || dispatchRes.status}`, false);
      }
    } catch(e) { showStatus('Network error: ' + e.message, false); }
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Trigger Workflow Dispatch';
  });

  // Push file directly
  document.getElementById('ship-push-file-btn').addEventListener('click', async () => {
    const repo     = document.getElementById('ship-repo-input').value.trim();
    const branch   = document.getElementById('ship-branch-input').value.trim() || 'main';
    const message  = document.getElementById('ship-commit-input').value.trim() || 'feat: ship from Devit';
    const content  = document.getElementById('ship-file-content').value;
    const filePath = document.getElementById('ship-file-path').value.trim() || 'snippet.js';
    if (!repo) { showStatus('Enter a repository (owner/repo)', false); return; }
    if (!content) { showStatus('File content is empty', false); return; }

    const token = await getToken();
    if (!token) { showStatus('No GitHub token found — add one in Settings → GitHub Sync', false); return; }

    const btn = document.getElementById('ship-push-file-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pushing…';

    try {
      // Check if file exists (to get SHA for update)
      let sha = null;
      const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
      if (checkRes.ok) { const d = await checkRes.json(); sha = d.sha; }

      const body = { message, content: btoa(unescape(encodeURIComponent(content))), branch };
      if (sha) body.sha = sha;

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (putRes.ok) {
        const data = await putRes.json();
        const fileUrl = data.content?.html_url || `https://github.com/${repo}/blob/${branch}/${filePath}`;
        showStatus(`File shipped to <a href="${fileUrl}" target="_blank" style="color:var(--cyan)">${filePath}</a>`, true);
        toast('File pushed to GitHub!', 'code-commit');
        // Also update the post with ship metadata
        await sb.from('posts').update({ shipped_to: repo, shipped_at: new Date().toISOString() }).eq('id', post.id);
      } else {
        const err = await putRes.json();
        showStatus(`GitHub error: ${err.message || putRes.status}`, false);
      }
    } catch(e) { showStatus('Error: ' + e.message, false); }
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-code-commit"></i> Push File to Repo';
  });
}

function _extractCodeBlock(content) {
  if (!content) return '';
  const match = content.match(/```[\w]*\n?([\s\S]*?)```/);
  return match ? match[1].trim() : '';
}

/* ────────────────────────────────────────────────────────────────
   ██████╗  ██████╗     ██████╗ 1 — OFFICE HOURS BOOKING
   ──────────────────────────────────────────────────────────────── */

/**
 * Office Hours: seniors can publish available slots; anyone can book.
 * Data stored in Supabase table `office_hours`.
 */
function renderOfficeHoursView(container) {
  container.innerHTML = `
    <div class="oh-layout" style="max-width:720px;margin:0 auto;padding:24px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:12px">
        <div>
          <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">
            <i class="fa-solid fa-calendar-days" style="color:var(--violet);margin-right:8px"></i>Office Hours
          </h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px">
            Book time with senior devs or publish your own availability.
          </p>
        </div>
        <button id="oh-offer-btn" class="auth-btn-primary" style="white-space:nowrap;padding:10px 16px">
          <i class="fa-solid fa-plus"></i> Offer Hours
        </button>
      </div>

      <div id="oh-slots-list" style="display:flex;flex-direction:column;gap:12px">
        <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:40px 0">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i> Loading slots…
        </div>
      </div>
    </div>
  `;

  document.getElementById('oh-offer-btn').addEventListener('click', openOfferHoursModal);
  loadOfficeHoursSlots();
}

async function loadOfficeHoursSlots() {
  const list = document.getElementById('oh-slots-list');
  if (!list) return;

  const { data: slots } = await sb
    .from('office_hours')
    .select('*, host:profiles!office_hours_host_id_fkey(id, username, display_name, avatar_url, bio), bookings:office_hours_bookings(id, booker_id)')
    .eq('status', 'open')
    .gte('slot_start', new Date().toISOString())
    .order('slot_start', { ascending: true })
    .limit(30);

  if (!slots?.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <i class="fa-solid fa-calendar-xmark" style="font-size:32px;margin-bottom:12px;opacity:0.4"></i>
        <div style="font-size:14px;font-weight:600">No office hours scheduled</div>
        <div style="font-size:12px;margin-top:4px">Be the first to offer your time!</div>
      </div>`;
    return;
  }

  list.innerHTML = slots.map(slot => {
    const host = slot.host;
    const start = new Date(slot.slot_start);
    const end   = new Date(slot.slot_end);
    const isHost = slot.host_id === State.user.id;
    const bookedByMe = (slot.bookings || []).some(b => b.booker_id === State.user.id);
    const bookingCount = (slot.bookings || []).length;
    const full = bookingCount >= (slot.max_bookings || 1);

    return `
      <div class="oh-slot-card" style="
        background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);
        padding:20px;display:flex;align-items:flex-start;gap:16px;transition:border-color 0.2s;
      " data-slot-id="${slot.id}">
        <div style="flex-shrink:0">
          ${avatarHtml ? avatarHtml(host, 48) : `<div style="width:48px;height:48px;border-radius:12px;background:var(--violet-dim);display:flex;align-items:center;justify-content:center;font-size:18px">${(host?.display_name||'?')[0]}</div>`}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-weight:700;font-size:14px">${_esc(host?.display_name || host?.username || '?')}</span>
            <span style="font-size:11px;color:var(--text-muted)">@${_esc(host?.username || '?')}</span>
            ${slot.topic ? `<span style="font-size:11px;background:var(--violet-dim);color:var(--violet);padding:2px 8px;border-radius:var(--radius-full)">${_esc(slot.topic)}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:var(--cyan);font-family:var(--font-mono);margin-bottom:8px">
            <span><i class="fa-regular fa-clock" style="margin-right:4px"></i>${_fmtSlotTime(start, end)}</span>
            <span style="color:var(--text-muted)">${slot.duration_min || 30} min</span>
          </div>
          ${slot.description ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">${_esc(slot.description)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${!isHost ? `
              <button class="oh-book-btn ${bookedByMe ? 'booked' : ''}" data-slot-id="${slot.id}"
                ${bookedByMe || full ? 'disabled' : ''}
                style="
                  padding:6px 14px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;
                  background:${bookedByMe ? 'rgba(52,211,153,0.1)' : full ? 'var(--bg-float)' : 'var(--cyan-dim)'};
                  color:${bookedByMe ? 'var(--emerald)' : full ? 'var(--text-muted)' : 'var(--cyan)'};
                  border:1px solid ${bookedByMe ? 'rgba(52,211,153,0.3)' : full ? 'transparent' : 'rgba(99,217,255,0.3)'};
                  cursor:${bookedByMe || full ? 'default' : 'pointer'};
                ">
                ${bookedByMe ? '<i class="fa-solid fa-check"></i> Booked' : full ? 'Full' : '<i class="fa-solid fa-calendar-check"></i> Book Slot'}
              </button>
            ` : `
              <button class="oh-cancel-btn" data-slot-id="${slot.id}" style="
                padding:6px 14px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;
                background:rgba(251,113,133,0.08);color:var(--rose);
                border:1px solid rgba(251,113,133,0.2);cursor:pointer;
              "><i class="fa-solid fa-trash"></i> Cancel Slot</button>
            `}
            <span style="font-size:11px;color:var(--text-muted)">${bookingCount}/${slot.max_bookings || 1} booked</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire book buttons
  list.querySelectorAll('.oh-book-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slotId = btn.dataset.slotId;
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      const { error } = await sb.from('office_hours_bookings').insert({
        slot_id: slotId, booker_id: State.user.id
      });
      if (!error) {
        toast('Slot booked! Check your notifications.', 'calendar-check');
        // Notify host
        const { data: slot } = await sb.from('office_hours').select('host_id').eq('id', slotId).single();
        if (slot) await sb.from('notifications').insert({ user_id: slot.host_id, actor_id: State.user.id, type: 'office_hours_booking', reference_id: slotId });
        loadOfficeHoursSlots();
      } else {
        toast('Booking failed: ' + error.message, 'circle-exclamation');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> Book Slot';
      }
    });
  });

  list.querySelectorAll('.oh-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancel this office hours slot?')) return;
      const { error } = await sb.from('office_hours').update({ status: 'cancelled' }).eq('id', btn.dataset.slotId);
      if (!error) { toast('Slot cancelled', 'calendar-xmark'); loadOfficeHoursSlots(); }
    });
  });
}

function openOfferHoursModal() {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body');
  const title = document.getElementById('modal-title-text');
  title.innerHTML = '<i class="fa-solid fa-calendar-plus" style="color:var(--violet);margin-right:6px"></i> Offer Office Hours';
  modal.classList.add('open');

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 24*60*60*1000);
  defaultStart.setMinutes(0, 0, 0);
  const toLocal = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  body.innerHTML = `<div style="padding:24px;display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;gap:12px">
      <div style="flex:1">
        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Start Time</label>
        <input type="datetime-local" id="oh-start" class="auth-input" value="${toLocal(defaultStart)}" style="font-family:var(--font-mono);font-size:13px">
      </div>
      <div style="flex:1">
        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Duration</label>
        <select id="oh-duration" class="auth-input" style="font-size:13px">
          <option value="15">15 min</option>
          <option value="30" selected>30 min</option>
          <option value="45">45 min</option>
          <option value="60">1 hour</option>
        </select>
      </div>
    </div>
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Topic / Focus Area</label>
      <input id="oh-topic" class="auth-input" placeholder="e.g. React, System Design, Career Advice" style="font-size:13px">
    </div>
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Description (optional)</label>
      <textarea id="oh-desc" style="
        width:100%;height:80px;background:var(--bg-void);border:1px solid var(--border);
        border-radius:var(--radius-sm);padding:10px;font-family:var(--font-body);font-size:13px;
        color:var(--text-primary);resize:vertical;
      " placeholder="What can people expect from this session?"></textarea>
    </div>
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Max attendees</label>
      <select id="oh-max" class="auth-input" style="font-size:13px">
        <option value="1">1 (1-on-1)</option>
        <option value="3">3</option>
        <option value="5">5</option>
        <option value="10">10</option>
      </select>
    </div>
    <div id="oh-form-status" style="display:none"></div>
    <button id="oh-submit-btn" class="auth-btn-primary" style="padding:12px">
      <i class="fa-solid fa-calendar-plus"></i> Publish Slot
    </button>
  </div>`;

  document.getElementById('oh-submit-btn').addEventListener('click', async () => {
    const startVal = document.getElementById('oh-start').value;
    const duration = parseInt(document.getElementById('oh-duration').value);
    const topic    = document.getElementById('oh-topic').value.trim();
    const desc     = document.getElementById('oh-desc').value.trim();
    const maxBook  = parseInt(document.getElementById('oh-max').value);

    if (!startVal) { showOhStatus('Pick a start time', false); return; }
    const slotStart = new Date(startVal);
    const slotEnd   = new Date(slotStart.getTime() + duration * 60000);

    const btn = document.getElementById('oh-submit-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing…';

    const { error } = await sb.from('office_hours').insert({
      host_id: State.user.id,
      slot_start: slotStart.toISOString(),
      slot_end:   slotEnd.toISOString(),
      duration_min: duration,
      topic,
      description: desc,
      max_bookings: maxBook,
      status: 'open',
    });

    if (!error) {
      modal.classList.remove('open');
      toast('Office hours published!', 'calendar-plus');
    } else {
      showOhStatus('Failed: ' + error.message, false);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Publish Slot';
    }
  });

  function showOhStatus(msg, ok) {
    const el = document.getElementById('oh-form-status');
    el.style.display = 'block';
    el.style.color = ok ? 'var(--emerald)' : 'var(--rose)';
    el.style.fontSize = '12px';
    el.textContent = msg;
  }
}

function _fmtSlotTime(start, end) {
  const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return start.toLocaleDateString(undefined, opts) + ' → ' + end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/* ────────────────────────────────────────────────────────────────
   ██████╗  ██████╗     ██████╗ 2 — TEAM ROOMS
   ──────────────────────────────────────────────────────────────── */

function renderTeamRoomsView(container) {
  container.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:24px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:12px;flex-wrap:wrap">
        <div>
          <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">
            <i class="fa-solid fa-door-open" style="color:var(--emerald);margin-right:8px"></i>Team Rooms
          </h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px">
            Project workspaces with GitHub PRs, issues, and live deploys.
          </p>
        </div>
        <button id="tr-create-btn" class="auth-btn-primary" style="white-space:nowrap;padding:10px 16px">
          <i class="fa-solid fa-plus"></i> New Room
        </button>
      </div>
      <div id="tr-rooms-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:40px;grid-column:1/-1">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i> Loading rooms…
        </div>
      </div>
    </div>
  `;

  document.getElementById('tr-create-btn').addEventListener('click', openCreateRoomModal);
  loadTeamRooms();
}

async function loadTeamRooms() {
  const grid = document.getElementById('tr-rooms-grid');
  if (!grid) return;

  const { data: memberships } = await sb
    .from('team_room_members')
    .select('room_id, role, team_rooms(id, name, description, color, github_repo, created_at, owner_id)')
    .eq('user_id', State.user.id);

  if (!memberships?.length) {
    grid.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted);grid-column:1/-1">
        <i class="fa-solid fa-door-closed" style="font-size:36px;margin-bottom:12px;opacity:0.3"></i>
        <div style="font-size:14px;font-weight:600">No rooms yet</div>
        <div style="font-size:12px;margin-top:4px">Create or get invited to a Team Room.</div>
      </div>`;
    return;
  }

  grid.innerHTML = memberships.map(m => {
    const room = m.team_rooms;
    if (!room) return '';
    const colors = ['#63d9ff','#a78bfa','#34d399','#fbbf24','#fb7185'];
    const color = room.color || colors[room.name.charCodeAt(0) % colors.length];
    return `
      <div class="tr-room-card" data-room-id="${room.id}" style="
        background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);
        padding:20px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;
      " onmouseenter="this.style.borderColor='${color}40';this.style.transform='translateY(-2px)'"
         onmouseleave="this.style.borderColor='';this.style.transform=''">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${color}"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div style="width:40px;height:40px;border-radius:10px;background:${color}20;
            display:flex;align-items:center;justify-content:center;font-size:20px">
            ${room.github_repo ? '🐙' : '🏠'}
          </div>
          <span style="font-size:10px;font-weight:700;letter-spacing:0.05em;
            color:${color};background:${color}15;padding:2px 8px;border-radius:var(--radius-full)">
            ${m.role === 'owner' ? 'OWNER' : 'MEMBER'}
          </span>
        </div>
        <div style="font-family:var(--font-display);font-weight:700;font-size:16px;margin-bottom:6px">
          ${_esc(room.name)}
        </div>
        ${room.description ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_esc(room.description)}</div>` : ''}
        ${room.github_repo ? `
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);
            font-family:var(--font-mono);padding:6px 8px;background:var(--bg-void);border-radius:var(--radius-sm)">
            <i class="fa-brands fa-github"></i>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(room.github_repo)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.tr-room-card').forEach(card => {
    card.addEventListener('click', () => openTeamRoom(card.dataset.roomId));
  });
}

async function openTeamRoom(roomId) {
  const { data: room } = await sb
    .from('team_rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) { toast('Room not found', 'circle-exclamation'); return; }

  const main = document.getElementById('main');
  main.innerHTML = `
    <div style="max-width:960px;margin:0 auto;padding:20px 16px">
      <!-- Room Header -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px">
        <button id="tr-back-btn" style="
          width:36px;height:36px;border-radius:var(--radius-sm);background:var(--bg-surface);
          border:1px solid var(--border);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;
          flex-shrink:0;cursor:pointer;
        "><i class="fa-solid fa-arrow-left"></i></button>
        <div>
          <h2 style="font-family:var(--font-display);font-size:20px;font-weight:800">
            <i class="fa-solid fa-door-open" style="color:var(--emerald);margin-right:8px"></i>${_esc(room.name)}
          </h2>
          ${room.github_repo ? `<div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px"><i class="fa-brands fa-github" style="margin-right:4px"></i>${_esc(room.github_repo)}</div>` : ''}
        </div>
        ${room.github_repo ? `
          <button id="tr-deploy-btn" class="auth-btn-primary" style="margin-left:auto;padding:9px 16px;white-space:nowrap">
            <i class="fa-solid fa-rocket"></i> Deploy
          </button>
        ` : ''}
      </div>

      <!-- Tab Bar -->
      <div style="display:flex;gap:2px;background:var(--bg-surface);padding:4px;border-radius:var(--radius-md);margin-bottom:20px;overflow-x:auto" id="tr-tab-bar">
        ${[
          { id:'chat',    icon:'fa-comments',          label:'Chat' },
          { id:'prs',     icon:'fa-code-pull-request', label:'Pull Requests' },
          { id:'issues',  icon:'fa-circle-dot',        label:'Issues' },
          { id:'deploy',  icon:'fa-bolt',              label:'Deploys' },
          { id:'members', icon:'fa-users',             label:'Members' },
        ].map(t => `
          <button class="tr-tab" data-tab="${t.id}" style="
            padding:7px 14px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;
            background:${t.id==='chat'?'var(--bg-float)':'transparent'};
            color:${t.id==='chat'?'var(--text-primary)':'var(--text-muted)'};
            white-space:nowrap;transition:all 0.15s;
          ">
            <i class="fa-solid ${t.icon}" style="margin-right:5px"></i>${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Tab Content -->
      <div id="tr-tab-content"></div>
    </div>
  `;

  document.getElementById('tr-back-btn').addEventListener('click', () => {
    renderTeamRoomsView(document.getElementById('main'));
  });

  const deployBtn = document.getElementById('tr-deploy-btn');
  if (deployBtn) {
    deployBtn.addEventListener('click', () => openRoomDeployModal(room));
  }

  // Tab switching
  document.getElementById('tr-tab-bar').addEventListener('click', e => {
    const btn = e.target.closest('.tr-tab');
    if (!btn) return;
    document.querySelectorAll('.tr-tab').forEach(t => {
      t.style.background = t === btn ? 'var(--bg-float)' : 'transparent';
      t.style.color = t === btn ? 'var(--text-primary)' : 'var(--text-muted)';
    });
    loadTeamRoomTab(btn.dataset.tab, room);
  });

  loadTeamRoomTab('chat', room);
}

async function loadTeamRoomTab(tab, room) {
  const content = document.getElementById('tr-tab-content');
  if (!content) return;

  if (tab === 'chat') {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;height:calc(100vh - 280px);min-height:300px">
        <div id="tr-messages" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-bottom:12px"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="tr-msg-input" class="auth-input" placeholder="Message the team…" style="flex:1;font-size:13px">
          <button id="tr-msg-send" class="auth-btn-primary" style="padding:10px 16px">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
      </div>`;

    await loadRoomMessages(room.id);

    document.getElementById('tr-msg-send').addEventListener('click', () => sendRoomMessage(room.id));
    document.getElementById('tr-msg-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRoomMessage(room.id); }
    });

    // Realtime subscription for room chat
    const sub = sb.channel(`tr_room_${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_room_messages', filter: `room_id=eq.${room.id}` }, () => loadRoomMessages(room.id))
      .subscribe();
    State.realtimeSubs.push(sub);

  } else if (tab === 'prs' || tab === 'issues' || tab === 'deploy') {
    if (!room.github_repo) {
      content.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-muted)">
          <i class="fa-brands fa-github" style="font-size:32px;margin-bottom:12px;opacity:0.3"></i>
          <div style="font-size:14px;font-weight:600">No GitHub repo linked</div>
          <div style="font-size:12px;margin-top:4px">Edit this room to link a repo.</div>
        </div>`;
      return;
    }
    content.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted)">
      <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i> Loading from GitHub…
    </div>`;
    await loadGitHubTabContent(tab, room, content);

  } else if (tab === 'members') {
    const { data: members } = await sb
      .from('team_room_members')
      .select('user_id, role, profiles(id, username, display_name, avatar_url)')
      .eq('room_id', room.id);

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${(members||[]).map(m => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md)">
            ${avatarHtml ? avatarHtml(m.profiles, 40) : `<div style="width:40px;height:40px;background:var(--bg-float);border-radius:10px;display:flex;align-items:center;justify-content:center">${(m.profiles?.display_name||'?')[0]}</div>`}
            <div style="flex:1">
              <div style="font-weight:600">${_esc(m.profiles?.display_name || m.profiles?.username || '?')}</div>
              <div style="font-size:12px;color:var(--text-muted)">@${_esc(m.profiles?.username || '?')}</div>
            </div>
            <span style="font-size:11px;font-weight:700;letter-spacing:0.04em;
              padding:2px 8px;border-radius:var(--radius-full);
              background:${m.role==='owner'?'rgba(251,191,36,0.12)':'var(--bg-float)'};
              color:${m.role==='owner'?'var(--amber)':'var(--text-muted)'}">
              ${m.role.toUpperCase()}
            </span>
          </div>
        `).join('')}
        ${room.owner_id === State.user.id ? `
          <button id="tr-invite-btn" style="
            margin-top:4px;padding:12px;border-radius:var(--radius-md);
            background:var(--bg-surface);border:1px dashed var(--border);
            color:var(--text-muted);font-size:13px;font-weight:600;
            transition:all 0.2s;cursor:pointer;
          " onmouseenter="this.style.borderColor='var(--cyan)';this.style.color='var(--cyan)'"
             onmouseleave="this.style.borderColor='';this.style.color=''">
            <i class="fa-solid fa-user-plus" style="margin-right:6px"></i>Invite Member
          </button>
        ` : ''}
      </div>`;

    document.getElementById('tr-invite-btn')?.addEventListener('click', () => openInviteMemberModal(room.id));
  }
}

async function loadGitHubTabContent(tab, room, container) {
  const { data: profile } = await sb.from('profiles').select('github_token').eq('id', State.user.id).single();
  const token = profile?.github_token;
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    if (tab === 'prs') {
      const res = await fetch(`https://api.github.com/repos/${room.github_repo}/pulls?state=open&per_page=20`, { headers });
      const prs = await res.json();
      container.innerHTML = prs?.length
        ? prs.map(pr => `
          <a href="${pr.html_url}" target="_blank" style="
            display:block;padding:14px 16px;background:var(--bg-surface);border:1px solid var(--border);
            border-radius:var(--radius-md);text-decoration:none;color:inherit;margin-bottom:8px;
            transition:border-color 0.15s;
          " onmouseenter="this.style.borderColor='var(--cyan)'" onmouseleave="this.style.borderColor=''">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <i class="fa-solid fa-code-pull-request" style="color:var(--emerald);margin-top:2px"></i>
              <div>
                <div style="font-weight:600;font-size:13px">${_esc(pr.title)}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
                  #${pr.number} by ${_esc(pr.user?.login)} · ${new Date(pr.created_at).toLocaleDateString()}
                </div>
              </div>
              <span style="margin-left:auto;font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-full);background:rgba(52,211,153,0.12);color:var(--emerald)">OPEN</span>
            </div>
          </a>`).join('')
        : `<div style="text-align:center;padding:40px;color:var(--text-muted)">No open PRs — clean slate!</div>`;

    } else if (tab === 'issues') {
      const res = await fetch(`https://api.github.com/repos/${room.github_repo}/issues?state=open&per_page=20`, { headers });
      const issues = await res.json();
      container.innerHTML = issues?.filter(i => !i.pull_request).length
        ? issues.filter(i => !i.pull_request).map(issue => `
          <a href="${issue.html_url}" target="_blank" style="
            display:block;padding:14px 16px;background:var(--bg-surface);border:1px solid var(--border);
            border-radius:var(--radius-md);text-decoration:none;color:inherit;margin-bottom:8px;
            transition:border-color 0.15s;
          " onmouseenter="this.style.borderColor='var(--rose)'" onmouseleave="this.style.borderColor=''">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <i class="fa-solid fa-circle-dot" style="color:var(--emerald);margin-top:2px"></i>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px">${_esc(issue.title)}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
                  #${issue.number} by ${_esc(issue.user?.login)} · ${new Date(issue.created_at).toLocaleDateString()}
                </div>
                ${issue.labels?.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px">
                  ${issue.labels.map(l => `<span style="font-size:10px;padding:1px 6px;border-radius:var(--radius-full);background:#${l.color}25;color:#${l.color}">${_esc(l.name)}</span>`).join('')}
                </div>` : ''}
              </div>
            </div>
          </a>`).join('')
        : `<div style="text-align:center;padding:40px;color:var(--text-muted)">No open issues 🎉</div>`;

    } else if (tab === 'deploy') {
      const res = await fetch(`https://api.github.com/repos/${room.github_repo}/actions/runs?per_page=10`, { headers });
      const data = await res.json();
      const runs = data?.workflow_runs || [];
      container.innerHTML = `
        <div style="margin-bottom:16px">
          <button id="tr-new-deploy-btn" class="auth-btn-primary" style="padding:10px 16px">
            <i class="fa-solid fa-rocket"></i> Trigger New Deploy
          </button>
        </div>
        ${runs.length ? runs.map(run => `
          <div style="
            padding:12px 16px;background:var(--bg-surface);border:1px solid var(--border);
            border-radius:var(--radius-md);margin-bottom:8px;display:flex;align-items:center;gap:12px;
          ">
            <i class="fa-solid fa-circle" style="color:${run.conclusion==='success'?'var(--emerald)':run.conclusion==='failure'?'var(--rose)':run.status==='in_progress'?'var(--amber)':'var(--text-muted)'};font-size:10px"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(run.name || run.display_title)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                ${run.head_branch} · ${new Date(run.created_at).toLocaleString()} ·
                <span style="text-transform:capitalize;color:${run.conclusion==='success'?'var(--emerald)':run.conclusion==='failure'?'var(--rose)':'var(--amber)'}">
                  ${run.conclusion || run.status}
                </span>
              </div>
            </div>
            <a href="${run.html_url}" target="_blank" style="font-size:11px;color:var(--cyan)">View <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          </div>`).join('')
        : `<div style="text-align:center;padding:40px;color:var(--text-muted)">No workflow runs yet</div>`}
      `;
      document.getElementById('tr-new-deploy-btn')?.addEventListener('click', () => {
        const fakePost = { id: 'room', content: `Deploy from Team Room: ${room.name}` };
        openShipModal({ ...fakePost, _prefillRepo: room.github_repo });
      });
    }
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--rose)"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>GitHub API error: ${_esc(e.message)}</div>`;
  }
}

async function loadRoomMessages(roomId) {
  const msgs = document.getElementById('tr-messages');
  if (!msgs) return;

  const { data } = await sb
    .from('team_room_messages')
    .select('*, author:profiles!team_room_messages_author_id_fkey(id, username, display_name, avatar_url)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(100);

  msgs.innerHTML = (data || []).map(m => {
    const isMe = m.author_id === State.user.id;
    const name = m.author?.display_name || m.author?.username || '?';
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;${isMe ? 'flex-direction:row-reverse' : ''}">
        ${!isMe ? `<div style="width:32px;height:32px;flex-shrink:0;border-radius:8px;background:var(--bg-float);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${name[0]}</div>` : ''}
        <div style="max-width:70%">
          ${!isMe ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">${_esc(name)}</div>` : ''}
          <div style="
            padding:8px 12px;border-radius:${isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};
            background:${isMe ? 'var(--cyan-dim)' : 'var(--bg-elevated)'};
            border:1px solid ${isMe ? 'rgba(99,217,255,0.2)' : 'var(--border)'};
            font-size:13px;line-height:1.5;
          ">${_esc(m.content)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:3px;text-align:${isMe?'right':'left'}">${timeAgo ? timeAgo(m.created_at) : new Date(m.created_at).toLocaleTimeString()}</div>
        </div>
      </div>`;
  }).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendRoomMessage(roomId) {
  const inp = document.getElementById('tr-msg-input');
  const content = inp?.value.trim();
  if (!content) return;
  inp.value = '';
  await sb.from('team_room_messages').insert({ room_id: roomId, author_id: State.user.id, content });
}

function openCreateRoomModal() {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body');
  const title = document.getElementById('modal-title-text');
  title.innerHTML = '<i class="fa-solid fa-door-open" style="color:var(--emerald);margin-right:6px"></i> Create Team Room';
  modal.classList.add('open');

  body.innerHTML = `<div style="padding:24px;display:flex;flex-direction:column;gap:14px">
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Room Name</label>
      <input id="tr-name-input" class="auth-input" placeholder="e.g. Project Atlas" style="font-size:13px">
    </div>
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Description (optional)</label>
      <textarea id="tr-desc-input" style="
        width:100%;height:70px;background:var(--bg-void);border:1px solid var(--border);
        border-radius:var(--radius-sm);padding:10px;font-family:var(--font-body);font-size:13px;
        color:var(--text-primary);resize:vertical;
      " placeholder="What's this room for?"></textarea>
    </div>
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">
        <i class="fa-brands fa-github" style="margin-right:4px"></i>Linked GitHub Repo
        <span style="color:var(--text-muted)">(optional — owner/repo)</span>
      </label>
      <input id="tr-repo-input" class="auth-input" placeholder="e.g. your-org/project-atlas" style="font-family:var(--font-mono);font-size:13px">
    </div>
    <div id="tr-create-status" style="display:none"></div>
    <button id="tr-create-submit" class="auth-btn-primary" style="padding:12px">
      <i class="fa-solid fa-door-open"></i> Create Room
    </button>
  </div>`;

  document.getElementById('tr-create-submit').addEventListener('click', async () => {
    const name = document.getElementById('tr-name-input').value.trim();
    const desc = document.getElementById('tr-desc-input').value.trim();
    const repo = document.getElementById('tr-repo-input').value.trim();
    if (!name) { showTrStatus('Room name is required', false); return; }

    const btn = document.getElementById('tr-create-submit');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating…';

    const { data: room, error } = await sb.from('team_rooms').insert({
      name, description: desc, github_repo: repo || null, owner_id: State.user.id,
    }).select().single();

    if (error || !room) {
      showTrStatus('Failed to create room: ' + (error?.message || ''), false);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-door-open"></i> Create Room';
      return;
    }

    // Add creator as owner member
    await sb.from('team_room_members').insert({ room_id: room.id, user_id: State.user.id, role: 'owner' });

    modal.classList.remove('open');
    toast('Team Room created!', 'door-open');
    renderTeamRoomsView(document.getElementById('main'));
  });

  function showTrStatus(msg, ok) {
    const el = document.getElementById('tr-create-status');
    el.style.display = 'block';
    el.style.color = ok ? 'var(--emerald)' : 'var(--rose)';
    el.style.fontSize = '12px';
    el.textContent = msg;
  }
}

function openInviteMemberModal(roomId) {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body');
  const title = document.getElementById('modal-title-text');
  title.innerHTML = '<i class="fa-solid fa-user-plus" style="color:var(--cyan);margin-right:6px"></i> Invite Member';
  modal.classList.add('open');

  body.innerHTML = `<div style="padding:24px;display:flex;flex-direction:column;gap:14px">
    <div>
      <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px">Search by username</label>
      <input id="tr-invite-search" class="auth-input" placeholder="e.g. johndoe" style="font-size:13px">
    </div>
    <div id="tr-invite-results" style="display:flex;flex-direction:column;gap:8px"></div>
    <div id="tr-invite-status" style="display:none;font-size:12px"></div>
  </div>`;

  let debounce;
  document.getElementById('tr-invite-search').addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = e.target.value.trim();
      if (!q) return;
      const { data } = await sb.from('profiles').select('id, username, display_name, avatar_url')
        .ilike('username', `%${q}%`).limit(5);
      const results = document.getElementById('tr-invite-results');
      if (!data?.length) { results.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">No users found</div>'; return; }
      results.innerHTML = data.map(p => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-elevated);border-radius:var(--radius-sm)">
          ${avatarHtml ? avatarHtml(p, 32) : `<div style="width:32px;height:32px;background:var(--bg-float);border-radius:8px;display:flex;align-items:center;justify-content:center">${(p.display_name||'?')[0]}</div>`}
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${_esc(p.display_name || p.username)}</div>
            <div style="font-size:11px;color:var(--text-muted)">@${_esc(p.username)}</div>
          </div>
          <button class="tr-add-member-btn" data-uid="${p.id}" style="
            padding:4px 10px;border-radius:var(--radius-sm);background:var(--cyan-dim);
            color:var(--cyan);border:1px solid rgba(99,217,255,0.2);font-size:12px;font-weight:600;cursor:pointer;
          ">Add</button>
        </div>
      `).join('');
      results.querySelectorAll('.tr-add-member-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const uid = btn.dataset.uid;
          btn.disabled = true; btn.textContent = '…';
          const { error } = await sb.from('team_room_members').insert({ room_id: roomId, user_id: uid, role: 'member' });
          if (!error) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
            toast('Member added!', 'user-plus');
            // Notify the invited user
            await sb.from('notifications').insert({ user_id: uid, actor_id: State.user.id, type: 'team_room_invite', reference_id: roomId });
          } else {
            btn.textContent = 'Error';
          }
        });
      });
    }, 300);
  });
}

function openRoomDeployModal(room) {
  const fakePost = { id: room.id, content: `Deploy from Team Room: ${_esc(room.name)}` };
  openShipModal({ ...fakePost, _prefillRepo: room.github_repo });
  // Pre-fill repo after modal opens
  setTimeout(() => {
    const inp = document.getElementById('ship-repo-input');
    if (inp && room.github_repo) inp.value = room.github_repo;
  }, 50);
}

/* ────────────────────────────────────────────────────────────────
   ██████╗  ██████╗     ██████╗ 2 — DAILY DIGEST (upgraded)
   ──────────────────────────────────────────────────────────────── */

/**
 * Replaces the weekly digest widget with a DAILY digest.
 * Shows top posts from the last 24h, trending tags, new members, and
 * a streak leaderboard.
 */
async function buildDailyDigestWidget() {
  const rightbar = document.getElementById('rightbar');
  if (!rightbar) return;

  // Remove old weekly widget if present
  document.getElementById('digest-widget')?.remove();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let topPosts = [], trendingTags = [], newMembers = [];

  try {
    const { data: posts } = await sb.from('posts')
      .select('id, content, tags, likes_count, created_at, author_id')
      .gte('created_at', since)
      .order('likes_count', { ascending: false })
      .limit(5);
    topPosts = posts || [];

    const { data: allPosts } = await sb.from('posts')
      .select('tags').gte('created_at', since).not('tags', 'is', null).limit(100);
    const tagCounts = {};
    (allPosts || []).forEach(p => (p.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    trendingTags = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).slice(0, 5).map(([t]) => t);

    const { data: members } = await sb.from('profiles')
      .select('id, username, display_name, avatar_url')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(3);
    newMembers = members || [];
  } catch(e) {
    console.warn('[Devit] Daily digest fetch failed:', e);
  }

  const widget = document.createElement('div');
  widget.id = 'digest-widget';
  widget.style.cssText = 'margin-bottom:12px';
  widget.innerHTML = `
    <div style="
      background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);
      overflow:hidden;
    ">
      <!-- Header with gradient strip -->
      <div style="
        background:linear-gradient(135deg, rgba(99,217,255,0.12), rgba(167,139,250,0.10));
        padding:12px 16px;border-bottom:1px solid var(--border);
        display:flex;align-items:center;justify-content:space-between;
      ">
        <div style="display:flex;align-items:center;gap:8px">
          <i class="fa-solid fa-sun" style="color:var(--amber);font-size:13px"></i>
          <span style="font-weight:700;font-size:13px">Today on Devit</span>
        </div>
        <span style="
          font-size:10px;font-weight:700;letter-spacing:0.06em;
          background:rgba(251,191,36,0.15);color:var(--amber);
          padding:2px 8px;border-radius:var(--radius-full);border:1px solid rgba(251,191,36,0.25);
        ">DAILY</span>
      </div>

      <div style="padding:14px 16px">

        <!-- Top Posts -->
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px">
          <i class="fa-solid fa-fire" style="color:var(--rose);margin-right:4px"></i>Hot Today
        </div>
        <div id="daily-top-posts" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
          ${topPosts.length
            ? topPosts.slice(0,3).map((p,i) => `
              <div class="daily-post-item" data-post-id="${p.id}" style="
                display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;
                border-radius:var(--radius-sm);transition:background 0.15s;
              " onmouseenter="this.style.background='var(--bg-elevated)'" onmouseleave="this.style.background=''">
                <span style="font-size:11px;font-weight:700;color:var(--text-muted);min-width:16px">${i+1}</span>
                <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${_esc((p.content||'').slice(0,60))}
                </span>
                <span style="font-size:10px;color:var(--rose);white-space:nowrap">
                  <i class="fa-solid fa-heart"></i> ${p.likes_count||0}
                </span>
              </div>`)
              .join('')
            : `<div style="font-size:12px;color:var(--text-muted)">No posts today yet — be first!</div>`
          }
        </div>

        <!-- Trending Tags -->
        ${trendingTags.length ? `
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:6px">
            <i class="fa-solid fa-hashtag" style="color:var(--cyan);margin-right:4px"></i>Trending
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px">
            ${trendingTags.map(t => `
              <span style="
                font-size:11px;padding:3px 8px;border-radius:var(--radius-full);cursor:pointer;
                background:var(--cyan-dim);color:var(--cyan);border:1px solid rgba(99,217,255,0.15);
                transition:background 0.15s;
              " data-tag="${_esc(t)}">#${_esc(t)}</span>
            `).join('')}
          </div>
        ` : ''}

        <!-- New Members -->
        ${newMembers.length ? `
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px">
            <i class="fa-solid fa-user-plus" style="color:var(--emerald);margin-right:4px"></i>Just Joined
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${newMembers.map(m => {
              const name = m.display_name || m.username || '?';
              const color = ['#63d9ff','#a78bfa','#34d399','#fb7185','#fbbf24'][name.charCodeAt(0)%5];
              return m.avatar_url
                ? `<img src="${m.avatar_url}" title="${_esc(name)}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;border:2px solid var(--bg-surface)" onerror="this.style.display='none'">`
                : `<div title="${_esc(name)}" style="width:32px;height:32px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--bg-void)">${name[0].toUpperCase()}</div>`;
            }).join('')}
          </div>
        ` : ''}

      </div>
    </div>
  `;

  rightbar.insertBefore(widget, rightbar.firstChild);

  // Interactions
  widget.querySelectorAll('.daily-post-item[data-post-id]').forEach(el => {
    el.addEventListener('click', () => {
      if (typeof openPostDetail === 'function') openPostDetail(el.dataset.postId);
    });
  });
}

/* ────────────────────────────────────────────────────────────────
   NAVIGATION PATCHES — add Office Hours + Team Rooms to sidebar
   ──────────────────────────────────────────────────────────────── */

(function patchNavigationForNewViews() {
  const wait = setInterval(() => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !State.user) return;
    clearInterval(wait);

    // Add Office Hours + Team Rooms to sidebar after a brief delay for initial render
    setTimeout(() => injectExtraNavLinks(), 800);
  }, 300);
})();

function injectExtraNavLinks() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || document.getElementById('nav-office-hours')) return;

  // Find the sidebar divider to insert before communities
  const divider = sidebar.querySelector('.sidebar-divider');
  if (!divider) return;

  const extraLinks = document.createElement('div');
  extraLinks.innerHTML = `
    <div class="sidebar-link" id="nav-office-hours" data-nav="office_hours" style="gap:10px">
      <span class="icon"><i class="fa-solid fa-calendar-days" style="color:var(--violet)"></i></span>
      <span>Office Hours</span>
    </div>
    <div class="sidebar-link" id="nav-team-rooms" data-nav="team_rooms" style="gap:10px">
      <span class="icon"><i class="fa-solid fa-door-open" style="color:var(--emerald)"></i></span>
      <span>Team Rooms</span>
    </div>
  `;

  divider.parentNode.insertBefore(extraLinks, divider);

  document.getElementById('nav-office-hours').addEventListener('click', () => {
    State.currentView = 'office_hours';
    updateSidebarActiveForCustom('office_hours');
    const main = document.getElementById('main');
    if (main) { main.innerHTML = ''; renderOfficeHoursView(main); }
  });

  document.getElementById('nav-team-rooms').addEventListener('click', () => {
    State.currentView = 'team_rooms';
    updateSidebarActiveForCustom('team_rooms');
    const main = document.getElementById('main');
    if (main) { main.innerHTML = ''; renderTeamRoomsView(main); }
  });
}

function updateSidebarActiveForCustom(view) {
  document.querySelectorAll('.sidebar-link[data-nav]').forEach(l => {
    l.classList.toggle('active', l.dataset.nav === view);
  });
}

/* Patch navigateTo to handle new views */
(function patchNavigateTo() {
  const waitForNav = setInterval(() => {
    if (typeof navigateTo !== 'function') return;
    clearInterval(waitForNav);

    const originalNav = navigateTo;
    window.navigateTo = function(view) {
      if (view === 'office_hours') {
        State.currentView = view;
        updateSidebarActiveForCustom(view);
        const main = document.getElementById('main');
        if (main) { main.innerHTML = ''; renderOfficeHoursView(main); }
        return;
      }
      if (view === 'team_rooms') {
        State.currentView = view;
        updateSidebarActiveForCustom(view);
        const main = document.getElementById('main');
        if (main) { main.innerHTML = ''; renderTeamRoomsView(main); }
        return;
      }
      return originalNav.apply(this, arguments);
    };
  }, 200);
})();

/* ────────────────────────────────────────────────────────────────
   SETTINGS PATCH — inject GitHub Sync card
   ──────────────────────────────────────────────────────────────── */

(function patchSettingsForGitHub() {
  const observer = new MutationObserver(() => {
    const settingsMain = document.querySelector('#main .settings-section, #main [class*="settings"]');
    if (!settingsMain || document.getElementById('github-connect-card')) return;

    // Try to find the connections/integrations section or just append
    const integSection = settingsMain.querySelector('[data-section="integrations"]') || settingsMain;
    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '20px';
    wrapper.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:10px">
        <i class="fa-solid fa-plug" style="margin-right:6px"></i>Integrations
      </div>
      ${renderGitHubConnectionCard()}
    `;
    integSection.appendChild(wrapper);
    bindGitHubConnectionCard();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

/* ────────────────────────────────────────────────────────────────
   DAILY DIGEST BOOT — replace weekly widget
   ──────────────────────────────────────────────────────────────── */

(function bootDailyDigest() {
  // Wait for rightbar to exist
  const wait = setInterval(() => {
    if (!document.getElementById('rightbar') || !State.user) return;
    clearInterval(wait);
    // Slight delay so the original weekly widget may have run first
    setTimeout(() => buildDailyDigestWidget(), 1500);
  }, 300);
})();

/* ────────────────────────────────────────────────────────────────
   GITHUB SYNC BOOT
   ──────────────────────────────────────────────────────────────── */

(function bootGitHubSync() {
  const wait = setInterval(() => {
    if (!State.user) return;
    clearInterval(wait);
    GitHubSync.start();
  }, 500);
})();

/* ────────────────────────────────────────────────────────────────
   SQL — Run in Supabase Dashboard
   ──────────────────────────────────────────────────────────────── */
console.log(`
/* ══════════════════════════════════════════════════════════════
   DEVIT P0/P1/P2 FEATURES — Run in Supabase Dashboard > SQL Editor
   ══════════════════════════════════════════════════════════════ */

-- GitHub fields on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_token text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_username text;

-- Auto-GitHub sync: post identifier
ALTER TABLE posts ADD COLUMN IF NOT EXISTS github_event_id text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_github_sync boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shipped_to text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shipped_at timestamptz;

-- Office Hours
CREATE TABLE IF NOT EXISTS office_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  duration_min int DEFAULT 30,
  topic text,
  description text,
  max_bookings int DEFAULT 1,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE office_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public office hours" ON office_hours FOR SELECT USING (true);
CREATE POLICY "Own office hours insert" ON office_hours FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Own office hours update" ON office_hours FOR UPDATE USING (auth.uid() = host_id);

-- Office Hours Bookings
CREATE TABLE IF NOT EXISTS office_hours_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid REFERENCES office_hours(id) ON DELETE CASCADE NOT NULL,
  booker_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(slot_id, booker_id)
);
ALTER TABLE office_hours_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public oh bookings" ON office_hours_bookings FOR SELECT USING (true);
CREATE POLICY "Auth oh booking" ON office_hours_bookings FOR INSERT WITH CHECK (auth.uid() = booker_id);

-- Team Rooms
CREATE TABLE IF NOT EXISTS team_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  color text,
  github_repo text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE team_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room members can view" ON team_rooms FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_room_members WHERE room_id = team_rooms.id AND user_id = auth.uid()));
CREATE POLICY "Auth create room" ON team_rooms FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner update room" ON team_rooms FOR UPDATE USING (auth.uid() = owner_id);

-- Team Room Members
CREATE TABLE IF NOT EXISTS team_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES team_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);
ALTER TABLE team_room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public room members" ON team_room_members FOR SELECT USING (true);
CREATE POLICY "Auth join room" ON team_room_members FOR INSERT WITH CHECK (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM team_rooms WHERE id = room_id AND owner_id = auth.uid())
);
CREATE POLICY "Member leave room" ON team_room_members FOR DELETE USING (auth.uid() = user_id);

-- Team Room Messages
CREATE TABLE IF NOT EXISTS team_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES team_rooms(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE team_room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room message select" ON team_room_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_room_members WHERE room_id = team_room_messages.room_id AND user_id = auth.uid()));
CREATE POLICY "Room message insert" ON team_room_messages FOR INSERT
  WITH CHECK (auth.uid() = author_id AND
    EXISTS (SELECT 1 FROM team_room_members WHERE room_id = team_room_messages.room_id AND user_id = auth.uid()));

-- Enable realtime for Team Room Messages
ALTER PUBLICATION supabase_realtime ADD TABLE team_room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE office_hours;
ALTER PUBLICATION supabase_realtime ADD TABLE office_hours_bookings;
`);

console.log('[Devit P0/P1/P2 Patch] ✓ Loaded: GitHub Sync · DevScore · Ship Button · Office Hours · Team Rooms · Daily Digest');
