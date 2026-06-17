const express = require('express');
const { query, run } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const CATEGORIES = ['Food', 'Transport', 'Housing', 'Health', 'Entertainment', 'Shopping', 'Education', 'Utilities', 'Other'];

// Get expenses (own for user, all for admin with ?all=true)
router.get('/', authenticate, (req, res) => {
  try {
    const { search, category, payment_method, from, to, page = 1, limit = 15, all } = req.query;
    const isAdmin = req.user.role === 'admin';
    let sql = 'SELECT e.*, u.name as user_name FROM expenses e JOIN users u ON e.user_id = u.id WHERE 1=1';
    const params = [];
    if (!isAdmin || all !== 'true') { sql += ' AND e.user_id = ?'; params.push(req.user.id); }
    if (search) { sql += ' AND (e.title LIKE ? OR e.note LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (category) { sql += ' AND e.category = ?'; params.push(category); }
    if (payment_method) { sql += ' AND e.payment_method = ?'; params.push(payment_method); }
    if (from) { sql += ' AND e.date >= ?'; params.push(from); }
    if (to) { sql += ' AND e.date <= ?'; params.push(to); }

    const countSql = sql.replace('SELECT e.*, u.name as user_name', 'SELECT COUNT(*) as cnt');
    const total = query(countSql, params)[0]?.cnt || 0;
    sql += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const expenses = query(sql, params);
    res.json({ expenses, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create
router.post('/', authenticate, (req, res) => {
  try {
    const { title, amount, category, payment_method, note, date } = req.body;
    if (!title || !amount || !category || !date) return res.status(400).json({ error: 'Title, amount, category, date required' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    const result = run(
      'INSERT INTO expenses (user_id, title, amount, category, payment_method, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, title, parseFloat(amount), category, payment_method || 'cash', note || null, date]
    );
    res.status(201).json(query('SELECT * FROM expenses WHERE id = ?', [result.lastInsertRowid])[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update
router.put('/:id', authenticate, (req, res) => {
  try {
    const exp = query('SELECT * FROM expenses WHERE id = ?', [req.params.id])[0];
    if (!exp) return res.status(404).json({ error: 'Expense not found' });
    if (Number(exp.user_id) !== Number(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    const { title, amount, category, payment_method, note, date } = req.body;
    run('UPDATE expenses SET title=?, amount=?, category=?, payment_method=?, note=?, date=? WHERE id=?',
      [title, parseFloat(amount), category, payment_method, note, date, req.params.id]);
    res.json(query('SELECT * FROM expenses WHERE id = ?', [req.params.id])[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete
router.delete('/:id', authenticate, (req, res) => {
  const exp = query('SELECT * FROM expenses WHERE id = ?', [req.params.id])[0];
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (Number(exp.user_id) !== Number(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
  run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

// Stats: summary for current month
router.get('/stats/monthly', authenticate, (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const uid = req.user.id;
    const total = query(`SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND strftime('%Y-%m',date)=?`, [uid, month])[0]?.total || 0;
    const byCategory = query(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=? AND strftime('%Y-%m',date)=? GROUP BY category ORDER BY total DESC`, [uid, month]);
    const byDay = query(`SELECT date, SUM(amount) as total FROM expenses WHERE user_id=? AND strftime('%Y-%m',date)=? GROUP BY date ORDER BY date`, [uid, month]);
    const budget = query('SELECT monthly_budget FROM users WHERE id = ?', [uid])[0]?.monthly_budget || 0;
    const recentMonths = query(`SELECT strftime('%Y-%m',date) as month, SUM(amount) as total FROM expenses WHERE user_id=? GROUP BY month ORDER BY month DESC LIMIT 6`, [uid]);
    res.json({ total, byCategory, byDay, budget, recentMonths, month });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export CSV
router.get('/export/csv', authenticate, (req, res) => {
  try {
    const uid = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const expenses = isAdmin
      ? query('SELECT e.*, u.name as user_name FROM expenses e JOIN users u ON e.user_id=u.id ORDER BY e.date DESC')
      : query('SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC', [uid]);
    const headers = isAdmin
      ? ['ID', 'User', 'Title', 'Amount', 'Category', 'Payment', 'Note', 'Date']
      : ['ID', 'Title', 'Amount', 'Category', 'Payment', 'Note', 'Date'];
    const rows = expenses.map(e => isAdmin
      ? [e.id, e.user_name, e.title, e.amount, e.category, e.payment_method, e.note || '', e.date]
      : [e.id, e.title, e.amount, e.category, e.payment_method, e.note || '', e.date]
    );
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;