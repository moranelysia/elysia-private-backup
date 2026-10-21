'use strict'

const path = require('node:path')

process.env.ELYSIA_SECURE_API_KEY = 'sk-test-deepseek-key-1234567890'
process.env.ELYSIA_DEEPSEEK_API_KEY = 'sk-test-deepseek-key-1234567890'

const 根 = path.resolve(__dirname, '..')
const 工具表 = require(path.join(根, '脑', '工具表.cjs'))
const 工作请求 = require(path.join(根, '脑', '工作请求.cjs'))

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

async function main() {
  const 聊天认 = 工具表.为模式认工具('chat')
  检查('聊天模式能认出联网搜索', 聊天认('查') && 聊天认('查').名字 === '查')
  检查('聊天模式能认出本机时间', 聊天认('时间') && 聊天认('时间').名字 === '时间')
  检查('聊天模式拒绝读取文件', 聊天认('读') === null)
  检查('聊天模式拒绝写入和命令', 聊天认('写') === null && 聊天认('跑') === null)
  检查('工作模式仍保留全部工具', 工具表.按模式('work').length === 工具表.表.length)

  const 应直通 = ['搜索 Node.js 最新 LTS', '读取并总结这个文件', '看看代码为什么报错', '这个文件里写了什么']
  const 应确认 = ['读取后修改这个文件', '查完保存成报告', '帮我写一份报告', '运行测试看看', '删除旧文件']
  for (const 话 of 应直通) 检查(`纯读取/搜索直通：${话}`, 工作请求.判断(话).只读)
  for (const 话 of 应确认) 检查(`改变状态仍确认：${话}`, !工作请求.判断(话).只读)

  const 对话 = require(path.join(根, '脑', '对话.cjs'))
  const 真网 = globalThis.fetch
  let 模型次数 = 0
  let 搜索次数 = 0
  globalThis.fetch = async (地址) => {
    const url = String(地址)
    if (url.includes('api.deepseek.com/v1/tools/search')) {
      搜索次数++
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{
            rerank_score: 2.1,
            title: '官方资料',
            url: 'https://example.org/elysia',
            snippet: '这是测试搜索摘要。',
            summary: '这是测试搜索摘要。',
            content: '',
            site_name: 'example.org',
            site_icon: null,
            date: null,
            authority: 3,
          }],
        }),
      }
    }
    模型次数++
    return 模型回应(
      模型次数 === 1
        ? '我查一下。\n<ds_system_note>本条调用工具：查:爱莉希雅 官方资料</ds_system_note>'
        : '找到了，测试资料在这里。',
    )
  }

  try {
    const 结果 = await 对话.说话({
      他说的话: '帮我搜索爱莉希雅的官方资料',
      历史: [],
      模式: 'chat',
      记进记忆: false,
      后台提取: false,
      后台整理: false,
    })
    检查('聊天模式真的执行一次搜索', 搜索次数 === 1, String(搜索次数))
    检查('搜索结果回给模型后再回答', 模型次数 === 2 && 结果.她说的话.includes('找到了'), JSON.stringify({ 模型次数, 回答: 结果.她说的话 }))
    检查('聊天工具记录里只有查', 结果.用过的工具.length === 1 && 结果.用过的工具[0].名字 === '查')
  } finally {
    globalThis.fetch = 真网
  }

  console.log(`\n聊天搜索与只读工作：${通过}/${总数} 通过`)
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
