/** Test-only Worker preload; production Worker never loads this file. */
'use strict'
const { parentPort, workerData } = require('node:worker_threads'), { DatabaseSync } = require('node:sqlite')
const cfg = JSON.parse(process.env.CHANNEL_FAULT_FIXTURE || '{}'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const root = workerData.options.目录, source = path.resolve(__dirname, '../..'), oldRead = fs.readFileSync, oldLoad = Module._load
const inside = (a, b) => { const r = path.relative(a, b); return !path.isAbsolute(r) && r !== '..' && !r.startsWith('..' + path.sep) }
fs.readFileSync = function (file, ...args) { if (typeof file !== 'string' || (!inside(root, path.resolve(file)) && !(inside(source, path.resolve(file)) && (/\.(cjs|js)$/u.test(file) || path.basename(file) === 'package.json')))) throw Error('FIXTURE_READ_OUTSIDE_ISOLATION'); return oldRead.call(this, file, ...args) }
Module._load = function (id, ...args) { if (/^(node:)?(http|https|net|tls|dns)$/u.test(id) || /(?:^|[/\\])(配置|模型连接|对话)\.cjs$/u.test(id)) throw Error('FIXTURE_BUSINESS_OR_NETWORK_FORBIDDEN'); return oldLoad.call(this, id, ...args) }
const prepare = DatabaseSync.prototype.prepare
DatabaseSync.prototype.prepare = function (sql, ...args) {
  if (cfg.stage === 'journal-fail' && sql.startsWith("INSERT INTO repository_meta(key,value) VALUES('disk_worker_receipts'")) {
    let match = false
    try { match = prepare.call(this, "SELECT json_extract(body_json, '$.记录[0].状态') AS state FROM state_documents WHERE document_id='channel-tasks:fake'").get()?.state === cfg.state } catch {}
    if (match) throw Error('CHANNEL_FIXTURE_JOURNAL_FAILURE')
  }
  return prepare.call(this, sql, ...args)
}
const original = DatabaseSync.prototype.exec; let used = false
DatabaseSync.prototype.exec = function (sql, ...args) {
  let match = false
  if (sql === 'COMMIT' && !used) try { match = this.prepare("SELECT json_extract(body_json, '$.记录[0].状态') AS state FROM state_documents WHERE document_id='channel-tasks:fake'").get()?.state === cfg.state } catch {}
  if (match) { used = true; if (cfg.stage === 'before') { parentPort.postMessage({ fixture: true, kind: 'phase', state: cfg.state, stage: cfg.stage }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cfg.delay ?? 30000) } }
  const value = original.call(this, sql, ...args)
  if (match && cfg.stage === 'after') { parentPort.postMessage({ fixture: true, kind: 'phase', state: cfg.state, stage: cfg.stage }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cfg.delay ?? 30000) }
  return value
}
