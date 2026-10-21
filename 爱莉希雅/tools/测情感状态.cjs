/** E1 即时反应层：纯内存、假时间、假网络，不读写真实记忆。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-emotion-'))
process.env.ELYSIA_DATA_DIR = path.join(根, 'data')
process.env.ELYSIA_CACHE_DIR = path.join(根, 'cache')
process.env.ELYSIA_SECURE_API_KEY = 'test-emotion-placeholder'

const { 创建反应层, 识别反应 } = require('../脑/情感状态.cjs')
let 总数 = 0
function 检查(说明, 条件) { assert.ok(条件, 说明); 总数++; console.log('✓ ' + 说明) }

async function main() {
  let 现在 = new Date('2026-10-16T10:00:00+08:00')
  const 层 = 创建反应层({ 现在: () => new Date(现在) })
  检查('普通问句不会被问号误判成情绪', 识别反应('今天星期几？') === null)
  检查('没有问题和不是不行不会被反向误判', 识别反应('现在没有问题，也不是不行') === null)
  检查('没怎么焦虑了不会继续被判成需要安慰', !(识别反应('其实也没怎么焦虑了') || {}).情绪 || 识别反应('其实也没怎么焦虑了').情绪 !== '关心')
  检查('明确难受优先进入关心反应', 层.接收用户('a', '我今天真的很难受，但作业通过了').情绪 === '关心')
  检查('成功反馈进入开心反应', 层.接收用户('b', '验收成功了').情绪 === '开心')
  const 轻快 = 层.接收用户('轻快', '这个项目的进展还是很顺利的')
  检查('真实聊天里的轻度顺利反馈也会触发变化', 轻快.情绪 === '开心' && 轻快.强度 > 0.3 && 轻快.强度 < 0.6)
  检查('轻度积极只给较小的缓慢增量', 层.情绪状态('轻快').强度 > 0 && 层.情绪状态('轻快').强度 < 0.16)
  检查('故障反馈进入认真反应', 层.接收用户('c', '这个按钮不工作，有问题').情绪 === '认真')
  检查('成功中同时报告新故障时优先认真处理', 层.接收用户('e', '验收成功，但是发现一个 bug').情绪 === '认真')
  检查('每段对话的即时状态互不串台', 层.状态('a').情绪 === '关心' && 层.状态('未使用').情绪 === '平静')
  const 原强度 = 层.状态('a').强度
  现在 = new Date(现在.getTime() + 5 * 60 * 1000)
  检查('五分钟后强度会自动降低', 层.状态('a').强度 < 原强度 && 层.状态('a').强度 > 0)
  现在 = new Date(现在.getTime() + 6 * 60 * 1000)
  检查('十分钟后自动回到平静', 层.状态('a').情绪 === '平静' && 层.状态('a').强度 === 0)
  层.接收用户('b', '太好了')
  检查('手动复位立即恢复平静', 层.重置('b').情绪 === '平静' && 层.状态('b').强度 === 0)
  const 当前反应 = 层.接收用户('d', '我有点焦虑，睡不着')
  const 当前情绪 = 层.情绪状态('d')
  检查('一次明确反应只给缓慢情绪小幅增量', 当前情绪.情绪 === '温柔' && 当前情绪.强度 > 0 && 当前情绪.强度 < 当前反应.强度)
  for (let i = 0; i < 6; i++) 层.接收用户('累积', '验收成功了')
  检查('多轮同类反应会累计但硬上限不超过百分之四十五', 层.情绪状态('累积').情绪 === '明快' && 层.情绪状态('累积').强度 === 0.45)
  层.接收用户('累积', '现在发现一个 bug')
  检查('单轮不同反应不会瞬间推翻已经形成的缓慢基调', 层.情绪状态('累积').情绪 === '明快')
  const 累积前 = 层.情绪状态('累积').强度
  现在 = new Date(现在.getTime() + 3 * 60 * 60 * 1000)
  检查('缓慢情绪会在数小时中持续回落', 层.情绪状态('累积').强度 < 累积前 && 层.情绪状态('累积').强度 > 0)
  现在 = new Date(现在.getTime() + 4 * 60 * 60 * 1000)
  检查('六小时后缓慢情绪回到平稳', 层.情绪状态('累积').情绪 === '平稳')
  检查('缓慢情绪可以独立手动复位', 层.重置情绪('d').情绪 === '平稳')
  const 新反应 = 层.接收用户('提示', '我有点焦虑，睡不着')
  const 提示 = 层.拼表达提示(新反应, 层.情绪状态('提示'))
  检查('表达提示只含有限状态而不复制用户原话', 提示.includes('即时状态：关心') && 提示.includes('近期基调：温柔') && 提示.includes('不改变身份') && !提示.includes('睡不着'))
  层.重置('提示')
  检查('只有缓慢情绪时仍提供轻微基调且不伪造即时反应', 层.拼表达提示(层.状态('提示'), 层.情绪状态('提示')).includes('近期基调：温柔'))
  检查('平静状态不额外占用模型上下文', 层.拼表达提示(层.状态('空')).length === 0)

  const 原fetch = global.fetch
  const 请求们 = []
  global.fetch = async (_地址, 参数) => {
    请求们.push(JSON.parse(参数.body))
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: '我在呢。' } }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const { 说话 } = require('../脑/对话.cjs')
    await 说话({ 他说的话: '在吗', 模式: 'chat', 记进记忆: false, 表达状态提示: 提示 })
    const 动态提示 = 请求们[0].messages.find((一) => typeof 一.content === 'string' && 一.content.includes('【当前即时反应'))
    检查('即时反应作为独立动态 system 消息进入真实请求', !!动态提示 && 动态提示.content === 提示)
  } finally { global.fetch = 原fetch }

  const 主进程 = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8')
  const 页面 = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8')
  检查('主进程计算两层状态并提供各自复位入口', 主进程.includes('情感状态.接收用户(这轮对话号, 文字)') && 主进程.includes('情感状态.情绪状态(这轮对话号)') && 主进程.includes("ipcMain.handle('重置情感状态'") && 主进程.includes("ipcMain.handle('重置缓慢情绪'"))
  检查('预载只暴露无参数查看复位和状态事件', 预载.includes('问情感状态: ()') && 预载.includes('重置情感状态: ()') && 预载.includes('重置缓慢情绪: ()') && 预载.includes('情感状态变了:'))
  检查('两层状态都收在左侧折叠状态区', 页面.includes('id="状态详情"') && 页面.includes('id="情感状态"') && 页面.includes('id="缓慢情绪"'))
  检查('界面显示两层衰减结果且可分别复位', 前端.includes('function 摆情感状态') && 前端.includes('window.爱莉.重置情感状态()') && 前端.includes('window.爱莉.重置缓慢情绪()') && 前端.includes('setInterval(() => void 刷新情感状态(), 30000)'))

  console.log(`\n情感状态：${总数}/${总数} 通过`)
}

main().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 }).finally(() => {
  try { fs.rmSync(根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
})
