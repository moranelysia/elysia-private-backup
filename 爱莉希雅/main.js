/**
 * main.js —— 这个程序的"主进程"，也是唯一一个一直在跑的东西
 *
 * 【这个文件和以前那版最大的不同】
 *   以前那个窗口是桌面上一直摆着的（透明的、跟着你打字的那只）。
 *   现在按你说的改成了：**平时什么都没有，托盘上有一朵粉色的小花。**
 *   点它一下，才弹出一个小窗口跟你说话；说完点一下别处，它自己收起来。
 *
 *   窗口上那两个按钮**不是一回事**（2026-10-03 改的，以前它们重复）：
 *     「—」收起来 —— 窗口藏起来，她还在托盘后面待命，点一下就回来。
 *     「×」全部关掉 —— 她 + 桌宠 + 声音服务一起散场（会先问一句）。
 *
 *   为什么"收起来"要做到这么顺手（`—`、双击顶栏、Esc 三个入口都能收）：
 *   平时他就是在做别的事，偶尔扭头跟她说一句。要是每次都真的退出，
 *   下次找她还得重新启动、声音还要重新加载两分半 —— 那不是陪着他，
 *   那是每次都要他等。所以**默认动作是"收起来"，"关掉"才需要特意去点。**
 *
 * 【为什么得有个"一直跑着"的东西】
 *   因为窗口关掉之后，那些东西还在：记忆、和模型说话的通道、
 *   跟声音服务和桌宠的连接。总不能每次都重新搭一遍吧。
 *   这个 main.js 就是那个"一直跑着的老板"，窗口只是它开的一扇门。
 *
 * 【主进程 / 渲染进程 是什么】
 *   一句话：主进程是老板（能碰电脑上的东西：开窗口、读文件、跑程序），
 *   窗口里那页网页是员工（只能管自己那一小块画面）。
 *   员工想干别的，得喊老板 —— 这就是 IPC（进程间通信）。
 *   员工喊话的入口写在 preload.js 里。
 *
 * 用法: npm start        （或者双击 tools\启动爱莉.cmd）
 */
'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, Notification, nativeImage, screen, dialog, safeStorage, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// 明确安装版的数据目录名，避免沿用 package.json 的英文内部包名 elysia。
app.setName('爱莉希雅')

// 安装版的程序目录可能是只读的。必须在加载任何“脑”模块之前，
// 把人格、记忆、设置和学习资料指向当前 Windows 用户的数据目录。
if (app.isPackaged || process.env.ELYSIA_USE_USER_DATA === '1') {
  const { 准备用户数据, 应用安装版路径 } = require('./main/user-data.cjs')
  const 用户目录 = process.env.ELYSIA_USER_DATA_ROOT || app.getPath('userData')
  const 角色卡模板 = path.join(__dirname, 'templates', 'elysia.clean.json')
  应用安装版路径(准备用户数据({ 用户目录, 角色卡模板 }))
}

const 脑 = path.resolve(__dirname, '脑')
const 配置 = require(path.join(脑, '配置.cjs'))
const { 创建设置存储 } = require('./main/settings.cjs')
const { 创建密钥存储 } = require('./main/secret-store.cjs')
const 联网搜索 = require(path.join(脑, '联网搜索.cjs'))
const { 在线程里创建备份 } = require('./main/backup-service.cjs')
const { 时间戳: 备份时间戳 } = require('./main/user-backup.cjs')
const { 创建长期记忆导出 } = require('./main/memory-export.cjs')
const { 创建声音启动器 } = require('./main/voice-launcher.cjs')
const { 创建账本跟随调度 } = require('./main/账本跟随.cjs')
const 进程检查 = require('./main/processes.cjs')
const { 说话, 体检, 有哪些模型, 地址: 模型地址, 模型: 默认模型 } = require(path.join(脑, '对话.cjs'))
const { 拿钥匙, 遮住 } = require(path.join(脑, '钥匙.cjs'))
const TTS = require(path.join(脑, 'TTS.cjs')).默认TTS
const ASR = require(path.join(脑, 'ASR.cjs')).默认ASR
const 流式声音请求 = new Map()
const 语音识别请求 = new Map()
const 回复请求 = new Map()
const 声音启动器 = 创建声音启动器({
  工作区根: 配置.工作区根,
  配置文件: path.join(配置.工作区根, 'tools', 'voice', 'voice.json'),
  状态: (超时毫秒) => TTS.status(超时毫秒),
})
const 记忆 = require(path.join(脑, '记忆.cjs'))
const 记忆关系图 = require(path.join(脑, '记忆关系图.cjs'))
const 记忆关系整理 = require(path.join(脑, '记忆关系整理.cjs'))
const 记忆聚类就绪 = require(path.join(脑, '记忆聚类就绪.cjs'))
const 记忆日记 = require(path.join(脑, '记忆日记.cjs'))
const 私密日记 = require(path.join(脑, '私密日记.cjs')).创建私密日记库({ 数据目录: 配置.数据目录 })
const 私密日记调度 = require(path.join(脑, '私密日记调度.cjs')).创建私密日记调度({
  已启用: 配置.私密日记自动生成,
  数据目录: 配置.数据目录,
  取连接: () => {
    const { 钥匙 } = 拿钥匙()
    return { 钥匙, 地址: 模型地址, 模型: process.env.ELYSIA_MEMORY_MODEL || 默认模型 }
  },
})
const 临时记忆 = require(path.join(脑, '临时记忆.cjs'))
const { 晋升到长期 } = require(path.join(脑, '临时记忆晋升.cjs'))
const 工作索引 = require(path.join(脑, '工作索引.cjs'))
const 工作请求 = require(path.join(脑, '工作请求.cjs'))
const 临时对话 = require(path.join(脑, '临时对话.cjs'))
const 用量 = require(path.join(脑, '用量.cjs'))
const 表情路由 = require(path.join(脑, '表情路由.cjs'))
const 情感状态 = require(path.join(脑, '情感状态.cjs'))
const 表现层 = require(path.join(脑, '表现事件.cjs')).创建表现层()
const 主动陪伴 = require(path.join(脑, '主动陪伴.cjs'))
const 主动陪伴生成 = require(path.join(脑, '主动陪伴生成.cjs')).创建生成器()
const 主动陪伴去重 = require(path.join(脑, '主动陪伴去重.cjs'))
const 表达反馈 = require(path.join(脑, '表达反馈.cjs'))
const 确认 = require(path.join(脑, '确认.cjs'))
let 日记首次计时器 = null
let 日记检查计时器 = null
let 关系整理首次计时器 = null
let 关系整理检查计时器 = null
let 聚类就绪首次计时器 = null
let 聚类就绪检查计时器 = null

/** 日记只在后台整理已结束的周期；任何失败都不能挡住启动或聊天。 */
function 唤醒记忆日记() {
  const { 钥匙 } = 拿钥匙()
  return 记忆日记.唤醒({ 钥匙, 地址: 模型地址, 模型: process.env.ELYSIA_MEMORY_MODEL || 默认模型 })
}
// 没干完：她干活干到一半程序断了，纸上会留一条"干到哪儿了"。
// 开机读一次，等她回到那一段对话时塞给她，并且用底下那行小字告诉他一声。
// 见 脑\没干完.cjs 开头 —— 那儿讲清楚了为什么不学 Cyrene 自动接着跑。
const 没干完 = require(path.join(脑, '没干完.cjs'))
// 附件：他发过来的图片和文件。存到 记忆\附件\，图能直接送进请求让她看见。
const 附件 = require(path.join(脑, '附件.cjs'))
// 路径安全：管"她能碰哪儿"（硬边界）+ "哪次动手要不要问他"（软规矩）。
// 2026-10-07 起"要不要问"也归它管 —— 因为"放行的目录"是一种路径规则，
// 跟白名单/禁地放一起才不会打架。
const 路径安全 = require(path.join(脑, '路径安全.cjs'))
// 产物侧栏：只收她成功写出的文件，所有读取仍经过路径安全。
const 产物 = require(path.join(脑, '产物.cjs'))
// 工具记录：把内部的大块结果压成界面可检查的短摘要，只在本次运行内展示。
const 工具记录 = require(path.join(脑, '工具记录.cjs'))
// 故障状态：把网络、模型、权限与本地服务错误收成统一的界面数据。
const 故障状态 = require(path.join(脑, '故障状态.cjs'))
// 学习任务：学习模式下那张"接下来要做什么"的待办清单。
// 【跟进度不是一回事】进度是回头看（学到哪了），任务是往前看（下面做什么）。
const 学习任务 = require(path.join(脑, '学习任务.cjs'))
// 学习进度：进度.md 仍是唯一真相。主进程只负责每次现读、抽出四项给界面，
// 不缓存、不另存一份，所以他手改文件后刷新就能看见。
const 学习进度 = require(path.join(脑, '学习进度.cjs'))
// 学习区在哪、有哪几种模式 —— 都写在 提示词.cjs 里，那是这份知识的唯一一份。
// main.js 不自己拼一遍路径：拼两遍早晚会不一样（改了一处忘另一处）。
const 提示词 = require(path.join(脑, '提示词.cjs'))
const { 做表情, 查表, 大概查表, 表情表 } = require(path.join(__dirname, 'tools', 'bridge.cjs'))

// 让她把表情表里所有的名字都登记进来，路由认名字的时候要用
表情路由.注册认识的名字(表情表)

/**
 * 她现在"是什么形态"（人律 / 妖精 / 女仆 / 侵蚀）。
 *
 * 【为什么程序要记着这个】
 *   因为形态是"一直保持"的：换成女仆之后，接下来每一句她都还是女仆，
 *   不该每说一句就重按一次（重按会把动画从头播一遍，看着像在抽风）。
 *   所以记住"现在是什么"，同一句里认到同样的形态就跳过。
 */
let 当前形态 = '人律形态'

// 桌宠（Bongo Cat）装在这儿，托盘菜单里要用。
//
// ⚠ 2026-09-26 深夜改：原来写的是「A-爱莉-无表情版」—— 那是错的。
//   无表情版的 config.json 里，键鼠模式下的表情绑定是空的（一个都没挂），
//   所以它跟得上你打字，却做不出任何表情。带表情版挂了 30 个。
//   查这个的工具：node tools\查桌宠配置.cjs
const 桌宠目录 = 配置.桌宠目录
const 桌宠程序 = path.join(桌宠目录, 'Bongo Cat Mver.exe')

/** 打包好、能直接用的一张小图标（不想每次启动都现画） */
const 图标文件 = path.join(脑, '图标-32.png')

let 窗口 = null
let 私密日记已打开 = false
let Live2D窗 = null
let Live2D保存定时 = null
let Live2D手势 = null
let Live2D缩放 = 1
let Live2D快聊中 = false
let Live2D快聊原状态 = null
let Live2D待恢复最大化 = false
let 最近表现事件 = null
let 托盘 = null
let 正在说 = false // 她正在回话的时候，别让她同时回两句
let 主动陪伴调度 = null
let 主动陪伴请求 = null
let 主动陪伴最近结果 = { 状态: '尚未尝试', 时间: '', 说明: '' }
let 陪伴界面状态 = { 正在录音: false, 正在播放语音: false, 正在编辑: false, 全屏: false, 勿扰: false }

/** 统一表现事件只含有限状态，不携带聊天正文。没有监听者时发送也是无害的。 */
function 广播表现事件(事件) {
  最近表现事件 = 事件 || 最近表现事件
  if (窗口 && !窗口.isDestroyed() && 事件) 窗口.webContents.send('表现事件', 事件)
  if (Live2D窗 && !Live2D窗.isDestroyed() && 事件) Live2D窗.webContents.send('live2d-表现', 事件)
  return 事件
}

/**
 * 正在等谁点头 —— 键是请求编号，值是那个"兑现承诺"的函数。
 *
 * 她动手之前会在这儿挂起（见 脑\确认.cjs），
 * 他在窗口的卡片上点了，就把它兑现掉。
 */
const 等答复的 = new Map()

// ============================================================
// 托盘上的那个小图标
// ============================================================

/** 拿图标：有现成的就用现成的，没有就现画一张出来（第一次启动时会走这条路） */
function 取图标(尺寸 = 32) {
  try {
    if (尺寸 === 32 && fs.existsSync(图标文件)) return nativeImage.createFromPath(图标文件)
    const { 画图标 } = require(path.join(__dirname, 'tools', '画图标.cjs'))
    return nativeImage.createFromBuffer(画图标(尺寸))
  } catch (错误) {
    console.log('画图标失败，用一张空图代替：' + 错误.message)
    return nativeImage.createEmpty()
  }
}

/**
 * 托盘里点了某个模式 —— 跟界面上那个开关走的是同一条路。
 *
 * 【为什么要单独一个函数，不直接在菜单那三行里写】
 *   三行各写一遍，"改完忘了推给界面"这种错就会犯三次。
 *   收成一个，漏也只漏一处。
 */
function 换这一段模式(模式) {
  const 名 = 选一个模式(模式)
  const 编号 = 记忆.现在哪一段()
  if (临时对话.有(编号)) 临时对话.设模式(编号, 名)
  else 记忆.设这段的模式(编号, 名)
  console.log(`（托盘）这一段的模式改成：${模式中文(名)}`)
  if (窗口 && !窗口.isDestroyed()) {
    窗口.webContents.send('模式变了', { 模式: 名, 工作区: 读设置().工作区 || null })
  }
  // 左边那一列每段后面标着它是哪种模式 —— 改完得把清单推回去
  发对话们(窗口)
  更新托盘菜单()
}

/** 托盘右键菜单 —— 这里顺带当"状态面板"用，她那边什么情况一眼能看见 */
async function 更新托盘菜单() {
  if (!托盘) return

  const 声音 = await TTS.status(600)
  const Live2D在 = Boolean(Live2D窗 && !Live2D窗.isDestroyed() && Live2D窗.isVisible())
  const 设置 = 读设置()
  // 【2026-10-07】模式现在跟着"当前这一段对话"走，不再从设置里读。
  //   设置里那个旧字段只剩兜底作用（老对话没记过模式时用它，见 当前模式()）。
  const 模式 = 当前模式()
  const 干活目录 = 设置.工作区 || null

  /** 路径太长就在前面加省略号 —— 认得出是哪个文件夹的是**尾巴** */
  const 短路径 = (全) => {
    if (!全) return '（默认）'
    return 全.length > 34 ? '…' + 全.slice(-33) : 全
  }

  const 菜单 = Menu.buildFromTemplate([
    { label: 窗口 && 窗口.isVisible() ? '把她收起来' : '和她说说话', click: () => 切换窗口() },
    { type: 'separator' },
    {
      // 模式也放托盘里一份：她窗口收起来的时候，不用把她叫出来就能切。
      // 【2026-10-07 从"点一下两态轮换"改成"三选一"】——
      //   三种模式再轮换就绕了，而且看不出"现在到底是哪种"。
      //   顺带说清楚：切的是**当前这一段**，不是所有对话。
      label: `这一段：${模式中文(模式)}`,
      submenu: [
        {
          label: '聊天（只用嘴）',
          type: 'radio',
          checked: 模式 === 'chat',
          click: () => 换这一段模式('chat'),
        },
        {
          label: '干活（能用工具）',
          type: 'radio',
          checked: 模式 === 'work',
          click: () => 换这一段模式('work'),
        },
        {
          label: '学习（陪他学课）',
          type: 'radio',
          checked: 模式 === 'learn',
          click: () => 换这一段模式('learn'),
        },
      ],
    },
    {
      // 学习模式有自己的学习区（那个不用选，写在 脑\提示词.cjs 里）；
      // 这里管的是"干活模式在哪儿动手"。
      label: 模式 !== 'chat' ? `干活目录：${短路径(干活目录)}` : '干活目录：（切到能动手的模式才能选）',
      enabled: 模式 !== 'chat',
      click: () => 选干活目录(),
    },
    { type: 'separator' },
    {
      label: Live2D在 ? 'Live2D 身体：在（点一下收起来）' : 'Live2D 身体：收着（点这里叫出来）',
      click: () => 切换Live2D(),
    },
    {
      label: '声音服务：' + (声音.在 ? '在线' : '没开（声音要靠你双击启动）'),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: (账本窗 && 账本窗.isVisible() ? '✓ ' : '') + '账本（花了多少 token）',
      click: () => 切换账本(),
    },
    { type: 'separator' },
    { label: '打开记忆文件夹', click: () => shell.openPath(记忆.记忆目录) },
    { label: '打开她的文件夹', click: () => shell.openPath(__dirname) },
    { type: 'separator' },
    {
      // 一个入口进来的东西，得有一个出口全带走。
      // 他 2026-09-27 报过：点了 × 之后程序退了，python 还在后台跑。
      label: '全部关掉（她 + 桌宠 + 声音）',
      click: () => 全部关掉(),
    },
    { label: '退出（只退她，声音留着）', click: () => { app.isQuitting = true; app.quit() } },
  ])

  托盘.setContextMenu(菜单)
  托盘.setToolTip('爱莉希雅' + (声音.在 ? '' : '（声音服务没开）'))
}

/**
 * 看看某个程序在不在跑，返回它开了几个。
 *
 * 【这里踩过一个很坑的坑】
 *   原来用的是：
 *     tasklist /FI "IMAGENAME eq Bongo Cat Mver.exe" /NH
 *   看着没问题 —— 名字里带空格，加引号了呀。
 *   可它**永远返回"没有"**，即使 Bongo Cat 明明就在跑。
 *   证据：日志里写着"（没起来，换下一条路）"，紧接着第二条路就把
 *   第二只桌宠拉起来了 —— 他桌面上于是有两只。
 *
 *   现在改成问 PowerShell 的 Get-Process —— 它是按"进程对象"查的，
 *   不受空格、引号、代码页这些文字层面的东西影响。
 *   （多花几十毫秒，但准。）
 *
 * 【为什么必须准】这个函数有两个地方在用，搞错哪一个都出事：
 *   · 启动前问一次 —— 问错就会开出第二只
 *   · 启动后问一次 —— 问错就会以为失败了，再开一只
 */
function 在跑几个(名字) {
  return 进程检查.在跑几个(名字)
}

/** 她只需要知道"在不在" */
function 有进程(名字) {
  return 进程检查.有进程(名字)
}

/**
 * 万一桌面上出现了两只（多开），收掉多出来的。
 *
 * 【保哪一只】留**最早启动**的那只 —— 它已经在屏幕上待着了，
 * 收掉它反而会让画面跳一下。多出来的那些是刚起来的，杀掉看不出来。
 *
 * 【为什么要有这个】"多试一条路"这种做法天生带一个风险：
 * 前一条路其实成功了、只是慢，就会开出第二只。
 * 与其指望每次都判断准，不如多一道"收尾"。
 */
function 收掉多余的桌宠() {
  return 进程检查.收掉多余的桌宠()
}

/**
 * 把桌宠拉起来（她得有个能动的身体）
 *
 * 【这个函数改过三次，每次都是被同一件事咬的：它起来得很慢】
 *
 *   Bongo Cat 启动要把三个模式的模型全读进来，一共 62 MB
 *   （光一张贴图就 8.7 MB）。所以"它出现了"这件事要好几秒。
 *
 *   第二版我写的是：每条路走完等 2 秒，问一句"在不在"，不在就换下一条路。
 *   结果 —— **第一条路其实成功了，只是还没加载完**，
 *   2 秒后一问"不在"，我又用第二条路起了第二个。
 *   于是他看到桌面上**两只**。
 *
 *   教训：**"还没出现"和"失败了"不是一回事。**
 *   所以现在改成 等它出现()：每 400 毫秒问一次，一直等到它出现为止。
 *   只有整整 10 秒都没出现，才算这条路真的不行。
 *
 * 三条路（依次试，谁先成功就停）：
 *   1. 桌宠文件夹里的 launch-pet.cmd —— 那里没有路径文本，最稳
 *   2. 系统的 shell.openPath          —— 走 ShellExecute
 *   3. 老的 spawn 整个路径            —— 兜底
 */
async function 启动桌宠() {
  if (!fs.existsSync(桌宠程序)) {
    console.log('✗ 找不到桌宠程序: ' + 桌宠程序)
    通知('找不到桌宠', 桌宠程序)
    return false
  }
  if (有进程('Bongo Cat Mver.exe')) {
    console.log('桌宠已经在跑了 —— 不动它（免得开出第二只）')
    return true
  }

  const { spawn } = require('node:child_process')
  const 启动器 = path.join(桌宠目录, 'launch-pet.cmd')

  /** 等它出现。每 400 毫秒问一次，最多等 这么久毫秒。 */
  async function 等它出现(多久 = 10000) {
    const 到点 = Date.now() + 多久
    while (Date.now() < 到点) {
      if (有进程('Bongo Cat Mver.exe')) return true
      await new Promise((停) => setTimeout(停, 400))
    }
    return false
  }

  /** 成功之后统一走这里，省得三处各写一遍 */
  function 成了(哪条路) {
    console.log(`✓ 桌宠起来了（走的是${哪条路}）`)
    通知('桌宠起来了', '桌面上的她会在你打字的时候跟着动')
    return true
  }

  // ---- 路一：桌宠文件夹里那个纯 ASCII 的启动器 ----
  if (fs.existsSync(启动器)) {
    console.log('  → 路一：' + path.basename(启动器) + '（最稳的一条）')
    const 子进程 = spawn('cmd', ['/c', 'launch-pet.cmd'], {
      cwd: 桌宠目录,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    子进程.on('error', (错误) => console.log('  ✗ 这条路没走通: ' + 错误.message))
    子进程.unref()
    // 关键：等它**真的出现**，不是等两秒就问
    if (await 等它出现()) return 成了('路一')
    console.log('  （等了 10 秒还没见着，换下一条）')
  }

  // ---- 路二：让系统自己去打开它 ----
  console.log('  → 路二：用系统打开的方式……')
  try {
    const 结果 = await shell.openPath(桌宠程序)
    if (结果) console.log('  ✗ 系统说: ' + 结果)
  } catch (错误) {
    console.log('  ✗ ' + 错误.message)
  }
  if (await 等它出现()) return 成了('路二')
  console.log('  （还是没见着，换最后一条）')

  // ---- 路三：硬来（老办法） ----
  console.log('  → 路三：直接启动整个路径……')
  const 子进程 = spawn(桌宠程序, [], { cwd: 桌宠目录, detached: true, stdio: 'ignore' })
  子进程.on('error', (错误) => console.log('  ✗ 桌宠没起来: ' + 错误.message))
  子进程.unref()

  if (await 等它出现(6000)) {
    // 最后再数一遍：万一路一其实成功了只是慢，就可能是两只。
    // 多出来的收掉 —— 留最早那只（它已经在屏幕上待着了）。
    const 个数 = 在跑几个('Bongo Cat Mver')
    if (个数 > 1) {
      console.log(`⚠ 发现 ${个数} 只桌宠，收掉多出来的`)
      收掉多余的桌宠()
    }
    return 成了('路三')
  }

  console.log('✗ 三条路都没把它拉起来。')
  console.log('  你可以自己双击这个文件试试：')
  console.log('    ' + 启动器)
  console.log('  （双击之后要是也没反应，那就是桌宠自己的问题，不是我们这边的）')
  通知('桌宠没起来', '双击 ' + 启动器 + ' 试试')
  return false
}

// ============================================================
// 小面板：账本（花了多少 token、多少钱）
// ============================================================
//
// 【为什么单独一个窗口，而不是塞进聊天窗口里】
//   他的原话是"就在这个软件的一边"。做成独立小窗的好处是：
//   能贴在聊天窗口旁边、能自己拖到任意位置、能单独收起来，
//   而且她那边窗口缩放的时候不会跟着变形。
//
// 【为什么它默认不显示】
//   花钱的账是"想看的时候看一眼"的东西，不是每时每刻都要盯着的。
//   所以默认收着，点一下才出来 —— 跟她的窗口一个脾气。

let 账本窗 = null
const 账本固定尺寸 = Object.freeze({ 宽: 208, 高: 236 })

/** 开关状态存在这儿 —— 下次启动她记得你上次是开着的还是收着的 */
const 设置文件 = path.join(配置.缓存目录, '设置.json')
const 表达反馈库 = 表达反馈.创建反馈库(path.join(配置.缓存目录, '表达反馈.json'))
const 设置存储 = 创建设置存储(设置文件)
const 密钥存储 = 创建密钥存储(path.join(配置.缓存目录, 'deepseek-api-key.dat'), safeStorage)
const 搜索密钥存储 = 创建密钥存储(path.join(配置.缓存目录, 'serpapi-api-key.dat'), safeStorage)

function 读设置() {
  return 设置存储.读设置()
}

function 写设置(改的) {
  return 设置存储.写设置(改的)
}

function 更新主动陪伴结果(状态, 说明 = '') {
  主动陪伴最近结果 = {
    状态: String(状态 || '未知').slice(0, 20),
    时间: new Date().toISOString(),
    说明: String(说明 || '').replace(/[\r\n]+/g, ' ').slice(0, 160),
  }
  if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('主动陪伴状态变了', { ...主动陪伴最近结果 })
}

function 取消主动陪伴生成() {
  if (主动陪伴请求 && 主动陪伴请求.控制器) {
    主动陪伴请求.控制器.abort()
    更新主动陪伴结果('已取消', '检测到用户操作，未发送生成中的消息')
  }
}

/** 生成期间若用户回来或切换会话，就丢弃这次结果，不让旧上下文突然插进来。 */
async function 尝试主动陪伴({ 空闲分钟 = 0 } = {}) {
  if (主动陪伴请求 || 正在说 || 当前是临时对话()) return false
  const 对话编号 = 记忆.现在哪一段()
  const 模式 = 当前模式()
  const 控制器 = new AbortController()
  主动陪伴请求 = { 控制器, 对话编号 }
  更新主动陪伴结果('生成中', `正在为${模式中文(模式)}模式准备短消息`)
  try {
    const 结果 = await 主动陪伴生成.生成({
      模式,
      模型: 当前模型() || undefined,
      中止: 控制器.signal,
      原因: `用户已空闲约 ${Math.max(0, Number(空闲分钟) || 0)} 分钟`,
    })
    if (控制器.signal.aborted) return false
    if (!结果.好) {
      更新主动陪伴结果('失败', 结果.说明 || '模型没有返回可交付文字')
      return false
    }
    if (记忆.现在哪一段() !== 对话编号 || 当前是临时对话() || 正在说) {
      更新主动陪伴结果('已取消', '会话或运行状态已经变化')
      return false
    }
    const 近期主动消息 = 记忆.读聊天记录(0).filter((一) => 一 && 一.来源 === '主动陪伴').slice(-8)
    const 去重 = 主动陪伴去重.判断重复(结果.正文, 近期主动消息)
    if (去重.重复) {
      更新主动陪伴结果('已拦截', `${去重.原因}（相似度 ${Math.round(去重.相似度 * 100)}%）`)
      return false
    }
    // 先把旧历史读进内存，再落新消息；反过来会把刚落盘的消息读一次、随后又 push 一次。
    const 内存历史 = 窗口 && !窗口.isDestroyed() ? 取历史(窗口.webContents.id, 对话编号) : null
    if (!记忆.存聊天('assistant', 结果.正文, { 对话: 对话编号, 来源: '主动陪伴' })) {
      更新主动陪伴结果('失败', '聊天记录没有写入成功')
      return false
    }

    const 时间 = new Date().toISOString()
    if (窗口 && !窗口.isDestroyed()) {
      内存历史.push({ role: 'assistant', content: 结果.正文, 时间, 来源: '主动陪伴' })
      while (内存历史.length > 内存里最多留) 内存历史.shift()
      发历史(窗口)
      if (!窗口.isVisible()) 通知('爱莉希雅', 结果.正文.slice(0, 60))
    }
    刷新账本(用量.算钱(结果.用了))
    更新主动陪伴结果('已发送', `已写入当前正式对话；使用 ${结果.临时资料数} 条短期资料`)
    console.log(`  ♡ 主动陪伴已写入对话「${对话编号}」（临时资料 ${结果.临时资料数} 条）`)
    return true
  } catch (错误) {
    console.log('⚠ 主动陪伴失败（不影响聊天）：' + 错误.message)
    if (!控制器.signal.aborted) 更新主动陪伴结果('失败', 错误.message)
    return false
  } finally {
    if (主动陪伴请求 && 主动陪伴请求.控制器 === 控制器) 主动陪伴请求 = null
  }
}

/** 设置、调度和文字生成保持分层；调度器只知道回调是否成功。 */
function 准备主动陪伴() {
  const 已存 = 读设置()
  主动陪伴调度 = 主动陪伴.创建调度器({
    配置: 已存.主动陪伴,
    账本: 已存.主动陪伴账本,
    运行状态: () => ({
      有正式对话: !当前是临时对话() && 记忆.对话列表().length > 0,
      临时对话: 当前是临时对话(),
      正在回复: 正在说,
      正在用工具: 正在说,
      ...陪伴界面状态,
    }),
    到期: 尝试主动陪伴,
    账本变了: (账本) => { 写设置({ 主动陪伴账本: 账本 }) },
  })
  主动陪伴调度.启动()
}

function 主动陪伴状态() {
  if (!主动陪伴调度) {
    return { 配置: 主动陪伴.规范配置(读设置().主动陪伴), 今日次数: 0, 下次到期: 0, 最近结果: { ...主动陪伴最近结果 } }
  }
  return { ...主动陪伴调度.状态(), 最近结果: { ...主动陪伴最近结果 } }
}

/** 把当前真实桌面和用户选过的工作目录灌进唯一的路径关口。 */
function 准备文件权限() {
  路径安全.注册({
    项目根: 配置.项目根,
    工作区根: 配置.工作区根,
    桌面目录: app.getPath('desktop'),
  })
  路径安全.设工作区(读设置().工作区 || null)
}

/** 读侧栏清单时重新验路径；文件被移走或权限收回后会自动消失。 */
function 读最近产物() {
  准备文件权限()
  const 原路径 = 读设置().最近产物 || []
  const 项们 = 产物.整理名单(原路径)
  const 干净路径 = 项们.map((一项) => 一项.路径)
  if (JSON.stringify(原路径) !== JSON.stringify(干净路径)) 写设置({ 最近产物: 干净路径 })
  return 项们
}

/** 一轮工作结束后，把成功写出的文件放到侧栏最前面。 */
function 登记这一轮产物(工具们) {
  const 新的 = 产物.从工具结果提取(工具们)
  if (!新的.length) return
  准备文件权限()
  const 旧的 = 读设置().最近产物 || []
  const 项们 = 产物.整理名单([...新的.reverse(), ...旧的])
  写设置({ 最近产物: 项们.map((一项) => 一项.路径) })
  if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('产物变了', 项们)
}

/**
 * 把 Windows 解开的 Key 只放在主进程内存里。
 * 渲染进程能拿到的永远只有“有没有、来自哪、遮住后的样子”。
 */
async function 加载加密密钥() {
  delete process.env.ELYSIA_SECURE_API_KEY
  if (!密钥存储.已保存()) return
  try {
    const 钥匙 = await 密钥存储.读取()
    if (钥匙) process.env.ELYSIA_SECURE_API_KEY = 钥匙
    console.log('模型凭据: 已从 Windows 加密存储加载（' + 遮住(钥匙) + '）')
  } catch (错误) {
    console.log('⚠ 加密保存的模型凭据没能打开: ' + 错误.message)
  }
}

async function 密钥状态() {
  const 找到的 = 拿钥匙()
  return {
    可加密保存: await 密钥存储.可用(),
    已加密保存: 密钥存储.已保存(),
    有可用密钥: Boolean(找到的.钥匙),
    来源: 找到的.来源,
    遮住的密钥: 遮住(找到的.钥匙),
  }
}

function 拿搜索钥匙() {
  const 安全保存 = String(process.env.ELYSIA_SERPAPI_API_KEY || '').trim()
  if (安全保存) return { 钥匙: 安全保存, 来源: 'Windows 加密存储' }
  const 环境变量 = String(process.env.SERPAPI_API_KEY || '').trim()
  if (环境变量) return { 钥匙: 环境变量, 来源: '环境变量 SERPAPI_API_KEY' }
  return { 钥匙: '', 来源: '未配置' }
}

async function 加载搜索密钥() {
  delete process.env.ELYSIA_SERPAPI_API_KEY
  if (!搜索密钥存储.已保存()) return
  try {
    const 钥匙 = await 搜索密钥存储.读取()
    if (钥匙) process.env.ELYSIA_SERPAPI_API_KEY = 钥匙
    console.log('搜索凭据: 已从 Windows 加密存储加载（' + 遮住(钥匙) + '）')
  } catch (错误) {
    console.log('⚠ 加密保存的搜索凭据没能打开: ' + 错误.message)
  }
}

async function 搜索密钥状态() {
  const 找到的 = 拿搜索钥匙()
  return {
    可加密保存: await 搜索密钥存储.可用(),
    已加密保存: 搜索密钥存储.已保存(),
    有可用密钥: Boolean(找到的.钥匙),
    来源: 找到的.来源,
    遮住的密钥: 遮住(找到的.钥匙),
  }
}

let 正在扶正账本 = false

/** 一次性改位置和尺寸，避免 Windows 在 setSize / setPosition 两步之间做边缘吸附。 */
function 设置账本边界(x, y) {
  if (!账本窗 || 账本窗.isDestroyed()) return
  if (账本窗.isFullScreen()) 账本窗.setFullScreen(false)
  if (账本窗.isMaximized()) 账本窗.unmaximize()

  正在扶正账本 = true
  try {
    账本窗.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: 账本固定尺寸.宽,
      height: 账本固定尺寸.高,
    }, false)
  } finally {
    // resize 事件可能由上面的 setBounds 同步或异步发出；下一轮事件循环再放开自检。
    setImmediate(() => { 正在扶正账本 = false })
  }
}

/** 账本无论因系统吸附还是旧窗口状态变形，都恢复成固定尺寸。 */
function 扶正账本尺寸() {
  if (!账本窗 || 账本窗.isDestroyed() || 正在扶正账本) return
  const 边界 = 账本窗.getBounds()
  if (账本窗.isFullScreen() || 账本窗.isMaximized() ||
      边界.width !== 账本固定尺寸.宽 || 边界.height !== 账本固定尺寸.高) {
    设置账本边界(边界.x, 边界.y)
  }
}

/** 把小面板摆在聊天窗口旁边 —— 右边放不下就放左边 */
function 摆在小窗边上() {
  if (!账本窗 || !窗口) return
  try {
    const 主 = 窗口.getBounds() // x, y, width, height
    const { 宽, 高 } = 账本固定尺寸
    const 屏 = screen.getDisplayNearestPoint({ x: 主.x, y: 主.y }).workArea

    // 优先贴右边，跟聊天窗口对齐顶部
    let x = 主.x + 主.width + 8
    if (x + 宽 > 屏.x + 屏.width - 8) {
      // 右边不够 → 贴左边
      x = 主.x - 宽 - 8
    }
    // 左右都不够（屏幕太窄）就叠在右边压着一点
    if (x < 屏.x + 8) x = 屏.x + 8
    const y = Math.min(Math.max(主.y, 屏.y + 8), 屏.y + 屏.height - 高 - 8)

    // 【2026-10-09 加的：叠在主窗口身上时，账本得浮到它上面去】
    //
    //   他报了两件事 ——"账本功能打不开了"和"最大化后账本会被盖住"——
    //   其实是同一件：主窗口最大化之后占满整个工作区，"旁边"根本不存在。
    //   上面那几行算下来会把账本摆到屏幕左上角，而它在主窗口**底下**
    //   （alwaysOnTop: false，2026-10-07 特意改的），于是永远看不见。
    //   点开关时它确实 showInactive() 了，只是没人看得见 —— 这就叫"打不开"。
    //
    //   所以：**算出来跟主窗口叠着，就临时置顶；不叠着（普通大小、老实待在旁边）就还它自由。**
    //   这样不会退回 10-07 那个毛病 —— 那时候是无条件置顶，
    //   他切到浏览器干活，账本还赖在所有窗口上面。
    const 叠着了 =
      x < 主.x + 主.width && x + 宽 > 主.x && y < 主.y + 主.height && y + 高 > 主.y
    账本窗.setAlwaysOnTop(叠着了)

    设置账本边界(x, y)
  } catch {
    /* 摆不了就让它待在默认位置 */
  }
}

function 建账本窗() {
  if (账本窗 && !账本窗.isDestroyed()) return

  账本窗 = new BrowserWindow({
    width: 账本固定尺寸.宽,
    height: 账本固定尺寸.高,
    minWidth: 账本固定尺寸.宽,
    maxWidth: 账本固定尺寸.宽,
    minHeight: 账本固定尺寸.高,
    maxHeight: 账本固定尺寸.高,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false, // 不要系统边框：这一块本来就是贴在旁边的，越干净越好
    skipTaskbar: true,
    // 跟主窗口一起改成 false（理由见那边那段）—— 它本来就贴在主窗口边上，
    // 主窗口退到后面去了它还赖在最前面，就成了孤零零一块飘在屏幕上。
    alwaysOnTop: false,
    backgroundColor: '#fffafc',
    title: '账本',
    webPreferences: {
      preload: path.join(__dirname, 'preload-账本.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  账本窗.loadFile(path.join(__dirname, 'renderer', '账本.html'))

  // 不拦 will-resize：那会连程序自己的修复也挡住。任何异常尺寸在 resize 后校正。
  账本窗.on('resize', () => setImmediate(扶正账本尺寸))
  账本窗.on('maximize', () => {
    setImmediate(() => {
      扶正账本尺寸()
      摆在小窗边上()
    })
  })

  // 她说话的时候要把数字刷过去，所以页面加载完先送一份
  账本窗.webContents.on('did-finish-load', () => 刷新账本())

  账本窗.on('close', (事件) => {
    if (!app.isQuitting) {
      事件.preventDefault()
      账本窗.hide()
      写设置({ 显示账本: false })
      更新托盘菜单()
    }
  })
}

/** 把最新的账推给面板 */
function 刷新账本(最近一次 = null) {
  if (!账本窗 || 账本窗.isDestroyed()) return
  const 数 = 用量.汇总(最近一次)
  账本窗.webContents.send('账本更新', 数)
}

/** 开 / 关面板 */
function 切换账本(要开 = null) {
  if (!账本窗 || 账本窗.isDestroyed()) 建账本窗()
  const 目标 = 要开 === null ? !账本窗.isVisible() : 要开

  if (目标) {
    扶正账本尺寸()
    摆在小窗边上()
    账本窗.showInactive() // 别抢焦点，不然你正打字会被打断

    // 【2026-10-09 加的：显示之后，把它提到同层最前】
    //
    //   他报"点 ¥ 什么都看不见"，查下来是这么回事：
    //   窗口**确实显示了**（诊断日志里 isVisible() = true），坐标也正确 ——
    //   主窗口右边 1217，账本摆在 1225，屏幕宽 1707，全都在里面。
    //   可它就是被别的窗口压在下面：showInactive 只保证"显示出来"，
    //   **不保证"在最上面"**。
    //
    //   moveTop() 把它提到同层顶部，而且**不抢焦点**。
    //   ⚠ 别图省事换成 show()：那个会激活窗口，他正在打的字会被打断 ——
    //     当初选 showInactive 就是为了这个，换掉等于把老毛病请回来。
    账本窗.moveTop()

    刷新账本()
  } else {
    账本窗.hide()
  }

  写设置({ 显示账本: 目标 })
  if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('账本开关', 目标)
  更新托盘菜单()
}

// ============================================================
// 窗口
// ============================================================

function 建窗口() {
  窗口 = new BrowserWindow({
    // 【为什么从 400 加宽到 620 —— 2026-10-03】
    //   左边多了一列对话（158px）。400 的话聊天区只剩 240，
    //   一段话要折成五六行，读起来很难受。
    width: 620,
    height: 560,
    minWidth: 460,
    minHeight: 420,
    show: false, // 先别露脸 —— 等你点了托盘再 show()
    // 不要标题栏、也不要那排 File/Edit/View/Window 菜单。
    // 那套东西是 Electron 默认给的，这个程序一个都用不上；
    // 留着就是屏幕上多一条白带（他 2026-09-26 晚上提的）。
    // 去掉之后窗口靠顶栏那片区域拖（CSS 里 -webkit-app-region: drag）。
    frame: false,
    // 无边框窗口的边角：Windows 11 会给它圆角，看着像原生的
    roundedCorners: true,
    hasShadow: true, // 无边框容易跟桌面糊在一起，留个淡淡的影子
    // 【2026-10-07 从 true 改成 false】
    //   原来不让她占任务栏，是照着 9-26 那句"平时不需要窗口，点了再出"推的。
    //   可"平时不需要窗口"说的是**不要一直摆在屏幕上**，跟"任务栏里能不能
    //   找到她"是两件事 —— 当时把这两件事当成一件了。
    //   现在她是**完完全全的普通窗口**：任务栏里有她、Alt+Tab 找得到、
    //   能被别的窗口盖住、点一下就回到前面来。
    //   （她平时还是收着的（hide），所以任务栏里平时也没有她 ——
    //     只有把她叫出来的时候才占一个位置。）
    skipTaskbar: false,
    // 【2026-10-07 从 true 改成 false —— 他提的】
    //   原来设"永远在最前面"，是照着 9-26 那句"说话的时候别被别的窗口盖住"
    //   推出来的。真用起来才发现它成了毛病：他切到浏览器、VSCode 干活的时候，
    //   她照样压在人家上面，想让开都让不开。
    //   现在她是**普通窗口**了：
    //     · 点托盘叫她出来 → 下面那两行 show() + focus() 会把她带到最前面
    //     · 他一点别的窗口 → 她自动退到后面去，跟正常程序一样
    //     · 想再叫她 → 点托盘上那朵花（她不在任务栏，别指望 Alt+Tab）
    alwaysOnTop: false,
    backgroundColor: '#fff7fa',
    title: '爱莉希雅',
    icon: 取图标(256),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: true,
      // 下面两条是 Electron 现在的默认值，写出来是为了你以后看得懂：
      contextIsolation: true, // 网页和 Node 隔开（安全）
      nodeIntegration: false, // 网页里不能直接用 Node 的功能
    },
  })

  // 菜单栏直接拆掉。跟上面的 frame:false 是一回事，这里是防着
  // 某些情况下它还会冒出来（比如按了 Alt）——
  // 真要看开发者工具，用 Ctrl+Shift+I（下面绑好了）。
  窗口.setMenuBarVisibility(false)
  窗口.removeMenu?.()

  // 网页里 console.log / 报错都转到终端，出问题时能看见
  窗口.webContents.on('console-message', (_事件, 级别, 内容, 行, 来源) => {
    const 标签 = ['[日志]', '[警告]', '[报错]'][级别] || '[调试]'
    const 在哪 = 来源 ? ` (${path.basename(来源)}:${行})` : ''
    console.log(`${标签}${在哪} ${内容}`)
  })
  窗口.webContents.on('did-fail-load', (_事件, 码, 说明, 地址) => {
    console.log(`!!! 页面没加载起来: ${说明} (${码}) ${地址}`)
  })

  窗口.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  // 窗口里那页网页准备好了 —— 把上次的对话显示回去。
  //
  // 【为什么要专门做这一件事】
  //   她其实一直记得（每次请求都把最近二十句递给她），可**他看不见**：
  //   窗口里永远是空的，只有那句"想说什么就说吧"。
  //   他 2026-09-27 问的就是这个："我怎么才能保留一轮对话"。
  //   记忆是给她用的，聊天记录才是给他看的 —— 这是两件事。
  窗口.webContents.on('did-finish-load', () => {
    私密日记已打开 = false
    发历史(窗口, 40)
    发Live2D显示状态()
  })

  // 关掉只是收起来，程序还在托盘上活着
  窗口.on('close', (事件) => {
    if (!app.isQuitting) {
      console.log('  ⚠ 窗口收到了 close 事件（不是「—」按钮，是从系统那边来的）')
      事件.preventDefault()
      窗口.hide()
      // 说一声，不然你会以为她被你关掉了、或者程序崩了
      通知('爱莉希雅', '我先躲到托盘上啦 —— 想找我，点那朵粉色的小花♪')
      更新托盘菜单()
    }
  })

  // 【2026-10-08 加的：他报"连点两下模式按钮，窗口就没了（没退出）"】
  //
  //   我猜了两轮都没猜中 —— 先怪"双击顶栏 = 收起来"那条规则，把按钮排除掉，
  //   他说照掉不误。猜不出来就别猜了，**让程序自己说**：
  //   只要窗口被藏起来，就把**调用栈**打进日志。
  //   是谁按的、走的哪一条路，一眼就看得见 —— 这比再猜三轮都便宜。
  //
  //   【2026-10-08 凌晨结案】元凶就是 chat.js 里"双击顶栏 = 收起来"那条规则，
  //   整条已经撤掉。日志里证据很干净：他连点 12 次模式，**一次 hide 都没有**；
  //   唯一一条"窗口被藏起来了"是他自己按「—」按钮那次，来源写得明明白白。
  //
  //   所以那串调用栈**撤了** —— 每收一次窗口就打十来行，日志会白白长胖。
  //   哪天又要抓这种"谁把窗口弄没了"，把下面这句加回来就行（就是当时用的那句）：
  //     console.log(new Error('谁把窗口藏起来了').stack)
  窗口.on('hide', () => console.log('  ⌄ 窗口收起来了'))
  窗口.on('minimize', () => console.log('  ⌄ 窗口被最小化了（这个不是我藏的，它还在任务栏上）'))
  窗口.on('maximize', () => console.log('  ⌃ 窗口被最大化了'))

  // 【2026-10-09 加的：窗口一变大变小，账本得跟着重算】
  //   账本贴在主窗口旁边，位置是**按主窗口的边界算出来的**。
  //   主窗口最大化 / 还原 / 被他拖到别处时，那个算式得出的结论完全不一样
  //   （旁边放得下 → 老实摆旁边；放不下 → 叠上去、而且得置顶）。
  //   不重算的话它就停在老坐标上：最大化之后卡在屏幕左上角、被主窗口盖住 ——
  //   看上去就是"账本打不开"。
  //   两个事件都绑：最大化只触发 resize，拖着窗口走只触发 move。
  // 旧版 60ms 防抖会在连续 move 时反复延期，账本只有等拖动快停下才追上。
  // 现在只合并同一轮事件循环里的重复事件；下一轮立即 setBounds，不人为降低跟随刷新率。
  const 账本跟着挪 = 创建账本跟随调度({
    更新: () => {
      if (账本窗 && !账本窗.isDestroyed() && 账本窗.isVisible()) 摆在小窗边上()
    },
  })
  窗口.on('resize', 账本跟着挪)
  窗口.on('move', 账本跟着挪)
  窗口.once('closed', 账本跟着挪.取消)

  // 【还有最后一种可能：界面自己崩了】
  //   那种情况窗口**不会被 hide** —— 它就停在那儿，但里面是白的。
  //   他看到的也叫"窗口没了"，可日志里一条 hide 都不会有。
  //   所以这一条也得盯着：崩了要留个名。
  窗口.webContents.on('render-process-gone', (_事件, 详情) => {
    console.log('  ✗✗ 界面自己没了（渲染进程退出）：' + JSON.stringify(详情))
  })
  窗口.webContents.on('unresponsive', () => console.log('  ⚠ 界面卡住了（还没死，但没反应）'))

  窗口.on('show', () => {
    更新托盘菜单()
    // Live2D 快聊只保留消息与输入；普通聊天的伴随账本不能跟着冒出来。
    if (Live2D快聊中) {
      if (账本窗 && !账本窗.isDestroyed() && 账本窗.isVisible()) 账本窗.hide()
      return
    }
    // 面板跟着她一起出来（如果上次是开着的）
    if (读设置().显示账本 && 账本窗 && !账本窗.isVisible()) {
      摆在小窗边上()
      账本窗.showInactive()
      刷新账本()
    } else if (账本窗 && 账本窗.isVisible()) {
      摆在小窗边上() // 她换了位置，面板跟着走
    }
  })

  窗口.on('hide', () => {
    私密日记已打开 = false
    if (Live2D快聊中) 退出Live2D快聊()
    更新托盘菜单()
    // 她收起来了，面板也一起收 —— 只留一个孤零零的账本在屏幕上很奇怪
    if (账本窗 && !账本窗.isDestroyed() && 账本窗.isVisible()) 账本窗.hide()
  })
  窗口.on('blur', () => {
    if (!Live2D快聊中) return
    setTimeout(() => {
      if (Live2D快聊中 && 窗口 && !窗口.isDestroyed() && !窗口.isFocused()) 窗口.hide()
    }, 120)
  })
}

const Live2D基准宽 = 430
// 可见角色在旧 620px 窗口约 520px 处结束；缩短真实窗口，避免底部留下看不见的框。
const Live2D基准高 = 530
const {
  取Live2D偶数尺寸,
  按中心距离计算缩放,
  取中心缩放边界,
  取鼠标跟随边界,
  取Live2D快聊边界,
} = require('./main/live2d-window.cjs')

function 限Live2D数(值, 最小, 最大) {
  const 数 = Number(值)
  return Math.max(最小, Math.min(最大, Number.isFinite(数) ? 数 : 最小))
}

function 读Live2D边界() {
  const 保存的 = 读设置().Live2D || {}
  const 原缩放 = Number(保存的.缩放)
  const 缩放 = Number.isFinite(原缩放)
    ? (Math.abs(原缩放 - 1) < 0.03 ? 1 : 限Live2D数(原缩放, 0.45, 1.8))
    : 1
  const 猜的尺寸 = 取Live2D偶数尺寸(Live2D基准宽, Live2D基准高, 缩放)
  const 猜的 = {
    x: Number.isFinite(保存的.x) ? Math.round(保存的.x) : 0,
    y: Number.isFinite(保存的.y) ? Math.round(保存的.y) : 0,
    ...猜的尺寸,
  }
  const 工作区 = (Number.isFinite(保存的.x) && Number.isFinite(保存的.y)
    ? screen.getDisplayMatching(猜的)
    : screen.getPrimaryDisplay()).workArea
  const 实际缩放 = Math.min(缩放, (工作区.width - 12) / Live2D基准宽, (工作区.height - 12) / Live2D基准高)
  const { width: 实宽, height: 实高 } = 取Live2D偶数尺寸(Live2D基准宽, Live2D基准高, 实际缩放)
  const 默认X = 工作区.x + 工作区.width - 实宽 - 12
  const 默认Y = 工作区.y + 工作区.height - 实高 - 8
  return {
    x: 限Live2D数(保存的.x, 工作区.x, 工作区.x + 工作区.width - 实宽),
    y: 限Live2D数(保存的.y, 工作区.y, 工作区.y + 工作区.height - 实高),
    width: 实宽,
    height: 实高,
    默认X,
    默认Y,
    缩放: 实际缩放,
    有保存: Number.isFinite(保存的.x) && Number.isFinite(保存的.y),
  }
}

function 存Live2D边界() {
  if (!Live2D窗 || Live2D窗.isDestroyed()) return
  const 边界 = Live2D窗.getBounds()
  写设置({ Live2D: { x: 边界.x, y: 边界.y, 缩放: Number(Live2D缩放.toFixed(3)) } })
}

function 稍后存Live2D边界() {
  if (Live2D保存定时) clearTimeout(Live2D保存定时)
  Live2D保存定时 = setTimeout(() => {
    Live2D保存定时 = null
    存Live2D边界()
  }, 240)
}

/** Live2D 加载失败只记日志；聊天窗口和对话链路继续照常工作。 */
function 建Live2D窗口() {
  if (Live2D窗 && !Live2D窗.isDestroyed()) return Live2D窗
  const 边界 = 读Live2D边界()
  Live2D缩放 = 边界.缩放
  const 身体 = new BrowserWindow({
    width: 边界.width,
    height: 边界.height,
    x: 边界.有保存 ? 边界.x : 边界.默认X,
    y: 边界.有保存 ? 边界.y : 边界.默认Y,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-live2d.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  })
  Live2D窗 = 身体
  // 整个身体直接接收鼠标：左键拖动位置，右键拖动等比缩放。
  身体.setIgnoreMouseEvents(false)
  身体.setAlwaysOnTop(true, 'floating')
  身体.webContents.on('console-message', (_事件, 级别, 内容, 行) => {
    if (级别 >= 2) console.log(`[Live2D] ${内容} (${行})`)
  })
  身体.webContents.on('did-fail-load', (_事件, 码, 说明) => {
    console.log(`⚠ Live2D 身体没加载起来（不影响聊天）：${说明} (${码})`)
  })
  身体.on('move', 稍后存Live2D边界)
  身体.on('closed', () => {
    if (Live2D窗 === 身体) Live2D窗 = null
    Live2D手势 = null
    发Live2D显示状态()
  })
  身体.loadFile(path.join(__dirname, 'renderer', 'live2d.html')).catch((错误) => {
    console.log('⚠ Live2D 身体没加载起来（不影响聊天）：' + 错误.message)
  })
  身体.once('ready-to-show', () => {
    if (身体.isDestroyed()) return
    身体.showInactive()
    发Live2D显示状态()
  })
  return 身体
}

function 发Live2D显示状态() {
  const 显示 = Boolean(Live2D窗 && !Live2D窗.isDestroyed() && Live2D窗.isVisible())
  if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('live2d-显示状态', 显示)
  return 显示
}

function 切换Live2D() {
  const 身体 = 建Live2D窗口()
  if (身体.isVisible()) {
    Live2D手势 = null
    if (Live2D快聊中 && 窗口 && !窗口.isDestroyed() && 窗口.isVisible()) 窗口.hide()
    身体.hide()
  } else 身体.showInactive()
  发Live2D显示状态()
  void 更新托盘菜单()
}

function 开始Live2D手势(数据) {
  if (!Live2D窗 || Live2D窗.isDestroyed()) return
  const 类型 = String(dataValue(数据, '类型') || '')
  if (!['移动', '缩放'].includes(类型)) return
  // 按下坐标必须使用事件自己的时间快照：极快拖动时，主进程收到消息前系统光标可能已到终点，
  // 若此处也读取当前光标，就会把起点误当成终点，整次拖动位移变成 0。
  // 移动阶段再只读系统最新光标；位置写入仍只有一条路径，不会在两个 DPI 尺度间来回跳。
  const 点 = 类型 === '移动' ? 取Live2D事件屏幕点(数据) : 取Live2D逻辑点(数据)
  if (!点) return
  const { x, y } = 点
  const 边界 = Live2D窗.getBounds()
  // 左键移动时宽高从保存比例重算，不采信 Windows 高 DPI 移动后可能漂掉几像素的窗口宽高。
  const { width: 固定宽, height: 固定高 } = 取Live2D偶数尺寸(Live2D基准宽, Live2D基准高, Live2D缩放)
  const 中心X = 边界.x + 边界.width / 2
  const 中心Y = 边界.y + 边界.height / 2
  Live2D手势 = {
    类型, x, y, 边界: { x: 边界.x, y: 边界.y, width: 固定宽, height: 固定高 },
    偏移X: 边界.x - x,
    偏移Y: 边界.y - y,
    缩放: Live2D缩放,
    中心X,
    中心Y,
    起始半径: Math.hypot(x - 中心X, y - 中心Y),
  }
}

function dataValue(数据, 键) {
  return 数据 && typeof 数据 === 'object' ? 数据[键] : undefined
}

/**
 * Chromium 的 PointerEvent.screenX/screenY 已经是与 BrowserWindow 边界一致的 DIP。
 * 左键移动若再 screenToDipPoint，会在 150% 缩放下把绝对坐标重复除一次，窗口就会偏到右下角。
 */
function 取Live2D事件屏幕点(数据) {
  const x = Number(dataValue(数据, 'x'))
  const y = Number(dataValue(数据, 'y'))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(x), y: Math.round(y) }
}

function 取Live2D逻辑点(数据) {
  const x = Number(dataValue(数据, 'x'))
  const y = Number(dataValue(数据, 'y'))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const 物理点 = { x: Math.round(x), y: Math.round(y) }
  try {
    return typeof screen.screenToDipPoint === 'function' ? screen.screenToDipPoint(物理点) : 物理点
  } catch {
    return 物理点
  }
}

function 取Live2D系统光标点() {
  try {
    const 点 = screen.getCursorScreenPoint()
    if (!点 || !Number.isFinite(点.x) || !Number.isFinite(点.y)) return null
    return { x: Math.round(点.x), y: Math.round(点.y) }
  } catch {
    return null
  }
}

function 应用Live2D移动点(点) {
  if (!点 || !Live2D手势 || Live2D手势.类型 !== '移动' || !Live2D窗 || Live2D窗.isDestroyed()) return
  const 工作区 = screen.getDisplayNearestPoint({ x: Math.round(点.x), y: Math.round(点.y) }).workArea
  const { width, height } = Live2D手势.边界
  const 新边界 = 取鼠标跟随边界({
    鼠标X: 点.x,
    鼠标Y: 点.y,
    偏移X: Live2D手势.偏移X,
    偏移Y: Live2D手势.偏移Y,
    width,
    height,
    工作区,
  })
  const 当前边界 = Live2D窗.getBounds()
  if (当前边界.x !== 新边界.x || 当前边界.y !== 新边界.y || 当前边界.width !== width || 当前边界.height !== height) {
    Live2D窗.setBounds(新边界, false)
  }
}

function 更新Live2D手势(数据) {
  if (!Live2D手势 || !Live2D窗 || Live2D窗.isDestroyed()) return
  if (Live2D手势.类型 === '移动') {
    // 即使 IPC 中的 pointermove 已排队，也直接跳到系统光标的最新位置，不累计追赶。
    应用Live2D移动点(取Live2D系统光标点())
    return
  }

  // 跟随每个指针事件立即更新；按固定帧间隔合并会造成肉眼可见的阶梯式跳动。
  应用Live2D缩放(数据)
}

function 应用Live2D缩放(数据) {
  if (!Live2D手势 || Live2D手势.类型 !== '缩放' || !Live2D窗 || Live2D窗.isDestroyed()) return
  const 点 = 取Live2D逻辑点(数据)
  if (!点) return

  const 工作区 = screen.getDisplayMatching(Live2D手势.边界).workArea
  const 最大缩放 = Math.min(1.8, (工作区.width - 12) / Live2D基准宽, (工作区.height - 12) / Live2D基准高)
  const 缩放 = 按中心距离计算缩放({
    起始缩放: Live2D手势.缩放,
    起始半径: Live2D手势.起始半径,
    当前X: 点.x,
    当前Y: 点.y,
    中心X: Live2D手势.中心X,
    中心Y: Live2D手势.中心Y,
    最小缩放: 0.45,
    最大缩放,
  })
  Live2D缩放 = 缩放
  const { width, height } = 取Live2D偶数尺寸(Live2D基准宽, Live2D基准高, 缩放)
  const 新边界 = 取中心缩放边界({
    中心X: Live2D手势.中心X,
    中心Y: Live2D手势.中心Y,
    width,
    height,
    工作区,
  })
  const 当前边界 = Live2D窗.getBounds()
  if (['x', 'y', 'width', 'height'].some((键) => 当前边界[键] !== 新边界[键])) {
    Live2D窗.setBounds(新边界, false)
  }
}

function 结束Live2D手势(数据) {
  if (!Live2D手势) return
  if (Live2D手势.类型 === '移动') {
    // 松开时再读取一次系统位置，保证最终一帧与鼠标完全对齐。
    应用Live2D移动点(取Live2D系统光标点())
  } else if (Live2D手势.类型 === '缩放') {
    if (数据) 应用Live2D缩放(数据)
  }
  Live2D手势 = null
  存Live2D边界()
}

/** 从 IPC 事件里找回那个窗口（找不到就返回 null，调用方自己兜） */
function 取窗口(事件) {
  try {
    return BrowserWindow.fromWebContents(事件.sender)
  } catch {
    return null
  }
}

// ============================================================
// 上下文有多大（窗口里那个小圈）
// ============================================================
//
// 【这个数是哪来的】
//   不是猜的 —— 每一次请求发完，模型都会把它真实算了多少 token 报回来。
//   那个数就是"刚才那一发有多大"。见 脑\对话.cjs 里 报上下文()。
//
// 【为什么按对话分开记】
//   他有好几段对话。换一段就该显示那一段的大小，
//   不然会出现"这一段才三句话，圈却满了"这种莫名其妙的事。

/** 每段对话最后一次的上下文情况：编号 → {现在, 这一轮最大, 窗口, 线} */
const 上下文表 = new Map()

function 记下上下文(数据, 对话号 = 记忆.现在哪一段()) {
  try {
    上下文表.set(对话号, { ...数据, 对话: 对话号 })
  } catch {
    /* 记不上不影响显示 */
  }
}

/** 把"这一段现在多大"发给窗口（开窗、换对话的时候用） */
function 发上下文(窗口) {
  if (!窗口 || 窗口.isDestroyed()) return
  try {
    const 这一段 = 记忆.现在哪一段()
    const 记着的 = 上下文表.get(这一段)
    窗口.webContents.send('上下文', 记着的 || { 现在: null, 对话: 这一段 })
  } catch {
    /* 发不出去就拉倒，那只是个圈 */
  }
}

// ============================================================
// 上次没干完的活儿（2026-10-04 加的）
// ============================================================
//
// 【它从哪来】
//   她干活干到一半，程序断了（Electron 崩了、他点了"全部关掉"、断电），
//   纸上就留着一条"干到哪儿了"。东西在 .cache\没做完的.json，
//   怎么写的、为什么这么写，全在 脑\没干完.cjs 开头。
//
// 【为什么是"惰性读 + 只读一次"，不在开机时读】
//   因为开机那个时间点不好找 —— 要赶在记忆准备好之后、窗口开出来之前，
//   而这个文件本身根本不依赖记忆。改成"第一次有人问的时候才去读"，
//   就哪儿都不用插了。读一次就够了：纸条要么被用掉，要么一直是那张。
/** undefined = 还没问过；null = 问过了，这一段没有 */
let 上次没干完的
let 问过哪一段 = null

/**
 * 去看看这一段有没有"上次没干完"的便条。
 *
 * 【为什么要记住问的是哪一段】
 *   纸条是按对话分段存的（A 段断在半路的活，跑到 B 段去提就是串台）。
 *   所以他切到另一段再切回来，得重新问一次 —— 不然 B 段会拿到 A 段的答案。
 *   认领本身很便宜：没那个文件就是一次 existsSync。
 */
function 捡起上次没干完的() {
  let 这段 = ''
  try {
    这段 = 记忆.现在哪一段()
  } catch {
    /* 记忆还没准备好就按空段号问 —— 下面还会再来一次的 */
  }
  if (上次没干完的 !== undefined && 问过哪一段 === 这段) return 上次没干完的

  问过哪一段 = 这段
  try {
    上次没干完的 = 没干完.认领(这段)
  } catch (错误) {
    console.log('⚠ 上次没干完的活儿读不出来: ' + 错误.message)
    上次没干完的 = null
  }
  return 上次没干完的
}

/** 给界面看的一句话（底下那行小字用） */
function 没干完的一句话() {
  const 那份 = 捡起上次没干完的()
  if (!那份) return null
  const 他说的 = String(那份.他说的 || '').trim()
  const 不知道的 = (那份.不知道的 || []).map((x) => x.名字).join('、')
  const 头 = 他说的 ? `上次「${他说的}」` : '上次那个活儿'
  return 不知道的
    ? `${头}断在半路了（${不知道的}那一下不知道成没成）—— 跟她说句话，她知道`
    : `${头}断在半路了 —— 跟她说句话，她知道`
}

// ============================================================
// 模式（2026-10-07 从"全局一个"改成"每段对话自己一个"）
// ============================================================
//
// 【以前是什么样】
//   模式存在 .cache\设置.json 里，全局就一个。切一下，所有对话都跟着变。
//   他实际要的是"这段拿来聊天、那段拿来学高数" —— 全局开关做不到这个。
//   所以现在它跟模型一样，记在**对话索引**里，每段各一个。
//
// 【旧的全局值没删】
//   在加这个字段之前建的对话，索引里没有"模式"。
//   那些对话总不能打不开 —— 所以记不到就回头问设置文件里那个旧值。

/** 三种模式，别的名字一律不认 */
const 模式名单 = ['chat', 'work', 'learn']

/** 认一个模式名，认不出来就当聊天（宁可少给她工具，别给她不认识的东西） */
function 选一个模式(名字) {
  const 名 = String(名字 || '')
  return 模式名单.includes(名) ? 名 : 'chat'
}

/** 'chat' → '聊天'，打日志和给他看的时候用 */
function 模式中文(模式) {
  return { chat: '聊天', work: '干活', learn: '学习' }[选一个模式(模式)]
}

/**
 * 现在这一段是什么模式。
 *
 * 先看这一段自己记的；没记过（老对话）就退回设置文件里那个旧值，
 * 那个在最坏情况下也是空的 —— 那就当聊天。
 */
function 当前模式() {
  try {
    const 临时的 = 临时对话.取(记忆.现在哪一段())
    if (临时的) return 选一个模式(临时的.模式)
    const 这段的 = 记忆.这段的模式()
    if (这段的) return 选一个模式(这段的)
  } catch {
    /* 问不出来就走下面的兜底 */
  }
  return 读设置().模式 === 'work' ? 'work' : 'chat'
}

/** 当前对话使用的模型；临时对话的选择只留在内存。 */
function 当前模型() {
  const 编号 = 记忆.现在哪一段()
  const 临时的 = 临时对话.取(编号)
  return 临时的 ? 临时的.模型 : 记忆.这段的模型(编号)
}

function 当前是临时对话() {
  return 临时对话.有(记忆.现在哪一段())
}

/**
 * 换段或新建后，把这一段自己的模式立刻推给界面。
 *
 * 模式是按对话保存的；只刷新聊天记录和左侧列表还不够，左侧状态卡、
 * 背景和学习状态板也必须一起切换，否则会把上一段的模式留在屏幕上。
 */
function 发当前模式(窗口) {
  if (!窗口 || 窗口.isDestroyed()) return
  窗口.webContents.send('模式变了', {
    模式: 当前模式(),
    工作区: 读设置().工作区 || null,
  })
}

/** 把聊天记录发到窗口里显示。
 *
 * 最多几条 = 0 就是全发（窗口里点"看更早的"会这么要）。
 *
 * 【注意：发的是"当前这一段"】
 *   记忆.读聊天记录() 已经按当前对话号筛过了 —— 别的对话不会串进来。
 *   顺带把左边那一列要的清单也发过去，省一次来回。
 */
function 发历史(窗口, 最多几条 = 40) {
  if (!窗口 || 窗口.isDestroyed()) return
  try {
    const 编号 = 记忆.现在哪一段()
    const 是临时 = 临时对话.有(编号)
    const 全部 = 是临时 ? 临时对话.给界面(编号, 0) : 记忆.读聊天记录(0)
    const 给 = 最多几条 > 0 ? 全部.slice(-最多几条) : 全部
    窗口.webContents.send('聊天记录', {
      条们: 给,
      一共: 全部.length,
      给了: 给.length,
      // 这是哪一段 —— 窗口那边要拿它把列表里那一条点亮
      对话: 编号,
      临时: 是临时,
      写长期记忆: 是临时 ? false : 记忆.这段写长期记忆吗(),
    })
    发对话们(窗口)
    // 换了对话，那个圈也得跟着换成这一段的
    发上下文(窗口)
  } catch (错误) {
    console.log('⚠ 聊天记录读不出来: ' + 错误.message)
  }
}

/** 把"有哪几段对话"发到窗口左边那一列 */
function 发对话们(窗口) {
  if (!窗口 || 窗口.isDestroyed()) return
  try {
    窗口.webContents.send('对话们', {
      现在: 记忆.现在哪一段(),
      列表: [...临时对话.列表(), ...记忆.对话列表()],
    })
  } catch (错误) {
    console.log('⚠ 列不出对话: ' + 错误.message)
  }
}

/**
 * 弹系统那个"选文件夹"的框，让他挑干活目录。
 *
 * 【为什么用系统的框，不用自己画一个】
 *   Cyrene 那边有个"可信工作区"的概念，相对路径都从那儿算。
 *   我们这边"她用哪个目录干活"是他随时能改的 —— 用系统那个选文件夹的框
 *   最省事，而且他熟悉（谁都用过）。
 *
 * 【为什么默认是她自己那层，而不是桌面】
 *   Cyrene 没绑定工作区时退到桌面。我们退到配置的工作区根——
 *   那儿本来就是她能写的地方，而且里面的东西都跟她有关，比桌面合适。
 */
async function 选干活目录() {
  if (!窗口 || 窗口.isDestroyed()) return null

  const 结果 = await dialog.showOpenDialog(窗口, {
    title: '让她在这个文件夹里干活',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '就这儿',
    defaultPath: 读设置().工作区 || undefined,
  })

  if (结果.canceled || !结果.filePaths.length) return null

  const 选的 = 结果.filePaths[0]
  写设置({ 工作区: 选的 })
  console.log('干活目录选成：' + 选的)
  if (窗口 && !窗口.isDestroyed()) {
    窗口.webContents.send('模式变了', { 模式: 当前模式(), 工作区: 选的 })
  }
  更新托盘菜单()
  return 选的
}

/** 点了托盘：开着就收起来，收着就弹出来 */
function 切换窗口() {
  if (!窗口) return
  if (窗口.isVisible()) {
    窗口.hide()
    return
  }
  出现()
}

/** 把窗口叫出来（挪到你鼠标附近，顺手把输入框对好焦） */
function 出现() {
  if (!窗口) return
  if (Live2D快聊中) 退出Live2D快聊()

  // 放到鼠标旁边，别老在一个固定的角落
  try {
    const 鼠标 = screen.getCursorScreenPoint()
    const 屏 = screen.getDisplayNearestPoint(鼠标).workArea
    const [宽, 高] = 窗口.getSize()
    let x = Math.round(鼠标.x - 宽 / 2)
    let y = Math.round(鼠标.y - 高 / 2)
    // 别跑出屏幕
    x = Math.min(Math.max(x, 屏.x + 8), 屏.x + 屏.width - 宽 - 8)
    y = Math.min(Math.max(y, 屏.y + 8), 屏.y + 屏.height - 高 - 8)
    窗口.setPosition(x, y)
  } catch {
    /* 放不了就放默认位置，不碍事 */
  }

  窗口.show()
  if (Live2D待恢复最大化) {
    Live2D待恢复最大化 = false
    窗口.maximize()
  }
  窗口.focus()
  窗口.webContents.send('叫你出来')
}

/** 收起快聊外观，并把普通聊天窗口的尺寸与窗口属性放回去。 */
function 退出Live2D快聊() {
  if (!Live2D快聊中 || !窗口 || 窗口.isDestroyed()) return
  const 原状态 = Live2D快聊原状态
  Live2D快聊中 = false
  Live2D快聊原状态 = null
  窗口.webContents.send('快聊模式', false)
  窗口.setAlwaysOnTop(false)
  窗口.setSkipTaskbar(false)
  窗口.setResizable(true)
  窗口.setMinimumSize(460, 420)
  if (原状态?.边界) 窗口.setBounds(原状态.边界, false)
  Live2D待恢复最大化 = Boolean(原状态?.最大化)
}

/** 双击 Live2D：在人物旁边打开同一个聊天页的精简外观；再次双击则收起。 */
function 切换Live2D快聊() {
  if (!窗口 || 窗口.isDestroyed() || !Live2D窗 || Live2D窗.isDestroyed()) return
  if (Live2D快聊中 && 窗口.isVisible()) {
    窗口.hide()
    return
  }

  Live2D快聊原状态 = {
    边界: 窗口.getNormalBounds(),
    最大化: 窗口.isMaximized(),
  }
  if (窗口.isMaximized()) 窗口.unmaximize()
  Live2D待恢复最大化 = false
  Live2D快聊中 = true
  const 人物 = Live2D窗.getBounds()
  const 工作区 = screen.getDisplayMatching(人物).workArea
  const 快聊边界 = 取Live2D快聊边界({ 人物, 工作区 })
  窗口.setMinimumSize(340, 300)
  窗口.setResizable(false)
  窗口.setBounds(快聊边界, false)
  窗口.setSkipTaskbar(true)
  窗口.setAlwaysOnTop(true, 'floating')
  窗口.webContents.send('快聊模式', true)
  窗口.show()
  窗口.focus()
  窗口.webContents.send('叫你出来')
}

/** 弹一个系统通知（她说话的时候窗口是收着的，得让他知道） */
function 通知(标题, 内容) {
  try {
    if (Notification.isSupported()) new Notification({ title: 标题, body: 内容, silent: true }).show()
  } catch {
    /* 通知失败无所谓 */
  }
}

/**
 * 全部关掉：她 + 桌宠 + 声音服务 + 转接层，一个不留。
 *
 * 【为什么要做这个】
 *   她不是一个程序，是四个（界面 / 桌宠 / GPT-SoVITS / 转接层）。
 *   他点了窗口上的 ×，界面退了、托盘上的花没了，
 *   可那个 python 还在后台啃着一千多兆内存。
 *   **一个入口进来的东西，得有一个出口全带走。**
 *
 * 具体的找法和"只杀该杀的"那套判断都在 脑\收摊.cjs 里
 * （那儿有注释说明为什么不能按进程名杀、以及为什么主程序不能另起进程）。
 */
function 全部关掉() {
  console.log('')
  console.log('=== 全部关掉 ===')

  // 【先把自己藏起来，再去收别人】
  //   他 2026-09-27 说"退出很慢"。原来这一步是**同步等**收摊脚本跑完才退，
  //   而那个脚本要问系统要进程清单（WMI，好几秒），这几秒里窗口杵在那儿，
  //   看着像卡住了。所以先 hide()：视觉上立刻消失，然后再收。
  if (窗口 && !窗口.isDestroyed()) 窗口.hide()
  if (账本窗 && !账本窗.isDestroyed()) 账本窗.hide()

  通知('爱莉希雅', '我把自己、桌宠和声音都收起来了 —— 想找我，双击桌面那个图标')

  // 【2026-09-29 改过一次，这个坑值得记住】
  //   原来这里是 spawn(process.execPath, ['tools\\全部关掉.cjs'])。
  //   看着没问题，实际上**永远卡住** —— 因为 Electron 里
  //   process.execPath 是 **electron.exe，不是 node.exe**。
  //   拿一个 .js 去启动 Electron，它当成"要打开一个 app"，
  //   于是又开了一个 Electron 挂在那儿（还被"只允许开一个"挡着），
  //   谁也不退。他点了之后什么都没关掉，12 秒兜底才退出。
  //
  //   现在：主程序**自己**调收摊函数。它本来就是 Node 环境，
  //   该有的权限都有，何必绕一圈去启动自己。
  //
  //   还要注意：收摊里那几步是**同步阻塞**的（execFileSync 等系统命令），
  //   所以放到定时器里跑一下，让 UI 先把"我收起来了"的通知弹出去。
  setTimeout(() => {
    const 开始 = Date.now()
    try {
      const { 收摊 } = require(path.join(脑, '收摊.cjs'))
      const 结果 = 收摊((行) => console.log('  ' + 行))
      console.log(`收摊用时 ${((Date.now() - 开始) / 1000).toFixed(1)}s，关掉 ${结果.关了} 个`)
    } catch (错误) {
      console.log('收摊出错: ' + 错误.message)
      console.log('  （可能还剩声音服务没关 —— 手动关掉那两个窗口）')
    }
    app.isQuitting = true
    app.quit()
  }, 200)
}

// ============================================================
// 员工（窗口里那页网页）喊话的入口
// ============================================================

function 接对讲机() {
  /** 设置相关 IPC 只接受这一个聊天窗口，别的页面不能借它碰凭据。 */
  function 确认来自聊天窗口(事件) {
    if (!窗口 || 窗口.isDestroyed() || 事件.sender !== 窗口.webContents) {
      throw new Error('这个请求不是从聊天窗口发来的')
    }
  }

  function 作废当前确认卡() {
    const 编号们 = [...等答复的.keys()]
    for (const 编号 of 编号们) {
      const 完成 = 等答复的.get(编号)
      if (完成) 完成({ 同意: false, 记住: false })
      等答复的.delete(编号)
      if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('卡片撤了', 编号)
    }
    确认.作废()
  }

  // ---- 她要动手之前，先问他 ----
  //
  // 【这一层是怎么接起来的】
  //   工具（写文件、跑命令）里会 await 一个"问"的承诺 ——
  //   见 脑\确认.cjs。这里把那个承诺接到窗口上：
  //   把请求推给窗口 → 他弹卡片点同意/不同意 → 回执传回来 → 承诺兑现。
  //
  //   这条链路是**阻塞的**：她那边真的会停在那儿等。所以有三件事要想清楚：
  //     · 窗口收起来了（她躲在托盘里）→ 没人能点 → 直接拒绝，不是默许。
  //       那就得把她叫出来，不然她会一直等。
  //     · 他一直不点 → 一直等（Cyrene 也是这么做的：审批不设超时）。
  //       所以界面上那张卡片要显眼，别让他找不到。
  //     · 程序要退出了 → 把在等的那个作废，不能留一个永远等不到的承诺。
  // 【启动时先把"放行的目录"灌进去】—— 2026-10-07 加的
  //   她写文件前会问 路径安全.要问他吗()，而那个函数得先知道有哪些目录放行过。
  //   为什么不让它自己去读设置：设置文件在哪只能有一个地方说了算（就是这个文件），
  //   两处各读一份，早晚会出现"设置里明明写了、她那儿还照问"这种查不出来的事。
  路径安全.设放行的目录(读设置().放行的目录 || [])

  确认.注册({
    问窗口: async (请求) => {
      // 窗口不在？把她叫出来 —— 有事要他定夺，不能让她在那儿干等
      if (!窗口 || 窗口.isDestroyed()) return false
      if (!窗口.isVisible()) {
        通知('爱莉希雅', '她想动一下手，得你点个头 —— 我把窗口叫出来了')
        出现()
      }

      return await new Promise((完成) => {
        // 记下谁在等这个编号的答复
        等答复的.set(请求.编号, 完成)

        // 把请求送到窗口（内容太长就先截一段，界面上够看就行）
        const 给界面的 = {
          编号: 请求.编号,
          类型: 请求.类型,
          路径: 请求.路径,
          命令: 请求.命令,
          字节: 请求.字节,
          内容: 请求.内容 ? String(请求.内容).slice(0, 4000) : undefined,
          内容太长: 请求.内容 ? String(请求.内容).length > 4000 : false,
          原内容行数: 请求.原内容 ? String(请求.原内容).split('\n').length : undefined,
          // 【能不能"记住"】只有写文件能。跑命令不给这个选项 ——
          // 写文件最坏是改坏一个文件，跑命令最坏是干任何事。
          // （界面上靠这个字段决定要不要显示那个按钮。）
          能记住: 请求.类型 === '新建' || 请求.类型 === '覆盖',
          要记住的目录: 请求.绝对路径 ? path.dirname(请求.绝对路径) : undefined,
        }
        窗口.webContents.send('要我点头', 给界面的)
        console.log(`  ⏸ 等他对「${请求.类型}${请求.路径 ? '：' + 请求.路径 : ''}${请求.命令 ? '：' + 请求.命令 : ''}」点头`)
      })
    },

    // 他点了"以后这个文件夹别问了" —— 把那个文件夹记进设置
    //
    // 【为什么落盘在这儿，不在 确认.cjs 里】
    //   设置文件在哪、怎么读写，只有这个文件知道。
    //   让审批那一层也去读一遍设置，就成了两处各存一份"设置在哪" ——
    //   那种错不会报，只会表现为"点了记住，下次还问"。
    记住这个: (请求) => {
      const 目标 = 请求 && 请求.绝对路径
      if (!目标) return
      const 目录 = path.dirname(目标)
      const 旧的 = 读设置().放行的目录 || []
      if (旧的.some((一个) => path.resolve(String(一个)) === path.resolve(目录))) return

      const 新的 = [...旧的, 目录]
      写设置({ 放行的目录: 新的 })
      路径安全.设放行的目录(新的)
      console.log('  ✓ 记住了：以后 ' + 目录 + ' 里的写，不再问你')
      if (窗口 && !窗口.isDestroyed()) {
        窗口.webContents.send('放行了', { 目录, 放行的目录: 新的 })
      }
    },
  })

  // 他在卡片上点了同意 / 不同意（还可能点了"以后别问"）
  ipcMain.on('我点完了', (_事件, { 编号, 同意, 记住 }) => {
    const 完成 = 等答复的.get(编号)
    if (!完成) return
    等答复的.delete(编号)
    console.log(
      `  ${同意 ? '✓ 他同意了' : '✗ 他不同意'}${同意 && 记住 ? '（并且让我以后别问这个文件夹）' : ''}（请求 ${编号}）`,
    )
    // 【这里得给一个对象，不能给 boolean】—— 2026-10-07 改的。
    //   "记住"要一路传到 确认.cjs 的 结算()，它才能调 记住这个() 去落盘。
    //   给 boolean 的话，他点的"记住"会在这一层被吃掉，界面上看着点了但没生效。
    完成({ 同意: Boolean(同意), 记住: Boolean(同意 && 记住) })
  })

  ipcMain.handle('停止回复', (事件) => {
    确认来自聊天窗口(事件)
    const 控制器 = 回复请求.get(事件.sender.id)
    if (!控制器) return { 停止了: false, 说明: '当前没有正在进行的回复' }
    控制器.abort()
    作废当前确认卡()
    return { 停止了: true }
  })

  // ---- 人工表达反馈：只收当前正式对话里已经落盘的 assistant 回复 ----
  // renderer 只能交回正文；这里重新从聊天记录核对，不能让网页任意往评测集塞文字。
  function 找反馈对应回复(内容) {
    if (当前是临时对话()) return { 好: false, 说明: '临时对话不会写入表达评测集' }
    const 正文 = String(内容 || '').trim()
    if (!正文 || 正文.length > 12000) return { 好: false, 说明: '这条回复暂时不能标记' }
    const 对话 = 记忆.现在哪一段()
    const 条 = [...记忆.读聊天记录(0)].reverse().find((一) =>
      一 && 一.角色 === 'assistant' && String(一.内容 || '').trim() === 正文)
    if (!条) return { 好: false, 说明: '这条回复还没有写入当前对话，请等她说完后再标记' }
    return { 好: true, 对话, 消息时间: String(条.时间 || ''), 内容: 正文 }
  }

  ipcMain.handle('问表达反馈', (事件, 内容) => {
    确认来自聊天窗口(事件)
    const 回复 = 找反馈对应回复(内容)
    return 回复.好 ? 表达反馈库.查(回复) : 回复
  })

  ipcMain.handle('列出表达反馈', (事件) => {
    确认来自聊天窗口(事件)
    return 表达反馈库.列表()
  })

  ipcMain.handle('保存表达反馈', (事件, 输入) => {
    确认来自聊天窗口(事件)
    const 回复 = 找反馈对应回复(输入 && 输入.内容)
    if (!回复.好) return 回复
    return 表达反馈库.保存({ ...回复, 标签: 输入 && 输入.标签 })
  })

  // ---- 上次有没有没干完的活儿（界面开出来的时候问一次） ----
  //
  // 【为什么让界面来问，主进程不主动推】
  //   主动推就得掐准"窗口已经能收了"那个时刻 —— 早一秒它收不到，
  //   晚一秒它已经画完了。让界面自己问就没这问题：它什么时候准备好，什么时候来拿。
  ipcMain.handle('没干完的活儿', () => {
    const 一句话 = 没干完的一句话()
    if (!一句话) return { 有: false }
    const 那份 = 捡起上次没干完的() || {}
    return {
      有: true,
      一句话,
      他说的: 那份.他说的 || '',
      断在: 那份.断在 || '',
      确定的: (那份.确定的 || []).map((x) => `${x.名字} ${x.参数}`),
      不知道的: (那份.不知道的 || []).map((x) => `${x.名字} ${x.参数}`),
    }
  })

  // ---- 说一句话，听她回一句（一边生成一边把字发回窗口） ----
  ipcMain.handle('说话', async (事件, 送来的) => {
    取消主动陪伴生成()
    // 【参数形状 2026-10-04 换过一次】
    //   原来直接传一句话，现在传 { 话, 附件们 } —— 因为要发的东西不止文字了。
    //   老的"直接传字符串"也还认，免得哪儿的旧代码没跟着改、静默失效。
    const 是字符串 = typeof 送来的 === 'string'
    const 文字 = String((是字符串 ? 送来的 : 送来的 && 送来的.话) || '').trim()
    const 传来的附件 = (是字符串 ? [] : (送来的 && 送来的.附件们) || []).slice(0, 6)
    const 已确认工作 = !是字符串 && !!(送来的 && 送来的.已确认工作)
    const 来自语音 = !是字符串 && !!(送来的 && 送来的.来自语音)
    const 这轮对话号 = 记忆.现在哪一段()
    const 这轮是临时 = 临时对话.有(这轮对话号)
    // 一次请求从开始到结束都按同一个模式处理。否则生成期间切换模式，
    // 附件归档和工作索引可能会被误记到后来切到的模式里。
    const 这轮模式 = 当前模式()
    const 自动只读工作 = 这轮模式 === 'work' && 工作请求.判断(文字).只读

    // 【有附件的时候，光附件、不写字也算数】
    //   （他看到个东西想让她看，不一定有话说。）
    if (!文字 && !传来的附件.length) return { 成功: false, 说明: '没说内容' }
    if (正在说) return { 成功: false, 说明: '她还在说上一句呢，等她说完成吗' }

    // ---- 先把附件落到 记忆\附件\ 里 ----
    //
    // 【为什么存不下就别发了】
    //   发一半是最坏的情况：她那边收到"他发来个东西"，
    //   而文件其实没存下来，她再去够就扑空 —— 然后她会开始猜。
    // 【学习模式下顺手往材料区导入一份】
    //   他上课的课件是"材料"，不该只躺在聊天记录里 ——
    //   放进 学习\材料\，笔记和进度才有东西可引，
    //   她也不至于每次都要先问一句"那份课件在哪"。
    //   ⚠ 但 记忆\附件\ 那份**照存**：聊天记录里写着"他发过这个文件"，
    //   文件就得一直在那儿，不然以后翻记录点不开。
    // 临时对话的附件只放缓存，不进入记忆；学习模式也不顺手导入材料区。
    const 临时附件目录 = 这轮是临时 ? 临时对话.附件目录(这轮对话号) : ''
    const 材料区 = !这轮是临时 && 这轮模式 === 'learn' ? path.join(提示词.学习区根, '材料') : ''
    const 附件们 = []
    const 没存下的 = []
    for (const 一个 of 传来的附件) {
      const 果 = 附件.存(一个, 临时附件目录 || undefined)
      if (!果.好) {
        没存下的.push(果.说明)
        continue
      }
      if (材料区) {
        const 另 = 附件.另存一份(果, 材料区)
        if (另.好) 果.学习路径 = 另.路径
        else console.log('  ⚠ 课件没能放进材料区：' + 另.说明)
      }
      附件们.push(果)
    }
    if (没存下的.length) {
      console.log('  ⚠ 有附件没存下来：' + 没存下的.join('；'))
      if (!附件们.length) return { 成功: false, 说明: 没存下的[0] }
    }
    if (附件们.length) {
      console.log(
        '  📎 收到 ' +
          附件们.length +
          ' 个附件：' +
          附件们.map((x) => x.原名 + (x.是图片 ? '（图）' : '')).join('、'),
      )
    }

    正在说 = true
    const 本轮反应 = 情感状态.接收用户(这轮对话号, 文字)
    const 本轮情绪 = 情感状态.情绪状态(这轮对话号)
    if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('情感状态变了', { ...本轮反应, 缓慢: 本轮情绪 })
    广播表现事件(表现层.阶段(这轮对话号, '思考', { 即时: 本轮反应, 缓慢: 本轮情绪 }))
    const 回复控制器 = new AbortController()
    回复请求.set(事件.sender.id, 回复控制器)
    try {
      // 接着上次的聊 —— 把她上次说的话也带上，不然她每次都像刚醒
      const 历史 = 窗口 && !窗口.isDestroyed() ? 取历史(事件.sender.id, 这轮对话号) : []

      // 上次没干完的活儿 —— 她这一轮就靠这张便条知道自己断在哪儿。
      // 是按对话分段存着的，所以这一段问到的就是这一段自己的事。
      const 便条 = 捡起上次没干完的()
      const 这段对话 = 这轮对话号

      const 结果 = await 说话({
        他说的话: 文字,
        来自语音,
        历史,
        // 这一段是哪种模式（聊天 / 干活 / 学习）—— 跟着**这一段对话**走，
        // 不是全局一个开关。他就是靠这个做到"这段聊天、那段学高数"的。
        模式: 这轮模式,
        工作区: 读设置().工作区 || undefined,
        // 桌面是用户明确放行的日常交换区；用系统返回的真实位置，兼容重定向。
        桌面目录: app.getPath('desktop'),
        // 上次没干完的活儿（没有就是 null）
        上次没干完: 便条,
        // 纸条上要记"这是哪一段"
        对话编号: 这段对话,
        // 临时对话完全不落聊天记录、长期记忆或学习进度。
        记进记忆: !这轮是临时,
        // 每段对话自己的长期记忆开关；聊天记录和学习进度不受它影响。
        写长期记忆: !这轮是临时 && 记忆.这段写长期记忆吗(这段对话),
        // 这一段用哪个脑子 —— 索引里记着她建这段的时候选的是哪个。
        // 返回空字符串 = 当初没选过，那就用 对话.cjs 里那个默认的。
        模型: 当前模型() || undefined,
        表达状态提示: 情感状态.拼表达提示(本轮反应, 本轮情绪),
        中止: 回复控制器.signal,
        // 他这一句带来的图片和文件（已经存到 记忆\附件\ 里了）
        附件们,
        吐字: (() => {
          let 已开始说 = false
          return (到现在) => {
            if (!已开始说) {
              已开始说 = true
              广播表现事件(表现层.阶段(这段对话, '说话', { 即时: 本轮反应, 缓慢: 本轮情绪 }))
            }
          if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('她说到一半', 到现在)
          }
        })(),
        // 她要用工具的时候会先说一句（"我翻翻小本子……"）。
        // 把这句话送给窗口，让他知道她在做事，不是在发呆 ——
        // 查东西要几秒，屏幕上什么都不动的话就像卡住了。
        动手了: (一句话, 工具们) => {
          广播表现事件(表现层.阶段(这段对话, '执行', { 即时: 本轮反应, 缓慢: 本轮情绪 }))
          if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('她动手了', { 一句话, 工具们 })
        },
        // 要写文件、要跑命令的时候，走这条路问他。
        // 他不同意她就不会做 —— 见 脑\确认.cjs。
        问: (请求) => 确认.问(请求),
        // 每发完一次请求，把"现在上下文多大"报给窗口顶上那个小圈。
        // 【为什么每次都报，不只报最后一次】
        //   干活一轮要发好几次，中间那几次（工具结果堆着的时候）最大。
        //   只报最后一次，他看着圈是空的，会以为一直很安全 ——
        //   危险恰恰在中间那几下。所以让它动起来，看得见它涨。
        上下文变了: (数据) => {
          记下上下文(数据, 这段对话)
          if (记忆.现在哪一段() === 这段对话 && 窗口 && !窗口.isDestroyed()) 窗口.webContents.send('上下文', { ...数据, 对话: 这段对话 })
        },
      })

      if (回复控制器.signal.aborted) return { 成功: false, 已停止: true, 说明: '已停止' }

      // 她这一轮看到过那张便条了 —— 收掉，免得她下次开口又念一遍。
      //
      // 【为什么在这儿收，不交给 没干完.干完了()】
      //   那个撕的是"这一轮正在干的活"那张纸，是另一张。
      //   而且这一轮要是干得正欢，那张纸早被新的内容覆盖了，
      //   让 干完了() 顺手去撕便条只会撕错东西。
      if (结果.成功 && 便条) 没干完.看过了(这段对话)

      // 她动过哪些手 —— 终端留完整的执行轨迹，界面只拿短摘要。
      const 本轮工具记录 = 工具记录.整理(结果.用过的工具)
      if (结果.用过的工具 && 结果.用过的工具.length) {
        for (const 用过的 of 结果.用过的工具) {
          // 【注意字段名】工具表里那一条叫「名字」，不是「做什么」——
          // 原来这儿打的是 用过的.做什么，而它不存在，所以日志里一直是
          // "动手：undefined(...)"。那种日志等于没打。
          console.log(
            `  ↳ 动手：${用过的.名字}(${用过的.参数}) —— ` +
              (用过的.结果 && 用过的.结果.好 ? '成功' : '没成：' + ((用过的.结果 && 用过的.结果.说明) || '？')),
          )
        }
        登记这一轮产物(结果.用过的工具)
      }

      // 工作索引收任务卡确认过的工作，也收程序明确判定的纯读取/搜索工作。
      // 后者不需要总确认卡；如果模型随后尝试写入或跑命令，底层仍会逐项询问。
      // 不采信回答正文里的“已经完成”；终端输出和文件正文也不写进去。
      let 工作记录 = null
      if ((已确认工作 || 自动只读工作) && 这轮模式 === 'work' && !这轮是临时) {
        const 产物们 = 产物.从工具结果提取(结果.用过的工具)
        try {
          工作记录 = 工作索引.登记({
            对话: 这段对话,
            目标: 文字 || '处理已附上的文件',
            工作区: 读设置().工作区 || '',
            结果摘要: 结果.她说的话,
            工具们: 结果.用过的工具,
            产物们,
          })
        } catch (错误) {
          console.log('⚠ 工作索引没有记下（不影响回复）：' + 错误.message)
        }
      }

      // 她说完了 —— 该动的动起来
      //
      // 【两条路，都要走】
      //   路一：她自己写的标记 [表情:星星眼]
      //         —— 她写了就听她的，这是最准的
      //   路二：程序自己从她的话里认（脑\表情路由.cjs）
      //         —— 因为她**经常忘了写标记**。实测过：同一批问法我测六句六句都对，
      //            可他真跟她说「可以换成女仆形态吗」，她答「行，我这就换」，
      //            标记又是一个都没有。光靠提醒治不好，得程序自己兜住。
      //
      //   "她说要换"和"她真的换了"是两件事。所有"做事"都得靠程序这一下。
      const 原形态 = 当前形态
      const 认出来的 = 表情路由.认表情(结果.她说的话, { 粘住: 当前形态 })
      const 形态们 = ['人律形态', '妖精小姐', '女仆形态', '侵蚀']
      const 文本表情 = 认出来的.表情.filter((名字) => !(形态们.includes(名字) && 名字 === 原形态))
      const 最终表现 = 广播表现事件(表现层.回复(这段对话, {
        即时: 本轮反应,
        缓慢: 本轮情绪,
        显式表情: 结果.表情,
        文本表情,
      }))
      if (形态们.includes(最终表现.表情)) 当前形态 = 最终表现.表情

      // 统一事件最多给现有桌宠一个动作；关心、认真等没有合适素材时保持克制。
      if (最终表现.表情) {
        const 名字 = 最终表现.表情
        if (!查表(名字) && !大概查表(名字)) {
          console.log(`⚠ 想做「${名字}」，但表情表里没有这个名字 —— 这一下不会动`)
        } else {
          const 回执 = 做表情(名字)
          if (!回执.成功) console.log('表情没做成：' + 回执.说明)
          else console.log(`✓ 让她做了（${最终表现.表情来源}）：` + 回执.说明)
        }
      }

      // 把这一轮记进历史。不记的话，她下一句就不知道自己刚说过什么
      // （每次请求都是独立的，模型不会自己记着）
      const 给历史看的 = 这轮是临时
        ? [文字, ...附件们.map(附件.一行)].filter(Boolean).join('\n\n')
        : 文字
      记进历史(事件.sender.id, 给历史看的, 结果.她说的话, 这段对话)
      if (这轮是临时) 发对话们(窗口)

      // 把账本小面板刷一下。
      // 【注意】记账本身不在这儿做了 —— 挪进了 脑\对话.cjs 的说话()，
      // 因为一轮带工具的对话会发好几次请求，而且从命令行测试也会花钱。
      // 记账要跟着"真的发了请求"走，不能跟入口绑。
      // 这儿只负责让面板上的数字当场跳一下。
      刷新账本(用量.算钱(结果.用了))

      if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('她说完了', 结果.她说的话)

      // 窗口收着的时候，弹个通知告诉你她回话了
      if (窗口 && !窗口.isVisible()) {
        通知('爱莉希雅', 结果.她说的话.slice(0, 60))
      }

      return {
        成功: true,
        她说的话: 结果.她说的话,
        表情: 最终表现.表情 ? [最终表现.表情] : [],
        表现事件: 最终表现,
        用了: 结果.用了 || null,
        工具记录: 本轮工具记录,
        工作状态: 工作记录 && 工作记录.好 ? 工作记录.条.状态 : '',
        工作索引编号: 工作记录 && 工作记录.好 ? 工作记录.条.编号 : '',
      }
    } catch (错误) {
      console.log('说话出错: ' + 错误.message)
      if (回复控制器.signal.aborted) return { 成功: false, 已停止: true, 说明: '已停止' }
      const 故障 = 故障状态.从对话错误(错误)
      return { 成功: false, 说明: 故障.说明, 故障 }
    } finally {
      if (回复请求.get(事件.sender.id) === 回复控制器) 回复请求.delete(事件.sender.id)
      正在说 = false
    }
  })

  ipcMain.handle('判断只读工作', (事件, 原文) => {
    确认来自聊天窗口(事件)
    const 结果 = 工作请求.判断(String(原文 || '').slice(0, 2000))
    return { 只读: 结果.只读, 类型: 结果.类型 }
  })

  // ---- 她的声音：合成一段音频，把字节发回窗口去播 ----
  ipcMain.handle('合成语音', async (_事件, 文字) => {
    const 状态 = await TTS.status()
    if (!状态.在) {
      const 说明 = '声音服务没开：' + 状态.说明
      return { 成功: false, 说明, 故障: 故障状态.服务('声音服务', 说明) }
    }
    const 结果 = await TTS.speak(文字)
    if (!结果.成功) return { ...结果, 故障: 故障状态.服务('声音服务', 结果.说明) }
    return {
      成功: true,
      音频: 结果.音频.buffer.slice(结果.音频.byteOffset, 结果.音频.byteOffset + 结果.音频.byteLength),
      类型: 结果.类型,
      用时: 结果.用时,
      说明: 结果.说明,
    }
  })

  // PCM 流只允许 renderer 提供短编号和文字；地址、采样格式与模型参数全部留在声音驱动中。
  ipcMain.handle('流式合成语音', async (事件, 输入) => {
    const 编号 = String(输入 && 输入.编号 || '')
    const 文字 = String(输入 && 输入.文字 || '')
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(编号)) return { 成功: false, 说明: '声音流编号不合法' }
    const 键 = `${事件.sender.id}:${编号}`
    const 旧的 = 流式声音请求.get(键)
    if (旧的) 旧的.abort()
    const 控制器 = new AbortController()
    流式声音请求.set(键, 控制器)

    try {
      const 结果 = await TTS.stream(文字, {
        中止: 控制器.signal,
        收到音频: (块, 信息) => {
          if (控制器.signal.aborted || 事件.sender.isDestroyed()) return
          const 字节 = 块.buffer.slice(块.byteOffset, 块.byteOffset + 块.byteLength)
          事件.sender.send('语音流片段', {
            编号,
            字节,
            采样率: Number(信息 && 信息.采样率) || 32000,
            格式: String(信息 && 信息.格式 || 'pcm_s16le'),
          })
        },
      })
      if (!结果.成功 && !结果.已取消) return { ...结果, 故障: 故障状态.服务('声音服务', 结果.说明) }
      return 结果
    } finally {
      if (流式声音请求.get(键) === 控制器) 流式声音请求.delete(键)
    }
  })

  ipcMain.on('取消流式语音', (事件, 原编号) => {
    const 编号 = String(原编号 || '')
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(编号)) return
    const 键 = `${事件.sender.id}:${编号}`
    const 控制器 = 流式声音请求.get(键)
    if (控制器) 控制器.abort()
  })

  ipcMain.handle('声音状态', async () => {
    const 状态 = await TTS.status()
    return 状态.在 ? 状态 : { ...状态, 故障: 故障状态.服务('声音服务', 状态.说明) }
  })

  // 手动声音入口。启动路径固定在主进程，renderer 不能传脚本或命令。
  // start-all 默认仍不加载声音；只有用户点 ♪ 时才会走到这里。
  ipcMain.handle('启动声音服务', async () => {
    const 结果 = await 声音启动器.启动()
    if (!结果.成功) {
      return { ...结果, 故障: 故障状态.服务('声音服务', 结果.说明) }
    }
    return 结果
  })

  // ---- 他说话：renderer 只能交一段 WAV；模型路径和进程完全留在 ASR 驱动里。 ----
  ipcMain.handle('识别语音', async (事件, 输入) => {
    const 类型 = String(输入 && 输入.类型 || '')
    if (!/^audio\/(?:wav|x-wav)$/i.test(类型)) return { 成功: false, 说明: '当前只接收 WAV 录音' }
    const 原字节 = 输入 && 输入.字节
    if (!(原字节 instanceof ArrayBuffer) && !ArrayBuffer.isView(原字节)) {
      return { 成功: false, 说明: '没有收到可识别的录音' }
    }
    const 音频 = Buffer.from(
      原字节 instanceof ArrayBuffer ? 原字节 : 原字节.buffer,
      原字节 instanceof ArrayBuffer ? 0 : 原字节.byteOffset,
      原字节 instanceof ArrayBuffer ? 原字节.byteLength : 原字节.byteLength,
    )
    const 键 = String(事件.sender.id)
    const 旧的 = 语音识别请求.get(键)
    if (旧的) 旧的.abort()
    const 控制器 = new AbortController()
    语音识别请求.set(键, 控制器)
    try {
      const 结果 = await ASR.transcribe(音频, { 类型, 语言: 'zh', 中止: 控制器.signal })
      if (!结果.成功 && !结果.已取消) {
        return { ...结果, 故障: 故障状态.服务('语音识别', 结果.说明) }
      }
      return 结果
    } finally {
      if (语音识别请求.get(键) === 控制器) 语音识别请求.delete(键)
    }
  })

  ipcMain.on('取消语音识别', (事件) => {
    const 控制器 = 语音识别请求.get(String(事件.sender.id))
    if (控制器) 控制器.abort()
  })

  // ---- 收拾窗口：收起来 / 全部关掉 ----
  //
  // 【2026-10-03 改过：× 不再跟「—」干同一件事了】
  //   他提的："那个界面上的 - 和 x 的功能重复了。"
  //   确实 —— 那时候 `—`、`×`、双击顶栏、Esc 四个入口全是"收起来"。
  //
  //   当初为什么让 × 只收起来：9 月 27 号那次，他点 × 之后程序退了，
  //   可 python 还在后台啃着一千多兆，托盘上那朵花也没了 ——
  //   既进不去、也没关干净。于是干脆让 × 也收起来，把"真退"挪到托盘菜单里。
  //
  //   但那个理由现在不成立了：**托盘里的"全部关掉"已经能把声音和桌宠一起带走**
  //   （见上面 全部关掉() 那段）。所以 × 可以回去干它该干的事了：
  //   **关掉，而且关干净。**
  //
  //   收起来还剩两个入口（`—` 和 Esc，还有双击顶栏），一个都不少。
  // 【2026-10-08 补了"来源"和一行日志】—— 为了他报的
  //   "连点两下模式按钮，窗口就没了（没退出）"。
  //   猜不出来就让每个调用点自报家门（见 chat.js 那两处）。
  //   日志里会写明是「—按钮」还是「Esc键」；要是两个都不是，
  //   那它压根不走这条路 —— 上面那个 hide 监听会告诉我们它走的哪条。
  ipcMain.on('收起来', (_事件, 来源) => {
    console.log('  ⌄ 收到「收起来」的请求，来源：' + (来源 || '（没写来源）'))
    窗口 && 窗口.hide()
  })

  // 【2026-10-09 加：双击顶栏 = 最大化 / 还原】
  //
  //   他提的："按界面边框也无法双击放大了"。
  //   原因是窗口 frame:false —— 顶栏是我们自己画的，而
  //   **"双击标题栏最大化"是系统给真标题栏的行为**，自绘的那条它不认。
  //   原来这儿有个"双击顶栏 = 收起来"顶着，撤掉之后这个手势就彻底空了。
  //   现在补上它本该干的事：跟普通 Windows 窗口一样，双击放大、再双击还原。
  //
  //   还原交给 unmaximize()（系统会恢复原来的尺寸和位置），
  //   比自己记一套坐标可靠 —— 那样迟早会跟系统的行为对不上。
  ipcMain.on('最大化切换', () => {
    if (!窗口 || 窗口.isDestroyed()) return
    if (Live2D快聊中) return
    if (窗口.isMaximized()) 窗口.unmaximize()
    else 窗口.maximize()
  })

  ipcMain.on('全部关掉', () => 全部关掉())

  // ---- 账本小面板 ----
  ipcMain.handle('要账本', () => 用量.汇总())
  ipcMain.on('切换账本', (_事件, 要开) => 切换账本(要开))
  ipcMain.on('打开账本文件', () => shell.openPath(用量.用量文件))

  // ---- 模式：聊天 / 干活 / 学习 ----
  //
  // 【为什么这个要放在程序层面】
  //   chat 模式下她**根本看不到工具说明**（见 脑\提示词.cjs），
  //   所以她想调也没有。越权不该靠她自觉，该靠"她压根不知道有那么个东西"。
  ipcMain.handle('问模式和目录', () => ({
    模式: 当前模式(),
    工作区: 读设置().工作区 || null,
    临时: 当前是临时对话(),
    写长期记忆: 当前是临时对话() ? false : 记忆.这段写长期记忆吗(),
  }))

  // 这是当前对话自己的开关。改完推回清单，左边也能看出哪一段关着。
  ipcMain.handle('设长期记忆', (_事件, 要写) => {
    if (当前是临时对话()) return { 好: false, 写长期记忆: false, 说明: '临时对话不会保存' }
    const 写长期记忆 = 记忆.设这段写长期记忆(记忆.现在哪一段(), 要写 !== false)
    发对话们(窗口)
    return { 好: true, 写长期记忆 }
  })

  // 记忆管理页第一步只读：搜索、筛选和来源展示，不在这个入口改任何文件。
  ipcMain.handle('问长期记忆', (_事件, 条件) => {
    try {
      const 类别 = String((条件 && 条件.类别) || '')
      const 搜索 = String((条件 && 条件.搜索) || '').slice(0, 80)
      return { 好: true, ...记忆.列长期记忆({ 类别, 搜索, 最多: 500 }) }
    } catch (错误) {
      console.log('⚠ 长期记忆列表读不出来：' + 错误.message)
      return { 好: false, 列表: [], 总数: 0, 截断: false, 说明: '长期记忆暂时读不到' }
    }
  })

  ipcMain.handle('导出长期记忆', async (事件) => {
    确认来自聊天窗口(事件)
    const 选择 = await dialog.showSaveDialog(窗口, {
      title: '导出爱莉希雅的长期记忆',
      defaultPath: path.join(app.getPath('documents'), `爱莉希雅-长期记忆-${备份时间戳()}.zip`),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (选择.canceled || !选择.filePath) return { 好: false, 取消了: true }
    try {
      const 结果 = 创建长期记忆导出({ 目标文件: 选择.filePath, 记录们: 记忆.全部长期记忆() })
      return { 好: true, 条数: 结果.条数 }
    } catch (错误) {
      console.log('⚠ 长期记忆导出失败：' + 错误.message)
      return { 好: false, 说明: '长期记忆没有导出成功' }
    }
  })

  ipcMain.handle('清空长期记忆', async (事件) => {
    确认来自聊天窗口(事件)
    const 条数 = 记忆.全部长期记忆().length
    if (!条数) return { 好: true, 没变化: true, 条数: 0 }
    const 选择 = await dialog.showMessageBox(窗口, {
      type: 'warning',
      title: '清空长期记忆',
      message: `要清空 ${条数} 条长期记忆吗？`,
      detail: '只清空事实、共同经历和小本子。聊天记录、学习进度和设置都会保留。程序会先自动留下清空前备份。',
      buttons: ['取消', '清空并保留备份'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (选择.response !== 1) return { 好: false, 取消了: true }
    try {
      const 果 = 记忆.清空全部长期记忆()
      if (!果.没变化) {
        记忆关系整理.排队({ 原因: '用户清空长期记忆' })
        记忆聚类就绪.排队({ 原因: '用户清空长期记忆' })
      }
      return { 好: true, 条数: 果.条数, 没变化: !!果.没变化, 已备份: !!果.备份文件 }
    } catch (错误) {
      console.log('⚠ 长期记忆清空失败：' + 错误.message)
      return { 好: false, 说明: '长期记忆没有清空成功，原内容已尽量保留' }
    }
  })

  ipcMain.handle('修改长期记忆', (_事件, 请求) => {
    const 类别 = String((请求 && 请求.类别) || '')
    const 编号 = String((请求 && 请求.编号) || '').trim().slice(0, 120)
    const 内容 = String((请求 && 请求.内容) || '')
    if (!['事实', '经历', '小本子'].includes(类别)) return { 好: false, 说明: '记忆类别不对' }
    if (!编号) return { 好: false, 说明: '这条记忆没有编号，不能安全修改' }
    if (!内容.trim()) return { 好: false, 说明: '记忆内容不能为空' }
    if (内容.trim().length > 2000) return { 好: false, 说明: '记忆内容不能超过 2000 字' }
    try {
      const 果 = 记忆.改一条(类别, 编号, 内容)
      if (果.好 && !果.没变化) {
        记忆关系整理.排队({ 原因: '用户修改长期记忆' })
        记忆聚类就绪.排队({ 原因: '用户修改长期记忆' })
      }
      return 果.好 ? { 好: true, 没变化: !!果.没变化 } : 果
    } catch (错误) {
      console.log('⚠ 修改长期记忆失败：' + 错误.message)
      return { 好: false, 说明: '这条记忆没能保存' }
    }
  })

  ipcMain.handle('遗忘长期记忆', (_事件, 请求) => {
    const 类别 = String((请求 && 请求.类别) || '')
    const 编号 = String((请求 && 请求.编号) || '').trim().slice(0, 120)
    if (!['事实', '经历', '小本子'].includes(类别)) return { 好: false, 说明: '记忆类别不对' }
    if (!编号) return { 好: false, 说明: '这条记忆没有编号，不能安全遗忘' }
    try {
      const 删了 = 记忆.删一条(类别, 编号)
      if (删了) {
        记忆关系整理.排队({ 原因: '用户遗忘长期记忆' })
        记忆聚类就绪.排队({ 原因: '用户遗忘长期记忆' })
      }
      return 删了 ? { 好: true } : { 好: false, 说明: '没找到这条记忆，可能已经被改动或遗忘' }
    } catch (错误) {
      console.log('⚠ 遗忘长期记忆失败：' + 错误.message)
      return { 好: false, 说明: '这条记忆没能删除' }
    }
  })

  // ---- 长期记忆关系图：正文仍由记忆模块提供；这里只管理关系和画布布局 ----
  ipcMain.handle('问长期记忆关系图', (事件, 条件) => {
    确认来自聊天窗口(事件)
    try {
      return 记忆关系图.查询({
        类别: String((条件 && 条件.类别) || '').slice(0, 20),
        搜索: String((条件 && 条件.搜索) || '').slice(0, 80),
      })
    } catch (错误) {
      console.log('⚠ 长期记忆关系图读不出来：' + 错误.message)
      return { 好: false, 节点: [], 关系: [], 候选关系: [], 说明: '关系图暂时读不到' }
    }
  })

  ipcMain.handle('新增长期记忆关系', (事件, 请求) => {
    确认来自聊天窗口(事件)
    try {
      return 记忆关系图.新增({
        类型: String((请求 && 请求.类型) || '').slice(0, 20),
        从: { 类别: String(请求 && 请求.从 && 请求.从.类别 || '').slice(0, 20), 编号: String(请求 && 请求.从 && 请求.从.编号 || '').slice(0, 120) },
        到: { 类别: String(请求 && 请求.到 && 请求.到.类别 || '').slice(0, 20), 编号: String(请求 && 请求.到 && 请求.到.编号 || '').slice(0, 120) },
      })
    } catch (错误) {
      console.log('⚠ 新增长期记忆关系失败：' + 错误.message)
      return { 好: false, 说明: '关系没有保存成功' }
    }
  })

  ipcMain.handle('修改长期记忆关系', (事件, 请求) => {
    确认来自聊天窗口(事件)
    try {
      return 记忆关系图.修改({ 编号: String((请求 && 请求.编号) || '').slice(0, 120), 类型: String((请求 && 请求.类型) || '').slice(0, 20) })
    } catch (错误) {
      console.log('⚠ 修改长期记忆关系失败：' + 错误.message)
      return { 好: false, 说明: '关系没有修改成功' }
    }
  })

  ipcMain.handle('删除长期记忆关系', (事件, 编号) => {
    确认来自聊天窗口(事件)
    try { return 记忆关系图.删除(String(编号 || '').slice(0, 120)) } catch (错误) {
      console.log('⚠ 删除长期记忆关系失败：' + 错误.message)
      return { 好: false, 说明: '关系没有删除成功' }
    }
  })

  ipcMain.handle('保存长期记忆图布局', (事件, 请求) => {
    确认来自聊天窗口(事件)
    try { return 记忆关系图.保存布局(请求 || {}) } catch (错误) {
      console.log('⚠ 保存长期记忆关系图布局失败：' + 错误.message)
      return { 好: false, 说明: '卡片位置没有保存成功' }
    }
  })

  // ---- 临时记忆：跨重启的短期层；仍不进入提示词 ----
  ipcMain.handle('问临时记忆', (事件, 条件) => {
    确认来自聊天窗口(事件)
    try {
      const 类别 = String((条件 && 条件.类别) || '').slice(0, 20)
      const 生命周期 = String((条件 && 条件.生命周期) || '').slice(0, 10)
      const 确认状态 = String((条件 && 条件.确认状态) || '').slice(0, 10)
      const 搜索 = String((条件 && 条件.搜索) || '').slice(0, 80)
      临时记忆.归档到期()
      const 果 = 临时记忆.查询({ 类别, 生命周期, 确认状态, 搜索, 限量: 500 })
      const 列表 = 果.列表.map((一) => {
        const 原关系 = 临时记忆.读取关系(一.关系)
        const 关联编号 = String(原关系.目标编号 || 原关系.由编号 || (原关系.替代编号 && 原关系.替代编号[0]) || '')
        const 关联条 = 关联编号 ? 临时记忆.取一条(关联编号) : null
        return {
        编号: String(一.编号 || ''),
        类别: String(一.类别 || ''),
        记忆类型: String(一.记忆类型 || ''),
        元数据: {
          backstory: String(一.元数据 && 一.元数据.backstory || '').slice(0, 240),
          person: String(一.元数据 && 一.元数据.person || '').slice(0, 80),
          relationship: String(一.元数据 && 一.元数据.relationship || '').slice(0, 80),
        },
        内容: String(一.内容 || ''),
        创建于: String(一.创建于 || ''),
        更新于: String(一.更新于 || ''),
        到期于: String(一.到期于 || ''),
        生命周期: String(一.生命周期 || ''),
        确认状态: String(一.确认状态 || ''),
        重要性: Number.isInteger(Number(一.重要性)) ? Math.max(0, Math.min(3, Number(一.重要性))) : 1,
        来源: {
          对话: String(一.来源 && 一.来源.对话 || ''),
          消息时间: String(一.来源 && 一.来源.消息时间 || ''),
          提取方式: String(一.来源 && 一.来源.提取方式 || ''),
        },
        标签: (Array.isArray(一.标签) ? 一.标签 : []).slice(0, 12).map((名) => String(名 || '')),
        关系: {
          状态: String(原关系.状态 || '当前'),
          类型: String(原关系.类型 || ''),
          目标编号: String(原关系.目标编号 || ''),
          由编号: String(原关系.由编号 || ''),
          替代编号: (Array.isArray(原关系.替代编号) ? 原关系.替代编号 : []).slice(0, 20).map((编号) => String(编号 || '')),
          决定于: String(原关系.决定于 || ''),
          处理: String(原关系.处理 || ''),
          关联内容: String(关联条 && 关联条.内容 || '').slice(0, 300),
        },
        晋升: {
          状态: String(一.晋升 && 一.晋升.状态 || ''),
          去向: String(一.晋升 && 一.晋升.去向 || ''),
          目标编号: String(一.晋升 && 一.晋升.目标编号 || ''),
        },
        自主评估: 一.自主评估 && typeof 一.自主评估 === 'object' ? {
          分数: Math.max(0, Math.min(100, Number(一.自主评估.分数) || 0)),
          提及次数: Math.max(0, Math.min(99, Number(一.自主评估.提及次数) || 0)),
          依据: (Array.isArray(一.自主评估.依据) ? 一.自主评估.依据 : []).slice(0, 8).map((值) => String(值 || '').slice(0, 120)),
          确认于: String(一.自主评估.确认于 || ''),
        } : null,
        评估账本: 一.评估账本 && typeof 一.评估账本 === 'object' ? {
          提及次数: Math.max(0, Math.min(99, Number(一.评估账本.提及次数) || 0)),
          当前分数: Math.max(0, Math.min(100, Number(一.评估账本.当前分数) || 0)),
          历史最高分: Math.max(0, Math.min(100, Number(一.评估账本.历史最高分) || 0)),
          首次提及于: String(一.评估账本.首次提及于 || ''),
          最近提及于: String(一.评估账本.最近提及于 || ''),
          最近决定: String(一.评估账本.最近决定 || '').slice(0, 80),
          最近说明: String(一.评估账本.最近说明 || '').slice(0, 240),
          证据数: Math.min(100, Array.isArray(一.评估账本.证据) ? 一.评估账本.证据.length : 0),
        } : null,
        归档于: String(一.归档于 || ''),
        归档原因: String(一.归档原因 || ''),
      }})
      return { 好: true, 列表, 总数: 果.总数, 截断: 果.截断 }
    } catch (错误) {
      console.log('⚠ 临时记忆列表读不出来：' + 错误.message)
      return { 好: false, 列表: [], 总数: 0, 截断: false, 说明: '临时记忆暂时读不到' }
    }
  })

  // ---- 记忆日记：本地档案，不接入提示词或聊天上下文 ----
  ipcMain.handle('问记忆日记', (事件, 条件) => {
    确认来自聊天窗口(事件)
    const 值 = 条件 && typeof 条件 === 'object' && !Array.isArray(条件) ? 条件 : {}
    try {
      return {
        好: true,
        ...记忆日记.给界面({
          类型: String(值.类型 || '').slice(0, 4),
          搜索: String(值.搜索 || '').slice(0, 80),
          最多: 200,
        }),
      }
    } catch (错误) {
      return { 好: false, 说明: 错误.message, 列表: [], 总数: 0, 截断: false }
    }
  })

  // ---- 私密日记：只有本次显式打开后可读；不提供修改、导出、分享或聊天注入接口 ----
  ipcMain.handle('打开私密记忆日记', (事件, 条件) => {
    确认来自聊天窗口(事件)
    私密日记已打开 = true
    const 值 = 条件 && typeof 条件 === 'object' && !Array.isArray(条件) ? 条件 : {}
    try {
      return { 好: true, ...私密日记.给本机界面({ 搜索: String(值.搜索 || '').slice(0, 80), 最多: 200 }) }
    } catch (错误) {
      私密日记已打开 = false
      return { 好: false, 说明: 错误.message, 列表: [], 总数: 0, 截断: false }
    }
  })

  ipcMain.handle('关闭私密记忆日记', (事件) => {
    确认来自聊天窗口(事件)
    私密日记已打开 = false
    return { 好: true }
  })

  ipcMain.handle('问私密记忆日记', (事件, 条件) => {
    确认来自聊天窗口(事件)
    if (!私密日记已打开) return { 好: false, 锁定: true, 说明: '私密日记已经重新上锁', 列表: [], 总数: 0, 截断: false }
    const 值 = 条件 && typeof 条件 === 'object' && !Array.isArray(条件) ? 条件 : {}
    try {
      return { 好: true, ...私密日记.给本机界面({ 搜索: String(值.搜索 || '').slice(0, 80), 最多: 200 }) }
    } catch (错误) {
      return { 好: false, 说明: 错误.message, 列表: [], 总数: 0, 截断: false }
    }
  })

  ipcMain.handle('删除私密记忆日记', (事件, 请求) => {
    确认来自聊天窗口(事件)
    if (!私密日记已打开) return { 好: false, 锁定: true, 说明: '私密日记已经重新上锁' }
    const 值 = 请求 && typeof 请求 === 'object' && !Array.isArray(请求) ? 请求 : {}
    if (值.已确认 !== true) return { 好: false, 说明: '需要先在界面确认删除' }
    try {
      return 私密日记.删除日记({
        编号: String(值.编号 || '').slice(0, 160),
        版本标记: String(值.版本标记 || '').slice(0, 32),
      })
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('修改记忆日记', (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 值 = 请求 && typeof 请求 === 'object' && !Array.isArray(请求) ? 请求 : {}
    const 模块 = (Array.isArray(值.模块) ? 值.模块 : []).slice(0, 5).map((一) => ({
      名字: String((一 && 一.名字) || '').slice(0, 20),
      正文: String((一 && 一.正文) || '').slice(0, 4001),
      来源: (Array.isArray(一 && 一.来源) ? 一.来源 : []).slice(0, 30).map((编号) => String(编号 || '').slice(0, 160)),
    }))
    try {
      return 记忆日记.修改日记({
        编号: String(值.编号 || '').slice(0, 160),
        版本标记: String(值.版本标记 || '').slice(0, 32),
        标题: String(值.标题 || '').slice(0, 121),
        模块,
      })
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('删除记忆日记', async (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 值 = 请求 && typeof 请求 === 'object' && !Array.isArray(请求) ? 请求 : {}
    const 编号 = String(值.编号 || '').slice(0, 160)
    const 标题 = String(值.标题 || '这篇日记').replace(/\s+/g, ' ').trim().slice(0, 80)
    const 选择 = await dialog.showMessageBox(窗口, {
      type: 'warning', title: '删除记忆日记', message: `要删除“${标题 || '这篇日记'}”吗？`,
      detail: '删除后它会从时间轴和导出中消失，后台也不会重新生成这一周期。',
      buttons: ['取消', '删除'], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (选择.response !== 1) return { 好: false, 取消了: true }
    try {
      return 记忆日记.删除日记({ 编号, 版本标记: String(值.版本标记 || '').slice(0, 32) })
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('导出记忆日记', async (事件) => {
    确认来自聊天窗口(事件)
    const 选择 = await dialog.showSaveDialog(窗口, {
      title: '导出爱莉希雅的记忆日记',
      defaultPath: path.join(app.getPath('documents'), `爱莉希雅-记忆日记-${备份时间戳()}.md`),
      filters: [{ name: 'Markdown 文档', extensions: ['md'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (选择.canceled || !选择.filePath) return { 好: false, 取消了: true }
    try {
      return 记忆日记.导出Markdown(选择.filePath)
    } catch (错误) {
      console.log('⚠ 记忆日记导出失败：' + 错误.message)
      return { 好: false, 说明: '记忆日记没有导出成功' }
    }
  })

  ipcMain.handle('新增临时记忆', (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 类别 = String((请求 && 请求.类别) || '').slice(0, 20)
    const 记忆类型 = String((请求 && 请求.记忆类型) || '').slice(0, 20)
    const 内容 = String((请求 && 请求.内容) || '')
    const 保留天数 = Number(请求 && 请求.保留天数)
    const 原重要性 = 请求 && 请求.重要性
    const 重要性 = 原重要性 === undefined ? 1 : Number(原重要性)
    const 标签 = Array.isArray(请求 && 请求.标签) ? 请求.标签.slice(0, 12).map((一) => String(一 || '').slice(0, 40)) : []
    if (!临时记忆.固定分类.includes(类别)) return { 好: false, 说明: '临时记忆分类不对' }
    if (记忆类型 && !临时记忆.记忆类型们.includes(记忆类型)) return { 好: false, 说明: '记忆类型不对' }
    if (!内容.trim() || 内容.trim().length > 4000) return { 好: false, 说明: '内容必须是 1 到 4000 字' }
    if (!Number.isInteger(保留天数) || 保留天数 < 1 || 保留天数 > 30) return { 好: false, 说明: '保留天数必须是 1 到 30' }
    if (!Number.isInteger(重要性) || 重要性 < 0 || 重要性 > 3) return { 好: false, 说明: '重要性必须是 0 到 3' }
    try {
      const 条 = 临时记忆.新增(类别, 内容, { 保留天数, 重要性, 标签, 记忆类型, 提取方式: '手动' })
      记忆聚类就绪.排队({ 原因: '用户新增临时记忆' })
      return { 好: true, 编号: 条.编号 }
    } catch (错误) {
      console.log('⚠ 新增临时记忆失败：' + 错误.message)
      return { 好: false, 说明: '临时记忆没有保存成功' }
    }
  })

  ipcMain.handle('修改临时记忆', (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 编号 = String((请求 && 请求.编号) || '').trim().slice(0, 120)
    if (!编号) return { 好: false, 说明: '临时记忆编号不能为空' }
    const 改动 = {}
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '内容')) 改动.内容 = String(请求.内容 || '').slice(0, 4001)
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '类别')) 改动.类别 = String(请求.类别 || '').slice(0, 20)
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '记忆类型')) 改动.记忆类型 = String(请求.记忆类型 || '').slice(0, 20)
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '确认状态')) 改动.确认状态 = String(请求.确认状态 || '').slice(0, 10)
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '重要性')) 改动.重要性 = Number(请求.重要性)
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '到期于')) 改动.到期于 = String(请求.到期于 || '').slice(0, 80)
    if (Object.prototype.hasOwnProperty.call(请求 || {}, '标签')) {
      改动.标签 = Array.isArray(请求.标签) ? 请求.标签.slice(0, 12).map((一) => String(一 || '').slice(0, 40)) : []
    }
    try {
      const 果 = 临时记忆.修改(编号, 改动)
      if (果.好 && !果.没变化) 记忆聚类就绪.排队({ 原因: '用户修改临时记忆' })
      return 果.好 ? { 好: true, 没变化: !!果.没变化 } : 果
    } catch (错误) {
      console.log('⚠ 修改临时记忆失败：' + 错误.message)
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('处理临时记忆关系', (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 编号 = String((请求 && 请求.编号) || '').trim().slice(0, 120)
    const 选择 = String((请求 && 请求.选择) || '').trim().slice(0, 10)
    if (!编号) return { 好: false, 说明: '临时记忆编号不能为空' }
    if (!['替代旧条', '两条并存'].includes(选择)) return { 好: false, 说明: '关系决定不受支持' }
    try {
      const 果 = 临时记忆.决定替代(编号, 选择)
      if (果.好) 记忆聚类就绪.排队({ 原因: '用户处理临时记忆关系' })
      return 果.好 ? { 好: true, 选择: 果.选择 } : 果
    } catch (错误) {
      console.log('⚠ 处理临时记忆关系失败：' + 错误.message)
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('删除临时记忆', (事件, 原编号) => {
    确认来自聊天窗口(事件)
    const 编号 = String(原编号 || '').trim().slice(0, 120)
    if (!编号) return { 好: false, 说明: '临时记忆编号不能为空' }
    try {
      const 删了 = 临时记忆.删除(编号)
      if (删了) 记忆聚类就绪.排队({ 原因: '用户删除临时记忆' })
      return 删了 ? { 好: true } : { 好: false, 说明: '没找到这条临时记忆' }
    } catch (错误) {
      console.log('⚠ 删除临时记忆失败：' + 错误.message)
      return { 好: false, 说明: 错误.message || '临时记忆没有删除成功' }
    }
  })

  ipcMain.handle('恢复临时记忆', (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 编号 = String((请求 && 请求.编号) || '').trim().slice(0, 120)
    const 保留天数 = Number(请求 && 请求.保留天数)
    if (!编号) return { 好: false, 说明: '临时记忆编号不能为空' }
    if (!Number.isInteger(保留天数) || 保留天数 < 1 || 保留天数 > 30) return { 好: false, 说明: '保留天数必须是 1 到 30' }
    try {
      const 果 = 临时记忆.恢复(编号, 保留天数)
      if (果.好) 记忆聚类就绪.排队({ 原因: '用户恢复临时记忆' })
      return 果
    } catch (错误) {
      console.log('⚠ 恢复临时记忆失败：' + 错误.message)
      return { 好: false, 说明: '临时记忆没有恢复成功' }
    }
  })

  ipcMain.handle('晋升临时记忆', (事件, 请求) => {
    确认来自聊天窗口(事件)
    const 编号 = String((请求 && 请求.编号) || '').trim().slice(0, 120)
    const 去向 = String((请求 && 请求.去向) || '').trim()
    if (!编号) return { 好: false, 说明: '临时记忆编号不能为空' }
    if (!['事实', '经历', '小本子'].includes(去向)) return { 好: false, 说明: '晋升去向不对' }
    try {
      const 果 = 晋升到长期({ 临时库: 临时记忆, 长期库: 记忆, 编号, 去向 })
      if (果.好 && !果.没变化) {
        记忆关系整理.排队({ 原因: '用户将临时记忆晋升到长期层' })
        记忆聚类就绪.排队({ 原因: '用户将临时记忆晋升到长期层' })
      }
      return 果
    } catch (错误) {
      console.log('⚠ 晋升临时记忆失败：' + 错误.message)
      return { 好: false, 说明: '临时记忆没有晋升成功，可安全重试' }
    }
  })

  // 即时反应只存在内存里，按对话隔离；查看和复位都不触碰记忆文件。
  ipcMain.handle('问情感状态', (事件) => {
    确认来自聊天窗口(事件)
    const 编号 = 记忆.现在哪一段()
    return { 好: true, ...情感状态.状态(编号), 缓慢: 情感状态.情绪状态(编号) }
  })

  ipcMain.handle('重置情感状态', (事件) => {
    确认来自聊天窗口(事件)
    const 编号 = 记忆.现在哪一段()
    const 结果 = 情感状态.重置(编号)
    const 缓慢 = 情感状态.情绪状态(编号)
    if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('情感状态变了', { ...结果, 缓慢 })
    return { 好: true, ...结果, 缓慢 }
  })

  ipcMain.handle('重置缓慢情绪', (事件) => {
    确认来自聊天窗口(事件)
    const 编号 = 记忆.现在哪一段()
    const 缓慢 = 情感状态.重置情绪(编号)
    const 结果 = { 好: true, ...情感状态.状态(编号), 缓慢 }
    if (窗口 && !窗口.isDestroyed()) 窗口.webContents.send('情感状态变了', 结果)
    return 结果
  })

  // 【换模式改的是"当前这一段"，不是全局】
  //   2026-10-07 改的，理由见 当前模式() 上面那一整段。
  ipcMain.handle('换模式', (_事件, 新模式) => {
    const 模式 = 选一个模式(新模式)
    const 编号 = 记忆.现在哪一段()
    if (临时对话.有(编号)) 临时对话.设模式(编号, 模式)
    else 记忆.设这段的模式(编号, 模式)
    console.log(`这一段的模式改成：${模式中文(模式)}`)
    更新托盘菜单()
    // 左边那一列每段后面要标出它是哪种模式 —— 改完得把清单推回去，
    // 不然界面上还挂着旧的（这个坑在"开新对话"上踩过一次）
    发对话们(窗口)
    return { 模式, 工作区: 读设置().工作区 || null }
  })

  ipcMain.handle('选工作区', async () => {
    const 选的 = await 选干活目录()
    return { 模式: 当前模式(), 工作区: 选的 }
  })

  ipcMain.handle('清工作区', () => {
    写设置({ 工作区: null })
    更新托盘菜单()
    return { 模式: 当前模式(), 工作区: null }
  })

  // ---- 文件侧栏：她这一轮实际写出了什么 ----
  ipcMain.handle('问产物', () => ({ 好: true, 产物们: 读最近产物() }))
  ipcMain.handle('预览产物', (_事件, 文件路径) => {
    准备文件权限()
    return 产物.预览(文件路径)
  })
  ipcMain.handle('打开产物', async (_事件, 文件路径) => {
    准备文件权限()
    const 核过 = 产物.核对文件(文件路径)
    if (!核过.好) return 核过
    try {
      const 错误 = await shell.openPath(核过.路径)
      return 错误 ? { 好: false, 说明: 错误 } : { 好: true }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  // 历史工作里的产物可能被移动、删除，工作区权限也可能已经变化。
  // “继续处理”前只核对文件元信息，不读取正文；失效路径不会回给 renderer。
  ipcMain.handle('核对工作产物', (_事件, 路径们) => {
    准备文件权限()
    const 输入 = (Array.isArray(路径们) ? 路径们 : [])
      .slice(0, 20)
      .map((一) => String(一 || '').slice(0, 1000))
      .filter(Boolean)
    const 有效 = []
    let 失效数 = 0
    const 见过 = new Set()
    for (const 路径 of 输入) {
      const 果 = 产物.核对文件(路径)
      if (!果.好) {
        失效数++
        continue
      }
      const 键 = 果.路径.toLowerCase()
      if (见过.has(键)) continue
      见过.add(键)
      有效.push({ 路径: 果.路径, 名字: path.basename(果.路径) })
    }
    return { 好: true, 产物们: 有效, 失效数 }
  })

  // ---- 工作索引：只读、裁剪后的历史工作记录 ----
  ipcMain.handle('问工作索引', (_事件, 选项) => {
    const 值 = 选项 && typeof 选项 === 'object' && !Array.isArray(选项) ? 选项 : {}
    try {
      return {
        好: true,
        ...工作索引.给界面({
          搜索: String(值.搜索 || '').slice(0, 80),
          状态: String(值.状态 || '').slice(0, 10),
          最多: 100,
        }),
      }
    } catch (错误) {
      return { 好: false, 说明: 错误.message, 列表: [], 总数: 0, 截断: false }
    }
  })

  // ---- 学习进度（课程 / 当前章节 / 下一步 / 复习时间）----
  ipcMain.handle('问学习状态', () => {
    try {
      return { 好: true, ...学习进度.四项状态() }
    } catch (错误) {
      return {
        好: false,
        说明: '读不出学习进度：' + 错误.message,
        课程: '',
        当前章节: '',
        下一步: '',
        复习时间: '',
      }
    }
  })

  // ---- 学习任务（那张待办清单）----
  //
  // 【为什么不挑模式】清单只是一份数据 ——
  //   他哪天在干活模式下想瞄一眼待办，也不该拦着。
  //   "那个按钮只在学习模式露出来"是**界面的事**，不是这儿的事。
  //
  // 【为什么每次都把整份清单回过去，不只回"成了没"】
  //   界面上要立刻重画。只回一个 true 的话，界面还得再问一次 ——
  //   两次往返之间他可能已经手改过文件了，画出来的就跟真清单不一样。
  //   一次给全，中间没有缝。
  const 带清单 = (果) => ({
    ...果,
    任务们: 学习任务.读(),
    统计: 学习任务.统计(),
  })

  ipcMain.handle('问任务', () => {
    try {
      学习任务.建空的()
      return 带清单({ 好: true })
    } catch (错误) {
      return { 好: false, 说明: '读不出任务清单：' + 错误.message, 任务们: [], 统计: { 一共: 0, 做完: 0, 没做: 0 } }
    }
  })

  ipcMain.handle('加任务', (_事件, 文字) => 带清单(学习任务.加(文字)))

  ipcMain.handle('勾任务', (_事件, 选项) => {
    const { 哪条, 完成 } = 选项 || {}
    return 带清单(学习任务.勾(哪条, 完成 !== false))
  })

  // 【他删得掉，她删不掉】—— 见 脑\工具表.cjs 里 管任务 那一段的理由
  ipcMain.handle('删任务', (_事件, 哪条) => 带清单(学习任务.删(哪条)))

  // ---- 聊天记录 ----
  // 窗口里点"看更早的"就全发过去；清空只是清屏幕，记录文件不动。
  ipcMain.on('要全部聊天记录', (事件) => {
    const 窗 = BrowserWindow.fromWebContents(事件.sender)
    if (窗) 发历史(窗, 0)
  })

  // ---- 开一段新对话（窗口顶上那个 ＋）----
  //
  // 【它做两件事，缺一不可】
  //   1. 往聊天记录里插一条"新的一段"分隔线 —— 那是**留在盘上**的界线，
  //      程序重启之后 读最近聊天() 靠它知道"眼前这段从哪儿开始"。
  //   2. 把**内存里那份**历史也清掉（历史表）。
  //
  //   为什么两件都要做：她说话时用的是内存里那份（取历史），
  //   光写文件的话，这一节窗口不关，她照样记得刚才那几句 ——
  //   那就成了"按了没反应"。反过来光清内存不写文件，
  //   下次重启她又全记起来了。**两边都得断。**
  //
  //   长期记忆（事实/经历/小本子）一个字都不动 —— 所以她不是失忆，
  //   只是翻篇了。这跟 DSH 里"新开一个对话"是一回事。
  // ---- 开一段新对话（左边那一列的 ＋）----
  //
  // 【它做两件事，缺一不可】
  //   1. 建一个新编号，写进 对话索引.json —— 那是**留在盘上**的，
  //      程序重启之后还知道有这一段。
  //   2. 把**内存里那份**历史清掉（历史表）。
  //
  //   为什么两件都要做：她说话时用的是内存里那份（取历史），
  //   光写文件的话，这一节窗口不关，她照样带着上一段的话 ——
  //   那就成了"按了没反应"。反过来光清内存不写文件，下次重启又串了。
  //
  //   长期记忆（事实/经历/小本子）一个字都不动 —— 所以她不是失忆，
  //   只是换了个话题。这跟 DSH 里"新开一个对话"是一回事。
  ipcMain.handle('开新对话', (事件, 选项) => {
    取消主动陪伴生成()
    if (主动陪伴调度) 主动陪伴调度.用户活动()
    const 窗口编号 = 事件.sender.id
    // 【模型和模式都是选填的】他要的是"像 DSH 那样，开对话的时候选"。
    //   不传（或者传空）就跟着默认走 —— 索引里干脆不记这个字段。
    //   这样将来默认值改了，那些没选过的对话也跟着改，不会僵在旧名字上。
    const 模型 = 选项 && 选项.模型 ? String(选项.模型) : ''
    // 模式：不传就**继承当前这一段的** —— 他连着建两段学习用的对话时，
    // 不用每次重选一遍。（模型没这么做是因为"换脑子"比"换用途"频繁得多。）
    const 模式 = 选项 && 选项.模式 ? 选一个模式(选项.模式) : 当前模式()
    const 新编号 = 记忆.建新对话('', 模型, 模式)
    历史表.delete(窗口编号)
    写设置({ 对话: 新编号 })
    console.log(
      `  ✂ 开了一段新对话（${新编号}，${模式中文(模式)}${模型 ? '，用 ' + 模型 : ''}）` +
        ' —— 上一段她不再带着了，长期记忆没动',
    )

    // 【建完必须主动推一次 —— 2026-10-03 漏了这一步】
    //   漏了的后果：他点了 ＋，新那段确实建好了、确实切过去了，
    //   可**左边那一列的清单没刷新** —— 屏幕上什么都没多出来。
    //   于是他以为按钮坏了，一直点，一口气建了六段空的。
    //   （他的原话："为什么没有开启新对话"。）
    //   教训：**改了状态就要把状态推给界面**，
    //   别指望界面自己会知道 —— 它没有别的地方能知道。
    const 这一窗 = 取窗口(事件)
    发历史(这一窗)
    发当前模式(这一窗)

    return { 好: true, 编号: 新编号, 模型 }
  })

  // ---- 开一段临时对话 ----
  // 只建内存对象，不写索引、不改“上次打开的正式对话”。模式和模型继承当前这一段。
  ipcMain.handle('开临时对话', (事件) => {
    取消主动陪伴生成()
    if (主动陪伴调度) 主动陪伴调度.用户活动()
    const 编号 = 临时对话.建({ 模式: 当前模式(), 模型: 当前模型() })
    记忆.设当前对话(编号)
    console.log(`  ◇ 开了一段临时对话（${编号}）—— 关闭程序后消失`)
    const 这一窗 = 取窗口(事件)
    发历史(这一窗)
    发当前模式(这一窗)
    return { 好: true, 编号, 临时: true }
  })

  // ---- 删除一段临时对话 ----
  // 正式对话不经过这里；删当前段时，优先回到另一段临时对话，
  // 没有就回到设置里记着的上一段正式对话。
  ipcMain.handle('删临时对话', (事件, 编号) => {
    const 要删的 = String(编号 || '')
    if (!临时对话.有(要删的)) return { 好: false, 说明: '这不是临时对话，不能在这里删除' }
    const 正在当前段 = 记忆.现在哪一段() === 要删的
    if (正在当前段 && 正在说) return { 好: false, 说明: '等她把这一句说完再删除' }

    临时对话.删(要删的)
    if (!正在当前段) {
      发对话们(取窗口(事件))
      return { 好: true, 编号: 记忆.现在哪一段() }
    }

    const 另一段临时 = 临时对话.列表()[0]
    const 正式列表 = 记忆.对话列表()
    const 上次正式编号 = String(读设置().对话 || '')
    const 上次正式 = 正式列表.find((一) => 一.编号 === 上次正式编号)
    const 回到 = (另一段临时 && 另一段临时.编号) || (上次正式 && 上次正式.编号) ||
      (正式列表[0] && 正式列表[0].编号) || 记忆.默认对话
    记忆.设当前对话(回到)
    if (!临时对话.有(回到)) 写设置({ 对话: 回到 })

    const 这一窗 = 取窗口(事件)
    发历史(这一窗)
    发当前模式(这一窗)
    console.log(`  ◇ 删掉临时对话「${要删的}」，回到「${回到}」`)
    return { 好: true, 编号: 回到 }
  })

  // ---- 这把钥匙能用哪些模型（点 ＋ 新对话 的时候要列给他挑）----
  //
  // 【为什么不写死一张清单】
  //   模型名单是会变的：她现在用的 `deepseek-chat` 已经不在名单上了，只是还能用。
  //   写死的话，哪天名单一动，界面上列的就是一堆点不动的名字。
  //   （这条问话**不花钱** —— 它不发对话、不计 token。）
  ipcMain.handle('有哪些模型', () => 有哪些模型())

  // ---- 附件：给界面读缩略图、用系统程序打开 ----
  //
  // 【为什么不让界面自己去读文件】
  //   渲染进程默认不能读本地文件（`webSecurity` 是开着的）——
  //   这是对的，网页那一层不该有随便读盘的本事。
  //   所以要走这儿：主进程读完、转成 data URL 递过去。
  //   顺带一个好处：能读的**只有附件目录里那些**，
  //   界面上给什么名字都跳不出那个目录（见 脑\附件.cjs 的 路径()）。
  ipcMain.handle('读附件', (_事件, 存成) => {
    const 临时目录 = 当前是临时对话() ? 临时对话.附件目录(记忆.现在哪一段()) : ''
    return 附件.读预览(存成, 临时目录 || undefined)
  })

  /** 用系统默认程序打开它（图片就用看图软件、pdf 就用阅读器） */
  ipcMain.handle('打开附件', (_事件, 存成) => {
    const 临时目录 = 当前是临时对话() ? 临时对话.附件目录(记忆.现在哪一段()) : ''
    const 一个 = 附件.路径(存成, 临时目录 || undefined)
    if (!一个) return { 好: false, 说明: '名字不对' }
    try {
      shell.openPath(一个)
      return { 好: true }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  // ---- 换到另一段对话（左边那一列里点一下）----
  ipcMain.handle('换对话', (事件, 编号) => {
    取消主动陪伴生成()
    if (主动陪伴调度) 主动陪伴调度.用户活动()
    const 窗口编号 = 事件.sender.id
    const 要的 = String(编号 || 记忆.默认对话)
    // 【为什么要先确认这一段真的存在】
    //   窗口那边送来的是字符串，万一列表过期了（比如刚在别处删过），
    //   直接切过去会切到一个空编号上 —— 她就像突然失忆，还查不出原因。
    const 是临时 = 临时对话.有(要的)
    const 有这段 = 是临时 || 记忆.对话列表().some((一) => 一.编号 === 要的)
    if (!有这段) {
      console.log(`  ⚠ 想换到「${要的}」，可列表里没有这一段 —— 没换`)
      return { 好: false, 说明: '没有这一段' }
    }
    记忆.设当前对话(要的)
    历史表.delete(窗口编号) // 内存那份也得换掉，不然她还带着上一段
    // 临时对话不能覆盖“下次启动回到哪一段”；只为正式对话写设置。
    if (!是临时) 写设置({ 对话: 要的 })
    console.log(`  ⇄ 换到对话「${要的}」`)

    // 同"开新对话"：换了段，窗口上那一屏就得换成这一段的
    // （聊天记录 + 左边那一列，一起推）
    const 这一窗 = 取窗口(事件)
    发历史(这一窗)
    发当前模式(这一窗)

    return { 好: true, 编号: 要的 }
  })

  // ---- 左边那一列要的东西 ----
  ipcMain.handle('问对话们', () => {
    try {
      return {
        好: true,
        现在: 记忆.现在哪一段(),
        列表: [...临时对话.列表(), ...记忆.对话列表()],
      }
    } catch (错误) {
      console.log('⚠ 列对话出错: ' + 错误.message)
      return { 好: false, 现在: 记忆.默认对话, 列表: [] }
    }
  })

  // 菜单栏拆掉之后，开发者工具得有个入口（窗口里绑的是 Ctrl+Shift+I）
  ipcMain.on('开发者工具', () => {
    if (窗口 && !窗口.isDestroyed()) 窗口.webContents.toggleDevTools()
  })

  // ---- 状态：模型通不通、声音在不在、记忆有多少 ----
  ipcMain.handle('体检', async () => {
    const [模型结果, 声音结果] = await Promise.all([体检(), TTS.status()])
    return {
      模型: 模型结果,
      声音: 声音结果,
      记忆: {
        事实: JSON.parse(fs.readFileSync(记忆.事实文件, 'utf8') || '[]').length,
        经历: JSON.parse(fs.readFileSync(记忆.经历文件, 'utf8') || '[]').length,
        小本子: JSON.parse(fs.readFileSync(记忆.小本子文件, 'utf8') || '[]').length,
      },
      桌宠: 有进程('Bongo Cat Mver.exe'),
    }
  })

  // ---- 设置：DeepSeek API Key ----
  // Key 从不回传给网页；网页只能看见遮住后的头尾。
  ipcMain.handle('密钥状态', async (事件) => {
    确认来自聊天窗口(事件)
    return await 密钥状态()
  })

  ipcMain.handle('保存密钥', async (事件, 原文) => {
    确认来自聊天窗口(事件)
    try {
      await 密钥存储.保存(String(原文 || ''))
      await 加载加密密钥()
      return { 好: true, 状态: await 密钥状态() }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('清除密钥', async (事件) => {
    确认来自聊天窗口(事件)
    try {
      密钥存储.清除()
      delete process.env.ELYSIA_SECURE_API_KEY
      return { 好: true, 状态: await 密钥状态() }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('测试密钥', async (事件) => {
    确认来自聊天窗口(事件)
    return await 体检()
  })

  // ---- 设置：SerpAPI 联网搜索 Key ----
  // 与模型 Key 分文件加密；完整值同样不回传 renderer。
  ipcMain.handle('搜索密钥状态', async (事件) => {
    确认来自聊天窗口(事件)
    return await 搜索密钥状态()
  })

  ipcMain.handle('保存搜索密钥', async (事件, 原文) => {
    确认来自聊天窗口(事件)
    try {
      await 搜索密钥存储.保存(String(原文 || ''))
      await 加载搜索密钥()
      return { 好: true, 状态: await 搜索密钥状态() }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('清除搜索密钥', async (事件) => {
    确认来自聊天窗口(事件)
    try {
      搜索密钥存储.清除()
      delete process.env.ELYSIA_SERPAPI_API_KEY
      return { 好: true, 状态: await 搜索密钥状态() }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('测试搜索密钥', async (事件) => {
    确认来自聊天窗口(事件)
    const { 钥匙 } = 拿搜索钥匙()
    if (!钥匙) return { 通: false, 说明: '还没有可用的 SerpAPI Key。' }
    // 这里测的是 SerpAPI 那把钥匙，所以必须显式指定供应商 ——
    // 否则当前供应商是 deepseek 时会把 SerpAPI 的钥匙发到 DeepSeek 去。
    const 结果 = await 联网搜索.搜索('SerpAPI official', { 钥匙, 供应商: 'serpapi', 最多: 1 })
    return 结果.好
      ? { 通: true, 说明: `SerpAPI 搜索成功，取得 ${结果.条数} 个来源。若命中一小时内的相同缓存，本次免费；否则通常计 1 次搜索。` }
      : { 通: false, 说明: 结果.说明 }
  })

  // ---- 设置：联网搜索后端开关（deepseek / serpapi）----
  // 写进工作区配置 elysia.config.json —— 和 脑\配置.cjs 读的是同一个文件，
  // 同时改内存里的值，切完立刻生效，不用重启。
  function 写工作区配置字段(键, 值) {
    const 文件 = 配置.配置文件
    let 现 = {}
    try { 现 = JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')) } catch { 现 = {} }
    if (!现 || typeof 现 !== 'object' || Array.isArray(现)) 现 = {}
    现[键] = 值
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    fs.writeFileSync(文件, JSON.stringify(现, null, 2) + '\n', 'utf8')
  }

  function 搜索供应商快照() {
    return {
      好: true,
      当前: 配置.当前搜索供应商(),
      可选: ['deepseek', 'serpapi'],
      有SerpAPI密钥: Boolean(String(process.env.ELYSIA_SERPAPI_API_KEY || '').trim()),
    }
  }

  ipcMain.handle('搜索供应商状态', (事件) => {
    确认来自聊天窗口(事件)
    return 搜索供应商快照()
  })

  ipcMain.handle('设置搜索供应商', (事件, 值) => {
    确认来自聊天窗口(事件)
    const 想要 = String(值 || '').trim().toLowerCase()
    if (!['deepseek', 'serpapi'].includes(想要)) return { 好: false, 说明: '不认识的搜索后端' }
    try {
      写工作区配置字段('searchProvider', 想要)
    } catch (错误) {
      return { 好: false, 说明: '写入配置失败：' + 错误.message }
    }
    配置.设搜索供应商(想要)
    return 搜索供应商快照()
  })

  // ---- 设置：语音输入设备 ----
  // 只保存 Chromium 给出的短设备编号；renderer 不能借此传入路径或命令。
  ipcMain.handle('语音输入设置', (事件) => {
    确认来自聊天窗口(事件)
    return { 麦克风设备: String(读设置().麦克风设备 || '').slice(0, 300) }
  })

  ipcMain.handle('保存麦克风设备', (事件, 原编号) => {
    确认来自聊天窗口(事件)
    const 麦克风设备 = String(原编号 || '').trim()
    if (麦克风设备.length > 300 || /[\u0000-\u001f]/.test(麦克风设备)) return { 好: false, 说明: '麦克风设备编号不合法' }
    if (!写设置({ 麦克风设备 })) return { 好: false, 说明: '设置没有保存成功' }
    return { 好: true, 麦克风设备 }
  })

  // ---- 设置：主动陪伴 ----
  // 设置读取只返回有限调度状态与最近结果，不返回提示词或聊天正文。
  ipcMain.handle('主动陪伴设置', (事件) => {
    确认来自聊天窗口(事件)
    return { 好: true, ...主动陪伴状态() }
  })

  ipcMain.handle('保存主动陪伴设置', (事件, 输入) => {
    确认来自聊天窗口(事件)
    const 配置 = 主动陪伴.规范配置(输入 || {})
    if (!写设置({ 主动陪伴: 配置 })) return { 好: false, 说明: '主动陪伴设置没有保存成功' }
    if (主动陪伴调度) 主动陪伴调度.改配置(配置)
    return { 好: true, ...主动陪伴状态() }
  })

  ipcMain.handle('测试主动陪伴', async (事件) => {
    确认来自聊天窗口(事件)
    if (!主动陪伴调度) return { 好: false, 说明: '主动陪伴调度还没有启动' }
    const 结果 = await 主动陪伴调度.立即尝试()
    return { 好: !!结果.触发, 说明: 结果.触发 ? '测试消息已经写入当前对话' : 结果.原因 }
  })

  function 收界面状态(状态) {
    陪伴界面状态 = {
      正在录音: !!(状态 && 状态.正在录音),
      正在播放语音: !!(状态 && 状态.正在播放语音),
      正在编辑: !!(状态 && 状态.正在编辑),
      全屏: !!(状态 && 状态.全屏),
      勿扰: !!(状态 && 状态.勿扰),
    }
  }

  ipcMain.on('主动陪伴活动', (事件, 状态) => {
    确认来自聊天窗口(事件)
    收界面状态(状态)
    取消主动陪伴生成()
    if (主动陪伴调度) 主动陪伴调度.用户活动()
  })

  ipcMain.on('主动陪伴界面状态', (事件, 状态) => {
    确认来自聊天窗口(事件)
    收界面状态(状态)
  })

  // ---- 设置：用户数据 ----
  ipcMain.handle('打开用户数据目录', async (事件) => {
    确认来自聊天窗口(事件)
    const 用户数据目录 = path.dirname(配置.角色卡路径)
    const 错误 = await shell.openPath(用户数据目录)
    return 错误 ? { 好: false, 说明: 错误 } : { 好: true, 目录: 用户数据目录 }
  })

  ipcMain.handle('导出用户备份', async (事件) => {
    确认来自聊天窗口(事件)
    const 默认名字 = `爱莉希雅-用户数据-${备份时间戳()}.zip`
    const 选择 = await dialog.showSaveDialog(窗口, {
      title: '导出爱莉希雅的用户数据',
      defaultPath: path.join(app.getPath('documents'), 默认名字),
      filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (选择.canceled || !选择.filePath) return { 好: false, 取消了: true }

    try {
      const 结果 = await 在线程里创建备份({
        目标文件: 选择.filePath,
        角色卡路径: 配置.角色卡路径,
        数据目录: 配置.数据目录,
        学习区根: 配置.学习区根,
        应用版本: app.getVersion(),
      })
      return { 好: true, ...结果 }
    } catch (错误) {
      return { 好: false, 说明: 错误.message }
    }
  })

  ipcMain.handle('启动桌宠', () => {
    const 身体 = 建Live2D窗口()
    身体.showInactive()
    return true
  })
  ipcMain.handle('做个表情', (_事件, 名字) => {
    const 表情 = String(名字 || '').slice(0, 40)
    const 类型 = /星星眼|眯眯眼|开心|超级爱莉|爱门/.test(表情) ? '开心'
      : /疑问|好奇/.test(表情) ? '疑惑'
        : /惊讶|痴呆/.test(表情) ? '惊讶'
          : /流汗|担心/.test(表情) ? '关心'
            : /认真|脸黑|生气|侵蚀/.test(表情) ? '认真'
              : '说话'
    广播表现事件({
      版本: 1, 对话: String(记忆.现在哪一段() || ''), 类型, 阶段: '手动',
      强度: 0.82, 温度: 0.78, 活跃度: 0.62, 基调: '平稳', 基调强度: 0,
      表情, 表情来源: '手动', 产生于: new Date().toISOString(),
    })
    return { 成功: true, 说明: `Live2D 已收到「${表情 || 类型}」` }
  })
  ipcMain.on('live2d-准备好了', (事件) => {
    if (!Live2D窗 || Live2D窗.isDestroyed() || 事件.sender !== Live2D窗.webContents) return
    if (最近表现事件) Live2D窗.webContents.send('live2d-表现', 最近表现事件)
  })
  ipcMain.on('live2d-说话', (_事件, 在说) => {
    if (Live2D窗 && !Live2D窗.isDestroyed()) Live2D窗.webContents.send('live2d-说话', Boolean(在说))
  })
  ipcMain.on('live2d-口型', (_事件, 强度) => {
    if (!Live2D窗 || Live2D窗.isDestroyed()) return
    Live2D窗.webContents.send('live2d-口型', Math.max(0, Math.min(1, Number(强度) || 0)))
  })
  ipcMain.on('live2d-快聊切换', (事件) => {
    if (!Live2D窗 || Live2D窗.isDestroyed() || 事件.sender !== Live2D窗.webContents) return
    切换Live2D快聊()
  })
  ipcMain.on('live2d-切换', (事件) => {
    if (!窗口 || 窗口.isDestroyed() || 事件.sender !== 窗口.webContents) return
    切换Live2D()
  })
  ipcMain.on('live2d-手势', (事件, 数据) => {
    if (!Live2D窗 || Live2D窗.isDestroyed() || 事件.sender !== Live2D窗.webContents) return
    const 阶段 = String(dataValue(数据, '阶段') || '')
    if (阶段 === '开始') 开始Live2D手势(数据)
    else if (阶段 === '移动') 更新Live2D手势(数据)
    else if (阶段 === '结束') 结束Live2D手势(数据)
  })
  ipcMain.handle('打开文件夹', (_事件, 哪个) => {
    const 表 = { 记忆: 记忆.记忆目录, 项目: __dirname, 桌宠: 桌宠目录 }
    return shell.openPath(表[哪个] || __dirname)
  })
}

// ============================================================
// 最近的聊天：她得记得刚才说了什么
// ============================================================
//
// 【2026-10-03 改过：这里不再"按条数"截了】
//   原来窗口一开读 10 条、内存里最多留 20 条 —— 都是拍脑袋的数。
//   同样 10 条，一句"在吗"和一句贴了文件内容的，差几百倍；
//   而"她记得多少"这件事，本来就该按**长度**算，不按条数算。
//
//   现在这儿只负责**多留一点**（够她翻的），真正"这次给她多少"由
//   脑\对话.cjs 的 挑历史() 按预算挑 —— 那儿才知道这一次的额度有多大。
//   分工：这儿管"手上有多少"，那儿管"这次给多少"。

// 每次窗口刷新都会清空，所以历史存在主进程这边（按窗口的编号分开）
//
// 【注意这一行，别在改注释的时候顺手删掉】
//   2026-10-03 我重写上面那段说明时，把它连着上下两行一起换掉了 ——
//   `node --check` 照样通过（"历史表"只是个没声明的名字，语法上没毛病），
//   可跑起来第一句 历史表.has() 就会炸。
//   **语法检查管不了"名字有没有定义"**，这类错只能靠跑或靠看。
const 历史表 = new Map()

/** 内存里最多留多少条（够 挑历史 从里面挑就行，不是给她的量） */
const 内存里最多留 = 400

/** 窗口一开，从盘上读回多少条 */
const 开机读回多少条 = 400

function 取历史(窗口编号, 对话编号 = 记忆.现在哪一段()) {
  if (临时对话.有(对话编号)) return 临时对话.给模型(对话编号)
  if (!历史表.has(窗口编号)) {
    // 第一次：把上次关窗口之前聊的读回来，这样她还是接得上
    const 旧的 = 记忆.读最近聊天(开机读回多少条).map((条) => ({ role: 条.角色, content: 条.内容, 时间: 条.时间 }))
    历史表.set(窗口编号, 旧的)
  }
  return 历史表.get(窗口编号)
}

/** 把这一轮追加进历史（在"说话"那个 handler 里用得上，所以单独抽出来） */
function 记进历史(窗口编号, 他说的话, 她说的话, 对话编号 = 记忆.现在哪一段()) {
  if (临时对话.有(对话编号)) {
    临时对话.记一轮(对话编号, 他说的话, 她说的话)
    return
  }
  const 历史 = 取历史(窗口编号, 对话编号)
  const 时间 = new Date().toISOString()
  历史.push({ role: 'user', content: 他说的话, 时间 })
  历史.push({ role: 'assistant', content: 她说的话, 时间 })
  // 这儿只是别让内存无限长 —— 给她的量在 脑\对话.cjs 里按长度挑
  while (历史.length > 内存里最多留) 历史.shift()
}

// ============================================================
// 启动
// ============================================================

// 只允许开一个 —— 开第二个的时候，把已有的那个叫出来就行。
// （不然会有两个托盘图标、两份记忆在打架）
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => 出现())

  app.whenReady().then(async () => {
    // 临时记忆跨重启保留，但过了期限要先归档。坏文件只记日志，不能挡住程序启动。
    try {
      const 归档 = 临时记忆.归档到期()
      if (归档.数量) console.log(`临时记忆：归档了 ${归档.数量} 条到期记录`)
    } catch (错误) {
      console.log('⚠ 临时记忆到期检查失败（不影响启动）：' + 错误.message)
    }
    // 上次若崩在临时对话里，缓存附件可能没来得及收；启动先扫干净。
    临时对话.清附件()
    console.log('')
    console.log('========== 爱莉希雅 ==========')
    console.log('项目: ' + __dirname)

    app.setAppUserModelId('com.elysia.desktop')

    // 只允许主聊天窗口在用户按住麦克风按钮后请求音频；摄像头始终拒绝。
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const 来自主窗口 = !!窗口 && !窗口.isDestroyed() && webContents.id === 窗口.webContents.id
      const 媒体们 = Array.isArray(details && details.mediaTypes) ? details.mediaTypes : []
      callback(来自主窗口 && permission === 'media' && 媒体们.length === 1 && 媒体们[0] === 'audio')
    })

    // safeStorage 只有 app ready 后才能用；窗口建起来前先把保存的 Key 解进内存。
    await Promise.all([加载加密密钥(), 加载搜索密钥()])

    // ---- 接着上次那段对话 ----
    //
    // 【为什么要在建窗口之前定下来】
    //   窗口一打开就会跟主进程要聊天记录，那时候"现在在哪一段"
    //   必须已经是上次离开时那一段 —— 不然他会看到另一段的内容，
    //   然后一头雾水（"我昨天说的话呢？"）。
    记忆.补一次老记录那段() // 2026-10-03 之前那些老记录，正式归进"最早"那一段
    const 上次那段 = 读设置().对话
    if (上次那段 && 记忆.对话列表().some((一) => 一.编号 === 上次那段)) {
      记忆.设当前对话(上次那段)
    } else {
      // 没存过、或者那一段没了（索引被动过）→ 退到最新那一段
      const 列表 = 记忆.对话列表()
      记忆.设当前对话(列表.length ? 列表[0].编号 : 记忆.默认对话)
    }
    console.log('对话: ' + 记忆.现在哪一段() + '（一共 ' + 记忆.对话列表().length + ' 段）')
    准备主动陪伴()

    // 窗口先起来，日记随后在空闲时补。常驻期间每 15 分钟只检查一次日期边界；
    // 同一周期有稳定任务号，重复唤醒不会重复生成。
    日记首次计时器 = setTimeout(() => 唤醒记忆日记(), 15000)
    日记检查计时器 = setInterval(() => 唤醒记忆日记(), 15 * 60 * 1000)
    if (日记首次计时器.unref) 日记首次计时器.unref()
    if (日记检查计时器.unref) 日记检查计时器.unref()
    // M-36A 只接好独立调度底座；配置默认关闭，M-36B 验证正式写入前不会创建私密日记。
    const 私密调度状态 = 私密日记调度.启动()
    console.log('私密日记自动生成: ' + (私密调度状态.已启动 ? '调度已启动' : '关闭'))

    // 关系整理只做本地计算：启动后检查一次，之后每 30 分钟核对输入指纹。
    // 同一份记忆不会重复整理；新增或修改时另有 45 秒防抖和 10 分钟最小间隔。
    关系整理首次计时器 = setTimeout(() => 记忆关系整理.排队({ 原因: '启动后检查', 立即: true }), 30000)
    关系整理检查计时器 = setInterval(() => 记忆关系整理.排队({ 原因: '定期自我检索', 立即: true }), 30 * 60 * 1000)
    if (关系整理首次计时器.unref) 关系整理首次计时器.unref()
    if (关系整理检查计时器.unref) 关系整理检查计时器.unref()

    // P2 聚类只重算只读候选和就绪门控，不会启动压缩、二级存储或召回。
    聚类就绪首次计时器 = setTimeout(() => 记忆聚类就绪.排队({ 原因: '启动后检查', 立即: true }), 45000)
    聚类就绪检查计时器 = setInterval(() => 记忆聚类就绪.排队({ 原因: '定期聚类就绪检查', 立即: true }), 30 * 60 * 1000)
    if (聚类就绪首次计时器.unref) 聚类就绪首次计时器.unref()
    if (聚类就绪检查计时器.unref) 聚类就绪检查计时器.unref()

    建窗口()
    接对讲机()
    建账本窗() // 先把面板建出来（藏着），这样点开关的时候是立刻就出来
    try {
      建Live2D窗口()
      console.log('Live2D 身体: 已交给 Agent 管理（v13 原生头饰）')
    } catch (错误) {
      console.log('⚠ Live2D 身体没建起来（不影响聊天）：' + 错误.message)
    }

    // 那朵小花 = 她本人。这是她唯一露在外面的东西，建不出来就等于她不存在，
    // 所以这里要 try 一下并把话打到日志里 —— 不然失败了没有任何痕迹。
    try {
      托盘 = new Tray(取图标(32))
      托盘.setToolTip('爱莉希雅')
      托盘.on('click', () => 切换窗口()) // 单击 = 说话
      await 更新托盘菜单()
      console.log('托盘图标: 建好了（右下角那朵小花）')

      // 每次启动都冒一个气泡。
      //
      // 【为什么改成每次都弹】
      //   她这个程序启动之后屏幕上什么都不出现 —— 窗口是关着的，
      //   只在托盘上多一朵小花。而 Windows 默认会把新的托盘图标塞进
      //   那个"隐藏的图标"小箭头里，所以他双击完图标会觉得"没反应"。
      //   他 2026-09-26 晚上就是这么被坑的。
      //   原来我写成"只弹第一次"，等于把唯一的提示也省掉了。
      托盘.displayBalloon({
        title: '我在这儿呢♪',
        content:
          '我没有窗口，就住在这朵小花上 —— 点它一下我就出来说话。\n' +
          '要是没看见花：点任务栏那个 ^ 小箭头，我在里面（可以拖出来）。',
      })
    } catch (错误) {
      console.log('✗ 托盘图标没建出来: ' + 错误.message)
      console.log('  （没有它就点不到她了 —— 把这句话告诉我）')
    }

    // 声音服务在不在，启动的时候先说一声（不然你会以为她哑了）
    const 声音 = await TTS.status()
    console.log('声音服务: ' + 声音.说明)

    console.log('')
    console.log('托盘上那朵粉色的花 = 她。点一下就能说话。')
    console.log('')

    // 第一次启动（命令里没带 --藏起来）就把窗口露出来，
    // 不然你会以为程序没起来。以后开机自启就用 --藏起来。
    if (!process.argv.includes('--藏起来')) {
      setTimeout(() => 出现(), 300)
    }
  })

  // 所有窗口都关了也别退出 —— 托盘上那个图标就是"她还在"
  app.on('window-all-closed', () => {
    /* 故意什么都不做 */
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    if (日记首次计时器) clearTimeout(日记首次计时器)
    if (日记检查计时器) clearInterval(日记检查计时器)
    私密日记调度.停止()
    if (关系整理首次计时器) clearTimeout(关系整理首次计时器)
    if (关系整理检查计时器) clearInterval(关系整理检查计时器)
    if (聚类就绪首次计时器) clearTimeout(聚类就绪首次计时器)
    if (聚类就绪检查计时器) clearInterval(聚类就绪检查计时器)
    记忆关系整理.取消()
    记忆聚类就绪.取消()
    if (主动陪伴调度) 主动陪伴调度.停止()
    取消主动陪伴生成()
    for (const 控制器 of 语音识别请求.values()) 控制器.abort()
    语音识别请求.clear()
    for (const 控制器 of 回复请求.values()) 控制器.abort()
    回复请求.clear()
    ASR.stop()
    临时对话.清附件()
    // 把还在等答复的那些请求一律作废（当作"不同意"）——
    // 程序都要退了，不能留一个永远等不到的承诺挂着。
    确认.作废()
    for (const 完成 of 等答复的.values()) 完成(false)
    等答复的.clear()
  })
}
