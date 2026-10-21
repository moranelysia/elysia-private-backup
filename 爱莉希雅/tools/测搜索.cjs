/**
 * 测搜索.cjs —— 看看这台机器上能不能真的搜到东西
 *
 * 【为什么要先测这个】
 *   她现在是"只能聊天"：不能读文件、不能跑命令、更不能上网查。
 *   想给她加"查得到"这个本事，第一步得先确认：
 *   **这台机器到底能搜到吗、回来的结果抠不抠得出来。**
 *   不然写了一堆代码，最后发现网络不通或者结果解析不出来，白干。
 *
 * 【为什么用 Bing 而不是 Google】
 *   实测（Node 的 fetch）：
 *     ✓ api.deepseek.com   ✓ baidu.com   ✓ bing.com
 *     ✗ github.com（超时）  ✗ duckduckgo.com（超时）
 *   所以走 Bing：能到，而且它的结果页是服务端渲染的 HTML，
 *   不用执行 JavaScript 就能抠出标题和摘要（这点很关键）。
 *
 * 用法: node tools\测搜索.cjs
 *       node tools\测搜索.cjs "随便一个词"
 */
'use strict'

const 词 = process.argv.slice(2).join(' ') || 'RTX 5060 笔记本 现在多少钱'

/** 浏览器的身份 —— 不带这个，很多站直接给你一页空壳 */
const 头 = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'zh-CN,zh;q=0.9',
}

/** 把 HTML 里的标签扒掉，只留文字 */
function 去标签(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 从 Bing 的结果页里抠结果。
 *
 * 【为什么用"切块"而不是一个大正则】
 *   正则要跨很长的 HTML（标题、链接、摘要挨着但不一定同构），
 *   写一个大正则非常脆。切成 <li class="b_algo"> 块之后，
 *   每块里面再各找各的，坏了一块也不影响别的。
 */
function 抠结果(html) {
  const 结果 = []
  const 块们 = html.split(/<li class="b_algo"/).slice(1)

  for (const 块 of 块们) {
    const 链接匹配 = 块.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/)
    const 标题匹配 = 块.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
    // 摘要在 <p> 里；不同结果偶尔没有，那就先空着
    const 摘要匹配 = 块.match(/<p[^>]*>([\s\S]*?)<\/p>/)

    if (!标题匹配) continue

    结果.push({
      标题: 去标签(标题匹配[1]),
      链接: 链接匹配 ? 链接匹配[1] : '',
      摘要: 摘要匹配 ? 去标签(摘要匹配[1]) : '',
    })

    if (结果.length >= 8) break
  }

  return 结果
}

async function 搜(搜索词) {
  const 地址 =
    'https://www.bing.com/search?q=' + encodeURIComponent(搜索词) + '&setlang=zh-CN&mkt=zh-CN'

  const 开始 = Date.now()
  const 回应 = await fetch(地址, { headers: 头, signal: AbortSignal.timeout(15000) })
  const html = await 回应.text()
  const 用时 = Date.now() - 开始

  return { 状态: 回应.status, html, 用时, 地址 }
}

async function main() {
  console.log('')
  console.log('  ============================================')
  console.log('   试搜一下：能不能查到东西')
  console.log('  ============================================')
  console.log('')
  console.log('  搜索词：' + 词)
  console.log('')

  let 回来的
  try {
    回来的 = await 搜(词)
  } catch (错误) {
    console.log('  ✗ 连不上: ' + 错误.name + ' ' + 错误.message)
    console.log('    （这台机器上 github 和 duckduckgo 是不通的；bing 应该通）')
    process.exit(1)
  }

  console.log(`  HTTP ${回来的.状态}，回来 ${Math.round(回来的.html.length / 1024)} KB，用时 ${回来的.用时} ms`)
  console.log('')

  const 结果 = 抠结果(回来的.html)

  if (!结果.length) {
    console.log('  ✗ 一条都没抠出来 —— 可能页面结构变了，或者被拦了。')
    console.log('    下面存一份原始 HTML 供排查：')
    const fs = require('node:fs')
    const path = require('node:path')
    const 存到 = path.resolve(__dirname, '..', '.cache', '搜索返回的原始页面.html')
    fs.mkdirSync(path.dirname(存到), { recursive: true })
    fs.writeFileSync(存到, 回来的.html, 'utf8')
    console.log('    ' + 存到)
    process.exit(1)
  }

  console.log(`  ✓ 抠出 ${结果.length} 条：`)
  console.log('')
  for (const [i, 条] of 结果.entries()) {
    console.log(`  ${i + 1}. ${条.标题}`)
    if (条.摘要) console.log(`     ${条.摘要.slice(0, 110)}`)
    if (条.链接) console.log(`     ${条.链接.slice(0, 90)}`)
    console.log('')
  }

  console.log('  ────────────────────────────────────────────')
  console.log('  这些就是她"查得到"的样子：标题 + 摘要 + 链接。')
  console.log('  摘要里通常就有数字（价格、参数），够她答"多少钱""什么型号"了。')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  process.exit(1)
})
