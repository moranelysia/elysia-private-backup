'use strict'
const assert = require('node:assert/strict')
const { 搜索, 整理查询, 整理结果, 最长查询 } = require('../脑/联网搜索.cjs')

let 通过 = 0
function 测(名字, 条件) { assert.ok(条件, 名字); 通过++; console.log('✓ ' + 名字) }
function 回应(数据, status = 200) {
  return new Response(JSON.stringify(数据), { status, headers: { 'content-type': 'application/json' } })
}
/** DeepSeek Search API 的一条结果（字段照官方文档） */
function 一条(改 = {}) {
  return {
    rerank_score: 2.28,
    title: 'Node.js — Run JavaScript Everywhere',
    url: 'https://nodejs.org/en',
    snippet: 'Official Node.js website.',
    summary: 'Node.js 官方站点，提供 LTS 版本与文档入口。',
    content: '',
    site_name: 'nodejs.org',
    site_icon: null,
    date: '2026-10-15T00:00:00Z',
    authority: 3,
    ...改,
  }
}

async function main() {
  // ── 查询清洗（DeepSeek 的 query 硬上限 128）──
  测('拒绝空查询', !整理查询('').好)
  测('拒绝多行正文', !整理查询('第一行\n第二行').好)
  测('拒绝本机路径', !整理查询('看看 C:\\Users\\moran\\secret.txt').好)
  测('拒绝疑似 API Key', !整理查询('api_key=secret-search-key').好)
  测('普通公开关键词可以查询', 整理查询('Node.js 当前 LTS 官方').好)
  测('最长查询上限是 128（DeepSeek 文档值）', 最长查询 === 128)
  const 超长 = 整理查询('啊'.repeat(300))
  测('超长查询被截到 128 而不是直接失败', 超长.好 && 超长.查询.length === 128 && 超长.被截短 === true)
  const 正好 = 整理查询('啊'.repeat(128))
  测('正好 128 字不算被截短', 正好.好 && 正好.被截短 === false)

  // ── 没有钥匙：不碰网络 ──
  测('没有 Key 时明确失败且不请求网络',
    !(await 搜索('Node.js', { 钥匙: '', fetch函数: async () => { throw new Error('不该调用') } })).好)

  // ── 正常一次请求 ──
  let 请求 = null
  const 成功 = await 搜索('Node.js 当前 LTS 官方', {
    钥匙: 'ds-test-secret',
    fetch函数: async (地址, 选项) => {
      请求 = { 地址, 选项, 体: 选项 && 选项.body ? JSON.parse(选项.body) : null }
      return 回应({ results: [一条()] })
    },
  })
  测('使用 DeepSeek 官方 Search 地址', 请求.地址 === 'https://api.deepseek.com/v1/tools/search')
  测('用 POST 而不是 GET', String(请求.选项.method).toUpperCase() === 'POST')
  测('Key 只放在 Authorization 头里', String(请求.选项.headers.Authorization) === 'Bearer ds-test-secret')
  测('Key 不出现在返回体里', !JSON.stringify(成功).includes('ds-test-secret'))
  测('请求体带 query', typeof 请求.体.query === 'string' && 请求.体.query.includes('Node.js'))
  测('请求体默认要 6 条', 请求.体.count === 6)
  测('默认不要网页正文', !('need_content' in 请求.体) || 请求.体.need_content === false)
  测('服务名标成 DeepSeek 联网搜索', 成功.服务 === 'DeepSeek 联网搜索' && 成功.供应商 === 'deepseek')

  // ── 结果映射 ──
  测('保留标题链接摘要日期', 成功.好 && 成功.结果[0].标题.includes('Node.js')
    && 成功.结果[0].发布日期.includes('2026'))
  测('长摘要 summary 优先于 snippet', 成功.结果[0].摘要.includes('LTS 版本'))
  测('保留排序分与权威值', 成功.结果[0].相关度 === 2.28 && 成功.结果[0].权威 === 3)
  测('结果只标记部分验证和未知完成', 成功.验证状态 === '部分验证' && 成功.目标完成 === '未知')
  测('回执带网页证据', 成功.证据[0].来源 === 'https://nodejs.org/en')

  // ── 限定域名 ──
  let 限定体 = null
  await 搜索('天津天气', {
    钥匙: 'x',
    限定域名: ['weather.com.cn', 'nmc.cn', '坏 域名'],
    fetch函数: async (_地址, 选项) => {
      限定体 = JSON.parse(选项.body).query
      return 回应({ results: [一条()] })
    },
  })
  测('限定来源写成 site: 查询', 限定体.includes('site:weather.com.cn') && 限定体.includes('site:nmc.cn'))
  测('非法域名被丢掉', !限定体.includes('坏 域名'))
  测('加上限定后仍不超过 128 字', 限定体.length <= 128)

  // ── 去重与协议过滤 ──
  const 去重 = 整理结果({ results: [一条(), 一条({ title: '重复' }), 一条({ url: 'file:///secret', title: '本地文件' })] })
  测('去重并拒绝非网页协议', 去重.length === 1 && /^https:/.test(去重[0].链接))

  // ── 旧形状兼容（迁移期用）──
  const 旧形 = 整理结果({ organic_results: [{ title: '旧形状', link: 'https://example.org/a', snippet: '摘要' }] })
  测('仍认得 SerpAPI 的 organic_results 形状', 旧形.length === 1 && 旧形[0].链接 === 'https://example.org/a')

  // ── 错误分类 ──
  const 凭据 = await 搜索('test', { 钥匙: 'x', fetch函数: async () => 回应({ error: 'bad key' }, 401) })
  测('401 归类为凭据错误且不建议自动重试', !凭据.好 && 凭据.错误类别 === '凭据错误' && 凭据.可重试 === false)
  const 欠费 = await 搜索('test', { 钥匙: 'x', fetch函数: async () => 回应({ error: 'insufficient balance' }, 402) })
  测('402 余额不足归为凭据错误并给出可读说明', !欠费.好 && 欠费.错误类别 === '凭据错误' && 欠费.说明.includes('余额'))
  const 限流 = await 搜索('test', { 钥匙: 'x', fetch函数: async () => 回应({ error: 'slow down' }, 429) })
  测('429 归类为额度或限流并允许稍后重试', !限流.好 && 限流.错误类别 === '额度或限流' && 限流.可重试 === true)
  const 空 = await 搜索('test', { 钥匙: 'x', fetch函数: async () => 回应({ results: [] }) })
  测('成功响应没有来源时仍判失败', !空.好 && 空.错误类别 === '无结果')
  const 断网 = await 搜索('test', { 钥匙: 'x', fetch函数: async () => { throw new TypeError('offline') } })
  测('断网返回结构化失败', !断网.好 && 断网.错误类别 === '网络错误')
  const 超时错误 = new Error('timed out'); 超时错误.name = 'TimeoutError'
  const 超时 = await 搜索('test', { 钥匙: 'x', fetch函数: async () => { throw 超时错误 } })
  测('超时与普通断网分开', !超时.好 && 超时.执行状态 === '超时')
  const 控制器 = new AbortController(); 控制器.abort()
  const 取消 = await 搜索('test', {
    钥匙: 'x', 中止: 控制器.signal,
    fetch函数: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e },
  })
  测('用户取消不可自动重试', !取消.好 && 取消.执行状态 === '取消' && 取消.可重试 === false)

  // ── 供应商开关（SerpAPI 留着备选，以后接别的后端也能加）──
  测('默认供应商是 deepseek', 请求.地址 === 'https://api.deepseek.com/v1/tools/search')
  let serp请求 = null
  const 走Serp = await 搜索('测试', {
    钥匙: 'serp-key-1234567890',
    供应商: 'serpapi',
    fetch函数: async (地址, 选项) => {
      serp请求 = { 地址: String(地址), 方法: 选项.method }
      return 回应({ organic_results: [{ title: 'S', link: 'https://e.org/s', snippet: 's' }] })
    },
  })
  测('开关切到 serpapi 时改走 SerpAPI 且用 GET',
    String(serp请求.地址).startsWith('https://serpapi.com/search.json?')
    && String(serp请求.方法).toUpperCase() === 'GET')
  测('serpapi 结果照旧可用', 走Serp.好 && 走Serp.服务 === 'SerpAPI Google Search')
  let 回落地址 = null
  await 搜索('测试', {
    钥匙: 'k',
    供应商: 'bogus-vendor',
    fetch函数: async (地址) => { 回落地址 = String(地址); return 回应({ results: [一条()] }) },
  })
  测('认不出的供应商回落 deepseek 而不是搜不了', 回落地址 === 'https://api.deepseek.com/v1/tools/search')
  const serp缺 = await 搜索('测试', {
    钥匙: '', 供应商: 'serpapi',
    fetch函数: async () => { throw new Error('不该调用') },
  })
  测('serpapi 缺钥匙时提示的是 SerpAPI 而不是 DeepSeek',
    !serp缺.好 && serp缺.错误类别 === '缺少凭据' && serp缺.说明.includes('SerpAPI'))

  console.log(`联网搜索：${通过}/${通过} 通过`)
}
main().catch((错误) => { console.error(错误); process.exitCode = 1 })
