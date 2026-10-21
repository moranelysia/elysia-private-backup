/**
 * 工作索引.cjs —— 只记用户确认过的工作任务最终落到了哪里。
 *
 * 它不属于陪伴记忆：不会混进事实、共同经历或小本子，也不在聊天模式出现。
 * 不保存终端输出、文件正文和模型内部过程，只留目标、最终状态、短结果和产物路径。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('./配置.cjs')
const 工具回执 = require('./工具回执.cjs')

const 索引文件 = path.join(配置.数据目录, '工作索引.json')
const 最多保留 = 500
let 编号尾数 = 0

function 现在() {
  const d = new Date()
  const 补 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}`
}

function 新编号() {
  编号尾数 = (编号尾数 + 1) % 1000
  return 'work-' + Date.now().toString(36) + '-' + 编号尾数
}

function 读({ 严格 = false } = {}) {
  try {
    const 原文 = fs.readFileSync(索引文件, 'utf8').replace(/^\uFEFF/, '').trim()
    if (!原文) return []
    const 值 = JSON.parse(原文)
    if (!Array.isArray(值)) throw new Error('根节点不是数组')
    return 值
  } catch (错误) {
    if (错误.code === 'ENOENT') return []
    if (严格) throw new Error('工作索引读不动，已取消写入：' + 错误.message)
    console.log('⚠ 工作索引读不动：' + 错误.message)
    return []
  }
}

function 写(条们) {
  fs.mkdirSync(path.dirname(索引文件), { recursive: true })
  const 临时 = 索引文件 + '.tmp'
  try {
    fs.writeFileSync(临时, JSON.stringify(条们, null, 2), 'utf8')
    fs.renameSync(临时, 索引文件)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
}

function 截(值, 最长) {
  return String(值 == null ? '' : 值).trim().slice(0, 最长)
}

/** 状态只看程序实际收到的工具回执，不采信模型在正文里自称“完成”。 */
function 从工具判断状态(工具们) {
  return 工具回执.从工具判断状态(工具们)
}

function 登记({ 对话, 目标, 工作区, 结果摘要, 工具们, 产物们, 状态 } = {}) {
  const 干净目标 = 截(目标, 500)
  if (!干净目标) return { 好: false, 说明: '工作目标不能为空' }
  const 最终状态 = ['已完成', '部分完成', '失败'].includes(状态) ? 状态 : 从工具判断状态(工具们)
  const 工具 = (Array.isArray(工具们) ? 工具们 : []).slice(0, 30).map((一) => ({
    名字: 截(一 && (一.名字 || (一.工具 && 一.工具.名字)), 60) || '未知工具',
    成功: 工具回执.取(一).执行状态 === '成功',
    执行状态: 工具回执.取(一).执行状态,
    验证状态: 工具回执.取(一).验证状态,
    目标完成: 工具回执.取(一).目标完成,
  }))
  const 产物 = [...new Set((Array.isArray(产物们) ? 产物们 : []).map((一) => 截(一, 1000)).filter(Boolean))].slice(0, 20)
  const 条 = {
    编号: 新编号(),
    完成时间: 现在(),
    状态: 最终状态,
    对话: 截(对话, 120),
    目标: 干净目标,
    工作区: 截(工作区, 1000),
    结果摘要: 截(结果摘要, 800),
    工具,
    产物,
  }
  const 全部 = 读({ 严格: true })
  全部.push(条)
  写(全部.slice(-最多保留))
  return { 好: true, 条 }
}

function 列({ 搜索 = '', 最多 = 100 } = {}) {
  const 关键词 = 截(搜索, 80).toLocaleLowerCase()
  const 限量 = Math.max(1, Math.min(200, Number(最多) || 100))
  const 筛过 = 读().filter((一) => {
    if (!一 || typeof 一 !== 'object') return false
    if (!关键词) return true
    return `${一.目标 || ''}\n${一.结果摘要 || ''}\n${一.工作区 || ''}\n${(一.产物 || []).join('\n')}`.toLocaleLowerCase().includes(关键词)
  }).reverse()
  return { 列表: 筛过.slice(0, 限量), 总数: 筛过.length, 截断: 筛过.length > 限量 }
}

/**
 * 给界面的只读视图。与给模型的“列”分开：界面必须知道文件损坏，不能把坏文件当成空清单。
 * 这里只返回白名单字段，避免以后索引内部增加字段时顺手暴露给 renderer。
 */
function 给界面({ 搜索 = '', 状态 = '', 最多 = 100 } = {}) {
  const 关键词 = 截(搜索, 80).toLocaleLowerCase()
  const 状态筛选 = ['已完成', '部分完成', '失败'].includes(状态) ? 状态 : ''
  const 限量 = Math.max(1, Math.min(200, Number(最多) || 100))
  const 筛过 = 读({ 严格: true }).filter((一) => {
    if (!一 || typeof 一 !== 'object') return false
    if (状态筛选 && 一.状态 !== 状态筛选) return false
    if (!关键词) return true
    return `${一.目标 || ''}\n${一.结果摘要 || ''}\n${一.工作区 || ''}\n${一.对话 || ''}\n${(一.产物 || []).join('\n')}`
      .toLocaleLowerCase()
      .includes(关键词)
  }).reverse()
  const 列表 = 筛过.slice(0, 限量).map((一) => ({
    编号: 截(一.编号, 120),
    完成时间: 截(一.完成时间, 40),
    状态: ['已完成', '部分完成', '失败'].includes(一.状态) ? 一.状态 : '状态未记录',
    对话: 截(一.对话, 120),
    目标: 截(一.目标, 500) || '目标未记录',
    工作区: 截(一.工作区, 1000),
    结果摘要: 截(一.结果摘要, 800),
    工具: (Array.isArray(一.工具) ? 一.工具 : []).slice(0, 30).map((工具) => ({
      名字: 截(工具 && 工具.名字, 60) || '未知工具',
      成功: !!(工具 && 工具.成功),
      执行状态: 截(工具 && 工具.执行状态, 20),
      验证状态: 截(工具 && 工具.验证状态, 20),
      目标完成: 截(工具 && 工具.目标完成, 20),
    })),
    产物: (Array.isArray(一.产物) ? 一.产物 : []).slice(0, 20).map((路径) => 截(路径, 1000)).filter(Boolean),
  }))
  return { 列表, 总数: 筛过.length, 截断: 筛过.length > 限量 }
}

/** 只给工作模式最近几项，提醒她之前做过什么；失败项也标清，不能当成成功经历。 */
function 给她看({ 最多 = 12 } = {}) {
  const 条们 = 列({ 最多 }).列表
  if (!条们.length) return ''
  const 行 = ['===== 最近的工作索引 =====', '', '这是程序按实际回执留下的工作记录，不是陪伴记忆。失败或部分完成的任务不能说成已经完成。', '']
  for (const 一 of 条们) {
    行.push(`· [${一.完成时间 || '时间未记录'}] [${一.状态 || '状态未记录'}] ${一.目标 || '目标未记录'}`)
    if (一.结果摘要) 行.push(`  结果：${一.结果摘要}`)
    if (Array.isArray(一.产物) && 一.产物.length) 行.push(`  产物：${一.产物.join('；')}`)
  }
  return 行.join('\n')
}

module.exports = { 登记, 列, 给界面, 给她看, 从工具判断状态, 索引文件, 最多保留 }
