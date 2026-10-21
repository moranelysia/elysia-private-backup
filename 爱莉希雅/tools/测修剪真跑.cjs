/**
 * 测修剪真跑.cjs —— 真发一次请求，看"收拾桌子"有没有真的救回来
 *
 * 【为什么单测过了还要真跑】
 *   单测量的是"零件对不对"：裁一块、拼一条、锚失效。
 *   可它证明不了**接上以后真的省了** —— 那是这个项目里栽过好几次的地方：
 *   零件全对，线没接。所以最后一关必须从"真发一次请求"开始。
 *
 * 【为什么把输入造得"不裁就一定超窗口"】
 *   造 4 轮工具结果，每轮 30000 字，一共 12 万字 ≈ 72000 token。
 *   模型窗口是 65536 —— **不裁的话这一发必炸**。
 *   裁对了才发得出去。所以这一关不是"看着还行"，是**过或不过**。
 *
 * 【它花钱】
 *   一次请求。裁完大概两三万 token 进去，一分多钱。
 *
 * 用法: node tools\测修剪真跑.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 对话 = require(path.join(项目根, '脑', '对话.cjs'))
const 修 = require(path.join(项目根, '脑', '修剪工具结果.cjs'))
const 尺 = require(path.join(项目根, '脑', '量长度.cjs'))

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

/** 造一段指定字数的中文 */
function 长文(n, 头) {
  const 前缀 = 头 || ''
  return 前缀 + '甲'.repeat(Math.max(0, n - 前缀.length))
}

function 造一条(工具, 参数, 正文, 交代) {
  const 块们 = [{ 工具, 标签: `${工具}：${参数}`, 正文 }]
  return 修.挂块({ role: 'user', content: 修.拼一条(块们, 交代) }, 块们, 交代)
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   真跑一遍：不裁就撑爆的那一发')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  尺.忘掉锚()
  尺.忘掉修正()

  // 四轮工具结果，每轮 30000 字。最近那轮不该被动。
  const 消息们 = [
    { role: 'system', content: '你是一个助手。他问你什么，你就照着手上的材料答一句。' },
  ]
  for (let i = 1; i <= 4; i++) {
    消息们.push({ role: 'assistant', content: `第 ${i} 轮，我去看看。` })
    消息们.push(造一条('跑', `第${i}轮的大输出`, 长文(30000, `【第 ${i} 轮的开头】`), `第 ${i} 轮的交代。`))
  }
  消息们.push({ role: 'user', content: '上面那几轮你看到了什么？一句话说说。' })

  const 发之前 = 修.现在多长(消息们)
  console.log(`  发之前：${消息们.length} 条消息，估算 ${发之前} tok`)
  console.log(`  窗口是 ${修.窗口}，线是 ${修.默认线}`)
  检查('造出来的东西**确实超窗口**（不裁就发不出去）', 发之前 > 修.窗口, `${发之前} vs ${修.窗口}`)
  console.log('')
  console.log('  发一次请求……（会真花钱，一分多）')
  console.log('')

  let 回
  const 开始 = Date.now()
  try {
    回 = await 对话.要一轮({ 消息们, 温度: 0.3, 最多多少字: 200 })
  } catch (错误) {
    console.log('  ✗ 请求失败了：' + 错误.message)
    console.log('    （要是报的是"超出上下文长度"，说明收拾桌子没接上）')
    process.exit(1)
  }
  const 用时 = ((Date.now() - 开始) / 1000).toFixed(1)

  console.log(`  她回了（${用时}s）：${String(回.全文).replace(/\s+/g, ' ').slice(0, 70)}`)
  console.log('')

  // -------------------------------------------------------------
  console.log('  ── 一、请求发出去了（不裁就发不出去）──')
  检查('模型回了话，没报上下文超限', String(回.全文 || '').trim().length > 0)

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 二、模型报的真实 token 数（这才是裁判）──')

  const 真实 = (回.用了 && 回.用了.prompt_tokens) || 0
  console.log(`     造出来的（不裁）：约 ${发之前} tok`)
  console.log(`     模型实际收到：    ${真实} tok`)
  console.log(`     省下：            ${发之前 - 真实} tok`)
  检查('实际收到的比"不裁"少了一大截', 真实 > 0 && 真实 < 发之前 - 10000, `${真实} vs ${发之前}`)
  检查('实际收到的**装得下**（没超窗口）', 真实 < 修.窗口, String(真实))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 三、裁对了地方 ──')

  const 带块的 = 消息们.filter((条) => 修.拿块(条))
  检查('四条工具结果都还挂着块记录', 带块的.length === 4, String(带块的.length))

  const 被裁的 = 带块的.filter((条) => 条.content.includes('中间省掉了'))
  const 没动的 = 带块的.filter((条) => !条.content.includes('中间省掉了'))
  console.log(`     被裁的 ${被裁的.length} 条，没动的 ${没动的.length} 条`)
  检查('老的那些被裁了', 被裁的.length >= 2, String(被裁的.length))
  检查('**最近那一条一个字没动**', 没动的.length >= 1 && 没动的[没动的.length - 1] === 带块的[3])
  检查('最后那条还是完整的 30000 字', 带块的[3].content.length > 25000, String(带块的[3].content.length))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 四、交代没被弄丢 ──')

  检查('被裁那条里还挂着它的交代', 被裁的.length > 0 && 被裁的[0].content.includes('的交代。'))
  检查('交代在正文**后面**（不是被塞进正文里）', 被裁的.length > 0 && 被裁的[0].content.trimEnd().endsWith('的交代。'))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 五、留档真的落在盘上 ──')

  const 留档们 = fs.existsSync(修.留档目录)
    ? fs.readdirSync(修.留档目录).filter((名) => 名.endsWith('.txt'))
    : []
  检查('留档目录里有东西', 留档们.length >= 2, String(留档们.length))
  if (留档们.length) {
    const 文 = fs.readFileSync(path.join(修.留档目录, 留档们[0]), 'utf8')
    检查('留档里是完整原文', 文.length > 25000, String(文.length))
    检查('留档写清楚了是哪个工具', 文.includes('工具：'))
  }

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 六、清场 ──')
  try {
    for (const 名 of fs.readdirSync(修.留档目录)) {
      if (名.endsWith('.txt')) fs.rmSync(path.join(修.留档目录, 名), { force: true })
    }
  } catch {
    /* 清不掉就算了 */
  }
  检查('测试留下的留档清干净了', !fs.existsSync(修.留档目录) || fs.readdirSync(修.留档目录).filter((n) => n.endsWith('.txt')).length === 0)

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 全过' : '   ✗ 有没过的'))
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

main().catch((错误) => {
  console.log('✗ 测试自己出错了: ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
})
