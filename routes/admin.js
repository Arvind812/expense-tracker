const express = require('express');
const bcrypt = require('bcryptjs');
const { query, run } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT id, name, email, role, is_banned, monthly_budget, created_at FROM users';
    const params = [];
    if (search) { sql += ' WHERE name ILIKE $1 OR email ILIKE $2'; params.push(`%${search}%`, `%${search}%`); }
    res.json(await query(sql, params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change own role' });
    await run('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
    res.json({ message: `Role updated to ${role}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/ban', authenticate, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot ban yourself' });
    const user = (await query('SELECT is_banned FROM users WHERE id = $1', [req.params.id]))[0];
    if (!user) return res.status(404).json({ error: 'Not found' });
    const newBan = user.is_banned ? 0 : 1;
    await run('UPDATE users SET is_banned = $1 WHERE id = $2', [newBan, req.params.id]);
    res.json({ message: newBan ? 'User banned' : 'User unbanned', is_banned: newBan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/reset-password', authenticate, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
    await run('UPDATE users SET password = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), req.params.id]);
    res.json({ message: 'Password reset' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await run('DELETE FROM expenses WHERE user_id = $1', [req.params.id]);
    await run('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User and their expenses deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/users/export', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await query('SELECT id, name, email, role, is_banned, monthly_budget, created_at FROM users');
    const headers = ['ID', 'Name', 'Email', 'Role', 'Banned', 'Monthly Budget', 'Created At'];
    const rows = users.map(u => [u.id, u.name, u.email, u.role, u.is_banned ? 'Yes' : 'No', u.monthly_budget, u.created_at]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const totalUsers = (await query('SELECT COUNT(*) as cnt FROM users'))[0]?.cnt || 0;
    const totalExpenses = (await query('SELECT COUNT(*) as cnt FROM expenses'))[0]?.cnt || 0;
    const totalAmount = (await query('SELECT SUM(amount) as total FROM expenses'))[0]?.total || 0;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthlyTotal = (await query(`SELECT SUM(amount) as total FROM expenses WHERE to_char(date::date,'YYYY-MM')=$1`, [thisMonth]))[0]?.total || 0;
    const topCategories = await query('SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC LIMIT 5');
    res.json({ totalUsers, totalExpenses, totalAmount, monthlyTotal, topCategories });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;