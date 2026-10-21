/**
 * 搜索冲突.cjs —— 从不同来源的搜索标题/摘要中找保守的结构化冲突。
 *
 * 只检查查询明确关心的版本、价格和事件日期。搜索结果的“发布日期”是网页元数据，
 * 不能拿来当事件日期比较。单个来源若同时列出多个候选值，也不会被程序擅自解释。
 */
'use strict'

const { 来源归属, 取域名 } = require('./搜索来源.cjs')

function 文本(条) {
  return `${String(条 && 条.标题 || '')} ${String(条 && 条.摘要 || '')}`.replace(/\s+/g, ' ').trim()
}

function 去重(值们) {
  return [...new Set(值们.map((一) => String(一 || '').trim()).filter(Boolean))]
}

function 版本值(原文) {
  const 文 = String(原文 || '')
  const 值们 = []
  const 规则们 = [
    /\bnode(?:\.js)?\s+v?(\d{1,3}(?:\.\d+){0,2})\b/gi,
    /\bv(\d{1,3}(?:\.\d+){0,2})\b/g,
    /(?:version|版本|release)\s*[:：]?\s*v?(\d{1,3}(?:\.\d+){0,2})\b/gi,
    /\b(\d{1,3}(?:\.\d+){0,2})\s*(?:LTS|版本|版)\b/gi,
  ]
  for (const 规则 of 规则们) {
    for (const 命中 of 文.matchAll(规则)) 值们.push(命中[1])
  }
  return 去重(值们)
}

function 价格值(原文) {
  const 文 = String(原文 || '')
  const 值们 = []
  const 规则们 = [
    { 币种: 'CNY', 规则: /(?:¥|￥|RMB\s*|CNY\s*)(\d[\d,]*(?:\.\d+)?)/gi },
    { 币种: 'CNY', 规则: /(\d[\d,]*(?:\.\d+)?)\s*(?:元|人民币)/g },
    { 币种: 'USD', 规则: /(?:US\$|USD\s*|\$)(\d[\d,]*(?:\.\d+)?)/gi },
    { 币种: 'EUR', 规则: /(?:€|EUR\s*)(\d[\d,]*(?:\.\d+)?)/gi },
  ]
  for (const { 币种, 规则 } of 规则们) {
    for (const 命中 of 文.matchAll(规则)) 值们.push(`${币种} ${命中[1].replace(/,/g, '')}`)
  }
  return 去重(值们)
}

function 日期值(原文) {
  const 文 = String(原文 || '')
  const 值们 = []
  const 规则 = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(20\d{2})年(\d{1,2})月(\d{1,2})日/g
  for (const 命中 of 文.matchAll(规则)) {
    const 年 = 命中[1] || 命中[4]
    const 月 = 命中[2] || 命中[5]
    const 日 = 命中[3] || 命中[6]
    值们.push(`${年}-${String(月).padStart(2, '0')}-${String(日).padStart(2, '0')}`)
  }
  return 去重(值们)
}

function 查询类型(查询) {
  const 词 = String(查询 || '')
  const 类型 = []
  if (/版本|最新版|稳定版|LTS|release|version/i.test(词)) 类型.push({ 类型: '版本', 取值: 版本值 })
  if (/价格|报价|售价|多少钱|价位|股价|汇率|price|cost/i.test(词)) 类型.push({ 类型: '价格', 取值: 价格值 })
  if (/日期|时间|截止|发布|生效|任期|开售|发售|考试|报名|date|deadline|effective/i.test(词)) 类型.push({ 类型: '事件日期', 取值: 日期值 })
  return 类型
}

function 找冲突(查询, 结果) {
  const 类型们 = 查询类型(查询)
  const 清单 = Array.isArray(结果) ? 结果 : []
  const 冲突们 = []

  for (const 定义 of 类型们) {
    const 按来源 = new Map()
    for (const 条 of 清单) {
      const 归属 = String(条 && 条.来源归属 || 来源归属(取域名(条 && 条.链接)))
      if (!归属) continue
      const 值们 = 定义.取值(文本(条))
      // 一个摘要同时列出多个版本/价格/日期时语义不明确，宁可不自动判断。
      if (值们.length !== 1) continue
      if (!按来源.has(归属)) 按来源.set(归属, new Set())
      按来源.get(归属).add(值们[0])
    }

    const 按值 = new Map()
    for (const [归属, 值集合] of 按来源) {
      if (值集合.size !== 1) continue
      const 值 = [...值集合][0]
      if (!按值.has(值)) 按值.set(值, [])
      按值.get(值).push(归属)
    }
    if (按值.size < 2) continue

    // 价格只在相同币种内比较；人民币与美元不能直接算冲突。
    const 组们 = 定义.类型 === '价格'
      ? [...按值].reduce((组, [值, 来源们]) => {
        const 币种 = 值.split(' ')[0]
        if (!组[币种]) 组[币种] = []
        组[币种].push({ 值, 来源们 })
        return 组
      }, {})
      : { 全部: [...按值].map(([值, 来源们]) => ({ 值, 来源们 })) }

    for (const 值组 of Object.values(组们)) {
      if (值组.length < 2) continue
      冲突们.push({
        类型: 定义.类型,
        值们: 值组,
        说明: `${定义.类型}候选不一致：${值组.map((一) => `${一.值}（${一.来源们.join('、')}）`).join('；')}`,
      })
    }
  }

  return {
    有冲突: 冲突们.length > 0,
    冲突们: 冲突们.slice(0, 4),
    检查类型: 类型们.map((一) => 一.类型),
    检测范围: '仅比较搜索标题和摘要中单一、明确标注的版本、价格或事件日期；未读取网页正文',
  }
}

module.exports = { 版本值, 价格值, 日期值, 查询类型, 找冲突 }
