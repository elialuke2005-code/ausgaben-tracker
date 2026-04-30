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
  { name: 'Gehalt',         emoji: '💰' },
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
  'Gehalt':          ['gehalt','lohn','einnahme','einkommen','überweisung','freiberuf','freelance'],
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
};

let selectedCategory = null;
let selectedType = 'expense'; // for add modal
let statsType = 'expense';    // for stats view
let darkMode = false;
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
}

function load() {
  try {
    const raw = localStorage.getItem('ausgaben_v2');
    if (raw) state = { ...state, ...JSON.parse(raw) };
    // Migrate: ensure all entries have type
    state.budgets.forEach(b => {
      b.expenses.forEach(e => { if (!e.type) e.type = 'expense'; });
    });
  } catch(e) {}
  darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) document.body.classList.add('dark');
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
  return state.categories.find(c => c.name === name) || { name, emoji: '📌' };
}

function getCatColor(name) {
  return CAT_COLORS[name] || '#EFF6FF';
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
  return `<div class="expense-item" data-id="${e.id}">
    <div class="expense-icon" style="background:${iconBg}">${c.emoji}</div>
    <div class="expense-info">
      <div class="expense-cat">${esc(e.category)}</div>
      ${e.note ? `<div class="expense-note">${esc(e.note)}</div>` : ''}
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

// ── Render: Settings ─────────────────────────────────────────────
function renderSettings() {
  renderSettingsBudgets();
  renderCatManagement();
  // Sync dark mode toggle
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = darkMode;
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

function renderAll() { renderHome(); renderHistory(); renderSettings(); renderStats(); }

// ── Modal: Add Expense ────────────────────────────────────────────
function openAddModal(preselect = null, preType = null) {
  selectedCategory = preselect;
  selectedType = preType || 'expense';
  document.getElementById('amount-input').value = '';
  document.getElementById('note-input').value = '';
  document.getElementById('date-input').value = todayStr();
  document.getElementById('voice-status').textContent = '';
  setTypeToggle(selectedType);
  renderCatPills(preselect);
  document.getElementById('modal-add').classList.remove('hidden');
  setTimeout(() => document.getElementById('amount-input').focus(), 320);
}

function closeAddModal() {
  document.getElementById('modal-add').classList.add('hidden');
  stopVoice();
  selectedCategory = null;
}

function setTypeToggle(type) {
  selectedType = type;
  const expBtn = document.getElementById('type-expense-btn');
  const incBtn = document.getElementById('type-income-btn');
  if (!expBtn || !incBtn) return;
  expBtn.classList.toggle('active', type === 'expense');
  incBtn.classList.toggle('active', type === 'income');
  // Update modal title
  const title = document.querySelector('#modal-add .modal-title');
  if (title) title.textContent = type === 'income' ? 'Neue Einnahme' : 'Neue Ausgabe';
}

function renderCatPills(selected) {
  const el = document.getElementById('cat-pills');
  el.innerHTML = state.categories.map(c => `
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
  addExpense({ amount, category: selectedCategory, note, date, type: selectedType });
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

  // Dark mode toggle
  document.getElementById('dark-mode-toggle').addEventListener('change', toggleDarkMode);
}

// ── Init ──────────────────────────────────────────────────────────
function init() {
  load();
  if (state.budgets.length === 0) createBudget('Allgemein');
  if (!state.budgets.find(b => b.id === state.currentBudgetId))
    state.currentBudgetId = state.budgets[0].id;

  initVoice();
  renderAll();
  initEvents();

  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
