/** 虚构盘库的独立进程读回，只输出哈希。 */
'use strict'
const { createHash } = require('node:crypto')
const { 启动隔离存储Worker } = require('../../storage/sqlite-worker.cjs')
const { 创建异步仓储门面 } = require('../../storage/sqlite-async-facade.cjs')
;(async () => {
  const actor = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: process.argv[2] })
  try {
    const f = 创建异步仓储门面(actor), result = []
    for (const [kind, id] of [['relations', 'main'], ['relation-layout', 'main'], ['extraction-buffer', 'main'], ['usage', 'headless'], ['channel-map', 'fake'], ['channel-tasks', 'fake']]) {
      const b = await f.状态.打开后端(kind, id); result.push(await b.读取快照()); await b.关闭()
    }
    process.stdout.write(JSON.stringify({ 好: true, 指纹: createHash('sha256').update(JSON.stringify(result)).digest('hex') }))
  } finally { await actor.关闭() }
})().catch(() => { process.stderr.write('STATE_READER_FAILED'); process.exitCode = 1 })
