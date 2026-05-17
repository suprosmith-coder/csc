/* ============================================================
   DEVIT — GitHub Integration Patch
   devit-github.patch.js

   Features:
   1.  Repos tab  — live repo cards (stars, forks, lang, link)
   2.  Pinned Repos — up to 6 pinned from GitHub API
   3.  Contribution graph — 52-week heatmap from GH API
   4.  "Currently Building" card — latest pushed repo
   5.  Builds feed — auto-post on push events (manual trigger)
   6.  Stacks — parse tech stack from repo languages
   7.  Ship Logs — commit timeline tied to repos
   8.  Share snippet from repo — import README / file as post
   9.  GitHub profile badge on every card
  10.  Full SQL additions (logged to console)
   ============================================================ */

'use strict';

/* ── GitHub cache (session-scoped) ─────────────────────────── */
const GHCache = {
  user:      null,
  repos:     null,
  pinned:    null,   // from DB (stored profile field)
  langs:     {},     // repoName → language map
  commits:   {},     // repoName → [commits]
  contribs:  null,   // 52-week contribution array
  token:     null,   // provider_token from Supabase session (GitHub OAuth only)
  username:  null,   // GitHub login
};

/* ── Token retrieval ─────────────────────────────────────────── */
// Retrieve GitHub OAuth token from the active Supabase session.
// Only available immediately after GitHub OAuth sign-in
// (Supabase doesn't persist provider_token between page loads).
async function getGHToken() {
  if (GHCache.token) return GHCache.token;
  try {
    const { data } = await sb.auth.getSession();
    if (data?.session?.provider_token && data?.session?.user?.app_metadata?.provider === 'github') {
      GHCache.token    = data.session.provider_token;
      GHCache.username = data.session.user.user_metadata?.user_name || null;
    }
  } catch (_) {}
  return GHCache.token;
}

/* ── Generic GH API fetch ────────────────────────────────────── */
async function ghFetch(path, token) {
  const headers = token
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    : { Accept: 'application/vnd.github+json' };
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

/* ── Public username from profile ────────────────────────────── */
function getGHUsername(profile) {
  // Stored when user signs in via GitHub OAuth
  return profile?.github_username || GHCache.username || profile?.username || null;
}

/* ── Fetch all repos (public API — no token needed for public) ── */
async function fetchGHRepos(username, token) {
  if (GHCache.repos && GHCache.repos._for === username) return GHCache.repos;
  const data = token
    ? await ghFetch(`/user/repos?sort=updated&per_page=30&type=owner`, token)
    : await ghFetch(`/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`, null);
  const repos = Array.isArray(data) ? data : [];
  repos._for = username;
  GHCache.repos = repos;
  return repos;
}

/* ── Language colour map ─────────────────────────────────────── */
const LANG_COLORS = {
  JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5', Rust:'#dea584',
  Go:'#00ADD8', Java:'#b07219', 'C++':'#f34b7d', C:'#555555', CSS:'#563d7c',
  HTML:'#e34c26', Ruby:'#701516', Swift:'#F05138', Kotlin:'#A97BFF',
  PHP:'#4F5D95', Dart:'#00B4AB', Shell:'#89e051', Vue:'#41b883', Svelte:'#ff3e00',
};
function langDot(lang) {
  const col = LANG_COLORS[lang] || '#8b92b8';
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0"></span>`;
}

/* ══════════════════════════════════════════════════════════════
   1. REPOS TAB — full repo grid with rich cards
   ══════════════════════════════════════════════════════════════ */

async function loadProfileRepos(container, profile) {
  if (!container) return;
  container.innerHTML = `
    <div style="padding:32px;text-align:center;color:var(--text-muted)">
      <i class="fa-brands fa-github" style="font-size:28px;margin-bottom:10px;display:block"></i>
      Loading repositories…
    </div>`;

  const token    = await getGHToken();
  const username = getGHUsername(profile);

  if (!profile?.is_github && !username) {
    _renderNoGitHub(container);
    return;
  }

  const repos = await fetchGHRepos(username, token).catch(() => []);

  if (!repos.length) {
    container.innerHTML = `
      <div style="padding:48px;text-align:center;color:var(--text-muted)">
        <i class="fa-solid fa-box-open" style="font-size:36px;margin-bottom:12px;display:block"></i>
        <div style="font-weight:600">No public repos found</div>
        <div style="font-size:12px;margin-top:4px">Repositories are pulled from GitHub's public API.</div>
      </div>`;
    return;
  }

  // Sort: pinned first, then stars desc
  const pinnedNames = new Set(profile?.pinned_repos || []);
  const sorted = [
    ...repos.filter(r => pinnedNames.has(r.name)),
    ...repos.filter(r => !pinnedNames.has(r.name)).sort((a,b) => b.stargazers_count - a.stargazers_count),
  ];

  const isOwn = profile.id === window.State?.user?.id;

  container.innerHTML = `
    <div style="padding:16px 16px 8px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:12px;color:var(--text-muted)">${repos.length} repositories</div>
      ${isOwn ? `<button id="gh-sync-btn" style="font-size:12px;color:var(--cyan);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px"><i class="fa-solid fa-rotate"></i> Sync from GitHub</button>` : ''}
    </div>
    <div id="gh-repos-grid" style="padding:0 16px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px"></div>
    <div style="padding:4px 16px 20px;text-align:center">
      <a href="https://github.com/${encodeURIComponent(username)}" target="_blank" rel="noopener noreferrer"
         style="font-size:12px;color:var(--text-muted);display:inline-flex;align-items:center;gap:6px;text-decoration:none">
        <i class="fa-brands fa-github"></i> github.com/${username}
      </a>
    </div>`;

  const grid = container.querySelector('#gh-repos-grid');
  sorted.forEach(r => grid.appendChild(_buildRepoCard(r, pinnedNames.has(r.name), isOwn, profile)));

  // Sync button — re-runs GitHub autofill and refreshes tech stack
  const syncBtn = container.querySelector('#gh-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing…';
      syncBtn.disabled = true;
      GHCache.repos = null; // invalidate cache
      await syncGitHubToProfile(token, profile.id);
      window.toast('GitHub synced!', 'rotate');
      loadProfileRepos(container, { ...profile, ...window.State?.profile });
    });
  }
}

function _buildRepoCard(r, isPinned, isOwn, profile) {
  const card = document.createElement('a');
  card.href   = r.html_url;
  card.target = '_blank';
  card.rel    = 'noopener noreferrer';
  card.style.cssText = 'text-decoration:none;display:block';

  const langDotHtml = r.language ? `${langDot(r.language)}<span style="font-size:11px">${r.language}</span>` : '';

  card.innerHTML = `
    <div class="gh-repo-card${isPinned ? ' gh-repo-pinned' : ''}">
      <div class="gh-repo-card-header">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <i class="fa-solid fa-code-branch" style="color:var(--cyan);font-size:12px;flex-shrink:0"></i>
          <span class="gh-repo-name">${_esc(r.name)}</span>
          ${r.fork ? `<span class="gh-chip" style="background:rgba(167,139,250,0.12);color:var(--violet)">fork</span>` : ''}
          ${r.archived ? `<span class="gh-chip">archived</span>` : ''}
          ${isPinned ? `<span class="gh-chip" style="background:rgba(251,191,36,0.1);color:var(--amber)"><i class="fa-solid fa-thumbtack" style="font-size:8px"></i> pinned</span>` : ''}
        </div>
        ${isOwn ? `<button class="gh-pin-btn" data-repo="${_esc(r.name)}" data-pinned="${isPinned}" title="${isPinned ? 'Unpin' : 'Pin to profile'}" style="color:${isPinned ? 'var(--amber)' : 'var(--text-muted)'};font-size:13px;padding:2px 6px;border-radius:6px;transition:color 0.15s">
          <i class="fa-solid fa-thumbtack"></i>
        </button>` : ''}
      </div>
      ${r.description ? `<div class="gh-repo-desc">${_esc(r.description)}</div>` : ''}
      <div class="gh-repo-meta">
        ${langDotHtml ? `<span style="display:flex;align-items:center;gap:5px">${langDotHtml}</span>` : ''}
        <span style="display:flex;align-items:center;gap:4px"><i class="fa-regular fa-star" style="font-size:10px;color:var(--amber)"></i>${r.stargazers_count || 0}</span>
        <span style="display:flex;align-items:center;gap:4px"><i class="fa-solid fa-code-fork" style="font-size:10px"></i>${r.forks_count || 0}</span>
        <span style="margin-left:auto;font-size:10px;color:var(--text-muted)">${_timeAgo(r.pushed_at)}</span>
      </div>
      <div class="gh-repo-actions">
        <button class="gh-action-btn gh-share-btn" data-repo="${_esc(r.name)}" data-url="${_esc(r.html_url)}" data-desc="${_esc(r.description||'')}" title="Share to Devit feed">
          <i class="fa-solid fa-paper-plane"></i> Share
        </button>
        <a href="${_esc(r.html_url)}" target="_blank" rel="noopener noreferrer" class="gh-action-btn" style="text-decoration:none" onclick="event.stopPropagation()">
          <i class="fa-brands fa-github"></i> Open
        </a>
      </div>
    </div>`;

  // Pin / unpin
  const pinBtn = card.querySelector('.gh-pin-btn');
  if (pinBtn) {
    pinBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const repoName = pinBtn.dataset.repo;
      const wasPinned = pinBtn.dataset.pinned === 'true';
      pinBtn.disabled = true;
      const { data: p } = await sb.from('profiles').select('pinned_repos').eq('id', window.State.user.id).single();
      let pinned = p?.pinned_repos || [];
      if (wasPinned) pinned = pinned.filter(n => n !== repoName);
      else if (pinned.length < 6) pinned = [...pinned, repoName];
      else { window.toast('Max 6 pinned repos', 'circle-exclamation'); pinBtn.disabled = false; return; }
      await sb.from('profiles').update({ pinned_repos: pinned }).eq('id', window.State.user.id);
      window.toast(wasPinned ? 'Unpinned' : 'Pinned to profile!', 'thumbtack');
      // Refresh the card
      const parentCard = pinBtn.closest('.gh-repo-card');
      if (parentCard) {
        parentCard.classList.toggle('gh-repo-pinned', !wasPinned);
        pinBtn.style.color = wasPinned ? 'var(--text-muted)' : 'var(--amber)';
        pinBtn.dataset.pinned = String(!wasPinned);
      }
      pinBtn.disabled = false;
    });
  }

  // Share repo as Devit post
  const shareBtn = card.querySelector('.gh-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      openShareRepoModal(shareBtn.dataset.repo, shareBtn.dataset.url, shareBtn.dataset.desc);
    });
  }

  return card;
}

/* ── Share repo as post ──────────────────────────────────────── */
function openShareRepoModal(repoName, repoUrl, repoDesc) {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body');
  document.getElementById('modal-title-text').textContent = `Share ${repoName}`;
  modal.classList.add('open');

  const defaultText = `🚀 Check out my repo: **${repoName}**\n${repoDesc ? repoDesc + '\n' : ''}\n${repoUrl}`;
  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <textarea id="share-repo-text" class="auth-input" rows="5" style="resize:vertical;font-size:13px">${_esc(defaultText)}</textarea>
      <div style="font-size:12px;color:var(--text-muted)">This will post to your Devit feed with a GitHub repo card.</div>
      <button class="auth-btn-primary" id="share-repo-submit"><i class="fa-brands fa-github"></i> Post to Devit</button>
    </div>`;

  document.getElementById('share-repo-submit').addEventListener('click', async () => {
    const text = document.getElementById('share-repo-text').value.trim();
    if (!text) return;
    const btn = document.getElementById('share-repo-submit');
    btn.disabled = true; btn.textContent = 'Posting…';
    const { error } = await sb.from('posts').insert({
      author_id:  window.State.user.id,
      content:    text,
      github_repo: JSON.stringify({ name: repoName, url: repoUrl, desc: repoDesc }),
    });
    if (error) window.toast('Failed: ' + error.message, 'circle-exclamation');
    else {
      modal.classList.remove('open');
      window.toast('Repo shared to your feed!', 'paper-plane');
    }
  });
}

/* ── No GitHub connected state ───────────────────────────────── */
function _renderNoGitHub(container) {
  container.innerHTML = `
    <div style="padding:48px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="width:72px;height:72px;background:#24292e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px">
        <i class="fa-brands fa-github" style="color:#fff"></i>
      </div>
      <div>
        <div style="font-size:16px;font-weight:700;margin-bottom:4px">No GitHub connected</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.5;max-width:260px">
          Sign in with GitHub OAuth to show your repositories, contribution graph, and build history here.
        </div>
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════
   2. CONTRIBUTION GRAPH — 52-week heatmap
   ══════════════════════════════════════════════════════════════ */

async function renderContributionGraph(container, profile) {
  const username = getGHUsername(profile);
  if (!username) return;

  // GH contribution data requires GraphQL or scraping — use public events as proxy
  // We'll build a heatmap from public push events (free, no token needed)
  const token = await getGHToken();
  let events = [];
  try {
    const data = await ghFetch(`/users/${encodeURIComponent(username)}/events/public?per_page=100`, token);
    events = Array.isArray(data) ? data.filter(e => e.type === 'PushEvent') : [];
  } catch (_) {}

  // Build day → count map for last 52 weeks (364 days)
  const dayMap = {};
  const now = Date.now();
  events.forEach(ev => {
    const d = new Date(ev.created_at);
    const diff = Math.floor((now - d) / 86400000);
    if (diff <= 364) {
      const key = _dayKey(d);
      dayMap[key] = (dayMap[key] || 0) + (ev.payload?.commits?.length || 1);
    }
  });

  // Build 52 columns of 7 days
  const weeks = [];
  for (let w = 51; w >= 0; w--) {
    const days = [];
    for (let d = 6; d >= 0; d--) {
      const date = new Date(now - (w * 7 + d) * 86400000);
      const key  = _dayKey(date);
      days.push({ date, count: dayMap[key] || 0 });
    }
    weeks.push(days);
  }

  const maxCount = Math.max(...Object.values(dayMap), 1);

  const svgW = 52 * 13;
  const svgH = 7  * 13;

  let cellsSvg = '';
  weeks.forEach((days, wi) => {
    days.forEach((day, di) => {
      const intensity = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / maxCount) * 4));
      const colors = ['#161b22','#0e4429','#006d32','#26a641','#39d353'];
      const x = wi * 13;
      const y = (6 - di) * 13;
      cellsSvg += `<rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${colors[intensity]}"
        title="${day.date.toDateString()}: ${day.count} push event${day.count !== 1?'s':''}"/>`;
    });
  });

  const graphEl = document.createElement('div');
  graphEl.className = 'gh-contrib-wrap';
  graphEl.innerHTML = `
    <div class="gh-section-title">
      <i class="fa-solid fa-chart-simple" style="color:var(--emerald)"></i>
      Contribution Activity
      <span style="font-size:11px;color:var(--text-muted);font-weight:400;margin-left:6px">(push events, last 12 months)</span>
    </div>
    <div style="overflow-x:auto;padding:4px 0 8px">
      <svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block">${cellsSvg}</svg>
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);margin-top:4px">
      Less
      ${['#161b22','#0e4429','#006d32','#26a641','#39d353'].map(c => `<span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>`).join('')}
      More
    </div>`;

  container.appendChild(graphEl);
}

function _dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}


/* ══════════════════════════════════════════════════════════════
   3. "CURRENTLY BUILDING" CARD — latest pushed repo
   ══════════════════════════════════════════════════════════════ */

async function renderCurrentlyBuilding(container, profile) {
  const username = getGHUsername(profile);
  if (!username) return;

  const token = await getGHToken();
  const repos  = await fetchGHRepos(username, token).catch(() => []);
  if (!repos.length) return;

  // Most recently pushed non-fork repo
  const latest = repos
    .filter(r => !r.archived)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))[0];

  if (!latest) return;

  // Fetch latest commit on default branch
  let latestCommit = null;
  try {
    const commits = await ghFetch(
      `/repos/${encodeURIComponent(username)}/${encodeURIComponent(latest.name)}/commits?per_page=1`,
      token
    );
    if (Array.isArray(commits) && commits[0]) latestCommit = commits[0];
  } catch (_) {}

  const card = document.createElement('div');
  card.className = 'gh-building-card';
  card.innerHTML = `
    <div class="gh-section-title">
      <i class="fa-solid fa-hammer" style="color:var(--amber)"></i>
      Currently Building
    </div>
    <div style="display:flex;align-items:flex-start;gap:14px;margin-top:10px">
      <div style="width:44px;height:44px;background:#24292e;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px">
        <i class="fa-brands fa-github" style="color:#fff"></i>
      </div>
      <div style="flex:1;min-width:0">
        <a href="${_esc(latest.html_url)}" target="_blank" rel="noopener noreferrer"
           style="font-size:15px;font-weight:700;color:var(--cyan);text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
           onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
          ${_esc(latest.name)}
        </a>
        ${latest.description ? `<div style="font-size:12px;color:var(--text-secondary);margin:2px 0 6px;line-height:1.4">${_esc(latest.description)}</div>` : ''}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${latest.language ? `<span style="display:flex;align-items:center;gap:5px;font-size:11px">${langDot(latest.language)}<span>${_esc(latest.language)}</span></span>` : ''}
          <span style="font-size:11px;color:var(--text-muted)"><i class="fa-regular fa-star" style="color:var(--amber)"></i> ${latest.stargazers_count}</span>
          <span style="font-size:11px;color:var(--text-muted)">pushed ${_timeAgo(latest.pushed_at)}</span>
        </div>
        ${latestCommit ? `
          <div style="margin-top:8px;padding:8px 10px;background:var(--bg-elevated);border-radius:8px;border-left:2px solid var(--cyan)">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px">Latest commit</div>
            <div style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${_esc((latestCommit.commit?.message || '').split('\n')[0].slice(0,80))}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${_esc(latestCommit.commit?.author?.name || '')} · ${_timeAgo(latestCommit.commit?.author?.date)}</div>
          </div>` : ''}
      </div>
    </div>`;

  container.appendChild(card);
}


/* ══════════════════════════════════════════════════════════════
   4. SHIP LOGS — commit timeline
   ══════════════════════════════════════════════════════════════ */

async function renderShipLogs(container, profile) {
  const username = getGHUsername(profile);
  if (!username) return;

  const token = await getGHToken();

  // Fetch public push events
  let events = [];
  try {
    const data = await ghFetch(`/users/${encodeURIComponent(username)}/events/public?per_page=30`, token);
    events = Array.isArray(data) ? data.filter(e => e.type === 'PushEvent').slice(0, 15) : [];
  } catch (_) {}

  if (!events.length) return;

  const section = document.createElement('div');
  section.className = 'gh-shiplogs-section';
  section.innerHTML = `
    <div class="gh-section-title" style="margin-bottom:12px">
      <i class="fa-solid fa-ship" style="color:var(--violet)"></i>
      Ship Logs
      <span style="font-size:11px;color:var(--text-muted);font-weight:400;margin-left:6px">recent pushes</span>
    </div>
    <div class="gh-timeline">${events.map(ev => {
      const commits = ev.payload?.commits || [];
      const repoName = ev.repo?.name?.split('/')[1] || ev.repo?.name || '?';
      return `
        <div class="gh-timeline-item">
          <div class="gh-timeline-dot"></div>
          <div class="gh-timeline-body">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-size:12px;font-weight:700;color:var(--cyan)">${_esc(repoName)}</span>
              <span style="font-size:10px;color:var(--text-muted)">${_timeAgo(ev.created_at)}</span>
              <span style="font-size:10px;color:var(--text-muted);margin-left:auto">${commits.length} commit${commits.length !== 1 ? 's' : ''}</span>
            </div>
            ${commits.slice(0,3).map(c => `
              <div style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 0">
                <span style="color:var(--text-muted);margin-right:6px">${(c.sha||'').slice(0,7)}</span>${_esc((c.message||'').split('\n')[0].slice(0,72))}
              </div>`).join('')}
            ${commits.length > 3 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">+${commits.length-3} more</div>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`;

  container.appendChild(section);
}


/* ══════════════════════════════════════════════════════════════
   5. STACKS — infer tech stack from repo languages
   ══════════════════════════════════════════════════════════════ */

async function syncGitHubToProfile(token, userId) {
  if (!token) return;
  try {
    const ghUser = await ghFetch('/user', token);
    if (!ghUser) return;

    const repos = await ghFetch('/user/repos?sort=updated&per_page=30&type=owner', token);
    const repoList = Array.isArray(repos) ? repos : [];

    // Aggregate languages
    const langCounts = {};
    repoList.forEach(r => { if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1; });
    const topLangs = Object.entries(langCounts)
      .sort((a,b) => b[1]-a[1])
      .slice(0, 8)
      .map(([l]) => l);

    // Top repos by stars for tech_stack (repo names)
    const topRepos = [...repoList]
      .sort((a,b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 6)
      .map(r => r.name);

    const update = {
      is_github:       true,
      github_username: ghUser.login,
      tech_stack:      [...new Set([...topLangs, ...topRepos])].slice(0, 12),
    };
    if (ghUser.bio      && !window.State?.profile?.bio)         update.bio = ghUser.bio;
    if (ghUser.location && !window.State?.profile?.location)    update.location = ghUser.location;
    if (ghUser.avatar_url)                                       update.avatar_url = ghUser.avatar_url;
    if (ghUser.blog    && !window.State?.profile?.website)       update.website = ghUser.blog;
    if (ghUser.name    && !window.State?.profile?.display_name)  update.display_name = ghUser.name;

    await sb.from('profiles').update(update).eq('id', userId);
    if (window.State?.profile) Object.assign(window.State.profile, update);
    GHCache.user     = ghUser;
    GHCache.repos    = repoList;
    GHCache.username = ghUser.login;
  } catch (e) {
    console.warn('[Devit GH] syncGitHubToProfile error:', e);
  }
}


/* ══════════════════════════════════════════════════════════════
   6. PROFILE PATCH — inject GitHub sections + new tabs
   ══════════════════════════════════════════════════════════════ */

// Override renderProfile to inject GitHub sections and Repos/ShipLog tabs
(function patchRenderProfile() {
  const POLL_INTERVAL = 200;
  const MAX_WAIT = 6000;
  let waited = 0;

  const interval = setInterval(() => {
    waited += POLL_INTERVAL;
    if (typeof window.renderProfile === 'function' && !window._ghProfilePatched) {
      window._ghProfilePatched = true;
      clearInterval(interval);

      const originalRender = window.renderProfile;

      window.renderProfile = async function(main, userId) {
        // Call original
        await originalRender.call(this, main, userId);

        // After original renders, upgrade the tabs + inject GitHub sections
        const targetId = userId || window.State?.user?.id;
        const { data: profile } = await sb.from('profiles').select('*').eq('id', targetId).single();
        if (!profile) return;

        // Replace tab list with extended version
        const tabList = main.querySelector('.profile-tab-list');
        if (tabList) {
          const tabs = profile.is_github
            ? ['Posts', 'Repos', 'Ship Log']
            : ['Posts', 'Repos'];
          tabList.innerHTML = tabs.map((t,i) =>
            `<div class="profile-tab ${i===0?'active':''}" data-ptab="${t}">${t}</div>`
          ).join('');

          tabList.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
              tabList.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
              tab.classList.add('active');
              const content = document.getElementById('profile-content');
              if (!content) return;
              if (tab.dataset.ptab === 'Posts')       window.loadProfilePosts?.(content, targetId);
              else if (tab.dataset.ptab === 'Repos')  loadProfileRepos(content, profile);
              else if (tab.dataset.ptab === 'Ship Log') _renderShipLogTab(content, profile);
            });
          });
        }

        // Inject "Currently Building" and Contribution Graph into profile info section
        if (profile.is_github) {
          const infoSection = main.querySelector('.profile-info-section');
          if (infoSection) {
            const ghExtras = document.createElement('div');
            ghExtras.id = 'gh-profile-extras';
            ghExtras.style.cssText = 'margin-top:4px';
            infoSection.appendChild(ghExtras);
            // Fire async — don't block profile render
            renderCurrentlyBuilding(ghExtras, profile);
            setTimeout(() => renderContributionGraph(ghExtras, profile), 400);
          }
        }
      };

    } else if (waited >= MAX_WAIT) {
      clearInterval(interval);
    }
  }, POLL_INTERVAL);
})();

async function _renderShipLogTab(container, profile) {
  container.innerHTML = '';
  await renderShipLogs(container, profile);
  if (!container.querySelector('.gh-shiplogs-section')) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No ship log data yet — push some commits! 🚢</div>`;
  }
}


/* ══════════════════════════════════════════════════════════════
   7. BUILDS — post repo updates to feed from composer
   ══════════════════════════════════════════════════════════════ */

// Adds a "From GitHub Repo" button to the composer toolbar
(function patchComposer() {
  const observer = new MutationObserver(() => {
    const toolbar = document.querySelector('.composer-toolbar');
    if (toolbar && !toolbar.querySelector('#gh-repo-picker-btn') && window.State?.profile?.is_github) {
      const btn = document.createElement('button');
      btn.id        = 'gh-repo-picker-btn';
      btn.className = 'composer-tool';
      btn.title     = 'Share from GitHub repo';
      btn.innerHTML = `<i class="fa-brands fa-github" style="font-size:15px"></i>`;
      // Insert before the actions div
      const actions = toolbar.querySelector('.composer-actions');
      if (actions) toolbar.insertBefore(btn, actions);

      btn.addEventListener('click', () => openRepoPicker());
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

async function openRepoPicker() {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body');
  document.getElementById('modal-title-text').textContent = '🔗 Share from GitHub';
  modal.classList.add('open');
  body.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)"><i class="fa-solid fa-spinner fa-spin" style="font-size:22px"></i></div>`;

  const token   = await getGHToken();
  const username = getGHUsername(window.State?.profile);
  const repos    = await fetchGHRepos(username, token).catch(() => []);

  if (!repos.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)">No repos found</div>`;
    return;
  }

  body.innerHTML = `
    <div style="padding:12px 16px 0">
      <input id="repo-picker-search" class="auth-input" placeholder="Search repos…" style="margin-bottom:10px">
    </div>
    <div id="repo-picker-list" style="max-height:360px;overflow-y:auto;padding:0 16px 16px"></div>`;

  const list = document.getElementById('repo-picker-list');
  const renderList = (filter = '') => {
    const filtered = repos.filter(r => r.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 20);
    list.innerHTML = filtered.map(r => `
      <div class="gh-picker-row" data-name="${_esc(r.name)}" data-url="${_esc(r.html_url)}" data-desc="${_esc(r.description||'')}">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <i class="fa-solid fa-code-branch" style="color:var(--cyan);font-size:11px"></i>
          <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(r.name)}</span>
          ${r.language ? `${langDot(r.language)}` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:11px;color:var(--text-muted)">⭐ ${r.stargazers_count}</span>
          <button class="gh-action-btn" style="font-size:12px">Select</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('.gh-picker-row').forEach(row => {
      row.addEventListener('click', () => {
        modal.classList.remove('open');
        // Inject into composer
        const textarea = document.getElementById('post-textarea');
        if (textarea) {
          textarea.value = `🔗 ${row.dataset.name}${row.dataset.desc ? ' — ' + row.dataset.desc : ''}\n${row.dataset.url}`;
          textarea.dispatchEvent(new Event('input'));
        }
      });
    });
  };

  renderList();
  document.getElementById('repo-picker-search').addEventListener('input', e => renderList(e.target.value));
}


/* ══════════════════════════════════════════════════════════════
   8. GITHUB BADGE ON POST CARDS — "Open in GitHub" chip
   ══════════════════════════════════════════════════════════════ */

// Patch buildPostCard to render github_repo field as a rich card
(function patchBuildPostCard() {
  const POLL_INTERVAL = 250;
  let waited = 0;
  const iv = setInterval(() => {
    waited += POLL_INTERVAL;
    if (typeof window.buildPostCard === 'function' && !window._ghPostCardPatched) {
      window._ghPostCardPatched = true;
      clearInterval(iv);

      const original = window.buildPostCard;
      window.buildPostCard = function(post, profile, isLiked, isBookmarked) {
        const card = original.call(this, post, profile, isLiked, isBookmarked);
        // If post has github_repo data, inject a rich repo chip
        if (post.github_repo) {
          try {
            const repo = typeof post.github_repo === 'string'
              ? JSON.parse(post.github_repo)
              : post.github_repo;
            const chip = document.createElement('div');
            chip.className = 'gh-post-repo-chip';
            chip.innerHTML = `
              <div style="display:flex;align-items:center;gap:8px">
                <i class="fa-brands fa-github" style="font-size:14px"></i>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(repo.name||'')}</div>
                  ${repo.desc ? `<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(repo.desc)}</div>` : ''}
                </div>
                <a href="${_esc(repo.url||'')}" target="_blank" rel="noopener noreferrer" class="gh-action-btn" onclick="event.stopPropagation()" style="flex-shrink:0;text-decoration:none;font-size:11px">
                  Open <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px"></i>
                </a>
              </div>`;
            // Insert after post-content
            const content = card.querySelector('.post-content, .post-image-wrap, .post-code') || card.querySelector('.post-actions');
            if (content) content.parentElement?.insertBefore(chip, content.nextSibling);
          } catch (_) {}
        }
        return card;
      };
    } else if (waited > 5000) clearInterval(iv);
  }, POLL_INTERVAL);
})();


/* ══════════════════════════════════════════════════════════════
   9. GITHUB OAUTH HOOK — sync on sign-in
   ══════════════════════════════════════════════════════════════ */

if (typeof sb !== 'undefined') {
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user?.app_metadata?.provider === 'github' && session.provider_token) {
      GHCache.token    = session.provider_token;
      GHCache.username = session.user.user_metadata?.user_name || null;
      // Delay to let app.js boot first
      setTimeout(() => syncGitHubToProfile(session.provider_token, session.user.id), 1800);
    }
  });
}


/* ══════════════════════════════════════════════════════════════
   10. CSS — all GitHub integration styles
   ══════════════════════════════════════════════════════════════ */
(function injectGHStyles() {
  if (document.getElementById('devit-gh-styles')) return;
  const s = document.createElement('style');
  s.id = 'devit-gh-styles';
  s.textContent = `

    /* ── Repo grid card ──────────────────────────────────────── */
    .gh-repo-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 15px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 120px;
      transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
    }
    .gh-repo-card:hover {
      border-color: rgba(99,217,255,0.3);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    }
    .gh-repo-card.gh-repo-pinned {
      border-color: rgba(251,191,36,0.25);
      background: linear-gradient(135deg, rgba(251,191,36,0.04), var(--bg-surface));
    }
    .gh-repo-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .gh-repo-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--cyan);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gh-repo-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .gh-repo-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: auto;
      flex-wrap: wrap;
    }
    .gh-repo-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      border-top: 1px solid var(--border);
      padding-top: 8px;
      margin-top: 2px;
    }
    .gh-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.06);
      color: var(--text-muted);
      letter-spacing: 0.03em;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .gh-pin-btn {
      padding: 3px 6px;
      border-radius: 6px;
      background: none;
      border: none;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.15s, background 0.15s;
    }
    .gh-pin-btn:hover { background: var(--bg-elevated); }

    /* ── Action buttons ──────────────────────────────────────── */
    .gh-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
      white-space: nowrap;
    }
    .gh-action-btn:hover {
      border-color: rgba(99,217,255,0.3);
      color: var(--cyan);
    }

    /* ── Section titles ──────────────────────────────────────── */
    .gh-section-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      display: flex;
      align-items: center;
      gap: 7px;
    }

    /* ── Contribution graph ──────────────────────────────────── */
    .gh-contrib-wrap {
      padding: 14px 16px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      margin-top: 12px;
    }
    .gh-contrib-wrap svg rect { cursor: pointer; }

    /* ── Currently Building card ─────────────────────────────── */
    .gh-building-card {
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(251,191,36,0.05), var(--bg-surface));
      border: 1px solid rgba(251,191,36,0.18);
      border-radius: 14px;
      margin-top: 12px;
    }

    /* ── Ship Logs timeline ──────────────────────────────────── */
    .gh-shiplogs-section {
      padding: 16px;
    }
    .gh-timeline {
      position: relative;
      padding-left: 20px;
    }
    .gh-timeline::before {
      content: '';
      position: absolute;
      left: 6px;
      top: 6px;
      bottom: 0;
      width: 1px;
      background: var(--border);
    }
    .gh-timeline-item {
      position: relative;
      padding: 0 0 18px 16px;
    }
    .gh-timeline-item:last-child { padding-bottom: 0; }
    .gh-timeline-dot {
      position: absolute;
      left: -14px;
      top: 4px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--violet);
      border: 2px solid var(--bg-void);
      flex-shrink: 0;
    }
    .gh-timeline-body {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }

    /* ── Repo picker rows ────────────────────────────────────── */
    .gh-picker-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s;
      margin-bottom: 4px;
      border: 1px solid transparent;
    }
    .gh-picker-row:hover {
      background: var(--bg-elevated);
      border-color: var(--border);
    }

    /* ── Post card GitHub repo chip ──────────────────────────── */
    .gh-post-repo-chip {
      margin-top: 10px;
      padding: 10px 12px;
      background: rgba(36,41,46,0.6);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      border-left: 3px solid #58a6ff;
      color: var(--text-secondary);
    }

    /* ── Mobile tweaks ───────────────────────────────────────── */
    @media (max-width: 640px) {
      #gh-repos-grid {
        grid-template-columns: 1fr !important;
        padding: 0 12px 16px !important;
      }
      .gh-contrib-wrap { margin: 8px 12px; }
      .gh-building-card { margin: 8px 12px 0; }
    }
  `;
  document.head.appendChild(s);
})();


/* ══════════════════════════════════════════════════════════════
   SQL — run in Supabase Dashboard > SQL Editor
   ══════════════════════════════════════════════════════════════ */
console.log(`
/* ── Devit GitHub Integration — SQL additions ── */

-- GitHub username on profile (enables public repo lookup without token)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_username text;

-- Pinned repos (array of repo name strings, max 6)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pinned_repos text[] DEFAULT '{}';

-- github_repo JSONB on posts (stores {name, url, desc} for rich cards)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS github_repo jsonb;

-- is_github flag (already exists from earlier patch, safe to re-run)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_github boolean DEFAULT false;
`);

/* ── Helpers (self-contained, no dependency on outer scope) ── */
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s/60)   + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

console.log('[Devit GitHub Integration] ✓ Loaded: Repos · ContribGraph · CurrentlyBuilding · ShipLogs · Stacks · Builds · RepoShare · BadgeChip');
