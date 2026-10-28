/**
 * 临时记忆提取.cjs —— 回复结束后的独立后台候选提取
 *
 * 这里只看“缓冲中的少量用户原话 + 各轮最终回复”，不读整段聊天，也不把临时记忆放回主对话提示词。
 * 模型只能提出候选；是否自主确认由独立本地评分决定，冲突候选仍必须人工处理。
 */
'use strict'
const { 检查任务 } = require('./任务控制.cjs')

const crypto = require('node:crypto')
const 临时记忆 = require('./临时记忆.cjs')
const 记忆结构 = require('./记忆结构.cjs')
const 记忆叙述 = require('./记忆叙述.cjs')
const 长期记忆 = require('./记忆.cjs')
const { 晋升到长期 } = require('./临时记忆晋升.cjs')
const 自主评估 = require('./临时记忆自主评估.cjs')
const 记忆关系整理 = require('./记忆关系整理.cjs')
const 记忆聚类就绪 = require('./记忆聚类就绪.cjs')

const 最大排队数 = 20
const 最大候选数 = 3
const 默认批量阈值 = 3
const 默认最长等待毫秒 = 5 * 60 * 1000
const 最大缓冲轮数 = 60

function 解析JSON(文字) {
  const 原 = String(文字 || '').trim()
  if (!原) throw new Error('模型没有返回内容')
  try { return JSON.parse(原) } catch { /* 兼容代码块外壳 */ }
  const 匹配 = 原.match(/\{[\s\S]*\}/)
  if (!匹配) throw new Error('模型没有返回 JSON 对象')
  return JSON.parse(匹配[0])
}

function 归一(值) {
  return String(值 || '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

function 有敏感或内部内容(值) {
  const 文 = String(值 || '')
  return /(?:sk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i.test(文) ||
    /(?:api[ _-]?key|token|密码|口令)\s*[:：=]\s*\S+/i.test(文) ||
    /(?:[a-z]:\\|\\\\[^\\\s]+\\)/i.test(文) ||
    /\[(?:读|写|搜|运行|工具|记住|经历|更正事实)\s*[:：]/.test(文)
}

function 整理标签(值) {
  if (值 === undefined) return []
  if (!Array.isArray(值) || 值.length > 6) return null
  const 结果 = []
  for (const 一 of 值) {
    const 标签 = String(一 || '').trim()
    if (!标签 || 标签.length > 40) return null
    if (!结果.includes(标签)) 结果.push(标签)
  }
  return 结果
}

const 关系称呼们 = new Set(['本人', '共同经历', '与爱莉希雅', '家人', '伴侣', '朋友', '同学', '老师', '同事', '其他'])
function 规整模型元数据(原, 类别, 用户原话) {
  const 类型原值 = String(原.记忆类型 || '').trim().toLowerCase()
  if (类型原值 && !记忆结构.记忆类型们.includes(类型原值)) return null
  const 记忆类型 = 记忆结构.正常记忆类型(类型原值, 类别)
  const 值 = 原.元数据 && typeof 原.元数据 === 'object' && !Array.isArray(原.元数据) ? 原.元数据 : {}
  const 默认 = 记忆结构.默认元数据(类别, '模型提取')
  const backstory = String(值.backstory || 默认.backstory).trim()
  const person = String(值.person || 默认.person).trim()
  const relationship = String(值.relationship || 默认.relationship).trim()
  if (!backstory || backstory.length > 240 || 有敏感或内部内容(backstory)) return null
  if (!person || person.length > 80 || 有敏感或内部内容(person)) return null
  if (!relationship || relationship.length > 80 || !关系称呼们.has(relationship)) return null
  // 第三方姓名必须能在用户原话里找到；模型不能凭空发明人物。
  if (!['用户本人', '用户与爱莉希雅', '爱莉希雅'].includes(person) && !String(用户原话).includes(person)) return null
  return { 记忆类型, 元数据: { backstory, person, relationship } }
}

function 规整候选(值, { 用户原话 = '', 对话轮次 = [], 已有内容 = [], 已有记录 = [], 排除内容 = [], 临时记忆库 = 临时记忆 } = {}) {
  const 原组 = Array.isArray(值 && 值.候选) ? 值.候选.slice(0, 最大候选数) : []
  const 轮次们 = Array.isArray(对话轮次) ? 对话轮次.map((一, 下标) => ({
    序号: 下标 + 1,
    用户原话: String(一 && 一.用户原话 || '').trim(),
    消息时间: String(一 && 一.消息时间 || '').trim(),
  })).filter((一) => 一.用户原话) : []
  const 已见 = new Set([...已有内容, ...排除内容].map(归一).filter(Boolean))
  const 可替代 = new Map((Array.isArray(已有记录) ? 已有记录 : []).filter((一) =>
    一 && 一.编号 && 一.生命周期 === '有效' && 一.确认状态 === '已确认' && (!一.关系 || 一.关系.状态 === '当前')
  ).map((一) => [String(一.编号), 一]))
  const 明确更正 = /(?:不是|不再|取消|改成|改为|更正|纠正|其实|换成|应该是|记错了|说错了)/
  const 结果 = []
  for (const 原 of 原组) {
    if (!原 || typeof 原 !== 'object' || Array.isArray(原)) continue
    const 类别 = String(原.类别 || '').trim()
    const 原内容 = String(原.内容 || '').trim()
    const 依据原文 = String(原.依据原文 || 原.依据 || '').trim()
    let 依据用户原话 = String(用户原话 || '')
    let 来源消息时间 = ''
    let 依据轮次 = 轮次们.length === 1 ? 1 : Number(原.依据轮次)
    if (轮次们.length) {
      if (!Number.isInteger(依据轮次) || 依据轮次 < 1 || 依据轮次 > 轮次们.length) continue
      const 来源轮 = 轮次们[依据轮次 - 1]
      依据用户原话 = 来源轮.用户原话
      来源消息时间 = 来源轮.消息时间
    }
    if (!临时记忆库.固定分类.includes(类别)) continue
    if (!原内容 || 原内容.length > 600 || !依据原文 || 依据原文.length > 200) continue
    // 依据必须真的是指定轮次用户输入中的连续原文，不能跨轮拼接、改写或取自她的回复。
    if (!依据用户原话.includes(依据原文)) continue
    if (有敏感或内部内容(原内容) || 有敏感或内部内容(依据原文)) continue
    const 结构 = 规整模型元数据(原, 类别, 依据用户原话)
    if (!结构) continue
    const 内容 = 记忆叙述.整理正文(原内容, { 人物: 结构.元数据.person, 修正旧代词: true })
    if (!内容 || 记忆叙述.有第三方系统称呼(内容)) continue
    const 标签 = 整理标签(原.标签)
    if (标签 === null) continue
    const 默认天数 = 临时记忆库.默认保留天数[类别]
    const 模型天数 = 原.保留天数 === undefined ? 默认天数 : Number(原.保留天数)
    if (!Number.isInteger(模型天数) || 模型天数 < 1 || 模型天数 > 30) continue
    // 模型只能缩短临时保留期，不能让候选无限堆在临时层；人工新增仍可在数据层选择 1–30 天。
    const 保留天数 = Math.min(模型天数, 默认天数)
    const 键 = 归一(内容)
    if (!键 || 已见.has(键)) continue
    const 旧编号 = String(原.替代编号 || '').trim()
    const 旧条 = 可替代.get(旧编号)
    const 替代编号 = 旧条 && 旧条.类别 === 类别 && 明确更正.test(依据原文) ? 旧编号 : ''
    const 候选 = { 类别, 内容, 依据原文, 依据轮次: 轮次们.length ? 依据轮次 : 0, 来源消息时间, 保留天数, 标签, 替代编号, ...结构 }
    const 已有同主题 = !替代编号 && (Array.isArray(已有记录) ? 已有记录 : []).some((一) =>
      一 && 一.生命周期 === '有效' && (!一.关系 || 一.关系.状态 === '当前') && 自主评估.是同一主题(候选, 一)
    )
    if (已有同主题) continue
    已见.add(键)
    结果.push(候选)
  }
  return 结果
}

async function 问模型({ 钥匙, 地址, 模型, 消息们, fetch函数, 超时 = 45000, 中止 }) {
  const 掐 = new AbortController()
  const 闹钟 = setTimeout(() => 掐.abort(), 超时)
  try {
    const 回应 = await fetch函数(地址, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify({ model: 模型, messages: 消息们, stream: false, temperature: 0, max_tokens: 1200 }),
      signal: 中止 ? AbortSignal.any([掐.signal, 中止]) : 掐.signal,
    })
    if (!回应.ok) throw new Error('HTTP ' + 回应.status)
    const 包 = await 回应.json()
    return 解析JSON(包 && 包.choices && 包.choices[0] && 包.choices[0].message && 包.choices[0].message.content)
  } finally {
    clearTimeout(闹钟)
  }
}

const 后台提取系统提示 = '你是爱莉希雅自己的短期记忆候选提取器。只从本批各轮的用户原话提取未来几天可能有用的信息；她的回复只帮助理解，绝不能作为事实来源。候选正文必须站在爱莉希雅自己的视角：对眼前的人一律称“你”，称爱莉希雅自己为“我”或“我们”；禁止写“用户、用户本人、爱莉、爱莉希雅”，也禁止用“他/她”代指你们两人。第三方人物才使用姓名或他/她。每项必须填写“依据轮次”，且“依据原文”必须是该轮用户原话中连续且逐字存在的片段，禁止跨轮拼接。允许类别仅为：近期状态、近期计划、未完话题、候选偏好、近期事件、关系语境。每项还要分类为 episodic（某次事件或有时间的计划）、semantic（事实、偏好或稳定特征）、procedural（可复用的做法、步骤或流程）。元数据是机器分类：person 本人写“用户本人”，共同经历写“用户与爱莉希雅”，第三方姓名必须原样出现在对应轮用户原话；relationship 只能是：本人、共同经历、与爱莉希雅、家人、伴侣、朋友、同学、老师、同事、其他。不要记录寒暄、已完成的一次性请求、学习或工作文件细节、第三方知识、推测、玩笑、引用内容、密码、密钥、路径和工具输出。只有对应轮用户明确说自己先前内容错了、取消了或改了，且给出的已有候选确实是被更正的同类内容时，才附加“替代编号”；这只是待人工处理的提议，不能自行覆盖旧内容。只返回 JSON：{"候选":[{"依据轮次":1,"类别":"近期计划","记忆类型":"episodic","内容":"你周六想去图书馆","保留天数":5,"标签":[],"依据原文":"对应轮用户原话中的连续片段","元数据":{"backstory":"为什么值得记","person":"用户本人","relationship":"本人"},"替代编号":"可选的已有编号"}]}。最多三项，没有就返回 {"候选":[]}。'

function 创建提取器({
  临时记忆库 = 临时记忆,
  长期记忆库 = 长期记忆,
  fetch函数: 固定fetch,
  批量阈值 = 默认批量阈值,
  最长等待毫秒 = 默认最长等待毫秒,
} = {}) {
  const 有效批量阈值 = Number.isInteger(批量阈值) && 批量阈值 >= 1 && 批量阈值 <= 10 ? 批量阈值 : 默认批量阈值
  const 有效最长等待毫秒 = Number.isFinite(最长等待毫秒) && 最长等待毫秒 >= 10 ? Math.floor(最长等待毫秒) : 默认最长等待毫秒
  const 队列 = []
  const 指纹们 = new Set()
  const 缓冲指纹们 = new Set()
  const 缓冲们 = new Map()
  let 正在提取 = false

  function 尝试自主处理(条, 轮次们, 已有记录, 既有提及 = 0, 来源对话 = '') {
    if (!条 || !['有效', '已归档'].includes(条.生命周期)) return { 处理: false }
    // 上次若在“确认成功、长期写入失败”之间中断，下个批次可幂等续做。
    if (条.生命周期 === '有效' && 条.确认状态 === '已确认' && 条.自主评估 && Number(条.自主评估.分数) >= 自主评估.自动阈值) {
      const 晋升 = 晋升到长期({ 临时库: 临时记忆库, 长期库: 长期记忆库, 编号: 条.编号, 去向: 自主评估.默认去向(条) })
      return { 处理: 晋升.好, 评估: 条.自主评估, 晋升, 续做: true }
    }
    if (条.确认状态 !== '待确认') return { 处理: false }
    const 已存分数 = Number(条.评估账本 && 条.评估账本.当前分数)
    if (条.生命周期 === '有效' && Number.isInteger(已存分数) && 已存分数 >= 自主评估.自动阈值) {
      const 已存评估 = {
        分数: 已存分数,
        重要性: 已存分数 >= 90 ? 3 : 2,
        提及次数: Number(条.评估账本.提及次数) || 1,
        依据: Array.isArray(条.评估账本.评估历史) && 条.评估账本.评估历史.length
          ? 条.评估账本.评估历史.at(-1).依据 || [] : [],
      }
      const 确认 = 临时记忆库.自主确认(条.编号, 已存评估)
      if (!确认.好) return { 处理: false, 评估: 已存评估, 说明: 确认.说明 }
      const 晋升 = 晋升到长期({ 临时库: 临时记忆库, 长期库: 长期记忆库, 编号: 条.编号, 去向: 自主评估.默认去向(条) })
      return { 处理: 晋升.好, 评估: 已存评估, 晋升, 续做: true }
    }
    const 评估 = 自主评估.评估({ 候选: 条, 对话轮次: 轮次们, 已有记录, 既有提及, 来源对话 })
    if (!评估.新增提及次数) return { 处理: false, 评估 }
    const 记账 = 临时记忆库.记录评估(条.编号, 评估)
    if (!记账.好) return { 处理: false, 评估, 说明: 记账.说明 }
    if (!评估.可自主) return { 处理: false, 评估, 复活: 记账.复活 }
    const 确认 = 临时记忆库.自主确认(条.编号, 评估)
    if (!确认.好) return { 处理: false, 评估, 复活: 记账.复活, 说明: 确认.说明 }
    const 晋升 = 晋升到长期({ 临时库: 临时记忆库, 长期库: 长期记忆库, 编号: 条.编号, 去向: 评估.去向 })
    return { 处理: 晋升.好, 评估, 晋升, 复活: 记账.复活 }
  }

  async function 提取批次({ 钥匙, 地址, 模型 = 'deepseek-chat', fetch函数, 用户原话 = '', 她的回复 = '', 对话 = '', 消息时间, 排除内容 = [], 对话轮次 = [], 中止, 检查写入, 通知 } = {}) {
    const 任务 = { 中止, 检查写入 }; 检查任务(任务)
    const 原轮次 = Array.isArray(对话轮次) && 对话轮次.length ? 对话轮次 : [{ 用户原话, 她的回复, 消息时间 }]
    const 轮次们 = 原轮次.slice(0, 有效批量阈值).map((一, 下标) => ({
      轮次: 下标 + 1,
      用户原话: String(一 && 一.用户原话 || '').trim().slice(0, 6000),
      最终回复: String(一 && 一.她的回复 || '').trim().slice(0, 6000),
      消息时间: String(一 && 一.消息时间 || 消息时间 || new Date().toISOString()),
    })).filter((一) => 一.用户原话 && 一.最终回复)
    if (!钥匙 || !地址) return { 好: false, 跳过: true, 说明: '没有模型连接信息' }
    if (!轮次们.length) return { 好: true, 跳过: true, 说明: '缓冲中没有完整对话' }

    try { 临时记忆库.归档到期() } catch { /* 归档失败不妨碍读取，真正读写错误仍会在下面报告 */ }
    const 自主处理 = []
    const 复活编号 = new Set()
    let 已有 = 临时记忆库.查询({ 生命周期: '有效', 限量: 50 }).列表
    const 已归档 = 临时记忆库.查询({ 生命周期: '已归档', 确认状态: '待确认', 限量: 1000 }).列表
    // 先用本轮逐字原话检索归档候选。命中时恢复原编号并续记证据，不创建一条同内容的新记录。
    for (const 旧条 of 已归档) {
      if (!旧条 || (旧条.关系 && 旧条.关系.状态 !== '当前')) continue
      const 处理 = 尝试自主处理(旧条, 轮次们, [...已有, ...已归档.filter((一) => 一.编号 !== 旧条.编号)], 旧条.评估账本 ? 0 : 1, 对话)
      if (处理.复活) 复活编号.add(旧条.编号)
      if (处理.处理) 自主处理.push({ 编号: 旧条.编号, ...处理 })
    }
    if (复活编号.size || 自主处理.length) 已有 = 临时记忆库.查询({ 生命周期: '有效', 限量: 50 }).列表
    const 本轮复活条 = [...复活编号].map((编号) => 临时记忆库.取一条(编号)).filter(Boolean)
    // 即使复活项已在模型请求前晋升，也继续放进本批去重集合，避免模型又创建一条副本。
    const 已有内容 = [...已有, ...本轮复活条].map((一) => 一.内容)
    const 已有摘要 = 已有.filter((一) => 一.确认状态 === '已确认' && (!一.关系 || 一.关系.状态 === '当前'))
      .slice(0, 30).map((一) => ({ 编号: 一.编号, 类别: 一.类别, 记忆类型: 一.记忆类型, 人物: 一.元数据 && 一.元数据.person, 内容: String(一.内容 || '').slice(0, 300) }))
    const 返回 = await 问模型({
      钥匙, 地址, 模型, fetch函数: fetch函数 || 固定fetch || global.fetch, 中止,
      消息们: [
        {
          role: 'system',
          content: 后台提取系统提示,
        },
        {
          role: 'user',
          content: JSON.stringify({
            本批对话: 轮次们,
            // 单轮直调保留旧字段，便于隔离诊断；正式缓冲批次以本批对话为准。
            ...(轮次们.length === 1 ? { 本轮用户原话: 轮次们[0].用户原话, 本轮最终回复: 轮次们[0].最终回复 } : {}),
            已有临时候选_避免重复: 已有摘要,
          }),
        },
      ],
    })
    检查任务(任务)
    const 候选 = 规整候选(返回, { 对话轮次: 轮次们, 已有内容, 已有记录: 已有, 排除内容, 临时记忆库 })
    const 新增 = []
    for (const 一 of 候选) {
      const 新条 = 临时记忆库.新增(一.类别, 一.内容, {
        保留天数: 一.保留天数,
        标签: 一.标签,
        记忆类型: 一.记忆类型,
        元数据: 一.元数据,
        来源对话: 对话,
        来源消息时间: String(一.来源消息时间 || 消息时间 || new Date().toISOString()),
        提取方式: '模型提取',
      })
      if (一.替代编号) {
        const 关系 = 临时记忆库.提议替代(新条.编号, 一.替代编号)
        if (关系.好) 新条.关系 = 关系.条.关系
      }
      新增.push(新条)
      const 处理 = 尝试自主处理({ ...临时记忆库.取一条(新条.编号), 依据原文: 一.依据原文 }, 轮次们, 已有, 0, 对话)
      if (处理.处理) 自主处理.push({ 编号: 新条.编号, ...处理 })
    }

    // 模型可能因“避免重复”不再返回候选；仍要让再次提及推动既有待确认项。
    for (const 旧条 of 已有) {
      if (!旧条 || 旧条.生命周期 !== '有效') continue
      if (旧条.确认状态 !== '待确认' && !(旧条.确认状态 === '已确认' && 旧条.自主评估)) continue
      const 处理 = 尝试自主处理(旧条, 轮次们, 已有.filter((一) => 一.编号 !== 旧条.编号), 旧条.评估账本 ? 0 : 1, 对话)
      if (处理.复活) 复活编号.add(旧条.编号)
      if (处理.处理) 自主处理.push({ 编号: 旧条.编号, ...处理 })
    }
    const 长期变化 = 自主处理.some((一) => 一.晋升 && 一.晋升.好 && !一.晋升.没变化)
    if (typeof 通知 === 'function') 通知({ 长期变化, 临时变化: !!(新增.length || 自主处理.length) })
    if (typeof 通知 !== 'function' && 长期变化 && process.versions.electron) {
      记忆关系整理.排队({ 原因: '临时记忆自主晋升到长期层' })
    }
    if (typeof 通知 !== 'function' && (新增.length || 自主处理.length) && process.versions.electron) {
      记忆聚类就绪.排队({ 原因: '后台临时记忆提取或自主评估' })
    }
    return { 好: true, 批次轮数: 轮次们.length, 候选数: 候选.length, 新增数: 新增.length, 新增,
      复活数: 复活编号.size, 复活编号: [...复活编号], 自主处理数: 自主处理.length, 自主处理 }
  }

  async function 提取一次(选项 = {}) {
    return 提取批次({ ...选项, 对话轮次: [{ 用户原话: 选项.用户原话, 她的回复: 选项.她的回复, 消息时间: 选项.消息时间 }] })
  }

  function 安全日志(文字) {
    try { console.log(文字) } catch { /* stdout 被关闭也不能让 Electron 主进程崩溃 */ }
  }

  function 开始消费() {
    if (正在提取) return
    正在提取 = true
    queueMicrotask(async () => {
      while (队列.length) {
        const 一项 = 队列.shift()
        try {
          const 果 = await 提取批次(一项.选项)
          if (果.新增数 || 果.自主处理数) 安全日志(`  📝 后台临时记忆：新增 ${果.新增数 || 0} 条候选，自主晋升 ${果.自主处理数 || 0} 条`)
        } catch (错误) {
          安全日志('⚠ 后台临时记忆提取失败（不影响聊天）：' + 错误.message)
        } finally {
          指纹们.delete(一项.指纹)
          for (const 缓冲指纹值 of 一项.选项.缓冲指纹列表 || []) 缓冲指纹们.delete(缓冲指纹值)
        }
      }
      正在提取 = false
    })
  }

  function 排队(选项 = {}) {
    const 指纹 = crypto.createHash('sha256').update(JSON.stringify({
      对话: 选项.对话 || '', 用户原话: 选项.用户原话 || '', 她的回复: 选项.她的回复 || '',
      对话轮次: Array.isArray(选项.对话轮次) ? 选项.对话轮次.map((一) => ({
        用户原话: 一 && 一.用户原话 || '', 她的回复: 一 && 一.她的回复 || '', 消息时间: 一 && 一.消息时间 || '',
      })) : [],
    })).digest('hex')
    if (指纹们.has(指纹)) return { 已排队: false, 重复: true }
    if (队列.length >= 最大排队数) return { 已排队: false, 队列已满: true }
    指纹们.add(指纹)
    队列.push({ 指纹, 选项 })
    开始消费()
    return { 已排队: true, 前面还有: Math.max(0, 队列.length - 1) }
  }

  function 缓冲指纹(选项) {
    return crypto.createHash('sha256').update(JSON.stringify({
      对话: 选项.对话 || '', 用户原话: 选项.用户原话 || '', 她的回复: 选项.她的回复 || '',
    })).digest('hex')
  }

  function 合并缓冲(组) {
    const 最后 = 组.轮次们[组.轮次们.length - 1].选项
    return {
      钥匙: 最后.钥匙,
      地址: 最后.地址,
      模型: 最后.模型,
      fetch函数: 最后.fetch函数,
      对话: 最后.对话,
      消息时间: 最后.消息时间,
      排除内容: [...new Set(组.轮次们.flatMap((一) => Array.isArray(一.选项.排除内容) ? 一.选项.排除内容 : []))],
      对话轮次: 组.轮次们.map((一) => ({ 用户原话: 一.选项.用户原话, 她的回复: 一.选项.她的回复, 消息时间: 一.选项.消息时间 })),
      缓冲指纹列表: 组.轮次们.map((一) => 一.指纹),
    }
  }

  function 刷新对话(对话, 原因 = '手动') {
    const 键 = String(对话 || '')
    const 组 = 缓冲们.get(键)
    if (!组 || !组.轮次们.length) return { 已刷新: false, 空: true }
    const 结果 = 排队(合并缓冲(组))
    if (!结果.已排队 && 结果.队列已满) return { 已刷新: false, 队列已满: true }
    if (组.计时器) clearTimeout(组.计时器)
    缓冲们.delete(键)
    // 已排队批次处理完之前仍保留各轮指纹，避免同一轮在窗口期重复进入下一批。
    if (!结果.已排队) for (const 一 of 组.轮次们) 缓冲指纹们.delete(一.指纹)
    return { 已刷新: !!结果.已排队, 原因, 轮数: 组.轮次们.length, ...结果 }
  }

  function 安排超时(键, 组) {
    组.计时器 = setTimeout(() => {
      const 结果 = 刷新对话(键, '等待到时')
      if (结果.队列已满 && 缓冲们.has(键)) 安排超时(键, 缓冲们.get(键))
    }, 有效最长等待毫秒)
    if (typeof 组.计时器.unref === 'function') 组.计时器.unref()
  }

  function 缓冲(选项 = {}) {
    const 对话 = String(选项.对话 || '').trim()
    // 没有稳定对话编号就不和任何其他轮合并，宁可多一次请求也不能串台。
    if (!对话 || 有效批量阈值 === 1) return 排队(选项)
    const 指纹 = 缓冲指纹(选项)
    if (缓冲指纹们.has(指纹) || 指纹们.has(指纹)) return { 已缓冲: false, 重复: true }
    const 总缓冲 = [...缓冲们.values()].reduce((和, 一) => 和 + 一.轮次们.length, 0)
    if (总缓冲 >= 最大缓冲轮数) return { 已缓冲: false, 缓冲已满: true }
    let 组 = 缓冲们.get(对话)
    if (!组) {
      组 = { 轮次们: [], 计时器: null }
      缓冲们.set(对话, 组)
      安排超时(对话, 组)
    }
    缓冲指纹们.add(指纹)
    组.轮次们.push({ 指纹, 选项 })
    if (组.轮次们.length >= 有效批量阈值) {
      const 结果 = 刷新对话(对话, '达到条数')
      return { 已缓冲: true, 达到条数: true, ...结果 }
    }
    return { 已缓冲: true, 当前轮数: 组.轮次们.length, 还差: 有效批量阈值 - 组.轮次们.length }
  }

  function 刷新全部(原因 = '手动') {
    return [...缓冲们.keys()].map((对话) => ({ 对话, ...刷新对话(对话, 原因) }))
  }

  function 状态() {
    return {
      正在提取,
      等待数量: 队列.length,
      缓冲对话数: 缓冲们.size,
      缓冲轮数: [...缓冲们.values()].reduce((和, 一) => 和 + 一.轮次们.length, 0),
      批量阈值: 有效批量阈值,
      最长等待毫秒: 有效最长等待毫秒,
    }
  }

  return { 提取一次, 提取批次, 排队, 缓冲, 刷新对话, 刷新全部, 状态 }
}

const 默认提取器 = 创建提取器()

module.exports = {
  创建提取器, 解析JSON, 规整候选, 规整模型元数据, 归一, 有敏感或内部内容, 后台提取系统提示,
  默认批量阈值, 默认最长等待毫秒,
  ...默认提取器,
}
