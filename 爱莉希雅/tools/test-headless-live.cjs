/** 显式--live且专用环境凭据齐备才允许一次真实请求；不导入正式配置/角色/数据。 */
'use strict'
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { 创建严格凭据, 创建真实模型连接 } = require('../脑/模型连接.cjs')
const { 创建隔离对话核心 } = require('../core/隔离对话核心.cjs')
let 临时根, 核心, 密钥 = process.env.ELYSIA_HEADLESS_API_KEY
delete process.env.ELYSIA_HEADLESS_API_KEY
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--live') throw new Error('LIVE_EXPLICIT_FLAG_REQUIRED')
  if (typeof 密钥 !== 'string' || 密钥.length < 20) throw new Error('LIVE_KEY_MISSING')
  for (const 名 of Object.keys(process.env)) if (名.startsWith('ELYSIA_')) delete process.env[名]
  临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-headless-live-'))
  const 配置 = { 版本: 1, 模式: 'real-chat', 隔离根: 临时根, 工作区: path.join(临时根, 'workspace'), 角色卡: path.join(临时根, 'persona.json'), 数据目录: path.join(临时根, 'data'), 缓存目录: path.join(临时根, 'cache'), 学习区: path.join(临时根, 'learning'), 附件目录: path.join(临时根, 'data', 'attachments'), 纸条目录: path.join(临时根, 'cache', 'notes'), 进度文件: path.join(临时根, 'learning', 'progress.md') }
  const 配置文件 = path.join(临时根, 'headless.config.json')
  fs.writeFileSync(配置文件, JSON.stringify(配置)); fs.writeFileSync(path.join(临时根, '.elysia-isolated-root.json'), JSON.stringify({ 版本: 1, 用途: 'headless-test' }))
  fs.writeFileSync(配置.角色卡, JSON.stringify({ data: { name: '爱莉希雅', personality: '用第一人称中文自然说话。', scenario: '独立隔离测试，没有用户资料。' } }))
  const 模型连接 = 创建真实模型连接({ 凭据: 创建严格凭据({ 读取: () => 密钥 }) })
  核心 = 创建隔离对话核心({ 配置文件, 模型连接 })
  let 代码 = null, 成功 = false
  try {
    const 时间 = new Date().toISOString()
    const 果 = await 核心.处理({ 版本: 1, 端点: { 渠道: 'fake', 账号: 'live-test' }, 会话: { 类型: 'private', 编号: 'local-test' }, 发送者编号: 'synthetic', 消息编号: 'live-one', 发生于: 时间, 接收于: 时间, 回复消息编号: null, 正文: '这是一次连通测试，请用一句简短中文打个招呼。', 附件: [] }, { 内部对话编号: 'channel-live-test' })
    成功 = 果.可见性 === 'shared' && !!果.正文.trim()
  } catch (错) { 代码 = /^CORE_[A-Z_]+$/u.test(错?.message || '') ? 错.message : 'LIVE_FAILED' }
  finally { await 核心.关闭() }
  const 用量文件 = path.join(配置.数据目录, '核心用量.jsonl')
  const 用量 = fs.existsSync(用量文件) ? fs.readFileSync(用量文件, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
  const 报告 = { 时间: new Date().toISOString(), 成功, 代码, 请求上限: 1, 输出Token上限: 256, 总超时毫秒: 20000, 模型: 'deepseek-flash', 已发请求: 模型连接.取状态().已发请求, 用量 }
  const 报告根 = path.resolve(__dirname, '../.cache/无界面联通测试'); fs.mkdirSync(报告根, { recursive: true })
  fs.writeFileSync(path.join(报告根, Date.now() + '.json'), JSON.stringify(报告, null, 2), { flag: 'wx', encoding: 'utf8' })
  process.stdout.write(JSON.stringify({ 成功, 代码, 已发请求: 报告.已发请求, 用量已取得: 用量.some((一) => 一.状态 === 'succeeded' && 一.用量), 报告目录: '.cache/无界面联通测试' }) + '\n')
  if (!成功) process.exitCode = 2
}
main().catch((错) => { process.stdout.write(JSON.stringify({ 成功: false, 代码: ['LIVE_EXPLICIT_FLAG_REQUIRED', 'LIVE_KEY_MISSING'].includes(错?.message) ? 错.message : 'LIVE_SETUP_FAILED' }) + '\n'); process.exitCode = 2 }).finally(async () => {
  密钥 = null; await 核心?.关闭()
  if (临时根) {
    const 目标 = path.resolve(临时根), 相对 = path.relative(path.resolve(os.tmpdir()), 目标)
    if (相对 && !path.isAbsolute(相对) && !相对.startsWith('..') && path.basename(目标).startsWith('elysia-headless-live-')) fs.rmSync(目标, { recursive: true, force: true })
  }
})
