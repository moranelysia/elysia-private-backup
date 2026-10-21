/**
 * 清测试记录.cjs —— 把她记忆里那些"从没发生过的对话"挑出来
 *
 * 【为什么会有这种东西】
 *   测试脚本是直接调 脑\对话.cjs 的 说话() 的，而 说话() 结尾会把这一轮
 *   写进 记忆\聊天记录\聊天记录.jsonl —— 那是**她的长期记忆**。
 *   于是每跑一次测试，就往她的记忆里塞一段假对话。
 *
 *   2026-10-01 晚上翻记录才发现，攒了这么多：
 *     · "帮我写一个满屏星星往下飘的 C 程序，就放在 D:\新建文件夹\_onepass-test 里"
 *       连着三条（20:30 / 20:31 / 20:32），那是我当晚跑的整条线测试，
 *       而 _onepass-test 那个目录跑完就删了。
 *     · 还有更早的 _温度测试、_多写测试。
 *   她下次开口时，"最近二十句"里全是这些，她会以为他昨晚问过三遍星星。
 *
 *   （根子已经堵上了：说话() 现在只在 Electron 真身里才写记忆，
 *     命令行脚本**天生**污染不了。见 脑\对话.cjs 里"该记"那一段。）
 *   这个脚本是用来擦掉已经沾上的那些。
 *
 * 【它凭什么判断哪条是假的】
 *   不猜内容像不像，只看**证据**。而且只拿"他说的那句"当证据 ——
 *   她回的话里提到测试目录是常有的事（比如"你往 D:\elysia测试 里
 *   看一眼就知道了"，那是**真事**），拿她的回答当证据会误伤。
 *
 *   规则两条：
 *     一、他那句里出现**只有测试才会建的目录名**（_温度测试 / _onepass-test …）
 *         或者带着测试模板特有的那个病句"帮我写一个一个满屏星星"
 *         （模板是 `帮我写一个${题目}`，而题目自己以"一个"开头，于是重了一个）
 *     二、她的回话**只跟着上一句走** —— 上一句判成测试，她才算测试
 *
 *   第一版就是在这儿栽的：只看"内容里有没有测试目录名"，结果把她回答里
 *   顺嘴提到的一句话也当成了证据，差点删掉四段真的对话
 *   （19:41、19:43、20:00、20:01 —— 那几段恰恰是最该留着的）。
 *   **拿不准的一律留着：宁可留一条假的，也不删一条真的。**
 *
 * 用法:
 *   node tools\清测试记录.cjs          只看，不动文件
 *   node tools\清测试记录.cjs --动手    真删（会先备份）
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 聊天文件 = path.join(项目根, '记忆', '聊天记录', '聊天记录.jsonl')

const 真删 = process.argv.includes('--动手') || process.argv.includes('--动手'.replace('--', '-'))

/**
 * 测试目录名 —— 只列**只有测试脚本才会建**的那几个。
 *
 * 【为什么把 elysia测试 从名单里去掉了】
 *   那是他自己建的目录，20:00 那段真对话里她提过一句
 *   "你往 D:\elysia测试 里看一眼就知道了"。
 *   把它当证据，就会误伤真话。
 */
const 测试目录名 = ['_温度测试', '_多写测试', '_onepass-test', '_engineer-test', '_write-test']

/** 测试模板特有的病句（题目自己以"一个"开头，接在"帮我写一个"后面就重了） */
const 测试病句 = /帮我写一个一个满屏星星/

/** 他这句是不是测试脚本发的 */
function 他那句是测试(条) {
  const 文 = String(条.内容 || '')
  if (测试目录名.some((名) => 文.includes(名))) return '带着测试目录名'
  if (测试病句.test(文)) return '带着测试模板的病句'
  return ''
}

function 读() {
  let 内容
  try {
    内容 = fs.readFileSync(聊天文件, 'utf8')
  } catch {
    console.log('读不到聊天记录：' + 聊天文件)
    process.exit(1)
  }
  const 条们 = []
  for (const 行 of 内容.split('\n')) {
    if (!行.trim()) continue
    try {
      const o = JSON.parse(行)
      o.__原文 = 行
      条们.push(o)
    } catch {
      /* 坏行原样留着，别因为解析不了就把他的话删了 */
      条们.push({ __原文: 行, __坏的: true })
    }
  }
  return 条们
}

function main() {
  const 条们 = 读()
  const 留 = []
  const 去 = []
  let 上一条是测试 = false

  for (const 条 of 条们) {
    if (条.__坏的) {
      留.push(条)
      上一条是测试 = false
      continue
    }

    let 理由 = ''
    if (条.角色 === 'user') {
      // 只有"他说的那句"能当证据
      理由 = 他那句是测试(条)
      上一条是测试 = !!理由
    } else if (上一条是测试) {
      // 她的回话只跟着上一句走
      理由 = '接在上面那条测试后面'
      上一条是测试 = false
    } else {
      上一条是测试 = false
    }

    if (理由) 去.push({ 条, 理由 })
    else 留.push(条)
  }

  console.log('')
  console.log(`  聊天记录一共 ${条们.length} 条`)
  console.log('')

  if (!去.length) {
    console.log('  没有找到测试留下的记录 —— 干净。')
    console.log('')
    return
  }

  console.log(`  挑出 ${去.length} 条像是测试的：`)
  console.log('')
  for (const { 条, 理由 } of 去) {
    const 一句 = String(条.内容 || '').replace(/\s+/g, ' ').slice(0, 56)
    console.log(`    [${条.时间}] ${条.角色 === 'user' ? '他' : '她'}：${一句}…`)
    console.log(`        └ ${理由}`)
  }
  console.log('')
  console.log(`  剩下 ${留.length} 条（真的对话）`)

  if (!真删) {
    console.log('')
    console.log('  ────────────────────────────────────────')
    console.log('  这是**只看**。确认没问题了，加上 --动手 真删：')
    console.log('    node tools\\清测试记录.cjs --动手')
    console.log('  （真删之前会自动备份一份在旁边）')
    console.log('')
    return
  }

  // ---- 备份，再写 ----
  const 备份名 = `聊天记录.清测试前-${new Date()
    .toLocaleString('sv-SE')
    .replace(/[-: ]/g, '')
    .slice(0, 14)}.jsonl`
  const 备份路径 = path.join(path.dirname(聊天文件), 备份名)
  fs.copyFileSync(聊天文件, 备份路径)

  fs.writeFileSync(
    聊天文件,
    留.map((条) => 条.__原文).join('\n') + '\n',
    'utf8',
  )

  console.log('')
  console.log('  ✓ 清好了')
  console.log(`    备份：${备份路径}`)
  console.log(`    现在 ${留.length} 条`)
  console.log('')
}

main()
