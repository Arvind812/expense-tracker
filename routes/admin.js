const express = require('express');
const bcrypt = require('bcryptjs');
const { query, run } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/users', authenticate, requireAdmin, (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT id, name, email, role, is_banned, monthly_budget, created_at FROM users';
  const params = [];
  if (search) { sql += ' WHERE name LIKE ? OR email LIKE ?'; params.push(`%${search}%`, `%${search}%`); }
  res.json(query(sql, params));
});

router.put('/users/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot change own role' });
  run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ message: `Role updated to ${role}` });
});

router.put('/users/:id/ban', authenticate, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot ban yourself' });
  const user = query('SELECT is_banned FROM users WHERE id = ?', [req.params.id])[0];
  if (!user) return res.status(404).json({ error: 'Not found' });
  const newBan = user.is_banned ? 0 : 1;
  run('UPDATE users SET is_banned = ? WHERE id = ?', [newBan, req.params.id]);
  res.json({ message: newBan ? 'User banned' : 'User unbanned', is_banned: newBan });
});

router.put('/users/:id/reset-password', authenticate, requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
  run('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), req.params.id]);
  res.json({ message: 'Password reset' });
});

router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  run('DELETE FROM expenses WHERE user_id = ?', [req.params.id]);
  run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ message: 'User and their expenses deleted' });
});

router.get('/users/export', authenticate, requireAdmin, (req, res) => {
  const users = query('SELECT id, name, email, role, is_banned, monthly_budget, created_at FROM users');
  const headers = ['ID', 'Name', 'Email', 'Role', 'Banned', 'Monthly Budget', 'Created At'];
  const rows = users.map(u => [u.id, u.name, u.email, u.role, u.is_banned ? 'Yes' : 'No', u.monthly_budget, u.created_at]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
  res.send(csv);
});

router.get('/dashboard', authenticate, requireAdmin, (req, res) => {
  const totalUsers = query('SELECT COUNT(*) as cnt FROM users')[0]?.cnt || 0;
  const totalExpenses = query('SELECT COUNT(*) as cnt FROM expenses')[0]?.cnt || 0;
  const totalAmount = query('SELECT SUM(amount) as total FROM expenses')[0]?.total || 0;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyTotal = query(`SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y-%m',date)=?`, [thisMonth])[0]?.total || 0;
  const topCategories = query('SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC LIMIT 5');
  res.json({ totalUsers, totalExpenses, totalAmount, monthlyTotal, topCategories });
});

module.exports = router;
