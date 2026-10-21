/**
 * 测整条线.cjs —— 他最常走的那条路，从头到尾跑一遍
 *
 * 【它跟前两个测试的分工】
 *   测工程师过手.cjs  量的是"零件"：文件工具那一层，人工喂草稿进去
 *   这个脚本量的是"整条线"：**真的跟她说一句话**，让她自己动手，
 *   最后看落在他硬盘上的那个文件长什么样。
 *
 * 【为什么非要有这一关】
 *   这个项目已经栽过一次，教训是 moran 说的那句"能跑 ≠ 能干活"：
 *   低温那一层写好了、单测也过了，可**没有任何人调它**，
 *   真干活时走的还是说话的温度。零件全对，线没接上。
 *
 *   所以最后一关必须从"他说一句话"开始 —— 中间任何一环没接上，
 *   这里就会露出来。
 *
 * 【花钱提醒】会真的跟她对话一次（带工具，约几分钱）。
 *
 * 用法: node tools\测整条线.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.resolve(项目根, '..')

const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))

const 干活目录 = path.join(工作区根, '_onepass-test')

let 过了 = 0
let 总数 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (条件) {
    过了++
    console.log(`  ✓ ${说明}`)
  } else {
    console.log(`  ✗ ${说明}${细节 ? '   → ' + 细节 : ''}`)
  }
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   整条线：跟她说一句 → 她动手 → 文件落盘')
  console.log('  ════════════════════════════════════════════')

  fs.rmSync(干活目录, { recursive: true, force: true })
  fs.mkdirSync(干活目录, { recursive: true })

  const 话 =
    `帮我写一个满屏星星往下飘的 C 程序，就放在 ${干活目录} 里，` +
    `文件名 stars.c，用 gcc 能编过的`

  console.log('')
  console.log('  我跟她说：' + 话)
  console.log('')

  let 回
  try {
    回 = await 说话({
      他说的话: 话,
      模式: 'work',
      工作区: 干活目录,
      问: async (请求) => {
        // 测试里"他"永远点头 —— 但要说出来点了什么，好核对
        console.log(`    〔弹卡片〕${请求.类型} ${请求.路径}  → 我点了"准了"`)
        return true
      },
      动手了: (一句) => console.log('    她动手了：' + 一句),
    })
  } catch (错误) {
    console.log('  ✗ 对话本身出错了：' + 错误.message)
    process.exit(1)
  }

  console.log('')
  console.log('  她说：' + String(回.她说的话).split('\n')[0].slice(0, 90))
  console.log('')

  // ---------------------------------------------------------------
  console.log('  ── 一、她到底动没动手 ──')

  const 写的 = 回.用过的工具.filter((t) => t.名字 === '写')
  检查('她调过"写"这个工具', 写的.length > 0, `动了 ${回.用过的工具.length} 次手`)
  检查('写的那次成了', 写的.some((t) => t.结果 && t.结果.好), JSON.stringify(写的.map((t) => t.结果 && t.结果.说明)))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 二、文件真的在硬盘上吗 ──')

  // 她可能写在子目录里，所以整个目录翻一遍找 .c
  const 找到的 = []
  ;(function 翻(目录) {
    if (!fs.existsSync(目录)) return
    for (const 项 of fs.readdirSync(目录, { withFileTypes: true })) {
      const 全 = path.join(目录, 项.name)
      if (项.isDirectory()) 翻(全)
      else if (项.name.toLowerCase().endsWith('.c')) 找到的.push(全)
    }
  })(干活目录)

  检查('目录里有一个 .c 文件', 找到的.length > 0, `目录内容：${fs.existsSync(干活目录) ? fs.readdirSync(干活目录).join('、') : '（目录都没了）'}`)

  if (找到的.length) {
    const 源 = 找到的[0]
    const 正文 = fs.readFileSync(源, 'utf8')
    console.log(`     ${path.basename(源)}：${正文.split('\n').length} 行、${正文.length} 字`)

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 三、工程师那道线有没有接上 ──')
    //
    // 怎么判断"过手了"：文件工具会在结果说明里写一句"工程师过了一遍"。
    // 这是唯一从外面看得见的痕迹 —— 内容本身看不出是谁写的。
    const 过手痕迹 = 写的.some((t) => t.结果 && String(t.结果.内容).includes('工程师'))
    检查('工具结果里带着"工程师过了一遍"', 过手痕迹, JSON.stringify(写的.map((t) => t.结果 && t.结果.内容)))

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 四、那份代码本身立不立得住 ──')

    const 有stdio = /#include\s*<stdio\.h>/.test(正文)
    检查('有 #include <stdio.h>', 有stdio)

    const 写死 = /#define\s+(WIDTH|HEIGHT|COLS|ROWS|COLUMNS|LINES)\s+\d+/i.test(正文)
    检查('没有 #define 一个固定宽高', !写死, 写死 ? '又写死了' : '')

    const 问系统 = /GetConsoleScreenBufferInfo|GetSystemMetrics|ioctl/.test(正文)
    检查('运行时去问窗口尺寸了', 问系统)

    检查('没有"以后再补"这类占位', !/以后再补|先按固定|TODO|待补|先这样/i.test(正文))
    检查('没有角色扮演的口吻（♪ ～ 之类）', !/[♪～]/.test(正文))
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 五、收尾 ──')
  fs.rmSync(干活目录, { recursive: true, force: true })
  检查('临时目录清干净了', !fs.existsSync(干活目录))

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 全过' : '   ✗ 有没过的 —— 上面带 ✗ 的就是断掉的那一环'))
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

main().catch((错误) => {
  console.log('✗ 测试自己出错了: ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
})
