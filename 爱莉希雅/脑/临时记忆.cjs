/** JSON临时记忆后端；状态规则共用临时记忆状态.cjs，现有公开接口不变。 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('./配置.cjs')
const 状态 = require('./临时记忆状态.cjs')
const { 数据版本, 固定分类, 默认保留天数, 正常重要性, 读取关系, 是对象, 记忆类型们 } = 状态

function 创建临时记忆库(选项 = {}) {
  const 数据目录 = path.resolve(选项.数据目录 || 配置.数据目录)
  const 文件 = path.resolve(选项.文件 || path.join(数据目录, '临时记忆.json'))

  function 空数据() {
    return { 版本: 数据版本, 记录: [] }
  }

  function 读数据() {
    let 原文
    try {
      原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '').trim()
    } catch (错误) {
      if (错误.code === 'ENOENT') return 空数据()
      throw new Error(`临时记忆文件读不动：${错误.message}`)
    }
    if (!原文) return 空数据()

    let 数据
    try {
      数据 = JSON.parse(原文)
    } catch (错误) {
      throw new Error(`临时记忆文件不是有效 JSON，已拒绝覆盖：${错误.message}`)
    }
    if (!是对象(数据) || 数据.版本 !== 数据版本 || !Array.isArray(数据.记录)) {
      throw new Error('临时记忆文件结构或版本不受支持，已拒绝覆盖')
    }
    return 数据
  }

  function 写数据(数据) {
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 临时 = 文件 + '.tmp'
    try {
      fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
      fs.renameSync(临时, 文件)
    } catch (错误) {
      try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
      throw 错误
    }
  }

  return 状态.创建临时记忆状态({ 文件, 读数据, 写数据, 现在: 选项.现在, 新编号: 选项.新编号 })
}

const 默认库 = 创建临时记忆库()
module.exports = { 创建临时记忆库, 固定分类, 记忆类型们, 默认保留天数, 正常重要性, 读取关系, ...默认库 }

