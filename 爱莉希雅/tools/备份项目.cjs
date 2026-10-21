/**
 * 备份.cjs —— 给这个项目做一份能带走的备份
 *
 * 【为什么不整个文件夹压缩】
 *   整个项目 681 MB，可里面真正属于"她"的东西只有 40 MB 左右：
 *
 *     node_modules  424 MB  ← Electron 本体，npm install 能重新拉回来
 *     .cache        186 MB  ← Electron 下载缓存 + npm 缓存，纯临时
 *     backups        34 MB  ← 以前的备份，不需要再备份一次
 *
 *   把这些塞进备份，等于每次备份都在抄一遍能重新下载的东西。
 *   所以只备份"丢了就真的没了"的部分。
 *
 * 【什么算"丢了就没了"】
 *   · 脑\        我们自己写的逻辑（人格、记忆、对话、语音、表情路由）
 *   · 记忆\      她记住的东西 —— **这份最要紧，没有第二份**
 *   · renderer\  窗口界面 + 她的 Live2D 模型素材（29 MB，重新找很难）
 *   · tools\     一堆小工具
 *   · 顶层的代码和文档
 *   · icon-source\ 她的照片原图
 *   · *.ico      两个图标
 *
 * 【怎么用备份恢复】
 *   1. 把备份里的东西拷回 D:\新建文件夹\爱莉希雅\
 *   2. 在那个文件夹里跑一次 npm install（把 Electron 装回来）
 *   3. 双击 tools\启动桌宠.cjs 看看她在不在
 *
 * 用法: node tools\备份.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 备份根 = path.join(项目根, 'backups')

/** 时间戳：20260926-2215 这种，排在一起自然按时间排好 */
function 时间戳(现在 = new Date()) {
  const 补 = (n) => String(n).padStart(2, '0')
  return (
    `${现在.getFullYear()}${补(现在.getMonth() + 1)}${补(现在.getDate())}` +
    `-${补(现在.getHours())}${补(现在.getMinutes())}`
  )
}

/** 要备份的东西：目录直接整棵拷，文件单独拷 */
const 要备份的目录 = ['脑', '记忆', 'renderer', 'tools', 'icon-source']

const 要备份的文件 = [
  'main.js',
  'preload.js',
  'package.json',
  'package-lock.json',
  '学习笔记.md',
  'icon.ico',
  'desktop-icon.ico',
  '.npmrc',
]

/** 拷贝时永远跳过的目录名（免得手滑把垃圾也带进去） */
const 跳过 = new Set(['node_modules', '.cache', 'backups', '.git', '语音试听'])

/** 拷一棵目录树，返回 {文件数, 字节数} */
function 拷目录(从, 到) {
  let 文件数 = 0
  let 字节数 = 0

  fs.mkdirSync(到, { recursive: true })

  for (const 项 of fs.readdirSync(从, { withFileTypes: true })) {
    if (跳过.has(项.name)) continue
    const 源 = path.join(从, 项.name)
    const 目标 = path.join(到, 项.name)

    if (项.isDirectory()) {
      const 小计 = 拷目录(源, 目标)
      文件数 += 小计.文件数
      字节数 += 小计.字节数
    } else if (项.isFile()) {
      fs.copyFileSync(源, 目标)
      文件数++
      字节数 += fs.statSync(目标).size
    }
  }

  return { 文件数, 字节数 }
}

function main() {
  const 名字 = 'elysia-' + 时间戳()
  const 目标根 = path.join(备份根, 名字)

  console.log('')
  console.log('  ============================================')
  console.log('   给爱莉希雅做备份')
  console.log('  ============================================')
  console.log('')
  console.log('  备份到: ' + 目标根)
  console.log('')

  fs.mkdirSync(目标根, { recursive: true })

  let 总文件 = 0
  let 总字节 = 0

  // ---- 目录 ----
  for (const 目录 of 要备份的目录) {
    const 源 = path.join(项目根, 目录)
    if (!fs.existsSync(源)) {
      console.log(`  · ${目录}  —— 没有，跳过`)
      continue
    }
    const 小计 = 拷目录(源, path.join(目标根, 目录))
    总文件 += 小计.文件数
    总字节 += 小计.字节数
    console.log(`  ✓ ${目录.padEnd(12)} ${String(小计.文件数).padStart(4)} 个文件  ${(小计.字节数 / 1024 / 1024).toFixed(1)} MB`)
  }

  // ---- 单个文件 ----
  const 拷来的文件 = []
  for (const 文件 of 要备份的文件) {
    const 源 = path.join(项目根, 文件)
    if (!fs.existsSync(源)) continue
    fs.copyFileSync(源, path.join(目标根, 文件))
    拷来的文件.push(文件)
    总文件++
    总字节 += fs.statSync(源).size
  }
  console.log(`  ✓ 顶层文件     ${拷来的文件.length} 个`)

  // ---- 说明写在备份里，免得以后打开不知道这是什么 ----
  const 说明 = `这是「爱莉希雅」桌面伴侣的一份备份。
做备份的时间：${new Date().toLocaleString('zh-CN')}
做备份的脚本：爱莉希雅\\tools\\备份.cjs

里面有什么
----------
脑\\            她自己那部分：人格、记忆、对话、语音、表情路由
记忆\\          她记住的东西（关于 moran 的事实、你们一起经历的、她的小本子）
renderer\\      窗口界面 + 她的 Live2D 模型素材
tools\\         一堆小工具（启动、量数据、测表情、画图标……）
icon-source\\   她的照片原图
main.js 等      程序本体

里面**没有**什么（这些能重新弄回来，所以没抄）
--------------------------------------------
node_modules\\  424 MB，是 Electron 本体。跑一次 npm install 就回来了
.cache\\        186 MB，是下载缓存和 npm 缓存，纯临时，删了没影响
backups\\       以前的备份，不用再备份一遍

怎么用它恢复
------------
1. 把这里的东西拷回 D:\\新建文件夹\\爱莉希雅\\
2. 在那个文件夹里跑一次：npm install
3. 双击 tools\\启动桌宠.cjs，看她出不出来

还差什么
--------
声音不在这份备份里。她说话用的是 GPT-SoVITS（装在 D:\\GPT-SoVITS\\）
加一套训练出来的权重，那部分在 C:\\moran and elysia\\ 里单独备份着。
换台电脑要让她开口，那两个地方都得带过去。
`

  fs.writeFileSync(path.join(目标根, '这份备份是什么.txt'), 说明, 'utf8')

  console.log('')
  console.log('  --------------------------------------------')
  console.log(`  共 ${总文件} 个文件，${(总字节 / 1024 / 1024).toFixed(1)} MB`)
  console.log('  --------------------------------------------')
  console.log('')
  console.log('  包里放了份「这份备份是什么.txt」，写清楚有什么、缺什么、怎么恢复。')
  console.log('')
}

main()
