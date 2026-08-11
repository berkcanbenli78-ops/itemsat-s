import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  push,
  onValue,
  query,
  orderByChild,
  limitToLast
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPHGoHTaI40XbuRhZveGNZGBT23wC5iSg",
  authDomain: "satis-13335.firebaseapp.com",
  databaseURL: "https://satis-13335-default-rtdb.firebaseio.com",
  projectId: "satis-13335",
  storageBucket: "satis-13335.firebasestorage.app",
  messagingSenderId: "824447562050",
  appId: "1:824447562050:web:ba76863cb1537d472658db",
  measurementId: "G-EZ3SXBVGYJ"
};

const MAX_SLOTS = 5;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
await setPersistence(auth, browserLocalPersistence);

const $ = (id) => document.getElementById(id);
const els = {
  authView: $("authView"),
  appView: $("appView"),
  loginTab: $("loginTab"),
  registerTab: $("registerTab"),
  loginForm: $("loginForm"),
  registerForm: $("registerForm"),
  loginEmail: $("loginEmail"),
  loginPassword: $("loginPassword"),
  registerName: $("registerName"),
  registerEmail: $("registerEmail"),
  registerPassword: $("registerPassword"),
  loginButton: $("loginButton"),
  registerButton: $("registerButton"),
  conversationSearch: $("conversationSearch"),
  conversationList: $("conversationList"),
  bridgeBadge: $("bridgeBadge"),
  profileAvatar: $("profileAvatar"),
  profileName: $("profileName"),
  profileRole: $("profileRole"),
  teamButton: $("teamButton"),
  logoutButton: $("logoutButton"),
  chatEmpty: $("chatEmpty"),
  chatContent: $("chatContent"),
  chatCustomer: $("chatCustomer"),
  chatMeta: $("chatMeta"),
  messages: $("messages"),
  replyForm: $("replyForm"),
  replyInput: $("replyInput"),
  sendButton: $("sendButton"),
  teamDialog: $("teamDialog"),
  closeTeamDialog: $("closeTeamDialog"),
  teamSlots: $("teamSlots"),
  toast: $("toast")
};

const state = {
  user: null,
  profile: null,
  slot: null,
  conversations: [],
  activeConversationId: null,
  unsubConversations: null,
  unsubMessages: null,
  unsubBridge: null,
  toastTimer: null
};

function showToast(message, type = "") {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`.trim();
  state.toastTimer = setTimeout(() => {
    els.toast.className = "toast";
  }, 3200);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function firstLetter(value) {
  const trimmed = (value || "?").trim();
  return (trimmed[0] || "?").toLocaleUpperCase("tr-TR");
}

function formatTime(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return "";
  const date = new Date(Number(timestamp));
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("tr-TR", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit" }
  ).format(date);
}

function friendlyError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-credential": "E-posta veya şifre yanlış.",
    "auth/invalid-email": "E-posta adresi geçersiz.",
    "auth/email-already-in-use": "Bu e-posta ile daha önce hesap oluşturulmuş.",
    "auth/weak-password": "Şifre çok zayıf. En az 6 karakter kullan.",
    "auth/operation-not-allowed": "Firebase'de Email/Password girişi henüz açılmamış.",
    "auth/too-many-requests": "Çok fazla deneme yapıldı. Biraz sonra tekrar dene.",
    "auth/network-request-failed": "İnternet bağlantısı kurulamadı.",
    "PERMISSION_DENIED": "Firebase veritabanı kuralları bu işlemi engelledi. Rules dosyasını kontrol et."
  };
  return map[code] || error?.message || "Beklenmeyen bir hata oluştu.";
}

function setAuthMode(mode) {
  const login = mode === "login";
  els.loginTab.classList.toggle("active", login);
  els.registerTab.classList.toggle("active", !login);
  els.loginForm.classList.toggle("hidden", !login);
  els.registerForm.classList.toggle("hidden", login);
}

async function getOwnSlot(uid) {
  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    try {
      const snap = await get(ref(db, `slots/${i}/uid`));
      if (snap.exists() && snap.val() === uid) return i;
    } catch {
      // Bu yol yalnızca UID taraması için okunuyor; diğer hataları sonraki slotta deneriz.
    }
  }
  return null;
}

async function claimSlot(user, displayName) {
  const createdAt = Date.now();

  for (let slot = 1; slot <= MAX_SLOTS; slot += 1) {
    const role = slot === 1 ? "admin" : "member";
    try {
      await set(ref(db, `slots/${slot}`), {
        uid: user.uid,
        role,
        createdAt
      });

      try {
        await set(ref(db, `profiles/${user.uid}`), {
          name: displayName,
          email: user.email,
          slot,
          role,
          createdAt
        });
      } catch (profileError) {
        try { await remove(ref(db, `slots/${slot}`)); } catch {}
        throw profileError;
      }

      return slot;
    } catch (error) {
      const isPermissionError = error?.code === "PERMISSION_DENIED" || /permission_denied/i.test(error?.message || "");
      if (!isPermissionError) throw error;
    }
  }

  return null;
}

async function loadProfile(uid, slot) {
  const snap = await get(ref(db, `profiles/${uid}`));
  if (!snap.exists()) throw new Error("Ekip profili bulunamadı.");
  const profile = snap.val();
  if (Number(profile.slot) !== Number(slot)) throw new Error("Ekip slotu ile profil eşleşmiyor.");
  return profile;
}

function resetRealtimeListeners() {
  for (const key of ["unsubConversations", "unsubMessages", "unsubBridge"]) {
    if (typeof state[key] === "function") state[key]();
    state[key] = null;
  }
}

function showAuth() {
  resetRealtimeListeners();
  state.user = null;
  state.profile = null;
  state.slot = null;
  state.conversations = [];
  state.activeConversationId = null;
  els.appView.classList.add("hidden");
  els.authView.classList.remove("hidden");
  els.teamDialog.close?.();
}

function showApp() {
  els.authView.classList.add("hidden");
  els.appView.classList.remove("hidden");

  const profile = state.profile;
  els.profileName.textContent = profile.name;
  els.profileRole.textContent = profile.role === "admin" ? "Yönetici" : `Ekip üyesi · Slot ${profile.slot}`;
  els.profileAvatar.textContent = firstLetter(profile.name);
  els.teamButton.classList.toggle("hidden", profile.role !== "admin");

  subscribeBridgeStatus();
  subscribeConversations();
}

function subscribeBridgeStatus() {
  if (state.unsubBridge) state.unsubBridge();
  state.unsubBridge = onValue(ref(db, "bridge/status"), (snap) => {
    const value = snap.val() || {};
    const lastSeen = Number(value.lastSeen || 0);
    const online = Boolean(value.online) && Date.now() - lastSeen < 45000;
    els.bridgeBadge.textContent = online ? "ItemSatış bağlı" : "ItemSatış bağlı değil";
    els.bridgeBadge.classList.toggle("online", online);
    els.bridgeBadge.classList.toggle("offline", !online);
  }, () => {
    els.bridgeBadge.textContent = "Bağlantı yok";
    els.bridgeBadge.classList.remove("online");
    els.bridgeBadge.classList.add("offline");
  });
}

function subscribeConversations() {
  if (state.unsubConversations) state.unsubConversations();
  const conversationsQuery = query(ref(db, "conversations"), orderByChild("updatedAt"), limitToLast(100));

  state.unsubConversations = onValue(conversationsQuery, (snap) => {
    const rows = [];
    snap.forEach((child) => rows.push({ id: child.key, ...child.val() }));
    rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    state.conversations = rows;
    renderConversations();

    if (state.activeConversationId) {
      const current = rows.find((item) => item.id === state.activeConversationId);
      if (current) updateChatHeader(current);
    }
  }, (error) => showToast(friendlyError(error), "error"));
}

function renderConversations() {
  const filter = els.conversationSearch.value.trim().toLocaleLowerCase("tr-TR");
  const rows = state.conversations.filter((item) => {
    const haystack = `${item.customerName || ""} ${item.lastMessage || ""}`.toLocaleLowerCase("tr-TR");
    return !filter || haystack.includes(filter);
  });

  els.conversationList.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-sidebar";
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = filter ? "Sonuç bulunamadı" : "Konuşma yok";
    span.textContent = filter ? "Başka bir müşteri adı ara." : "ItemSatış bağlantısı veri gönderince burada görünecek.";
    empty.append(strong, span);
    els.conversationList.append(empty);
    return;
  }

  for (const item of rows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `conversation-item${item.id === state.activeConversationId ? " active" : ""}`;
    button.dataset.id = item.id;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = firstLetter(item.customerName || "M");

    const copy = document.createElement("div");
    copy.className = "conversation-copy";
    const name = document.createElement("strong");
    const last = document.createElement("span");
    name.textContent = item.customerName || "Müşteri";
    last.textContent = item.lastMessage || "Yeni konuşma";
    copy.append(name, last);

    const side = document.createElement("div");
    side.className = "conversation-side";
    const time = document.createElement("span");
    time.textContent = formatTime(item.updatedAt);
    side.append(time);
    const unread = Number(item.unread || 0);
    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-dot";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      side.append(badge);
    }

    button.append(avatar, copy, side);
    button.addEventListener("click", () => openConversation(item.id));
    els.conversationList.append(button);
  }
}

function updateChatHeader(conversation) {
  els.chatCustomer.textContent = conversation.customerName || "Müşteri";
  els.chatMeta.textContent = conversation.orderLabel || "ItemSatış konuşması";
}

function openConversation(conversationId) {
  state.activeConversationId = conversationId;
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;

  updateChatHeader(conversation);
  els.chatEmpty.classList.add("hidden");
  els.chatContent.classList.remove("hidden");
  els.appView.classList.add("chat-open");
  renderConversations();

  if (state.unsubMessages) state.unsubMessages();
  const messagesQuery = query(ref(db, `messages/${conversationId}`), orderByChild("createdAt"), limitToLast(300));
  state.unsubMessages = onValue(messagesQuery, (snap) => {
    const messages = [];
    snap.forEach((child) => messages.push({ id: child.key, ...child.val() }));
    messages.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    renderMessages(messages);
  }, (error) => showToast(friendlyError(error), "error"));
}

function renderMessages(items) {
  els.messages.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "no-messages";
    empty.textContent = "Bu konuşmada henüz mesaj yok.";
    els.messages.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    const isStaff = item.sender === "staff";
    row.className = `message-row ${isStaff ? "staff" : "customer"}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const text = document.createElement("p");
    text.textContent = String(item.text || "");

    const meta = document.createElement("div");
    meta.className = "message-meta";
    const author = document.createElement("span");
    author.textContent = isStaff ? (item.authorName || "Ekip") : "Müşteri";
    const time = document.createElement("span");
    time.textContent = formatTime(item.createdAt);
    meta.append(author, time);

    bubble.append(text, meta);
    row.append(bubble);
    els.messages.append(row);
  }

  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

async function sendReply(text) {
  if (!state.activeConversationId || !state.user || !state.profile) return;
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 2000) return;

  const outboxRef = push(ref(db, "outbox"));
  await set(outboxRef, {
    conversationId: state.activeConversationId,
    text: cleanText,
    authorUid: state.user.uid,
    authorName: state.profile.name,
    createdAt: Date.now(),
    status: "queued"
  });
}

async function renderTeamDialog() {
  if (state.profile?.role !== "admin") return;

  const [slotsSnap, profilesSnap] = await Promise.all([
    get(ref(db, "slots")),
    get(ref(db, "profiles"))
  ]);

  const slots = slotsSnap.val() || {};
  const profiles = profilesSnap.val() || {};
  els.teamSlots.replaceChildren();

  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    const slotData = slots[String(i)] || null;
    const profile = slotData ? profiles[slotData.uid] : null;

    const row = document.createElement("div");
    row.className = `team-slot${slotData ? "" : " empty"}`;

    const number = document.createElement("div");
    number.className = "slot-number";
    number.textContent = String(i);

    const copy = document.createElement("div");
    copy.className = "team-slot-copy";
    const name = document.createElement("strong");
    const email = document.createElement("span");
    name.textContent = profile?.name || (slotData ? "Profil yüklenemedi" : "Boş slot");
    email.textContent = profile?.email || (i === 1 ? "Yönetici slotu" : "Yeni kayıt bekleniyor");
    copy.append(name, email);

    row.append(number, copy);

    if (slotData && i !== 1) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-button";
      removeButton.textContent = "Kaldır";
      removeButton.addEventListener("click", async () => {
        const label = profile?.name || "bu üyeyi";
        if (!confirm(`${label} ekipten kaldırılsın mı?`)) return;
        removeButton.disabled = true;
        try {
          await remove(ref(db, `slots/${i}`));
          if (slotData.uid) await remove(ref(db, `profiles/${slotData.uid}`));
          showToast("Üye ekipten kaldırıldı.", "success");
          await renderTeamDialog();
        } catch (error) {
          showToast(friendlyError(error), "error");
          removeButton.disabled = false;
        }
      });
      row.append(removeButton);
    }

    els.teamSlots.append(row);
  }
}

els.loginTab.addEventListener("click", () => setAuthMode("login"));
els.registerTab.addEventListener("click", () => setAuthMode("register"));

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginButton.disabled = true;
  els.loginButton.textContent = "Giriş yapılıyor...";
  try {
    await signInWithEmailAndPassword(auth, els.loginEmail.value.trim(), els.loginPassword.value);
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    els.loginButton.disabled = false;
    els.loginButton.textContent = "Giriş yap";
  }
});

els.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = normalizeName(els.registerName.value);
  if (displayName.length < 2) {
    showToast("Görünen ad en az 2 karakter olmalı.", "error");
    return;
  }

  els.registerButton.disabled = true;
  els.registerButton.textContent = "Hesap oluşturuluyor...";

  let createdUser = null;
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      els.registerEmail.value.trim(),
      els.registerPassword.value
    );
    createdUser = credential.user;

    const slot = await claimSlot(createdUser, displayName);
    if (!slot) {
      try { await deleteUser(createdUser); } catch {}
      createdUser = null;
      throw new Error("5 kişilik ekip dolu. Yeni kayıt alınmıyor.");
    }

    showToast(slot === 1 ? "Yönetici hesabı oluşturuldu." : `Kayıt tamamlandı. Slot ${slot}.`, "success");
  } catch (error) {
    showToast(friendlyError(error), "error");
    if (createdUser && auth.currentUser?.uid === createdUser.uid) {
      try { await signOut(auth); } catch {}
    }
  } finally {
    els.registerButton.disabled = false;
    els.registerButton.textContent = "Ekip hesabı oluştur";
  }
});

els.logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

els.conversationSearch.addEventListener("input", renderConversations);

els.replyInput.addEventListener("input", () => {
  els.replyInput.style.height = "auto";
  els.replyInput.style.height = `${Math.min(150, els.replyInput.scrollHeight)}px`;
});

els.replyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.replyForm.requestSubmit();
  }
});

els.replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.replyInput.value;
  if (!text.trim()) return;

  els.sendButton.disabled = true;
  try {
    await sendReply(text);
    els.replyInput.value = "";
    els.replyInput.style.height = "auto";
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    els.sendButton.disabled = false;
  }
});

els.teamButton.addEventListener("click", async () => {
  try {
    await renderTeamDialog();
    els.teamDialog.showModal();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
});

els.closeTeamDialog.addEventListener("click", () => els.teamDialog.close());
els.teamDialog.addEventListener("click", (event) => {
  if (event.target === els.teamDialog) els.teamDialog.close();
});

// Mobilde sohbet başlığına basınca listeye dön.
els.appView.addEventListener("click", (event) => {
  if (window.innerWidth > 760) return;
  const header = event.target.closest(".chat-header");
  if (!header) return;
  const rect = header.getBoundingClientRect();
  if (event.clientX - rect.left <= 58) els.appView.classList.remove("chat-open");
});

onAuthStateChanged(auth, async (user) => {
  resetRealtimeListeners();

  if (!user) {
    showAuth();
    return;
  }

  try {
    const slot = await getOwnSlot(user.uid);
    if (!slot) {
      await signOut(auth);
      showToast("Bu hesap 5 kişilik ekipte değil veya ekipten kaldırılmış.", "error");
      return;
    }

    const profile = await loadProfile(user.uid, slot);
    state.user = user;
    state.slot = slot;
    state.profile = profile;
    showApp();
  } catch (error) {
    await signOut(auth);
    showToast(friendlyError(error), "error");
  }
});
