const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ─────────────────────────────────────────────────────────────
// DB_PATH env var lets Railway (or any host) point to a persistent volume.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'coaching.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    date        TEXT    NOT NULL,
    crew        TEXT    NOT NULL,
    leader      TEXT    NOT NULL,
    badge       TEXT    NOT NULL,
    op_name     TEXT    NOT NULL,
    kpis        TEXT    NOT NULL,
    follow_up   TEXT    NOT NULL,
    comments    TEXT    NOT NULL
  )
`);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ─────────────────────────────────────────────────────────────────

// POST /api/submissions  — save a new coaching record
app.post('/api/submissions', (req, res) => {
  const { date, crew, leader, badge, opName, kpis, followUp, comments } = req.body;

  if (!date || !crew || !leader || !badge || !opName || !kpis?.length || !followUp || !comments) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const stmt = db.prepare(`
    INSERT INTO submissions (date, crew, leader, badge, op_name, kpis, follow_up, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(date, crew, leader, badge, opName, JSON.stringify(kpis), followUp, comments);
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(info.lastInsertRowid);

  res.status(201).json(toRecord(row));
});

// GET /api/submissions  — list all records (newest first)
app.get('/api/submissions', (_req, res) => {
  const rows = db.prepare('SELECT * FROM submissions ORDER BY id DESC').all();
  res.json(rows.map(toRecord));
});

// GET /api/submissions/export.csv  — download all records as CSV
app.get('/api/submissions/export.csv', (_req, res) => {
  const rows = db.prepare('SELECT * FROM submissions ORDER BY id ASC').all();

  const headers = [
    'Submission #', 'Timestamp', 'Date of Discussion', 'Crew',
    'Leader Name', 'Operator Badge #', 'Operator Name',
    'KPIs Discussed', 'Follow-up Required', 'Comments',
  ];

  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map(r => {
    const kpis = JSON.parse(r.kpis).join('; ');
    return [r.id, r.created_at, r.date, r.crew, r.leader, r.badge, r.op_name, kpis, r.follow_up, r.comments]
      .map(escape)
      .join(',');
  });

  const csv = [headers.map(escape).join(','), ...lines].join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="cnrl_coaching_data.csv"');
  res.send(csv);
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function toRecord(r) {
  return {
    id: r.id,
    timestamp: r.created_at,
    date: r.date,
    crew: r.crew,
    leader: r.leader,
    badge: r.badge,
    opName: r.op_name,
    kpis: JSON.parse(r.kpis),
    followUp: r.follow_up,
    comments: r.comments,
  };
}

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`CNRL Coaching server running at http://localhost:${PORT}`);
});
