/**
 * 试换模型.cjs —— 同一句话，同一个她，换三个脑子，看回得像不像
 *
 * 【为什么要跑这个】
 *   他要"像 DSH 一样，每段对话各用一个模型"。可换模型有两笔账：
 *     · 钱：前缀缓存是按模型分的，换一个模型 = 缓存从头攒
 *     · 更要紧的那笔：她那套人设是在 deepseek-chat 上一点点调出来的，
 *       换个脑子之后她还像不像她 —— 谁都不知道，只能看
 *   这个脚本就是把三段回话摆在一起，让他自己一眼判断。
 *
 * 【为什么用真的 说话()，不自己拼提示词】
 *   自己拼的话，测的就不是"她"，是"我以为的她" ——
 *   记忆片段、模式、工具说明这些层只要少一层，语气就不一样了，
 *   而那正好会让人得出错误的结论。所以走真路子。
 *   （安全：记忆闸门保证非 Electron 环境不往她的记忆里写东西。）
 *
 * 【会花钱】三次请求，每次都带着她七千多字的人设。加起来一毛以内。
 *
 * 用法: node tools\试换模型.cjs
 *      node tools\试换模型.cjs "在吗"        （换一句问话）
 */
'use strict'

const path = require('node:path')
const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')

const { 说话, 模型: 默认模型 } = require(path.join(脑, '对话.cjs'))
const { 拿钥匙 } = require(path.join(脑, '钥匙.cjs'))
const 用量 = require(path.join(脑, '用量.cjs'))

const 全地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions'
const 根 = 全地址.replace(/\/chat\/completions.*$/, '')
const { 钥匙 } = 拿钥匙()

/** 问这句 —— 挑一句能看出她性格的（关心人的方式、语气词、长度） */
const 问话 = process.argv[2] || '今天站了一天，脚好疼'

/** 问问这把钥匙上有哪些模型（不写死名单 —— 名单是会变的） */
async function 有哪些模型() {
  try {
    const 回应 = await fetch(根 + '/models', { headers: { authorization: 'Bearer ' + 钥匙 } })
    if (!回应.ok) return []
    const 数据 = await 回应.json()
    return (数据.data || []).map((x) => x.id)
  } catch {
    return []
  }
}

async function 主() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   同一句话，同一个她，换三个脑子')
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  他跟她说：「' + 问话 + '」')
  console.log('')

  const 名单 = await 有哪些模型()
  // 她现在用的那个排第一（那是基准，其他都跟它比）
  const 要试的 = [...new Set([默认模型, ...名单])]
  if (要试的.length < 2) {
    console.log('  ⚠ 只拿到一个模型名，比不了。')
    process.exit(1)
  }

  const 结果们 = []
  for (const 一个 of 要试的) {
    process.stdout.write('  正在问 ' + 一个 + ' … ')
    const 开始 = Date.now()
    try {
      const 果 = await 说话({
        他说的话: 问话,
        历史: [],
        // 【用聊天模式】干活模式会带上工具说明、审批那一套，
        // 那些跟"她说话像不像"没关系，只会把变量搅浑。
        模式: 'chat',
        模型: 一个,
      })
      结果们.push({ 模型: 一个, 好: true, 说: 果.她说的话, 用了: 果.用了, 花了: Date.now() - 开始 })
      console.log('回来了（' + ((Date.now() - 开始) / 1000).toFixed(1) + ' 秒）')
    } catch (错误) {
      结果们.push({ 模型: 一个, 好: false, 说明: 错误.message, 花了: Date.now() - 开始 })
      console.log('✗ ' + 错误.message)
    }
  }

  console.log('')
  for (const 一个 of 结果们) {
    console.log('  ────────────────────────────────────────────')
    console.log('  ' + 一个.模型 + (一个.模型 === 默认模型 ? '   ← 她现在用的这个' : ''))
    console.log('  ────────────────────────────────────────────')
    if (!一个.好) {
      console.log('  ✗ 没成：' + 一个.说明)
      console.log('')
      continue
    }
    console.log(
      (一个.说 || '(空的)')
        .split('\n')
        .map((行) => '  ' + 行)
        .join('\n'),
    )
    console.log('')
    if (一个.用了) {
      const 命 = 一个.用了.prompt_cache_hit_tokens
      const 未 = 一个.用了.prompt_cache_miss_tokens
      let 钱 = '—'
      try {
        钱 = 用量.算钱(一个.用了).toFixed(4) + ' 元'
      } catch {
        /* 算不出来就算了 */
      }
      console.log(
        `  〔输入 ${一个.用了.prompt_tokens}　命中 ${命 ?? '—'}　未命中 ${未 ?? '—'}　` +
          `输出 ${一个.用了.completion_tokens}　${钱}〕`,
      )
    } else {
      console.log('  〔没拿到用量〕')
    }
    console.log('')
  }

  console.log('  ════════════════════════════════════════════')
  console.log('  你看哪一段最像她。')
  console.log('')
  console.log('  顺带留意两件事：')
  console.log('   · 除她正在用的那个以外，其余几个第一次都是"未命中"——')
  console.log('     换模型等于缓存从头攒，第一句会明显贵。之后就正常了。')
  console.log('   · 同一句问话，三个模型的长度、语气词、称呼方式差多少。')
  console.log('  ════════════════════════════════════════════')
  console.log('')
}

主().catch((错误) => {
  console.log('  ✗ 脚本自己炸了：' + (错误 && 错误.stack))
  process.exit(1)
})
