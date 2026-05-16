/* ============================================================
   DEVIT — Feature Patch
   Drop this BEFORE </body> in index.html, AFTER app.js loads.

   Adds:
   1. GitHub repo cards on posts (paste a GitHub URL → rich card)
   2. Prism.js syntax highlighting for code blocks
   3. Clickable hashtag filtering in the feed
   4. Unified search (posts + tags + people)
   5. Collab Board view — "looking for collaborators" with apply flow

   Usage:
     <script src="app.js"></script>
     <script src="devit-features.patch.js"></script>
   ============================================================ */

'use strict';

/* ════════════════════════════════════════════════════════════
   0. WAIT FOR APP BOOT
   ════════════════════════════════════════════════════════════ */
(function patchDevit() {

  // ── Prism.js CDN load (syntax highlighting) ───────────────
  function loadPrism(cb) {
    if (window.Prism) { cb(); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
    document.head.appendChild(css);

    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
    js.onload = () => {
      // load common language components
      const langs = ['javascript','typescript','python','rust','go','bash','css','markup','json','sql'];
      let loaded = 0;
      langs.forEach(lang => {
        const s = document.createElement('script');
        s.src = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js`;
        s.onload = () => { if (++loaded === langs.length) cb(); };
        s.onerror = () => { if (++loaded === langs.length) cb(); };
        document.head.appendChild(s);
      });
    };
    document.head.appendChild(js);
  }

  // ── GitHub repo card cache ────────────────────────────────
  const repoCache = new Map();

  async function fetchRepoCard(owner, repo) {
    const key = `${owner}/${repo}`;
    if (repoCache.has(key)) return repoCache.get(key);
    try {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!r.ok) { repoCache.set(key, null); return null; }
      const d = await r.json();
      const card = {
        fullName:    d.full_name,
        description: d.description || '',
        stars:       d.stargazers_count || 0,
        forks:       d.forks_count || 0,
        language:    d.language || '',
        url:         d.html_url,
        owner:       d.owner?.login || owner,
        avatarUrl:   d.owner?.avatar_url || '',
        topics:      (d.topics || []).slice(0, 5),
        isPrivate:   d.private,
      };
      repoCache.set(key, card);
      return card;
    } catch { repoCache.set(key, null); return null; }
  }

  const LANG_COLORS = {
    JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572A5',
    Rust: '#dea584', Go: '#00ADD8', 'C++': '#f34b7d', C: '#555555',
    Java: '#b07219', Ruby: '#701516', Swift: '#F05138',
    Kotlin: '#A97BFF', PHP: '#4F5D95', CSS: '#563d7c',
    HTML: '#e34c26', Shell: '#89e051', Dart: '#00B4AB',
    default: '#8b92b8',
  };

  function buildRepoCardHtml(card) {
    const langColor = LANG_COLORS[card.language] || LANG_COLORS.default;
    const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
    const topicHtml = card.topics.map(t =>
      `<span style="padding:2px 8px;border-radius:99px;background:rgba(99,217,255,0.1);border:1px solid rgba(99,217,255,0.2);font-size:11px;color:var(--cyan)">${t}</span>`
    ).join('');

    return `
      <a href="${card.url}" target="_blank" rel="noopener noreferrer"
         class="devit-repo-card"
         style="display:block;text-decoration:none;margin-top:10px;border:1px solid var(--border);
                border-radius:14px;overflow:hidden;background:var(--bg-elevated);
                transition:border-color 0.18s,transform 0.18s;cursor:pointer"
         onmouseover="this.style.borderColor='var(--border-active)';this.style.transform='translateY(-1px)'"
         onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
        <div style="padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <img src="${card.avatarUrl}" style="width:20px;height:20px;border-radius:50%;flex-shrink:0" onerror="this.style.display='none'">
            <span style="font-size:13px;font-weight:700;color:var(--cyan)">${card.fullName}</span>
            ${card.isPrivate ? '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg-float);color:var(--text-muted);border:1px solid var(--border)">private</span>' : ''}
          </div>
          ${card.description ? `<p style="font-size:12px;color:var(--text-secondary);margin:0 0 10px;line-height:1.5;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden">${card.description}</p>` : ''}
          ${card.topics.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">${topicHtml}</div>` : ''}
          <div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);align-items:center">
            ${card.language ? `<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:50%;background:${langColor};display:inline-block"></span>${card.language}</span>` : ''}
            <span><i class="fa-regular fa-star" style="color:var(--amber);margin-right:3px"></i>${fmt(card.stars)}</span>
            <span><i class="fa-solid fa-code-fork" style="color:var(--text-muted);margin-right:3px"></i>${fmt(card.forks)}</span>
          </div>
        </div>
      </a>`;
  }

  // Extract GitHub repo URL from text
  function extractGitHubRepo(text) {
    const m = text.match(/https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
  }

  /* ════════════════════════════════════════════════════════════
     1. PATCH buildPostCard — repo cards + prism highlighting
     ════════════════════════════════════════════════════════════ */
  function patchBuildPostCard() {
    // We patch the post card DOM after insertion by hooking loadPosts
    // and the realtime subscription via a MutationObserver on #feed
    const feedObserver = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (!node.classList?.contains('post-card')) return;
          upgradePostCard(node);
        });
      });
    });

    // Observe #feed and modal body (thread view)
    function observeFeed() {
      const feed = document.getElementById('feed');
      if (feed) feedObserver.observe(feed, { childList: true });
    }

    // Watch for #feed to appear (navigateTo clears main each time)
    const mainObserver = new MutationObserver(() => observeFeed());
    const main = document.getElementById('main');
    if (main) mainObserver.observe(main, { childList: true, subtree: false });
    observeFeed();
  }

  async function upgradePostCard(card) {
    // ── 1a. Syntax-highlight code blocks ─────────────────────
    const pre = card.querySelector('pre.post-code');
    if (pre && window.Prism) {
      const langEl = pre.querySelector('.post-code-lang');
      const rawLang = langEl?.textContent?.trim() || '';
      const langKey = rawLang.toLowerCase().replace(/[^a-z0-9]/g, '');
      const codeText = pre.textContent.replace(rawLang, '').trim();

      // Pick best Prism grammar
      const grammarMap = {
        js: 'javascript', ts: 'typescript', py: 'python',
        sh: 'bash', shell: 'bash', rs: 'rust', html: 'markup',
      };
      const grammar = grammarMap[langKey] || langKey;

      pre.innerHTML = '';
      const code = document.createElement('code');
      code.className = `language-${grammar || 'none'}`;
      code.textContent = codeText;
      pre.appendChild(code);

      // Override prism-tomorrow bg to match devit surface
      pre.style.background = 'var(--bg-elevated)';
      pre.style.borderRadius = '10px';
      pre.style.padding = '14px';
      pre.style.overflowX = 'auto';
      pre.style.fontSize = '12.5px';
      pre.style.lineHeight = '1.6';
      pre.style.border = '1px solid var(--border)';
      pre.style.marginTop = '10px';

      if (rawLang) {
        const badge = document.createElement('span');
        badge.className = 'post-code-lang';
        badge.textContent = rawLang;
        badge.style.cssText = 'position:absolute;top:8px;right:10px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;pointer-events:none';
        pre.style.position = 'relative';
        pre.appendChild(badge);
      }

      window.Prism.highlightElement(code);
    }

    // ── 1b. GitHub repo card ──────────────────────────────────
    const contentEl = card.querySelector('.post-content');
    if (!contentEl) return;
    const rawText = contentEl.innerText || contentEl.textContent || '';
    const ghRepo = extractGitHubRepo(rawText);
    if (!ghRepo) return;

    // Don't add twice
    if (card.querySelector('.devit-repo-card')) return;

    const repoData = await fetchRepoCard(ghRepo.owner, ghRepo.repo);
    if (!repoData) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildRepoCardHtml(repoData);
    const actionsEl = card.querySelector('.post-actions');
    if (actionsEl) {
      card.insertBefore(wrapper.firstElementChild, actionsEl);
    } else {
      card.appendChild(wrapper.firstElementChild);
    }
  }

  /* ════════════════════════════════════════════════════════════
     2. HASHTAG FILTERING — clicking #tag filters the feed
     ════════════════════════════════════════════════════════════ */
  // State for active tag filter
  window.__devitActiveTag = null;

  document.addEventListener('click', e => {
    const span = e.target.closest('.hashtag');
    if (!span) return;
    e.stopPropagation();
    const tag = span.textContent.replace(/^#/, '').trim();
    if (!tag) return;

    // Navigate to feed and apply filter
    if (typeof navigateTo === 'function') {
      window.__devitActiveTag = tag;
      navigateTo('feed');
    }
  });

  // Patch loadPosts to intercept tag filters
  function patchLoadPosts() {
    // We hook into the feed render via a MutationObserver watching #feed innerHTML changes
    // When __devitActiveTag is set, we filter rendered cards after load
    const observer = new MutationObserver(() => {
      if (!window.__devitActiveTag) return;
      const feed = document.getElementById('feed');
      if (!feed) return;

      const tag = window.__devitActiveTag;
      const tagLower = tag.toLowerCase();

      // Show tag filter banner
      let banner = document.getElementById('devit-tag-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'devit-tag-banner';
        banner.style.cssText = `
          display:flex;align-items:center;gap:10px;
          padding:10px 16px;
          background:var(--cyan-dim);
          border-bottom:1px solid var(--border-active);
          font-size:13px;font-weight:600;color:var(--cyan);
          position:sticky;top:0;z-index:10;
        `;
        banner.innerHTML = `
          <i class="fa-solid fa-hashtag"></i>
          <span>Filtering: #<strong id="devit-active-tag-label"></strong></span>
          <button id="devit-clear-tag" style="margin-left:auto;padding:4px 12px;border-radius:99px;background:var(--bg-float);border:1px solid var(--border);color:var(--text-primary);font-size:12px;font-weight:700;cursor:pointer">
            Clear filter ×
          </button>`;
        const tabs = document.querySelector('.view-tabs');
        if (tabs) tabs.after(banner);
        else {
          const main = document.getElementById('main');
          if (main) main.insertAdjacentElement('afterbegin', banner);
        }
        document.getElementById('devit-clear-tag').addEventListener('click', () => {
          window.__devitActiveTag = null;
          banner.remove();
          // Re-render feed without filter
          const feedEl = document.getElementById('feed');
          if (feedEl && typeof loadPosts === 'function') loadPosts(feedEl);
        });
      }
      document.getElementById('devit-active-tag-label').textContent = tag;

      // Hide cards that don't contain the tag
      const cards = feed.querySelectorAll('.post-card');
      cards.forEach(card => {
        const text = (card.querySelector('.post-content')?.textContent || '').toLowerCase();
        card.style.display = text.includes('#' + tagLower) ? '' : 'none';
      });

      // Show empty state if nothing matches
      const visible = [...cards].filter(c => c.style.display !== 'none');
      let emptyEl = document.getElementById('devit-tag-empty');
      if (!visible.length) {
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.id = 'devit-tag-empty';
          emptyEl.style.cssText = 'padding:48px;text-align:center;color:var(--text-muted);font-size:14px';
          emptyEl.innerHTML = `No posts tagged <strong style="color:var(--cyan)">#${tag}</strong> yet. Be the first!`;
          feed.appendChild(emptyEl);
        }
      } else {
        emptyEl?.remove();
      }
    });

    function hookFeedObserver() {
      const feed = document.getElementById('feed');
      if (feed) observer.observe(feed, { childList: true });
    }
    const mainObs = new MutationObserver(hookFeedObserver);
    const main = document.getElementById('main');
    if (main) mainObs.observe(main, { childList: true });
    hookFeedObserver();
  }

  /* ════════════════════════════════════════════════════════════
     3. UNIFIED SEARCH — posts + people + tags
     ════════════════════════════════════════════════════════════ */
  function patchSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;

    // Debounce already wired in app.js — we override runSearch
    window.__origRunSearch = window.runSearch;

    window.runSearch = async function patchedRunSearch(query) {
      const existingOverlay = document.getElementById('search-overlay');
      if (existingOverlay) existingOverlay.remove();

      const overlay = document.createElement('div');
      overlay.id = 'search-overlay';
      overlay.style.cssText = `
        position:fixed;top:56px;left:50%;transform:translateX(-50%);
        width:580px;max-width:92vw;
        background:var(--bg-surface);border:1px solid var(--border);
        border-radius:var(--radius-lg);z-index:900;
        box-shadow:0 24px 64px rgba(0,0,0,0.65);overflow:hidden;
        max-height:72vh;display:flex;flex-direction:column;
      `;
      overlay.innerHTML = `
        <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-shrink:0">
          <button class="srch-tab active" data-t="all"   style="${tabStyle(true)}">All</button>
          <button class="srch-tab"        data-t="posts" style="${tabStyle(false)}">Posts</button>
          <button class="srch-tab"        data-t="people" style="${tabStyle(false)}">People</button>
          <button class="srch-tab"        data-t="tags"  style="${tabStyle(false)}">Tags</button>
          <span style="margin-left:auto;font-size:11px;color:var(--text-muted);align-self:center">Searching…</span>
        </div>
        <div id="srch-results" style="overflow-y:auto;flex:1"></div>
      `;
      document.body.appendChild(overlay);

      function tabStyle(active) {
        return `padding:5px 12px;border-radius:8px;font-size:12px;font-weight:700;border:none;cursor:pointer;
                background:${active ? 'var(--cyan-dim)' : 'transparent'};
                color:${active ? 'var(--cyan)' : 'var(--text-muted)'};transition:all 0.15s`;
      }

      let activeTab = 'all';
      overlay.querySelectorAll('.srch-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelectorAll('.srch-tab').forEach(b => {
            b.style.background = 'transparent'; b.style.color = 'var(--text-muted)';
          });
          btn.style.background = 'var(--cyan-dim)'; btn.style.color = 'var(--cyan)';
          activeTab = btn.dataset.t;
          renderResults(allResults, activeTab);
        });
      });

      const closeOnClick = e => {
        if (!overlay.contains(e.target) && e.target !== input) {
          overlay.remove(); document.removeEventListener('click', closeOnClick);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnClick), 100);

      // Fetch everything in parallel
      const q = query.trim();
      const tsQ = q.split(/\s+/).filter(Boolean).join(' & ');

      const [profilesRes, ilikePosts, ftsPosts] = await Promise.all([
        window.sb.from('profiles')
          .select('id,username,display_name,avatar_url,bio,followers_count')
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,bio.ilike.%${q}%`)
          .limit(8),
        window.sb.from('posts')
          .select('id,content,created_at,likes_count,author_id,profiles!posts_author_id_fkey(username,display_name,avatar_url)')
          .ilike('content', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(10),
        window.sb.rpc('search_posts_fts', { query_text: tsQ, max_results: 10 }).catch(() => ({ data: null })),
      ]);

      const posts = (ftsPosts?.data && !ftsPosts.error) ? ftsPosts.data : (ilikePosts?.data || []);
      const people = profilesRes?.data || [];

      // Extract tag counts from all matching posts
      const tagMap = new Map();
      posts.forEach(p => {
        const matches = (p.content || '').match(/#\w+/g) || [];
        matches.forEach(t => {
          const tl = t.toLowerCase();
          if (tl.includes(q.toLowerCase())) tagMap.set(tl, (tagMap.get(tl) || 0) + 1);
        });
      });
      const tags = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

      const allResults = { people, posts, tags };

      // Update status
      const statusEl = overlay.querySelector('span');
      if (statusEl) {
        const total = people.length + posts.length + tags.length;
        statusEl.textContent = total ? `${total} result${total === 1 ? '' : 's'}` : 'No results';
      }

      renderResults(allResults, activeTab);

      function renderResults({ people, posts, tags }, tab) {
        const container = document.getElementById('srch-results');
        if (!container) return;
        let html = '';

        const showPeople = tab === 'all' || tab === 'people';
        const showPosts  = tab === 'all' || tab === 'posts';
        const showTags   = tab === 'all' || tab === 'tags';

        if (showTags && tags.length) {
          html += `<div class="srch-section-label">Tags</div>`;
          html += `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 12px">`;
          tags.forEach(([tag, count]) => {
            html += `<button class="srch-tag-chip" data-tag="${tag.replace('#','')}"
              style="padding:6px 14px;border-radius:99px;background:var(--cyan-dim);border:1px solid var(--border-active);
                     color:var(--cyan);font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s">
              ${tag} <span style="font-size:11px;opacity:0.7">${count}</span>
            </button>`;
          });
          html += `</div>`;
        }

        if (showPeople && people.length) {
          html += `<div class="srch-section-label">People</div>`;
          people.forEach(p => {
            const name = escHtml(p.display_name || p.username);
            const handle = escHtml(p.username);
            html += `<div class="srch-person-item" data-uid="${p.id}"
              style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;transition:background 0.12s">
              ${avatarHtmlInner(p, 36)}
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${name}</div>
                <div style="font-size:12px;color:var(--text-muted)">@${handle} · ${fmtNum(p.followers_count||0)} followers</div>
                ${p.bio ? `<div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.bio)}</div>` : ''}
              </div>
            </div>`;
          });
        }

        if (showPosts && posts.length) {
          html += `<div class="srch-section-label" style="border-top:1px solid var(--border);margin-top:4px">Posts</div>`;
          posts.forEach(p => {
            const handle = escHtml(p.profiles?.username || '?');
            const preview = highlight(escHtml(p.content.slice(0, 120) + (p.content.length > 120 ? '…' : '')), q);
            html += `<div class="srch-post-item" data-pid="${p.id}"
              style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.12s">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:3px">
                @${handle} · ${likes(p.likes_count)}
              </div>
              <div style="font-size:13px;line-height:1.5;color:var(--text-primary)">${preview}</div>
            </div>`;
          });
        }

        if (!html) {
          html = `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:14px">
            No results for <strong>"${escHtml(q)}"</strong>
          </div>`;
        }

        container.innerHTML = `<style>
          .srch-section-label { padding:6px 16px 3px;font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em }
          .srch-person-item:hover { background:var(--bg-elevated) }
          .srch-post-item:hover   { background:var(--bg-elevated) }
          .srch-tag-chip:hover    { background:var(--cyan);color:var(--bg-void) }
          .srch-highlight         { background:rgba(99,217,255,0.2);border-radius:3px;color:var(--cyan);font-weight:700 }
        </style>` + html;

        // Wire tag chips
        container.querySelectorAll('.srch-tag-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            overlay.remove();
            window.__devitActiveTag = chip.dataset.tag;
            if (typeof navigateTo === 'function') navigateTo('feed');
          });
        });
        // Wire people
        container.querySelectorAll('.srch-person-item').forEach(item => {
          item.addEventListener('click', () => {
            overlay.remove();
            if (typeof renderProfile === 'function') renderProfile(document.getElementById('main'), item.dataset.uid);
          });
        });
        // Wire posts
        container.querySelectorAll('.srch-post-item').forEach(item => {
          item.addEventListener('click', () => {
            overlay.remove();
            if (typeof navigateTo === 'function') navigateTo('feed');
            toast('Scrolling to post…', 'magnifying-glass');
          });
        });
      }
    };

    // Helpers
    function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function fmtNum(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }
    function likes(n) { return n ? `<i class="fa-solid fa-heart" style="color:var(--rose);font-size:11px"></i> ${fmtNum(n)}` : '0 likes'; }
    function highlight(text, q) {
      if (!q) return text;
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
      return text.replace(re, '<mark class="srch-highlight">$1</mark>');
    }
    function avatarHtmlInner(p, size) {
      const name = p.display_name || p.username || 'U';
      const colors = ['#63d9ff','#a78bfa','#34d399','#fb7185','#fbbf24','#f97316','#38bdf8','#f472b6'];
      let h = 0;
      for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
      const color = colors[Math.abs(h) % colors.length];
      const initials = name.trim().split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
      if (p.avatar_url) {
        return `<img src="${p.avatar_url}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`;
      }
      return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${size*0.38}px;font-weight:700;color:#000;flex-shrink:0">${initials}</div>`;
    }
  }

  /* ════════════════════════════════════════════════════════════
     4. COLLAB BOARD VIEW
     ════════════════════════════════════════════════════════════ */

  // Add "Collab" to sidebar and bottom nav after app boots
  function injectCollabNav() {
    // Sidebar link
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.querySelector('[data-nav="collab"]')) {
      const link = document.createElement('div');
      link.className = 'sidebar-link';
      link.dataset.nav = 'collab';
      link.innerHTML = `<i class="fa-solid fa-handshake"></i><span class="sidebar-label">Collab</span>`;
      link.addEventListener('click', () => { if (typeof navigateTo === 'function') navigateTo('collab'); });
      // Insert before Settings
      const settingsLink = sidebar.querySelector('[data-nav="settings"]');
      if (settingsLink) sidebar.insertBefore(link, settingsLink);
      else sidebar.appendChild(link);
    }

    // Bottom nav — replace one of the less-used slots or append
    const bnav = document.getElementById('bottom-nav-inner');
    if (bnav && !bnav.querySelector('[data-nav="collab"]')) {
      const btn = document.createElement('button');
      btn.className = 'bnav-btn';
      btn.dataset.nav = 'collab';
      btn.setAttribute('aria-label', 'Collab Board');
      btn.innerHTML = `<i class="fa-solid fa-handshake"></i><span class="bnav-label">Collab</span>`;
      btn.addEventListener('click', () => { if (typeof navigateTo === 'function') navigateTo('collab'); });
      bnav.appendChild(btn);
    }
  }

  // Register the renderer in navigateTo by monkey-patching
  function patchNavigateTo() {
    const origNavigateTo = window.navigateTo;
    window.navigateTo = function(view) {
      // Update sidebar active state for collab
      injectCollabNav(); // ensure nav items exist
      origNavigateTo(view);
      if (view === 'collab') {
        // The original will call renderers[view] which won't exist,
        // so we render manually right after
        setTimeout(() => {
          if (document.getElementById('collab-view-root')) return; // already rendered
          renderCollabBoard(document.getElementById('main'));
        }, 0);
      }
    };

    // Also directly intercept by extending the renderers map — safest approach
    // since navigateTo calls (renderers[view] || renderFeed)(main)
    // We add it to the renderers object before navigateTo is set up
    // by hooking the auth flow
  }

  async function renderCollabBoard(main) {
    if (!main) return;
    main.innerHTML = '';
    main.id = 'collab-view-root'; // sentinel

    const techOptions = ['React','Next.js','Vue','Svelte','TypeScript','Node.js',
      'Python','Rust','Go','PostgreSQL','Supabase','Firebase','Docker','AWS','GraphQL',
      'Three.js','ML/AI','Blockchain','Mobile','Game Dev'];

    main.innerHTML = `
      <div style="max-width:760px;margin:0 auto;padding:16px">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:0 4px">
          <div>
            <h1 style="font-family:var(--font-display);font-size:22px;font-weight:900;background:linear-gradient(90deg,var(--cyan),var(--violet));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
              Collab Board
            </h1>
            <p style="font-size:13px;color:var(--text-muted);margin-top:2px">Find teammates. Ship together.</p>
          </div>
          <button id="collab-post-btn"
            style="padding:9px 18px;border-radius:10px;background:linear-gradient(135deg,var(--cyan),var(--violet));
                   color:var(--bg-void);font-weight:800;font-size:13px;border:none;cursor:pointer;
                   display:flex;align-items:center;gap:7px;transition:transform 0.18s,box-shadow 0.18s;white-space:nowrap"
            onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 8px 24px rgba(99,217,255,0.3)'"
            onmouseout="this.style.transform='';this.style.boxShadow=''">
            <i class="fa-solid fa-plus"></i> Post Project
          </button>
        </div>

        <!-- Tech filter bar -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
          <button class="collab-filter active" data-filter="all"
            style="${filterBtnStyle(true)}">All</button>
          ${techOptions.slice(0,10).map(t =>
            `<button class="collab-filter" data-filter="${t}" style="${filterBtnStyle(false)}">${t}</button>`
          ).join('')}
        </div>

        <!-- Posts list -->
        <div id="collab-list">
          <div style="padding:40px;text-align:center;color:var(--text-muted)">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:20px;margin-bottom:10px;display:block"></i>
            Loading collab posts…
          </div>
        </div>
      </div>
    `;

    function filterBtnStyle(active) {
      return `padding:5px 13px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;
              border:1px solid ${active ? 'var(--border-active)' : 'var(--border)'};
              background:${active ? 'var(--cyan-dim)' : 'transparent'};
              color:${active ? 'var(--cyan)' : 'var(--text-muted)'};transition:all 0.15s;white-space:nowrap`;
    }

    let activeFilter = 'all';

    // Filter buttons
    main.querySelectorAll('.collab-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        main.querySelectorAll('.collab-filter').forEach(b => {
          b.style.background = 'transparent';
          b.style.color = 'var(--text-muted)';
          b.style.borderColor = 'var(--border)';
        });
        btn.style.background = 'var(--cyan-dim)';
        btn.style.color = 'var(--cyan)';
        btn.style.borderColor = 'var(--border-active)';
        activeFilter = btn.dataset.filter;
        renderCollabList(activeFilter);
      });
    });

    document.getElementById('collab-post-btn').addEventListener('click', openCollabPostModal);

    await renderCollabList('all');

    async function renderCollabList(filter) {
      const list = document.getElementById('collab-list');
      if (!list) return;

      // collab_posts table: id, author_id, title, description, tech_stack[], status, created_at
      let q = window.sb
        .from('collab_posts')
        .select(`
          id, title, description, tech_stack, status, created_at,
          profiles!collab_posts_author_id_fkey(id, username, display_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(30);

      if (filter !== 'all') {
        q = q.contains('tech_stack', [filter]);
      }

      const { data: posts, error } = await q;

      if (error) {
        // Table may not exist yet — show setup prompt
        if (error.code === '42P01') {
          list.innerHTML = `
            <div style="padding:32px;text-align:center;background:var(--bg-surface);border:1px solid var(--border);border-radius:14px">
              <i class="fa-solid fa-database" style="font-size:28px;color:var(--cyan);margin-bottom:12px;display:block"></i>
              <h3 style="font-weight:800;margin-bottom:8px">Run the Collab Board SQL first</h3>
              <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">
                Open your Supabase Dashboard → SQL Editor and run the setup below, then refresh.
              </p>
              <pre style="text-align:left;background:var(--bg-void);border:1px solid var(--border);border-radius:10px;padding:14px;font-size:11.5px;overflow-x:auto;color:var(--text-code)">${escHtml(COLLAB_SETUP_SQL)}</pre>
            </div>`;
          return;
        }
        list.innerHTML = `<div style="padding:32px;text-align:center;color:var(--rose)">${escHtml(error.message)}</div>`;
        return;
      }

      if (!posts?.length) {
        list.innerHTML = `
          <div style="padding:48px;text-align:center;color:var(--text-muted)">
            <i class="fa-solid fa-handshake" style="font-size:36px;margin-bottom:14px;display:block;opacity:0.3"></i>
            <div style="font-size:14px;font-weight:600">No collab posts yet</div>
            <div style="font-size:13px;margin-top:6px">Be the first to post a project looking for collaborators!</div>
          </div>`;
        return;
      }

      list.innerHTML = '';
      posts.forEach(post => {
        list.appendChild(buildCollabCard(post));
      });
    }
  }

  const COLLAB_SETUP_SQL = `-- Collab Board
create table if not exists collab_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  tech_stack text[] default '{}',
  status text default 'open', -- open | filled
  created_at timestamptz default now()
);
alter table collab_posts enable row level security;
create policy "Public collab" on collab_posts for select using (true);
create policy "Auth post collab" on collab_posts for insert with check (auth.uid() = author_id);
create policy "Own collab delete" on collab_posts for delete using (auth.uid() = author_id);

create table if not exists collab_applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references collab_posts(id) on delete cascade not null,
  applicant_id uuid references profiles(id) on delete cascade not null,
  message text,
  created_at timestamptz default now(),
  unique(post_id, applicant_id)
);
alter table collab_applications enable row level security;
create policy "Author sees apps" on collab_applications for select
  using (exists (select 1 from collab_posts cp where cp.id = post_id and cp.author_id = auth.uid())
         or applicant_id = auth.uid());
create policy "Auth apply" on collab_applications for insert with check (auth.uid() = applicant_id);`;

  function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function buildCollabCard(post) {
    const card = document.createElement('div');
    card.style.cssText = `
      background:var(--bg-surface);border:1px solid var(--border);border-radius:16px;
      padding:18px;margin-bottom:14px;transition:border-color 0.18s,transform 0.18s;
    `;
    card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--border-active)'; card.style.transform = 'translateY(-1px)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border)'; card.style.transform = ''; });

    const profile = post.profiles || {};
    const name = profile.display_name || profile.username || 'Unknown';
    const statusColor = post.status === 'open' ? 'var(--emerald)' : 'var(--text-muted)';
    const statusLabel = post.status === 'open' ? 'Open' : 'Filled';

    const isOwn = window.State?.user?.id === profile.id;

    const techHtml = (post.tech_stack || []).map(t =>
      `<span style="padding:3px 9px;border-radius:99px;background:var(--violet-dim);border:1px solid rgba(167,139,250,0.2);font-size:11px;color:var(--violet);font-weight:600">${escHtml(t)}</span>`
    ).join('');

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <h3 style="font-size:15px;font-weight:800;color:var(--text-primary)">${escHtml(post.title)}</h3>
            <span style="padding:2px 8px;border-radius:99px;background:rgba(${post.status==='open'?'52,211,153':'99,99,99'},0.15);
                         border:1px solid ${statusColor};color:${statusColor};font-size:11px;font-weight:700">${statusLabel}</span>
          </div>
          <p style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:10px">${escHtml(post.description)}</p>
          ${techHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">${techHtml}</div>` : ''}
          <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-muted)">
            <span>by <strong style="color:var(--text-secondary)">${escHtml(name)}</strong></span>
            <span>·</span>
            <span>${timeAgoLocal(post.created_at)}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isOwn
          ? `<button class="collab-mark-filled"
               style="padding:7px 16px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border);
                      color:var(--text-secondary);font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s">
               ${post.status==='open' ? 'Mark as Filled' : 'Reopen'}
             </button>
             <button class="collab-view-applicants"
               style="padding:7px 16px;border-radius:8px;background:var(--cyan-dim);border:1px solid var(--border-active);
                      color:var(--cyan);font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s">
               View Applicants
             </button>`
          : `<button class="collab-apply-btn"
               style="padding:7px 20px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--violet));
                      color:var(--bg-void);font-size:12px;font-weight:800;cursor:pointer;border:none;transition:all 0.15s"
               ${post.status!=='open' ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
               ${post.status==='open' ? 'Apply to Collab' : 'Position Filled'}
             </button>`
        }
      </div>
    `;

    // Apply button
    const applyBtn = card.querySelector('.collab-apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => openCollabApplyModal(post));
    }

    // Mark filled
    const fillBtn = card.querySelector('.collab-mark-filled');
    if (fillBtn) {
      fillBtn.addEventListener('click', async () => {
        const newStatus = post.status === 'open' ? 'filled' : 'open';
        const { error } = await window.sb.from('collab_posts').update({ status: newStatus }).eq('id', post.id);
        if (!error) {
          post.status = newStatus;
          card.replaceWith(buildCollabCard(post));
          toast(newStatus === 'filled' ? 'Marked as filled!' : 'Reopened!', 'check');
        }
      });
    }

    // View applicants
    const appsBtn = card.querySelector('.collab-view-applicants');
    if (appsBtn) {
      appsBtn.addEventListener('click', () => openCollabApplicantsModal(post));
    }

    return card;
  }

  function timeAgoLocal(ts) {
    const s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  function openCollabPostModal() {
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body');
    document.getElementById('modal-title-text').textContent = 'Post a Collab Project';
    modal.classList.add('open');

    const techOptions = ['React','Next.js','Vue','Svelte','TypeScript','Node.js',
      'Python','Rust','Go','PostgreSQL','Supabase','Firebase','Docker','AWS',
      'GraphQL','Three.js','ML/AI','Blockchain','Mobile','Game Dev'];

    let selectedTech = new Set();

    body.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
        <div class="auth-input-group">
          <label>Project Title</label>
          <input type="text" id="collab-title" class="auth-input" placeholder="e.g. Open-source dev tool" maxlength="80">
        </div>
        <div class="auth-input-group">
          <label>What are you building? What do you need?</label>
          <textarea id="collab-desc" class="auth-input" rows="4" placeholder="Describe your project and what kind of collaborator you're looking for…" style="resize:vertical"></textarea>
        </div>
        <div class="auth-input-group">
          <label>Tech Stack (select all that apply)</label>
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:4px" id="collab-tech-picker">
            ${techOptions.map(t => `
              <button class="collab-tech-btn" data-tech="${t}"
                style="padding:5px 12px;border-radius:99px;border:1px solid var(--border);
                       background:transparent;color:var(--text-muted);font-size:12px;font-weight:700;
                       cursor:pointer;transition:all 0.15s">${t}</button>
            `).join('')}
          </div>
        </div>
        <div id="collab-post-status" style="font-size:12px;color:var(--text-muted);display:none"></div>
        <button class="auth-btn-primary" id="collab-post-submit"><i class="fa-solid fa-rocket"></i> Post Project</button>
      </div>
    `;

    body.querySelectorAll('.collab-tech-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tech;
        if (selectedTech.has(t)) {
          selectedTech.delete(t);
          btn.style.background = 'transparent';
          btn.style.color = 'var(--text-muted)';
          btn.style.borderColor = 'var(--border)';
        } else {
          selectedTech.add(t);
          btn.style.background = 'var(--violet-dim)';
          btn.style.color = 'var(--violet)';
          btn.style.borderColor = 'rgba(167,139,250,0.4)';
        }
      });
    });

    document.getElementById('collab-post-submit').addEventListener('click', async () => {
      const title = document.getElementById('collab-title').value.trim();
      const desc  = document.getElementById('collab-desc').value.trim();
      const statusEl = document.getElementById('collab-post-status');
      statusEl.style.display = 'block';

      if (!title) { statusEl.style.color = 'var(--rose)'; statusEl.textContent = 'Please add a title.'; return; }
      if (!desc)  { statusEl.style.color = 'var(--rose)'; statusEl.textContent = 'Please describe your project.'; return; }

      const btn = document.getElementById('collab-post-submit');
      btn.disabled = true; btn.textContent = 'Posting…';

      const { error } = await window.sb.from('collab_posts').insert({
        author_id: window.State.user.id,
        title,
        description: desc,
        tech_stack: [...selectedTech],
        status: 'open',
      });

      if (error) {
        statusEl.style.color = 'var(--rose)';
        statusEl.textContent = error.code === '42P01'
          ? 'Run the Collab Board SQL first! (check console)'
          : 'Error: ' + error.message;
        if (error.code === '42P01') console.log('Collab SQL:\n' + COLLAB_SETUP_SQL);
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rocket"></i> Post Project';
      } else {
        modal.classList.remove('open');
        toast('Collab post published!', 'handshake');
        // Re-render the collab board
        renderCollabBoard(document.getElementById('main'));
      }
    });
  }

  function openCollabApplyModal(post) {
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body');
    document.getElementById('modal-title-text').textContent = 'Apply to Collab';
    modal.classList.add('open');

    body.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
        <div style="padding:12px 14px;background:var(--bg-elevated);border-radius:10px;border:1px solid var(--border)">
          <div style="font-weight:800;font-size:14px;margin-bottom:4px">${escHtml(post.title)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${escHtml(post.description.slice(0,100))}${post.description.length > 100 ? '…' : ''}</div>
        </div>
        <div class="auth-input-group">
          <label>Why do you want to collaborate? (optional)</label>
          <textarea id="apply-msg" class="auth-input" rows="4"
            placeholder="Tell the author about your skills and why you'd be a great fit…"
            style="resize:vertical"></textarea>
        </div>
        <div id="apply-status" style="font-size:12px;color:var(--text-muted);display:none"></div>
        <button class="auth-btn-primary" id="apply-submit"><i class="fa-solid fa-paper-plane"></i> Send Application</button>
      </div>
    `;

    document.getElementById('apply-submit').addEventListener('click', async () => {
      const msg = document.getElementById('apply-msg').value.trim();
      const statusEl = document.getElementById('apply-status');
      const btn = document.getElementById('apply-submit');
      btn.disabled = true; btn.textContent = 'Sending…';
      statusEl.style.display = 'block';

      const { error } = await window.sb.from('collab_applications').insert({
        post_id: post.id,
        applicant_id: window.State.user.id,
        message: msg || null,
      });

      if (error) {
        if (error.code === '23505') {
          statusEl.style.color = 'var(--amber)';
          statusEl.textContent = 'You already applied to this project!';
        } else {
          statusEl.style.color = 'var(--rose)';
          statusEl.textContent = 'Error: ' + error.message;
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Application';
      } else {
        // Notify the post author
        await window.sb.from('notifications').insert({
          user_id: post.profiles?.id || post.author_id,
          actor_id: window.State.user.id,
          type: 'collab_apply',
          post_id: post.id,
        }).catch(() => {});

        modal.classList.remove('open');
        toast('Application sent!', 'paper-plane');
      }
    });
  }

  async function openCollabApplicantsModal(post) {
    const modal = document.getElementById('modal-overlay');
    const body  = document.getElementById('modal-body');
    document.getElementById('modal-title-text').textContent = 'Applicants';
    modal.classList.add('open');
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;

    const { data: apps, error } = await window.sb
      .from('collab_applications')
      .select('id, message, created_at, profiles!collab_applications_applicant_id_fkey(id,username,display_name,avatar_url,bio)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    if (error || !apps?.length) {
      body.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:14px">
        ${error ? 'Error loading applicants.' : 'No applications yet.'}
      </div>`;
      return;
    }

    body.innerHTML = `<div style="padding:8px 0;max-height:70vh;overflow-y:auto">` +
      apps.map(app => {
        const p = app.profiles || {};
        return `
          <div style="display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">${escHtml(p.display_name || p.username || '?')}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">@${escHtml(p.username || '?')} · ${timeAgoLocal(app.created_at)}</div>
              ${app.message ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;background:var(--bg-elevated);padding:8px 12px;border-radius:8px">${escHtml(app.message)}</div>` : ''}
            </div>
            <div style="flex-shrink:0">
              <button class="open-dm-applicant" data-uid="${p.id}" data-name="${escHtml(p.display_name || p.username || '?')}"
                style="padding:6px 14px;border-radius:8px;background:var(--cyan-dim);border:1px solid var(--border-active);
                       color:var(--cyan);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">
                DM
              </button>
            </div>
          </div>`;
      }).join('') + `</div>`;

    // Wire DM buttons
    body.querySelectorAll('.open-dm-applicant').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('open');
        if (typeof openDMWith === 'function') {
          openDMWith(btn.dataset.uid);
        } else {
          navigateTo('messages');
          toast(`Opening DM with ${btn.dataset.name}`, 'message');
        }
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
     5. WIRE UP COLLAB IN navigateTo
     ════════════════════════════════════════════════════════════ */
  function injectCollabRenderer() {
    // The cleanest way: after DOMContentLoaded the app boots and sets
    // up navigateTo. We watch for it and then inject.
    const orig = window.navigateTo;
    if (!orig) return;

    window.navigateTo = function(view) {
      // First call original (it handles all views, defaults to renderFeed for unknowns)
      if (view !== 'collab') {
        orig(view);
        // clear any active tag when leaving feed
        if (view !== 'feed') window.__devitActiveTag = null;
      } else {
        // manually handle collab
        window.State.currentView = 'collab';
        if (typeof showPresence === 'function') showPresence();
        if (typeof updateSidebarActive === 'function') updateSidebarActive();
        if (typeof updateBottomNavActive === 'function') updateBottomNavActive('collab');
        const main = document.getElementById('main');
        if (main) {
          main.style.cssText = '';
          main.innerHTML = '';
        }
        if (typeof closeSearch === 'function') closeSearch();
        renderCollabBoard(main);
        main.classList.remove('page-enter');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          main.classList.add('page-enter');
          main.focus?.();
        }));
      }
      injectCollabNav();
    };
  }

  /* ════════════════════════════════════════════════════════════
     BOOT — wait for app to be ready
     ════════════════════════════════════════════════════════════ */
  function waitForApp(cb, retries = 40) {
    if (window.navigateTo && window.sb && window.State?.user !== undefined) {
      cb();
    } else if (retries > 0) {
      setTimeout(() => waitForApp(cb, retries - 1), 200);
    } else {
      console.warn('[devit-patch] App did not boot in time. Patch partial.');
    }
  }

  // Load Prism immediately
  loadPrism(() => {
    console.log('[devit-patch] Prism.js loaded');
    // Re-highlight any already-rendered code blocks
    document.querySelectorAll('pre.post-code').forEach(pre => {
      upgradePostCard(pre.closest('.post-card') || pre);
    });
  });

  // Wait for full app boot then wire everything else
  waitForApp(() => {
    console.log('[devit-patch] App ready — applying patches');
    patchBuildPostCard();
    patchLoadPosts();
    patchSearch();
    injectCollabRenderer();
    injectCollabNav();
  });

})();
