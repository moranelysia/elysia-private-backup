/**
 * 测「环境事实运行时去问、不许写死」这条规矩有没有生效。
 *
 * 用同一句话（跟当时让她写 a.c / b.c 时一模一样）重新生成一遍，
 * 然后盯着看：她是又 #define 了一个 80x24，还是真的去问系统要窗口尺寸。
 *
 * 不改任何文件，只在终端里打出来。
 *
 * 跑法（在 D:\新建文件夹\爱莉希雅 目录下）：
 *   node tools\测环境事实.cjs
 */

const path = require('path')

const 脑 = path.join(__dirname, '..', '脑')
const 生成内容 = require(path.join(脑, '生成内容.cjs'))
const 命令工具 = require(path.join(脑, '工具', '命令工具.cjs'))

// 跟真正干活时喂给她的机器情况一模一样（别在这儿另编一份，那就不是同一个条件下比了）
let 机器情况 = 'Windows'
try {
  机器情况 = 命令工具.环境说明()
} catch (错) {
  console.log('（拿不到环境说明，用兜底的）' + 错.message)
}

// 就是当初那一句，一个字不改 —— 要比就得同一个题目比
const 题目 = '一个满屏星星往下飘的 C 程序'

;(async () => {
  console.log('题目：' + 题目)
  console.log('—'.repeat(60))

  const 开始 = Date.now()
  const 果 = await 生成内容.写({
    要写什么: 题目,
    类型: 'C 程序',
    路径: 'stars.c',
    机器情况,
  })

  if (!果.好) {
    console.log('没写出来：' + 果.说明)
    process.exit(1)
  }

  console.log(果.内容)
  console.log('—'.repeat(60))
  console.log(果.说明)
  console.log('用时 ' + ((Date.now() - 开始) / 1000).toFixed(1) + ' 秒')

  // ---- 自己当一回检查员 ----
  //   「编译过」不算数，得看它有没有把环境写死。
  const 正文 = 果.内容
  const 抓到 = []

  // 写死的窗口宽高：这是当初 B 版翻车的地方
  const 写死宽高 = 正文.match(/#define\s+(WIDTH|HEIGHT|COLS|ROWS|COLUMNS|LINES|宽|高)\s+\d+/gi)
  if (写死宽高) 抓到.push('写死了宽高：' + 写死宽高.join('、'))

  // 有没有真的去问系统
  const 问系统的办法 = [
    'GetConsoleScreenBufferInfo',
    'GetSystemMetrics',
    'ioctl',
    'TIOCGWINSZ',
    'GetCurrentDirectory',
    'getcwd',
    'time(',
    'GetLocalTime',
    'GetTickCount',
  ]
  const 用上的 = 问系统的办法.filter((名) => 正文.includes(名))

  console.log('')
  if (用上的.length) console.log('✓ 运行时去问了：' + 用上的.join('、'))
  else console.log('✗ 一处都没问系统 —— 尺寸八成是写死的')

  if (抓到.length) {
    console.log('✗ ' + 抓到.join('；'))
  } else {
    console.log('✓ 没抓到写死的宽高')
  }

  // 顺手看一眼有没有把窗口尺寸当常量算坐标
  if (/80/.test(正文) || /24/.test(正文)) {
    console.log('… 正文里出现了 80 或 24，自己看一眼是不是兜底默认值（兜底可以接受）')
  }
})().catch((错) => {
  console.log('跑挂了：' + (错 && 错.stack ? 错.stack : 错))
  process.exit(1)
})
