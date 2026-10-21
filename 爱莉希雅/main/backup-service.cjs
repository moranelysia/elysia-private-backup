'use strict'

const path = require('node:path')
const { Worker } = require('node:worker_threads')

/** 压缩可能要几秒甚至几分钟，放到工作线程，不能冻住聊天窗口和托盘。 */
function 在线程里创建备份(参数) {
  return new Promise((完成, 拒绝) => {
    const 工人 = new Worker(path.join(__dirname, 'backup-worker.cjs'), { workerData: 参数 })
    let 收到结果 = false

    工人.once('message', (消息) => {
      收到结果 = true
      if (消息 && 消息.好) 完成(消息.结果)
      else 拒绝(new Error((消息 && 消息.说明) || '备份线程没有返回结果'))
    })
    工人.once('error', (错误) => 拒绝(错误))
    工人.once('exit', (代码) => {
      if (!收到结果) 拒绝(new Error('备份线程没有返回结果（退出码 ' + 代码 + '）'))
    })
  })
}

module.exports = { 在线程里创建备份 }
