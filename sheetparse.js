// Reads the first sheet of an uploaded spreadsheet inside a worker thread with a time limit.
// The xlsx package has known prototype-pollution and ReDoS bugs when READING untrusted files and no fixed release; running it in a
// worker keeps any pollution out of the server process and lets us kill a runaway parse. (Writing files with xlsx is not affected.)
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
if (!isMainThread) {
  const X = require('xlsx');
  const wb = X.read(Buffer.from(workerData.buf), { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: workerData.max + 1 });
  parentPort.postMessage(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).slice(0, workerData.max));
} else {
  module.exports = function parseSheet(buf, { max = 500, ms = 4000 } = {}) {
    return new Promise((resolve, reject) => {
      const w = new Worker(__filename, { workerData: { buf: new Uint8Array(buf), max }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 } });
      const done = (fn, v) => { clearTimeout(timer); w.terminate(); fn(v); };
      const timer = setTimeout(() => done(reject, new Error('the file took too long to read')), ms);
      w.once('message', (rows) => done(resolve, rows)); w.once('error', (e) => done(reject, e));
    });
  };
}
