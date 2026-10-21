/** 搜索页能解析出来，不等于找到了答案。天气必须同时匹配地点、主题和气象来源。 */
'use strict'
function 是天气查询(词) {
  if (/天气|weather/i.test(词) && !/为什么|原理|形成|气候|定义/.test(词)) return true
  return /天气|气温|降雨|下雨|下雪|温度|weather|forecast/i.test(词) &&
    /今天|今日|明天|后天|现在|实时|预报|怎么样|如何|today|tomorrow|forecast/i.test(词)
}
function 实际链接(原) {
  try {
    const url = new URL(String(原).replace(/&amp;/g, '&'))
    if (url.hostname.endsWith('bing.com') && url.pathname === '/ck/a') {
      const u = url.searchParams.get('u') || ''
      if (u.startsWith('a1')) return new URL(Buffer.from(u.slice(2), 'base64url').toString('utf8')).href
    }
    return url.href
  } catch { return '' }
}
function 是气象来源(原) {
  try {
    const host = new URL(实际链接(原)).hostname.toLowerCase()
    return ['weather.com.cn', 'nmc.cn', 'cma.gov.cn'].some((域) => host === 域 || host.endsWith('.' + 域))
  } catch { return false }
}
function 天气地点词(词) {
  return String(词).replace(/site:\S+/gi, '').replace(/\d{4}[-年/]\d{1,2}[-月/]\d{1,2}日?/g, '')
    .replace(/今天天气|今天天|今天|今日|明天|后天|现在|实时|天气预报|天气|气温|降雨|下雨|下雪|温度|预报|怎么样|如何|帮我|查一下|查询|请问|看看|一下/g, ' ')
    .match(/[\p{Script=Han}]{2,}/gu) || []
}
function 选天气结果(词, 结果) {
  const 地点 = 天气地点词(词)
  // 不猜所在地：缺地点的查询交回模型向用户确认。
  if (!地点.length) return []
  return 结果.filter((一) => {
    const 文 = `${一.标题} ${一.摘要}`
    return 是气象来源(一.链接) && /天气|气温|降水|降雨|预报|℃/.test(文) &&
      地点.some((地) => 文.includes(地.replace(/市$/, '')))
  }).map((一) => ({ ...一, 链接: 实际链接(一.链接) }))
}
module.exports = { 是天气查询, 选天气结果, 实际链接, 是气象来源 }
