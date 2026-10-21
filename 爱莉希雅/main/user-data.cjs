'use strict'

const fs = require('node:fs')
const path = require('node:path')

function 只在不存在时写(文件, 内容) {
  if (fs.existsSync(文件)) return false
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  fs.writeFileSync(文件, 内容, { encoding: 'utf8', flag: 'wx' })
  return true
}

/**
 * 初始化安装版的可写数据目录。
 * 已有文件永远不覆盖，因此升级和重装不会把用户记忆重置。
 */
function 准备用户数据({ 用户目录, 角色卡模板 }) {
  const 根 = path.resolve(用户目录)
  const 数据目录 = path.join(根, '记忆')
  const 缓存目录 = path.join(根, '缓存')
  const 学习区根 = path.join(根, '学习')
  const 角色卡路径 = path.join(根, 'elysia.cosplay.v2.json')
  const 聊天目录 = path.join(数据目录, '聊天记录')

  fs.mkdirSync(聊天目录, { recursive: true })
  fs.mkdirSync(缓存目录, { recursive: true })
  for (const 名 of ['材料', '笔记', '练习']) {
    fs.mkdirSync(path.join(学习区根, 名), { recursive: true })
  }

  let 新装 = false
  if (!fs.existsSync(角色卡路径)) {
    if (!角色卡模板 || !fs.existsSync(角色卡模板)) {
      throw new Error('找不到干净角色卡模板：' + String(角色卡模板 || '(未提供)'))
    }
    fs.copyFileSync(角色卡模板, 角色卡路径, fs.constants.COPYFILE_EXCL)
    新装 = true
  }

  for (const 名 of ['事实.json', '经历.json', '小本子.json']) {
    只在不存在时写(path.join(数据目录, 名), '[]\n')
  }
  只在不存在时写(path.join(聊天目录, '聊天记录.jsonl'), '')
  只在不存在时写(path.join(聊天目录, '对话索引.json'), '[]\n')

  return { 根, 数据目录, 缓存目录, 学习区根, 角色卡路径, 新装 }
}

/** 在加载任何“脑”模块前把安装版路径写进环境。 */
function 应用安装版路径(路径们) {
  process.env.ELYSIA_WORKSPACE_ROOT = 路径们.根
  process.env.ELYSIA_PERSONA_PATH = 路径们.角色卡路径
  process.env.ELYSIA_DATA_DIR = 路径们.数据目录
  process.env.ELYSIA_CACHE_DIR = 路径们.缓存目录
  process.env.ELYSIA_学习区 = 路径们.学习区根
}

module.exports = { 准备用户数据, 应用安装版路径 }
