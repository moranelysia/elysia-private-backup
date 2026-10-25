/**
 * 记忆.cjs —— 她记事的地方
 *
 * 【为什么要单独一个文件，而不是塞进代码里】
 *   记忆是会长的，而且会长得很快。要是写在代码里，改记忆就得改代码，
 *   哪天代码写坏了，记忆也跟着没了。所以记忆一律存在
 *   爱莉希雅\记忆\ 这个文件夹里的**纯文本**里：
 *   你随时能打开看、能自己改、能整个拷走。
 *
 * 【分成三类，是因为它们的"可信度"不一样】
 *
 *   事实.json —— 关于当前使用者的、此刻成立的事。
 *                比如"他正在学习一门课程"。这类会过期，要能改能删。
 *
 *   经历.json —— 你们一起做过的事，按时间堆着，只增不改。
 *                比如"他第一次听见自己的声音被合成出来"。
 *
 *   小本子.json —— 她自己在聊天里随手记下的。
 *                她在对话里写 [记住:...] 和 [经历:...]，程序帮她落到这儿。
 *
 * 【为什么用 JSON 而不是那种"一整篇日记"】
 *   一篇大日记读起来舒服，但程序没法干净地"删掉过期的第三条"。
 *   拆成一条一条（每条有编号、时间、内容），以后想按时间查、
 *   想删、想搜，都是几行代码的事。
 *
 * 【她怎么用这些】
 *   每次开口之前，程序把这三样各取一段，拼进她的"开场说明"里
 *   ——所以她记得住，且只记得住这儿写着的东西。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 记忆结构 = require('./记忆结构.cjs')
const 记忆叙述 = require('./记忆叙述.cjs')

const 记忆目录 = 配置.数据目录
const 事实文件 = path.join(记忆目录, '事实.json')
const 经历文件 = path.join(记忆目录, '经历.json')
const 小本子文件 = path.join(记忆目录, '小本子.json')

/** 读一个 json，坏了就当空的（宁可少记，不能因为一个坏文件打不开程序） */
function 读JSON(文件, 默认值) {
  try {
    // 开头那个 BOM 要先拿掉 —— JSON.parse 不认它。
    // （跟 读聊天记录 里踩到的是同一个坑，2026-10-03。）
    const 内容 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '').trim()
    if (!内容) return 默认值
    return JSON.parse(内容)
  } catch (错误) {
    if (错误.code !== 'ENOENT' && 配置.文件配置.模式 !== 'fake-chat') {
      console.log(`⚠ 记忆文件读不动（${path.basename(文件)}）：${错误.message}`)
    }
    return 默认值
  }
}

/** 写一个 json —— 先写临时文件再改名，这样中途断电也不会写坏原文件 */
function 写JSON(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  const 临时 = 文件 + '.tmp'
  fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
  fs.renameSync(临时, 文件)
}

// ============================================================
// 三类记忆的读写
// ============================================================

/** 现在的时刻，写成 2026-09-26 21:10 这种好认的样子 */
function 现在() {
  const d = new Date()
  const 补 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}`
}

/** 生成一个不会重复的编号 */
let 编号尾数 = 0
function 新编号() {
  编号尾数 = (编号尾数 + 1) % 1000
  return Date.now().toString(36) + '-' + 编号尾数
}

/**
 * 记一条。
 * @param {'事实'|'经历'|'小本子'} 类别
 * @param {string} 内容
 * @param {string}  [来源] 谁记的：'她' 或 '我'
 * @param {{对话?:string,临时记忆?:string,记忆类型?:string,元数据?:object}} [上下文] 来源与结构化记忆信息
 * @returns {{编号:string, 时间:string, 类别:string, 内容:string, 来源:string, 对话?:string}|null}
 */
function 记一条(类别, 内容, 来源 = '她', 上下文 = {}) {
  const 元数据 = 记忆结构.正常元数据(上下文 && 上下文.元数据, { 类别, 来源, 严格: true })
  const 文本 = 记忆叙述.整理正文(内容, { 人物: 元数据.person, 修正旧代词: true })
  if (!文本) return null

  const 表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
  const 文件 = 表[类别]
  if (!文件) throw new Error('不认识的记忆类别: ' + 类别)

  const 全部 = 读JSON(文件, [])
  const 条 = {
    编号: 新编号(), 时间: 现在(), 类别, 内容: 文本, 来源,
    记忆类型: 记忆结构.正常记忆类型(上下文 && 上下文.记忆类型, 类别, { 严格: true }),
    元数据,
  }
  const 对话 = String((上下文 && 上下文.对话) || '').trim()
  if (对话) 条.对话 = 对话
  const 临时记忆 = String((上下文 && 上下文.临时记忆) || '').trim()
  if (临时记忆) 条.临时记忆 = 临时记忆
  if (上下文 && 上下文.自主评估 && typeof 上下文.自主评估 === 'object') {
    const 分数 = Number(上下文.自主评估.分数)
    const 依据 = Array.isArray(上下文.自主评估.依据) ? 上下文.自主评估.依据.map((一) => String(一 || '').trim()).filter(Boolean).slice(0, 8) : []
    if (Number.isInteger(分数) && 分数 >= 70 && 分数 <= 100 && 依据.length) {
      条.自主评估 = { 分数, 依据, 提及次数: Math.max(1, Math.min(99, Number(上下文.自主评估.提及次数) || 1)), 确认于: String(上下文.自主评估.确认于 || '') }
    }
  }
  全部.push(条)
  写JSON(文件, 全部)
  return 条
}

/** 删一条（按编号）。过期的记忆就靠这个清掉。 */
function 删一条(类别, 编号) {
  const 表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
  const 文件 = 表[类别]
  if (!文件) throw new Error('不认识的记忆类别: ' + 类别)
  const 要删的 = String(编号 || '').trim()
  if (!要删的) return false
  const 全部 = 读JSON(文件, [])
  const 剩下 = 全部.filter((条) => String(条 && 条.编号 || '') !== 要删的)
  if (剩下.length === 全部.length) return false
  写JSON(文件, 剩下)
  return true
}

/** 修改一条的正文，保留最初时间、记录者和来源会话。 */
function 改一条(类别, 编号, 新内容, 上下文 = {}) {
  const 表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
  const 文件 = 表[类别]
  if (!文件) throw new Error('不认识的记忆类别: ' + 类别)
  const 要改的 = String(编号 || '').trim()
  const 原文本 = String(新内容 || '').trim()
  if (!要改的) return { 好: false, 说明: '这条记忆没有编号，不能安全修改' }
  if (!原文本) return { 好: false, 说明: '记忆内容不能为空' }
  if (原文本.length > 2000) return { 好: false, 说明: '记忆内容不能超过 2000 字' }

  const 全部 = 读JSON(文件, [])
  const 条 = 全部.find((一) => String(一 && 一.编号 || '') === 要改的)
  if (!条) return { 好: false, 说明: '没找到这条记忆，可能已经被改动或遗忘' }
  const 结构 = 记忆结构.规范记忆结构(条, 类别, 条.来源)
  const 文本 = 记忆叙述.整理正文(原文本, { 人物: 结构.元数据.person, 修正旧代词: true })
  if (String(条.内容 || '').trim() === 文本) return { 好: true, 条, 没变化: true }
  条.内容 = 文本
  条.修改于 = 现在()
  条.修改来源 = '我'
  const 修改对话 = String((上下文 && 上下文.对话) || '').trim()
  if (修改对话) 条.修改对话 = 修改对话
  写JSON(文件, 全部)
  return { 好: true, 条 }
}

/** 给后台整理器一份带版本号的事实快照。版本变化说明用户或聊天刚改过，旧方案必须作废。 */
function 事实整理快照() {
  const 原 = 读JSON(事实文件, [])
  const 全部 = Array.isArray(原) ? 原 : []
  const 版本 = crypto.createHash('sha256').update(JSON.stringify(全部)).digest('hex')
  const 记录 = 全部
    .filter((一) => 一 && typeof 一 === 'object' && 一.编号 && String(一.内容 || '').trim())
    .map((一) => ({
      编号: String(一.编号), 时间: String(一.时间 || ''), 内容: String(一.内容).trim(),
      ...记忆结构.规范记忆结构(一, '事实', 一.来源),
    }))
  return { 版本, 记录 }
}

/**
 * 应用模型提出的事实合并。整份方案先校验，再一次性原子写入；任何一项不对就一个字不动。
 * 每组保留原文件中最新的那条编号和来源，其余原文已由整理历史快照负责回退。
 */
function 应用事实整理({ 版本, 合并们 } = {}) {
  const 当前快照 = 事实整理快照()
  if (!版本 || 版本 !== 当前快照.版本) return { 好: false, 过期: true, 说明: '事实在整理期间发生了变化' }
  if (!Array.isArray(合并们) || !合并们.length) return { 好: true, 没变化: true, 合并组: 0, 减少: 0 }
  if (合并们.length > 5) return { 好: false, 说明: '一次最多合并 5 组事实' }

  const 原 = 读JSON(事实文件, [])
  if (!Array.isArray(原)) return { 好: false, 说明: '事实文件格式不对' }
  const 位置 = new Map()
  原.forEach((一, i) => { if (一 && 一.编号) 位置.set(String(一.编号), i) })
  const 用过 = new Set()
  const 方案 = []
  let 涉及条数 = 0

  for (const 一组 of 合并们) {
    const 编号们 = [...new Set((Array.isArray(一组 && 一组.编号们) ? 一组.编号们 : []).map((x) => String(x || '').trim()).filter(Boolean))]
    const 原新内容 = String((一组 && 一组.新内容) || '').trim()
    if (编号们.length < 2 || 编号们.length > 5) return { 好: false, 说明: '每组必须包含 2 到 5 条事实' }
    if (!原新内容 || 原新内容.length > 800 || /[\[【]\s*(记住|经历|更正事实)\s*[:：]/.test(原新内容)) {
      return { 好: false, 说明: '整理后的事实内容不合格' }
    }
    if (编号们.some((编号) => !位置.has(编号) || 用过.has(编号))) return { 好: false, 说明: '方案包含不存在或重复使用的编号' }
    编号们.forEach((编号) => 用过.add(编号))
    涉及条数 += 编号们.length
    const 代表 = 原[位置.get(编号们[0])]
    const 结构 = 记忆结构.规范记忆结构(代表, '事实', 代表 && 代表.来源)
    方案.push({ 编号们, 新内容: 记忆叙述.整理正文(原新内容, { 人物: 结构.元数据.person, 修正旧代词: true }) })
  }
  if (涉及条数 > 12) return { 好: false, 说明: '一次整理涉及的事实太多' }

  const 副本 = 原.map((一) => (一 && typeof 一 === 'object' ? { ...一 } : 一))
  const 删除 = new Set()
  for (const 一组 of 方案) {
    const 保留编号 = 一组.编号们.reduce((a, b) => (位置.get(a) > 位置.get(b) ? a : b))
    const 保留 = 副本[位置.get(保留编号)]
    保留.内容 = 一组.新内容
    保留.整理于 = 现在()
    保留.整理来源 = 'DeepSeek 后台整理'
    保留.整理合并数量 = 一组.编号们.length
    for (const 编号 of 一组.编号们) if (编号 !== 保留编号) 删除.add(编号)
  }
  const 整理后 = 副本.filter((一) => !删除.has(String(一 && 一.编号 || '')))
  写JSON(事实文件, 整理后)
  return { 好: true, 合并组: 方案.length, 减少: 删除.size, 整理后: 整理后.length }
}

/** 把一类记忆排成给她看的文字。事实会带稳定编号，供纠正旧事实时精确命中。 */
function 排成文字(类别, 最多几条 = 30, 带编号 = false) {
  const 表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
  const 全部 = 读JSON(表[类别], [])
  if (!全部.length) return ''
  const 取的 = 全部.slice(-最多几条)
  return 取的.map((条) => {
    const 编号 = 带编号 && 条.编号 ? `[事实编号:${条.编号}] ` : ''
    const 结构 = 记忆结构.规范记忆结构(条, 类别, 条.来源)
    const 元数据 = 记忆叙述.面向她的元数据(结构.元数据)
    const 内容 = 记忆叙述.整理正文(条.内容, { 人物: 结构.元数据.person, 修正旧代词: true })
    return `· ${编号}[${条.时间}] [${结构.记忆类型} · ${元数据.person} · ${元数据.relationship}] ${内容}`
  }).join('\n')
}

// ============================================================
// 聊天记录：留着全文，但只把最近的递给她
// ============================================================
//
// 【2026-09-27 改了结构，记一下为什么】
//   原来一天一个文件（2026-09-26.jsonl、2026-09-27.jsonl……）。
//   那样有个毛病：想把"上次那轮对话"显示回窗口里，就得先读几天的
//   文件、再按时间排。文件一多就容易出错（跨天、排序、漏读）。
//
//   现在合成一个 聊天记录.jsonl，一行一条、从头到尾按时间排。
//   读"最近 N 条"就是取最后 N 行 —— 简单到不会错。
//   老的分日文件会自动并进来（见 并进一个文件），并完改名留档，不删。

const 聊天目录 = path.join(记忆目录, '聊天记录')
const 聊天文件 = path.join(聊天目录, '聊天记录.jsonl')

/** 把老的分日文件并进一个文件里（只做一次，做完把老的改名留档） */
function 并进一个文件() {
  let 老文件们 = []
  try {
    老文件们 = fs
      .readdirSync(聊天目录)
      .filter((名) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(名))
      .sort()
  } catch {
    return // 目录都还没有，说明是全新的
  }
  if (!老文件们.length) return

  const 全部 = []

  // 先把已经并好的那份读进来（万一之前并过一次）
  try {
    for (const 行 of fs.readFileSync(聊天文件, 'utf8').split('\n')) {
      if (!行.trim()) continue
      try {
        全部.push(JSON.parse(行.replace(/^\uFEFF/, '')))
      } catch {
        /* 跳过坏行 */
      }
    }
  } catch {
    /* 还没有合并文件 */
  }

  for (const 名 of 老文件们) {
    let 内容
    try {
      内容 = fs.readFileSync(path.join(聊天目录, 名), 'utf8')
    } catch {
      continue
    }
    for (const 行 of 内容.split('\n')) {
      if (!行.trim()) continue
      try {
        全部.push(JSON.parse(行))
      } catch {
        /* 坏行跳过 */
      }
    }
  }

  // 按时间排好（早的在前）
  全部.sort((a, b) => String(a.时间 || '').localeCompare(String(b.时间 || '')))

  fs.writeFileSync(聊天文件, 全部.map((条) => JSON.stringify(条)).join('\n') + '\n', 'utf8')

  // 老文件改名留档，别删 —— 万一并出问题还能回头查
  for (const 名 of 老文件们) {
    try {
      fs.renameSync(path.join(聊天目录, 名), path.join(聊天目录, 名 + '.已并入'))
    } catch {
      /* 改不动就算了 */
    }
  }

  console.log(`聊天记录：把 ${老文件们.length} 个分日文件并成了 聊天记录.jsonl（共 ${全部.length} 条）`)
}

/** 把一轮对话写进记录里（一行一条，方便你直接用记事本看）。 */
function 存聊天(角色, 内容, 选项 = {}) {
  try {
    fs.mkdirSync(聊天目录, { recursive: true })
    // 盖上"这是哪一段对话"的编号 —— 没有它，记录就分不出段了
    const 条 = { 时间: 现在(), 角色, 内容, 对话: String(选项.对话 || 当前对话) }
    // 来源只有程序自己的主动陪伴入口能写；普通消息继续保持原格式。
    if (选项.来源 === '主动陪伴' && 角色 === 'assistant') 条.来源 = '主动陪伴'
    const 行 = JSON.stringify(条) + '\n'
    fs.appendFileSync(聊天文件, 行, 'utf8')
    return true
  } catch (错误) {
    console.log('⚠ 聊天记录没写下来: ' + 错误.message)
    return false
  }
}

// ============================================================
// 对话：一段一段分开记，互不干扰
// ============================================================
//
// 【他要的是什么 —— 2026-10-03 提的】
//   "每一段对话保留每一段对话的记忆，但对话与对话之间互不干扰。"
//   也就是左边一列对话，点哪段就只跟哪段说话，彼此不串。
//
// 【记性分两层，这里动的是哪一层】
//     · **长期记忆**（事实 / 经历 / 小本子）—— 她记得当前使用者是谁、
//       你们一起干过什么。**所有对话共用这一层，永远不动。**
//     · **一段对话的上下文**（这段里刚才那几句）—— 只有这一段看得见。
//   所以换一段对话，她不会忘了他是谁 —— 只是不记得另一段里聊过什么。
//   （这跟 DSH 里那个对话列表是一回事。）
//
// 【为什么给每条记录盖个编号，而不是"一段一个文件"】
//   一段一个文件听着干净，但会把这个文件里已经跑通的一堆东西全推翻：
//   按时间合并、日期分隔、"看更早的"、坏行跳过、BOM 那道坎……
//   而且老记录（2026-10-03 之前那 120 条）还得整体搬一次家，
//   搬家就是"可能搬坏"。
//   盖编号什么都不用搬：老记录没有编号，那就**当它们是同一段**
//   （见 默认对话），新记录带上自己的编号。一行都不用改。
//
// 【为什么还需要一个索引文件】
//   光靠记录的话，"刚建好、还没说话"的那一段根本不存在 ——
//   他一点"新对话"，列表里什么都不多，看着像按钮坏了。
const 默认对话 = '最早'

/** 索引文件：有哪几段对话、叫什么、什么时候建的 */
const 索引文件 = path.join(聊天目录, '对话索引.json')

/** 现在在跟哪一段说话 */
let 当前对话 = 默认对话

/** 这条记录属于哪一段（老记录没有这个字段 → 默认那一段） */
function 这段编号(条) {
  return (条 && 条.对话) || 默认对话
}

/** 现在在哪一段 */
function 现在哪一段() {
  return 当前对话
}

/** 换到某一段 */
function 设当前对话(编号) {
  当前对话 = String(编号 || 默认对话)
  return 当前对话
}

/** 读索引（坏了就当空的） */
function 读索引() {
  const 表 = 读JSON(索引文件, [])
  return Array.isArray(表) ? 表 : []
}

/**
 * 有哪几段对话。
 *
 * 【索引和记录，谁说了算】
 *   索引说了算"有哪些段、什么顺序"—— 因为它记着**刚建好还没说话**的那一段
 *   （光看记录的话，空对话根本不存在，他一点"新对话"会发现列表里没反应）。
 *   可万一索引丢了、或者某段记录是别处写进来的，那就**以记录为准补上** ——
 *   宁可多列一段，也不能让他的记录变成看不见的孤魂。
 *
 * @returns {Array<{编号, 标题, 建于, 最后, 条数}>} 新的排前面
 */
function 对话列表() {
  const 全部 = 全部记录()

  const 表 = new Map()
  for (const 条 of 读索引()) {
    if (!条 || !条.编号) continue
    表.set(String(条.编号), {
      编号: String(条.编号),
      标题: 条.标题 || '',
      // 这一段用哪个模型（空 = 用默认的）。界面靠它在那一条后面标出来
      模型: 条.模型 || '',
      模式: 条.模式 || '',
      // 没有这个字段的是旧对话：继续按原来的方式写长期记忆。
      写长期记忆: 条.写长期记忆 !== false,
      建于: 条.建于 || '',
      最后: 条.建于 || '',
      条数: 0,
    })
  }

  for (const 条 of 全部) {
    if (条.角色 === '分隔') continue // 老版本留下的分隔线，不算话
    const 号 = 这段编号(条)
    if (!表.has(号)) {
      表.set(号, {
        编号: 号,
        标题: '',
        模型: '',
        模式: '',
        写长期记忆: true,
        建于: 条.时间 || '',
        最后: 条.时间 || '',
        条数: 0,
      })
    }
    const 一 = 表.get(号)
    一.条数++
    一.最后 = 条.时间 || 一.最后
    // 标题：这段里他说的第一句（说半截也比"对话 3"强）
    if (!一.标题 && 条.角色 === 'user' && 条.内容) {
      一.标题 = String(条.内容).replace(/\s+/g, ' ').slice(0, 18)
    }
  }

  const 列 = [...表.values()].map((一) => ({
    ...一,
    标题: 一.标题 || (一.编号 === 默认对话 ? '最早那些话' : '还没说话'),
  }))

  // 新的排前面（记录是一行行往下写的，所以按时间倒过来就是新的在前）
  列.sort((a, b) => String(a.建于 || '').localeCompare(String(b.建于 || '')))
  return 列.reverse()
}

/** 读全部记录（不分段）—— 只有"列对话"和排查用得上 */
function 全部记录() {
  并进一个文件()
  let 内容
  try {
    内容 = fs.readFileSync(聊天文件, 'utf8')
  } catch {
    return []
  }
  内容 = 内容.replace(/^\uFEFF/, '')

  const 全部 = []
  for (const 行 of 内容.split('\n')) {
    if (!行.trim()) continue
    try {
      全部.push(JSON.parse(行.replace(/^\uFEFF/, '')))
    } catch {
      /* 坏行跳过 */
    }
  }
  return 全部
}

/**
 * 建一段新对话，返回它的编号。
 *
 * 【模型这个参数是 2026-10-04 加的】
 *   他要的是"像 DSH 一样，每段对话各用一个模型" ——
 *   聊天的对话用她说话最像的那个，要看图的对话换成能看图的。
 *   所以"哪个脑子"是**跟着这一段走**的，存在索引里。
 *   没传（或者传空）= 跟着默认走：将来默认值改了，它也跟着改。
 */
function 建新对话(标题 = '', 模型 = '', 模式 = '') {
  const 编号 = 'd' + Date.now().toString(36)
  const 索引 = 读索引()
  const 一条 = { 编号, 标题, 建于: 现在() }
  if (模型) 一条.模型 = String(模型)
  // 【模式也记在这儿 —— 2026-10-07 加的】
  //   他要的是"新建对话的时候就选这一段用来干嘛"：聊天、干活、还是陪他学。
  //   所以它也是**跟着这一段走**的，跟模型一样，不是全局一个开关。
  if (模式) 一条.模式 = String(模式)
  索引.push(一条)
  写JSON(索引文件, 索引)
  设当前对话(编号)
  return 编号
}

/**
 * 这一段用的是哪个模型。
 * @returns {string} 模型名；**空字符串表示没指定过**，让调用方用默认的
 */
function 这段的模型(编号) {
  const 号 = String(编号 || 当前对话)
  const 条 = 读索引().find((x) => x && String(x.编号) === 号)
  return (条 && 条.模型) || ''
}

/**
 * 这一段是哪种模式。
 * @returns {string} 'chat' | 'work' | 'learn'。
 *   **空字符串表示没选过** —— 这个字段是 2026-10-07 才加的，
 *   在那之前建的对话都没有它。调用方遇到空的自个儿决定默认用哪个。
 */
function 这段的模式(编号) {
  const 号 = String(编号 || 当前对话)
  const 条 = 读索引().find((x) => x && String(x.编号) === 号)
  return (条 && 条.模式) || ''
}

/**
 * 改这一段的模式（顶栏那个开关点一下，走的就是这儿）。
 *
 * 【注意：改的是"这一段"，不是全局】
 *   2026-10-07 之前模式是全局的一个开关，切了所有对话都跟着变 ——
 *   那不对。他要的是"这段拿来聊天、那段拿来学高数"。
 *   现在它跟模型一样，是**每一段自己的**东西。
 */
function 设这段的模式(编号, 模式) {
  const 号 = String(编号 || 当前对话)
  const 索引 = 读索引()
  const 条 = 索引.find((x) => x && String(x.编号) === 号)
  if (!条) return ''
  条.模式 = String(模式 || '')
  写JSON(索引文件, 索引)
  return 条.模式
}

/**
 * 这一段是否允许新增长期记忆（事实 / 经历 / 小本子）。
 * 旧索引没有这个字段，必须默认 true。它不管聊天记录，也不管学习进度。
 */
function 这段写长期记忆吗(编号) {
  const 号 = String(编号 || 当前对话)
  const 条 = 读索引().find((x) => x && String(x.编号) === 号)
  return !条 || 条.写长期记忆 !== false
}

/** 改当前对话的长期记忆写入开关，并原样保留索引里的其他字段。 */
function 设这段写长期记忆(编号, 要写) {
  const 号 = String(编号 || 当前对话)
  const 索引 = 读索引()
  const 条 = 索引.find((x) => x && String(x.编号) === 号)
  if (!条) return true
  条.写长期记忆 = 要写 !== false
  写JSON(索引文件, 索引)
  return 条.写长期记忆
}

/**
 * 把"没有编号的老记录"那段补进索引（只补一次）。
 *
 * 为什么要有这一步：老记录散在文件里、没有编号，光靠 对话列表() 也能列出来，
 * 但**顺序会乱**（它只能靠第一条记录的时间排）。在索引里给它一个正式位置，列表就稳了。
 */
function 补一次老记录那段() {
  const 索引 = 读索引()
  if (索引.some((条) => 条 && String(条.编号) === 默认对话)) return false
  const 全部 = 全部记录()
  if (!全部.some((条) => !条.对话)) return false // 没有老记录，不用补
  索引.unshift({ 编号: 默认对话, 标题: '', 建于: (全部[0] && 全部[0].时间) || 现在() })
  写JSON(索引文件, 索引)
  return true
}

/**
 * 读聊天记录。
 * @param {number} 最多几条  取最后这么多条；传 0 就是全读
 */
function 读聊天记录(最多几条 = 0, 选项 = {}) {
  if (Object.hasOwn(选项, '对话')) return 读指定聊天(选项.对话, 最多几条)
  并进一个文件()

  // 【只挑**这一段**的 —— 别的对话一个字都不掺进来】
  //   这就是"互不干扰"落地的地方。所有"给她看/给她说"的路
  //   最后都走这个函数，所以只在这儿筛一次就够。
  const 全部 = 全部记录().filter((条) => 这段编号(条) === 当前对话)

  return 最多几条 > 0 ? 全部.slice(-最多几条) : 全部
}

// 「分隔」是老版本留下的东西，现在不用了 —— 那批记录仍然当归一档，
// 但不再往文件里写新的分隔线（见 对话列表() 里跳过它们那行）。
const 是分隔 = (条) => !!条 && 条.角色 === '分隔'

/**
 * 读回最近几句（给她接话用）。
 *
 * 【注意：只读"这一段"】
 *   读聊天记录() 已经按当前对话号筛过了，所以这里天然只拿得到这一段。
 *   别的对话里的内容是**一个字都进不来** —— 这就是"互不干扰"。
 *   （长期记忆是另一条路：见 取记忆()，那个所有对话共用、一直不受影响。
 *     所以换一段对话她仍然记得他是谁、你们一起干过什么。）
 *
 * @param {number} 最多几条
 */
function 读最近聊天(最多几条 = 20, 选项 = {}) {
  const 这一段 = 读聊天记录(0, 选项)
  return 最多几条 > 0 ? 这一段.slice(-最多几条) : 这一段
}

// 独立核心使用显式编号；不切换桌面指针，不触发旧分日记录迁移，损坏时失败关闭。
function 显式编号(编号) {
  if (typeof 编号 !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(编号)) throw new Error('CHAT_ID_INVALID')
  return 编号
}
function 读指定聊天(编号, 最多几条 = 0) {
  显式编号(编号)
  try {
    let 内容
    try {
      if (fs.statSync(聊天文件).size > 64 * 1024 * 1024) throw new Error('CHAT_HISTORY_LIMIT')
      内容 = fs.readFileSync(聊天文件, 'utf8')
    } catch (错) { if (错.code === 'ENOENT') return []; throw 错 }
    const 全部 = 内容.replace(/^\uFEFF/u, '').split('\n').filter((行) => 行.trim()).map((行) => JSON.parse(行))
    if (全部.some((条) => !条 || typeof 条 !== 'object' || !['user', 'assistant', '分隔'].includes(条.角色) || typeof 条.内容 !== 'string' || typeof 条.时间 !== 'string')) throw new Error('CHAT_HISTORY_INVALID')
    const 结果 = 全部.filter((条) => 这段编号(条) === 编号)
    return 最多几条 > 0 ? 结果.slice(-最多几条) : 结果
  } catch { throw new Error('CHAT_HISTORY_UNAVAILABLE') }
}
function 登记对话(编号, { 模型 = '', 建于 = new Date().toISOString() } = {}) {
  let 临时
  try {
    显式编号(编号)
    if (typeof 模型 !== 'string' || 模型.length > 128 || typeof 建于 !== 'string' || !Number.isFinite(Date.parse(建于)) || new Date(建于).toISOString() !== 建于) throw new Error('CHAT_REGISTRATION_INVALID')
    let 索引
    try {
      if (fs.statSync(索引文件).size > 4 * 1024 * 1024) throw new Error('CHAT_INDEX_LIMIT')
      索引 = JSON.parse(fs.readFileSync(索引文件, 'utf8').replace(/^\uFEFF/u, ''))
    } catch (错) { if (错.code !== 'ENOENT') throw 错; 索引 = [] }
    if (!Array.isArray(索引) || 索引.some((条) => !条 || typeof 条.编号 !== 'string') || new Set(索引.map((条) => 条.编号)).size !== 索引.length) throw new Error('CHAT_INDEX_INVALID')
    if (索引.some((条) => 条.编号 === 编号)) return { 好: true, 对话: 编号, 新建: false }
    索引.push({ 编号, 标题: '', 建于, 模型, 模式: 'chat', 写长期记忆: false })
    fs.mkdirSync(聊天目录, { recursive: true })
    临时 = 索引文件 + '.' + crypto.randomUUID() + '.tmp'
    fs.writeFileSync(临时, JSON.stringify(索引, null, 2), { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(临时, 索引文件); 临时 = null
    return { 好: true, 对话: 编号, 新建: true }
  } catch { return { 好: false, 代码: 'CHAT_REGISTRATION_FAILED' } }
  finally { if (临时) { try { fs.unlinkSync(临时) } catch { /* 未提交临时文件，原档保留 */ } } }
}

/** 单次追加整轮；失败后可能已写入部分字节，回执 unknown，调用方不得自动重做。 */
function 存对话一轮({ 对话, 用户正文, 回复正文, 发生于 = null, 接收于, 完成于 } = {}) {
  let fd
  try {
    显式编号(对话)
    const 是UTC = (值) => typeof 值 === 'string' && Number.isFinite(Date.parse(值)) && new Date(值).toISOString() === 值
    if (typeof 用户正文 !== 'string' || typeof 回复正文 !== 'string' || (发生于 !== null && !是UTC(发生于)) || !是UTC(接收于) || !是UTC(完成于)) throw new Error('CHAT_TURN_INVALID')
    // 不向已经损坏的历史末尾追加，也不把损坏当成空会话。
    读指定聊天(对话)
    const 条们 = [
      { 时间: 发生于 || 接收于, 角色: 'user', 内容: 用户正文, 对话, 发生于, 接收于 },
      { 时间: 完成于, 角色: 'assistant', 内容: 回复正文, 对话 },
    ]
    fs.mkdirSync(聊天目录, { recursive: true })
    fd = fs.openSync(聊天文件, 'a+')
    const 大小 = fs.fstatSync(fd).size, 末字节 = Buffer.alloc(1)
    if (大小 > 0) fs.readSync(fd, 末字节, 0, 1, 大小 - 1)
    const 字节 = Buffer.from((大小 > 0 && 末字节[0] !== 10 ? '\n' : '') + 条们.map((条) => JSON.stringify(条) + '\n').join(''))
    let 偏移 = 0
    while (偏移 < 字节.length) { const 数 = fs.writeSync(fd, 字节, 偏移, 字节.length - 偏移); if (数 <= 0) throw new Error('CHAT_WRITE_FAILED'); 偏移 += 数 }
    fs.fsyncSync(fd)
    return { 好: true, 状态: 'saved', 对话, 条数: 2 }
  } catch { return { 好: false, 状态: 'unknown', 代码: 'CHAT_TURN_WRITE_FAILED', 对话 } }
  finally { if (fd !== undefined) { try { fs.closeSync(fd) } catch { /* 回执不暴露原始磁盘错误 */ } } }
}

/** 这条记录是哪一天（用来在窗口里插"—— 9月27日 ——"那种分隔） */
function 哪天(条) {
  return String((条 && 条.时间) || '').slice(0, 10)
}

// ============================================================
// 给他看 / 给她看
// ============================================================

/** 拼成给她的那份（每次都现读，所以你在文件里改完立刻生效） */
function 取记忆() {
  return {
    关于他: 排成文字('事实', 40, true),
    共同经历: 排成文字('经历', 40),
    小本子: 排成文字('小本子', 30),
  }
}

/**
 * 把三份长期记忆整理成统一结构。这里不设条数上限，供完整导出使用；
 * 界面查询仍由 列长期记忆() 单独限制为最多 500 条。
 */
function 全部长期记忆() {
  const 类别们 = ['事实', '经历', '小本子']
  const 文件表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
  const 会话名 = new Map(对话列表().map((一) => [String(一.编号), String(一.标题 || 一.编号)]))
  const 全部 = []

  for (const 一类 of 类别们) {
    const 条们 = 读JSON(文件表[一类], [])
    if (!Array.isArray(条们)) continue
    for (const 原 of 条们) {
      if (!原 || typeof 原 !== 'object') continue
      const 内容 = String(原.内容 || '').trim()
      if (!内容) continue
      const 来源 = String(原.来源 || '未记录')
      const 对话 = String(原.对话 || '')
      const 结构 = 记忆结构.规范记忆结构(原, 一类, 来源)
      全部.push({
        编号: String(原.编号 || ''),
        时间: String(原.时间 || ''),
        类别: 一类,
        内容,
        来源,
        记忆类型: 结构.记忆类型,
        元数据: 结构.元数据,
        对话,
        会话标题: 对话 ? (会话名.get(对话) || 对话) : '',
        修改于: String(原.修改于 || ''),
        修改来源: String(原.修改来源 || ''),
        修改对话: String(原.修改对话 || ''),
        修改会话标题: 原.修改对话 ? (会话名.get(String(原.修改对话)) || String(原.修改对话)) : '',
        整理于: String(原.整理于 || ''),
        整理来源: String(原.整理来源 || ''),
        整理合并数量: Number(原.整理合并数量) || 0,
        临时记忆: String(原.临时记忆 || ''),
        自主评估: 原.自主评估 && typeof 原.自主评估 === 'object' ? {
          分数: Number(原.自主评估.分数) || 0,
          依据: Array.isArray(原.自主评估.依据) ? 原.自主评估.依据.map((一) => String(一 || '')).slice(0, 8) : [],
          提及次数: Number(原.自主评估.提及次数) || 0,
          确认于: String(原.自主评估.确认于 || ''),
        } : null,
      })
    }
  }

  全部.sort((a, b) => String(b.时间).localeCompare(String(a.时间)) || String(b.编号).localeCompare(String(a.编号)))
  return 全部
}

/**
 * 清空三类长期记忆。聊天记录、对话索引、学习资料和设置不在这里。
 *
 * 清空前把三份原始数组写进“清空历史”；任何一份写空失败，就把三份都恢复。
 * 备份不参与提示词读取，最多保留 10 份，供误操作后人工恢复。
 */
function 清空全部长期记忆({ 当前 = new Date() } = {}) {
  const 文件表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
  const 原件 = {}
  for (const [类别, 文件] of Object.entries(文件表)) {
    let 值
    try {
      const 原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '').trim()
      值 = 原文 ? JSON.parse(原文) : []
    } catch (错误) {
      if (错误.code === 'ENOENT') 值 = []
      else throw new Error(`${类别}记忆读不动，已取消清空：${错误.message}`)
    }
    if (!Array.isArray(值)) throw new Error(`${类别}记忆格式不对，已取消清空`)
    原件[类别] = 值
  }

  const 总数 = Object.values(原件).reduce((和, 一类) => 和 + 一类.length, 0)
  if (!总数) return { 好: true, 没变化: true, 条数: 0, 备份文件: '' }

  const 清空历史 = path.join(记忆目录, '清空历史')
  const 时间字 = 当前.toISOString().replace(/[:.]/g, '-')
  const 备份文件 = path.join(清空历史, `清空前-${时间字}.json`)
  写JSON(备份文件, {
    格式版本: 1,
    备份时间: 当前.toISOString(),
    总数,
    事实: 原件.事实,
    经历: 原件.经历,
    小本子: 原件.小本子,
  })

  try {
    for (const 文件 of Object.values(文件表)) 写JSON(文件, [])
  } catch (错误) {
    const 恢复失败 = []
    for (const [类别, 文件] of Object.entries(文件表)) {
      try { 写JSON(文件, 原件[类别]) } catch (恢复错误) { 恢复失败.push(`${类别}: ${恢复错误.message}`) }
    }
    const 后缀 = 恢复失败.length ? `；自动恢复也有失败（${恢复失败.join('；')}），请用清空前备份人工恢复` : '；原记忆已自动恢复'
    throw new Error(`长期记忆没有清空成功：${错误.message}${后缀}`)
  }

  try {
    const 旧备份 = fs.readdirSync(清空历史)
      .filter((名字) => /^清空前-.*\.json$/.test(名字))
      .sort()
      .reverse()
    for (const 名字 of 旧备份.slice(10)) fs.rmSync(path.join(清空历史, 名字), { force: true })
  } catch { /* 清理旧备份失败不影响本次清空和新备份 */ }

  return { 好: true, 条数: 总数, 备份文件 }
}

/**
 * 给记忆管理页的只读清单。搜索在主进程完成，renderer 只拿必要字段。
 * 老记录没有会话来源时明确留空，不根据时间猜。
 */
function 列长期记忆({ 类别 = '', 搜索 = '', 最多 = 500 } = {}) {
  const 类别们 = ['事实', '经历', '小本子']
  const 选的类别 = 类别们.includes(String(类别 || '')) ? String(类别) : ''
  const 关键词 = String(搜索 || '').trim().toLocaleLowerCase().slice(0, 80)
  const 限量 = Math.max(1, Math.min(500, Number(最多) || 500))
  const 筛过 = 全部长期记忆().filter((一) => {
    if (选的类别 && 一.类别 !== 选的类别) return false
    if (!关键词) return true
    return `${一.内容}\n${一.来源}\n${一.对话}\n${一.会话标题}\n${一.记忆类型}\n${一.元数据.backstory}\n${一.元数据.person}\n${一.元数据.relationship}`.toLocaleLowerCase().includes(关键词)
  })
  return { 列表: 筛过.slice(0, 限量).map(记忆叙述.面向她的记录), 总数: 筛过.length, 截断: 筛过.length > 限量 }
}

/** 打印一份总览，你自己看 */
function 总览() {
  const 行 = []
  行.push('记忆放在: ' + 记忆目录)
  行.push('')
  for (const [标题, 类别] of [
    ['关于当前使用者的事实', '事实'],
    ['你们一起经历的', '经历'],
    ['她的小本子', '小本子'],
  ]) {
    const 表 = { 事实: 事实文件, 经历: 经历文件, 小本子: 小本子文件 }
    const 全部 = 读JSON(表[类别], [])
    行.push(`【${标题}】共 ${全部.length} 条`)
    for (const 条 of 全部.slice(-10)) {
      行.push(`  · [${条.时间}] ${条.内容}`)
    }
    if (全部.length > 10) 行.push(`  …… 还有 ${全部.length - 10} 条更早的`)
    行.push('')
  }
  const 聊天 = 读最近聊天(6)
  行.push(`【最近的聊天】共读出 ${聊天.length} 条`)
  for (const 条 of 聊天) {
    行.push(`  ${条.角色 === 'user' ? '他' : '她'}: ${条.内容.slice(0, 40)}`)
  }
  return 行.join('\n')
}

module.exports = {
  记一条,
  删一条,
  改一条,
  事实整理快照,
  应用事实整理,
  排成文字,
  取记忆,
  列长期记忆,
  全部长期记忆,
  清空全部长期记忆,
  存聊天,
  存对话一轮,
  读最近聊天,
  读聊天记录,
  全部记录,
  哪天,
  总览,
  // ---- 对话（左边那一列）----
  对话列表,
  现在哪一段,
  设当前对话,
  建新对话,
  登记对话,
  这段的模型,
  这段的模式,
  设这段的模式,
  这段写长期记忆吗,
  设这段写长期记忆,
  补一次老记录那段,
  默认对话,
  索引文件,
  是分隔,
  记忆目录,
  事实文件,
  经历文件,
  小本子文件,
  聊天文件,
}

// ============================================================
// 命令行：直接把记忆打出来看，或者手动记一条
//   用法: node 脑\记忆.cjs                 看总览
//         node 脑\记忆.cjs 记 事实 "他明天有课"
//         node 脑\记忆.cjs 记 经历 "第一次一起听歌"
// ============================================================
if (require.main === module) {
  const [动作, 类别, ...剩下] = process.argv.slice(2)
  if (动作 === '记') {
    const 条 = 记一条(类别, 剩下.join(' '), '我')
    console.log(条 ? `✓ 记下了: ${条.内容}` : '✗ 内容不能是空的')
  } else {
    console.log(总览())
  }
}
