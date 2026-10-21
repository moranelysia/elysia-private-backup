/**
 * 钥匙.cjs —— 找到"上模型"要用的 API Key
 *
 * 【为什么不把钥匙写死在代码里】
 *   一是写死了就会跟着代码被备份、被截图、被发出去；
 *   二是换钥匙就得改代码，麻烦。
 *   所以这里做的是"去找"：按顺序在几个地方翻，找到就用。
 *
 * 【找的顺序】
 *   1. 设置界面加密保存的钥匙          —— 安装版最正常的入口
 *   2. 项目自己的 脑\钥匙.txt         —— 开发时临时使用
 *   3. 环境变量 DEEPSEEK_API_KEY       —— 系统里设了就用系统的
 *   4. DSH 的凭证文件                  —— 兼容旧的本机配置
 *
 * 【第 3 条是临时的】
 *   那是 DSH 的钥匙，借用而已。哪天你想让这个软件彻底独立，
 *   就去 platform.deepseek.com 自己申请一个填进 脑\钥匙.txt，
 *   这个文件会被自动优先用上，DSH 那份就再也不碰了。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目钥匙 = path.resolve(__dirname, '钥匙.txt')
const DSH凭证 = path.join(os.homedir(), '.dsh', '.credentials.yaml')

/** 从 DSH 那个 yaml 里把 DEEPSEEK_API_KEY 抠出来 */
function 从DSH里找() {
  let 内容
  try {
    内容 = fs.readFileSync(DSH凭证, 'utf8')
  } catch {
    return null
  }

  // 定位到 refs: 段里那一行 DEEPSEEK_API_KEY:
  const 位置 = 内容.indexOf('DEEPSEEK_API_KEY')
  if (位置 < 0) return null

  // 从那一行往下看 8 行，找出第一个像钥匙的东西
  const 后面 = 内容.slice(位置).split('\n').slice(0, 8)
  const 长相 = /^(sk-)?[A-Za-z0-9_\-]{25,}$/

  for (const 行 of 后面) {
    const 冒号 = 行.indexOf(':')
    if (冒号 < 0) continue
    const 值 = 行.slice(冒号 + 1).trim().replace(/^["']|["']$/g, '')
    if (长相.test(值)) return 值
  }
  return null
}

/**
 * 拿到钥匙。
 * @returns {{钥匙: string|null, 来源: string}}
 */
function 拿钥匙() {
  // 1. 设置界面保存的。明文只在主进程内存里，落盘的是 Windows 加密密文。
  if (process.env.ELYSIA_SECURE_API_KEY && process.env.ELYSIA_SECURE_API_KEY.trim().length >= 20) {
    return { 钥匙: process.env.ELYSIA_SECURE_API_KEY.trim(), 来源: '设置界面（Windows 加密保存）' }
  }

  // 2. 项目自己的
  try {
    const 值 = fs.readFileSync(项目钥匙, 'utf8').trim()
    if (值.length >= 20) return { 钥匙: 值, 来源: '脑\\钥匙.txt（你自己的）' }
  } catch {
    /* 没有就没有 */
  }

  // 3. 环境变量
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length >= 20) {
    return { 钥匙: process.env.DEEPSEEK_API_KEY.trim(), 来源: '环境变量 DEEPSEEK_API_KEY' }
  }

  // 4. DSH 那份（兼容旧配置）
  const 借的 = 从DSH里找()
  if (借的) return { 钥匙: 借的, 来源: 'DSH 的凭证文件（暂时借用）' }

  return { 钥匙: null, 来源: '没找到' }
}

/** 只露头尾，用来打印，不泄露整把钥匙 */
function 遮住(钥匙) {
  if (!钥匙) return '(无)'
  if (钥匙.length <= 12) return '*'.repeat(钥匙.length)
  return 钥匙.slice(0, 6) + '…' + 钥匙.slice(-4)
}

module.exports = { 拿钥匙, 遮住, 项目钥匙, DSH凭证 }

if (require.main === module) {
  const { 钥匙, 来源 } = 拿钥匙()
  console.log('来源: ' + 来源)
  console.log('钥匙: ' + 遮住(钥匙) + '  （共 ' + (钥匙 ? 钥匙.length : 0) + ' 位）')
}
