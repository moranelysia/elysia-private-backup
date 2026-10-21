/**
 * 联网搜索.cjs —— DeepSeek 原生联网搜索（Search API）的窄适配器。
 *
 * 【2026-10-17 换的供应商】
 *   原来是 SerpAPI Google Search，需要单独一把 Key、单独一次付费。
 *   DeepSeek 当天上线了官方的 Search / Fetch 接口：
 *
 *     POST https://api.deepseek.com/v1/tools/search
 *     Authorization: Bearer <DeepSeek API Key>
 *     { "query": "...", "count": 6, "need_content": false }
 *
 *   它**用的是同一把 DeepSeek Key**，所以用户只需要配一次钥匙，
 *   不再有"聊天能跑但搜索没钱"这种半瘫状态。SerpAPI 那条路保留在
 *   `供应商: 'serpapi'` 后面，需要回退时显式指定即可。
 *
 * 【它仍然只做三件事】
 *   1. 把公开检索词裁成一个短查询，拦住明显的密钥、路径和多行正文；
 *   2. 调用搜索接口，只取普通网页结果；
 *   3. 把供应商返回裁成统一的标题、链接、摘要、日期和来源证据。
 *
 * 它不会收到聊天历史、记忆或附件。模型只能把 [查:...] 里的参数交给这里。
 *
 * 【DeepSeek 接口的硬限制（照官方文档抄的，别凭记忆改）】
 *   query          1～128 个 Unicode 字符，不能全为空白
 *   count          1～50，默认 10
 *   ori_question   可选，1～128，触发搜索的用户原始问题
 *   localization   可选，用于优选本地化结果的 IP
 *   need_content   默认 false；为 false 时 content 恒为空字符串
 *   返回 results[] 每项：rerank_score(≤3，≥1.5 为优质)、title、url、snippet(100～200)、
 *                        summary(600～800，给模型读)、content、site_name、site_icon、
 *                        date(RFC3339 UTC 或 null)、authority(-1～4，≥3 极权威)
 */
'use strict'

const 搜索来源 = require('./搜索来源.cjs')
const 配置 = require('./配置.cjs')
const { 拿钥匙 } = require('./钥匙.cjs')

const 默认地址 = 'https://api.deepseek.com/v1/tools/search'
const SerpAPI地址 = 'https://serpapi.com/search.json'
const 最长查询 = 128
const 最多结果 = 6
const 摘要上限 = 700

/**
 * 洗查询。DeepSeek 的 query 硬上限 128 字，超过就截短（不再直接拒绝）——
 * 拒绝会让模型莫名其妙地失败，而截短至少还能查出东西来。
 * @returns {{好:boolean, 查询?:string, 被截短?:boolean, 说明?:string, 错误类别?:string}}
 */
function 整理查询(原文) {
  const 原 = String(原文 || '').trim()
  if (!原) return { 好: false, 说明: '没给要查的东西', 错误类别: '参数错误' }
  if (/\r|\n/.test(原)) return { 好: false, 说明: '联网查询只能是一行公开关键词，不能发送整段正文。', 错误类别: '隐私拦截' }
  const 压过 = 原.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  const 像路径 = /(?:^|\s)(?:[a-zA-Z]:[\\/]|\\\\|\/{2}|~[\\/])/.test(压过)
  const 像密钥 = /(?:sk|tvly)-[a-zA-Z0-9_-]{8,}|(?:api[_ -]?key|authorization|bearer|密码|口令)\s*[:=：]\s*\S+/i.test(压过)
  if (像路径 || 像密钥) return {
    好: false,
    说明: '查询里像是包含本机路径或凭据，已阻止发送。请只保留要公开搜索的关键词。',
    错误类别: '隐私拦截',
  }
  const 被截短 = 压过.length > 最长查询
  return { 好: true, 查询: 被截短 ? 压过.slice(0, 最长查询) : 压过, 被截短 }
}

function 截短(值, 上限) {
  const 文本 = String(值 == null ? '' : 值).replace(/\s+/g, ' ').trim()
  return 文本.length <= 上限 ? 文本 : 文本.slice(0, 上限 - 1) + '…'
}

function 合并信号(中止, 毫秒) {
  const 超时 = AbortSignal.timeout(毫秒)
  return 中止 ? AbortSignal.any([中止, 超时]) : 超时
}

function 读错误正文(数据) {
  if (!数据 || typeof 数据 !== 'object') return ''
  const 候选 = 数据.error || 数据.message || (数据.error && 数据.error.message) || ''
  if (typeof 候选 === 'string') return 截短(候选, 220)
  if (候选 && typeof 候选 === 'object') return 截短(候选.message || JSON.stringify(候选), 220)
  return ''
}

/** 把结果裁成内部统一形状。同时认得 DeepSeek 的 results[] 与 SerpAPI 的 organic_results[]。 */
function 整理结果(数据) {
  const 源 = Array.isArray(数据 && 数据.results) && 数据.results.length
    ? 数据.results
    : ((数据 && 数据.organic_results) || []).map((一) => ({
      title: 一 && 一.title,
      url: 一 && (一.url || 一.link),
      snippet: 一 && (一.snippet || 一.content),
      date: 一 && (一.date || 一.published_date),
    }))
  const 原结果 = Array.isArray(源) ? 源 : []
  const 结果 = []
  const 看过 = new Set()
  for (const 原 of 原结果) {
    let 链接
    try {
      const 地址 = new URL(String(原 && 原.url || ''))
      if (!['http:', 'https:'].includes(地址.protocol)) continue
      链接 = 地址.href
    } catch { continue }
    if (看过.has(链接)) continue
    const 标题 = 截短(原 && 原.title, 180)
    // summary 是给你（模型）读的长摘要，snippet 是短摘要；优先长的那条
    const 长摘要 = String((原 && 原.summary) || '').trim()
    const 短摘要 = String((原 && 原.snippet) || '').trim()
    const 摘要 = 截短(长摘要 || 短摘要, 摘要上限)
    if (!标题 && !摘要) continue
    看过.add(链接)
    const 打分 = Number(原 && 原.rerank_score)
    const 条 = {
      标题: 标题 || new URL(链接).hostname,
      链接,
      摘要,
      发布日期: 截短(原 && 原.date, 80),
      相关度: Number.isFinite(打分) ? 打分 : null,
      站点: 截短(原 && 原.site_name, 60),
      权威: Number.isFinite(Number(原 && 原.authority)) ? Number(原.authority) : null,
    }
    结果.push({ ...条, ...搜索来源.检查单条(条) })
    if (结果.length >= 最多结果) break
  }
  return 结果
}

/**
 * 把限定域名并进查询。DeepSeek 支持 `site:` 和 `-site:`，但**没有承诺 `OR`**，
 * 所以只在放得下的情况下用 OR 串起来，放不下就退化成第一个域名。
 */
function 加限定域名(查询, 原域名) {
  const 域名 = Array.isArray(原域名)
    ? [...new Set(原域名.map((一) => String(一 || '').trim().toLowerCase()).filter((一) => /^[a-z0-9.-]+$/.test(一)))].slice(0, 12)
    : []
  if (!域名.length) return 查询
  const 全 = `${查询} (${域名.map((一) => `site:${一}`).join(' OR ')})`
  if (全.length <= 最长查询) return 全
  const 单 = `${查询} site:${域名[0]}`
  return 单.length <= 最长查询 ? 单 : 查询
}

/**
 * 用哪个供应商。优先级：调用参数 > elysia.config.json / 环境变量 > 默认 deepseek。
 * 认不出的值一律回落 deepseek（宁可多花钱查得动，也不要因为写错一个词就完全搜不了）。
 * 以后加新后端：在 配置.cjs 的 搜索供应商 里加值，在这里补一个分支。
 */
function 判定供应商(选项) {
  const 显式 = String((选项 && 选项.供应商) || '').trim().toLowerCase()
  const 配置值 = String(配置.搜索供应商 || '').trim().toLowerCase()
  const 值 = 显式 || 配置值
  return 值 === 'serpapi' ? 'serpapi' : 'deepseek'
}

function 取钥匙(选项, 供应商) {
  // 显式传了『钥匙』就以它为准（空串 = 明确表示没有），这样离线夹具不会被
  // 本机真实钥匙干扰；没传（或传了 undefined，调用方常这样）才去环境变量和 钥匙.cjs 里找。
  const 显式给了 = Object.prototype.hasOwnProperty.call(选项, '钥匙')
    && 选项.钥匙 !== undefined && 选项.钥匙 !== null
  if (显式给了) return String(选项.钥匙).trim()

  if (供应商 === 'serpapi') {
    return String(process.env.ELYSIA_SERPAPI_API_KEY || '').trim()
  }

  const 环境 = String(process.env.ELYSIA_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim()
  if (环境) return 环境
  try {
    const 找到 = 拿钥匙()
    if (找到 && 找到.钥匙) return String(找到.钥匙).trim()
  } catch { /* 钥匙模块读不到就算了，下面按缺凭据处理 */ }
  return ''
}

function 错误映射(状态, 细节) {
  const 说明 = {
    400: 'DeepSeek 搜索拒绝了查询参数。',
    401: 'DeepSeek Key 无效或已经失效。',
    402: 'DeepSeek 账户余额不足，搜索和聊天都不能用了。',
    403: '这个 DeepSeek 账号无权使用搜索接口。',
    422: 'DeepSeek 搜索不接受这组参数（查询可能为空或超长）。',
    429: 'DeepSeek 搜索请求过快（限流 5 QPS），或额度已经用完。',
    500: 'DeepSeek 搜索服务暂时异常。',
    503: 'DeepSeek 搜索服务暂时不可用。',
  }
  return (说明[状态] || `DeepSeek 搜索返回 HTTP ${状态}。`) + (细节 ? ' ' + 细节 : '')
}

/**
 * @param {string} 原查询
 * @param {{钥匙?:string, fetch函数?:Function, 中止?:AbortSignal, 限定域名?:string[],
 *          最多?:number, 地址?:string, 供应商?:'deepseek'|'serpapi', 原始问题?:string,
 *          要正文?:boolean, 超时毫秒?:number}} 选项
 */
async function 搜索(原查询, 选项 = {}) {
  const 洗过 = 整理查询(原查询)
  if (!洗过.好) return { 好: false, 说明: 洗过.说明, 错误类别: 洗过.错误类别, 可重试: false }

  const 供应商 = 判定供应商(选项)
  const 钥匙 = 取钥匙(选项, 供应商)
  if (!钥匙) return {
    好: false,
    说明: 供应商 === 'serpapi'
      ? '当前搜索供应商是 SerpAPI，但还没有配置 SerpAPI Key。请打开设置，在「联网搜索 · SerpAPI」里填写；或把 searchProvider 改回 deepseek，用同一把 DeepSeek 钥匙。'
      : '还没有配置 DeepSeek API Key。联网搜索和聊天用的是同一把钥匙，请先在设置里填写。',
    错误类别: '缺少凭据',
    可重试: false,
  }
  const 最多 = Math.max(1, Math.min(最多结果, Number(选项.最多) || 最多结果))
  const 查询 = 加限定域名(洗过.查询, 选项.限定域名)
  const 超时毫秒 = Math.max(3000, Math.min(30000, Number(选项.超时毫秒) || 15000))

  let 地址
  let 请求体
  const 头 = { Accept: 'application/json' }

  if (供应商 === 'serpapi') {
    const 参数 = new URLSearchParams({
      engine: 'google', q: 查询, api_key: 钥匙, output: 'json',
      hl: 'zh-cn', gl: 'cn', safe: 'active', num: String(最多),
    })
    地址 = `${选项.地址 || SerpAPI地址}?${参数}`
    请求体 = null
  } else {
    地址 = 选项.地址 || 默认地址
    头['Content-Type'] = 'application/json'
    const 正文 = { query: 查询, count: 最多 }
    if (选项.要正文 === true) 正文.need_content = true
    const 原问 = 截短(选项.原始问题, 最长查询)
    if (原问) 正文.ori_question = 原问
    请求体 = JSON.stringify(正文)
  }

  let 回应
  try {
    const fetch函数 = 选项.fetch函数 || global.fetch
    回应 = await fetch函数(地址, {
      method: 请求体 ? 'POST' : 'GET',
      headers: 请求体 ? { ...头, Authorization: `Bearer ${钥匙}` } : 头,
      body: 请求体 || undefined,
      signal: 合并信号(选项.中止, 超时毫秒),
    })
  } catch (错误) {
    const 用户取消 = !!(选项.中止 && 选项.中止.aborted)
    const 超时 = !用户取消 && (错误 && (错误.name === 'TimeoutError' || /timed?\s*out/i.test(String(错误.message || ''))))
    return {
      好: false,
      说明: 用户取消 ? '联网搜索已取消。'
        : 超时 ? `联网搜索超过 ${Math.round(超时毫秒 / 1000)} 秒，已停止。`
        : '连不上 DeepSeek 搜索服务，网络可能断了。',
      执行状态: 用户取消 ? '取消' : 超时 ? '超时' : '失败',
      错误类别: 用户取消 ? '用户取消' : 超时 ? '超时' : '网络错误',
      可重试: !用户取消,
    }
  }

  let 数据 = null
  try { 数据 = await 回应.json() } catch { /* 非 JSON 错误页在下面按状态处理 */ }
  const 服务状态 = String(供应商 === 'serpapi' ? (数据 && 数据.search_metadata && 数据.search_metadata.status) || '' : '')
  if (!回应.ok || 服务状态 === 'Error') {
    const 细节 = 读错误正文(数据)
    return {
      好: false,
      说明: 供应商 === 'serpapi'
        ? `SerpAPI 搜索返回 HTTP ${回应.status}。` + (细节 ? ' ' + 细节 : '')
        : 错误映射(回应.status, 细节),
      错误类别: [401, 402, 403].includes(回应.status) ? '凭据错误' : 回应.status === 429 ? '额度或限流' : '服务错误',
      可重试: [429, 500, 502, 503, 504].includes(回应.status),
      HTTP状态: 回应.status,
    }
  }

  // 两种形状都由 整理结果 统一处理（DeepSeek 的 results[] / SerpAPI 的 organic_results[]）
  const 结果 = 整理结果(数据)
  if (!结果.length) return {
    好: false,
    说明: `${供应商 === 'serpapi' ? 'SerpAPI' : 'DeepSeek 搜索'}返回成功，但没有可用的普通网页来源。`,
    错误类别: '无结果',
    可重试: true,
  }

  const 来源审查 = 搜索来源.评估材料(结果).审查
  return {
    好: true,
    查询,
    供应商,
    服务: 供应商 === 'serpapi' ? 'SerpAPI Google Search' : 'DeepSeek 联网搜索',
    结果,
    来源审查,
    条数: 结果.length,
    来源: 结果.map((一) => 一.链接),
    请求编号: '',
    查询被截短: !!洗过.被截短,
    验证状态: '部分验证',
    目标完成: '未知',
    证据: 结果.map((一) => ({
      类型: 一.来源类型,
      目标: 一.标题,
      说明: `${一.摘要}${一.摘要 ? '；' : ''}${一.证据范围}；${一.日期状态}`,
      来源: 一.链接,
      时间: 一.发布日期,
    })),
  }
}

module.exports = {
  搜索, 整理查询, 整理结果, 加限定域名,
  默认地址, SerpAPI地址, 最长查询, 最多结果,
}
