/**
 * 测认进程.cjs —— 检查"哪些进程属于她这一套"认得准不准
 *
 * 【为什么值得单独测】
 *   "全部关掉"要杀进程。杀对了是收摊，杀错了是把他别的东西弄没
 *   ——这台机器上 VS Code 和 Cyrene 也是 Electron，DSH 也是 node。
 *   所以判断逻辑必须一条条量过：该认的认出来，不该认的绝不认。
 *
 *   喂的是**假数据**，不碰真进程 —— 测判断，不测系统。
 *
 * 用法: node tools\测认进程.cjs
 */
'use strict'

const path = require('node:path')
// 【2026-09-29】判断逻辑从 tools\全部关掉.cjs 挪到了 脑\收摊.cjs ——
// 主程序（托盘菜单"全部关掉"）也要用它，两边必须共用同一份。
const { 是她的人 } = require(path.join(__dirname, '..', '脑', '收摊.cjs'))

// 命令行里带反斜杠和引号，所以这里的字符串都得小心写
const 反斜杠 = '\\'

const 该认的 = [
  {
    说明: '声音服务（GPT-SoVITS 本体）',
    进程: {
      名字: 'python.exe',
      命令行: 'D:' + 反斜杠 + 'GPT-SoVITS' + 反斜杠 + 'runtime' + 反斜杠 + 'python.exe -u api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS' + 反斜杠 + 'configs' + 反斜杠 + 'tts_infer.yaml',
    },
  },
  {
    说明: '转接层（bridge）',
    进程: {
      名字: 'node.exe',
      命令行: 'node D:' + 反斜杠 + '新建文件夹' + 反斜杠 + 'tools' + 反斜杠 + 'voice' + 反斜杠 + 'tts-bridge.cjs',
    },
  },
  {
    说明: '桌宠',
    进程: { 名字: 'Bongo Cat Mver.exe', 命令行: '' },
  },
  {
    说明: '她本人（界面）',
    进程: {
      名字: 'electron.exe',
      命令行: '"D:' + 反斜杠 + '新建文件夹' + 反斜杠 + '爱莉希雅' + 反斜杠 + 'node_modules' + 反斜杠 + 'electron' + 反斜杠 + 'dist' + 反斜杠 + 'electron.exe" .',
    },
  },
]

const 不该认的 = [
  { 说明: 'DSH 自己（node）', 进程: { 名字: 'node.exe', 命令行: 'node D:' + 反斜杠 + 'nodejs' + 反斜杠 + 'node_modules' + 反斜杠 + 'npm' + 反斜杠 + 'bin' + 反斜杠 + 'dsh.cmd web' } },
  { 说明: 'VS Code（也是 Electron）', 进程: { 名字: 'Code.exe', 命令行: '"C:' + 反斜杠 + 'Program Files' + 反斜杠 + 'Microsoft VS Code' + 反斜杠 + 'Code.exe"' } },
  { 说明: 'Cyrene（也是 Electron）', 进程: { 名字: 'electron.exe', 命令行: '"C:' + 反斜杠 + 'cyrene' + 反斜杠 + 'Cyrene.exe"' } },
  { 说明: '别的 python 脚本', 进程: { 名字: 'python.exe', 命令行: 'python C:' + 反斜杠 + 'some' + 反斜杠 + 'my-script.py' } },
  { 说明: '别的 node 脚本', 进程: { 名字: 'node.exe', 命令行: 'node C:' + 反斜杠 + 'other' + 反斜杠 + 'server.js' } },
  { 说明: '微信', 进程: { 名字: 'WeChat.exe', 命令行: '"C:' + 反斜杠 + 'Program Files' + 反斜杠 + 'WeChat' + 反斜杠 + 'WeChat.exe"' } },
]

console.log('')
console.log('════════ 该认出来的 ════════')
let 对 = 0
for (const 例 of 该认的) {
  const 认出来的 = 是她的人(例.进程)
  const 好 = !!认出来的
  if (好) 对++
  console.log(`  ${好 ? '✓' : '✗'} ${例.说明}`)
  console.log(`      ${认出来的 ? '认成：' + 认出来的.说明 : '没认出来！'}`)
}

console.log('')
console.log('════════ 绝对不许认的 ════════')
let 也对 = 0
for (const 例 of 不该认的) {
  const 认出来的 = 是她的人(例.进程)
  const 好 = !认出来的
  if (好) 也对++
  console.log(`  ${好 ? '✓' : '✗'} ${例.说明}`)
  if (!好) console.log(`      误认成：${认出来的.说明}  ← 这会让"全部关掉"把他的东西杀掉`)
}

console.log('')
console.log('════════ 结果 ════════')
console.log(`  该认的：${对} / ${该认的.length}`)
console.log(`  不许认的：${也对} / ${不该认的.length}`)
console.log('')
if (对 === 该认的.length && 也对 === 不该认的.length) {
  console.log('  ✓ 全对。可以放心让它关。')
} else {
  console.log('  ✗ 有不对的 —— 先改 全部关掉.cjs 里那张特征表，别急着用它关东西。')
}
console.log('')
console.log('  （真机上想核对，跑 node tools\\看进程.cjs —— 它只列不杀。）')
console.log('')
