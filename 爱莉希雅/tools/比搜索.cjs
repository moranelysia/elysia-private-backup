/**
 * 比搜索.cjs —— 同一件事，换几种问法，看 Bing 哪种真给得出答案
 *
 * 【为什么要比】
 *   2026-10-01 晚出的事：她帮她查"5060 多少钱"，搜回来六条
 *   **一条带价格的都没有** —— 全是 NVIDIA 官网、百度百科、天梯图。
 *   她拿着这么一坨没答案的材料被要求"讲给他听"，
 *   于是搅出了「带英电竞和轻中度游戏里公认划算」这种不成词的话。
 *
 *   所以问题不在她，在**搜什么词**。这个脚本拿同一件事试几种问法，
 *   并列出来人眼看哪种能捞到真数据。
 *
 * 用法: node tools\比搜索.cjs
 */
'use strict'

const path = require('node:path')
const 动手 = require(path.resolve(__dirname, '..', '脑', '动手.cjs'))

/** 同一个意思的几种问法 */
const 问法们 = [
  { 说明: '现在这种（直接问价格）', 词: 'RTX 5060 显卡 现在价格 2026' },
  { 说明: '加上"多少钱"', 词: 'RTX 5060 多少钱' },
  { 说明: '加上"京东"（往电商引）', 词: 'RTX 5060 京东 价格' },
  { 说明: '加上"多少钱一个"', 词: 'RTX5060显卡多少钱一个' },
  { 说明: '问"报价"', 词: 'RTX 5060 报价' },
  { 说明: '直接问"多少钱 元"', 词: 'RTX5060 多少元' },
]

/** 一条结果里有没有"钱"的痕迹 */
function 像价格吗(文本) {
  return /[0-9]{3,5}\s*(元|块)|￥|¥|\$\s*[0-9]|[0-9]+\s*RMB|价格[:：]?\s*[0-9]/.test(文本)
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('   同一件事，换几种问法 —— 看 Bing 哪种真给得出价')
  console.log('  ════════════════════════════════════════════════════════')

  const 汇总 = []

  for (const 问法 of 问法们) {
    console.log('')
    console.log('  ──────────────────────────────────────────────────────')
    console.log(`  【${问法.说明}】  搜：${问法.词}`)
    console.log('')

    let 结果
    try {
      结果 = await 动手.做('查', 问法.词)
    } catch (错误) {
      console.log('    ✗ ' + 错误.message)
      continue
    }

    if (!结果.好) {
      console.log('    ✗ ' + 结果.说明)
      continue
    }

    // 把结果拆成条目，逐条看有没有价格
    const 条们 = 结果.内容.split('\n\n').filter((s) => /^\d+\./.test(s.trim()))
    let 带价的 = 0
    for (const 条 of 条们) {
      const 有价 = 像价格吗(条)
      if (有价) 带价的++
      const 头一行 = 条.split('\n')[0].trim().slice(0, 60)
      const 摘要 = (条.split('\n')[1] || '').trim().slice(0, 70)
      console.log(`    ${有价 ? '💰' : '  '} ${头一行}`)
      if (摘要) console.log(`         ${摘要}`)
    }

    console.log('')
    console.log(`    这一搜：${条们.length} 条，其中带数字价格的 ${带价的} 条`)
    汇总.push({ 问法: 问法.说明, 词: 问法.词, 条数: 条们.length, 带价: 带价的 })
  }

  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('   汇总（哪种问法捞得到价）')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('')
  for (const 一 of 汇总) {
    const 记号 = 一.带价 > 0 ? '✓' : '✗'
    console.log(`  ${记号} ${String(一.带价).padStart(2)}/${String(一.条数).padStart(2)} 条带价   ${一.说明}  「${一.词}」`)
  }
  console.log('')
  console.log('  （带价的条数就是"她能不能答出来"的依据。')
  console.log('    一条都不带价，她只能编 —— 那不是她的错，是搜的词不对。）')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  process.exit(1)
})
