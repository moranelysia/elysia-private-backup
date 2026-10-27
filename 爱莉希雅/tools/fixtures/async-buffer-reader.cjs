'use strict'
const { createHash } = require('node:crypto')
const { 启动隔离存储Worker } = require('../../storage/sqlite-worker.cjs')
const { 创建异步后台缓冲 } = require('../../core/异步后台缓冲.cjs')
;(async () => {
  const a = await 启动隔离存储Worker({ 用途: 'synthetic-sqlite-disk', 目录: process.argv[2] })
  try { const b = await 创建异步后台缓冲(a), x = await b.读取(); process.stdout.write(JSON.stringify({ 版本: x.版本, 数量: x.数据.轮次.length, 指纹: createHash('sha256').update(JSON.stringify(x.数据)).digest('hex') })) } finally { await a.关闭() }
})().catch(() => { process.stderr.write('BUFFER_READER_FAILED'); process.exitCode = 1 })
