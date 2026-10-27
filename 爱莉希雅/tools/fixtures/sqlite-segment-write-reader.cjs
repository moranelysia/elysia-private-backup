'use strict'
const { createHash } = require('node:crypto')
const { 启动隔离存储Worker } = require('../../storage/sqlite-worker.cjs')
const { 创建异步仓储门面 } = require('../../storage/sqlite-async-facade.cjs')
;(async () => {
  const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: process.argv[2] })
  try { const f = 创建异步仓储门面(a), b = await f.状态.打开后端('background-state', 'relations'), x = await b.读取分段快照(); process.stdout.write(JSON.stringify({ 版本: x.版本, 指纹: createHash('sha256').update(JSON.stringify(x.数据)).digest('hex') })) } finally { await a.关闭() }
})().catch(() => { process.stderr.write('SEGMENT_READER_FAILED'); process.exitCode = 1 })
