/** DeepSeek 后台事实整理：全部使用系统临时目录与假响应，不联网。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-organize-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
process.env.ELYSIA_SECURE_API_KEY = 'sk-test-only-memory-organize-1234567890'

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}
function 模型回应(对象) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(对象) } }] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}
function 流回应(正文) {
  const sse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 正文 } }] }) + '\n\n' +
    'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) + '\n\n' +
    'data: [DONE]\n\n'
  return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
async function 等空闲(整理, 最多 = 1000) {
  const 开始 = Date.now()
  while (整理.状态().正在整理 && Date.now() - 开始 < 最多) await new Promise((好) => setTimeout(好, 5))
  return !整理.状态().正在整理
}

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 整理 = require(path.join(项目根, '脑', '记忆整理.cjs'))
  const a = 记忆.记一条('事实', '他正在学习 C 语言', '她')
  const b = 记忆.记一条('事实', '他目前在学 C 语言', '她')
  const c = 记忆.记一条('事实', '他的室友正在学习 Java', '她')

  let 请求数 = 0
  const 假fetch = async (_地址, 选项) => {
    请求数++
    const 请求 = JSON.parse(选项.body)
    检查('后台请求使用非流式低温度', 请求.stream === false && 请求.temperature === 0)
    if (请求数 === 1) return 模型回应({ 合并: [{ 编号们: [a.编号, b.编号], 新内容: '他正在学习 C 语言', 理由: '同一事实重复表达' }] })
    return 模型回应({ 批准组号: [0] })
  }
  const 结果 = await 整理.整理一次({ 钥匙: 'sk-test', 地址: 'https://example.invalid/chat', 模型: 'deepseek-chat', fetch函数: 假fetch, 对话: 'dialog-organize' })
  检查('提议和复核使用两次独立模型请求', 请求数 === 2)
  检查('通过复核后合并一组并减少一条', 结果.好 && 结果.合并组 === 1 && 结果.减少 === 1)
  const 整理后 = 记忆.全部长期记忆().filter((一) => 一.类别 === '事实')
  检查('重复事实只剩一条', 整理后.filter((一) => 一.内容 === '他正在学习 C 语言').length === 1)
  检查('不同对象的相似事实没有被误删', 整理后.some((一) => 一.编号 === c.编号 && 一.内容.includes('室友')))
  检查('保留记录带后台整理标记', 整理后.some((一) => 一.整理来源 === 'DeepSeek 后台整理' && 一.整理合并数量 === 2))
  检查('整理前快照已经留档', !!结果.历史文件 && fs.existsSync(结果.历史文件))
  const 历史文字 = fs.readFileSync(结果.历史文件, 'utf8')
  检查('历史包含原始两条事实和合并方案', 历史文字.includes(a.编号) && 历史文字.includes(b.编号) && 历史文字.includes('同一事实重复表达'))
  检查('历史不包含 API Key', !历史文字.includes('sk-test'))

  const 旧快照 = 记忆.事实整理快照()
  const 新增 = 记忆.记一条('事实', '他周一有早课', '她')
  const 改前 = fs.readFileSync(记忆.事实文件, 'utf8')
  const 过期 = 记忆.应用事实整理({ 版本: 旧快照.版本, 合并们: [{ 编号们: [c.编号, 新增.编号], 新内容: '错误合并' }] })
  检查('事实变化后旧方案会因版本过期被拒绝', !过期.好 && 过期.过期)
  检查('过期方案不会改写事实文件', fs.readFileSync(记忆.事实文件, 'utf8') === 改前)

  let 拒绝请求 = 0
  const 拒绝fetch = async () => (++拒绝请求 === 1)
    ? 模型回应({ 合并: [{ 编号们: [c.编号, 新增.编号], 新内容: '不该应用', 理由: '看起来相似' }] })
    : 模型回应({ 批准组号: [] })
  const 拒绝前 = fs.readFileSync(记忆.事实文件, 'utf8')
  const 拒绝 = await 整理.整理一次({ 钥匙: 'x', 地址: 'https://example.invalid', fetch函数: 拒绝fetch })
  检查('复核员拒绝后报告无变化', 拒绝.好 && 拒绝.没变化)
  检查('复核员拒绝后事实文件不变', fs.readFileSync(记忆.事实文件, 'utf8') === 拒绝前)

  const 失败前 = fs.readFileSync(记忆.事实文件, 'utf8')
  let 抛了 = false
  try {
    await 整理.整理一次({ 钥匙: 'x', 地址: 'https://example.invalid', fetch函数: async () => { throw new Error('模拟断网') } })
  } catch { 抛了 = true }
  检查('直接整理能报告网络失败供日志记录', 抛了)
  检查('网络失败不会改写事实文件', fs.readFileSync(记忆.事实文件, 'utf8') === 失败前)

  const 入队 = 整理.排队({ 钥匙: 'x', 地址: 'https://example.invalid', fetch函数: async () => { throw new Error('后台模拟断网') } })
  检查('排队立即返回而不等待网络', 入队.已排队 && 整理.状态().正在整理)
  检查('后台失败被隔离并最终回到空闲', await 等空闲(整理))
  检查('后台失败仍不改写事实文件', fs.readFileSync(记忆.事实文件, 'utf8') === 失败前)

  let 放行首轮
  const 首轮门 = new Promise((好) => { 放行首轮 = 好 })
  let 首轮请求 = 0
  let 次轮请求 = 0
  整理.排队({ 钥匙: 'x', 地址: 'https://example.invalid', fetch函数: async () => {
    首轮请求++
    await 首轮门
    return 模型回应({ 合并: [] })
  } })
  await new Promise((好) => setTimeout(好, 0))
  const 合并排队 = 整理.排队({ 钥匙: 'x', 地址: 'https://example.invalid', fetch函数: async () => {
    次轮请求++
    return 模型回应({ 合并: [] })
  } })
  检查('运行中再次请求会合并到下一轮', 合并排队.合并到下一轮 && 整理.状态().还有一轮)
  放行首轮()
  检查('两轮队列最终正常清空', await 等空闲(整理))
  检查('合并排队只各运行一次而不并发重入', 首轮请求 === 1 && 次轮请求 === 1)

  // 真正的说话链：流式回复结束就返回；后台请求故意悬着，证明界面不会等整理。
  let 放行后台
  const 后台等待 = new Promise((好) => { 放行后台 = 好 })
  let 已进入后台 = false
  const 原fetch = global.fetch
  global.fetch = async (_地址, 选项) => {
    const 请求 = JSON.parse(选项.body)
    if (请求.stream) return 流回应('收到。[记住:他喜欢喝温水]')
    已进入后台 = true
    await 后台等待
    return 模型回应({ 合并: [] })
  }
  try {
    const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))
    const 回 = await 说话({ 他说的话: '记住我喜欢喝温水', 模式: 'chat', 记进记忆: true, 写长期记忆: true, 后台整理: true })
    检查('聊天回复不等待后台整理完成', 回.她说的话 === '收到。' && 整理.状态().正在整理)
    await new Promise((好) => setTimeout(好, 0))
    检查('回复返回后后台才独立请求模型', 已进入后台)
    放行后台()
    检查('后台完成后队列回到空闲', await 等空闲(整理))
  } finally {
    global.fetch = 原fetch
    if (放行后台) 放行后台()
  }

  const 对话源码 = fs.readFileSync(path.join(项目根, '脑', '对话.cjs'), 'utf8')
  检查('只在事实变化后触发后台整理', 对话源码.includes('if (事实发生变化 && 该后台整理)'))
  检查('纯 Node 测试默认不会自动产生后台请求', 对话源码.includes("选项.后台整理 === 'boolean'") && 对话源码.includes(': 是真身'))

  console.log(`\n后台记忆整理：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
