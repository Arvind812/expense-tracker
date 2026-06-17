const API = '/api';
let token = localStorage.getItem('exp_token');
let currentUser = null;
let currentPage = 1;
let editingExpId = null;

const CAT_EMOJI = { Food:'🍔', Transport:'🚗', Housing:'🏠', Health:'💊', Entertainment:'🎬', Shopping:'🛍️', Education:'📚', Utilities:'💡', Other:'📦' };
const CAT_COLOR = { Food:'cat-food', Transport:'cat-transport', Housing:'cat-housing', Health:'cat-health', Entertainment:'cat-entertainment', Shopping:'cat-shopping', Education:'cat-education', Utilities:'cat-utilities', Other:'cat-other' };

const $ = id => document.getElementById(id);
const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};
function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── Auth ──
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('login-form').classList.toggle('hidden', btn.dataset.tab !== 'login');
    $('register-form').classList.toggle('hidden', btn.dataset.tab !== 'register');
    $('auth-error').classList.add('hidden');
  });
});

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await api('POST', '/auth/login', { email: $('login-email').value, password: $('login-password').value });
    token = data.token;
    localStorage.setItem('exp_token', token);
    currentUser = data.user;
    initApp();
  } catch (err) {
    $('auth-error').textContent = err.message;
    $('auth-error').classList.remove('hidden');
  }
});

$('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/auth/register', { name: $('reg-name').value, email: $('reg-email').value, password: $('reg-password').value });
    toast('Account created! Please log in.', 'success');
    document.querySelector('[data-tab="login"]').click();
  } catch (err) {
    $('auth-error').textContent = err.message;
    $('auth-error').classList.remove('hidden');
  }
});

$('logout-btn').addEventListener('click', () => {
  token = null; currentUser = null;
  localStorage.removeItem('exp_token');
  $('app').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
});

// ── Theme ──
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('exp_theme', theme);
});
const savedTheme = localStorage.getItem('exp_theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

// ── Sidebar ──
$('menu-toggle').addEventListener('click', () => {
  $('sidebar').classList.toggle(window.innerWidth <= 768 ? 'open' : 'collapsed');
});

// ── Nav ──
document.querySelectorAll('.nav-item[data-page]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.page); });
});
function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });

  const currentPageEl = $(`page-${page}`);
  if (currentPageEl) {
    currentPageEl.classList.remove('hidden');
    currentPageEl.classList.add('active');
  }

  $('page-title').textContent = {
    dashboard: 'Dashboard',
    expenses: 'Expenses',
    analytics: 'Analytics',
    admin: 'Admin Panel'
  }[page];

  if (page === 'dashboard') loadDashboard();
  if (page === 'expenses') loadExpenses();
  if (page === 'analytics') loadAnalytics();
  if (page === 'admin') loadAdminPage();
}

// ── Init ──
async function initApp() {
  try {
    if (!currentUser) currentUser = await api('GET', '/auth/me');
    $('auth-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('user-name').textContent = currentUser.name;
    $('user-role').textContent = currentUser.role;
    $('user-avatar').textContent = currentUser.name[0].toUpperCase();
    if (currentUser.role === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    $('exp-date').value = new Date().toISOString().split('T')[0];
    $('analytics-month').value = new Date().toISOString().slice(0, 7);
    navigateTo('dashboard');
  } catch { token = null; localStorage.removeItem('exp_token'); }
}

// ── Dashboard ──
async function loadDashboard() {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const stats = await api('GET', `/expenses/stats/monthly?month=${month}`);

    // Budget bar
    const budget = currentUser.monthly_budget || stats.budget || 0;
    const pct = budget > 0 ? Math.min((stats.total / budget) * 100, 100) : 0;
    $('budget-label').textContent = budget > 0 ? `₹${budget.toLocaleString('en-IN')}` : 'Not set';
    $('budget-spent').textContent = `Spent: ₹${stats.total.toLocaleString('en-IN')}`;
    const fill = $('budget-fill');
    fill.style.width = `${pct}%`;
    fill.className = 'budget-fill' + (pct > 90 ? ' over' : pct > 70 ? ' warning' : '');

    // Stats
    $('stat-month').textContent = `₹${Math.round(stats.total).toLocaleString('en-IN')}`;
    const txCount = stats.byDay.reduce((sum, d) => sum + 1, 0);
    $('stat-count').textContent = stats.byCategory.reduce((s, c) => s + 1, 0) > 0
      ? (await api('GET', `/expenses?page=1&limit=1`)).total : 0;
    const re = await api('GET', `/expenses?page=1&limit=1`);
    $('stat-count').textContent = re.total;
    $('stat-top').textContent = stats.byCategory[0] ? `${CAT_EMOJI[stats.byCategory[0].category] || '📦'} ${stats.byCategory[0].category}` : '—';
    const days = new Date().getDate();
    $('stat-avg').textContent = `₹${Math.round(stats.total / days).toLocaleString('en-IN')}`;

    // Category chart
    const chart = $('cat-chart');
    chart.innerHTML = '';
    const maxCat = Math.max(...stats.byCategory.map(c => c.total), 1);
    stats.byCategory.forEach(c => {
      chart.innerHTML += `
        <div class="cat-bar">
          <div class="cat-bar-emoji">${CAT_EMOJI[c.category] || '📦'}</div>
          <div class="cat-bar-name">${c.category}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill ${CAT_COLOR[c.category] || 'cat-other'}" style="width:${(c.total/maxCat)*100}%"></div></div>
          <div class="cat-bar-amt">₹${Math.round(c.total).toLocaleString('en-IN')}</div>
        </div>`;
    });
    if (!stats.byCategory.length) chart.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">No expenses this month yet.</p>';

    // Recent
    const recent = await api('GET', '/expenses?page=1&limit=5');
    const el = $('recent-expenses');
    el.innerHTML = recent.expenses.map(e => `
      <div class="recent-expense-item">
        <div class="rei-icon">${CAT_EMOJI[e.category] || '📦'}</div>
        <div style="flex:1"><div class="rei-name">${e.title}</div><div class="rei-cat">${e.category} · ${e.payment_method}</div></div>
        <div class="rei-amt">₹${Number(e.amount).toLocaleString('en-IN')}</div>
        <div class="rei-date">${e.date}</div>
      </div>`).join('') || '<p style="color:var(--text2);font-size:0.85rem">No expenses yet.</p>';
  } catch (err) { toast(err.message, 'error'); }
}

// ── Budget ──
$('set-budget-btn').addEventListener('click', () => {
  $('budget-input').value = currentUser.monthly_budget || '';
  $('budget-modal').classList.remove('hidden');
});
document.querySelectorAll('.close-budget').forEach(b => b.addEventListener('click', () => $('budget-modal').classList.add('hidden')));
$('budget-modal').querySelector('.modal-overlay').addEventListener('click', () => $('budget-modal').classList.add('hidden'));
$('save-budget-btn').addEventListener('click', async () => {
  const val = parseFloat($('budget-input').value) || 0;
  try {
    await api('PUT', '/auth/me/budget', { monthly_budget: val });
    currentUser.monthly_budget = val;
    toast('Budget updated!', 'success');
    $('budget-modal').classList.add('hidden');
    loadDashboard();
  } catch (err) { toast(err.message, 'error'); }
});

// ── Expenses ──
let searchTimeout;
$('search-input').addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { currentPage = 1; loadExpenses(); }, 350); });
$('filter-cat').addEventListener('change', () => { currentPage = 1; loadExpenses(); });
$('filter-from').addEventListener('change', loadExpenses);
$('filter-to').addEventListener('change', loadExpenses);

async function loadExpenses() {
  try {
    const params = new URLSearchParams({ page: currentPage, limit: 15 });
    const search = $('search-input').value;
    const cat = $('filter-cat').value;
    const from = $('filter-from').value;
    const to = $('filter-to').value;
    if (search) params.set('search', search);
    if (cat) params.set('category', cat);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api('GET', `/expenses?${params}`);
    renderExpenseTable(data.expenses);
    renderPagination(data.pages);
  } catch (err) { toast(err.message, 'error'); }
}

function renderExpenseTable(expenses) {
  $('exp-tbody').innerHTML = expenses.length ? expenses.map(e => `
    <tr>
      <td><strong>${e.title}</strong></td>
      <td><span class="badge badge-${e.category.toLowerCase()}">${CAT_EMOJI[e.category] || ''} ${e.category}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--accent)">₹${Number(e.amount).toLocaleString('en-IN')}</td>
      <td>${e.payment_method}</td>
      <td>${e.date}</td>
      <td style="color:var(--text2);font-size:0.82rem">${e.note || '—'}</td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-sm" onclick="openEditExp(${e.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id},'${e.title.replace(/'/g,"\\'")}')">Delete</button>
      </div></td>
    </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text2)">No expenses found</td></tr>`;
}

function renderPagination(pages) {
  const pg = $('pagination');
  pg.innerHTML = '';
  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn${i === currentPage ? ' active' : ''}`;
    btn.textContent = i;
    btn.onclick = () => { currentPage = i; loadExpenses(); };
    pg.appendChild(btn);
  }
}

// ── Expense Modal ──
$('add-expense-btn').addEventListener('click', () => openExpModal());
document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', closeExpModal));
$('exp-modal').querySelector('.modal-overlay').addEventListener('click', closeExpModal);

function openExpModal(exp = null) {
  editingExpId = exp ? exp.id : null;
  $('modal-title').textContent = exp ? 'Edit Expense' : 'Add Expense';
  $('exp-submit').textContent = exp ? 'Save Changes' : 'Save Expense';
  $('exp-title').value = exp?.title || '';
  $('exp-amount').value = exp?.amount || '';
  $('exp-category').value = exp?.category || '';
  $('exp-payment').value = exp?.payment_method || 'cash';
  $('exp-date').value = exp?.date || new Date().toISOString().split('T')[0];
  $('exp-note').value = exp?.note || '';
  $('exp-modal').classList.remove('hidden');
}
function closeExpModal() { $('exp-modal').classList.add('hidden'); editingExpId = null; }

$('exp-form').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    title: $('exp-title').value,
    amount: parseFloat($('exp-amount').value),
    category: $('exp-category').value,
    payment_method: $('exp-payment').value,
    date: $('exp-date').value,
    note: $('exp-note').value
  };
  try {
    if (editingExpId) { await api('PUT', `/expenses/${editingExpId}`, body); toast('Expense updated!', 'success'); }
    else { await api('POST', '/expenses', body); toast('Expense added!', 'success'); }
    closeExpModal();
    if (document.querySelector('[data-page="expenses"]').classList.contains('active')) loadExpenses();
    if (document.querySelector('[data-page="dashboard"]').classList.contains('active')) loadDashboard();
  } catch (err) { toast(err.message, 'error'); }
});

async function openEditExp(id) {
  try {
    const data = await api('GET', `/expenses?page=1&limit=1000`);
    const exp = data.expenses.find(e => e.id === id);
    if (exp) openExpModal(exp);
  } catch (err) { toast(err.message, 'error'); }
}
async function deleteExpense(id, title) {
  try {
    await api('DELETE', `/expenses/${id}`);
    toast('Expense deleted successfully', 'success');
    loadExpenses();
    loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── CSV Export ──
$('export-csv-btn').addEventListener('click', () => {
  fetch('/api/expenses/export/csv', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob()).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `expenses_${Date.now()}.csv`;
      a.click();
    });
});

// ── Analytics ──
$('analytics-month').addEventListener('change', loadAnalytics);

async function loadAnalytics() {
  try {
    const month = $('analytics-month').value;
    const stats = await api('GET', `/expenses/stats/monthly?month=${month}`);

    $('analytics-stats').innerHTML = `
      <div class="stat-card accent"><div class="stat-label">Total Spent</div><div class="stat-value">₹${Math.round(stats.total).toLocaleString('en-IN')}</div></div>
      <div class="stat-card"><div class="stat-label">Transactions</div><div class="stat-value">${stats.byDay.length}</div></div>
      <div class="stat-card"><div class="stat-label">Budget</div><div class="stat-value">${stats.budget > 0 ? '₹' + stats.budget.toLocaleString('en-IN') : 'Not set'}</div></div>
      <div class="stat-card"><div class="stat-label">Remaining</div><div class="stat-value" style="color:${stats.budget > 0 && stats.total > stats.budget ? 'var(--danger)' : 'var(--accent)'}">
        ${stats.budget > 0 ? '₹' + Math.abs(stats.budget - stats.total).toLocaleString('en-IN') + (stats.total > stats.budget ? ' over' : '') : '—'}
      </div></div>`;

    // Daily chart
    const daily = $('daily-chart');
    const maxDay = Math.max(...stats.byDay.map(d => d.total), 1);
    daily.innerHTML = stats.byDay.length
      ? stats.byDay.map(d => `
        <div class="cat-bar">
          <div class="cat-bar-name" style="font-size:0.78rem;color:var(--text2)">${d.date}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill cat-transport" style="width:${(d.total/maxDay)*100}%"></div></div>
          <div class="cat-bar-amt">₹${Math.round(d.total).toLocaleString('en-IN')}</div>
        </div>`).join('')
      : '<p style="color:var(--text2);font-size:0.85rem">No data for this month.</p>';

    // Trend
    const trend = $('trend-chart');
    const maxTrend = Math.max(...stats.recentMonths.map(m => m.total), 1);
    trend.innerHTML = stats.recentMonths.length
      ? [...stats.recentMonths].reverse().map(m => `
        <div class="cat-bar">
          <div class="cat-bar-name" style="font-family:'JetBrains Mono',monospace;font-size:0.8rem">${m.month}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill cat-health" style="width:${(m.total/maxTrend)*100}%"></div></div>
          <div class="cat-bar-amt">₹${Math.round(m.total).toLocaleString('en-IN')}</div>
        </div>`).join('')
      : '<p style="color:var(--text2);font-size:0.85rem">No historical data yet.</p>';
  } catch (err) { toast(err.message, 'error'); }
}

// ── Admin ──
document.querySelectorAll('[data-admin-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-admin-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('admin-users').classList.toggle('hidden', btn.dataset.adminTab !== 'users');
    $('admin-overview').classList.toggle('hidden', btn.dataset.adminTab !== 'overview');
    if (btn.dataset.adminTab === 'overview') loadAdminOverview();
  });
});

let userST;
$('user-search').addEventListener('input', () => { clearTimeout(userST); userST = setTimeout(loadUsers, 350); });

async function loadAdminPage() { loadUsers(); }

async function loadUsers() {
  try {
    const search = $('user-search').value;
    const users = await api('GET', `/admin/users${search ? '?search=' + encodeURIComponent(search) : ''}`);
    $('users-tbody').innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.name}</strong></td>
        <td style="color:var(--text2)">${u.email}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td><span class="badge ${u.is_banned ? 'badge-banned' : 'badge-active'}">${u.is_banned ? 'Banned' : 'Active'}</span></td>
        <td style="font-family:'JetBrains Mono',monospace">${u.monthly_budget > 0 ? '₹' + u.monthly_budget.toLocaleString('en-IN') : '—'}</td>
        <td><div class="action-btns">
          <select class="select-input" style="padding:0.3rem;font-size:0.78rem" onchange="changeRole(${u.id},this.value)" ${u.id===currentUser.id?'disabled':''}>
            <option ${u.role==='user'?'selected':''} value="user">User</option>
            <option ${u.role==='admin'?'selected':''} value="admin">Admin</option>
          </select>
          <button class="btn btn-sm btn-outline" onclick="toggleBan(${u.id})" ${u.id===currentUser.id?'disabled':''}>${u.is_banned?'Unban':'Ban'}</button>
          <button class="btn btn-sm btn-outline" onclick="openResetModal(${u.id})">Reset PW</button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id},'${u.name.replace(/'/g,"\\'")}' )" ${u.id===currentUser.id?'disabled':''}>Delete</button>
        </div></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function changeRole(id, role) {
  try { await api('PUT', `/admin/users/${id}/role`, { role }); toast(`Role → ${role}`, 'success'); }
  catch (err) { toast(err.message, 'error'); }
}
async function toggleBan(id) {
  try { const r = await api('PUT', `/admin/users/${id}/ban`); toast(r.message, 'success'); loadUsers(); }
  catch (err) { toast(err.message, 'error'); }
}
async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}" and ALL their expenses?`)) return;
  try { await api('DELETE', `/admin/users/${id}`); toast('User deleted', 'success'); loadUsers(); }
  catch (err) { toast(err.message, 'error'); }
}

$('export-users-btn').addEventListener('click', () => {
  fetch('/api/admin/users/export', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob()).then(blob => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'users_export.csv'; a.click();
    });
});

function openResetModal(id) { $('reset-user-id').value = id; $('reset-password').value = ''; $('reset-modal').classList.remove('hidden'); }
document.querySelectorAll('.close-reset').forEach(b => b.addEventListener('click', () => $('reset-modal').classList.add('hidden')));
$('reset-modal').querySelector('.modal-overlay').addEventListener('click', () => $('reset-modal').classList.add('hidden'));
$('confirm-reset').addEventListener('click', async () => {
  const pw = $('reset-password').value;
  if (!pw || pw.length < 6) return toast('Min 6 characters', 'error');
  try {
    await api('PUT', `/admin/users/${$('reset-user-id').value}/reset-password`, { newPassword: pw });
    toast('Password reset!', 'success');
    $('reset-modal').classList.add('hidden');
  } catch (err) { toast(err.message, 'error'); }
});

async function loadAdminOverview() {
  try {
    const dash = await api('GET', '/admin/dashboard');
    $('admin-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value">${dash.totalUsers}</div></div>
      <div class="stat-card accent"><div class="stat-label">Total Expenses</div><div class="stat-value">${dash.totalExpenses}</div></div>
      <div class="stat-card"><div class="stat-label">All-Time Spend</div><div class="stat-value" style="font-size:1.3rem">₹${Math.round(dash.totalAmount).toLocaleString('en-IN')}</div></div>
      <div class="stat-card"><div class="stat-label">This Month</div><div class="stat-value" style="font-size:1.3rem">₹${Math.round(dash.monthlyTotal).toLocaleString('en-IN')}</div></div>`;
    const chart = $('admin-cat-chart');
    const max = Math.max(...dash.topCategories.map(c => c.total), 1);
    chart.innerHTML = dash.topCategories.map(c => `
      <div class="cat-bar">
        <div class="cat-bar-emoji">${CAT_EMOJI[c.category]||'📦'}</div>
        <div class="cat-bar-name">${c.category}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill ${CAT_COLOR[c.category]||'cat-other'}" style="width:${(c.total/max)*100}%"></div></div>
        <div class="cat-bar-amt">₹${Math.round(c.total).toLocaleString('en-IN')}</div>
      </div>`).join('') || '<p style="color:var(--text2)">No data yet.</p>';
  } catch (err) { toast(err.message, 'error'); }
}

if (token) initApp();
