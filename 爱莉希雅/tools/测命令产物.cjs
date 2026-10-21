'use strict'

/**
 * T2：命令退出码为 0 不能单独证明产物完成。
 * 测试只在 F:\elysia\_测试 下生成小文本文件，结束后清理。
 */
const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.dirname(项目根)
const 测试目录 = path.join(工作区根, '_测试', '命令产物')
const 命令工具 = require(path.join(项目根, '脑', '工具', '命令工具.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (!条件) throw new Error('✗ ' + 说明 + (细节 ? '：' + 细节 : ''))
  通过++
  console.log('✓ ' + 说明)
}

function 准备() {
  const 绝对 = path.resolve(测试目录)
  const 测试根 = path.resolve(工作区根, '_测试') + path.sep
  if (!绝对.startsWith(测试根)) throw new Error('拒绝清理非测试目录：' + 绝对)
  fs.rmSync(绝对, { recursive: true, force: true })
  fs.mkdirSync(绝对, { recursive: true })
  路径安全.注册({ 项目根, 工作区根 })
  路径安全.设工作区(绝对)
  命令工具.注册({ 项目根, 工作区根, 干活目录: 绝对 })
}

async function 主() {
  准备()
  const 点头记录 = []
  const 点头 = async (请求) => {
    点头记录.push(请求)
    return true
  }

  try {
    const 拆 = 命令工具.拆产物声明('node make.js ::产物:: 报告.docx | 图.png')
    检查('能拆出真实命令', 拆.好 && 拆.命令 === 'node make.js')
    检查('多个产物用竖线分隔', 拆.产物参数.length === 2 && 拆.产物参数[1] === '图.png')
    检查('重复声明分隔符会拒绝', !命令工具.拆产物声明('echo x ::产物:: a ::产物:: b').好)

    const 普通 = await 命令工具.跑('echo ok', { 问: 点头 })
    检查('未声明产物的普通命令仍能运行', 普通.好 && 普通.退出码 === 0)
    检查('未声明产物只证明执行成功', 普通.验证状态 === '部分验证' && 普通.目标完成 === '未知')

    const 新建 = await 命令工具.跑(
      'echo fresh>fresh.txt ::产物:: fresh.txt',
      { 问: 点头 },
    )
    检查('新建产物通过本轮验证', 新建.好 && 新建.验证状态 === '已验证' && 新建.目标完成 === '是')
    检查('产物证据含绝对路径、大小和本轮新建', 新建.证据.some((一) => 一.类型 === '命令产物' && path.isAbsolute(一.目标) && /本轮新建.*字节/.test(一.说明)))
    检查('确认卡只展示真实命令，不把声明交给 cmd', 点头记录.at(-1).命令.includes('fresh.txt') && !点头记录.at(-1).命令.includes('::产物::'))
    检查('确认卡同时带待核对产物', 点头记录.at(-1).产物们[0] === path.join(测试目录, 'fresh.txt'))

    const 缺失 = await 命令工具.跑('ver>nul ::产物:: missing.txt', { 问: 点头 })
    检查('退出码零但产物缺失不算完成', 缺失.好 && 缺失.验证状态 === '未验证' && 缺失.目标完成 === '否')
    检查('缺失原因会明确回给模型', /文件不存在|不能据此说目标已经完成/.test(缺失.内容))

    fs.writeFileSync(path.join(测试目录, 'stale.txt'), 'old', 'utf8')
    const 陈旧 = await 命令工具.跑('ver>nul ::产物:: stale.txt', { 问: 点头 })
    检查('命令前已有且未变化的旧文件不能冒充新产物', 陈旧.目标完成 === '否' && /原本就存在/.test(陈旧.内容))

    const 更新 = await 命令工具.跑(
      'echo changed>>stale.txt ::产物:: stale.txt',
      { 问: 点头 },
    )
    检查('本轮确实更新已有文件可以通过', 更新.验证状态 === '已验证' && 更新.目标完成 === '是')

    const 部分 = await 命令工具.跑(
      'echo 1>one.txt ::产物:: one.txt | two.txt',
      { 问: 点头 },
    )
    检查('多个声明只完成一部分时标为部分', 部分.验证状态 === '部分验证' && 部分.目标完成 === '部分')

    const 失败 = await 命令工具.跑(
      'echo x>failed.txt & exit /b 7 ::产物:: failed.txt',
      { 问: 点头 },
    )
    检查('命令非零退出即使留下文件也不算完成', !失败.好 && 失败.目标完成 === '否')

    const 问之前 = 点头记录.length
    const 越界 = await 命令工具.跑('echo x ::产物:: C:\\Windows\\elysia-test.txt', { 问: 点头 })
    检查('越界产物声明在询问和执行前被拒绝', !越界.好 && 点头记录.length === 问之前)

    const 工具说明 = fs.readFileSync(path.join(项目根, '脑', '工具表.cjs'), 'utf8')
    检查('模型提示包含产物声明格式和完成边界', 工具说明.includes('::产物:: 报告.docx') && 工具说明.includes('不能单独证明整个任务完成'))
  } finally {
    路径安全.设工作区(null)
    const 绝对 = path.resolve(测试目录)
    const 测试根 = path.resolve(工作区根, '_测试') + path.sep
    if (绝对.startsWith(测试根)) fs.rmSync(绝对, { recursive: true, force: true })
  }

  console.log(`\n命令产物：${通过}/${总数} 通过`)
}

主().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
