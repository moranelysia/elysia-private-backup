/**
 * 测编译路径.cjs —— 量清楚"gcc 到底认不认中文路径"
 *
 * 【为什么值得单写一个测试】
 *   2026-10-01 晚上她编了一晚上 C 都没编成，一路在猜：
 *     "这台机器上好像没有 gcc" → "我猜八成是 unistd.h 的事" →
 *     "我干脆别耍聪明了，就写 Windows 版"。
 *   机器上明明装着 gcc 16.2.0。
 *
 *   后来我在这台机器上一格一格试出来，真正的坑是**一个很窄的条件**：
 *     · 给 gcc 的 `-o`（输出文件）写**中文路径** → 挂
 *       报错是 ld.exe: cannot open output file D:\?½??ļ???\... 
 *       —— **报错里那串中文本身就是乱码的**，所以她从报错根本看不出原因
 *     · 源码路径带中文 → 没问题
 *     · 先 cd 进那个目录、用相对文件名 → 没问题
 *     · python、node 都没这毛病，中文路径随便给
 *
 *   这条结论已经写进 脑\工具\命令工具.cjs 的 环境说明() 里（她会读到）
 *   和 脑\工具表.cjs 的跑命令说明里。**但结论是要过期的** ——
 *   哪天 MSYS2 修了、或者换了个 gcc，写死的那段话就变成假话了。
 *   所以拿这个脚本当哨兵：隔一阵跑一次，看世界有没有变。
 *
 *   它只在自己机器上量，不改任何文件，跑完把临时目录擦掉。
 *
 * 用法: node tools\测编译路径.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
// 【为什么不用 execFileSync】沙箱不让进程开命名管道，而 Node 在 Windows 上
// 就是拿命名管道接子进程输出的 —— 于是 execFileSync 在这儿一律 EPERM，
// 报出来的错还特别容易让人以为"是 gcc 的问题"。
// tools\试命令.cjs 改成重定向到文件，两边都能跑。见那个文件开头的量测记录。
const { 试 } = require('./试命令.cjs')

const 项目根 = path.resolve(__dirname, '..')
const 试目录 = path.join(项目根, '_probe')

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

const 源码 = '#include <stdio.h>\nint main(void){ puts("hello"); return 0; }\n'

function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   gcc 认不认中文路径 —— 一格一格试')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  // ---------------------------------------------------------------
  console.log('  ── 零、先看有没有 gcc ──')
  const 版本 = 试('gcc', ['--version'])
  if (版本.拦住了) {
    console.log('  ⚠ 这个环境不让 Node 开子进程（EPERM）—— 在这儿量不了。')
    console.log('    在你的终端里跑这个脚本就行（PowerShell 直接跑 gcc 是好的）。')
    console.log('')
    process.exit(0)
  }
  if (!版本.好) {
    console.log('  ✗ 这台机器上没有 gcc：' + 版本.出.slice(0, 120))
    console.log('')
    process.exit(1)
  }
  console.log('    ' + 版本.出.trim().split('\n')[0])

  // ---------------------------------------------------------------
  //  这个目录名是故意的：带中文。要量"中文路径"就得真有个中文路径。
  fs.rmSync(试目录, { recursive: true, force: true })
  fs.mkdirSync(试目录, { recursive: true })
  fs.writeFileSync(path.join(试目录, 'p.c'), 源码, 'utf8')
  console.log(`    测试目录：${试目录}`)

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 一、-o 写中文绝对路径（预期：**挂**）──')

  const 甲 = path.join(试目录, 'a.exe')
  const 甲果 = 试('gcc', [path.join(试目录, 'p.c'), '-o', 甲], { cwd: 项目根 })
  console.log(`    退出：${甲果.好 ? '成功' : '失败'}`)
  if (!甲果.好) console.log('    它说：' + 甲果.出.trim().split('\n')[0].slice(0, 110))

  检查('中文输出路径确实编不出来（这就是那个坑）', !甲果.好 && !fs.existsSync(甲))

  // 报错里那串中文是不是乱的？（这是我们敢说"你从报错看不出原因"的依据）
  if (!甲果.好) {
    const 报错里有乱码 = /[\ufffd]|Ã|Â|ï¿½/.test(甲果.出) || !甲果.出.includes('新建文件夹')
    检查('报错里的中文是乱码的（所以她看不出原因）', 报错里有乱码)
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 二、cd 进去、用相对文件名（预期：**成**）──')

  const 乙果 = 试('cmd', ['/c', 'gcc p.c -o b.exe'], { cwd: 试目录 })
  const 乙 = path.join(试目录, 'b.exe')
  检查('先切目录 + 相对文件名，编得出来', 乙果.好 && fs.existsSync(乙), 乙果.出.slice(0, 110))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 三、源码带中文、-o 用相对名（预期：**成**）──')

  const 丙果 = 试('gcc', [path.join(试目录, 'p.c'), '-o', 'c.exe'], { cwd: 试目录 })
  const 丙 = path.join(试目录, 'c.exe')
  检查('源码路径带中文没关系', 丙果.好 && fs.existsSync(丙), 丙果.出.slice(0, 110))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 三点五、中文**输出名**（这一格最阴）──')
  //
  // 【为什么专门量这一格 —— 我在这条上写错过两版】
  //   第一版："gcc 不能带中文路径" —— 太粗。
  //   第二版："只有绝对路径才坏，中文文件名没关系" —— 还是错的。
  //   真相：中文输出名**不报错**，gcc 退出码 0 说成功了，
  //         可盘上那个文件其实叫 `²ÂÊý×Ö.exe`（GBK 字节被当成 Latin-1）。
  //         她去找 `猜数字.exe` 找不到，也没有任何提示。
  //   这种"安静地做错"比报错难查十倍，所以必须有一格盯着它。
  fs.writeFileSync(path.join(试目录, '猜数字.c'), 源码, 'utf8')

  const 中果 = 试('gcc', ['猜数字.c', '-o', '猜数字.exe'], { cwd: 试目录 })
  const 想要的名字 = path.join(试目录, '猜数字.exe')
  const 盘上有什么 = fs.readdirSync(试目录)

  console.log(`    源码名 猜数字.c —— gcc 找得到吗：${中果.好 ? '找得到' : '找不到'}`)
  console.log(`    -o 猜数字.exe —— gcc 退出：${中果.好 ? '成功（退出码 0）' : '失败'}`)
  console.log(`    盘上实际躺着：${盘上有什么.filter((f) => f.endsWith('.exe')).join('、') || '（没有 exe）'}`)

  检查('中文**源码**名没问题（gcc 找得到）', fs.existsSync(path.join(试目录, '猜数字.c')))

  检查(
    '中文输出名 → 编出来的东西**不叫那个名字**（这就是那个安静的坑）',
    !fs.existsSync(想要的名字),
    '居然真叫 猜数字.exe 了 —— 那这条坑可能已经被修好，去改 环境说明()',
  )

  // 输出名换成英文，同一份源码立刻就好
  const 好果 = 试('gcc', ['猜数字.c', '-o', 'guess.exe'], { cwd: 试目录 })
  检查(
    '输出名换成英文就好了',
    好果.好 && fs.existsSync(path.join(试目录, 'guess.exe')),
    好果.出.slice(0, 110),
  )

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 四、python / node 有没有同样的毛病（预期：**没有**）──')

  fs.writeFileSync(path.join(试目录, 'p.py'), 'print("py ok")\n', 'utf8')
  fs.writeFileSync(path.join(试目录, 'p.cjs'), 'console.log("js ok")\n', 'utf8')

  const 丁果 = 试('python', [path.join(试目录, 'p.py')], { cwd: 项目根 })
  检查('python 收中文绝对路径没问题', 丁果.好, 丁果.出.slice(0, 110))

  const 戊果 = 试('node', [path.join(试目录, 'p.cjs')], { cwd: 项目根 })
  检查('node 收中文绝对路径没问题', 戊果.好, 戊果.出.slice(0, 110))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 五、跑出来的东西是对的 ──')

  const 跑它 = 试(乙, [])
  检查('编出来的 exe 真能跑，还真印了 hello', 跑它.好 && /hello/.test(跑它.出), 跑它.出.slice(0, 110))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 六、收尾 ──')
  fs.rmSync(试目录, { recursive: true, force: true })
  检查('临时目录擦掉了', !fs.existsSync(试目录))

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 跟写在提示词里的那条对得上' : '   ✗ 世界变了 —— 去改 环境说明() 那段'))
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  结论（她读到的那版就写在 脑\\工具\\命令工具.cjs 的 环境说明() 里）：')
  console.log('    · gcc 的 -o 不能带中文路径')
  console.log('    · 先 cd 进去用相对名就没问题')
  console.log('    · python / node 都没这毛病')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

main()
