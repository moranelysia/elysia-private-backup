/**
 * 配置.cjs —— 所有可迁移路径只在这里决定。
 *
 * 优先级：环境变量 > 工作区 elysia.config.json > 兼容旧目录结构的默认值。
 * 配置文件里的相对路径一律相对工作区，而不是相对进程当前目录。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 默认工作区 = path.resolve(项目根, '..')
const 工作区根 = path.resolve(process.env.ELYSIA_WORKSPACE_ROOT || 默认工作区)
const 配置文件 = path.resolve(
  process.env.ELYSIA_CONFIG_FILE || path.join(工作区根, 'elysia.config.json'),
)

function 读配置() {
  try {
    const 值 = JSON.parse(fs.readFileSync(配置文件, 'utf8').replace(/^\uFEFF/, ''))
    return 值 && typeof 值 === 'object' && !Array.isArray(值) ? 值 : {}
  } catch (错误) {
    if (错误.code !== 'ENOENT') console.log('⚠ 配置文件读不动：' + 错误.message)
    return {}
  }
}

const 文件配置 = 读配置()

function 路径值(环境变量, 字段, 默认值) {
  const 原值 = process.env[环境变量] || 文件配置[字段] || 默认值
  return path.resolve(工作区根, String(原值))
}

function 文本值(环境变量, 字段, 默认值) {
  const 原值 = process.env[环境变量] || 文件配置[字段]
  return 原值 === undefined || 原值 === null || 原值 === '' ? 默认值 : String(原值)
}

/** 只有明确的 true/1 才能打开高影响后台功能；其他值一律失败关闭。 */
function 布尔值(环境变量, 字段, 默认值 = false) {
  const 有环境值 = Object.prototype.hasOwnProperty.call(process.env, 环境变量)
  const 原值 = 有环境值 ? process.env[环境变量] : 文件配置[字段]
  if (原值 === undefined || 原值 === null || 原值 === '') return 默认值 === true
  return 原值 === true || 原值 === 1 || String(原值).trim().toLowerCase() === 'true' || String(原值).trim() === '1'
}

const 角色卡路径 = 路径值('ELYSIA_PERSONA_PATH', 'personaFile', 'elysia.cosplay.v2.json')
const 学习区根 = 路径值('ELYSIA_学习区', 'learningDir', '学习')
// 运行数据默认跟着程序目录走；即使程序文件夹改名，也不会跑到别处。
const 数据目录 = 路径值('ELYSIA_DATA_DIR', 'dataDir', path.join(项目根, '记忆'))
const 缓存目录 = 路径值('ELYSIA_CACHE_DIR', 'cacheDir', path.join(项目根, '.cache'))
const 私密日记自动生成 = 布尔值('ELYSIA_PRIVATE_DIARY_ENABLED', 'privateDiaryEnabled', false)
const 桌宠目录 = 路径值(
  'ELYSIA_PET_DIR',
  'petDir',
  path.join('zhuochong', 'A-爱莉-带表情版'),
)
const 语音转接层 = 文本值('ELYSIA_BRIDGE', 'voiceBridgeUrl', 'http://127.0.0.1:9881').replace(/\/+$/, '')
const ASR根 = 路径值(
  'ELYSIA_ASR_ROOT',
  'asrRoot',
  fs.existsSync('D:\\GPT-SoVITS') ? 'D:\\GPT-SoVITS' : path.join('tools', 'GPT-SoVITS'),
)
const ASR设备 = 文本值('ELYSIA_ASR_DEVICE', 'asrDevice', 'cpu')
const ASR提供者 = 文本值('ELYSIA_ASR_PROVIDER', 'asrProvider', 'sensevoice').toLowerCase()
/**
 * 联网搜索用哪个供应商。
 *   deepseek —— 默认，DeepSeek 原生 Search API，跟聊天共用同一把钥匙
 *   serpapi  —— 备用，需要单独的 SerpAPI Key（设置页那个输入框）
 * 以后要接别的搜索后端，在这里加一个值、在 脑\联网搜索.cjs 里补一个分支即可。
 * 改法：设置页里切换（会写进 elysia.config.json），或直接写
 * {"searchProvider":"serpapi"}，或设环境变量 ELYSIA_SEARCH_PROVIDER。
 *
 * 注意这是个**可运行时改**的值：设置页切换后要立刻生效，所以对外用 getter，
 * 而不是在模块加载时把字符串定死。
 */
let 搜索供应商值 = 文本值('ELYSIA_SEARCH_PROVIDER', 'searchProvider', 'deepseek').toLowerCase()
function 设搜索供应商(值) {
  搜索供应商值 = String(值 == null ? '' : 值).trim().toLowerCase() || 'deepseek'
  return 搜索供应商值
}
function 当前搜索供应商() {
  return 搜索供应商值
}
const SenseVoice根 = 路径值(
  'ELYSIA_SENSEVOICE_ROOT',
  'senseVoiceRoot',
  path.join(项目根, 'local-models', 'asr', 'sensevoice'),
)

const 出口 = {
  项目根,
  工作区根,
  配置文件,
  文件配置,
  角色卡路径,
  学习区根,
  数据目录,
  缓存目录,
  私密日记自动生成,
  桌宠目录,
  语音转接层,
  ASR根,
  ASR设备,
  ASR提供者,
  SenseVoice根,
  设搜索供应商,
  当前搜索供应商,
}
// 搜索供应商要能运行时改，所以对外是 getter，读的时候总是最新值
Object.defineProperty(出口, '搜索供应商', { get: 当前搜索供应商, enumerable: true })

module.exports = 出口
