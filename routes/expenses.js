const express = require('express');
const { query, run } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const CATEGORIES = ['Food', 'Transport', 'Housing', 'Health', 'Entertainment', 'Shopping', 'Education', 'Utilities', 'Other'];

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, category, payment_method, from, to, page = 1, limit = 15, all } = req.query;
    const isAdmin = req.user.role === 'admin';
    let sql = 'SELECT e.*, u.name as user_name FROM expenses e JOIN users u ON e.user_id = u.id WHERE 1=1';
    const params = [];
    let i = 1;
    if (!isAdmin || all !== 'true') { sql += ` AND e.user_id = $${i++}`; params.push(req.user.id); }
    if (search) { sql += ` AND (e.title ILIKE $${i++} OR e.note ILIKE $${i++})`; params.push(`%${search}%`, `%${search}%`); }
    if (category) { sql += ` AND e.category = $${i++}`; params.push(category); }
    if (payment_method) { sql += ` AND e.payment_method = $${i++}`; params.push(payment_method); }
    if (from) { sql += ` AND e.date >= $${i++}`; params.push(from); }
    if (to) { sql += ` AND e.date <= $${i++}`; params.push(to); }
    const countSql = sql.replace('SELECT e.*, u.name as user_name', 'SELECT COUNT(*) as cnt');
    const total = (await query(countSql, params))[0]?.cnt || 0;
    sql += ` ORDER BY e.date DESC, e.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const expenses = await query(sql, params);
    res.json({ expenses, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, amount, category, payment_method, note, date } = req.body;
    if (!title || !amount || !category || !date) return res.status(400).json({ error: 'Title, amount, category, date required' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
    const result = await run(
      'INSERT INTO expenses (user_id, title, amount, category, payment_method, note, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [req.user.id, title, parseFloat(amount), category, payment_method || 'cash', note || null, date]
    );
    const expense = (await query('SELECT * FROM expenses WHERE id = $1', [result.lastInsertRowid]))[0];
    res.status(201).json(expense);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const exp = (await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]))[0];
    if (!exp) return res.status(404).json({ error: 'Expense not found' });
    if (Number(exp.user_id) !== Number(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    const { title, amount, category, payment_method, note, date } = req.body;
    await run('UPDATE expenses SET title=$1, amount=$2, category=$3, payment_method=$4, note=$5, date=$6 WHERE id=$7',
      [title, parseFloat(amount), category, payment_method, note, date, req.params.id]);
    res.json((await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]))[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const exp = (await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]))[0];
    if (!exp) return res.status(404).json({ error: 'Not found' });
    if (Number(exp.user_id) !== Number(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    await run('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const uid = req.user.id;
    const total = (await query(`SELECT SUM(amount) as total FROM expenses WHERE user_id=$1 AND to_char(date::date,'YYYY-MM')=$2`, [uid, month]))[0]?.total || 0;
    const byCategory = await query(`SELECT category, SUM(amount) as total FROM expenses WHERE user_id=$1 AND to_char(date::date,'YYYY-MM')=$2 GROUP BY category ORDER BY total DESC`, [uid, month]);
    const byDay = await query(`SELECT date, SUM(amount) as total FROM expenses WHERE user_id=$1 AND to_char(date::date,'YYYY-MM')=$2 GROUP BY date ORDER BY date`, [uid, month]);
    const budget = (await query('SELECT monthly_budget FROM users WHERE id = $1', [uid]))[0]?.monthly_budget || 0;
    const recentMonths = await query(`SELECT to_char(date::date,'YYYY-MM') as month, SUM(amount) as total FROM expenses WHERE user_id=$1 GROUP BY month ORDER BY month DESC LIMIT 6`, [uid]);
    res.json({ total, byCategory, byDay, budget, recentMonths, month });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export/csv', authenticate, async (req, res) => {
  try {
    const uid = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const expenses = isAdmin
      ? await query('SELECT e.*, u.name as user_name FROM expenses e JOIN users u ON e.user_id=u.id ORDER BY e.date DESC')
      : await query('SELECT * FROM expenses WHERE user_id=$1 ORDER BY date DESC', [uid]);
    const headers = isAdmin
      ? ['ID', 'User', 'Title', 'Amount', 'Category', 'Payment', 'Note', 'Date']
      : ['ID', 'Title', 'Amount', 'Category', 'Payment', 'Note', 'Date'];
    const rows = expenses.map(e => isAdmin
      ? [e.id, e.user_name, e.title, e.amount, e.category, e.payment_method, e.note || '', e.date]
      : [e.id, e.title, e.amount, e.category, e.payment_method, e.note || '', e.date]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;