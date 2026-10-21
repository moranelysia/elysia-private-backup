/**
 * 测记忆闸门.cjs —— 量"测试脚本还污不污染她的记忆"
 *
 * 【它在防什么】
 *   测试直接调 脑\对话.cjs 的 说话()，而说话()结尾会把这一轮写进
 *   记忆\聊天记录\聊天记录.jsonl —— 那是她的长期记忆。
 *   2026-10-01 晚上一翻，里面攒了二十来条**从没发生过的对话**
 *   （"帮我写一个满屏星星往下飘的 C 程序，就放在 _onepass-test 里"
 *     连着三条，那个目录跑完就删了）。
 *
 *   根子上的修法在 脑\对话.cjs：记忆只在 **Electron 真身**里才写，
 *   命令行脚本天生写不进去。这个测试就是量那道闸。
 *
 * 【怎么量】
 *   记下说话前有多少条，真跟她说一句，再看说话后有多少条。
 *   数字不动 = 闸是好的。
 *
 *   光看代码不算数 —— 这一条必须真的说一次话才量得出来。
 *   （会花几分钱：聊天模式一句话，一次请求。）
 *
 * 用法: node tools\测记忆闸门.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 聊天文件 = path.join(项目根, '记忆', '聊天记录', '聊天记录.jsonl')

const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))

function 数几条() {
  try {
    return fs
      .readFileSync(聊天文件, 'utf8')
      .split('\n')
      .filter((行) => 行.trim()).length
  } catch {
    return -1
  }
}

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
  console.log('   记忆闸门：测试说的话，不许记进她的记忆')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  // 前提：我们现在是纯 node（不是 Electron）。正是"测试脚本"的身份。
  console.log(`  跑在 Electron 里吗：${process.versions.electron ? '是' : '不是（纯 node，这就是测试的身份）'}`)
  检查('现在确实是纯 node（不然量不出东西）', !process.versions.electron)

  const 说话前 = 数几条()
  console.log(`  说话前 ${说话前} 条`)

  console.log('')
  console.log('  跟她说一句「在吗」……')

  let 回
  try {
    回 = await 说话({ 他说的话: '在吗', 模式: 'chat' })
  } catch (错误) {
    console.log('  ✗ 说话本身失败了：' + 错误.message)
    process.exit(1)
  }

  const 说话后 = 数几条()
  console.log(`  她回了：${String(回.她说的话).replace(/\s+/g, ' ').slice(0, 60)}…`)
  console.log('')
  console.log(`  说话后 ${说话后} 条`)

  检查('聊天记录没有变多（一个字都没写进去）', 说话后 === 说话前, `${说话前} → ${说话后}`)

  // 反向确认：她确实说了话，不是"什么都没发生所以没写"
  检查('她确实回答了（不是空跑）', String(回.她说的话 || '').trim().length > 0)

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 反过来：该记的时候必须记得住 ──')
  //
  // 【为什么非要有这一半】
  //   上面那半量的是"别乱写"。可闸门做坏了还有另一种坏法：
  //   **永远不写** —— 那她就不记得跟他说过什么了，而且这种坏法
  //   在命令行里看不出来（命令行本来就不该写），只有等他真跟她
  //   聊完发现她失忆才会暴露。所以这里显式要它记一次。
  //
  //   真身（Electron）走的就是这条路：该记 = true。
  //   测完把那两条删掉，别留下新的假记录 —— 这个脚本自己也要干净。

  const 记前 = 数几条()
  console.log(`  开口前 ${记前} 条`)

  const 回2 = await 说话({ 他说的话: '在吗', 模式: 'chat', 记进记忆: true })
  const 记后 = 数几条()
  console.log(`  开口后 ${记后} 条`)

  检查('明说"记进记忆"就真的记了（真身走的就是这条）', 记后 === 记前 + 2, `${记前} → ${记后}（该 +2）`)

  // 收尾：把刚写进去那几条拿掉，恢复原样
  //
  // 【为什么按"末尾几条"切，而不是按内容找】
  //   按内容找会出人命：她的记录里本来就有好几条真的「在吗」
  //   （9/26、10/01 都有），拿内容当筛选条件会**把真话一起删掉**。
  //   刚写进去的一定在最后，所以只动尾巴。
  if (记后 > 记前) {
    const 行们 = fs.readFileSync(聊天文件, 'utf8').split('\n').filter((行) => 行.trim())
    const 留下 = 行们.slice(0, 记前)
    fs.writeFileSync(聊天文件, 留下.join('\n') + '\n', 'utf8')
    console.log(`  收拾干净：${数几条()} 条`)
    检查('测完自己擦干净了，不留新记录', 数几条() === 记前, `${数几条()} 条，应该是 ${记前}`)
  }

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 闸是好的' : '   ✗ 闸漏了'))
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

main().catch((错误) => {
  console.log('✗ 测试自己出错了: ' + 错误.message)
  process.exit(1)
})
