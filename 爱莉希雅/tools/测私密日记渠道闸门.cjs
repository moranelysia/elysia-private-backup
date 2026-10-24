/** M-34：只用内存假渠道验证 private 不进入任何外发路径。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { 创建日记外发闸门, 构建共享外发载荷, 共享外发记录 } = require('../脑/日记外发闸门.cjs')

const 私密标记 = 'PRIVATE-SENTINEL-不要外发'
let 总数 = 0
let 通过 = 0

function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}
function 字(值) { return JSON.stringify(值) }
function 共享日记(可见性 = 'shared') {
  const 值 = {
    格式版本: 1, 编号: '日:2026-10-20', 类型: '日', 周期: '2026-10-20', 可见性,
    标题: '一起做完的事', 开始: '2026-10-20T00:00:00.000Z', 结束: '2026-10-21T00:00:00.000Z',
    模块: [{ 名字: '陪伴片段', 正文: '今天一起把步骤理顺了。', 来源: ['聊天:shared-1'] }],
    来源: [{ 编号: '聊天:shared-1', 类型: '聊天', 时间: '2026-10-20 21:00', 标题: '一起整理', 摘要: '用户和爱莉希雅整理了步骤。' }],
    生成于: '2026-10-21T01:00:00.000Z', 修改于: '', 用户修改: false,
    额外内部字段: '必须被白名单移除',
  }
  if (可见性 === undefined) delete 值.可见性
  return 值
}
function 私密日记() {
  return {
    格式版本: 1, 编号: `私密日:${私密标记}`, 类型: '日', 周期: '2026-10-20', 可见性: 'private',
    标题: 私密标记, 模块: [{ 名字: '陪伴片段', 正文: 私密标记, 来源: [`聊天:${私密标记}`] }],
    来源: [{ 编号: `聊天:${私密标记}`, 类型: '聊天', 时间: 私密标记, 标题: 私密标记, 摘要: 私密标记 }],
    生成于: 私密标记,
  }
}

async function main() {
  const 共享 = 共享日记()
  const 私密 = 私密日记()
  const 纯载荷 = 构建共享外发载荷({ 渠道: 'fake-local', 日记们: [共享, 私密] })
  检查('混合输入只形成一条 shared 载荷', 纯载荷.日记.length === 1 && 纯载荷.日记[0].编号 === 共享.编号)
  检查('private 标题正文来源和编号都不进入载荷', !字(纯载荷).includes(私密标记) && !字(纯载荷).includes('私密日:'))
  检查('shared 也经过字段白名单而非整对象透传', !('额外内部字段' in 纯载荷.日记[0]) && 字(纯载荷).includes('今天一起把步骤理顺了'))
  检查('旧日记缺失可见性时仍按 shared 只读兼容', !!共享外发记录(共享日记(undefined)))
  检查('private-only 不会形成外发载荷', 构建共享外发载荷({ 渠道: 'fake-local', 日记们: [私密] }) === null)

  const 成功记录 = { 发送: [], 日志: [], 重试: [], 离线: [] }
  const 成功闸门 = 创建日记外发闸门({
    发送: async (载荷) => 成功记录.发送.push(载荷),
    写日志: async (日志) => 成功记录.日志.push(日志),
    写失败重试: async (任务) => 成功记录.重试.push(任务),
    写离线队列: async (任务) => 成功记录.离线.push(任务),
  })
  const 成功 = await 成功闸门.外发({ 渠道: 'fake-local', 日记们: [私密, 共享] })
  检查('在线成功只调用一次假发送器', 成功.好 && 成功.状态 === '已发送' && 成功记录.发送.length === 1)
  检查('成功发送载荷没有 private', !字(成功记录.发送).includes(私密标记))
  检查('成功日志只含固定元数据且没有日记正文', 成功记录.日志.length === 1 && !字(成功记录.日志).includes(私密标记) && !字(成功记录.日志).includes('步骤理顺'))
  检查('成功路径不写失败重试或离线队列', 成功记录.重试.length === 0 && 成功记录.离线.length === 0)

  const 静默记录 = { 次数: 0, 内容: [] }
  const 静默闸门 = 创建日记外发闸门({
    发送: async (一) => { 静默记录.次数++; 静默记录.内容.push(一) },
    写日志: async (一) => { 静默记录.次数++; 静默记录.内容.push(一) },
    写失败重试: async (一) => { 静默记录.次数++; 静默记录.内容.push(一) },
    写离线队列: async (一) => { 静默记录.次数++; 静默记录.内容.push(一) },
  })
  const 静默 = await 静默闸门.外发({ 渠道: 'fake-local', 日记们: [私密] })
  检查('private-only 返回无共享日记', 静默.好 && 静默.状态 === '无共享日记' && 静默.条数 === 0)
  检查('private-only 不调用发送日志重试或离线回调', 静默记录.次数 === 0 && 静默记录.内容.length === 0)

  const 失败记录 = { 日志: [], 重试: [] }
  const 失败闸门 = 创建日记外发闸门({
    发送: async () => { throw new Error(`渠道原始错误 ${私密标记}`) },
    写日志: async (一) => 失败记录.日志.push(一),
    写失败重试: async (一) => 失败记录.重试.push(一),
  })
  const 失败 = await 失败闸门.外发({ 渠道: 'fake-local', 日记们: [私密, 共享] })
  检查('发送失败只返回固定错误代码而不返回原始异常', !失败.好 && 失败.错误代码 === 'CHANNEL_SEND_FAILED' && !字(失败).includes(私密标记))
  检查('失败重试只保存 shared 白名单载荷', 失败记录.重试.length === 1 && !字(失败记录.重试).includes(私密标记) && 字(失败记录.重试).includes(共享.编号))
  检查('失败日志不保存异常文字或日记正文', 失败记录.日志.length === 1 && !字(失败记录.日志).includes(私密标记) && !字(失败记录.日志).includes('步骤理顺'))

  const 离线记录 = { 队列: [], 日志: [] }
  const 离线闸门 = 创建日记外发闸门({
    写离线队列: async (一) => 离线记录.队列.push(一),
    写日志: async (一) => 离线记录.日志.push(一),
  })
  const 离线 = await 离线闸门.外发({ 渠道: 'fake-local', 日记们: [私密, 共享], 在线: false })
  检查('离线时不发送而只进入队列', 离线.好 && 离线.状态 === '已排队' && 离线记录.队列.length === 1)
  检查('离线队列和日志都没有 private', !字(离线记录).includes(私密标记))

  const 队列失败日志 = []
  const 队列失败 = await 创建日记外发闸门({
    写离线队列: async () => { throw new Error(`磁盘异常 ${私密标记}`) },
    写日志: async (一) => 队列失败日志.push(一),
  }).外发({ 渠道: 'fake-local', 日记们: [私密, 共享], 在线: false })
  检查('离线队列失败也只返回固定错误', 队列失败.错误代码 === 'OFFLINE_QUEUE_FAILED' && !字(队列失败).includes(私密标记))
  检查('离线队列失败日志不泄露回调异常', !字(队列失败日志).includes(私密标记))

  const 无发送器 = await 创建日记外发闸门().外发({ 渠道: 'fake-local', 日记们: [共享] })
  检查('缺少发送器时明确失败且不伪报已保存重试', 无发送器.错误代码 === 'CHANNEL_UNAVAILABLE' && 无发送器.已保存重试 === false)
  const 无离线队列 = await 创建日记外发闸门().外发({ 渠道: 'fake-local', 日记们: [共享], 在线: false })
  检查('缺少离线队列时明确失败而不伪报排队成功', 无离线队列.错误代码 === 'OFFLINE_QUEUE_UNAVAILABLE')

  let 非法发送次数 = 0
  const 非法日志 = []
  const 非法 = await 创建日记外发闸门({
    发送: async () => { 非法发送次数++ },
    写日志: async (一) => 非法日志.push(一),
  }).外发({ 渠道: 'fake-local', 日记们: [{ ...共享, 可见性: `private-${私密标记}` }] })
  检查('非法可见性失败关闭且不调用发送器', 非法.错误代码 === 'DIARY_GATE_REJECTED' && 非法发送次数 === 0)
  检查('非法记录内容不进入拒绝日志', !字(非法日志).includes(私密标记) && !字(非法日志).includes(共享.标题))

  const 原共享 = 共享日记()
  const 捕获 = []
  await 创建日记外发闸门({ 发送: async (一) => 捕获.push(一) }).外发({ 渠道: 'fake-local', 日记们: [原共享] })
  原共享.模块[0].正文 = 私密标记
  检查('回调拿到的是独立白名单快照', !字(捕获).includes(私密标记))

  let 坏渠道调用 = 0
  const 坏渠道 = await 创建日记外发闸门({ 发送: async () => { 坏渠道调用++ } }).外发({ 渠道: `fake\n${私密标记}`, 日记们: [共享] })
  检查('渠道名注入会在外发前被拒绝', 坏渠道.错误代码 === 'DIARY_GATE_REJECTED' && 坏渠道调用 === 0)
  const 超量 = await 创建日记外发闸门({ 发送: async () => {} }).外发({ 渠道: 'fake-local', 日记们: Array(201).fill(共享) })
  检查('超量批次会在外发前被拒绝', 超量.错误代码 === 'DIARY_GATE_REJECTED')

  const 主 = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8')
  const 日记源码 = fs.readFileSync(path.join(__dirname, '..', '脑', '记忆日记.cjs'), 'utf8')
  检查('默认 Markdown 导出仍强制经过 shared 投影', /导出Markdown[\s\S]*共享日记投影\(读日记文件/.test(日记源码))
  检查('主进程和预载没有新增 private 导出接口', !主.includes('导出私密') && !预载.includes('导出私密'))
  检查('M-34 没有提前接入真实渠道或账号', !主.includes('日记外发闸门.cjs') && !预载.includes('发送私密日记'))

  console.log(`\n私密日记渠道闸门：${通过}/${总数} 通过`)
}

main().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 })
