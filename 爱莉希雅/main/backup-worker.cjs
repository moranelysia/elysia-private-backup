'use strict'

const { parentPort, workerData } = require('node:worker_threads')
const { 创建用户备份 } = require('./user-backup.cjs')

try {
  parentPort.postMessage({ 好: true, 结果: 创建用户备份(workerData) })
} catch (错误) {
  parentPort.postMessage({ 好: false, 说明: 错误 && 错误.message ? 错误.message : String(错误) })
}
