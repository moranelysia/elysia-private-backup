/** 手动生成只读时间线关系候选；只写缓存报告，不写关系图或原始记忆。 */
'use strict'

const 时间线候选 = require('../脑/记忆时间线候选.cjs')

try {
  const 结果 = 时间线候选.生成并保存()
  console.log(`已生成只读时间线：确定 ${结果.报告.已确定数量} 条，时间未确定 ${结果.报告.未确定数量} 条。`)
  console.log(`关系候选 ${结果.报告.关系候选数量} 条，输出：${结果.输出文件}`)
  console.log('未创建关系图，未接入聊天召回，原始记忆未修改。')
} catch (错误) {
  console.error('生成时间线候选失败：' + 错误.message)
  process.exitCode = 1
}
