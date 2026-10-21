/**
 * 收摊.cjs —— 把她这一套收干净（给主程序直接调用，不另起进程）
 *
 * 【为什么要单独一个文件】
 *   收摊的活有两处要用：工具（命令行手动跑）和主程序（托盘菜单点"全部关掉"）。
 *   写两份早晚会不一致，所以逻辑放这儿，两边都调它。
 *
 * 【为什么主程序不能再"启动一个脚本来收摊"】
 *   2026-09-29 踩的坑：原来是主程序 spawn(process.execPath, ['全部关掉.cjs'])。
 *   可 **Electron 里 process.execPath 是 electron.exe，不是 node.exe** ——
 *   拿一个 .js 去启动 Electron，它当成"要打开一个 app"，
 *   于是又开了一个 Electron 挂在那儿等（还被"只允许开一个"挡着），
 *   谁也不退。他看到的"点了没反应、12 秒后自己退出"就是这个。
 *
 *   现在改成：主程序**自己**调这儿的函数。它本来就是 Node 环境，
 *   该有的权限都有，何必绕一圈。
 *
 * 【怎么找它们 —— 按特征找，不按进程名杀】
 *   这台机器上还有别的 python 和 node（DSH 自己就是 node），
 *   按名字杀会误伤。所以：
 *     · 桌宠：Bongo Cat Mver.exe 这个名字就她一个，可以按名字杀（最快）
 *     · python / node：必须看命令行，只认 api_v2.py 和 tts-bridge.cjs
 */
'use strict'

const { execFileSync } = require('node:child_process')

const 桌宠名 = 'Bongo Cat Mver.exe'
/** Get-Process 用的是不带 .exe 的名字 */
const 桌宠纯名 = 'Bongo Cat Mver'

/**
 * 这个程序现在开了几个。
 *
 * 【2026-09-29 又栽了一次，所以这里必须写清楚】
 *   原来用的是 tasklist /FI "IMAGENAME eq <名字>" —— 对**带空格的名字**
 *   它答不准：明明在跑，它回"没有运行的任务"。
 *   结果就是"声音关掉了，桌宠没关掉"（他报的正是这个）。
 *
 *   同一个错误已经在 main.js 和 tools\启动桌宠.cjs 里各犯过一次，
 *   这里第三次。所以：**凡是查 Windows 进程，一律用 Get-Process。**
 *   它是按进程对象查的，不经过字符串匹配，空格、引号、代码页都碰不到它。
 */
function 开了几个(进程名) {
  const 纯名 = String(进程名).replace(/\.exe$/i, '')
  try {
    const 出 = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `@(Get-Process -Name '${纯名}' -ErrorAction SilentlyContinue).Count`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    const 个数 = parseInt(String(出).trim(), 10)
    if (Number.isFinite(个数)) return 个数
  } catch {
    /* 问不到就退到下面那个不准的老办法，总比完全没有好 */
  }

  try {
    const 出 = execFileSync('tasklist', ['/NH'], {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    })
    return 出.split('\n').filter((行) => 行.toLowerCase().includes(纯名.toLowerCase())).length
  } catch {
    return 0
  }
}

/**
 * 杀掉这个程序（能一次带走同名的一批）。
 *
 * 【先按名字杀，杀不动就按进程号一个个来】
 *   taskkill /IM 是最直接的。但万一它失灵（权限、名字里带空格之类），
 *   还有一条退路：问出进程号，逐个 kill。
 *   桌宠赖着不走他报过一次，所以这儿要有个兜底。
 */
function 按名字杀(进程名) {
  try {
    execFileSync('taskkill', ['/IM', 进程名, '/F'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 8000,
    })
    return true
  } catch {
    // 走到这儿有两种可能：本来就没在跑（正常），或者 taskkill 没干成。
    // 所以下面再按进程号补一刀 —— 真没在跑的话，那一步什么也不会做。
  }

  // 退路：按进程号逐个杀
  const 纯名 = String(进程名).replace(/\.exe$/i, '')
  try {
    const 出 = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-Process -Name '${纯名}' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    const 号们 = String(出)
      .split(/\s+/)
      .map((x) => parseInt(x, 10))
      .filter((x) => Number.isFinite(x))

    for (const 号 of 号们) {
      try {
        process.kill(号)
      } catch {
        /* 杀不掉就算了，外层会再确认一遍 */
      }
    }
    return 号们.length > 0
  } catch {
    return false
  }
}

/** 问系统要一份进程清单：编号 + 名字 + 命令行，用制表符分开 */
function 列进程() {
  const 脚本 = [
    "$ErrorActionPreference='SilentlyContinue'",
    'Get-CimInstance Win32_Process |',
    "  Where-Object { $_.Name -match 'python|node' } |",
    '  ForEach-Object { "$($_.ProcessId)`t$($_.Name)`t$($_.CommandLine)" }',
  ].join('\n')

  const 出 = execFileSync('powershell', ['-NoProfile', '-Command', 脚本], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 20000,
  })

  const 清单 = []
  for (const 行 of 出.split('\n')) {
    const 干净 = 行.replace(/\r$/, '')
    if (!干净.trim()) continue
    const 段 = 干净.split('\t')
    if (段.length < 2) continue
    清单.push({ 编号: parseInt(段[0], 10), 名字: 段[1] || '', 命令行: 段[2] || '' })
  }
  return 清单.filter((p) => Number.isFinite(p.编号))
}

/** 要靠命令行才认得出来的那两个 */
const 按命令行的 = [
  { 说明: '声音服务（GPT-SoVITS）', 名字含: 'python', 命令行含: 'api_v2.py' },
  { 说明: '转接层（bridge）', 名字含: 'node', 命令行含: 'tts-bridge.cjs' },
]

/** 她这套东西的完整特征表 —— 给"看进程"那个工具共用 */
const 目标 = [
  ...按命令行的,
  { 说明: '桌宠（Bongo Cat）', 名字含: 'bongo', 命令行含: null },
  { 说明: '她本人（界面）', 名字含: 'electron', 命令行含: '爱莉希雅' },
]

/** 这个进程属不属于她那一套 */
function 是她的人(p) {
  for (const 我 of 目标) {
    if (!(p.名字 || '').toLowerCase().includes(我.名字含)) continue
    if (!我.命令行含) return 我
    if ((p.命令行 || '').toLowerCase().includes(我.命令行含.toLowerCase())) return 我
  }
  return null
}

/**
 * 收摊。
 *
 * @param {(一行:string)=>void} [说] 想边做边报告就传一个函数进来
 * @returns {{关了:number, 详情:string[]}}
 */
function 收摊(说 = () => {}) {
  const 详情 = []
  let 关了 = 0

  // ---- 第一步：桌宠（最快、最直接）----
  const 桌宠数量 = 开了几个(桌宠名)
  if (桌宠数量 > 0) {
    按名字杀(桌宠名)
    关了 += 桌宠数量
    const 行 = `桌宠（Bongo Cat）—— 关了 ${桌宠数量} 个`
    详情.push(行)
    说(行)
  } else {
    详情.push('桌宠（Bongo Cat）—— 没在跑')
    说('桌宠（Bongo Cat）—— 没在跑')
  }

  // ---- 第二步：声音服务和转接层（要看命令行）----
  let 清单 = []
  try {
    清单 = 列进程()
  } catch (错误) {
    const 行 = '问不到进程清单: ' + 错误.message.split('\n')[0]
    详情.push(行)
    说(行)
  }

  for (const 我 of 按命令行的) {
    const 命中 = 清单.filter(
      (p) =>
        p.名字.toLowerCase().includes(我.名字含) &&
        (p.命令行 || '').toLowerCase().includes(我.命令行含.toLowerCase()),
    )
    if (!命中.length) {
      详情.push(`${我.说明} —— 没在跑`)
      说(`${我.说明} —— 没在跑`)
      continue
    }
    for (const p of 命中) {
      try {
        process.kill(p.编号)
        关了++
        const 行 = `${我.说明} —— 关掉了（进程 ${p.编号}）`
        详情.push(行)
        说(行)
      } catch (错误) {
        const 行 = `${我.说明}（进程 ${p.编号}）关不掉: ${错误.message}`
        详情.push(行)
        说(行)
      }
    }
  }

  // ---- 第三步：确认桌宠真的走了（它最常赖着不走）----
  const 还剩 = 开了几个(桌宠名)
  if (还剩) {
    按名字杀(桌宠名)
    关了 += 还剩
    const 行 = `桌宠还剩 ${还剩} 个，又杀了一次`
    详情.push(行)
    说(行)
  }

  return { 关了, 详情 }
}

module.exports = { 收摊, 列进程, 是她的人, 目标, 开了几个, 按名字杀, 桌宠名 }
