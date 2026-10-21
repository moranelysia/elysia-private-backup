/**
 * fetch-cyrene.cjs -- 把 Cyrene 的**源码**从 GitHub 扒下来（只要代码，不要美术）
 *
 * 【第一版为什么失败】
 *   直接下整个仓库的 zip：159 MB，我给了 180 秒超时 —— 不够，超时了。
 *   而且那 159 MB 里大半是美术资源（Live2D 模型、立绘、音频），
 *   我真正想看的是引擎代码，可能只有几兆。
 *
 * 【第二版怎么做】
 *   两条 GitHub 的接口配合：
 *     1. 先问"这个仓库里有哪些文件"（git trees 接口，回一个 JSON 清单）
 *     2. 在清单里挑出源码（.ts/.js/.md/.json 之类），一个个下
 *       下的时候走 raw.githubusercontent.com，那是直接取单个文件的口
 *
 *   好处：只下几兆、每个文件小、有进度可看、断了能续。
 *
 * 【断点续传怎么做的】
 *   已经下过的文件跳过（看文件在不在、大小对不对）。
 *   所以这个脚本可以反复跑 —— 断在哪儿就从哪儿接着下，
 *   不会把已经下好的又下一遍。
 *
 * 【文件名为什么是英文】
 *   .cmd 里出现中文文件名会把命令行断掉（今天踩过两次），
 *   所以这个脚本叫 fetch-cyrene.cjs。
 *
 * 用法: node tools\fetch-cyrene.cjs
 *       node tools\fetch-cyrene.cjs Playa-Cyrene/Cyrene-Agent
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 仓库 = (process.argv[2] || 'Playa-Cyrene/Cyrene-Agent')
  .replace(/^https?:\/\/github\.com\//, '')
  .replace(/\.git$/, '')

/** 存到哪儿：纯英文路径，中文路径处理起来处处是坑 */
const 存到 = 'D:\\新建文件夹\\cyrene-源码'

/** 只要这些类型的文件 —— 那是"能读懂它在干什么"的部分 */
const 要的类型 = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md', '.json', '.yml', '.yaml', '.txt']

/** 这些路径不要（构建产物、依赖、缓存、美术、语言包） */
const 不要的路径 = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  'assets/',
  'public/',
  'resources/',
  'locales/',
  'models/',
  '.github/',
  'package-lock.json',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.flac',
  '.ttf',
  '.otf',
  '.woff',
  '.moc3',
  '.zip',
  '.7z',
  '.exe',
  '.dll',
]

/** 一个文件要不要下 */
function 要吗(路径, 大小) {
  if (!路径) return false
  const 小写 = 路径.toLowerCase()
  for (const 不要 of 不要的路径) {
    if (小写.includes(不要.toLowerCase())) return false
  }
  if (!要的类型.some((后缀) => 小写.endsWith(后缀))) return false
  // 超过 2 MB 的单个源码文件不要（多半是打包产物或者数据）
  if (大小 && 大小 > 2 * 1024 * 1024) return false
  return true
}

/** 问 GitHub：这个仓库里有哪些文件 */
async function 要清单(分支) {
  const 地址 = `https://api.github.com/repos/${仓库}/git/trees/${分支}?recursive=1`
  const 回应 = await fetch(地址, {
    signal: AbortSignal.timeout(30000),
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/vnd.github+json' },
  })
  if (!回应.ok) throw new Error(`问清单失败 HTTP ${回应.status}：${(await 回应.text()).slice(0, 200)}`)
  const 数据 = await 回应.json()
  return 数据.tree || []
}

/** 下一个文件（已经有且大小对得上就跳过 —— 这就是断点续传） */
async function 下一个(条) {
  const 目标 = path.join(存到, 条.path)

  // 路径安全：不许跑到 存到 外面去
  if (!path.resolve(目标).startsWith(path.resolve(存到))) {
    return { 跳过: true, 原因: '路径可疑' }
  }

  // 已经下过了？
  try {
    const 已有 = fs.statSync(目标)
    if (条.size && 已有.size === 条.size) return { 跳过: true, 原因: '已经有了' }
    if (!条.size && 已有.size > 0) return { 跳过: true, 原因: '已经有了' }
  } catch {
    /* 没有，那就下 */
  }

  const 地址 = `https://raw.githubusercontent.com/${仓库}/${条.sha ? '' : ''}${条.路径分支 || 'master'}/${条.path}`
  const 回应 = await fetch(地址, {
    signal: AbortSignal.timeout(45000),
    headers: { 'user-agent': 'Mozilla/5.0' },
  })
  if (!回应.ok) return { 失败: `HTTP ${回应.status}` }

  const 文字 = await 回应.text()
  fs.mkdirSync(path.dirname(目标), { recursive: true })
  fs.writeFileSync(目标, 文字, 'utf8')
  return { 好: true, 字节: 文字.length }
}

async function main() {
  console.log('')
  console.log('  ============================================')
  console.log('   扒 Cyrene 的源码（只要代码，不要美术）')
  console.log('  ============================================')
  console.log('')
  console.log('  仓库：' + 仓库)
  console.log('  存到：' + 存到)
  console.log('')

  // ---- 1. 问仓库信息（顺便拿默认分支） ----
  let 分支 = 'master'
  try {
    const 回应 = await fetch(`https://api.github.com/repos/${仓库}`, {
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/vnd.github+json' },
    })
    if (回应.ok) {
      const 信息 = await 回应.json()
      分支 = 信息.default_branch || 'master'
      console.log(`  仓库：${信息.full_name}`)
      console.log(`  许可：${(信息.license && 信息.license.spdx_id) || '未标注'}   默认分支：${分支}`)
      console.log(`  整个仓库约 ${Math.round((信息.size || 0) / 1024)} MB（我们只取其中一小部分）`)
      console.log('')
    }
  } catch (错误) {
    console.log('  （问仓库信息超时，用默认分支继续）')
  }

  // ---- 2. 要文件清单 ----
  console.log('  正在要文件清单……')
  let 清单
  try {
    清单 = await 要清单(分支)
  } catch (错误) {
    console.log('  ✗ ' + 错误.message)
    process.exit(1)
  }

  const 全部文件 = 清单.filter((项) => 项.type === 'blob')
  console.log(`  仓库里一共 ${全部文件.length} 个文件`)

  const 挑出来 = 全部文件.filter((项) => 要吗(项.path, 项.size))
  const 挑的字节 = 挑出来.reduce((和, 项) => 和 + (项.size || 0), 0)

  console.log(`  其中要下的：${挑出来.length} 个，约 ${(挑的字节 / 1024 / 1024).toFixed(1)} MB`)
  console.log('')

  // 按目录归一下，让进度看得懂
  const 按目录 = new Map()
  for (const 项 of 挑出来) {
    const 目录 = 项.path.includes('/') ? 项.path.split('/').slice(0, 2).join('/') : '(根目录)'
    按目录.set(目录, (按目录.get(目录) || 0) + 1)
  }
  console.log('  都分布在这些地方：')
  for (const [目录, 数] of [...按目录.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${String(数).padStart(4)} 个   ${目录}`)
  }
  console.log('')

  // ---- 3. 一个个下 ----
  fs.mkdirSync(存到, { recursive: true })

  let 好了 = 0
  let 跳过 = 0
  let 失败 = 0
  let 下了字节 = 0
  const 失败们 = []

  for (const [i, 项] of 挑出来.entries()) {
    项.路径分支 = 分支
    try {
      const 结果 = await 下一个(项)
      if (结果.好) {
        好了++
        下了字节 += 结果.字节
      } else if (结果.跳过) {
        跳过++
      } else {
        失败++
        失败们.push(`${项.path} —— ${结果.失败}`)
      }
    } catch (错误) {
      失败++
      失败们.push(`${项.path} —— ${错误.name}`)
    }

    // 每 40 个报一次进度（免得刷屏）
    if ((i + 1) % 40 === 0 || i === 挑出来.length - 1) {
      const 百分比 = Math.round(((i + 1) / 挑出来.length) * 100)
      console.log(
        `  ${String(百分比).padStart(3)}%  （新的 ${好了} / 已有 ${跳过} / 失败 ${失败}）`,
      )
    }
  }

  console.log('')
  console.log('  ────────────────────────────────────────────')
  console.log(`  下好 ${好了} 个，跳过 ${跳过} 个（之前下过），失败 ${失败} 个`)
  console.log(`  新增 ${(下了字节 / 1024).toFixed(0)} KB`)
  console.log('  ' + 存到)
  console.log('')

  if (失败们.length) {
    console.log('  没下下来的（前 10 个）：')
    for (const f of 失败们.slice(0, 10)) console.log('    ' + f)
    console.log('')
    console.log('  再跑一次这个脚本就会把缺的补上（已有的会跳过）。')
    console.log('')
  }

  // ---- 4. 看看拿到了什么 ----
  console.log('  第一层目录：')
  for (const 项 of fs.readdirSync(存到).slice(0, 25)) {
    const 是目录 = fs.statSync(path.join(存到, 项)).isDirectory()
    console.log('    ' + (是目录 ? '[目录] ' : '       ') + 项)
  }
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  process.exit(1)
})
