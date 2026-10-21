// 启动桌宠.cjs —— 一键把两个程序都拉起来
//
// 启动顺序：
//   1. Bongo Cat Mver  —— 桌面宠物（显示层，负责"看得见她"）
//   2. 我们自己的 Electron 程序 —— 负责对话、记忆、声音
//
// 为什么用 Node 而不是直接写在 .cmd 里：
//   cmd.exe 按系统 ANSI 编码读 .cmd 文件，中文路径很容易被弄乱。
//   Node 读 UTF-8，处理中文路径稳稳的。所以 .cmd 只当一个"双击入口"。
//
// 用法: node tools\启动桌宠.cjs
//      （平时不用手动跑它 —— 双击桌面上那个图标，
//         start-all.cjs 会按顺序把她和桌宠都叫起来）

'use strict'

const { spawn, execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// ============================================================
// 两个程序在哪（路径里有中文，所以用 Node 来启动 —— 它处理得了）
// ============================================================

// ⚠ 2026-09-26 深夜改：这里原来写的是「A-爱莉-无表情版」，那是错的。
//
//   他报「她不会做动作」，查出来根子在这儿：
//   无表情版的 config.json 里，键鼠模式（standard）那一块的
//   "l2d_expression" 是 **空的 []** —— 也就是"没有把任何表情挂到按键上"。
//   所以按 Alt+Q 它收到了，但不知道该干什么，就什么都不发生。
//
//   带表情版三种模式全挂满了：4 个表情形态 + 22 个动作 + 3 段语音，
//   文件也全（img\standard 里 26 个 motion3.json，无表情版一个都没有）。
//
//   教训：**"看起来能用"和"真的能用"是两件事。**
//   无表情版能跑、能跟着打字，所以一直没人怀疑它。
// 【2026-10-09 改成跟着工作区走 —— 原来这两个路径写死在 D 盘】
//   搬到 F 盘工作区之后，"启动桌宠"这一环还在往 D 盘找桌宠 ——
//   那等于没搬：人格和学习区在 F 盘，桌宠却仍旧依赖 D 盘。
//   现在问 脑\配置.cjs（它已经算好工作区在哪了），跟 main.js 用同一份答案。
//   ⚠ 别在这儿再写死盘符：工作区搬一次就得改一次，而且改的时候不一定想得起来。
const 配置 = require(path.join(__dirname, '..', '脑', '配置.cjs'))
const 有表情版 = path.join(配置.工作区根, 'zhuochong', 'A-爱莉-带表情版')
const 无表情版 = path.join(配置.工作区根, 'zhuochong', 'A-爱莉-无表情版')

// 先用有表情版；万一它被删了，退回无表情版（至少她还在桌面上）
const 桌宠目录 = fs.existsSync(path.join(有表情版, 'Bongo Cat Mver.exe')) ? 有表情版 : 无表情版
const 桌宠 = path.join(桌宠目录, 'Bongo Cat Mver.exe')

const 我们的项目 = path.resolve(__dirname, '..')
// v12 已由 Electron 主程序直接管理；旧 Bongo 只保留作手动回退，不再随正式启动链拉起。
const 使用Live2D = true

/**
 * 数一数这个程序开了几个。
 *
 * 【2026-09-27 修过一次 —— 这个函数原来会安静地答错】
 *   原来用的是：
 *     tasklist /FI "IMAGENAME eq Bongo Cat Mver.exe" /NH
 *   看着没问题（名字有空格，我加引号了呀），可它对带空格的名字**答不准**，
 *   而且还带一层危险：命令本身一出错，catch 就返回 0 ——
 *   于是"查不出来"和"没在跑"变成同一个答案。
 *
 *   后果就是他看到的：**桌宠有时候会开出两只**。
 *   因为这里答"没在跑"，启动流程就以为该拉一个，
 *   可它其实已经在跑了。
 *
 *   现在改成问 PowerShell 的 Get-Process：那是按**进程对象**查的，
 *   不经过字符串匹配那一层，空格、引号、代码页都碰不到它。
 */
function 在跑几个(进程名) {
  const 纯名 = String(进程名).replace(/\.exe$/i, '')

  // 办法一：问 PowerShell（准）
  try {
    const 输出 = execSync(
      `powershell -NoProfile -Command "@(Get-Process -Name '${纯名}' -ErrorAction SilentlyContinue).Count"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    const 个数 = parseInt(String(输出).trim(), 10)
    if (Number.isFinite(个数)) return 个数
  } catch {
    /* 问不到就退到办法二 */
  }

  // 办法二：老办法（不带过滤器，自己在结果里数）
  try {
    const 输出 = execSync('tasklist /NH', {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    })
    return 输出.split('\n').filter((行) => 行.toLowerCase().includes(纯名.toLowerCase())).length
  } catch {
    return 0
  }
}

/** 看看某个 exe 是不是已经在跑了 */
function 在跑吗(进程名) {
  return 在跑几个(进程名) > 0
}

/** 用哪一版：看它 config.json 里有没有挂表情（判断逻辑跟 tools\查桌宠配置.cjs 一样） */
function 这一版有表情吗(目录) {
  try {
    const 配置 = JSON.parse(洗JSON(fs.readFileSync(path.join(目录, 'config.json'), 'utf8')))
    const 键鼠 = 配置.standard || {}
    const 数量 = (键鼠.l2d_expression || []).length + (键鼠.l2d_motion_lockhand || []).length
    return 数量
  } catch {
    return 0
  }
}

/** 把带 `//` 注释的 JSON 洗成能解析的（Bongo Cat 的配置里有注释） */
function 洗JSON(文本) {
  let 干净 = ''
  let 在文字里 = false
  let 在转义 = false
  for (let i = 0; i < 文本.length; i++) {
    const 字 = 文本[i]
    if (在文字里) {
      干净 += 字
      if (在转义) 在转义 = false
      else if (字 === '\\') 在转义 = true
      else if (字 === '"') 在文字里 = false
      continue
    }
    if (字 === '"') {
      在文字里 = true
      干净 += 字
      continue
    }
    if (字 === '/' && 文本[i + 1] === '/') {
      while (i < 文本.length && 文本[i] !== '\n') i++
      干净 += '\n'
      continue
    }
    if (字 === '/' && 文本[i + 1] === '*') {
      i += 2
      while (i < 文本.length && !(文本[i] === '*' && 文本[i + 1] === '/')) i++
      i++
      continue
    }
    干净 += 字
  }
  return 干净.replace(/,(\s*[}\]])/g, '$1')
}

/** 启动一个程序，但不挡住当前脚本（detached + unref = 独立运行） */
function 启动(命令, 参数, 工作目录, 说明, 输出到 = null) {
  console.log(`  → 启动${说明}`)
  console.log(`    ${命令}`)
  const 子进程 = spawn(命令, 参数, {
    cwd: 工作目录,
    detached: true, // 不跟着这个脚本一起退出
    stdio: 输出到 ? ['ignore', 输出到, 输出到] : 'ignore',
    shell: false,
  })
  子进程.on('error', (错误) => {
    console.log(`  ✗ ${说明}没起来: ${错误.message}`)
  })
  子进程.unref()
  return 子进程
}

/**
 * 启动她自己（Electron）。
 *
 * 【为什么要单独一个函数，而不是用上面那个 启动()】
 *   因为她这套代码和程序在中文路径下面（D:\新建文件夹\爱莉希雅）。
 *   原来这里是让 cmd 去执行这样一行：
 *     cmd /k "cd /d "D:\新建文件夹\爱莉希雅" && "...\electron.exe" ."
 *   实测会失败，日志里只留一句：
 *     文件名、目录名或卷标语法不正确。
 *   （cmd 拿到那串中文路径时语法就散了，程序根本没起来。
 *     他 2026-09-26 晚上遇到的就是这个："弹出终端之后卡退了"。）
 *
 *   现在的做法：Node 直接启动 electron.exe，
 *   中文路径通过 cwd 参数传（Node 内部用 Unicode 传，不走命令行文本），
 *   全程不经过 cmd。Electron 也不知道自己在中文路径下，照样跑。
 *
 * 【2026-09-26 深夜又改了一次：中间垫一层 cmd /c】
 *   直接 spawn(electron) 的后果是 —— Electron 会**共用这个脚本所在的
 *   那个黑窗口的控制台**。脚本跑完、字都打完了，那个窗口还赖在屏幕上，
 *   空的，标题只剩 C:\Windows\system32\cmd.exe。
 *   他截了张图问我"为什么会出现这个空白的终端"，就是这个。
 *
 *   垫一层 cmd /c 之后，cmd 给自己开一个**独立的、隐藏的**控制台
 *   （windowsHide: true），Electron 继承那个，跟我们的窗口断开。
 *   她的输出照样写进日志文件，想看随时打开。
 */
function 启动她自己(项目目录, 日志句柄) {
  const electron = path.join(项目目录, 'node_modules', 'electron', 'dist', 'electron.exe')

  console.log('  → 启动她本人（Electron）')
  console.log('    ' + electron)

  if (!fs.existsSync(electron)) {
    console.log('  ✗ 找不到 electron.exe —— 在项目文件夹里跑一次 npm install')
    return null
  }

  const 子进程 = spawn('cmd', ['/c', electron, '.'], {
    cwd: 项目目录, // ← 中文路径走这里，不塞进命令行
    detached: true,
    stdio: 日志句柄 ? ['ignore', 日志句柄, 日志句柄] : 'ignore',
    windowsHide: true, // ← 这一句是"别再留一个空窗口"的关键
  })

  子进程.on('error', (错误) => {
    console.log('  ✗ 她没起来: ' + 错误.message)
  })
  子进程.unref()
  return 子进程
}

/**
 * 万一桌面上出现了两只（多开），收掉多出来的。
 *
 * 【保哪一只】留**最早启动**的那只 —— 它已经在屏幕上待着了，
 * 收掉它画面会跳一下；多出来的那些是刚起来的，杀掉看不出来。
 *
 * 【为什么要有这个】"多试一条路"这种写法天生带风险：
 * 前一条其实成功了、只是慢，就会开出第二只。
 * 与其指望每次都判断准，不如多一道"收尾"。
 */
function 收掉多余的桌宠() {
  try {
    const 输出 = execSync(
      `powershell -NoProfile -Command "Get-Process -Name 'Bongo Cat Mver' -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -Skip 1 | ForEach-Object { $_.Id }"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    const 要收的 = String(输出)
      .split(/\s+/)
      .map((x) => parseInt(x, 10))
      .filter((x) => Number.isFinite(x))

    for (const 号 of 要收的) {
      try {
        process.kill(号)
        console.log('  收掉了多出来的那只（进程 ' + 号 + '）')
      } catch (错误) {
        console.log('  收不掉 ' + 号 + ': ' + 错误.message)
      }
    }
    return 要收的.length
  } catch (错误) {
    console.log('  收尾的时候出错: ' + 错误.message)
    return 0
  }
}

function main() {
  console.log('')
  console.log('  ============================================')
  console.log('   启动爱莉希雅')
  console.log('  ============================================')
  console.log('')

  // 她的输出（包括报错）除了打在屏幕上，也留一份到文件里。
  // 为什么：.cmd 那个黑窗口一关，报错就跟着没了，想回头查都没有。
  //
  // 【2026-10-04 改：原来这儿是 'w'，每次启动都把上一份擦掉】
  //   擦掉的后果很具体：她昨天下午报了一次错，我今天想看，
  //   打开文件只有今天早上开机那几行 —— **现场没了**。
  //   所以改成 'a'（往后接），并且每次进来先写一行"这是哪一次启动"，
  //   这样翻旧账的时候能看出中间重启过几回。
  //   文件也不能无限长：超过 2 MB 就把当前这份挪成 .上一份.log，重开一份。
  const 日志目录 = path.join(我们的项目, '.cache')
  fs.mkdirSync(日志目录, { recursive: true })
  const 日志路径 = path.join(日志目录, '她启动时的输出.log')
  try {
    if (fs.statSync(日志路径).size > 2 * 1024 * 1024) {
      fs.renameSync(日志路径, path.join(日志目录, '她启动时的输出.上一份.log'))
    }
  } catch {
    /* 还没有这个文件，那就更不用挪了 */
  }
  const 她日志 = fs.openSync(日志路径, 'a')
  // 这行是**这次启动**的分界。写在她的输出前面，中间隔两个空行好认。
  fs.writeSync(
    她日志,
    `\n\n---------- 启动 ${new Date().toLocaleString('zh-CN')} ----------\n`,
  )
  console.log('  她的输出会往后接在: .cache\\她启动时的输出.log')
  console.log('')

  // ---------- 0. 先把上一轮没关干净的她收掉 ----------
  // 为什么必须做这件事：
  //   她这个程序有"只允许开一个"的设定（不然会有两个托盘图标、两份记忆打架）。
  //   所以只要**旧的还活着**，新启动的那个会一声不响地自己退出 ——
  //   表现就是"双击了，什么都没发生"。他 2026-09-26 晚上就卡在这儿。
  const 旧的数量 = 在跑几个('electron.exe')
  if (旧的数量 > 0) {
    console.log(`  [0/2] 发现上一轮的她还在跑（${旧的数量} 个进程），先收掉……`)
    try {
      execSync('taskkill /IM electron.exe /F', { stdio: ['ignore', 'ignore', 'ignore'] })
      // 等系统把进程真的收干净，不然紧接着启动还会撞上那把锁
      const 等 = (毫秒) => {
        const 到点 = Date.now() + 毫秒
        while (Date.now() < 到点) {
          /* 空转等一会儿 */
        }
      }
      等(800)
      console.log('        收掉了。')
      console.log('')
    } catch (错误) {
      console.log('        ✗ 没收掉：' + 错误.message)
      console.log('          你自己在任务管理器里把 electron 结束一下。')
      console.log('')
    }
  }

  // ---------- 1. 身体 ----------
  if (使用Live2D) {
    console.log('  [1/2] Live2D v12 由 Agent 主程序直接管理 —— 不再启动旧 Bongo Cat')
    console.log('')
  } else {
  const 表情数 = 这一版有表情吗(桌宠目录)
  console.log('  用的是: ' + 桌宠目录)
  console.log(
    '  这一版挂表情了吗: ' +
      (表情数 > 0 ? `挂了 ${表情数} 个 ✓` : '一个都没挂 ✗（按 Alt+某键不会有反应）'),
  )
  console.log('')

  if (!fs.existsSync(桌宠)) {
    console.log('  ✗ 找不到桌宠:')
    console.log('    ' + 桌宠)
    console.log('')
    console.log('  （它应该在 zhuochong\\A-爱莉-带表情版\\ 里）')
    process.exit(1)
  }

  const 已有 = 在跑几个('Bongo Cat Mver.exe')
  if (已有 === 1) {
    console.log('  [1/2] 桌宠已经在跑了 —— 跳过（不动它，免得多出一只）')
    console.log('')
    console.log('        ⚠ 要是它这会儿跑的是"无表情版"，表情还是不会动。')
    console.log('          办法：托盘右键退出它，再双击一次这个脚本。')
    console.log('')
  } else if (已有 > 1) {
    console.log(`  [1/2] 桌宠已经开了 ${已有} 只 —— 不新开，但会收掉多出来的`)
    console.log('')
  } else {
    console.log('  [1/2] 启动桌宠……')
    // 注意：Bongo Cat 的路径里有个空格（Bongo Cat Mver.exe），
    // spawn 直接传路径是没问题的（不用手动加引号，它不走 shell）
    启动(桌宠, [], 桌宠目录, '桌宠 (Bongo Cat)')
    console.log('')
  }

  // 收尾：不管上面走了哪条路，最后都数一遍。
  // 他 2026-09-26 报过"会启动两个桌宠"，2026-09-27 又说"有概率打开两个"。
  // 与其指望每次都判断准，不如每次都收个尾 —— 多了就收掉，只留最早那只。
  const 桌宠数 = 在跑几个('Bongo Cat Mver.exe')
  if (桌宠数 > 1) {
    console.log(`  ⚠ 桌面上现在有 ${桌宠数} 只桌宠，收掉多出来的（留最早那只）`)
    收掉多余的桌宠()
  }
  }

  // ---------- 2. 我们的程序 ----------
  if (!fs.existsSync(path.join(我们的项目, 'package.json'))) {
    console.log('  ✗ 找不到我们的项目:')
    console.log('    ' + 我们的项目)
    process.exit(1)
  }

  console.log('  [2/2] 启动 Agent 与 Live2D v12……')
  setTimeout(() => {
    // 直接启动，不经过 cmd —— 中文路径走 cwd 传，稳。
    // 想看她那边打印了什么，打开 .cache\她启动时的输出.log
    启动她自己(我们的项目, 她日志)

    console.log('')
    console.log('  ============================================')
    console.log('   都起来了。')
    console.log('')
    console.log('   · 桌面上的爱莉（Live2D v12）：由 Agent 的表现事件直接控制')
    console.log('   · 她本人：在那朵粉色的小花上（右下角托盘，可能要展开才看得见）')
    console.log('')
    console.log('   关掉它们：')
    console.log('     · 她的窗口  → 按 Esc 或点 X（只是收起来）')
    console.log('     · 她本人    → 托盘图标右键 → 退出')
    console.log('     · Live2D    → 跟随她本人一起退出')
    console.log('  ============================================')
    console.log('')
    console.log('  （这个黑窗口可以关掉了，不影响她。）')
    console.log('')
  }, 使用Live2D ? 100 : 1500)
}

main()
