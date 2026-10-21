/**
 * start-all.cjs —— 「全部启动」的总指挥
 *
 * 【为什么要有这个文件】
 *   你想双击一个图标，她整套就都起来了。可外面那个 start-all.cmd
 *   里**一个字中文都不能写**（cmd.exe 按 GBK 解码，中文会断行）。
 *   偏偏要启动的东西名字都是中文：
 *     · tools\voice\start-voice-only.cmd   （她的声音）
 *     · 爱莉希雅\tools\启动桌宠.cjs          （桌宠 + 她自己）
 *
 *   所以分工是这样：
 *     start-all.cmd  只写一行 `node "start-all.cjs"` —— 纯 ASCII，绝对不会坏
 *     这个文件        用 Node 去叫那些中文名字的东西 —— Node 读 UTF-8，稳
 *
 * 【2026-09-26 深夜改过一件重要的事：不再启动 DSH】
 *   原来这里叫的是「启动爱莉希雅.cmd」——那是 9 月 19 号给 DSH 写的
 *   总启动器，它第二步就是"DSH 没在跑就把它起来"。
 *   我当时图省事借了它，结果他重启电脑之后双击图标，
 *   屏幕上冒出一个 DSH，他问"为什么我打开这个软件会把 DSH 打开"。
 *
 *   **独立版不需要 DSH。** 她自己就能跟模型说话，记忆在自己文件夹里，
 *   声音走本地那两个服务。DSH 是另一个入口（浏览器里那个），
 *   想用的时候单独开 —— 不该被她顺带拖出来。
 *
 * 【顺序】
 *   1. 起桌宠（她的身体）
 *   2. 起她自己（托盘上那朵花）
 *   测试阶段默认不加载声音；需要声音时用 start-all.cmd --voice。
 *
 * 用法: node start-all.cjs
 */
'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const 工作区 = __dirname

function 说(...内容) {
  // 注意变量名不能叫 行 —— 参数是 ...行 的话，
  // for (const 行 of 行) 会变成"在同一个名字初始化之前用它"，跑到最后就崩。
  // （这个坑真踩了一次，所以写在这儿。）
  for (const 一句 of 内容) console.log(一句)
}

/** 跑一个东西，等它结束（输出直接显示出来） */
function 跑(命令, 参数, 工作目录) {
  return new Promise((完成) => {
    const 子进程 = spawn(命令, 参数, { cwd: 工作目录, stdio: 'inherit', windowsHide: false })
    子进程.on('error', (错误) => {
      说('  ✗ 起不来: ' + 错误.message)
      完成(1)
    })
    子进程.on('exit', (码) => 完成(码 === null ? 1 : 码))
  })
}

/** 声音本体在不在（9880 有回应就说明在加载、或者已经好了） */
async function 声音在吗() {
  return await 端口有回应('http://127.0.0.1:9880/docs')
}

/**
 * 转接层在不在（9881）。
 *
 * 【为什么必须单独查它 —— 2026-10-01 深夜踩的】
 *   她的程序**只跟 9881 打交道**（见 脑\语音.cjs：9880 是本体，
 *   9881 是翻译官，她的程序不去直连本体）。
 *   实测撞上过：9880 起来了、9881 没起来 —— 她照样一声不吭。
 *   所以"声音在不在"这个问题必须问两遍，少问一遍就等于没查。
 */
async function 转接在吗() {
  return await 端口有回应('http://127.0.0.1:9881/')
}

async function 端口有回应(地址) {
  try {
    const 回应 = await fetch(地址, { signal: AbortSignal.timeout(1500) })
    return 回应.status < 500
  } catch {
    return false
  }
}

/** 干等一会儿（等外部进程冒头用） */
function 静等(毫秒) {
  return new Promise((完成) => setTimeout(完成, 毫秒))
}

/** 这个文件存在、而且里面有东西吗 */
function 有东西(路径) {
  try {
    return fs.existsSync(路径) && fs.statSync(路径).size > 0
  } catch {
    return false
  }
}

/**
 * 把一个服务在"没有窗口"的情况下拉起来，输出同时写进日志。
 *
 * 【它干的事】
 *   node run-logged.cjs <日志> <程序> <参数...>
 *   —— 就这么一层。run-logged.cjs 会一直守着那个程序，
 *      程序吐一行它转一行（屏幕 + 日志文件）。
 *
 * 【为什么要 detached + unref】
 *   这个黑窗口（start-all）装完就自己关了。不 detach 的话，
 *   它一关，python 也跟着被带走 —— 那就成了"启动完就没声音"。
 *
 * 【stdio 为什么全给一个文件，而且每次重写、按服务分开】
 *   启动器（还有它守着的那个程序）的输出不留着，出问题就只能猜。
 *   但这里有个坑，2026-10-03 才看明白：
 *     run-logged.cjs 是"程序吐一行它转一行"，**它把守着的那程序的输出
 *     也写进自己的 stdout** —— 而 stdout 就是这个文件。
 *     所以用追加模式的话，python 每合成一句话都往里加一行，
 *     这个文件会一直长下去，永远没人清理。
 *   改成：
 *     · 每次起服务**重写**（'w'），它只装这一次启动的输出
 *     · **按服务分开** —— 两个服务共用一个文件的话，
 *       后起的那个会把先起的盖掉，出问题只看得见一半
 *   （真正长期留档的是 D:\GPT-SoVITS\elysia-voice-988x.log 那两个。）
 *
 * 【windowsHide 才是"没有黑窗口"的正主】
 *   不用 VBScript、不用 start /MIN、不用 powershell -WindowStyle。
 *   Node 的 windowsHide 走的是 CREATE_NO_WINDOW —— 从创建起就没有窗口，
 *   不会闪一下。（原来那套五层套娃就是为了这个，白绕了。）
 */
function 隐藏拉起({ 日志, 程序, 参数, 工作目录 }) {
  const 看门狗 = path.join(工作区, 'tools', 'voice', 'run-logged.cjs')
  // 名字跟着服务走：elysia-voice-9880.log → elysia-9880-启动.log
  const 哪一号 = (path.basename(日志).match(/(\d{4})/) || [])[1] || 'x'
  const 启动记录 = path.join(os.tmpdir(), `elysia-${哪一号}-启动.log`)

  let 记录句柄 = null
  try {
    记录句柄 = fs.openSync(启动记录, 'w')
  } catch {
    /* 打不开就丢弃它的输出，不影响主流程 */
  }

  // python 要靠 PATH 找到它自己那一堆 dll；bridge 是纯 node，不用加。
  // （所以这里是"有 runtime 目录才加"，不是无脑拼一段不存在的路径进去。）
  const 自带运行时 = path.join(工作目录, 'runtime')
  const 新PATH = fs.existsSync(自带运行时)
    ? 自带运行时 + ';' + (process.env.PATH || '')
    : process.env.PATH

  const 子 = spawn(process.execPath, [看门狗, 日志, 程序, ...参数], {
    cwd: 工作目录,
    windowsHide: true,
    detached: true,
    stdio: 记录句柄 === null ? 'ignore' : ['ignore', 记录句柄, 记录句柄],
    env: { ...process.env, PATH: 新PATH },
  })
  子.on('error', (错误) => 说('  ✗ 起不来：' + 错误.message))
  子.unref()
  return 子
}

async function main() {
  const 要显示声音窗口 = process.argv.includes('--显示声音窗口')
  const 要启动声音 = process.argv.includes('--voice') ||
    process.argv.includes('--声音') ||
    要显示声音窗口

  说('')
  说('  ============================================================')
  说('   启动爱莉希雅')
  说('  ============================================================')
  说('')

  // ---------- 可选：她的声音 ----------
  //
  // 【2026-10-01 深夜重写过 —— 原来是五层套娃，现在是两层】
  //
  //   原来那条链子（9 月 29 日搭的，一直没成功过）：
  //     start-all.cjs → cmd → wscript → run-hidden.vbs → cmd → node → python
  //   为什么要那么绕：想让她那两个窗口**根本不出现**。Windows 上能做到
  //   "从创建起就不显示窗口"的办法不多，当时选了 VBScript 的 SW_HIDE。
  //
  //   结果：他用了两天，某天才发现"怎么没声音了"。查下去才发现
  //   D:\GPT-SoVITS 里最后一次有动静是 9 月 29 日 21:17 —— 而那条隐藏链子
  //   是 21:21 搭的，**搭好之后一次都没成功过**，而且失败在一个谁也
  //   看不见的黑窗口里。（判据：它必须写的 elysia-voice-9880.log 压根不存在。）
  //
  //   【为什么现在能砍掉三层】
  //     那两个窗口要不要出现，其实 Node 一个参数就管了：
  //       windowsHide: true   —— 子进程从创建起就没有窗口
  //     而"跑起来还活着、输出同时写进日志"这件事，run-logged.cjs 本来就在做。
  //     所以直接把 run-logged.cjs 拉起来就行，中间那三层全是多余的。
  //
  //   顺便：**这台机器上处理中文路径最靠得住的就是 Node**（今晚在 gcc 上
  //   刚验过一轮）。套娃里每一层都要把中文路径从自己手里递给下一层，
  //   少递一次就断在那儿 —— 层数越少，能断的地方越少。
  //
  //   想看窗口（排查用）：start-all.cmd --显示声音窗口，走老路 start-voice-only.cmd。
  if (要启动声音) {
  const 声音目录 = 'D:\\GPT-SoVITS'
  const 看门狗 = path.join(工作区, 'tools', 'voice', 'run-logged.cjs')
  const 声音日志 = path.join(声音目录, 'elysia-voice-9880.log')
  const 转接日志 = path.join(声音目录, 'elysia-voice-9881.log')
  // 启动器自己的输出（run-logged 万一没起来，错在这儿）。
  // 按服务分开，报错的时候两个都提一句，别让他只看见一半。
  const 启动记录 = os.tmpdir()

  说('  [1/3] 她的声音（GPT-SoVITS 9880 + 转接层 9881）')
  说('        窗口：' + (要显示声音窗口 ? '显示（能看加载进度）' : '隐藏（不出现黑窗口）'))

  // 【两个端口要分开看 —— 2026-10-01 深夜补的洞】
  //   原来只查 9880：它一在跑就整个跳过。可这是**两个**服务：
  //     9880  GPT-SoVITS 本体 —— 真正发声的
  //     9881  转接层     —— 她的程序只跟这个打交道（见 脑\语音.cjs）
  //   实测撞上过：他手动起的时候 9880 上来了、9881 没上来，
  //   于是她的程序找不到转接层 —— **还是没声音**。
  //   而按老逻辑，下一次双击图标会因为"9880 已经在跑"而整个跳过，
  //   那个缺掉的 9881 永远不会被补上。所以：**缺哪个补哪个。**
  const 本体在 = await 声音在吗()
  const 转接在 = await 转接在吗()

  if (本体在 && 转接在) {
    说('        两个都在跑了 —— 跳过')
  } else {
    if (本体在 && !转接在) 说('        本体(9880)已经在跑，只差转接层(9881)')
    if (!本体在 && 转接在) 说('        转接层在跑，可本体(9880)不在 —— 重来一次')
    说('        正在起……加载模型要两分半，这期间她只能打字、还不能出声')
    说('        想看进度：双击 tools\\voice\\start-voice-only.cmd')
    说('        想看日志：' + 声音日志)

    let 走到没有 = false

    // 【"要不要窗口"只由他明说决定 —— 2026-10-03 改】
    //
    //   原来是 `if (要显示声音窗口 || !本体在)`。那个 `|| !本体在` 是想"保险"，
    //   实际后果是：**只要模型没在跑，它就默默退回那条会开两个黑窗口的老路。**
    //   他要的恰恰是别出现窗口 —— 结果最需要隐藏的时候，它偏偏不隐藏。
    //
    //   而且它一声不吭：窗口弹出来，他以为是正常的；
    //   这次两个窗口里崩了一个，剩下转接层成了孤儿（9881 在听、9880 没有），
    //   从外面看就是"没声音，但也不知道为什么"。
    //
    //   教训：**兜底方案得说出口，而且别偷偷改掉他明确要过的东西。**
    if (要显示声音窗口) {
      说('        你要看得见的窗口 —— 走老路（两个窗口会留着）')
      const 老启动器 = path.join(工作区, 'tools', 'voice', 'start-voice-only.cmd')
      await 跑('cmd', ['/c', 老启动器], 工作区)
      静等(2500)
      走到没有 = 有东西(声音日志)
    } else if (本体在 && !转接在) {
      // ---- 只缺转接层：单独补它，不动正在加载的本体 ----
      //
      //   为什么不一并重起本体：它要两分半加载三套权重。
      //   为了补一个一秒钟就该起来的转接层，让他白等两分半不值。
      说('        转接层一秒钟就该起来，不用等模型')
      隐藏拉起({
        日志: 转接日志,
        程序: process.execPath,
        参数: [path.join(工作区, 'tools', 'voice', 'tts-bridge.cjs')],
        工作目录: 工作区,
      })
      await 静等(2500)
      走到没有 = 有东西(转接日志)

      if (!走到没有) {
        说('')
        说('  ⚠ 转接层(9881)没起来 —— 她现在还是不出声。')
        说('     启动器自己说的话在这儿（按服务分开的）：'); 说('         ' + path.join(启动记录, 'elysia-9880-启动.log')); 说('         ' + path.join(启动记录, 'elysia-9881-启动.log'))
        说('     我自动再试一次「看得见窗口」那条老路（本体也会一起重来）。')
        说('')
        const 老启动器 = path.join(工作区, 'tools', 'voice', 'start-voice-only.cmd')
        if (fs.existsSync(老启动器)) {
          await 跑('cmd', ['/c', 老启动器], 工作区)
          静等(2500)
          走到没有 = 有东西(转接日志)
        }
      }
    } else {
      // ---- 本体不在（或者两个都不在）：自己拉，不经过任何 .cmd / .vbs ----
      if (!fs.existsSync(看门狗) || !fs.existsSync(path.join(声音目录, 'runtime', 'python.exe'))) {
        说('  ✗ 找不到' + (fs.existsSync(看门狗) ? ' 声音的 python：' + path.join(声音目录, 'runtime', 'python.exe') : ' run-logged.cjs：' + 看门狗))
        说('    （她还能打字，只是没声音）')
      } else {
        隐藏拉起({
          日志: 声音日志,
          程序: path.join(声音目录, 'runtime', 'python.exe'),
          参数: ['-u', 'api_v2.py', '-a', '127.0.0.1', '-p', '9880', '-c', 'GPT_SoVITS\\configs\\tts_infer.yaml'],
          工作目录: 声音目录,
        })

        // 本体要两分半。转接层等一会儿再起（它自己也会等，但别让它一上来空转）。
        await 静等(3000)

        // 【转接层已经在跑的时候不要重复起它】
        //   它绑 9881，再起一个会 EADDRINUSE 当场死。
        //   而原来那个孤儿转接层只要本体回来了就照样能用，留着正好。
        if (!转接在) {
          隐藏拉起({
            日志: 转接日志,
            程序: process.execPath,
            参数: [path.join(工作区, 'tools', 'voice', 'tts-bridge.cjs')],
            工作目录: 工作区,
          })
        } else {
          说('        转接层(9881)已经在跑了，留着不动（它等本体回来就照常工作）')
        }

        await 静等(2500)
        走到没有 = 有东西(声音日志)

        if (!走到没有) {
          说('')
          说('  ⚠ 本体(9880)没起来 —— 她现在还是不出声。')
          说('     启动器自己说的话在这儿（按服务分开的）：'); 说('         ' + path.join(启动记录, 'elysia-9880-启动.log')); 说('         ' + path.join(启动记录, 'elysia-9881-启动.log'))
          说('     我自动再试一次「看得见窗口」那条老路，好看清楚卡在哪儿。')
          说('')
          const 老启动器 = path.join(工作区, 'tools', 'voice', 'start-voice-only.cmd')
          if (fs.existsSync(老启动器)) {
            await 跑('cmd', ['/c', 老启动器], 工作区)
            静等(2500)
            走到没有 = 有东西(声音日志)
          }
        }
      }
    }

    if (走到没有) 说('        ✓ 声音那一步走通了（模型正在加载，约两分半）')
  }
  } else {
    说('  [声音] 测试阶段默认跳过，不加载 GPT-SoVITS')
    说('         需要时可用 start-all.cmd --voice，或单独双击 tools\\voice\\start-voice-only.cmd')
  }

  // ---------- 桌宠和她自己 ----------
  说('')
  说('  [' + (要启动声音 ? '2/3' : '1/2') + '] 桌面上的她（Live2D v12）')
  说('  [' + (要启动声音 ? '3/3' : '2/2') + '] 她本人（托盘上那朵花）')
  说('')

  const 桌宠启动器 = path.join(工作区, '爱莉希雅', 'tools', '启动桌宠.cjs')
  if (!fs.existsSync(桌宠启动器)) {
    说('  ✗ 找不到桌宠启动器: ' + 桌宠启动器)
    process.exit(1)
  }

  await 跑(process.execPath, [桌宠启动器], path.join(工作区, '爱莉希雅'))

  说('')
  说('  ============================================================')
  说('   都起来了。')
  说('')
  说('     · 桌面上的她：Live2D v12，由 Agent 直接控制动作与口型')
  说('     · 她本人    ：右下角托盘上那朵粉色的小花，点一下就能说话')
  说('                   （要是看不见，点任务栏那个 ^ 小箭头，把花拖出来）')
  说('')
  说('   要关掉：')
  说('     · 她   → 她窗口右上角那个 ×，或者那朵花右键退出')
  说('     · Live2D → 跟随她本人一起退出')
  if (要启动声音) {
    说('   那两个声音窗口不能关，关了她就没声音了。')
  } else {
    说('   声音服务这次没有加载；她仍可正常打字聊天。')
  }
  说('')
  说('   （DSH 不在这一套里 —— 想用浏览器里那个她，单独开 dsh.cmd web）')
  说('  ============================================================')
  说('')
}

main().catch((错误) => {
  说('✗ 出错了: ' + 错误.message)
  process.exit(1)
})
