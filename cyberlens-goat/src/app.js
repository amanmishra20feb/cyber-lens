const express = require('express');
const { exec, execFile } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');
const config = require('./config');
const users = require('./users');

const app = express();
const db = mysql.createConnection(config.db);

app.get('/user', (req, res) => {
  db.query('SELECT * FROM users WHERE id = ' + req.query.id, (err, rows) => res.json(rows)); // VULN: CWE-89 A05
});

app.get('/user-safe', (req, res) => {
  db.query('SELECT * FROM users WHERE id = ?', [req.query.id], (err, rows) => res.json(rows)); // SAFE
});

app.get('/ping', (req, res) => {
  exec('ping -c 1 ' + req.query.host, (err, out) => res.send(out)); // VULN: CWE-78 A05
});

app.get('/ping-safe', (req, res) => {
  execFile('ping', ['-c', '1', String(req.query.host)], (err, out) => res.type('text').send(out)); // SAFE
});

app.get('/hello', (req, res) => {
  res.send('<h1>Hello ' + req.query.name + '</h1>'); // VULN: CWE-79 A05
});

app.post('/calc', express.json(), (req, res) => {
  res.json({ result: eval(req.body.expr) }); // VULN: CWE-95 A05
});

app.get('/file', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.query.name)); // VULN: CWE-22 A01
});

app.get('/go', (req, res) => {
  res.redirect(req.query.next); // VULN: CWE-601 A01
});

app.get('/go-safe', (req, res) => {
  res.redirect('/dashboard'); // SAFE
});

app.post('/login', express.json(), (req, res) => {
  const hash = crypto.createHash('md5').update(req.body.password).digest('hex'); // VULN: CWE-328 A04
  const token = jwt.sign({ user: req.body.user, hash }, config.jwtSecret); // VULN: CWE-613 A07
  res.cookie('session', token); // VULN: CWE-1004 A02
  res.json({ ok: true });
});

app.post('/login-safe', express.json(), (req, res) => {
  const token = jwt.sign({ user: req.body.user }, process.env.JWT_SECRET, { expiresIn: '1h' }); // SAFE
  res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax' }); // SAFE
  res.json({ ok: true });
});

app.get('/reset-token', (req, res) => {
  res.json({ token: Math.random().toString(36).slice(2) }); // VULN: CWE-338 A04
});

app.get('/reset-token-safe', (req, res) => {
  res.json({ token: crypto.randomBytes(32).toString('hex') }); // SAFE
});

app.get('/report', (req, res) => {
  try {
    res.json(JSON.parse(req.query.data));
  } catch (err) {} // VULN: CWE-390 A10
});

app.get('/search', (req, res) => {
  users.find({ $where: 'this.name == "' + req.query.name + '"' }).toArray((err, rows) => res.json(rows)); // VULN: CWE-943 A05
});

app.get('/search-safe', (req, res) => {
  users.find({ name: String(req.query.name) }).toArray((err, rows) => res.json(rows)); // SAFE
});

app.post('/audit', express.json(), (req, res) => {
  console.log('login attempt', req.body.user, req.body.password); // VULN: CWE-532 A09
  console.log('login attempt for', req.body.user); // SAFE
  res.sendStatus(204);
});

app.use((err, req, res, next) => {
  res.status(500).send(err.stack); // VULN: CWE-209 A10
});

app.listen(3000);
