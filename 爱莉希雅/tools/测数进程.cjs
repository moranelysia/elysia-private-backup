/**
 * 测数进程.cjs —— 验证"某个程序在不在跑、开了几个"这件事问得准不准
 *
 * 【为什么要单独测这个】
 *   2026-09-26 晚上他报"他会启动两个桌宠"。追下去发现根子在一个
 *   看起来毫无问题的判断上：
 *
 *     tasklist /FI "IMAGENAME eq Bongo Cat Mver.exe" /NH
 *
 *   它**永远说"没有"**，即使 Bongo Cat 明明在跑。
 *   于是启动流程以为第一条路失败了，又走了第二条路 —— 桌面上两只。
 *
 *   更麻烦的是：这个错**不会报错**，它只是安静地答错。
 *   所以必须有个专门测它的地方。
 *
 * 用法: node tools\测数进程.cjs
 *       node tools\测数进程.cjs "Bongo Cat Mver"
 */
'use strict'

const { execSync } = require('node:child_process')

const 名字 = (process.argv[2] || 'Bongo Cat Mver').replace(/\.exe$/i, '')

function 试(说明, 命令, 取法) {
  const 开始 = Date.now()
  try {
    const 出 = execSync(命令, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 })
    const 耗时 = Date.now() - 开始
    const 值 = 取法(出)
    console.log(`  ✓ ${说明}`)
    console.log(`      原始输出: ${JSON.stringify(String(出).trim().slice(0, 80))}`)
    console.log(`      解析结果: ${JSON.stringify(值)}   （${耗时} ms）`)
    return 值
  } catch (错误) {
    const 耗时 = Date.now() - 开始
    console.log(`  ✗ ${说明}`)
    console.log(`      出错: ${错误.message.split('\n')[0]}   （${耗时} ms）`)
    return null
  }
}

console.log('')
console.log('查的目标: ' + 名字)
console.log('')

console.log('【办法一】问 PowerShell 的 Get-Process（现在代码里用的就是这个）')
试(
  'Get-Process',
  `powershell -NoProfile -Command "@(Get-Process -Name '${名字}' -ErrorAction SilentlyContinue).Count"`,
  (出) => {
    const 个 = parseInt(String(出).trim(), 10)
    return Number.isFinite(个) ? 个 : '（解析不出数字）'
  },
)

console.log('')
console.log('【办法二】tasklist 不带过滤器，自己在结果里数')
try {
  const 出 = execSync('tasklist /NH', { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 })
  const 行 = 出.split('\n').filter((x) => x.toLowerCase().includes(名字.toLowerCase()))
  console.log(`  ✓ 数到 ${行.length} 行`)
  for (const 一 of 行.slice(0, 3)) console.log('      [' + 一.trim().slice(0, 70) + ']')
} catch (错误) {
  console.log('  ✗ ' + 错误.message.split('\n')[0])
}

console.log('')
console.log('【办法三】老代码用的那种带过滤器的写法（据说是它坏了，看看错在哪）')
try {
  const 出 = execSync(`tasklist /FI "IMAGENAME eq ${名字}.exe" /NH`, {
    encoding: 'latin1',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 8000,
  })
  console.log('  原始输出: ' + JSON.stringify(出.trim().slice(0, 120)))
  console.log('  老代码会判断: ' + 出.toLowerCase().includes((名字 + '.exe').toLowerCase()))
} catch (错误) {
  console.log('  ✗ 这个写法直接出错了: ' + 错误.message.split('\n')[0])
  console.log('    （它一出错就必须有个 catch 兜住，否则整个判断就是"永远说没有"）')
}

console.log('')
console.log('结论（写在这儿，免得下次又忘）：')
console.log('  真正的证据来自他机器上的日志，不是这个脚本 —— 里面写着：')
console.log('      → 用 launch-pet.cmd 拉起桌宠（最稳的一条路）')
console.log('      （没起来，换下一条路）      ← 其实起来了，是问早了')
console.log('      → 改用系统打开的方式…… ✓ 桌宠起来了   ← 于是第二只')
console.log('')
console.log('  所以根因是"问早了"（Bongo Cat 要加载 62 MB，好几秒才出现），')
console.log('  不是 tasklist 坏。两处都已经改：')
console.log('    · 等它出现()：每 400 毫秒问一次，最多等 10 秒')
console.log('    · 每次启动完都数一遍，多出来的收掉，只留最早那只')
console.log('')
console.log('  注意：这个脚本在我（DSH）这边的沙箱里跑不出结果 ——')
console.log('  沙箱不允许 Node 开子进程（EPERM），三条路都会失败。')
console.log('  这不是脚本坏了，是环境限制。要看真实结果，在他机器上跑。')
console.log('')
