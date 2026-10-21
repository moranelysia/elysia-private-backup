/**
 * 测捞价.cjs —— 单独验"从网页里抠价格"这一段灵不灵
 *
 * 【为什么单独验】
 *   2026-10-01 晚上：她搜"5060 多少钱"，Bing 回的六条摘要一条带价的都没有，
 *   她没材料可讲，就搅出了不成词的话。
 *
 *   我的对策是"多走一步：把像报价的页面打开，从正文里抠出带价的句子"。
 *   但那一段我**写完没验**（这正是我今天栽了好几次的那个毛病），
 *   一跑发现六条结果一条都没被打开 —— 打开的条件太严。
 *
 *   所以先把这个函数摘出来单独量：给它一个肯定有价格的页面，
 *   看它抠不抠得出来。
 *
 * 用法: node tools\测捞价.cjs
 */
'use strict'

const path = require('node:path')
const 项目根 = path.resolve(__dirname, '..')

// 把 动手.cjs 里那两个函数借出来（它们没导出，所以这儿重写一份同样的逻辑来验）
// ⚠ 两边逻辑必须一致 —— 改了一边记得改另一边
function 抠价格句子(页面文字) {
  const 候选 = []
  const 行们 = String(页面文字)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .split(/[\n。；;]/)

  for (const 行 of 行们) {
    const 净 = 行.replace(/\s+/g, ' ').trim()
    if (净.length < 6 || 净.length > 120) continue
    const 像价格 = /([0-9]{2,6}\s*(元|块))|￥\s*[0-9]|¥\s*[0-9]|(价格|报价|售价|到手价|券后)[^0-9]{0,6}[0-9]/.test(净)
    if (!像价格) continue
    if (/^[0-9]{4}年/.test(净)) continue
    if (/(帧|fps|跑分|核心|显存|位数|接口|功耗)/i.test(净) && !/(元|￥|¥)/.test(净)) continue
    if (!候选.includes(净)) 候选.push(净)
    if (候选.length >= 20) break
  }
  return 候选
}

const 头 = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'zh-CN,zh;q=0.9',
}

/** 拿一个页面，看看抠出什么 */
async function 试页面(说明, 地址) {
  console.log('')
  console.log(`  ── ${说明} ──`)
  console.log(`     ${地址}`)
  const t0 = Date.now()
  try {
    const 回应 = await fetch(地址, { headers: 头, signal: AbortSignal.timeout(15000) })
    if (!回应.ok) {
      console.log(`     ✗ HTTP ${回应.status}`)
      return 0
    }
    const html = await 回应.text()
    const 句子们 = 抠价格句子(html)
    console.log(`     页面 ${Math.round(html.length / 1024)} KB，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，抠出 ${句子们.length} 句带价的`)
    for (const 句 of 句子们.slice(0, 8)) console.log('       · ' + 句.slice(0, 90))
    return 句子们.length
  } catch (错误) {
    console.log(`     ✗ ${错误.name}: ${错误.message.slice(0, 60)}`)
    return 0
  }
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('   抠价格这一段灵不灵（拿肯定有价的页面试）')
  console.log('  ════════════════════════════════════════════════════════')

  let 总 = 0
  总 += await 试页面('ZOL 的 RTX 5060 报价页（搜索里出现过）', 'https://detail.zol.com.cn/graphics_card/nvidia_geforce_rtx_5060/')
  总 += await 试页面('京东搜 RTX 5060', 'https://search.jd.com/Search?keyword=RTX%205060')
  总 += await 试页面('中关村在线搜 5060', 'https://search.zol.com.cn/s/all.php?kword=RTX%205060')

  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log(`  一共抠出 ${总} 句带价的`)
  if (总 > 0) {
    console.log('  ✓ 这个函数能用 —— 那问题就在"挑哪几个页面打开"那一步')
  } else {
    console.log('  ✗ 一句都没抠出来。可能是：')
    console.log('     · 这些页面要 JS 才出内容（fetch 拿到的是空壳）')
    console.log('     · 或者被反爬挡了')
    console.log('     · 或者我那条"像价格"的判断太严')
  }
  console.log('  ════════════════════════════════════════════════════════')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  process.exit(1)
})
