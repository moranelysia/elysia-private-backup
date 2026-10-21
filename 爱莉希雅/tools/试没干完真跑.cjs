/**
 * 试没干完真跑.cjs —— 让**真的**说话() 跑一趟，看那几张纸有没有按设计走
 *
 * 【为什么不能只跑 测没干完.cjs】
 *   那个测的是 没干完.cjs 自己。可这个功能的成败还有另一头：
 *   对话.cjs 里那几行插桩有没有接对 —— 参数传没传进去、
 *   工具的名字和危险度拿没拿到。
 *   这种错**不会报异常**，只是"纸永远是空的"。平时看不出来，
 *   等哪天真崩了才发现一个字都没记上 —— 那正是最坏的时候。
 *   所以必须让真的 说话() 走一趟，从旁边看着那张纸。
 *
 * 【怎么在旁边看】
 *   说话() 是异步的，跑的时候事件循环还转着。所以架一个每 40 毫秒
 *   看一次盘的定时器，把她干活期间那张纸的样子拍下来。
 *
 * 【会花钱】这一趟要真发请求（她自己读文件、要动手）。一次大概一两分钱。
 *
 * 用法: node tools\试没干完真跑.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')

const 没干完 = require(path.join(脑, '没干完.cjs'))
const 记忆 = require(path.join(脑, '记忆.cjs'))
const { 说话 } = require(path.join(脑, '对话.cjs'))

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

async function 主() {
  const 段号 = 记忆.现在哪一段()
  const 草稿 = 没干完.干活路径(段号)

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   真跑一趟 —— 她干活的时候，那张纸上有字吗')
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  这一段对话：' + 段号)
  console.log('  盯着的文件：' + 草稿)
  console.log('')

  // 跑之前先清干净，免得看到的是上一次留下的
  fs.rmSync(草稿, { force: true })

  let 看到过几次 = 0
  let 最有料的那次 = null

  const 钟 = setInterval(() => {
    try {
      if (!fs.existsSync(草稿)) return
      看到过几次++
      const 这份 = JSON.parse(fs.readFileSync(草稿, 'utf8'))
      // 留"信息最多"的那一版（她动手之后纸上的东西最全）
      const 条数 = (这份.确定的 || []).length + (这份.不知道的 || []).length
      const 旧的条数 = 最有料的那次
        ? (最有料的那次.确定的 || []).length + (最有料的那次.不知道的 || []).length
        : -1
      if (条数 >= 旧的条数) 最有料的那次 = 这份
    } catch {
      /* 正在改名的那一瞬间读不到，正常 */
    }
  }, 40)

  let 结果 = null
  let 炸了 = null
  try {
    结果 = await 说话({
      他说的话:
        '帮我往 记忆\\_试纸条.txt 里写一行字，内容是「纸条测试」。' +
        '用 [写:] 那个标记写，内容放在标记下面的代码块里。',
      历史: [],
      模式: 'work',
      对话编号: 段号,
    })
  } catch (错误) {
    炸了 = 错误
  } finally {
    clearInterval(钟)
  }

  console.log('')
  console.log('  ── 她这一轮说了什么 ──')
  console.log('  ' + ((结果 && 结果.她说的话) || '(没说话)').split('\n').join('\n  ').slice(0, 400))
  console.log('')

  console.log('  ── 那张纸 ──')
  检查('★ 她干活的时候，纸上确实有东西（插桩接上了）', 看到过几次 > 0, `看到了 ${看到过几次} 次`)
  检查('  纸上记着"他要她做什么"', !!(最有料的那次 && 最有料的那次.他说的), JSON.stringify(最有料的那次))
  检查('  记着这是哪一段对话', !!(最有料的那次 && 最有料的那次.对话 === 段号))

  const 动过手的 = 最有料的那次
    ? (最有料的那次.确定的 || []).length + (最有料的那次.不知道的 || []).length
    : 0
  检查(
    '★ 她动手的时候记上了一笔（要动手了 / 动完了 接上了）',
    动过手的 > 0,
    '纸上的动手记录：' + JSON.stringify(最有料的那次 && { 确定的: 最有料的那次.确定的, 不知道的: 最有料的那次.不知道的 }),
  )

  if (最有料的那次) {
    console.log('')
    console.log('  纸上最后长这样：')
    console.log(JSON.stringify(最有料的那次, null, 2).split('\n').map((l) => '    ' + l).join('\n'))
  }

  console.log('')
  console.log('  ── 收工之后 ──')
  检查('这一轮正常走完了（没抛异常）', !炸了, 炸了 && 炸了.message)
  检查('★ 正常收工 → 纸被撕掉了（不会平白留个"没干完"吓他）', !fs.existsSync(草稿))

  // 万一没撕掉，擦干净 —— 不然下次开机他真的会看到"上次有个活儿没干完"
  if (fs.existsSync(草稿)) {
    console.log('  （纸上还有东西，我擦掉，免得污染他真正的 .cache）')
    fs.rmSync(草稿, { force: true })
  }
  fs.rmSync(草稿 + '.正在写', { force: true })

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}`)
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

主().catch((错误) => {
  console.log('  ✗ 脚本自己炸了：' + (错误 && 错误.stack))
  process.exit(1)
})
