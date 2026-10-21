/**
 * 试小助手看源码.cjs —— 真派一次，看他截图里那件事现在办不办得成
 *
 * 【为什么要有这个】
 *   2026-10-04 他那句话："派个小助手去看看这个源代码，告诉我这是什么。"
 *   小助手回来说"那个目录根本不存在" —— 因为 `列` 把禁地里的名字
 *   悄悄抹掉了，清单里没有 cyrene-源码。
 *
 *   我改了两处（清单如实 + 参考源码挪出禁地），然后跟他说"你再试一次就行"。
 *   可上一次我这么说过，结果没成 —— 所以这回**先自己跑一遍**。
 *   （这就是他那三条判据里的"还没出现 ≠ 失败了"的反面：
 *     也别在没跑之前就说"可以了"。）
 *
 * 用法: node tools\试小助手看源码.cjs
 */
'use strict'

const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 子 = require(path.join(项目根, '脑', '子代理.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   真派一次：让他看看那份源码是什么')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  路径安全.注册({ 项目根, 工作区根: path.resolve(项目根, '..') })

  const 任务 =
    '去看一下 D:\\新建文件夹\\cyrene-源码 这个东西是什么：先列一下那个目录，' +
    '再挑一两个关键文件读一读（比如 README 或者 package.json），' +
    '回来告诉我它是什么项目、用什么写的、大概是干嘛的'

  console.log('  派的任务：' + 任务)
  console.log('')
  console.log('  （真花钱，几次请求）')
  console.log('')

  const 开始 = Date.now()
  const 果 = await 子.派(任务, { 问: async () => true })
  const 用时 = ((Date.now() - 开始) / 1000).toFixed(1)

  if (!果.好) {
    console.log('  ✗ 没成：' + 果.说明)
    console.log('    它动过的手：' + JSON.stringify((果.用过的工具 || []).map((t) => t.名字 + '(' + t.参数 + ')'), null, 2))
    process.exit(1)
  }

  console.log(`  转了几轮：${果.用了几轮}   用时 ${用时}s`)
  console.log(`  它动过的手：`)
  for (const t of 果.用过的工具 || []) {
    const 好 = t.结果 && t.结果.好 ? '成了' : '没成：' + ((t.结果 && t.结果.说明) || '？')
    console.log(`    · ${t.名字}(${String(t.参数).slice(0, 60)}) —— ${好}`)
  }
  if (果.用了) console.log(`  token：输入 ${果.用了.prompt_tokens}，输出 ${果.用了.completion_tokens}`)
  console.log('')
  console.log('  ── 它交回来的纸条 ──')
  console.log(果.内容)
  console.log('')

  // ---- 自己当一回检查员 ----
  const 碰过列 = (果.用过的工具 || []).some((t) => t.名字 === '列')
  const 碰过读 = (果.用过的工具 || []).some((t) => t.名字 === '读')
  const 说没成 = /不存在|没有这个|找不到|空的/.test(果.结论 || '')

  console.log('  ── 判一下 ──')
  console.log('  ' + (碰过列 ? '✓' : '✗') + ' 它真的去列了')
  console.log('  ' + (碰过读 ? '✓' : '·') + ' 它读了文件')
  console.log('  ' + (说没成 ? '✗ 还在说"没有/不存在" —— 没修好' : '✓ 没再说"不存在"'))
  console.log('  ' + (果.内容.includes('小助手替你跑回来') ? '✓' : '✗') + ' 纸条上写了"这是别人替你跑的"')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
})
