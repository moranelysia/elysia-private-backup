/** S-12A健康入口：没有Electron、业务模块、密钥读取、网络监听或后台计时器。 */
'use strict'
const { StringDecoder } = require('node:string_decoder')
const { 读取健康配置 } = require('../core/运行配置.cjs')
const 健康 = () => ({ 版本: 1, 模式: 'health', 状态: 'healthy', 业务就绪: false, 模型已加载: false, 渠道已连接: false, 后台任务: 0 })
function 运行健康入口(参数 = process.argv.slice(2)) {
  const 写 = (值) => process.stdout.write(JSON.stringify(值) + '\n')
  let 已停止 = false, 缓冲 = ''
  const 解码 = new StringDecoder('utf8')
  function 清理() {
    process.stdin.off('data', 收到); process.stdin.off('end', 结束)
    process.stdin.pause()
    process.off('SIGINT', 信号退出); process.off('SIGTERM', 信号退出)
  }
  function 停止(退出码 = 0, 回应 = true) {
    if (已停止) return
    已停止 = true; 清理(); process.exitCode = 退出码
    if (回应) 写({ 版本: 1, 状态: 'stopped' })
  }
  function 错误(代码) { 写({ 版本: 1, 好: false, 代码 }) }
  function 命令(行) {
    if (Buffer.byteLength(行, 'utf8') > 1024) { 错误('HEALTH_INPUT_TOO_LARGE'); 停止(2); return }
    try {
      const 值 = JSON.parse(行)
      if (!值 || Object.getPrototypeOf(值) !== Object.prototype || Object.keys(值).length !== 1) throw new Error()
      if (值.操作 === 'health') 写(健康())
      else if (值.操作 === 'shutdown') 停止()
      else throw new Error()
    } catch { 错误('HEALTH_COMMAND_INVALID') }
  }
  function 收到(块) {
    缓冲 += 解码.write(块)
    let 位置
    while (!已停止 && (位置 = 缓冲.indexOf('\n')) >= 0) { const 行 = 缓冲.slice(0, 位置).replace(/\r$/u, ''); 缓冲 = 缓冲.slice(位置 + 1); 命令(行) }
    if (!已停止 && Buffer.byteLength(缓冲, 'utf8') > 1024) { 错误('HEALTH_INPUT_TOO_LARGE'); 停止(2) }
    if (已停止) 缓冲 = ''
  }
  function 结束() {
    if (已停止) return
    缓冲 += 解码.end()
    if (缓冲.trim()) 命令(缓冲)
    停止()
  }
  function 信号退出() { 停止() }
  process.stdout.on('error', () => { process.exitCode = 1; 停止(1, false) })
  process.stderr.on('error', () => {})
  process.stdin.on('error', () => { if (!已停止) { 错误('HEALTH_INPUT_FAILED'); 停止(2) } })
  try {
    if (process.versions.electron || !Array.isArray(参数) || ![2, 3].includes(参数.length) || 参数[0] !== '--config' || (参数.length === 3 && 参数[2] !== '--once')) throw new Error('HEADLESS_ARGUMENT_INVALID')
    读取健康配置(参数[1])
    写(健康())
    if (参数[2] === '--once') { 已停止 = true; return }
    process.on('SIGINT', 信号退出); process.on('SIGTERM', 信号退出)
    process.stdin.on('data', 收到); process.stdin.on('end', 结束); process.stdin.resume()
  } catch (错) {
    const 代码 = typeof 错?.message === 'string' && /^HEADLESS_[A-Z_]+$/u.test(错.message) ? 错.message : 'HEADLESS_START_FAILED'
    错误(代码); 停止(2, false)
  }
}
if (require.main === module) 运行健康入口()
module.exports = { 运行健康入口 }
