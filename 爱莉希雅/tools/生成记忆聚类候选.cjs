/** 手动生成 P2 第二层聚类候选；不会接入聊天，也不会改原始记忆。 */
'use strict'

const 聚类候选 = require('../脑/记忆聚类候选.cjs')

try {
  const 结果 = 聚类候选.生成并保存()
  console.log(`已生成 ${结果.报告.候选数量} 组只读聚类候选。`)
  console.log(`输入 ${结果.报告.来源统计.可聚类条数} 条，输出：${结果.输出文件}`)
  if (!结果.报告.候选数量) console.log('当前没有达到严格阈值的三条以上相似记忆；原始记忆未改动。')
} catch (错误) {
  console.error('生成聚类候选失败：' + 错误.message)
  process.exitCode = 1
}
