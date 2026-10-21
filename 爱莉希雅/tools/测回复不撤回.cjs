/**
 * 测回复不撤回.cjs —— 已经显示的正文不能被内部重答或标记清理撤回。
 * 全程本地假网络，数据放系统临时目录，不发模型请求、不碰真实记忆。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const 临时数据 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-no-retract-'))
process.env.ELYSIA_DATA_DIR = 临时数据
process.env.ELYSIA_SECURE_API_KEY = 'sk-test-only-no-retract-1234567890'
const 对话 = require(path.join(__dirname, '..', '脑', '对话.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(名字, 条件) {
  总数++
  if (条件) {
    通过++
    console.log('  ✓ ' + 名字)
  } else {
    console.log('  ✗ ' + 名字)
  }
}

检查('“能不能读屏幕”识别为能力询问', 对话.是能力询问('你能不能读屏幕') === true)
检查('“能读屏幕吗”识别为能力询问', 对话.是能力询问('你能读到我的屏幕吗') === true)
检查('“是否有桌面权限”识别为能力询问', 对话.是能力询问('你是否有读取桌面的权限') === true)
检查('“能不能帮我读文件”仍是执行请求', 对话.是能力询问('你能不能帮我读一下桌面的 age.c') === false)

检查(
  '能力说明里的“读不到”不触发重答',
  对话.判断空转补救({
    能动手: true,
    工具们: [],
    他说的话: '你能不能读屏幕',
    回答: '我现在读不到你的屏幕。',
  }).要补救 === false,
)

检查(
  '执行请求里空口说“找不到”仍会补救',
  对话.判断空转补救({
    能动手: true,
    工具们: [],
    他说的话: '帮我读一下桌面的 age.c',
    回答: '我找不到那个文件。',
  }).要补救 === true,
)

检查(
  '空口说“写好了”仍会补救',
  对话.判断空转补救({
    能动手: true,
    工具们: [],
    他说的话: '写一个说明文件',
    回答: '已经写好了。',
  }).要补救 === true,
)

检查(
  '已经成功动过工具不再补救',
  对话.判断空转补救({
    能动手: true,
    工具们: [{ 结果: { 好: true } }],
    他说的话: '帮我读一下文件',
    回答: '找不到。',
  }).要补救 === false,
)

检查(
  '聊天模式永远不走工具补救',
  对话.判断空转补救({
    能动手: false,
    工具们: [],
    他说的话: '你能做什么',
    回答: '我找不到。',
  }).要补救 === false,
)

const 编码器 = new TextEncoder()
function 流回应(片段们) {
  const 数据 =片段们.map((内容) =>
    编码器.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 内容 } }] }) + '\n\n'),
  )
  数据.push(编码器.encode('data: [DONE]\n\n'))
  let 下标 = 0
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => 下标 < 数据.length ? { done: false, value: 数据[下标++] } : { done: true },
      }),
    },
  }
}

function 装假网(剧本) {
  const 真网 = globalThis.fetch
  let 次数 = 0
  globalThis.fetch = async () => {
    const 片段们 = 剧本[Math.min(次数, 剧本.length - 1)]
    次数++
    return 流回应(片段们)
  }
  return { 次数: () => 次数, 收网: () => { globalThis.fetch = 真网 } }
}

async function 主() {
  // 真正走一遍“能力询问”：工作模式也只能得到一个最终结果，第一轮不外流。
  {
    const 网 = 装假网([['我现在读不到你的屏幕。']])
    const 看见的 = []
    try {
      const 结果 = await 对话.说话({
        他说的话: '你能不能读到我的屏幕？', 历史: [], 模式: 'work',
        吐字: (文字) => 看见的.push(文字), 记进记忆: false, 后台整理: false,
      })
      检查('能力询问只请求一次，不被误判后重答', 网.次数() === 1)
      检查('工作模式能力说明不把第一轮草稿流到界面', 看见的.length === 0)
      检查('能力说明最终文本保持原样', 结果.她说的话 === '我现在读不到你的屏幕。')
    } finally {
      网.收网()
    }
  }

  // 真正复现“先说不能，程序打回重答”：第一稿必须完全不可见。
  {
    const 网 = 装假网([
      ['我刚试了一下，但读不到。'],
      ['我还没真正读取；需要调用工具后才能判断。'],
    ])
    const 看见的 = []
    try {
      const 结果 = await 对话.说话({
        他说的话: '现在帮我看看屏幕上是什么', 历史: [], 模式: 'work',
        吐字: (文字) => 看见的.push(文字), 记进记忆: false, 后台整理: false,
      })
      检查('执行请求的错误自述会触发内部补救', 网.次数() === 2)
      检查('被打回的“读不到”草稿从未流到界面', 看见的.length === 0)
      检查('界面只会收到补救后的最终回答', 结果.她说的话 === '我还没真正读取；需要调用工具后才能判断。')
    } finally {
      网.收网()
    }
  }

  // 聊天模式会实时显示，但内部标记从一开始就不能露出来再被删掉。
  {
    const 网 = 装假网([['好呀。\n\n[', '表情:微笑]', '\n\n继续聊。']])
    const 看见的 = []
    try {
      const 结果 = await 对话.说话({
        他说的话: '继续聊吧', 历史: [], 模式: 'chat',
        吐字: (文字) => 看见的.push(文字), 记进记忆: false, 后台整理: false,
      })
      const 有效快照 = 看见的.filter(Boolean)
      const 单调追加 = 有效快照.every((文字, i) => i === 0 || 文字.startsWith(有效快照[i - 1]))
      检查('流式过程从不显示完整或半截内部标记', !看见的.some((x) => /表情|\[|【/.test(x)))
      检查('流式可见正文只追加、不回退', 单调追加)
      检查('最后一个流式快照等于最终正文', 有效快照.at(-1) === 结果.她说的话)
      检查('最终正文保留标记前后的正常说话', 结果.她说的话 === '好呀。\n\n继续聊。')
    } finally {
      网.收网()
    }
  }

  console.log('')
  console.log(`  ${通过} / ${总数} ${通过 === 总数 ? '✓' : '✗'}`)
  if (通过 !== 总数) process.exitCode = 1
}

主()
  .catch((错误) => {
    console.error(错误 && 错误.stack ? 错误.stack : 错误)
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(临时数据, { recursive: true, force: true }))
