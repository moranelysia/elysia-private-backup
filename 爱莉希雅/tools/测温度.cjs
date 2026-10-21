/**
 * 测温度.cjs —— 拿真出过事的那句话，在不同温度各跑几遍
 *
 * 【为什么用这句话】
 *   2026-10-01 20:00 的现场：他说"在工作区写一个有意思的c语言程序吧"，
 *   她的回复后半截垮了 —— 混进日语（「の話」）、舞台指示
 *   （「剧本式错误/乱场」），而且**嘴上说"已经在 D:\elysia测试\tiny_stage.c
 *   躺着啦"，其实一个字都没写**。
 *
 *   她自己也察觉了："我那段话后半截根本没在人话里。"
 *
 *   量法：同一句话，不同温度各跑几遍，人眼看哪一档开始垮。
 *   温度当初是我设成 1.3 的（想让她活泼一点），
 *   1.3 是偏高的 —— 长回答容易飘。
 *
 * 用法: node tools\测温度.cjs
 */
'use strict'

const path = require('node:path')
const 项目根 = path.resolve(__dirname, '..')
const { 拿钥匙 } = require(path.join(项目根, '脑', '钥匙.cjs'))
const 提示词 = require(path.join(项目根, '脑', '提示词.cjs'))
const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
const 工具表 = require(path.join(项目根, '脑', '工具表.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))

const 地址 = 'https://api.deepseek.com/v1/chat/completions'
const 模型 = 'deepseek-chat'

const 话 = process.argv[2] || '在工作区写一个有意思的c语言程序吧,我跑一下看看'
const 温度们 = [1.3, 1.0, 0.8]
const 遍数 = 3

async function 跑一次(温度, 消息们) {
  const { 钥匙 } = 拿钥匙()
  const t0 = Date.now()
  const 回应 = await fetch(地址, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
    body: JSON.stringify({ model: 模型, messages: 消息们, max_tokens: 1600, temperature: 温度 }),
    signal: AbortSignal.timeout(120000),
  })
  if (!回应.ok) throw new Error('HTTP ' + 回应.status)
  const 数据 = await 回应.json()
  return {
    文字: (数据.choices && 数据.choices[0] && 数据.choices[0].message.content) || '',
    用时: (Date.now() - t0) / 1000,
    输出: 数据.usage ? 数据.usage.completion_tokens : 0,
  }
}

/**
 * 粗量"垮没垮"。
 *
 * 垮掉的话有几个数得出来的特征：
 *   · 混进日语假名（の、は、を 这些）—— 她从来不这么说话
 *   · 冒出一堆引号书名号（「」『』《》）—— 成段的舞台指示
 *   · 自己承认说错了（"不对""重写""乱场"）
 *   · 句子长度失控（真实的人一句很少超过 80 字）
 */
function 体检(文本) {
  const 毛病 = []

  const 假名 = (文本.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length
  if (假名) 毛病.push(`混进 ${假名} 个日文假名`)

  const 书名号 = (文本.match(/[「」『』《》]/g) || []).length
  if (书名号 >= 6) 毛病.push(`用了 ${书名号} 个引号/书名号（像在演剧本）`)

  if (/(不对|重写|写错|乱场|不好意思|失态|失礼|抱歉)/.test(文本)) 毛病.push('里面出现了道歉/自我纠正')

  const 句子 = 文本.split(/[。！？\n]/).map((s) => s.trim()).filter((s) => s.length > 8)
  const 长句 = 句子.filter((s) => s.length > 80)
  if (长句.length) 毛病.push(`有 ${长句.length} 句超过 80 字`)

  // 句子重复
  const 见过 = new Set()
  for (const 句 of 句子) {
    if (见过.has(句)) {
      毛病.push('有句子说重复了')
      break
    }
    见过.add(句)
  }

  return 毛病
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('   拿真出过事的那句话，不同温度各跑几遍')
  console.log(`   我说：${话}`)
  console.log('  ════════════════════════════════════════════════════════')

  const 记忆片段 = 记忆.取记忆()
  路径安全.注册({ 项目根: 提示词.项目根, 工作区根: 提示词.工作区根 })
  路径安全.设工作区(null)

  // 用干活模式的说明（他当时就在干活模式）
  const 系统提示 = 提示词.拼({
    ...记忆片段,
    模式: 'work',
    工作区: 'D:\\elysia测试',
    工具说明: 工具表.拼工具说明(),
    环境说明: '',
    范围说明: 路径安全.拼范围说明(),
  })

  console.log(`  系统提示 ${系统提示.length} 字`)
  console.log('')

  for (const 温度 of 温度们) {
    console.log('  ══════════════════════════════════════════════════════')
    console.log(`   温度 ${温度}`)
    console.log('  ══════════════════════════════════════════════════════')

    for (let i = 1; i <= 遍数; i++) {
      const 消息们 = [
        { role: 'system', content: 系统提示 },
        { role: 'system', content: 提示词.拼时间() },
        { role: 'user', content: 话 },
      ]
      let 结果
      try {
        结果 = await 跑一次(温度, 消息们)
      } catch (错误) {
        console.log(`   第 ${i} 遍 ✗ ${错误.message}`)
        continue
      }
      const 毛病 = 体检(结果.文字)
      console.log('')
      console.log(
        `   ── 第 ${i} 遍（${结果.用时.toFixed(1)}s，${结果.输出} token）` +
          (毛病.length ? `   ⚠ ${毛病.join('；')}` : '   ✓ 没看出毛病') +
          ' ──',
      )
      for (const 行 of 结果.文字.split('\n')) console.log('   │ ' + 行)
    }
    console.log('')
  }

  console.log('  ════════════════════════════════════════════════════════')
  console.log('  看：哪一档开始"⚠"，以及同一档三遍之间差多大。')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  process.exit(1)
})
