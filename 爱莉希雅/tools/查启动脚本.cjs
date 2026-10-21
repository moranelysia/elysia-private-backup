/**
 * 查启动脚本.cjs —— 检查 .cmd / .vbs 里的"命令"有没有中文
 *
 * 【规矩要说准，别搞成一刀切】
 *   不是"文件里一个字中文都不能有"，而是：
 *
 *     .cmd / .vbs  →  **命令部分**不能有中文
 *       因为 cmd.exe 和 Windows Script Host 按系统代码页（936/GBK）
 *       读这些文件，而它们存的是 UTF-8。中文一进命令（包括参数、路径），
 *       字节就错位，跟着的引号被吃掉，**整行断掉**。
 *       但中文在 echo / REM / ' 注释里是无害的 —— 只会打印成乱码，
 *       命令照样跑。（原来的 start-sovits-api.cmd 就一直是这样的，
 *       而且它工作得好好的。）
 *
 *     .cjs / .js   →  中文随便写
 *       Node 读文件是 UTF-8，不会错位。她的整个项目都是中文命名的变量和注释。
 *       （第一版这个检查工具把 .cjs 也扫了，报了一堆假警报，所以写清楚。）
 *
 * 用法: node tools\查启动脚本.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

// 【路径注意】tools\voice 在**工作区**里（D:\新建文件夹\tools\voice），
// 不在她的项目文件夹里（D:\新建文件夹\爱莉希雅\tools\）。
// 所以要往上退两级：__dirname -> tools -> 爱莉希雅 -> 新建文件夹
const 目录s = [
  path.resolve(__dirname, '..', '..', 'tools', 'voice'),
  path.resolve(__dirname, '..', '..'), // 工作区根，也放了些 .cmd
]

/** 这一行算不算"说明"（说明里可以有中文，不影响执行） */
function 是说明(行) {
  const s = 行.trim()
  if (!s) return true
  if (/^@?rem\b/i.test(s)) return true
  if (s.startsWith('::')) return true
  if (/^@?echo\b/i.test(s)) return true
  if (s.startsWith('title ')) return true
  if (s.startsWith("'")) return true // vbs 注释
  return false
}

let 有问题的 = 0
let 查过的 = 0

console.log('')
console.log('  检查 .cmd / .vbs 里的"命令"部分有没有中文')
console.log('  （echo 和 REM 里的中文无害；.cjs 不查 —— Node 读 UTF-8）')
console.log('')

for (const 目录 of 目录s) {
  if (!fs.existsSync(目录)) continue

  const 文件们 = fs
    .readdirSync(目录)
    .filter((名) => /\.(cmd|bat|vbs)$/i.test(名))
    .filter((名) => !名.startsWith('_')) // 临时测试文件不看

  if (!文件们.length) continue
  console.log(`  ── ${目录} ──`)

  for (const 名 of 文件们) {
    const 文本 = fs.readFileSync(path.join(目录, 名), 'utf8')
    const 行们 = 文本.split(/\r?\n/)
    查过的++

    const 坏的 = []
    行们.forEach((行, i) => {
      if (是说明(行)) return
      if ([...行].some((c) => c.codePointAt(0) > 127)) 坏的.push({ 号: i + 1, 内容: 行.trim() })
    })

    const 中文字符数 = [...文本].filter((c) => c.codePointAt(0) > 127).length

    if (坏的.length) {
      有问题的++
      console.log(`  ✗ ${名}  —— 有 ${坏的.length} 行命令带中文：`)
      for (const b of 坏的.slice(0, 3)) console.log(`        第 ${b.号} 行: ${b.内容.slice(0, 60)}`)
    } else {
      const 备注 = 中文字符数
        ? `（有 ${中文字符数} 个中文字符，都在说明里，无害）`
        : '（纯 ASCII）'
      console.log(`  ✓ ${名.padEnd(26)} ${备注}`)
    }
  }
  console.log('')
}

console.log('  ────────────────────────────────────────────')
if (有问题的) {
  console.log(`  ✗ ${查过的} 个文件里，${有问题的} 个有问题。`)
  console.log('    改法：命令里别写中文 —— 用相对路径 %~dp0，或者让 Node 脚本去处理中文。')
} else {
  console.log(`  ✓ ${查过的} 个文件全都没问题。`)
}
console.log('')
