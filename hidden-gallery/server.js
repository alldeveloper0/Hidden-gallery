require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const VISITOR_PASS = process.env.VISITOR_PASSPHRASE;
const ADMIN_PASS = process.env.ADMIN_PASSPHRASE;

if (!JWT_SECRET || !VISITOR_PASS || !ADMIN_PASS) {
  console.error('Missing required env vars. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'content.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    html: '<p class="placard">Prologue</p><p>Your opening paragraph goes here…</p>' +
          '<div class="rule"></div>' +
          '<div class="phase"><div class="num">01</div><div class="body">' +
          '<h3>Phase title</h3><p>Phase description goes here.</p></div></div>'
  }, null, 2));
}

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

function signToken(role) {
  return jwt.sign({ role }, JWT_SECRET, { expiresIn: '12h' });
}

// requireAdmin = true  -> only an admin session passes
// requireAdmin = false -> any valid session (visitor or admin) passes
function auth(requireAdmin) {
  return (req, res, next) => {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Not authorized' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requireAdmin && payload.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
      }
      req.role = payload.role;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Session expired' });
    }
  };
}

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 12 * 60 * 60 * 1000
};

// ---- Visitor gate ----
app.post('/api/verify', (req, res) => {
  const { passphrase } = req.body || {};
  if (passphrase === VISITOR_PASS) {
    res.cookie('session', signToken('visitor'), cookieOpts);
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

// ---- Admin login (separate secret from the visitor passphrase) ----
app.post('/api/admin/login', (req, res) => {
  const { passphrase } = req.body || {};
  if (passphrase === ADMIN_PASS) {
    res.cookie('session', signToken('admin'), cookieOpts);
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// ---- Content: only returned to a session that already passed the gate ----
app.get('/api/content', auth(false), (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(data);
});

// ---- Save edits (admin only) ----
app.post('/api/admin/save', auth(true), (req, res) => {
  const { html } = req.body || {};
  if (typeof html !== 'string') return res.status(400).json({ error: 'Missing html' });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ html }, null, 2));
  res.json({ ok: true });
});

// ---- Image upload (admin only) — stored as a real file, not base64 ----
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 20 * 1024 * 1024 } });
app.post('/api/admin/upload', auth(true), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(req.file.originalname) || '.jpg';
  const finalName = req.file.filename + ext;
  fs.renameSync(req.file.path, path.join(UPLOAD_DIR, finalName));
  res.json({ url: '/uploads/' + finalName });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => console.log(`Hidden Gallery listening on port ${PORT}`));
