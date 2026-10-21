'use strict'
const assert = require('node:assert/strict')
const { 版本值, 价格值, 日期值, 查询类型, 找冲突 } = require('../脑/搜索冲突.cjs')
const { 查 } = require('../脑/动手.cjs')

let 数 = 0
function 测(名字, 条件) { assert.ok(条件, 名字); 数++; console.log('✓ ' + 名字) }
const 条 = (标题, 链接, 摘要, 日期 = '') => ({ 标题, 链接, 摘要, 发布日期: 日期 })

测('提取 Node.js 主版本候选', JSON.stringify(版本值('Node.js 24 is Active LTS')) === '["24"]')
测('同段多个版本保持歧义而不强选', 版本值('v24 Active LTS, v22 Maintenance').length === 2)
测('价格保留币种并统一逗号', 价格值('售价 ¥1,999，海外 $299').includes('CNY 1999') && 价格值('售价 ¥1,999，海外 $299').includes('USD 299'))
测('中英文日期统一格式', 日期值('截止 2026年10月15日；发布 2026/10/16').join(',') === '2026-10-15,2026-10-16')
测('普通问题不扫描无关数字', 查询类型('C语言指针原理').length === 0)

const 版本冲突 = 找冲突('Node.js 最新 LTS 版本', [
  条('Node.js 24 Active LTS', 'https://nodejs.org/a', 'Node.js 24 is Active LTS'),
  条('Node.js 22 LTS', 'https://example.com/b', 'Node.js 22 is LTS'),
])
测('不同来源版本不一致会标记冲突', 版本冲突.有冲突 && 版本冲突.冲突们[0].类型 === '版本')
测('冲突说明列出值和来源归属', /24.*nodejs\.org/.test(版本冲突.冲突们[0].说明) && /22.*example\.com/.test(版本冲突.冲突们[0].说明))

const 同源 = 找冲突('最新版本', [
  条('v24', 'https://docs.example.com/a', 'v24'),
  条('v22', 'https://support.example.com/b', 'v22'),
])
测('同一站点不同子域不构成跨来源冲突', !同源.有冲突)
测('不同来源相同版本不算冲突', !找冲突('最新版本', [条('v24', 'https://a.com/a', 'v24'), 条('v24', 'https://b.com/b', 'v24')]).有冲突)
测('单个摘要列出多个版本时不武断判断', !找冲突('最新版本', [条('版本表', 'https://a.com/a', 'v24 与 v22'), 条('v24', 'https://b.com/b', 'v24')]).有冲突)
测('不同币种不直接比较', !找冲突('价格', [条('中国价', 'https://a.com/a', '¥1999'), 条('美国价', 'https://b.com/b', '$299')]).有冲突)
测('相同币种不同价格会提示冲突', 找冲突('价格', [条('A', 'https://a.com/a', '¥1999'), 条('B', 'https://b.com/b', '¥2099')]).有冲突)
测('明确事件日期不一致会提示冲突', 找冲突('报名截止日期', [条('A', 'https://a.com/a', '截止 2026-10-15'), 条('B', 'https://b.com/b', '截止 2026-10-16')]).有冲突)
测('网页发布日期元数据不会被当成事件日期冲突', !找冲突('报名截止日期', [条('A', 'https://a.com/a', '请查看通知', '2026-10-14'), 条('B', 'https://b.com/b', '请查看通知', '2026-10-15')]).有冲突)

const 假回应 = (结果) => new Response(JSON.stringify({ organic_results: 结果, search_metadata: { status: 'Success' } }), { headers: { 'content-type': 'application/json' } })
const 原条 = (title, link, snippet, date = '') => ({ title, link, snippet, date })

async function 集成() {
  let 次 = 0
  const 冲突 = await 查('Node.js 最新 LTS 版本', {
    钥匙: 'serp-test',
    fetch函数: async () => { 次++; return 假回应([
      原条('Node.js 24 Active LTS', 'https://nodejs.org/a', 'Node.js 24 is Active LTS', '2026-10-15'),
      原条('Node.js 22 LTS', 'https://example.com/b', 'Node.js 22 is LTS', '2026-10-14'),
    ]) },
  })
  测('来源和日期已足够时冲突检测不追加请求', 次 === 1)
  测('潜在冲突把验证降为未验证部分完成', 冲突.好 && 冲突.冲突检查.有冲突 && 冲突.验证状态 === '未验证' && 冲突.目标完成 === '部分')
  测('冲突进入结构化错误类别', 冲突.错误类别 === '来源冲突')
  测('给模型的材料禁止擅自选一个值', 冲突.内容.includes('不可擅自选择其中一个作为最终答案'))

  console.log(`搜索冲突：${数}/${数} 通过`)
}

集成().catch((错误) => { console.error(错误); process.exitCode = 1 })
