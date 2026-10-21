/**
 * 附件.cjs —— 他发过来的东西：图片、文档、随便什么文件
 *
 * 【它管四件事】
 *   1. 把他发来的字节存到 记忆\附件\ 里，起一个不会撞车的名字
 *   2. 判断"这个能不能当图片送进请求里给她看"
 *   3. 拼一段话，写清楚文件叫什么、在哪 —— 她自己读得到
 *   4. 给界面读缩略图（小的图片读成 data URL）
 *
 * 【为什么存进 记忆\ 而不是 .cache\】
 *   .cache 是临时目录，备份脚本本来就跳过它。
 *   可附件是**对话的一部分** —— 聊天记录里还留着"他发过一张图"，
 *   图却没了的话，以后翻记录只会更糊涂。
 *   所以存进 记忆\，跟着备份一起走。
 *
 * 【为什么文件名要加时间戳前缀】
 *   他可能连着发两张都叫"截图.png"。按原名存的话，第二张会盖掉第一张，
 *   而聊天记录里两条都指向同一个文件 —— 第一张就**永远消失**了，
 *   而且不会有任何报错。加上 20261004-163012 这样的前缀就撞不上。
 *
 * 【为什么名字要洗一遍】
 *   传进来的名字是界面上给的，理论上可以带 `..\..\` 这种东西。
 *   不洗的话，拼出来的路径会跑到附件目录外面去。
 *   所以只取 path.basename 那一截，再把 Windows 不认的字符换掉。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('./配置.cjs')

const 项目根 = 配置.项目根
// 环境变量那个口子只给测试用 —— 不然测一次就往真的 记忆\附件\ 里丢假文件
const 存放目录 = process.env.ELYSIA_附件目录 || path.join(配置.数据目录, '附件')

/** 一个文件最多这么大。再大就拦下来，别把请求体撑爆（对面限 48MiB） */
const 单个别超过 = 20 * 1024 * 1024

/** 界面预览（缩略图）只给这么大的读 —— 再大读成 base64 会吃掉几百兆内存 */
const 预览别超过 = 4 * 1024 * 1024

const 图片后缀 = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico'])

const 后缀到类型 = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

/**
 * 哪些模型能"看图"。
 *
 * 【这份名单是怎么来的 —— 2026-10-04】
 *   DeepSeek 官方文档的 Vision 那一页写得很明确：图片由 `deepseek-flash` 接收
 *   （老的 `deepseek-v4-flash-vision-exp` 已经退役，请求转由最新的 Flash 服务）。
 *   https://api-docs.deepseek.com/guides/vision/
 *
 * 【为什么这是个得留神的常量】
 *   它是**环境事实**，而环境事实会变。哪天 v4-pro 也能看图了，
 *   这份名单就变成了假话，表现是"明明能看，程序却跟她说看不了"。
 *
 *   所以两处都留了活口：
 *     · 名字里带 flash / vision / vl 的，一律先当它能看
 *     · 真发出去被拒了，`认错` 会把 HTTP 400 翻成一句人话给出去
 *   倾向是**宁可放进去试** —— 放进去了最多那一次被拒；
 *   不放进去，是她永远看不见图，而且没人会发现。
 */
const 大概能看图的 = ['deepseek-flash']

function 能看图吗(模型名) {
  const 名 = String(模型名 || '').toLowerCase()
  if (!名) return false
  if (大概能看图的.includes(名)) return true
  return /flash|vision|-vl|vl-/.test(名)
}

function 时间戳(现在 = new Date()) {
  const 补 = (n) => String(n).padStart(2, '0')
  return (
    `${现在.getFullYear()}${补(现在.getMonth() + 1)}${补(现在.getDate())}` +
    `-${补(现在.getHours())}${补(现在.getMinutes())}${补(现在.getSeconds())}`
  )
}

/** 只留文件名那一截，再把 Windows 不认的字符换掉 */
function 洗名字(原名) {
  let 名 = path.basename(String(原名 || '文件'))
  名 = 名.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim()
  if (!名) 名 = '文件'

  // 【长度也要管】Windows 整条路径大概 260 字就封顶，而我们前面已经挂了
  // 一长串中文目录（工作区\程序\记忆\附件\...），留点余量。
  const 后缀 = path.extname(名).slice(0, 12)
  const 主干 = path.basename(名, path.extname(名)).slice(0, 60)
  return 主干 + 后缀
}

/** 是不是图片 —— 先看后缀，再看系统报的类型 */
function 是图片吗(名, 类型) {
  const 后 = path.extname(String(名 || '')).toLowerCase()
  if (图片后缀.has(后)) return true
  return /^image\//.test(String(类型 || ''))
}

function 人话大小(字节) {
  const 数 = Number(字节) || 0
  if (数 < 1024) return 数 + ' 字节'
  if (数 < 1024 * 1024) return (数 / 1024).toFixed(0) + ' KB'
  return (数 / 1024 / 1024).toFixed(1) + ' MB'
}

/**
 * 存一个附件。
 *
 * @param {{名字:string, 类型:string, 字节:ArrayBuffer|Uint8Array|Buffer}} 这个
 * @returns {{好:boolean, 说明?:string, 存成?:string, 原名?:string, 路径?:string,
 *            大小?:number, 是图片?:boolean, dataUrl?:string}}
 */
function 存(这个, 目标目录 = 存放目录) {
  const 原名 = 洗名字(这个 && 这个.名字)
  const 字节 = 这个 && 这个.字节
  if (!字节) return { 好: false, 说明: '没收到文件内容' }

  let 缓冲
  try {
    缓冲 = Buffer.isBuffer(字节) ? 字节 : Buffer.from(字节)
  } catch (错误) {
    return { 好: false, 说明: '这段内容读不出来：' + 错误.message }
  }

  if (!缓冲.length) return { 好: false, 说明: `「${原名}」是个空文件` }
  if (缓冲.length > 单个别超过) {
    return {
      好: false,
      说明: `「${原名}」太大了（${人话大小(缓冲.length)}）—— 一个一个来，单个别超过 ${单个别超过 / 1024 / 1024}MB`,
    }
  }

  let 存成 = `${时间戳()}-${原名}`

  // 【同一秒里的同名文件会撞上】
  //   时间戳只精确到秒，而他连着发两张"截图.png"是很常见的事
  //   （截图工具默认就叫这个名）。撞上的话第二张会**盖掉**第一张，
  //   而聊天记录里两条都指着同一个文件 —— 第一张就永远没了，还不报错。
  //   所以撞上了就加个序号。
  if (fs.existsSync(path.join(目标目录, 存成))) {
    const 后缀 = path.extname(原名)
    const 主干 = path.basename(原名, 后缀)
    let 号 = 2
    while (号 < 100 && fs.existsSync(path.join(目标目录, `${时间戳()}-${主干}-${号}${后缀}`))) {
      号++
    }
    存成 = `${时间戳()}-${主干}-${号}${后缀}`
  }

  try {
    fs.mkdirSync(目标目录, { recursive: true })
    fs.writeFileSync(path.join(目标目录, 存成), 缓冲)
  } catch (错误) {
    return { 好: false, 说明: '存不进去：' + 错误.message }
  }

  const 图 = 是图片吗(存成, 这个 && 这个.类型)
  const 好 = {
    好: true,
    存成,
    原名,
    路径: path.join(目标目录, 存成),
    大小: 缓冲.length,
    类型: (这个 && 这个.类型) || '',
    是图片: 图,
  }

  // 【顺手把图片读成 data URL】能看图的那条路要的就是它。
  // 存在这儿比让他回头再读一遍盘省事，而且这时候字节就在手上。
  // 太大的不转 —— base64 会让体积涨三分之一，几百兆的字符串能把内存吃光。
  if (图 && 缓冲.length <= 预览别超过) {
    好.dataUrl = `data:${后缀到类型[path.extname(存成).toLowerCase()] || 'image/png'};base64,` +
      缓冲.toString('base64')
  }

  return 好
}

/**
 * 存下来的名字 → 绝对路径。
 *
 * 【安全】只认文件名那一截。传进来的名字里要是塞了 `..\..\`，
 *   直接拼会跑到附件目录外面 —— basename 一刀切掉。
 */
function 路径(存成, 目标目录 = 存放目录) {
  const 名 = path.basename(String(存成 || ''))
  if (!名) return ''
  return path.join(目标目录, 名)
}

/** 界面要缩略图的时候来拿（读成 data URL，太大的不给） */
function 读预览(存成, 目标目录 = 存放目录) {
  const 一个 = 路径(存成, 目标目录)
  if (!一个) return { 好: false, 说明: '名字不对' }
  try {
    const 状态 = fs.statSync(一个)
    if (状态.size > 预览别超过) return { 好: false, 说明: '图太大，不预览' }
    const 缓冲 = fs.readFileSync(一个)
    const 类型 = 后缀到类型[path.extname(一个).toLowerCase()] || 'image/png'
    return { 好: true, dataUrl: `data:${类型};base64,${缓冲.toString('base64')}` }
  } catch (错误) {
    return { 好: false, 说明: '读不出来：' + 错误.message }
  }
}

/**
 * 那行"他发了什么"。
 *
 * 【为什么写 存成（带时间戳的那个名）而不是原名】
 *   界面靠这一行去主进程要缩略图，而"要"的时候得给准名字 ——
 *   两张都叫"截图.png"的话，光凭原名分不出是哪一张。
 *   显示的时候界面会把前面那截时间戳去掉（`好看名字()`），
 *   所以看起来还是"截图.png"。
 */
function 一行(一个) {
  return `[附件] ${一个.存成}（${一个.是图片 ? '图片' : '文件'}，${人话大小(一个.大小)}）`
}

/**
 * 拼一段"他发来了什么"的话，给**她**看。
 *
 * 【为什么非要把路径写清楚】
 *   她看图片内容要靠"能看图的脑子"（图片直接进请求）。
 *   可文件（txt、pdf、代码）进不去 —— 那些得她自己去够。
 *   她手上有 [读:]、[列:]、[跑:]，**只要知道文件在哪**就能去查：
 *   读个 txt 的内容、用 python 看看图有多大、跑个脚本解个压缩包。
 *   不给她路径，她就只能干说一句"我看不到"。
 *
 * @param {Array} 附件们
 * @param {{图放进去了?:boolean}} 情况 图片是不是已经直接塞进请求里了
 */
function 拼给她(附件们, 情况 = {}) {
  const 好的 = (附件们 || []).filter((x) => x && x.好)
  if (!好的.length) return ''

  const 行 = ['【他发来了文件】']
  for (const 一个 of 好的) {
    行.push(`· ${一个.原名}（${一个.是图片 ? '图片' : '文件'}，${人话大小(一个.大小)}）`)
    行.push(`  存在：${一个.路径}`)
    // 【为什么要专门写这一行】学习模式下会顺手在材料区放一份。
    //   不告诉她的话，她会以为课件只在 记忆\附件\ 里 ——
    //   要读课件时跑去那儿翻，或者更糟：以为"材料区是空的"，
    //   回头跟他说"你还没导入过课件"。（他明明刚发过来。）
    if (一个.学习路径) 行.push(`  学习材料区里也有一份：${一个.学习路径}`)
  }
  行.push('')

  const 有图 = 好的.some((x) => x.是图片)
  if (有图 && !情况.图放进去了) {
    行.push(
      '⚠ 这些图片**你这一轮看不见里面是什么** —— ' +
        '这一段用的脑子看不了图。想知道图里是什么，跟他说一句，' +
        '让他开一段用 flash 的对话（那种能看图）；' +
        '或者你自己用 [跑:] 跑个脚本去量一量（比如用 python 读它的长宽、大小）。',
    )
  } else if (有图 && 情况.图放进去了) {
    行.push('（图片已经直接放在你眼前了，你**看得见**里面的内容。）')
  }

  const 有别的 = 好的.some((x) => !x.是图片)
  if (有别的) {
    行.push('那些文件你**看不到内容**，但上面写了它们在哪 —— 用 [读:] 或 [跑:] 自己去够。')
  }

  return 行.join('\n')
}

/**
 * 再存一份到别的地方 —— 学习模式下他发来的课件就是这么进 学习\材料\ 的。
 *
 * 【为什么不干脆"存到学习区"了事】
 *   附件那一条是**对话的账**：聊天记录里写着"他发过一份课件"，
 *   文件就得一直在 记忆\附件\ 里，不然以后翻记录点不开。
 *   所以是**多存一份**，不是换个地方存。
 *
 * 【名字用原名，不带时间戳前缀】
 *   材料区是给他自己翻的（他要在那儿找课件），
 *   一串 `20261008-003012-` 只会碍事。撞名了加 `(2)`。
 *   记忆区那份仍然带时间戳 —— 那儿要的是"两张截图.png 不互相盖掉"。
 *
 * @param {{好:boolean, 原名:string, 路径:string}} 存果 附件.存() 的结果
 * @param {string} 目录
 * @returns {{好:boolean, 路径?:string, 说明?:string}}
 */
function 另存一份(存果, 目录) {
  if (!存果 || !存果.好 || !存果.路径) return { 好: false, 说明: '这份附件本来就没存成，没法再存一份' }
  if (!目录) return { 好: false, 说明: '没说要存到哪儿' }

  const 原名 = 洗名字(存果.原名)
  const 后缀 = path.extname(原名)
  const 主干 = path.basename(原名, 后缀)

  let 目标 = path.join(目录, 原名)
  let 号 = 2
  while (fs.existsSync(目标) && 号 < 100) {
    目标 = path.join(目录, `${主干} (${号})${后缀}`)
    号++
  }

  try {
    fs.mkdirSync(目录, { recursive: true })
    fs.copyFileSync(存果.路径, 目标)
  } catch (错误) {
    return { 好: false, 说明: '另存一份没成：' + 错误.message }
  }
  return { 好: true, 路径: 目标 }
}

module.exports = {
  存,
  另存一份,
  路径,
  读预览,
  一行,
  拼给她,
  能看图吗,
  是图片吗,
  洗名字,
  存放目录,
  单个别超过,
  预览别超过,
}
