const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, run } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'exp_secret_key';

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if ((await query('SELECT id FROM users WHERE email = $1', [email])).length)
      return res.status(409).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const role = (await query('SELECT id FROM users')).length === 0 ? 'admin' : 'user';
    await run('INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)', [name, email, hashed, role]);
    res.status(201).json({ message: 'Account created', role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = (await query('SELECT * FROM users WHERE email = $1', [email]))[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authenticate, async (req, res) => {
  const user = (await query('SELECT id, name, email, role, monthly_budget, created_at FROM users WHERE id = $1', [req.user.id]))[0];
  res.json(user);
});

router.put('/me/budget', authenticate, async (req, res) => {
  const { monthly_budget } = req.body;
  await run('UPDATE users SET monthly_budget = $1 WHERE id = $2', [monthly_budget || 0, req.user.id]);
  res.json({ message: 'Budget updated' });
});

module.exports = router;