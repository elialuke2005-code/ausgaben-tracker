'use strict';

// ── Defaults ────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name: 'Einkaufen',      emoji: '🛒' },
  { name: 'Essen & Trinken',emoji: '🍽️' },
  { name: 'Transport',      emoji: '🚗' },
  { name: 'Freizeit',       emoji: '🎉' },
  { name: 'Wohnen',         emoji: '🏠' },
  { name: 'Kleidung',       emoji: '👕' },
  { name: 'Gesundheit',     emoji: '💊' },
  { name: 'Technik',        emoji: '💻' },
  { name: 'Reise',          emoji: '✈️' },
  { name: 'Bildung',        emoji: '📚' },
  { name: 'Geschenke',      emoji: '🎁' },
  { name: 'Sonstiges',      emoji: '📌' },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Gehalt',         emoji: '💰' },
  { name: 'Freelance',      emoji: '💼' },
  { name: 'Mieteinnahmen',  emoji: '🏘️' },
  { name: 'Investitionen',  emoji: '📈' },
  { name: 'Geschenk',       emoji: '🎁' },
  { name: 'Steuerrückzahlung', emoji: '🏛️' },
  { name: 'Sonstiges',      emoji: '📌' },
];

const CATEGORY_KEYWORDS = {
  'Einkaufen':       ['einkauf','supermarkt','lidl','aldi','rewe','edeka','penny','netto','kaufland','dm','rossmann'],
  'Essen & Trinken': ['essen','trinken','restaurant','café','kaffee','pizza','burger','sushi','döner','bäcker','mcdo','mcdonald','subway'],
  'Transport':       ['transport','bus','bahn','taxi','uber','benzin','tanken','parkhaus','parken','ticket','zug','fahrrad'],
  'Freizeit':        ['freizeit','kino','konzert','sport','fitness','hobby','spiel','museum','theater','bar','club'],
  'Wohnen':          ['wohnen','miete','strom','gas','wasser','internet','versicherung','möbel','ikea'],
  'Kleidung':        ['kleidung','schuhe','klamotten','zara','hm','pull','nike','adidas'],
  'Gesundheit':      ['gesundheit','arzt','apotheke','medikament','brille','zahnarzt'],
  'Technik':         ['technik','handy','laptop','computer','amazon','saturn','mediamarkt','apple'],
  'Reise':           ['reise','hotel','flug','urlaub','ferien','airbnb','booking','hostel'],
  'Bildung':         ['bildung','buch','kurs','schule','uni','studium','weiterbildung'],
  'Geschenke':       ['geschenk','geburtstag','weihnachten','present'],
  // Income
  'Gehalt':          ['gehalt','lohn','einkommen','monatsgehalt'],
  'Freelance':       ['freelance','freiberuf','honorar','rechnung','auftrag'],
  'Mieteinnahmen':   ['mieteinnahme','untermiete','kaltmiete'],
  'Investitionen':   ['zinsen','dividende','invest','rendite','aktie','etf'],
  'Steuerrückzahlung': ['steuer','finanzamt','rückzahlung'],
};

const GERMAN_NUMS = {
  null:0,ein:1,eins:1,eine:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,
  acht:8,neun:9,zehn:10,elf:11,zwölf:12,dreizehn:13,vierzehn:14,fünfzehn:15,
  sechzehn:16,siebzehn:17,achtzehn:18,neunzehn:19,zwanzig:20,dreißig:30,
  vierzig:40,fünfzig:50,sechzig:60,siebzig:70,achtzig:80,neunzig:90,hundert:100,
};

const CHART_COLORS = [
  '#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#06B6D4','#F97316','#EC4899','#84CC16','#14B8A6',
  '#A78BFA','#FB923C',
];

// ── State ────────────────────────────────────────────────────────
let state = {
  budgets: [],
  currentBudgetId: null,
  categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
  incomeCategories: JSON.parse(JSON.stringify(DEFAULT_INCOME_CATEGORIES)),
  splitMembers: [],
  recurringPayments: [],
};

let selectedCategory = null;
let selectedType = 'expense'; // for add modal
let selectedPayment = null;   // 'cash' | 'card' | null
let splitEnabled = false;
let splitMode = 'ipaid';      // 'ipaid' | 'iowe'
let selectedSplitMembers = [];
let selectedOweToMember = null;
let statsType = 'expense';    // for stats view
let darkMode = false;
let accentColor = '#3B82F6';
let recognition = null;
let isListening = false;

// Selected month for home/stats view (YYYY-MM)
let selectedMonth = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
})();

function currentMonthStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

function shiftMonth(delta) {
  let [y, m] = selectedMonth.split('-').map(Number);
  m += delta;
  if (m > 12) { y++; m = 1; }
  if (m < 1)  { y--; m = 12; }
  const candidate = `${y}-${String(m).padStart(2,'0')}`;
  if (candidate > currentMonthStr()) return;
  selectedMonth = candidate;
  renderHome();
  renderStats();
}

// ── Storage ──────────────────────────────────────────────────────
function save() {
  try { localStorage.setItem('ausgaben_v2', JSON.stringify(state)); } catch(e) {}
  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (user) {
    db.collection('users').doc(user.uid).set({
      ...state,
      darkMode,
      accentColor,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
}

function migrateState() {
  state.budgets.forEach(b => {
    b.expenses.forEach(e => { if (!e.type) e.type = 'expense'; });
  });
  if (!state.incomeCategories || state.incomeCategories.length === 0)
    state.incomeCategories = JSON.parse(JSON.stringify(DEFAULT_INCOME_CATEGORIES));
  state.categories = state.categories.filter(c => c.name !== 'Gehalt');
  if (!state.splitMembers) state.splitMembers = [];
  if (!state.recurringPayments) state.recurringPayments = [];
}

function load() {
  try {
    const raw = localStorage.getItem('ausgaben_v2');
    if (raw) state = { ...state, ...JSON.parse(raw) };
    migrateState();
  } catch(e) {}
  darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) document.body.classList.add('dark');
  const savedColor = localStorage.getItem('accentColor') || '#3B82F6';
  accentColor = savedColor;
  setAccentColor(savedColor);
}

async function loadFromFirestore(uid) {
  let isNewUser = false;
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      const { darkMode: dm, accentColor: ac, updatedAt, userName, ...stateData } = doc.data();
      state = { ...state, ...stateData };
      migrateState();
      if (dm !== undefined) {
        darkMode = dm;
        localStorage.setItem('darkMode', dm);
        document.body.classList.toggle('dark', dm);
        const tog = document.getElementById('dark-mode-toggle');
        if (tog) tog.checked = dm;
      }
      if (ac !== undefined) {
        accentColor = ac;
        localStorage.setItem('accentColor', ac);
        setAccentColor(ac);
      }
      localStorage.setItem('ausgaben_v2', JSON.stringify(state));
      // Gespeicherten Namen anwenden
      const user = auth.currentUser;
      customUserName = userName || null;
      applyUserName(customUserName || (user && user.displayName) || null);
      // Name-Dialog zeigen wenn noch keiner gesetzt ist
      if (!userName && !(user && user.displayName)) showNameModal(true);
    } else {
      isNewUser = true;
      save();
    }
  } catch(e) {}
  if (state.budgets.length === 0) createBudget('Allgemein');
  if (!state.budgets.find(b => b.id === state.currentBudgetId))
    state.currentBudgetId = state.budgets[0].id;
  renderAll();
  if (isNewUser) showNameModal(true);
}

// ── Firebase Auth ─────────────────────────────────────────────────
function showAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('hidden');
}

function hideAuthOverlay() {
  document.getElementById('auth-overlay').classList.add('hidden');
}

let customUserName = null; // Benutzerdefinierter Name aus Firestore

function applyUserName(name) {
  customUserName = name || null;
  const user = typeof auth !== 'undefined' && auth.currentUser;
  const displayName = name || (user && user.displayName) || null;
  const firstName   = displayName ? displayName.split(' ')[0] : null;

  const nameEl  = document.getElementById('user-name');
  const greeting = document.querySelector('.header-greeting');
  if (nameEl)   nameEl.textContent  = displayName || 'Kein Name';
  if (greeting) greeting.textContent = firstName ? `Hallo, ${firstName} 👋` : 'Hallo 👋';
}

function updateUserHeader(user) {
  const accountBlock = document.getElementById('account-block');
  const infoBlock    = document.getElementById('info-block');
  if (accountBlock) accountBlock.style.display = '';
  if (infoBlock)    infoBlock.style.display = 'none';

  const emailEl  = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  const fallback = document.getElementById('user-avatar-fallback');
  if (emailEl) emailEl.textContent = user.email || '';
  if (user.photoURL && avatarEl) {
    avatarEl.src = user.photoURL;
    avatarEl.style.display = '';
    if (fallback) fallback.style.display = 'none';
  }

  applyUserName(customUserName);
}

function showNameModal(isFirstTime = false) {
  const modal   = document.getElementById('modal-name');
  const title   = document.getElementById('name-modal-title');
  const desc    = document.getElementById('name-modal-desc');
  const input   = document.getElementById('name-input');
  const closeBtn = document.getElementById('name-modal-close-btn');
  title.textContent = isFirstTime ? 'Wie heißt du?' : 'Name ändern';
  desc.textContent  = isFirstTime
    ? 'So personalisieren wir deinen Ausgaben-Tracker.'
    : 'Gib deinen neuen Namen ein.';
  closeBtn.style.display = isFirstTime ? 'none' : '';
  input.value = customUserName || '';
  document.getElementById('name-error').textContent = '';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

function closeNameModal() {
  document.getElementById('modal-name').classList.add('hidden');
}

async function saveUserName() {
  const input = document.getElementById('name-input');
  const name  = input.value.trim();
  if (!name) { document.getElementById('name-error').textContent = 'Bitte gib einen Namen ein.'; return; }
  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (user) {
    try {
      await db.collection('users').doc(user.uid).update({ userName: name });
    } catch(e) {}
  }
  applyUserName(name);
  closeNameModal();
  showToast('Name gespeichert');
}

function clearUserHeader() {
  const accountBlock = document.getElementById('account-block');
  const infoBlock    = document.getElementById('info-block');
  if (accountBlock) accountBlock.style.display = 'none';
  if (infoBlock)    infoBlock.style.display = '';

  const greeting = document.querySelector('.header-greeting');
  if (greeting) greeting.textContent = 'Hallo 👋';
}

function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) el.textContent = msg;
}

function initAuth() {
  if (typeof auth === 'undefined') return;

  auth.onAuthStateChanged(user => {
    if (user) {
      hideAuthOverlay();
      updateUserHeader(user);
      loadFromFirestore(user.uid);
    } else {
      clearUserHeader();
      showAuthOverlay();
    }
  });

  // Google Sign-In (Redirect ist auf mobilen PWAs zuverlässiger als Popup)
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  auth.getRedirectResult().then(result => {
    if (result && result.user) hideAuthOverlay();
  }).catch(err => setAuthError(err.message));

  document.getElementById('google-signin-btn').addEventListener('click', () => {
    auth.signInWithRedirect(googleProvider).catch(err => setAuthError(err.message));
  });

  // E-Mail Anmelden
  document.getElementById('email-login-btn').addEventListener('click', () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-password').value;
    setAuthError('');
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
      setAuthError(err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
        ? 'E-Mail oder Passwort falsch.'
        : err.message);
    });
  });

  // E-Mail Registrieren
  document.getElementById('email-register-btn').addEventListener('click', () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-password').value;
    setAuthError('');
    if (pass.length < 6) { setAuthError('Passwort muss mind. 6 Zeichen lang sein.'); return; }
    auth.createUserWithEmailAndPassword(email, pass).catch(err => {
      setAuthError(err.code === 'auth/email-already-in-use'
        ? 'E-Mail wird bereits verwendet.'
        : err.message);
    });
  });

  // Ohne Konto fortfahren
  document.getElementById('auth-skip-btn').addEventListener('click', () => {
    hideAuthOverlay();
  });

  // Anmelden aus Einstellungen
  document.getElementById('login-from-settings-btn')?.addEventListener('click', () => {
    showAuthOverlay();
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmt(n) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function toDateStr(d) { return d.toISOString().slice(0, 10); }
function todayStr() { return toDateStr(new Date()); }

function fmtDate(s) {
  const d = new Date(s + 'T12:00:00');
  const t = new Date(); t.setHours(12,0,0,0);
  const y = new Date(t); y.setDate(t.getDate()-1);
  if (s === toDateStr(t)) return 'Heute';
  if (s === toDateStr(y)) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday:'short', day:'numeric', month:'short' });
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── Dark Mode ────────────────────────────────────────────────────
function toggleDarkMode() {
  darkMode = !darkMode;
  document.body.classList.toggle('dark', darkMode);
  localStorage.setItem('darkMode', darkMode);
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = darkMode;
  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (user) db.collection('users').doc(user.uid).update({ darkMode }).catch(() => {});
}

// ── Accent Color ─────────────────────────────────────────────────
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      default: h = ((r-g)/d + 4)/6;
    }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h/30) % 12;
  const a = s * Math.min(l, 1-l);
  const f = n => l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
  const toHex = x => Math.round(x*255).toString(16).padStart(2,'0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

function setAccentColor(hex) {
  accentColor = hex;
  const [h, s, l] = hexToHSL(hex);
  const dark    = hslToHex(h, s, Math.max(l - 12, 10));
  const darker  = hslToHex(h, s, Math.max(l - 18, 8));
  const lighter = hslToHex(h, Math.min(s + 5, 100), Math.min(l + 14, 92));
  const mid     = darkMode ? hslToHex(h, Math.max(s-10,0), Math.max(l - 5, 25))  : hslToHex(h, Math.max(s-15,0), Math.min(l + 28, 88));
  const light   = darkMode ? hslToHex(h, Math.max(s-20,0), Math.max(l - 18, 12)) : hslToHex(h, Math.max(s-20,0), Math.min(l + 40, 96));

  // Shadow rgba
  const rr = parseInt(hex.slice(1,3),16);
  const gg = parseInt(hex.slice(3,5),16);
  const bb = parseInt(hex.slice(5,7),16);
  const shadow30 = `rgba(${rr},${gg},${bb},0.30)`;
  const shadow25 = `rgba(${rr},${gg},${bb},0.25)`;

  const root = document.documentElement;
  root.style.setProperty('--primary',       hex);
  root.style.setProperty('--primary-dark',  dark);
  root.style.setProperty('--primary-mid',   mid);
  root.style.setProperty('--primary-light', light);
  // Summary card gradient
  root.style.setProperty('--card-grad-start', lighter);
  root.style.setProperty('--card-grad-mid',   hex);
  root.style.setProperty('--card-grad-end',   darker);
  root.style.setProperty('--card-shadow',     shadow30);
  root.style.setProperty('--header-shadow',   shadow25);

  localStorage.setItem('accentColor', hex);
  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (user) db.collection('users').doc(user.uid).update({ accentColor: hex }).catch(() => {});
  // Sync picker UI if open
  const picker = document.getElementById('accent-custom-input');
  if (picker) picker.value = hex;
  document.querySelectorAll('.accent-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === hex);
  });
}

// ── Budget Ops ───────────────────────────────────────────────────
function currentBudget() {
  return state.budgets.find(b => b.id === state.currentBudgetId) || state.budgets[0];
}

function createBudget(name) {
  const b = { id: uid(), name, expenses: [] };
  state.budgets.push(b);
  state.currentBudgetId = b.id;
  save();
  return b;
}

function deleteBudget(id) {
  if (state.budgets.length <= 1) { showToast('Mindestens ein Budget muss vorhanden sein'); return; }
  state.budgets = state.budgets.filter(b => b.id !== id);
  if (state.currentBudgetId === id) state.currentBudgetId = state.budgets[0].id;
  save();
}

function switchBudget(id) { state.currentBudgetId = id; save(); }

// ── Recurring Payments ───────────────────────────────────────────
let recurringEditId   = null;
let recurringTypeMode = 'expense';
let recurringSelectedCat = null;

function processRecurringPayments() {
  if (!state.recurringPayments || state.recurringPayments.length === 0) return;
  const today = new Date();
  const currentDay   = today.getDate();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  let addedNames = [];

  state.recurringPayments.forEach(rp => {
    if (!rp.active) return;
    if (currentDay < rp.dayOfMonth) return;
    const lastMonth = rp.lastProcessed ? rp.lastProcessed.slice(0, 7) : '';
    if (lastMonth === currentMonth) return;

    const dayStr = String(rp.dayOfMonth).padStart(2, '0');
    addExpense({
      amount: rp.amount,
      category: rp.category,
      type: rp.type,
      note: rp.note || rp.name,
      date: `${currentMonth}-${dayStr}`,
      recurringId: rp.id,
    });
    rp.lastProcessed = `${currentMonth}-${dayStr}`;
    addedNames.push(rp.name);
  });

  if (addedNames.length > 0) {
    save();
    renderAll();
    showToast(`✅ ${addedNames.length} Dauerauftrag/-aufträge erfasst`);
  }
}

function renderRecurringSettings() {
  const el = document.getElementById('recurring-list');
  if (!el) return;
  if (!state.recurringPayments || state.recurringPayments.length === 0) {
    el.innerHTML = '<div style="padding:8px 16px;font-size:13px;color:var(--muted);">Noch keine Daueraufträge</div>';
    return;
  }
  el.innerHTML = state.recurringPayments.map(rp => {
    const sign = rp.type === 'income' ? '+' : '-';
    const color = rp.type === 'income' ? 'var(--income)' : 'var(--danger)';
    const suffix = rp.dayOfMonth === 1 ? 'sten' : rp.dayOfMonth === 2 ? 'ten' : rp.dayOfMonth === 3 ? 'ten' : '.';
    return `
    <div class="settings-row recurring-row" style="cursor:default;flex-wrap:wrap;gap:4px;">
      <span class="settings-row-icon">${rp.catEmoji || '🔁'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${esc(rp.name)}</div>
        <div style="font-size:12px;color:var(--muted);">Am ${rp.dayOfMonth}. jeden Monats</div>
      </div>
      <span style="font-weight:700;color:${color};font-size:15px;white-space:nowrap;">${sign}${fmt(rp.amount)}</span>
      <div style="display:flex;gap:6px;margin-left:4px;">
        <button class="recurring-edit-btn icon-btn" data-id="${rp.id}" title="Bearbeiten">✏️</button>
        <button class="recurring-del-btn  icon-btn" data-id="${rp.id}" title="Löschen">🗑</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.recurring-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openRecurringModal(btn.dataset.id)));
  el.querySelectorAll('.recurring-del-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteRecurring(btn.dataset.id)));
}

function openRecurringModal(id = null) {
  recurringEditId = id;
  const rp = id ? state.recurringPayments.find(r => r.id === id) : null;

  document.getElementById('recurring-modal-title').textContent = id ? 'Dauerauftrag bearbeiten' : 'Neuer Dauerauftrag';
  document.getElementById('recurring-name').value   = rp ? rp.name   : '';
  document.getElementById('recurring-amount').value = rp ? String(rp.amount).replace('.', ',') : '';
  document.getElementById('recurring-day').value    = rp ? rp.dayOfMonth : 1;
  document.getElementById('recurring-note').value   = rp ? (rp.note || '') : '';

  recurringTypeMode    = rp ? rp.type : 'expense';
  recurringSelectedCat = rp ? rp.category : null;
  updateRecurringTypeBtns();
  renderRecurringCatPills();

  document.getElementById('modal-recurring').classList.remove('hidden');
}

function closeRecurringModal() {
  document.getElementById('modal-recurring').classList.add('hidden');
}

function updateRecurringTypeBtns() {
  document.getElementById('recurring-type-expense-btn').classList.toggle('active', recurringTypeMode === 'expense');
  document.getElementById('recurring-type-income-btn').classList.toggle('active',  recurringTypeMode === 'income');
  renderRecurringCatPills();
}

function renderRecurringCatPills() {
  const cats = recurringTypeMode === 'income' ? state.incomeCategories : state.categories;
  const el   = document.getElementById('recurring-cat-pills');
  if (!el) return;
  el.innerHTML = cats.map(c => `
    <button class="cat-pill ${recurringSelectedCat === c.name ? 'selected' : ''}" data-cat="${esc(c.name)}">
      <span>${c.emoji}</span><span>${esc(c.name)}</span>
    </button>`).join('');
  el.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      recurringSelectedCat = btn.dataset.cat;
      renderRecurringCatPills();
    });
  });
}

function saveRecurring() {
  const name   = document.getElementById('recurring-name').value.trim();
  const amtRaw = document.getElementById('recurring-amount').value.replace(',', '.');
  const amount = parseFloat(amtRaw);
  const day    = parseInt(document.getElementById('recurring-day').value, 10);
  const note   = document.getElementById('recurring-note').value.trim();

  if (!name)              { showToast('Bitte Bezeichnung eingeben'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Bitte gültigen Betrag eingeben'); return; }
  if (isNaN(day) || day < 1 || day > 28) { showToast('Tag muss zwischen 1 und 28 liegen'); return; }
  if (!recurringSelectedCat)  { showToast('Bitte Kategorie wählen'); return; }

  const cats = recurringTypeMode === 'income' ? state.incomeCategories : state.categories;
  const catObj = cats.find(c => c.name === recurringSelectedCat) || { emoji: '🔁' };

  if (recurringEditId) {
    const rp = state.recurringPayments.find(r => r.id === recurringEditId);
    if (rp) Object.assign(rp, { name, amount, type: recurringTypeMode, category: recurringSelectedCat, catEmoji: catObj.emoji, dayOfMonth: day, note, active: true });
  } else {
    state.recurringPayments.push({
      id: uid(), name, amount, type: recurringTypeMode,
      category: recurringSelectedCat, catEmoji: catObj.emoji,
      dayOfMonth: day, note, active: true, lastProcessed: null,
    });
  }

  save();
  renderRecurringSettings();
  closeRecurringModal();
  showToast(recurringEditId ? 'Dauerauftrag aktualisiert' : 'Dauerauftrag gespeichert');
}

function deleteRecurring(id) {
  if (!confirm('Dauerauftrag wirklich löschen?')) return;
  state.recurringPayments = state.recurringPayments.filter(r => r.id !== id);
  save();
  renderRecurringSettings();
  showToast('Dauerauftrag gelöscht');
}

// ── Expense Ops ──────────────────────────────────────────────────
function addExpense(data) {
  const b = currentBudget();
  const e = { id: uid(), ...data };
  b.expenses.unshift(e);
  save();
  return e;
}

function deleteExpense(id) {
  const b = currentBudget();
  b.expenses = b.expenses.filter(e => e.id !== id);
  save();
}

const CAT_COLORS = {
  'Einkaufen':       '#FEF3C7', 'Essen & Trinken':  '#FEE2E2',
  'Transport':       '#DBEAFE', 'Freizeit':          '#EDE9FE',
  'Wohnen':          '#D1FAE5', 'Kleidung':          '#FCE7F3',
  'Gesundheit':      '#DCFCE7', 'Technik':           '#E0F2FE',
  'Reise':           '#CCFBF1', 'Bildung':           '#FEF9C3',
  'Geschenke':       '#FFE4E6', 'Gehalt':            '#D1FAE5',
  'Sonstiges':       '#F1F5F9',
};

function getCat(name) {
  return state.categories.find(c => c.name === name)
      || state.incomeCategories.find(c => c.name === name)
      || { name, emoji: '📌' };
}

function getCatColor(name) {
  return CAT_COLORS[name] || '#EFF6FF';
}

// ── Split Helpers ─────────────────────────────────────────────────
function toggleSplitSection() {
  splitEnabled = document.getElementById('split-toggle').checked;
  selectedSplitMembers = splitEnabled ? [...state.splitMembers] : [];
  selectedOweToMember = null;
  splitMode = 'ipaid';
  const sec = document.getElementById('split-section');
  if (sec) sec.classList.toggle('hidden', !splitEnabled);
  renderSplitDirectionToggle();
  renderSplitMembersInModal();
  updateSplitPreview();
}

function renderSplitDirectionToggle() {
  const el = document.getElementById('split-direction-toggle');
  if (!el) return;
  el.innerHTML = `
    <button class="split-dir-btn ${splitMode === 'ipaid' ? 'active' : ''}" data-mode="ipaid">💰 Ich habe gezahlt</button>
    <button class="split-dir-btn ${splitMode === 'iowe' ? 'active' : ''}" data-mode="iowe">🤝 Ich schulde</button>`;
  el.querySelectorAll('.split-dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      splitMode = btn.dataset.mode;
      selectedSplitMembers = splitMode === 'ipaid' ? [...state.splitMembers] : [];
      selectedOweToMember = null;
      renderSplitDirectionToggle();
      renderSplitMembersInModal();
      updateSplitPreview();
    });
  });
}

function renderOweToSelect() {
  const el = document.getElementById('split-members-list');
  if (!el) return;
  if (state.splitMembers.length === 0) {
    el.innerHTML = `<div class="split-no-members">Keine Personen hinterlegt — gehe zu Einstellungen → Personen.</div>`;
    return;
  }
  el.innerHTML = `<div class="field-label" style="margin:6px 0 8px;">Wem schulde ich?</div>` +
    state.splitMembers.map(name => `
      <label class="split-member-item ${selectedOweToMember === name ? 'selected' : ''}">
        <input type="radio" name="owe-to" class="split-owe-radio" data-name="${esc(name)}"
          ${selectedOweToMember === name ? 'checked' : ''}>
        <span>${esc(name)}</span>
      </label>`).join('');
  el.querySelectorAll('.split-owe-radio').forEach(rb => {
    rb.addEventListener('change', () => {
      selectedOweToMember = rb.dataset.name;
      // Refresh label styling
      el.querySelectorAll('.split-member-item').forEach(li => li.classList.remove('selected'));
      rb.closest('.split-member-item').classList.add('selected');
      updateSplitPreview();
    });
  });
}

function renderSplitMembersInModal() {
  if (splitMode === 'iowe') { renderOweToSelect(); return; }
  const el = document.getElementById('split-members-list');
  if (!el) return;
  if (state.splitMembers.length === 0) {
    el.innerHTML = `<div class="split-no-members">Keine Personen hinterlegt — gehe zu Einstellungen → Personen.</div>`;
    return;
  }
  el.innerHTML = state.splitMembers.map(name => `
    <label class="split-member-item">
      <input type="checkbox" class="split-member-cb" data-name="${esc(name)}"
        ${selectedSplitMembers.includes(name) ? 'checked' : ''}>
      <span>${esc(name)}</span>
    </label>`).join('');
  el.querySelectorAll('.split-member-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) { if (!selectedSplitMembers.includes(cb.dataset.name)) selectedSplitMembers.push(cb.dataset.name); }
      else { selectedSplitMembers = selectedSplitMembers.filter(n => n !== cb.dataset.name); }
      updateSplitPreview();
    });
  });
}

function updateSplitPreview() {
  const el = document.getElementById('split-preview');
  if (!el) return;
  const raw = document.getElementById('amount-input').value.replace(',', '.').trim();
  const amount = parseFloat(raw) || 0;
  if (!splitEnabled) { el.textContent = ''; return; }
  if (splitMode === 'iowe') {
    if (!selectedOweToMember) { el.innerHTML = `<span class="split-preview-label">Person auswählen</span>`; return; }
    el.innerHTML = `<span class="split-preview-label">Ich schulde</span> <span class="split-preview-name">${esc(selectedOweToMember)}</span> <span class="split-preview-amount">${fmt(amount)}</span>`;
  } else {
    if (selectedSplitMembers.length === 0) { el.textContent = ''; return; }
    const total = selectedSplitMembers.length + 1;
    const myShare = amount / total;
    el.innerHTML = `<span class="split-preview-label">Mein Anteil:</span> <span class="split-preview-amount">${fmt(myShare)}</span> <span class="split-preview-sub">(÷${total})</span>`;
  }
}

function calcSettlement() {
  // Returns { memberName: netAmount }
  // positive = they owe me, negative = I owe them
  const b = currentBudget();
  if (!b) return {};
  const balances = {};
  b.expenses.forEach(e => {
    if (!e.split?.enabled) return;
    if (e.split.mode === 'iowe') {
      // I owe this person
      const name = e.split.oweTo;
      if (name && !e.split.settled) {
        balances[name] = (balances[name] || 0) - e.split.myOwedAmount;
      }
    } else {
      // ipaid: they owe me
      (e.split.members || []).forEach(name => {
        if (!e.split.settled?.[name]) {
          balances[name] = (balances[name] || 0) + e.split.perShare;
        }
      });
    }
  });
  return balances;
}

function settleAll(memberName) {
  const b = currentBudget();
  if (!b) return;
  b.expenses.forEach(e => {
    if (!e.split?.enabled) return;
    if (e.split.mode === 'iowe') {
      if (e.split.oweTo === memberName) e.split.settled = true;
    } else {
      if ((e.split.members || []).includes(memberName)) {
        if (!e.split.settled) e.split.settled = {};
        e.split.settled[memberName] = true;
      }
    }
  });
  save();
  renderHome();
}

function renderSettlement() {
  const sec = document.getElementById('settlement-section');
  if (!sec) return;
  const balances = calcSettlement();
  const entries = Object.entries(balances).filter(([, v]) => v !== 0);
  if (entries.length === 0) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  const list = document.getElementById('settlement-list');
  list.innerHTML = entries.map(([name, net]) => {
    const iOwe = net < 0;
    const amount = Math.abs(net);
    const rowClass = iOwe ? 'settlement-row settlement-row-owe' : 'settlement-row';
    const avatarClass = iOwe ? 'settlement-avatar settlement-avatar-owe' : 'settlement-avatar';
    const subText = iOwe ? `Du schuldest ${esc(name)}` : 'schuldet dir';
    const amountClass = iOwe ? 'settlement-amount settlement-amount-owe' : 'settlement-amount';
    const amountStr = (iOwe ? '-' : '+') + fmt(amount);
    return `<div class="${rowClass}">
      <div class="${avatarClass}">${name.charAt(0).toUpperCase()}</div>
      <div class="settlement-info">
        <span class="settlement-name">${esc(name)}</span>
        <span class="settlement-sub">${subText}</span>
      </div>
      <span class="${amountClass}">${amountStr}</span>
      <button class="settle-btn ${iOwe ? 'settle-btn-owe' : ''}" data-name="${esc(name)}">✓ Beglichen</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.settle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(`Alle offenen Beträge mit ${btn.dataset.name} als beglichen markieren?`)) {
        settleAll(btn.dataset.name);
      }
    });
  });
}

// ── Split Members (Settings) ──────────────────────────────────────
function renderSplitMembersSettings() {
  const el = document.getElementById('split-members-settings');
  if (!el) return;
  if (state.splitMembers.length === 0) {
    el.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:var(--muted)">Noch keine Personen hinzugefügt.</div>';
  } else {
    el.innerHTML = state.splitMembers.map(name => `
      <div class="cat-manage-chip">
        <span class="split-settings-avatar">${name.charAt(0).toUpperCase()}</span>
        <span>${esc(name)}</span>
        <button class="cat-remove-btn" data-name="${esc(name)}">✕</button>
      </div>`).join('');
    el.querySelectorAll('.cat-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.splitMembers = state.splitMembers.filter(n => n !== btn.dataset.name);
        save(); renderSplitMembersSettings();
      });
    });
  }
}

function addSplitMember() {
  const input = document.getElementById('new-split-member');
  const name = input.value.trim();
  if (!name) { showToast('Bitte gib einen Namen ein'); return; }
  if (state.splitMembers.includes(name)) { showToast('Person bereits vorhanden'); return; }
  state.splitMembers.push(name);
  save();
  input.value = '';
  renderSplitMembersSettings();
  showToast(`"${name}" hinzugefügt`);
}

// ── Payment Method ────────────────────────────────────────────────
function setPaymentMethod(type) {
  selectedPayment = selectedPayment === type ? null : type; // toggle off if same
  document.querySelectorAll('.payment-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.payment === selectedPayment);
  });
}

// ── Navigation ───────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add('active');
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
  if (name === 'stats') renderStats();
}

// ── Render: Category Breakdown ───────────────────────────────────
function renderCategoryBreakdown(expenses) {
  const el = document.getElementById('cat-breakdown');
  if (!el) return;

  const onlyExpenses = expenses.filter(e => (e.type || 'expense') === 'expense');
  if (onlyExpenses.length === 0) {
    el.innerHTML = '<div class="cat-breakdown-empty">Keine Ausgaben in diesem Monat</div>';
    return;
  }

  const totals = {};
  onlyExpenses.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = sorted[0][1];

  el.innerHTML = sorted.map(([name, amount]) => {
    const cat = getCat(name);
    const barPct = Math.round((amount / max) * 100);
    const sharePct = Math.round((amount / grandTotal) * 100);
    return `<div class="cat-stat-row">
      <div class="cat-stat-icon" style="background:${getCatColor(name)}">${cat.emoji}</div>
      <div class="cat-stat-info">
        <div class="cat-stat-top">
          <span class="cat-stat-name">${esc(name)}</span>
          <div class="cat-stat-meta">
            <span class="cat-stat-pct">${sharePct}%</span>
            <span class="cat-stat-amount">${fmt(amount)}</span>
          </div>
        </div>
        <div class="cat-stat-bar-bg">
          <div class="cat-stat-bar" style="width:${barPct}%"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Render: Home ─────────────────────────────────────────────────
function renderHome() {
  const b = currentBudget();
  if (!b) return;

  document.getElementById('current-budget-name').textContent = b.name;

  const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const [selY, selM] = selectedMonth.split('-').map(Number);
  const monthName = MONTHS[selM - 1];
  const isCurrent = selectedMonth === currentMonthStr();
  const now = new Date();

  const headerDate = document.getElementById('header-date');
  if (headerDate) {
    headerDate.textContent = isCurrent
      ? `${WEEKDAYS[now.getDay()]}, ${now.getDate()}. ${monthName}`
      : `${monthName} ${selY}`;
  }

  document.getElementById('month-nav-label').textContent = `${monthName} ${selY}`;
  document.getElementById('next-month-btn').disabled = isCurrent;

  // Filter and compute
  const moAll = b.expenses.filter(e => e.date.startsWith(selectedMonth));
  const moExpenses = moAll.filter(e => (e.type || 'expense') === 'expense');
  const moIncome   = moAll.filter(e => e.type === 'income');
  const totalExpense = moExpenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome  = moIncome.reduce((s, e) => s + e.amount, 0);
  const saldo = totalIncome - totalExpense;

  // Summary card
  const saldoEl = document.getElementById('summary-amount');
  saldoEl.textContent = (saldo > 0 ? '+' : '') + fmt(saldo);
  saldoEl.className = 's-amount' + (saldo < 0 ? ' s-negative' : saldo > 0 ? ' s-positive' : '');

  const incomeEl = document.getElementById('summary-income');
  if (incomeEl) incomeEl.textContent = '+' + fmt(totalIncome);
  const expenseEl = document.getElementById('summary-expense');
  if (expenseEl) expenseEl.textContent = fmt(totalExpense);

  document.getElementById('summary-count').textContent = `${moAll.length} Buchung${moAll.length !== 1 ? 'en' : ''}`;

  renderCategoryBreakdown(moAll);
  renderSettlement();
  renderQuickCats();

  const recentLabel = document.getElementById('recent-label');
  const recentEl = document.getElementById('recent-list');
  const toShow = isCurrent ? b.expenses.slice(0, 6) : moAll;

  if (recentLabel) {
    recentLabel.textContent = isCurrent ? 'Letzte Buchungen' : `Alle Buchungen im ${monthName}`;
  }

  if (toShow.length === 0) {
    recentEl.innerHTML = `<div class="empty-state">
      <div class="es-icon">💸</div>
      <div class="es-title">${isCurrent ? 'Noch keine Einträge' : 'Keine Einträge'}</div>
      <div class="es-sub">${isCurrent ? 'Tippe auf + oder eine Kategorie, um zu starten' : 'In diesem Monat wurde nichts eingetragen'}</div>
    </div>`;
    return;
  }
  recentEl.innerHTML = toShow.map(expenseHTML).join('');
  bindExpenseClicks(recentEl);
}

function renderQuickCats() {
  const el = document.getElementById('quick-cats');
  el.innerHTML = state.categories.slice(0, 8).map(c => `
    <button class="quick-cat-btn" data-cat="${esc(c.name)}">
      <span class="qc-emoji">${c.emoji}</span>
      <span class="qc-name">${esc(c.name)}</span>
    </button>`).join('');
  el.querySelectorAll('.quick-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => openAddModal(btn.dataset.cat));
  });
}

function expenseHTML(e) {
  const c = getCat(e.category);
  const isIncome = e.type === 'income';
  const iconBg = isIncome ? '#D1FAE5' : getCatColor(e.category);
  const amountStr = (isIncome ? '+' : '') + fmt(e.amount);
  const payIcon = !isIncome && e.payment ? `<span class="payment-icon">${e.payment === 'cash' ? '💵' : '💳'}</span>` : '';

  let splitBadge = '', splitShareLine = '';
  if (e.split?.enabled) {
    if (e.split.mode === 'iowe') {
      splitBadge = `<span class="split-badge split-badge-owe">🤝 schulde</span>`;
      if (!e.split.settled) {
        splitShareLine = `<div class="expense-split-share expense-split-owe">Ich schulde ${esc(e.split.oweTo || '')}: ${fmt(e.split.myOwedAmount)}</div>`;
      }
    } else if (e.split.members?.length > 0) {
      splitBadge = `<span class="split-badge">÷${e.split.members.length + 1}</span>`;
      splitShareLine = `<div class="expense-split-share">Mein Anteil: ${fmt(e.split.perShare)}</div>`;
    }
  }

  return `<div class="expense-item" data-id="${e.id}">
    <div class="expense-icon" style="background:${iconBg}">${c.emoji}</div>
    <div class="expense-info">
      <div class="expense-cat">${esc(e.category)}${splitBadge}${payIcon}</div>
      ${e.note ? `<div class="expense-note">${esc(e.note)}</div>` : ''}
      ${splitShareLine}
    </div>
    <div class="expense-right">
      <div class="expense-amount${isIncome ? ' income-amount' : ''}">${amountStr}</div>
      <div class="expense-date">${fmtDate(e.date)}</div>
    </div>
  </div>`;
}

function bindExpenseClicks(container) {
  container.querySelectorAll('.expense-item').forEach(el => {
    el.addEventListener('click', () => openDetailModal(el.dataset.id));
  });
}

// ── Render: Stats (Donut Chart) ──────────────────────────────────
function buildDonutSVG(data, grandTotal) {
  const cx = 100, cy = 100, R = 80, r = 54;

  if (data.length === 0) {
    return `<text x="100" y="107" text-anchor="middle" fill="var(--muted)" font-size="13" font-family="-apple-system,sans-serif">Keine Daten</text>`;
  }

  // Single category: draw a full circle
  if (data.length === 1) {
    return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${data[0].color}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--surface)"/>`;
  }

  let startAngle = -Math.PI / 2;
  const paths = data.map(d => {
    const fraction = d.amount / grandTotal;
    const angle = fraction * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle);
    const x3 = cx + r * Math.cos(endAngle),   y3 = cy + r * Math.sin(endAngle);
    const x4 = cx + r * Math.cos(startAngle), y4 = cy + r * Math.sin(startAngle);

    const path = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
      'Z'
    ].join(' ');

    startAngle = endAngle;
    return `<path d="${path}" fill="${d.color}"/>`;
  });

  return paths.join('') + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--surface)"/>`;
}

function renderStats() {
  const b = currentBudget();
  if (!b) return;

  const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const [selY, selM] = selectedMonth.split('-').map(Number);
  const monthName = MONTHS[selM - 1];
  const isCurrent = selectedMonth === currentMonthStr();

  const statsLabel = document.getElementById('stats-month-label');
  if (statsLabel) statsLabel.textContent = `${monthName} ${selY}`;
  const statsNext = document.getElementById('stats-next-btn');
  if (statsNext) statsNext.disabled = isCurrent;

  const moFiltered = b.expenses.filter(e =>
    e.date.startsWith(selectedMonth) && (e.type || 'expense') === statsType
  );

  const totals = {};
  moFiltered.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
  const grandTotal = moFiltered.reduce((s, e) => s + e.amount, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  const data = sorted.map(([name, amount], i) => ({
    name, amount, color: CHART_COLORS[i % CHART_COLORS.length]
  }));

  // Update SVG
  const svgEl = document.getElementById('donut-svg');
  if (svgEl) svgEl.innerHTML = buildDonutSVG(data, grandTotal);

  const totalEl = document.getElementById('donut-total');
  if (totalEl) totalEl.textContent = fmt(grandTotal);

  const labelEl = document.getElementById('donut-label');
  if (labelEl) labelEl.textContent = statsType === 'income' ? 'Einnahmen' : 'Ausgaben';

  // Legend
  const legend = document.getElementById('stats-legend');
  if (!legend) return;

  if (data.length === 0) {
    legend.innerHTML = `<div class="stats-empty">Keine ${statsType === 'income' ? 'Einnahmen' : 'Ausgaben'} in ${monthName}</div>`;
    return;
  }

  legend.innerHTML = data.map(d => {
    const pct = grandTotal > 0 ? Math.round(d.amount / grandTotal * 100) : 0;
    return `<div class="legend-row">
      <span class="legend-dot" style="background:${d.color}"></span>
      <span class="legend-name">${esc(d.name)}</span>
      <span class="legend-pct">${pct}%</span>
      <span class="legend-amount">${fmt(d.amount)}</span>
    </div>`;
  }).join('');
}

// ── Render: History ──────────────────────────────────────────────
function renderHistory() {
  const b = currentBudget();
  const el = document.getElementById('history-content');
  if (!b || b.expenses.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="es-icon">📋</div>
      <div class="es-title">Keine Einträge</div>
      <div class="es-sub">Du hast in diesem Budget noch nichts eingetragen</div>
    </div>`;
    return;
  }
  const groups = {};
  b.expenses.forEach(e => { (groups[e.date] = groups[e.date] || []).push(e); });
  const dates = Object.keys(groups).sort((a,b) => b.localeCompare(a));
  el.innerHTML = dates.map(d => {
    const exs = groups[d];
    const dayNet = exs.reduce((s,e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
    const dayNetStr = (dayNet > 0 ? '+' : '') + fmt(dayNet);
    const netClass = dayNet > 0 ? 'dg-total income-amount' : 'dg-total';
    return `<div class="date-group">
      <div class="date-group-header">
        <span class="dg-label">${fmtDate(d)}</span>
        <span class="${netClass}">${dayNetStr}</span>
      </div>
      <div class="expense-list">${exs.map(expenseHTML).join('')}</div>
    </div>`;
  }).join('');
  bindExpenseClicks(el);
}

// ── Foto & OCR ───────────────────────────────────────────────────
let currentPhotoBase64 = null;

function compressImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.55));
    };
    img.src = url;
  });
}

function parseAmountFromOCR(text) {
  const keywords = ['gesamt','summe','total','zu zahlen','endbetrag','betrag','zwischensumme','sum'];
  const lines = text.split('\n');
  const regex = /(\d{1,4}[.,]\d{2})/g;
  let best = null, bestScore = -1;

  lines.forEach(line => {
    const lower = line.toLowerCase();
    const isKey = keywords.some(k => lower.includes(k));
    const matches = [...line.matchAll(regex)].map(m => parseFloat(m[1].replace(',','.')));
    if (!matches.length) return;
    const max = Math.max(...matches.filter(v => v >= 0.5 && v < 9999));
    if (isNaN(max)) return;
    const score = isKey ? max + 100000 : max;
    if (score > bestScore) { bestScore = score; best = max; }
  });
  return best;
}

async function loadTesseract() {
  if (window.Tesseract) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function setScanStatus(msg, isError = false) {
  const el = document.getElementById('scan-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : 'var(--primary)';
}

function showPhotoPreview(base64) {
  currentPhotoBase64 = base64;
  const wrap    = document.getElementById('photo-preview-wrap');
  const preview = document.getElementById('photo-preview');
  if (!wrap || !preview) return;
  preview.src = base64;
  wrap.classList.remove('hidden');
}

function clearPhoto() {
  currentPhotoBase64 = null;
  const wrap = document.getElementById('photo-preview-wrap');
  if (wrap) wrap.classList.add('hidden');
  const input = document.getElementById('photo-input');
  if (input) input.value = '';
  setScanStatus('');
}

function initPhotoEvents() {
  const input = document.getElementById('photo-input');
  if (!input) return;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    setScanStatus('Bild wird vorbereitet …');
    const b64 = await compressImage(file);
    showPhotoPreview(b64);
    setScanStatus('');
  });

  document.getElementById('photo-remove-btn')?.addEventListener('click', clearPhoto);

  document.getElementById('photo-scan-btn')?.addEventListener('click', async () => {
    // Wenn noch kein Foto vorhanden → Kamera öffnen
    if (!currentPhotoBase64) {
      document.getElementById('photo-input').click();
      // Warte bis Foto ausgewählt, dann scannen
      const waitForPhoto = () => new Promise(resolve => {
        const check = setInterval(() => {
          if (currentPhotoBase64) { clearInterval(check); resolve(); }
        }, 300);
        setTimeout(() => { clearInterval(check); resolve(); }, 15000);
      });
      await waitForPhoto();
      if (!currentPhotoBase64) return;
    }

    setScanStatus('⏳ Lädt OCR-Engine …');
    try {
      await loadTesseract();
      setScanStatus('🔍 Erkenne Text …');
      const result = await Tesseract.recognize(currentPhotoBase64, 'deu+eng');
      const amount = parseAmountFromOCR(result.data.text);
      if (amount !== null) {
        const formatted = String(amount.toFixed(2)).replace('.', ',');
        document.getElementById('amount-input').value = formatted;
        setScanStatus(`✅ Betrag erkannt: ${formatted} €`);
        updateSplitPreview();
      } else {
        setScanStatus('Kein Betrag gefunden – bitte manuell eingeben.', true);
      }
    } catch (e) {
      setScanStatus('Fehler beim Scannen.', true);
    }
  });
}

// ── Render: Settings ─────────────────────────────────────────────
function renderSettings() {
  renderSettingsBudgets();
  renderSplitMembersSettings();
  renderCatManagement();
  renderRecurringSettings();
  renderIncomeCatManagement();
  // Sync dark mode toggle
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = darkMode;
  // Sync accent color
  renderAccentColorPicker();
}

function renderAccentColorPicker() {
  const el = document.getElementById('accent-swatches');
  if (!el) return;
  const PRESETS = [
    { color: '#3B82F6', label: 'Blau' },
    { color: '#10B981', label: 'Grün' },
    { color: '#8B5CF6', label: 'Lila' },
    { color: '#EF4444', label: 'Rot' },
    { color: '#F97316', label: 'Orange' },
    { color: '#EC4899', label: 'Pink' },
    { color: '#06B6D4', label: 'Cyan' },
  ];
  el.innerHTML = PRESETS.map(p => `
    <button class="accent-swatch ${accentColor === p.color ? 'active' : ''}"
      data-color="${p.color}" style="background:${p.color}" title="${p.label}"></button>`).join('') +
    `<label class="accent-swatch accent-swatch-custom" title="Eigene Farbe">
      <span>✏️</span>
      <input type="color" id="accent-custom-input" value="${accentColor}" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none;">
    </label>`;

  el.querySelectorAll('.accent-swatch[data-color]').forEach(sw => {
    sw.addEventListener('click', () => setAccentColor(sw.dataset.color));
  });
  const customLabel = el.querySelector('.accent-swatch-custom');
  const customInput = el.querySelector('#accent-custom-input');
  if (customLabel && customInput) {
    customLabel.addEventListener('click', () => customInput.click());
    customInput.addEventListener('input', () => setAccentColor(customInput.value));
  }
}

function renderSettingsBudgets() {
  const el = document.getElementById('settings-budgets-list');
  el.innerHTML = state.budgets.map(b => `
    <div class="settings-row ${b.id === state.currentBudgetId ? 'active-budget' : ''}"
         data-switch="${b.id}" style="cursor:pointer;">
      <span class="settings-row-icon">💼</span>
      <span class="settings-row-text">${esc(b.name)}
        <span style="font-size:12px;color:var(--muted);margin-left:6px;">${b.expenses.length} Einträge</span>
      </span>
      ${b.id === state.currentBudgetId ? '<span style="color:var(--primary);font-weight:700;">✓</span>' : ''}
      ${state.budgets.length > 1 ? `<button class="budget-del-btn" data-del="${b.id}">✕</button>` : ''}
    </div>`).join('');

  el.querySelectorAll('[data-switch]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-del]')) return;
      switchBudget(row.dataset.switch);
      renderAll();
    });
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = state.budgets.find(b => b.id === btn.dataset.del)?.name;
      if (confirm(`Budget "${name}" wirklich löschen?\nAlle Ausgaben gehen verloren.`)) {
        deleteBudget(btn.dataset.del);
        renderAll();
      }
    });
  });
}

function renderCatManagement() {
  const el = document.getElementById('cat-management');
  el.innerHTML = state.categories.map(c => `
    <div class="cat-manage-chip">
      <span>${c.emoji}</span>
      <span>${esc(c.name)}</span>
      <button class="cat-remove-btn" data-name="${esc(c.name)}" title="Löschen">✕</button>
    </div>`).join('');
  el.querySelectorAll('.cat-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.categories.length <= 1) { showToast('Mindestens eine Kategorie muss vorhanden sein'); return; }
      state.categories = state.categories.filter(c => c.name !== btn.dataset.name);
      save();
      renderCatManagement();
    });
  });
}

function renderIncomeCatManagement() {
  const el = document.getElementById('icat-management');
  if (!el) return;
  el.innerHTML = state.incomeCategories.map(c => `
    <div class="cat-manage-chip">
      <span>${c.emoji}</span>
      <span>${esc(c.name)}</span>
      <button class="cat-remove-btn" data-name="${esc(c.name)}" title="Löschen">✕</button>
    </div>`).join('');
  el.querySelectorAll('.cat-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.incomeCategories.length <= 1) { showToast('Mindestens eine Kategorie muss vorhanden sein'); return; }
      state.incomeCategories = state.incomeCategories.filter(c => c.name !== btn.dataset.name);
      save();
      renderIncomeCatManagement();
    });
  });
}

function renderAll() { renderHome(); renderHistory(); renderSettings(); renderStats(); }

// ── Modal: Add Expense ────────────────────────────────────────────
function openAddModal(preselect = null, preType = null) {
  selectedCategory = preselect;
  selectedType = preType || 'expense';
  selectedPayment = null;
  splitEnabled = false;
  splitMode = 'ipaid';
  selectedSplitMembers = [];
  selectedOweToMember = null;
  document.getElementById('amount-input').value = '';
  document.getElementById('note-input').value = '';
  document.getElementById('date-input').value = todayStr();
  document.getElementById('voice-status').textContent = '';
  // Reset payment toggle
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  // Show/hide payment section based on type
  const paySection = document.getElementById('payment-section');
  if (paySection) paySection.classList.toggle('hidden', selectedType === 'income');
  // Reset split toggle
  const splitToggle = document.getElementById('split-toggle');
  if (splitToggle) splitToggle.checked = false;
  const splitSec = document.getElementById('split-section');
  if (splitSec) splitSec.classList.add('hidden');
  const splitPreview = document.getElementById('split-preview');
  if (splitPreview) splitPreview.textContent = '';
  setTypeToggle(selectedType);
  renderCatPills(preselect);
  document.getElementById('modal-add').classList.remove('hidden');
  setTimeout(() => document.getElementById('amount-input').focus(), 320);
}

function closeAddModal() {
  document.getElementById('modal-add').classList.add('hidden');
  stopVoice();
  selectedCategory = null;
  clearPhoto();
}

function setTypeToggle(type) {
  selectedType = type;
  selectedCategory = null;
  const expBtn = document.getElementById('type-expense-btn');
  const incBtn = document.getElementById('type-income-btn');
  if (!expBtn || !incBtn) return;
  expBtn.classList.toggle('active', type === 'expense');
  incBtn.classList.toggle('active', type === 'income');
  // Update modal title
  const title = document.querySelector('#modal-add .modal-title');
  if (title) title.textContent = type === 'income' ? 'Neue Einnahme' : 'Neue Ausgabe';
  // Show/hide payment method (only for expenses)
  const paySection = document.getElementById('payment-section');
  if (paySection) paySection.classList.toggle('hidden', type === 'income');
  // Re-render pills for the correct category list
  renderCatPills(null);
}

function renderCatPills(selected) {
  const cats = selectedType === 'income' ? state.incomeCategories : state.categories;
  const el = document.getElementById('cat-pills');
  el.innerHTML = cats.map(c => `
    <button class="cat-pill ${c.name === selected ? 'selected' : ''}" data-name="${esc(c.name)}">
      ${c.emoji} ${esc(c.name)}
    </button>`).join('');
  el.querySelectorAll('.cat-pill').forEach(p => {
    p.addEventListener('click', () => {
      selectedCategory = p.dataset.name;
      el.querySelectorAll('.cat-pill').forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
    });
  });
}

function saveExpense() {
  const raw = document.getElementById('amount-input').value.replace(',', '.').trim();
  const amount = parseFloat(raw);
  if (!amount || amount <= 0 || isNaN(amount)) {
    showToast('Bitte gib einen gültigen Betrag ein');
    document.getElementById('amount-input').focus();
    return;
  }
  if (!selectedCategory) { showToast('Bitte wähle eine Kategorie aus'); return; }

  const note = document.getElementById('note-input').value.trim();
  const date = document.getElementById('date-input').value || todayStr();

  let splitData = null;
  if (splitEnabled && selectedType === 'expense') {
    if (splitMode === 'iowe' && selectedOweToMember) {
      splitData = { enabled: true, mode: 'iowe', oweTo: selectedOweToMember, myOwedAmount: amount, settled: false };
    } else if (splitMode === 'ipaid' && selectedSplitMembers.length > 0) {
      const total = selectedSplitMembers.length + 1;
      const perShare = Math.round((amount / total) * 100) / 100;
      const settled = {};
      selectedSplitMembers.forEach(n => { settled[n] = false; });
      splitData = { enabled: true, mode: 'ipaid', members: [...selectedSplitMembers], perShare, settled };
    }
  }

  addExpense({ amount, category: selectedCategory, note, date, type: selectedType, payment: selectedPayment, split: splitData, photo: currentPhotoBase64 || null });
  closeAddModal();
  renderAll();
  const label = selectedType === 'income' ? 'Einnahme' : 'Ausgabe';
  showToast(`${label} ${fmt(amount)} gespeichert ✓`);
}

// ── Modal: Expense Detail ─────────────────────────────────────────
function openDetailModal(expenseId) {
  const b = currentBudget();
  const e = b.expenses.find(x => x.id === expenseId);
  if (!e) return;
  const c = getCat(e.category);
  const isIncome = e.type === 'income';
  document.getElementById('detail-icon').textContent = c.emoji;
  document.getElementById('detail-cat').textContent = e.category + (isIncome ? ' (Einnahme)' : '');
  const amtEl = document.getElementById('detail-amount');
  amtEl.textContent = (isIncome ? '+' : '') + fmt(e.amount);
  amtEl.style.color = isIncome ? '#10B981' : '';
  document.getElementById('detail-date').textContent = fmtDate(e.date) + ' · ' + new Date(e.date+'T12:00:00').toLocaleDateString('de-DE', {day:'numeric',month:'long',year:'numeric'});
  document.getElementById('detail-note').textContent = e.note || '—';
  // Payment method
  const payEl = document.getElementById('detail-payment');
  if (payEl) {
    if (e.payment === 'cash') { payEl.textContent = '💵 Bar'; payEl.style.display = ''; }
    else if (e.payment === 'card') { payEl.textContent = '💳 Karte'; payEl.style.display = ''; }
    else { payEl.textContent = ''; payEl.style.display = 'none'; }
  }
  // Split info
  const splitEl = document.getElementById('detail-split');
  if (splitEl) {
    if (e.split?.enabled) {
      if (e.split.mode === 'iowe') {
        splitEl.textContent = `🤝 Ich schulde ${e.split.oweTo}: ${fmt(e.split.myOwedAmount)}${e.split.settled ? ' ✓' : ''}`;
        splitEl.style.display = '';
      } else if (e.split.members?.length > 0) {
        const unsettled = e.split.members.filter(n => !e.split.settled?.[n]);
        splitEl.textContent = `👥 Aufgeteilt mit ${e.split.members.join(', ')} · Mein Anteil: ${fmt(e.split.perShare)}${unsettled.length === 0 ? ' ✓' : ''}`;
        splitEl.style.display = '';
      } else { splitEl.style.display = 'none'; }
    } else { splitEl.style.display = 'none'; }
  }
  // Foto
  const photoWrap = document.getElementById('detail-photo-wrap');
  const photoImg  = document.getElementById('detail-photo');
  if (photoWrap && photoImg) {
    if (e.photo) {
      photoImg.src = e.photo;
      photoWrap.classList.remove('hidden');
    } else {
      photoWrap.classList.add('hidden');
    }
  }

  document.getElementById('detail-del-btn').dataset.id = e.id;
  document.getElementById('modal-detail').classList.remove('hidden');
}

function closeDetailModal() { document.getElementById('modal-detail').classList.add('hidden'); }

// ── Modal: Budget Selector ────────────────────────────────────────
function openBudgetModal() {
  renderBudgetModalList();
  document.getElementById('modal-budget').classList.remove('hidden');
}

function closeBudgetModal() { document.getElementById('modal-budget').classList.add('hidden'); }

function renderBudgetModalList() {
  const el = document.getElementById('budget-list');
  el.innerHTML = state.budgets.map(b => {
    const totalExp = b.expenses.filter(e => (e.type||'expense')==='expense').reduce((s,e)=>s+e.amount,0);
    const totalInc = b.expenses.filter(e => e.type==='income').reduce((s,e)=>s+e.amount,0);
    const saldo = totalInc - totalExp;
    return `<div class="budget-item ${b.id === state.currentBudgetId ? 'active-budget' : ''}" data-id="${b.id}">
      <span style="font-size:22px;">💼</span>
      <div style="flex:1;min-width:0;">
        <div class="budget-item-name">${esc(b.name)}</div>
        <div class="budget-item-sub">${b.expenses.length} Einträge · Saldo: ${(saldo>=0?'+':'')}${fmt(saldo)}</div>
      </div>
      ${b.id === state.currentBudgetId ? '<span class="budget-item-check">✓</span>' : ''}
    </div>`;
  }).join('');
  el.querySelectorAll('.budget-item').forEach(item => {
    item.addEventListener('click', () => {
      switchBudget(item.dataset.id);
      closeBudgetModal();
      renderAll();
    });
  });
}

function createNewBudget() {
  const input = document.getElementById('new-budget-input');
  const name = input.value.trim();
  if (!name) { showToast('Bitte gib einen Namen ein'); return; }
  createBudget(name);
  input.value = '';
  closeBudgetModal();
  renderAll();
  showToast(`Budget "${name}" erstellt`);
}

// ── Voice Input ───────────────────────────────────────────────────
function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { document.getElementById('voice-btn').style.display = 'none'; return; }
  recognition = new SR();
  recognition.lang = 'de-DE';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = e => {
    const text = e.results[0][0].transcript;
    document.getElementById('voice-status').textContent = `"${text}"`;
    parseVoice(text);
    setListening(false);
  };
  recognition.onerror = () => {
    document.getElementById('voice-status').textContent = 'Eingabe fehlgeschlagen – bitte tippen';
    setListening(false);
  };
  recognition.onend = () => setListening(false);
}

function toggleVoice() { isListening ? stopVoice() : startVoice(); }

function startVoice() {
  if (!recognition) return;
  try { recognition.start(); setListening(true); document.getElementById('voice-status').textContent = 'Bitte sprechen…'; }
  catch(e) {}
}

function stopVoice() {
  if (!recognition) return;
  try { recognition.stop(); } catch(e) {}
  setListening(false);
}

function setListening(v) {
  isListening = v;
  document.getElementById('voice-btn').classList.toggle('listening', v);
  if (!v && document.getElementById('voice-status').textContent === 'Bitte sprechen…') {
    document.getElementById('voice-status').textContent = '';
  }
}

function parseVoice(text) {
  const t = text.toLowerCase();
  let amount = null;

  const m = t.match(/(\d+)[,.](\d{1,2})\s*euro?/) ||
            t.match(/(\d+)\s*euro?\s+(\d{1,2})(?!\d)/) ||
            t.match(/(\d+)[,.](\d{1,2})/) ||
            t.match(/(\d+)\s*euro?/) ||
            t.match(/(\d+)/);
  if (m) {
    amount = parseFloat(m[1]);
    if (m[2]) amount += parseFloat('0.' + m[2].padEnd(2,'0'));
  }

  if (amount === null) {
    let sum = 0, found = false;
    for (const [w, v] of Object.entries(GERMAN_NUMS)) {
      if (new RegExp('\\b' + w + '\\b').test(t)) { sum += v; found = true; }
    }
    if (found) amount = sum;
  }

  if (amount !== null && amount > 0) {
    document.getElementById('amount-input').value = String(amount).replace('.', ',');
  }

  // Detect income keywords
  if (t.includes('einnahme') || t.includes('gehalt') || t.includes('einkommen')) {
    setTypeToggle('income');
  }

  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => t.includes(kw))) {
      if (state.categories.find(c => c.name === catName)) {
        selectedCategory = catName;
        renderCatPills(catName);
        break;
      }
    }
  }
}

// ── CSV Export ────────────────────────────────────────────────────
function exportCSV() {
  const b = currentBudget();
  if (!b || b.expenses.length === 0) { showToast('Keine Einträge zum Exportieren'); return; }
  const rows = [['Datum','Typ','Kategorie','Betrag (EUR)','Notiz']];
  b.expenses.forEach(e => rows.push([
    e.date,
    e.type === 'income' ? 'Einnahme' : 'Ausgabe',
    e.category,
    (e.type === 'income' ? '' : '-') + e.amount.toFixed(2),
    e.note || ''
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${b.name}-ausgaben.csv` });
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportiert');
}

// ── Add Category ──────────────────────────────────────────────────
function addCategory() {
  const emoji = document.getElementById('new-cat-emoji').value.trim() || '📌';
  const name  = document.getElementById('new-cat-name').value.trim();
  if (!name) { showToast('Bitte gib einen Namen ein'); return; }
  if (state.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Diese Kategorie existiert bereits'); return;
  }
  state.categories.push({ name, emoji });
  save();
  document.getElementById('new-cat-emoji').value = '';
  document.getElementById('new-cat-name').value = '';
  renderCatManagement();
  showToast(`"${name}" hinzugefügt`);
}

function addIncomeCategory() {
  const emoji = document.getElementById('new-icat-emoji').value.trim() || '💰';
  const name  = document.getElementById('new-icat-name').value.trim();
  if (!name) { showToast('Bitte gib einen Namen ein'); return; }
  if (state.incomeCategories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Diese Kategorie existiert bereits'); return;
  }
  state.incomeCategories.push({ name, emoji });
  save();
  document.getElementById('new-icat-emoji').value = '';
  document.getElementById('new-icat-name').value = '';
  renderIncomeCatManagement();
  showToast(`"${name}" hinzugefügt`);
}

// ── Events ────────────────────────────────────────────────────────
function initEvents() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => showView(btn.dataset.view))
  );

  // Header budget button
  document.getElementById('budget-btn').addEventListener('click', openBudgetModal);

  // FAB + summary quick-add
  document.getElementById('fab').addEventListener('click', () => openAddModal());
  document.getElementById('summary-add-btn').addEventListener('click', () => openAddModal());

  // Month navigation (home)
  document.getElementById('prev-month-btn').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('next-month-btn').addEventListener('click', () => shiftMonth(+1));

  // Month navigation (stats)
  document.getElementById('stats-prev-btn').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('stats-next-btn').addEventListener('click', () => shiftMonth(+1));

  // Stats type toggle
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      statsType = btn.dataset.stype;
      document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStats();
    });
  });

  // Add modal type toggle
  document.getElementById('type-expense-btn').addEventListener('click', () => setTypeToggle('expense'));
  document.getElementById('type-income-btn').addEventListener('click', () => setTypeToggle('income'));

  // Close modals on overlay tap
  ['modal-add','modal-budget','modal-detail'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) document.getElementById(id).classList.add('hidden');
    });
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['modal-add','modal-budget','modal-detail'].forEach(id =>
        document.getElementById(id).classList.add('hidden')
      );
    }
  });

  document.getElementById('add-close-btn').addEventListener('click', closeAddModal);
  document.getElementById('budget-close-btn').addEventListener('click', closeBudgetModal);
  document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);

  document.getElementById('voice-btn').addEventListener('click', toggleVoice);
  document.getElementById('save-btn').addEventListener('click', saveExpense);
  document.getElementById('amount-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveExpense(); });
  document.getElementById('amount-input').addEventListener('input', updateSplitPreview);

  document.getElementById('detail-del-btn').addEventListener('click', () => {
    const id = document.getElementById('detail-del-btn').dataset.id;
    if (confirm('Eintrag wirklich löschen?')) {
      deleteExpense(id);
      closeDetailModal();
      renderAll();
      showToast('Eintrag gelöscht');
    }
  });

  document.getElementById('new-budget-btn').addEventListener('click', createNewBudget);
  document.getElementById('new-budget-input').addEventListener('keydown', e => { if (e.key === 'Enter') createNewBudget(); });

  document.getElementById('add-budget-settings-btn').addEventListener('click', openBudgetModal);
  document.getElementById('export-btn').addEventListener('click', exportCSV);
  document.getElementById('history-export-btn').addEventListener('click', exportCSV);

  document.getElementById('add-cat-btn').addEventListener('click', addCategory);
  document.getElementById('new-cat-name').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });

  document.getElementById('add-icat-btn').addEventListener('click', addIncomeCategory);
  document.getElementById('new-icat-name').addEventListener('keydown', e => { if (e.key === 'Enter') addIncomeCategory(); });

  // Wiederkehrende Zahlungen
  document.getElementById('add-recurring-btn').addEventListener('click', () => openRecurringModal());
  document.getElementById('recurring-close-btn').addEventListener('click', closeRecurringModal);
  document.getElementById('recurring-save-btn').addEventListener('click', saveRecurring);
  document.getElementById('recurring-type-expense-btn').addEventListener('click', () => { recurringTypeMode = 'expense'; recurringSelectedCat = null; updateRecurringTypeBtns(); });
  document.getElementById('recurring-type-income-btn').addEventListener('click',  () => { recurringTypeMode = 'income';  recurringSelectedCat = null; updateRecurringTypeBtns(); });

  // Dark mode toggle
  document.getElementById('dark-mode-toggle').addEventListener('change', toggleDarkMode);

  // Payment method buttons
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', () => setPaymentMethod(btn.dataset.payment));
  });

  // Split toggle
  document.getElementById('split-toggle').addEventListener('change', toggleSplitSection);

  // Split members (settings)
  document.getElementById('add-split-member-btn').addEventListener('click', addSplitMember);
  document.getElementById('new-split-member').addEventListener('keydown', e => { if (e.key === 'Enter') addSplitMember(); });
}

// ── Init ──────────────────────────────────────────────────────────
function init() {
  load();
  if (state.budgets.length === 0) createBudget('Allgemein');
  if (!state.budgets.find(b => b.id === state.currentBudgetId))
    state.currentBudgetId = state.budgets[0].id;

  initVoice();
  initPhotoEvents();
  processRecurringPayments();
  renderAll();
  initEvents();
  initAuth();

  // Sign-out button
  document.getElementById('signout-btn')?.addEventListener('click', () => {
    if (typeof auth !== 'undefined') {
      auth.signOut().then(() => showToast('Abgemeldet'));
    }
  });

  // Name-Modal
  document.getElementById('name-save-btn').addEventListener('click', saveUserName);
  document.getElementById('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveUserName(); });
  document.getElementById('name-modal-close-btn').addEventListener('click', closeNameModal);
  document.getElementById('change-name-btn')?.addEventListener('click', () => showNameModal(false));

  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
