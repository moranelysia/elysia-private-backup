/**
 * 看她动手.cjs —— 让她做一件事，把她**实际调用的工具和参数**打出来
 *
 * 【为什么需要这个】
 *   她答"那个地方我够不着"的时候，我以为是白名单拦错了。
 *   可一测：那几个文件全都读得到。所以问题在**她写的那个路径**上 ——
 *   而那个路径被程序吃掉了（工具标记会从正文里抠掉，不留痕），
 *   从外面根本看不见她写了什么。
 *
 *   看不见就没法改。所以这个脚本把每一步摊开：
 *   她说了什么 → 她想调什么工具、参数是什么 → 工具返回什么 → 她最后怎么说。
 *
 * 用法: node tools\看她动手.cjs
 *       node tools\看她动手.cjs "换个说法试试"
 */
'use strict'

const path = require('node:path')
const { 说话 } = require(path.resolve(__dirname, '..', '脑', '对话.cjs'))

const 话 = process.argv.slice(2).join(' ') || '帮我在咱们的共同经历里找找，我第一次跟你说话是哪天'

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('  我说: ' + 话)
  console.log('  ════════════════════════════════════════════')
  console.log('')

  const 开头 = Date.now()
  const 结果 = await 说话({ 他说的话: 话 })

  console.log('')
  console.log('  ── 她动了 ' + (结果.用过的工具.length || 0) + ' 次手 ──')
  if (!结果.用过的工具.length) {
    console.log('  （一次都没动 —— 她是凭记忆答的）')
  }
  for (const [i, 用过的] of 结果.用过的工具.entries()) {
    console.log('')
    // 【字段名】工具表里那条叫「名字」（原来这儿写的是 做什么，打出来是 undefined）
    console.log(`  ${i + 1}. 工具：${用过的.名字}`)
    console.log(`     她写的参数：${JSON.stringify(用过的.参数)}`)
    console.log(`     结果：${用过的.结果.好 ? '成功' : '没成'}`)
    if (!用过的.结果.好) console.log(`     原因：${用过的.结果.说明}`)
    else if (用过的.结果.内容) {
      const 头几行 = 用过的.结果.内容.split('\n').slice(0, 3).join('\n       ')
      console.log(`     内容开头：\n       ${头几行}`)
    }
  }

  console.log('')
  console.log('  ── 她最后说的 ──')
  console.log('  ' + 结果.她说的话.split('\n').join('\n  '))
  console.log('')
  console.log(`  用时 ${((Date.now() - 开头) / 1000).toFixed(1)}s`)
  if (结果.用了) {
    console.log(
      `  用量：输入 ${结果.用了.prompt_tokens}（缓存命中 ${结果.用了.prompt_cache_hit_tokens ?? '?'}）输出 ${结果.用了.completion_tokens}`,
    )
  }
  console.log('')
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  process.exit(1)
})
