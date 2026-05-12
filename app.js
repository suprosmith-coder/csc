/* ============================================================
   CYANET — Create. Collaborate. Launch.
   app.js
   ============================================================ */

'use strict';

/* ── State ──────────────────────────────────────────────────── */
const State = {
  user: null,
  currentView: 'feed',
  currentCommunity: null,
  currentDM: null,
  feedTab: 'for-you',
  posts: [],
  notifications: [],
  messages: [],
  onlineUsers: new Set(),
  typingUsers: new Map(),
  unreadNotifs: 3,
  unreadMessages: 2,
};

/* ── Seed Data ──────────────────────────────────────────────── */
const USERS = [
  { id: 'u1', name: 'Zara Osei',      handle: 'zaraosei',    avatar: '🦋', color: '#f472b6', badges: ['dev'], tech: ['React','TypeScript','GraphQL','Node.js'], bio: 'Building things that matter. OSS contributor. She/her 🌸', followers: 4821, following: 312, repos: 67, location: 'Accra, GH', website: 'zaraosei.dev', joined: 'Jan 2024' },
  { id: 'u2', name: 'Kenji Murakami', handle: 'kenjimura',   avatar: '🦊', color: '#f97316', badges: ['mod'], tech: ['Rust','WASM','Tokio','Linux'], bio: 'Rust evangelist. Low-level stuff by day, creative coding by night.', followers: 9204, following: 188, repos: 134, location: 'Tokyo, JP', website: 'kenjimura.io', joined: 'Mar 2023' },
  { id: 'u3', name: 'Priya Sharma',   handle: 'priyacodes',  avatar: '🌊', color: '#06b6d4', badges: ['dev'], tech: ['Python','ML','FastAPI','PostgreSQL'], bio: 'ML engineer. Making AI actually useful for people.', followers: 7130, following: 521, repos: 89, location: 'Bangalore, IN', website: 'priyasharma.tech', joined: 'Sep 2023' },
  { id: 'u4', name: 'Lucas Fontaine', handle: 'lucasf',      avatar: '⚡', color: '#a78bfa', badges: ['dev'], tech: ['Vue','Go','Docker','K8s'], bio: 'Full-stack chaos agent. Deploys to prod on Fridays.', followers: 2988, following: 408, repos: 55, location: 'Paris, FR', website: 'lucasf.fr', joined: 'Jun 2024' },
  { id: 'u5', name: 'Mia Chen',       handle: 'mia_chen_ui', avatar: '🎨', color: '#34d399', badges: ['dev'], tech: ['Figma','Svelte','CSS','Three.js'], bio: 'Design engineer. CSS is my love language.', followers: 11092, following: 276, repos: 42, location: 'SF, CA', website: 'miachen.design', joined: 'Nov 2022' },
];

const POSTS_DATA = [
  {
    id: 'p1', userId: 'u2', time: '2m ago',
    content: 'Just shipped zero-copy serialization in our Rust message broker — latency dropped from 4ms to 0.3ms. Sometimes the old ways really are the best ways. <span class="hashtag">#Rust</span> <span class="hashtag">#performance</span>',
    code: `<span class="kw">fn</span> <span class="fn">serialize_zero_copy</span>&lt;T: Serialize&gt;(
  buf: &<span class="kw">mut</span> BytesMut,
  value: &T
) -> <span class="fn">Result</span>&lt;(), SerializeError&gt; {
  <span class="cm">// Skip allocation — write directly to the ring buffer</span>
  <span class="kw">let</span> cursor = buf.<span class="fn">len</span>();
  value.<span class="fn">serialize</span>(&<span class="kw">mut</span> buf.<span class="fn">writer</span>())?;
  <span class="fn">Ok</span>(())
}`, codeLang: 'rust',
    likes: 312, comments: 28, reposts: 47, liked: false, reposted: false, bookmarked: false,
  },
  {
    id: 'p2', userId: 'u5', time: '14m ago',
    content: 'Hot take: CSS Grid subgrid is the most underrated feature of the last 3 years. Finally, alignment that actually makes sense. Here\'s a pattern I\'ve been using for card layouts that was previously impossible. <span class="hashtag">#CSS</span> <span class="hashtag">#webdev</span>',
    code: `<span class="cm">/* Cards in a grid with aligned internals */</span>
.card-grid {
  display: grid;
  grid-template-columns: <span class="fn">repeat</span>(<span class="fn">auto-fill</span>, <span class="fn">minmax</span>(<span class="num">280px</span>, <span class="num">1fr</span>));
}

.card {
  display: grid;
  grid-row: <span class="fn">span</span> <span class="num">3</span>;
  grid-template-rows: <span class="kw">subgrid</span>; <span class="cm">/* 🔥 */</span>
}`, codeLang: 'css',
    likes: 891, comments: 62, reposts: 134, liked: true, reposted: false, bookmarked: true,
  },
  {
    id: 'p3', userId: 'u3', time: '1h ago',
    content: '<span class="mention">@kenjimura</span> Ask and you shall receive — fine-tuned a lightweight 7B model for code review feedback. Running inference on a single A10G, 200ms p95. Check out the repo! <span class="hashtag">#ML</span> <span class="hashtag">#LLM</span>',
    repo: { name: 'priyacodes/code-reviewer-7b', desc: 'Fine-tuned Mistral-7B for automated code review. Fast, cheap, good. (pick all three)', lang: 'Python', langColor: '#3572A5', stars: 1204, forks: 89 },
    likes: 543, comments: 41, reposts: 88, liked: false, reposted: true, bookmarked: false,
  },
  {
    id: 'p4', userId: 'u1', time: '2h ago',
    content: 'New blog post: "Why I stopped using useEffect for data fetching" — a journey through React Query, SWR, and eventually just writing a custom hook that actually does what I want. Link in replies. <span class="hashtag">#React</span> <span class="hashtag">#webdev</span>',
    likes: 729, comments: 93, reposts: 215, liked: false, reposted: false, bookmarked: false,
  },
  {
    id: 'p5', userId: 'u4', time: '3h ago',
    content: 'Deployed to prod at 5pm on Friday. Everything is fine. <span class="hashtag">#devlife</span>',
    likes: 2847, comments: 187, reposts: 634, liked: true, reposted: true, bookmarked: false,
  },
];

const COMMUNITIES = [
  { id: 'c1', name: 'Rust & Systems', icon: '🦀', color: '#f97316', bg: 'rgba(249,115,22,0.1)', desc: 'Low-level programming, Rust evangelism, performance optimization', members: 14820, online: 312, joined: true,
    channels: [
      { id: 'ch1', name: 'general', type: 'text', unread: false },
      { id: 'ch2', name: 'help-desk', type: 'text', unread: true },
      { id: 'ch3', name: 'showcase', type: 'text', unread: false },
      { id: 'ch4', name: 'pair-programming', type: 'voice', unread: false },
    ]
  },
  { id: 'c2', name: 'React & Frontend', icon: '⚛️', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', desc: 'React, Vue, Svelte, CSS — all things frontend', members: 29440, online: 891, joined: true,
    channels: [
      { id: 'ch5', name: 'general', type: 'text', unread: true },
      { id: 'ch6', name: 'code-review', type: 'text', unread: false },
      { id: 'ch7', name: 'jobs', type: 'text', unread: false },
      { id: 'ch8', name: 'design-collab', type: 'voice', unread: false },
    ]
  },
  { id: 'c3', name: 'ML & AI', icon: '🧠', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', desc: 'Machine learning, LLMs, research papers, deployments', members: 21100, online: 543, joined: false,
    channels: [
      { id: 'ch9', name: 'papers', type: 'text', unread: false },
      { id: 'ch10', name: 'projects', type: 'text', unread: false },
    ]
  },
  { id: 'c4', name: 'DevOps & Cloud', icon: '☁️', color: '#34d399', bg: 'rgba(52,211,153,0.1)', desc: 'K8s, Docker, CI/CD, infra as code — the whole stack', members: 18320, online: 267, joined: false,
    channels: [
      { id: 'ch11', name: 'general', type: 'text', unread: false },
      { id: 'ch12', name: 'incidents', type: 'text', unread: false },
    ]
  },
  { id: 'c5', name: 'Open Source', icon: '🌍', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', desc: 'OSS projects, contributions, maintainer support', members: 11800, online: 189, joined: true,
    channels: [
      { id: 'ch13', name: 'looking-for-help', type: 'text', unread: false },
      { id: 'ch14', name: 'showcase', type: 'text', unread: false },
    ]
  },
  { id: 'c6', name: 'Design Engineering', icon: '🎨', color: '#f472b6', bg: 'rgba(244,114,182,0.1)', desc: 'Where design meets code: CSS, animations, creative dev', members: 8920, online: 204, joined: false,
    channels: [
      { id: 'ch15', name: 'inspiration', type: 'text', unread: false },
      { id: 'ch16', name: 'code-art', type: 'text', unread: false },
    ]
  },
];

const CHAT_MESSAGES = {
  ch1: [
    { id: 'm1', userId: 'u2', text: 'Anyone else excited about async closures being stabilized? This changes so much for me', time: '10:12 AM' },
    { id: 'm2', userId: 'u4', text: 'I\'ve been waiting for this for literally 2 years', time: '10:14 AM' },
    { id: 'm3', userId: 'u2', text: 'The ergonomics are finally there. Check this out:', time: '10:15 AM', code: 'let handler = async |req: Request| -> Response { ... };' },
    { id: 'm4', userId: 'u1', text: 'ok that actually looks really clean 👀', time: '10:16 AM' },
    { id: 'm5', userId: 'u3', text: 'reminds me of the Python async lambda proposal lol', time: '10:18 AM' },
    { id: 'm6', userId: 'u2', text: 'haha except this one actually shipped 😄', time: '10:18 AM' },
  ],
  ch5: [
    { id: 'm7', userId: 'u5', text: 'PSA: React 19\'s `use` hook + Suspense is genuinely game-changing for data loading patterns', time: '9:44 AM' },
    { id: 'm8', userId: 'u1', text: 'finally retiring useEffect for data fetching 🎉', time: '9:46 AM' },
    { id: 'm9', userId: 'u4', text: 'Anyone tried it with Server Components in Next 15?', time: '9:49 AM' },
    { id: 'm10', userId: 'u5', text: 'Yes! Works beautifully. The streaming is seamless', time: '9:51 AM' },
  ],
};

const DM_CONVERSATIONS = [
  { id: 'dm1', userId: 'u5', online: true, unread: 2, preview: 'Let me know what you think of the PR!',
    messages: [
      { id: 'dm1m1', from: 'u5', text: 'Hey! Saw your post about CSS Grid subgrid', time: '2:14 PM', own: false },
      { id: 'dm1m2', from: 'me', text: 'Oh yeah, it\'s been a total game changer for my layouts', time: '2:15 PM', own: true },
      { id: 'dm1m3', from: 'u5', text: 'Totally agree. I actually opened a PR on your card component repo with an example using subgrid', time: '2:16 PM', own: false },
      { id: 'dm1m4', from: 'u5', text: 'Let me know what you think of the PR!', time: '2:16 PM', own: false },
    ]
  },
  { id: 'dm2', userId: 'u2', online: false, unread: 0, preview: 'Sounds good, I\'ll open the issue tomorrow',
    messages: [
      { id: 'dm2m1', from: 'me', text: 'Kenji — loving the zero-copy serializer btw. Any chance you\'d accept a contribution for a serde integration?', time: '11:30 AM', own: true },
      { id: 'dm2m2', from: 'u2', text: 'Absolutely! Would love that. The API is pretty straightforward to extend', time: '11:45 AM', own: false },
      { id: 'dm2m3', from: 'me', text: 'Perfect, I\'ll open the issue tomorrow with a design proposal', time: '11:46 AM', own: true },
      { id: 'dm2m4', from: 'u2', text: 'Sounds good, I\'ll open the issue tomorrow', time: '11:47 AM', own: false },
    ]
  },
  { id: 'dm3', userId: 'u3', online: true, unread: 0, preview: 'model card is up on HuggingFace now',
    messages: [
      { id: 'dm3m1', from: 'u3', text: 'model card is up on HuggingFace now', time: '9:02 AM', own: false },
    ]
  },
];

const NOTIFICATIONS_DATA = [
  { id: 'n1', type: 'like', userId: 'u5', text: '<strong>mia_chen_ui</strong> liked your post about useEffect', time: '3m ago', unread: true, preview: '"Why I stopped using useEffect for data fetching"' },
  { id: 'n2', type: 'follow', userId: 'u2', text: '<strong>kenjimura</strong> started following you', time: '1h ago', unread: true },
  { id: 'n3', type: 'comment', userId: 'u3', text: '<strong>priyacodes</strong> commented on your TypeScript post', time: '2h ago', unread: true, preview: '"This is exactly the pattern I\'ve been looking for!"' },
  { id: 'n4', type: 'repo', userId: 'u1', text: '<strong>zaraosei</strong> starred your repo <strong>react-hooks-collection</strong>', time: '4h ago', unread: false },
  { id: 'n5', type: 'like', userId: 'u4', text: '<strong>lucasf</strong> liked and reposted your CSS Grid thread', time: '6h ago', unread: false },
  { id: 'n6', type: 'comment', userId: 'u2', text: '<strong>kenjimura</strong> replied to your Rust question in #help-desk', time: '8h ago', unread: false, preview: '"The borrow checker is telling you about a data race you\'d have in C++"' },
];

const PROJECTS = [
  { id: 'proj1', name: 'Waveform Studio', desc: 'Browser-based audio DAW with WASM processing', emoji: '🎵', bg: 'linear-gradient(135deg,#1a0a2e,#0a1628)', author: 'u3', stars: 2140, likes: 489 },
  { id: 'proj2', name: 'Rift UI', desc: 'Component library with physics-based animations', emoji: '⚡', bg: 'linear-gradient(135deg,#0a1f0a,#0a0a1f)', author: 'u5', stars: 3820, likes: 1204 },
  { id: 'proj3', name: 'Cascade DB', desc: 'Distributed key-value store written in Rust', emoji: '🗄️', bg: 'linear-gradient(135deg,#1f0a0a,#0a0a1f)', author: 'u2', stars: 5600, likes: 2100 },
  { id: 'proj4', name: 'Prism Deploy', desc: 'Zero-config deployment for static sites + edge fns', emoji: '🚀', bg: 'linear-gradient(135deg,#0a1f1a,#1a1f0a)', author: 'u4', stars: 1890, likes: 734 },
  { id: 'proj5', name: 'TypeTrace', desc: 'Real-time TypeScript type visualizer', emoji: '🔬', bg: 'linear-gradient(135deg,#1a0a18,#0a181a)', author: 'u1', stars: 2670, likes: 912 },
  { id: 'proj6', name: 'Nomad CLI', desc: 'Smart workspace manager for terminal power users', emoji: '💻', bg: 'linear-gradient(135deg,#1a1a0a,#0a101f)', author: 'u2', stars: 1340, likes: 567 },
];

const TRENDING = [
  { tag: '#RustLang',   count: '12.4K posts', label: 'Trending in Systems' },
  { tag: '#React19',    count: '8.1K posts',  label: 'Trending in Frontend' },
  { tag: '#CSSSubgrid', count: '4.2K posts',  label: 'Trending in Design' },
  { tag: '#OpenSource', count: '21K posts',   label: 'Trending globally' },
  { tag: '#MLOps',      count: '6.8K posts',  label: 'Trending in AI/ML' },
];

/* ── Helpers ────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const getUserById = id => USERS.find(u => u.id === id);
const fmtNum = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n;

function toast(msg, icon = '✅') {
  const c = $('#toast-container');
  const t = el('div', 'toast', `<span class="toast-icon">${icon}</span><span>${msg}</span>`);
  c.appendChild(t);
  setTimeout(() => { t.classList.add('exit'); setTimeout(() => t.remove(), 300); }, 3000);
}

function showPresence() {
  const b = $('#presence-bar');
  b.classList.add('loading');
  setTimeout(() => { b.classList.remove('loading'); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 400); }, 600);
}

/* ── Auth ───────────────────────────────────────────────────── */
function initAuth() {
  const screen = $('#auth-screen');
  const app    = $('#app');
  const githubBtn = $('#github-login-btn');
  const loginBtn  = $('#login-btn');
  const emailIn   = $('#auth-email');
  const passIn    = $('#auth-password');

  githubBtn.addEventListener('click', () => {
    githubBtn.textContent = 'Connecting to GitHub…';
    githubBtn.disabled = true;
    setTimeout(() => login({ ...USERS[0], id: 'me' }), 1200);
  });

  loginBtn.addEventListener('click', () => {
    if (!emailIn.value) { toast('Enter an email address', '⚠️'); return; }
    loginBtn.textContent = 'Signing in…';
    loginBtn.disabled = true;
    setTimeout(() => login({ ...USERS[0], id: 'me' }), 900);
  });

  function login(user) {
    State.user = user;
    screen.style.opacity = '0';
    screen.style.transform = 'scale(1.02)';
    screen.style.transition = '0.4s ease';
    setTimeout(() => {
      screen.style.display = 'none';
      app.classList.add('visible');
      buildApp();
      toast(`Welcome back, ${user.name.split(' ')[0]}! 👋`, '🚀');
    }, 400);
  }

  // Demo: auto-login shortcut — remove for prod
  // Uncomment to skip auth during dev:
  // login({ ...USERS[0], id: 'me' });
}

/* ── Build App ──────────────────────────────────────────────── */
function buildApp() {
  buildTopbar();
  buildSidebar();
  buildRightbar();
  navigateTo('feed');
}

/* ── Topbar ─────────────────────────────────────────────────── */
function buildTopbar() {
  const tb = $('#topbar');
  tb.innerHTML = `
    <div class="topbar-logo">
      <div class="topbar-logo-mark">C</div>
      <span>Cyanet</span>
    </div>
    <div class="topbar-search">
      <span class="topbar-search-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </span>
      <input type="text" id="search-input" placeholder="Search Cyanet — people, repos, communities…">
    </div>
    <div class="topbar-actions">
      <button class="topbar-action-btn" id="nav-notifs" title="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="badge"></span>
      </button>
      <button class="topbar-action-btn" id="nav-messages-btn" title="Messages">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="badge"></span>
      </button>
      <button class="topbar-action-btn" title="New post" id="new-post-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </button>
      <div class="topbar-avatar" id="topbar-avatar-btn">${State.user?.avatar || '👤'}</div>
    </div>
  `;

  $('#nav-notifs').addEventListener('click', () => navigateTo('notifications'));
  $('#nav-messages-btn').addEventListener('click', () => navigateTo('messages'));
  $('#new-post-btn').addEventListener('click', openNewPostModal);
  $('#topbar-avatar-btn').addEventListener('click', () => navigateTo('profile'));

  $('#search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      toast(`Searching for "${e.target.value.trim()}"…`, '🔍');
      e.target.value = '';
    }
  });
}

/* ── Sidebar ────────────────────────────────────────────────── */
function buildSidebar() {
  const sb = $('#sidebar');
  const links = [
    { id: 'feed',          icon: '🏠', label: 'Home' },
    { id: 'explore',       icon: '🔭', label: 'Explore' },
    { id: 'notifications', icon: '🔔', label: 'Notifications', badge: State.unreadNotifs },
    { id: 'messages',      icon: '💬', label: 'Messages', badge: State.unreadMessages },
    { id: 'profile',       icon: '👤', label: 'Profile' },
    { id: 'bookmarks',     icon: '🔖', label: 'Bookmarks' },
  ];

  let html = `<div class="sidebar-section-label">Navigate</div>`;
  links.forEach(l => {
    html += `<div class="sidebar-link${l.id === State.currentView ? ' active' : ''}" data-nav="${l.id}">
      <span class="icon">${l.icon}</span>
      <span>${l.label}</span>
      ${l.badge ? `<span class="badge-count">${l.badge}</span>` : ''}
    </div>`;
  });

  html += `<div class="sidebar-divider"></div>
  <div class="sidebar-communities-header">
    <span>Communities</span>
    <button id="create-community-btn" title="Create community">＋</button>
  </div>`;

  COMMUNITIES.filter(c => c.joined).forEach(c => {
    html += `<div class="sidebar-community" data-community="${c.id}">
      <div class="sidebar-community-icon" style="background:${c.bg};color:${c.color}">${c.icon}</div>
      <span class="sidebar-community-name">${c.name}</span>
      <span class="sidebar-community-dot"></span>
    </div>`;
  });

  html += `<div class="sidebar-divider"></div>
  <div class="sidebar-bottom">
    <div class="sidebar-link" data-nav="settings">
      <span class="icon">⚙️</span><span>Settings</span>
    </div>
  </div>`;

  sb.innerHTML = html;

  $$('.sidebar-link[data-nav]', sb).forEach(link => {
    link.addEventListener('click', () => navigateTo(link.dataset.nav));
  });
  $$('.sidebar-community[data-community]', sb).forEach(item => {
    item.addEventListener('click', () => openCommunity(item.dataset.community));
  });
  $('#create-community-btn').addEventListener('click', () => toast('Community creation coming soon!', '🌍'));
}

function updateSidebarActive() {
  $$('.sidebar-link[data-nav]').forEach(l => {
    l.classList.toggle('active', l.dataset.nav === State.currentView);
  });
}

/* ── Rightbar ───────────────────────────────────────────────── */
function buildRightbar() {
  const rb = $('#rightbar');
  rb.innerHTML = `
    <div class="widget" id="trending-widget">
      <div class="widget-header">Trending <a href="#">See all</a></div>
      ${TRENDING.map(t => `
        <div class="trending-item">
          <div class="trending-label">${t.label}</div>
          <div class="trending-tag">${t.tag}</div>
          <div class="trending-count">${t.count}</div>
        </div>
      `).join('')}
    </div>
    <div class="widget" id="who-widget">
      <div class="widget-header">Who to follow <a href="#">See all</a></div>
      ${USERS.slice(1, 4).map(u => `
        <div class="who-item">
          <div class="who-avatar" style="background:${u.color}">${u.avatar}</div>
          <div class="who-info">
            <div class="who-name">${u.name}</div>
            <div class="who-handle">@${u.handle}</div>
          </div>
          <button class="follow-btn" data-uid="${u.id}">Follow</button>
        </div>
      `).join('')}
    </div>
    <div class="widget">
      <div class="widget-header">Your Activity</div>
      <div class="contrib-graph">
        <div class="contrib-weeks" id="contrib-graph"></div>
      </div>
      <div style="padding:0 14px 12px;font-size:12px;color:var(--text-muted)">
        <span style="color:var(--cyan);font-weight:700">47 contributions</span> in the last 30 days
      </div>
    </div>
  `;

  buildContribGraph();

  $$('.follow-btn', rb).forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const u = getUserById(uid);
      if (btn.classList.contains('following')) {
        btn.classList.remove('following');
        btn.textContent = 'Follow';
        toast(`Unfollowed @${u.handle}`, '👋');
      } else {
        btn.classList.add('following');
        btn.textContent = 'Following';
        toast(`Following @${u.handle}! 🎉`, '✅');
      }
    });
  });
}

function buildContribGraph() {
  const graph = $('#contrib-graph');
  if (!graph) return;
  graph.innerHTML = '';
  for (let w = 0; w < 16; w++) {
    const week = el('div', '', '');
    week.style.cssText = 'display:flex;flex-direction:column;gap:2px';
    for (let d = 0; d < 7; d++) {
      const day = el('div', 'contrib-day', '');
      const rand = Math.random();
      const level = rand < 0.35 ? 0 : rand < 0.6 ? 1 : rand < 0.8 ? 2 : rand < 0.93 ? 3 : 4;
      day.setAttribute('data-level', level);
      week.appendChild(day);
    }
    graph.appendChild(week);
  }
}

/* ── Navigation ─────────────────────────────────────────────── */
function navigateTo(view) {
  State.currentView = view;
  showPresence();
  updateSidebarActive();
  const main = $('#main');
  main.innerHTML = '';

  const renderers = {
    feed:          renderFeed,
    explore:       renderExplore,
    notifications: renderNotifications,
    messages:      renderMessages,
    profile:       renderProfile,
    bookmarks:     renderBookmarks,
    settings:      renderSettings,
  };

  (renderers[view] || renderFeed)(main);
}

/* ── Feed ───────────────────────────────────────────────────── */
function renderFeed(main) {
  main.innerHTML = `
    <div class="view-tabs">
      <div class="view-tab ${State.feedTab === 'for-you' ? 'active' : ''}" data-tab="for-you">For You</div>
      <div class="view-tab ${State.feedTab === 'following' ? 'active' : ''}" data-tab="following">Following</div>
      <div class="view-tab ${State.feedTab === 'trending' ? 'active' : ''}" data-tab="trending">Trending</div>
    </div>
    <div class="stories-bar" id="stories-bar"></div>
    <div class="composer" id="composer-area"></div>
    <div id="feed"></div>
  `;

  $$('.view-tab[data-tab]', main).forEach(tab => {
    tab.addEventListener('click', () => {
      State.feedTab = tab.dataset.tab;
      $$('.view-tab', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPosts($('#feed'));
      toast(`Switched to ${tab.textContent} feed`, '📰');
    });
  });

  buildStories($('#stories-bar'));
  buildComposer($('#composer-area'));
  renderPosts($('#feed'));
}

function buildStories(container) {
  let html = `
    <div class="story-item">
      <button class="story-add-btn">＋</button>
      <span class="story-label">Your story</span>
    </div>
  `;
  USERS.forEach((u, i) => {
    html += `<div class="story-item">
      <div class="story-ring ${i > 1 ? 'seen' : ''}">
        <div class="story-avatar" style="background:${u.color}">${u.avatar}</div>
      </div>
      <span class="story-label">${u.handle}</span>
    </div>`;
  });
  container.innerHTML = html;
  $$('.story-item', container).forEach(s => {
    s.addEventListener('click', () => toast('Stories coming soon! 📸', '📸'));
  });
}

function buildComposer(container) {
  const user = State.user;
  container.innerHTML = `
    <div class="composer-inner">
      <div class="composer-row">
        <div class="composer-avatar">${user?.avatar || '👤'}</div>
        <textarea class="composer-textarea" id="post-textarea" placeholder="What are you building today?" rows="2"></textarea>
      </div>
      <pre class="composer-code-block" id="composer-code" spellcheck="false" contenteditable="false"></pre>
      <div class="composer-toolbar">
        <button class="composer-tool" id="add-code-btn" title="Add code block">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="composer-tool" title="Add image">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </button>
        <button class="composer-tool" title="Attach repo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77A5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        </button>
        <div class="composer-actions">
          <span class="char-count" id="char-count">280</span>
          <button class="post-btn" id="post-submit-btn" disabled>Post</button>
        </div>
      </div>
    </div>
  `;

  const textarea   = $('#post-textarea');
  const charCount  = $('#char-count');
  const submitBtn  = $('#post-submit-btn');
  const codeBlock  = $('#composer-code');
  const addCodeBtn = $('#add-code-btn');
  let hasCode = false;

  textarea.addEventListener('input', () => {
    const left = 280 - textarea.value.length;
    charCount.textContent = left;
    charCount.style.color = left < 20 ? 'var(--rose)' : left < 60 ? 'var(--amber)' : 'var(--text-muted)';
    submitBtn.disabled = textarea.value.trim().length === 0;
  });

  addCodeBtn.addEventListener('click', () => {
    hasCode = !hasCode;
    codeBlock.classList.toggle('visible', hasCode);
    if (hasCode) {
      codeBlock.contentEditable = 'true';
      codeBlock.textContent = '// Your code here';
      codeBlock.focus();
      addCodeBtn.style.color = 'var(--cyan)';
    } else {
      codeBlock.contentEditable = 'false';
      addCodeBtn.style.color = '';
    }
  });

  submitBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    const newPost = {
      id: 'pnew_' + Date.now(),
      userId: 'u1',
      time: 'Just now',
      content: text,
      likes: 0, comments: 0, reposts: 0,
      liked: false, reposted: false, bookmarked: false,
    };
    POSTS_DATA.unshift(newPost);
    renderPosts($('#feed'));
    textarea.value = '';
    charCount.textContent = '280';
    submitBtn.disabled = true;
    toast('Posted! Your audience is watching 👀', '🚀');
  });
}

function renderPosts(container) {
  container.innerHTML = '';
  const posts = State.feedTab === 'following'
    ? POSTS_DATA.filter((_, i) => i % 2 === 1)
    : POSTS_DATA;

  posts.forEach(post => {
    const user = getUserById(post.userId) || USERS[0];
    const postEl = buildPostCard(post, user);
    container.appendChild(postEl);
  });
}

function buildPostCard(post, user) {
  const card = el('div', 'post-card');

  let badgesHtml = user.badges.map(b => `<span class="post-badge badge-${b}">${b.toUpperCase()}</span>`).join('');
  let contentHtml = `<div class="post-content">${post.content}</div>`;
  if (post.code) {
    contentHtml += `<pre class="post-code"><span class="post-code-lang">${post.codeLang || ''}</span>${post.code}</pre>`;
  }
  if (post.repo) {
    const langColor = post.repo.langColor || '#aaa';
    contentHtml += `<div class="post-repo-card">
      <div class="post-repo-header">
        <span class="post-repo-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        </span>
        <span class="post-repo-name">${post.repo.name}</span>
      </div>
      <div class="post-repo-desc">${post.repo.desc}</div>
      <div class="post-repo-meta">
        <span class="post-repo-stat"><span class="post-repo-lang-dot" style="background:${langColor}"></span>${post.repo.lang}</span>
        <span class="post-repo-stat">⭐ ${fmtNum(post.repo.stars)}</span>
        <span class="post-repo-stat">🍴 ${post.repo.forks}</span>
      </div>
    </div>`;
  }

  card.innerHTML = `
    <div class="post-header">
      <div class="post-avatar" style="background:${user.color}">${user.avatar}</div>
      <div class="post-meta">
        <div class="post-author">
          ${user.name} ${badgesHtml}
          <span class="post-author-handle">@${user.handle}</span>
        </div>
        <div class="post-time">${post.time}</div>
      </div>
    </div>
    ${contentHtml}
    <div class="post-actions">
      <button class="post-action comment-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        ${fmtNum(post.comments)}
      </button>
      <button class="post-action repost-btn ${post.reposted ? 'reposted' : ''}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        <span class="repost-count">${fmtNum(post.reposts)}</span>
      </button>
      <button class="post-action like-btn ${post.liked ? 'liked' : ''}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${post.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="like-count">${fmtNum(post.likes)}</span>
      </button>
      <button class="post-action bookmark-btn ${post.bookmarked ? 'bookmarked' : ''}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${post.bookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="post-action" style="margin-left:auto" title="Share">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>
  `;

  // Like
  $('.like-btn', card).addEventListener('click', e => {
    e.stopPropagation();
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    const btn = e.currentTarget;
    btn.classList.toggle('liked', post.liked);
    btn.querySelector('.like-count').textContent = fmtNum(post.likes);
    btn.querySelector('svg').setAttribute('fill', post.liked ? 'currentColor' : 'none');
    if (post.liked) { btn.style.transform = 'scale(1.3)'; setTimeout(() => btn.style.transform = '', 200); }
  });

  // Repost
  $('.repost-btn', card).addEventListener('click', e => {
    e.stopPropagation();
    post.reposted = !post.reposted;
    post.reposts += post.reposted ? 1 : -1;
    const btn = e.currentTarget;
    btn.classList.toggle('reposted', post.reposted);
    btn.querySelector('.repost-count').textContent = fmtNum(post.reposts);
    toast(post.reposted ? 'Reposted to your followers' : 'Repost removed', post.reposted ? '🔁' : '↩️');
  });

  // Bookmark
  $('.bookmark-btn', card).addEventListener('click', e => {
    e.stopPropagation();
    post.bookmarked = !post.bookmarked;
    const btn = e.currentTarget;
    btn.classList.toggle('bookmarked', post.bookmarked);
    btn.querySelector('svg').setAttribute('fill', post.bookmarked ? 'currentColor' : 'none');
    toast(post.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks', post.bookmarked ? '🔖' : '');
  });

  // Comment
  $('.comment-btn', card).addEventListener('click', e => {
    e.stopPropagation();
    toast('Reply composer coming soon!', '💬');
  });

  return card;
}

/* ── Explore ────────────────────────────────────────────────── */
function renderExplore(main) {
  main.innerHTML = `
    <div class="explore-header">
      <h2>Explore</h2>
      <p>Discover projects, communities, and developers building the future</p>
    </div>
    <div class="explore-categories">
      ${['All','Frontend','Backend','Systems','ML/AI','DevOps','Design','OSS'].map((c,i) =>
        `<div class="explore-cat ${i===0?'active':''}" data-cat="${c}">${c}</div>`
      ).join('')}
    </div>
    <div style="padding:14px 16px 0;font-family:var(--font-display);font-size:16px;font-weight:800">Featured Projects</div>
    <div class="projects-grid">${PROJECTS.map(p => buildProjectCard(p)).join('')}</div>
    <div style="padding:0 16px 14px;font-family:var(--font-display);font-size:16px;font-weight:800">Communities to Join</div>
    <div class="communities-grid">${COMMUNITIES.map(c => buildCommunityCard(c)).join('')}</div>
  `;

  $$('.explore-cat', main).forEach(cat => {
    cat.addEventListener('click', () => {
      $$('.explore-cat', main).forEach(c => c.classList.remove('active'));
      cat.classList.add('active');
      toast(`Filtering by ${cat.dataset.cat}`, '🔭');
    });
  });

  $$('.join-btn', main).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.cid;
      const c = COMMUNITIES.find(c => c.id === id);
      if (!c) return;
      c.joined = !c.joined;
      btn.classList.toggle('joined', c.joined);
      btn.textContent = c.joined ? '✓ Joined' : 'Join';
      toast(c.joined ? `Joined ${c.name}! 🎉` : `Left ${c.name}`, c.joined ? '🌍' : '👋');
      buildSidebar();
    });
  });

  $$('.project-card', main).forEach(card => {
    card.addEventListener('click', () => toast('Project detail view coming soon!', '🚀'));
  });

  $$('.community-card', main).forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.cid;
      if (id) openCommunity(id);
    });
  });
}

function buildProjectCard(proj) {
  const author = getUserById(proj.author);
  return `<div class="project-card">
    <div class="project-card-preview" style="background:${proj.bg}">${proj.emoji}</div>
    <div class="project-card-body">
      <div class="project-card-name">${proj.name}</div>
      <div class="project-card-desc">${proj.desc}</div>
      <div class="project-card-author">
        <div class="project-card-author-avatar" style="background:${author?.color || '#aaa'}">${author?.avatar || '?'}</div>
        @${author?.handle || 'unknown'} · ⭐ ${fmtNum(proj.stars)}
      </div>
    </div>
  </div>`;
}

function buildCommunityCard(c) {
  return `<div class="community-card" data-cid="${c.id}" style="--c1:${c.bg}">
    <div class="community-card-icon" style="background:${c.bg};color:${c.color}">${c.icon}</div>
    <div class="community-card-name">${c.name}</div>
    <div class="community-card-desc">${c.desc}</div>
    <div class="community-card-meta">
      <span class="community-card-members">👥 ${fmtNum(c.members)}</span>
      <span class="community-card-online">${c.online} online</span>
    </div>
    <button class="join-btn ${c.joined ? 'joined' : ''}" data-cid="${c.id}">${c.joined ? '✓ Joined' : 'Join'}</button>
  </div>`;
}

/* ── Community / Channel View ───────────────────────────────── */
function openCommunity(communityId) {
  const community = COMMUNITIES.find(c => c.id === communityId);
  if (!community) return;
  State.currentCommunity = community;
  State.currentView = 'community';

  showPresence();
  updateSidebarActive();
  const main = $('#main');
  main.innerHTML = '';

  const activeChannelId = community.channels[0].id;

  const view = el('div', 'community-view');
  view.innerHTML = `
    <div class="community-sidebar">
      <div class="community-header">
        <div style="font-size:24px;margin-bottom:4px">${community.icon}</div>
        <div class="community-header-name">${community.name}</div>
        <div class="community-header-members">👥 ${fmtNum(community.members)} members</div>
      </div>
      <div class="channel-category">Text Channels</div>
      ${community.channels.filter(ch => ch.type === 'text').map(ch => `
        <div class="channel-item ${ch.id === activeChannelId ? 'active' : ''}" data-chid="${ch.id}">
          <span class="channel-icon">#</span>
          ${ch.name}
          ${ch.unread ? '<span class="channel-unread"></span>' : ''}
        </div>
      `).join('')}
      <div class="channel-category" style="margin-top:6px">Voice Channels</div>
      ${community.channels.filter(ch => ch.type === 'voice').map(ch => `
        <div class="channel-item" data-chid="${ch.id}">
          <span class="channel-icon">🔊</span>
          ${ch.name}
        </div>
      `).join('')}
    </div>
    <div class="community-chat" id="community-chat-area"></div>
    <div class="community-members-panel" id="members-panel"></div>
  `;

  main.appendChild(view);

  $$('.channel-item[data-chid]', view).forEach(item => {
    item.addEventListener('click', () => {
      $$('.channel-item', view).forEach(c => c.classList.remove('active'));
      item.classList.add('active');
      const ch = community.channels.find(c => c.id === item.dataset.chid);
      if (ch.type === 'voice') {
        toast('Voice channels require WebRTC — coming soon! 🎙️', '🔊');
        return;
      }
      renderChannelChat($('#community-chat-area'), ch, community);
    });
  });

  const firstTextChannel = community.channels.find(c => c.type === 'text');
  renderChannelChat($('#community-chat-area'), firstTextChannel, community);
  renderMembersPanel($('#members-panel'));
}

function renderChannelChat(container, channel, community) {
  const msgs = CHAT_MESSAGES[channel.id] || [];
  container.innerHTML = `
    <div class="community-chat-header">
      <span style="color:var(--text-muted);font-size:15px">#</span>
      <h3>${channel.name}</h3>
      <span>in ${community.name}</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button style="color:var(--text-muted);font-size:13px" title="Search channel">🔍</button>
        <button style="color:var(--text-muted);font-size:13px" title="Members">👥</button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages-list"></div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        <input class="chat-input" id="channel-chat-input" type="text" placeholder="Message #${channel.name}">
        <button class="composer-tool" title="Emoji">😊</button>
        <button class="composer-tool" title="Code">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="chat-send-btn" id="channel-send-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  const msgList = $('#chat-messages-list', container);
  msgs.forEach((msg, i) => {
    const prev = msgs[i - 1];
    const isContinuation = prev && prev.userId === msg.userId;
    msgList.appendChild(buildChatMessage(msg, isContinuation));
  });
  msgList.scrollTop = msgList.scrollHeight;

  const input = $('#channel-chat-input', container);
  const sendBtn = $('#channel-send-btn', container);

  function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    const newMsg = { id: 'msg_' + Date.now(), userId: 'u1', text, time: 'now' };
    const prev = msgs[msgs.length - 1];
    const isCont = prev && prev.userId === 'u1';
    msgs.push(newMsg);
    msgList.appendChild(buildChatMessage(newMsg, isCont));
    msgList.scrollTop = msgList.scrollHeight;
    input.value = '';

    // Simulate reply
    setTimeout(() => {
      const replier = USERS[Math.floor(Math.random() * USERS.length)];
      const replies = ['Nice!', 'Makes sense 👍', 'I had the same issue last week', 'Have you tried using a different approach?', 'That\'s really elegant', 'Shipping this ASAP', 'Can you open a PR?'];
      const replyMsg = { id: 'msg_r_' + Date.now(), userId: replier.id, text: replies[Math.floor(Math.random() * replies.length)], time: 'now' };
      msgs.push(replyMsg);
      msgList.appendChild(buildChatMessage(replyMsg, false));
      msgList.scrollTop = msgList.scrollHeight;
    }, 1200 + Math.random() * 800);
  }

  sendBtn.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
}

function buildChatMessage(msg, isContinuation) {
  const user = getUserById(msg.userId) || USERS[0];
  const msgEl = el('div', `msg ${isContinuation ? 'is-continuation' : ''}`);
  const textContent = msg.code
    ? `${msg.text}<br><code>${msg.code}</code>`
    : msg.text;
  msgEl.innerHTML = `
    <div class="msg-avatar" style="background:${user.color}">${user.avatar}</div>
    <div class="msg-body">
      ${!isContinuation ? `<div class="msg-header"><span class="msg-author" style="color:${user.color}">${user.name}</span><span class="msg-time">${msg.time}</span></div>` : ''}
      <div class="msg-text">${textContent}</div>
    </div>
  `;
  return msgEl;
}

function renderMembersPanel(container) {
  const onlineMembers  = USERS.slice(0, 3);
  const offlineMembers = USERS.slice(3);
  const statuses = ['online', 'online', 'idle', 'dnd', 'offline'];

  let html = `<div class="members-section-label">Online — ${onlineMembers.length}</div>`;
  onlineMembers.forEach((u, i) => {
    html += `<div class="member-item">
      <div class="member-avatar-wrap">
        <div class="member-avatar" style="background:${u.color}">${u.avatar}</div>
        <div class="member-status ${statuses[i]}"></div>
      </div>
      <span class="member-name">${u.name}</span>
    </div>`;
  });
  html += `<div class="members-section-label" style="margin-top:8px">Offline — ${offlineMembers.length}</div>`;
  offlineMembers.forEach((u, i) => {
    html += `<div class="member-item" style="opacity:0.5">
      <div class="member-avatar-wrap">
        <div class="member-avatar" style="background:${u.color}">${u.avatar}</div>
        <div class="member-status offline"></div>
      </div>
      <span class="member-name">${u.name}</span>
    </div>`;
  });
  container.innerHTML = html;
}

/* ── Notifications ──────────────────────────────────────────── */
function renderNotifications(main) {
  main.innerHTML = `
    <div class="view-tabs">
      <div class="view-tab active">All</div>
      <div class="view-tab">Mentions</div>
      <div class="view-tab">Repos</div>
    </div>
    <div class="notif-list">
      ${NOTIFICATIONS_DATA.map(n => buildNotifItem(n)).join('')}
    </div>
  `;
  $$('.view-tab', main).forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.view-tab', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
  $$('.notif-item', main).forEach(item => {
    item.addEventListener('click', () => {
      item.classList.remove('unread');
      item.querySelector('.notif-item.unread::before');
      State.unreadNotifs = Math.max(0, State.unreadNotifs - 1);
    });
  });
}

function buildNotifItem(n) {
  const user = getUserById(n.userId);
  const iconMap = { like: '❤️', follow: '👤', comment: '💬', repo: '⭐' };
  const bgMap = { like: 'notif-like', follow: 'notif-follow', comment: 'notif-comment', repo: 'notif-repo' };
  return `<div class="notif-item ${n.unread ? 'unread' : ''}">
    <div style="position:relative;flex-shrink:0">
      <div class="notif-avatar" style="background:${user?.color || '#aaa'}">${user?.avatar || '?'}</div>
      <div class="notif-icon ${bgMap[n.type]}">${iconMap[n.type]}</div>
    </div>
    <div style="flex:1;min-width:0">
      <div class="notif-text">${n.text}</div>
      <div class="notif-time">${n.time}</div>
      ${n.preview ? `<div class="notif-preview">${n.preview}</div>` : ''}
    </div>
  </div>`;
}

/* ── Messages ───────────────────────────────────────────────── */
function renderMessages(main) {
  main.innerHTML = `
    <div class="messages-layout">
      <div class="conversations-list">
        <div class="conversations-header">Messages</div>
        ${DM_CONVERSATIONS.map(dm => buildConversationItem(dm)).join('')}
        <div style="padding:14px;font-size:12px;color:var(--text-muted);text-align:center">
          <button style="color:var(--cyan);font-weight:600;font-size:13px">+ New Message</button>
        </div>
      </div>
      <div class="dm-view" id="dm-view">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--text-muted)">
          <div style="font-size:40px">💬</div>
          <div style="font-size:14px;font-weight:600">Select a conversation</div>
          <div style="font-size:12px">or start a new one</div>
        </div>
      </div>
    </div>
  `;

  $$('.conversation-item', main).forEach(item => {
    item.addEventListener('click', () => {
      $$('.conversation-item', main).forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const dmId = item.dataset.dmid;
      openDM(dmId, $('#dm-view'));
    });
  });

  // Auto-open first
  const firstItem = $('.conversation-item', main);
  if (firstItem) { firstItem.click(); }
}

function buildConversationItem(dm) {
  const user = getUserById(dm.userId);
  return `<div class="conversation-item" data-dmid="${dm.id}">
    <div class="conv-avatar" style="background:${user?.color || '#aaa'}">
      ${user?.avatar || '?'}
      ${dm.online ? '<div class="conv-online"></div>' : ''}
    </div>
    <div class="conv-info">
      <div class="conv-name">
        ${user?.name || 'Unknown'}
        <span class="conv-time">2h</span>
      </div>
      <div class="conv-preview ${dm.unread ? 'conv-unread' : ''}">${dm.preview}</div>
    </div>
    ${dm.unread ? `<span class="conv-badge" style="align-self:center">${dm.unread}</span>` : ''}
  </div>`;
}

function openDM(dmId, container) {
  const dm = DM_CONVERSATIONS.find(d => d.id === dmId);
  if (!dm) return;
  const user = getUserById(dm.userId);
  dm.unread = 0;

  container.innerHTML = `
    <div class="dm-header">
      <div class="conv-avatar" style="background:${user?.color};width:36px;height:36px;font-size:14px">${user?.avatar}</div>
      <div>
        <div style="font-weight:700;font-size:14px">${user?.name}</div>
        <div style="font-size:11px;color:var(--${dm.online ? 'emerald' : 'text-muted'})">${dm.online ? '● Online' : 'Offline'}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="topbar-action-btn" title="Video call" onclick="window.cyanet.toast('Video calling coming soon! 📹','📹')">📹</button>
        <button class="topbar-action-btn" title="Profile" onclick="window.cyanet.toast('Viewing profile','👤')">👤</button>
      </div>
    </div>
    <div class="dm-messages" id="active-dm-messages">
      ${dm.messages.map(m => buildDMMessage(m, user)).join('')}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        <input class="chat-input" id="dm-input" type="text" placeholder="Message ${user?.name}…">
        <button class="composer-tool">😊</button>
        <button class="chat-send-btn" id="dm-send-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  const msgList = $('#active-dm-messages', container);
  msgList.scrollTop = msgList.scrollHeight;

  const input = $('#dm-input', container);
  const sendBtn = $('#dm-send-btn', container);

  function sendDM() {
    const text = input.value.trim();
    if (!text) return;
    const msgEl = el('div', 'msg dm-own');
    msgEl.innerHTML = `<div class="msg-body"><div class="msg-text">${text}</div></div>`;
    msgList.appendChild(msgEl);
    msgList.scrollTop = msgList.scrollHeight;
    input.value = '';
    dm.messages.push({ id: 'dm_' + Date.now(), from: 'me', text, own: true });

    // Typing indicator
    const typing = el('div', 'msg dm-other');
    typing.innerHTML = `
      <div class="msg-avatar" style="background:${user?.color}">${user?.avatar}</div>
      <div class="msg-body"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>
    `;
    msgList.appendChild(typing);
    msgList.scrollTop = msgList.scrollHeight;

    setTimeout(() => {
      typing.remove();
      const replies = ['Got it!', 'Makes sense!', 'Thanks for the heads up 👍', 'Will check it out', 'Sounds great!', '🔥'];
      const reply = replies[Math.floor(Math.random() * replies.length)];
      const replyEl = el('div', 'msg dm-other');
      replyEl.innerHTML = `
        <div class="msg-avatar" style="background:${user?.color}">${user?.avatar}</div>
        <div class="msg-body"><div class="msg-text" style="background:var(--bg-elevated);padding:8px 12px;border-radius:16px 16px 16px 4px">${reply}</div></div>
      `;
      msgList.appendChild(replyEl);
      msgList.scrollTop = msgList.scrollHeight;
    }, 1500 + Math.random() * 1000);
  }

  sendBtn.addEventListener('click', sendDM);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendDM(); } });
}

function buildDMMessage(msg, otherUser) {
  if (msg.own) {
    return `<div class="msg dm-own">
      <div class="msg-body">
        <div class="msg-text" style="background:linear-gradient(135deg,var(--cyan),var(--violet));color:var(--bg-void);padding:8px 12px;border-radius:16px 16px 4px 16px;font-weight:500">${msg.text}</div>
      </div>
    </div>`;
  }
  return `<div class="msg dm-other">
    <div class="msg-avatar" style="background:${otherUser?.color}">${otherUser?.avatar}</div>
    <div class="msg-body">
      <div class="msg-text" style="background:var(--bg-elevated);padding:8px 12px;border-radius:16px 16px 16px 4px">${msg.text}</div>
    </div>
  </div>`;
}

/* ── Profile ────────────────────────────────────────────────── */
function renderProfile(main) {
  const user = { ...USERS[0], id: 'me' };
  main.innerHTML = `
    <div class="profile-cover">
      <div class="profile-cover-art"></div>
    </div>
    <div class="profile-info-section">
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar">${user.avatar}</div>
          <div class="profile-online-dot"></div>
        </div>
        <div class="profile-actions" style="position:static;margin-bottom:10px;display:flex;gap:8px;align-items:center">
          <button class="profile-action-btn secondary" onclick="window.cyanet.toast('Edit profile coming soon!','✏️')">Edit Profile</button>
          <button class="profile-action-btn secondary" onclick="window.cyanet.toast('Share link copied!','🔗')">🔗</button>
        </div>
      </div>
      <div class="profile-name">${user.name}</div>
      <div class="profile-handle">@${user.handle} <span style="color:var(--emerald);font-size:12px">● Online</span></div>
      <div class="profile-bio">${user.bio}</div>
      <div class="profile-meta">
        <div class="profile-meta-item">📍 <span>${user.location}</span></div>
        <div class="profile-meta-item">🔗 <span style="color:var(--cyan)">${user.website}</span></div>
        <div class="profile-meta-item">📅 <span>Joined ${user.joined}</span></div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${fmtNum(user.following)}</strong> <span>Following</span></div>
        <div class="profile-stat"><strong>${fmtNum(user.followers)}</strong> <span>Followers</span></div>
        <div class="profile-stat"><strong>${user.repos}</strong> <span>Repos</span></div>
      </div>
      <div class="tech-stack">
        ${user.tech.map(t => `<span class="tech-badge">${t}</span>`).join('')}
      </div>
    </div>
    <div class="profile-tabs">
      <div class="profile-tab-list">
        ${['Posts','Replies','Projects','Stars','Activity'].map((t,i) =>
          `<div class="profile-tab ${i===0?'active':''}" data-ptab="${t}">${t}</div>`
        ).join('')}
      </div>
    </div>
    <div id="profile-content"></div>
  `;

  $$('.profile-tab', main).forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.profile-tab', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.ptab === 'Posts') {
        renderPosts($('#profile-content'));
      } else if (tab.dataset.ptab === 'Projects') {
        const grid = el('div', 'projects-grid');
        grid.innerHTML = PROJECTS.filter(p => p.author === 'u1').map(p => buildProjectCard(p)).join('');
        $('#profile-content').innerHTML = '';
        $('#profile-content').appendChild(grid);
      } else {
        $('#profile-content').innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:14px">${tab.dataset.ptab} coming soon 🔜</div>`;
      }
    });
  });

  renderPosts($('#profile-content'));
}

/* ── Bookmarks ──────────────────────────────────────────────── */
function renderBookmarks(main) {
  const bookmarked = POSTS_DATA.filter(p => p.bookmarked);
  main.innerHTML = `
    <div style="padding:20px 16px;border-bottom:1px solid var(--border)">
      <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">Bookmarks</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:2px">${bookmarked.length} saved post${bookmarked.length !== 1 ? 's' : ''}</p>
    </div>
    <div id="bookmark-feed"></div>
  `;
  if (bookmarked.length === 0) {
    $('#bookmark-feed').innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--text-muted)">
      <div style="font-size:40px;margin-bottom:10px">🔖</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:4px">No bookmarks yet</div>
      <div style="font-size:13px">Save posts to read them later</div>
    </div>`;
  } else {
    bookmarked.forEach(post => {
      const user = getUserById(post.userId) || USERS[0];
      $('#bookmark-feed').appendChild(buildPostCard(post, user));
    });
  }
}

/* ── Settings ───────────────────────────────────────────────── */
function renderSettings(main) {
  main.innerHTML = `
    <div style="padding:20px 16px;border-bottom:1px solid var(--border)">
      <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">Settings</h2>
    </div>
    <div style="padding:16px;max-width:560px">
      ${[
        { section: 'Account', items: ['Edit Profile', 'Change Username', 'Email & Notifications', 'Connected Accounts (GitHub, GitLab)'] },
        { section: 'Appearance', items: ['Theme (Dark / Light / System)', 'Accent Color', 'Font Size', 'Compact Mode'] },
        { section: 'Privacy & Safety', items: ['Who can message me', 'Block list', 'Two-factor Authentication', 'Download my data'] },
        { section: 'Developer', items: ['API Keys & Access Tokens', 'Webhook URLs', 'OAuth Applications', 'GraphQL Explorer'] },
      ].map(s => `
        <div style="margin-bottom:20px">
          <div style="font-family:var(--font-display);font-size:15px;font-weight:700;margin-bottom:10px">${s.section}</div>
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
            ${s.items.map((item, i, arr) => `
              <div style="padding:13px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:var(--transition);${i < arr.length-1 ? 'border-bottom:1px solid var(--border)' : ''}"
                   onmouseenter="this.style.background='var(--bg-elevated)'"
                   onmouseleave="this.style.background=''"
                   onclick="window.cyanet.toast('${item} — coming soon!','⚙️')">
                <span style="font-size:14px">${item}</span>
                <span style="color:var(--text-muted)">›</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div style="padding:16px;text-align:center">
        <button onclick="window.cyanet.toast('Logging out...','👋');setTimeout(()=>location.reload(),1200)"
          style="color:var(--rose);font-size:14px;font-weight:600">Sign Out</button>
      </div>
    </div>
  `;
}

/* ── New Post Modal ─────────────────────────────────────────── */
function openNewPostModal() {
  const overlay = $('#modal-overlay');
  overlay.classList.add('open');
  const body = $('#modal-body');
  body.innerHTML = `
    <div class="composer-row" style="margin-bottom:10px">
      <div class="composer-avatar">${State.user?.avatar || '👤'}</div>
      <textarea id="modal-post-text" class="composer-textarea" placeholder="What are you building today?" rows="4" style="min-height:100px"></textarea>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid var(--border)">
      <div style="display:flex;gap:8px">
        <button class="composer-tool">📷</button>
        <button class="composer-tool">💻</button>
        <button class="composer-tool">🔗</button>
        <button class="composer-tool">😊</button>
      </div>
      <button class="post-btn" id="modal-post-btn" disabled>Post</button>
    </div>
  `;
  const textarea = $('#modal-post-text');
  const postBtn  = $('#modal-post-btn');
  textarea.addEventListener('input', () => { postBtn.disabled = !textarea.value.trim(); });
  textarea.focus();
  postBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    POSTS_DATA.unshift({ id: 'modal_' + Date.now(), userId: 'u1', time: 'Just now', content: text, likes: 0, comments: 0, reposts: 0, liked: false, reposted: false, bookmarked: false });
    overlay.classList.remove('open');
    if (State.currentView === 'feed') renderPosts($('#feed'));
    toast('Posted successfully! 🚀', '✅');
  });
}

/* ── Collaborations Data ────────────────────────────────────── */
const COLLABS = [
  {
    id: 'col1', title: 'Waveform Studio', icon: '🎵',
    bg: 'linear-gradient(135deg,#1a0a2e,#0a1628)',
    desc: 'Building a browser-based DAW with WASM audio processing. Looking for a frontend engineer who loves music and performance.',
    tags: ['Rust', 'WASM', 'React', 'WebAudio'],
    author: 'u3', members: ['u3','u5'], spots: 2, applied: false,
  },
  {
    id: 'col2', title: 'Cascade DB', icon: '🗄️',
    bg: 'linear-gradient(135deg,#1f0a0a,#0a0a1f)',
    desc: 'Distributed key-value store in Rust. Need a systems engineer familiar with Raft consensus and storage engines.',
    tags: ['Rust','Distributed','Raft','Storage'],
    author: 'u2', members: ['u2'], spots: 3, applied: false,
  },
  {
    id: 'col3', title: 'TypeTrace', icon: '🔬',
    bg: 'linear-gradient(135deg,#1a0a18,#0a181a)',
    desc: 'Real-time TypeScript type visualizer. Looking for a TypeScript wizard and someone who can make complex things look simple.',
    tags: ['TypeScript','AST','React','Visualization'],
    author: 'u1', members: ['u1','u4'], spots: 1, applied: true,
  },
  {
    id: 'col4', title: 'Rift UI', icon: '⚡',
    bg: 'linear-gradient(135deg,#0a1f0a,#0a0a1f)',
    desc: 'Component library with physics-based animations using Matter.js + Framer Motion. Seeking a design engineer.',
    tags: ['CSS','Animation','React','Design'],
    author: 'u5', members: ['u5','u1','u3'], spots: 1, applied: false,
  },
];

/* ── Story Content Data ─────────────────────────────────────── */
const STORIES_CONTENT = [
  { userId: 'u1', bg: 'linear-gradient(135deg,#0a1628,#1a0a2e)', content: '🚀', text: 'Just shipped v2.0 of my design system. 47 components, full dark mode, a11y tested. Thread below 👇', time: '2h ago' },
  { userId: 'u2', bg: 'linear-gradient(135deg,#1a0a0a,#0a1628)', content: '⚡', text: 'Zero-copy serialization: 4ms → 0.3ms. Sometimes the old ways are the fastest ways. #Rust', time: '5h ago' },
  { userId: 'u3', bg: 'linear-gradient(135deg,#0a1a0a,#0a0a1f)', content: '🧠', text: 'New fine-tuned model is LIVE on HuggingFace. 7B params, code review focused, 200ms p95.', time: '8h ago' },
  { userId: 'u4', bg: 'linear-gradient(135deg,#1a1a0a,#0a0a1a)', content: '🐳', text: 'Kubernetes cluster running 12 microservices, zero downtime deployments since 90 days. Let\'s gooo', time: '1d ago' },
  { userId: 'u5', bg: 'linear-gradient(135deg,#1a0a14,#0a1a14)', content: '🎨', text: 'CSS subgrid changes EVERYTHING. Finally, cards that actually align. Demo in my latest post.', time: '1d ago' },
];

/* ── Repo Data ──────────────────────────────────────────────── */
const USER_REPOS = [
  { name: 'react-hooks-collection', desc: 'A curated set of production-ready React hooks', lang: 'TypeScript', langColor: '#3178c6', stars: 2140, forks: 312, updated: '2 days ago' },
  { name: 'graphql-query-builder', desc: 'Type-safe GraphQL query builder for TypeScript', lang: 'TypeScript', langColor: '#3178c6', stars: 890, forks: 67, updated: '1 week ago' },
  { name: 'supabase-realtime-hooks', desc: 'React hooks for Supabase Realtime subscriptions', lang: 'TypeScript', langColor: '#3178c6', stars: 1560, forks: 203, updated: '3 days ago' },
  { name: 'cyanet-ui', desc: 'UI components for the Cyanet platform', lang: 'CSS', langColor: '#563d7c', stars: 445, forks: 38, updated: 'Today' },
  { name: 'tailwind-gradient-mesh', desc: 'Tailwind plugin for CSS gradient meshes', lang: 'JavaScript', langColor: '#f1e05a', stars: 3210, forks: 189, updated: '5 days ago' },
  { name: 'next-auth-starter', desc: 'Production-ready Next.js + Supabase auth boilerplate', lang: 'TypeScript', langColor: '#3178c6', stars: 5670, forks: 891, updated: '1 week ago' },
];

/* ── Live Feed Simulation ───────────────────────────────────── */
const LIVE_UPDATES = [
  () => { toast(`${USERS[Math.floor(Math.random()*USERS.length)].name} just posted a new thread 📝`, '💬'); },
  () => { toast(`${fmtNum(Math.floor(Math.random()*50+10))} people online in #react-frontend right now`, '👥'); },
  () => { toast('New trending topic: #DenoVsNode is heating up 🔥', '📈'); },
  () => { toast(`${USERS[Math.floor(Math.random()*USERS.length)].name} followed you`, '👤'); },
  () => { toast('Your post got 100 likes! 🎉', '❤️'); },
];

let liveInterval = null;

function startLiveFeed() {
  if (liveInterval) return;
  liveInterval = setInterval(() => {
    if (document.hidden) return;
    const fn = LIVE_UPDATES[Math.floor(Math.random() * LIVE_UPDATES.length)];
    fn();
  }, 18000);
}

/* ── Voice Channel ──────────────────────────────────────────── */
function renderVoiceChannel(container, channel, community) {
  const participants = USERS.slice(0, 3);
  let speakingIdx = 0;

  container.innerHTML = `
    <div class="community-chat-header">
      <span style="font-size:18px">🔊</span>
      <h3>${channel.name}</h3>
      <span>in ${community.name}</span>
      <div class="live-badge" style="margin-left:auto"><div class="live-dot"></div>LIVE</div>
    </div>
    <div class="voice-channel-view">
      <div class="voice-room-title">
        🔊 ${channel.name}
        <span style="font-size:13px;color:var(--text-muted);font-family:var(--font-body);font-weight:400">${participants.length} in call</span>
      </div>
      <div class="voice-participants" id="voice-participants-grid"></div>
      <div class="voice-controls">
        <button class="voice-ctrl-btn active" id="voice-mic-btn" title="Toggle mic">🎙️</button>
        <button class="voice-ctrl-btn" id="voice-video-btn" title="Toggle camera">📹</button>
        <button class="voice-ctrl-btn" id="voice-screen-btn" title="Share screen">🖥️</button>
        <button class="voice-ctrl-btn" id="voice-deafen-btn" title="Deafen">🔇</button>
        <button class="voice-ctrl-btn danger" id="voice-leave-btn" title="Leave call">📞</button>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:-10px">
        Connected · <span id="voice-timer">00:00</span>
      </div>
    </div>
  `;

  // Render participants
  const grid = document.getElementById('voice-participants-grid');
  const myParticipant = { ...State.user, id: 'me', name: State.user?.name || 'You', color: '#63d9ff', avatar: State.user?.avatar || '👤' };
  const allParticipants = [myParticipant, ...participants];

  allParticipants.forEach((u, i) => {
    const div = el('div', 'voice-participant');
    div.innerHTML = `
      <div class="voice-avatar-ring ${i === 0 ? 'speaking' : ''}" id="vp-ring-${i}">
        <div class="voice-avatar" style="background:${u.color}">${u.avatar}</div>
      </div>
      <div class="voice-participant-name">${u.name.split(' ')[0]}</div>
      <div class="voice-participant-mic">${i === 0 ? '🎙️ Speaking' : '🔇 Muted'}</div>
    `;
    grid.appendChild(div);
  });

  // Simulate speaking rotation
  let speakInterval = setInterval(() => {
    document.querySelectorAll('.voice-avatar-ring').forEach((r, i) => {
      r.classList.toggle('speaking', i === speakingIdx);
    });
    speakingIdx = (speakingIdx + 1) % allParticipants.length;
  }, 3000);

  // Voice timer
  let secs = 0;
  const timerEl = document.getElementById('voice-timer');
  const timerInterval = setInterval(() => {
    secs++;
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
  }, 1000);

  // Controls
  let micOn = true, videoOn = false, screenOn = false, deafened = false;

  document.getElementById('voice-mic-btn')?.addEventListener('click', (e) => {
    micOn = !micOn;
    e.currentTarget.textContent = micOn ? '🎙️' : '🔇';
    e.currentTarget.classList.toggle('active', micOn);
    toast(micOn ? 'Mic on' : 'Mic muted', micOn ? '🎙️' : '🔇');
  });
  document.getElementById('voice-video-btn')?.addEventListener('click', (e) => {
    videoOn = !videoOn;
    e.currentTarget.classList.toggle('active', videoOn);
    toast(videoOn ? 'Camera on' : 'Camera off', '📹');
  });
  document.getElementById('voice-screen-btn')?.addEventListener('click', (e) => {
    screenOn = !screenOn;
    e.currentTarget.classList.toggle('active', screenOn);
    toast(screenOn ? 'Screen sharing started' : 'Screen sharing stopped', '🖥️');
  });
  document.getElementById('voice-deafen-btn')?.addEventListener('click', (e) => {
    deafened = !deafened;
    e.currentTarget.classList.toggle('active', deafened);
    toast(deafened ? 'Deafened' : 'Undeafened', '🔇');
  });
  document.getElementById('voice-leave-btn')?.addEventListener('click', () => {
    clearInterval(speakInterval);
    clearInterval(timerInterval);
    toast('Left voice channel', '👋');
    const firstTextCh = State.currentCommunity?.channels.find(c => c.type === 'text');
    if (firstTextCh) renderChannelChat(container, firstTextCh, State.currentCommunity);
  });

  // Cleanup on navigation
  container._cleanup = () => {
    clearInterval(speakInterval);
    clearInterval(timerInterval);
  };
}

/* ── Thread / Post Detail ───────────────────────────────────── */
function openPostThread(post) {
  const user = getUserById(post.userId) || USERS[0];
  const main = document.getElementById('main');

  const replies = [
    { userId: 'u3', text: 'This is exactly what I needed, thank you! Been struggling with this pattern for weeks.', time: '45m ago', likes: 28 },
    { userId: 'u4', text: 'Interesting approach — have you benchmarked it against the naive solution? Curious about the perf diff in prod.', time: '1h ago', likes: 12 },
    { userId: 'u5', text: 'The CSS approach you mentioned works well but breaks in Safari 15. Here\'s a workaround: <code>@supports selector(:has(*))</code>', time: '2h ago', likes: 47 },
    { userId: 'u1', text: 'Love this! Just applied it to our design system and it cut our component complexity by 40%.', time: '2h ago', likes: 89 },
  ];

  let badgesHtml = user.badges.map(b => `<span class="post-badge badge-${b}">${b.toUpperCase()}</span>`).join('');
  let contentHtml = post.content;
  let codeHtml = post.code ? `<pre class="post-code"><span class="post-code-lang">${post.codeLang || ''}</span>${post.code}</pre>` : '';

  main.innerHTML = `
    <div class="thread-view">
      <div class="thread-back-btn" id="thread-back">
        ← Back to feed
      </div>
      <div class="thread-main-post">
        <div class="post-header">
          <div class="post-avatar" style="background:${user.color}">${user.avatar}</div>
          <div class="post-meta">
            <div class="post-author">${user.name} ${badgesHtml} <span class="post-author-handle">@${user.handle}</span></div>
            <div class="post-time">${post.time}</div>
          </div>
        </div>
        <div class="post-content" style="font-size:18px;margin:12px 0">${contentHtml}</div>
        ${codeHtml}
        <div class="post-stats">
          <div class="thread-stat"><strong>${fmtNum(post.reposts)}</strong> <span>Reposts</span></div>
          <div class="thread-stat"><strong>${fmtNum(post.likes)}</strong> <span>Likes</span></div>
          <div class="thread-stat"><strong>${replies.length}</strong> <span>Replies</span></div>
        </div>
        <div class="post-actions">
          <button class="post-action comment-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Reply
          </button>
          <button class="post-action repost-btn ${post.reposted ? 'reposted' : ''}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            ${fmtNum(post.reposts)}
          </button>
          <button class="post-action like-btn ${post.liked ? 'liked' : ''}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${post.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${fmtNum(post.likes)}
          </button>
        </div>
        <!-- Reply Composer in thread -->
        <div style="display:flex;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <div class="composer-avatar">${State.user?.avatar || '👤'}</div>
          <div style="flex:1">
            <input type="text" id="thread-reply-input" placeholder="Tweet your reply…"
              style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-full);padding:9px 16px;color:var(--text-primary);font-size:14px;font-family:var(--font-body)">
          </div>
          <button class="post-btn" id="thread-reply-btn">Reply</button>
        </div>
      </div>
      <div id="thread-replies-list">
        ${replies.map(r => {
          const ru = getUserById(r.userId) || USERS[0];
          return `<div class="thread-reply">
            <div class="post-avatar" style="background:${ru.color};width:36px;height:36px;font-size:13px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--bg-void);flex-shrink:0">${ru.avatar}</div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span style="font-weight:700;font-size:13px">${ru.name}</span>
                <span style="color:var(--text-muted);font-size:12px">@${ru.handle}</span>
                <span style="color:var(--text-muted);font-size:12px">· ${r.time}</span>
              </div>
              <div style="font-size:14px;line-height:1.55;margin-bottom:6px">${r.text}</div>
              <div style="display:flex;gap:14px;font-size:12px;color:var(--text-muted)">
                <span style="cursor:pointer" onclick="window.cyanet.toast('Liked reply ❤️','❤️')">❤️ ${r.likes}</span>
                <span style="cursor:pointer" onclick="window.cyanet.toast('Replying…','💬')">💬 Reply</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('thread-back').addEventListener('click', () => navigateTo('feed'));
  document.getElementById('thread-reply-btn').addEventListener('click', () => {
    const input = document.getElementById('thread-reply-input');
    const text = input.value.trim();
    if (!text) return;
    const repliesContainer = document.getElementById('thread-replies-list');
    const replyDiv = el('div', 'thread-reply');
    replyDiv.innerHTML = `
      <div class="post-avatar" style="background:${State.user?.color || '#63d9ff'};width:36px;height:36px;font-size:13px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--bg-void);flex-shrink:0">${State.user?.avatar || '👤'}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-weight:700;font-size:13px">${State.user?.name || 'You'}</span>
          <span style="color:var(--text-muted);font-size:12px">· Just now</span>
        </div>
        <div style="font-size:14px;line-height:1.55">${text}</div>
      </div>
    `;
    repliesContainer.insertBefore(replyDiv, repliesContainer.firstChild);
    input.value = '';
    toast('Reply posted! 💬', '✅');
  });
}

/* ── Search Overlay ─────────────────────────────────────────── */
function buildSearchOverlay() {
  const existing = document.getElementById('search-overlay');
  if (existing) { existing.classList.toggle('open'); return; }

  const overlay = el('div', 'search-overlay');
  overlay.id = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-panel">
      <div class="search-panel-input-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input class="search-panel-input" id="search-panel-input" placeholder="Search people, repos, communities, posts…" autofocus>
        <span class="search-shortcut">Esc</span>
      </div>
      <div class="search-results-section" id="search-results">
        <div class="search-section-label">People</div>
        ${USERS.map(u => `
          <div class="search-result-item" data-action="profile">
            <div class="search-result-avatar" style="background:${u.color}">${u.avatar}</div>
            <div>
              <div class="search-result-main">${u.name}</div>
              <div class="search-result-sub">@${u.handle} · ${fmtNum(u.followers)} followers</div>
            </div>
          </div>
        `).join('')}
        <div class="search-section-label">Communities</div>
        ${COMMUNITIES.slice(0, 3).map(c => `
          <div class="search-result-item" data-cid="${c.id}">
            <div class="search-result-icon" style="background:${c.bg};color:${c.color}">${c.icon}</div>
            <div>
              <div class="search-result-main">${c.name}</div>
              <div class="search-result-sub">${fmtNum(c.members)} members</div>
            </div>
          </div>
        `).join('')}
        <div class="search-section-label">Trending Tags</div>
        ${TRENDING.map(t => `
          <div class="search-result-item">
            <div class="search-result-icon">#</div>
            <div>
              <div class="search-result-main">${t.tag}</div>
              <div class="search-result-sub">${t.count}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const input = document.getElementById('search-panel-input');
  input?.focus();

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSearch();
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { closeSearch(); document.removeEventListener('keydown', escHandler); }
  });

  $$('.search-result-item[data-cid]', overlay).forEach(item => {
    item.addEventListener('click', () => { closeSearch(); openCommunity(item.dataset.cid); });
  });
  $$('.search-result-item[data-action="profile"]', overlay).forEach(item => {
    item.addEventListener('click', () => { closeSearch(); navigateTo('profile'); });
  });

  input?.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    if (!q) return;
    toast(`Searching for "${input.value}"…`, '🔍');
  });
}

function closeSearch() {
  const overlay = document.getElementById('search-overlay');
  if (overlay) { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); }
}

/* ── Story Viewer ───────────────────────────────────────────── */
let storyModalOpen = false;
let storyIndex = 0;
let storyProgressTimer = null;

function openStory(storyIdx) {
  if (storyModalOpen) return;
  storyModalOpen = true;
  storyIndex = storyIdx;

  const overlay = el('div', 'story-modal-overlay');
  overlay.id = 'story-modal-overlay';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    renderStoryModal(overlay);
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeStoryModal(overlay);
  });
}

function renderStoryModal(overlay) {
  const story = STORIES_CONTENT[storyIndex % STORIES_CONTENT.length];
  const user = getUserById(story.userId) || USERS[0];

  overlay.innerHTML = `
    <div class="story-modal">
      <div class="story-progress-bars">
        ${STORIES_CONTENT.map((_, i) => `
          <div class="story-progress-bar">
            <div class="story-progress-fill ${i < storyIndex ? '' : i === storyIndex ? 'active' : ''}" style="width:${i < storyIndex ? '100' : i === storyIndex ? '0' : '0'}%"></div>
          </div>
        `).join('')}
      </div>
      <div class="story-header-overlay">
        <div class="story-user-avatar" style="background:${user.color}">${user.avatar}</div>
        <div class="story-user-info">
          <div class="story-user-name">${user.name}</div>
          <div class="story-user-time">${story.time}</div>
        </div>
        <button class="story-close-btn" id="story-close">✕</button>
      </div>
      <div class="story-content" style="background:${story.bg};aspect-ratio:9/16">
        <span style="font-size:72px;filter:drop-shadow(0 0 20px rgba(255,255,255,0.3))">${story.content}</span>
        <div class="story-text-overlay">${story.text}</div>
      </div>
      <div class="story-reactions" style="position:absolute;bottom:14px;left:14px;right:14px;display:flex;gap:8px;align-items:center">
        <input class="story-reply-input" placeholder="Send a reply…">
        <span class="story-emoji-btn" onclick="window.cyanet.toast('❤️ Reacted!','❤️')">❤️</span>
        <span class="story-emoji-btn" onclick="window.cyanet.toast('🔥 Reacted!','🔥')">🔥</span>
        <span class="story-emoji-btn" onclick="window.cyanet.toast('😮 Reacted!','😮')">😮</span>
      </div>
    </div>
  `;

  // Start progress
  const activeFill = overlay.querySelectorAll('.story-progress-fill')[storyIndex];
  if (activeFill) {
    requestAnimationFrame(() => { activeFill.style.width = '100%'; });
  }

  storyProgressTimer = setTimeout(() => {
    if (storyIndex < STORIES_CONTENT.length - 1) {
      storyIndex++;
      renderStoryModal(overlay);
    } else {
      closeStoryModal(overlay);
    }
  }, 5000);

  document.getElementById('story-close')?.addEventListener('click', () => closeStoryModal(overlay));

  // Left/right navigation
  overlay.querySelector('.story-modal').addEventListener('click', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    clearTimeout(storyProgressTimer);
    if (x < rect.width / 2 && storyIndex > 0) { storyIndex--; }
    else if (x >= rect.width / 2 && storyIndex < STORIES_CONTENT.length - 1) { storyIndex++; }
    renderStoryModal(overlay);
  });
}

function closeStoryModal(overlay) {
  clearTimeout(storyProgressTimer);
  storyModalOpen = false;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 200);
}

/* ── Collaborations View ────────────────────────────────────── */
function renderCollabs(main) {
  State.currentView = 'collabs';
  updateSidebarActive();
  main.innerHTML = `
    <div class="collabs-header">
      <h2>Collaborations</h2>
      <button class="new-collab-btn" id="new-collab-btn">+ Post a Project</button>
    </div>
    <div style="padding:0 16px 10px;font-size:13px;color:var(--text-muted)">
      Find projects looking for collaborators, or post your own.
    </div>
    <div class="collabs-grid" id="collabs-grid">
      ${COLLABS.map(c => buildCollabCard(c)).join('')}
    </div>
  `;

  document.getElementById('new-collab-btn')?.addEventListener('click', () => openNewCollabModal());
  $$('.collab-apply-btn', main).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const colId = btn.dataset.colid;
      const col = COLLABS.find(c => c.id === colId);
      if (!col) return;
      col.applied = !col.applied;
      btn.textContent = col.applied ? '✓ Applied' : 'Apply to Join';
      btn.classList.toggle('applied', col.applied);
      toast(col.applied ? `Applied to ${col.title}! You'll hear back soon.` : `Withdrew application from ${col.title}`, col.applied ? '🚀' : '👋');
    });
  });
}

function buildCollabCard(col) {
  const author = getUserById(col.author);
  const memberAvatars = col.members.map(mid => {
    const u = getUserById(mid);
    return `<div class="collab-avatar-small" style="background:${u?.color || '#aaa'}">${u?.avatar || '?'}</div>`;
  }).join('');

  return `<div class="collab-card">
    <div class="collab-card-header">
      <div class="collab-card-icon" style="background:${col.bg}">${col.icon}</div>
      <div>
        <div class="collab-card-title">${col.title}</div>
        <div class="collab-card-author">by @${author?.handle || 'unknown'}</div>
      </div>
      ${col.spots > 0 ? `<span style="margin-left:auto;background:rgba(52,211,153,0.15);color:var(--emerald);padding:3px 8px;border-radius:var(--radius-full);font-size:11px;font-weight:700">${col.spots} spot${col.spots > 1 ? 's' : ''} open</span>` : `<span style="margin-left:auto;color:var(--text-muted);font-size:11px">Full</span>`}
    </div>
    <div class="collab-card-desc">${col.desc}</div>
    <div class="collab-tags">${col.tags.map(t => `<span class="collab-tag">${t}</span>`).join('')}</div>
    <div class="collab-footer">
      <div class="collab-avatars">${memberAvatars}</div>
      <span class="collab-member-count">${col.members.length} member${col.members.length !== 1 ? 's' : ''}</span>
      <button class="collab-apply-btn ${col.applied ? 'applied' : ''}" data-colid="${col.id}">${col.applied ? '✓ Applied' : 'Apply to Join'}</button>
    </div>
  </div>`;
}

function openNewCollabModal() {
  const overlay = document.getElementById('modal-overlay');
  const body    = document.getElementById('modal-body');
  document.querySelector('.modal-title').textContent = 'Post a Collaboration';
  body.innerHTML = `
    <div class="edit-form-group">
      <label>Project Name</label>
      <input type="text" class="edit-form-input" id="col-name" placeholder="e.g. Waveform Studio">
    </div>
    <div class="edit-form-group">
      <label>Short Description</label>
      <textarea class="edit-form-textarea" id="col-desc" placeholder="What are you building and who are you looking for?"></textarea>
    </div>
    <div class="edit-form-row">
      <div class="edit-form-group">
        <label>Tech Stack (comma-separated)</label>
        <input type="text" class="edit-form-input" id="col-tags" placeholder="React, TypeScript, Rust">
      </div>
      <div class="edit-form-group">
        <label>Open Spots</label>
        <input type="number" class="edit-form-input" id="col-spots" placeholder="2" min="1" max="10">
      </div>
    </div>
    <div class="edit-form-footer">
      <button class="edit-cancel-btn" onclick="document.getElementById('modal-overlay').classList.remove('open')">Cancel</button>
      <button class="edit-save-btn" id="col-post-btn">Post Project</button>
    </div>
  `;
  overlay.classList.add('open');

  document.getElementById('col-post-btn')?.addEventListener('click', () => {
    const name = document.getElementById('col-name').value.trim();
    if (!name) { toast('Give your project a name!', '⚠️'); return; }
    const tags = document.getElementById('col-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const spots = parseInt(document.getElementById('col-spots').value) || 2;
    const desc = document.getElementById('col-desc').value.trim();
    COLLABS.unshift({ id: 'col_' + Date.now(), title: name, icon: '🚀', bg: 'linear-gradient(135deg,#0a1628,#0a0a1f)', desc: desc || 'An exciting new project.', tags, author: 'u1', members: ['u1'], spots, applied: false });
    overlay.classList.remove('open');
    renderCollabs(document.getElementById('main'));
    toast(`"${name}" posted! 🚀`, '✅');
  });
}

/* ── Profile Edit Modal ─────────────────────────────────────── */
function openProfileEditModal() {
  const overlay = document.getElementById('modal-overlay');
  const body    = document.getElementById('modal-body');
  const u       = State.user || USERS[0];
  document.querySelector('.modal-title').textContent = 'Edit Profile';

  body.innerHTML = `
    <div class="edit-avatar-section">
      <div class="edit-avatar-preview">${u.avatar}</div>
      <div class="edit-avatar-actions">
        <button class="edit-avatar-btn" onclick="window.cyanet.toast('Photo upload coming soon!','📷')">Change Avatar</button>
        <button class="edit-avatar-btn" onclick="window.cyanet.toast('Cover upload coming soon!','🖼️')">Change Cover</button>
      </div>
    </div>
    <div class="edit-form-row">
      <div class="edit-form-group">
        <label>Display Name</label>
        <input type="text" class="edit-form-input" id="edit-name" value="${u.name}">
      </div>
      <div class="edit-form-group">
        <label>Username</label>
        <input type="text" class="edit-form-input" id="edit-handle" value="${u.handle}">
      </div>
    </div>
    <div class="edit-form-group">
      <label>Bio</label>
      <textarea class="edit-form-textarea" id="edit-bio">${u.bio}</textarea>
    </div>
    <div class="edit-form-row">
      <div class="edit-form-group">
        <label>Location</label>
        <input type="text" class="edit-form-input" id="edit-location" value="${u.location}">
      </div>
      <div class="edit-form-group">
        <label>Website</label>
        <input type="text" class="edit-form-input" id="edit-website" value="${u.website}">
      </div>
    </div>
    <div class="edit-form-group">
      <label>Tech Stack (comma-separated)</label>
      <input type="text" class="edit-form-input" id="edit-tech" value="${u.tech.join(', ')}">
    </div>
    <div class="edit-form-footer">
      <button class="edit-cancel-btn" onclick="document.getElementById('modal-overlay').classList.remove('open')">Cancel</button>
      <button class="edit-save-btn" id="edit-save-btn">Save Changes</button>
    </div>
  `;
  overlay.classList.add('open');

  document.getElementById('edit-save-btn')?.addEventListener('click', () => {
    State.user.name     = document.getElementById('edit-name').value.trim() || u.name;
    State.user.handle   = document.getElementById('edit-handle').value.trim() || u.handle;
    State.user.bio      = document.getElementById('edit-bio').value.trim();
    State.user.location = document.getElementById('edit-location').value.trim();
    State.user.website  = document.getElementById('edit-website').value.trim();
    State.user.tech     = document.getElementById('edit-tech').value.split(',').map(t => t.trim()).filter(Boolean);
    overlay.classList.remove('open');
    if (State.currentView === 'profile') navigateTo('profile');
    toast('Profile updated! ✨', '✅');
  });
}

/* ── Repos Tab for Profile ──────────────────────────────────── */
function renderProfileRepos(container) {
  container.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
      ${USER_REPOS.map(r => `
        <div class="repo-card-full">
          <div class="repo-card-full-name">📁 ${r.name}</div>
          <div class="repo-card-full-desc">${r.desc}</div>
          <div class="repo-card-full-meta">
            <span style="display:flex;align-items:center;gap:4px">
              <span style="width:10px;height:10px;border-radius:50%;background:${r.langColor};display:inline-block"></span>
              ${r.lang}
            </span>
            <span>⭐ ${fmtNum(r.stars)}</span>
            <span>🍴 ${r.forks}</span>
            <span>Updated ${r.updated}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ── Analytics Widget ───────────────────────────────────────── */
function renderAnalyticsWidget() {
  const rb = document.getElementById('rightbar');
  if (!rb) return;
  const widget = el('div', 'widget');
  const sparkData = Array.from({length: 7}, () => Math.floor(Math.random() * 80 + 20));
  const maxSpark = Math.max(...sparkData);

  widget.innerHTML = `
    <div class="widget-header">Your Stats <span class="live-badge" style="font-size:10px"><div class="live-dot"></div>LIVE</span></div>
    <div class="stats-grid">
      <div class="stat-cell">
        <div class="stat-cell-value text-cyan">${fmtNum(4821)}</div>
        <div class="stat-cell-label">Followers</div>
        <div class="stat-cell-delta up">↑ 47 this week</div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-value" style="color:var(--violet)">${fmtNum(12400)}</div>
        <div class="stat-cell-label">Post Views</div>
        <div class="stat-cell-delta up">↑ 2.1K this week</div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-value" style="color:var(--emerald)">${fmtNum(3210)}</div>
        <div class="stat-cell-label">Repo Stars</div>
        <div class="stat-cell-delta up">↑ 120 this week</div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-value" style="color:var(--amber)">89%</div>
        <div class="stat-cell-label">Engagement</div>
        <div class="stat-cell-delta down">↓ 2% vs last week</div>
      </div>
    </div>
    <div style="padding:10px 14px 12px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Post views — last 7 days</div>
      <div class="sparkline">
        ${sparkData.map(v => `<div class="spark-bar" style="height:${(v/maxSpark)*100}%"></div>`).join('')}
      </div>
    </div>
  `;
  rb.appendChild(widget);
}

/* ── Onboarding Tips ────────────────────────────────────────── */
let tipsShown = false;
function showOnboardingTips() {
  if (tipsShown) return;
  tipsShown = true;

  const tips = [
    { title: '⌘K to search', body: 'Press Cmd+K (or Ctrl+K) to open the global search panel instantly.', x: 'calc(50% - 130px)', y: '70px' },
    { title: '🔥 Keyboard shortcuts', body: 'G+F = Feed · G+E = Explore · G+N = Notifications · G+M = Messages', x: '260px', y: '120px' },
  ];

  tips.forEach((tip, i) => {
    setTimeout(() => {
      const tipEl = el('div', 'onboard-tip');
      tipEl.style.cssText = `left:${tip.x};top:${tip.y};`;
      tipEl.innerHTML = `
        <div class="onboard-tip-title">${tip.title}</div>
        <div class="onboard-tip-body">${tip.body}</div>
        <div class="onboard-tip-footer">
          <button class="onboard-tip-btn" onclick="this.closest('.onboard-tip').remove()">Got it</button>
        </div>
      `;
      document.body.appendChild(tipEl);
      setTimeout(() => { if (tipEl.parentNode) tipEl.remove(); }, 8000);
    }, 2000 + i * 4000);
  });
}

/* ── Keyboard Shortcuts ─────────────────────────────────────── */
function initKeyboardShortcuts() {
  let lastKey = '';
  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const isInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
    if (isInput) return;

    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      buildSearchOverlay();
      return;
    }

    if (e.key === 'g') { lastKey = 'g'; return; }
    if (lastKey === 'g') {
      lastKey = '';
      const navMap = { 'f': 'feed', 'e': 'explore', 'n': 'notifications', 'm': 'messages', 'p': 'profile', 'b': 'bookmarks' };
      if (navMap[e.key]) { navigateTo(navMap[e.key]); toast(`Navigated to ${navMap[e.key]}`, '⚡'); }
    }

    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) openNewPostModal();
  });
}

/* ── Global Expose ──────────────────────────────────────────── */
window.cyanet = { toast, navigateTo, openCommunity, openPostThread, openProfileEditModal, renderCollabs };

/* ── Patch buildStories: use real story viewer ──────────────── */
function buildStories(container) {
  let html = `
    <div class="story-item" id="add-story-btn-wrap">
      <button class="story-add-btn">＋</button>
      <span class="story-label">Your story</span>
    </div>
  `;
  USERS.forEach((u, i) => {
    html += `<div class="story-item" data-story-idx="${i}">
      <div class="story-ring ${i > 1 ? 'seen' : ''}">
        <div class="story-avatar" style="background:${u.color}">${u.avatar}</div>
      </div>
      <span class="story-label">${u.handle}</span>
    </div>`;
  });
  container.innerHTML = html;
  document.getElementById('add-story-btn-wrap')?.addEventListener('click', () => toast('Story creation coming soon! 📸', '📸'));
  $$('.story-item[data-story-idx]', container).forEach(item => {
    item.addEventListener('click', () => openStory(parseInt(item.dataset.storyIdx)));
  });
}

/* ── Patch openCommunity: wire voice channels ───────────────── */
const _origOpenCommunity = openCommunity;
function openCommunity(communityId) {
  _origOpenCommunity(communityId);
  // Re-wire channel clicks to handle voice channels
  setTimeout(() => {
    const community = COMMUNITIES.find(c => c.id === communityId);
    if (!community) return;
    $$('.channel-item[data-chid]').forEach(item => {
      // Remove old listeners by cloning
      const fresh = item.cloneNode(true);
      item.parentNode.replaceChild(fresh, item);
      fresh.addEventListener('click', () => {
        $$('.channel-item').forEach(c => c.classList.remove('active'));
        fresh.classList.add('active');
        const ch = community.channels.find(c => c.id === fresh.dataset.chid);
        if (!ch) return;
        const chatArea = document.getElementById('community-chat-area');
        if (!chatArea) return;
        if (chatArea._cleanup) { chatArea._cleanup(); chatArea._cleanup = null; }
        if (ch.type === 'voice') {
          renderVoiceChannel(chatArea, ch, community);
        } else {
          renderChannelChat(chatArea, ch, community);
        }
      });
    });
  }, 50);
}

/* ── Patch buildPostCard: open thread on click ──────────────── */
const _origBuildPostCard = buildPostCard;
function buildPostCard(post, user) {
  const card = _origBuildPostCard(post, user);
  card.addEventListener('click', e => {
    if (e.target.closest('.post-action') || e.target.closest('.post-repo-card')) return;
    openPostThread(post);
  });
  return card;
}

/* ── Patch buildApp: inject all enhancements ────────────────── */
const _origBuildApp = buildApp;
function buildApp() {
  _origBuildApp();
  setTimeout(() => {
    // Wire topbar search to search overlay
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('focus', () => { searchInput.blur(); buildSearchOverlay(); });
    }
    // Wire nav-notifs badge
    document.getElementById('nav-notifs')?.querySelector('.badge')?.setAttribute('style', State.unreadNotifs > 0 ? '' : 'display:none');
    // Add Collabs to sidebar
    addCollabsToSidebar();
    // Analytics widget in rightbar
    renderAnalyticsWidget();
    // Keyboard shortcuts
    initKeyboardShortcuts();
    // Onboarding tips
    showOnboardingTips();
    // Live feed simulation
    startLiveFeed();
  }, 100);
}

function addCollabsToSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const divider = sb.querySelector('.sidebar-divider');
  if (!divider) return;
  const collabLink = el('div', 'sidebar-link', `<span class="icon">🤝</span><span>Collaborations</span>`);
  collabLink.addEventListener('click', () => {
    $$('.sidebar-link').forEach(l => l.classList.remove('active'));
    collabLink.classList.add('active');
    renderCollabs(document.getElementById('main'));
  });
  sb.insertBefore(collabLink, divider);
}

function patchProfileEditBtn() {
  const editBtns = document.querySelectorAll('.profile-action-btn.secondary');
  editBtns.forEach(btn => {
    if (btn.textContent.trim().startsWith('Edit')) {
      btn.onclick = null;
      btn.addEventListener('click', openProfileEditModal, { once: true });
    }
  });
}

/* ── Patch navigateTo: extra wiring per view ────────────────── */
const _origNavigateTo = navigateTo;
function navigateTo(view) {
  _origNavigateTo(view);
  if (view === 'profile') {
    setTimeout(() => {
      patchProfileEditBtn();
      $$('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          $$('.profile-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const content = document.getElementById('profile-content');
          if (!content) return;
          switch (tab.dataset.ptab) {
            case 'Posts':    renderPosts(content); break;
            case 'Repos':    renderProfileRepos(content); break;
            case 'Projects':
              content.innerHTML = `<div class="projects-grid">${PROJECTS.filter(p => p.author === 'u1').map(p => buildProjectCard(p)).join('')}</div>`;
              break;
            case 'Stars':
              content.innerHTML = `<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
                ${PROJECTS.slice(0,3).map(p => `<div class="repo-card-full"><div class="repo-card-full-name">${p.emoji} ${p.name}</div><div class="repo-card-full-desc">${p.desc}</div><div class="repo-card-full-meta"><span>⭐ ${fmtNum(p.stars)}</span></div></div>`).join('')}
              </div>`;
              break;
            case 'Activity':
              content.innerHTML = `<div style="padding:20px 16px"><div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Contribution graph — last 6 months</div><div id="profile-contrib-graph" style="display:flex;gap:2px"></div></div>`;
              buildProfileContribGraph();
              break;
            default:
              content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Coming soon 🔜</div>`;
          }
        });
      });
    }, 60);
  }
}

function buildProfileContribGraph() {
  const graph = document.getElementById('profile-contrib-graph');
  if (!graph) return;
  for (let w = 0; w < 26; w++) {
    const week = el('div');
    week.style.cssText = 'display:flex;flex-direction:column;gap:2px';
    for (let d = 0; d < 7; d++) {
      const day = el('div', 'contrib-day');
      const rand = Math.random();
      const level = rand < 0.3 ? 0 : rand < 0.55 ? 1 : rand < 0.75 ? 2 : rand < 0.9 ? 3 : 4;
      day.setAttribute('data-level', level);
      week.appendChild(day);
    }
    graph.appendChild(week);
  }
}

/* ── Boot ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('modal-overlay');
      if (overlay) overlay.classList.remove('open');
      closeSearch();
    }
  });
});
