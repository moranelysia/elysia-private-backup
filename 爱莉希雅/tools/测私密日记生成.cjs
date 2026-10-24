/** M-32B：全部使用隔离临时目录和假模型，正式私密日记写入保持关闭。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('../脑/配置.cjs')
const { 共享日记投影 } = require('../脑/记忆日记.cjs')
const {
  创建私密日记生成器,
  生成私密日记,
  校验私密生成结果,
  规整私密来源,
  私密日记编号,
  含敏感信息,
  像助手回复,
} = require('../脑/私密日记.cjs')

const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-private-diary-'))
const 日期 = new Date(2026, 9, 14, 12, 0, 0)
const 次日 = new Date(2026, 9, 15, 9, 0, 0)
let 总数 = 0
let 通过 = 0

function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}
function 读JSON(文件) { return JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')) }
function 哈希(文件) { return crypto.createHash('sha256').update(fs.readFileSync(文件)).digest('hex') }
function 安全来源() {
  return [
    { 编号: '聊天:u1', 类型: '聊天', 时间: '2026-10-14 20:00', 标题: '他说', 摘要: '他坦白最近遇到了一些难处。' },
    { 编号: '聊天:u2', 类型: '聊天', 时间: '2026-10-14 20:01', 标题: '她在对话中说', 摘要: '她没有追问细节，只安静陪着。' },
  ]
}
function 有效结果(来源 = ['聊天:u1', '聊天:u2']) {
  return {
    触发: true,
    标题: '没有说出口的靠近',
    微妙情绪: '想靠近，却又怕这份关心变成负担',
    正文: '他把难处告诉我时，我忽然有点想靠近，却又怕这份关心变成负担。于是只把声音放轻了一点。',
    来源,
  }
}
function 新系统(名字, { 来源 = 安全来源(), 生成 = async () => 有效结果(), 现在 = () => new Date(次日) } = {}) {
  let 模型次数 = 0
  const 系统 = 创建私密日记生成器({
    数据目录: path.join(临时根, 名字),
    允许隔离写入: true,
    现在,
    取来源: async () => 来源,
    生成: async (参数) => { 模型次数++; return 生成(参数) },
  })
  return { 系统, 模型次数: () => 模型次数 }
}
async function 应拒绝(名字, 输出, 片段) {
  const { 系统 } = 新系统(名字, { 生成: async () => 输出 })
  let 错误字 = ''
  try { await 系统.整理一天({ 日期 }) } catch (错误) { 错误字 = 错误.message }
  const 文件 = 系统.日记路径('2026-10-14')
  检查(`${名字}会被拒绝且不落盘`, 错误字.includes(片段) && !fs.existsSync(文件))
}

async function main() {
  let 禁止正式 = false
  try { 创建私密日记生成器({ 数据目录: 配置.数据目录, 允许隔离写入: true }) } catch (错误) { 禁止正式 = 错误.message.includes('M-33') }
  检查('M-33 前硬拒绝向正式数据目录写入', 禁止正式)

  let 未启用取源 = 0
  const 未启用目录 = path.join(临时根, '未启用')
  const 未启用 = 创建私密日记生成器({ 数据目录: 未启用目录, 取来源: () => { 未启用取源++; return 安全来源() } })
  const 未启用结果 = await 未启用.整理一天({ 日期 })
  检查('默认状态明确关闭且不读取来源', 未启用结果.状态 === '正式写入未启用' && 未启用取源 === 0)
  检查('关闭状态不会创建任何目录', !fs.existsSync(未启用目录))

  检查('私密日记使用独立稳定编号', 私密日记编号('2026-10-14') === '私密日:2026-10-14')
  let 坏周期 = false
  try { 私密日记编号('2026-W42') } catch { 坏周期 = true }
  检查('私密日记编号拒绝非自然日周期', 坏周期)

  const 空 = 新系统('无来源', { 来源: [] })
  const 空结果 = await 空.系统.整理一天({ 日期 })
  检查('没有同日对话时零写入且不调用模型', 空结果.状态 === '无可用同日对话' && 空.模型次数() === 0 && !fs.existsSync(空.系统.日记路径('2026-10-14')))

  const 混合来源 = [
    ...安全来源(),
    { 编号: '长期记忆:1', 类型: '长期记忆', 时间: '2026-10-14 19:00', 标题: '事实', 摘要: '不允许进入私密日记。' },
    { 编号: '聊天:跨日', 类型: '聊天', 时间: '2026-10-13 23:59', 标题: '他说', 摘要: '跨日内容。' },
    { 编号: '聊天:u1', 类型: '聊天', 时间: '2026-10-14 20:00', 标题: '重复', 摘要: '重复内容。' },
  ]
  const 期间 = require('../脑/记忆日记.cjs').日期间(日期)
  const 规整 = 规整私密来源(混合来源, 期间)
  检查('只保留同日直接聊天并按编号去重', 规整.length === 2 && 规整.every((一) => 一.类型 === '聊天'))

  const 普通 = 新系统('普通情绪', { 生成: async () => ({ 触发: false }) })
  const 普通结果 = await 普通.系统.整理一天({ 日期 })
  检查('普通开心或担心可明确返回不生成', 普通结果.状态 === '没有微妙情绪波动' && 普通.模型次数() === 1)
  检查('不触发时不会为了连续性创建空文件', !fs.existsSync(普通.系统.日记路径('2026-10-14')))

  const 敏感来源 = [
    ...安全来源(),
    { 编号: '聊天:u3', 类型: '聊天', 时间: '2026-10-14 20:02', 标题: '账号 1234567890123456', 摘要: '密码：secret-123，文件在 F:\\private\\note.txt' },
  ]
  let 模型看见的来源 = []
  const 正常 = 新系统('正常写入', {
    来源: 敏感来源,
    生成: async ({ 来源们 }) => { 模型看见的来源 = 来源们; return 有效结果(['聊天:u1', '聊天:u2']) },
  })
  const 写入结果 = await 正常.系统.整理一天({ 日期 })
  const 文件 = 正常.系统.日记路径('2026-10-14')
  const 日记 = 读JSON(文件)
  检查('合格微妙情绪写成一篇 private 日记', 写入结果.写入 && 日记.可见性 === 'private' && 日记.编号 === '私密日:2026-10-14')
  检查('私密日记与普通日记使用不同目录', 文件.includes(`${path.sep}私密${path.sep}`) && !文件.includes(`${path.sep}日${path.sep}2026${path.sep}`))
  检查('正文既保存真实片段也保留微妙情绪表达', 日记.模块[0].名字 === '陪伴片段' && 日记.模块[0].正文.includes('想靠近，却又怕'))
  检查('只保存模型实际引用的同日来源链', 日记.来源.length === 2 && 日记.模块[0].来源.length === 2)
  检查('敏感来源在送模和落盘前整条剔除', 模型看见的来源.length === 2 && !JSON.stringify(模型看见的来源).includes('聊天:u3') && !JSON.stringify(日记).includes('secret-123'))
  检查('private 记录不能通过 shared 外发投影', 共享日记投影(日记) === null)

  const 初次哈希 = 哈希(文件)
  const 重复结果 = await 正常.系统.整理一天({ 日期 })
  检查('同一天重复调度不会再次调用模型或覆盖', 重复结果.状态 === '已存在' && 正常.模型次数() === 1 && 哈希(文件) === 初次哈希)
  检查('同一天始终只有一个物理文件', fs.readdirSync(path.dirname(文件)).filter((一) => 一.endsWith('.json')).length === 1)

  let 放行并发
  const 闸 = new Promise((resolve) => { 放行并发 = resolve })
  const 并发 = 新系统('并发', { 生成: async () => { await 闸; return 有效结果() } })
  const p1 = 并发.系统.整理一天({ 日期 })
  const p2 = 并发.系统.整理一天({ 日期 })
  检查('同一进程的并发请求合并为同一个承诺', p1 === p2)
  放行并发()
  const [并发一, 并发二] = await Promise.all([p1, p2])
  检查('并发合并只调用一次模型并只写一篇', 并发.模型次数() === 1 && 并发一.编号 === 并发二.编号 && fs.existsSync(并发.系统.日记路径('2026-10-14')))

  await 应拒绝('不存在来源', 有效结果(['聊天:不存在']), '不存在或跨日期')
  await 应拒绝('敏感正文', { ...有效结果(), 正文: '他的密码是 secret，想靠近，却又怕这份关心变成负担。' }, '敏感信息')
  await 应拒绝('助手回复', { ...有效结果(), 正文: '好的，你可以先休息。我想靠近，却又怕这份关心变成负担。' }, '助手回复')
  await 应拒绝('缺少情绪', { ...有效结果(), 微妙情绪: '' }, '微妙情绪')
  await 应拒绝('情绪不在正文', { ...有效结果(), 微妙情绪: '没有写进正文的情绪' }, '微妙情绪')
  await 应拒绝('正文过长', { ...有效结果(), 正文: `想靠近，却又怕这份关心变成负担。${'轻'.repeat(601)}` }, '过长')
  await 应拒绝('非法触发值', { 触发: 'true' }, '布尔值')

  const 仅敏感 = 新系统('仅敏感来源', { 来源: [敏感来源[2]] })
  const 仅敏感结果 = await 仅敏感.系统.整理一天({ 日期 })
  检查('当天只有敏感来源时直接零写入', 仅敏感结果.状态 === '无可用同日对话' && 仅敏感.模型次数() === 0 && !fs.existsSync(仅敏感.系统.日记路径('2026-10-14')))

  检查('本地敏感检测覆盖凭据、账号和本机路径', ['验证码：123456', '账号：moran', 'F:\\private\\x.txt', 'test@example.com'].every(含敏感信息))
  检查('助手回复检测不误伤合格日记正文', 像助手回复('好的，我来帮你整理。') && !像助手回复(有效结果().正文))

  let 请求 = null
  const 模型原文 = JSON.stringify(有效结果())
  const 返回 = await 生成私密日记({
    期间: { 周期: '2026-10-14' },
    来源们: 规整,
    钥匙: 'only-in-header',
    fetch函数: async (地址, 选项) => {
      请求 = { 地址, 选项 }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 模型原文 } }] }) }
    },
  })
  const 请求体 = JSON.parse(请求.选项.body)
  检查('真实生成函数使用非流式小输出请求', 请求体.stream === false && 请求体.max_tokens === 800 && 请求体.temperature === 0.35)
  检查('提示明确区分普通情绪与难说出口的波动', 请求体.messages[0].content.includes('普通开心') && 请求体.messages[0].content.includes('不触发'))
  检查('API Key 只在授权头而不进入请求正文', 请求.选项.headers.authorization === 'Bearer only-in-header' && !请求.选项.body.includes('only-in-header'))
  检查('生成函数原样返回模型结构供本地校验', 返回 === 模型原文 && !!校验私密生成结果(返回, 规整))

  let 今天拒绝 = false
  const 今天系统 = 新系统('未结束日期', { 现在: () => new Date(2026, 9, 14, 21, 0, 0) }).系统
  try { await 今天系统.整理一天({ 日期 }) } catch (错误) { 今天拒绝 = 错误.message.includes('已经结束') }
  检查('不会在当天尚未结束时冲动生成', 今天拒绝 && !fs.existsSync(今天系统.日记路径('2026-10-14')))

  const 普通日记源码 = fs.readFileSync(path.join(__dirname, '..', '脑', '记忆日记.cjs'), 'utf8')
  const 主进程源码 = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  检查('M-32B 没有接入普通日记调度器或主进程', !普通日记源码.includes("require('./私密日记.cjs')") && !主进程源码.includes('私密日记.cjs'))

  const 临时残留 = []
  function 找临时(目录) {
    if (!fs.existsSync(目录)) return
    for (const 项 of fs.readdirSync(目录, { withFileTypes: true })) {
      const 完整 = path.join(目录, 项.name)
      if (项.isDirectory()) 找临时(完整)
      else if (项.name.includes('.tmp-')) 临时残留.push(完整)
    }
  }
  找临时(临时根)
  检查('隔离写入没有遗留原子临时文件', 临时残留.length === 0)

  console.log(`\n私密日记隔离生成：${通过}/${总数} 通过`)
}

main().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 }).finally(() => {
  try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
})
