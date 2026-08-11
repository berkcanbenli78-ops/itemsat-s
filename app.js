import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  get,
  set,
  push
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

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

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const $ = id => document.getElementById(id);

let conversations = {};
let selectedId = null;
let selectedConversation = null;
let unsubscribeMessages = null;
let currentUserProfile = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function displayNameFromEmail(email) {
  return String(email || 'Ekip').split('@')[0] || 'Ekip';
}

function avatarLetter(value) {
  const s = String(value || '?').trim();
  return (s[0] || '?').toUpperCase();
}

async function ensureMember(user) {
  const usersRef = ref(db, 'users');
  const snapshot = await get(usersRef);
  const users = snapshot.val() || {};

  if (users[user.uid]) {
    currentUserProfile = users[user.uid];
    return;
  }

  if (Object.keys(users).length >= 5) {
    await signOut(auth);
    throw new Error('Ekip dolu. Maksimum 5 hesap kayıt olabilir.');
  }

  const isFirst = Object.keys(users).length === 0;
  const profile = {
    email: user.email || '',
    role: isFirst ? 'admin' : 'member',
    createdAt: Date.now()
  };

  await set(ref(db, `users/${user.uid}`), profile);
  currentUserProfile = profile;
}

async function login() {
  $('authMessage').textContent = '';
  try {
    await signInWithEmailAndPassword(
      auth,
      $('authEmail').value.trim(),
      $('authPassword').value
    );
  } catch (e) {
    $('authMessage').textContent = readableAuthError(e);
  }
}

async function register() {
  $('authMessage').textContent = '';
  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      $('authEmail').value.trim(),
      $('authPassword').value
    );
    await ensureMember(result.user);
  } catch (e) {
    $('authMessage').textContent = readableAuthError(e);
  }
}

function readableAuthError(e) {
  const code = String(e?.code || '');
  if (code.includes('invalid-credential')) return 'E-posta veya şifre yanlış.';
  if (code.includes('email-already-in-use')) return 'Bu e-posta zaten kayıtlı.';
  if (code.includes('weak-password')) return 'Şifre en az 6 karakter olmalı.';
  if (code.includes('invalid-email')) return 'Geçerli bir e-posta yaz.';
  return e?.message || 'İşlem başarısız.';
}

$('loginBtn').addEventListener('click', login);
$('registerBtn').addEventListener('click', register);
$('logoutBtn').addEventListener('click', () => signOut(auth));

$('authPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    $('authView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    selectedId = null;
    selectedConversation = null;
    return;
  }

  try {
    await ensureMember(user);
  } catch (e) {
    $('authMessage').textContent = e.message || String(e);
    return;
  }

  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');

  const display = displayNameFromEmail(user.email);
  $('accountAvatar').textContent = avatarLetter(display);
  $('accountName').textContent = display;
  $('accountRole').textContent =
    currentUserProfile?.role === 'admin' ? 'Yönetici' : 'Ekip üyesi';

  listenBridge();
  listenConversations();
});

function listenBridge() {
  onValue(ref(db, 'bridge'), snapshot => {
    const bridge = snapshot.val() || {};
    const online =
      bridge.online === true &&
      Date.now() - Number(bridge.lastSeen || 0) < 20_000;

    $('bridgeStatus').textContent =
      online ? '● ItemSatış bağlı' : '● ItemSatış bağlı değil';

    $('bridgeStatus').className = online ? 'online' : 'offline';
  });
}

function listenConversations() {
  onValue(ref(db, 'conversations'), snapshot => {
    conversations = snapshot.val() || {};
    renderConversationList();
  });
}

function renderConversationList() {
  const list = $('conversationList');
  const search = $('searchInput').value.trim().toLowerCase();

  const entries = Object.entries(conversations)
    .filter(([, value]) =>
      String(value?.title || '').toLowerCase().includes(search)
    )
    .sort((a, b) =>
      Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0)
    );

  $('conversationCount').textContent = String(entries.length);
  list.innerHTML = '';

  if (!entries.length) {
    list.innerHTML = `
      <div class="sideEmpty">
        <strong>Konuşma yok</strong>
        <span>Köprü bağlanınca sohbetler burada görünür.</span>
      </div>
    `;
    return;
  }

  for (const [id, value] of entries) {
    const title = value?.title || 'Konuşma';
    const row = document.createElement('div');
    row.className = 'conv' + (id === selectedId ? ' active' : '');

    row.innerHTML = `
      <div class="convAvatar">${escapeHtml(avatarLetter(title))}</div>
      <div class="convMain">
        <strong>${escapeHtml(title)}</strong>
        <span>ItemSatış sohbeti</span>
      </div>
      <div class="convTime">${formatTime(value?.updatedAt)}</div>
    `;

    row.addEventListener('click', () => selectConversation(id, value));
    list.appendChild(row);
  }
}

$('searchInput').addEventListener('input', renderConversationList);

function formatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('tr-TR', {
      hour:'2-digit',
      minute:'2-digit'
    });
  } catch {
    return '';
  }
}

function selectConversation(id, value) {
  selectedId = id;
  selectedConversation = value;

  renderConversationList();

  $('emptyState').classList.add('hidden');
  $('chatView').classList.remove('hidden');
  $('chatTitle').textContent = value?.title || 'Konuşma';
  $('chatSub').textContent = 'ItemSatış sohbeti';

  if (unsubscribeMessages) unsubscribeMessages();

  unsubscribeMessages = onValue(
    ref(db, `messages/${id}`),
    snapshot => renderMessages(snapshot.val() || {})
  );
}

function renderMessages(data) {
  const list = $('messageList');
  list.innerHTML = '';

  const messages = Object.values(data)
    .filter(Boolean)
    .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));

  if (!messages.length) {
    list.innerHTML = `
      <div class="sideEmpty">
        <strong>Henüz mesaj bulunamadı</strong>
        <span>Köprü bu konuşmanın mesajlarını okuyunca burada görünecek.</span>
      </div>
    `;
    return;
  }

  for (const message of messages) {
    const bubble = document.createElement('div');
    const direction = message.direction === 'out' ? 'out' : 'in';
    bubble.className = `messageBubble ${direction}`;

    bubble.innerHTML = `
      ${escapeHtml(message.text || '')}
      <small>${direction === 'out' ? 'Gönderilen' : 'Gelen'}</small>
    `;

    list.appendChild(bubble);
  }

  list.scrollTop = list.scrollHeight;
}

async function sendReply() {
  const text = $('replyInput').value.trim();
  if (!text || !selectedId || !selectedConversation || !auth.currentUser) return;

  $('sendBtn').disabled = true;

  try {
    const job = push(ref(db, 'outbox'));

    await set(job, {
      convId: selectedId,
      title: selectedConversation.title || '',
      lookupTitle: selectedConversation.lookupTitle || selectedConversation.title || '',
      url: selectedConversation.url || '',
      text,
      status: 'pending',
      createdAt: Date.now(),
      createdBy: auth.currentUser.uid
    });

    $('replyInput').value = '';
    autoResizeReply();
  } catch (e) {
    alert('Mesaj kuyruğa eklenemedi: ' + (e.message || e));
  } finally {
    $('sendBtn').disabled = false;
  }
}

$('sendBtn').addEventListener('click', sendReply);

$('replyInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendReply();
  }
});

function autoResizeReply() {
  const el = $('replyInput');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}
$('replyInput').addEventListener('input', autoResizeReply);
