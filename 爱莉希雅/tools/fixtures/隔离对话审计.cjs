/** 测试预加载观测器：只允许源码与专用夹具I/O，任何网络/外部进程/旧凭据调用均失败。 */
'use strict'
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const 根 = fs.realpathSync(process.env.CORE_AUDIT_ROOT), 源码 = path.resolve(__dirname, '../..')
let 违规 = false
function 拒绝() { 违规 = true; throw new Error('CORE_AUDIT_FORBIDDEN') }
function 在内(基, 文件) { const 相对 = path.relative(基, 文件); return !path.isAbsolute(相对) && 相对 !== '..' && !相对.startsWith('..' + path.sep) }
function 核对(名, 写 = false) {
  if (typeof 名 === 'number') return
  const 文件 = path.resolve(String(名))
  if (!在内(根, 文件) && !(写 === false && 在内(源码, 文件) && 文件.endsWith('.cjs'))) 拒绝()
}
for (const 名 of ['readFileSync', 'readdirSync', 'openSync']) {
  const 原 = fs[名]
  fs[名] = function (文件, ...参数) { 核对(文件, 名 === 'openSync' && !['r', 'rs', 0].includes(参数[0])); return 原.call(this, 文件, ...参数) }
}
for (const 名 of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync', 'truncateSync']) {
  const 原 = fs[名]; fs[名] = function (文件, ...参数) { 核对(文件, true); return 原.call(this, 文件, ...参数) }
}
for (const 名 of ['renameSync', 'copyFileSync']) {
  const 原 = fs[名]; fs[名] = function (甲, 乙, ...参数) { 核对(甲, true); 核对(乙, true); return 原.call(this, 甲, 乙, ...参数) }
}
const 原加载 = Module._load
Module._load = function (名, ...其余) {
  if (名 === 'electron') 拒绝()
  if (!Module.isBuiltin(名)) {
    const 文件 = Module._resolveFilename(名, 其余[0]); 核对(文件)
    if (path.basename(文件) === '钥匙.cjs') return { 拿钥匙: 拒绝, 遮住: 拒绝 }
  }
  const 值 = 原加载.call(this, 名, ...其余)
  const 基名 = 名.replace(/^node:/u, '')
  if (基名 === 'child_process') for (const 键 of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) 值[键] = 拒绝
  if (['http', 'https'].includes(基名)) for (const 键 of ['request', 'get', 'createServer']) 值[键] = 拒绝
  if (基名 === 'net') { 值.connect = 值.createConnection = 值.createServer = 拒绝; 值.Socket.prototype.connect = 拒绝 }
  if (基名 === 'tls') 值.connect = 拒绝
  if (基名 === 'dgram') 值.createSocket = 拒绝
  return 值
}
global.fetch = 拒绝
process.on('exit', () => { if (违规) { process.exitCode = 3; process.stderr.write('CORE_AUDIT_FAILED\n') } else process.stderr.write('CORE_AUDIT_OK\n') })
