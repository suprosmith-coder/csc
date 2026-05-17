/* ============================================================
   DEVIT — Code. Connect. Ship.
   app.js  —  Full Supabase integration
   ============================================================ */

'use strict';

/* ── Supabase Init ──────────────────────────────────────────── */
const { createClient } = supabase;
const sb = createClient(
  window.DEVIT_CONFIG.SUPABASE_URL,
  window.DEVIT_CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'implicit',
    }
  }
);

/* ── State ──────────────────────────────────────────────────── */
const State = {
  user: null,          // Supabase Auth user
  profile: null,       // profiles row
  currentView: 'feed',
  currentCommunity: null,
  currentChannel: null,
  currentDM: null,
  feedTab: 'for-you',
  posts: [],
  notifications: [],
  onlineUsers: new Set(),
  unreadNotifs: 0,
  unreadMessages: 0,
  realtimeSubs: [],    // track subscriptions for cleanup
};

/* ── Helpers ────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const fmtNum = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
const timeAgo = ts => {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};
const avatarColor = str => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#63d9ff','#a78bfa','#34d399','#fb7185','#fbbf24','#f97316','#38bdf8','#f472b6'];
  return colors[Math.abs(h) % colors.length];
};
const avatarInitials = name => {
  const parts = (name || 'U').trim().split(' ');
  return parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0,2);
};

function toast(msg, icon = 'check') {
  const c = $('#toast-container');
  // icon can be an FA icon name (like 'rocket') or a legacy emoji
  const isEmoji = /\p{Emoji}/u.test(icon);
  const iconHtml = isEmoji
    ? `<span class="toast-icon">${icon}</span>`
    : `<span class="toast-icon"><i class="fa-solid fa-${icon}"></i></span>`;
  const t = el('div', 'toast', `${iconHtml}<span>${msg}</span>`);
  c.appendChild(t);
  setTimeout(() => { t.classList.add('exit'); setTimeout(() => t.remove(), 300); }, 3000);
}

function showPresence() {
  const b = $('#presence-bar');
  b.classList.add('loading');
  setTimeout(() => { b.classList.remove('loading'); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 400); }, 600);
}

function setAuthStatus(msg, isError = false) {
  const el = $('#auth-status');
  el.style.display = 'block';
  el.style.color = isError ? 'var(--rose)' : 'var(--text-secondary)';
  el.innerHTML = msg;
}

/* ── Avatar HTML ─────────────────────────────────────────────── */
function avatarHtml(profile, size = 36, cls = '') {
  if (!profile) return `<div class="profile-avatar-circle" style="width:${size}px;height:${size}px;font-size:${size*0.4}px;background:#444;${cls ? '' : ''}">?</div>`;
  const name = profile.display_name || profile.username || 'U';
  const color = avatarColor(name);
  const badgeSize = Math.max(14, Math.round(size * 0.38));
  const iconSize  = Math.max(8, Math.round(size * 0.22));
  const ghBadge   = profile.is_github
    ? `<div class="avatar-gh-badge" style="position:absolute;bottom:-2px;right:-2px;width:${badgeSize}px;height:${badgeSize}px;background:#24292e;border-radius:50%;border:2px solid var(--bg-surface,#10121a);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1;"><i class="fa-brands fa-github" style="color:#fff;font-size:${iconSize}px;line-height:1"></i></div>`
    : '';
  function wrap(inner) {
    return profile.is_github
      ? `<div style="position:relative;display:inline-flex;flex-shrink:0;">${inner}${ghBadge}</div>`
      : inner;
  }
  if (profile.avatar_url) {
    return wrap(`<img src="${profile.avatar_url}" class="profile-avatar-circle${cls ? ' '+cls:''}" style="width:${size}px;height:${size}px;object-fit:cover;flex-shrink:0;" onerror="this.outerHTML='<div class=\\'profile-avatar-circle\\' style=\\'width:${size}px;height:${size}px;font-size:${size*0.4}px;background:${color}\\'>'+\`${avatarInitials(name)}\`+'</div>'">`);
  }
  return wrap(`<div class="profile-avatar-circle${cls ? ' '+cls:''}" style="width:${size}px;height:${size}px;font-size:${size*0.4}px;background:${color};flex-shrink:0;">${avatarInitials(name)}</div>`);
}

/* ── SQL Bootstrap (run once) ───────────────────────────────── */
async function bootstrapSchema() {
  // We attempt to query key tables; if they fail we surface a helpful message
  // Actual table creation should be done via Supabase Dashboard SQL editor
  // This function checks readiness and primes any missing profile for current user
  try {
    const { data, error } = await sb.from('profiles').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.warn('[Devit] Tables not found. Run the SQL setup in Supabase Dashboard.');
      toast('DB tables missing — see console for setup SQL', 'triangle-exclamation');
      logSetupSQL();
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Devit] Schema check failed', e);
    return false;
  }
}

function logSetupSQL() {
  console.log(`
/* ══════════════════════════════════════════════════════════════
   DEVIT — Run this in Supabase Dashboard > SQL Editor
   ══════════════════════════════════════════════════════════════ */

-- Helper RPC functions for atomic counter increments
create or replace function increment_followers(target_user_id uuid)
returns void language sql security definer as $$
  update profiles set followers_count = followers_count + 1 where id = target_user_id;
$$;

create or replace function increment_following(target_user_id uuid)
returns void language sql security definer as $$
  update profiles set following_count = following_count + 1 where id = target_user_id;
$$;

create or replace function decrement_followers(target_user_id uuid)
returns void language sql security definer as $$
  update profiles set followers_count = greatest(0, followers_count - 1) where id = target_user_id;
$$;

create or replace function decrement_following(target_user_id uuid)
returns void language sql security definer as $$
  update profiles set following_count = greatest(0, following_count - 1) where id = target_user_id;
$$;

-- Enable realtime (run once)
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table post_likes;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table follows;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table presence;

-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text default '',
  avatar_url text,
  location text default '',
  website text default '',
  tech_stack text[] default '{}',
  followers_count int default 0,
  following_count int default 0,
  posts_count int default 0,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Public profiles" on profiles for select using (true);
create policy "Own profile update" on profiles for update using (auth.uid() = id);
create policy "Own profile insert" on profiles for insert with check (auth.uid() = id);

-- Posts
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  code_block text,
  code_lang text,
  likes_count int default 0,
  comments_count int default 0,
  reposts_count int default 0,
  created_at timestamptz default now()
);
alter table posts enable row level security;
create policy "Public posts" on posts for select using (true);
create policy "Auth insert post" on posts for insert with check (auth.uid() = author_id);
create policy "Own post delete" on posts for delete using (auth.uid() = author_id);

-- Post likes
create table if not exists post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);
alter table post_likes enable row level security;
create policy "Public likes" on post_likes for select using (true);
create policy "Auth like" on post_likes for insert with check (auth.uid() = user_id);
create policy "Own unlike" on post_likes for delete using (auth.uid() = user_id);

-- Bookmarks
create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);
alter table bookmarks enable row level security;
create policy "Own bookmarks" on bookmarks for select using (auth.uid() = user_id);
create policy "Auth bookmark" on bookmarks for insert with check (auth.uid() = user_id);
create policy "Own unbookmark" on bookmarks for delete using (auth.uid() = user_id);

-- Comments
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade not null,
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);
alter table comments enable row level security;
create policy "Public comments" on comments for select using (true);
create policy "Auth comment" on comments for insert with check (auth.uid() = author_id);
create policy "Own comment delete" on comments for delete using (auth.uid() = author_id);

-- Follows
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references profiles(id) on delete cascade not null,
  following_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(follower_id, following_id)
);
alter table follows enable row level security;
create policy "Public follows" on follows for select using (true);
create policy "Auth follow" on follows for insert with check (auth.uid() = follower_id);
create policy "Own unfollow" on follows for delete using (auth.uid() = follower_id);

-- DM Conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid references profiles(id) on delete cascade not null,
  participant_b uuid references profiles(id) on delete cascade not null,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  unique(participant_a, participant_b)
);
alter table conversations enable row level security;
create policy "Own conversations" on conversations for select using (auth.uid() = participant_a or auth.uid() = participant_b);
create policy "Auth convo" on conversations for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);
create policy "Convo update" on conversations for update using (auth.uid() = participant_a or auth.uid() = participant_b);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  read boolean default false,
  created_at timestamptz default now()
);
alter table messages enable row level security;
create policy "Convo participants read" on messages for select using (
  exists (select 1 from conversations c where c.id = conversation_id and (c.participant_a = auth.uid() or c.participant_b = auth.uid()))
);
create policy "Auth send" on messages for insert with check (auth.uid() = sender_id);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  actor_id uuid references profiles(id) on delete cascade,
  type text not null, -- like | comment | follow | mention
  post_id uuid references posts(id) on delete cascade,
  read boolean default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "Own notifs" on notifications for select using (auth.uid() = user_id);
create policy "Auth notif" on notifications for insert with check (true);
create policy "Own notif update" on notifications for update using (auth.uid() = user_id);

-- Presence
create table if not exists presence (
  id uuid primary key references profiles(id) on delete cascade,
  online boolean default true,
  last_seen timestamptz default now()
);
alter table presence enable row level security;
create policy "Public presence" on presence for select using (true);
create policy "Own presence" on presence for insert with check (auth.uid() = id);
create policy "Own presence update" on presence for update using (auth.uid() = id);

-- Communities
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  icon text default '🌐',
  color text default '#63d9ff',
  owner_id uuid references profiles(id) on delete cascade not null,
  members_count int default 1,
  created_at timestamptz default now()
);
alter table communities enable row level security;
create policy "Public communities" on communities for select using (true);
create policy "Auth create community" on communities for insert with check (auth.uid() = owner_id);

-- Community members
create table if not exists community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(community_id, user_id)
);
alter table community_members enable row level security;
create policy "Public members" on community_members for select using (true);
create policy "Auth join" on community_members for insert with check (auth.uid() = user_id);
create policy "Own leave" on community_members for delete using (auth.uid() = user_id);

-- Community channels
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  name text not null,
  type text default 'text', -- text | voice
  created_at timestamptz default now()
);
alter table channels enable row level security;
create policy "Public channels" on channels for select using (true);

-- Channel messages
create table if not exists channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade not null,
  author_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);
alter table channel_messages enable row level security;
create policy "Public channel messages" on channel_messages for select using (true);
create policy "Auth channel message" on channel_messages for insert with check (auth.uid() = author_id);

-- Snippets (short video posts)
create table if not exists snippets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  video_url text not null,
  caption text default '',
  hearts_count int default 0,
  comments_count int default 0,
  duration int default 0,
  created_at timestamptz default now()
);
alter table snippets enable row level security;
create policy "Public snippets" on snippets for select using (true);
create policy "Auth insert snippet" on snippets for insert with check (auth.uid() = author_id);
create policy "Own snippet delete" on snippets for delete using (auth.uid() = author_id);

-- Snippet hearts
create table if not exists snippet_hearts (
  id uuid primary key default gen_random_uuid(),
  snippet_id uuid references snippets(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(snippet_id, user_id)
);
alter table snippet_hearts enable row level security;
create policy "Public snippet hearts" on snippet_hearts for select using (true);
create policy "Auth heart" on snippet_hearts for insert with check (auth.uid() = user_id);
create policy "Own unheart" on snippet_hearts for delete using (auth.uid() = user_id);

-- Snippet bookmarks
create table if not exists snippet_bookmarks (
  id uuid primary key default gen_random_uuid(),
  snippet_id uuid references snippets(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(snippet_id, user_id)
);
alter table snippet_bookmarks enable row level security;
create policy "Own snippet bookmarks" on snippet_bookmarks for select using (auth.uid() = user_id);
create policy "Auth snippet bookmark" on snippet_bookmarks for insert with check (auth.uid() = user_id);
create policy "Own snippet unbookmark" on snippet_bookmarks for delete using (auth.uid() = user_id);

-- Links (close connections)
create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade not null,
  target_id uuid references profiles(id) on delete cascade not null,
  status text default 'pending', -- pending | accepted
  created_at timestamptz default now(),
  unique(requester_id, target_id)
);
alter table links enable row level security;
create policy "Own links" on links for select using (auth.uid() = requester_id or auth.uid() = target_id);
create policy "Auth link request" on links for insert with check (auth.uid() = requester_id);
create policy "Auth link update" on links for update using (auth.uid() = target_id);
create policy "Auth link delete" on links for delete using (auth.uid() = requester_id or auth.uid() = target_id);

-- Add banner_color and banner_url columns to profiles (if not exists)
alter table profiles add column if not exists banner_color text default '#0d1b2e';
alter table profiles add column if not exists banner_url text;

-- Enable realtime for snippets and links
alter publication supabase_realtime add table snippets;
alter publication supabase_realtime add table links;
`);
}

/* ── Auth ───────────────────────────────────────────────────── */

// ── Sign-in rate limiting (ported from Cyanix AI) ────────────
// Prevents brute-force: locks out for 30 s after 5 failed attempts.
let _signInAttempts  = 0;
let _signInLockUntil = 0;
const _SIGNIN_MAX    = 5;
const _SIGNIN_LOCK   = 30_000;

function checkSignInRateLimit() {
  // Only check if currently locked — do NOT increment here.
  // Increment happens in recordSignInFailure() after a confirmed failure.
  if (Date.now() < _signInLockUntil) {
    const secs = Math.ceil((_signInLockUntil - Date.now()) / 1000);
    setAuthStatus(`Too many attempts — wait ${secs}s before trying again.`, true);
    return false;
  }
  return true;
}
function recordSignInFailure() {
  _signInAttempts++;
  if (_signInAttempts >= _SIGNIN_MAX) {
    _signInLockUntil = Date.now() + _SIGNIN_LOCK;
    _signInAttempts  = 0;
    setAuthStatus('Too many failed attempts. Locked for 30 seconds.', true);
  }
}
function resetSignInRateLimit() { _signInAttempts = 0; _signInLockUntil = 0; }

// ── Session expiry warning (ported from Cyanix AI) ───────────
// Warns the user 5 min before their JWT expires and offers
// a silent refresh. Supabase auto-refreshes every ~55 min but
// this catches backgrounded-tab / network-outage edge cases.
let _expiryWarningTimer = null;

function scheduleSessionExpiryWarning(session) {
  if (_expiryWarningTimer) clearTimeout(_expiryWarningTimer);
  if (!session?.expires_at) return;
  const warnInMs = (session.expires_at * 1000) - Date.now() - 5 * 60 * 1000;
  if (warnInMs <= 0) return;
  _expiryWarningTimer = setTimeout(() => showSessionExpiryBanner(), warnInMs);
}

function showSessionExpiryBanner() {
  // Reuse the auth-status element as a non-blocking in-app banner
  const banner = document.getElementById('session-expiry-banner');
  if (banner) { banner.style.display = 'flex'; return; }
  // Fallback: inject a minimal banner if the element doesn't exist in HTML
  const b = document.createElement('div');
  b.id = 'session-expiry-banner';
  b.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:var(--bg-surface,#1e1e2e);border:1px solid var(--border,#333);border-radius:12px;padding:10px 16px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary,#fff);z-index:9999;box-shadow:0 4px 20px #0006';
  b.innerHTML = '<i class="fa-solid fa-clock" style="color:var(--amber,#fbbf24)"></i><span>Your session expires soon.</span><button id="session-refresh-btn" style="margin-left:8px;padding:4px 10px;border-radius:6px;background:var(--brand,#63d9ff);color:#000;border:none;cursor:pointer;font-size:12px;font-weight:600">Stay signed in</button><button id="session-expiry-dismiss-btn" style="background:none;border:none;color:var(--text-muted,#888);cursor:pointer;font-size:16px;line-height:1;margin-left:4px">×</button>';
  document.body.appendChild(b);
  document.getElementById('session-expiry-dismiss-btn').addEventListener('click', () => {
    document.getElementById('session-expiry-banner').style.display = 'none';
  });
  b.querySelector('#session-refresh-btn').addEventListener('click', async () => {
    try {
      const { data, error } = await sb.auth.refreshSession();
      if (error) throw error;
      b.style.display = 'none';
      scheduleSessionExpiryWarning(data.session);
      toast('Session refreshed!', 'check');
    } catch (e) {
      toast('Could not refresh — please sign in again.', 'circle-exclamation');
    }
  });
}

async function initAuth() {
  const screen     = $('#auth-screen');
  const app        = $('#app');
  const githubBtn  = $('#github-login-btn');
  const googleBtn  = $('#google-login-btn');
  const loginBtn   = $('#login-btn');
  const signupBtn  = $('#signup-btn');
  const magicBtn   = $('#magic-link-btn');
  const forgotBtn  = $('#forgot-pw-btn');

  // Helper: get active form email/password
  const getSignInEmail = () => ($('#auth-email-si')?.value || '').trim();
  const getSignInPass  = () => $('#auth-password-si')?.value || '';
  const getSignUpEmail = () => ($('#auth-email-su')?.value || '').trim();
  const getSignUpPass  = () => $('#auth-password-su')?.value || '';
  const getSignUpPass2 = () => $('#auth-password-su2')?.value || '';

  function setOAuthBtnLoading(btn, text) {
    btn.disabled = true;
    const span = btn.querySelector('span');
    if (span) span.textContent = text;
  }
  function resetOAuthBtn(btn, text) {
    btn.disabled = false;
    const span = btn.querySelector('span');
    if (span) span.textContent = text;
  }

  // ── OAuth redirect overlay ────────────────────────────────────
  // On mobile the page navigates away for OAuth. Show a full-screen
  // "Redirecting…" overlay so the user doesn't tap twice or think it froze.
  function showOAuthRedirectOverlay(providerName) {
    let ov = document.getElementById('oauth-redirect-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'oauth-redirect-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg-void,#050508);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:var(--font-body,sans-serif)';
      ov.innerHTML = `
        <svg width="36" height="36" viewBox="0 0 36 36" style="animation:spin 0.9s linear infinite"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--cyan,#63d9ff)" stroke-width="3" stroke-dasharray="60 30" stroke-linecap="round"/></svg>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary,#f0f2ff)">Redirecting to ${providerName}…</div>
        <div style="font-size:12px;color:var(--text-muted,#4a5070)">You'll be brought back automatically</div>`;
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
  }

  // ── GitHub OAuth ─────────────────────────────────────────────
  githubBtn.addEventListener('click', async () => {
    setOAuthBtnLoading(githubBtn, 'Connecting…');
    showOAuthRedirectOverlay('GitHub');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.DEVIT_CONFIG.SITE_URL,
        skipBrowserRedirect: false,  // always do a full page redirect (mobile-safe)
      }
    });
    if (error) {
      const ov = document.getElementById('oauth-redirect-overlay');
      if (ov) ov.style.display = 'none';
      setAuthStatus('GitHub sign-in failed: ' + error.message, true);
      resetOAuthBtn(githubBtn, 'Continue with GitHub');
    }
    // On success the browser navigates away — no further JS runs here.
  });

  // ── Google OAuth ─────────────────────────────────────────────
  // access_type:'offline' + prompt:'consent' ensures a refresh_token
  // is issued even on re-auth, which Supabase needs for silent renewal.
  googleBtn.addEventListener('click', async () => {
    setOAuthBtnLoading(googleBtn, 'Connecting…');
    showOAuthRedirectOverlay('Google');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.DEVIT_CONFIG.SITE_URL,
        skipBrowserRedirect: false,  // always do a full page redirect (mobile-safe)
        queryParams: { access_type: 'offline', prompt: 'consent' },
      }
    });
    if (error) {
      const ov = document.getElementById('oauth-redirect-overlay');
      if (ov) ov.style.display = 'none';
      setAuthStatus('Google sign-in failed: ' + error.message, true);
      resetOAuthBtn(googleBtn, 'Continue with Google');
    }
    // On success the browser navigates away — no further JS runs here.
  });

  // ── Email sign-in (with rate limiting) ───────────────────────
  loginBtn.addEventListener('click', async () => {
    if (!checkSignInRateLimit()) return;
    const email = getSignInEmail();
    const pass  = getSignInPass();
    if (!email) { setAuthStatus('Please enter your email address', true); return; }
    if (!pass)  { setAuthStatus('Please enter your password', true); return; }
    loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
    loginBtn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      recordSignInFailure(); // only count real failures
      setAuthStatus(error.message, true);
      loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
      loginBtn.disabled = false;
    } else {
      resetSignInRateLimit(); // success — clear attempt counter
      // onAuthStateChange SIGNED_IN fires → onSignedIn() handles the rest
    }
  });

  // ── Email sign-up ────────────────────────────────────────────
  signupBtn.addEventListener('click', async () => {
    const email = getSignUpEmail();
    const pass  = getSignUpPass();
    const pass2 = getSignUpPass2();
    if (!email) { setAuthStatus('Please enter your email address', true); return; }
    if (pass.length < 6) { setAuthStatus('Password must be at least 6 characters', true); return; }
    if (pass !== pass2) { setAuthStatus('Passwords do not match', true); return; }
    signupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account…';
    signupBtn.disabled = true;
    const { error } = await sb.auth.signUp({
      email, password: pass,
      options: { emailRedirectTo: 'https://suprosmith-coder.github.io/csc/' }
    });
    if (error) {
      setAuthStatus(error.message, true);
    } else {
      // Show email verification banner (ported from Cyanix AI)
      setAuthStatus('<i class="fa-solid fa-envelope" style="margin-right:6px"></i>Check your email to confirm your account! You can resend it below if needed.');
      showEmailVerifyBanner(email);
    }
    signupBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
    signupBtn.disabled = false;
  });

  // ── Magic Link ───────────────────────────────────────────────
  magicBtn.addEventListener('click', async () => {
    const email = getSignInEmail();
    if (!email) { setAuthStatus('Enter your email address first', true); return; }
    magicBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
    magicBtn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://suprosmith-coder.github.io/csc/' }
    });
    if (error) {
      setAuthStatus(error.message, true);
    } else {
      setAuthStatus('<i class="fa-solid fa-paper-plane" style="margin-right:6px"></i>Magic link sent! Check your inbox.');
    }
    magicBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Send Magic Link instead';
    magicBtn.disabled = false;
  });

  // ── Forgot password ──────────────────────────────────────────
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
      const email = getSignInEmail();
      if (!email) { setAuthStatus('Enter your email address first', true); return; }
      forgotBtn.textContent = 'Sending…';
      forgotBtn.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://suprosmith-coder.github.io/csc/'
      });
      if (!error) setAuthStatus('<i class="fa-solid fa-envelope" style="margin-right:6px"></i>Password reset email sent! Check your inbox.');
      else setAuthStatus(error.message, true);
      forgotBtn.textContent = 'Forgot password?';
      forgotBtn.disabled = false;
    });
  }

  // Enter key shortcuts
  document.getElementById('auth-password-si')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });
  document.getElementById('auth-password-su2')?.addEventListener('keydown', e => { if (e.key === 'Enter') signupBtn.click(); });

  // ── onAuthStateChange — single source of truth ───────────────
  //
  // Ported from Cyanix AI with the following improvements:
  //   • _syncPending + user-ID dedup guard (more robust than appBuilt bool)
  //   • TOKEN_REFRESHED: reschedules expiry warning instead of ignoring
  //   • PASSWORD_RECOVERY: surfaces the password-reset UI
  //   • SIGNED_OUT: full state cleanup including expiry timer
  //   • URL cleanup: covers both PKCE (?code=) and implicit (#access_token)
  //   • Google OAuth: access_type=offline + prompt=consent for refresh token
  let _syncPending  = false;
  let _signedInUser = null;  // tracks user ID to prevent double-boot
  let appBuilt      = false;

  sb.auth.onAuthStateChange(async (event, session) => {

    // ── TOKEN_REFRESHED ────────────────────────────────────────
    // Supabase auto-refreshes the JWT every ~55 min. When it does,
    // reschedule the expiry warning with the new expiry time.
    // Do NOT re-run the sign-in flow — user is already in the app.
    if (event === 'TOKEN_REFRESHED') {
      if (session) scheduleSessionExpiryWarning(session);
      return;
    }

    // ── PASSWORD_RECOVERY ──────────────────────────────────────
    // User clicked a password-reset link. session.access_token is
    // valid and scoped to updateUser() only. Surface the reset UI.
    if (event === 'PASSWORD_RECOVERY') {
      // If the app is already visible (user was signed in), open a modal
      // instead of silently showing the auth screen behind the app.
      if (appBuilt) {
        openChangePasswordModal();
      } else {
        setAuthStatus('<i class="fa-solid fa-key" style="margin-right:6px"></i>Enter your new password below to reset it.');
        screen.style.display = 'flex';
        app.classList.remove('visible');
        document.getElementById('auth-password-si')?.focus();
      }
      return;
    }

    // ── SIGNED_OUT ─────────────────────────────────────────────
    if (!session?.user) {
      if (event === 'SIGNED_OUT') {
        // Cancel expiry warning
        if (_expiryWarningTimer) { clearTimeout(_expiryWarningTimer); _expiryWarningTimer = null; }
        const expiryBanner = document.getElementById('session-expiry-banner');
        if (expiryBanner) expiryBanner.style.display = 'none';

        // Reset all state
        _signedInUser = null;
        _syncPending  = false;
        appBuilt      = false;
        State.user    = null;
        State.profile = null;

        // Return to auth screen
        screen.style.display   = 'flex';
        screen.style.opacity   = '1';
        screen.style.transform = '';
        screen.style.transition = '';
        app.classList.remove('visible');
      }
      // All other null-session noise (INITIAL_SESSION before hash is parsed, etc.) — ignore
      return;
    }

    // ── SIGNED_IN / INITIAL_SESSION ────────────────────────────
    // Guard against double-invocation:
    //   • _syncPending: blocks re-entry while async boot is running
    //   • _signedInUser: blocks re-run if the same user is already booted
    // This handles the race between getSession() and onAuthStateChange
    // that can fire both INITIAL_SESSION and SIGNED_IN for the same session.
    if (_syncPending) return;
    if (_signedInUser && _signedInUser === session.user.id && appBuilt) return;

    _syncPending  = true;
    State.user    = session.user;

    try {
    // Clean OAuth tokens from the URL bar after Supabase parses them.
    // Implicit flow tokens arrive in the hash (#access_token=...).
    try {
      const url = new URL(window.location.href);
      const hasOAuthHash = url.hash && (url.hash.includes('access_token') || url.hash.includes('refresh_token'));
      if (hasOAuthHash) {
        history.replaceState(null, '', url.pathname + (url.search && url.search !== '?' ? url.search : ''));
      }
    } catch (e) { /* non-critical */ }

    // Schedule a session expiry warning 5 min before the JWT expires
    scheduleSessionExpiryWarning(session);

    await ensureProfile(session.user);

    _signedInUser = session.user.id;

    if (!appBuilt) {
      screen.style.opacity    = '0';
      screen.style.transform  = 'scale(1.02)';
      screen.style.transition = '0.4s ease';
      setTimeout(async () => {
        appBuilt = true;  // set inside callback so double-fire can't sneak through
        screen.style.display = 'none';
        app.classList.add('visible');
        await buildApp();
        const firstName = State.profile?.display_name?.split(' ')[0] || 'dev';
        toast(`Welcome${event === 'SIGNED_IN' ? '' : ' back'}, ${firstName}!`, 'rocket');
      }, 400);
    }

    } catch (bootErr) {
      // Ensure _syncPending never stays true, which would permanently lock the auth flow
      console.error('[Devit] Auth boot error:', bootErr);
      setAuthStatus('Sign-in error — please refresh and try again.', true);
    } finally {
      _syncPending = false;
    }

  }); // end onAuthStateChange

  // ── getSession() on page load ─────────────────────────────────
  // For returning users: resolves instantly from localStorage.
  // For OAuth redirects (implicit): Supabase parses #access_token from the hash.
  //
  // MOBILE FIX: Mobile browsers (iOS Safari, Chrome Android) sometimes deliver
  // the hash *after* JS has already executed, or restore the page from bfcache
  // (back-forward cache) skipping onAuthStateChange entirely.
  // Strategy:
  //   1. If hash token detected → retry getSession up to 5× with 200ms gaps
  //   2. pageshow listener → catches bfcache restore (iOS Safari back button)
  //   3. hashchange listener → catches late hash delivery on Android WebViews

  const _hash = window.location.hash;
  const _hasTokenHash = _hash && (_hash.includes('access_token') || _hash.includes('refresh_token'));

  if (_hasTokenHash) {
    // Hash is present — retry until Supabase parses it (mobile may be slow)
    let _gotSession = false;
    for (let i = 0; i < 5; i++) {
      const { data } = await sb.auth.getSession();
      if (data?.session) { _gotSession = true; break; }
      await new Promise(r => setTimeout(r, 200));
    }
    // If still nothing, Supabase may not have seen the hash yet — wait one more tick
    if (!_gotSession) await sb.auth.getSession();
  } else {
    await sb.auth.getSession();
  }

  // Catch hash arriving after page load (Android WebViews)
  window.addEventListener('hashchange', async () => {
    const h = window.location.hash;
    if (h && (h.includes('access_token') || h.includes('refresh_token'))) {
      await sb.auth.getSession();
    }
  });

  // Catch bfcache restore (iOS Safari back-button after OAuth redirect)
  // bfcache restores don't re-fire DOMContentLoaded or onAuthStateChange,
  // so we need to recheck the session manually here.
  window.addEventListener('pageshow', async (e) => {
    if (e.persisted && !State.user) {
      const { data } = await sb.auth.getSession();
      // If we now have a session but the app isn't built, boot it
      if (data?.session && !appBuilt) {
        // onAuthStateChange won't fire from bfcache — trigger manually
        const user = data.session.user;
        State.user = user;
        await ensureProfile(user);
        _signedInUser = user.id;
        appBuilt = true;
        const screen = $('#auth-screen');
        const app    = $('#app');
        screen.style.display = 'none';
        app.classList.add('visible');
        await buildApp();
        const firstName = State.profile?.display_name?.split(' ')[0] || 'dev';
        toast(`Welcome back, ${firstName}!`, 'rocket');
      }
    }
  });
  // If no session exists, auth screen stays visible (shown by default in HTML).
}

// ── Email verification banner (ported from Cyanix AI) ────────
// Shown after email sign-up until the user confirms their email.
// OAuth users (Google/GitHub) are always auto-confirmed — skip them.
function showEmailVerifyBanner(email) {
  if (document.getElementById('email-verify-banner')) return;
  const b = document.createElement('div');
  b.id = 'email-verify-banner';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:10px 16px;background:var(--bg-surface,#1e1e2e);border-bottom:1px solid var(--border,#333);display:flex;align-items:center;justify-content:center;gap:10px;font-size:13px;z-index:9999;flex-wrap:wrap';
  b.innerHTML = `<i class="fa-solid fa-envelope-circle-check" style="color:var(--brand,#63d9ff)"></i><span>Confirmation sent to <strong>${email}</strong> — check your inbox.</span><button id="verify-resend-btn" style="padding:3px 10px;border-radius:6px;background:var(--brand,#63d9ff);color:#000;border:none;cursor:pointer;font-size:12px;font-weight:600">Resend</button><button onclick="document.getElementById('email-verify-banner').remove()" style="background:none;border:none;color:var(--text-muted,#888);cursor:pointer;font-size:18px;line-height:1;margin-left:4px">×</button>`;
  document.body.appendChild(b);
  document.getElementById('verify-resend-btn').addEventListener('click', async function() {
    this.textContent = 'Sending…';
    this.disabled = true;
    const { error } = await sb.auth.resend({ type: 'signup', email });
    if (error) toast('Failed to resend: ' + error.message, 'circle-exclamation');
    else       toast('Confirmation email resent!', 'envelope');
    setTimeout(() => { this.textContent = 'Resend'; this.disabled = false; }, 30_000);
  });
}

// ── Change Password Modal (shown on PASSWORD_RECOVERY when app is visible) ──
function openChangePasswordModal() {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  if (!modal || !body) return;
  $('#modal-title-text').textContent = 'Set New Password';
  modal.classList.add('open');
  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div class="auth-input-group">
        <label>New Password</label>
        <input type="password" id="recovery-pw" class="auth-input" placeholder="At least 6 characters" minlength="6" autocomplete="new-password">
      </div>
      <div class="auth-input-group">
        <label>Confirm New Password</label>
        <input type="password" id="recovery-pw2" class="auth-input" placeholder="Repeat password" autocomplete="new-password">
      </div>
      <div id="recovery-status" style="font-size:12px;color:var(--text-muted);display:none"></div>
      <button class="auth-btn-primary" id="recovery-save-btn"><i class="fa-solid fa-key"></i> Set Password</button>
    </div>
  `;
  $('#recovery-save-btn').addEventListener('click', async () => {
    const pw  = $('#recovery-pw').value;
    const pw2 = $('#recovery-pw2').value;
    const statusEl = $('#recovery-status');
    statusEl.style.display = 'block';
    if (pw.length < 6) { statusEl.style.color = 'var(--rose)'; statusEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (pw !== pw2)   { statusEl.style.color = 'var(--rose)'; statusEl.textContent = 'Passwords do not match.'; return; }
    const btn = $('#recovery-save-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) {
      statusEl.style.color = 'var(--rose)';
      statusEl.textContent = 'Failed: ' + error.message;
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Set Password';
    } else {
      modal.classList.remove('open');
      toast('Password updated!', 'check');
    }
  });
}

/* ── Ensure Profile ─────────────────────────────────────────── */
async function ensureProfile(authUser) {
  let { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (error || !profile) {
    // Create profile from OAuth metadata or email.
    // avatar_url: GitHub uses meta.avatar_url, Google uses meta.picture.
    // full_name: GitHub uses meta.full_name, Google uses meta.name.
    // (Fix ported from Cyanix AI — original only handled GitHub.)
    const meta = authUser.user_metadata || {};
    const email = authUser.email || '';
    const provider = authUser.app_metadata?.provider || '';
    const isGitHub = provider === 'github';
    let baseUsername = (meta.user_name || meta.preferred_username || email.split('@')[0] || 'user_' + Date.now()).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    const display_name = meta.full_name || meta.name || baseUsername;
    const avatar_url = meta.avatar_url || meta.picture || null; // GitHub || Google

    // Attempt upsert; if username is taken (23505 unique violation), retry with a random suffix.
    let newProfile = null;
    let createErr  = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const username = attempt === 0 ? baseUsername : baseUsername.slice(0, 25) + '_' + Math.random().toString(36).slice(2, 6);
      const res = await sb
        .from('profiles')
        .upsert({
          id: authUser.id,
          username,
          display_name,
          avatar_url,
          bio: '',
          location: '',
          website: '',
          tech_stack: [],
          followers_count: 0,
          following_count: 0,
          posts_count: 0,
          is_github: isGitHub,
        }, { onConflict: 'id' })
        .select()
        .single();
      newProfile = res.data;
      createErr  = res.error;
      // 23505 = unique_violation (username taken); retry with suffix
      if (!createErr || createErr.code !== '23505') break;
    }

    if (createErr) {
      console.error('[Devit] Failed to create profile:', createErr);
      // Fallback profile so the app doesn't crash
      State.profile = {
        id: authUser.id,
        username: email.split('@')[0] || 'user',
        display_name: email.split('@')[0] || 'User',
        avatar_url: null,
        bio: '',
        location: '',
        website: '',
        tech_stack: [],
        followers_count: 0,
        following_count: 0,
        posts_count: 0,
      };
    } else {
      State.profile = newProfile;
    }
  } else {
    State.profile = profile;
  }

  // Upsert presence
  await sb.from('presence').upsert({ id: authUser.id, online: true, last_seen: new Date().toISOString() }, { onConflict: 'id' });
}

/* ── Build App ──────────────────────────────────────────────── */
async function buildApp() {
  // Build UI immediately — don't let DB schema check block nav from rendering
  buildTopbar();
  buildSidebar();
  buildRightbar();
  initBottomNav();
  navigateTo('feed');

  // Remove aria-hidden now that app is active
  const appEl = document.getElementById('app');
  if (appEl) appEl.removeAttribute('aria-hidden');

  // Non-blocking background tasks
  bootstrapSchema(); // fire and forget — only logs warnings
  initPresenceRealtime();
  initGlobalNotifSub();
  loadUnreadCounts();
  registerServiceWorker();
  handleInviteOnLoad();
  setTimeout(() => registerPushNotifications(), 3000);
  // Enable swipe left/right to switch tabs on mobile
  setTimeout(() => initMainSwipeNavigation(), 500);
}

/* ── Invite Link System ─────────────────────────────────────── */

const INVITE_EDGE_URL = `${window.DEVIT_CONFIG.SUPABASE_URL}/functions/v1/invite`;
const SITE_URL = window.DEVIT_CONFIG.SITE_URL;

/** Generate a DEVIT-XXXXXX style code */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 (ambiguous)
  let code = 'DEVIT-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Get or create a permanent invite link for the current user.
 * Re-uses existing codes — one per user, stored in invite_links.
 */
async function getOrCreateInviteCode() {
  // Check for existing code
  const { data: existing } = await sb
    .from('invite_links')
    .select('code')
    .eq('inviter_id', State.user.id)
    .limit(1)
    .single();

  if (existing?.code) return existing.code;

  // Create a new one (retry on collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const { data, error } = await sb
      .from('invite_links')
      .insert({ code, inviter_id: State.user.id })
      .select('code')
      .single();
    if (!error && data) return data.code;
    // 23505 = unique_violation — code already taken, retry
    if (error?.code !== '23505') {
      console.error('[Devit] Failed to create invite link:', error);
      return null;
    }
  }
  return null;
}

/**
 * Build the shareable invite URL that routes through the Edge Function.
 * Format: https://<project>.supabase.co/functions/v1/invite?code=DEVIT-XXXXXX
 */
function buildInviteUrl(code) {
  return `${INVITE_EDGE_URL}?code=${encodeURIComponent(code)}`;
}

/**
 * Called on app boot — checks if the current URL has ?invite=CODE.
 * If so, records the usage and shows a welcome modal to the new user.
 */
async function handleInviteOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('invite');
  if (!code) return;

  // Clean the invite param from the URL immediately (don't leave it in history)
  try {
    const clean = new URL(window.location.href);
    clean.searchParams.delete('invite');
    history.replaceState(null, '', clean.pathname + (clean.search !== '?' ? clean.search : ''));
  } catch (_) {}

  // Record usage via RPC (server-side atomic increment)
  const { data: valid } = await sb.rpc('use_invite', { invite_code: code });

  if (!valid) {
    // Expired or non-existent — show a quiet toast, don't make a big deal
    toast('Invite link expired or invalid', 'circle-exclamation');
    return;
  }

  // Save code to profile so we can track attribution
  await sb
    .from('profiles')
    .update({ invited_by_code: code })
    .eq('id', State.user.id);

  // Fetch the inviter profile to show in the welcome card
  const { data: invite } = await sb
    .from('invite_links')
    .select('inviter_id, profiles(id, username, display_name, avatar_url, bio)')
    .eq('code', code)
    .single();

  if (!invite) return;
  showInviteWelcomeModal(invite.profiles);
}

/**
 * Show a branded welcome modal when a user arrives via an invite link.
 */
function showInviteWelcomeModal(inviter) {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  if (!modal || !body) return;

  $('#modal-title-text').textContent = 'Welcome to Devit!';
  modal.classList.add('open');

  body.innerHTML = `
    <div style="padding:24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">

      <!-- Devit logo -->
      <img src="devit.png" alt="Devit" style="width:52px;height:52px;border-radius:14px;border:1px solid rgba(99,217,255,0.2);background:rgba(99,217,255,0.08);padding:6px;object-fit:contain;">

      <!-- Inviter avatar -->
      <div style="position:relative">
        ${avatarHtml(inviter, 68)}
        <div style="position:absolute;bottom:-4px;right:-4px;width:22px;height:22px;background:var(--emerald);border-radius:50%;border:2px solid var(--bg-surface);display:flex;align-items:center;justify-content:center;">
          <i class="fa-solid fa-check" style="font-size:10px;color:#050508"></i>
        </div>
      </div>

      <div>
        <div style="font-size:18px;font-weight:800;font-family:var(--font-display);margin-bottom:4px">
          ${escapeHtml(inviter?.display_name || inviter?.username || 'A developer')} invited you
        </div>
        <div style="font-size:13px;color:var(--cyan)">@${escapeHtml(inviter?.username || '')}</div>
      </div>

      <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;max-width:280px">
        You're joining Devit — the social platform built for developers.<br>
        Code. Connect. Ship.
      </p>

      <div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:280px">
        <button id="invite-welcome-profile" class="auth-btn-primary" style="width:100%;padding:12px">
          <i class="fa-solid fa-user-plus"></i> View @${escapeHtml(inviter?.username || '')}'s profile
        </button>
        <button id="invite-welcome-dismiss" class="auth-btn-magic" style="width:100%;padding:12px">
          Explore Devit
        </button>
      </div>
    </div>
  `;

  $('#invite-welcome-profile').addEventListener('click', () => {
    modal.classList.remove('open');
    if (inviter?.id) renderProfile($('#main'), inviter.id);
  });
  $('#invite-welcome-dismiss').addEventListener('click', () => {
    modal.classList.remove('open');
  });
}

/**
 * Open the share invite modal — called from the profile share button.
 */
async function openShareInviteModal(profile) {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  if (!modal || !body) return;

  $('#modal-title-text').textContent = 'Invite to Devit';
  modal.classList.add('open');

  // Loading state
  body.innerHTML = `
    <div style="padding:32px;text-align:center;color:var(--text-muted)">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:20px;color:var(--cyan)"></i>
      <div style="margin-top:10px;font-size:13px">Generating invite link…</div>
    </div>
  `;

  const code = await getOrCreateInviteCode();

  if (!code) {
    body.innerHTML = `<div style="padding:32px;text-align:center;color:var(--rose)">Failed to generate invite link. Try again.</div>`;
    return;
  }

  const inviteUrl = buildInviteUrl(code);

  body.innerHTML = `
    <div style="padding:20px;display:flex;flex-direction:column;gap:16px">

      <!-- Preview card -->
      <div style="
        background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);
        overflow:hidden;
      ">
        <!-- OG image strip -->
        <div style="
          height:72px;
          background:linear-gradient(135deg, rgba(99,217,255,0.15), rgba(167,139,250,0.15));
          display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border);
          gap:12px;padding:0 16px;
        ">
          <img src="devit.png" alt="Devit" style="width:28px;height:28px;border-radius:6px;object-fit:contain;">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.08em;text-transform:uppercase">Devit · Code. Connect. Ship.</div>
        </div>

        <!-- Inviter info -->
        <div style="padding:14px 16px;display:flex;align-items:center;gap:12px">
          ${avatarHtml(profile, 44)}
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700">${escapeHtml(profile?.display_name || profile?.username || 'You')} invited you to Devit</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Join the developer social platform</div>
          </div>
        </div>
      </div>

      <!-- Invite code display -->
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        background:var(--bg-elevated);border:1px solid var(--border-active);border-radius:var(--radius-md);
        padding:10px 14px;
      ">
        <div>
          <div style="font-size:10px;color:var(--text-muted);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px">Invite code</div>
          <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--cyan);letter-spacing:0.08em">${escapeHtml(code)}</div>
        </div>
        <button id="copy-code-btn" style="
          background:var(--bg-float);border:1px solid var(--border);border-radius:var(--radius-sm);
          color:var(--text-secondary);padding:6px 10px;font-size:12px;font-weight:600;
          transition:all 0.15s;
        ">Copy code</button>
      </div>

      <!-- Full URL display -->
      <div style="
        background:var(--bg-void);border:1px solid var(--border);border-radius:var(--radius-sm);
        padding:8px 12px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);
        word-break:break-all;line-height:1.5;
      ">${escapeHtml(inviteUrl)}</div>

      <!-- Action buttons -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="share-invite-copy" class="auth-btn-primary" style="width:100%;padding:12px">
          <i class="fa-solid fa-link"></i> Copy invite link
        </button>
        <button id="share-invite-native" class="auth-btn-magic" style="width:100%;padding:12px;display:${navigator.share ? 'block' : 'none'}">
          <i class="fa-solid fa-share-nodes"></i> Share via…
        </button>
      </div>

      <!-- Fine print -->
      <div style="font-size:11px;color:var(--text-muted);text-align:center;line-height:1.5">
        Link is permanent · No expiry · Unlimited uses
      </div>
    </div>
  `;

  // Copy full link
  $('#share-invite-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      const btn = $('#share-invite-copy');
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-link"></i> Copy invite link'; }, 2000);
      toast('Invite link copied!', 'link');
    } catch (_) {
      toast('Could not copy — try manually', 'circle-exclamation');
    }
  });

  // Copy code only
  $('#copy-code-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      const btn = $('#copy-code-btn');
      btn.textContent = 'Copied!';
      btn.style.color = 'var(--emerald)';
      setTimeout(() => { btn.textContent = 'Copy code'; btn.style.color = ''; }, 2000);
    } catch (_) {}
  });

  // Native share sheet (mobile)
  const nativeBtn = $('#share-invite-native');
  if (nativeBtn) {
    nativeBtn.addEventListener('click', async () => {
      try {
        await navigator.share({
          title: `Join me on Devit!`,
          text: `${profile?.display_name || profile?.username || 'A dev'} invited you to Devit — Code. Connect. Ship.`,
          url: inviteUrl,
        });
      } catch (_) {} // user dismissed — no-op
    });
  }
}

function initGlobalNotifSub() {
  const sub = sb
    .channel(`global_notifs_${State.user.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${State.user.id}` }, payload => {
      State.unreadNotifs++;
      updateBadges();
      // If the notifications view is currently open, refresh it
      if (State.currentView === 'notifications') loadNotifications();
    })
    .subscribe();
  GlobalSubs.push(sub);
}

function initBottomNav() {
  // Wire bottom nav buttons
  document.querySelectorAll('.bnav-btn[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });
  // Wire FAB
  const fab = document.getElementById('mobile-fab');
  if (fab) fab.addEventListener('click', openNewPostModal);
}

/* ── Presence Realtime ──────────────────────────────────────── */
function initPresenceRealtime() {
  const channel = sb.channel('presence_global', {
    config: { presence: { key: State.user.id } }
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      State.onlineUsers = new Set(Object.keys(state));
      updatePresenceDots();
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach(p => State.onlineUsers.add(p.key));
      updatePresenceDots();
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach(p => State.onlineUsers.delete(p.key));
      updatePresenceDots();
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online: true, user_id: State.user.id });
      }
    });

  State.realtimeSubs.push(channel);
  GlobalSubs.push(channel); // mark as global — don't remove on view change

  // Heartbeat to keep presence alive
  setInterval(async () => {
    await sb.from('presence').upsert({ id: State.user.id, online: true, last_seen: new Date().toISOString() }, { onConflict: 'id' });
  }, 30000);

  // Mark offline on page unload
  window.addEventListener('beforeunload', () => {
    sb.from('presence').update({ online: false }).eq('id', State.user.id);
  });
}

function updatePresenceDots() {
  // Update any visible online dots
  document.querySelectorAll('[data-presence-uid]').forEach(dot => {
    const uid = dot.dataset.presenceUid;
    dot.classList.toggle('online', State.onlineUsers.has(uid));
    dot.classList.toggle('offline', !State.onlineUsers.has(uid));
  });
}

async function loadUnreadCounts() {
  const { count: notifCount } = await sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', State.user.id)
    .eq('read', false);
  State.unreadNotifs = notifCount || 0;

  // Count unread DMs
  const { data: convos } = await sb
    .from('conversations')
    .select('id')
    .or(`participant_a.eq.${State.user.id},participant_b.eq.${State.user.id}`);

  if (convos?.length) {
    const convoIds = convos.map(c => c.id);
    const { count: msgCount } = await sb
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convoIds)
      .neq('sender_id', State.user.id)
      .eq('read', false);
    State.unreadMessages = msgCount || 0;
  }

  updateBadges();
}

function updateBadges() {
  const notifBadge = $('#nav-notifs .badge');
  const msgBadge   = $('#nav-messages-btn .badge');
  if (notifBadge) notifBadge.style.display = State.unreadNotifs > 0 ? '' : 'none';
  if (msgBadge)   msgBadge.style.display   = State.unreadMessages > 0 ? '' : 'none';
  // Bottom nav badges
  const bnavNotifs = document.getElementById('bnav-badge-notifs');
  const bnavMsgs   = document.getElementById('bnav-badge-messages');
  if (bnavNotifs)  bnavNotifs.classList.toggle('visible', State.unreadNotifs > 0);
  if (bnavMsgs)    bnavMsgs.classList.toggle('visible', State.unreadMessages > 0);
}

/* ── Topbar ─────────────────────────────────────────────────── */
function buildTopbar() {
  const tb = $('#topbar');
  tb.innerHTML = `
    <div class="topbar-logo">
      <img src="devit.png" alt="Devit" style="width:30px;height:30px;border-radius:8px;object-fit:cover">
      <span>Devit</span>
    </div>
    <div class="topbar-search">
      <span class="topbar-search-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </span>
      <input type="text" id="search-input" placeholder="Search people, posts, communities…">
    </div>
    <div class="topbar-actions">
      <button class="topbar-action-btn" id="nav-notifs" title="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="badge" style="${State.unreadNotifs > 0 ? '' : 'display:none'}"></span>
      </button>
      <button class="topbar-action-btn" id="nav-messages-btn" title="Messages">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="badge" style="${State.unreadMessages > 0 ? '' : 'display:none'}"></span>
      </button>
      <button class="topbar-action-btn" title="New post" id="new-post-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </button>
      <button class="topbar-action-btn" id="topbar-signout-btn" title="Sign out"><i class="fa-solid fa-power-off"></i></button>
      <button id="theme-toggle" title="Toggle theme" aria-label="Toggle light/dark mode">
        <i class="fa-solid fa-moon"></i>
      </button>
      <div class="topbar-avatar" id="topbar-avatar-btn">
        ${State.profile?.avatar_url
          ? `<img src="${State.profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : avatarInitials(State.profile?.display_name || 'U')}
      </div>
    </div>
  `;

  $('#nav-notifs').addEventListener('click', () => navigateTo('notifications'));
  $('#nav-messages-btn').addEventListener('click', () => navigateTo('messages'));
  $('#new-post-btn').addEventListener('click', openNewPostModal);
  $('#topbar-avatar-btn').addEventListener('click', () => navigateTo('profile'));
  $('#topbar-signout-btn').addEventListener('click', async () => {
    await sb.from('presence').update({ online: false }).eq('id', State.user.id);
    await sb.auth.signOut();
    toast('Signed out. See you soon!', 'right-from-bracket');
  });

  // Theme toggle
  const themeToggleBtn = $('#theme-toggle');
  if (themeToggleBtn) {
    const applyTheme = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('devit-theme', theme);
      const icon = themeToggleBtn.querySelector('i');
      if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
      themeToggleBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    };
    // Init from saved preference
    const savedTheme = localStorage.getItem('devit-theme') || 'dark';
    applyTheme(savedTheme);
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // Search with debounce
  let searchTimeout;
  $('#search-input').addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length > 1) {
      searchTimeout = setTimeout(() => runSearch(q), 350);
    }
  });
  $('#search-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; closeSearch(); }
    if (e.key === 'Enter') { const q = e.target.value.trim(); if (q) runSearch(q); }
  });
  $('#search-input').addEventListener('focus', () => {
    if ($('#search-input').value.trim().length > 1) runSearch($('#search-input').value.trim());
  });
}

/* ── Search ─────────────────────────────────────────────────── */
async function runSearch(query) {
  const existingOverlay = document.getElementById('search-overlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = el('div', '', '');
  overlay.id = 'search-overlay';
  overlay.style.cssText = `position:fixed;top:56px;left:50%;transform:translateX(-50%);width:560px;max-width:90vw;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);z-index:900;box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;max-height:70vh;overflow-y:auto`;

  overlay.innerHTML = `<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border)">Searching for "${escapeHtml(query)}"…</div>`;
  document.body.appendChild(overlay);

  const closeOnClick = e => { if (!overlay.contains(e.target) && e.target !== $('#search-input')) { overlay.remove(); document.removeEventListener('click', closeOnClick); } };
  setTimeout(() => document.addEventListener('click', closeOnClick), 100);

  // Full-text search via Postgres tsvector RPC (falls back gracefully to ilike)
  const tsQuery = query.trim().split(/\s+/).filter(Boolean).join(' & ');

  const [profilesRes, postsRes] = await Promise.all([
    sb.from('profiles').select('id, username, display_name, avatar_url, bio')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(5),
    sb.rpc('search_posts_fts', { query_text: tsQuery }).limit ? null
      : sb.from('posts')
          .select('id, content, created_at, author_id, profiles(username, display_name, avatar_url)')
          .ilike('content', `%${query}%`).limit(5),
  ]);

  // Try FTS RPC first, fall back to ilike
  let posts;
  const { data: ftsPosts, error: ftsErr } = await sb.rpc('search_posts_fts', { query_text: tsQuery, max_results: 5 });
  if (!ftsErr && ftsPosts) {
    posts = ftsPosts;
  } else {
    const { data: ilikePosts } = await sb.from('posts')
      .select('id, content, created_at, author_id, profiles(username, display_name, avatar_url)')
      .ilike('content', `%${query}%`).limit(5);
    posts = ilikePosts;
  }

  const profiles = profilesRes?.data;

  let html = '';
  if (profiles?.length) {
    html += `<div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">People</div>`;
    profiles.forEach(p => {
      html += `<div class="search-result-item" data-uid="${p.id}" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer">
        ${avatarHtml(p, 32)}
        <div><div style="font-weight:600;font-size:13px">${escapeHtml(p.display_name || p.username)}</div><div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(p.username)}</div></div>
      </div>`;
    });
  }
  if (posts?.length) {
    html += `<div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;border-top:1px solid var(--border);margin-top:4px">Posts</div>`;
    posts.forEach(p => {
      html += `<div class="search-result-item" data-pid="${p.id}" style="padding:10px 16px;cursor:pointer">
        <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(p.profiles?.username || '?')}</div>
        <div style="font-size:13px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.content)}</div>
      </div>`;
    });
  }
  if (!html) html = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No results for "${escapeHtml(query)}"</div>`;

  overlay.innerHTML = html;

  overlay.querySelectorAll('.search-result-item[data-uid]').forEach(item => {
    item.addEventListener('click', () => { overlay.remove(); renderProfile($('#main'), item.dataset.uid); });
  });
  overlay.querySelectorAll('.search-result-item[data-pid]').forEach(item => {
    item.addEventListener('click', () => { overlay.remove(); navigateTo('feed'); });
  });
}

function closeSearch() {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.remove();
}

/* ── Sidebar ────────────────────────────────────────────────── */
function buildSidebar() {
  const sb_el = $('#sidebar');
  const links = [
    { id: 'feed',          icon: '<i class="fa-solid fa-house"></i>',        label: 'Activity' },
    { id: 'explore',       icon: '<i class="fa-solid fa-compass"></i>',       label: 'Discover' },
    { id: 'snippets',      icon: '<i class="fa-solid fa-film"></i>',          label: 'Snippets' },
    { id: 'links',         icon: '<i class="fa-solid fa-users"></i>',         label: 'Links', badge: 0 },
    { id: 'notifications', icon: '<i class="fa-solid fa-bell"></i>',          label: 'Alerts', badge: State.unreadNotifs },
    { id: 'messages',      icon: '<i class="fa-solid fa-message"></i>',       label: 'DMs', badge: State.unreadMessages },
    { id: 'profile',       icon: '<i class="fa-solid fa-user"></i>',          label: 'Profile' },
    { id: 'bookmarks',     icon: '<i class="fa-solid fa-bookmark"></i>',      label: 'Saved' },
    { id: 'settings',      icon: '<i class="fa-solid fa-gear"></i>',          label: 'Settings' },
  ];

  let html = `<div class="sidebar-section-label">Workspace</div>`;
  links.forEach(l => {
    html += `<div class="sidebar-link${l.id === State.currentView ? ' active' : ''}" data-nav="${l.id}">
      <span class="icon">${l.icon}</span>
      <span>${l.label}</span>
      ${l.badge ? `<span class="badge-count">${l.badge}</span>` : ''}
    </div>`;
  });

  html += `<div class="sidebar-divider"></div>
  <div class="sidebar-communities-header">
    <span>Channels</span>
    <button id="create-community-btn" title="Create channel"><i class="fa-solid fa-plus"></i></button>
  </div>
  <div id="sidebar-communities">
    <div style="padding:8px 16px;font-size:12px;color:var(--text-muted)">Loading…</div>
  </div>`;

  sb_el.innerHTML = html;

  $$('.sidebar-link[data-nav]', sb_el).forEach(link => {
    link.addEventListener('click', () => navigateTo(link.dataset.nav));
  });

  $('#create-community-btn').addEventListener('click', openCreateCommunityModal);

  // Load communities user has joined
  loadSidebarCommunities();
}

async function loadSidebarCommunities() {
  const { data } = await sb
    .from('community_members')
    .select('community_id, communities(id, name, icon, color)')
    .eq('user_id', State.user.id)
    .limit(10);

  const container = $('#sidebar-communities');
  if (!container) return;

  if (!data?.length) {
    container.innerHTML = `<div style="padding:8px 16px;font-size:12px;color:var(--text-muted)">No communities yet — explore!</div>`;
    return;
  }

  container.innerHTML = data.map(m => `
    <div class="sidebar-link sidebar-community-link" data-cid="${m.communities.id}" style="gap:8px">
      <span style="font-size:16px">${m.communities.icon}</span>
      <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.communities.name}</span>
    </div>
  `).join('');

  $$('.sidebar-community-link', container).forEach(link => {
    link.addEventListener('click', () => openCommunity(link.dataset.cid));
  });
}

function updateSidebarActive() {
  $$('.sidebar-link[data-nav]').forEach(l => {
    l.classList.toggle('active', l.dataset.nav === State.currentView);
  });
}

/* ── Rightbar ───────────────────────────────────────────────── */
async function buildRightbar() {
  const rb = $('#rightbar');
  rb.innerHTML = `
    <div class="rightbar-section">
      <div class="rightbar-title">Who to Follow</div>
      <div id="who-to-follow"><div style="color:var(--text-muted);font-size:13px">Loading…</div></div>
    </div>
    <div class="rightbar-section">
      <div class="rightbar-title">Trending</div>
      <div id="trending-tags"><div style="color:var(--text-muted);font-size:13px">Loading…</div></div>
    </div>
    <div class="rightbar-section" id="online-users-section">
      <div class="rightbar-title">Online Now</div>
      <div id="online-users-list"><div style="color:var(--text-muted);font-size:13px">Loading…</div></div>
    </div>
  `;

  loadWhoToFollow();
  loadTrendingTags();
}

async function loadWhoToFollow() {
  // Get people the user follows
  const { data: followingData } = await sb
    .from('follows')
    .select('following_id')
    .eq('follower_id', State.user.id);

  const followingIds = (followingData || []).map(f => f.following_id);
  followingIds.push(State.user.id); // exclude self

  const { data: suggestions } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, followers_count')
    .not('id', 'in', `(${followingIds.join(',') || State.user.id})`)
    .order('followers_count', { ascending: false })
    .limit(4);

  const container = $('#who-to-follow');
  if (!container) return;

  if (!suggestions?.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:12px">You're following everyone! 🎉</div>`;
    return;
  }

  container.innerHTML = suggestions.map(p => `
    <div class="follow-suggestion">
      ${avatarHtml(p, 36)}
      <div class="follow-suggestion-info">
        <div class="follow-suggestion-name">${p.display_name || p.username}</div>
        <div class="follow-suggestion-handle">@${p.username}</div>
      </div>
      <button class="follow-btn" data-uid="${p.id}">Follow</button>
    </div>
  `).join('');

  $$('.follow-btn', container).forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      btn.disabled = true;
      btn.textContent = '…';
      const { error } = await sb.from('follows').insert({ follower_id: State.user.id, following_id: uid });
      if (!error) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Following';
        btn.style.opacity = '0.5';
        // Update follow counts using rpc (requires increment function in Supabase)
        await sb.rpc('increment_followers', { target_user_id: uid });
        await sb.rpc('increment_following', { target_user_id: State.user.id });
        // Notify
        await sb.from('notifications').insert({ user_id: uid, actor_id: State.user.id, type: 'follow' });
        toast('Followed!', 'user-check');
      } else {
        btn.textContent = 'Follow';
        btn.disabled = false;
      }
    });
  });
}

async function loadTrendingTags() {
  const container = $('#trending-tags');
  if (!container) return;
  // Extract hashtags from recent posts
  const { data: posts } = await sb.from('posts').select('content').order('created_at', { ascending: false }).limit(100);
  const tagCounts = {};
  (posts || []).forEach(p => {
    const matches = p.content.match(/#\w+/g) || [];
    matches.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
  });

  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!sorted.length) {
    container.innerHTML = `<div class="trending-item"><div class="trending-tag">#developers</div><div class="trending-count">Be the first to post!</div></div>`;
    return;
  }

  container.innerHTML = sorted.map(([tag, count]) => `
    <div class="trending-item">
      <div class="trending-tag">${tag}</div>
      <div class="trending-count">${count} post${count !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
}

/* ── Navigation ─────────────────────────────────────────────── */
// ── Dynamic meta tags for SPA ─────────────────────────────────
function updatePageMeta({ title, description } = {}) {
  const siteName = 'Devit';
  const baseDesc = 'The social platform built by developers, for developers.';
  const pageTitle = title ? `${title} · ${siteName}` : `${siteName} — Code. Connect. Ship.`;
  const pageDesc  = description || baseDesc;

  document.title = pageTitle;
  const metas = {
    'description':          pageDesc,
    'og:title':             pageTitle,
    'og:description':       pageDesc,
    'twitter:title':        pageTitle,
    'twitter:description':  pageDesc,
  };
  Object.entries(metas).forEach(([key, val]) => {
    const el = document.querySelector(`meta[name="${key}"], meta[property="${key}"]`);
    if (el) el.setAttribute('content', val);
  });
}

const viewMeta = {
  feed:          { title: 'Home Feed' },
  explore:       { title: 'Explore', description: 'Discover developers, communities, and trending topics on Devit.' },
  snippets:      { title: 'Snippets', description: 'Short-form code videos from the developer community.' },
  links:         { title: 'Links', description: 'Connect with other developers on Devit.' },
  notifications: { title: 'Notifications' },
  messages:      { title: 'Messages' },
  profile:       { title: 'Profile' },
  bookmarks:     { title: 'Bookmarks' },
  settings:      { title: 'Settings' },
};

// Track view-specific subs separately from global ones
const GlobalSubs = []; // presence channel, etc.

function navigateTo(view) {
  // Clean up snippets full-screen overlay if leaving snippets view
  const existingSnippetsContainer = document.getElementById('snippets-container');
  if (existingSnippetsContainer) {
    document.querySelectorAll('.snip-video').forEach(v => v.pause());
    existingSnippetsContainer.remove();
  }

  State.currentView = view;
  showPresence();
  updateSidebarActive();
  updateBottomNavActive(view);
  updatePageMeta(viewMeta[view] || {});
  const main = $('#main');
  main.style.cssText = ''; // reset any inline styles set by snippets view
  main.innerHTML = '';
  closeSearch();

  // Clean up view-specific realtime subs (all except the first N global ones)
  const viewSubs = State.realtimeSubs.splice(GlobalSubs.length);
  viewSubs.forEach(sub => {
    try { sb.removeChannel(sub); } catch (e) { /* ignore */ }
  });

  const renderers = {
    feed:          renderFeed,
    explore:       renderExplore,
    snippets:      renderSnippets,
    links:         renderLinks,
    notifications: renderNotifications,
    messages:      renderMessages,
    profile:       renderProfile,
    bookmarks:     renderBookmarks,
    settings:      renderSettings,
  };

  (renderers[view] || renderFeed)(main);

  // Page enter animation
  main.classList.remove('page-enter');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      main.classList.add('page-enter');
      // Focus management: move focus to main for screen readers
      main.focus();
    });
  });
}

function updateBottomNavActive(view) {
  const btns = document.querySelectorAll('.bnav-btn');
  btns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });
}

/* ── Tab Swipe Navigation (mobile) ─────────────────────────── */
// Ordered list of views that swipe left/right cycles through
const NAV_SWIPE_ORDER = ['feed', 'snippets', 'explore', 'links', 'notifications', 'profile'];

function initMainSwipeNavigation() {
  const mainEl = document.getElementById('main');
  if (!mainEl || !('ontouchstart' in window)) return;

  let sx = 0, sy = 0, sTime = 0;

  mainEl.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    sTime = Date.now();
  }, { passive: true });

  mainEl.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    const dt = Date.now() - sTime;

    // Must be fast enough, wide enough, and more horizontal than vertical
    if (dt > 600 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.75) return;

    // Don't swipe when inside scroll containers (messages, DMs etc.)
    const target = e.target;
    if (target.closest('.dm-messages, .channel-messages-list, #chat-messages-list, .messages-layout')) return;

    const curIdx = NAV_SWIPE_ORDER.indexOf(State.currentView);
    if (curIdx === -1) return;

    if (dx < 0) {
      // Swipe left → next tab
      const nextIdx = (curIdx + 1) % NAV_SWIPE_ORDER.length;
      navigateTo(NAV_SWIPE_ORDER[nextIdx]);
    } else {
      // Swipe right → previous tab
      const prevIdx = (curIdx - 1 + NAV_SWIPE_ORDER.length) % NAV_SWIPE_ORDER.length;
      navigateTo(NAV_SWIPE_ORDER[prevIdx]);
    }
  }, { passive: true });
}

/* ── Pull-to-Refresh ────────────────────────────────────────── */
function initPullToRefresh(container, onRefresh) {
  // Only on touch devices
  if (!('ontouchstart' in window)) return;

  let startY = 0, pulling = false, indicator = null;
  const THRESHOLD = 72;

  container.addEventListener('touchstart', e => {
    if (container.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    pulling = false;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY;
    if (dy < 10) return;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'ptr-indicator';
      indicator.innerHTML = `<i class="fa-solid fa-arrow-rotate-right ptr-icon" aria-hidden="true"></i><span>Pull to refresh</span>`;
      indicator.setAttribute('aria-live', 'polite');
      container.insertAdjacentElement('afterbegin', indicator);
    }
    const progress = Math.min(dy / THRESHOLD, 1);
    indicator.style.setProperty('--ptr-progress', progress);
    indicator.style.height = `${Math.min(dy * 0.4, THRESHOLD * 0.6)}px`;
    indicator.style.opacity = progress;
    pulling = progress >= 1;
    indicator.querySelector('.ptr-icon').style.transform = `rotate(${progress * 360}deg)`;
    indicator.querySelector('span').textContent = pulling ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });

  container.addEventListener('touchend', async () => {
    if (!indicator) return;
    if (pulling) {
      indicator.querySelector('span').textContent = 'Refreshing…';
      indicator.querySelector('.ptr-icon').style.animation = 'spin 0.6s linear infinite';
      await onRefresh();
    }
    indicator.style.height = '0';
    indicator.style.opacity = '0';
    setTimeout(() => { indicator?.remove(); indicator = null; }, 300);
    pulling = false;
  }, { passive: true });
}

/* ── Swipe Gesture Helper ───────────────────────────────────── */
function initSwipeNavigation(el, { onSwipeLeft, onSwipeRight } = {}) {
  if (!('ontouchstart' in window)) return;
  let sx = 0, sy = 0;
  el.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return; // not a horizontal swipe
    if (dx < 0 && onSwipeLeft)  onSwipeLeft();
    if (dx > 0 && onSwipeRight) onSwipeRight();
  }, { passive: true });
}

/* ── Feed ───────────────────────────────────────────────────── */
function renderFeed(main) {
  main.innerHTML = `
    <div class="view-tabs" role="tablist" aria-label="Feed tabs">
      <div class="view-tab ${State.feedTab === 'for-you' ? 'active' : ''}" data-tab="for-you" role="tab" aria-selected="${State.feedTab === 'for-you'}" tabindex="0">main</div>
      <div class="view-tab ${State.feedTab === 'following' ? 'active' : ''}" data-tab="following" role="tab" aria-selected="${State.feedTab === 'following'}" tabindex="-1">starred</div>
    </div>
    <div class="composer" id="composer-area"></div>
    <div id="feed" role="feed" aria-label="Developer posts" aria-busy="true"><div style="padding:32px;text-align:center;color:var(--text-muted)">Loading posts…</div></div>
  `;

  $$('.view-tab[data-tab]', main).forEach(tab => {
    tab.addEventListener('click', () => {
      State.feedTab = tab.dataset.tab;
      $$('.view-tab', main).forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); t.setAttribute('tabindex','-1'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      tab.setAttribute('tabindex','0');
      loadPosts($('#feed'));
    });
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tab.click(); }
    });
  });

  buildComposer($('#composer-area'));
  loadPosts($('#feed'));
  subscribeToNewPosts($('#feed'));
  initPullToRefresh(main, () => loadPosts($('#feed')));
}

async function loadPosts(container) {
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div>`;

  let query = sb
    .from('posts')
    .select(`
      id, content, code_block, code_lang, image_url, file_url, file_name, likes_count, comments_count, reposts_count, created_at, poll,
      profiles!posts_author_id_fkey(id, username, display_name, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .limit(30);

  if (State.feedTab === 'following') {
    const { data: following } = await sb.from('follows').select('following_id').eq('follower_id', State.user.id);
    const ids = (following || []).map(f => f.following_id);
    if (!ids.length) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Follow some people to see their posts here 🌱</div>`;
      return;
    }
    query = query.in('author_id', ids);
  }

  const { data: posts, error } = await query;
  if (error) { container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--rose)">Failed to load posts</div>`; return; }

  // Get which posts user liked/bookmarked
  const postIds = (posts || []).map(p => p.id);
  let likedIds = new Set(), bookmarkedIds = new Set();
  if (postIds.length) {
    const { data: likes } = await sb.from('post_likes').select('post_id').eq('user_id', State.user.id).in('post_id', postIds);
    const { data: bookmarks } = await sb.from('bookmarks').select('post_id').eq('user_id', State.user.id).in('post_id', postIds);
    likedIds = new Set((likes || []).map(l => l.post_id));
    bookmarkedIds = new Set((bookmarks || []).map(b => b.post_id));
  }

  container.innerHTML = '';
  container.setAttribute('aria-busy', 'false');
  if (!posts?.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No posts yet — be the first! 🚀</div>`;
    return;
  }

  posts.forEach(post => {
    const card = buildPostCard(post, post.profiles, likedIds.has(post.id), bookmarkedIds.has(post.id));
    container.appendChild(card);
  });
}

function subscribeToNewPosts(container) {
  const channel = sb
    .channel('posts_realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async payload => {
      const newPost = payload.new;
      // Fetch author profile
      const { data: profile } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', newPost.author_id).single();
      if (profile && newPost.author_id !== State.user.id) {
        const card = buildPostCard(newPost, profile, false, false);
        card.style.opacity = '0';
        card.style.transform = 'translateY(-10px)';
        container.prepend(card);
        requestAnimationFrame(() => {
          card.style.transition = '0.4s ease';
          card.style.opacity = '1';
          card.style.transform = '';
        });
        toast(`@${profile.username} just posted`, 'bullhorn');
      }
    })
    .subscribe();

  State.realtimeSubs.push(channel);
}

/* ── Composer ───────────────────────────────────────────────── */
const FILE_MAX_BYTES = 600 * 1024; // 600 KB

const FILE_ICONS = {
  'pdf':  'fa-file-pdf',
  'doc':  'fa-file-word',  'docx': 'fa-file-word',
  'xls':  'fa-file-excel', 'xlsx': 'fa-file-excel',
  'ppt':  'fa-file-powerpoint', 'pptx': 'fa-file-powerpoint',
  'zip':  'fa-file-zipper','rar':  'fa-file-zipper', '7z': 'fa-file-zipper',
  'mp3':  'fa-file-audio', 'wav':  'fa-file-audio', 'ogg': 'fa-file-audio',
  'mp4':  'fa-file-video', 'mov':  'fa-file-video', 'webm':'fa-file-video',
  'txt':  'fa-file-lines', 'md':   'fa-file-lines',
  'js':   'fa-file-code',  'ts':   'fa-file-code',  'py': 'fa-file-code',
  'html': 'fa-file-code',  'css':  'fa-file-code',  'json':'fa-file-code',
};

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return FILE_ICONS[ext] || 'fa-file';
}

function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function buildComposer(container) {
  const profile = State.profile;
  container.innerHTML = `
    <div class="composer-inner">
      <div class="composer-row">
        <div class="composer-avatar">${avatarHtml(profile, 38)}</div>
        <textarea class="composer-textarea" id="post-textarea" placeholder="// what are you building today?" rows="2"></textarea>
      </div>
      <pre class="composer-code-block" id="composer-code" spellcheck="false" contenteditable="false"></pre>
      <div id="composer-attach-preview" style="display:none;padding:0 0 8px 0"></div>
      <div class="composer-toolbar">
        <button class="composer-tool" id="add-code-btn" title="Add code block">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="composer-tool" title="Add image" id="composer-img-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </button>
        <button class="composer-tool" title="Attach file (max 600 KB)" id="composer-file-btn">
          <i class="fa-solid fa-paperclip" style="font-size:14px"></i>
        </button>
        <input type="file" id="composer-img-input" accept="image/*" style="display:none">
        <input type="file" id="composer-file-input" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.js,.ts,.py,.html,.css,.json,.zip,.rar,.7z,.mp3,.wav,.ogg,.mp4,.mov,.webm" style="display:none">
        <div class="composer-actions">
          <span class="char-count" id="char-count">280</span>
          <button class="post-btn" id="post-submit-btn" disabled>Post</button>
        </div>
      </div>
    </div>
  `;

  const textarea    = $('#post-textarea');
  const charCount   = $('#char-count');
  const submitBtn   = $('#post-submit-btn');
  const codeBlock   = $('#composer-code');
  const addCodeBtn  = $('#add-code-btn');
  const imgBtn      = $('#composer-img-btn');
  const imgInput    = $('#composer-img-input');
  const fileBtn     = $('#composer-file-btn');
  const fileInput   = $('#composer-file-input');
  const preview     = $('#composer-attach-preview');
  let hasCode = false;
  let codeLang = 'js';
  let selectedImageFile = null;
  let selectedAttachFile = null;

  const canPost = () => textarea.value.trim().length > 0 || selectedImageFile || selectedAttachFile;

  textarea.addEventListener('input', () => {
    const left = 280 - textarea.value.length;
    charCount.textContent = left;
    charCount.style.color = left < 20 ? 'var(--rose)' : left < 60 ? 'var(--amber)' : 'var(--text-muted)';
    submitBtn.disabled = !canPost();
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

  // ── Image picker ──
  imgBtn.addEventListener('click', () => { selectedAttachFile = null; imgInput.click(); });

  imgInput.addEventListener('change', () => {
    const file = imgInput.files[0];
    if (!file) return;
    if (file.size > FILE_MAX_BYTES) {
      toast(`Image must be under ${fmtBytes(FILE_MAX_BYTES)}`, 'circle-exclamation');
      imgInput.value = '';
      return;
    }
    selectedImageFile = file;
    selectedAttachFile = null;
    const reader = new FileReader();
    reader.onload = e => {
      preview.style.display = 'block';
      preview.innerHTML = `
        <div style="position:relative;display:inline-block">
          <img src="${e.target.result}" style="max-height:180px;max-width:100%;border-radius:10px;border:1px solid var(--border);object-fit:cover">
          <button id="composer-attach-remove" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.65);border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      bindRemove();
      submitBtn.disabled = !canPost();
    };
    reader.readAsDataURL(file);
  });

  // ── File picker ──
  fileBtn.addEventListener('click', () => { selectedImageFile = null; fileInput.click(); });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > FILE_MAX_BYTES) {
      toast(`File must be under ${fmtBytes(FILE_MAX_BYTES)}`, 'circle-exclamation');
      fileInput.value = '';
      return;
    }
    selectedAttachFile = file;
    selectedImageFile = null;
    const icon = fileIcon(file.name);
    preview.style.display = 'block';
    preview.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;max-width:320px">
        <i class="fa-solid ${icon}" style="font-size:22px;color:var(--cyan);flex-shrink:0"></i>
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(file.name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${fmtBytes(file.size)}</div>
        </div>
        <button id="composer-attach-remove" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px;flex-shrink:0"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    bindRemove();
    submitBtn.disabled = !canPost();
  });

  function bindRemove() {
    $('#composer-attach-remove').addEventListener('click', () => {
      selectedImageFile = null;
      selectedAttachFile = null;
      imgInput.value = '';
      fileInput.value = '';
      preview.style.display = 'none';
      preview.innerHTML = '';
      submitBtn.disabled = !canPost();
    });
  }

  // ── Submit ──
  submitBtn.addEventListener('click', async () => {
    if (!canPost()) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';

    let imageUrl = null;
    let fileUrl  = null;
    let fileName = null;

    if (selectedImageFile) {
      const ext  = selectedImageFile.name.split('.').pop();
      const path = `posts/${State.user.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await sb.storage.from('post-images').upload(path, selectedImageFile, { contentType: selectedImageFile.type });
      if (uploadErr) {
        toast('Image upload failed: ' + uploadErr.message, 'circle-exclamation');
        submitBtn.disabled = false; submitBtn.textContent = 'Post'; return;
      }
      imageUrl = sb.storage.from('post-images').getPublicUrl(path).data.publicUrl;
    }

    if (selectedAttachFile) {
      const ext  = selectedAttachFile.name.split('.').pop();
      const path = `posts/${State.user.id}/${Date.now()}_${selectedAttachFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadErr } = await sb.storage.from('post-files').upload(path, selectedAttachFile, { contentType: selectedAttachFile.type });
      if (uploadErr) {
        toast('File upload failed: ' + uploadErr.message, 'circle-exclamation');
        submitBtn.disabled = false; submitBtn.textContent = 'Post'; return;
      }
      fileUrl  = sb.storage.from('post-files').getPublicUrl(path).data.publicUrl;
      fileName = selectedAttachFile.name;
    }

    const text = textarea.value.trim();
    const postData = { author_id: State.user.id, content: text || '' };
    if (imageUrl)  postData.image_url  = imageUrl;
    if (fileUrl)   postData.file_url   = fileUrl;
    if (fileName)  postData.file_name  = fileName;
    if (hasCode && codeBlock.textContent.trim() !== '// Your code here') {
      postData.code_block = codeBlock.textContent.trim();
      postData.code_lang  = codeLang;
    }

    // Attach poll if active
    if (typeof PollState !== 'undefined' && PollState.active) {
      const pollData = (typeof getPollData === 'function') ? getPollData() : null;
      if (pollData) {
        postData.poll = pollData;
      } else if (PollState.active) {
        toast('Add at least 2 poll options', 'circle-exclamation');
        submitBtn.disabled = false; submitBtn.textContent = 'Post'; return;
      }
    }

    const { data: newPost, error } = await sb.from('posts').insert(postData).select().single();
    if (error) {
      toast('Failed to post: ' + error.message, 'circle-exclamation');
    } else {
      const feed = $('#feed');
      if (feed) loadPosts(feed);
      textarea.value = '';
      charCount.textContent = '280';
      codeBlock.textContent = '';
      codeBlock.classList.remove('visible');
      hasCode = false;
      addCodeBtn.style.color = '';
      selectedImageFile = null;
      selectedAttachFile = null;
      imgInput.value = '';
      fileInput.value = '';
      preview.style.display = 'none';
      preview.innerHTML = '';
      toast('Posted!', 'paper-plane');

      // Reset poll state
      if (typeof PollState !== 'undefined') {
        PollState.active = false;
        PollState.options = ['', ''];
        document.getElementById('poll-builder-ui')?.remove();
        const pollBtn = document.getElementById('poll-toggle-btn');
        if (pollBtn) { pollBtn.style.color = ''; pollBtn.style.background = ''; }
      }

      // Notify all followers about the new post (fire and forget)
      if (newPost?.id) {
        const postSnippet = (text || '').slice(0, 100) || 'New post';
        sb.from('follows').select('follower_id').eq('following_id', State.user.id).then(({ data: followers }) => {
          if (!followers?.length) return;
          const notifications = followers.map(f => ({
            user_id: f.follower_id,
            actor_id: State.user.id,
            type: 'new_post',
            post_id: newPost.id,
            post_title: postSnippet,
          }));
          sb.from('notifications').insert(notifications).then(() => {});
        });
      }
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post';
  });
}

/* ── Post Card ──────────────────────────────────────────────── */
function buildPostCard(post, profile, isLiked = false, isBookmarked = false) {
  const card = el('div', 'post-card');
  const color = avatarColor(profile?.display_name || profile?.username || '?');

  let contentHtml = `<div class="post-content">${escapeHtml(post.content).replace(/#(\w+)/g, '<span class="hashtag">#$1</span>').replace(/@(\w+)/g, '<span class="mention">@$1</span>')}</div>`;
  if (post.image_url) {
    contentHtml += `<div class="post-image-wrap"><img src="${escapeHtml(post.image_url)}" class="post-image" alt="Post image" loading="lazy" style="max-width:100%;border-radius:12px;margin-top:8px;border:1px solid var(--border);display:block"></div>`;
  }
  if (post.file_url && post.file_name) {
    const icon = fileIcon(post.file_name);
    contentHtml += `
      <a href="${escapeHtml(post.file_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;margin-top:8px;max-width:100%;min-width:0;transition:border-color 0.15s" onmouseover="this.style.borderColor='var(--cyan)'" onmouseout="this.style.borderColor='var(--border)'">
        <i class="fa-solid ${icon}" style="font-size:20px;color:var(--cyan);flex-shrink:0"></i>
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(post.file_name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">Click to download</div>
        </div>
        <i class="fa-solid fa-download" style="font-size:13px;color:var(--text-muted);flex-shrink:0"></i>
      </a>`;
  }
  if (post.code_block) {
    contentHtml += `<pre class="post-code"><span class="post-code-lang">${post.code_lang || ''}</span>${escapeHtml(post.code_block)}</pre>`;
  }
  // Render poll if present
  if (post.poll && post.poll.options?.length) {
    const currentUserId = State.user?.id || '';
    contentHtml += renderPollInPost(post.poll, post.id, currentUserId);
  }

  card.innerHTML = `
    <div class="post-header">
      <div class="post-avatar pfp-clickable" data-uid="${profile?.id || ''}" style="background:${color};cursor:pointer" title="View profile">${profile?.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : avatarInitials(profile?.display_name || profile?.username || '?')}</div>
      <div class="post-meta">
        <div class="post-author">
          <span class="pfp-clickable" data-uid="${profile?.id || ''}" style="cursor:pointer">${profile?.display_name || profile?.username || 'Unknown'}</span>
          ${profile?.is_github ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#24292e;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;line-height:1.4;"><i class="fa-brands fa-github" style="font-size:10px;"></i></span>` : ''}
          <span class="post-author-handle">@${profile?.username || '?'}</span>
        </div>
        <div class="post-time">${timeAgo(post.created_at)}</div>
      </div>
      ${post.author_id === State.user.id
        ? `<button class="post-delete-btn" data-pid="${post.id}" title="Delete post" style="margin-left:auto;color:var(--text-muted);font-size:14px;padding:4px 8px;border-radius:6px;transition:color 0.15s"><i class="fa-solid fa-xmark"></i></button>`
        : `<button class="post-more-btn" data-pid="${post.id}" data-uid="${profile?.id}" title="More options" style="margin-left:auto;color:var(--text-muted);font-size:14px;padding:4px 8px;border-radius:6px;transition:color 0.15s"><i class="fa-solid fa-ellipsis"></i></button>`
      }
    </div>
    ${contentHtml}
    <div class="post-actions">
      <button class="post-action comment-btn" title="Comment">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="comment-count">${fmtNum(post.comments_count || 0)}</span>
      </button>
      <button class="post-action like-btn ${isLiked ? 'liked' : ''}" title="Like">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="like-count">${fmtNum(post.likes_count || 0)}</span>
      </button>
      <button class="post-action bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" title="Bookmark">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="post-action share-btn" title="Share" style="margin-left:auto">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>
  `;

  // Like toggle
  let likedState = isLiked;
  const likeBtn = $('.like-btn', card);
  likeBtn.addEventListener('click', async e => {
    e.stopPropagation();
    likedState = !likedState;
    const countEl = likeBtn.querySelector('.like-count');
    const svg = likeBtn.querySelector('svg');
    const currentCount = parseInt(countEl.textContent) || 0;
    likeBtn.classList.toggle('liked', likedState);
    svg.setAttribute('fill', likedState ? 'currentColor' : 'none');
    countEl.textContent = fmtNum(likedState ? currentCount + 1 : currentCount - 1);
    if (likedState) { likeBtn.style.transform = 'scale(1.3)'; setTimeout(() => likeBtn.style.transform = '', 200); }

    if (likedState) {
      await sb.from('post_likes').insert({ post_id: post.id, user_id: State.user.id });
      // Notify author if not self
      if (post.author_id !== State.user.id) {
        await sb.from('notifications').insert({ user_id: post.author_id, actor_id: State.user.id, type: 'like', post_id: post.id });
      }
    } else {
      await sb.from('post_likes').delete().eq('post_id', post.id).eq('user_id', State.user.id);
    }
  });

  // Bookmark
  let bookmarkedState = isBookmarked;
  const bookmarkBtn = $('.bookmark-btn', card);
  bookmarkBtn.addEventListener('click', async e => {
    e.stopPropagation();
    bookmarkedState = !bookmarkedState;
    bookmarkBtn.classList.toggle('bookmarked', bookmarkedState);
    bookmarkBtn.querySelector('svg').setAttribute('fill', bookmarkedState ? 'currentColor' : 'none');
    if (bookmarkedState) {
      await sb.from('bookmarks').insert({ post_id: post.id, user_id: State.user.id });
      toast('Saved to bookmarks', 'bookmark');
    } else {
      await sb.from('bookmarks').delete().eq('post_id', post.id).eq('user_id', State.user.id);
      toast('Removed from bookmarks', 'bookmark');
    }
  });

  // Comment
  $('.comment-btn', card).addEventListener('click', e => { e.stopPropagation(); openPostThread(post, profile); });

  // Share
  $('.share-btn', card).addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard?.writeText(window.location.origin + '/post/' + post.id).then(() => toast('Link copied!', 'link'));
  });

  // Report / Block (other users' posts)
  const moreBtn = $('.post-more-btn', card);
  if (moreBtn) {
    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      openPostMoreMenu(moreBtn, post.id, profile?.id);
    });
  }

  // PFP / author click → quick profile view
  card.querySelectorAll('.pfp-clickable[data-uid]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      if (uid) openProfileQuickView(uid);
    });
  });

  // Delete (own posts)
  const deleteBtn = $('.post-delete-btn', card);
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this post?')) return;
      const { error } = await sb.from('posts').delete().eq('id', post.id);
      if (!error) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        card.style.transition = '0.3s ease';
        setTimeout(() => card.remove(), 300);
        toast('Post deleted', 'trash');
      }
    });
  }

  return card;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Post Thread / Comments ─────────────────────────────────── */
function openPostThread(post, profile) {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = 'Post';
  modal.classList.add('open');

  body.innerHTML = `
    <div style="padding:16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        ${avatarHtml(profile, 36)}
        <div>
          <div style="font-weight:700">${profile?.display_name || profile?.username || 'User'}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${profile?.username || '?'} · ${timeAgo(post.created_at)}</div>
        </div>
      </div>
      <div style="font-size:15px;line-height:1.6">${escapeHtml(post.content)}</div>
    </div>
    <div id="comment-list" style="max-height:300px;overflow-y:auto;padding:8px 0">
      <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Loading comments…</div>
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center">
      ${avatarHtml(State.profile, 32)}
      <input id="comment-input" class="chat-input" placeholder="Write a comment…" style="flex:1">
      <button class="chat-send-btn" id="comment-send-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;

  loadComments(post.id);

  const sendComment = async () => {
    const input = $('#comment-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const { error } = await sb.from('comments').insert({ post_id: post.id, author_id: State.user.id, content: text });
    if (!error) {
      loadComments(post.id);
      if (post.author_id !== State.user.id) {
        await sb.from('notifications').insert({ user_id: post.author_id, actor_id: State.user.id, type: 'comment', post_id: post.id });
      }
    }
  };

  $('#comment-send-btn').addEventListener('click', sendComment);
  $('#comment-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });
}

async function loadComments(postId) {
  const container = $('#comment-list');
  if (!container) return;
  const { data: comments } = await sb
    .from('comments')
    .select('id, content, created_at, profiles!comments_author_id_fkey(id, username, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (!comments?.length) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No comments yet — start the conversation!</div>`;
    return;
  }

  container.innerHTML = comments.map(c => `
    <div style="display:flex;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
      ${avatarHtml(c.profiles, 30)}
      <div>
        <div style="font-size:13px;font-weight:600">${c.profiles?.display_name || c.profiles?.username || 'User'} <span style="font-size:11px;color:var(--text-muted);font-weight:400">${timeAgo(c.created_at)}</span></div>
        <div style="font-size:13px;margin-top:2px">${escapeHtml(c.content)}</div>
      </div>
    </div>
  `).join('');
}

/* ── New Post Modal ─────────────────────────────────────────── */
function openNewPostModal() {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = 'New Post';
  modal.classList.add('open');
  body.innerHTML = `<div id="modal-composer"></div>`;
  buildComposer($('#modal-composer'));
  const submitBtn = $('#post-submit-btn');
  const original = submitBtn.onclick;
  submitBtn.addEventListener('click', () => {
    setTimeout(() => { if (!$('#post-textarea')?.value?.trim()) modal.classList.remove('open'); }, 500);
  });
}

/* ── Explore ────────────────────────────────────────────────── */
async function renderExplore(main) {
  main.innerHTML = `
    <div class="explore-header">
      <h2>Explore</h2>
      <p>Discover communities and developers building the future</p>
    </div>
    <div id="explore-communities"><div style="padding:20px;text-align:center;color:var(--text-muted)">Loading communities…</div></div>
    <div style="padding:0 16px 8px;font-family:var(--font-display);font-size:16px;font-weight:800;margin-top:8px">Developers</div>
    <div id="explore-people"><div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div></div>
  `;

  // Load communities
  const { data: communities } = await sb
    .from('communities')
    .select('id, name, description, icon, color, members_count')
    .order('members_count', { ascending: false })
    .limit(12);

  // Load user's memberships
  const { data: myMemberships } = await sb
    .from('community_members')
    .select('community_id')
    .eq('user_id', State.user.id);
  const myCommIds = new Set((myMemberships || []).map(m => m.community_id));

  const commContainer = $('#explore-communities');
  if (!commContainer) return;

  if (!communities?.length) {
    commContainer.innerHTML = `<div style="padding:20px 16px"><button id="create-first-community" class="auth-btn-primary" style="width:auto;padding:10px 20px">Create the first community! 🌍</button></div>`;
    $('#create-first-community')?.addEventListener('click', openCreateCommunityModal);
  } else {
    commContainer.innerHTML = `
      <div style="padding:8px 16px 12px;font-family:var(--font-display);font-size:16px;font-weight:800">Communities</div>
      <div class="communities-grid">${communities.map(c => buildCommunityCard(c, myCommIds.has(c.id))).join('')}</div>
    `;
    $$('.join-btn', commContainer).forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const cid = btn.dataset.cid;
        const joined = btn.classList.contains('joined');
        btn.disabled = true;
        if (joined) {
          await sb.from('community_members').delete().eq('community_id', cid).eq('user_id', State.user.id);
          btn.classList.remove('joined');
          btn.textContent = 'Join';
          toast('Left community', 'arrow-right-from-bracket');
        } else {
          await sb.from('community_members').insert({ community_id: cid, user_id: State.user.id });
          btn.classList.add('joined');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Joined';
          toast('Joined!', 'circle-check');
          loadSidebarCommunities();
        }
        btn.disabled = false;
      });
    });
    $$('.community-card', commContainer).forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.join-btn')) return;
        openCommunity(card.dataset.cid);
      });
    });
  }

  // Load people
  const { data: people } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, followers_count')
    .neq('id', State.user.id)
    .order('followers_count', { ascending: false })
    .limit(8);

  const peopleContainer = $('#explore-people');
  if (!peopleContainer || !people?.length) return;
  peopleContainer.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:0 16px 16px">
    ${people.map(p => `<div class="search-result-item explore-person-card" data-uid="${p.id}" style="flex-direction:column;align-items:flex-start;padding:14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border);cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${avatarHtml(p, 36)}
        <div>
          <div style="font-weight:700;font-size:13px">${escapeHtml(p.display_name || p.username)}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(p.username)}</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.4">${escapeHtml(p.bio || 'No bio yet')}</div>
      <button class="follow-btn" data-uid="${p.id}" style="width:100%">Follow</button>
    </div>`).join('')}
  </div>`;

  $$('.follow-btn', peopleContainer).forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      btn.disabled = true;
      btn.textContent = '…';
      const { error } = await sb.from('follows').insert({ follower_id: State.user.id, following_id: uid });
      if (!error) {
        await sb.rpc('increment_followers', { target_user_id: uid });
        await sb.rpc('increment_following', { target_user_id: State.user.id });
        await sb.from('notifications').insert({ user_id: uid, actor_id: State.user.id, type: 'follow' });
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Following';
        btn.style.opacity = '0.6';
        toast('Followed!', 'user-check');
      } else {
        btn.textContent = 'Follow';
        btn.disabled = false;
      }
    });
  });
}

function buildCommunityCard(c, isJoined = false) {
  return `<div class="community-card" data-cid="${c.id}">
    <div class="community-card-icon" style="background:rgba(${hexToRgb(c.color)},0.15);color:${c.color}">${c.icon}</div>
    <div class="community-card-name">${c.name}</div>
    <div class="community-card-desc">${c.description || ''}</div>
    <div class="community-card-meta">
      <span class="community-card-members">👥 ${fmtNum(c.members_count || 0)}</span>
    </div>
    <button class="join-btn ${isJoined ? 'joined' : ''}" data-cid="${c.id}">${isJoined ? '<i class="fa-solid fa-check"></i> Joined' : 'Join'}</button>
  </div>`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : '99,217,255';
}

/* ── Create Community Modal ─────────────────────────────────── */
function openCreateCommunityModal() {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = 'Create Community';
  modal.classList.add('open');

  const icons = ['🌐','🦀','⚛️','🧠','☁️','🎨','🔬','🌍','🔥','💻','🤖','🎵'];

  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
      <div class="auth-input-group">
        <label>Community Name</label>
        <input type="text" id="comm-name" class="auth-input" placeholder="e.g. Rust & Systems" maxlength="50">
      </div>
      <div class="auth-input-group">
        <label>Description</label>
        <textarea id="comm-desc" class="auth-input" placeholder="What's this community about?" rows="3" style="resize:vertical"></textarea>
      </div>
      <div class="auth-input-group">
        <label>Icon</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${icons.map(i => `<button class="comm-icon-btn" data-icon="${i}" style="font-size:22px;padding:8px;border-radius:8px;background:var(--bg-elevated);border:2px solid transparent;transition:all 0.15s">${i}</button>`).join('')}
        </div>
      </div>
      <div class="auth-input-group">
        <label>Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['#63d9ff','#a78bfa','#34d399','#fb7185','#fbbf24','#f97316','#38bdf8','#f472b6'].map(c =>
            `<button class="comm-color-btn" data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:3px solid transparent;transition:all 0.15s"></button>`
          ).join('')}
        </div>
      </div>
      <button class="auth-btn-primary" id="create-comm-btn">Create Community</button>
    </div>
  `;

  let selectedIcon = '🌐', selectedColor = '#63d9ff';
  $$('.comm-icon-btn', body).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.comm-icon-btn', body).forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = 'var(--cyan)';
      selectedIcon = btn.dataset.icon;
    });
  });
  $$('.comm-color-btn', body).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.comm-color-btn', body).forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = 'white';
      selectedColor = btn.dataset.color;
    });
  });

  $('#create-comm-btn').addEventListener('click', async () => {
    const name = $('#comm-name').value.trim();
    const desc = $('#comm-desc').value.trim();
    if (!name) { toast('Enter a community name', 'triangle-exclamation'); return; }

    const btn = $('#create-comm-btn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    const { data: community, error } = await sb.from('communities').insert({
      name, description: desc, icon: selectedIcon, color: selectedColor,
      owner_id: State.user.id, members_count: 1
    }).select().single();

    if (error) {
      toast('Failed: ' + error.message, 'circle-exclamation');
      btn.disabled = false;
      btn.textContent = 'Create Community';
      return;
    }

    // Create default channels
    await sb.from('channels').insert([
      { community_id: community.id, name: 'general', type: 'text' },
      { community_id: community.id, name: 'showcase', type: 'text' },
      { community_id: community.id, name: 'help', type: 'text' },
    ]);

    // Join as owner
    await sb.from('community_members').insert({ community_id: community.id, user_id: State.user.id, role: 'owner' });

    modal.classList.remove('open');
    toast(`${selectedIcon} ${name} created!`, '🎉');
    loadSidebarCommunities();
    openCommunity(community.id);
  });
}

/* ── Community View ─────────────────────────────────────────── */
async function openCommunity(communityId) {
  const { data: community } = await sb.from('communities').select('*').eq('id', communityId).single();
  if (!community) return;
  State.currentCommunity = community;
  State.currentView = 'community';
  showPresence();
  updateSidebarActive();

  const { data: channels } = await sb.from('channels').select('*').eq('community_id', communityId).order('created_at');
  const { data: memberCount } = await sb.from('community_members').select('*', { count: 'exact', head: true }).eq('community_id', communityId);
  const isJoined = !!(await sb.from('community_members').select('id').eq('community_id', communityId).eq('user_id', State.user.id).single()).data;

  const main = $('#main');
  main.innerHTML = '';

  const textChannels = (channels || []).filter(c => c.type === 'text');
  const firstChannel = textChannels[0];

  const view = el('div', 'community-view');
  view.innerHTML = `
    <div class="community-sidebar">
      <div class="community-header">
        <div style="font-size:28px;margin-bottom:4px">${community.icon}</div>
        <div class="community-header-name">${community.name}</div>
        <div class="community-header-members">👥 ${fmtNum(community.members_count || 0)} members</div>
        ${!isJoined ? `<button id="join-community-btn" class="auth-btn-primary" style="margin-top:8px;padding:6px 14px;font-size:12px;width:100%">Join Community</button>` : ''}
      </div>
      <div class="channel-category">Text Channels</div>
      ${textChannels.map(ch => `
        <div class="channel-item ${firstChannel?.id === ch.id ? 'active' : ''}" data-chid="${ch.id}">
          <span class="channel-icon">#</span>
          ${ch.name}
        </div>
      `).join('')}
      ${community.owner_id === State.user.id ? `
        <div class="channel-item" id="add-channel-btn" style="color:var(--text-muted);font-size:12px;margin-top:4px">
          <i class="fa-solid fa-plus"></i> Add channel
        </div>
      ` : ''}
    </div>
    <div class="community-chat" id="community-chat-area"></div>
    <div class="community-members-panel" id="members-panel"></div>
  `;

  main.appendChild(view);

  $$('.channel-item[data-chid]', view).forEach(item => {
    item.addEventListener('click', () => {
      $$('.channel-item', view).forEach(c => c.classList.remove('active'));
      item.classList.add('active');
      const ch = (channels || []).find(c => c.id === item.dataset.chid);
      if (ch) renderChannelChat($('#community-chat-area'), ch);
    });
  });

  const joinBtn = $('#join-community-btn', view);
  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      await sb.from('community_members').insert({ community_id: communityId, user_id: State.user.id });
      joinBtn.remove();
      toast('Joined!', 'circle-check');
      loadSidebarCommunities();
    });
  }

  const addChannelBtn = $('#add-channel-btn', view);
  if (addChannelBtn) {
    addChannelBtn.addEventListener('click', () => {
      const modal = $('#modal-overlay');
      const body  = $('#modal-body');
      $('#modal-title-text').textContent = 'Add Channel';
      modal.classList.add('open');
      body.innerHTML = `
        <div style="padding:16px;display:flex;flex-direction:column;gap:14px">
          <div class="auth-input-group">
            <label>Channel Name</label>
            <input type="text" id="new-channel-name" class="auth-input" placeholder="e.g. announcements" maxlength="50" autocomplete="off">
          </div>
          <button class="auth-btn-primary" id="confirm-add-channel-btn">Create Channel</button>
        </div>
      `;
      setTimeout(() => $('#new-channel-name')?.focus(), 50);
      const confirmBtn = $('#confirm-add-channel-btn');
      const doCreate = async () => {
        const name = $('#new-channel-name').value.trim();
        if (!name) { toast('Enter a channel name', 'triangle-exclamation'); return; }
        const cleanName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Creating…';
        const { data: newCh } = await sb.from('channels').insert({ community_id: communityId, name: cleanName, type: 'text' }).select().single();
        modal.classList.remove('open');
        if (newCh) openCommunity(communityId);
      };
      confirmBtn.addEventListener('click', doCreate);
      $('#new-channel-name').addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });
    });
  }

  if (firstChannel) renderChannelChat($('#community-chat-area'), firstChannel);
  renderCommunityMembers($('#members-panel'), communityId);
}

async function renderChannelChat(container, channel) {
  State.currentChannel = channel;
  container.innerHTML = `
    <div class="community-chat-header">
      <span style="color:var(--text-muted);font-size:15px">#</span>
      <h3>${channel.name}</h3>
      <div style="margin-left:auto;display:flex;gap:8px">
        <span style="font-size:12px;color:var(--text-muted)" id="channel-member-count"></span>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages-list"></div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        <input class="chat-input" id="channel-chat-input" type="text" placeholder="Message #${channel.name}">
        <button class="chat-send-btn" id="channel-send-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  const msgList = $('#chat-messages-list', container);

  // Load existing messages
  const { data: messages } = await sb
    .from('channel_messages')
    .select('id, content, created_at, profiles!channel_messages_author_id_fkey(id, username, display_name, avatar_url)')
    .eq('channel_id', channel.id)
    .order('created_at', { ascending: true })
    .limit(80);

  (messages || []).forEach((msg, i) => {
    const prev = (messages || [])[i - 1];
    const isCont = prev && prev.profiles?.id === msg.profiles?.id;
    msgList.appendChild(buildChannelMessage(msg, isCont));
  });
  msgList.scrollTop = msgList.scrollHeight;

  // Realtime subscription for this channel
  const sub = sb
    .channel(`channel_${channel.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channel.id}` }, async payload => {
      const msg = payload.new;
      if (msg.author_id === State.user.id) return; // own messages shown immediately
      const { data: profile } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', msg.author_id).single();
      msg.profiles = profile;
      const prev = msgList.lastElementChild;
      const isCont = prev && prev.dataset.uid === msg.author_id;
      msgList.appendChild(buildChannelMessage(msg, isCont));
      msgList.scrollTop = msgList.scrollHeight;
    })
    .subscribe();

  State.realtimeSubs.push(sub);

  // Send message
  const input = $('#channel-chat-input', container);
  const sendBtn = $('#channel-send-btn', container);

  async function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const msgData = { channel_id: channel.id, author_id: State.user.id, content: text };
    const { data: msg } = await sb.from('channel_messages').insert(msgData).select().single();
    if (msg) {
      msg.profiles = State.profile;
      const lastMsg = msgList.lastElementChild;
      const isCont = lastMsg && lastMsg.dataset.uid === State.user.id;
      msgList.appendChild(buildChannelMessage(msg, isCont));
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  sendBtn.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
}

function buildChannelMessage(msg, isContinuation) {
  const profile = msg.profiles;
  const color = avatarColor(profile?.display_name || profile?.username || '?');
  const msgEl = el('div', `msg ${isContinuation ? 'is-continuation' : ''}`);
  msgEl.dataset.uid = profile?.id || '';
  msgEl.innerHTML = `
    <div class="msg-avatar" style="background:${color};display:${isContinuation ? 'none' : 'flex'};align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white">${avatarInitials(profile?.display_name || profile?.username || '?')}</div>
    <div class="msg-body">
      ${!isContinuation ? `<div class="msg-header"><span class="msg-author" style="color:${color}">${profile?.display_name || profile?.username || 'User'}</span><span class="msg-time">${timeAgo(msg.created_at)}</span></div>` : ''}
      <div class="msg-text">${escapeHtml(msg.content)}</div>
    </div>
  `;
  if (isContinuation) msgEl.style.paddingLeft = '52px';
  return msgEl;
}

async function renderCommunityMembers(container, communityId) {
  const { data: members } = await sb
    .from('community_members')
    .select('user_id, role, profiles!community_members_user_id_fkey(id, username, display_name, avatar_url)')
    .eq('community_id', communityId)
    .limit(20);

  if (!container) return;
  const online = (members || []).filter(m => State.onlineUsers.has(m.user_id));
  const offline = (members || []).filter(m => !State.onlineUsers.has(m.user_id));

  let html = `<div class="members-section-label">Online — ${online.length}</div>`;
  online.forEach(m => {
    const p = m.profiles;
    const color = avatarColor(p?.display_name || p?.username || '?');
    html += `<div class="member-item">
      <div class="member-avatar-wrap">
        <div class="member-avatar" style="background:${color}">${avatarInitials(p?.display_name || p?.username || '?')}</div>
        <div class="member-status online"></div>
      </div>
      <span class="member-name">${p?.display_name || p?.username || 'User'}</span>
      ${m.role === 'owner' ? '<span style="font-size:10px;color:var(--amber);margin-left:auto">owner</span>' : ''}
    </div>`;
  });
  html += `<div class="members-section-label" style="margin-top:8px">Offline — ${offline.length}</div>`;
  offline.slice(0, 10).forEach(m => {
    const p = m.profiles;
    const color = avatarColor(p?.display_name || p?.username || '?');
    html += `<div class="member-item" style="opacity:0.5">
      <div class="member-avatar-wrap">
        <div class="member-avatar" style="background:${color}">${avatarInitials(p?.display_name || p?.username || '?')}</div>
        <div class="member-status offline"></div>
      </div>
      <span class="member-name">${p?.display_name || p?.username || 'User'}</span>
    </div>`;
  });

  container.innerHTML = html;
}

/* ── Notifications ──────────────────────────────────────────── */
async function renderNotifications(main) {
  main.innerHTML = `
    <div class="view-tabs">
      <div class="view-tab active" style="cursor:default">All Notifications</div>
      <button class="view-tab" id="mark-all-read" style="margin-left:auto;font-size:12px;color:var(--cyan)">Mark all read</button>
    </div>
    <div class="notif-list" id="notif-list">
      <div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div>
    </div>
  `;

  $('#mark-all-read').addEventListener('click', async () => {
    await sb.from('notifications').update({ read: true }).eq('user_id', State.user.id);
    State.unreadNotifs = 0;
    updateBadges();
    loadNotifications();
  });

  loadNotifications();
}

async function loadNotifications() {
  const container = $('#notif-list');
  if (!container) return;

  const { data: notifs } = await sb
    .from('notifications')
    .select('id, type, read, created_at, post_id, post_title, profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)')
    .eq('user_id', State.user.id)
    .order('created_at', { ascending: false })
    .limit(40);

  if (!notifs?.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No notifications yet 🔕</div>`;
    return;
  }

  const iconMap = {
    like:         '<i class="fa-solid fa-heart" style="color:var(--rose)"></i>',
    follow:       '<i class="fa-solid fa-user-plus" style="color:var(--violet)"></i>',
    comment:      '<i class="fa-solid fa-comment" style="color:var(--sky)"></i>',
    mention:      '<i class="fa-solid fa-at" style="color:var(--cyan)"></i>',
    reply:        '<i class="fa-solid fa-reply" style="color:var(--emerald)"></i>',
    link_request: '<i class="fa-solid fa-link" style="color:var(--amber)"></i>',
    link_accepted:'<i class="fa-solid fa-handshake" style="color:var(--emerald)"></i>',
    new_post:     '<i class="fa-solid fa-pen-to-square" style="color:var(--cyan)"></i>',
  };
  const textMap = {
    like:         actor => `<strong>${actor}</strong> liked your post`,
    follow:       actor => `<strong>${actor}</strong> started following you`,
    comment:      actor => `<strong>${actor}</strong> commented on your post`,
    mention:      actor => `<strong>${actor}</strong> mentioned you in a post`,
    reply:        actor => `<strong>${actor}</strong> replied to your comment`,
    link_request: actor => `<strong>${actor}</strong> wants to link with you`,
    link_accepted:actor => `<strong>${actor}</strong> accepted your link request`,
    new_post:     actor => `<strong>${actor}</strong> published a new post`,
  };

  container.innerHTML = notifs.map(n => {
    const actor = n.profiles?.display_name || n.profiles?.username || 'Someone';
    const color = avatarColor(actor);
    const icon  = iconMap[n.type] || '<i class="fa-solid fa-bell"></i>';
    const text  = (textMap[n.type] || (() => 'New notification'))(escapeHtml(actor));
    // Show post snippet if available
    const postPreview = n.post_title
      ? `<div style="margin-top:4px;padding:6px 10px;background:var(--bg-elevated);border-radius:8px;font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${escapeHtml(n.post_title)}</div>`
      : '';

    return `<div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.id}" data-post-id="${n.post_id || ''}" data-actor-id="${n.profiles?.id || ''}" style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s">
      <div style="position:relative;flex-shrink:0">
        <div class="notif-avatar" style="background:${color};width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;">${avatarInitials(actor)}</div>
        <div class="notif-icon notif-${n.type}" style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:var(--bg-float);border:2px solid var(--bg-surface);display:flex;align-items:center;justify-content:center;font-size:8px;">${icon}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="notif-text" style="font-size:13px;line-height:1.5;color:var(--text-secondary)">${text}</div>
        ${postPreview}
        <div class="notif-time" style="font-size:11px;color:var(--text-muted);margin-top:3px">${timeAgo(n.created_at)}</div>
      </div>
      ${!n.read ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--cyan);flex-shrink:0;margin-top:4px"></div>' : ''}
    </div>`;
  }).join('');

  $$('.notif-item', container).forEach(item => {
    item.addEventListener('click', async () => {
      item.classList.remove('unread');
      // Remove the unread dot
      const dot = item.querySelector('div[style*="background:var(--cyan)"]');
      if (dot) dot.remove();
      await sb.from('notifications').update({ read: true }).eq('id', item.dataset.nid);
      State.unreadNotifs = Math.max(0, State.unreadNotifs - 1);
      updateBadges();
      // Navigate to post if applicable
      if (item.dataset.postId && item.dataset.postId !== 'null') {
        const { data: post } = await sb.from('posts').select('*, profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').eq('id', item.dataset.postId).single();
        if (post) openPostThread(post, post.profiles);
      } else if (item.dataset.actorId && item.dataset.actorId !== 'null') {
        // For follows, link requests etc. — go to their profile
        const notifType = item.querySelector('.notif-text')?.textContent;
        if (notifType && (notifType.includes('following') || notifType.includes('link'))) {
          renderProfile($('#main'), item.dataset.actorId);
        }
      }
    });

    // Hover effect
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-elevated)'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
  });
}

/* ── Messages / DMs ─────────────────────────────────────────── */
async function renderMessages(main) {
  main.innerHTML = `
    <div class="messages-layout">
      <div class="conversations-list">
        <div class="conversations-header">
          Messages
          <button id="new-dm-btn" style="color:var(--cyan);font-size:16px;font-weight:700" title="New message"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div id="conversations-container">
          <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Loading…</div>
        </div>
      </div>
      <div class="dm-view" id="dm-view">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--text-muted)">
          <div style="font-size:32px;color:var(--text-muted)"><i class="fa-solid fa-message"></i></div>
          <div style="font-size:14px;font-weight:600">Select a conversation</div>
          <div style="font-size:12px">or start a new one</div>
        </div>
      </div>
    </div>
  `;

  $('#new-dm-btn').addEventListener('click', openNewDMModal);
  loadConversations();

  // Subscribe to new messages
  const sub = sb
    .channel(`messages_${State.user.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
      loadConversations();
    })
    .subscribe();
  State.realtimeSubs.push(sub);
}

async function loadConversations() {
  const container = $('#conversations-container');
  if (!container) return;

  const { data: convos } = await sb
    .from('conversations')
    .select('id, last_message, last_message_at, participant_a, participant_b')
    .or(`participant_a.eq.${State.user.id},participant_b.eq.${State.user.id}`)
    .order('last_message_at', { ascending: false });

  if (!convos?.length) {
    container.innerHTML = `<div style="padding:16px;font-size:13px;color:var(--text-muted)">No conversations yet</div>`;
    return;
  }

  // Fetch other participant profiles
  const otherIds = convos.map(c => c.participant_a === State.user.id ? c.participant_b : c.participant_a);
  const { data: profiles } = await sb.from('profiles').select('id, username, display_name, avatar_url').in('id', otherIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  container.innerHTML = convos.map(c => {
    const otherId = c.participant_a === State.user.id ? c.participant_b : c.participant_a;
    const other = profileMap[otherId] || { username: 'Unknown', display_name: 'Unknown' };
    const isOnline = State.onlineUsers.has(otherId);
    return `<div class="conversation-item" data-cid="${c.id}" data-otherid="${otherId}">
      <div style="position:relative;flex-shrink:0">
        ${avatarHtml(other, 38)}
        ${isOnline ? '<div class="conv-online"></div>' : ''}
      </div>
      <div class="conv-info">
        <div class="conv-name">${other.display_name || other.username}<span class="conv-time">${c.last_message_at ? timeAgo(c.last_message_at) : ''}</span></div>
        <div class="conv-preview">${c.last_message || ''}</div>
      </div>
    </div>`;
  }).join('');

  $$('.conversation-item', container).forEach(item => {
    item.addEventListener('click', () => {
      $$('.conversation-item', container).forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      openDM(item.dataset.cid, item.dataset.otherid, $('#dm-view'));
    });
  });

  // Auto-open first
  const first = $('.conversation-item', container);
  if (first) first.click();
}

async function openDM(convoId, otherUserId, container) {
  const { data: other } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', otherUserId).single();
  const isOnline = State.onlineUsers.has(otherUserId);
  const color = avatarColor(other?.display_name || other?.username || '?');

  // Mobile: slide the dm-view panel into view
  const isMobile = window.innerWidth <= 640;
  if (isMobile) {
    container.classList.add('dm-view-open');
    document.body.classList.add('dm-open');
  }

  container.innerHTML = `
    <div class="dm-header">
      <button class="dm-back-btn" id="dm-back-btn" aria-label="Back to conversations"><i class="fa-solid fa-arrow-left"></i></button>
      <div style="position:relative">
        ${avatarHtml(other, 36)}
        <div class="conv-online" style="display:${isOnline ? 'block' : 'none'}"></div>
      </div>
      <div>
        <div style="font-weight:700;font-size:14px">${other?.display_name || other?.username}</div>
        <div style="font-size:11px;color:var(--${isOnline ? 'emerald' : 'text-muted'})">${isOnline ? '● Online' : 'Offline'}</div>
      </div>
    </div>
    <div class="dm-messages" id="active-dm-messages"></div>
    <div class="chat-input-area">
      <div class="chat-input-wrap">
        <input class="chat-input" id="dm-input" type="text" placeholder="Message ${other?.display_name || other?.username}…">
        <button class="chat-send-btn" id="dm-send-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;

  const msgList = $('#active-dm-messages', container);

  // Load messages
  const { data: messages } = await sb
    .from('messages')
    .select('id, content, sender_id, created_at')
    .eq('conversation_id', convoId)
    .order('created_at', { ascending: true });

  (messages || []).forEach(m => {
    msgList.appendChild(buildDMMessage(m, other, color));
  });
  msgList.scrollTop = msgList.scrollHeight;

  // Mark unread as read
  await sb.from('messages').update({ read: true }).eq('conversation_id', convoId).neq('sender_id', State.user.id);

  // ── Supabase Realtime broadcast channel for instant DMs ──
  const realtimeCh = sb.channel(`dm_realtime_${convoId}`, {
    config: { broadcast: { self: false } },
  });

  realtimeCh
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      const msg = payload;
      if (!msg || msg.sender_id === State.user.id) return;
      const listEl = document.getElementById('active-dm-messages');
      if (!listEl) return;
      listEl.appendChild(buildDMMessage(msg, other, color));
      listEl.scrollTop = listEl.scrollHeight;
      // Mark as read instantly since the chat is open
      sb.from('messages').update({ read: true }).eq('id', msg.id);
    })
    .subscribe();

  State.realtimeSubs.push(realtimeCh);

  // Also keep a postgres_changes sub as fallback (for messages sent from other devices)
  const pgSub = sb
    .channel(`dm_pg_${convoId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convoId}` }, payload => {
      const msg = payload.new;
      if (msg.sender_id === State.user.id) return;
      const listEl = document.getElementById('active-dm-messages');
      if (!listEl) return;
      // Avoid duplicate if realtime broadcast already added it
      if (listEl.querySelector(`[data-msgid="${msg.id}"]`)) return;
      listEl.appendChild(buildDMMessage(msg, other, color));
      listEl.scrollTop = listEl.scrollHeight;
    })
    .subscribe();
  State.realtimeSubs.push(pgSub);

  // Send
  async function sendDM() {
    const inputEl = document.getElementById('dm-input');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';

    const now = new Date().toISOString();
    const { data: msg, error } = await sb.from('messages').insert({
      conversation_id: convoId,
      sender_id: State.user.id,
      content: text,
    }).select().single();

    if (error) {
      toast('Failed to send message', 'circle-exclamation');
      inputEl.value = text; // restore
      return;
    }

    if (msg) {
      const listEl = document.getElementById('active-dm-messages');
      if (listEl) {
        const msgEl = buildDMMessage(msg, other, color, true);
        msgEl.dataset.msgid = msg.id;
        listEl.appendChild(msgEl);
        listEl.scrollTop = listEl.scrollHeight;
      }
      // Broadcast to the other participant via realtime
      await realtimeCh.send({
        type: 'broadcast',
        event: 'new_message',
        payload: { ...msg },
      });
      // Update convo preview
      await sb.from('conversations').update({ last_message: text, last_message_at: msg.created_at }).eq('id', convoId);
    }
  }

  const sendBtn = document.getElementById('dm-send-btn');
  const dmInputEl = document.getElementById('dm-input');

  if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendDM(); });
  if (dmInputEl) dmInputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDM(); } });

  // Mobile back button
  const backBtn = $('#dm-back-btn', container);
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      container.classList.remove('dm-view-open');
      document.body.classList.remove('dm-open');
    });
  }
}

function buildDMMessage(msg, other, color, isSelf = null) {
  const isOwn = isSelf !== null ? isSelf : msg.sender_id === State.user.id;
  const msgEl = el('div', `msg ${isOwn ? 'dm-own' : 'dm-other'}`);
  if (isOwn) {
    msgEl.innerHTML = `<div class="msg-body"><div class="msg-text dm-own-text">${escapeHtml(msg.content)}</div><div style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:2px">${timeAgo(msg.created_at)}</div></div>`;
  } else {
    msgEl.innerHTML = `
      <div class="msg-avatar" style="background:${color}">${avatarInitials(other?.display_name || other?.username || '?')}</div>
      <div class="msg-body">
        <div class="msg-text" style="background:var(--bg-elevated);padding:8px 12px;border-radius:16px 16px 16px 4px">${escapeHtml(msg.content)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${timeAgo(msg.created_at)}</div>
      </div>
    `;
  }
  return msgEl;
}

function openNewDMModal() {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = 'New Message';
  modal.classList.add('open');

  body.innerHTML = `
    <div style="padding:16px">
      <input type="text" id="dm-search-input" class="auth-input" placeholder="Search for a user…">
      <div id="dm-search-results" style="margin-top:12px"></div>
    </div>
  `;

  let searchTimeout;
  $('#dm-search-input').addEventListener('input', async e => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 1) return;
    searchTimeout = setTimeout(async () => {
      const { data: people } = await sb.from('profiles').select('id, username, display_name, avatar_url').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).neq('id', State.user.id).limit(6);
      const results = $('#dm-search-results');
      if (!results) return;
      results.innerHTML = (people || []).map(p => `
        <div class="search-result-item dm-search-person" data-uid="${p.id}" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px">
          ${avatarHtml(p, 34)}
          <div><div style="font-weight:600;font-size:13px">${escapeHtml(p.display_name || p.username)}</div><div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(p.username)}</div></div>
        </div>
      `).join('');
      $$('[data-uid]', results).forEach(item => {
        item.addEventListener('click', async () => {
          const uid = item.dataset.uid;
          // Get or create conversation
          const a = State.user.id < uid ? State.user.id : uid;
          const b = State.user.id < uid ? uid : State.user.id;
          let { data: convo } = await sb.from('conversations').select('id').eq('participant_a', a).eq('participant_b', b).single();
          if (!convo) {
            const { data: newConvo } = await sb.from('conversations').insert({ participant_a: a, participant_b: b }).select().single();
            convo = newConvo;
          }
          modal.classList.remove('open');
          navigateTo('messages');
          setTimeout(() => {
            const item2 = $(`[data-cid="${convo.id}"]`);
            if (item2) item2.click();
            else openDM(convo.id, uid, $('#dm-view'));
          }, 200);
        });
      });
    }, 300);
  });
}

/* ── Profile ────────────────────────────────────────────────── */
async function renderProfile(main, userId = null) {
  const targetId = userId || State.user.id;
  const isOwn = targetId === State.user.id;

  const { data: profile } = await sb.from('profiles').select('*').eq('id', targetId).single();
  if (!profile) { main.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Profile not found</div>`; return; }

  const isFollowing = !isOwn ? !!(await sb.from('follows').select('id').eq('follower_id', State.user.id).eq('following_id', targetId).single()).data : false;
  const color = avatarColor(profile.display_name || profile.username || '?');

  const safeName     = escapeHtml(profile.display_name || profile.username || 'Unknown');
  const safeHandle   = escapeHtml(profile.username || '');
  const safeBio      = escapeHtml(profile.bio || '');
  const safeLocation = escapeHtml(profile.location || '');
  const safeWebsite  = escapeHtml(profile.website || '');

  main.innerHTML = `
    <div class="profile-cover" style="${profile.banner_url ? `background-image:url('${escapeHtml(profile.banner_url)}');background-size:cover;background-position:center` : ''}">
      <div class="profile-cover-art" style="background:${profile.banner_url ? 'rgba(0,0,0,0.3)' : `linear-gradient(135deg,${color}22,var(--bg-void))`};${profile.banner_color && !profile.banner_url ? `background:${profile.banner_color}` : ''}"></div>
    </div>
    <div class="profile-info-section">
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" style="background:${color};font-size:32px;font-weight:800;color:white;display:flex;align-items:center;justify-content:center">
            ${profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : avatarInitials(profile.display_name || profile.username || 'U')}
          </div>
          <div class="profile-online-dot ${State.onlineUsers.has(targetId) ? 'online' : ''}" data-presence-uid="${targetId}"></div>
        </div>
        <div class="profile-actions" style="position:static;margin-bottom:10px;display:flex;gap:8px;align-items:center">
          ${isOwn
            ? `<button class="profile-action-btn secondary" id="edit-profile-btn">Edit Profile</button>`
            : `<button class="profile-action-btn ${isFollowing ? 'secondary' : 'primary'}" id="follow-profile-btn">${isFollowing ? 'Unfollow' : 'Follow'}</button>
               <button class="profile-action-btn secondary" id="dm-profile-btn">Message</button>`
          }
          <button class="profile-action-btn secondary" id="share-profile-btn"><i class="fa-solid fa-link"></i></button>
        </div>
      </div>
      <div class="profile-name" style="display:flex;align-items:center;gap:8px;">${safeName}${profile.is_github ? '<span style="display:inline-flex;align-items:center;gap:4px;background:#24292e;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;letter-spacing:0.01em;"><i class=\"fa-brands fa-github\" style=\"font-size:12px;\"></i>GitHub</span>' : ''}</div>
      <div class="profile-handle">@${safeHandle} ${State.onlineUsers.has(targetId) ? '<span style="color:var(--emerald);font-size:12px">● Online</span>' : ''}</div>
      <div class="profile-bio">${safeBio}</div>
      <div class="profile-meta">
        ${safeLocation ? `<div class="profile-meta-item">📍 <span>${safeLocation}</span></div>` : ''}
        ${safeWebsite ? `<div class="profile-meta-item"><i class="fa-solid fa-link"></i> <a href="${safeWebsite}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan)">${safeWebsite}</a></div>` : ''}
        <div class="profile-meta-item">📅 <span>Joined ${new Date(profile.created_at).toLocaleDateString('en-US', {month:'short',year:'numeric'})}</span></div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${fmtNum(profile.following_count || 0)}</strong> <span>Following</span></div>
        <div class="profile-stat"><strong>${fmtNum(profile.followers_count || 0)}</strong> <span>Followers</span></div>
        <div class="profile-stat"><strong>${fmtNum(profile.posts_count || 0)}</strong> <span>Posts</span></div>
      </div>
      ${profile.tech_stack?.length ? `<div class="tech-stack">${profile.tech_stack.map(t => `<span class="tech-badge">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="profile-tabs">
      <div class="profile-tab-list">
        ${['Posts','Repos'].map((t,i) => `<div class="profile-tab ${i===0?'active':''}" data-ptab="${t}">${t}</div>`).join('')}
      </div>
    </div>
    <div id="profile-content"></div>
  `;

  // Follow button
  const followBtn = $('#follow-profile-btn', main);
  if (followBtn) {
    let followState = isFollowing;
    followBtn.addEventListener('click', async () => {
      followBtn.disabled = true;
      if (followState) {
        await sb.from('follows').delete().eq('follower_id', State.user.id).eq('following_id', targetId);
        await sb.rpc('decrement_followers', { target_user_id: targetId });
        await sb.rpc('decrement_following', { target_user_id: State.user.id });
        followState = false;
        followBtn.textContent = 'Follow';
        followBtn.className = 'profile-action-btn primary';
        toast('Unfollowed', 'user-minus');
        // Update stat display
        const statEls = main.querySelectorAll('.profile-stat strong');
        if (statEls[1]) statEls[1].textContent = fmtNum(Math.max(0, (parseInt(statEls[1].textContent) || 1) - 1));
      } else {
        await sb.from('follows').insert({ follower_id: State.user.id, following_id: targetId });
        await sb.rpc('increment_followers', { target_user_id: targetId });
        await sb.rpc('increment_following', { target_user_id: State.user.id });
        await sb.from('notifications').insert({ user_id: targetId, actor_id: State.user.id, type: 'follow' });
        followState = true;
        followBtn.textContent = 'Unfollow';
        followBtn.className = 'profile-action-btn secondary';
        toast('Followed!', 'user-check');
        // Update stat display
        const statEls = main.querySelectorAll('.profile-stat strong');
        if (statEls[1]) statEls[1].textContent = fmtNum((parseInt(statEls[1].textContent) || 0) + 1);
      }
      followBtn.disabled = false;
    });
  }

  // DM button
  const dmBtn = $('#dm-profile-btn', main);
  if (dmBtn) {
    dmBtn.addEventListener('click', async () => {
      const a = State.user.id < targetId ? State.user.id : targetId;
      const b = State.user.id < targetId ? targetId : State.user.id;
      let { data: convo } = await sb.from('conversations').select('id').eq('participant_a', a).eq('participant_b', b).single();
      if (!convo) {
        const { data: newConvo } = await sb.from('conversations').insert({ participant_a: a, participant_b: b }).select().single();
        convo = newConvo;
      }
      navigateTo('messages');
      setTimeout(() => {
        openDM(convo.id, targetId, $('#dm-view'));
      }, 300);
    });
  }

  // Share profile button → opens invite modal
  const shareProfileBtn = $('#share-profile-btn', main);
  if (shareProfileBtn) {
    shareProfileBtn.addEventListener('click', () => {
      openShareInviteModal(profile);
    });
  }

  // Edit profile button
  const editBtn = $('#edit-profile-btn', main);
  if (editBtn) editBtn.addEventListener('click', () => openProfileEditModal(profile));

  // Profile tabs
  $$('.profile-tab', main).forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.profile-tab', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const content = $('#profile-content');
      if (tab.dataset.ptab === 'Posts') loadProfilePosts(content, targetId);
      else if (tab.dataset.ptab === 'Repos') loadProfileRepos(content, profile);
      else content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Coming soon 🔜</div>`;
    });
  });

  loadProfilePosts($('#profile-content'), targetId);
}

async function loadProfilePosts(container, userId) {
  if (!container) return;
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div>`;
  const { data: posts } = await sb
    .from('posts')
    .select('id, content, code_block, code_lang, image_url, file_url, file_name, likes_count, comments_count, reposts_count, created_at, profiles!posts_author_id_fkey(id, username, display_name, avatar_url)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  if (!posts?.length) { container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No posts yet</div>`; return; }

  const postIds = posts.map(p => p.id);
  const { data: likes } = await sb.from('post_likes').select('post_id').eq('user_id', State.user.id).in('post_id', postIds);
  const likedIds = new Set((likes || []).map(l => l.post_id));

  container.innerHTML = '';
  posts.forEach(p => container.appendChild(buildPostCard(p, p.profiles, likedIds.has(p.id), false)));
}

/* ── Profile Repos ──────────────────────────────────────────── */
async function loadProfileRepos(container, profile) {
  if (!container) return;

  // Use cached repos from tech_stack if no GitHub token available
  const username = profile?.username;
  const isGitHub = profile?.is_github;

  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Loading repos…</div>`;

  // Try fetching from GitHub public API (works without a token for public repos)
  let repos = [];
  if (isGitHub && username) {
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=12&type=owner`);
      if (res.ok) {
        const data = await res.json();
        repos = data.sort((a, b) => (b.stargazers_count - a.stargazers_count));
      }
    } catch (e) { /* fall through to tech_stack fallback */ }
  }

  // Fallback: show tech_stack chips as "pinned repos" if no GH data
  if (!repos.length) {
    const techStack = profile?.tech_stack || [];
    if (!techStack.length) {
      container.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--text-muted)">
          <div style="font-size:36px;margin-bottom:12px">📦</div>
          <div style="font-size:14px;font-weight:600">No repos linked</div>
          <div style="font-size:12px;margin-top:6px">${isGitHub ? 'No public repos found on GitHub.' : 'Connect with GitHub to show your repositories here.'}</div>
        </div>`;
      return;
    }
    // Render tech_stack as repo chips
    container.innerHTML = `
      <div style="padding:16px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">
          <i class="fa-solid fa-code-branch" style="color:var(--cyan);margin-right:6px"></i>Tech Stack
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${techStack.map(t => `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:rgba(99,217,255,0.07);border:1px solid rgba(99,217,255,0.15);font-size:13px;font-weight:600;color:var(--text-secondary)">
              <i class="fa-solid fa-code" style="font-size:11px;color:var(--cyan)"></i>${escapeHtml(t)}
            </span>`).join('')}
        </div>
      </div>`;
    return;
  }

  // Render full GitHub repo cards
  container.innerHTML = `
    <div style="padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
      ${repos.map(r => `
        <a href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
          <div style="
            background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;
            padding:14px 16px;transition:border-color 0.2s,transform 0.2s;cursor:pointer;
            display:flex;flex-direction:column;gap:8px;min-height:110px;
          " onmouseenter="this.style.borderColor='rgba(99,217,255,0.35)';this.style.transform='translateY(-2px)'"
             onmouseleave="this.style.borderColor='var(--border)';this.style.transform=''">
            <div style="display:flex;align-items:center;gap:8px">
              <i class="fa-solid fa-code-branch" style="color:var(--cyan);font-size:13px"></i>
              <span style="font-size:14px;font-weight:700;color:var(--cyan);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name)}</span>
              ${r.private ? '<span style="font-size:9px;padding:2px 6px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:4px;color:var(--amber);font-weight:700">PRIVATE</span>' : ''}
            </div>
            ${r.description ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(r.description)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:12px;margin-top:auto;font-size:11px;color:var(--text-muted)">
              ${r.language ? `<span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--cyan);display:inline-block"></span>${escapeHtml(r.language)}</span>` : ''}
              <span><i class="fa-solid fa-star" style="color:var(--amber);font-size:10px"></i> ${r.stargazers_count || 0}</span>
              <span><i class="fa-solid fa-code-fork" style="font-size:10px"></i> ${r.forks_count || 0}</span>
              <span style="margin-left:auto">${timeAgo(r.updated_at)}</span>
            </div>
          </div>
        </a>
      `).join('')}
    </div>
    <div style="padding:8px 16px 16px;text-align:center">
      <a href="https://github.com/${escapeHtml(username)}" target="_blank" rel="noopener noreferrer"
         style="font-size:12px;color:var(--cyan);text-decoration:none;display:inline-flex;align-items:center;gap:6px">
        <i class="fa-brands fa-github"></i> View all on GitHub
      </a>
    </div>`;
}

/* ── Bookmarks ──────────────────────────────────────────────── */
async function renderBookmarks(main) {
  main.innerHTML = `
    <div class="view-tabs"><div class="view-tab active" style="cursor:default">Bookmarks</div></div>
    <div id="bookmarks-list"><div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div></div>
  `;

  const { data: bookmarks } = await sb
    .from('bookmarks')
    .select('post_id, posts(id, content, code_block, code_lang, image_url, file_url, file_name, likes_count, comments_count, created_at, profiles!posts_author_id_fkey(id, username, display_name, avatar_url))')
    .eq('user_id', State.user.id)
    .order('created_at', { ascending: false });

  const container = $('#bookmarks-list');
  if (!bookmarks?.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No bookmarks yet — save posts for later! 🔖</div>`;
    return;
  }

  container.innerHTML = '';
  bookmarks.forEach(b => {
    if (b.posts) container.appendChild(buildPostCard(b.posts, b.posts.profiles, false, true));
  });
}

/* ── Settings ───────────────────────────────────────────────── */
function renderSettings(main) {
  main.innerHTML = `
    <div style="max-width:560px;padding:24px 16px">
      <h2 style="font-family:var(--font-display);font-size:22px;margin-bottom:20px">Settings</h2>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-weight:700;font-size:13px;color:var(--text-secondary)">Account</div>
        <div class="settings-row" id="settings-edit-profile">
          <span>Edit Profile</span>
          <span style="color:var(--text-muted)">›</span>
        </div>
        <div class="settings-row" id="settings-change-email">
          <span>Email</span>
          <span style="color:var(--text-muted);font-size:13px">${State.user.email}</span>
        </div>
        <div class="settings-row" id="settings-change-pass">
          <span>Change Password</span>
          <span style="color:var(--text-muted)">›</span>
        </div>
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-weight:700;font-size:13px;color:var(--text-secondary)">Privacy</div>
        <div class="settings-row">
          <span>Who can DM me</span>
          <span style="color:var(--text-muted);font-size:13px">Everyone</span>
        </div>
        <div class="settings-row">
          <span>Profile visibility</span>
          <span style="color:var(--text-muted);font-size:13px">Public</span>
        </div>
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:24px">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-weight:700;font-size:13px;color:var(--text-secondary)">Danger Zone</div>
        <div class="settings-row" id="settings-signout" style="color:var(--rose)">
          <span>Sign Out</span>
          <span>›</span>
        </div>
      </div>

      <div style="font-size:12px;color:var(--text-muted);text-align:center">
        Devit v1.0 · Built with Supabase ⚡
      </div>
    </div>
  `;

  $('#settings-edit-profile').addEventListener('click', () => openProfileEditModal(State.profile));
  $('#settings-signout').addEventListener('click', async () => {
    if (!confirm('Sign out of Devit?')) return;
    await sb.from('presence').update({ online: false }).eq('id', State.user.id);
    await sb.auth.signOut();
  });
  $('#settings-change-pass').addEventListener('click', async () => {
    const { error } = await sb.auth.resetPasswordForEmail(State.user.email, { redirectTo: 'https://suprosmith-coder.github.io/csc/' });
    if (!error) toast('Password reset email sent!', 'envelope');
    else toast('Error: ' + error.message, 'circle-exclamation');
  });
}

/* ── Profile Quick View (tap PFP) ───────────────────────────── */
function openProfileQuickView(userId) {
  const overlay = document.getElementById('profile-quick-overlay');
  const card    = document.getElementById('profile-quick-card');
  if (!overlay || !card) return;

  overlay.style.display = 'flex';
  card.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div>`;

  // Close on overlay click
  overlay.onclick = e => { if (e.target === overlay) { overlay.style.display = 'none'; } };

  sb.from('profiles').select('*').eq('id', userId).single().then(async ({ data: p }) => {
    if (!p) { card.innerHTML = `<div style="padding:24px;text-align:center;color:var(--rose)">Profile not found</div>`; return; }

    const isOwn = userId === State.user.id;
    const color = avatarColor(p.display_name || p.username || '?');
    const { data: followRow } = !isOwn ? await sb.from('follows').select('id').eq('follower_id', State.user.id).eq('following_id', userId).single() : { data: null };
    const isFollowing = !!followRow;

    // Check if linked
    const { data: linkRow } = !isOwn ? await sb.from('links').select('id').eq('requester_id', State.user.id).eq('target_id', userId).eq('status', 'accepted').single() : { data: null };
    const isLinked = !!linkRow;

    card.innerHTML = `
      <div style="height:80px;background:linear-gradient(135deg,${color}33,var(--bg-void));position:relative;">
        <button id="pqv-close" style="position:absolute;top:10px;right:12px;color:var(--text-muted);font-size:20px;background:none;border:none;cursor:pointer;line-height:1"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div style="padding:0 20px 20px;margin-top:-36px">
        <div style="width:72px;height:72px;border-radius:50%;background:${color};border:4px solid var(--bg-surface);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;overflow:hidden;margin-bottom:10px">
          ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" style="width:100%;height:100%;object-fit:cover">` : avatarInitials(p.display_name || p.username || 'U')}
        </div>
        <div style="font-family:var(--font-display);font-size:18px;font-weight:800">${escapeHtml(p.display_name || p.username || 'Unknown')}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px">@${escapeHtml(p.username || '')}</div>
        ${p.bio ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">${escapeHtml(p.bio)}</div>` : ''}
        <div style="display:flex;gap:16px;margin-bottom:14px">
          <div style="font-size:13px"><strong>${fmtNum(p.followers_count||0)}</strong> <span style="color:var(--text-muted)">Followers</span></div>
          <div style="font-size:13px"><strong>${fmtNum(p.following_count||0)}</strong> <span style="color:var(--text-muted)">Following</span></div>
        </div>
        ${!isOwn ? `<div style="display:flex;gap:8px">
          <button class="profile-action-btn ${isFollowing?'secondary':'primary'}" id="pqv-follow" style="flex:1">${isFollowing ? 'Unfollow' : 'Follow'}</button>
          <button class="profile-action-btn secondary" id="pqv-dm" style="flex:1"><i class="fa-solid fa-message"></i> DM</button>
          <button class="profile-action-btn secondary" id="pqv-link" title="${isLinked?'Linked':'Link'}">${isLinked ? '<i class="fa-solid fa-link" style="color:var(--cyan)"></i>' : '<i class="fa-solid fa-user-plus"></i>'}</button>
        </div>` : `<button class="profile-action-btn secondary" id="pqv-view-full" style="width:100%">View Full Profile</button>`}
        <button class="profile-action-btn secondary" id="pqv-view-profile" style="width:100%;margin-top:8px">View Full Profile</button>
      </div>
    `;

    document.getElementById('pqv-close').onclick = () => overlay.style.display = 'none';
    document.getElementById('pqv-view-profile').onclick = () => { overlay.style.display = 'none'; renderProfile($('#main'), userId); };

    const followBtn = document.getElementById('pqv-follow');
    if (followBtn) {
      let fState = isFollowing;
      followBtn.onclick = async () => {
        followBtn.disabled = true;
        if (fState) {
          await sb.from('follows').delete().eq('follower_id', State.user.id).eq('following_id', userId);
          await sb.rpc('decrement_followers', { target_user_id: userId });
          await sb.rpc('decrement_following', { target_user_id: State.user.id });
          fState = false; followBtn.textContent = 'Follow'; followBtn.className = 'profile-action-btn primary';
          toast('Unfollowed', 'user-minus');
        } else {
          await sb.from('follows').insert({ follower_id: State.user.id, following_id: userId });
          await sb.rpc('increment_followers', { target_user_id: userId });
          await sb.rpc('increment_following', { target_user_id: State.user.id });
          await sb.from('notifications').insert({ user_id: userId, actor_id: State.user.id, type: 'follow' });
          fState = true; followBtn.textContent = 'Unfollow'; followBtn.className = 'profile-action-btn secondary';
          toast('Followed!', 'user-check');
        }
        followBtn.disabled = false;
      };
    }

    const dmBtn = document.getElementById('pqv-dm');
    if (dmBtn) {
      dmBtn.onclick = async () => {
        overlay.style.display = 'none';
        const a = State.user.id < userId ? State.user.id : userId;
        const b = State.user.id < userId ? userId : State.user.id;
        let { data: convo } = await sb.from('conversations').select('id').eq('participant_a', a).eq('participant_b', b).single();
        if (!convo) { const { data: nc } = await sb.from('conversations').insert({ participant_a: a, participant_b: b }).select().single(); convo = nc; }
        navigateTo('messages');
        setTimeout(() => openDM(convo.id, userId, $('#dm-view')), 300);
      };
    }

    const linkBtn = document.getElementById('pqv-link');
    if (linkBtn) {
      linkBtn.onclick = async () => {
        if (isLinked) { toast('Already linked!', 'link'); return; }
        const { error } = await sb.from('links').insert({ requester_id: State.user.id, target_id: userId, status: 'pending' });
        if (!error) {
          await sb.from('notifications').insert({ user_id: userId, actor_id: State.user.id, type: 'link_request' });
          toast('Link request sent!', 'link');
          linkBtn.innerHTML = '<i class="fa-solid fa-clock"></i>';
        }
      };
    }
  });
}

/* ── Snippets — TikTok/Shorts style full-screen snap feed ────── */

// Global mute state shared across all snippet cards
let _snippetsMuted = true;

function renderSnippets(main) {
  // Full-screen takeover: hide topbar/sidebar while in snippets view
  main.style.cssText = 'padding:0;max-width:none;';

  main.innerHTML = `
    <div id="snippets-container" style="
      position:fixed;inset:0;z-index:200;background:#000;
      overflow-y:scroll;scroll-snap-type:y mandatory;
      scrollbar-width:none;-ms-overflow-style:none;
    " role="region" aria-label="Snippets feed" aria-roledescription="Video feed — swipe up or down to navigate">
      <style>#snippets-container::-webkit-scrollbar{display:none}</style>
      <div id="snippets-feed" style="width:100%;"></div>
    </div>

    <!-- Top bar overlay -->
    <div style="position:fixed;top:0;left:0;right:0;z-index:210;
      display:flex;align-items:center;justify-content:space-between;
      padding:12px 16px;
      background:linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 100%);
      pointer-events:none;">
      <div style="pointer-events:auto">
        <button id="snippets-back-btn" aria-label="Back to feed" style="background:rgba(0,0,0,0.4);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
      </div>
      <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:0.02em" aria-hidden="true">Snippets</div>
      <div style="pointer-events:auto;display:flex;gap:8px;align-items:center">
        <button id="snippets-mute-btn" aria-label="Toggle mute" style="background:rgba(0,0,0,0.4);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)">
          <i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>
        </button>
        <button id="snippets-post-btn" aria-label="Post a snippet" style="background:var(--cyan,#63d9ff);border:none;color:#000;height:32px;padding:0 14px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Post
        </button>
      </div>
    </div>

    <!-- Swipe hint (fades out after first interaction) -->
    <div id="snippets-swipe-hint" aria-hidden="true" style="
      position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
      z-index:211;display:flex;flex-direction:column;align-items:center;gap:6px;
      color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;
      pointer-events:none;animation:swipeHintFade 3s 1.5s forwards;
    ">
      <i class="fa-solid fa-angles-up" style="font-size:20px;animation:bounceUp 1s ease-in-out infinite alternate"></i>
      Swipe up for next
    </div>
  `;

  // Back button exits snippets view
  document.getElementById('snippets-back-btn').addEventListener('click', () => {
    main.style.cssText = '';
    document.querySelectorAll('.snip-video').forEach(v => v.pause());
    navigateTo('feed');
  });

  // Global mute toggle
  const muteBtn = document.getElementById('snippets-mute-btn');
  muteBtn.addEventListener('click', () => {
    _snippetsMuted = !_snippetsMuted;
    muteBtn.setAttribute('aria-label', _snippetsMuted ? 'Unmute' : 'Mute');
    muteBtn.innerHTML = _snippetsMuted
      ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
    document.querySelectorAll('.snip-video').forEach(v => { v.muted = _snippetsMuted; });
  });

  document.getElementById('snippets-post-btn').addEventListener('click', openSnippetUploadModal);

  loadSnippets(document.getElementById('snippets-feed'));

  // Keyboard navigation (arrow keys / j/k)
  const snippetsContainer = document.getElementById('snippets-container');
  const onKeydown = e => {
    if (!document.getElementById('snippets-container')) { document.removeEventListener('keydown', onKeydown); return; }
    const h = window.innerHeight;
    if (e.key === 'ArrowDown' || e.key === 'j') snippetsContainer.scrollBy({ top: h, behavior: 'smooth' });
    if (e.key === 'ArrowUp'   || e.key === 'k') snippetsContainer.scrollBy({ top: -h, behavior: 'smooth' });
    if (e.key === 'ArrowLeft' || e.key === 'Escape') { main.style.cssText = ''; document.querySelectorAll('.snip-video').forEach(v => v.pause()); navigateTo('feed'); }
  };
  document.addEventListener('keydown', onKeydown);

  // Hide swipe hint on first scroll
  snippetsContainer.addEventListener('scroll', () => {
    const hint = document.getElementById('snippets-swipe-hint');
    if (hint) hint.style.display = 'none';
  }, { once: true });
}

async function loadSnippets(container) {
  const { data: snippets } = await sb
    .from('snippets')
    .select('*, profiles!snippets_author_id_fkey(id, username, display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!snippets?.length) {
    container.innerHTML = `
      <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff">
        <div style="font-size:56px">🎬</div>
        <div style="font-size:20px;font-weight:800">No Snippets Yet</div>
        <div style="font-size:14px;opacity:0.6">Be the first to post one!</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  snippets.forEach(s => container.appendChild(buildSnippetCard(s)));
}

function buildSnippetCard(snippet) {
  const card = document.createElement('div');
  card.style.cssText = `
    position:relative;width:100%;height:100vh;
    scroll-snap-align:start;scroll-snap-stop:always;
    overflow:hidden;background:#000;flex-shrink:0;
  `;

  const color = avatarColor(snippet.profiles?.display_name || snippet.profiles?.username || '?');
  const username = escapeHtml(snippet.profiles?.username || '?');
  const displayName = escapeHtml(snippet.profiles?.display_name || snippet.profiles?.username || '?');
  const avatarContent = snippet.profiles?.avatar_url
    ? `<img src="${escapeHtml(snippet.profiles.avatar_url)}" style="width:100%;height:100%;object-fit:cover">`
    : avatarInitials(snippet.profiles?.display_name || snippet.profiles?.username || 'U');

  card.innerHTML = `
    <!-- Video -->
    <video class="snip-video" src="${escapeHtml(snippet.video_url || '')}"
      loop playsinline preload="metadata"
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
    </video>

    <!-- Gradient overlays -->
    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 50%,transparent 80%,rgba(0,0,0,0.2) 100%);pointer-events:none"></div>

    <!-- Tap to play/pause hit zone -->
    <div class="snip-tap-zone" style="position:absolute;inset:0;z-index:1"></div>

    <!-- Play/pause icon (center flash) -->
    <div class="snip-playpause-flash" style="
      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:72px;height:72px;border-radius:50%;
      background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;
      font-size:28px;color:#fff;opacity:0;z-index:2;
      transition:opacity 0.15s;pointer-events:none;">
      <i class="fa-solid fa-play"></i>
    </div>

    <!-- Progress bar -->
    <div style="position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,255,255,0.2);z-index:3">
      <div class="snip-progress" style="height:100%;background:var(--cyan,#63d9ff);width:0%;transition:width 0.1s linear"></div>
    </div>

    <!-- Right action column -->
    <div style="position:absolute;right:12px;bottom:90px;z-index:4;display:flex;flex-direction:column;align-items:center;gap:20px;">

      <!-- Avatar with follow ring -->
      <div style="position:relative;margin-bottom:4px">
        <div class="snip-avatar-btn" data-uid="${snippet.profiles?.id || ''}" style="
          width:48px;height:48px;border-radius:50%;background:${color};
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:16px;color:#fff;overflow:hidden;
          border:2px solid #fff;cursor:pointer;flex-shrink:0;">
          ${avatarContent}
        </div>
        <div style="
          position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);
          width:20px;height:20px;border-radius:50%;background:var(--rose,#fb7185);
          display:flex;align-items:center;justify-content:center;
          font-size:10px;color:#fff;border:2px solid #000;cursor:pointer;"
          class="snip-follow-dot" data-uid="${snippet.profiles?.id || ''}">
          <i class="fa-solid fa-plus"></i>
        </div>
      </div>

      <!-- Heart -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <button class="snip-heart-btn" style="
          background:none;border:none;color:#fff;font-size:28px;cursor:pointer;
          padding:6px;transition:transform 0.2s;">
          <i class="fa-solid fa-heart"></i>
        </button>
        <span class="snip-heart-count" style="color:#fff;font-size:12px;font-weight:700">${fmtNum(snippet.hearts_count || 0)}</span>
      </div>

      <!-- Comment -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <button class="snip-comment-btn" data-sid="${snippet.id}" style="background:none;border:none;color:#fff;font-size:26px;cursor:pointer;padding:6px">
          <i class="fa-solid fa-comment-dots"></i>
        </button>
        <span class="snip-comment-count" style="color:#fff;font-size:12px;font-weight:700">${fmtNum(snippet.comments_count || 0)}</span>
      </div>

      <!-- Bookmark -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <button class="snip-bookmark-btn" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:6px">
          <i class="fa-solid fa-bookmark"></i>
        </button>
      </div>

      <!-- Share -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <button class="snip-share-btn" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:6px">
          <i class="fa-solid fa-share-nodes"></i>
        </button>
      </div>
    </div>

    <!-- Bottom info -->
    <div style="position:absolute;left:0;right:72px;bottom:16px;z-index:4;padding:0 16px">
      <div class="snip-author-info" data-uid="${snippet.profiles?.id || ''}" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
        <div style="font-size:14px;font-weight:700;color:#fff">@${username}</div>
        ${snippet.profiles?.is_github ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#24292e;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;line-height:1.5;"><i class="fa-brands fa-github" style="font-size:11px;"></i> GitHub</span>` : ''}
      </div>
      ${snippet.caption ? `
        <div style="font-size:13px;color:rgba(255,255,255,0.9);line-height:1.5;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          ${escapeHtml(snippet.caption).replace(/#(\w+)/g,'<span style="color:var(--cyan,#63d9ff)">#$1</span>')}
        </div>` : ''}
      <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-music" style="font-size:11px;color:rgba(255,255,255,0.6)"></i>
        <div style="font-size:11px;color:rgba(255,255,255,0.6)">${displayName} · Original audio</div>
      </div>
    </div>
  `;

  const video     = card.querySelector('.snip-video');
  const flash     = card.querySelector('.snip-playpause-flash');
  const progress  = card.querySelector('.snip-progress');
  const tapZone   = card.querySelector('.snip-tap-zone');

  // Sync video mute state with global mute
  video.muted = _snippetsMuted;

  // Progress bar
  video.addEventListener('timeupdate', () => {
    if (video.duration) progress.style.width = ((video.currentTime / video.duration) * 100) + '%';
  });

  // Tap to play/pause with flash animation
  let _flashTimer;
  tapZone.addEventListener('click', () => {
    if (video.paused) {
      video.play();
      flash.querySelector('i').className = 'fa-solid fa-play';
    } else {
      video.pause();
      flash.querySelector('i').className = 'fa-solid fa-pause';
    }
    flash.style.opacity = '1';
    clearTimeout(_flashTimer);
    _flashTimer = setTimeout(() => { flash.style.opacity = '0'; }, 600);
  });

  // Double-tap to heart (TikTok style)
  let _lastTap = 0;
  tapZone.addEventListener('click', () => {
    const now = Date.now();
    if (now - _lastTap < 300) {
      // Double tap — trigger heart
      card.querySelector('.snip-heart-btn').click();
      // Show heart burst
      const burst = document.createElement('div');
      burst.innerHTML = '<i class="fa-solid fa-heart" style="color:var(--rose,#fb7185);font-size:80px"></i>';
      burst.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);z-index:10;pointer-events:none;transition:transform 0.3s,opacity 0.3s';
      card.appendChild(burst);
      requestAnimationFrame(() => { burst.style.transform = 'translate(-50%,-50%) scale(1)'; burst.style.opacity = '1'; });
      setTimeout(() => { burst.style.transform = 'translate(-50%,-50%) scale(1.4)'; burst.style.opacity = '0'; }, 300);
      setTimeout(() => burst.remove(), 700);
    }
    _lastTap = now;
  });

  // Intersection observer — autoplay when in view, pause when not
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        video.muted = _snippetsMuted; // sync mute on each entry
        video.play().catch(() => {
          // Autoplay blocked — show play icon
          flash.querySelector('i').className = 'fa-solid fa-play';
          flash.style.opacity = '1';
        });
      } else {
        video.pause();
        video.currentTime = 0;
        progress.style.width = '0%';
      }
    });
  }, { threshold: 0.7 });
  obs.observe(card);

  // Avatar / author click
  card.querySelectorAll('.snip-avatar-btn, .snip-author-info').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      if (uid) openProfileQuickView(uid);
    });
  });

  // Follow dot
  card.querySelector('.snip-follow-dot').addEventListener('click', async e => {
    e.stopPropagation();
    const uid = e.currentTarget.dataset.uid;
    if (!uid || uid === State.user.id) return;
    const { error } = await sb.from('follows').insert({ follower_id: State.user.id, following_id: uid });
    if (!error) {
      e.currentTarget.innerHTML = '<i class="fa-solid fa-check"></i>';
      e.currentTarget.style.background = 'var(--emerald,#34d399)';
      await sb.rpc('increment_followers', { target_user_id: uid });
      await sb.rpc('increment_following', { target_user_id: State.user.id });
      await sb.from('notifications').insert({ user_id: uid, actor_id: State.user.id, type: 'follow' });
      toast('Followed!', 'user-check');
    }
  });

  // Heart
  let _hearted = false;
  const heartBtn   = card.querySelector('.snip-heart-btn');
  const heartCount = card.querySelector('.snip-heart-count');
  heartBtn.addEventListener('click', async e => {
    e.stopPropagation();
    _hearted = !_hearted;
    heartBtn.querySelector('i').style.color = _hearted ? 'var(--rose,#fb7185)' : '#fff';
    heartBtn.style.transform = 'scale(1.3)';
    setTimeout(() => { heartBtn.style.transform = ''; }, 200);
    const cur = parseInt(heartCount.textContent) || 0;
    heartCount.textContent = fmtNum(_hearted ? cur + 1 : Math.max(0, cur - 1));
    if (_hearted) {
      await sb.from('snippet_hearts').insert({ snippet_id: snippet.id, user_id: State.user.id });
    } else {
      const { data: existing } = await sb.from('snippet_hearts').select('id').eq('snippet_id', snippet.id).eq('user_id', State.user.id).single();
      if (existing) await sb.from('snippet_hearts').delete().eq('id', existing.id);
    }
  });

  // Check if already hearted
  sb.from('snippet_hearts').select('id').eq('snippet_id', snippet.id).eq('user_id', State.user.id).single().then(({ data }) => {
    if (data) { _hearted = true; heartBtn.querySelector('i').style.color = 'var(--rose,#fb7185)'; }
  });

  // Bookmark
  card.querySelector('.snip-bookmark-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const { data: existing } = await sb.from('snippet_bookmarks').select('id').eq('snippet_id', snippet.id).eq('user_id', State.user.id).single();
    if (existing) {
      await sb.from('snippet_bookmarks').delete().eq('id', existing.id);
      btn.querySelector('i').style.color = '#fff';
      toast('Removed from bookmarks', 'bookmark');
    } else {
      await sb.from('snippet_bookmarks').insert({ snippet_id: snippet.id, user_id: State.user.id });
      btn.querySelector('i').style.color = 'var(--cyan,#63d9ff)';
      toast('Snippet bookmarked!', 'bookmark');
    }
  });

  // Share
  card.querySelector('.snip-share-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const url = snippet.video_url;
    if (navigator.share) {
      try { await navigator.share({ title: `@${username} on Devit`, url }); } catch (_) {}
    } else {
      navigator.clipboard?.writeText(url).then(() => toast('Video link copied!', 'link'));
    }
  });

  // Comment — open sliding panel
  card.querySelector('.snip-comment-btn').addEventListener('click', e => {
    e.stopPropagation();
    openSnippetComments(snippet.id, card);
  });

  // Disable long-press context menu / download on the video
  const vid = card.querySelector('.snip-video');
  if (vid) {
    vid.addEventListener('contextmenu', e => e.preventDefault());
    vid.addEventListener('touchstart', e => { vid._lpTimer = setTimeout(() => e.preventDefault(), 400); }, { passive: false });
    vid.addEventListener('touchend', () => clearTimeout(vid._lpTimer));
    vid.addEventListener('touchmove', () => clearTimeout(vid._lpTimer));
    vid.setAttribute('controlsList', 'nodownload');
    vid.setAttribute('disablePictureInPicture', '');
  }

  return card;
}

/* ── Snippet Comments Panel ──────────────────────────────────── */
async function openSnippetComments(snippetId, card) {
  // Remove any existing panel
  document.getElementById('snip-comments-panel')?.remove();
  document.getElementById('snip-comments-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'snip-comments-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.5);';
  document.body.appendChild(overlay);

  const panel = document.createElement('div');
  panel.id = 'snip-comments-panel';
  panel.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:301;
    background:var(--bg-surface,#10121a);
    border-radius:24px 24px 0 0;
    border-top:1px solid rgba(255,255,255,0.08);
    max-height:70vh;display:flex;flex-direction:column;
    animation:slideUpPanel 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
  `;

  if (!document.getElementById('snip-panel-anim')) {
    const s = document.createElement('style');
    s.id = 'snip-panel-anim';
    s.textContent = `
      @keyframes slideUpPanel { from{transform:translateY(100%)} to{transform:translateY(0)} }
    `;
    document.head.appendChild(s);
  }

  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Comments</div>
      <button id="snip-comments-close" style="color:var(--text-muted);font-size:18px;background:none;border:none;cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div id="snip-comments-list" style="flex:1;overflow-y:auto;padding:8px 0;min-height:120px;">
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Loading…</div>
    </div>
    <div style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;align-items:center;">
      ${avatarHtml(State.profile, 32)}
      <input id="snip-comment-input" style="flex:1;background:var(--bg-elevated,#181c27);border:1px solid rgba(255,255,255,0.08);border-radius:999px;padding:9px 14px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit;" placeholder="Add a comment…">
      <button id="snip-comment-send" style="background:var(--cyan,#63d9ff);color:#050508;border:none;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;">Send</button>
    </div>
  `;
  document.body.appendChild(panel);

  const close = () => {
    panel.style.transform = 'translateY(100%)';
    panel.style.transition = '0.25s ease';
    setTimeout(() => { panel.remove(); overlay.remove(); }, 250);
  };
  overlay.addEventListener('click', close);
  panel.querySelector('#snip-comments-close').addEventListener('click', close);

  // Load comments
  await loadSnippetComments(snippetId, panel.querySelector('#snip-comments-list'));

  // Send
  const input = panel.querySelector('#snip-comment-input');
  const sendBtn = panel.querySelector('#snip-comment-send');
  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const { error } = await sb.from('snippet_comments').insert({
      snippet_id: snippetId,
      author_id: State.user.id,
      content: text,
    });
    if (!error) {
      await loadSnippetComments(snippetId, panel.querySelector('#snip-comments-list'));
      // Update count on the card button
      const countEl = card?.querySelector('.snip-comment-count');
      if (countEl) {
        const cur = parseInt(countEl.textContent.replace('K','000')) || 0;
        countEl.textContent = fmtNum(cur + 1);
      }
      // Increment in DB
      await sb.from('snippets').update({ comments_count: (parseInt(card?.querySelector('.snip-comment-count')?.textContent)||0) }).eq('id', snippetId);
    } else {
      toast('Failed to post comment', 'circle-exclamation');
    }
  };
  sendBtn.addEventListener('click', doSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
}

async function loadSnippetComments(snippetId, container) {
  if (!container) return;
  const { data: comments } = await sb
    .from('snippet_comments')
    .select('id, content, created_at, profiles!snippet_comments_author_id_fkey(id, username, display_name, avatar_url, is_github)')
    .eq('snippet_id', snippetId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!comments?.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No comments yet — be the first!</div>`;
    return;
  }

  container.innerHTML = '';
  comments.forEach(c => {
    const p = c.profiles;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:10px;padding:10px 16px;align-items:flex-start;';
    div.innerHTML = `
      ${avatarHtml(p, 32)}
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:700;color:var(--text-primary);">${escapeHtml(p?.display_name || p?.username || 'User')}</span>
          ${p?.is_github ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#24292e;color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:999px;"><i class="fa-brands fa-github" style="font-size:9px;"></i></span>` : ''}
          <span style="font-size:11px;color:var(--text-muted);">${timeAgo(c.created_at)}</span>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;line-height:1.4;">${escapeHtml(c.content)}</div>
      </div>
    `;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function openSnippetUploadModal() {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = '📸 Post a Snippet';
  modal.classList.add('open');

  body.innerHTML = `
    <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
      <div class="drop-zone" id="snippet-drop-zone" style="border:2px dashed var(--border);border-radius:16px;padding:32px;text-align:center;cursor:pointer;transition:0.2s">
        <div style="font-size:40px;margin-bottom:10px">🎬</div>
        <div style="font-size:14px;font-weight:600;color:var(--text-secondary)">Drop your video here</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Max 30 seconds · Will be compressed to ~599 KB</div>
        <input type="file" id="snippet-file-input" accept="video/*" style="display:none">
      </div>
      <div id="snippet-preview-area" style="display:none">
        <video id="snippet-preview-video" style="width:100%;border-radius:12px;max-height:300px;background:#000" controls></video>
        <div id="snippet-duration-warn" style="display:none;color:var(--rose);font-size:12px;margin-top:6px"><i class="fa-solid fa-triangle-exclamation"></i> Video exceeds 30 seconds — please trim it</div>
      </div>
      <div class="auth-input-group">
        <label>Caption (optional)</label>
        <textarea id="snippet-caption" class="auth-input" placeholder="What's this about? #hashtags @mentions" rows="2" style="resize:none"></textarea>
      </div>
      <div id="snippet-compress-status" style="display:none;font-size:12px;color:var(--cyan)"><i class="fa-solid fa-spinner fa-spin"></i> Compressing video…</div>
      <button class="auth-btn-primary" id="snippet-post-btn" disabled><i class="fa-solid fa-film"></i> Post Snippet</button>
    </div>
  `;

  const dropZone   = document.getElementById('snippet-drop-zone');
  const fileInput  = document.getElementById('snippet-file-input');
  const previewArea= document.getElementById('snippet-preview-area');
  const previewVid = document.getElementById('snippet-preview-video');
  const durationWarn = document.getElementById('snippet-duration-warn');
  const postBtn    = document.getElementById('snippet-post-btn');
  let selectedFile = null;

  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

  function validateVideoFile(file) {
    if (!file) return false;
    if (!file.type.startsWith('video/') || !ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast(`Unsupported file type: ${file.type || 'unknown'}. Please upload a video (MP4, WebM, MOV).`, 'circle-exclamation');
      return false;
    }
    return true;
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--cyan)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    const f = e.dataTransfer.files[0];
    if (f && validateVideoFile(f)) handleSnippetFile(f);
  });

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f && validateVideoFile(f)) handleSnippetFile(f);
    fileInput.value = '';
  });

  function handleSnippetFile(file) {
    selectedFile = file;
    const url = URL.createObjectURL(file);
    previewVid.src = url;
    previewArea.style.display = 'block';
    previewVid.onloadedmetadata = () => {
      if (previewVid.duration > 31) {
        durationWarn.style.display = 'block';
        postBtn.disabled = true;
      } else {
        durationWarn.style.display = 'none';
        postBtn.disabled = false;
      }
    };
  }

  postBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    postBtn.disabled = true;
    postBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';
    const status = document.getElementById('snippet-compress-status');
    status.style.display = 'block';

    // Simulate compression (actual FFmpeg compression would require a server/edge function)
    // Here we upload directly — in production, route through a Supabase Edge Function
    const caption = document.getElementById('snippet-caption').value.trim();
    const ext = selectedFile.name.split('.').pop() || 'mp4';
    const path = `snippets/${State.user.id}/${Date.now()}.${ext}`;

    // Guarantee a video contentType — never let audio/mpeg or unknown types through
    const safeContentType = selectedFile.type.startsWith('video/') ? selectedFile.type : 'video/mp4';
    const { error: uploadErr } = await sb.storage.from('snippets').upload(path, selectedFile, { contentType: safeContentType });
    status.style.display = 'none';

    if (uploadErr) {
      toast('Upload failed: ' + uploadErr.message, 'circle-exclamation');
      postBtn.disabled = false;
      postBtn.innerHTML = '<i class="fa-solid fa-film"></i> Post Snippet';
      return;
    }

    const videoUrl = sb.storage.from('snippets').getPublicUrl(path).data.publicUrl;
    const { error: insertErr } = await sb.from('snippets').insert({
      author_id: State.user.id,
      video_url: videoUrl,
      caption,
      hearts_count: 0,
      duration: Math.round(previewVid.duration || 0),
    });

    if (insertErr) {
      toast('Failed to post: ' + insertErr.message, 'circle-exclamation');
    } else {
      modal.classList.remove('open');
      toast('Snippet posted!', 'film');
      if (State.currentView === 'snippets') navigateTo('snippets');
    }
    postBtn.disabled = false;
    postBtn.innerHTML = '<i class="fa-solid fa-film"></i> Post Snippet';
  });
}

/* ── Links (like friends but with DM + Discord-style perks) ─── */
function renderLinks(main) {
  main.innerHTML = `
    <div class="view-tabs">
      <div class="view-tab active" data-ltab="my-links">My Links</div>
      <div class="view-tab" data-ltab="requests">Requests <span id="req-badge" style="display:none;background:var(--rose);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:4px;"></span></div>
    </div>
    <div style="padding:10px 16px 4px;font-size:12px;color:var(--text-muted);line-height:1.5;">
      <b style="color:var(--text-secondary);">My Links</b> = people who've linked back with you &nbsp;·&nbsp;
      <b style="color:var(--text-secondary);">Requests</b> = people trying to link with you (accept to become Links)
    </div>
    <div id="links-content">
      <div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div>
    </div>
  `;

  // Tab switching
  $$('.view-tab[data-ltab]', main).forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.view-tab[data-ltab]', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById('links-content');
      if (!content) return;
      if (tab.dataset.ltab === 'my-links') loadMyLinks(content);
      else loadLinkRequests(content);
    });
  });

  // Show request badge count
  (async () => {
    const { count } = await sb.from('links').select('*', { count: 'exact', head: true }).eq('target_id', State.user.id).eq('status', 'pending');
    if (count > 0) {
      const badge = document.getElementById('req-badge');
      if (badge) { badge.style.display = 'inline'; badge.textContent = count; }
      // Also update bottom nav badge
      const bnavBadge = document.getElementById('bnav-badge-links');
      if (bnavBadge) bnavBadge.classList.add('visible');
    }
  })();

  // Load My Links by default — content div now exists
  const content = document.getElementById('links-content');
  if (content) loadMyLinks(content);
}

async function loadMyLinks(container) {
  const { data: linksA } = await sb.from('links').select('*, profiles!links_target_id_fkey(id, username, display_name, avatar_url)').eq('requester_id', State.user.id).eq('status', 'accepted');
  const { data: linksB } = await sb.from('links').select('*, profiles!links_requester_id_fkey(id, username, display_name, avatar_url)').eq('target_id', State.user.id).eq('status', 'accepted');

  const allLinks = [...(linksA || []).map(l => l.profiles), ...(linksB || []).map(l => l.profiles)].filter(Boolean);

  if (!allLinks.length) {
    container.innerHTML = `
      <div style="padding:60px 20px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">🔗</div>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:800;margin-bottom:8px">No Links Yet</div>
        <div style="color:var(--text-muted);font-size:14px">Links are close connections you can DM anytime. Tap someone's profile picture to send a Link request!</div>
      </div>`;
    return;
  }

  container.innerHTML = `<div style="padding:12px"></div>`;
  const list = container.querySelector('div');
  allLinks.forEach(p => {
    const color = avatarColor(p.display_name || p.username || '?');
    const row = el('div', 'link-person-row');
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;margin-bottom:8px;transition:0.18s" onmouseover="this.style.borderColor='var(--cyan)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="width:46px;height:46px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#fff;overflow:hidden;cursor:pointer;flex-shrink:0" data-uid="${p.id}" class="pfp-clickable">
          ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" style="width:100%;height:100%;object-fit:cover">` : avatarInitials(p.display_name || p.username || 'U')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${escapeHtml(p.display_name || p.username || 'Unknown')}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(p.username || '')} · <span style="color:var(--emerald)">● Linked</span></div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="link-dm-btn profile-action-btn secondary" data-uid="${p.id}" style="padding:6px 12px;font-size:12px"><i class="fa-solid fa-message"></i> DM</button>
          <button class="link-profile-btn profile-action-btn secondary" data-uid="${p.id}" style="padding:6px 12px;font-size:12px"><i class="fa-solid fa-user"></i></button>
        </div>
      </div>`;
    list.appendChild(row);
  });

  // Wire buttons
  container.querySelectorAll('.pfp-clickable[data-uid]').forEach(el => {
    el.addEventListener('click', () => openProfileQuickView(el.dataset.uid));
  });
  container.querySelectorAll('.link-dm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const a = State.user.id < uid ? State.user.id : uid;
      const b = State.user.id < uid ? uid : State.user.id;
      let { data: convo } = await sb.from('conversations').select('id').eq('participant_a', a).eq('participant_b', b).single();
      if (!convo) { const { data: nc } = await sb.from('conversations').insert({ participant_a: a, participant_b: b }).select().single(); convo = nc; }
      navigateTo('messages');
      setTimeout(() => openDM(convo.id, uid, $('#dm-view')), 300);
    });
  });
  container.querySelectorAll('.link-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => { renderProfile($('#main'), btn.dataset.uid); });
  });
}

async function loadLinkRequests(container) {
  const { data: incoming } = await sb.from('links').select('*, profiles!links_requester_id_fkey(id, username, display_name, avatar_url)').eq('target_id', State.user.id).eq('status', 'pending');

  if (!incoming?.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No pending link requests</div>`;
    return;
  }

  container.innerHTML = `<div style="padding:12px"></div>`;
  const list = container.querySelector('div');
  incoming.forEach(req => {
    const p = req.profiles;
    if (!p) return;
    const color = avatarColor(p.display_name || p.username || '?');
    const row = el('div', '');
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;margin-bottom:8px">
        <div style="width:44px;height:44px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;overflow:hidden;flex-shrink:0">
          ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" style="width:100%;height:100%;object-fit:cover">` : avatarInitials(p.display_name || p.username || 'U')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${escapeHtml(p.display_name || p.username || 'Unknown')}</div>
          <div style="font-size:12px;color:var(--text-muted)">@${escapeHtml(p.username || '')} wants to link with you</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="accept-link-btn profile-action-btn primary" data-lid="${req.id}" data-rid="${p.id}" style="padding:6px 12px;font-size:12px">Accept</button>
          <button class="decline-link-btn profile-action-btn secondary" data-lid="${req.id}" style="padding:6px 12px;font-size:12px">Decline</button>
        </div>
      </div>`;
    list.appendChild(row);
  });

  container.querySelectorAll('.accept-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '…';
      const lid = btn.dataset.lid;
      const rid = btn.dataset.rid; // requester id

      // Accept the incoming request
      await sb.from('links').update({ status: 'accepted' }).eq('id', lid);

      // Create a reciprocal link back (you -> them), so both sides are linked
      if (rid) {
        await sb.from('links').upsert({
          requester_id: State.user.id,
          target_id: rid,
          status: 'accepted',
        }, { onConflict: 'requester_id,target_id' });
        // Notify them that you accepted
        await sb.from('notifications').insert({
          user_id: rid,
          actor_id: State.user.id,
          type: 'link_accepted',
        });
      }

      toast('Link accepted! You are now linked.', 'link');
      loadLinkRequests(container);
      // Update badge
      const badge = document.querySelector('#req-badge');
      if (badge) {
        const cur = parseInt(badge.textContent) || 0;
        if (cur <= 1) badge.style.display = 'none';
        else badge.textContent = cur - 1;
      }
    });
  });
  container.querySelectorAll('.decline-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('links').delete().eq('id', btn.dataset.lid);
      toast('Request declined', 'xmark');
      loadLinkRequests(container);
    });
  });
}

/* ── Enhanced Profile Edit (with avatar + banner customization) */
function openProfileEditModal(profile) {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = 'Edit Profile';
  modal.classList.add('open');

  const BANNER_COLORS = ['#0d1b2e', '#1a0d2e', '#0d2e1a', '#2e1a0d', '#1a1a2e', '#2e0d1a', '#0d2e2e'];

  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">

      <!-- Banner customizer -->
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;display:block">Profile Banner</label>
        <div id="banner-preview" style="height:80px;border-radius:12px;background:${profile.banner_color || '#0d1b2e'};position:relative;overflow:hidden;margin-bottom:8px;border:1px solid var(--border)">
          ${profile.banner_url ? `<img src="${escapeHtml(profile.banner_url)}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">` : ''}
          <button id="banner-img-btn" style="position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,0.6);border:none;border-radius:8px;color:#fff;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer"><i class="fa-solid fa-image"></i> Change Image</button>
          <input type="file" id="banner-img-input" accept="image/*" style="display:none">
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${BANNER_COLORS.map(c => `<button class="banner-color-btn" data-color="${c}" style="width:28px;height:28px;border-radius:8px;background:${c};border:2px solid ${(profile.banner_color||'#0d1b2e')===c?'var(--cyan)':'transparent'};cursor:pointer;transition:0.15s"></button>`).join('')}
          <input type="color" id="banner-custom-color" value="${profile.banner_color || '#0d1b2e'}" style="width:28px;height:28px;border-radius:8px;border:2px solid var(--border);cursor:pointer;padding:0;background:none">
        </div>
      </div>

      <!-- Avatar -->
      <div class="edit-avatar-section">
        <div id="edit-avatar-preview" class="edit-avatar-preview" style="background:linear-gradient(135deg,${profile.banner_color||'var(--cyan)'},var(--violet))">
          ${profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : avatarInitials(profile.display_name || profile.username || 'U')}
        </div>
        <div class="edit-avatar-actions">
          <button class="edit-avatar-btn" id="change-avatar-btn"><i class="fa-solid fa-camera"></i> Change Photo</button>
          <input type="file" id="avatar-img-input" accept="image/*" style="display:none">
          <div style="font-size:11px;color:var(--text-muted)">Max 2MB · JPG, PNG, GIF</div>
        </div>
      </div>

      <div class="auth-input-group">
        <label>Display Name</label>
        <input type="text" id="edit-display-name" class="auth-input" value="${profile.display_name || ''}" placeholder="Your name" maxlength="50" autocomplete="name">
      </div>
      <div class="auth-input-group">
        <label>Username</label>
        <input type="text" id="edit-username" class="auth-input" value="${profile.username || ''}" placeholder="username" maxlength="30" autocomplete="username">
      </div>
      <div class="auth-input-group">
        <label>Bio</label>
        <textarea id="edit-bio" class="auth-input" placeholder="Tell the world about yourself" rows="3" style="resize:vertical" autocomplete="off">${profile.bio || ''}</textarea>
      </div>
      <div class="auth-input-group">
        <label>Location</label>
        <input type="text" id="edit-location" class="auth-input" value="${profile.location || ''}" placeholder="City, Country" autocomplete="address-level2">
      </div>
      <div class="auth-input-group">
        <label>Website</label>
        <input type="url" id="edit-website" class="auth-input" value="${profile.website || ''}" placeholder="https://yoursite.dev" autocomplete="url">
      </div>
      <div class="auth-input-group">
        <label>Tech Stack (comma-separated)</label>
        <input type="text" id="edit-tech" class="auth-input" value="${(profile.tech_stack || []).join(', ')}" placeholder="React, TypeScript, Node.js" autocomplete="off">
      </div>
      <div id="edit-status" style="font-size:12px;color:var(--text-muted);display:none"></div>
      <button class="auth-btn-primary" id="save-profile-btn">Save Changes</button>
    </div>
  `;

  let newBannerColor = profile.banner_color || '#0d1b2e';
  let newAvatarFile  = null;
  let newBannerFile  = null;

  // Banner color swatches
  document.querySelectorAll('.banner-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      newBannerColor = btn.dataset.color;
      document.querySelectorAll('.banner-color-btn').forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = 'var(--cyan)';
      const preview = document.getElementById('banner-preview');
      if (!newBannerFile) preview.style.background = newBannerColor;
      document.getElementById('banner-custom-color').value = newBannerColor;
    });
  });

  document.getElementById('banner-custom-color').addEventListener('input', e => {
    newBannerColor = e.target.value;
    document.getElementById('banner-preview').style.background = newBannerColor;
  });

  // Banner image
  document.getElementById('banner-img-btn').addEventListener('click', () => document.getElementById('banner-img-input').click());
  document.getElementById('banner-img-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    newBannerFile = file;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById('banner-preview');
    let img = preview.querySelector('img');
    if (!img) { img = document.createElement('img'); img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0'; preview.insertBefore(img, preview.firstChild); }
    img.src = url;
  });

  // Avatar
  document.getElementById('change-avatar-btn').addEventListener('click', () => document.getElementById('avatar-img-input').click());
  document.getElementById('avatar-img-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Avatar must be under 2MB', 'circle-exclamation'); return; }
    newAvatarFile = file;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById('edit-avatar-preview');
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  });

  document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    const statusEl = document.getElementById('edit-status');
    statusEl.style.display = 'block'; statusEl.textContent = 'Saving…';

    let avatarUrl = profile.avatar_url;
    let bannerUrl = profile.banner_url;

    // Helper: delete-then-upload so upsert quirks don't block us
    async function storageUpload(bucket, path, file) {
      // Remove existing file first (ignore error if it doesn't exist)
      await sb.storage.from(bucket).remove([path]);
      const { data, error } = await sb.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, cacheControl: '3600' });
      if (error) {
        console.error(`[Devit] storage upload failed bucket=${bucket} path=${path}`, JSON.stringify(error));
      }
      return error;
    }

    // Upload new avatar
    if (newAvatarFile) {
      const ext = (newAvatarFile.name.split('.').pop() || 'jpg').toLowerCase();
      // Keep path flat: USER_ID/avatar.ext — matches RLS policy foldername[1] = auth.uid()
      const path = `${State.user.id}/avatar.${ext}`;
      const avErr = await storageUpload('post-images', path, newAvatarFile);
      if (avErr) {
        btn.disabled = false; btn.textContent = 'Save Changes';
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--rose)';
        statusEl.textContent = 'Avatar upload failed: ' + (avErr.message || avErr.error || JSON.stringify(avErr));
        return;
      }
      avatarUrl = sb.storage.from('post-images').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
    }

    // Upload new banner — path: USER_ID/banner.ext (still under user folder, RLS matches)
    if (newBannerFile) {
      const ext = (newBannerFile.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${State.user.id}/banner.${ext}`;
      const bnErr = await storageUpload('post-images', path, newBannerFile);
      if (bnErr) {
        btn.disabled = false; btn.textContent = 'Save Changes';
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--rose)';
        statusEl.textContent = 'Banner upload failed: ' + (bnErr.message || bnErr.error || JSON.stringify(bnErr));
        return;
      }
      bannerUrl = sb.storage.from('post-images').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
    }

    const tech_stack = document.getElementById('edit-tech').value.split(',').map(t => t.trim()).filter(Boolean);
    const { error } = await sb.from('profiles').update({
      display_name: document.getElementById('edit-display-name').value.trim(),
      username: document.getElementById('edit-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      bio: document.getElementById('edit-bio').value.trim(),
      location: document.getElementById('edit-location').value.trim(),
      website: document.getElementById('edit-website').value.trim(),
      tech_stack,
      avatar_url: avatarUrl,
      banner_url: bannerUrl,
      banner_color: newBannerColor,
    }).eq('id', State.user.id);

    if (error) {
      statusEl.style.color = 'var(--rose)'; statusEl.textContent = 'Failed: ' + error.message;
      btn.disabled = false; btn.textContent = 'Save Changes';
    } else {
      const { data: updated } = await sb.from('profiles').select('*').eq('id', State.user.id).single();
      State.profile = updated;
      modal.classList.remove('open');
      toast('Profile updated!', 'pen');
      navigateTo('profile');
    }
  });
}

/* ── Content Moderation ─────────────────────────────────────── */

function openPostMoreMenu(anchorBtn, postId, authorId) {
  // Remove any existing menu
  document.getElementById('post-more-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'post-more-menu';
  menu.style.cssText = `position:fixed;z-index:1000;background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.5);min-width:170px;overflow:hidden;font-size:13px`;
  menu.innerHTML = `
    <button class="post-more-item" id="pmi-report-post" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:none;border:none;color:var(--text-primary);cursor:pointer;transition:background 0.15s">
      <i class="fa-solid fa-flag" style="color:var(--amber,#fb923c)"></i> Report post
    </button>
    <button class="post-more-item" id="pmi-block-user" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:none;border:none;color:var(--rose,#f87171);cursor:pointer;transition:background 0.15s">
      <i class="fa-solid fa-ban"></i> Block user
    </button>
  `;
  menu.querySelectorAll('.post-more-item').forEach(b => {
    b.addEventListener('mouseenter', () => b.style.background = 'var(--bg-elevated)');
    b.addEventListener('mouseleave', () => b.style.background = '');
  });
  document.body.appendChild(menu);

  // Position near button
  const rect = anchorBtn.getBoundingClientRect();
  const mw = 170;
  let left = rect.right - mw;
  if (left < 8) left = 8;
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = left + 'px';

  menu.querySelector('#pmi-report-post').addEventListener('click', () => { menu.remove(); openReportModal('post', postId); });
  menu.querySelector('#pmi-block-user').addEventListener('click', () => { menu.remove(); confirmBlockUser(authorId); });

  const dismiss = e => { if (!menu.contains(e.target) && e.target !== anchorBtn) { menu.remove(); document.removeEventListener('pointerdown', dismiss); } };
  setTimeout(() => document.addEventListener('pointerdown', dismiss), 50);
}

function openReportModal(type, targetId) {
  const modal = $('#modal-overlay');
  $('#modal-title-text').textContent = 'Report ' + (type === 'post' ? 'Post' : 'User');
  modal.classList.add('open');

  const reasons = ['Spam or misleading', 'Harassment or bullying', 'Hate speech', 'Violent or harmful content', 'Misinformation', 'Other'];
  $('#modal-body').innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <p style="font-size:13px;color:var(--text-secondary);margin:0">Why are you reporting this ${type}?</p>
      <div id="report-reasons" style="display:flex;flex-direction:column;gap:6px">
        ${reasons.map((r, i) => `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--border);transition:border-color 0.15s" class="report-reason-label">
          <input type="radio" name="report-reason" value="${escapeHtml(r)}" style="accent-color:var(--cyan)"> <span style="font-size:13px">${escapeHtml(r)}</span>
        </label>`).join('')}
      </div>
      <textarea id="report-extra" class="auth-input" placeholder="Additional details (optional)" rows="3" style="resize:vertical;font-size:13px"></textarea>
      <button id="submit-report-btn" class="auth-btn-primary" style="margin-top:4px"><i class="fa-solid fa-flag"></i> Submit Report</button>
      <div id="report-status" style="display:none;font-size:12px;text-align:center;color:var(--text-muted)"></div>
    </div>
  `;

  $$('.report-reason-label').forEach(l => {
    l.querySelector('input').addEventListener('change', () => {
      $$('.report-reason-label').forEach(x => x.style.borderColor = 'var(--border)');
      l.style.borderColor = 'var(--cyan)';
    });
  });

  $('#submit-report-btn').addEventListener('click', async () => {
    const reason = document.querySelector('input[name="report-reason"]:checked')?.value;
    if (!reason) { toast('Please select a reason', 'circle-exclamation'); return; }
    const extra = $('#report-extra').value.trim();
    const btn = $('#submit-report-btn');
    btn.disabled = true; btn.textContent = 'Submitting…';
    const { error } = await sb.from('reports').insert({
      reporter_id: State.user.id,
      target_type: type,
      target_id: targetId,
      reason,
      details: extra || null,
    });
    if (error) {
      btn.disabled = false; btn.textContent = 'Submit Report';
      toast('Failed: ' + error.message, 'circle-exclamation');
    } else {
      modal.classList.remove('open');
      toast('Report submitted. Thank you.', 'flag');
    }
  });
}

async function confirmBlockUser(userId) {
  if (!userId) return;
  const { data: profile } = await sb.from('profiles').select('display_name, username').eq('id', userId).single();
  const name = profile?.display_name || profile?.username || 'this user';
  const modal = $('#modal-overlay');
  $('#modal-title-text').textContent = 'Block User';
  modal.classList.add('open');
  $('#modal-body').innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:16px">
      <p style="font-size:14px;color:var(--text-primary);margin:0">Block <strong>${escapeHtml(name)}</strong>?</p>
      <p style="font-size:13px;color:var(--text-secondary);margin:0">They won't be able to see your posts or DM you. Their content will be hidden from your feed.</p>
      <div style="display:flex;gap:10px">
        <button id="confirm-block-btn" style="flex:1;padding:10px;border-radius:8px;background:var(--rose,#f87171);border:none;color:#fff;font-weight:700;cursor:pointer;font-size:13px">Block</button>
        <button id="cancel-block-btn" style="flex:1;padding:10px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-primary);font-weight:600;cursor:pointer;font-size:13px">Cancel</button>
      </div>
    </div>
  `;
  $('#confirm-block-btn').addEventListener('click', async () => {
    const { error } = await sb.from('blocks').insert({ blocker_id: State.user.id, blocked_id: userId });
    modal.classList.remove('open');
    if (error && error.code !== '23505') { toast('Error: ' + error.message, 'circle-exclamation'); return; }
    toast(`${name} blocked.`, 'ban');
    // Remove their cards from current view
    document.querySelectorAll(`.post-card [data-uid="${userId}"]`).forEach(el => el.closest('.post-card')?.remove());
  });
  $('#cancel-block-btn').addEventListener('click', () => modal.classList.remove('open'));
}

/* ── Web Push Notifications ──────────────────────────────────── */
// VAPID public key — replace with your own from: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBkYIL55lLpurs1A';

async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // already subscribed

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    // Save subscription to Supabase
    await sb.from('push_subscriptions').upsert({
      user_id: State.user.id,
      endpoint: sub.endpoint,
      keys: JSON.stringify({ p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))), auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))) }),
    }, { onConflict: 'user_id,endpoint' });
  } catch (err) { console.warn('Push registration failed:', err); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) { console.warn('SW registration failed:', err); }
}

/* ── Boot ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('modal-overlay')?.classList.remove('open');
      closeSearch();
    }
  });
});


/* ============================================================
   DEVIT — Features Patch v2 (merged)
   GitHub autofill · Polls · Digest widget · Read time/Views · Pinned posts
   + Soft UI overhaul styles (injected)
   ============================================================ */
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

// (strict mode inherited from app.js)

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
    // Always mark as GitHub user so the badge shows throughout the app
    update.is_github = true;

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

  // Inject after composer toolbar
  const composerToolbar = document.querySelector('.composer-toolbar');
  const composerInner   = document.querySelector('.composer-inner');
  const composerEl      = composerToolbar?.parentElement || composerInner;
  if (composerEl) {
    // Insert after the toolbar if possible
    if (composerToolbar) {
      composerToolbar.insertAdjacentElement('afterend', builder);
    } else {
      composerEl.appendChild(builder);
    }
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
  // Target the composer toolbar specifically
  const toolbar = document.querySelector('.composer-toolbar');
  if (!toolbar || document.getElementById('poll-toggle-btn')) return;

  const pollBtn = document.createElement('button');
  pollBtn.id = 'poll-toggle-btn';
  pollBtn.title = 'Add a poll';
  pollBtn.className = 'composer-tool';
  pollBtn.innerHTML = '<i class="fa-solid fa-chart-bar"></i>';
  pollBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
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

  // Insert before the actions group
  const actionsGroup = toolbar.querySelector('.composer-actions');
  if (actionsGroup) {
    toolbar.insertBefore(pollBtn, actionsGroup);
  } else {
    toolbar.appendChild(pollBtn);
  }
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

/* ══════════════════════════════════════════════════════════════
   DEVIT FIXES — SQL additions (run in Supabase Dashboard)
   ══════════════════════════════════════════════════════════════ */
console.log(`
/* ── Run these in Supabase Dashboard > SQL Editor ── */

-- GitHub flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_github boolean DEFAULT false;

-- Snippet comments table
CREATE TABLE IF NOT EXISTS snippet_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id uuid REFERENCES snippets(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE snippet_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public snippet comments" ON snippet_comments FOR SELECT USING (true);
CREATE POLICY "Auth snippet comment" ON snippet_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Own snippet comment delete" ON snippet_comments FOR DELETE USING (auth.uid() = author_id);

-- Enable realtime for snippet_comments
ALTER PUBLICATION supabase_realtime ADD TABLE snippet_comments;

-- Mutual link upsert policy (requester_id, target_id unique constraint)
ALTER TABLE links ADD CONSTRAINT IF NOT EXISTS links_requester_target_unique UNIQUE (requester_id, target_id);

-- Add link_accepted to notification types (no schema change needed, type is text)
`);
