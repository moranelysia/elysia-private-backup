/** 显式两个本机根；只打印脱敏报告，不写盘、不启后台、不载入配置。 */
'use strict'
const { 检查只读影子, 创建影子范围 } = require('../storage/sqlite-shadow.cjs')
const 参数 = process.argv.slice(2)
if (参数.length !== 5 || 参数[0] !== '--data' || 参数[2] !== '--cache' || 参数[4] !== '--include-private-local') { console.error('Usage: node tools/检查SQLite只读影子.cjs --data <absolute> --cache <absolute> --include-private-local'); process.exitCode = 1 }
else {
  try { const r = 检查只读影子({ 数据目录: 参数[1], 缓存目录: 参数[3] }, 创建影子范围()); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.阻断.length ? 2 : 0 }
  catch (e) { console.error(/^SQLITE_[A-Z_]+$/u.test(e.message) ? e.message : 'SQLITE_SHADOW_READ_REJECTED'); process.exitCode = 1 }
}
