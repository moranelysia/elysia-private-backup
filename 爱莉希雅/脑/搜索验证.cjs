/**
 * 搜索验证.cjs —— 判断哪些查询需要更强材料，并给出一次有界补搜建议。
 *
 * 它只检查材料数量、来源归属和日期覆盖，不尝试凭摘要判断事实真假或结论冲突。
 */
'use strict'

const 高时效 = /今天|今日|明天|后天|现在|当前|最新|刚刚|近期|本周|本月|今年|实时|新闻|天气|气温|降雨|价格|报价|售价|股价|汇率|利率|版本|发布日期|发售|现任|任期|截止|报名时间|考试时间|开放时间|营业时间|today|tomorrow|current|latest|news|weather|price|release/i
const 高影响 = /医疗|医学|症状|疾病|诊断|药物|用药|剂量|副作用|法律|法规|政策|合同|诉讼|判决|税务|报税|投资|股票|基金|债券|贷款|保险|理财|收益率|安全漏洞|网络安全|medical|medicine|legal|law|tax|invest|stock|loan|insurance|security vulnerability/i

function 查询要求(查询) {
  const 文本 = String(查询 || '')
  const 时效 = 高时效.test(文本)
  const 影响 = 高影响.test(文本)
  return {
    需要加强: 时效 || 影响,
    高时效: 时效,
    高影响: 影响,
    最少来源数: 时效 || 影响 ? 2 : 1,
    需要日期: 时效,
    原因: [时效 ? '高时效' : '', 影响 ? '高影响' : ''].filter(Boolean),
  }
}

function 检查门槛(查询, 审查) {
  const 要求 = 查询要求(查询)
  const 现状 = 审查 && typeof 审查 === 'object' ? 审查 : {}
  const 不同来源数 = Number(现状.不同来源数) || 0
  const 有日期数 = Number(现状.有日期数) || 0
  const 缺少 = []
  if (不同来源数 < 要求.最少来源数) 缺少.push(`至少 ${要求.最少来源数} 个不同来源，目前 ${不同来源数} 个`)
  if (要求.需要日期 && 有日期数 < 1) 缺少.push('至少一条可检查的日期信息')
  return {
    ...要求,
    通过: 缺少.length === 0,
    状态: 缺少.length ? '材料不足' : 要求.需要加强 ? '达到最低材料门槛' : '普通查询',
    缺少,
  }
}

function 补搜查询(查询, 要求 = 查询要求(查询)) {
  const 后缀 = 要求.高影响 ? ' 官方 原始来源 公告' : ' 官方来源 发布日期'
  const 原 = String(查询 || '').trim()
  return (原.slice(0, Math.max(0, 220 - 后缀.length)) + 后缀).trim()
}

function 合并结果(前, 后, 最多 = 10) {
  const 合并 = []
  const 看过 = new Set()
  for (const 条 of [...(Array.isArray(前) ? 前 : []), ...(Array.isArray(后) ? 后 : [])]) {
    const 键 = String(条 && 条.链接 || '').trim()
    if (!键 || 看过.has(键)) continue
    看过.add(键)
    合并.push(条)
    if (合并.length >= 最多) break
  }
  return 合并
}

module.exports = { 查询要求, 检查门槛, 补搜查询, 合并结果 }
