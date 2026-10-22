/**
 * 长期记忆关系的本地后台整理器。
 *
 * 不调用模型，不参与聊天召回。它低频重跑已有的确定性时间线规则，只自动落下证据充分的
 * “同一主题 / 后续发展 / 先于”；更新、矛盾、反向时间边和低置信候选始终留给人工。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 长期记忆 = require('./记忆.cjs')
const 关系图 = require('./记忆关系图.cjs')
const 时间线 = require('./记忆时间线候选.cjs')

const 规则版本 = 'memory-relations-v1'
const 默认状态文件 = path.join(配置.缓存目录, '记忆关系整理状态.json')
const 默认防抖毫秒 = 45 * 1000
const 默认最小间隔毫秒 = 10 * 60 * 1000
const 每轮最多新增 = 12

function 指纹(值) { return crypto.createHash('sha256').update(String(值 || '')).digest('hex') }
function 是对象(值) { return !!值 && typeof 值 === 'object' && !Array.isArray(值) }

function 原子写JSON(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  const 临时 = `${文件}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(临时, JSON.stringify(数据, null, 2) + '\n', 'utf8')
    fs.renameSync(临时, 文件)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
}

function 读状态(文件) {
  try {
    const 值 = JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, ''))
    return 是对象(值) ? 值 : {}
  } catch (错误) {
    if (错误.code === 'ENOENT') return {}
    return {}
  }
}

function 端点对键(从编号, 到编号) { return [String(从编号), String(到编号)].sort().join('|') }

/** 只把无歧义、可解释且达到高阈值的候选送进写层。 */
function 挑安全候选(候选们, 编号到节点) {
  const 分组 = new Map()
  for (const 候选 of Array.isArray(候选们) ? 候选们 : []) {
    const 键 = 端点对键(候选.从编号, 候选.到编号)
    const 表 = 分组.get(键) || []
    表.push(候选); 分组.set(键, 表)
  }
  const 结果 = []
  for (const 表 of 分组.values()) {
    // 出现冲突或状态更新说明关系需要语义裁决，整对都不自动写。
    if (表.some((一) => 一.类型 === '矛盾' || 一.类型 === '更新')) continue
    const 语义 = 表.filter((一) => 一.类型 === '同一主题' || 一.类型 === '后续发展')
      .sort((a, b) => (b.类型 === '后续发展') - (a.类型 === '后续发展') || Number(b.置信度) - Number(a.置信度))[0]
    if (!语义) continue
    const 阈值 = 语义.类型 === '同一主题' ? 0.92 : 0.86
    if (Number(语义.置信度) < 阈值) continue
    const 从 = 编号到节点.get(String(语义.从编号)), 到 = 编号到节点.get(String(语义.到编号))
    if (!从 || !到) continue
    结果.push({
      类型: 语义.类型, 从, 到, 置信度: Number(语义.置信度), 关联置信度: Number(语义.置信度),
      依据: String(语义.依据 || ''), 候选编号: String(语义.编号 || ''),
    })
    const 时间边 = 表.find((一) => 一.类型 === '先于')
    if (时间边) {
      const 时间从 = 编号到节点.get(String(时间边.从编号)), 时间到 = 编号到节点.get(String(时间边.到编号))
      if (时间从 && 时间到) 结果.push({
        类型: '先于', 从: 时间从, 到: 时间到, 置信度: 1, 关联置信度: Number(语义.置信度),
        依据: `${String(时间边.依据 || '')}；关联依据：${String(语义.依据 || '')}`.slice(0, 300),
        候选编号: String(时间边.编号 || ''),
      })
    }
    if (结果.length >= 每轮最多新增) break
  }
  return 结果.slice(0, 每轮最多新增)
}

function 创建整理器({
  长期记忆库 = 长期记忆,
  关系图库 = 关系图,
  状态文件 = 默认状态文件,
  现在 = () => new Date(),
  设定时器 = setTimeout,
  清定时器 = clearTimeout,
  防抖毫秒 = 默认防抖毫秒,
  最小间隔毫秒 = 默认最小间隔毫秒,
} = {}) {
  const 状态路径 = path.resolve(状态文件)
  let 计时器 = null
  let 正在整理 = false
  let 待补一次 = false
  const 原因们 = new Set()

  function 读取记录() {
    const 节点们 = (长期记忆库.全部长期记忆() || []).filter((一) => 一 && 一.编号 && 一.内容).map((一) => ({
      类别: String(一.类别 || ''), 编号: String(一.编号), 内容: String(一.内容 || ''), 时间: String(一.时间 || ''),
      记忆类型: String(一.记忆类型 || ''), 元数据: 是对象(一.元数据) ? 一.元数据 : {},
      事件时间: 一.事件时间, 来源: 一.来源,
    }))
    const 记录们 = 节点们.map((一, i) => 时间线.统一记录(一, '长期记忆', i)).filter(Boolean)
    const 输入指纹 = 指纹(记录们.map((一) => `${一.键}\n${一.内容}\n${JSON.stringify(一.事件时间)}\n${一.消息时间 || ''}\n${一.写入时间 || ''}`).sort().join('\n'))
    return { 节点们, 记录们, 输入指纹 }
  }

  function 整理一次({ 原因 = '后台检查', 强制 = false } = {}) {
    if (正在整理) { 待补一次 = true; return { 好: true, 已排队: true } }
    正在整理 = true
    try {
      const { 节点们, 记录们, 输入指纹 } = 读取记录()
      const 旧状态 = 读状态(状态路径)
      if (!强制 && 旧状态.输入指纹 === 输入指纹 && 旧状态.规则版本 === 规则版本) {
        return { 好: true, 跳过: true, 说明: '长期记忆没有变化', 输入指纹 }
      }
      const 编号到节点 = new Map()
      for (const 一 of 节点们) {
        if (编号到节点.has(一.编号)) 编号到节点.set(一.编号, null)
        else 编号到节点.set(一.编号, { 类别: 一.类别, 编号: 一.编号 })
      }
      const 全部候选 = 时间线.关系候选(记录们)
      const 安全候选 = 挑安全候选(全部候选, 编号到节点)
      const 应用 = 关系图库.应用自动候选({ 候选们: 安全候选, 输入指纹, 规则版本 })
      if (!应用 || !应用.好) return { 好: false, 说明: 应用 && 应用.说明 || '关系图没有接受自动候选' }
      const 结果 = {
        格式版本: 1, 规则版本, 上次运行于: new Date(现在()).toISOString(), 原因: String(原因 || '').slice(0, 160),
        输入指纹, 记忆数: 记录们.length, 候选数: 全部候选.length, 安全候选数: 安全候选.length,
        新增数: Number(应用.新增数 || 0), 自动类型: ['同一主题', '后续发展', '先于'],
        人工类型: ['更新', '矛盾', '后于', '低置信候选'],
      }
      原子写JSON(状态路径, 结果)
      return { 好: true, ...结果, 关系: 应用.关系 || [] }
    } finally {
      正在整理 = false
      if (待补一次) {
        待补一次 = false
        排队({ 原因: '整理期间又有长期记忆变化' })
      }
    }
  }

  function 执行计划() {
    计时器 = null
    const 原因 = [...原因们].join('；') || '后台检查'
    原因们.clear()
    try {
      const 果 = 整理一次({ 原因 })
      if (果.新增数) console.log(`  🕸 自动记忆关系：新增 ${果.新增数} 条安全关系`)
      return 果
    } catch (错误) {
      console.log('⚠ 自动记忆关系整理失败（不影响聊天）：' + 错误.message)
      return { 好: false, 说明: 错误.message }
    }
  }

  function 排队({ 原因 = '长期记忆变化', 立即 = false } = {}) {
    原因们.add(String(原因 || '长期记忆变化').slice(0, 160))
    if (正在整理) { 待补一次 = true; return { 已排队: true, 合并到下一轮: true } }
    if (计时器) 清定时器(计时器)
    const 旧状态 = 读状态(状态路径)
    const 上次 = Date.parse(旧状态.上次运行于 || '') || 0
    const 当前 = new Date(现在()).getTime()
    const 等防抖 = 立即 ? 0 : Math.max(0, Number(防抖毫秒) || 0)
    const 等间隔 = 立即 ? 0 : Math.max(0, 上次 + Math.max(0, Number(最小间隔毫秒) || 0) - 当前)
    const 等待毫秒 = Math.max(等防抖, 等间隔)
    计时器 = 设定时器(执行计划, 等待毫秒)
    if (计时器 && typeof 计时器.unref === 'function') 计时器.unref()
    return { 已排队: true, 等待毫秒, 合并到下一轮: false }
  }

  function 取消() {
    if (计时器) 清定时器(计时器)
    计时器 = null; 原因们.clear(); 待补一次 = false
  }

  function 状态() {
    const 盘 = 读状态(状态路径)
    return { 正在整理, 已安排: !!计时器, 还有一轮: 待补一次, 状态文件: 状态路径, ...盘 }
  }

  return { 整理一次, 排队, 取消, 状态, 状态文件: 状态路径 }
}

const 默认整理器 = 创建整理器()
module.exports = {
  规则版本, 默认状态文件, 默认防抖毫秒, 默认最小间隔毫秒, 每轮最多新增,
  挑安全候选, 创建整理器, ...默认整理器,
}
