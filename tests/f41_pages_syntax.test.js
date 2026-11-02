const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
// every inline script of every page must at least parse: a single typo blanks the whole screen (it happened once on the platform console)
test('F41 inline scripts of all pages parse', () => {
  const dir = path.join(__dirname, '..', 'public'), bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
      if (/type="(?!text\/javascript|module)/.test(m[1])) return;
      try { new Function(m[2]); } catch (e) { bad.push(`${f} script #${i}: ${e.message}`); }
    });
  }
  assert.deepEqual(bad, []);
});
test('F41 shared scripts parse', () => {
  const dir = path.join(__dirname, '..', 'public'), bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) { try { new Function(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { bad.push(f + ': ' + e.message); } }
  assert.deepEqual(bad, []);
});
