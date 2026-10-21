/**
 * 试识图.cjs —— DeepSeek 到底收不收图片，哪个模型收
 *
 * 【为什么要真发一张，而不是看文档就下结论】
 *   查资料的时候翻到一条：某个项目的 release notes 写着"适配器支持原生图片请求"，
 *   实测官方 API 全部 400 拒绝。
 *   **文档写支持 ≠ 你这把钥匙能用。** 所以必须真发一次。
 *
 * 【怎么知道它是真看见了，不是瞎编】
 *   当场造一张图，上面印一个随机四位数。只有真看见的才答得出那个数。
 *   答对了 = 真看见了；答错、或者推说"我看不到图片" = 没通。
 *   （这跟"她说做了 ≠ 她做了"是同一个道理，只不过对象换成了模型。）
 *
 * 【会花钱】两次请求，一张小图。加起来几分钱。
 *
 * 用法: node tools\试识图.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')
const 试目录 = path.join(项目根, '.cache', '_试识图')

const { 拿钥匙, 遮住 } = require(path.join(脑, '钥匙.cjs'))

// 跟 脑\对话.cjs 用同一套规则找地址 —— 别在这儿另写一个，不然哪天改了那边这儿就瞎了
const 全地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions'
const 根 = 全地址.replace(/\/chat\/completions.*$/, '')

const { 钥匙 } = 拿钥匙()

/** 造一张写着随机四位数的白底黑字图 */
async function 造图() {
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    return { 好: false, 说明: '这台机器上没有 sharp，造不出图' }
  }

  const 数字 = String(Math.floor(1000 + Math.random() * 9000))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150">` +
    `<rect width="320" height="150" fill="#ffffff"/>` +
    `<text x="28" y="102" font-family="Arial, Helvetica, sans-serif" ` +
    `font-size="78" font-weight="bold" fill="#000000">${数字}</text>` +
    `</svg>`

  try {
    const 缓冲 = await sharp(Buffer.from(svg)).png().toBuffer()
    fs.mkdirSync(试目录, { recursive: true })
    const 路径 = path.join(试目录, '图.png')
    fs.writeFileSync(路径, 缓冲)
    return { 好: true, 数字, 缓冲, 路径 }
  } catch (错误) {
    return { 好: false, 说明: '造图失败：' + 错误.message }
  }
}

async function 列模型() {
  console.log('  ── 这把钥匙能用哪些模型 ──')
  try {
    const 回应 = await fetch(根 + '/models', {
      headers: { authorization: 'Bearer ' + 钥匙 },
    })
    const 文 = await 回应.text()
    if (!回应.ok) {
      console.log('  HTTP ' + 回应.status + '：' + 文.slice(0, 200))
      return
    }
    const 数据 = JSON.parse(文)
    const 名单 = (数据.data || []).map((x) => x.id)
    console.log('  ' + (名单.length ? 名单.join('、') : '（一个都没列出来）'))
  } catch (错误) {
    console.log('  问不出来：' + 错误.message)
  }
  console.log('')
}

/** 拿一张图去问某个模型，看它认不认 */
async function 问(模型, 图的base64, 要问的话) {
  const 体 = {
    model: 模型,
    max_tokens: 120,
    temperature: 0,
    messages: [
      {
        role: 'user',
        // 【注意】图片只许放在 user 消息里。放 system 或 assistant 会被 400 拒掉 ——
        // 官方文档「Restrictions」那一节写着的。
        content: [
          { type: 'text', text: 要问的话 },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 图的base64 } },
        ],
      },
    ],
  }

  const 开始 = Date.now()
  try {
    const 回应 = await fetch(根 + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify(体),
    })
    const 文 = await 回应.text()
    const 花了 = Date.now() - 开始

    if (!回应.ok) {
      return { 通: false, 状态: 回应.status, 说明: 文.slice(0, 300), 花了 }
    }
    const 数据 = JSON.parse(文)
    const 说 = (数据.choices && 数据.choices[0] && 数据.choices[0].message.content) || ''
    return { 通: true, 说, 用了: 数据.usage, 花了 }
  } catch (错误) {
    return { 通: false, 状态: 0, 说明: 错误.message, 花了: Date.now() - 开始 }
  }
}

async function 主() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   DeepSeek 收不收图片 —— 真发一张试试')
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  地址：' + 根)
  console.log('  钥匙：' + 遮住(钥匙))
  console.log('')

  await 列模型()

  const 图 = await 造图()
  if (!图.好) {
    console.log('  ✗ ' + 图.说明)
    process.exit(1)
  }
  console.log('  ── 造了一张图 ──')
  console.log('  上面印的数字是：' + 图.数字 + '（只有这个数，别的一个字都没有）')
  console.log('  存到：' + 图.路径)
  console.log('')

  const b64 = 图.缓冲.toString('base64')
  const 要问的话 = '这张图里写的是什么数字？只回那个数字，不要别的话。'

  // 【先试她正在用的那个】—— 这是关键的一格
  const 她 = process.env.ELYSIA_LLM_MODEL || 'deepseek-chat'
  console.log('  ── 一、她正在用的模型：' + 她 + ' ──')
  const 甲 = await 问(她, b64, 要问的话)
  if (!甲.通) {
    console.log('  ✗ 不通 —— HTTP ' + 甲.状态)
    console.log('    ' + 甲.说明.replace(/\n/g, ' ').slice(0, 240))
  } else {
    const 对 = 甲.说.includes(图.数字)
    console.log('  它说：' + 甲.说.trim().slice(0, 120))
    console.log('  ' + (对 ? '✓ 认出来了（真的看见了）' : '✗ 没认出那个数 —— 说明这条路不通'))
  }
  console.log('')

  // 【再试我这会儿跑的那个】
  console.log('  ── 二、我这边跑的那个：deepseek-flash ──')
  const 乙 = await 问('deepseek-flash', b64, 要问的话)
  if (!乙.通) {
    console.log('  ✗ 不通 —— HTTP ' + 乙.状态)
    console.log('    ' + 乙.说明.replace(/\n/g, ' ').slice(0, 240))
  } else {
    const 对 = 乙.说.includes(图.数字)
    console.log('  它说：' + 乙.说.trim().slice(0, 120))
    console.log('  ' + (对 ? '✓ 认出来了（真的看见了）' : '✗ 没认出那个数'))
    if (乙.用了) {
      console.log(
        `  用量：输入 ${乙.用了.prompt_tokens}（其中缓存命中 ${乙.用了.prompt_cache_hit_tokens ?? '—'}），输出 ${乙.用了.completion_tokens}`,
      )
    }
  }
  console.log('')

  console.log('  ── 那张图留着，你可以自己看一眼对不对 ──')
  console.log('  ' + 图.路径)
  console.log('')
}

主().catch((错误) => {
  console.log('  ✗ 脚本自己炸了：' + (错误 && 错误.stack))
  process.exit(1)
})
