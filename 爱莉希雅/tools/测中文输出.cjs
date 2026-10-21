/**
 * 测中文输出.cjs —— 量"她写的 C 程序在 cmd 里为什么是乱码"
 *
 * 【现场】
 *   2026-10-01 晚上她写了个猜数字的 C 程序，逻辑一点没错 ——
 *   scanf 读不到数字会把那行剩下的字符吃掉（不然死循环）、
 *   注释讲的是"为什么这么写"、结尾两个 getchar 的用意也交代了。
 *   他双击跑起来，屏幕上却是：
 *     錕覺先獺戒簡涓€涓? 1 錢?100 鑷勭喌嚙... 鐝噯..鍑嗗'...
 *   他一眼就说"这程序有问题"。其实**程序没问题，是输出编码错了**。
 *
 * 【错的到底是什么】
 *   她的源码是 UTF-8 存的（整个项目都写 UTF-8），gcc 把字符串里的字节
 *   原样编进 exe。而 cmd 的控制台默认代码页是 936（GBK），
 *   它拿 GBK 去解那串 UTF-8 字节 —— 于是 `一`（E4 B8 80）被读成 `涓€`。
 *   跟这个项目里踩过好几回的 `.cmd` 里不能写中文，是同一类病。
 *
 * 【这个脚本量什么】
 *   一、UTF-8 的源码编出来，吐的字节到底是不是 UTF-8（确认病因）
 *   二、加了 SetConsoleOutputCP(CP_UTF8) 之后，字节变不变
 *      （不变 —— 因为它改的是**控制台怎么解**，不是程序吐什么。
 *        所以这一格量的是"药有没有副作用"，不是"药有没有效"：
 *        疗效只能在真窗口里用眼睛看。）
 *   三、纯英文输出的程序，有没有这个毛病（没有）
 *
 * 用法: node tools\测中文输出.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { 试 } = require('./试命令.cjs')

const 试目录 = path.join(path.resolve(__dirname, '..'), '_enc-probe')

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

/** 那句中文，量字节用的 */
const 中文 = '我想好了一个数'
//
// 【为什么不用 Buffer.from(中文, 'gbk') 去比】
//   Node 的 Buffer 不认 'gbk' 这个编码名（只认 utf8/latin1/base64…），
//   试的时候当场报 ERR_UNKNOWN_ENCODING。
//   好在不用比也能说明问题：试命令.cjs 是按 UTF-8 把输出读回来的，
//   要是程序吐的是 GBK，读回来就是一串 U+FFFD（�），
//   那句中文**根本对不上**。所以"读回来能对上"本身就等于"吐的是 UTF-8"。

/** 一份最简单的：只有一句中文输出，没有输入，不会卡住 */
function 源码(额外 = '') {
  return (
    '#include <stdio.h>\n' +
    (额外.includes('SetConsoleOutputCP') ? '#include <windows.h>\n' : '') +
    'int main(void)\n{\n' +
    (额外 ? '    ' + 额外 + '\n' : '') +
    `    printf("${中文}\\n");\n` +
    '    return 0;\n' +
    '}\n'
  )
}

function 编一个(名字, 内容) {
  fs.writeFileSync(path.join(试目录, 名字 + '.c'), 内容, 'utf8')
  const 果 = 试('gcc', [名字 + '.c', '-o', 名字 + '.exe'], { cwd: 试目录 })
  return 果.好
}

function 跑一个(名字) {
  return 试(path.join(试目录, 名字 + '.exe'), [], { cwd: 试目录 })
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   她写的 C 程序，在 cmd 里为什么是乱码')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  // 先看看有没有 gcc
  const 有gcc = 试('gcc', ['--version'])
  if (有gcc.拦住了) {
    console.log('  ⚠ 这个环境不让开子进程，量不了。')
    console.log('')
    process.exit(0)
  }
  if (!有gcc.好) {
    console.log('  ✗ 没有 gcc')
    process.exit(1)
  }

  fs.rmSync(试目录, { recursive: true, force: true })
  fs.mkdirSync(试目录, { recursive: true })

  // ---------------------------------------------------------------
  console.log('  ── 一、UTF-8 源码，什么都不加（她默认写出来的样子）──')

  编一个('raw', 源码())
  const 甲 = 跑一个('raw')

  console.log(`    它吐了 ${Buffer.byteLength(甲.出, 'utf8')} 字节`)
  检查('吐出来的就是 UTF-8 的中文（按 UTF-8 读回来，字对得上）', 甲.出.includes(中文), JSON.stringify(甲.出.slice(0, 40)))
  console.log('')
  console.log('    → 所以 cmd（默认代码页 936）拿 GBK 去解这串字节，')
  console.log('      就变成了 `涓€`、`錕覺` 那种鬼画符。程序没错，编码错了。')

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 二、加上 SetConsoleOutputCP(CP_UTF8) ──')
  //
  // 【为什么这里只能量"没副作用"】
  //   重定向到文件的时候**不经过控制台**，所以代码页设不设，
  //   落到文件里的字节都一样。疗效只能在真 cmd 窗口里用眼睛看。
  //   但"加了之后字节没被搞坏"这件事是量得出来的 —— 得先保证药不伤人。

  编一个('utf8cp', 源码('SetConsoleOutputCP(CP_UTF8);'))
  const 乙 = 跑一个('utf8cp')

  检查('加了 SetConsoleOutputCP 也编得过', 乙.状态 === 0, 乙.出.slice(0, 120))
  检查('字节还是干净的 UTF-8（药没副作用）', 乙.出.includes(中文), JSON.stringify(乙.出.slice(0, 40)))
  console.log('')
  console.log('    → 它改的是「控制台拿哪个编码去解」，不是程序吐什么字节。')
  console.log('      所以 cmd 那边就解对了。这一条的疗效只能靠眼睛验。')

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 三、纯英文输出呢 ──')

  fs.writeFileSync(
    path.join(试目录, 'ascii.c'),
    '#include <stdio.h>\nint main(void){ printf("guess 1 to 100\\n"); return 0; }\n',
    'utf8',
  )
  试('gcc', ['ascii.c', '-o', 'ascii.exe'], { cwd: 试目录 })
  const 丙 = 试(path.join(试目录, 'ascii.exe'), [], { cwd: 试目录 })
  检查('纯英文没有任何编码问题', 丙.好 && /guess 1 to 100/.test(丙.出), 丙.出.slice(0, 120))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 四、提示词改完，她真写出来的东西对不对 ──')
  //
  // 【这一格才是真格的】
  //   上面量的是"病是什么"。这一格量的是"药有没有开进方子里" ——
  //   真的叫她写一个会输出中文的 C 程序，看她记不记得设代码页。
  //   （会花几分钱：一次生成。）

  const 生成内容 = require(path.join(path.resolve(__dirname, '..'), '脑', '生成内容.cjs'))
  console.log('    叫她写一个「问名字、然后用中文打招呼」的 C 程序……')

  const 果 = await 生成内容.写({
    要写什么: '一个 C 程序：先打印一行中文提示问用户的名字，读进来，再用中文跟他打招呼',
    路径: 'greet.c',
    机器情况: 'Windows 的 cmd 里跑，用 gcc（MSYS2）编译',
  })

  if (!果.好) {
    console.log('  ✗ 生成失败：' + 果.说明)
    process.exit(1)
  }

  const 设了代码页 = /SetConsoleOutputCP\s*\(\s*(CP_UTF8|65001)/.test(果.内容)
  const 有中文 = /[\u4e00-\u9fa5]/.test(果.内容)
  const 用了windows头 = /#include\s*<windows\.h>/.test(果.内容)
  const 纯英文输出 = !/printf\s*\(\s*"[^"]*[\u4e00-\u9fa5]/.test(果.内容)

  console.log(`    写出来 ${果.内容.split('\n').length} 行`)
  检查('确实是带中文的程序（不然这一格白测）', 有中文)
  检查(
    '设了控制台代码页（或者干脆不输出中文）',
    设了代码页 || 纯英文输出,
    设了代码页 ? '' : '没设 SetConsoleOutputCP，而且 printf 里有中文 —— cmd 里会乱码',
  )
  if (设了代码页) 检查('顺带把 windows.h 也 include 了', 用了windows头)

  // 真编一遍，别光看字
  fs.mkdirSync(试目录, { recursive: true })
  fs.writeFileSync(path.join(试目录, 'greet.c'), 果.内容, 'utf8')
  const 编 = 试('gcc', ['greet.c', '-Wall', '-o', 'greet.exe'], { cwd: 试目录 })
  if (!编.拦住了) {
    检查('它编得过（-Wall 不吵）', 编.好, 编.出.trim().split('\n').slice(0, 4).join(' / ').slice(0, 200))
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 五、收尾 ──')
  fs.rmSync(试目录, { recursive: true, force: true })
  检查('临时目录擦掉了', !fs.existsSync(试目录))

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 量清楚了' : '   ✗ 有不对的'))
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  结论（这条要写进她的提示词）：')
  console.log('    · 她写的 C 里如果有中文输出，**必须在 main 开头设一次控制台代码页**：')
  console.log('        #include <windows.h>')
  console.log('        SetConsoleOutputCP(CP_UTF8);')
  console.log('      （源码是 UTF-8，控制台也得按 UTF-8 解，两边得对上）')
  console.log('    · 或者干脆不用中文输出 —— 那就什么毛病都没有')
  console.log('    · python、node 没这个毛病（它们自己处理编码）')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

main().catch((错误) => {
  console.log('✗ 测试自己出错了: ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
})
