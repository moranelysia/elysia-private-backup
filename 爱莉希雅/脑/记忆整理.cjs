/**
 * 长期事实的后台语义整理。
 *
 * 聊天回复先完成；这里只在后台排队。DeepSeek 先提合并方案，再用第二次请求复核。
 * 本地代码最后按版本号和记录编号校验，通过后才原子替换事实文件。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('./配置.cjs')
const 记忆 = require('./记忆.cjs')
const 记忆关系整理 = require('./记忆关系整理.cjs')
const 记忆聚类就绪 = require('./记忆聚类就绪.cjs')

const 历史目录 = path.join(配置.数据目录, '整理历史')
let 正在整理 = false
let 待补一次 = null
let 历史尾数 = 0

function 解析JSON(文字) {
  const 原 = String(文字 || '').trim()
  try { return JSON.parse(原) } catch { /* 再尝试抠代码块或正文中的对象 */ }
  const 匹配 = 原.match(/\{[\s\S]*\}/)
  if (!匹配) throw new Error('模型没有返回 JSON 对象')
  return JSON.parse(匹配[0])
}

async function 问JSON({ 钥匙, 地址, 模型, 消息们, fetch函数 = global.fetch, 超时 = 60000 }) {
  const 掐 = new AbortController()
  const 闹钟 = setTimeout(() => 掐.abort(), 超时)
  try {
    const 回应 = await fetch函数(地址, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify({ model: 模型, messages: 消息们, stream: false, temperature: 0, max_tokens: 2200 }),
      signal: 掐.signal,
    })
    if (!回应.ok) throw new Error('HTTP ' + 回应.status)
    const 包 = await 回应.json()
    const 内容 = 包 && 包.choices && 包.choices[0] && 包.choices[0].message && 包.choices[0].message.content
    return 解析JSON(内容)
  } finally {
    clearTimeout(闹钟)
  }
}

function 规整方案(值) {
  const 原组 = Array.isArray(值 && 值.合并) ? 值.合并 : []
  return 原组.slice(0, 5).map((一) => ({
    编号们: [...new Set((Array.isArray(一 && 一.编号们) ? 一.编号们 : []).map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 5),
    新内容: String((一 && 一.新内容) || '').trim().slice(0, 801),
    理由: String((一 && 一.理由) || '').trim().slice(0, 200),
  }))
}

function 写整理历史(快照, 方案, 结果信息 = {}) {
  fs.mkdirSync(历史目录, { recursive: true })
  const 时 = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  历史尾数 = (历史尾数 + 1) % 1000
  const 文件 = path.join(历史目录, `${时}-${String(历史尾数).padStart(3, '0')}.json`)
  const 临时 = 文件 + '.tmp'
  fs.writeFileSync(临时, JSON.stringify({ 格式版本: 1, 创建时间: new Date().toISOString(), 快照, 方案, ...结果信息 }, null, 2), 'utf8')
  fs.renameSync(临时, 文件)

  const 文件们 = fs.readdirSync(历史目录).filter((名) => 名.endsWith('.json')).sort()
  for (const 名 of 文件们.slice(0, Math.max(0, 文件们.length - 20))) {
    try { fs.rmSync(path.join(历史目录, 名), { force: true }) } catch { /* 历史清理失败不影响事实 */ }
  }
  return 文件
}

async function 整理一次({ 钥匙, 地址, 模型 = 'deepseek-chat', fetch函数 = global.fetch, 对话 = '' } = {}) {
  if (!钥匙 || !地址) return { 好: false, 跳过: true, 说明: '没有模型连接信息' }
  const 快照 = 记忆.事实整理快照()
  if (快照.记录.length < 2) return { 好: true, 跳过: true, 说明: '事实不足两条' }

  const 数据 = JSON.stringify(快照.记录)
  const 提议 = await 问JSON({
    钥匙, 地址, 模型, fetch函数,
    消息们: [
      { role: 'system', content: '你在整理爱莉希雅自己的长期记忆。只合并语义重复、可以无损合成的事实；不同时间、不同对象、可能冲突或不确定的事实绝不能合并。新内容必须站在她自己的视角：称眼前的人为“你”，称爱莉希雅为“我”或“我们”；禁止写“用户、用户本人、爱莉、爱莉希雅”，也禁止用“他/她”代指两人。第三方人物使用原文姓名。只返回 JSON：{"合并":[{"编号们":["id1","id2"],"新内容":"保留全部有效细节的单条事实","理由":"简短原因"}]}。没有安全合并项就返回 {"合并":[]}。' },
      { role: 'user', content: '待整理事实：\n' + 数据 },
    ],
  })
  const 候选 = 规整方案(提议).filter((一) => 一.编号们.length >= 2 && 一.新内容)
  if (!候选.length) return { 好: true, 没变化: true, 合并组: 0, 减少: 0 }

  const 复核 = await 问JSON({
    钥匙, 地址, 模型, fetch函数,
    消息们: [
      { role: 'system', content: '你是记忆合并复核员。只有两条事实确定在说同一件事，且合并文本不丢失任何有效细节时才批准。对象不同、时间不同、存在冲突或无法确定，一律拒绝。只返回 JSON：{"批准组号":[0]}，组号从 0 开始；没有可批准项就返回 {"批准组号":[]}。' },
      { role: 'user', content: `原始事实：\n${数据}\n\n候选方案：\n${JSON.stringify(候选)}` },
    ],
  })
  const 批准号 = [...new Set((Array.isArray(复核 && 复核.批准组号) ? 复核.批准组号 : []).map(Number).filter(Number.isInteger))]
  const 批准 = 批准号.filter((i) => i >= 0 && i < 候选.length).map((i) => 候选[i])
  if (!批准.length) return { 好: true, 没变化: true, 合并组: 0, 减少: 0 }

  const 历史文件 = 写整理历史(快照, 批准, { 发起对话: String(对话 || ''), 状态: '准备应用' })
  const 应用 = 记忆.应用事实整理({ 版本: 快照.版本, 合并们: 批准 })
  if (应用.好 && !应用.没变化) {
    记忆关系整理.排队({ 原因: '后台事实合并后重新评估关系' })
    记忆聚类就绪.排队({ 原因: '后台事实合并后重新评估聚类就绪' })
  }
  return { ...应用, 历史文件: 应用.好 && !应用.没变化 ? 历史文件 : '' }
}

/** 只入队，不让聊天等待。运行中再次请求时合并成下一轮一次。 */
function 排队(选项 = {}) {
  if (正在整理) {
    待补一次 = 选项
    return { 已排队: true, 合并到下一轮: true }
  }
  正在整理 = true
  queueMicrotask(async () => {
    let 当前 = 选项
    while (当前) {
      待补一次 = null
      try {
        const 果 = await 整理一次(当前)
        if (果.好 && 果.减少) console.log(`  🧠 后台记忆整理完成：合并 ${果.合并组} 组，减少 ${果.减少} 条`)
        else if (!果.好 && !果.跳过) console.log('⚠ 后台记忆整理未应用：' + (果.说明 || '未知原因'))
      } catch (错误) {
        // 最关键的隔离：后台网络、模型、解析、磁盘任何失败都只记日志，不向聊天链抛出。
        console.log('⚠ 后台记忆整理失败（不影响聊天）：' + 错误.message)
      }
      当前 = 待补一次
    }
    正在整理 = false
  })
  return { 已排队: true, 合并到下一轮: false }
}

function 状态() {
  return { 正在整理, 还有一轮: !!待补一次 }
}

module.exports = { 整理一次, 排队, 状态, 解析JSON, 规整方案, 历史目录 }
