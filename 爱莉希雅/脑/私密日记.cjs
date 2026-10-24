/**
 * 私密日记.cjs —— 私密日记生成、评估账本与本机查看库。
 *
 * 临时目录必须显式开启 `允许隔离写入`；正式目录还要同时满足配置开关和
 * `允许正式写入`。评估账本只保存日期、状态和退避时间，不保存正文或来源。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const { 日期间, 规范日记记录 } = require('./记忆日记.cjs')

const 格式版本 = 1
const 评估状态们 = Object.freeze(['已生成', '已存在', '已删除', '无可用同日对话', '没有微妙情绪波动', '失败待重试'])
const 终态们 = new Set(['已生成', '已存在', '已删除', '无可用同日对话', '没有微妙情绪波动'])

function 是对象(值) { return !!值 && typeof 值 === 'object' && !Array.isArray(值) }
function 截(值, 最长) { return String(值 == null ? '' : 值).trim().replace(/\s+/g, ' ').slice(0, 最长) }
function 正文文本(值) { return String(值 == null ? '' : 值).replace(/\r\n?/g, '\n').trim() }
function 补二(数) { return String(数).padStart(2, '0') }
function 本地日期字(日期) { return `${日期.getFullYear()}-${补二(日期.getMonth() + 1)}-${补二(日期.getDate())}` }
function 正常日期(值, 名字 = '日期') {
  const 日期 = 值 instanceof Date ? new Date(值) : new Date(值)
  if (!Number.isFinite(日期.getTime())) throw new Error(名字 + '无效')
  return 日期
}
function 解析本地时间(值) {
  const 文本 = String(值 || '').trim()
  const 匹配 = 文本.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (匹配) return new Date(+匹配[1], +匹配[2] - 1, +匹配[3], +(匹配[4] || 0), +(匹配[5] || 0), +(匹配[6] || 0))
  return new Date(文本)
}
function 在期间(值, 期间) {
  const 日期 = 解析本地时间(值)
  return Number.isFinite(日期.getTime()) && 日期 >= 期间.开始 && 日期 < 期间.结束
}
function 同一路径(a, b) {
  const 左 = path.resolve(a)
  const 右 = path.resolve(b)
  return process.platform === 'win32' ? 左.toLocaleLowerCase() === 右.toLocaleLowerCase() : 左 === 右
}
function 短哈希(文字) { return crypto.createHash('sha256').update(String(文字)).digest('hex').slice(0, 16) }
function 私密根目录(数据目录) { return path.join(path.resolve(数据目录), '日记', '私密') }
function 已删除文件(数据目录) { return path.join(私密根目录(数据目录), '已删除.json') }
function 评估索引文件(数据目录) { return path.join(私密根目录(数据目录), '评估索引.json') }

function 读已删除周期(数据目录) {
  const 文件 = 已删除文件(数据目录)
  try {
    const 原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '').trim()
    if (!原文) throw new Error('文件为空')
    const 值 = JSON.parse(原文)
    if (!是对象(值) || 值.格式版本 !== 格式版本 || !Array.isArray(值.周期)
      || 值.周期.some((一) => !/^\d{4}-\d{2}-\d{2}$/.test(String(一)))) throw new Error('结构无效')
    return new Set(值.周期.map(String))
  } catch (错误) {
    if (错误.code === 'ENOENT') return new Set()
    throw new Error('私密日记删除记录读不动，已停止操作：' + 错误.message)
  }
}

function 原子写JSON(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  const 临时 = 文件 + `.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
    fs.renameSync(临时, 文件)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
}

function 默认评估索引() { return { 格式版本, 任务: [] } }

function 读评估索引(数据目录) {
  const 文件 = 评估索引文件(数据目录)
  try {
    const 原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '').trim()
    if (!原文) throw new Error('文件为空')
    const 值 = JSON.parse(原文)
    if (!是对象(值) || 值.格式版本 !== 格式版本 || !Array.isArray(值.任务)) throw new Error('结构无效')
    const 已见 = new Set()
    const 任务 = 值.任务.map((一) => {
      const 周期 = String(一 && 一.周期 || '')
      const 状态 = String(一 && 一.状态 || '')
      const 尝试次数 = Number(一 && 一.尝试次数 || 0)
      const 更新于 = String(一 && 一.更新于 || '')
      const 下次尝试 = String(一 && 一.下次尝试 || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(周期) || 已见.has(周期) || !评估状态们.includes(状态)
        || !Number.isInteger(尝试次数) || 尝试次数 < 0 || 尝试次数 > 100
        || (更新于 && !Number.isFinite(new Date(更新于).getTime()))
        || (下次尝试 && !Number.isFinite(new Date(下次尝试).getTime()))) throw new Error('任务无效')
      已见.add(周期)
      return { 周期, 状态, 尝试次数, 更新于, 下次尝试 }
    })
    return { 格式版本, 任务 }
  } catch (错误) {
    if (错误.code === 'ENOENT') return 默认评估索引()
    const 包装 = new Error('私密日记评估索引读不动，已停止写入')
    包装.code = 'PRIVATE_DIARY_INDEX_INVALID'
    throw 包装
  }
}

function 写评估状态(数据目录, 周期, 状态, 现在, 附加 = {}) {
  if (!评估状态们.includes(状态)) throw new Error('私密日记评估状态无效')
  const 索引 = 读评估索引(数据目录)
  const 旧 = 索引.任务.find((一) => 一.周期 === 周期)
  const 新值 = {
    周期,
    状态,
    尝试次数: Math.max(0, Math.min(100, Number(附加.尝试次数 ?? (旧 && 旧.尝试次数) ?? 0) || 0)),
    更新于: 正常日期(现在, '评估时间').toISOString(),
    下次尝试: 附加.下次尝试 ? 正常日期(附加.下次尝试, '重试时间').toISOString() : '',
  }
  if (旧) Object.assign(旧, 新值)
  else 索引.任务.push(新值)
  索引.任务.sort((a, b) => a.周期.localeCompare(b.周期))
  原子写JSON(评估索引文件(数据目录), 索引)
  return 新值
}

const 敏感关键词 = /密码|口令|验证码|恢复码|api\s*key|access\s*token|refresh\s*token|token|cookie|私钥|助记词|账号|账户|银行卡|信用卡|身份证|证件号|手机号|电话号码|精确住址|系统提示|开发者消息|工具原文|调试日志/i
const 敏感形状们 = [
  /\b[A-Za-z]:[\\/][^\s<>"|?*]+/,
  /\\\\[^\s\\/]+[\\/][^\s<>"|?*]+/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:^|\D)1[3-9]\d{9}(?:\D|$)/,
  /(?:^|\D)\d{15,19}(?:\D|$)/,
  /\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/i,
]

function 含敏感信息(值) {
  const 文本 = String(值 == null ? '' : 值)
  return 敏感关键词.test(文本) || 敏感形状们.some((规则) => 规则.test(文本))
}

function 脱敏来源文本(值) {
  let 文本 = 正文文本(值).slice(0, 1200)
  if (!文本) return ''
  if (敏感关键词.test(文本)) return '[涉及隐私的具体内容已省略]'
  文本 = 文本
    .replace(/\b[A-Za-z]:[\\/][^\s<>"|?*]+/g, '[本机路径已省略]')
    .replace(/\\\\[^\s\\/]+[\\/][^\s<>"|?*]+/g, '[网络路径已省略]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[账户标识已省略]')
    .replace(/(?:^|\D)1[3-9]\d{9}(?=\D|$)/g, (一) => 一.replace(/\d/g, '*'))
    .replace(/(?:^|\D)\d{15,19}(?=\D|$)/g, (一) => 一.replace(/\d/g, '*'))
    .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/gi, '[凭据已省略]')
  return 截(文本, 800)
}

function 像助手回复(值) {
  const 文本 = 正文文本(值)
  if (!文本) return false
  return /^(好的|当然|没问题|可以呀|可以的|收到|我来|让我来|以下是)/.test(文本)
    || /(建议你|你可以|如果你愿意|还有什么.{0,12}需要|希望以上.{0,12}帮到你|作为(?:一个|一名)?(?:AI|助手)|步骤[：:])/.test(文本)
    || /(?:^|\n)\s*(?:\d+[.)、]|[-*])\s+/.test(文本)
}

function 抠JSON(文字) {
  if (是对象(文字)) return 文字
  const 原 = String(文字 || '').trim()
  try { return JSON.parse(原) } catch { /* 再抠对象 */ }
  const 匹配 = 原.match(/\{[\s\S]*\}/)
  if (!匹配) throw new Error('私密日记模型没有返回 JSON 对象')
  return JSON.parse(匹配[0])
}

function 私密日记编号(周期) {
  const 安全周期 = String(周期 || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(安全周期)) throw new Error('私密日记周期无效')
  return `私密日:${安全周期}`
}

function 规整私密来源(原, 期间) {
  if (!期间 || !(期间.开始 instanceof Date) || !(期间.结束 instanceof Date)) throw new Error('私密日记期间无效')
  const 见过 = new Set()
  return (Array.isArray(原) ? 原 : []).map((一) => {
    const 原标题 = 一 && 一.标题
    const 原摘要 = 一 && 一.摘要
    const 敏感 = 含敏感信息(`${原标题 || ''}\n${原摘要 || ''}`)
    return {
      编号: 截(一 && 一.编号, 160),
      类型: 截(一 && 一.类型, 40),
      时间: 截(一 && 一.时间, 40),
      标题: 敏感 ? '' : 脱敏来源文本(原标题).slice(0, 160),
      摘要: 敏感 ? '' : 脱敏来源文本(原摘要),
    }
  }).filter((一) => 一.编号 && 一.类型 === '聊天' && 一.摘要 && 在期间(一.时间, 期间) && !见过.has(一.编号) && 见过.add(一.编号)).slice(0, 120)
}

function 校验私密生成结果(原始, 来源们) {
  const 值 = 抠JSON(原始)
  if (值.触发 === false) return null
  if (值.触发 !== true) throw new Error('私密日记触发值必须是布尔值')

  const 原标题 = String(值.标题 == null ? '' : 值.标题).trim()
  const 原正文 = 正文文本(值.正文)
  const 原情绪 = 正文文本(值.微妙情绪)
  if (!原正文) throw new Error('私密日记正文为空')
  if (原正文.length > 600) throw new Error('私密日记正文过长')
  if (原标题.length > 80) throw new Error('私密日记标题过长')
  if (!原情绪 || 原情绪.length > 120 || !原正文.includes(原情绪)) throw new Error('私密日记正文没有可核对的微妙情绪表达')

  const 可用编号 = new Set((Array.isArray(来源们) ? 来源们 : []).map((一) => String(一 && 一.编号 || '')).filter(Boolean))
  const 来源 = [...new Set((Array.isArray(值.来源) ? 值.来源 : []).map((一) => 截(一, 160)).filter(Boolean))]
  if (!来源.length || 来源.some((编号) => !可用编号.has(编号))) throw new Error('私密日记引用了不存在或跨日期的来源')

  const 标题 = 原标题 || '没有说出口的话'
  if (含敏感信息(`${标题}\n${原正文}\n${原情绪}`)) throw new Error('私密日记包含禁止保存的敏感信息')
  if (像助手回复(原正文)) throw new Error('私密日记不能写成助手回复')
  return { 标题, 正文: 原正文, 微妙情绪: 原情绪, 来源: 来源.slice(0, 30) }
}

async function 生成私密日记({ 期间, 来源们, 钥匙, 地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions', 模型 = process.env.ELYSIA_MEMORY_MODEL || process.env.ELYSIA_LLM_MODEL || 'deepseek-chat', fetch函数 = global.fetch, 超时 = 60000 }) {
  if (!钥匙) throw new Error('没有模型 API Key')
  if (typeof fetch函数 !== 'function') throw new Error('没有可用的网络请求函数')
  const 控制器 = new AbortController()
  const 闹钟 = setTimeout(() => 控制器.abort(), 超时)
  try {
    const 回应 = await fetch函数(地址, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify({
        model: 模型, stream: false, temperature: 0.35, max_tokens: 800,
        messages: [
          { role: 'system', content: '你是爱莉希雅的私密日记判断器。只有当天真实对话引起了难以直接说出口的细微情绪时才触发；普通开心、担心、感动和日常陪伴不触发。没有就必须返回触发 false，绝不为了连续性硬写。触发时正文要精简自然，既写真实片段也写含蓄情绪，不得写成助手回复或建议，不得猜测用户心理，不得包含密码、账号、凭据、证件、地址、工具或系统原文及第三方隐私。只输出 JSON：{"触发":false}，或 {"触发":true,"标题":"简短标题","微妙情绪":"正文中原样出现的一小段情绪表达","正文":"一段自然日记","来源":["真实来源编号"]}。' },
          { role: 'user', content: `日期：${期间.周期}\n来源（已做本地脱敏）：\n${JSON.stringify(来源们)}` },
        ],
      }),
      signal: 控制器.signal,
    })
    if (!回应.ok) throw new Error('私密日记模型请求失败：HTTP ' + 回应.status)
    const 包 = await 回应.json()
    return 包 && 包.choices && 包.choices[0] && 包.choices[0].message && 包.choices[0].message.content
  } finally { clearTimeout(闹钟) }
}

function 创建私密日记生成器(选项 = {}) {
  const 数据目录 = path.resolve(选项.数据目录 || 配置.数据目录)
  const 允许隔离写入 = 选项.允许隔离写入 === true
  const 请求正式写入 = 选项.允许正式写入 === true
  const 是正式目录 = 同一路径(数据目录, 配置.数据目录)
  if (允许隔离写入 && 是正式目录) throw new Error('正式私密日记自动生成尚未启用，隔离许可不能用于正式目录')
  if (请求正式写入 && !是正式目录) throw new Error('正式写入许可只能用于配置的数据目录')
  if (请求正式写入 && 配置.私密日记自动生成 !== true) throw new Error('正式私密日记自动生成尚未启用，生产开关关闭')
  const 允许写入 = 是正式目录 ? 请求正式写入 : 允许隔离写入
  const 取现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date()
  const 取来源 = typeof 选项.取来源 === 'function' ? 选项.取来源 : async () => []
  const 生成 = typeof 选项.生成 === 'function' ? 选项.生成 : 生成私密日记
  const 运行中 = new Map()

  function 日记路径(周期) {
    const 编号 = 私密日记编号(周期)
    return { 编号, 文件: path.join(数据目录, '日记', '私密', 周期.slice(0, 4), `${周期}.json`) }
  }

  function 读取已有(文件, 编号) {
    const 原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')
    const 值 = 规范日记记录(JSON.parse(原文))
    if (值.可见性 !== 'private' || String(值.编号 || '') !== 编号) throw new Error('已有私密日记文件结构无效，已拒绝覆盖')
    return 值
  }

  function 不覆盖写(文件, 数据) {
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 临时 = 文件 + `.tmp-${process.pid}-${Date.now()}`
    try {
      fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
      fs.copyFileSync(临时, 文件, fs.constants.COPYFILE_EXCL)
    } finally {
      try { fs.rmSync(临时, { force: true }) } catch { /* 保留主要结果 */ }
    }
  }

  async function 实际整理({ 日期, 连接 = {}, 期间: 已算期间 } = {}) {
    if (!允许写入) return { 好: true, 写入: false, 状态: '正式写入未启用' }
    const 期间 = 已算期间 || 日期间(正常日期(日期))
    const 现在 = 正常日期(取现在(), '当前时间')
    if (期间.结束 > 现在) throw new Error('只能整理已经结束的本地自然日')
    const { 编号, 文件 } = 日记路径(期间.周期)
    if (读已删除周期(数据目录).has(期间.周期)) {
      写评估状态(数据目录, 期间.周期, '已删除', 现在)
      return { 好: true, 写入: false, 状态: '已删除', 编号 }
    }

    const 索引 = 读评估索引(数据目录)
    const 旧任务 = 索引.任务.find((一) => 一.周期 === 期间.周期)
    if (旧任务 && 终态们.has(旧任务.状态)) {
      if (旧任务.状态 === '已生成' || 旧任务.状态 === '已存在') {
        if (!fs.existsSync(文件)) throw new Error('私密日记评估终态与文件不一致')
        读取已有(文件, 编号)
      }
      return { 好: true, 写入: false, 状态: 旧任务.状态, 编号 }
    }
    if (旧任务 && 旧任务.状态 === '失败待重试' && 旧任务.下次尝试 && new Date(旧任务.下次尝试) > 现在) {
      return { 好: true, 写入: false, 状态: '等待重试', 编号, 下次尝试: 旧任务.下次尝试 }
    }
    if (fs.existsSync(文件)) {
      读取已有(文件, 编号)
      写评估状态(数据目录, 期间.周期, '已存在', 现在)
      return { 好: true, 写入: false, 状态: '已存在', 编号 }
    }

    const 来源们 = 规整私密来源(await 取来源(期间), 期间)
    if (!来源们.length) {
      写评估状态(数据目录, 期间.周期, '无可用同日对话', 现在)
      return { 好: true, 写入: false, 状态: '无可用同日对话', 编号 }
    }
    const 原始结果 = await 生成({ 期间: { ...期间, 类型: '私密日' }, 来源们, ...连接 })
    const 内容 = 校验私密生成结果(原始结果, 来源们)
    if (!内容) {
      写评估状态(数据目录, 期间.周期, '没有微妙情绪波动', 现在)
      return { 好: true, 写入: false, 状态: '没有微妙情绪波动', 编号 }
    }

    const 来源表 = new Map(来源们.map((一) => [一.编号, 一]))
    const 生成于 = 现在.toISOString()
    const 记录 = 规范日记记录({
      格式版本,
      编号,
      类型: '日',
      周期: 期间.周期,
      开始: 期间.开始.toISOString(),
      结束: 期间.结束.toISOString(),
      标题: 内容.标题,
      可见性: 'private',
      模块: [{ 名字: '陪伴片段', 正文: 内容.正文, 来源: 内容.来源 }],
      来源: 内容.来源.map((编号) => 来源表.get(编号)).filter(Boolean),
      生成于,
      修改于: '',
      用户修改: false,
    })
    try {
      不覆盖写(文件, 记录)
    } catch (错误) {
      if (错误.code !== 'EEXIST') throw 错误
      读取已有(文件, 编号)
      写评估状态(数据目录, 期间.周期, '已存在', 现在)
      return { 好: true, 写入: false, 状态: '已存在', 编号 }
    }
    写评估状态(数据目录, 期间.周期, '已生成', 现在)
    return { 好: true, 写入: true, 状态: '已生成', 编号 }
  }

  function 整理一天(参数 = {}) {
    if (!允许写入) return Promise.resolve({ 好: true, 写入: false, 状态: '正式写入未启用' })
    let 期间
    try { 期间 = 日期间(正常日期(参数.日期)) } catch (错误) { return Promise.reject(错误) }
    const 键 = 期间.周期
    if (运行中.has(键)) return 运行中.get(键)
    const 承诺 = (async () => {
      try {
        return await 实际整理({ ...参数, 期间 })
      } catch (错误) {
        if (错误.code === 'PRIVATE_DIARY_INDEX_INVALID') throw 错误
        const 现在 = 正常日期(取现在(), '当前时间')
        const 索引 = 读评估索引(数据目录)
        const 旧 = 索引.任务.find((一) => 一.周期 === 键)
        const 尝试次数 = Math.min(100, Number(旧 && 旧.尝试次数 || 0) + 1)
        const 等待分钟 = Math.min(360, 5 * (2 ** Math.min(6, 尝试次数 - 1)))
        写评估状态(数据目录, 键, '失败待重试', 现在, {
          尝试次数,
          下次尝试: new Date(现在.getTime() + 等待分钟 * 60 * 1000),
        })
        throw 错误
      }
    })().finally(() => { if (运行中.get(键) === 承诺) 运行中.delete(键) })
    运行中.set(键, 承诺)
    return 承诺
  }

  return {
    数据目录,
    允许隔离写入,
    允许正式写入: 是正式目录 && 请求正式写入,
    整理一天,
    日记路径: (周期) => 日记路径(周期).文件,
    评估索引路径: 评估索引文件(数据目录),
    状态: () => ({ 运行中: [...运行中.keys()] }),
  }
}

/**
 * M-33 的本机显式查看库。它不负责生成，也没有导出或修改接口；返回值只含
 * 渲染所需白名单字段，避免把路径或内部元数据送进页面。
 */
function 创建私密日记库(选项 = {}) {
  const 数据目录 = path.resolve(选项.数据目录 || 配置.数据目录)
  const 根目录 = 私密根目录(数据目录)

  function 读一篇(文件, 周期) {
    const 原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')
    const 值 = 规范日记记录(JSON.parse(原文))
    const 编号 = 私密日记编号(周期)
    if (值.可见性 !== 'private' || String(值.编号 || '') !== 编号 || String(值.周期 || '') !== 周期 || 值.类型 !== '日') {
      throw new Error('私密日记文件结构无效')
    }
    const 来源 = (Array.isArray(值.来源) ? 值.来源 : []).slice(0, 120).map((一) => ({
      编号: 截(一 && 一.编号, 160), 类型: 截(一 && 一.类型, 40), 时间: 截(一 && 一.时间, 40),
      标题: 截(一 && 一.标题, 160), 摘要: 正文文本(一 && 一.摘要).slice(0, 1200),
    })).filter((一) => 一.编号 && 一.类型)
    const 来源编号 = new Set(来源.map((一) => 一.编号))
    const 模块 = (Array.isArray(值.模块) ? 值.模块 : []).slice(0, 5).map((一) => ({
      名字: 截(一 && 一.名字, 20), 正文: 正文文本(一 && 一.正文).slice(0, 4000),
      来源: [...new Set((Array.isArray(一 && 一.来源) ? 一.来源 : []).slice(0, 30).map((二) => 截(二, 160)).filter((二) => 来源编号.has(二)))],
    })).filter((一) => 一.名字 && 一.正文 && 一.来源.length)
    if (!模块.length) throw new Error('私密日记没有可核对的正文')
    return {
      编号, 类型: '日', 周期, 标题: 截(值.标题, 120) || '没有说出口的话',
      开始: 截(值.开始, 40), 结束: 截(值.结束, 40), 模块, 来源,
      生成于: 截(值.生成于, 40), 版本标记: 短哈希(原文),
    }
  }

  function 给本机界面({ 搜索 = '', 最多 = 200 } = {}) {
    const 关键词 = 截(搜索, 80).toLocaleLowerCase()
    const 限量 = Math.max(1, Math.min(200, Number(最多) || 200))
    const 列表 = []
    let 跳过 = 0
    let 年目录们 = []
    try { 年目录们 = fs.readdirSync(根目录, { withFileTypes: true }) } catch (错误) {
      if (错误.code === 'ENOENT') return { 列表: [], 总数: 0, 截断: false, 跳过: 0 }
      throw 错误
    }
    for (const 年项 of 年目录们) {
      if (!年项.isDirectory() || !/^\d{4}$/.test(年项.name)) continue
      const 年目录 = path.join(根目录, 年项.name)
      let 文件们
      try { 文件们 = fs.readdirSync(年目录, { withFileTypes: true }) } catch { 跳过++; continue }
      for (const 文件项 of 文件们) {
        const 匹配 = 文件项.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
        if (!文件项.isFile() || !匹配 || !文件项.name.startsWith(年项.name + '-')) continue
        try {
          const 一 = 读一篇(path.join(年目录, 文件项.name), 匹配[1])
          const 搜索文本 = [一.标题, 一.周期, ...一.模块.map((二) => 二.正文), ...一.来源.map((二) => `${二.标题} ${二.摘要}`)].join('\n').toLocaleLowerCase()
          if (!关键词 || 搜索文本.includes(关键词)) 列表.push(一)
        } catch { 跳过++ }
      }
    }
    列表.sort((a, b) => String(b.周期).localeCompare(String(a.周期)))
    return { 列表: 列表.slice(0, 限量), 总数: 列表.length, 截断: 列表.length > 限量, 跳过 }
  }

  function 删除日记({ 编号, 版本标记 = '' } = {}) {
    const 安全编号 = 截(编号, 160)
    const 匹配 = 安全编号.match(/^私密日:(\d{4}-\d{2}-\d{2})$/)
    if (!匹配) throw new Error('私密日记编号无效')
    const 周期 = 匹配[1]
    const 文件 = path.join(根目录, 周期.slice(0, 4), `${周期}.json`)
    const 当前 = 读一篇(文件, 周期)
    if (版本标记 && String(版本标记) !== 当前.版本标记) throw new Error('这篇私密日记刚刚发生过变化，请刷新后再试')
    const 已删除 = 读已删除周期(数据目录)
    const 临时删除文件 = 文件 + `.delete-${process.pid}-${Date.now()}`
    fs.renameSync(文件, 临时删除文件)
    try {
      已删除.add(周期)
      原子写JSON(已删除文件(数据目录), { 格式版本, 周期: [...已删除].sort() })
      try { fs.rmSync(临时删除文件, { force: true }) } catch { /* 墓碑已落盘，残留不影响语义 */ }
      return { 好: true, 编号: 安全编号 }
    } catch (错误) {
      try { if (fs.existsSync(临时删除文件)) fs.renameSync(临时删除文件, 文件) } catch { /* 保留原错误 */ }
      throw 错误
    }
  }

  return { 数据目录, 根目录, 给本机界面, 删除日记 }
}

module.exports = {
  创建私密日记生成器,
  创建私密日记库,
  生成私密日记,
  校验私密生成结果,
  规整私密来源,
  私密日记编号,
  含敏感信息,
  像助手回复,
  读评估索引,
}
