/**
 * 看她怎么接话.cjs —— 把她每一轮"收到什么、吐出什么"全打出来
 *
 * 【为什么要这个】
 *   2026-10-01 晚上出了一段明显不成句的话：
 *     「这颗卡满街跑得挺勤……诶，『满街跑得』我自己说的我还是别提嘴了。」
 *     「带英电竞和轻中度游戏里公认划算」「人行里现货还是老基等着」
 *   这不是"答得不对"，是**话本身垮了**。
 *
 *   光看最后那一句猜不出原因，得看她每一轮的输入输出：
 *   我递过去的是什么结构？她每轮吐了什么？是不是某一轮塌了、
 *   然后被当成"她说过的话"又递回去，越滚越乱？
 *
 * 用法: node tools\看她怎么接话.cjs
 *       node tools\看她怎么接话.cjs "换个问题"
 */
'use strict'

const path = require('node:path')
const 项目根 = path.resolve(__dirname, '..')

const 提示词 = require(path.join(项目根, '脑', '提示词.cjs'))
const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
const 工具表 = require(path.join(项目根, '脑', '工具表.cjs'))
const 解析 = require(path.join(项目根, '脑', '解析工具调用.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))
const { 要一轮 } = require(path.join(项目根, '脑', '对话.cjs'))

const 话 = process.argv.slice(2).join(' ') || '查一下现在5060多少钱'
const 模式 = process.env.模式 === 'chat' ? 'chat' : 'work'

/** 把一段话缩成能看的样子 */
function 摘(文本, 最多 = 300) {
  const 净 = String(文本 || '').replace(/\n/g, ' ⏎ ')
  return 净.length > 最多 ? 净.slice(0, 最多) + `…（共 ${净.length} 字）` : 净
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log(`   她说一句话，我要看每一轮的进出    模式=${模式}`)
  console.log(`   我说：${话}`)
  console.log('  ════════════════════════════════════════════════════════')

  const 记忆片段 = 记忆.取记忆()
  if (模式 === 'work') {
    路径安全.注册({ 项目根: 提示词.项目根, 工作区根: 提示词.工作区根 })
    路径安全.设工作区(null)
  }

  const 系统提示 = 提示词.拼({
    ...记忆片段,
    模式,
    工作区: 提示词.工作区根,
    工具说明: 模式 === 'work' ? 工具表.拼工具说明() : '',
    环境说明: '',
    范围说明: 模式 === 'work' ? 路径安全.拼范围说明() : '',
  })

  const 消息们 = [
    { role: 'system', content: 系统提示 },
    { role: 'system', content: 提示词.拼时间() },
    { role: 'user', content: 话 },
  ]

  console.log('')
  console.log(`  【递过去的开场】系统提示 ${系统提示.length} 字，之后是时间、然后是我的话`)
  console.log('')

  const 最多轮 = 3
  for (let 第几轮 = 1; 第几轮 <= 最多轮; 第几轮++) {
    console.log('  ────────────────────────────────────────────────────────')
    console.log(`  【第 ${第几轮} 轮】我要递过去 ${消息们.length} 条消息：`)
    for (const [i, 条] of 消息们.entries()) {
      const 角色 = 条.role === 'system' ? '系统' : 条.role === 'user' ? '他/内部' : '她'
      // 系统提示太长，只报个头
      const 内容 = i === 0 ? `（${条.content.length} 字的开场说明，略）` : 摘(条.content)
      console.log(`     ${String(i).padStart(2)}. [${角色}] ${内容}`)
    }
    console.log('')

    const 一轮 = await 要一轮({ 消息们 })
    const 全文 = 一轮.全文 || ''

    console.log(`  【她第 ${第几轮} 轮吐出来的】共 ${全文.length} 字：`)
    console.log('  ┌────────────────────────────────────────────')
    for (const 行 of 全文.split('\n')) console.log('  │ ' + 行)
    console.log('  └────────────────────────────────────────────')

    // 括号配对检查 —— 不成句的那种垮，常常伴随括号没配完
    const 左 = (全文.match(/[\[【]/g) || []).length
    const 右 = (全文.match(/[\]】]/g) || []).length
    if (左 !== 右) console.log(`  ⚠ 方括号不配对：左 ${左} 个、右 ${右} 个`)

    const 拆的 = 解析.拆(全文, 工具表.认工具)
    console.log(`  解析：要做 ${拆的.要做.length} 件，认不出 ${拆的.不认识.length} 个`)
    for (const 一件 of 拆的.要做) {
      console.log(`     → ${一件.名字}(${JSON.stringify(一件.参数)})${一件.内容 ? '  带内容 ' + 一件.内容.length + ' 字' : ''}`)
    }
    console.log('')

    if (!拆的.要做.length) {
      console.log('  （没有工具调用 —— 说完了）')
      break
    }

    // 模拟主循环：把她的原话和工具结果递回去
    消息们.push({ role: 'assistant', content: 全文 })
    消息们.push({
      role: 'user',
      content:
        '【内部】他看不见这段。这是你刚才要的东西，用你自己的话讲给他听：\n\n' +
        拆的.要做
          .map((一件) => {
            // 这里用占位，是为了**看清结构**（真搜索结果几十行，刷屏看不清）
            const r = { 好: true, 内容: `（这里本来是真搜索结果，先用占位 —— 搜的是「${一件.参数}」）` }
            return `【${一件.名字}：${一件.参数}】\n${r.内容}`
          })
          .join('\n\n') +
        '\n\n（讲的时候像平时说话那样，别报"我查了哪些步骤"，也别把上面的格式抄进去。' +
        '拿不准的地方就说拿不准 —— 搜索摘要里的数字不一定准。）',
    })
  }

  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('  看这几样：')
  console.log('   · 哪一轮开始不成句的？（对不上的话，是那一轮之前就埋了东西）')
  console.log('   · 递回去的那段"内部消息"有多长、像不像搜索结果？')
  console.log('   · 她有没有把"内部消息"当成他说的话在回答？')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('')
}

/** 真的去搜一下（这样看到的才是她真收到的东西） */
function 查模拟(词) {
  const 动手 = require(path.join(项目根, '脑', '动手.cjs'))
  // 它会返回一个 Promise，但这里只想要个同步的占位 —— 所以给个提示
  return { 好: true, 内容: `（这里本来是真搜索结果，为了看清结构先用占位）搜的是「${词}」` }
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 5).join('\n'))
  process.exit(1)
})
