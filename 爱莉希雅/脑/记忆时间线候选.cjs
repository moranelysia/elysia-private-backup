/**
 * 只读时间线关系候选：解析有依据的事件时间，把相关记忆按真实事件时间排序并生成审查报告。
 * 不写关系图、不接聊天召回、不修改任何原始记忆；唯一写入是调用方指定的缓存报告。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 临时记忆 = require('./临时记忆.cjs')
const 长期记忆 = require('./记忆.cjs')
const 记忆结构 = require('./记忆结构.cjs')
const 聚类工具 = require('./记忆聚类候选.cjs')

const 默认最大条数 = 500
const 默认相似阈值 = 0.2
const 默认时区偏移分钟 = 480
const 默认输出文件 = path.join(配置.缓存目录, '记忆时间线候选.json')
const 关系白名单 = Object.freeze(['同一主题', '后续发展', '更新', '矛盾', '先于', '后于'])

function 是对象(值) { return !!值 && typeof 值 === 'object' && !Array.isArray(值) }
function 指纹(值) { return crypto.createHash('sha256').update(String(值 || '')).digest('hex') }
function 补二(值) { return String(值).padStart(2, '0') }
function 日期文本(年, 月, 日) { return `${年}-${补二(月)}-${补二(日)}` }
function 月末(年, 月) { return new Date(Date.UTC(年, 月, 0)).getUTCDate() }
function 日期有效(年, 月, 日) {
  return Number.isInteger(年) && Number.isInteger(月) && Number.isInteger(日) && 年 >= 1900 && 年 <= 2200 && 月 >= 1 && 月 <= 12 && 日 >= 1 && 日 <= 月末(年, 月)
}

function 消息日(值, 时区偏移分钟 = 默认时区偏移分钟) {
  const 毫秒 = Date.parse(String(值 || ''))
  if (!Number.isFinite(毫秒)) return null
  const 当地 = new Date(毫秒 + Number(时区偏移分钟) * 60000)
  return { 年: 当地.getUTCFullYear(), 月: 当地.getUTCMonth() + 1, 日: 当地.getUTCDate() }
}

function 加天(日, 天数) {
  const 值 = new Date(Date.UTC(日.年, 日.月 - 1, 日.日 + 天数))
  return { 年: 值.getUTCFullYear(), 月: 值.getUTCMonth() + 1, 日: 值.getUTCDate() }
}

function 明确日(年, 月, 日, 原文, 依据, 时分 = '') {
  if (!日期有效(年, 月, 日)) return null
  const 日期 = 日期文本(年, 月, 日)
  const 时刻 = 时分 ? `${日期}T${时分}` : 日期
  return { 状态: '明确', 精度: 时分 ? '分钟' : '日', 开始: 时刻, 结束: 时刻, 排序键: 时刻, 原文, 依据 }
}

function 明确月(年, 月, 原文, 依据) {
  if (!日期有效(年, 月, 1)) return null
  return { 状态: '明确', 精度: '月', 开始: `${年}-${补二(月)}-01`, 结束: 日期文本(年, 月, 月末(年, 月)), 排序键: `${年}-${补二(月)}-01`, 原文, 依据 }
}

function 明确年(年, 原文, 依据) {
  if (!Number.isInteger(年) || 年 < 1900 || 年 > 2200) return null
  return { 状态: '明确', 精度: '年', 开始: `${年}-01-01`, 结束: `${年}-12-31`, 排序键: `${年}-01-01`, 原文, 依据 }
}

function 相对未解析(原文) {
  return { 状态: '相对未解析', 精度: '未知', 开始: '', 结束: '', 排序键: '', 原文, 依据: '缺少可用的来源消息时间' }
}

function 未知时间() {
  return { 状态: '未知', 精度: '未知', 开始: '', 结束: '', 排序键: '', 原文: '', 依据: '正文和结构化字段均没有可靠事件时间' }
}

function 解析事件时间文本(输入, 消息时间 = '', { 时区偏移分钟 = 默认时区偏移分钟, 依据前缀 = '正文' } = {}) {
  const 文 = String(输入 || '').normalize('NFKC')
  if (!文.trim()) return 未知时间()
  let m

  m = 文.match(/(19\d{2}|20\d{2}|21\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (m) return 明确日(Number(m[1]), Number(m[2]), Number(m[3]), m[0], `${依据前缀}绝对日期`, m[4] ? `${补二(m[4])}:${m[5]}` : '') || 未知时间()
  m = 文.match(/(19\d{2}|20\d{2}|21\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号](?:\s*(\d{1,2})[:：](\d{2}))?/)
  if (m) return 明确日(Number(m[1]), Number(m[2]), Number(m[3]), m[0], `${依据前缀}绝对日期`, m[4] ? `${补二(m[4])}:${m[5]}` : '') || 未知时间()
  m = 文.match(/(19\d{2}|20\d{2}|21\d{2})\s*年\s*(\d{1,2})\s*月/)
  if (m) return 明确月(Number(m[1]), Number(m[2]), m[0], `${依据前缀}绝对月份`) || 未知时间()
  m = 文.match(/(19\d{2}|20\d{2}|21\d{2})[-/.](\d{1,2})(?![-/.\d])/)
  if (m) return 明确月(Number(m[1]), Number(m[2]), m[0], `${依据前缀}绝对月份`) || 未知时间()
  m = 文.match(/(19\d{2}|20\d{2}|21\d{2})\s*年/)
  if (m) return 明确年(Number(m[1]), m[0], `${依据前缀}绝对年份`) || 未知时间()

  const 基准 = 消息日(消息时间, 时区偏移分钟)
  m = 文.match(/(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
  if (m) {
    if (!基准) return 相对未解析(m[0])
    return 明确日(基准.年, Number(m[1]), Number(m[2]), m[0], `${依据前缀}月日 + 来源消息年份`) || 未知时间()
  }

  m = 文.match(/(去年|今年|明年)(?:\s*(\d{1,2})\s*月)?(?:\s*(\d{1,2})\s*[日号]?)?/)
  if (m) {
    if (!基准) return 相对未解析(m[0])
    const 年 = 基准.年 + ({ 去年: -1, 今年: 0, 明年: 1 }[m[1]] || 0)
    if (m[2] && m[3]) return 明确日(年, Number(m[2]), Number(m[3]), m[0], `${依据前缀}相对年份 + 来源消息时间`) || 未知时间()
    if (m[2]) return 明确月(年, Number(m[2]), m[0], `${依据前缀}相对年份 + 来源消息时间`) || 未知时间()
    return 明确年(年, m[0], `${依据前缀}相对年份 + 来源消息时间`)
  }

  m = 文.match(/(前天|昨天|今天|明天|后天)/)
  if (m) {
    if (!基准) return 相对未解析(m[0])
    const 日 = 加天(基准, { 前天: -2, 昨天: -1, 今天: 0, 明天: 1, 后天: 2 }[m[1]])
    return 明确日(日.年, 日.月, 日.日, m[0], `${依据前缀}相对日期 + 来源消息时间`)
  }

  m = 文.match(/(上周|这周|本周|下周)([一二三四五六日天])?/)
  if (m) {
    if (!基准) return 相对未解析(m[0])
    const 基准UTC = new Date(Date.UTC(基准.年, 基准.月 - 1, 基准.日))
    const 周日序 = 基准UTC.getUTCDay()
    const 周一差 = 周日序 === 0 ? -6 : 1 - 周日序
    const 周偏移 = ({ 上周: -7, 这周: 0, 本周: 0, 下周: 7 }[m[1]] || 0)
    const 周一 = 加天(基准, 周一差 + 周偏移)
    if (m[2]) {
      const 星期偏移 = ({ 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 })[m[2]]
      const 日 = 加天(周一, 星期偏移)
      return 明确日(日.年, 日.月, 日.日, m[0], `${依据前缀}相对星期 + 来源消息时间`)
    }
    const 周末 = 加天(周一, 6)
    return { 状态: '明确', 精度: '周', 开始: 日期文本(周一.年, 周一.月, 周一.日), 结束: 日期文本(周末.年, 周末.月, 周末.日), 排序键: 日期文本(周一.年, 周一.月, 周一.日), 原文: m[0], 依据: `${依据前缀}相对星期 + 来源消息时间` }
  }

  m = 文.match(/(上个月|这个月|本月|下个月)/)
  if (m) {
    if (!基准) return 相对未解析(m[0])
    const 偏移 = ({ 上个月: -1, 这个月: 0, 本月: 0, 下个月: 1 })[m[1]] || 0
    const 月值 = new Date(Date.UTC(基准.年, 基准.月 - 1 + 偏移, 1))
    return 明确月(月值.getUTCFullYear(), 月值.getUTCMonth() + 1, m[0], `${依据前缀}相对月份 + 来源消息时间`)
  }

  m = 文.match(/(最近|之前|以后|过几天|过段时间|某天|那天|当时|不久前|不久后)/)
  if (m) return 相对未解析(m[0])
  return 未知时间()
}

function 解析结构化事件时间(值, 消息时间, 选项) {
  if (typeof 值 === 'string' && 值.trim()) return 解析事件时间文本(值, 消息时间, { ...选项, 依据前缀: '事件时间字段' })
  if (!是对象(值)) return null
  const 开始 = String(值.开始 || '').trim()
  const 结束 = String(值.结束 || 开始).trim()
  const 合法 = (文本) => {
    const m = 文本.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
    return !!m && 日期有效(Number(m[1]), Number(m[2]), Number(m[3])) &&
      (!m[4] || (Number(m[4]) <= 23 && Number(m[5]) <= 59))
  }
  if (!合法(开始) || !合法(结束)) return null
  if (开始 > 结束) return null
  return { 状态: '明确', 精度: String(值.精度 || (开始.includes('T') ? '分钟' : '日')), 开始, 结束, 排序键: 开始,
    原文: String(值.原文 || '').slice(0, 120), 依据: '结构化事件时间字段' }
}

function 计划状态(内容) {
  const 文 = String(内容 || '')
  if (/(?:已经|完成了|去了|发生了|那天|当时|后来|终于完成)/.test(文)) return '已发生'
  if (/(?:计划|打算|准备|将要|要去|想去|明天|后天|下周|明年)/.test(文)) return '计划中'
  return '未判断'
}

function 主题文本(内容) {
  return String(内容 || '')
    .replace(/(?:19|20|21)\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/(?:19|20|21)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g, ' ')
    .replace(/(?:19|20|21)\d{2}\s*年\s*\d{1,2}\s*月/g, ' ')
    .replace(/(?:19|20|21)\d{2}[-/.]\d{1,2}/g, ' ')
    .replace(/(?:前天|昨天|今天|明天|后天|上周|这周|本周|下周|上个月|这个月|本月|下个月|去年|今年|明年|凌晨|上午|中午|下午|晚上)/g, ' ')
}

function 统一记录(记录, 来源层, 顺序, 选项 = {}) {
  if (!是对象(记录)) return null
  const 内容 = String(记录.内容 || '').trim()
  if (!内容) return null
  const 类别 = String(记录.类别 || '')
  const 结构 = 记忆结构.规范记忆结构(记录, 类别, 记录.来源 && 记录.来源.提取方式 || 记录.来源)
  const 消息时间 = String(记录.消息时间 || 记录.来源消息时间 || 记录.来源 && 记录.来源.消息时间 || '')
  const 写入时间 = String(记录.创建于 || 记录.时间 || '')
  const 结构时间 = 解析结构化事件时间(记录.事件时间, 消息时间, 选项)
  const 事件时间 = 结构时间 || 解析事件时间文本(内容, 消息时间, 选项)
  const 原编号 = String(记录.编号 || '').trim()
  const 编号 = 原编号 || 指纹(`${来源层}\n${类别}\n${写入时间}\n${内容}`).slice(0, 20)
  return {
    键: `${来源层}:${类别}:${编号}`, 来源层, 编号, 类别,
    记忆类型: 结构.记忆类型, person: 结构.元数据.person, relationship: 结构.元数据.relationship,
    内容, 事件时间, 消息时间, 写入时间, 计划状态: 计划状态(内容), 特征: 聚类工具.特征们(主题文本(内容)), 顺序,
  }
}

function 读取记忆({ 临时记忆库 = 临时记忆, 长期记忆库 = 长期记忆, 现在 = () => new Date(), 最大条数 = 默认最大条数, 时区偏移分钟 = 默认时区偏移分钟 } = {}) {
  const 当前 = new Date(现在()).getTime()
  const 临时原 = 临时记忆库.查询({ 生命周期: '有效', 确认状态: '已确认', 限量: 1000 }).列表
  const 临时 = 临时原.filter((一) => 一 && 一.生命周期 === '有效' && 一.确认状态 === '已确认' &&
    (!一.关系 || 一.关系.状态 === '当前') && (!一.到期于 || Date.parse(一.到期于) > 当前))
  const 长期 = 长期记忆库.全部长期记忆()
  const 全部 = [
    ...临时.map((一, i) => 统一记录(一, '临时记忆', i, { 时区偏移分钟 })),
    ...长期.map((一, i) => 统一记录(一, '长期记忆', 临时.length + i, { 时区偏移分钟 })),
  ].filter(Boolean)
  const 去重 = []
  const 已见 = new Set()
  for (const 一 of 全部) if (!已见.has(一.键)) { 已见.add(一.键); 去重.push(一) }
  const 上限 = Math.max(2, Math.min(2000, Number(最大条数) || 默认最大条数))
  return { 记录: 去重.slice(0, 上限), 原始数量: 全部.length, 截断数量: Math.max(0, 去重.length - 上限) }
}

function 可比较(甲, 乙) {
  return 甲.编号 !== 乙.编号 && 甲.记忆类型 === 乙.记忆类型 && 甲.person === 乙.person && 甲.relationship === 乙.relationship
}

function 是否否定(内容) { return /(?:不再|不喜欢|不想|不要|讨厌|取消|并非|不是|没有)/.test(String(内容 || '')) }
function 关系编号(类型, 从编号, 到编号) { return `timeline-${指纹(`${类型}\n${从编号}\n${到编号}`).slice(0, 16)}` }

function 关系候选(记录们, { 相似阈值 = 默认相似阈值 } = {}) {
  const 阈值 = Number(相似阈值)
  if (!(阈值 > 0 && 阈值 <= 1)) throw new Error('相似阈值必须大于 0 且不超过 1')
  const 结果 = []
  const 已见 = new Set()
  function 加入(类型, 从, 到, 置信度, 依据) {
    if (!关系白名单.includes(类型)) return
    const 无向 = 类型 === '同一主题' || 类型 === '矛盾'
    let 起 = 从, 终 = 到
    if (无向 && 起.编号 > 终.编号) [起, 终] = [终, 起]
    const 键 = `${类型}:${起.键}:${终.键}`
    if (已见.has(键)) return
    已见.add(键)
    结果.push({ 编号: 关系编号(类型, 起.编号, 终.编号), 类型, 从编号: 起.编号, 到编号: 终.编号,
      置信度: Number(Math.max(0, Math.min(1, 置信度)).toFixed(4)), 依据 })
  }

  for (let i = 0; i < 记录们.length; i++) for (let j = i + 1; j < 记录们.length; j++) {
    const 甲 = 记录们[i], 乙 = 记录们[j]
    if (!可比较(甲, 乙)) continue
    const 相似 = 聚类工具.相似度(甲.特征, 乙.特征)
    if (相似 < 阈值) continue
    const 甲时 = 甲.事件时间 && 甲.事件时间.状态 === '明确' ? 甲.事件时间 : null
    const 乙时 = 乙.事件时间 && 乙.事件时间.状态 === '明确' ? 乙.事件时间 : null
    let 早 = null, 晚 = null
    if (甲时 && 乙时 && 甲时.结束 < 乙时.开始) { 早 = 甲; 晚 = 乙 }
    else if (甲时 && 乙时 && 乙时.结束 < 甲时.开始) { 早 = 乙; 晚 = 甲 }

    if (是否否定(甲.内容) !== 是否否定(乙.内容)) {
      加入('矛盾', 甲, 乙, 相似, `同人物、同类型且主题相似度 ${相似}，肯定/否定状态不同；仅供审查`)
    } else if (晚 && /(?:现在|改成|改为|不再|已经换|后来变|目前)/.test(晚.内容)) {
      加入('更新', 早, 晚, Math.min(1, 相似 + 0.12), `主题相似度 ${相似}；后一事件含状态更新措辞`)
    } else if (晚 && /(?:后来|之后|接着|又|继续|最终|终于|随后)/.test(晚.内容)) {
      加入('后续发展', 早, 晚, Math.min(1, 相似 + 0.1), `主题相似度 ${相似}；后一事件含延续措辞`)
    } else {
      加入('同一主题', 甲, 乙, 相似, `同人物、同关系、同记忆类型；本地主题相似度 ${相似}`)
    }
    if (早 && 晚) {
      加入('先于', 早, 晚, 1, `${早.事件时间.开始} 早于 ${晚.事件时间.开始}`)
      加入('后于', 晚, 早, 1, `${晚.事件时间.开始} 晚于 ${早.事件时间.开始}`)
    }
  }
  return 结果.sort((a, b) => a.类型.localeCompare(b.类型, 'zh-CN') || a.编号.localeCompare(b.编号))
}

function 精度序(精度) { return ({ 分钟: 0, 日: 1, 周: 2, 月: 3, 年: 4 })[精度] ?? 9 }
function 生成报告({ 记录们 = [], 来源统计 = {}, 现在 = () => new Date(), 相似阈值 = 默认相似阈值, 最大条数 = 默认最大条数 } = {}) {
  const 输入 = Array.isArray(记录们) ? 记录们 : []
  const 已确定时间线 = 输入.filter((一) => 一.事件时间 && 一.事件时间.状态 === '明确').sort((a, b) =>
    a.事件时间.排序键.localeCompare(b.事件时间.排序键) || 精度序(a.事件时间.精度) - 精度序(b.事件时间.精度) ||
    String(a.消息时间 || '').localeCompare(String(b.消息时间 || '')) || a.键.localeCompare(b.键))
  const 时间未确定 = 输入.filter((一) => !一.事件时间 || 一.事件时间.状态 !== '明确').sort((a, b) => a.键.localeCompare(b.键))
  const 候选 = 关系候选(输入, { 相似阈值 })
  return {
    格式版本: 1,
    用途: '只读时间线与关系候选；不参与召回，不写关系图，不修改原记忆',
    生成于: new Date(现在()).toISOString(),
    输入指纹: 指纹(输入.map((一) => `${一.键}\n${一.内容}\n${JSON.stringify(一.事件时间)}\n${一.消息时间}\n${一.写入时间}`).sort().join('\n')),
    规则: {
      事件排序: '只使用有依据的事件时间；同事件时间再参考消息时间；写入时间绝不参与事件排序',
      未知时间: '相对时间缺少来源消息时间时保持未解析，并与确定时间线分组',
      相似阈值: Number(相似阈值), 最大输入条数: Number(最大条数), 关系白名单: [...关系白名单],
      因果: '不自动推断', 自动写入: false,
    },
    来源统计,
    已确定数量: 已确定时间线.length,
    未确定数量: 时间未确定.length,
    关系候选数量: 候选.length,
    已确定时间线: 已确定时间线.map(({ 特征, 顺序, ...一 }) => 一),
    时间未确定: 时间未确定.map(({ 特征, 顺序, ...一 }) => 一),
    关系候选: 候选,
  }
}

function 原子写JSON(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  const 临时 = `${文件}.${process.pid}.tmp`
  try {
    fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
    fs.renameSync(临时, 文件)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
}

function 生成并保存({ 输出文件 = 默认输出文件, 临时记忆库 = 临时记忆, 长期记忆库 = 长期记忆, 现在 = () => new Date(), 相似阈值 = 默认相似阈值, 最大条数 = 默认最大条数, 时区偏移分钟 = 默认时区偏移分钟 } = {}) {
  const 来源 = 读取记忆({ 临时记忆库, 长期记忆库, 现在, 最大条数, 时区偏移分钟 })
  const 报告 = 生成报告({ 记录们: 来源.记录, 来源统计: { 可分析条数: 来源.记录.length, 原始数量: 来源.原始数量, 截断数量: 来源.截断数量 }, 现在, 相似阈值, 最大条数 })
  const 目标 = path.resolve(输出文件)
  原子写JSON(目标, 报告)
  return { 好: true, 输出文件: 目标, 报告 }
}

module.exports = {
  默认最大条数, 默认相似阈值, 默认时区偏移分钟, 默认输出文件, 关系白名单,
  解析事件时间文本, 解析结构化事件时间, 主题文本, 统一记录, 读取记忆, 关系候选, 生成报告, 生成并保存,
}
