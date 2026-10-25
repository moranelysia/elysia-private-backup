/** 仅测试子进程预加载：阻止业务模块、网络和文件写入，核对健康入口的实际依赖。 */
'use strict'
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')
const 入口 = path.resolve(process.argv[1])
const 允许源码 = new Set([__filename, 入口, path.resolve(path.dirname(入口), '../core/运行配置.cjs')])
const 根 = fs.realpathSync(process.env.HEALTH_AUDIT_ROOT)
let 违规 = false
function 拒绝() { 违规 = true; throw new Error('HEALTH_AUDIT_FORBIDDEN') }
const 原加载 = Module._load
Module._load = function (名, ...其余) {
  if (/^(?:node:)?(?:http|https|net|tls|dns|dgram|child_process|worker_threads)$/u.test(名)) 拒绝()
  if (!Module.isBuiltin(名) && !允许源码.has(Module._resolveFilename(名, 其余[0]))) 拒绝()
  return 原加载.call(this, 名, ...其余)
}
const 原读 = fs.readFileSync
fs.readFileSync = function (名, ...其余) {
  const 文件 = path.resolve(String(名)), 相对 = path.relative(根, 文件)
  if (!允许源码.has(文件) && (path.isAbsolute(相对) || 相对 === '..' || 相对.startsWith('..' + path.sep) || !['headless.config.json', '.elysia-isolated-root.json'].includes(path.basename(文件)))) 拒绝()
  return 原读.call(this, 名, ...其余)
}
for (const 名 of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'truncateSync']) fs[名] = 拒绝
const 原开 = fs.openSync
fs.openSync = function (名, 标志, ...其余) { if (!['r', 'rs', 0].includes(标志)) 拒绝(); return 原开.call(this, 名, 标志, ...其余) }
process.on('exit', () => {
  if (违规 || Object.keys(require.cache).some((一) => !允许源码.has(一))) { process.exitCode = 3; process.stderr.write('HEALTH_AUDIT_FAILED\n') }
  else process.stderr.write('HEALTH_AUDIT_OK\n')
})
