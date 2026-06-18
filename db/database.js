const { Pool } = require('pg');

const pool = new Pool({
  host: 'aws-0-ap-south-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.wmrmkurvfkobohzkiokw',
  password: 'Arvind#2002@',
  ssl: { rejectUnauthorized: false }
});

async function getDb() {
  await initSchema();
  return pool;
}

async function initSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', is_banned INTEGER DEFAULT 0, monthly_budget REAL DEFAULT 0, created_at TEXT DEFAULT (now()::text))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, amount REAL NOT NULL, category TEXT NOT NULL, payment_method TEXT DEFAULT 'cash', note TEXT, date TEXT NOT NULL, created_at TEXT DEFAULT (now()::text), FOREIGN KEY (user_id) REFERENCES users(id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS budgets (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, month TEXT NOT NULL, UNIQUE(user_id, category, month))`);
}

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function run(sql, params = []) {
  const res = await pool.query(sql, params);
  return { lastInsertRowid: res.rows[0]?.id };
}

module.exports = { getDb, query, run };