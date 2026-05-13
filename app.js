/* ============================================================
   CYANET — Create. Collaborate. Launch.
   app.js  —  Supabase Auth + Realtime + PostgreSQL
   ============================================================ */
'use strict';

/* ── Supabase Client ────────────────────────────────────────── */
const { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } = window.CYANET_CONFIG;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
  realtime: { params: { eventsPerSecond: 20 } },
});

/* ── App State ──────────────────────────────────────────────── */
const State = {
  session: null, user: null, profile: null,
  currentView: 'feed', currentCommunity: null, currentChannel: null,
  feedTab: 'for-you',
  subs: { feed: null, channel: null, dm: null, notifications: null, presence: null },
  cache: { profiles: new Map(), posts: [] },
  onlineUsers: new Map(),
  unreadNotifs: 0, unreadDMs: 0,
};

/* ── Helpers ────────────────────────────────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const fmtNum  = n => n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n||0);
const fmtTime = iso => { if (!iso) return ''; const d=new Date(iso),now=new Date(),diff=(now-d)/1000; if(diff<60)return 'just now'; if(diff<3600)return Math.floor(diff/60)+'m ago'; if(diff<86400)return Math.floor(diff/3600)+'h ago'; return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); };
const initials = name => (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
const randomColor = str => { const cols=['#63d9ff','#a78bfa','#f472b6','#34d399','#fbbf24','#f97316','#38bdf8','#fb7185']; let h=0; for(const c of(str||'x'))h=c.charCodeAt(0)+((h<<5)-h); return cols[Math.abs(h)%cols.length]; };
const esc = str => { if(!str)return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };

function toast(msg, icon='✅') {
  const c=$('#toast-container'); if(!c)return;
  const t=el('div','toast',`<span class="toast-icon">${icon}</span><span>${msg}</span>`);
  c.appendChild(t);
  setTimeout(()=>{t.classList.add('exit');setTimeout(()=>t.remove(),300);},3500);
}
function showPresence() {
  const b=$('#presence-bar'); if(!b)return;
  b.classList.add('loading');
  setTimeout(()=>{b.classList.remove('loading');b.classList.add('done');setTimeout(()=>b.classList.remove('done'),400);},600);
}
function setAuthStatus(msg, isError=false) {
  const el=$('#auth-status'); if(!el)return;
  el.style.display='block'; el.style.color=isError?'var(--rose)':'var(--emerald)'; el.textContent=msg;
}
async function getProfile(id) {
  if(!id)return null;
  if(State.cache.profiles.has(id))return State.cache.profiles.get(id);
  const{data}=await supabase.from('profiles').select('*').eq('id',id).single();
  if(data)State.cache.profiles.set(id,data);
  return data;
}
function avatarEl(profile, size=40) {
  const bg = profile?.avatar_url ? 'transparent' : randomColor(profile?.id);
  const inner = profile?.avatar_url
    ? `<img src="${esc(profile.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
    : initials(profile?.display_name || profile?.username);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.floor(size*0.35)}px;color:var(--bg-void);flex-shrink:0;overflow:hidden">${inner}</div>`;
}

/* ════════════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════════════ */
async function initAuth() {
  // Show config warning if keys not set
  if (SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    const card=$('.auth-card');
    if(card){
      const w=el('div','','<div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--amber);line-height:1.5">⚠️ <strong>Setup required:</strong> Open <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:4px">index.html</code> and replace <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:4px">YOUR_PROJECT_ID</code> and <code style="background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:4px">YOUR_ANON_KEY_HERE</code> with your Supabase project values.<br><br>Find them at: <strong>supabase.com/dashboard → Settings → API</strong></div>');
      card.insertBefore(w,card.firstChild);
    }
  }

  const{data:{session}}=await supabase.auth.getSession();
  if(session){ await onSessionReady(session); return; }

  supabase.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_IN'&&session) await onSessionReady(session);
    else if(event==='SIGNED_OUT') onSignedOut();
    else if(event==='TOKEN_REFRESHED'&&session) State.session=session;
  });

  wireAuthButtons();
}

function wireAuthButtons() {
  $('#github-login-btn')?.addEventListener('click',async()=>{
    const btn=$('#github-login-btn'); btn.textContent='Redirecting to GitHub…'; btn.disabled=true;
    const{error}=await supabase.auth.signInWithOAuth({provider:'github',options:{redirectTo:SITE_URL,scopes:'read:user user:email'}});
    if(error){setAuthStatus('GitHub login failed: '+error.message,true);btn.innerHTML='<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--bg-void)"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>Continue with GitHub';btn.disabled=false;}
  });

  $('#login-btn')?.addEventListener('click',async()=>{
    const email=$('#auth-email')?.value?.trim(), pass=$('#auth-password')?.value;
    if(!email||!pass){setAuthStatus('Enter email and password',true);return;}
    const btn=$('#login-btn'); btn.textContent='Signing in…'; btn.disabled=true;
    const{error}=await supabase.auth.signInWithPassword({email,password:pass});
    btn.textContent='Sign In'; btn.disabled=false;
    if(error)setAuthStatus(error.message,true);
  });

  $('#signup-btn')?.addEventListener('click',async()=>{
    const email=$('#auth-email')?.value?.trim(), pass=$('#auth-password')?.value;
    if(!email||!pass){setAuthStatus('Enter email and password',true);return;}
    if(pass.length<6){setAuthStatus('Password must be at least 6 characters',true);return;}
    const btn=$('#signup-btn'); btn.textContent='Creating account…'; btn.disabled=true;
    const{error}=await supabase.auth.signUp({email,password:pass,options:{emailRedirectTo:SITE_URL}});
    btn.textContent='Sign Up'; btn.disabled=false;
    if(error)setAuthStatus(error.message,true);
    else setAuthStatus('Check your email to confirm your account ✉️');
  });

  $('#magic-link-btn')?.addEventListener('click',async()=>{
    const email=$('#auth-email')?.value?.trim();
    if(!email){setAuthStatus('Enter your email first',true);return;}
    const btn=$('#magic-link-btn'); btn.textContent='Sending…'; btn.disabled=true;
    const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:SITE_URL}});
    btn.textContent='Send Magic Link instead'; btn.disabled=false;
    if(error)setAuthStatus(error.message,true);
    else setAuthStatus('Magic link sent! Check your email ✨');
  });
}

async function onSessionReady(session) {
  State.session=session; State.user=session.user;
  let{data:profile}=await supabase.from('profiles').select('*').eq('id',session.user.id).single();
  if(!profile){
    const meta=session.user.user_metadata||{};
    let username=meta.user_name||meta.preferred_username||session.user.email?.split('@')[0]||'user';
    const{data:exists}=await supabase.from('profiles').select('id').eq('username',username).single();
    if(exists)username+=Math.floor(Math.random()*999);
    const{data:np}=await supabase.from('profiles').insert({id:session.user.id,username,display_name:meta.full_name||meta.name||username,avatar_url:meta.avatar_url||null,github_login:meta.user_name||null,github_url:meta.user_name?`https://github.com/${meta.user_name}`:null}).select().single();
    profile=np;
  }
  State.profile=profile; State.cache.profiles.set(session.user.id,profile);
  const as=$('#auth-screen');
  as.style.cssText='opacity:0;transform:scale(1.02);transition:0.4s ease';
  setTimeout(()=>{as.style.display='none';$('#app').classList.add('visible');buildApp();toast(`Welcome, ${(profile.display_name||profile.username||'').split(' ')[0]}! 👋`,'🚀');},400);
}

function onSignedOut(){
  Object.values(State.subs).forEach(s=>{if(s)supabase.removeChannel(s);});
  State.session=null;State.profile=null;location.reload();
}
async function signOut(){toast('Signing out…','👋');await supabase.auth.signOut();}

/* ════════════════════════════════════════════════════════════
   APP SHELL
════════════════════════════════════════════════════════════ */
function buildApp(){
  buildTopbar(); buildSidebar(); buildRightbar();
  navigateTo('feed'); startPresenceChannel();
  subscribeNotifications(); initKeyboardShortcuts();
  setTimeout(showOnboardingTip,2500);
}

/* ── Topbar ─────────────────────────────────────────────────── */
function buildTopbar(){
  const p=State.profile;
  $('#topbar').innerHTML=`
    <div class="topbar-logo"><div class="topbar-logo-mark">C</div><span>Cyanet</span></div>
    <div class="topbar-search">
      <span class="topbar-search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>
      <input type="text" id="search-input" placeholder="Search Cyanet… (⌘K)">
    </div>
    <div class="topbar-actions">
      <button class="topbar-action-btn" id="nav-notifs" title="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="badge" id="notif-badge" style="display:none"></span>
      </button>
      <button class="topbar-action-btn" id="nav-messages-btn" title="Messages">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="badge" id="dm-badge" style="display:none"></span>
      </button>
      <button class="topbar-action-btn" id="new-post-btn" title="New post (N)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </button>
      <div class="topbar-avatar" id="tb-avatar" title="@${esc(p?.username)}">${avatarEl(p,32)}</div>
    </div>`;
  $('#nav-notifs')?.addEventListener('click',()=>navigateTo('notifications'));
  $('#nav-messages-btn')?.addEventListener('click',()=>navigateTo('messages'));
  $('#new-post-btn')?.addEventListener('click',openNewPostModal);
  $('#tb-avatar')?.addEventListener('click',()=>navigateTo('profile'));
  $('#search-input')?.addEventListener('focus',()=>{$('#search-input').blur();buildSearchOverlay();});
}

/* ── Sidebar ────────────────────────────────────────────────── */
async function buildSidebar(){
  const sb=$('#sidebar'); if(!sb)return;
  const links=[
    {id:'feed',icon:'🏠',label:'Home'},
    {id:'explore',icon:'🔭',label:'Explore'},
    {id:'notifications',icon:'🔔',label:'Notifications',badge:'sb-notif'},
    {id:'messages',icon:'💬',label:'Messages',badge:'sb-dm'},
    {id:'collabs',icon:'🤝',label:'Collaborations'},
    {id:'profile',icon:'👤',label:'Profile'},
    {id:'bookmarks',icon:'🔖',label:'Bookmarks'},
  ];
  let html=`<div class="sidebar-section-label">Navigate</div>`;
  links.forEach(l=>{html+=`<div class="sidebar-link${l.id===State.currentView?' active':''}" data-nav="${l.id}">
    <span class="icon">${l.icon}</span><span>${l.label}</span>
    ${l.badge?`<span class="badge-count" id="${l.badge}-badge" style="display:none">0</span>`:''}
  </div>`;});

  // Joined communities
  html+=`<div class="sidebar-divider"></div>
  <div class="sidebar-communities-header"><span>Communities</span><button id="create-comm-btn" title="Create">＋</button></div>`;
  const{data:memberships}=await supabase.from('memberships').select('community_id,communities(*)').eq('user_id',State.profile.id).limit(8);
  (memberships||[]).forEach(m=>{
    const c=m.communities; if(!c)return;
    html+=`<div class="sidebar-community" data-cid="${c.id}">
      <div class="sidebar-community-icon" style="background:${c.bg_color||'rgba(99,217,255,0.1)'};color:${c.color||'#63d9ff'}">${c.icon||'🌐'}</div>
      <span class="sidebar-community-name">${esc(c.name)}</span>
      <span class="sidebar-community-dot"></span>
    </div>`;
  });

  html+=`<div class="sidebar-divider"></div>
  <div class="sidebar-bottom">
    <div class="sidebar-link" id="sb-settings"><span class="icon">⚙️</span><span>Settings</span></div>
    <div class="sidebar-link" id="sb-signout"><span class="icon">🚪</span><span>Sign Out</span></div>
  </div>`;

  sb.innerHTML=html;
  $$('.sidebar-link[data-nav]',sb).forEach(l=>l.addEventListener('click',()=>navigateTo(l.dataset.nav)));
  $$('.sidebar-community[data-cid]',sb).forEach(i=>i.addEventListener('click',()=>openCommunity(i.dataset.cid)));
  $('#create-comm-btn')?.addEventListener('click',openCreateCommunityModal);
  $('#sb-signout')?.addEventListener('click',signOut);
  $('#sb-settings')?.addEventListener('click',()=>navigateTo('settings'));
}

function updateSidebarActive(){$$('.sidebar-link[data-nav]').forEach(l=>l.classList.toggle('active',l.dataset.nav===State.currentView));}

/* ── Rightbar ───────────────────────────────────────────────── */
async function buildRightbar(){
  const rb=$('#rightbar'); if(!rb)return;
  rb.innerHTML=`
    <div class="widget">
      <div class="widget-header">Trending <a href="#" onclick="return false">See all</a></div>
      <div id="rb-trending"></div>
    </div>
    <div class="widget">
      <div class="widget-header">Who to follow <a href="#" onclick="return false">See all</a></div>
      <div id="rb-who"></div>
    </div>
    <div class="widget">
      <div class="widget-header">Your Stats <span class="live-badge"><div class="live-dot"></div>LIVE</span></div>
      <div class="stats-grid">
        <div class="stat-cell"><div class="stat-cell-value text-cyan" id="stat-followers">${fmtNum(State.profile?.follower_count||0)}</div><div class="stat-cell-label">Followers</div><div class="stat-cell-delta up">↑ this week</div></div>
        <div class="stat-cell"><div class="stat-cell-value" style="color:var(--violet)" id="stat-posts">${fmtNum(State.profile?.post_count||0)}</div><div class="stat-cell-label">Posts</div></div>
      </div>
      <div style="padding:10px 14px 12px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Activity — last 16 weeks</div><div class="contrib-weeks" id="contrib-graph"></div></div>
    </div>`;
  buildContribGraph();
  loadRightbarPeople();
  loadTrending();
}

async function loadRightbarPeople(){
  const{data}=await supabase.from('profiles').select('id,username,display_name,avatar_url,follower_count').neq('id',State.profile.id).order('follower_count',{ascending:false}).limit(4);
  const c=$('#rb-who'); if(!c)return;
  if(!data?.length){c.innerHTML='<div style="padding:14px;font-size:13px;color:var(--text-muted)">No suggestions</div>';return;}
  c.innerHTML=data.map(u=>`<div class="who-item">
    ${avatarEl(u,38)}
    <div class="who-info"><div class="who-name">${esc(u.display_name||u.username)}</div><div class="who-handle">@${esc(u.username)}</div></div>
    <button class="follow-btn" data-uid="${u.id}">Follow</button>
  </div>`).join('');
  $$('.follow-btn',c).forEach(btn=>btn.addEventListener('click',()=>toggleFollow(btn.dataset.uid,btn)));
}

function loadTrending(){
  const trends=[{tag:'#RustLang',count:'12.4K',label:'Trending in Systems'},{tag:'#React19',count:'8.1K',label:'Trending in Frontend'},{tag:'#Supabase',count:'5.2K',label:'Trending in Backend'},{tag:'#OpenSource',count:'21K',label:'Trending globally'},{tag:'#TypeScript',count:'9.3K',label:'Trending in JS'}];
  const c=$('#rb-trending'); if(!c)return;
  c.innerHTML=trends.map(t=>`<div class="trending-item" style="cursor:pointer" onclick="window.cyanet.toast('${t.tag} feed coming soon','📈')">
    <div class="trending-label">${t.label}</div><div class="trending-tag">${t.tag}</div><div class="trending-count">${t.count} posts</div>
  </div>`).join('');
}

function buildContribGraph(){
  const g=$('#contrib-graph'); if(!g)return; g.innerHTML='';
  for(let w=0;w<16;w++){const wk=el('div');wk.style.cssText='display:flex;flex-direction:column;gap:2px';for(let d=0;d<7;d++){const dy=el('div','contrib-day');const r=Math.random();dy.setAttribute('data-level',r<0.35?0:r<0.6?1:r<0.8?2:r<0.93?3:4);wk.appendChild(dy);}g.appendChild(wk);}
}

/* ── Navigation ─────────────────────────────────────────────── */
function navigateTo(view){
  if(State.subs.feed){supabase.removeChannel(State.subs.feed);State.subs.feed=null;}
  if(State.subs.channel){supabase.removeChannel(State.subs.channel);State.subs.channel=null;}
  State.currentView=view; showPresence(); updateSidebarActive();
  const main=$('#main'); main.innerHTML='';
  const views={feed:renderFeed,explore:renderExplore,notifications:renderNotifications,messages:renderMessages,profile:renderProfile,bookmarks:renderBookmarks,collabs:renderCollabs,settings:renderSettings};
  (views[view]||renderFeed)(main);
}

/* ════════════════════════════════════════════════════════════
   FEED
════════════════════════════════════════════════════════════ */
function renderFeed(main){
  main.innerHTML=`
    <div class="view-tabs">
      <div class="view-tab ${State.feedTab==='for-you'?'active':''}" data-tab="for-you">For You</div>
      <div class="view-tab ${State.feedTab==='following'?'active':''}" data-tab="following">Following</div>
      <div class="view-tab ${State.feedTab==='trending'?'active':''}" data-tab="trending">Trending</div>
    </div>
    <div class="stories-bar" id="stories-bar"></div>
    <div id="composer-wrap"></div>
    <div id="feed-list"></div>`;
  $$('.view-tab[data-tab]',main).forEach(tab=>tab.addEventListener('click',()=>{
    State.feedTab=tab.dataset.tab;
    $$('.view-tab',main).forEach(t=>t.classList.remove('active'));
    tab.classList.add('active'); loadFeedPosts();
  }));
  buildStories($('#stories-bar')); buildComposer($('#composer-wrap')); loadFeedPosts(); subscribeFeedRealtime();
}

async function loadFeedPosts(){
  const container=$('#feed-list'); if(!container)return;
  container.innerHTML=`<div style="padding:32px 16px;display:flex;flex-direction:column;gap:12px">${Array(4).fill('<div style="display:flex;gap:10px"><div class="skeleton" style="width:40px;height:40px;border-radius:50%;flex-shrink:0"></div><div style="flex:1"><div class="skeleton" style="height:13px;width:40%;margin-bottom:8px"></div><div class="skeleton" style="height:13px;width:90%;margin-bottom:6px"></div><div class="skeleton" style="height:13px;width:70%"></div></div></div>').join('')}</div>`;

  let baseQ=supabase.from('posts').select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').is('parent_id',null).order('created_at',{ascending:false}).limit(30);

  if(State.feedTab==='following'){
    const{data:follows}=await supabase.from('follows').select('following_id').eq('follower_id',State.profile.id);
    const ids=(follows||[]).map(f=>f.following_id); ids.push(State.profile.id);
    if(ids.length===1){container.innerHTML=`<div style="padding:60px 20px;text-align:center;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:10px">👥</div><div style="font-weight:600;margin-bottom:4px">Follow someone first</div><div style="font-size:13px">Head to Explore to find developers</div></div>`;return;}
    baseQ=baseQ.in('author_id',ids);
  }

  const{data:posts,error}=await baseQ;
  if(error){container.innerHTML=`<div style="padding:20px;color:var(--rose);font-size:13px">Error: ${esc(error.message)}</div>`;return;}
  if(!posts?.length){container.innerHTML=`<div style="padding:60px 20px;text-align:center;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:10px">✍️</div><div style="font-weight:600">No posts yet</div><div style="font-size:13px;margin-top:4px">Be the first to share something!</div></div>`;return;}

  // Fetch user likes + bookmarks in parallel
  const postIds=posts.map(p=>p.id);
  const[{data:likes},{data:bmarks}]=await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id',State.profile.id).in('post_id',postIds),
    supabase.from('bookmarks').select('post_id').eq('user_id',State.profile.id).in('post_id',postIds),
  ]);
  const likedSet=new Set((likes||[]).map(l=>l.post_id));
  const bmarkSet=new Set((bmarks||[]).map(b=>b.post_id));
  State.cache.posts=posts.map(p=>({...p,liked:likedSet.has(p.id),bookmarked:bmarkSet.has(p.id)}));

  container.innerHTML='';
  State.cache.posts.forEach(post=>container.appendChild(buildPostCard(post)));
}

function subscribeFeedRealtime(){
  State.subs.feed=supabase.channel('feed:new-posts')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'posts',filter:'parent_id=is.null'},async payload=>{
      if(payload.new.author_id===State.profile.id)return;
      const author=await getProfile(payload.new.author_id);
      const enriched={...payload.new,author,liked:false,bookmarked:false};
      State.cache.posts.unshift(enriched);
      const c=$('#feed-list'); if(!c)return;
      const card=buildPostCard(enriched);
      card.style.animation='cardIn 0.4s var(--spring)';
      c.insertBefore(card,c.firstChild);
      toast(`${author?.display_name||author?.username||'Someone'} just posted`,'🆕');
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'posts'},payload=>{
      const u=payload.new;
      const card=$(`[data-post-id="${u.id}"]`);
      if(!card)return;
      const lc=card.querySelector('.like-count'); if(lc)lc.textContent=fmtNum(u.like_count);
      const rc=card.querySelector('.repost-count'); if(rc)rc.textContent=fmtNum(u.repost_count);
    })
    .subscribe();
}

/* ── Composer ───────────────────────────────────────────────── */
function buildComposer(container){
  container.innerHTML=`<div class="composer"><div class="composer-inner">
    <div class="composer-row">
      ${avatarEl(State.profile,36)}
      <textarea class="composer-textarea" id="post-ta" placeholder="What are you building today?" rows="2"></textarea>
    </div>
    <pre class="composer-code-block" id="comp-code" contenteditable="false"></pre>
    <div class="composer-toolbar">
      <button class="composer-tool" id="comp-code-btn" title="Add code">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button>
      <button class="composer-tool" title="Image (soon)" onclick="window.cyanet.toast('Image upload coming soon!','📷')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </button>
      <div class="composer-actions">
        <span class="char-count" id="comp-chars">280</span>
        <button class="post-btn" id="comp-submit" disabled>Post</button>
      </div>
    </div>
  </div></div>`;

  const ta=$('#post-ta'),charEl=$('#comp-chars'),submitBtn=$('#comp-submit'),codeBlock=$('#comp-code'),codeBtn=$('#comp-code-btn');
  let hasCode=false;
  ta.addEventListener('input',()=>{const l=280-ta.value.length;charEl.textContent=l;charEl.style.color=l<20?'var(--rose)':l<60?'var(--amber)':'var(--text-muted)';submitBtn.disabled=!ta.value.trim();});
  codeBtn.addEventListener('click',()=>{hasCode=!hasCode;codeBlock.classList.toggle('visible',hasCode);codeBlock.contentEditable=hasCode?'true':'false';if(hasCode){codeBlock.textContent='// paste code here';codeBlock.focus();}codeBtn.style.color=hasCode?'var(--cyan)':'';});
  submitBtn.addEventListener('click',async()=>{
    const content=ta.value.trim(); if(!content)return;
    const code=hasCode?codeBlock.textContent.trim():null;
    submitBtn.disabled=true;submitBtn.textContent='Posting…';
    const{data:newPost,error}=await supabase.from('posts').insert({author_id:State.profile.id,content,code:code||null}).select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').single();
    submitBtn.disabled=false;submitBtn.textContent='Post';
    if(error){toast('Post failed: '+error.message,'❌');return;}
    ta.value='';codeBlock.textContent='';codeBlock.classList.remove('visible');hasCode=false;codeBtn.style.color='';charEl.textContent='280';
    const enriched={...newPost,liked:false,bookmarked:false};
    State.cache.posts.unshift(enriched);
    const fl=$('#feed-list');
    if(fl){const card=buildPostCard(enriched);card.style.animation='cardIn 0.4s var(--spring)';fl.insertBefore(card,fl.firstChild);}
    toast('Posted! 🚀','✅');
  });
}

/* ── Post Card ──────────────────────────────────────────────── */
function buildPostCard(post){
  const author=post.author||{};
  const card=el('div','post-card'); card.dataset.postId=post.id;
  let contentHtml=`<div class="post-content">${esc(post.content).replace(/#(\w+)/g,'<span class="hashtag">#$1</span>').replace(/@(\w+)/g,'<span class="mention">@$1</span>')}</div>`;
  if(post.code)contentHtml+=`<pre class="post-code"><span class="post-code-lang">${esc(post.code_lang||'')}</span>${esc(post.code)}</pre>`;
  if(post.image_url)contentHtml+=`<div class="post-image"><img src="${esc(post.image_url)}" style="width:100%;height:100%;object-fit:cover" loading="lazy"></div>`;
  if(post.repo_name)contentHtml+=`<div class="post-repo-card"><div class="post-repo-header"><span class="post-repo-icon">⚙️</span><span class="post-repo-name">${esc(post.repo_name)}</span></div>${post.repo_desc?`<div class="post-repo-desc">${esc(post.repo_desc)}</div>`:''}<div class="post-repo-meta"><span class="post-repo-stat">${post.repo_lang||''}</span><span class="post-repo-stat">⭐ ${fmtNum(post.repo_stars||0)}</span><span class="post-repo-stat">🍴 ${post.repo_forks||0}</span></div></div>`;

  card.innerHTML=`
    <div class="post-header">
      ${avatarEl(author,40)}
      <div class="post-meta">
        <div class="post-author">${esc(author.display_name||author.username||'Unknown')} <span class="post-author-handle">@${esc(author.username||'')}</span></div>
        <div class="post-time">${fmtTime(post.created_at)}</div>
      </div>
    </div>
    ${contentHtml}
    <div class="post-actions">
      <button class="post-action comment-btn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${fmtNum(post.reply_count||0)}</button>
      <button class="post-action repost-btn ${post.reposted?'reposted':''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><span class="repost-count">${fmtNum(post.repost_count||0)}</span></button>
      <button class="post-action like-btn ${post.liked?'liked':''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="${post.liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="like-count">${fmtNum(post.like_count||0)}</span></button>
      <button class="post-action bookmark-btn ${post.bookmarked?'bookmarked':''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="${post.bookmarked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>
      <button class="post-action" style="margin-left:auto" onclick="window.cyanet.toast('Link copied!','🔗')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>
    </div>`;

  $('.like-btn',card).addEventListener('click',e=>{e.stopPropagation();toggleLike(post,card);});
  $('.bookmark-btn',card).addEventListener('click',e=>{e.stopPropagation();toggleBookmark(post,card);});
  $('.comment-btn',card).addEventListener('click',e=>{e.stopPropagation();openPostThread(post);});
  $('.repost-btn',card).addEventListener('click',e=>{e.stopPropagation();toast('Repost coming soon!','🔁');});
  card.addEventListener('click',e=>{if(e.target.closest('.post-action')||e.target.closest('.post-repo-card'))return;openPostThread(post);});
  return card;
}

/* ── Like / Bookmark ────────────────────────────────────────── */
async function toggleLike(post,card){
  const btn=$('.like-btn',card),lc=$('.like-count',card),was=post.liked;
  post.liked=!was; post.like_count=Math.max(0,(post.like_count||0)+(post.liked?1:-1));
  btn.classList.toggle('liked',post.liked); btn.querySelector('svg').setAttribute('fill',post.liked?'currentColor':'none'); lc.textContent=fmtNum(post.like_count);
  if(post.liked){btn.style.transform='scale(1.3)';setTimeout(()=>btn.style.transform='',200);}
  if(was){await supabase.from('likes').delete().match({user_id:State.profile.id,post_id:post.id});}
  else{await supabase.from('likes').insert({user_id:State.profile.id,post_id:post.id});}
}
async function toggleBookmark(post,card){
  const btn=$('.bookmark-btn',card),was=post.bookmarked;
  post.bookmarked=!was; btn.classList.toggle('bookmarked',post.bookmarked); btn.querySelector('svg').setAttribute('fill',post.bookmarked?'currentColor':'none');
  toast(post.bookmarked?'Saved to bookmarks 🔖':'Removed from bookmarks',post.bookmarked?'🔖':'');
  if(was){await supabase.from('bookmarks').delete().match({user_id:State.profile.id,post_id:post.id});}
  else{await supabase.from('bookmarks').insert({user_id:State.profile.id,post_id:post.id});}
}

/* ── Follow ─────────────────────────────────────────────────── */
async function toggleFollow(targetId,btn){
  const target=await getProfile(targetId); const isFollowing=btn.classList.contains('following');
  btn.classList.toggle('following',!isFollowing); btn.textContent=isFollowing?'Follow':'Following';
  if(isFollowing){await supabase.from('follows').delete().match({follower_id:State.profile.id,following_id:targetId});toast(`Unfollowed @${target?.username}`,'👋');}
  else{await supabase.from('follows').insert({follower_id:State.profile.id,following_id:targetId});toast(`Following @${target?.username} 🎉`,'✅');}
}

/* ── Stories ────────────────────────────────────────────────── */
const STORIES=[{un:'zaraosei',color:'#f472b6',av:'🦋',bg:'linear-gradient(135deg,#1a0a18,#0a1628)',emoji:'🚀',text:'Just shipped v2.0 of my design system — 47 components, dark mode, a11y tested! 🎉',time:'2h ago'},{un:'kenjimura',color:'#f97316',av:'🦊',bg:'linear-gradient(135deg,#1a0a0a,#0a1628)',emoji:'⚡',text:'Zero-copy serialization: 4ms → 0.3ms. Rust is built different.',time:'5h ago'},{un:'priyacodes',color:'#06b6d4',av:'🌊',bg:'linear-gradient(135deg,#0a1a0a,#0a0a1f)',emoji:'🧠',text:'New fine-tuned 7B model is LIVE on HuggingFace. Try it!',time:'8h ago'},{un:'lucasf',color:'#a78bfa',av:'⚡',bg:'linear-gradient(135deg,#1a1a0a,#0a0a1a)',emoji:'🐳',text:'K8s cluster: 12 microservices, 90 days zero downtime.',time:'1d ago'},{un:'mia_chen_ui',color:'#34d399',av:'🎨',bg:'linear-gradient(135deg,#0a1a10,#1a0a18)',emoji:'🎨',text:'CSS subgrid changes EVERYTHING. Cards that actually align!',time:'1d ago'}];
let storyOpen=false,storyIdx=0,storyTimer=null;
function buildStories(c){
  c.innerHTML=`<div class="story-item" id="add-story"><button class="story-add-btn">＋</button><span class="story-label">Add story</span></div>`+STORIES.map((s,i)=>`<div class="story-item" data-si="${i}"><div class="story-ring ${i>1?'seen':''}"><div class="story-avatar" style="background:${s.color}">${s.av}</div></div><span class="story-label">${s.un}</span></div>`).join('');
  $('#add-story')?.addEventListener('click',()=>toast('Story creation coming soon!','📸'));
  $$('.story-item[data-si]',c).forEach(i=>i.addEventListener('click',()=>openStory(parseInt(i.dataset.si))));
}
function openStory(i){if(storyOpen)return;storyOpen=true;storyIdx=i;const ov=el('div','story-modal-overlay');ov.id='story-ov';document.body.appendChild(ov);requestAnimationFrame(()=>{ov.classList.add('open');renderStory(ov);});ov.addEventListener('click',e=>{if(e.target===ov)closeStory(ov);});}
function renderStory(ov){
  const s=STORIES[storyIdx%STORIES.length];
  ov.innerHTML=`<div class="story-modal">
    <div class="story-progress-bars">${STORIES.map((_,i)=>`<div class="story-progress-bar"><div class="story-progress-fill${i===storyIdx?' active':''}" style="width:${i<storyIdx?'100':'0'}%"></div></div>`).join('')}</div>
    <div class="story-header-overlay">
      <div class="story-user-avatar" style="background:${s.color}">${s.av}</div>
      <div class="story-user-info"><div class="story-user-name">${s.un}</div><div class="story-user-time">${s.time}</div></div>
      <button class="story-close-btn" id="sc-btn">✕</button>
    </div>
    <div class="story-content" style="background:${s.bg}">
      <span style="font-size:72px;filter:drop-shadow(0 0 20px rgba(255,255,255,0.3))">${s.emoji}</span>
      <div class="story-text-overlay">${s.text}</div>
    </div>
    <div style="position:absolute;bottom:14px;left:14px;right:14px;display:flex;gap:8px;align-items:center">
      <input class="story-reply-input" placeholder="Reply to ${s.un}…">
      <span style="cursor:pointer;font-size:22px" onclick="window.cyanet.toast('Reacted ❤️','❤️')">❤️</span>
      <span style="cursor:pointer;font-size:22px" onclick="window.cyanet.toast('Reacted 🔥','🔥')">🔥</span>
    </div>
  </div>`;
  const fill=ov.querySelectorAll('.story-progress-fill')[storyIdx];
  if(fill)requestAnimationFrame(()=>fill.style.width='100%');
  storyTimer=setTimeout(()=>{storyIdx<STORIES.length-1?((storyIdx++),renderStory(ov)):closeStory(ov);},5000);
  ov.querySelector('.story-modal').addEventListener('click',e=>{
    clearTimeout(storyTimer);const r=e.currentTarget.getBoundingClientRect();
    if(e.clientX-r.left<r.width/2&&storyIdx>0)storyIdx--;
    else if(e.clientX-r.left>=r.width/2&&storyIdx<STORIES.length-1)storyIdx++;
    renderStory(ov);
  });
  $('#sc-btn',ov)?.addEventListener('click',()=>closeStory(ov));
}
function closeStory(ov){clearTimeout(storyTimer);storyOpen=false;ov.classList.remove('open');setTimeout(()=>ov.remove(),200);}

/* ════════════════════════════════════════════════════════════
   EXPLORE
════════════════════════════════════════════════════════════ */
async function renderExplore(main){
  main.innerHTML=`<div class="explore-header"><h2>Explore</h2><p>Discover communities and developers</p></div>
    <div class="explore-categories">${['All','Frontend','Backend','Systems','ML/AI','DevOps','Design','OSS'].map((c,i)=>`<div class="explore-cat ${i===0?'active':''}">${c}</div>`).join('')}</div>
    <div style="padding:14px 16px 6px;font-family:var(--font-display);font-size:16px;font-weight:800">Communities</div>
    <div class="communities-grid" id="explore-grid"><div style="padding:14px;color:var(--text-muted);font-size:13px;grid-column:1/-1">Loading communities…</div></div>`;

  $$('.explore-cat',main).forEach(cat=>cat.addEventListener('click',()=>{$$('.explore-cat',main).forEach(c=>c.classList.remove('active'));cat.classList.add('active');}));

  const[{data:communities},{data:myMemberships}]=await Promise.all([
    supabase.from('communities').select('*').eq('is_public',true).order('member_count',{ascending:false}).limit(12),
    supabase.from('memberships').select('community_id').eq('user_id',State.profile.id),
  ]);
  const joinedSet=new Set((myMemberships||[]).map(m=>m.community_id));
  const grid=$('#explore-grid'); if(!grid)return;
  if(!communities?.length){grid.innerHTML='<div style="padding:20px;color:var(--text-muted);font-size:13px;grid-column:1/-1">No communities yet. <button style="color:var(--cyan);font-weight:600" onclick="window.cyanet.openCreateCommunityModal()">Create the first!</button></div>';return;}
  grid.innerHTML=communities.map(c=>`<div class="community-card" data-cid="${c.id}">
    <div class="community-card-icon" style="background:${c.bg_color||'rgba(99,217,255,0.1)'};color:${c.color||'#63d9ff'}">${c.icon||'🌐'}</div>
    <div class="community-card-name">${esc(c.name)}</div>
    <div class="community-card-desc">${esc(c.description||'')}</div>
    <div class="community-card-meta"><span class="community-card-members">👥 ${fmtNum(c.member_count||0)}</span><span class="community-card-online">online</span></div>
    <button class="join-btn ${joinedSet.has(c.id)?'joined':''}" data-cid="${c.id}">${joinedSet.has(c.id)?'✓ Joined':'Join'}</button>
  </div>`).join('');

  $$('.join-btn',grid).forEach(btn=>btn.addEventListener('click',async e=>{
    e.stopPropagation();const cid=btn.dataset.cid,c=communities.find(x=>x.id===cid),joined=btn.classList.contains('joined');
    if(joined){await supabase.from('memberships').delete().match({user_id:State.profile.id,community_id:cid});btn.classList.remove('joined');btn.textContent='Join';toast(`Left ${c.name}`,'👋');}
    else{await supabase.from('memberships').insert({user_id:State.profile.id,community_id:cid});btn.classList.add('joined');btn.textContent='✓ Joined';toast(`Joined ${c.name}! 🎉`,'🌍');}
    buildSidebar();
  }));
  $$('.community-card',grid).forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('.join-btn'))return;openCommunity(card.dataset.cid);}));
}

/* ════════════════════════════════════════════════════════════
   COMMUNITIES + CHANNELS
════════════════════════════════════════════════════════════ */
async function openCommunity(communityId){
  State.currentView='community'; showPresence(); updateSidebarActive();
  if(State.subs.channel){supabase.removeChannel(State.subs.channel);State.subs.channel=null;}
  const main=$('#main'); main.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading…</div>';
  const[{data:community},{data:channels}]=await Promise.all([
    supabase.from('communities').select('*').eq('id',communityId).single(),
    supabase.from('channels').select('*').eq('community_id',communityId).order('position'),
  ]);
  if(!community){main.innerHTML='<div style="padding:20px;color:var(--rose)">Community not found</div>';return;}
  State.currentCommunity={...community,channels:channels||[]};
  const firstText=(channels||[]).find(c=>c.type!=='voice')||(channels||[])[0];
  main.innerHTML='';
  const view=el('div','community-view'); view.innerHTML=`
    <div class="community-sidebar">
      <div class="community-header">
        <div style="font-size:24px;margin-bottom:4px">${esc(community.icon||'🌐')}</div>
        <div class="community-header-name">${esc(community.name)}</div>
        <div class="community-header-members">👥 ${fmtNum(community.member_count||0)} members</div>
      </div>
      <div class="channel-category">Text Channels</div>
      ${(channels||[]).filter(ch=>ch.type!=='voice').map(ch=>`<div class="channel-item ${ch.id===firstText?.id?'active':''}" data-chid="${ch.id}" data-chtype="text"><span class="channel-icon">#</span>${esc(ch.name)}</div>`).join('')}
      <div class="channel-category" style="margin-top:8px">Voice Channels</div>
      ${(channels||[]).filter(ch=>ch.type==='voice').map(ch=>`<div class="channel-item" data-chid="${ch.id}" data-chtype="voice"><span class="channel-icon">🔊</span>${esc(ch.name)}</div>`).join('')}
    </div>
    <div class="community-chat" id="ch-chat"></div>
    <div class="community-members-panel">
      <div class="members-section-label">Online Now</div>
      <div id="presence-list"></div>
      <div class="members-section-label" style="margin-top:8px">Members</div>
      <div id="members-list"><div style="font-size:12px;color:var(--text-muted);padding:4px 6px">Loading…</div></div>
    </div>`;
  main.appendChild(view);

  $$('.channel-item[data-chid]',view).forEach(item=>item.addEventListener('click',()=>{
    $$('.channel-item',view).forEach(c=>c.classList.remove('active'));item.classList.add('active');
    const ch=(channels||[]).find(c=>c.id===item.dataset.chid);if(!ch)return;
    item.dataset.chtype==='voice'?renderVoiceChannel($('#ch-chat'),ch,community):loadChannelMessages($('#ch-chat'),ch,community);
  }));

  if(firstText)loadChannelMessages($('#ch-chat'),firstText,community);
  updatePresencePanel();
  loadCommunityMembers(communityId);
}

async function loadCommunityMembers(communityId){
  const{data}=await supabase.from('memberships').select('profiles(id,username,display_name,avatar_url)').eq('community_id',communityId).limit(20);
  const c=$('#members-list'); if(!c)return;
  c.innerHTML=(data||[]).map(m=>{const p=m.profiles;if(!p)return'';return`<div class="member-item">${avatarEl(p,30)}<span class="member-name" style="font-size:13px;color:var(--text-secondary)">${esc(p.display_name||p.username)}</span></div>`;}).join('');
}

async function loadChannelMessages(container,channel,community){
  if(State.subs.channel){supabase.removeChannel(State.subs.channel);State.subs.channel=null;}
  State.currentChannel=channel;
  container.innerHTML=`
    <div class="community-chat-header">
      <span style="color:var(--text-muted)">#</span><h3>${esc(channel.name)}</h3>
      <span style="font-size:12px;color:var(--text-muted)">${esc(channel.description||community.name)}</span>
    </div>
    <div class="chat-messages" id="ch-msgs"><div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">Loading…</div></div>
    <div id="typing-row" style="height:18px;padding:0 16px 2px;font-size:12px;color:var(--text-muted);font-style:italic"></div>
    <div class="chat-input-area"><div class="chat-input-wrap">
      <input class="chat-input" id="ch-input" type="text" placeholder="Message #${esc(channel.name)}">
      <button class="chat-send-btn" id="ch-send">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div></div>`;

  const{data:messages}=await supabase.from('messages').select('*,author:profiles!messages_author_id_fkey(id,username,display_name,avatar_url)').eq('channel_id',channel.id).order('created_at',{ascending:true}).limit(50);
  const msgList=$('#ch-msgs'); msgList.innerHTML='';
  if(!messages?.length){msgList.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:13px">No messages yet. Say hello! 👋</div>';}
  else{let prev=null;messages.forEach(m=>{msgList.appendChild(buildChatMsg(m,prev?.author_id===m.author_id));prev=m;});msgList.scrollTop=msgList.scrollHeight;}

  // Realtime subscription for channel
  State.subs.channel=supabase.channel(`ch:${channel.id}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`channel_id=eq.${channel.id}`},async p=>{
      if(p.new.author_id===State.profile.id)return;
      const author=await getProfile(p.new.author_id);
      const ml=$('#ch-msgs'); if(!ml)return;
      const noMsg=ml.querySelector('[style*="No messages"]'); if(noMsg)noMsg.remove();
      ml.appendChild(buildChatMsg({...p.new,author},false)); ml.scrollTop=ml.scrollHeight;
    })
    .on('broadcast',{event:'typing'},p=>{
      if(p.payload.uid===State.profile.id)return;
      const tr=$('#typing-row'); if(!tr)return;
      tr.textContent=`${p.payload.name} is typing…`;
      clearTimeout(tr._t);tr._t=setTimeout(()=>{if(tr)tr.textContent='';},3000);
    })
    .subscribe();

  const input=$('#ch-input'),sendBtn=$('#ch-send');
  async function send(){
    const text=input.value.trim(); if(!text)return; input.value='';
    const optMsg={id:'opt_'+Date.now(),channel_id:channel.id,author_id:State.profile.id,content:text,created_at:new Date().toISOString(),author:State.profile};
    const ml=$('#ch-msgs'); const noMsg=ml?.querySelector('[style*="No messages"]'); if(noMsg)noMsg.remove();
    if(ml){ml.appendChild(buildChatMsg(optMsg,false));ml.scrollTop=ml.scrollHeight;}
    await supabase.from('messages').insert({channel_id:channel.id,author_id:State.profile.id,content:text});
  }
  sendBtn?.addEventListener('click',send);
  input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();send();}});
  input?.addEventListener('input',()=>{State.subs.channel?.send({type:'broadcast',event:'typing',payload:{uid:State.profile.id,name:State.profile.display_name||State.profile.username}});});
}

function buildChatMsg(msg,isCont){
  const a=msg.author||{};
  const msgEl=el('div',`msg ${isCont?'is-continuation':''}`);
  msgEl.innerHTML=`${avatarEl(a,36)}<div class="msg-body">${!isCont?`<div class="msg-header"><span class="msg-author" style="color:${msg.author_id===State.profile.id?'var(--cyan)':randomColor(a.id)}">${esc(a.display_name||a.username||'Unknown')}</span><span class="msg-time">${fmtTime(msg.created_at)}</span></div>`:''}<div class="msg-text">${esc(msg.content)}</div></div>`;
  return msgEl;
}

/* ── Voice Channel ──────────────────────────────────────────── */
function renderVoiceChannel(container,channel,community){
  container.innerHTML=`
    <div class="community-chat-header"><span style="font-size:18px">🔊</span><h3>${esc(channel.name)}</h3><div class="live-badge" style="margin-left:auto"><div class="live-dot"></div>LIVE</div></div>
    <div class="voice-channel-view">
      <div class="voice-room-title">🔊 ${esc(channel.name)} <span style="font-size:13px;color:var(--text-muted);font-weight:400">${State.onlineUsers.size+1} in call</span></div>
      <div class="voice-participants" id="vc-participants"></div>
      <div class="voice-controls">
        <button class="voice-ctrl-btn active" id="vc-mic">🎙️</button>
        <button class="voice-ctrl-btn" id="vc-vid">📹</button>
        <button class="voice-ctrl-btn" id="vc-scr">🖥️</button>
        <button class="voice-ctrl-btn" id="vc-deaf">🔇</button>
        <button class="voice-ctrl-btn danger" id="vc-leave">📞</button>
      </div>
      <div style="font-size:12px;color:var(--text-muted)">Connected · <span id="vc-time">00:00</span></div>
    </div>`;
  const grid=$('#vc-participants');
  const all=[State.profile,...Array.from(State.onlineUsers.values()).slice(0,4)];
  all.forEach((u,i)=>{const div=el('div','voice-participant');div.innerHTML=`<div class="voice-avatar-ring ${i===0?'speaking':''}" id="vring-${i}"><div class="voice-avatar" style="background:${randomColor(u.id||u.user_id)}">${initials(u.display_name||u.username)}</div></div><div class="voice-participant-name">${esc((u.display_name||u.username||'').split(' ')[0])}</div><div class="voice-participant-mic">${i===0?'🎙️':'🔇'}</div>`;grid.appendChild(div);});
  let si=0,sInterval=setInterval(()=>{$$('.voice-avatar-ring').forEach((r,i)=>r.classList.toggle('speaking',i===si));si=(si+1)%all.length;},3000);
  let secs=0,tInterval=setInterval(()=>{secs++;const m=String(Math.floor(secs/60)).padStart(2,'0'),s=String(secs%60).padStart(2,'0');const el=$('#vc-time');if(el)el.textContent=`${m}:${s}`;},1000);
  let micOn=true;
  $('#vc-mic')?.addEventListener('click',e=>{micOn=!micOn;e.currentTarget.textContent=micOn?'🎙️':'🔇';e.currentTarget.classList.toggle('active',micOn);});
  $('#vc-vid')?.addEventListener('click',e=>e.currentTarget.classList.toggle('active'));
  $('#vc-scr')?.addEventListener('click',e=>e.currentTarget.classList.toggle('active'));
  $('#vc-deaf')?.addEventListener('click',e=>e.currentTarget.classList.toggle('active'));
  $('#vc-leave')?.addEventListener('click',()=>{clearInterval(sInterval);clearInterval(tInterval);toast('Left voice channel','👋');const ft=State.currentCommunity?.channels?.find(c=>c.type!=='voice');if(ft)loadChannelMessages(container,ft,State.currentCommunity);});
}

/* ════════════════════════════════════════════════════════════
   PRESENCE
════════════════════════════════════════════════════════════ */
function startPresenceChannel(){
  const ch=supabase.channel('cyanet:online',{config:{presence:{key:State.profile.id}}});
  ch.on('presence',{event:'sync'},()=>{const s=ch.presenceState();State.onlineUsers.clear();Object.values(s).flat().forEach(p=>{if(p.user_id!==State.profile.id)State.onlineUsers.set(p.user_id,p);});updatePresencePanel();})
    .on('presence',{event:'join'},({newPresences})=>{newPresences.forEach(p=>State.onlineUsers.set(p.user_id,p));updatePresencePanel();})
    .on('presence',{event:'leave'},({leftPresences})=>{leftPresences.forEach(p=>State.onlineUsers.delete(p.user_id));updatePresencePanel();})
    .subscribe(async status=>{if(status==='SUBSCRIBED')await ch.track({user_id:State.profile.id,username:State.profile.username,display_name:State.profile.display_name,avatar_url:State.profile.avatar_url,online_at:new Date().toISOString()});});
  State.subs.presence=ch;
}

function updatePresencePanel(){
  const panel=$('#presence-list'); if(!panel)return;
  const online=Array.from(State.onlineUsers.values());
  panel.innerHTML=online.length
    ? online.slice(0,10).map(u=>`<div class="member-item"><div class="member-avatar-wrap">${avatarEl({id:u.user_id,display_name:u.display_name,username:u.username,avatar_url:u.avatar_url},30)}<div class="member-status online"></div></div><span class="member-name" style="font-size:13px;color:var(--text-secondary)">${esc(u.display_name||u.username)}</span></div>`).join('')
    : '<div style="font-size:12px;color:var(--text-muted);padding:4px 6px">Just you right now</div>';
}

/* ════════════════════════════════════════════════════════════
   NOTIFICATIONS
════════════════════════════════════════════════════════════ */
async function subscribeNotifications(){
  const{count}=await supabase.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',State.profile.id).eq('read',false);
  State.unreadNotifs=count||0; updateNotifBadge();
  State.subs.notifications=supabase.channel(`notifs:${State.profile.id}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${State.profile.id}`},async p=>{
      State.unreadNotifs++; updateNotifBadge();
      const actor=await getProfile(p.new.actor_id);
      const icons={like:'❤️',follow:'👤',reply:'💬',repost:'🔁',mention:'📣'};
      const msgs={like:`${actor?.display_name||'Someone'} liked your post`,follow:`${actor?.display_name||'Someone'} followed you`,reply:`${actor?.display_name||'Someone'} replied to you`};
      toast(msgs[p.new.type]||'New notification',icons[p.new.type]||'🔔');
    }).subscribe();
}

function updateNotifBadge(){
  const b=$('#notif-badge'),sb=$('#sb-notif-badge');
  if(State.unreadNotifs>0){if(b)b.style.display='';if(sb){sb.style.display='';sb.textContent=State.unreadNotifs;}}
  else{if(b)b.style.display='none';if(sb)sb.style.display='none';}
}

async function renderNotifications(main){
  main.innerHTML=`<div class="view-tabs"><div class="view-tab active">All</div><div class="view-tab">Mentions</div></div><div id="notif-list"><div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div></div>`;
  const{data:notifs}=await supabase.from('notifications').select('*,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)').eq('user_id',State.profile.id).order('created_at',{ascending:false}).limit(40);
  await supabase.from('notifications').update({read:true}).eq('user_id',State.profile.id).eq('read',false);
  State.unreadNotifs=0; updateNotifBadge();
  const list=$('#notif-list'); if(!list)return;
  if(!notifs?.length){list.innerHTML='<div style="padding:60px;text-align:center;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:10px">🔔</div><div style="font-weight:600">No notifications yet</div></div>';return;}
  const icons={like:'❤️',follow:'👤',reply:'💬',repost:'🔁',mention:'📣'};
  const bgCls={like:'notif-like',follow:'notif-follow',reply:'notif-comment',repost:'notif-repo'};
  const msg=(n)=>{const nm=n.actor?.display_name||n.actor?.username||'Someone';return{like:`<strong>${nm}</strong> liked your post`,follow:`<strong>${nm}</strong> started following you`,reply:`<strong>${nm}</strong> replied to you`,repost:`<strong>${nm}</strong> reposted you`,mention:`<strong>${nm}</strong> mentioned you`}[n.type]||`<strong>${nm}</strong> interacted with you`;};
  list.innerHTML=notifs.map(n=>`<div class="notif-item ${n.read?'':'unread'}">
    <div style="position:relative;flex-shrink:0">${avatarEl(n.actor||{},40)}<div class="notif-icon ${bgCls[n.type]||''}">${icons[n.type]||'🔔'}</div></div>
    <div style="flex:1"><div class="notif-text">${msg(n)}</div><div class="notif-time">${fmtTime(n.created_at)}</div></div>
  </div>`).join('');
}

/* ════════════════════════════════════════════════════════════
   MESSAGES (DMs)
════════════════════════════════════════════════════════════ */
async function renderMessages(main){
  main.innerHTML=`<div class="messages-layout">
    <div class="conversations-list">
      <div class="conversations-header">Messages</div>
      <div id="convo-list"><div style="padding:14px;color:var(--text-muted);font-size:13px">Loading…</div></div>
    </div>
    <div class="dm-view" id="dm-view"><div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:var(--text-muted)"><div style="font-size:40px">💬</div><div style="font-weight:600">Select a conversation</div></div></div>
  </div>`;
  const{data:convos}=await supabase.from('conversations').select('*,ua:profiles!conversations_user_a_fkey(id,username,display_name,avatar_url),ub:profiles!conversations_user_b_fkey(id,username,display_name,avatar_url)').or(`user_a.eq.${State.profile.id},user_b.eq.${State.profile.id}`).order('last_message_at',{ascending:false});
  const list=$('#convo-list'); if(!list)return;
  if(!convos?.length){list.innerHTML='<div style="padding:20px 14px;font-size:13px;color:var(--text-muted)">No conversations yet</div>';return;}
  list.innerHTML=convos.map(c=>{const other=c.user_a===State.profile.id?c.ub:c.ua;const online=State.onlineUsers.has(other?.id);return`<div class="conversation-item" data-cid="${c.id}" data-uid="${other?.id}">
    <div class="conv-avatar" style="background:${randomColor(other?.id)};position:relative">${initials(other?.display_name||other?.username)}${online?'<div class="conv-online"></div>':''}
    </div>
    <div class="conv-info"><div class="conv-name">${esc(other?.display_name||other?.username||'Unknown')}<span class="conv-time">${fmtTime(c.last_message_at)}</span></div><div class="conv-preview">Click to open</div></div>
  </div>`;}).join('');
  $$('.conversation-item',list).forEach(item=>item.addEventListener('click',()=>{$$('.conversation-item',list).forEach(i=>i.classList.remove('active'));item.classList.add('active');openDM(item.dataset.cid,item.dataset.uid);}));
  const first=$('.conversation-item',list); if(first)first.click();
}

async function openDM(convoId,otherUserId){
  const dmView=$('#dm-view'); if(!dmView)return;
  if(State.subs.dm){supabase.removeChannel(State.subs.dm);State.subs.dm=null;}
  const other=await getProfile(otherUserId);
  const online=State.onlineUsers.has(otherUserId);
  dmView.innerHTML=`
    <div class="dm-header">
      ${avatarEl(other,36)}
      <div><div style="font-weight:700;font-size:14px">${esc(other?.display_name||other?.username||'Unknown')}</div><div style="font-size:11px;color:var(--${online?'emerald':'text-muted'})">${online?'● Online':'Offline'}</div></div>
    </div>
    <div class="dm-messages" id="dm-msgs"><div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">Loading…</div></div>
    <div class="chat-input-area"><div class="chat-input-wrap">
      <input class="chat-input" id="dm-input" type="text" placeholder="Message ${esc(other?.display_name||other?.username||'')}…">
      <button class="chat-send-btn" id="dm-send"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div></div>`;
  const{data:msgs}=await supabase.from('direct_messages').select('*').eq('conversation_id',convoId).order('created_at',{ascending:true}).limit(50);
  const ml=$('#dm-msgs'); ml.innerHTML='';
  if(!msgs?.length){ml.innerHTML='<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:40px">Start the conversation! 👋</div>';}
  else{msgs.forEach(m=>ml.appendChild(buildDMMsg(m,other)));ml.scrollTop=ml.scrollHeight;}
  State.subs.dm=supabase.channel(`dm:${convoId}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages',filter:`conversation_id=eq.${convoId}`},p=>{
      if(p.new.sender_id===State.profile.id)return;
      const mlist=$('#dm-msgs'); const noMsg=mlist?.querySelector('[style*="Start the"]'); if(noMsg)noMsg.remove();
      if(mlist){mlist.appendChild(buildDMMsg(p.new,other));mlist.scrollTop=mlist.scrollHeight;}
    }).subscribe();
  async function sendDM(){
    const text=$('#dm-input')?.value?.trim(); if(!text)return; $('#dm-input').value='';
    const opt={id:'opt_'+Date.now(),sender_id:State.profile.id,content:text,created_at:new Date().toISOString()};
    const mlist=$('#dm-msgs'); const noMsg=mlist?.querySelector('[style*="Start the"]'); if(noMsg)noMsg.remove();
    if(mlist){mlist.appendChild(buildDMMsg(opt,other));mlist.scrollTop=mlist.scrollHeight;}
    await supabase.from('direct_messages').insert({conversation_id:convoId,sender_id:State.profile.id,content:text});
    await supabase.from('conversations').update({last_message_at:new Date().toISOString()}).eq('id',convoId);
  }
  $('#dm-send')?.addEventListener('click',sendDM);
  $('#dm-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendDM();});
}

function buildDMMsg(msg,other){
  const isOwn=msg.sender_id===State.profile.id;
  const div=el('div',`msg ${isOwn?'dm-own':'dm-other'}`);
  if(isOwn){div.innerHTML=`<div class="msg-body" style="align-items:flex-end;display:flex;flex-direction:column"><div class="msg-text" style="background:linear-gradient(135deg,var(--cyan),var(--violet));color:var(--bg-void);padding:8px 12px;border-radius:16px 16px 4px 16px;font-weight:500">${esc(msg.content)}</div><span style="font-size:10px;color:var(--text-muted);margin-top:2px">${fmtTime(msg.created_at)}</span></div>`;}
  else{div.innerHTML=`${avatarEl(other,36)}<div class="msg-body"><div class="msg-text" style="background:var(--bg-elevated);padding:8px 12px;border-radius:16px 16px 16px 4px">${esc(msg.content)}</div><span style="font-size:10px;color:var(--text-muted);margin-top:2px">${fmtTime(msg.created_at)}</span></div>`;}
  return div;
}

/* ════════════════════════════════════════════════════════════
   PROFILE
════════════════════════════════════════════════════════════ */
async function renderProfile(main,targetId){
  const uid=targetId||State.profile.id;
  const profile=uid===State.profile.id?State.profile:await getProfile(uid);
  const isOwn=uid===State.profile.id;
  let isFollowing=false;
  if(!isOwn){const{data}=await supabase.from('follows').select('id').match({follower_id:State.profile.id,following_id:uid}).single();isFollowing=!!data;}
  main.innerHTML=`
    <div class="profile-cover"><div class="profile-cover-art"></div></div>
    <div class="profile-info-section">
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div class="profile-avatar-wrap" style="margin-top:-36px;margin-bottom:10px;display:inline-block;position:relative">
          ${avatarEl(profile,80)}
          <div class="profile-online-dot"></div>
        </div>
        <div style="margin-bottom:10px;display:flex;gap:8px">
          ${isOwn?`<button class="profile-action-btn secondary" id="edit-prof-btn">Edit Profile</button>`:
          `<button class="profile-action-btn ${isFollowing?'secondary':'primary'}" id="follow-btn" data-uid="${uid}">${isFollowing?'Following':'Follow'}</button>
           <button class="profile-action-btn secondary" id="msg-btn">Message</button>`}
        </div>
      </div>
      <div class="profile-name">${esc(profile?.display_name||profile?.username||'Unknown')}</div>
      <div class="profile-handle">@${esc(profile?.username||'')}${isOwn?' <span style="color:var(--emerald);font-size:12px">● Online</span>':''}</div>
      <div class="profile-bio">${esc(profile?.bio||'No bio yet.')}</div>
      <div class="profile-meta">
        ${profile?.location?`<div class="profile-meta-item">📍 <span>${esc(profile.location)}</span></div>`:''}
        ${profile?.website?`<div class="profile-meta-item">🔗 <span style="color:var(--cyan)">${esc(profile.website)}</span></div>`:''}
        ${profile?.github_login?`<div class="profile-meta-item">⚙️ <span style="color:var(--cyan)">github.com/${esc(profile.github_login)}</span></div>`:''}
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${fmtNum(profile?.following_count||0)}</strong> <span>Following</span></div>
        <div class="profile-stat"><strong>${fmtNum(profile?.follower_count||0)}</strong> <span>Followers</span></div>
        <div class="profile-stat"><strong>${fmtNum(profile?.post_count||0)}</strong> <span>Posts</span></div>
      </div>
      ${profile?.tech_stack?.length?`<div class="tech-stack">${profile.tech_stack.map(t=>`<span class="tech-badge">${esc(t)}</span>`).join('')}</div>`:''}
    </div>
    <div class="profile-tabs"><div class="profile-tab-list">
      ${['Posts','Activity','Repos'].map((t,i)=>`<div class="profile-tab ${i===0?'active':''}" data-ptab="${t}">${t}</div>`).join('')}
    </div></div>
    <div id="prof-content"></div>`;

  $('#edit-prof-btn')?.addEventListener('click',openProfileEditModal);
  const fb=$('#follow-btn');
  if(fb)fb.addEventListener('click',async()=>{await toggleFollow(uid,fb);fb.classList.toggle('primary',!fb.classList.contains('following'));fb.classList.toggle('secondary',fb.classList.contains('following'));});
  $('#msg-btn')?.addEventListener('click',async()=>{
    const{data:existing}=await supabase.from('conversations').select('id').or(`and(user_a.eq.${State.profile.id},user_b.eq.${uid}),and(user_a.eq.${uid},user_b.eq.${State.profile.id})`).single();
    if(!existing){await supabase.from('conversations').insert({user_a:State.profile.id,user_b:uid});}
    navigateTo('messages');
  });
  $$('.profile-tab',main).forEach(tab=>tab.addEventListener('click',()=>{$$('.profile-tab',main).forEach(t=>t.classList.remove('active'));tab.classList.add('active');loadProfTab(tab.dataset.ptab,uid,$('#prof-content'));}));
  loadProfTab('Posts',uid,$('#prof-content'));
}

async function loadProfTab(tab,uid,container){
  if(!container)return;
  if(tab==='Posts'){
    container.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div>';
    const{data:posts}=await supabase.from('posts').select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').eq('author_id',uid).is('parent_id',null).order('created_at',{ascending:false}).limit(20);
    container.innerHTML='';
    if(!posts?.length){container.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted)">No posts yet</div>';return;}
    posts.forEach(p=>container.appendChild(buildPostCard({...p,liked:false,bookmarked:false})));
  } else if(tab==='Activity'){
    container.innerHTML='<div style="padding:20px 16px"><div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Contribution graph — last 6 months</div><div id="prof-graph" style="display:flex;gap:2px"></div></div>';
    const g=$('#prof-graph');if(!g)return;
    for(let w=0;w<26;w++){const wk=el('div');wk.style.cssText='display:flex;flex-direction:column;gap:2px';for(let d=0;d<7;d++){const dy=el('div','contrib-day');const r=Math.random();dy.setAttribute('data-level',r<0.3?0:r<0.55?1:r<0.75?2:r<0.9?3:4);wk.appendChild(dy);}g.appendChild(wk);}
  } else {
    container.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-muted)"><div style="font-size:32px;margin-bottom:10px">🔜</div>${tab} coming soon</div>`;
  }
}

/* ════════════════════════════════════════════════════════════
   BOOKMARKS
════════════════════════════════════════════════════════════ */
async function renderBookmarks(main){
  main.innerHTML='<div style="padding:20px 16px;border-bottom:1px solid var(--border)"><h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">Bookmarks</h2></div><div id="bmark-list"><div style="padding:20px;text-align:center;color:var(--text-muted)">Loading…</div></div>';
  const{data:bmarks}=await supabase.from('bookmarks').select('post:posts!bookmarks_post_id_fkey(*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url))').eq('user_id',State.profile.id).order('created_at',{ascending:false}).limit(30);
  const list=$('#bmark-list');if(!list)return;
  if(!bmarks?.length){list.innerHTML='<div style="padding:60px;text-align:center;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:10px">🔖</div><div style="font-weight:600">No bookmarks yet</div></div>';return;}
  list.innerHTML='';bmarks.forEach(b=>{if(b.post)list.appendChild(buildPostCard({...b.post,liked:false,bookmarked:true}));});
}

/* ════════════════════════════════════════════════════════════
   COLLABORATIONS
════════════════════════════════════════════════════════════ */
async function renderCollabs(main){
  State.currentView='collabs';updateSidebarActive();
  main.innerHTML=`<div style="padding:20px 16px 10px;display:flex;align-items:center;justify-content:space-between"><div><h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">Collaborations</h2><p style="font-size:13px;color:var(--text-muted)">Find open projects or post your own</p></div><button class="new-collab-btn" id="nc-btn">+ Post Project</button></div><div class="collabs-grid" id="collab-list"><div style="text-align:center;color:var(--text-muted);font-size:13px">Loading…</div></div>`;
  $('#nc-btn')?.addEventListener('click',openNewCollabModal);
  const{data:projects}=await supabase.from('projects').select('*,owner:profiles!projects_owner_id_fkey(id,username,display_name,avatar_url)').eq('status','active').order('created_at',{ascending:false}).limit(20);
  const list=$('#collab-list');if(!list)return;
  if(!projects?.length){list.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:10px">🤝</div><div style="font-weight:600;margin-bottom:8px">No projects yet</div><button class="post-btn" onclick="window.cyanet.openNewCollabModal()">Post the first project</button></div>';return;}
  list.innerHTML='';projects.forEach(p=>list.appendChild(buildCollabCard(p)));
  $$('.collab-apply-btn',list).forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toast('Apply flow coming soon! 🚀','🚀');}));
}

function buildCollabCard(proj){
  const owner=proj.owner||{};
  const div=el('div','collab-card');
  div.innerHTML=`<div class="collab-card-header">
    <div class="collab-card-icon" style="background:var(--bg-elevated)">${proj.icon||'🚀'}</div>
    <div><div class="collab-card-title">${esc(proj.title)}</div><div class="collab-card-author">by @${esc(owner.username||'unknown')}</div></div>
    ${proj.open_spots>0?`<span style="margin-left:auto;background:rgba(52,211,153,0.15);color:var(--emerald);padding:3px 8px;border-radius:var(--radius-full);font-size:11px;font-weight:700;white-space:nowrap">${proj.open_spots} spot${proj.open_spots>1?'s':''}</span>`:''}
  </div>
  <div class="collab-card-desc">${esc(proj.description||'')}</div>
  <div class="collab-tags">${(proj.tags||[]).map(t=>`<span class="collab-tag">${esc(t)}</span>`).join('')}</div>
  <div class="collab-footer"><button class="collab-apply-btn" data-pid="${proj.id}">Apply to Join</button></div>`;
  return div;
}

function openNewCollabModal(){
  const ov=$('#modal-overlay'),body=$('#modal-body');
  $('.modal-title').textContent='Post a Project';
  body.innerHTML=`<div class="edit-form-group"><label>Project Name</label><input type="text" class="edit-form-input" id="col-name" placeholder="e.g. Waveform Studio"></div>
    <div class="edit-form-group"><label>Description</label><textarea class="edit-form-textarea" id="col-desc" placeholder="What are you building and who are you looking for?"></textarea></div>
    <div class="edit-form-row">
      <div class="edit-form-group"><label>Tech Stack (comma-separated)</label><input type="text" class="edit-form-input" id="col-tags" placeholder="React, TypeScript"></div>
      <div class="edit-form-group"><label>Open Spots</label><input type="number" class="edit-form-input" id="col-spots" placeholder="2" min="1" max="10"></div>
    </div>
    <div class="edit-form-footer"><button class="edit-cancel-btn" id="col-cancel">Cancel</button><button class="edit-save-btn" id="col-submit">Post Project</button></div>`;
  ov.classList.add('open');
  $('#col-cancel')?.addEventListener('click',()=>ov.classList.remove('open'));
  $('#col-submit')?.addEventListener('click',async()=>{
    const name=$('#col-name')?.value?.trim();if(!name){toast('Name is required','⚠️');return;}
    const desc=$('#col-desc')?.value?.trim(),tags=($('#col-tags')?.value||'').split(',').map(t=>t.trim()).filter(Boolean),spots=parseInt($('#col-spots')?.value)||1;
    $('#col-submit').textContent='Posting…';$('#col-submit').disabled=true;
    const{error}=await supabase.from('projects').insert({owner_id:State.profile.id,title:name,description:desc,tags,open_spots:spots,icon:'🚀'});
    if(error){toast('Error: '+error.message,'❌');$('#col-submit').textContent='Post Project';$('#col-submit').disabled=false;return;}
    ov.classList.remove('open');renderCollabs($('#main'));toast(`"${name}" posted! 🚀`,'✅');
  });
}

/* ════════════════════════════════════════════════════════════
   POST THREAD
════════════════════════════════════════════════════════════ */
async function openPostThread(post){
  const main=$('#main');
  const author=post.author||await getProfile(post.author_id)||{};
  main.innerHTML=`
    <div class="thread-back-btn" id="thread-back">← Back to feed</div>
    <div style="padding:16px;border-bottom:1px solid var(--border)">
      <div class="post-header" style="margin-bottom:12px">${avatarEl(author,40)}<div class="post-meta"><div class="post-author">${esc(author.display_name||author.username||'Unknown')} <span class="post-author-handle">@${esc(author.username||'')}</span></div><div class="post-time">${fmtTime(post.created_at)}</div></div></div>
      <div style="font-size:18px;line-height:1.65;margin-bottom:12px">${esc(post.content).replace(/#(\w+)/g,'<span class="hashtag">#$1</span>').replace(/@(\w+)/g,'<span class="mention">@$1</span>')}</div>
      ${post.code?`<pre class="post-code">${esc(post.code)}</pre>`:''}
      <div style="display:flex;gap:16px;padding:12px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:12px">
        <div class="thread-stat"><strong>${fmtNum(post.repost_count||0)}</strong> <span style="color:var(--text-muted)">Reposts</span></div>
        <div class="thread-stat"><strong>${fmtNum(post.like_count||0)}</strong> <span style="color:var(--text-muted)">Likes</span></div>
        <div class="thread-stat"><strong>${fmtNum(post.reply_count||0)}</strong> <span style="color:var(--text-muted)">Replies</span></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        ${avatarEl(State.profile,36)}
        <input type="text" id="reply-input" placeholder="Post your reply…" style="flex:1;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-full);padding:9px 16px;color:var(--text-primary);font-size:14px;font-family:var(--font-body)">
        <button class="post-btn" id="reply-btn">Reply</button>
      </div>
    </div>
    <div id="thread-replies"><div style="padding:20px;text-align:center;color:var(--text-muted)">Loading replies…</div></div>`;

  $('#thread-back')?.addEventListener('click',()=>navigateTo('feed'));
  const{data:replies}=await supabase.from('posts').select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').eq('parent_id',post.id).order('created_at',{ascending:true}).limit(30);
  const rc=$('#thread-replies');if(!rc)return;
  rc.innerHTML='';
  if(!replies?.length){rc.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-muted)">No replies yet. Be the first!</div>';}
  else{replies.forEach(r=>rc.appendChild(buildPostCard({...r,liked:false,bookmarked:false})));}

  $('#reply-btn')?.addEventListener('click',async()=>{
    const text=$('#reply-input')?.value?.trim();if(!text)return;$('#reply-input').value='';
    const{data:reply,error}=await supabase.from('posts').insert({author_id:State.profile.id,content:text,parent_id:post.id}).select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').single();
    if(error){toast('Error: '+error.message,'❌');return;}
    const noR=rc.querySelector('[style*="No replies"]');if(noR)noR.remove();
    rc.appendChild(buildPostCard({...reply,liked:false,bookmarked:false}));toast('Reply posted!','💬');
  });
}

/* ════════════════════════════════════════════════════════════
   PROFILE EDIT
════════════════════════════════════════════════════════════ */
function openProfileEditModal(){
  const p=State.profile;const ov=$('#modal-overlay'),body=$('#modal-body');
  $('.modal-title').textContent='Edit Profile';
  body.innerHTML=`
    <div class="edit-avatar-section">${avatarEl(p,64)}<div class="edit-avatar-actions"><div style="font-size:12px;color:var(--text-muted)">Avatar synced from GitHub.<br>Update at github.com/settings/profile</div></div></div>
    <div class="edit-form-row">
      <div class="edit-form-group"><label>Display Name</label><input type="text" class="edit-form-input" id="ep-name" value="${esc(p?.display_name||'')}"></div>
      <div class="edit-form-group"><label>Username</label><input type="text" class="edit-form-input" id="ep-handle" value="${esc(p?.username||'')}"></div>
    </div>
    <div class="edit-form-group"><label>Bio</label><textarea class="edit-form-textarea" id="ep-bio">${esc(p?.bio||'')}</textarea></div>
    <div class="edit-form-row">
      <div class="edit-form-group"><label>Location</label><input type="text" class="edit-form-input" id="ep-loc" value="${esc(p?.location||'')}"></div>
      <div class="edit-form-group"><label>Website</label><input type="text" class="edit-form-input" id="ep-web" value="${esc(p?.website||'')}"></div>
    </div>
    <div class="edit-form-group"><label>Tech Stack (comma-separated)</label><input type="text" class="edit-form-input" id="ep-tech" value="${esc((p?.tech_stack||[]).join(', '))}"></div>
    <div class="edit-form-footer"><button class="edit-cancel-btn" id="ep-cancel">Cancel</button><button class="edit-save-btn" id="ep-save">Save Changes</button></div>`;
  ov.classList.add('open');
  $('#ep-cancel')?.addEventListener('click',()=>ov.classList.remove('open'));
  $('#ep-save')?.addEventListener('click',async()=>{
    const updates={display_name:$('#ep-name')?.value?.trim()||p?.display_name,username:$('#ep-handle')?.value?.trim()||p?.username,bio:$('#ep-bio')?.value?.trim(),location:$('#ep-loc')?.value?.trim(),website:$('#ep-web')?.value?.trim(),tech_stack:($('#ep-tech')?.value||'').split(',').map(t=>t.trim()).filter(Boolean),updated_at:new Date().toISOString()};
    $('#ep-save').textContent='Saving…';$('#ep-save').disabled=true;
    const{error}=await supabase.from('profiles').update(updates).eq('id',State.profile.id);
    if(error){toast('Error: '+error.message,'❌');$('#ep-save').textContent='Save Changes';$('#ep-save').disabled=false;return;}
    Object.assign(State.profile,updates);State.cache.profiles.set(State.profile.id,State.profile);
    ov.classList.remove('open');navigateTo('profile');toast('Profile updated! ✨','✅');
  });
}

/* ════════════════════════════════════════════════════════════
   CREATE COMMUNITY
════════════════════════════════════════════════════════════ */
function openCreateCommunityModal(){
  const ov=$('#modal-overlay'),body=$('#modal-body');
  $('.modal-title').textContent='Create Community';
  const ICONS=['🌐','🦀','⚛️','🧠','☁️','🎨','🌍','⚡','🔬','🎵','🚀','🗄️'];
  const COLORS=['#63d9ff','#a78bfa','#f472b6','#34d399','#fbbf24','#f97316','#38bdf8','#fb7185'];
  let selIcon=ICONS[0],selColor=COLORS[0];
  body.innerHTML=`
    <div class="edit-form-group"><label>Name</label><input type="text" class="edit-form-input" id="cc-name" placeholder="e.g. Rust & Systems"></div>
    <div class="edit-form-group"><label>Slug (URL-safe)</label><input type="text" class="edit-form-input" id="cc-slug" placeholder="rust-systems"></div>
    <div class="edit-form-group"><label>Description</label><textarea class="edit-form-textarea" id="cc-desc" placeholder="What is this community about?"></textarea></div>
    <div class="edit-form-row">
      <div class="edit-form-group"><label>Icon</label><div style="display:flex;gap:6px;flex-wrap:wrap">${ICONS.map((ic,i)=>`<button type="button" class="cc-ic" data-icon="${ic}" style="width:34px;height:34px;border-radius:8px;font-size:18px;border:2px solid ${i===0?'var(--cyan)':'var(--border)'};background:var(--bg-elevated);cursor:pointer">${ic}</button>`).join('')}</div></div>
      <div class="edit-form-group"><label>Color</label><div style="display:flex;gap:6px;flex-wrap:wrap">${COLORS.map((col,i)=>`<button type="button" class="cc-col" data-color="${col}" style="width:28px;height:28px;border-radius:50%;background:${col};border:2px solid ${i===0?'#fff':'transparent'};cursor:pointer"></button>`).join('')}</div></div>
    </div>
    <div class="edit-form-footer"><button class="edit-cancel-btn" id="cc-cancel">Cancel</button><button class="edit-save-btn" id="cc-submit">Create Community</button></div>`;
  ov.classList.add('open');
  $$('.cc-ic',body).forEach(b=>b.addEventListener('click',()=>{$$('.cc-ic',body).forEach(x=>x.style.borderColor='var(--border)');b.style.borderColor='var(--cyan)';selIcon=b.dataset.icon;}));
  $$('.cc-col',body).forEach(b=>b.addEventListener('click',()=>{$$('.cc-col',body).forEach(x=>x.style.borderColor='transparent');b.style.borderColor='#fff';selColor=b.dataset.color;}));
  const ni=$('#cc-name'),si=$('#cc-slug');
  ni?.addEventListener('input',()=>{si.value=ni.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');});
  $('#cc-cancel')?.addEventListener('click',()=>ov.classList.remove('open'));
  $('#cc-submit')?.addEventListener('click',async()=>{
    const name=ni?.value?.trim(),slug=si?.value?.trim(),desc=$('#cc-desc')?.value?.trim();
    if(!name||!slug){toast('Name and slug required','⚠️');return;}
    $('#cc-submit').textContent='Creating…';$('#cc-submit').disabled=true;
    const{data:comm,error}=await supabase.from('communities').insert({name,slug,description:desc,icon:selIcon,color:selColor,bg_color:selColor+'1a',owner_id:State.profile.id}).select().single();
    if(error){toast('Error: '+error.message,'❌');$('#cc-submit').textContent='Create Community';$('#cc-submit').disabled=false;return;}
    await Promise.all([
      supabase.from('memberships').insert({user_id:State.profile.id,community_id:comm.id,role:'admin'}),
      supabase.from('channels').insert([{community_id:comm.id,name:'general',type:'text',position:0},{community_id:comm.id,name:'showcase',type:'text',position:1},{community_id:comm.id,name:'lounge',type:'voice',position:2}]),
    ]);
    ov.classList.remove('open');await buildSidebar();openCommunity(comm.id);toast(`${name} created! 🎉`,'🌍');
  });
}

/* ════════════════════════════════════════════════════════════
   NEW POST MODAL
════════════════════════════════════════════════════════════ */
function openNewPostModal(){
  const ov=$('#modal-overlay'),body=$('#modal-body');
  $('.modal-title').textContent='New Post';
  body.innerHTML=`
    <div style="display:flex;gap:10px;margin-bottom:12px">${avatarEl(State.profile,36)}<textarea id="m-ta" class="composer-textarea" placeholder="What are you building today?" rows="4" style="min-height:100px"></textarea></div>
    <pre class="composer-code-block" id="m-code" contenteditable="false"></pre>
    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid var(--border)">
      <div style="display:flex;gap:6px"><button class="composer-tool" id="m-code-btn">💻</button><button class="composer-tool" onclick="window.cyanet.toast('Image upload coming soon!','📷')">📷</button></div>
      <div style="display:flex;align-items:center;gap:10px"><span id="m-chars" style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">280</span><button class="post-btn" id="m-submit" disabled>Post</button></div>
    </div>`;
  ov.classList.add('open');
  const ta=$('#m-ta'),pb=$('#m-submit'),ch=$('#m-chars'),cb=$('#m-code'),cBtn=$('#m-code-btn');let hc=false;
  ta?.addEventListener('input',()=>{const l=280-ta.value.length;ch.textContent=l;ch.style.color=l<20?'var(--rose)':l<60?'var(--amber)':'var(--text-muted)';pb.disabled=!ta.value.trim();});
  cBtn?.addEventListener('click',()=>{hc=!hc;cb.style.display=hc?'block':'none';cb.contentEditable=hc?'true':'false';if(hc){cb.textContent='// your code here';cb.focus();}cBtn.style.color=hc?'var(--cyan)':'';});
  pb?.addEventListener('click',async()=>{
    const content=ta?.value?.trim();if(!content)return;
    const code=hc?cb?.textContent?.trim():null;
    pb.disabled=true;pb.textContent='Posting…';
    const{error}=await supabase.from('posts').insert({author_id:State.profile.id,content,code:code||null});
    pb.disabled=false;pb.textContent='Post';
    if(error){toast('Error: '+error.message,'❌');return;}
    ov.classList.remove('open');
    if(State.currentView==='feed')loadFeedPosts();
    toast('Posted! 🚀','✅');
  });
  ta?.focus();
}

/* ════════════════════════════════════════════════════════════
   SETTINGS
════════════════════════════════════════════════════════════ */
function renderSettings(main){
  main.innerHTML=`<div style="padding:20px 16px;border-bottom:1px solid var(--border)"><h2 style="font-family:var(--font-display);font-size:22px;font-weight:800">Settings</h2></div>
    <div style="padding:16px;max-width:560px">
      ${[{section:'Account',items:['Edit Profile','Change Username','Email Preferences','Connected Accounts']},{section:'Privacy',items:['Who can message me','Block list','Two-factor Authentication','Download my data']},{section:'Developer',items:['API Keys','Webhook URLs','OAuth Applications']},{section:'Appearance',items:['Theme','Accent Color','Compact Mode']}]
        .map(s=>`<div style="margin-bottom:20px"><div style="font-family:var(--font-display);font-size:15px;font-weight:700;margin-bottom:10px">${s.section}</div><div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">${s.items.map((item,i,arr)=>`<div style="padding:13px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;${i<arr.length-1?'border-bottom:1px solid var(--border)':''};" onmouseenter="this.style.background='var(--bg-elevated)'" onmouseleave="this.style.background=''" onclick="${item==='Edit Profile'?'window.cyanet.openProfileEditModal()':`window.cyanet.toast('${item} coming soon','⚙️')`}"><span style="font-size:14px">${item}</span><span style="color:var(--text-muted)">›</span></div>`).join('')}</div></div>`).join('')}
      <div style="padding:16px;text-align:center"><button onclick="window.cyanet.signOut()" style="color:var(--rose);font-size:14px;font-weight:600">Sign Out</button></div>
    </div>`;
}

/* ════════════════════════════════════════════════════════════
   GLOBAL SEARCH
════════════════════════════════════════════════════════════ */
function buildSearchOverlay(){
  const existing=$('#search-overlay');if(existing){existing.remove();return;}
  const ov=el('div','search-overlay');ov.id='search-overlay';
  ov.innerHTML=`<div class="search-panel">
    <div class="search-panel-input-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="search-panel-input" id="sp-input" placeholder="Search people, communities, posts…">
      <span class="search-shortcut">Esc</span>
    </div>
    <div id="sp-results" style="max-height:380px;overflow-y:auto"></div>
  </div>`;
  document.body.appendChild(ov);requestAnimationFrame(()=>ov.classList.add('open'));
  const input=$('#sp-input'),results=$('#sp-results');
  input?.focus();doSearch('',results);
  let t=null;input?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>doSearch(input.value.trim(),results),220);});
  ov.addEventListener('click',e=>{if(e.target===ov)closeSearch();});
  document.addEventListener('keydown',function h(e){if(e.key==='Escape'){closeSearch();document.removeEventListener('keydown',h);}});
}

async function doSearch(q,container){
  if(!container)return;
  if(!q){
    const[{data:people},{data:comms}]=await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url,follower_count').neq('id',State.profile.id).order('follower_count',{ascending:false}).limit(4),
      supabase.from('communities').select('id,name,icon,member_count').eq('is_public',true).order('member_count',{ascending:false}).limit(4),
    ]);
    container.innerHTML=
      (people?.length?`<div class="search-section-label">Suggested People</div>${people.map(u=>`<div class="search-result-item" data-uid="${u.id}">${avatarEl(u,36)}<div><div class="search-result-main">${esc(u.display_name||u.username)}</div><div class="search-result-sub">@${esc(u.username)} · ${fmtNum(u.follower_count||0)} followers</div></div></div>`).join('')}`:'')
      +(comms?.length?`<div class="search-section-label">Communities</div>${comms.map(c=>`<div class="search-result-item" data-cid="${c.id}"><div class="search-result-icon">${c.icon||'🌐'}</div><div><div class="search-result-main">${esc(c.name)}</div><div class="search-result-sub">${fmtNum(c.member_count||0)} members</div></div></div>`).join('')}`:'');
  } else {
    const[{data:people},{data:comms}]=await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(4),
      supabase.from('communities').select('id,name,icon,member_count').ilike('name',`%${q}%`).limit(4),
    ]);
    const none=!people?.length&&!comms?.length;
    container.innerHTML=none
      ?`<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No results for "${esc(q)}"</div>`
      :(people?.length?`<div class="search-section-label">People</div>${people.map(u=>`<div class="search-result-item" data-uid="${u.id}">${avatarEl(u,36)}<div><div class="search-result-main">${esc(u.display_name||u.username)}</div><div class="search-result-sub">@${esc(u.username)}</div></div></div>`).join('')}`:'')
       +(comms?.length?`<div class="search-section-label">Communities</div>${comms.map(c=>`<div class="search-result-item" data-cid="${c.id}"><div class="search-result-icon">${c.icon||'🌐'}</div><div><div class="search-result-main">${esc(c.name)}</div><div class="search-result-sub">${fmtNum(c.member_count||0)} members</div></div></div>`).join('')}`:'');
  }
  $$('.search-result-item[data-uid]',container).forEach(i=>i.addEventListener('click',()=>{closeSearch();renderProfile($('#main'),i.dataset.uid);}));
  $$('.search-result-item[data-cid]',container).forEach(i=>i.addEventListener('click',()=>{closeSearch();openCommunity(i.dataset.cid);}));
}
function closeSearch(){const ov=$('#search-overlay');if(ov){ov.classList.remove('open');setTimeout(()=>ov.remove(),200);}}

/* ════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS + ONBOARDING
════════════════════════════════════════════════════════════ */
function initKeyboardShortcuts(){
  let lk='';
  document.addEventListener('keydown',e=>{
    const isInput=['INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable;
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();buildSearchOverlay();return;}
    if(isInput)return;
    if(e.key==='g'){lk='g';return;}
    if(lk==='g'){lk='';const map={f:'feed',e:'explore',n:'notifications',m:'messages',p:'profile',b:'bookmarks'};if(map[e.key])navigateTo(map[e.key]);return;}
    if(e.key==='n')openNewPostModal();
    if(e.key==='Escape'){$('#modal-overlay')?.classList.remove('open');closeSearch();}
  });
}

let tipShown=false;
function showOnboardingTip(){
  if(tipShown)return;tipShown=true;
  const tip=el('div','onboard-tip');tip.style.cssText='left:260px;top:70px;z-index:700';
  tip.innerHTML=`<div class="onboard-tip-title">⌘K — Global Search</div><div class="onboard-tip-body">Cmd+K to search · G+F/E/N/M/P to navigate · N for new post · Esc to close</div><div class="onboard-tip-footer"><button class="onboard-tip-btn" onclick="this.closest('.onboard-tip').remove()">Got it!</button></div>`;
  document.body.appendChild(tip);setTimeout(()=>tip.isConnected&&tip.remove(),10000);
}

/* ── Global Expose ──────────────────────────────────────────── */
window.cyanet={toast,navigateTo,openCommunity,openNewPostModal,openProfileEditModal,renderCollabs,openNewCollabModal,openCreateCommunityModal,signOut,buildSearchOverlay};

/* ════════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  initAuth();
  $('#modal-overlay')?.addEventListener('click',e=>{if(e.target===$('#modal-overlay'))$('#modal-overlay').classList.remove('open');});
});

/* ════════════════════════════════════════════════════════════
   SUPABASE STORAGE — Avatar & Image Uploads
════════════════════════════════════════════════════════════ */

/**
 * Upload a file to Supabase Storage and return its public URL.
 * Bucket must be created in Supabase Dashboard → Storage.
 *   - "avatars"  : public bucket, for profile photos
 *   - "posts"    : public bucket, for post images
 */
async function uploadFile(bucket, file, path) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

/**
 * Open a hidden file input, let user pick an image,
 * upload it, and call onSuccess(publicUrl).
 */
function pickAndUploadImage(bucket, pathPrefix, onSuccess, onError) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) { input.remove(); return; }

    // 5 MB limit
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', '⚠️');
      input.remove();
      return;
    }

    toast('Uploading…', '⏳');
    const ext  = file.name.split('.').pop();
    const path = `${pathPrefix}/${Date.now()}.${ext}`;

    try {
      const url = await uploadFile(bucket, file, path);
      onSuccess(url);
    } catch (err) {
      toast('Upload failed: ' + err.message, '❌');
      if (onError) onError(err);
    } finally {
      input.remove();
    }
  });

  input.click();
}

/* ── Wire avatar upload into Profile Edit modal ─────────────── */
// Patches openProfileEditModal to add real upload buttons
const _baseProfileEditModal = openProfileEditModal;
function openProfileEditModal() {
  _baseProfileEditModal();

  // Replace the static avatar info with real upload button
  const avatarSection = document.querySelector('.edit-avatar-section');
  if (!avatarSection) return;

  const actionsDiv = avatarSection.querySelector('.edit-avatar-actions');
  if (!actionsDiv) return;

  actionsDiv.innerHTML = `
    <button class="edit-avatar-btn" id="upload-avatar-btn">📷 Change Avatar</button>
    <button class="edit-avatar-btn" id="upload-cover-btn">🖼️ Change Cover</button>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px">PNG, JPG, GIF · max 5 MB</div>
  `;

  document.getElementById('upload-avatar-btn')?.addEventListener('click', () => {
    pickAndUploadImage('avatars', State.profile.id, async (url) => {
      // Update profile avatar_url in DB
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', State.profile.id);
      State.profile.avatar_url = url;
      State.cache.profiles.set(State.profile.id, State.profile);
      // Refresh avatar preview in modal
      const preview = document.querySelector('.edit-avatar-section > div:first-child');
      if (preview) preview.innerHTML = `<img src="${url}" style="width:64px;height:64px;border-radius:50%;object-fit:cover">`;
      // Refresh topbar avatar
      const tb = document.getElementById('tb-avatar');
      if (tb) tb.innerHTML = avatarEl(State.profile, 32);
      toast('Avatar updated! ✨', '✅');
    });
  });

  document.getElementById('upload-cover-btn')?.addEventListener('click', () => {
    pickAndUploadImage('covers', State.profile.id, async (url) => {
      await supabase.from('profiles').update({ cover_url: url }).eq('id', State.profile.id);
      State.profile.cover_url = url;
      toast('Cover photo updated! 🖼️', '✅');
    });
  });
}

/* ── Wire image upload into Composer ────────────────────────── */
// Patches buildComposer to add real image upload
const _baseComposer = buildComposer;
function buildComposer(container) {
  _baseComposer(container);

  // Replace image button onclick with real upload
  const imgBtn = container?.querySelector?.('[title="Image (soon)"]');
  if (!imgBtn) return;
  imgBtn.removeAttribute('onclick');
  imgBtn.title = 'Attach image';

  imgBtn.addEventListener('click', () => {
    pickAndUploadImage('posts', `${State.profile.id}`, (url) => {
      // Store url in a hidden field so submit can include it
      let hidden = document.getElementById('composer-image-url');
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id   = 'composer-image-url';
        container.appendChild(hidden);
      }
      hidden.value = url;

      // Show preview
      let preview = document.getElementById('composer-img-preview');
      if (!preview) {
        preview = document.createElement('div');
        preview.id = 'composer-img-preview';
        preview.style.cssText = 'margin:8px 0 0 48px;border-radius:var(--radius-md);overflow:hidden;max-height:180px;position:relative';
        const compInner = container.querySelector('.composer-inner');
        compInner?.insertBefore(preview, compInner.querySelector('.composer-toolbar'));
      }
      preview.innerHTML = `
        <img src="${url}" style="width:100%;max-height:180px;object-fit:cover;border-radius:var(--radius-md)">
        <button onclick="document.getElementById('composer-image-url').value='';this.parentNode.remove()"
          style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.6);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px">✕</button>
      `;

      imgBtn.style.color = 'var(--cyan)';
      toast('Image attached!', '📷');
    });
  });
}

/* Patch submitPost (from composer) to include image_url */
const _baseSubmit = submitPost;
async function submitPost(ta, codeBlock, hasCode, submitBtn) {
  // Grab image URL if attached
  const imageUrl = document.getElementById('composer-image-url')?.value || null;
  const content = ta?.value?.trim();
  if (!content) return;
  const code = hasCode ? codeBlock?.textContent?.trim() : null;

  submitBtn.disabled = true; submitBtn.textContent = 'Posting…';

  const { data: newPost, error } = await supabase.from('posts').insert({
    author_id: State.profile.id,
    content,
    code:      code      || null,
    image_url: imageUrl  || null,
  }).select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').single();

  submitBtn.disabled = false; submitBtn.textContent = 'Post';
  if (error) { toast('Post failed: ' + error.message, '❌'); return; }

  ta.value = '';
  if (codeBlock) { codeBlock.textContent = ''; codeBlock.classList.remove('visible'); }
  const charEl = document.getElementById('comp-chars');
  if (charEl) charEl.textContent = '280';
  const imgPrev = document.getElementById('composer-img-preview');
  if (imgPrev) imgPrev.remove();
  const imgHidden = document.getElementById('composer-image-url');
  if (imgHidden) imgHidden.value = '';

  const enriched = { ...newPost, liked: false, bookmarked: false };
  State.cache.posts.unshift(enriched);
  const fl = document.getElementById('feed-list');
  if (fl) {
    const card = buildPostCard(enriched);
    card.style.animation = 'cardIn 0.4s var(--spring)';
    fl.insertBefore(card, fl.firstChild);
  }
  toast('Posted! 🚀', '✅');
}

/* ════════════════════════════════════════════════════════════
   UNREAD DM BADGE — real-time tracking
════════════════════════════════════════════════════════════ */
async function initDMBadge() {
  // Count unread DMs (messages in conversations not sent by me, unread)
  const { count } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .neq('sender_id', State.profile.id)
    .is('read_at', null)
    .in('conversation_id',
      (await supabase
        .from('conversations')
        .select('id')
        .or(`user_a.eq.${State.profile.id},user_b.eq.${State.profile.id}`)
      ).data?.map(c => c.id) || []
    );

  State.unreadDMs = count || 0;
  updateDMBadge();

  // Subscribe to new DMs in real-time
  supabase
    .channel(`dm-badge:${State.profile.id}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'direct_messages' },
      async payload => {
        if (payload.new.sender_id === State.profile.id) return;
        // Check it's in one of our conversations
        const { data: convo } = await supabase
          .from('conversations')
          .select('id')
          .eq('id', payload.new.conversation_id)
          .or(`user_a.eq.${State.profile.id},user_b.eq.${State.profile.id}`)
          .single();
        if (!convo) return;
        State.unreadDMs++;
        updateDMBadge();
      }
    )
    .subscribe();
}

function updateDMBadge() {
  const badge   = document.getElementById('dm-badge');
  const sbBadge = document.getElementById('sb-dm-badge');
  if (State.unreadDMs > 0) {
    if (badge)   { badge.style.display = ''; }
    if (sbBadge) { sbBadge.style.display = ''; sbBadge.textContent = State.unreadDMs; }
  } else {
    if (badge)   badge.style.display   = 'none';
    if (sbBadge) sbBadge.style.display = 'none';
  }
}

/* Mark DMs as read when conversation is opened */
async function markDMsRead(conversationId) {
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', State.profile.id)
    .is('read_at', null);
  State.unreadDMs = Math.max(0, State.unreadDMs - 1);
  updateDMBadge();
}

/* Patch openDM to call markDMsRead */
const _baseOpenDM = openDM;
async function openDM(convoId, otherUserId) {
  await _baseOpenDM(convoId, otherUserId);
  markDMsRead(convoId);
}

/* ════════════════════════════════════════════════════════════
   PROFILE COVER — render real cover_url if set
════════════════════════════════════════════════════════════ */
/* Patch renderProfile to use cover_url */
const _baseRenderProfile = renderProfile;
async function renderProfile(main, targetId) {
  await _baseRenderProfile(main, targetId);

  // Apply cover photo if exists
  const uid = targetId || State.profile.id;
  const profile = uid === State.profile.id ? State.profile : await getProfile(uid);
  const cover = document.querySelector('.profile-cover');
  if (cover && profile?.cover_url) {
    cover.style.backgroundImage = `url(${profile.cover_url})`;
    cover.style.backgroundSize  = 'cover';
    cover.style.backgroundPosition = 'center';
  }
}

/* ════════════════════════════════════════════════════════════
   GITHUB REPO CARD — fetch real user repos via GitHub API
════════════════════════════════════════════════════════════ */
async function fetchGitHubRepos(githubLogin) {
  if (!githubLogin) return [];
  try {
    const res = await fetch(`https://api.github.com/users/${githubLogin}/repos?sort=stargazers&per_page=6`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

/* Render real GitHub repos in Profile → Repos tab */
async function renderProfileReposTab(container, profile) {
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Loading repos…</div>';

  const repos = profile?.github_login
    ? await fetchGitHubRepos(profile.github_login)
    : [];

  if (!repos.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:10px">📁</div>
      <div style="font-weight:600;margin-bottom:4px">No public repos</div>
      ${!profile?.github_login ? '<div style="font-size:13px">Link a GitHub account to show repos</div>' : ''}
    </div>`;
    return;
  }

  container.innerHTML = `<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
    ${repos.map(r => `
      <a href="${r.html_url}" target="_blank" rel="noopener" style="text-decoration:none">
        <div class="repo-card-full">
          <div class="repo-card-full-name">📁 ${esc(r.name)}</div>
          <div class="repo-card-full-desc">${esc(r.description || 'No description')}</div>
          <div class="repo-card-full-meta">
            ${r.language ? `<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:${langColor(r.language)};display:inline-block"></span>${esc(r.language)}</span>` : ''}
            <span>⭐ ${fmtNum(r.stargazers_count || 0)}</span>
            <span>🍴 ${r.forks_count || 0}</span>
            <span>Updated ${fmtTime(r.updated_at)}</span>
          </div>
        </div>
      </a>
    `).join('')}
  </div>`;
}

function langColor(lang) {
  const map = { JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5', Rust:'#dea584', Go:'#00ADD8', CSS:'#563d7c', HTML:'#e34c26', Svelte:'#ff3e00', Vue:'#41b883', Ruby:'#701516', Java:'#b07219', 'C++':'#f34b7d', C:'#555555', Shell:'#89e051' };
  return map[lang] || '#aaa';
}

/* Patch loadProfTab to use real GitHub repos */
const _baseLoadProfTab = loadProfTab;
async function loadProfTab(tab, uid, container) {
  if (tab === 'Repos') {
    const profile = uid === State.profile.id ? State.profile : await getProfile(uid);
    await renderProfileReposTab(container, profile);
  } else {
    await _baseLoadProfTab(tab, uid, container);
  }
}

/* ════════════════════════════════════════════════════════════
   REAL-TIME TYPING — wire into DM view too
════════════════════════════════════════════════════════════ */
/* Patch openDM to broadcast typing in DM channel */
const _baseDMInputHandler = null; // placeholder

/* ════════════════════════════════════════════════════════════
   HASHTAG / MENTION SEARCH
════════════════════════════════════════════════════════════ */
/* Patch doSearch to also search posts by hashtag */
const _baseDoSearch = doSearch;
async function doSearch(q, container) {
  if (q.startsWith('#')) {
    // hashtag search — full text search on posts
    const tag = q.slice(1);
    container.innerHTML = `<div style="padding:14px;font-size:13px;color:var(--text-muted)">Searching posts for ${esc(q)}…</div>`;
    const { data: posts } = await supabase
      .from('posts')
      .select('id,content,created_at,author:profiles!posts_author_id_fkey(username,display_name,avatar_url)')
      .ilike('content', `%#${tag}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!posts?.length) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No posts found for ${esc(q)}</div>`;
      return;
    }
    container.innerHTML = `<div class="search-section-label">Posts tagged ${esc(q)}</div>
      ${posts.map(p => `
        <div class="search-result-item" data-pid="${p.id}">
          ${avatarEl(p.author, 36)}
          <div>
            <div class="search-result-main" style="font-weight:600">@${esc(p.author?.username)}</div>
            <div class="search-result-sub">${esc(p.content.slice(0,80))}…</div>
          </div>
        </div>
      `).join('')}`;

    document.querySelectorAll('[data-pid]').forEach(item => {
      item.addEventListener('click', () => {
        closeSearch();
        const post = State.cache.posts.find(p => p.id === item.dataset.pid);
        if (post) openPostThread(post);
        else toast('Loading post…', '⏳');
      });
    });
    return;
  }

  if (q.startsWith('@')) {
    // @mention search
    const handle = q.slice(1);
    const { data: people } = await supabase
      .from('profiles')
      .select('id,username,display_name,avatar_url,follower_count')
      .ilike('username', `%${handle}%`)
      .limit(8);

    container.innerHTML = people?.length
      ? `<div class="search-section-label">People matching ${esc(q)}</div>${people.map(u => `<div class="search-result-item" data-uid="${u.id}">${avatarEl(u, 36)}<div><div class="search-result-main">${esc(u.display_name || u.username)}</div><div class="search-result-sub">@${esc(u.username)} · ${fmtNum(u.follower_count || 0)} followers</div></div></div>`).join('')}`
      : `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No users matching ${esc(q)}</div>`;

    document.querySelectorAll('[data-uid]').forEach(i => {
      i.addEventListener('click', () => { closeSearch(); renderProfile(document.getElementById('main'), i.dataset.uid); });
    });
    return;
  }

  // Default
  await _baseDoSearch(q, container);
}

/* ════════════════════════════════════════════════════════════
   RIGHT-CLICK CONTEXT MENU on posts
════════════════════════════════════════════════════════════ */
function attachPostContextMenu(card, post) {
  card.addEventListener('contextmenu', e => {
    e.preventDefault();
    const existing = document.getElementById('ctx-menu');
    if (existing) existing.remove();

    const isOwn = post.author_id === State.profile.id;
    const menu = document.createElement('div');
    menu.id = 'ctx-menu';
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:var(--bg-float);border:1px solid var(--border);border-radius:var(--radius-md);padding:6px;z-index:9000;min-width:180px;box-shadow:0 12px 32px rgba(0,0,0,0.5);animation:toastIn 0.15s ease`;

    const items = [
      { label: '🔗 Copy link',   action: () => { navigator.clipboard.writeText(`${location.origin}#post-${post.id}`); toast('Link copied!', '🔗'); } },
      { label: '🔖 Bookmark',    action: () => toggleBookmark(post, card) },
      { label: '🔁 Repost',      action: () => toast('Repost coming soon!', '🔁') },
      ...(isOwn ? [
        { label: '✏️ Edit post',   action: () => toast('Post editing coming soon!', '✏️') },
        { label: '🗑️ Delete post', action: async () => {
          if (!confirm('Delete this post?')) return;
          const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('author_id', State.profile.id);
          if (error) { toast('Error: ' + error.message, '❌'); return; }
          card.style.animation = 'toastOut 0.3s ease forwards';
          setTimeout(() => card.remove(), 300);
          toast('Post deleted', '🗑️');
        }},
      ] : [
        { label: '🚩 Report post', action: () => toast('Report submitted. Thank you.', '🚩') },
        { label: '🔇 Mute user',   action: () => toast('User muted', '🔇') },
      ]),
    ];

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.style.cssText = 'display:block;width:100%;padding:8px 12px;text-align:left;font-size:13px;color:var(--text-primary);background:none;border:none;border-radius:6px;cursor:pointer;font-family:var(--font-body)';
      btn.onmouseenter = () => btn.style.background = 'var(--bg-elevated)';
      btn.onmouseleave = () => btn.style.background = '';
      btn.addEventListener('click', () => { item.action(); menu.remove(); });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
  });
}

/* Patch buildPostCard to attach context menu */
const _basePostCard = buildPostCard;
function buildPostCard(post) {
  const card = _basePostCard(post);
  attachPostContextMenu(card, post);
  return card;
}

/* ════════════════════════════════════════════════════════════
   EXPLORE — Real People Discovery section
════════════════════════════════════════════════════════════ */
/* Patch renderExplore to add People section */
const _baseRenderExplore = renderExplore;
async function renderExplore(main) {
  await _baseRenderExplore(main);

  // Append People section below communities
  const { data: people } = await supabase
    .from('profiles')
    .select('id,username,display_name,avatar_url,follower_count,bio,tech_stack')
    .neq('id', State.profile.id)
    .order('follower_count', { ascending: false })
    .limit(8);

  if (!people?.length) return;

  const section = document.createElement('div');
  section.innerHTML = `
    <div style="padding:14px 16px 6px;font-family:var(--font-display);font-size:16px;font-weight:800">People to Follow</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 16px" id="people-grid">
      ${people.map(u => `
        <div class="collab-card" style="cursor:pointer" data-uid="${u.id}">
          <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
            ${avatarEl(u, 46)}
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px">${esc(u.display_name || u.username)}</div>
              <div style="font-size:12px;color:var(--text-muted)">@${esc(u.username)}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${fmtNum(u.follower_count || 0)} followers</div>
            </div>
            <button class="follow-btn" data-uid="${u.id}" style="flex-shrink:0">Follow</button>
          </div>
          ${u.bio ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;line-height:1.4">${esc(u.bio.slice(0, 80))}${u.bio.length > 80 ? '…' : ''}</div>` : ''}
          ${u.tech_stack?.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${u.tech_stack.slice(0, 4).map(t => `<span class="tech-badge" style="font-size:10px;padding:2px 7px">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  main.appendChild(section);

  document.querySelectorAll('#people-grid .follow-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFollow(btn.dataset.uid, btn);
    });
  });

  document.querySelectorAll('#people-grid [data-uid]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.follow-btn')) return;
      renderProfile(main, card.dataset.uid);
    });
  });
}

/* ════════════════════════════════════════════════════════════
   REAL-TIME ONLINE COUNT in Rightbar
════════════════════════════════════════════════════════════ */
function startOnlineCountTicker() {
  setInterval(() => {
    const count = State.onlineUsers.size + 1; // +1 for self
    const stat = document.getElementById('stat-posts');
    if (stat && stat.parentElement) {
      const onlineEl = document.getElementById('rb-online-count');
      if (!onlineEl) {
        const widget = stat.closest('.widget');
        if (widget) {
          const ticker = document.createElement('div');
          ticker.style.cssText = 'padding:0 14px 12px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)';
          ticker.innerHTML = `<div class="live-dot" style="width:7px;height:7px;border-radius:50%;background:var(--emerald);animation:livePulse 1.2s ease-in-out infinite"></div><span id="rb-online-count">${count} online now</span>`;
          widget.appendChild(ticker);
        }
      } else {
        onlineEl.textContent = `${count} online now`;
      }
    }
  }, 5000);
}

/* ════════════════════════════════════════════════════════════
   PATCH buildApp — wire all new features on startup
════════════════════════════════════════════════════════════ */
const _baseBuildApp = buildApp;
function buildApp() {
  _baseBuildApp();
  // Wire DM badge
  initDMBadge();
  // Start online count ticker
  startOnlineCountTicker();
}

/* ════════════════════════════════════════════════════════════
   SERVICE WORKER REGISTRATION (PWA offline support)
════════════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // sw.js optional — fails silently if not present
    });
  });
}

/* ════════════════════════════════════════════════════════════
   DEEP LINK HANDLING — open post/profile from URL hash
════════════════════════════════════════════════════════════ */
function handleDeepLink() {
  const hash = window.location.hash;
  if (!hash) return;

  if (hash.startsWith('#post-')) {
    const postId = hash.replace('#post-', '');
    supabase.from('posts').select('*,author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url)').eq('id', postId).single()
      .then(({ data }) => { if (data) openPostThread({ ...data, liked: false, bookmarked: false }); });
  } else if (hash.startsWith('#@')) {
    const username = hash.replace('#@', '');
    supabase.from('profiles').select('id').eq('username', username).single()
      .then(({ data }) => { if (data) renderProfile(document.getElementById('main'), data.id); });
  } else if (hash.startsWith('#/c/')) {
    const slug = hash.replace('#/c/', '');
    supabase.from('communities').select('id').eq('slug', slug).single()
      .then(({ data }) => { if (data) openCommunity(data.id); });
  }
}

/* Patch onSessionReady to handle deep links after login */
const _baseOnSessionReady = onSessionReady;
async function onSessionReady(session) {
  await _baseOnSessionReady(session);
  setTimeout(handleDeepLink, 500);
}

