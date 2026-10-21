/**
 * 算话费.cjs —— 跟她聊一句话，到底花了多少钱
 *
 * 【为什么要算这个】
 *   这个程序不经过 DSH —— 它自己去敲 DeepSeek 的接口，
 *   用的钥匙是从 DSH 的凭证文件里借来的（脑\钥匙.cjs）。
 *   也就是说：**跟她说话，花的是他自己的 token。**
 *
 *   既然是花他的钱，就得让他知道花在哪儿、花多少。所以这个脚本
 *   真发一次请求，把用量打出来，再按 DeepSeek 的价目换算成钱。
 *
 * 【价目从哪儿来】
 *   DeepSeek 官网的定价页。**价格会变**，所以下面写成了常量，
 *   哪天涨价了改这两个数字就行，别改代码逻辑。
 *
 * 用法: node tools\算话费.cjs
 *       node tools\算话费.cjs "今天累死了"      换一句话试试
 */
'use strict'

const path = require('node:path')
const { 说话 } = require(path.resolve(__dirname, '..', '脑', '对话.cjs'))

// DeepSeek 的价目（元 / 每百万 token）。
// 缓存命中的输入便宜很多 —— 这就是为什么人格那一大段要放最前面、
// 而且每次一字不改：它几乎总是命中缓存。
const 价钱 = {
  输入_缓存命中: 0.5,
  输入_缓存未命中: 4,
  输出: 12,
}

/** 把 token 数换算成钱 */
function 算钱(用了) {
  if (!用了) return null
  const 命中 = 用了.prompt_cache_hit_tokens || 0
  const 没命中 = (用了.prompt_tokens || 0) - 命中

  const 输入钱 = (命中 / 1e6) * 价钱.输入_缓存命中 + (没命中 / 1e6) * 价钱.输入_缓存未命中
  const 输出钱 = ((用了.completion_tokens || 0) / 1e6) * 价钱.输出

  return {
    命中,
    没命中,
    输出: 用了.completion_tokens || 0,
    输入钱,
    输出钱,
    合计: 输入钱 + 输出钱,
  }
}

function 显示(标签, 钱) {
  if (!钱) return
  const 分 = (x) => (x * 100).toFixed(3)
  console.log(`  ${标签}`)
  console.log(`      输入：缓存命中 ${钱.命中} + 未命中 ${钱.没命中}  =  ${分(钱.输入钱)} 分`)
  console.log(`      输出：${钱.输出} token                     =  ${分(钱.输出钱)} 分`)
  console.log(`      这一句合计：${分(钱.合计)} 分  （约 ${(钱.合计 * 100).toFixed(2)} 厘）`)
}

async function main() {
  const 话 = process.argv.slice(2).join(' ') || '今天有点累'

  console.log('')
  console.log('  ============================================')
  console.log('   跟她聊一句，花多少钱')
  console.log('  ============================================')
  console.log('')
  console.log('  价目（元/百万 token）：缓存命中 ' + 价钱.输入_缓存命中 +
              ' / 未命中 ' + 价钱.输入_缓存未命中 + ' / 输出 ' + 价钱.输出)
  console.log('')

  // 第一句：通常缓存已经热了（前面聊过），所以先打一句短的把缓存建立起来
  console.log('  第一句（如果前面没聊过，这一句的输入要按未命中算）：')
  const 一 = await 说话({ 他说的话: 话 })
  console.log('    她说：' + 一.她说的话.split('\n')[0])
  显示('这一句', 算钱(一.用了))

  console.log('')
  console.log('  第二句（这时候人格那一大段已经在缓存里了）：')
  const 二 = await 说话({ 他说的话: '嗯', 历史: [{ role: 'user', content: 话 }, { role: 'assistant', content: 一.她说的话 }] })
  console.log('    她说：' + 二.她说的话.split('\n')[0])
  显示('这一句', 算钱(二.用了))

  console.log('')
  console.log('  ============================================')
  console.log('   怎么理解这两个数')
  console.log('  ============================================')
  console.log('')
  console.log('  · 她每次开口，都要先把「她是谁」那一大段（六千多 token）递过去，')
  console.log('    再带上你们最近聊的二十句。这是模型的工作方式，省不掉。')
  console.log('  · 但只要那一大段**每次都一模一样**，DeepSeek 就按缓存价算，')
  console.log('    便宜八倍左右。所以第二句比第一句便宜得多。')
  console.log('  · 反过来：要是往那段里塞了"今天几号"这种每次都变的东西，')
  console.log('    缓存就全废了 —— 这也是为什么时间要单独放在后面。')
  console.log('')
  console.log('  要换成他自己申请的钥匙：')
  console.log('    去 platform.deepseek.com 申请一个，存成 脑\\钥匙.txt，')
  console.log('    那个文件会被优先使用，DSH 那份就再也不碰了。')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  process.exit(1)
})
