/**
 * make-ico.cjs —— 纯英文名的小入口，只做一件事：重画 icon.ico
 *
 * 【为什么要有这个文件（其实是被逼的）】
 *   画图标的代码在 tools\画图标.cjs 里，那个文件名是中文。
 *   而 .cmd 里只要出现**任何一个**非 ASCII 字节，哪怕是在
 *   `node "tools\画图标.cjs"` 这么普通的一行里，cmd 都会解错 ——
 *   实测报的是：
 *
 *     Error: Cannot find module 'D:\新建文件夹\爱莉希雅\"'
 *
 *   那行被从中间截断了，路径只剩到引号前面。所以 .cmd 里
 *   **不能出现中文文件名**，一个字都不行。
 *
 *   办法：这儿放一个纯英文名的文件替它挨这一下。
 *   .cmd 里写 `node "tools\make-ico.cjs"` —— 全 ASCII，稳。
 *
 * 用法: node tools\make-ico.cjs
 */
'use strict'

const path = require('node:path')
const fs = require('node:fs')

// 用 ASCII 的名字，去 require 那个中文名的模块 —— Node 读 UTF-8，没问题
const 画图标工具 = require(path.join(__dirname, '画图标.cjs'))

const 项目根 = path.resolve(__dirname, '..')
const ico路径 = path.join(项目根, 'icon.ico')

fs.writeFileSync(
  ico路径,
  画图标工具.做ICO([
    { 尺寸: 16, png: 画图标工具.画图标(16) },
    { 尺寸: 32, png: 画图标工具.画图标(32) },
    { 尺寸: 48, png: 画图标工具.画图标(48) },
    { 尺寸: 256, png: 画图标工具.画图标(256) },
  ]),
)

console.log('icon.ico rebuilt: ' + ico路径)
console.log('size: ' + fs.statSync(ico路径).size + ' bytes')
