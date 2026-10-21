/**
 * 试看图.cjs —— 发一张糊图给她，看她会不会老老实实说"看不清"
 *
 * 【为什么要有这个脚本】
 *   2026-10-07 出过一次事：他发课表截图，格子里的小字被缩小到认不出来，
 *   她**没说看不清**，而是照印象编了一版课表，还顺手用 [记住:] 写进了长期记忆。
 *   后来在她的人设里加了第 22 条（看不清就说看不清）。
 *
 *   可**提示词改了不等于行为改了** —— 这种事只能真发一张糊图看她怎么答。
 *   所以写成一个能随时重跑的脚本，别靠"应该好了吧"。
 *
 * 【它测不出的那一半】
 *   "她会不会又把猜的写进记忆"这一半，这个脚本测不了 ——
 *   `说话()` 只在 Electron 真身里写记忆（见 脑\对话.cjs 里那道闸），
 *   从命令行跑是不写的。那一半得靠第 22 条自己拦，或者以后再加硬拦。
 *
 * 【会花钱】一次请求。图最多算 1024 个 token，加上她的人设，几分钱。
 *
 * 用法:
 *   node tools\试看图.cjs                        （自动拿附件里最新的那张图）
 *   node tools\试看图.cjs <附件文件名> ["要问的话"]
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')

const 附件 = require(path.join(脑, '附件.cjs'))
const { 说话 } = require(path.join(脑, '对话.cjs'))

function 找最新的图() {
  let 名单 = []
  try {
    名单 = fs.readdirSync(附件.存放目录)
  } catch {
    return ''
  }
  const 图们 = 名单
    .filter((n) => /\.(png|jpe?g|gif|webp)$/i.test(n))
    .map((n) => ({ 名: n, 时间: fs.statSync(path.join(附件.存放目录, n)).mtimeMs }))
    .sort((a, b) => b.时间 - a.时间)
  return 图们.length ? 图们[0].名 : ''
}

async function 主() {
  const 参数 = process.argv.slice(2)
  const 存成 = 参数[0] || 找最新的图()
  const 问话 = 参数[1] || '把课表发给你了'

  if (!存成) {
    console.log('  ✗ 附件目录里一张图都没有')
    process.exit(1)
  }

  const 全路径 = 附件.路径(存成)
  if (!fs.existsSync(全路径)) {
    console.log('  ✗ 找不到这张图：' + 全路径)
    process.exit(1)
  }

  const 预览 = 附件.读预览(存成)
  if (!预览.好) {
    console.log('  ✗ 这张图读不出来：' + 预览.说明)
    process.exit(1)
  }

  const 元 = fs.statSync(全路径)
  const 图 = {
    好: true,
    存成,
    原名: 存成.replace(/^\d{8}-\d{6}-/, ''),
    路径: 全路径,
    大小: 元.size,
    类型: 'image/*',
    是图片: true,
    dataUrl: 预览.dataUrl,
  }

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   发一张图给她，看她说不说"看不清"')
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  图：' + 图.原名 + '（' + (图.大小 / 1024).toFixed(0) + ' KB）')
  console.log('  她："' + 问话 + '"')
  console.log('')

  let 结果 = null
  try {
    结果 = await 说话({
      他说的话: 问话,
      历史: [],
      模式: 'chat',
      模型: 'deepseek-flash', // 得用能看图的那个，不然她压根收不到图
      附件们: [图],
    })
  } catch (错误) {
    console.log('  ✗ 没成：' + 错误.message)
    process.exit(1)
  }

  const 说 = 结果.她说的话 || ''
  console.log('  ── 她说的 ──')
  console.log(说.split('\n').map((行) => '  ' + 行).join('\n'))
  console.log('')

  // 【为什么要把"没洗过的原始输出"也打出来】
  //   第一次跑这个脚本就撞上了：她说的话是**空的**，而输出写满了 2000 个 token
  //   （正好是上限）。也就是说她确实写了一屏东西，但全被当成标记洗掉了 ——
  //   屏幕上只剩一个空气泡，钱照花。
  //   光看她"说的"什么都查不出来，得看原文。
  const 原始 = String(结果.原始 || '')
  console.log('  ── 她的原始输出（带标记、没洗过的）──')
  console.log('  一共 ' + 原始.length + ' 字' + (原始.length ? '' : '（空的）'))
  console.log(原始.slice(0, 1600).split('\n').map((行) => '  ' + 行).join('\n'))
  if (原始.length > 1600) console.log('  …（后面还有 ' + (原始.length - 1600) + ' 字）')
  console.log('')

  // 只把线索摆出来，不替人下结论
  const 认怂 = /看不清|看不清楚|太糊|有点糊|模糊|截清楚|切.*发给我|字太小|认不出/.test(说)
  const 敢下结论 = /八点二十|08:20|第一节是|周[一二三四五]第.*节是|离散|高数|近代史|C语言/.test(说)

  console.log('  ── 线索（自己判断）──')
  console.log('  说了"看不清"这类话：' + (认怂 ? '有' : '没有'))
  console.log('  又报了具体课名/时间：' + (敢下结论 ? '有（小心，可能是编的）' : '没有'))
  console.log('')
  console.log('  用量：输入 ' + (结果.用了 ? 结果.用了.prompt_tokens : '?') +
    '（图片算在里面），输出 ' + (结果.用了 ? 结果.用了.completion_tokens : '?'))
  console.log('')
}

主().catch((错误) => {
  console.log('  ✗ 脚本自己炸了：' + (错误 && 错误.stack))
  process.exit(1)
})
