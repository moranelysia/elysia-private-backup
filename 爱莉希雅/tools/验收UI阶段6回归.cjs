/** 阶段 6 UI 收口所需的离线业务回归；逐个运行，避免共享测试数据并发互相覆盖。 */
'use strict'

const path = require('node:path')
const { spawnSync } = require('node:child_process')

const 根 = path.resolve(__dirname, '..')
const 测试们 = [
  '测界面布局.cjs',
  '测多对话.cjs',
  '测临时对话.cjs',
  '测三种模式.cjs',
  '测按段模型.cjs',
  '测文件侧栏.cjs',
  '测工作索引.cjs',
  '测工作索引侧栏.cjs',
  '测工作失败重试.cjs',
  '测设置.cjs',
  '测搜索设置.cjs',
  '测工具记录.cjs',
  '测表达反馈.cjs',
  '测表达反馈接入.cjs',
  '测聊天搜索与只读工作.cjs',
  '测记忆查看.cjs',
  '测临时记忆界面.cjs',
  '测记忆日记.cjs',
  '测记忆关系图.cjs',
  '测记忆关系整理.cjs',
  '测长期记忆关系召回.cjs',
  '测账本.cjs',
  '测账本窗口.cjs',
  '测Live2D绑定.cjs',
  '测Live2D缩放.cjs',
]

const 开始 = Date.now()
for (const 文件 of 测试们) {
  const 结果 = spawnSync(process.execPath, [path.join(__dirname, 文件)], {
    cwd: 根,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    env: { ...process.env },
  })
  if (结果.error || 结果.status !== 0) {
    console.error(`✗ ${文件}`)
    if (结果.stdout) console.error(结果.stdout.trim())
    if (结果.stderr) console.error(结果.stderr.trim())
    if (结果.error) console.error(结果.error.stack || 结果.error.message)
    process.exit(结果.status || 1)
  }
  console.log(`✓ ${文件}`)
}

console.log(`✓ UI 阶段 6 离线业务回归：${测试们.length}/${测试们.length} 组通过，用时 ${((Date.now() - 开始) / 1000).toFixed(1)} 秒`)
