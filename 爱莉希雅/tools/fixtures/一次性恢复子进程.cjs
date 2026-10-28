'use strict'
const wt = require('node:worker_threads'), path = require('node:path')
const [dir, stage, skip] = process.argv.slice(2), NativeWorker = wt.Worker
class TestWorker extends NativeWorker {
  constructor(file, options) {
    super(file, { ...options, execArgv: ['--require', path.join(__dirname, 'sqlite-worker-fault.cjs')], env: { ...options.env, SQLITE_FIXTURE_FAULT: JSON.stringify({ stage, skip: Number(skip) }) } })
    const emit = this.emit
    this.emit = function (event, ...args) { if (event === 'message' && args[0]?.fixture === true) { if (args[0].kind === 'phase') process.send?.({ type:'phase', stage:args[0].stage }); return } return emit.call(this, event, ...args) }
  }
}
wt.Worker = TestWorker
const { 启动隔离存储Worker } = require('../../storage/sqlite-worker.cjs'), { 创建严格凭据, 创建真实模型连接 } = require('../../脑/模型连接.cjs'), { 创建隔离一次性真实发送 } = require('../../core/隔离一次性假发送.cjs')
;(async () => {
  const actor = await 启动隔离存储Worker({ 用途:'synthetic-turn-disk-v3', 目录:dir })
  const credential = 创建严格凭据({ 读取:()=>'fixture-key-only-1234567890' })
  const model = 创建真实模型连接({ 凭据:credential, fetch函数:async () => { process.send?.({ type:'fake-http' }); return new Response(JSON.stringify({ choices:[{finish_reason:'stop',message:{content:'跨进程虚构回复'}}],usage:{prompt_tokens:2,completion_tokens:1,total_tokens:3} }), {headers:{'content-type':'application/json'}}) } })
  const broker = 创建隔离一次性真实发送({ actor, 模型连接:model, 取现在:()=>new Date('2026-10-28T00:00:00.000Z') })
  await broker.要一轮({ 轮次键:'turn-process', 指纹:'a'.repeat(64), 模型:'deepseek-flash', 预期用量版本:0, 消息们:[{role:'user',content:'虚构消息'}] })
  process.send?.({ type:'unexpected-completion' }); await broker.关闭(); await actor.关闭(); process.exitCode=2
})().catch(e => { process.send?.({type:'error', code:e.message}); process.exitCode=1 })
