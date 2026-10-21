/**
 * 临时记忆.cjs —— 跨对话、跨重启的短期记忆数据层
 *
 * 它和“临时对话”不是一回事：临时对话退出即消失，这里的记录会留在磁盘上，
 * 到期后先归档，等以后由界面或整理器决定恢复、晋升或清理。
 *
 * 本模块只管数据，不自动把内容塞进提示词，也不调用模型，更不会直接改长期记忆。
 * 这样 M1 可以在隔离目录里独立验收，后续召回、提取和 UI 各自接入。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 记忆结构 = require('./记忆结构.cjs')

const 数据版本 = 1
const 固定分类 = Object.freeze(['近期状态', '近期计划', '未完话题', '候选偏好', '近期事件', '关系语境'])
const 生命周期们 = new Set(['有效', '已归档', '已晋升'])
const 确认状态们 = new Set(['已确认', '待确认'])
const 晋升去向们 = new Set(['事实', '经历', '小本子', '学习进度', '工作摘要'])
const 关系状态们 = new Set(['当前', '待处理', '已被替代'])
const 默认保留天数 = Object.freeze({
  近期状态: 3,
  近期计划: 7,
  未完话题: 7,
  候选偏好: 7,
  近期事件: 7,
  关系语境: 7,
})

/** 0=低，1=普通，2=重要，3=核心。旧记录没有字段时按普通处理，不强制迁移文件。 */
function 正常重要性(值, 默认值 = 1) {
  if (值 === undefined || 值 === null || 值 === '') return 默认值
  const 数 = Number(值)
  if (!Number.isInteger(数) || 数 < 0 || 数 > 3) throw new Error('重要性必须是 0 到 3 的整数')
  return 数
}
function 读取重要性(值) {
  try { return 正常重要性(值) } catch { return 1 }
}

/** 旧记录没有关系字段时仍是当前版本；异常关系只降级读取，不回写原文件。 */
function 读取关系(值) {
  if (!是对象(值) || !关系状态们.has(值.状态)) return { 状态: '当前' }
  const 结果 = { 状态: 值.状态 }
  if (值.类型 === '可能替代') 结果.类型 = 值.类型
  for (const 名 of ['目标编号', '目标更新于', '目标快照', '由编号', '提议于', '决定于', '处理']) {
    if (typeof 值[名] === 'string' && 值[名].trim()) 结果[名] = 值[名].trim().slice(0, 160)
  }
  if (Array.isArray(值.替代编号)) 结果.替代编号 = 值.替代编号.map((一) => String(一 || '').trim()).filter(Boolean).slice(0, 20)
  return 结果
}

function 是对象(值) {
  return !!值 && typeof 值 === 'object' && !Array.isArray(值)
}

function 干净文本(值, 上限, 名称, { 可空 = false } = {}) {
  const 文本 = String(值 === undefined || 值 === null ? '' : 值).trim()
  if (!文本 && !可空) throw new Error(`${名称}不能为空`)
  if (文本.length > 上限) throw new Error(`${名称}不能超过 ${上限} 字`)
  return 文本
}

function 正常日期(值, 名称) {
  const 日期 = 值 instanceof Date ? new Date(值.getTime()) : new Date(值)
  if (!Number.isFinite(日期.getTime())) throw new Error(`${名称}不是有效时间`)
  return 日期
}

function 整理标签(值) {
  if (值 === undefined) return []
  if (!Array.isArray(值)) throw new Error('标签必须是数组')
  const 结果 = []
  for (const 原 of 值) {
    const 标签 = 干净文本(原, 40, '单个标签')
    if (!结果.includes(标签)) 结果.push(标签)
    if (结果.length > 12) throw new Error('标签最多 12 个')
  }
  return 结果
}

function 关系快照(条) {
  return crypto.createHash('sha256').update(JSON.stringify({
    编号: String(条 && 条.编号 || ''), 类别: String(条 && 条.类别 || ''),
    内容: String(条 && 条.内容 || ''), 更新于: String(条 && 条.更新于 || ''),
  })).digest('hex')
}

function 创建临时记忆库(选项 = {}) {
  const 数据目录 = path.resolve(选项.数据目录 || 配置.数据目录)
  const 文件 = path.resolve(选项.文件 || path.join(数据目录, '临时记忆.json'))
  const 取现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date()
  const 取编号 = typeof 选项.新编号 === 'function' ? 选项.新编号 : () => crypto.randomUUID()

  function 空数据() {
    return { 版本: 数据版本, 记录: [] }
  }

  function 读数据() {
    let 原文
    try {
      原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '').trim()
    } catch (错误) {
      if (错误.code === 'ENOENT') return 空数据()
      throw new Error(`临时记忆文件读不动：${错误.message}`)
    }
    if (!原文) return 空数据()

    let 数据
    try {
      数据 = JSON.parse(原文)
    } catch (错误) {
      throw new Error(`临时记忆文件不是有效 JSON，已拒绝覆盖：${错误.message}`)
    }
    if (!是对象(数据) || 数据.版本 !== 数据版本 || !Array.isArray(数据.记录)) {
      throw new Error('临时记忆文件结构或版本不受支持，已拒绝覆盖')
    }
    return 数据
  }

  function 写数据(数据) {
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 临时 = 文件 + '.tmp'
    try {
      fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
      fs.renameSync(临时, 文件)
    } catch (错误) {
      try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
      throw 错误
    }
  }

  function 找记录(数据, 编号) {
    const id = 干净文本(编号, 120, '临时记忆编号')
    return 数据.记录.find((一) => 是对象(一) && String(一.编号 || '') === id)
  }

  function 新增(类别, 内容, 细节 = {}) {
    if (!固定分类.includes(类别)) throw new Error('不认识的临时记忆分类: ' + 类别)
    const 正文 = 干净文本(内容, 4000, '临时记忆内容')
    const 创建 = 正常日期(细节.创建于 || 取现在(), '创建时间')
    const 保留天数 = 细节.保留天数 === undefined ? 默认保留天数[类别] : Number(细节.保留天数)
    if (!Number.isInteger(保留天数) || 保留天数 < 1 || 保留天数 > 30) {
      throw new Error('保留天数必须是 1 到 30 的整数')
    }

    const 提取方式 = 干净文本(细节.提取方式 || '手动', 40, '提取方式')
    const 确认状态 = 细节.确认状态 || (提取方式 === '手动' ? '已确认' : '待确认')
    if (!确认状态们.has(确认状态)) throw new Error('不认识的确认状态: ' + 确认状态)
    if (提取方式 !== '手动' && 确认状态 === '已确认') {
      throw new Error('非手动提取的临时记忆不能直接标为已确认')
    }

    const 到期 = new Date(创建.getTime() + 保留天数 * 24 * 60 * 60 * 1000)
    const 来源 = {
      对话: 干净文本(细节.来源对话, 160, '来源对话', { 可空: true }),
      消息时间: 干净文本(细节.来源消息时间, 80, '来源消息时间', { 可空: true }),
      提取方式,
    }
    const 数据 = 读数据()
    const 条 = {
      编号: 干净文本(取编号(), 120, '新编号'),
      类别,
      内容: 正文,
      创建于: 创建.toISOString(),
      更新于: 创建.toISOString(),
      到期于: 到期.toISOString(),
      生命周期: '有效',
      确认状态,
      重要性: 正常重要性(细节.重要性),
      记忆类型: 记忆结构.正常记忆类型(细节.记忆类型, 类别, { 严格: true }),
      元数据: 记忆结构.正常元数据(细节.元数据, { 类别, 来源: 提取方式, 严格: true }),
      来源,
      标签: 整理标签(细节.标签),
      关系: { 状态: '当前' },
      晋升: { 状态: '未提议' },
    }
    if (数据.记录.some((一) => 一 && 一.编号 === 条.编号)) throw new Error('生成了重复的临时记忆编号')
    数据.记录.push(条)
    写数据(数据)
    return { ...条, 元数据: { ...条.元数据 }, 来源: { ...条.来源 }, 标签: [...条.标签], 关系: { ...条.关系 }, 晋升: { ...条.晋升 } }
  }

  function 查询(条件 = {}) {
    const 数据 = 读数据()
    const 类别 = String(条件.类别 || '').trim()
    const 生命周期 = String(条件.生命周期 || '').trim()
    const 确认状态 = String(条件.确认状态 || '').trim()
    const 记忆类型 = String(条件.记忆类型 || '').trim().toLowerCase()
    const 搜索 = String(条件.搜索 || '').trim().toLocaleLowerCase()
    if (类别 && !固定分类.includes(类别)) throw new Error('不认识的临时记忆分类: ' + 类别)
    if (生命周期 && !生命周期们.has(生命周期)) throw new Error('不认识的生命周期: ' + 生命周期)
    if (确认状态 && !确认状态们.has(确认状态)) throw new Error('不认识的确认状态: ' + 确认状态)
    if (记忆类型 && !记忆结构.记忆类型们.includes(记忆类型)) throw new Error('不认识的记忆类型: ' + 记忆类型)
    const 限量 = Math.max(1, Math.min(1000, Number(条件.限量) || 500))
    const 列表 = 数据.记录.filter((一) => {
      if (!是对象(一)) return false
      if (类别 && 一.类别 !== 类别) return false
      if (生命周期 && 一.生命周期 !== 生命周期) return false
      if (!生命周期) {
        const 能看归档 = 条件.包括归档 === true && 一.生命周期 === '已归档'
        if (一.生命周期 !== '有效' && !能看归档) return false
      }
      if (确认状态 && 一.确认状态 !== 确认状态) return false
      const 结构 = 记忆结构.规范记忆结构(一, 一.类别, 一.来源 && 一.来源.提取方式)
      if (记忆类型 && 结构.记忆类型 !== 记忆类型) return false
      if (!搜索) return true
      return `${一.内容 || ''}\n${一.类别 || ''}\n${结构.记忆类型}\n${结构.元数据.backstory}\n${结构.元数据.person}\n${结构.元数据.relationship}\n${(一.标签 || []).join(' ')}\n${一.来源 && 一.来源.对话 || ''}`
        .toLocaleLowerCase().includes(搜索)
    }).map((一) => ({ ...一, ...记忆结构.规范记忆结构(一, 一.类别, 一.来源 && 一.来源.提取方式), 重要性: 读取重要性(一.重要性), 关系: 读取关系(一.关系) }))
      .sort((a, b) => String(b.更新于 || '').localeCompare(String(a.更新于 || '')))
    return { 列表: 列表.slice(0, 限量), 总数: 列表.length, 截断: 列表.length > 限量 }
  }

  /** 按稳定编号取一条，供主进程做需要精确命中的操作；返回副本，不能绕过模块直接改。 */
  function 取一条(编号) {
    const 条 = 找记录(读数据(), 编号)
    return 条 ? { ...JSON.parse(JSON.stringify(条)), ...记忆结构.规范记忆结构(条, 条.类别, 条.来源 && 条.来源.提取方式), 重要性: 读取重要性(条.重要性), 关系: 读取关系(条.关系) } : null
  }

  function 修改(编号, 改动 = {}) {
    if (!是对象(改动)) return { 好: false, 说明: '修改内容格式不对' }
    const 数据 = 读数据()
    const 条 = 找记录(数据, 编号)
    if (!条) return { 好: false, 说明: '没找到这条临时记忆' }
    if (条.生命周期 !== '有效') return { 好: false, 说明: '只有有效的临时记忆可以修改' }
    if (读取关系(条.关系).状态 === '已被替代') return { 好: false, 说明: '已被替代的旧版本只用于追溯，不能直接修改' }

    let 变了 = false
    if (Object.prototype.hasOwnProperty.call(改动, '内容')) {
      const 内容 = 干净文本(改动.内容, 4000, '临时记忆内容')
      if (内容 !== 条.内容) { 条.内容 = 内容; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '类别')) {
      if (!固定分类.includes(改动.类别)) throw new Error('不认识的临时记忆分类: ' + 改动.类别)
      if (改动.类别 !== 条.类别) { 条.类别 = 改动.类别; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '确认状态')) {
      if (!确认状态们.has(改动.确认状态)) throw new Error('不认识的确认状态: ' + 改动.确认状态)
      if (改动.确认状态 === '已确认' && 读取关系(条.关系).状态 === '待处理') {
        return { 好: false, 说明: '这条记忆可能与旧内容冲突，请先选择替代旧条或两条并存' }
      }
      if (改动.确认状态 !== 条.确认状态) { 条.确认状态 = 改动.确认状态; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '重要性')) {
      const 重要性 = 正常重要性(改动.重要性)
      if (重要性 !== 读取重要性(条.重要性)) { 条.重要性 = 重要性; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '记忆类型')) {
      const 类型 = 记忆结构.正常记忆类型(改动.记忆类型, 条.类别, { 严格: true })
      if (类型 !== 记忆结构.正常记忆类型(条.记忆类型, 条.类别)) { 条.记忆类型 = 类型; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '元数据')) {
      const 元数据 = 记忆结构.正常元数据(改动.元数据, { 类别: 条.类别, 来源: 条.来源 && 条.来源.提取方式, 严格: true })
      if (JSON.stringify(元数据) !== JSON.stringify(记忆结构.正常元数据(条.元数据, { 类别: 条.类别, 来源: 条.来源 && 条.来源.提取方式 }))) { 条.元数据 = 元数据; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '标签')) {
      const 标签 = 整理标签(改动.标签)
      if (JSON.stringify(标签) !== JSON.stringify(条.标签 || [])) { 条.标签 = 标签; 变了 = true }
    }
    if (Object.prototype.hasOwnProperty.call(改动, '到期于')) {
      const 到期于 = 正常日期(改动.到期于, '到期时间').toISOString()
      if (到期于 !== 条.到期于) { 条.到期于 = 到期于; 变了 = true }
    }
    if (!变了) return { 好: true, 没变化: true, 条 }
    条.更新于 = 正常日期(取现在(), '更新时间').toISOString()
    写数据(数据)
    return { 好: true, 条 }
  }

  function 删除(编号) {
    const 数据 = 读数据()
    const 条 = 找记录(数据, 编号)
    if (!条) return false
    const id = String(条.编号 || '')
    const 被待处理引用 = 数据.记录.some((一) => {
      const 关系 = 读取关系(一 && 一.关系)
      return String(一 && 一.编号 || '') !== id && 一.生命周期 === '有效' && 关系.状态 === '待处理' && 关系.目标编号 === id
    })
    if (被待处理引用) throw new Error('还有一条待确认候选正在与这条记忆比较，请先处理候选关系')
    // 删除一条已经替代旧内容的新记录时，自动恢复仍存在的旧条，避免两边都退出召回。
    const 关系 = 读取关系(条.关系)
    for (const 旧编号 of 关系.替代编号 || []) {
      const 旧条 = 找记录(数据, 旧编号)
      const 旧关系 = 旧条 && 读取关系(旧条.关系)
      if (旧条 && 旧关系.状态 === '已被替代' && 旧关系.由编号 === id) {
        const 恢复于 = 正常日期(取现在(), '恢复时间').toISOString()
        旧条.关系 = {
          状态: '当前', 替代编号: 旧关系.替代编号 || [],
          决定于: 恢复于, 处理: '替代者已删除，自动恢复',
        }
        旧条.更新于 = 恢复于
      }
    }
    数据.记录 = 数据.记录.filter((一) => String(一 && 一.编号 || '') !== String(编号).trim())
    写数据(数据)
    return true
  }

  /** 模型只能提出关系，不能自行确认、更改或隐藏旧记忆。 */
  function 提议替代(新编号, 旧编号) {
    const 数据 = 读数据()
    const 新条 = 找记录(数据, 新编号)
    const 旧条 = 找记录(数据, 旧编号)
    if (!新条 || !旧条) return { 好: false, 说明: '新旧记忆有一条不存在' }
    if (新条.编号 === 旧条.编号) return { 好: false, 说明: '一条记忆不能替代自己' }
    if (新条.生命周期 !== '有效' || 旧条.生命周期 !== '有效') return { 好: false, 说明: '只有有效记忆可以建立替代关系' }
    if (新条.确认状态 !== '待确认') return { 好: false, 说明: '只有待确认的新候选可以提出替代关系' }
    if (读取关系(新条.关系).状态 !== '当前') return { 好: false, 说明: '这条新候选已经有关联关系' }
    if (旧条.确认状态 !== '已确认' || 读取关系(旧条.关系).状态 !== '当前') return { 好: false, 说明: '旧记忆不是可替代的当前确认项' }
    if (新条.类别 !== 旧条.类别) return { 好: false, 说明: '不同分类不能自动建立替代关系' }
    const 现在 = 正常日期(取现在(), '提议时间').toISOString()
    新条.关系 = { 状态: '待处理', 类型: '可能替代', 目标编号: 旧条.编号,
      目标更新于: String(旧条.更新于 || ''), 目标快照: 关系快照(旧条), 提议于: 现在 }
    新条.更新于 = 现在
    写数据(数据)
    return { 好: true, 条: { ...JSON.parse(JSON.stringify(新条)), 关系: 读取关系(新条.关系) } }
  }

  /** 人工决定后一次写入新旧两条，避免中途只切换一边。 */
  function 决定替代(新编号, 选择) {
    if (!['替代旧条', '两条并存'].includes(选择)) throw new Error('关系决定只能是“替代旧条”或“两条并存”')
    const 数据 = 读数据()
    const 新条 = 找记录(数据, 新编号)
    if (!新条) return { 好: false, 说明: '没找到这条新候选' }
    const 新关系 = 读取关系(新条.关系)
    if (新关系.状态 !== '待处理' || !新关系.目标编号) return { 好: false, 说明: '这条记忆没有等待处理的替代关系' }
    const 旧条 = 找记录(数据, 新关系.目标编号)
    if (!旧条 || 旧条.生命周期 !== '有效' || 旧条.确认状态 !== '已确认' || 读取关系(旧条.关系).状态 !== '当前') {
      return { 好: false, 说明: '旧记忆已经变化，请刷新后重新判断' }
    }
    if (新关系.目标更新于 && String(旧条.更新于 || '') !== 新关系.目标更新于) {
      return { 好: false, 说明: '旧记忆在提议后被修改过，请刷新后重新判断' }
    }
    if (新关系.目标快照 && 关系快照(旧条) !== 新关系.目标快照) {
      return { 好: false, 说明: '旧记忆在提议后被修改过，请刷新后重新判断' }
    }
    const 现在 = 正常日期(取现在(), '决定时间').toISOString()
    新条.确认状态 = '已确认'
    新条.更新于 = 现在
    if (选择 === '替代旧条') {
      const 旧关系 = 读取关系(旧条.关系)
      新条.关系 = { 状态: '当前', 类型: '可能替代', 替代编号: [旧条.编号], 决定于: 现在, 处理: 选择 }
      旧条.关系 = { 状态: '已被替代', 类型: '可能替代', 由编号: 新条.编号,
        替代编号: 旧关系.替代编号 || [], 决定于: 现在, 处理: 选择 }
      旧条.更新于 = 现在
    } else {
      新条.关系 = { 状态: '当前', 类型: '可能替代', 决定于: 现在, 处理: 选择 }
    }
    写数据(数据)
    return { 好: true, 选择, 新条: { ...JSON.parse(JSON.stringify(新条)), 关系: 读取关系(新条.关系) } }
  }

  function 归档到期(时刻 = 取现在()) {
    const 截止 = 正常日期(时刻, '归档时间')
    const 数据 = 读数据()
    let 数量 = 0
    for (const 条 of 数据.记录) {
      if (!是对象(条) || 条.生命周期 !== '有效') continue
      const 到期 = new Date(条.到期于)
      if (Number.isFinite(到期.getTime()) && 到期.getTime() <= 截止.getTime()) {
        条.生命周期 = '已归档'
        条.归档于 = 截止.toISOString()
        条.归档原因 = '到期'
        条.更新于 = 截止.toISOString()
        数量++
      }
    }
    if (数量) 写数据(数据)
    return { 好: true, 数量 }
  }

  function 恢复(编号, 保留天数 = 7) {
    const 天数 = Number(保留天数)
    if (!Number.isInteger(天数) || 天数 < 1 || 天数 > 30) throw new Error('保留天数必须是 1 到 30 的整数')
    const 数据 = 读数据()
    const 条 = 找记录(数据, 编号)
    if (!条) return { 好: false, 说明: '没找到这条临时记忆' }
    if (条.生命周期 !== '已归档') return { 好: false, 说明: '只有已归档的临时记忆可以恢复' }
    const 现在 = 正常日期(取现在(), '恢复时间')
    条.生命周期 = '有效'
    条.更新于 = 现在.toISOString()
    条.到期于 = new Date(现在.getTime() + 天数 * 86400000).toISOString()
    delete 条.归档于
    delete 条.归档原因
    写数据(数据)
    return { 好: true, 条 }
  }

  function 提议晋升(编号, 去向) {
    if (!晋升去向们.has(去向)) throw new Error('不认识的晋升去向: ' + 去向)
    const 数据 = 读数据()
    const 条 = 找记录(数据, 编号)
    if (!条) return { 好: false, 说明: '没找到这条临时记忆' }
    if (条.生命周期 !== '有效') return { 好: false, 说明: '只有有效的临时记忆可以提议晋升' }
    if (条.确认状态 !== '已确认') return { 好: false, 说明: '待确认内容不能提议晋升' }
    if (读取关系(条.关系).状态 !== '当前') return { 好: false, 说明: '已被替代的旧版本不能晋升' }
    if (条.晋升 && 条.晋升.状态 === '已完成') return { 好: false, 说明: '这条临时记忆已经晋升' }
    const 现在 = 正常日期(取现在(), '提议时间').toISOString()
    条.晋升 = { 状态: '待确认', 去向, 提议于: 现在 }
    条.更新于 = 现在
    写数据(数据)
    return { 好: true, 条 }
  }

  function 决定晋升(编号, 批准) {
    const 数据 = 读数据()
    const 条 = 找记录(数据, 编号)
    if (!条) return { 好: false, 说明: '没找到这条临时记忆' }
    if (!条.晋升 || 条.晋升.状态 !== '待确认') return { 好: false, 说明: '这条临时记忆没有等待确认的晋升提议' }
    const 现在 = 正常日期(取现在(), '决定时间').toISOString()
    条.晋升.状态 = 批准 === true ? '已批准' : '已拒绝'
    条.晋升.决定于 = 现在
    条.更新于 = 现在
    写数据(数据)
    return { 好: true, 条 }
  }

  function 完成晋升(编号, 目标编号) {
    const 数据 = 读数据()
    const 条 = 找记录(数据, 编号)
    if (!条) return { 好: false, 说明: '没找到这条临时记忆' }
    if (!条.晋升 || 条.晋升.状态 !== '已批准') return { 好: false, 说明: '晋升尚未批准' }
    const 目标 = 干净文本(目标编号, 120, '晋升后的目标编号')
    const 现在 = 正常日期(取现在(), '晋升时间').toISOString()
    条.晋升.状态 = '已完成'
    条.晋升.目标编号 = 目标
    条.晋升.完成于 = 现在
    条.生命周期 = '已晋升'
    条.更新于 = 现在
    写数据(数据)
    return { 好: true, 条 }
  }

  return {
    文件,
    固定分类,
    默认保留天数,
    新增,
    查询,
    取一条,
    修改,
    删除,
    提议替代,
    决定替代,
    归档到期,
    恢复,
    提议晋升,
    决定晋升,
    完成晋升,
  }
}

const 默认库 = 创建临时记忆库()

module.exports = {
  创建临时记忆库,
  固定分类,
  记忆类型们: 记忆结构.记忆类型们,
  默认保留天数,
  正常重要性,
  读取关系,
  ...默认库,
}

