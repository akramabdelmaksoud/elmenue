// Shared test helpers: a throwaway real Postgres (embedded-postgres) and a server launcher.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

async function startPg() {
  const EmbeddedPostgres = require('embedded-postgres').default;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elm-pg-')), port = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('elm');
  return { url: `postgres://postgres:pw@localhost:${port}/elm`, stop: async () => { try { await pg.stop(); } catch (e) { if (!/EBUSY|EPERM/.test(String(e))) throw e; } try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch {} } };
}

// Start `node server.js` with extra env; resolves when /health answers.
async function startServer(env = {}) {
  const port = await freePort(), data = fs.mkdtempSync(path.join(os.tmpdir(), 'elm-data-'));
  const clean = { ...process.env }; for (const k of ['SINGLE_RESTAURANT', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'VERCEL', 'STATELESS', 'PUBLIC_URL', 'BASE_DOMAIN', 'NODE_ENV']) delete clean[k];
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...clean, PORT: port, DATA_DIR: data, SECRET: 'test-secret', SUPER_EMAIL: 'root@test.dev', SUPER_PASSWORD: 'rootpass1', ...env } });
  let log = ''; child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/health'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); if (child.exitCode !== null) throw new Error('server exited: ' + log); }
  const stop = () => new Promise((res) => { if (child.exitCode !== null) return res(child.exitCode); child.once('exit', res); child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 8000).unref(); });
  return { base, port, data, stop, log: () => log, child };
}
module.exports = { startPg, startServer, freePort };
