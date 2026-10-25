/** 可选的受信任务上下文；桌面旧调用方不传时维持原行为。 */
'use strict'
function 检查任务(上下文 = {}) {
  if (上下文.中止?.aborted) { const 错 = new Error('TASK_ABORTED'); 错.name = 'AbortError'; throw 错 }
  if (typeof 上下文.检查写入 === 'function') 上下文.检查写入()
}
function 等待有界(承诺, 信号) {
  if (!信号) return Promise.resolve(承诺)
  return new Promise((好, 坏) => {
    const 中止 = () => { 清理(); const 错 = new Error('TASK_ABORTED'); 错.name = 'AbortError'; 坏(错) }
    const 清理 = () => 信号.removeEventListener('abort', 中止)
    Promise.resolve(承诺).then((值) => { 清理(); if (信号.aborted) 中止(); else 好(值) }, (错) => { 清理(); 坏(错) })
    if (信号.aborted) 中止(); else 信号.addEventListener('abort', 中止, { once: true })
  })
}
module.exports = { 检查任务, 等待有界 }
