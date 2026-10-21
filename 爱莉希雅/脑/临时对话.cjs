/**
 * 临时对话.cjs —— 只活在这次程序运行里的对话。
 *
 * 元数据和消息只放在 Map 里，不写 对话索引.json 或 聊天记录.jsonl。
 * 附件暂放 .cache\临时对话附件，正常退出和下次启动都会清掉。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('./配置.cjs')

const 表 = new Map()
const 临时附件根 = path.join(配置.缓存目录, '临时对话附件')
let 尾数 = 0

function 现在() {
  const d = new Date()
  const 补 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}`
}

function 建({ 模式 = 'chat', 模型 = '' } = {}) {
  尾数 = (尾数 + 1) % 1000
  const 编号 = `temp-${Date.now().toString(36)}-${尾数}`
  const 建于 = 现在()
  表.set(编号, {
    编号,
    标题: '临时对话',
    模式: String(模式 || 'chat'),
    模型: String(模型 || ''),
    建于,
    最后: 建于,
    写长期记忆: false,
    临时: true,
    消息: [],
  })
  return 编号
}

function 有(编号) {
  return 表.has(String(编号 || ''))
}

function 取(编号) {
  return 表.get(String(编号 || '')) || null
}

function 列表() {
  // Map 保留建立顺序，倒过来就是“最新在前”。不能只按 建于 排：
  // 显示时间只到分钟，同一分钟连开两段时会把旧的排在新的前面。
  return [...表.values()]
    .reverse()
    .map(({ 消息, ...一 }) => ({ ...一, 条数: 消息.length }))
}

function 设模式(编号, 模式) {
  const 一 = 取(编号)
  if (!一) return ''
  一.模式 = String(模式 || 'chat')
  return 一.模式
}

function 记一轮(编号, 他说的, 她说的) {
  const 一 = 取(编号)
  if (!一) return false
  const 时间 = 现在()
  一.消息.push({ role: 'user', content: String(他说的 || ''), 时间 })
  一.消息.push({ role: 'assistant', content: String(她说的 || ''), 时间 })
  一.最后 = 时间
  if (一.标题 === '临时对话') {
    const 首句 = String(他说的 || '')
      .split('\n')
      .find((行) => 行.trim() && !行.trim().startsWith('[附件]'))
    一.标题 = (首句 || '附件对话').replace(/\s+/g, ' ').trim().slice(0, 18)
  }
  return true
}

function 给模型(编号) {
  const 一 = 取(编号)
  return 一 ? 一.消息.map(({ role, content }) => ({ role, content })) : []
}

function 给界面(编号, 最多几条 = 0) {
  const 一 = 取(编号)
  if (!一) return []
  const 全部 = 一.消息.map(({ role, content, 时间 }) => ({
    角色: role,
    内容: content,
    时间,
    对话: 一.编号,
  }))
  return 最多几条 > 0 ? 全部.slice(-最多几条) : 全部
}

function 附件目录(编号) {
  if (!有(编号)) return ''
  return path.join(临时附件根, String(编号))
}

/** 删除一段临时对话及它自己的缓存附件。正式对话编号在这里永远删不动。 */
function 删(编号) {
  const 名 = String(编号 || '')
  if (!表.has(名)) return false
  表.delete(名)
  try {
    fs.rmSync(path.join(临时附件根, 名), { recursive: true, force: true })
  } catch (错误) {
    // 对话已经从内存消失；附件清理失败只记日志，下次启动还会清整棵缓存。
    console.log('⚠ 这段临时对话的附件没清干净：' + 错误.message)
  }
  return true
}

function 清附件() {
  try {
    fs.rmSync(临时附件根, { recursive: true, force: true })
    return true
  } catch (错误) {
    console.log('⚠ 临时对话附件没清干净：' + 错误.message)
    return false
  }
}

module.exports = { 建, 有, 取, 列表, 设模式, 记一轮, 给模型, 给界面, 附件目录, 删, 清附件, 临时附件根 }
