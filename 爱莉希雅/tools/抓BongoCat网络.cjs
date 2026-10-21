/**
 * 抓BongoCat网络.cjs —— 监听 UDP 50001，看 Bongo Cat 往外发什么
 *
 * 为什么要抓：它的 config.json 里有网络设置，但"消息格式"没文档。
 * 与其猜，不如让它自己发出来给我们看。抓到格式之后，
 * 我们就能反过来给它发消息（让它显示打字动作）。
 *
 * 用法:
 *   node tools/抓BongoCat网络.cjs
 *
 * 然后：打开 Bongo Cat 的设置，把「网络」打开（is_sender 设成 true），
 *       随便按几个键，这个脚本就会把收到的内容打印出来。
 */
'use strict'

const dgram = require('node:dgram')

const 端口 = 50001
const 服务 = dgram.createSocket({ type: 'udp4', reuseAddr: true })

console.log('=== 监听 UDP ' + 端口 + ' ===')
console.log('等 Bongo Cat 发消息过来……')
console.log('')

let 收到几条 = 0

服务.on('message', (msg, 来源) => {
  收到几条++
  const 十六进制 = msg.toString('hex').match(/.{1,2}/g)?.join(' ') || ''
  const 文本 = msg.toString('utf8').replace(/[^\x20-\x7e]/g, '.')

  console.log(`[${收到几条}] 来自 ${来源.address}:${来源.port}   长度 ${msg.length}`)
  console.log(`     文本: ${JSON.stringify(文本)}`)
  console.log(`     十六进制: ${十六进制}`)
  console.log('')
})

服务.on('error', (err) => {
  console.log('出错: ' + err.message)
  if (err.code === 'EADDRINUSE') {
    console.log('  端口被占了 —— Bongo Cat 可能正在用这个端口当接收方。')
    console.log('  试试：把它的 is_sender 关掉（这样它就不会抢这个端口）')
  }
  process.exit(1)
})

服务.bind(端口, () => {
  console.log('✓ 已经开始监听（按 Ctrl+C 停止）')
  console.log('')
})
