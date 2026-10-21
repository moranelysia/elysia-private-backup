/** 停止回复链路：假网络验证 AbortSignal；其余检查固定 IPC 与界面接线。 */
'use strict'

process.env.DEEPSEEK_API_KEY = 'sk-test-stop-reply-1234567890'
process.env.ELYSIA_首字节超时 = '5000'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function main() {
  const main源码 = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
  const preload = fs.readFileSync(path.join(根, 'preload.js'), 'utf8')
  const chat = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
  const 对话源码 = fs.readFileSync(path.join(根, '脑', '对话.cjs'), 'utf8')
  const 子代理源码 = fs.readFileSync(path.join(根, '脑', '子代理.cjs'), 'utf8')

  检查('主进程为每次回复创建 AbortController', main源码.includes('const 回复请求 = new Map()') && main源码.includes('const 回复控制器 = new AbortController()'))
  检查('模型循环收到同一个中止信号', main源码.includes('中止: 回复控制器.signal'))
  检查('停止入口只由 preload 暴露固定动作', main源码.includes("ipcMain.handle('停止回复'") && preload.includes("停止回复: () => ipcRenderer.invoke('停止回复')"))
  检查('停止会撤销等待中的确认卡', main源码.includes('function 作废当前确认卡()') && main源码.includes("webContents.send('卡片撤了', 编号)"))
  检查('工具层收到中止信号', 对话源码.includes('中止: 选项.中止'))
  检查('补救工具调用也继续传中止信号', (对话源码.match(/中止: 选项\.中止/g) || []).length >= 4)
  检查('子代理内部工具继续传中止信号', 子代理源码.includes('中止: 选项.中止'))
  检查('运行中发送键变成停止键', chat.includes("发送按钮.textContent = '■'") && chat.includes('停止当前回复'))
  检查('停止保留已经显示的部分正文', chat.includes('流式把手.读文字()') && chat.includes("已有 + '\\n\\n（已停止）'"))
  检查('工作任务把停止记为已取消', chat.includes("回执 && 回执.已停止 ? '已取消'"))

  const 原fetch = global.fetch
  let 收到信号 = null
  global.fetch = async (_地址, 选项) => {
    收到信号 = 选项.signal
    return await new Promise((_完成, 失败) => {
      const 中止 = () => {
        const 错误 = new Error('This operation was aborted')
        错误.name = 'AbortError'
        失败(错误)
      }
      if (选项.signal.aborted) 中止()
      else 选项.signal.addEventListener('abort', 中止, { once: true })
    })
  }

  try {
    const { 要一轮 } = require(path.join(根, '脑', '对话.cjs'))
    const 控制器 = new AbortController()
    const 请求 = 要一轮({ 消息们: [{ role: 'user', content: '测试停止' }], 中止: 控制器.signal })
    setImmediate(() => 控制器.abort())
    let 错误 = null
    try { await 请求 } catch (一个) { 错误 = 一个 }
    检查('真实请求函数接收到可取消信号', 收到信号 && 收到信号.aborted)
    检查('用户中止不会进入自动重试', 错误 && 错误.name === 'AbortError')
  } finally {
    global.fetch = 原fetch
  }

  console.log(`\n停止回复：${通过}/${总数} 通过`)
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
