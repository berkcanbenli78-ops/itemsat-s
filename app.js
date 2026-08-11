import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
  get,
  getDatabase,
  onValue,
  push,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

/* =========================================================
   FIREBASE
   ========================================================= */

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

const OWNER_EMAIL = "berkcanbenli78@gmail.com";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

await setPersistence(auth, browserLocalPersistence);

/* =========================================================
   HELPERS / STATE
   ========================================================= */

const $ = (id) => document.getElementById(id);

const state = {
  conversations: {},
  selectedConversationId: null,
  selectedConversation: null,

  currentProfile: null,

  bridgeOnline: false,
  firebaseConnected: false,

  unsubscribeBridge: null,
  unsubscribeConversations: null,
  unsubscribeMessages: null,
  unsubscribeFirebaseConnection: null,

  toastTimer: null
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function displayNameFromEmail(email) {
  const clean = normalizeEmail(email);

  if (!clean) {
    return "Ekip hesabı";
  }

  return clean.split("@")[0] || "Ekip hesabı";
}

function firstLetter(value) {
  const clean = String(value || "?").trim();
  return (clean.charAt(0) || "?").toUpperCase();
}

function formatClock(timestamp) {
  const numeric = Number(timestamp);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  try {
    return new Date(numeric).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function setAuthMessage(message = "", type = "error") {
  const box = $("authMessage");

  box.textContent = message;
  box.classList.toggle("success", type === "success");
}

function setAuthBusy(busy) {
  $("loginBtn").disabled = busy;
  $("registerBtn").disabled = busy;

  $("loginBtn").textContent = busy ? "Bekle..." : "Giriş yap";
  $("registerBtn").textContent = busy ? "Bekle..." : "Kayıt ol";
}

function showToast(message, type = "") {
  const toast = $("toast");

  toast.textContent = String(message || "");
  toast.className = "toast";

  if (type) {
    toast.classList.add(type);
  }

  toast.classList.remove("hidden");

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3200);
}

function readableFirebaseError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code.includes("auth/invalid-credential")) {
    return "E-posta veya panel şifresi yanlış.";
  }

  if (code.includes("auth/user-disabled")) {
    return "Bu Firebase hesabı devre dışı bırakılmış.";
  }

  if (code.includes("auth/email-already-in-use")) {
    return "Bu e-posta zaten kayıtlı. Kayıt ol yerine Giriş yap.";
  }

  if (code.includes("auth/weak-password")) {
    return "Şifre Firebase parola politikasına uymuyor. Daha güçlü bir şifre seç.";
  }

  if (code.includes("auth/invalid-email")) {
    return "E-posta adresi geçersiz.";
  }

  if (code.includes("auth/operation-not-allowed")) {
    return "Firebase Email/Password girişi kapalı. Authentication > Sign-in method bölümünden aç.";
  }

  if (code.includes("auth/too-many-requests")) {
    return "Çok fazla giriş denemesi yapıldı. Biraz sonra tekrar dene.";
  }

  if (code.includes("auth/network-request-failed")) {
    return "Firebase'e bağlanılamadı. İnternet bağlantısını kontrol et.";
  }

  if (
    code.includes("database/permission-denied") ||
    message.toLowerCase().includes("permission_denied") ||
    message.toLowerCase().includes("permission denied")
  ) {
    return "Firebase Database izni reddedildi. firebase-rules.json kurallarını Publish ettiğinden emin ol.";
  }

  return message || "Firebase işlemi başarısız.";
}

/* =========================================================
   TEAM MEMBERSHIP
   ========================================================= */

async function ensureTeamMember(user, registration = false) {
  if (!user) {
    throw new Error("Firebase kullanıcısı bulunamadı.");
  }

  const userRef = ref(db, `users/${user.uid}`);
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    state.currentProfile = snapshot.val();
    return state.currentProfile;
  }

  const email = normalizeEmail(user.email);

  const profile = {
    email,
    role: email === OWNER_EMAIL ? "owner" : "member",
    createdAt: Date.now()
  };

  try {
    /*
      Maksimum 5 kişi kontrolünü Firebase Security Rules yapıyor.
      5 kişi dolduysa bu set() işlemi permission-denied döndürür.
    */
    await set(userRef, profile);
  } catch (error) {
    if (registration) {
      /*
        Auth hesabını biraz önce oluşturduysak ve ekip slotu yoksa
        boşuna Firebase Authentication hesabı bırakmıyoruz.
      */
      try {
        await deleteUser(user);
      } catch {
        // Bu hata asıl hatayı değiştirmesin.
      }
    }

    if (
      String(error?.code || "").includes("permission-denied") ||
      String(error?.message || "").toLowerCase().includes("permission")
    ) {
      throw new Error(
        "Ekip hesabı oluşturulamadı. 5 kişilik ekip dolu olabilir veya Firebase Rules yanlış olabilir."
      );
    }

    throw error;
  }

  state.currentProfile = profile;
  return profile;
}

/* =========================================================
   AUTH
   ========================================================= */

async function login() {
  const email = normalizeEmail($("authEmail").value);
  const password = $("authPassword").value;

  setAuthMessage("");

  if (!email || !password) {
    setAuthMessage("E-posta ve panel şifresini yaz.");
    return;
  }

  setAuthBusy(true);

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);

    await ensureTeamMember(result.user, false);

    setAuthMessage("Giriş başarılı.", "success");
  } catch (error) {
    setAuthMessage(readableFirebaseError(error));

    /*
      Auth başarılı fakat kullanıcının ekip slotu yoksa oturumu kapat.
    */
    if (auth.currentUser && !state.currentProfile) {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
    }
  } finally {
    setAuthBusy(false);
  }
}

async function register() {
  const email = normalizeEmail($("authEmail").value);
  const password = $("authPassword").value;

  setAuthMessage("");

  if (!email) {
    setAuthMessage("E-posta adresini yaz.");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Şifre en az 6 karakter olmalı.");
    return;
  }

  setAuthBusy(true);

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    await ensureTeamMember(result.user, true);

    setAuthMessage("Hesap oluşturuldu.", "success");
  } catch (error) {
    setAuthMessage(readableFirebaseError(error));
  } finally {
    setAuthBusy(false);
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    showToast(readableFirebaseError(error), "error");
  }
}

/* =========================================================
   FIREBASE LISTENERS
   ========================================================= */

function stopSignedInListeners() {
  for (const key of [
    "unsubscribeBridge",
    "unsubscribeConversations",
    "unsubscribeMessages"
  ]) {
    if (typeof state[key] === "function") {
      state[key]();
      state[key] = null;
    }
  }
}

function startFirebaseConnectionListener() {
  if (typeof state.unsubscribeFirebaseConnection === "function") {
    state.unsubscribeFirebaseConnection();
  }

  state.unsubscribeFirebaseConnection = onValue(
    ref(db, ".info/connected"),
    (snapshot) => {
      state.firebaseConnected = snapshot.val() === true;

      $("firebaseConnectionText").textContent = state.firebaseConnected
        ? "Bağlı"
        : "Bağlantı yok";

      renderBridgeStatus();
    },
    () => {
      state.firebaseConnected = false;
      $("firebaseConnectionText").textContent = "Hata";
      renderBridgeStatus();
    }
  );
}

function startSignedInListeners() {
  stopSignedInListeners();

  state.unsubscribeBridge = onValue(
    ref(db, "bridge"),
    (snapshot) => {
      const bridge = snapshot.val() || {};

      const heartbeatAge = Date.now() - Number(bridge.lastSeen || 0);

      state.bridgeOnline =
        bridge.online === true &&
        Number.isFinite(heartbeatAge) &&
        heartbeatAge >= 0 &&
        heartbeatAge < 20_000;

      renderBridgeStatus();
    },
    (error) => {
      state.bridgeOnline = false;
      renderBridgeStatus();
      showToast(readableFirebaseError(error), "error");
    }
  );

  state.unsubscribeConversations = onValue(
    ref(db, "conversations"),
    (snapshot) => {
      state.conversations = snapshot.val() || {};
      renderConversationList();

      /*
        Seçili konuşmanın metadata'sı değişirse başlığı/URL'yi güncelle.
      */
      if (
        state.selectedConversationId &&
        state.conversations[state.selectedConversationId]
      ) {
        state.selectedConversation =
          state.conversations[state.selectedConversationId];

        renderSelectedConversationHeader();
      }
    },
    (error) => {
      showToast(readableFirebaseError(error), "error");
    }
  );
}

/* =========================================================
   UI
   ========================================================= */

function renderBridgeStatus() {
  const status = $("bridgeStatus");

  if (!state.firebaseConnected) {
    status.className = "status-offline";
    status.innerHTML = "<i></i> Firebase bağlantısı yok";
    $("bridgeConnectionText").textContent = "Firebase bekleniyor";
    return;
  }

  if (state.bridgeOnline) {
    status.className = "status-online";
    status.innerHTML = "<i></i> ItemSatış bağlı";
    $("bridgeConnectionText").textContent = "Canlı";
    return;
  }

  status.className = "status-offline";
  status.innerHTML = "<i></i> ItemSatış bağlı değil";
  $("bridgeConnectionText").textContent = "Köprü kapalı";
}

function renderAccount(user) {
  const email = normalizeEmail(user?.email);
  const displayName = displayNameFromEmail(email);

  $("accountAvatar").textContent = firstLetter(displayName);
  $("accountName").textContent = displayName;

  if (state.currentProfile?.role === "owner") {
    $("accountRole").textContent = "Yönetici";
  } else {
    $("accountRole").textContent = "Ekip üyesi";
  }
}

function conversationTimestamp(conversation) {
  const numeric = Number(conversation?.updatedAt || 0);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return 0;
}

function renderConversationList() {
  const container = $("conversationList");
  const query = $("searchInput").value.trim().toLocaleLowerCase("tr-TR");

  const entries = Object.entries(state.conversations)
    .filter(([, conversation]) => {
      const title = String(conversation?.title || "").toLocaleLowerCase("tr-TR");
      const preview = String(conversation?.preview || "").toLocaleLowerCase("tr-TR");

      return !query || title.includes(query) || preview.includes(query);
    })
    .sort((a, b) => {
      return conversationTimestamp(b[1]) - conversationTimestamp(a[1]);
    });

  $("conversationCount").textContent = String(entries.length);

  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "sidebar-empty";
    empty.innerHTML = `
      <strong>Konuşma yok</strong>
      <span>
        Köprü bağlanınca sohbetler burada görünür.
      </span>
    `;

    container.appendChild(empty);
    return;
  }

  for (const [conversationId, conversation] of entries) {
    const title = String(conversation?.title || "Konuşma");
    const preview = String(conversation?.preview || "ItemSatış sohbeti");

    const row = document.createElement("div");

    row.className =
      "conversation-row" +
      (conversationId === state.selectedConversationId ? " active" : "");

    row.dataset.conversationId = conversationId;

    row.innerHTML = `
      <div class="conversation-avatar">
        ${escapeHtml(firstLetter(title))}
      </div>

      <div class="conversation-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(preview)}</span>
      </div>

      <div class="conversation-time">
        ${escapeHtml(
          conversation?.timeText || formatClock(conversation?.updatedAt)
        )}
      </div>
    `;

    row.addEventListener("click", () => {
      selectConversation(conversationId, conversation);
    });

    container.appendChild(row);
  }
}

function renderSelectedConversationHeader() {
  const conversation = state.selectedConversation;

  if (!conversation) {
    return;
  }

  const title = String(conversation.title || "Konuşma");

  $("chatTitle").textContent = title;
  $("chatAvatar").textContent = firstLetter(title);

  $("chatSubtitle").textContent = state.bridgeOnline
    ? "ItemSatış sohbeti • canlı"
    : "ItemSatış sohbeti • köprü çevrimdışı";

  $("chatLiveStatus").classList.toggle("offline", !state.bridgeOnline);
}

function selectConversation(conversationId, conversation) {
  state.selectedConversationId = conversationId;
  state.selectedConversation = conversation;

  renderConversationList();
  renderSelectedConversationHeader();

  $("emptyState").classList.add("hidden");
  $("chatView").classList.remove("hidden");

  if (typeof state.unsubscribeMessages === "function") {
    state.unsubscribeMessages();
  }

  state.unsubscribeMessages = onValue(
    ref(db, `messages/${conversationId}`),
    (snapshot) => {
      renderMessages(snapshot.val() || {});
    },
    (error) => {
      showToast(readableFirebaseError(error), "error");
    }
  );
}

function renderMessages(rawMessages) {
  const container = $("messageList");

  const messages = Object.entries(rawMessages || {})
    .map(([id, value]) => ({
      id,
      ...(value || {})
    }))
    .filter((message) => String(message.text || "").trim())
    .sort((a, b) => {
      return Number(a.ts || 0) - Number(b.ts || 0);
    });

  container.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "messages-empty";
    empty.textContent = "Henüz mesaj bulunamadı.";
    container.appendChild(empty);
    return;
  }

  for (const message of messages) {
    const direction = message.direction === "out" ? "out" : "in";

    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${direction}`;

    const text = document.createElement("div");
    text.textContent = String(message.text || "");

    const meta = document.createElement("small");
    meta.textContent =
      direction === "out"
        ? "Gönderilen"
        : "Gelen";

    bubble.append(text, meta);
    container.appendChild(bubble);
  }

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

/* =========================================================
   SEND
   ========================================================= */

async function sendReply() {
  const text = $("replyInput").value.trim();

  if (!text) {
    return;
  }

  if (!auth.currentUser) {
    showToast("Firebase oturumu kapalı.", "error");
    return;
  }

  if (!state.selectedConversationId || !state.selectedConversation) {
    showToast("Önce bir konuşma seç.", "error");
    return;
  }

  if (!state.bridgeOnline) {
    showToast(
      "Köprü çevrimdışı. Mesaj kuyruğa alınabilir ama EXE açılana kadar ItemSatış'a gitmez.",
      "error"
    );
  }

  $("sendBtn").disabled = true;

  try {
    const jobRef = push(ref(db, "outbox"));

    await set(jobRef, {
      convId: state.selectedConversationId,

      title: String(state.selectedConversation.title || ""),
      lookupTitle: String(
        state.selectedConversation.lookupTitle ||
        state.selectedConversation.title ||
        ""
      ),

      url: String(state.selectedConversation.url || ""),

      text,
      status: "pending",

      createdAt: Date.now(),
      createdBy: auth.currentUser.uid,
      createdByEmail: normalizeEmail(auth.currentUser.email)
    });

    $("replyInput").value = "";
    updateReplyCounter();
    resizeReplyInput();

    showToast("Mesaj gönderme kuyruğuna alındı.", "success");
  } catch (error) {
    showToast(readableFirebaseError(error), "error");
  } finally {
    $("sendBtn").disabled = false;
  }
}

/* =========================================================
   EVENTS
   ========================================================= */

$("loginBtn").addEventListener("click", login);
$("registerBtn").addEventListener("click", register);
$("logoutBtn").addEventListener("click", logout);

$("togglePasswordBtn").addEventListener("click", () => {
  const input = $("authPassword");
  const isPassword = input.type === "password";

  input.type = isPassword ? "text" : "password";
  $("togglePasswordBtn").textContent = isPassword ? "Gizle" : "Göster";
});

$("authPassword").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    login();
  }
});

$("searchInput").addEventListener("input", renderConversationList);

$("sendBtn").addEventListener("click", sendReply);

$("replyInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendReply();
  }
});

$("replyInput").addEventListener("input", () => {
  updateReplyCounter();
  resizeReplyInput();
});

function updateReplyCounter() {
  const length = $("replyInput").value.length;
  $("charCount").textContent = `${length} / 1500`;
}

function resizeReplyInput() {
  const input = $("replyInput");

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopSignedInListeners();

    state.currentProfile = null;
    state.selectedConversation = null;
    state.selectedConversationId = null;
    state.conversations = {};
    state.bridgeOnline = false;

    $("authView").classList.remove("hidden");
    $("appView").classList.add("hidden");

    setAuthMessage("");
    return;
  }

  try {
    await ensureTeamMember(user, false);

    $("authView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    renderAccount(user);
    startFirebaseConnectionListener();
    startSignedInListeners();
  } catch (error) {
    setAuthMessage(readableFirebaseError(error));

    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }
});

/* =========================================================
   BOOT
   ========================================================= */

$("firebaseBootStatus").textContent =
  "Firebase hazır • Authentication ve Realtime Database bağlandı";

$("firebaseBootStatus").classList.add("ready");

updateReplyCounter();
