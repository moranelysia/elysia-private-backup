/**
 * 看她写文件.cjs —— 完整走一遍：她说要写 → 问他 → 落盘 → 她回话
 *
 * 【跟 测写文件.cjs 的分工】
 *   那个量的是**工具本身**（白名单、骤降、该问的问了没有）—— 用假数据反复跑。
 *   这个量的是**她**：她会不会想到写、写出来的格式认不认得出、
 *   被拦了她会不会换个说法。这些只能真跟她说话才知道。
 *
 * 用法: node tools\看她写文件.cjs
 *       node tools\看她写文件.cjs "换个说法试试"
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { 说话 } = require(path.resolve(__dirname, '..', '脑', '对话.cjs'))

const 工作区根 = path.resolve(__dirname, '..', '..')
const 话 = process.argv.slice(2).join(' ') || '帮我在工作区写一个文件 test-elysia.md，内容是三行：第一行写"这是爱莉希雅写的"，第二行写今天的日期，第三行你自己想一句'

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('  我说: ' + 话)
  console.log('  ════════════════════════════════════════════')

  const 开始 = Date.now()
  let 等他的次数 = 0

  const 结果 = await 说话({
    他说的话: 话,
    // 【模式】默认干活 —— 这个脚本是"看她写文件"，聊天模式下她写不了。
    //   要试聊天模式的话：环境变量 模式=chat
    模式: process.env.模式 === 'chat' ? 'chat' : 'work',
    工作区: process.env.工作区 || 工作区根,
    动手了: (一句话) => console.log('\n  〔她说要动手了〕' + 一句话),
    问: async (请求) => {
      等他的次数++
      console.log('')
      console.log('  ┌─ 她要动手，问他要不要允许 ─────────────')
      console.log('  │ 类型：' + 请求.类型)
      if (请求.路径) console.log('  │ 路径：' + 请求.路径)
      if (请求.命令) console.log('  │ 命令：' + 请求.命令)
      if (请求.内容) {
        const 行们 = String(请求.内容).split('\n')
        console.log('  │ 内容（' + 行们.length + ' 行）：')
        for (const 行 of 行们.slice(0, 8)) console.log('  │   ' + 行)
        if (行们.length > 8) console.log('  │   ……还有 ' + (行们.length - 8) + ' 行')
      }
      console.log('  └─ （这个测试里替他说：同意）')
      return true
    },
  })

  console.log('')
  console.log('  ── 她动了 ' + 结果.用过的工具.length + ' 次手 ──')
  for (const [i, 一件] of 结果.用过的工具.entries()) {
    console.log(`  ${i + 1}. ${一件.名字}(${JSON.stringify(一件.参数)})  →  ${一件.结果.好 ? '成功' : '没成：' + 一件.结果.说明}`)
    if (一件.结果.好 && 一件.结果.内容) console.log('     ' + String(一件.结果.内容).split('\n')[0])
  }

  console.log('')
  console.log('  ── 她最后说的 ──')
  console.log('  ' + 结果.她说的话.split('\n').join('\n  '))

  console.log('')
  console.log(`  用时 ${((Date.now() - 开始) / 1000).toFixed(1)}s，问了他 ${等他的次数} 次`)
  if (结果.用了) {
    console.log(
      `  用量：输入 ${结果.用了.prompt_tokens}（缓存命中 ${结果.用了.prompt_cache_hit_tokens ?? '?'}）输出 ${结果.用了.completion_tokens}`,
    )
  }

  // 看看文件到底写出来没有
  console.log('')
  console.log('  ── 工作区里多了什么 ──')
  const 新文件 = fs
    .readdirSync(工作区根)
    .filter((名) => /^test-elysia/i.test(名))
  if (!新文件.length) {
    console.log('  （没有 test-elysia 开头的文件 —— 她没真写成）')
  }
  for (const 名 of 新文件) {
    const 全 = path.join(工作区根, 名)
    console.log('  ✓ ' + 名 + '（' + fs.statSync(全).size + ' 字节）')
    console.log('    ┌────────────────')
    for (const 行 of fs.readFileSync(全, 'utf8').split('\n')) console.log('    │ ' + 行)
    console.log('    └────────────────')
  }
  console.log('')
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  console.log(错误.stack.split('\n').slice(1, 3).join('\n'))
  process.exit(1)
})
