/**
 * 测飘不飘.cjs —— 同样一句话，不同温度各跑几遍，看话会不会垮
 *
 * 【为什么要测这个】
 *   2026-10-01 晚上出了一段明显不成句的话：
 *     「这颗卡满街跑得挺勤……诶，『满街跑得』我自己说的我还是别提嘴了。」
 *     「带英电竞和轻中度游戏里公认划算」
 *     「是人行里现货还是老基等着，这些一分档它能起退到四千」
 *   这不是"答得不对"，是**话本身垮了** —— 词不成词、句不成句，
 *   她自己讲到一半都察觉到了。
 *
 *   我当时把 temperature 设成了 1.3（为了让她活泼一点）。
 *   1.3 是偏高的：**长回答容易飘**，尤其在她手上没有真材料、
 *   只能靠"大概""大约"撑着的时候。
 *
 *   所以量法很简单：同一句话，不同温度各跑几遍，人眼看哪档开始垮。
 *
 * 用法: node tools\测飘不飘.cjs
 *       node tools\测飘不飘.cjs "换个问题"
 */
'use strict'

const path = require('node:path')
const 项目根 = path.resolve(__dirname, '..')
const { 拿钥匙 } = require(path.join(项目根, '脑', '钥匙.cjs'))
const 提示词 = require(path.join(项目根, '脑', '提示词.cjs'))
const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))

const 地址 = 'https://api.deepseek.com/v1/chat/completions'
const 模型 = 'deepseek-chat'

const 话 = process.argv.slice(2).join(' ') || '那你说说 5060 现在大概什么价位'

/** 要试的温度 */
const 温度们 = [1.3, 1.0, 0.8]

/** 每个温度跑几遍 */
const 遍数 = 3

async function 跑一次(温度, 系统提示, 他说的) {
  const { 钥匙 } = 拿钥匙()
  const t0 = Date.now()
  const 回应 = await fetch(地址, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
    body: JSON.stringify({
      model: 模型,
      messages: [
        { role: 'system', content: 系统提示 },
        { role: 'system', content: 提示词.拼时间() },
        { role: 'user', content: 他说的 },
      ],
      max_tokens: 1200,
      temperature: 温度,
    }),
    signal: AbortSignal.timeout(120000),
  })
  if (!回应.ok) throw new Error('HTTP ' + 回应.status + ' ' + (await 回应.text()).slice(0, 200))
  const 数据 = await 回应.json()
  return {
    文字: (数据.choices && 数据.choices[0] && 数据.choices[0].message.content) || '',
    用时: (Date.now() - t0) / 1000,
    输出: 数据.usage ? 数据.usage.completion_tokens : 0,
  }
}

/**
 * 粗量一下"话有多不干净"。
 *
 * 【为什么能量】垮掉的话有几个看得见的特征：
 *   · 冒出不成词的组合（"带英电竞""人行里"）—— 靠肉眼，脚本量不出
 *   · **自己重复自己**（同一句说两遍）
 *   · **自己打自己的嘴巴**（说了"我不报数"，后面又报）
 *   · 标点乱（连着好几个逗号、句子没有主语）
 * 这里只量"有没有重复"和"长度有没有失控"，成不成句还得人眼看。
 */
function 粗查(文本) {
  const 发现 = []
  const 句子 = 文本.split(/[。！？\n]/).map((s) => s.trim()).filter((s) => s.length > 6)

  // 重复的句子
  const 见过 = new Set()
  for (const 句 of 句子) {
    if (见过.has(句)) 发现.push('有句子说重复了：' + 句.slice(0, 20))
    见过.add(句)
  }

  // 连着两个逗号、或者标点堆一起
  if (/，\s*，/.test(文本)) 发现.push('连着两个逗号')
  if (/[，。]{3,}/.test(文本)) 发现.push('标点堆一起')

  // 太长的句子（真实的人说话，一句很少超过 80 字）
  const 长句 = 句子.filter((s) => s.length > 80)
  if (长句.length) 发现.push(`有 ${长句.length} 句超过 80 字（最长 ${Math.max(...长句.map((s) => s.length))} 字）`)

  return 发现
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('   同一句话，不同温度各跑几遍')
  console.log(`   我说：${话}`)
  console.log('  ════════════════════════════════════════════════════════')

  const 记忆片段 = 记忆.取记忆()
  路径安全.注册({ 项目根: 提示词.项目根, 工作区根: 提示词.工作区根 })

  // 这一版测的是**聊天模式**（他当时多半就在聊天模式：
  // 她手上没工具，只能凭记忆答，这正是最容易飘的情形）
  const 系统提示 = 提示词.拼({
    ...记忆片段,
    模式: 'chat',
    工作区: 提示词.工作区根,
  })
  console.log(`  用的是聊天模式的说明（${系统提示.length} 字）—— 那时她手上没工具`)
  console.log('')

  for (const 温度 of 温度们) {
    console.log('  ══════════════════════════════════════════════════════')
    console.log(`   温度 ${温度}`)
    console.log('  ══════════════════════════════════════════════════════')

    for (let i = 1; i <= 遍数; i++) {
      let 结果
      try {
        结果 = await 跑一次(温度, 系统提示, 话)
      } catch (错误) {
        console.log(`   第 ${i} 遍 ✗ ${错误.message}`)
        continue
      }
      const 毛病 = 粗查(结果.文字)
      console.log('')
      console.log(`   ── 第 ${i} 遍（${结果.用时.toFixed(1)}s，${结果.输出} token）` +
        (毛病.length ? `  ⚠ ${毛病.join('；')}` : '  （粗查没看出毛病）') + ' ──')
      for (const 行 of 结果.文字.split('\n')) console.log('   │ ' + 行)
    }
    console.log('')
  }

  console.log('  ════════════════════════════════════════════════════════')
  console.log('  人眼看这几样：')
  console.log('   · 哪一档开始出现"不成词的组合"（那种一眼就看出来不对的）')
  console.log('   · 有没有自己跟自己绕圈、说了又说')
  console.log('   · 有没有"我不报数"然后又报数这种自相矛盾')
  console.log('   · 同一档三遍之间，差别大不大（差得越多越不稳）')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  process.exit(1)
})
