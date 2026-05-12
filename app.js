/* ============================================================
   CYANET — Create. Collaborate. Launch.
   app.js — Production (Supabase)
   ============================================================ */

'use strict';

const supabase = window.supabase.createClient(
  window.CYANET_CONFIG.SUPABASE_URL,
  window.CYANET_CONFIG.SUPABASE_ANON_KEY
);

/* ── State ──────────────────────────────────────────────────── */
const State = {
  session: null,
  profile: null,
  currentView: 'feed',
  currentCommunity: null,
  currentChannel: null,
  currentDMRecipient: null,
  feedTab: 'for-you',
  posts: [],
  notifications: [],
  unreadNotifs: 0,
  unreadMessages: 0,
};

/* ── Utility ─────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const fmtNum = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n;
const timeSince = date => {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
const escapeHtml = text => (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const getColorForUser = (user) => {
  if (!user) return '#63d9ff';
  let hash = 0;
  for (let i = 0; i < (user.username || '').length; i++) {
    hash = user.username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#f472b6', '#f97316', '#06b6d4', '#a78bfa', '#34d399', '#fbbf24', '#38bdf8'];
  return colors[Math.abs(hash) % colors.length];
};

function toast(msg, icon = '✅') {
  const c = $('#toast-container');
  const t = el('div', 'toast', `<span class="toast-icon">${icon}</span><span>${escapeHtml(msg)}</span>`);
  c.appendChild(t);
  setTimeout(() => { t.classList.add('exit'); setTimeout(() => t.remove(), 300); }, 3000);
}
function showPresence() {
  const b = $('#presence-bar');
  b.classList.add('loading');
  setTimeout(() => { b.classList.remove('loading'); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 400); }, 600);
}

/* ── Auth ───────────────────────────────────────────────────── */
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    State.session = session;
    await loadProfile(session.user.id);
    showApp();
  } else {
    showAuthScreen();
  }
}

async function loadProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  State.profile = data;
}

async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      full_name: username
    });
    toast('Check your email to confirm!', '📧');
  }
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  handleSession(data.session);
}

function getRedirectURL() {
  // window.location.origin returns "null" for file:// — fall back to href
  const origin = window.location.origin;
  if (origin && origin !== 'null') return origin;
  return window.location.href.split('?')[0].split('#')[0];
}

async function signInWithOAuth(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: getRedirectURL() }
  });
  if (error) throw error;
}

async function signInWithGitHub()  { return signInWithOAuth('github');  }
async function signInWithGoogle()  { return signInWithOAuth('google');  }
async function signInWithDiscord() { return signInWithOAuth('discord'); }

async function signInWithMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  toast('Magic link sent!', '📧');
}

async function signOut() {
  await supabase.auth.signOut();
  State.session = null;
  State.profile = null;
  document.getElementById('app').classList.remove('visible');
  document.getElementById('auth-screen').style.display = 'flex';
}

function handleSession(session) {
  State.session = session;
  if (session) {
    loadProfile(session.user.id).then(() => showApp());
  }
}

// Listen to auth state changes (OAuth redirect, etc.)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    handleSession(session);
  } else if (event === 'SIGNED_OUT') {
    State.session = null;
    State.profile = null;
    document.getElementById('app').classList.remove('visible');
    document.getElementById('auth-screen').style.display = 'flex';
  }
});

/* ── UI Toggle ──────────────────────────────────────────────── */
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  buildApp();
  startRealtime();
  toast(`Welcome, ${State.profile?.full_name?.split(' ')[0] || 'creator'}! 👋`, '🚀');
}

/* ── Build Shell ─────────────────────────────────────────────── */
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
      <input type="text" id="search-input" placeholder="Search Cyanet…">
    </div>
    <div class="topbar-actions">
      <button class="topbar-action-btn" id="nav-notifs" title="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="badge" id="notif-badge"></span>
      </button>
      <button class="topbar-action-btn" id="nav-messages-btn" title="Messages">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="badge" id="msg-badge"></span>
      </button>
      <button class="topbar-action-btn" title="New post" id="new-post-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </button>
      <div class="topbar-avatar" id="topbar-avatar-btn">${State.profile?.avatar_url || '👤'}</div>
    </div>
  `;

  $('#nav-notifs').onclick = () => navigateTo('notifications');
  $('#nav-messages-btn').onclick = () => navigateTo('messages');
  $('#new-post-btn').onclick = openNewPostModal;
  $('#topbar-avatar-btn').onclick = () => navigateTo('profile');

  $('#search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      toast(`Search not yet implemented 🔍`, '🔍');
      e.target.value = '';
    }
  });
  updateBadgeCounts();
}

function updateBadgeCounts() {
  const notifBadge = $('#notif-badge');
  notifBadge.style.display = State.unreadNotifs > 0 ? 'block' : 'none';
  const msgBadge = $('#msg-badge');
  msgBadge.style.display = State.unreadMessages > 0 ? 'block' : 'none';
}

/* ── Sidebar ────────────────────────────────────────────────── */
async function buildSidebar() {
  const sb = $('#sidebar');
  const links = [
    { id: 'feed', icon: '🏠', label: 'Home' },
    { id: 'explore', icon: '🔭', label: 'Explore' },
    { id: 'notifications', icon: '🔔', label: 'Notifications', badge: State.unreadNotifs },
    { id: 'messages', icon: '💬', label: 'Messages', badge: State.unreadMessages },
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'bookmarks', icon: '🔖', label: 'Bookmarks' },
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
  </div>
  <div id="sidebar-communities-list"></div>
  <div class="sidebar-divider"></div>
  <div class="sidebar-bottom">
    <div class="sidebar-link" data-nav="settings">
      <span class="icon">⚙️</span><span>Settings</span>
    </div>
  </div>`;
  sb.innerHTML = html;

  $$('.sidebar-link[data-nav]', sb).forEach(link => {
    link.addEventListener('click', () => navigateTo(link.dataset.nav));
  });

  $('#create-community-btn').addEventListener('click', () => toast('Create community coming soon!', '🌍'));

  await loadUserCommunities();
}

async function loadUserCommunities() {
  if (!State.profile) return;
  const { data: memberships } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('user_id', State.profile.id);

  if (!memberships?.length) return;
  const ids = memberships.map(m => m.community_id);
  const { data: communities } = await supabase.from('communities').select('*').in('id', ids);
  if (!communities) return;

  const container = $('#sidebar-communities-list');
  container.innerHTML = '';
  communities.forEach(c => {
    const div = el('div', 'sidebar-community', `
      <div class="sidebar-community-icon" style="background:${c.bg || '#181c27'};color:${c.color || '#63d9ff'}">${c.icon || '💬'}</div>
      <span class="sidebar-community-name">${escapeHtml(c.name)}</span>
      <span class="sidebar-community-dot"></span>
    `);
    div.addEventListener('click', () => openCommunity(c.id));
    container.appendChild(div);
  });
}

function updateSidebarActive() {
  $$('.sidebar-link[data-nav]').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === State.currentView);
  });
}

/* ── Rightbar ───────────────────────────────────────────────── */
async function buildRightbar() {
  const rb = $('#rightbar');
  rb.innerHTML = `<div class="widget" id="who-widget"><div class="widget-header">Who to follow</div></div>`;
  loadSuggestions();
}

async function loadSuggestions() {
  if (!State.profile) return;
  const { data } = await supabase.from('profiles').select('*').neq('id', State.profile.id).limit(3);
  if (data) renderSuggestions(data);
}

function renderSuggestions(users) {
  const widget = $('#who-widget');
  widget.innerHTML = `<div class="widget-header">Who to follow</div>` +
    users.map(u => `
      <div class="who-item">
        <div class="who-avatar" style="background:${getColorForUser(u)}">${u.avatar_url || '👤'}</div>
        <div class="who-info">
          <div class="who-name">${escapeHtml(u.full_name || u.username)}</div>
          <div class="who-handle">@${escapeHtml(u.username)}</div>
        </div>
        <button class="follow-btn" data-uid="${u.id}">Follow</button>
      </div>
    `).join('');

  $$('.follow-btn', widget).forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.uid;
      const { data: follow } = await supabase.from('follows').select('*').eq('follower_id', State.profile.id).eq('following_id', targetId).maybeSingle();
      if (follow) {
        await supabase.from('follows').delete().eq('follower_id', State.profile.id).eq('following_id', targetId);
        btn.textContent = 'Follow';
        btn.classList.remove('following');
      } else {
        await supabase.from('follows').insert({ follower_id: State.profile.id, following_id: targetId });
        btn.textContent = 'Following';
        btn.classList.add('following');
      }
    });
  });
}

/* ── Navigation ─────────────────────────────────────────────── */
async function navigateTo(view) {
  State.currentView = view;
  showPresence();
  updateSidebarActive();
  const main = $('#main');
  main.innerHTML = '';

  switch (view) {
    case 'feed': await renderFeed(main); break;
    case 'explore': await renderExplore(main); break;
    case 'notifications': await renderNotifications(main); break;
    case 'messages': await renderMessages(main); break;
    case 'profile': await renderProfile(main); break;
    case 'bookmarks': await renderBookmarks(main); break;
    case 'settings': renderSettings(main); break;
    default: await renderFeed(main);
  }
}

/* ── Feed ───────────────────────────────────────────────────── */
function buildComposer(container) {
  container.innerHTML = `
    <div class="composer-inner">
      <div class="composer-row">
        <div class="composer-avatar">${State.profile?.avatar_url || '👤'}</div>
        <textarea id="post-textarea" class="composer-textarea" placeholder="What are you building today?" rows="2"></textarea>
      </div>
      <div class="composer-toolbar">
        <div class="composer-actions">
          <span class="char-count" id="char-count">280</span>
          <button class="post-btn" id="post-submit-btn" disabled>Post</button>
        </div>
      </div>
    </div>
  `;

  const textarea = $('#post-textarea');
  const submitBtn = $('#post-submit-btn');
  const charCount = $('#char-count');

  textarea.addEventListener('input', () => {
    const left = 280 - textarea.value.length;
    charCount.textContent = left;
    charCount.style.color = left < 20 ? 'var(--rose)' : left < 60 ? 'var(--amber)' : 'var(--text-muted)';
    submitBtn.disabled = textarea.value.trim().length === 0;
  });

  submitBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    await createPost(text);
    textarea.value = '';
    submitBtn.disabled = true;
    charCount.textContent = '280';
  });
}

async function renderFeed(main) {
  main.innerHTML = `
    <div class="view-tabs">
      <div class="view-tab ${State.feedTab === 'for-you' ? 'active' : ''}" data-tab="for-you">For You</div>
      <div class="view-tab ${State.feedTab === 'following' ? 'active' : ''}" data-tab="following">Following</div>
      <div class="view-tab ${State.feedTab === 'trending' ? 'active' : ''}" data-tab="trending">Trending</div>
    </div>
    <div class="composer" id="composer-area"></div>
    <div id="feed"></div>
  `;

  $$('.view-tab[data-tab]', main).forEach(tab => {
    tab.addEventListener('click', () => {
      State.feedTab = tab.dataset.tab;
      $$('.view-tab', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadFeedPosts();
    });
  });

  buildComposer($('#composer-area'));
  await loadFeedPosts();
}

async function loadFeedPosts() {
  let query = supabase
    .from('posts')
    .select(`
      id, content, code_snippet, code_lang, repo_name, repo_desc, repo_lang, repo_stars, repo_forks, created_at,
      user:profiles!posts_user_id_fkey (id, username, full_name, avatar_url)
    `)
    .order('created_at', { ascending: false });

  if (State.feedTab === 'following') {
    const { data: followData } = await supabase.from('follows').select('following_id').eq('follower_id', State.profile.id);
    if (followData?.length) {
      const ids = followData.map(f => f.following_id);
      query = query.in('user_id', ids);
    } else {
      State.posts = [];
      renderPosts();
      return;
    }
  }

  const { data } = await query.limit(20);
  State.posts = data || [];
  await renderPosts();
}

async function renderPosts() {
  const feed = $('#feed');
  if (!feed) return;
  const postIds = State.posts.map(p => p.id);

  // fetch user interactions in parallel
  const [likesRes, repostsRes, bookmarksRes] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', State.profile.id).in('post_id', postIds),
    supabase.from('reposts').select('post_id').eq('user_id', State.profile.id).in('post_id', postIds),
    supabase.from('bookmarks').select('post_id').eq('user_id', State.profile.id).in('post_id', postIds)
  ]);

  const userLikes = new Set(likesRes.data?.map(l => l.post_id));
  const userReposts = new Set(repostsRes.data?.map(r => r.post_id));
  const userBookmarks = new Set(bookmarksRes.data?.map(b => b.post_id));

  feed.innerHTML = State.posts.map(post => {
    const user = post.user || {};
    const liked = userLikes.has(post.id);
    const reposted = userReposts.has(post.id);
    const bookmarked = userBookmarks.has(post.id);
    return buildPostCardHTML(post, user, liked, reposted, bookmarked);
  }).join('');

  // Attach event listeners after innerHTML
  attachPostListeners();
}

function buildPostCardHTML(post, user, liked, reposted, bookmarked) {
  const time = timeSince(new Date(post.created_at));
  let contentHtml = post.content ? `<div class="post-content">${escapeHtml(post.content)}</div>` : '';
  if (post.code_snippet) {
    contentHtml += `<pre class="post-code"><span class="post-code-lang">${escapeHtml(post.code_lang || '')}</span>${escapeHtml(post.code_snippet)}</pre>`;
  }
  if (post.repo_name) {
    contentHtml += `<div class="post-repo-card">
      <div class="post-repo-header">
        <span class="post-repo-icon">📦</span>
        <span class="post-repo-name">${escapeHtml(post.repo_name)}</span>
      </div>
      <div class="post-repo-desc">${escapeHtml(post.repo_desc || '')}</div>
      <div class="post-repo-meta">
        <span>⭐ ${post.repo_stars || 0}</span>
        <span>🍴 ${post.repo_forks || 0}</span>
      </div>
    </div>`;
  }

  return `<div class="post-card" data-post-id="${post.id}">
    <div class="post-header">
      <div class="post-avatar" style="background:${getColorForUser(user)}">${user.avatar_url || '👤'}</div>
      <div class="post-meta">
        <div class="post-author">
          ${escapeHtml(user.full_name || user.username)}
          <span class="post-author-handle">@${escapeHtml(user.username)}</span>
        </div>
        <div class="post-time">${time}</div>
      </div>
    </div>
    ${contentHtml}
    <div class="post-actions">
      <button class="post-action comment-btn" data-action="comment">💬 Comment</button>
      <button class="post-action repost-btn ${reposted ? 'reposted' : ''}" data-action="repost">🔁 ${post.repost_count || 0}</button>
      <button class="post-action like-btn ${liked ? 'liked' : ''}" data-action="like">❤️ <span class="like-count">${post.like_count || 0}</span></button>
      <button class="post-action bookmark-btn ${bookmarked ? 'bookmarked' : ''}" data-action="bookmark">🔖</button>
    </div>
  </div>`;
}

async function attachPostListeners() {
  document.querySelectorAll('.post-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest('button')) return; // ignore button clicks
      openPostThread(card.dataset.postId);
    };
  });

  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const postId = btn.closest('.post-card').dataset.postId;
      const liked = btn.classList.contains('liked');
      if (liked) {
        await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', State.profile.id);
        btn.classList.remove('liked');
        btn.querySelector('.like-count').textContent = Math.max(0, (parseInt(btn.querySelector('.like-count').textContent) || 1) - 1);
      } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: State.profile.id });
        btn.classList.add('liked');
        btn.querySelector('.like-count').textContent = (parseInt(btn.querySelector('.like-count').textContent) || 0) + 1;
      }
    };
  });

  document.querySelectorAll('.repost-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const postId = btn.closest('.post-card').dataset.postId;
      const reposted = btn.classList.contains('reposted');
      if (reposted) {
        await supabase.from('reposts').delete().eq('post_id', postId).eq('user_id', State.profile.id);
        btn.classList.remove('reposted');
      } else {
        await supabase.from('reposts').insert({ post_id: postId, user_id: State.profile.id });
        btn.classList.add('reposted');
      }
    };
  });

  document.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const postId = btn.closest('.post-card').dataset.postId;
      const bookmarked = btn.classList.contains('bookmarked');
      if (bookmarked) {
        await supabase.from('bookmarks').delete().eq('post_id', postId).eq('user_id', State.profile.id);
        btn.classList.remove('bookmarked');
      } else {
        await supabase.from('bookmarks').insert({ post_id: postId, user_id: State.profile.id });
        btn.classList.add('bookmarked');
      }
    };
  });
}

async function createPost(content) {
  const { data, error } = await supabase
    .from('posts')
    .insert({ user_id: State.profile.id, content })
    .select()
    .single();
  if (error) {
    toast(error.message, '⚠️');
    return;
  }
  State.posts.unshift(data);
  await renderPosts();
}

/* ── Post thread (comment) ──────────────────────────────────── */
async function openPostThread(postId) {
  const post = State.posts.find(p => p.id === postId);
  if (!post) return;
  // Fetch comments
  const { data: comments } = await supabase
    .from('comments')
    .select('id, content, created_at, user:profiles!comments_user_id_fkey (id, username, full_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  const main = $('#main');
  main.innerHTML = `
    <div class="thread-view">
      <div class="thread-back-btn" id="thread-back">← Back to feed</div>
      <div class="thread-main-post">
        ${buildPostCardHTML(post, post.user, /* we don't know interactions here */ false, false, false)}
      </div>
      <div class="comment-input">
        <textarea id="comment-input" placeholder="Write a comment..."></textarea>
        <button id="comment-submit">Send</button>
      </div>
      <div id="comments-list">
        ${comments.map(c => `
          <div class="comment">
            <div class="comment-avatar" style="background:${getColorForUser(c.user)}">${c.user?.avatar_url || '👤'}</div>
            <div class="comment-body">
              <div class="comment-author">${escapeHtml(c.user?.full_name || c.user?.username)}</div>
              <div class="comment-text">${escapeHtml(c.content)}</div>
              <div class="comment-time">${timeSince(new Date(c.created_at))}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  $('#thread-back').onclick = () => navigateTo('feed');
  $('#comment-submit').onclick = async () => {
    const text = $('#comment-input').value.trim();
    if (!text) return;
    await supabase.from('comments').insert({ post_id: postId, user_id: State.profile.id, content: text });
    toast('Comment added!', '💬');
    openPostThread(postId); // refresh thread
  };
}

/* ── Explore ────────────────────────────────────────────────── */
async function renderExplore(main) {
  main.innerHTML = `<div class="communities-grid" id="explore-communities"></div>`;
  const { data } = await supabase.from('communities').select('*').limit(10);
  const grid = $('#explore-communities');
  if (!data?.length) {
    grid.innerHTML = '<p>No communities yet. Create one!</p>';
    return;
  }
  grid.innerHTML = data.map(c => `
    <div class="community-card" data-cid="${c.id}">
      <div class="community-card-icon" style="background:${c.bg || '#181c27'};color:${c.color || '#63d9ff'}">${c.icon || '💬'}</div>
      <div class="community-card-name">${escapeHtml(c.name)}</div>
      <div class="community-card-desc">${escapeHtml(c.description || '')}</div>
      <button class="join-btn" data-cid="${c.id}">Join</button>
    </div>
  `).join('');

  $$('.community-card', grid).forEach(card => {
    card.addEventListener('click', () => openCommunity(card.dataset.cid));
  });
  $$('.join-btn', grid).forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const cid = btn.dataset.cid;
      await supabase.from('community_members').insert({ community_id: cid, user_id: State.profile.id });
      btn.textContent = 'Joined';
      btn.disabled = true;
      loadUserCommunities(); // refresh sidebar
    });
  });
}

/* ── Communities & Channels ─────────────────────────────────── */
async function openCommunity(communityId) {
  const { data: community } = await supabase.from('communities').select('*').eq('id', communityId).single();
  if (!community) return;
  State.currentCommunity = community;

  const { data: channels } = await supabase.from('channels').select('*').eq('community_id', communityId);
  State.currentCommunity.channels = channels || [];

  const main = $('#main');
  main.innerHTML = `
    <div class="community-view">
      <div class="community-sidebar">
        <div class="community-header">
          <div style="font-size:24px">${community.icon || '💬'}</div>
          <div class="community-header-name">${escapeHtml(community.name)}</div>
        </div>
        <div id="channel-list">
          ${channels.map(ch => `
            <div class="channel-item ${ch.id === State.currentChannel?.id ? 'active' : ''}" data-chid="${ch.id}">
              <span class="channel-icon">${ch.type === 'voice' ? '🔊' : '#'}</span> ${escapeHtml(ch.name)}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="community-chat" id="community-chat-area">
        <!-- chat messages -->
      </div>
    </div>
  `;

  // Bind channel clicks
  $$('.channel-item', $('#channel-list')).forEach(item => {
    item.addEventListener('click', () => {
      const chId = item.dataset.chid;
      State.currentChannel = State.currentCommunity.channels.find(ch => ch.id === chId);
      renderChannelMessages();
    });
  });

  if (channels.length > 0) {
    State.currentChannel = channels[0];
    renderChannelMessages();
  }
}

async function renderChannelMessages() {
  const chatArea = $('#community-chat-area');
  if (!State.currentChannel) return;

  const { data: messages } = await supabase
    .from('channel_messages')
    .select('id, content, created_at, user:profiles!channel_messages_user_id_fkey (id, username, full_name, avatar_url)')
    .eq('channel_id', State.currentChannel.id)
    .order('created_at', { ascending: true });

  chatArea.innerHTML = `
    <div class="chat-messages" id="chat-messages-list">
      ${messages?.map(msg => `
        <div class="msg">
          <div class="msg-avatar" style="background:${getColorForUser(msg.user)}">${msg.user?.avatar_url || '👤'}</div>
          <div class="msg-body">
            <div class="msg-header">
              <span class="msg-author" style="color:${getColorForUser(msg.user)}">${escapeHtml(msg.user?.full_name || msg.user?.username)}</span>
              <span class="msg-time">${timeSince(new Date(msg.created_at))}</span>
            </div>
            <div class="msg-text">${escapeHtml(msg.content)}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        <input class="chat-input" id="channel-chat-input" type="text" placeholder="Message #${escapeHtml(State.currentChannel.name)}">
        <button class="chat-send-btn" id="channel-send-btn">➤</button>
      </div>
    </div>
  `;

  const msgList = $('#chat-messages-list');
  msgList.scrollTop = msgList.scrollHeight;

  const input = $('#channel-chat-input');
  const sendBtn = $('#channel-send-btn');
  async function send() {
    const text = input.value.trim();
    if (!text) return;
    await supabase.from('channel_messages').insert({
      channel_id: State.currentChannel.id,
      user_id: State.profile.id,
      content: text
    });
    input.value = '';
  }
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  // Real-time subscription for this channel
  supabase
    .channel(`channel-${State.currentChannel.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'channel_messages',
      filter: `channel_id=eq.${State.currentChannel.id}`
    }, payload => {
      // Append new message to the list
      const newMsg = payload.new;
      const user = State.profile; // quick approximation – need to fetch user
      const msgDiv = el('div', 'msg', `
        <div class="msg-avatar" style="background:${getColorForUser(user)}">${State.profile?.avatar_url || '👤'}</div>
        <div class="msg-body">
          <div class="msg-header">
            <span class="msg-author" style="color:${getColorForUser(user)}">${escapeHtml(State.profile?.full_name || State.profile?.username)}</span>
            <span class="msg-time">just now</span>
          </div>
          <div class="msg-text">${escapeHtml(newMsg.content)}</div>
        </div>
      `);
      msgList.appendChild(msgDiv);
      msgList.scrollTop = msgList.scrollHeight;
    })
    .subscribe();
}

/* ── Notifications ──────────────────────────────────────────── */
async function renderNotifications(main) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', State.profile.id)
    .order('created_at', { ascending: false })
    .limit(50);

  State.notifications = data || [];
  State.unreadNotifs = State.notifications.filter(n => !n.read).length;
  updateBadgeCounts();

  main.innerHTML = `
    <div class="notif-list">
      ${State.notifications.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.id}">
          <div>${n.type || 'mention'}</div>
          <div>${escapeHtml(n.message || 'You have a new notification')}</div>
          <div class="notif-time">${timeSince(new Date(n.created_at))}</div>
        </div>
      `).join('')}
    </div>
  `;

  $$('.notif-item', main).forEach(item => {
    item.addEventListener('click', async () => {
      const nid = item.dataset.nid;
      await supabase.from('notifications').update({ read: true }).eq('id', nid);
      item.classList.remove('unread');
    });
  });
}

/* ── Messages (Direct) ──────────────────────────────────────── */
async function renderMessages(main) {
  main.innerHTML = `
    <div class="messages-layout">
      <div class="conversations-list" id="conversations-list">
        <div class="conversations-header">Messages</div>
        <div id="dm-list"></div>
        <button id="new-dm-btn">+ New Message</button>
      </div>
      <div class="dm-view" id="dm-view">
        <p>Select a conversation</p>
      </div>
    </div>
  `;

  // Load recent conversations
  loadDMConversations();
  $('#new-dm-btn').addEventListener('click', () => {
    const username = prompt('Enter username to message:');
    if (!username) return;
    // Lookup user and start DM
    supabase.from('profiles').select('id, username').eq('username', username).single().then(({ data }) => {
      if (!data) return toast('User not found', '⚠️');
      State.currentDMRecipient = data;
      openDMView(data);
    });
  });
}

async function loadDMConversations() {
  if (!State.profile) return;
  // Get distinct users who sent or received messages from the current user
  const { data: sent } = await supabase.from('direct_messages').select('receiver_id').eq('sender_id', State.profile.id);
  const { data: received } = await supabase.from('direct_messages').select('sender_id').eq('receiver_id', State.profile.id);
  const userIds = new Set();
  sent?.forEach(msg => userIds.add(msg.receiver_id));
  received?.forEach(msg => userIds.add(msg.sender_id));

  if (userIds.size === 0) return;
  const { data: users } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', [...userIds]);
  const list = $('#dm-list');
  list.innerHTML = users.map(u => `
    <div class="conversation-item" data-uid="${u.id}">
      <div class="conv-avatar" style="background:${getColorForUser(u)}">${u.avatar_url || '👤'}</div>
      <div class="conv-info">
        <div class="conv-name">${escapeHtml(u.full_name || u.username)}</div>
      </div>
    </div>
  `).join('');

  $$('.conversation-item', list).forEach(item => {
    item.addEventListener('click', () => {
      const uid = item.dataset.uid;
      const u = users.find(us => us.id === uid);
      State.currentDMRecipient = u;
      openDMView(u);
    });
  });
}

async function openDMView(recipient) {
  const dmView = $('#dm-view');
  if (!recipient) return;

  // Fetch message history
  const { data: messages } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${State.profile.id},receiver_id.eq.${State.profile.id}`)
    .or(`sender_id.eq.${recipient.id},receiver_id.eq.${recipient.id}`)
    .order('created_at', { ascending: true });

  dmView.innerHTML = `
    <div class="dm-header">
      <div class="conv-avatar" style="background:${getColorForUser(recipient)}">${recipient.avatar_url || '👤'}</div>
      <div>${escapeHtml(recipient.full_name || recipient.username)}</div>
    </div>
    <div class="dm-messages" id="dm-messages-list">
      ${messages?.map(msg => {
        const isOwn = msg.sender_id === State.profile.id;
        return `<div class="msg ${isOwn ? 'dm-own' : 'dm-other'}">
          <div class="msg-body">
            <div class="msg-text">${escapeHtml(msg.content)}</div>
          </div>
          ${!isOwn ? `<div class="msg-avatar" style="background:${getColorForUser(recipient)}">${recipient.avatar_url || '👤'}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        <input class="chat-input" id="dm-input" type="text" placeholder="Message @${escapeHtml(recipient.username)}">
        <button class="chat-send-btn" id="dm-send-btn">➤</button>
      </div>
    </div>
  `;

  const msgList = $('#dm-messages-list');
  msgList.scrollTop = msgList.scrollHeight;

  const input = $('#dm-input');
  const sendBtn = $('#dm-send-btn');
  async function sendDM() {
    const text = input.value.trim();
    if (!text) return;
    await supabase.from('direct_messages').insert({
      sender_id: State.profile.id,
      receiver_id: recipient.id,
      content: text
    });
    input.value = '';
  }
  sendBtn.addEventListener('click', sendDM);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendDM(); });

  // Real-time subscription for this DM
  supabase
    .channel(`dm-${[State.profile.id, recipient.id].sort().join('-')}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'direct_messages',
      filter: `or(and(sender_id=eq.${State.profile.id},receiver_id=eq.${recipient.id}),and(sender_id=eq.${recipient.id},receiver_id=eq.${State.profile.id}))`
    }, payload => {
      const newMsg = payload.new;
      const isOwn = newMsg.sender_id === State.profile.id;
      const msgDiv = el('div', `msg ${isOwn ? 'dm-own' : 'dm-other'}`);
      msgDiv.innerHTML = `<div class="msg-body"><div class="msg-text">${escapeHtml(newMsg.content)}</div></div>${isOwn ? '' : `<div class="msg-avatar" style="background:${getColorForUser(recipient)}">${recipient.avatar_url || '👤'}</div>`}`;
      msgList.appendChild(msgDiv);
      msgList.scrollTop = msgList.scrollHeight;
    })
    .subscribe();
}

/* ── Profile ────────────────────────────────────────────────── */
async function renderProfile(main) {
  if (!State.profile) return;
  const { data: myPosts } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', State.profile.id)
    .order('created_at', { ascending: false });

  main.innerHTML = `
    <div class="profile-cover"><div class="profile-cover-art"></div></div>
    <div class="profile-info-section">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">${State.profile.avatar_url || '👤'}</div>
      </div>
      <div class="profile-name">${escapeHtml(State.profile.full_name || State.profile.username)}</div>
      <div class="profile-handle">@${escapeHtml(State.profile.username)}</div>
      <div class="profile-bio">${escapeHtml(State.profile.bio || '')}</div>
      <button class="profile-action-btn secondary" id="edit-profile-btn">Edit Profile</button>
      <button class="profile-action-btn secondary" onclick="navigateTo('settings')">Settings</button>
    </div>
    <div class="profile-tabs">
      <div class="profile-tab active">Posts</div>
      <div class="profile-tab">Activity</div>
    </div>
    <div id="profile-posts">${myPosts?.map(post => buildPostCardHTML(post, State.profile, false, false, false)).join('')}</div>
  `;

  $('#edit-profile-btn').addEventListener('click', openProfileEditModal);
}

/* ── Bookmarks ──────────────────────────────────────────────── */
async function renderBookmarks(main) {
  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select('post_id')
    .eq('user_id', State.profile.id);

  if (!bookmarks?.length) {
    main.innerHTML = '<p>No bookmarks yet.</p>';
    return;
  }
  const ids = bookmarks.map(b => b.post_id);
  const { data: posts } = await supabase
    .from('posts')
    .select(`*, user:profiles!posts_user_id_fkey (id, username, full_name, avatar_url)`)
    .in('id', ids);

  main.innerHTML = `<div id="bookmark-feed">${posts?.map(p => buildPostCardHTML(p, p.user, false, false, true)).join('')}</div>`;
  attachPostListeners();
}

/* ── Settings ───────────────────────────────────────────────── */
function renderSettings(main) {
  main.innerHTML = `
    <div class="settings">
      <h2>Settings</h2>
      <button id="signout-btn">Sign Out</button>
    </div>
  `;
  $('#signout-btn').addEventListener('click', signOut);
}

/* ── Profile Edit Modal ─────────────────────────────────────── */
function openProfileEditModal() {
  const overlay = $('#modal-overlay');
  const body = $('#modal-body');
  body.innerHTML = `
    <div class="edit-form-group">
      <label>Full Name</label>
      <input id="edit-fullname" class="edit-form-input" value="${escapeHtml(State.profile?.full_name || '')}">
    </div>
    <div class="edit-form-group">
      <label>Bio</label>
      <textarea id="edit-bio" class="edit-form-textarea">${escapeHtml(State.profile?.bio || '')}</textarea>
    </div>
    <button id="save-profile-btn" class="edit-save-btn">Save</button>
  `;
  overlay.classList.add('open');

  $('#save-profile-btn').addEventListener('click', async () => {
    const fullName = $('#edit-fullname').value.trim();
    const bio = $('#edit-bio').value.trim();
    await supabase.from('profiles').update({ full_name: fullName, bio }).eq('id', State.profile.id);
    State.profile.full_name = fullName;
    State.profile.bio = bio;
    overlay.classList.remove('open');
    navigateTo('profile');
  });
  $('#modal-close-btn').addEventListener('click', () => overlay.classList.remove('open'));
}

/* ── New Post Modal ─────────────────────────────────────────── */
function openNewPostModal() {
  const overlay = $('#modal-overlay');
  const body = $('#modal-body');
  body.innerHTML = `
    <textarea id="modal-post-text" class="composer-textarea" placeholder="What are you building today?" rows="4"></textarea>
    <button id="modal-post-btn" class="post-btn">Post</button>
  `;
  overlay.classList.add('open');
  $('#modal-post-btn').addEventListener('click', async () => {
    const text = $('#modal-post-text').value.trim();
    if (!text) return;
    await createPost(text);
    overlay.classList.remove('open');
  });
  $('#modal-close-btn').addEventListener('click', () => overlay.classList.remove('open'));
}

/* ── Real-time global subscriptions ─────────────────────────── */
function startRealtime() {
  // Listen for new posts (only used to refresh feed if visible)
  supabase
    .channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
      if (State.currentView === 'feed') {
        loadFeedPosts();
      }
    })
    .subscribe();

  // Listen for notifications to update badge
  if (State.profile) {
    supabase
      .channel(`notifications:${State.profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${State.profile.id}`
      }, () => {
        // Increment unread count
        State.unreadNotifs++;
        updateBadgeCounts();
        toast('New notification!', '🔔');
      })
      .subscribe();
  }
}

/* ── Bootstrap ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Bind auth buttons after DOM is ready
  const githubBtn = document.getElementById('github-login-btn');
  const googleBtn = document.getElementById('google-login-btn');
  const discordBtn = document.getElementById('discord-login-btn');
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const magicLinkBtn = document.getElementById('magic-link-btn');
  const emailIn = document.getElementById('auth-email');
  const passIn = document.getElementById('auth-password');
  const authStatus = document.getElementById('auth-status');

  function oauthClickHandler(btn, fn, label) {
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="opacity:0.7">Connecting to ' + label + '…</span>';
      authStatus.style.display = 'none';
      try {
        await fn();
      } catch (e) {
        authStatus.textContent = label + ' error: ' + e.message;
        authStatus.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    });
  }

  oauthClickHandler(githubBtn,  signInWithGitHub,  'GitHub');
  oauthClickHandler(googleBtn,  signInWithGoogle,  'Google');
  oauthClickHandler(discordBtn, signInWithDiscord, 'Discord');
  loginBtn?.addEventListener('click', async () => {
    try {
      await signIn(emailIn.value, passIn.value);
    } catch (e) {
      authStatus.textContent = e.message;
      authStatus.style.display = 'block';
    }
  });
  signupBtn?.addEventListener('click', async () => {
    const username = prompt('Choose a username:');
    if (!username) return;
    try {
      await signUp(emailIn.value, passIn.value, username);
    } catch (e) {
      authStatus.textContent = e.message;
      authStatus.style.display = 'block';
    }
  });
  magicLinkBtn?.addEventListener('click', async () => {
    if (!emailIn.value) return toast('Enter your email first', '⚠️');
    await signInWithMagicLink(emailIn.value);
  });

  // Modal close
  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    $('#modal-overlay').classList.remove('open');
  });
  $('#modal-overlay')?.addEventListener('click', e => {
    if (e.target === $('#modal-overlay')) $('#modal-overlay').classList.remove('open');
  });

  // Start by checking auth session
  checkSession();
});