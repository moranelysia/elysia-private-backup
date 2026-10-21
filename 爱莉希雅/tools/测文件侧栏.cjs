/**
 * 测文件侧栏.cjs —— 桌面权限与产物预览的本地测试，不发模型请求。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 测试根 = path.join(项目根, '_测试', '文件侧栏')
const 假桌面 = path.join(测试根, 'Desktop')
const 禁止区 = path.join(测试根, '.cache')

let 总数 = 0
let 通过 = 0
function 检查(名字, 条件) {
  总数++
  if (条件) {
    通过++
    console.log('  ✓ ' + 名字)
  } else {
    console.log('  ✗ ' + 名字)
  }
}

fs.rmSync(测试根, { recursive: true, force: true })
fs.mkdirSync(假桌面, { recursive: true })
fs.mkdirSync(禁止区, { recursive: true })

const 文本 = path.join(假桌面, '她写的.md')
const 图片 = path.join(假桌面, '她画的.png')
const 二进制 = path.join(假桌面, '结果.bin')
const 越界 = path.join(禁止区, '不能看.txt')
fs.writeFileSync(文本, '# 结果\n可以直接预览。', 'utf8')
fs.writeFileSync(
  图片,
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64'),
)
fs.writeFileSync(二进制, Buffer.from([0, 1, 2, 3]))
fs.writeFileSync(越界, '越界', 'utf8')

const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))
路径安全.注册({ 项目根, 工作区根: path.dirname(项目根), 桌面目录: 假桌面 })
路径安全.设工作区(null)
const 产物 = require(path.join(项目根, '脑', '产物.cjs'))
const 文件工具 = require(path.join(项目根, '脑', '工具', '文件工具.cjs'))
文件工具.注册({ 项目根, 工作区根: path.dirname(项目根) })

检查('桌面在读白名单', 路径安全.查(文本, '读').好 === true)
检查('桌面在写白名单', 路径安全.查(path.join(假桌面, 'new.md'), '写', { 要新建: true }).好 === true)
检查('桌面新建仍需确认', 路径安全.要问他吗(path.join(假桌面, 'new.md')) === true)
const 交付结果 = 文件工具.交付(文本)
检查('交付工具验明文件并返回绝对路径', 交付结果.好 && 交付结果.路径 === 文本)

const 清单 = 产物.整理名单([文本, 文本, 'Z:\\肯定不存在.txt', 越界, 图片])
检查('名单去重并滤掉无权或不存在的路径', 清单.length === 2)
检查('名单保留输入顺序', 清单[0] && 清单[0].路径 === 文本)

const 文本预览 = 产物.预览(文本)
检查('文本可以内嵌预览', 文本预览.好 && 文本预览.类型 === '文本')
检查('文本内容原样返回', 文本预览.内容 === '# 结果\n可以直接预览。')

const 图片预览 = 产物.预览(图片)
检查('图片可以内嵌预览', 图片预览.好 && 图片预览.类型 === '图片')
检查('图片只返回 data URL', /^data:image\/png;base64,/.test(图片预览.dataUrl || ''))

const 二进制预览 = 产物.预览(二进制)
检查('未知格式不硬读', 二进制预览.好 && 二进制预览.类型 === '不能内嵌')
检查('越界路径不能借侧栏读取', 产物.预览(越界).好 === false)

const 提取 = 产物.从工具结果提取([
  { 名字: '读', 结果: { 好: true, 路径: 文本 } },
  { 名字: '写', 结果: { 好: true, 路径: 文本 } },
  { 工具: { 名字: '交付' }, 结果: { 好: true, 路径: 图片 } },
  { 工具: { 名字: '写' }, 结果: { 好: false, 路径: 二进制 } },
  { 工具: { 名字: '写' }, 结果: { 好: true, 路径: 二进制, 目标完成: '否' } },
])
检查('登记成功写出和明确交付的文件', 提取.length === 2 && 提取[0] === 文本 && 提取[1] === 图片)
检查('写后核对不符的文件不进入产物栏', !提取.includes(二进制))

fs.rmSync(测试根, { recursive: true, force: true })
console.log('')
console.log(`  ${通过} / ${总数} ${通过 === 总数 ? '✓' : '✗'}`)
if (通过 !== 总数) process.exitCode = 1
