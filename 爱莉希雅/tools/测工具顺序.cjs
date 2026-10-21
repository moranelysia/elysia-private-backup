'use strict'

/**
 * 回归：同一轮里的工具标记必须按书写顺序执行。
 *
 * 真实故障是 [写] 与 [交付] 被 Promise.all 并发：写入还在等新建确认，
 * 交付已经检查路径并报“找不到”；稍后写入成功，右侧栏又确实出现文件。
 * 这里故意把确认延迟一点，旧实现会稳定复现，顺序实现则应一次成功。
 */
const fs = require('node:fs')
const path = require('node:path')

const 根 = path.resolve(__dirname, '..')
const 测试根 = path.join(path.dirname(根), '_测试', '工具顺序')
const 数据根 = path.join(测试根, '数据')
const 目标 = path.join(测试根, '第一次交付.txt')

process.env.ELYSIA_DATA_DIR = 数据根
process.env.ELYSIA_SECURE_API_KEY = 'sk-test-deepseek-key-1234567890'

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (!条件) throw new Error('✗ ' + 说明 + (细节 ? '：' + 细节 : ''))
  通过++
  console.log('✓ ' + 说明)
}

function 模型回应(文字) {
  const 编码器 = new TextEncoder()
  const 块 = [
    编码器.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 文字 } }] }) + '\n\n'),
    编码器.encode('data: [DONE]\n\n'),
  ]
  let 位置 = 0
  return {
    ok: true,
    status: 200,
    body: { getReader: () => ({ read: async () => 位置 < 块.length ? { done: false, value: 块[位置++] } : { done: true } }) },
    text: async () => '',
  }
}

async function 主() {
  fs.rmSync(测试根, { recursive: true, force: true })
  fs.mkdirSync(测试根, { recursive: true })

  const 对话 = require(path.join(根, '脑', '对话.cjs'))
  const 工具表源码 = fs.readFileSync(path.join(根, '脑', '工具表.cjs'), 'utf8')
  const 真网 = globalThis.fetch
  let 模型次数 = 0
  globalThis.fetch = async () => {
    模型次数++
    if (模型次数 === 1) {
      return 模型回应(
        `我把它写好。\n[写:${目标}]\n\`\`\`text\n第一次就应该交付成功。\n\`\`\`\n[交付:${目标}]`,
      )
    }
    return 模型回应('写好了，文件已经能在右侧栏里看见。')
  }

  try {
    const 结果 = await 对话.说话({
      他说的话: '新建这个文本并放进右侧文件栏',
      历史: [],
      模式: 'work',
      问: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return true
      },
      记进记忆: false,
      后台提取: false,
      后台整理: false,
    })

    const 工具们 = 结果.用过的工具 || []
    检查('一轮内识别写与交付两项工具', 工具们.length === 2, JSON.stringify(工具们.map((x) => x.名字)))
    检查('工具结果保持写在前、交付在后', 工具们[0]?.名字 === '写' && 工具们[1]?.名字 === '交付')
    检查('第一次交付不再抢跑失败', 工具们[1]?.结果?.好 === true, 工具们[1]?.结果?.说明 || '')
    检查('文件内容真实落盘', fs.readFileSync(目标, 'utf8') === '第一次就应该交付成功。')
    检查('直接写入说明会自动进入侧栏', 工具们[0]?.结果?.内容?.includes('自动进入右侧“文件”栏'))
    检查('工具说明阻止重复交付', 工具表源码.includes('同一路径不要再调用 [交付:]'))
    检查('模型只经历工具轮和最终回答两轮', 模型次数 === 2, String(模型次数))
  } finally {
    globalThis.fetch = 真网
    fs.rmSync(测试根, { recursive: true, force: true })
  }

  console.log(`\n工具顺序：${通过}/${总数} 通过`)
}

主().catch((错误) => {
  try { fs.rmSync(测试根, { recursive: true, force: true }) } catch {}
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
