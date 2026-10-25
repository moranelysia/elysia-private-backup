/** S-12A：仅读取显式隔离清单，不加载脑/配置或任何业务模块，不创建目录。 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const 源码根 = path.resolve(__dirname, '..')
const 路径字段 = ['工作区', '角色卡', '数据目录', '缓存目录', '学习区', '附件目录', '纸条目录', '进度文件']
const 环境字段 = { ELYSIA_WORKSPACE_ROOT: '工作区', ELYSIA_CONFIG_FILE: '配置文件', ELYSIA_PERSONA_PATH: '角色卡', ELYSIA_DATA_DIR: '数据目录', ELYSIA_CACHE_DIR: '缓存目录', ELYSIA_学习区: '学习区', ELYSIA_附件目录: '附件目录', ELYSIA_纸条目录: '纸条目录', ELYSIA_进度文件: '进度文件' }
function 拒绝(码) { throw new Error(码) }
function 同路径(甲, 乙) { return process.platform === 'win32' ? 甲.toLowerCase() === 乙.toLowerCase() : 甲 === 乙 }
function 在内(根, 目标) { const 相对 = path.relative(根, 目标); return 相对 === '' || (!path.isAbsolute(相对) && 相对 !== '..' && !相对.startsWith('..' + path.sep)) }
function 绝对路径(值) {
  if (typeof 值 !== 'string' || !值 || 值.length > 4096 || !path.isAbsolute(值) || /[\u0000-\u001f]/u.test(值) || /^[\\/]{2}/u.test(值) || (process.platform === 'win32' && /[:]/u.test(值.slice(2)))) 拒绝('HEADLESS_PATH_INVALID')
  const 规范 = path.resolve(值)
  if (process.platform === 'win32' && 规范.slice(path.parse(规范).root.length).split(path.sep).some((段) => /[. ]$/u.test(段) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(段))) 拒绝('HEADLESS_PATH_INVALID')
  return 规范
}
function 实际路径(值) {
  let 当前 = 值
  const 尾部 = []
  while (!fs.existsSync(当前)) {
    const 上级 = path.dirname(当前)
    if (上级 === 当前) 拒绝('HEADLESS_PATH_INVALID')
    尾部.unshift(path.basename(当前)); 当前 = 上级
  }
  return path.join(fs.realpathSync(当前), ...尾部)
}
function 精确字段(值, 字段) {
  if (!值 || Object.getPrototypeOf(值) !== Object.prototype || Object.keys(值).length !== 字段.length || 字段.some((键) => !Object.hasOwn(值, 键))) 拒绝('HEADLESS_CONFIG_INVALID')
}
function 读JSON(文件, 上限) {
  const 状态 = fs.lstatSync(文件)
  if (!状态.isFile() || 状态.isSymbolicLink() || 状态.size > 上限) 拒绝('HEADLESS_CONFIG_INVALID')
  return JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/u, ''))
}
function 读取配置(文件, { 环境 = process.env } = {}, 模式 = 'health') {
  try {
    const 清单路径 = 绝对路径(文件)
    if (path.basename(清单路径) !== 'headless.config.json') 拒绝('HEADLESS_CONFIG_INVALID')
    const 父目录 = path.dirname(源码根)
    const 保护候选 = [源码根, path.resolve(父目录, '..', '爱莉希雅-副本')]
    // 识别本机工作区结构，不能把独立部署源码的普通父目录（例如/）全部保护。
    if (fs.existsSync(path.join(父目录, 'start-all.cmd')) || fs.existsSync(path.join(父目录, 'elysia.config.json'))) 保护候选.push(父目录)
    const 保护目录 = 保护候选.map(实际路径)
    const 配置实际 = 实际路径(清单路径)
    if (保护目录.some((根) => 在内(根, 配置实际))) 拒绝('HEADLESS_PROTECTED_PATH')
    const 清单 = 读JSON(清单路径, 16384)
    精确字段(清单, ['版本', '模式', '隔离根', ...路径字段])
    if (清单.版本 !== 1 || 清单.模式 !== 模式) 拒绝('HEADLESS_CONFIG_INVALID')
    const 声明根 = 绝对路径(清单.隔离根)
    if (!fs.lstatSync(声明根).isDirectory() || fs.lstatSync(声明根).isSymbolicLink()) 拒绝('HEADLESS_PATH_LINK')
    const 根 = fs.realpathSync(声明根)
    if (保护目录.some((一) => 在内(一, 根) || 在内(根, 一))) 拒绝('HEADLESS_PROTECTED_PATH')
    function 检查路径(值) {
      const 目标 = 绝对路径(值)
      if (!在内(声明根, 目标)) 拒绝('HEADLESS_PATH_OUTSIDE')
      let 当前 = 声明根
      for (const 段 of path.relative(声明根, 目标).split(path.sep).filter(Boolean)) {
        当前 = path.join(当前, 段)
        try { if (fs.lstatSync(当前).isSymbolicLink()) 拒绝('HEADLESS_PATH_LINK') } catch (错) { if (错.code !== 'ENOENT') throw 错 }
      }
      const 实际 = 实际路径(目标)
      if (!在内(根, 实际) || 保护目录.some((一) => 在内(一, 实际))) 拒绝('HEADLESS_PATH_OUTSIDE')
      return 实际
    }
    const 标记路径 = 检查路径(path.join(声明根, '.elysia-isolated-root.json'))
    const 标记 = 读JSON(标记路径, 1024)
    精确字段(标记, ['版本', '用途'])
    if (标记.版本 !== 1 || 标记.用途 !== 'headless-test') 拒绝('HEADLESS_ROOT_UNMARKED')
    const 结果 = { 版本: 1, 模式, 隔离根: 根, 配置文件: 检查路径(清单路径) }
    for (const 字段 of 路径字段) 结果[字段] = 检查路径(清单[字段])
    for (const 字段 of ['工作区', '数据目录', '缓存目录', '学习区', '附件目录', '纸条目录']) {
      if (fs.existsSync(结果[字段]) && !fs.statSync(结果[字段]).isDirectory()) 拒绝('HEADLESS_PATH_TYPE')
    }
    for (const 字段 of ['角色卡', '进度文件']) {
      if (同路径(结果[字段], 根) || (fs.existsSync(结果[字段]) && !fs.statSync(结果[字段]).isFile())) 拒绝('HEADLESS_PATH_TYPE')
    }
    const 写入根 = ['数据目录', '缓存目录', '学习区'].map((一) => 结果[一])
    if (写入根.some((一) => 同路径(一, 根)) || 写入根.some((一, i) => 写入根.some((二, j) => i !== j && (在内(一, 二) || 在内(二, 一))))) 拒绝('HEADLESS_LAYOUT_INVALID')
    if (!在内(结果.数据目录, 结果.附件目录) || !在内(结果.缓存目录, 结果.纸条目录) || !在内(结果.学习区, 结果.进度文件)) 拒绝('HEADLESS_LAYOUT_INVALID')
    if (写入根.some((一) => 在内(一, 结果.配置文件) || 在内(一, 结果.角色卡)) || 同路径(结果.配置文件, 结果.角色卡) || 同路径(标记路径, 结果.角色卡)) 拒绝('HEADLESS_LAYOUT_INVALID')
    for (const [变量, 字段] of Object.entries(环境字段)) {
      if (环境[变量] && !同路径(检查路径(环境[变量]), 结果[字段])) 拒绝('HEADLESS_ENV_CONFLICT')
    }
    if (环境.ELYSIA_USER_DATA_ROOT || (环境.ELYSIA_USE_USER_DATA && 环境.ELYSIA_USE_USER_DATA !== '0')) 拒绝('HEADLESS_ENV_CONFLICT')
    return Object.freeze(结果)
  } catch (错) {
    const 代码 = typeof 错?.message === 'string' && /^HEADLESS_[A-Z_]+$/u.test(错.message) ? 错.message : 'HEADLESS_CONFIG_UNAVAILABLE'
    throw new Error(代码)
  }
}
module.exports = {
  读取健康配置: (文件, 选项) => 读取配置(文件, 选项, 'health'),
  读取假对话配置: (文件, 选项) => 读取配置(文件, 选项, 'fake-chat'),
  读取真实对话配置: (文件, 选项) => 读取配置(文件, 选项, 'real-chat'),
}
