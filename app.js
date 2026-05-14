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
      detectSessionInUrl: true,   // parse #access_token hash on GitHub Pages
      persistSession: true,
      autoRefreshToken: true,
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

function setAuthStatus(msg, isError = false) {
  const el = $('#auth-status');
  el.style.display = 'block';
  el.style.color = isError ? 'var(--rose)' : 'var(--text-secondary)';
  el.textContent = msg;
}

/* ── Avatar HTML ─────────────────────────────────────────────── */
function avatarHtml(profile, size = 36, cls = '') {
  if (!profile) return `<div class="profile-avatar-circle" style="width:${size}px;height:${size}px;font-size:${size*0.4}px;background:#444;${cls ? '' : ''}">?</div>`;
  const name = profile.display_name || profile.username || 'U';
  const color = avatarColor(name);
  if (profile.avatar_url) {
    return `<img src="${profile.avatar_url}" class="profile-avatar-circle${cls ? ' '+cls:''}" style="width:${size}px;height:${size}px;object-fit:cover" onerror="this.outerHTML='<div class=\\'profile-avatar-circle\\' style=\\'width:${size}px;height:${size}px;font-size:${size*0.4}px;background:${color}\\'>'+\`${avatarInitials(name)}\`+'</div>'">`;
  }
  return `<div class="profile-avatar-circle${cls ? ' '+cls:''}" style="width:${size}px;height:${size}px;font-size:${size*0.4}px;background:${color}">${avatarInitials(name)}</div>`;
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
      toast('⚠️ DB tables missing — see console for setup SQL', '⚠️');
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
`);
}

/* ── Auth ───────────────────────────────────────────────────── */
async function initAuth() {
  const screen = $('#auth-screen');
  const app    = $('#app');
  const githubBtn  = $('#github-login-btn');
  const loginBtn   = $('#login-btn');
  const signupBtn  = $('#signup-btn');
  const magicBtn   = $('#magic-link-btn');
  const emailIn    = $('#auth-email');
  const passIn     = $('#auth-password');

  // GitHub OAuth
  githubBtn.addEventListener('click', async () => {
    githubBtn.textContent = 'Connecting to GitHub…';
    githubBtn.disabled = true;
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.DEVIT_CONFIG.SITE_URL }
    });
    if (error) {
      setAuthStatus('GitHub login failed: ' + error.message, true);
      githubBtn.textContent = 'Continue with GitHub';
      githubBtn.disabled = false;
    }
  });

  // Email sign-in
  loginBtn.addEventListener('click', async () => {
    const email = emailIn.value.trim();
    const pass  = passIn.value;
    if (!email) { setAuthStatus('Enter your email', true); return; }
    if (!pass)  { setAuthStatus('Enter your password', true); return; }
    loginBtn.textContent = 'Signing in…';
    loginBtn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      setAuthStatus(error.message, true);
      loginBtn.textContent = 'Sign In';
      loginBtn.disabled = false;
    }
  });

  // Email sign-up
  signupBtn.addEventListener('click', async () => {
    const email = emailIn.value.trim();
    const pass  = passIn.value;
    if (!email) { setAuthStatus('Enter your email', true); return; }
    if (pass.length < 6) { setAuthStatus('Password must be at least 6 characters', true); return; }
    signupBtn.textContent = 'Creating…';
    signupBtn.disabled = true;
    const { error } = await sb.auth.signUp({
      email, password: pass,
      options: { emailRedirectTo: window.DEVIT_CONFIG.SITE_URL }
    });
    if (error) {
      setAuthStatus(error.message, true);
    } else {
      setAuthStatus('Check your email to confirm your account! ✉️');
    }
    signupBtn.textContent = 'Sign Up';
    signupBtn.disabled = false;
  });

  // Magic Link
  magicBtn.addEventListener('click', async () => {
    const email = emailIn.value.trim();
    if (!email) { setAuthStatus('Enter your email for the magic link', true); return; }
    magicBtn.textContent = 'Sending…';
    magicBtn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.DEVIT_CONFIG.SITE_URL }
    });
    if (error) {
      setAuthStatus(error.message, true);
    } else {
      setAuthStatus('Magic link sent! Check your inbox ✨');
    }
    magicBtn.textContent = 'Send Magic Link instead';
    magicBtn.disabled = false;
  });

  // Auth state listener — fires on login AND on page load if session exists
  let appBuilt = false;
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      State.user = session.user;
      await ensureProfile(session.user);

      // Clean the OAuth hash from the URL bar so tokens aren't visible / bookmarked
      if (window.location.hash.includes('access_token')) {
        history.replaceState(null, '', window.location.pathname);
      }

      if (!appBuilt) {
        appBuilt = true;
        screen.style.opacity = '0';
        screen.style.transform = 'scale(1.02)';
        screen.style.transition = '0.4s ease';
        setTimeout(() => {
          screen.style.display = 'none';
          app.classList.add('visible');
          buildApp();
          const firstName = State.profile?.display_name?.split(' ')[0] || 'dev';
          const greeting = event === 'SIGNED_IN' ? `Welcome, ${firstName}! 👋` : `Welcome back, ${firstName}! 👋`;
          toast(greeting, '🚀');
        }, 400);
      }
    } else {
      State.user = null;
      State.profile = null;
      appBuilt = false;
      screen.style.display = 'flex';
      screen.style.opacity = '1';
      screen.style.transform = '';
      app.classList.remove('visible');
    }
  });

  // Check existing session immediately
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    // No session — auth screen is already visible
  }
}

async function ensureProfile(authUser) {
  let { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (error || !profile) {
    // Create profile from OAuth metadata or email
    const meta = authUser.user_metadata || {};
    const email = authUser.email || '';
    const username = (meta.user_name || meta.preferred_username || email.split('@')[0] || 'user_' + Date.now()).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    const display_name = meta.full_name || meta.name || username;
    const avatar_url = meta.avatar_url || null;

    const { data: newProfile, error: createErr } = await sb
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
      }, { onConflict: 'id' })
      .select()
      .single();

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
  await bootstrapSchema();
  buildTopbar();
  buildSidebar();
  buildRightbar();
  navigateTo('feed');
  initPresenceRealtime();
  loadUnreadCounts();
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
}

/* ── Topbar ─────────────────────────────────────────────────── */
function buildTopbar() {
  const tb = $('#topbar');
  tb.innerHTML = `
    <div class="topbar-logo">
      <img src="logo.png" alt="Devit" style="width:30px;height:30px;border-radius:8px;object-fit:cover">
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
      <button class="topbar-action-btn" id="topbar-signout-btn" title="Sign out" style="font-size:16px">⏻</button>
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
    toast('Signed out. See you soon! 👋', '👋');
  });

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

  overlay.innerHTML = `<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border)">Searching for "${query}"…</div>`;
  document.body.appendChild(overlay);

  // Click outside to close
  const closeOnClick = e => { if (!overlay.contains(e.target) && e.target !== $('#search-input')) { overlay.remove(); document.removeEventListener('click', closeOnClick); } };
  setTimeout(() => document.addEventListener('click', closeOnClick), 100);

  // Search profiles
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(5);

  // Search posts
  const { data: posts } = await sb
    .from('posts')
    .select('id, content, created_at, author_id, profiles(username, display_name, avatar_url)')
    .ilike('content', `%${query}%`)
    .limit(5);

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

  // Wire up click handlers (no inline event handlers — avoids XSS)
  overlay.querySelectorAll('.search-result-item[data-uid]').forEach(item => {
    item.addEventListener('click', () => {
      overlay.remove();
      renderProfile($('#main'), item.dataset.uid);
    });
  });
  overlay.querySelectorAll('.search-result-item[data-pid]').forEach(item => {
    item.addEventListener('click', () => {
      overlay.remove();
      // Navigate to feed and open the post thread
      navigateTo('feed');
    });
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
    { id: 'feed',          icon: '🏠', label: 'Home' },
    { id: 'explore',       icon: '🔭', label: 'Explore' },
    { id: 'notifications', icon: '🔔', label: 'Notifications', badge: State.unreadNotifs },
    { id: 'messages',      icon: '💬', label: 'Messages', badge: State.unreadMessages },
    { id: 'profile',       icon: '👤', label: 'Profile' },
    { id: 'bookmarks',     icon: '🔖', label: 'Bookmarks' },
    { id: 'settings',      icon: '⚙️', label: 'Settings' },
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
        btn.textContent = '✓';
        btn.style.opacity = '0.5';
        // Update follow counts using rpc (requires increment function in Supabase)
        await sb.rpc('increment_followers', { target_user_id: uid });
        await sb.rpc('increment_following', { target_user_id: State.user.id });
        // Notify
        await sb.from('notifications').insert({ user_id: uid, actor_id: State.user.id, type: 'follow' });
        toast('Followed!', '👤');
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
// Track view-specific subs separately from global ones
const GlobalSubs = []; // presence channel, etc.

function navigateTo(view) {
  State.currentView = view;
  showPresence();
  updateSidebarActive();
  const main = $('#main');
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
    </div>
    <div class="composer" id="composer-area"></div>
    <div id="feed"><div style="padding:32px;text-align:center;color:var(--text-muted)">Loading posts…</div></div>
  `;

  $$('.view-tab[data-tab]', main).forEach(tab => {
    tab.addEventListener('click', () => {
      State.feedTab = tab.dataset.tab;
      $$('.view-tab', main).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadPosts($('#feed'));
    });
  });

  buildComposer($('#composer-area'));
  loadPosts($('#feed'));
  subscribeToNewPosts($('#feed'));
}

async function loadPosts(container) {
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div>`;

  let query = sb
    .from('posts')
    .select(`
      id, content, code_block, code_lang, likes_count, comments_count, reposts_count, created_at,
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
        toast(`@${profile.username} just posted`, '📢');
      }
    })
    .subscribe();

  State.realtimeSubs.push(channel);
}

/* ── Composer ───────────────────────────────────────────────── */
function buildComposer(container) {
  const profile = State.profile;
  container.innerHTML = `
    <div class="composer-inner">
      <div class="composer-row">
        <div class="composer-avatar">${avatarHtml(profile, 38)}</div>
        <textarea class="composer-textarea" id="post-textarea" placeholder="What are you building today?" rows="2"></textarea>
      </div>
      <pre class="composer-code-block" id="composer-code" spellcheck="false" contenteditable="false"></pre>
      <div class="composer-toolbar">
        <button class="composer-tool" id="add-code-btn" title="Add code block">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="composer-tool" title="Add image" id="composer-img-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
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
  let codeLang = 'js';

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

  submitBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';

    const postData = {
      author_id: State.user.id,
      content: text,
    };
    if (hasCode && codeBlock.textContent.trim() !== '// Your code here') {
      postData.code_block = codeBlock.textContent.trim();
      postData.code_lang = codeLang;
    }

    const { error } = await sb.from('posts').insert(postData);
    if (error) {
      toast('Failed to post: ' + error.message, '❌');
    } else {
      // Refresh feed
      const feed = $('#feed');
      if (feed) loadPosts(feed);
      textarea.value = '';
      charCount.textContent = '280';
      submitBtn.textContent = 'Post';
      codeBlock.textContent = '';
      codeBlock.classList.remove('visible');
      hasCode = false;
      addCodeBtn.style.color = '';
      toast('Posted! 🚀', '🚀');
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
  if (post.code_block) {
    contentHtml += `<pre class="post-code"><span class="post-code-lang">${post.code_lang || ''}</span>${escapeHtml(post.code_block)}</pre>`;
  }

  card.innerHTML = `
    <div class="post-header">
      <div class="post-avatar" style="background:${color}">${avatarInitials(profile?.display_name || profile?.username || '?')}</div>
      <div class="post-meta">
        <div class="post-author">
          ${profile?.display_name || profile?.username || 'Unknown'}
          <span class="post-author-handle">@${profile?.username || '?'}</span>
        </div>
        <div class="post-time">${timeAgo(post.created_at)}</div>
      </div>
      ${post.author_id === State.user.id ? `<button class="post-delete-btn" data-pid="${post.id}" title="Delete post" style="margin-left:auto;color:var(--text-muted);font-size:14px;padding:4px 8px;border-radius:6px;transition:color 0.15s">✕</button>` : ''}
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
      toast('Saved to bookmarks', '🔖');
    } else {
      await sb.from('bookmarks').delete().eq('post_id', post.id).eq('user_id', State.user.id);
      toast('Removed from bookmarks', '');
    }
  });

  // Comment
  $('.comment-btn', card).addEventListener('click', e => { e.stopPropagation(); openPostThread(post, profile); });

  // Share
  $('.share-btn', card).addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard?.writeText(window.location.origin + '/post/' + post.id).then(() => toast('Link copied!', '🔗'));
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
        toast('Post deleted', '🗑️');
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
          toast('Left community', '👋');
        } else {
          await sb.from('community_members').insert({ community_id: cid, user_id: State.user.id });
          btn.classList.add('joined');
          btn.textContent = '✓ Joined';
          toast('Joined! 🎉', '🌍');
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
      await sb.from('follows').insert({ follower_id: State.user.id, following_id: uid });
      btn.textContent = '✓ Following';
      btn.style.opacity = '0.6';
      toast('Followed!', '👤');
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
    <button class="join-btn ${isJoined ? 'joined' : ''}" data-cid="${c.id}">${isJoined ? '✓ Joined' : 'Join'}</button>
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
    if (!name) { toast('Enter a community name', '⚠️'); return; }

    const btn = $('#create-comm-btn');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    const { data: community, error } = await sb.from('communities').insert({
      name, description: desc, icon: selectedIcon, color: selectedColor,
      owner_id: State.user.id, members_count: 1
    }).select().single();

    if (error) {
      toast('Failed: ' + error.message, '❌');
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
          <span>＋</span> Add channel
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
      toast('Joined! 🎉', '🌍');
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
        if (!name) { toast('Enter a channel name', '⚠️'); return; }
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

  // Subscribe to new notifications
  const sub = sb
    .channel(`notifs_${State.user.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${State.user.id}` }, () => {
      State.unreadNotifs++;
      updateBadges();
      loadNotifications();
    })
    .subscribe();
  State.realtimeSubs.push(sub);
}

async function loadNotifications() {
  const container = $('#notif-list');
  if (!container) return;

  const { data: notifs } = await sb
    .from('notifications')
    .select('id, type, read, created_at, post_id, profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)')
    .eq('user_id', State.user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!notifs?.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No notifications yet 🔕</div>`;
    return;
  }

  const iconMap = { like: '❤️', follow: '👤', comment: '💬', mention: '@' };
  const textMap = {
    like: actor => `<strong>${actor}</strong> liked your post`,
    follow: actor => `<strong>${actor}</strong> started following you`,
    comment: actor => `<strong>${actor}</strong> commented on your post`,
    mention: actor => `<strong>${actor}</strong> mentioned you`,
  };

  container.innerHTML = notifs.map(n => {
    const actor = n.profiles?.display_name || n.profiles?.username || 'Someone';
    const color = avatarColor(actor);
    return `<div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.id}">
      <div style="position:relative;flex-shrink:0">
        <div class="notif-avatar" style="background:${color}">${avatarInitials(actor)}</div>
        <div class="notif-icon notif-${n.type}">${iconMap[n.type] || '🔔'}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="notif-text">${(textMap[n.type] || (() => 'New notification'))(actor)}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>`;
  }).join('');

  $$('.notif-item', container).forEach(item => {
    item.addEventListener('click', async () => {
      item.classList.remove('unread');
      await sb.from('notifications').update({ read: true }).eq('id', item.dataset.nid);
      State.unreadNotifs = Math.max(0, State.unreadNotifs - 1);
      updateBadges();
    });
  });
}

/* ── Messages / DMs ─────────────────────────────────────────── */
async function renderMessages(main) {
  main.innerHTML = `
    <div class="messages-layout">
      <div class="conversations-list">
        <div class="conversations-header">
          Messages
          <button id="new-dm-btn" style="color:var(--cyan);font-size:18px;font-weight:700" title="New message">＋</button>
        </div>
        <div id="conversations-container">
          <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Loading…</div>
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

  container.innerHTML = `
    <div class="dm-header">
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

  // Subscribe to new messages in this convo
  const sub = sb
    .channel(`dm_${convoId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convoId}` }, payload => {
      const msg = payload.new;
      if (msg.sender_id === State.user.id) return;
      msgList.appendChild(buildDMMessage(msg, other, color));
      msgList.scrollTop = msgList.scrollHeight;
    })
    .subscribe();
  State.realtimeSubs.push(sub);

  // Send
  async function sendDM() {
    const input = $('#dm-input', container);
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const { data: msg } = await sb.from('messages').insert({
      conversation_id: convoId,
      sender_id: State.user.id,
      content: text
    }).select().single();

    if (msg) {
      msgList.appendChild(buildDMMessage(msg, other, color, true));
      msgList.scrollTop = msgList.scrollHeight;
      // Update convo preview
      await sb.from('conversations').update({ last_message: text, last_message_at: msg.created_at }).eq('id', convoId);
    }
  }

  $('#dm-send-btn', container).addEventListener('click', sendDM);
  $('#dm-input', container).addEventListener('keydown', e => { if (e.key === 'Enter') sendDM(); });
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
    <div class="profile-cover">
      <div class="profile-cover-art" style="background:linear-gradient(135deg,${color}22,var(--bg-void))"></div>
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
          <button class="profile-action-btn secondary" id="share-profile-btn">🔗</button>
        </div>
      </div>
      <div class="profile-name">${safeName}</div>
      <div class="profile-handle">@${safeHandle} ${State.onlineUsers.has(targetId) ? '<span style="color:var(--emerald);font-size:12px">● Online</span>' : ''}</div>
      <div class="profile-bio">${safeBio}</div>
      <div class="profile-meta">
        ${safeLocation ? `<div class="profile-meta-item">📍 <span>${safeLocation}</span></div>` : ''}
        ${safeWebsite ? `<div class="profile-meta-item">🔗 <a href="${safeWebsite}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan)">${safeWebsite}</a></div>` : ''}
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
        ${['Posts','Replies'].map((t,i) => `<div class="profile-tab ${i===0?'active':''}" data-ptab="${t}">${t}</div>`).join('')}
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
        toast('Unfollowed', '');
      } else {
        await sb.from('follows').insert({ follower_id: State.user.id, following_id: targetId });
        await sb.rpc('increment_followers', { target_user_id: targetId });
        await sb.rpc('increment_following', { target_user_id: State.user.id });
        await sb.from('notifications').insert({ user_id: targetId, actor_id: State.user.id, type: 'follow' });
        followState = true;
        followBtn.textContent = 'Unfollow';
        followBtn.className = 'profile-action-btn secondary';
        toast('Followed!', '👤');
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

  // Share profile button
  const shareProfileBtn = $('#share-profile-btn', main);
  if (shareProfileBtn) {
    shareProfileBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(window.location.href).then(() => toast('Link copied!', '🔗'));
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
    .select('id, content, code_block, code_lang, likes_count, comments_count, reposts_count, created_at, profiles!posts_author_id_fkey(id, username, display_name, avatar_url)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  if (!posts?.length) { container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">No posts yet</div>`; return; }

  const postIds = posts.map(p => p.id);
  const { data: likes } = await sb.from('post_likes').select('post_id').eq('user_id', State.user.id).in('post_id', postIds);
  const likedIds = new Set((likes || []).map(l => l.post_id));

  container.innerHTML = '';
  posts.forEach(p => container.appendChild(buildPostCard(p, p.profiles, likedIds.has(p.id), false)));
}

function openProfileEditModal(profile) {
  const modal = $('#modal-overlay');
  const body  = $('#modal-body');
  $('#modal-title-text').textContent = 'Edit Profile';
  modal.classList.add('open');

  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
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

  $('#save-profile-btn').addEventListener('click', async () => {
    const btn = $('#save-profile-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const statusEl = $('#edit-status');
    statusEl.style.display = 'block';
    statusEl.textContent = 'Saving…';

    const tech_stack = $('#edit-tech').value.split(',').map(t => t.trim()).filter(Boolean);
    const { error } = await sb.from('profiles').update({
      display_name: $('#edit-display-name').value.trim(),
      username: $('#edit-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      bio: $('#edit-bio').value.trim(),
      location: $('#edit-location').value.trim(),
      website: $('#edit-website').value.trim(),
      tech_stack,
    }).eq('id', State.user.id);

    if (error) {
      statusEl.style.color = 'var(--rose)';
      statusEl.textContent = 'Failed: ' + error.message;
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    } else {
      // Refresh profile
      const { data: updated } = await sb.from('profiles').select('*').eq('id', State.user.id).single();
      State.profile = updated;
      modal.classList.remove('open');
      toast('Profile updated! ✨', '✏️');
      navigateTo('profile');
    }
  });
}

/* ── Bookmarks ──────────────────────────────────────────────── */
async function renderBookmarks(main) {
  main.innerHTML = `
    <div class="view-tabs"><div class="view-tab active" style="cursor:default">Bookmarks</div></div>
    <div id="bookmarks-list"><div style="padding:32px;text-align:center;color:var(--text-muted)">Loading…</div></div>
  `;

  const { data: bookmarks } = await sb
    .from('bookmarks')
    .select('post_id, posts(id, content, code_block, code_lang, likes_count, comments_count, created_at, profiles!posts_author_id_fkey(id, username, display_name, avatar_url))')
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
    const { error } = await sb.auth.resetPasswordForEmail(State.user.email, { redirectTo: window.DEVIT_CONFIG.SITE_URL });
    if (!error) toast('Password reset email sent! ✉️', '✉️');
    else toast('Error: ' + error.message, '❌');
  });
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
