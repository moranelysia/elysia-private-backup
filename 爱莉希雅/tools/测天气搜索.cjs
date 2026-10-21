'use strict'
const assert = require('node:assert/strict')
const { 查 } = require('../脑/动手.cjs')
const { 选天气结果, 是气象来源 } = require('../脑/搜索校验.cjs')
let 数 = 0
function 测(名, 值) { assert.ok(值, 名); 数++; console.log('✓ ' + 名) }
// DeepSeek Search 的结果形状（url / snippet / date）
const 条 = (标题, 链接, 摘要, 发布日期 = '') => ({ title: 标题, url: 链接, snippet: 摘要, date: 发布日期 })
const 假回应 = (结果) => new Response(JSON.stringify({ results: 结果 }), { headers: { 'content-type': 'application/json' } })
/** 记下请求：DeepSeek 走 POST，查询在 body 里，不在 URL 参数上 */
const 记请求 = (桶) => async (url, 选项) => {
  const 体 = 选项 && 选项.body ? JSON.parse(选项.body) : {}
  桶.push({ 地址: String(url), 查询: 体.query || '' })
  return null // 具体回应由调用方覆盖
}
async function main() {
  let 请求们 = []
  const 披萨 = 条('天津披萨店', 'https://example.com/pizza', '达美乐 必胜客')
  const 失败 = await 查('天津 今天 天气', {
    钥匙: 'ds-test',
    fetch函数: async (url, 选项) => {
      const 体 = JSON.parse(选项.body)
      请求们.push({ 地址: String(url), 查询: 体.query })
      return 假回应([披萨])
    },
  })
  测('无关网页不能标为搜索成功', !失败.好 && 失败.原因 === '天气结果不可靠')
  测('最多两次请求且重试限定气象来源',
    请求们.length === 2 && 请求们[1].查询.includes('site:weather.com.cn'))
  测('失败不向模型传递披萨材料', !失败.内容 && !失败.说明.includes('达美乐'))

  let 次 = 0
  const 成功 = await 查('天津今天的天气', {
    钥匙: 'ds-test',
    fetch函数: async () => 假回应([++次 === 1
      ? 披萨
      : 条('天津天气预报', 'https://www.weather.com.cn/weather/101030100.shtml', '天津天气预报信息', '2026-10-15T00:00:00Z')]),
  })
  测('重试可以恢复相关气象来源', 成功.好 && 成功.内容.includes('天津天气预报') && 次 === 2)
  测('摘要明确未核实目标日期', 成功.内容.includes('尚未验证预报发布日期与有效日期'))
  测('拒绝伪造气象域名', !是气象来源('https://weather.com.cn.example.org/a'))
  测('拒绝异地天气', !选天气结果('天津今天的天气', [{ 标题: '北京天气', 摘要: '气温', 链接: 'https://www.weather.com.cn/a' }]).length)
  const 重定向 = 'https://www.bing.com/ck/a?u=a1' + Buffer.from('https://www.weather.com.cn/a').toString('base64url')
  测('识别 Bing 编码后的真实来源', 是气象来源(重定向))

  const 断网 = await 查('天津 今天 天气', { 钥匙: 'ds-test', fetch函数: async () => { throw new Error('offline') } })
  测('网络错误正常返回失败', !断网.好)

  const 普通 = await 查('天津披萨店', { 钥匙: 'ds-test', fetch函数: async () => 假回应([披萨]) })
  测('非天气查询使用同一通用搜索入口',
    普通.好 && 普通.内容.includes('达美乐') && 普通.服务 === 'DeepSeek 联网搜索')
  测('给模型的材料明确显示来源类型和缺失日期',
    普通.内容.includes('普通网页（未证明为官网）') && 普通.内容.includes('发布/更新：未提供'))
  测('工具结果带结构化来源审查且不冒充交叉验证',
    普通.来源审查.不同域名数 === 1 && 普通.来源审查.来源覆盖 === '单一域名材料')

  console.log(`天气搜索：${数}/${数} 通过`)
}
main().catch((错误) => { console.error(错误); process.exitCode = 1 })
