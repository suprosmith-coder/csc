// =========================================================
//  DEVIT — app.js
//  Supabase-powered social network
// =========================================================

const SUPABASE_URL = "https://nynrocdgmowjgslgfdmc.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bnJvY2RnbW93amdzbGdmZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTUxNTQsImV4cCI6MjA5MzIzMTE1NH0.280rrXAe92hxylzia2hl3ygRrG0LraDzBCGwQUeXu5U";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ---- STATE ----
let currentUser = null;
let currentProfile = null; // username of profile being viewed
let currentProfileTab = "posts";
let openPostId = null;

// ---- INIT ----
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadCurrentUser(session.user);
    showApp();
  } else {
    showAuth();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session) {
      await loadCurrentUser(session.user);
      showApp();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      showAuth();
    }
  });
})();

async function loadCurrentUser(authUser) {
  const { data } = await sb.from("profiles").select("*").eq("id", authUser.id).single();
  if (data) {
    currentUser = data;
  } else {
    // Auto-create profile row if missing
    const username = authUser.email.split("@")[0].replace(/[^a-z0-9_]/gi, "_");
    const { data: created } = await sb.from("profiles").insert({
      id: authUser.id,
      username,
      display_name: username,
      email: authUser.email,
    }).select().single();
    currentUser = created;
  }
}

// ---- AUTH ----
function showAuth() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
}

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  switchView("feed");
  loadFeed();
  loadSuggestions();
  loadNotifCount();
}

// Auth tabs
document.querySelectorAll("#auth-tabs .tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#auth-tabs .tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const which = tab.dataset.tab;
    document.getElementById("login-form").classList.toggle("hidden", which !== "login");
    document.getElementById("register-form").classList.toggle("hidden", which !== "register");
  });
});

// Login
document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) errEl.textContent = error.message;
});

// Register
document.getElementById("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  const username = document.getElementById("reg-username").value.trim().toLowerCase();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const errEl = document.getElementById("reg-error");
  errEl.textContent = "";

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    errEl.textContent = "Username: 3-20 chars, letters/numbers/underscore only.";
    return;
  }

  // Check username taken
  const { data: existing } = await sb.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing) { errEl.textContent = "Username already taken."; return; }

  const { data: authData, error: authErr } = await sb.auth.signUp({ email, password });
  if (authErr) { errEl.textContent = authErr.message; return; }

  if (authData.user) {
    await sb.from("profiles").upsert({
      id: authData.user.id,
      username,
      display_name: username,
      email,
    });
  }
});

// Logout
document.getElementById("logout-btn").addEventListener("click", () => sb.auth.signOut());

// ---- NAVIGATION ----
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "profile") {
      openProfile(currentUser?.username);
      return;
    }
    switchView(view);
    if (view === "feed") loadFeed();
    if (view === "explore") loadTrendingTags();
    if (view === "notifications") loadNotifications();
  });
});

function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(`view-${view}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
  });
}

// ---- FEED ----
async function loadFeed() {
  const list = document.getElementById("feed-list");
  list.innerHTML = '<div class="loading">Loading posts...</div>';

  const { data: posts } = await sb
    .from("posts")
    .select("*, profiles!author_id(*)")
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!posts || posts.length === 0) {
    list.innerHTML = '<div class="empty">No posts yet. Be the first!</div>';
    return;
  }

  const likedIds = await getUserLikedIds(posts.map(p => p.id));
  const repostedIds = await getUserRepostedIds(posts.map(p => p.id));
  list.innerHTML = "";
  posts.forEach(p => list.appendChild(renderPost(p, likedIds, repostedIds)));
}

// ---- CREATE POST ----
const postContent = document.getElementById("post-content");
const charCount = document.getElementById("char-count");
postContent.addEventListener("input", () => {
  charCount.textContent = 500 - postContent.value.length;
});

document.getElementById("post-btn").addEventListener("click", async () => {
  if (!currentUser) return;
  const content = postContent.value.trim();
  if (!content) return;

  const btn = document.getElementById("post-btn");
  btn.disabled = true;

  await sb.from("posts").insert({
    author_id: currentUser.id,
    content,
  });

  // Extract and upsert hashtags
  const tags = [...content.matchAll(/#([a-zA-Z0-9_]+)/g)].map(m => m[1].toLowerCase());
  for (const tag of [...new Set(tags)]) {
    await sb.from("tags").upsert({ name: tag, post_count: 1 }, {
      onConflict: "name",
      ignoreDuplicates: false,
    }).then(() => {
      sb.rpc("increment_tag", { tag_name: tag }).catch(() => {});
    });
  }

  // Award XP
  await sb.rpc("add_xp", { user_id: currentUser.id, amount: 10 }).catch(() => {});

  postContent.value = "";
  charCount.textContent = "500";
  btn.disabled = false;
  loadFeed();
});

// ---- RENDER POST ----
function renderPost(post, likedIds = new Set(), repostedIds = new Set()) {
  const author = post.profiles || {};
  const isLiked = likedIds.has(post.id);
  const isReposted = repostedIds.has(post.id);
  const card = document.createElement("div");
  card.className = "post-card";
  card.dataset.postId = post.id;

  card.innerHTML = `
    <div class="post-meta">
      <div class="avatar" data-username="${author.username || ""}">${avatarContent(author)}</div>
      <div>
        <span class="post-author" data-username="${author.username || ""}">${escHtml(author.display_name || author.username || "Unknown")}</span>
        <span class="post-username">@${escHtml(author.username || "")}</span>
      </div>
      <span class="post-time">${timeAgo(post.created_at)}</span>
    </div>
    <div class="post-content">${formatContent(post.content)}</div>
    <div class="post-actions">
      <button class="action-btn reply-action" data-id="${post.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span>${post.reply_count || 0}</span>
      </button>
      <button class="action-btn repost-action ${isReposted ? "reposted" : ""}" data-id="${post.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        <span>${post.repost_count || 0}</span>
      </button>
      <button class="action-btn like-action ${isLiked ? "liked" : ""}" data-id="${post.id}">
        <svg viewBox="0 0 24 24" fill="${isLiked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        <span>${post.like_count || 0}</span>
      </button>
    </div>
  `;

  // Click card to open thread (but not action buttons or author links)
  card.addEventListener("click", e => {
    if (e.target.closest(".action-btn") || e.target.closest("[data-username]")) return;
    openPostModal(post.id);
  });

  card.querySelector(".reply-action").addEventListener("click", e => {
    e.stopPropagation();
    openPostModal(post.id);
  });

  card.querySelector(".like-action").addEventListener("click", e => {
    e.stopPropagation();
    toggleLike(post.id, card.querySelector(".like-action"));
  });

  card.querySelector(".repost-action").addEventListener("click", e => {
    e.stopPropagation();
    toggleRepost(post.id, card.querySelector(".repost-action"));
  });

  card.querySelectorAll("[data-username]").forEach(el => {
    el.addEventListener("click", e => {
      e.stopPropagation();
      openProfile(el.dataset.username);
    });
  });

  return card;
}

function avatarContent(profile) {
  if (profile.avatar_url) return `<img src="${escHtml(profile.avatar_url)}" alt="" />`;
  return (profile.display_name || profile.username || "?")[0].toUpperCase();
}

// ---- LIKES ----
async function getUserLikedIds(postIds) {
  if (!currentUser || !postIds.length) return new Set();
  const { data } = await sb.from("likes").select("post_id").eq("user_id", currentUser.id).in("post_id", postIds);
  return new Set((data || []).map(l => l.post_id));
}

async function getUserRepostedIds(postIds) {
  if (!currentUser || !postIds.length) return new Set();
  const { data } = await sb.from("reposts").select("post_id").eq("user_id", currentUser.id).in("post_id", postIds);
  return new Set((data || []).map(r => r.post_id));
}

async function toggleLike(postId, btn) {
  if (!currentUser) return;
  const isLiked = btn.classList.contains("liked");

  if (isLiked) {
    await sb.from("likes").delete().eq("user_id", currentUser.id).eq("post_id", postId);
    await sb.rpc("decrement_like", { post_id: postId }).catch(() => {});
    btn.classList.remove("liked");
    btn.querySelector("svg").setAttribute("fill", "none");
  } else {
    await sb.from("likes").insert({ user_id: currentUser.id, post_id: postId });
    await sb.rpc("increment_like", { post_id: postId }).catch(() => {});
    btn.classList.add("liked");
    btn.querySelector("svg").setAttribute("fill", "currentColor");

    // Notify post author
    const { data: post } = await sb.from("posts").select("author_id").eq("id", postId).single();
    if (post && post.author_id !== currentUser.id) {
      await sb.from("notifications").insert({
        user_id: post.author_id,
        actor_id: currentUser.id,
        type: "like",
        post_id: postId,
      }).catch(() => {});
    }
  }
  const countEl = btn.querySelector("span");
  countEl.textContent = parseInt(countEl.textContent || "0") + (isLiked ? -1 : 1);
}

async function toggleRepost(postId, btn) {
  if (!currentUser) return;
  const isReposted = btn.classList.contains("reposted");

  if (isReposted) {
    await sb.from("reposts").delete().eq("user_id", currentUser.id).eq("post_id", postId);
    await sb.rpc("decrement_repost", { post_id: postId }).catch(() => {});
    btn.classList.remove("reposted");
  } else {
    await sb.from("reposts").insert({ user_id: currentUser.id, post_id: postId });
    await sb.rpc("increment_repost", { post_id: postId }).catch(() => {});
    btn.classList.add("reposted");
  }
  const countEl = btn.querySelector("span");
  countEl.textContent = parseInt(countEl.textContent || "0") + (isReposted ? -1 : 1);
}

// ---- POST MODAL ----
async function openPostModal(postId) {
  openPostId = postId;
  const modal = document.getElementById("post-modal");
  modal.classList.remove("hidden");

  const { data: post } = await sb.from("posts").select("*, profiles!author_id(*)").eq("id", postId).single();
  const likedIds = await getUserLikedIds([postId]);
  const repostedIds = await getUserRepostedIds([postId]);

  document.getElementById("modal-post").innerHTML = "";
  document.getElementById("modal-post").appendChild(renderPost(post, likedIds, repostedIds));
  loadReplies(postId);
}

async function loadReplies(postId) {
  const container = document.getElementById("modal-replies");
  container.innerHTML = '<div class="loading">Loading replies...</div>';
  const { data: replies } = await sb
    .from("posts")
    .select("*, profiles!author_id(*)")
    .eq("parent_id", postId)
    .order("created_at", { ascending: true });

  const likedIds = await getUserLikedIds((replies || []).map(r => r.id));
  const repostedIds = await getUserRepostedIds((replies || []).map(r => r.id));
  container.innerHTML = "";
  (replies || []).forEach(r => container.appendChild(renderPost(r, likedIds, repostedIds)));
  if (!replies || replies.length === 0) container.innerHTML = '<div class="empty">No replies yet.</div>';
}

document.querySelector(".modal-overlay").addEventListener("click", closeModal);
document.querySelector(".modal-close").addEventListener("click", closeModal);
function closeModal() {
  document.getElementById("post-modal").classList.add("hidden");
  openPostId = null;
}

// Reply
document.getElementById("reply-btn").addEventListener("click", async () => {
  if (!currentUser || !openPostId) return;
  const content = document.getElementById("reply-content").value.trim();
  if (!content) return;

  await sb.from("posts").insert({
    author_id: currentUser.id,
    content,
    parent_id: openPostId,
  });

  // Increment reply count
  await sb.rpc("increment_reply", { post_id: openPostId }).catch(() => {});
  // Award XP
  await sb.rpc("add_xp", { user_id: currentUser.id, amount: 5 }).catch(() => {});

  // Notify post author
  const { data: parent } = await sb.from("posts").select("author_id").eq("id", openPostId).single();
  if (parent && parent.author_id !== currentUser.id) {
    await sb.from("notifications").insert({
      user_id: parent.author_id,
      actor_id: currentUser.id,
      type: "reply",
      post_id: openPostId,
    }).catch(() => {});
  }

  document.getElementById("reply-content").value = "";
  loadReplies(openPostId);
});

// ---- EXPLORE / SEARCH ----
async function loadTrendingTags() {
  const { data } = await sb.from("tags").select("*").order("post_count", { ascending: false }).limit(20);
  const tagList = document.getElementById("tag-list");
  tagList.innerHTML = "";
  (data || []).forEach(tag => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = `#${tag.name}`;
    pill.addEventListener("click", () => searchByTag(tag.name));
    tagList.appendChild(pill);
  });
  document.getElementById("search-results").innerHTML = "";
}

async function searchByTag(tag) {
  document.getElementById("search-input").value = `#${tag}`;
  runSearch(`#${tag}`);
}

document.getElementById("search-btn").addEventListener("click", () => {
  runSearch(document.getElementById("search-input").value.trim());
});
document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") runSearch(document.getElementById("search-input").value.trim());
});

async function runSearch(q) {
  if (!q) return;
  const results = document.getElementById("search-results");
  results.innerHTML = '<div class="loading">Searching...</div>';

  const isTag = q.startsWith("#");
  const term = isTag ? q.slice(1) : q;

  let posts = [];
  if (isTag) {
    const { data } = await sb.from("posts").select("*, profiles!author_id(*)").ilike("content", `%#${term}%`).order("created_at", { ascending: false }).limit(30);
    posts = data || [];
  } else {
    const { data } = await sb.from("posts").select("*, profiles!author_id(*)").ilike("content", `%${term}%`).order("created_at", { ascending: false }).limit(30);
    posts = data || [];
  }

  const likedIds = await getUserLikedIds(posts.map(p => p.id));
  const repostedIds = await getUserRepostedIds(posts.map(p => p.id));
  results.innerHTML = "";
  if (!posts.length) { results.innerHTML = '<div class="empty">No results found.</div>'; return; }
  posts.forEach(p => results.appendChild(renderPost(p, likedIds, repostedIds)));
}

// ---- NOTIFICATIONS ----
async function loadNotifCount() {
  if (!currentUser) return;
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", currentUser.id).eq("read", false);
  const badge = document.getElementById("notif-badge");
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

async function loadNotifications() {
  if (!currentUser) return;
  const list = document.getElementById("notif-list");
  list.innerHTML = '<div class="loading">Loading...</div>';

  const { data } = await sb
    .from("notifications")
    .select("*, actor:profiles!actor_id(username, display_name, avatar_url)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Mark all read
  await sb.from("notifications").update({ read: true }).eq("user_id", currentUser.id).eq("read", false);
  document.getElementById("notif-badge").classList.add("hidden");

  list.innerHTML = "";
  if (!data || !data.length) { list.innerHTML = '<div class="empty">No notifications yet.</div>'; return; }

  data.forEach(n => {
    const actor = n.actor || {};
    const item = document.createElement("div");
    item.className = `notif-item${n.read ? "" : " unread"}`;
    item.innerHTML = `
      <div class="notif-icon">${notifIcon(n.type)}</div>
      <div>
        <div class="notif-text"><strong>@${escHtml(actor.username || "someone")}</strong> ${notifText(n.type)}</div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    `;
    if (n.post_id) item.style.cursor = "pointer";
    item.addEventListener("click", () => { if (n.post_id) openPostModal(n.post_id); });
    list.appendChild(item);
  });
}

function notifIcon(type) {
  const icons = {
    like: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
    reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
    follow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    repost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
  };
  return icons[type] || icons.like;
}

function notifText(type) {
  const map = { like: "liked your post", reply: "replied to your post", follow: "started following you", repost: "reposted your post" };
  return map[type] || "interacted with you";
}

// ---- PROFILE ----
async function openProfile(username) {
  if (!username) return;
  currentProfile = username;
  currentProfileTab = "posts";
  switchView("profile");

  const { data: user } = await sb.from("profiles").select("*").eq("username", username).single();
  if (!user) { document.getElementById("profile-header").innerHTML = '<div class="empty">User not found.</div>'; return; }

  // Check follow status
  let isFollowing = false;
  if (currentUser && currentUser.id !== user.id) {
    const { data: follow } = await sb.from("follows").select("id").eq("follower_id", currentUser.id).eq("following_id", user.id).maybeSingle();
    isFollowing = !!follow;
  }

  // Render header
  const header = document.getElementById("profile-header");
  const xpLevel = Math.floor((user.xp || 0) / 100) + 1;
  const xpPct = ((user.xp || 0) % 100);
  const isOwn = currentUser && currentUser.id === user.id;

  header.innerHTML = `
    <div class="profile-cover"></div>
    <div class="profile-avatar">${avatarContent(user)}</div>
    <div class="profile-info">
      <div class="profile-name">
        ${escHtml(user.display_name || user.username)}
        ${user.is_verified ? '<span class="verified-badge">Verified</span>' : ""}
      </div>
      <div class="profile-handle">@${escHtml(user.username)}</div>
      ${user.bio ? `<div class="profile-bio">${escHtml(user.bio)}</div>` : ""}
      <div class="profile-stats">
        <div class="stat"><span class="stat-value">${user.post_count || 0}</span><span class="stat-label">Posts</span></div>
        <div class="stat"><span class="stat-value">${user.follower_count || 0}</span><span class="stat-label">Followers</span></div>
        <div class="stat"><span class="stat-value">${user.following_count || 0}</span><span class="stat-label">Following</span></div>
        <div class="stat"><span class="stat-value">${user.xp || 0} XP</span><span class="stat-label">Lv ${xpLevel}</span></div>
      </div>
      <div class="xp-bar-wrap">
        <div class="xp-bar-label">Level ${xpLevel} — ${xpPct}/100 XP to next</div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
      </div>
      <div class="profile-actions">
        ${isOwn
          ? `<button class="btn-ghost" id="edit-profile-btn">Edit Profile</button>`
          : `<button class="${isFollowing ? "btn-ghost active" : "btn-primary"}" id="follow-btn" data-uid="${user.id}" data-following="${isFollowing}">${isFollowing ? "Following" : "Follow"}</button>`
        }
      </div>
    </div>
  `;

  if (!isOwn) {
    document.getElementById("follow-btn")?.addEventListener("click", () => toggleFollow(user, isFollowing));
  }

  if (isOwn) {
    document.getElementById("edit-profile-btn")?.addEventListener("click", () => showEditProfile(user));
  }

  // Profile tabs
  document.querySelectorAll("[data-ptab]").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.ptab === "posts");
    tab.onclick = () => {
      document.querySelectorAll("[data-ptab]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentProfileTab = tab.dataset.ptab;
      loadProfilePosts(user.id);
    };
  });

  loadProfilePosts(user.id);
}

async function loadProfilePosts(userId) {
  const container = document.getElementById("profile-posts");
  container.innerHTML = '<div class="loading">Loading...</div>';

  let query;
  if (currentProfileTab === "likes") {
    const { data: likeRows } = await sb.from("likes").select("post_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
    const ids = (likeRows || []).map(l => l.post_id);
    if (!ids.length) { container.innerHTML = '<div class="empty">No liked posts yet.</div>'; return; }
    const { data: posts } = await sb.from("posts").select("*, profiles!author_id(*)").in("id", ids);
    const likedIds = await getUserLikedIds(ids);
    const repostedIds = await getUserRepostedIds(ids);
    container.innerHTML = "";
    (posts || []).forEach(p => container.appendChild(renderPost(p, likedIds, repostedIds)));
  } else {
    const { data: posts } = await sb.from("posts").select("*, profiles!author_id(*)").eq("author_id", userId).is("parent_id", null).order("created_at", { ascending: false }).limit(30);
    const likedIds = await getUserLikedIds((posts || []).map(p => p.id));
    const repostedIds = await getUserRepostedIds((posts || []).map(p => p.id));
    container.innerHTML = "";
    if (!posts || !posts.length) { container.innerHTML = '<div class="empty">No posts yet.</div>'; return; }
    posts.forEach(p => container.appendChild(renderPost(p, likedIds, repostedIds)));
  }
}

async function toggleFollow(user, currentlyFollowing) {
  if (!currentUser) return;
  const btn = document.getElementById("follow-btn");

  if (currentlyFollowing) {
    await sb.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", user.id);
    await sb.rpc("decrement_follower", { user_id: user.id }).catch(() => {});
    await sb.rpc("decrement_following", { user_id: currentUser.id }).catch(() => {});
    btn.textContent = "Follow";
    btn.className = "btn-primary";
  } else {
    await sb.from("follows").insert({ follower_id: currentUser.id, following_id: user.id });
    await sb.rpc("increment_follower", { user_id: user.id }).catch(() => {});
    await sb.rpc("increment_following", { user_id: currentUser.id }).catch(() => {});
    btn.textContent = "Following";
    btn.className = "btn-ghost active";

    await sb.from("notifications").insert({
      user_id: user.id,
      actor_id: currentUser.id,
      type: "follow",
    }).catch(() => {});
  }
  // Reload profile to update counts
  openProfile(user.username);
}

// ---- EDIT PROFILE ----
function showEditProfile(user) {
  const existing = document.getElementById("edit-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "edit-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-box">
      <button class="modal-close">&times;</button>
      <h3 style="margin-bottom:16px;font-size:16px;font-weight:700;">Edit Profile</h3>
      <form id="edit-profile-form" style="display:flex;flex-direction:column;gap:12px;">
        <input type="text" id="ep-display" placeholder="Display Name" value="${escHtml(user.display_name || "")}" maxlength="40" style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;outline:none;" />
        <textarea id="ep-bio" placeholder="Bio" maxlength="160" style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;outline:none;resize:vertical;min-height:70px;font-family:inherit;">${escHtml(user.bio || "")}</textarea>
        <input type="url" id="ep-github" placeholder="GitHub URL" value="${escHtml(user.github_url || "")}" style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;outline:none;" />
        <input type="url" id="ep-website" placeholder="Website URL" value="${escHtml(user.website_url || "")}" style="padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;outline:none;" />
        <button type="submit" class="btn-primary">Save</button>
        <p id="edit-error" class="form-error"></p>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector(".modal-overlay").addEventListener("click", () => modal.remove());
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());

  modal.querySelector("#edit-profile-form").addEventListener("submit", async e => {
    e.preventDefault();
    const updates = {
      display_name: document.getElementById("ep-display").value.trim(),
      bio: document.getElementById("ep-bio").value.trim(),
      github_url: document.getElementById("ep-github").value.trim(),
      website_url: document.getElementById("ep-website").value.trim(),
    };
    const { error } = await sb.from("profiles").update(updates).eq("id", currentUser.id);
    if (error) { document.getElementById("edit-error").textContent = error.message; return; }
    Object.assign(currentUser, updates);
    modal.remove();
    openProfile(currentUser.username);
  });
}

// ---- SUGGESTIONS ----
async function loadSuggestions() {
  if (!currentUser) return;
  const { data: followingRows } = await sb.from("follows").select("following_id").eq("follower_id", currentUser.id);
  const followingIds = (followingRows || []).map(f => f.following_id);
  followingIds.push(currentUser.id); // exclude self

  const { data: users } = await sb.from("profiles").select("id, username, display_name, avatar_url").not("id", "in", `(${followingIds.join(",")})`).limit(5);

  const container = document.getElementById("suggestions-list");
  container.innerHTML = "";
  (users || []).forEach(u => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `
      <div class="avatar" style="width:32px;height:32px;font-size:11px;">${avatarContent(u)}</div>
      <div class="sugg-info">
        <div class="sugg-name">${escHtml(u.display_name || u.username)}</div>
        <div class="sugg-handle">@${escHtml(u.username)}</div>
      </div>
      <button class="btn-ghost" data-uid="${u.id}">Follow</button>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      await sb.from("follows").insert({ follower_id: currentUser.id, following_id: u.id });
      await sb.rpc("increment_follower", { user_id: u.id }).catch(() => {});
      await sb.rpc("increment_following", { user_id: currentUser.id }).catch(() => {});
      item.remove();
    });
    item.querySelector(".sugg-name").addEventListener("click", () => openProfile(u.username));
    container.appendChild(item);
  });
}

// ---- HELPERS ----
function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatContent(text) {
  if (!text) return "";
  return escHtml(text).replace(/#([a-zA-Z0-9_]+)/g, '<span class="hashtag">#$1</span>');
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}
