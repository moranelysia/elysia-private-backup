/** S-12B：专用Node进程内，显式隔离配置先于业务require；仅假连接，无生产入口。 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { 读取假对话配置 } = require('./运行配置.cjs')
const { 是假模型连接 } = require('../脑/模型连接.cjs')
const { 校验接收消息 } = require('../脑/渠道契约.cjs')
const 环境字段 = { ELYSIA_WORKSPACE_ROOT: '工作区', ELYSIA_CONFIG_FILE: '配置文件', ELYSIA_PERSONA_PATH: '角色卡', ELYSIA_DATA_DIR: '数据目录', ELYSIA_CACHE_DIR: '缓存目录', ELYSIA_学习区: '学习区', ELYSIA_附件目录: '附件目录', ELYSIA_纸条目录: '纸条目录', ELYSIA_进度文件: '进度文件' }
let 已使用进程 = false
function 失败(代码) { throw new Error(代码) }
function 创建隔离对话核心({ 配置文件, 模型连接 } = {}) {
  if (process.versions.electron || 已使用进程 || require.cache[require.resolve('../脑/配置.cjs')]) 失败('CORE_DEDICATED_PROCESS_REQUIRED')
  if (!是假模型连接(模型连接)) 失败('CORE_MODEL_REQUIRED')
  for (const 键 of Object.keys(process.env)) if (键.startsWith('ELYSIA_') && !Object.hasOwn(环境字段, 键) && !(键 === 'ELYSIA_USE_USER_DATA' && process.env[键] === '0')) 失败('CORE_ENV_CONFLICT')
  const 配置 = 读取假对话配置(配置文件)
  const 写入根 = [配置.数据目录, 配置.缓存目录, 配置.学习区]
  let 已关闭 = false, 处理数 = 0, 链 = Promise.resolve(), 锁fd
  const 中止 = new AbortController(), 锁文件 = path.join(配置.数据目录, '.headless-fake.lock'), 锁令牌 = randomUUID()
  const 已见文件 = new Set()
  const 预期环境 = Object.fromEntries(Object.entries(环境字段).map(([键, 字段]) => [键, 配置[字段]]))
  Object.assign(预期环境, { ELYSIA_USE_USER_DATA: '0', ELYSIA_PRIVATE_DIARY_ENABLED: '0' })
  function 检查存储() {
    if (已关闭) 失败('CORE_CLOSED')
    if (JSON.stringify(读取假对话配置(配置文件)) !== JSON.stringify(配置)) 失败('CORE_CONFIG_CHANGED')
    for (const [键, 值] of Object.entries(预期环境)) if (process.env[键] !== 值) 失败('CORE_ENV_CONFLICT')
    for (const 键 of Object.keys(process.env)) if (键.startsWith('ELYSIA_') && !Object.hasOwn(预期环境, 键)) 失败('CORE_ENV_CONFLICT')
    // 每次实际操作前复查业务子路径，不能仅依赖启动时的配置快照。
    let 数 = 0
    function 遍历(文件, 深度 = 0) {
      if (++数 > 10000 || 深度 > 16) 失败('CORE_STORE_LIMIT')
      let 状态
      try { 状态 = fs.lstatSync(文件) } catch (错) { if (错.code === 'ENOENT') return; throw 错 }
      if (状态.isSymbolicLink() || (!状态.isDirectory() && (!状态.isFile() || 状态.nlink > 1))) 失败('CORE_STORE_LINK')
      if (状态.isDirectory()) for (const 名 of fs.readdirSync(文件)) 遍历(path.join(文件, 名), 深度 + 1)
    }
    for (const 根 of 写入根) 遍历(根)
    if (锁fd !== undefined && (!fs.existsSync(锁文件) || fs.readFileSync(锁文件, 'utf8') !== 锁令牌)) 失败('CORE_STORE_OWNERSHIP')
    for (const 文件 of [path.join(配置.数据目录, '聊天记录', '聊天记录.jsonl'), path.join(配置.数据目录, '聊天记录', '对话索引.json')]) {
      if (fs.existsSync(文件)) 已见文件.add(文件)
      else if (已见文件.has(文件)) 失败('CORE_STORE_MISSING')
    }
  }
  function 释放锁() {
    if (锁fd === undefined) return
    try { fs.closeSync(锁fd) } finally { 锁fd = undefined }
    // 只释放自己仍持有的常规文件；残锁接管另属S-16。
    try {
      if (JSON.stringify(读取假对话配置(配置文件, { 环境: {} })) !== JSON.stringify(配置)) return
      const 状态 = fs.lstatSync(锁文件)
      if (状态.isFile() && !状态.isSymbolicLink() && 状态.nlink === 1 && fs.readFileSync(锁文件, 'utf8') === 锁令牌) fs.unlinkSync(锁文件)
    } catch { /* 保留不确定状态 */ }
  }
  let 记忆, 对话
  try {
    Object.assign(process.env, 预期环境)
    已使用进程 = true
    检查存储()
    fs.mkdirSync(配置.数据目录, { recursive: true })
    检查存储()
    try { 锁fd = fs.openSync(锁文件, 'wx'); fs.writeFileSync(锁fd, 锁令牌) } catch { 失败('CORE_STORE_IN_USE') }
    检查存储()
    记忆 = require('../脑/记忆.cjs')
    对话 = require('../脑/对话.cjs')
  } catch (错) { 释放锁(); throw new Error(/^HEADLESS_[A-Z_]+$|^CORE_[A-Z_]+$/u.test(错.message) ? 错.message : 'CORE_BOOT_FAILED') }
  async function 执行(消息, 上下文) {
    if (已关闭) 失败('CORE_CLOSED')
    const 信号 = 上下文.中止 ? AbortSignal.any([中止.signal, 上下文.中止]) : 中止.signal
    if (信号.aborted) 失败('CORE_ABORTED')
    检查存储()
    const 历史 = 记忆.读最近聊天(400, { 对话: 上下文.内部对话编号 })
      .filter((条) => ['user', 'assistant'].includes(条.角色))
      .map((条) => ({ role: 条.角色, content: 条.内容, 时间: 条.时间 }))
    const 登记 = 记忆.登记对话(上下文.内部对话编号, { 模型: 'fake', 建于: 消息.接收于 })
    if (!登记.好) 失败('CHAT_REGISTRATION_FAILED')
    检查存储()
    const 果 = await 对话.说话({
      他说的话: 消息.正文, 历史, 对话编号: 上下文.内部对话编号, 模式: 'chat', 模型: 'fake', 模型连接,
      记进记忆: true, 写长期记忆: false, 后台整理: false, 后台关系整理: false, 后台提取: false,
      严格会话保存: true, 保存前检查: 检查存储, 发生于: 消息.发生于, 接收于: 消息.接收于, 中止: 信号,
    })
    if (信号.aborted || 已关闭) 失败('CORE_ABORTED')
    if (!果.聊天保存?.好 || 果.聊天保存.状态 !== 'saved') 失败('CHAT_TURN_WRITE_FAILED')
    检查存储()
    处理数++
    // 严格白名单，原始模型文字/标记、工具日志、召回资料、保存回执均不进入渠道。
    return { 可见性: 'shared', 正文: 果.她说的话, 附件: [] }
  }
  function 处理(输入, 上下文) {
    let 消息, 归属
    try {
      if (已关闭) 失败('CORE_CLOSED')
      消息 = 校验接收消息(输入)
      if (消息.端点.渠道 !== 'fake' || 消息.附件.length) 失败('CORE_FAKE_TEXT_ONLY')
      if (!上下文 || typeof 上下文.内部对话编号 !== 'string' || !/^channel-[a-zA-Z0-9_-]{1,100}$/u.test(上下文.内部对话编号) || Object.keys(上下文).some((键) => !['内部对话编号', '中止'].includes(键)) || (上下文.中止 !== undefined && !(上下文.中止 instanceof AbortSignal))) 失败('CORE_CONTEXT_INVALID')
      归属 = Object.freeze({ 内部对话编号: 上下文.内部对话编号, 中止: 上下文.中止 })
    } catch { return Promise.reject(new Error(已关闭 ? 'CORE_CLOSED' : 'CORE_INPUT_INVALID')) }
    const 本次 = 链.then(() => 执行(消息, 归属)).catch((错) => {
      const 代码 = /^(CORE|CHAT|HEADLESS)_[A-Z_]+$/u.test(错?.message || '') ? 错.message : 'CORE_PROCESSING_FAILED'
      throw new Error(代码)
    })
    链 = 本次.catch(() => {}); return 本次
  }
  return Object.freeze({ 处理, 关闭() { if (已关闭) return; 中止.abort(); 已关闭 = true; 释放锁() },
    取状态: () => ({ 版本: 1, 模式: 'fake-chat', 已关闭, 处理数, 后台任务: 0, 真实模型: false }),
  })
}
module.exports = { 创建隔离对话核心 }
