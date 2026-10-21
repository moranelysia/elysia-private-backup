'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * 用 Electron safeStorage 保存一段秘密。
 *
 * 这个模块不直接 require electron，测试时可以塞进一把假的“系统锁”；
 * 正式运行时 main.js 传入 Windows 的 safeStorage。
 */
function 创建密钥存储(密钥文件, safeStorage) {
  const 文件 = path.resolve(密钥文件)
  const 临时文件 = 文件 + '.tmp'

  async function 可用() {
    if (!safeStorage) return false
    try {
      if (typeof safeStorage.isAsyncEncryptionAvailable === 'function') {
        return Boolean(await safeStorage.isAsyncEncryptionAvailable())
      }
      return typeof safeStorage.isEncryptionAvailable === 'function'
        ? Boolean(safeStorage.isEncryptionAvailable())
        : false
    } catch {
      return false
    }
  }

  async function 加密(明文) {
    if (typeof safeStorage.encryptStringAsync === 'function') {
      return await safeStorage.encryptStringAsync(明文)
    }
    return safeStorage.encryptString(明文)
  }

  async function 解密(密文) {
    if (typeof safeStorage.decryptStringAsync === 'function') {
      const 结果 = await safeStorage.decryptStringAsync(密文)
      return typeof 结果 === 'string' ? 结果 : 结果.result
    }
    return safeStorage.decryptString(密文)
  }

  function 整理(原文) {
    const 值 = typeof 原文 === 'string' ? 原文.trim() : ''
    if (值.length < 20 || 值.length > 512 || /[\r\n\0]/.test(值)) {
      throw new Error('API Key 的格式不对')
    }
    return 值
  }

  async function 读取() {
    if (!fs.existsSync(文件)) return null
    if (!(await 可用())) throw new Error('这台电脑暂时不能使用 Windows 加密存储')
    const 密文 = fs.readFileSync(文件)
    if (!密文.length) throw new Error('加密凭据文件是空的')
    return 整理(await 解密(密文))
  }

  async function 保存(原文) {
    const 值 = 整理(原文)
    if (!(await 可用())) throw new Error('这台电脑暂时不能使用 Windows 加密存储')
    const 密文 = await 加密(值)
    if (!Buffer.isBuffer(密文) || !密文.length) throw new Error('Windows 没有返回有效的加密结果')

    fs.mkdirSync(path.dirname(文件), { recursive: true })
    try {
      fs.writeFileSync(临时文件, 密文)
      fs.renameSync(临时文件, 文件)
    } catch (错误) {
      try {
        fs.rmSync(临时文件, { force: true })
      } catch {
        /* 清理失败不盖住原来的错误 */
      }
      throw 错误
    }
    return true
  }

  function 清除() {
    fs.rmSync(文件, { force: true })
    try {
      fs.rmSync(临时文件, { force: true })
    } catch {
      /* 没有临时文件很正常 */
    }
    return true
  }

  return {
    密钥文件: 文件,
    可用,
    已保存: () => fs.existsSync(文件),
    读取,
    保存,
    清除,
  }
}

module.exports = { 创建密钥存储 }
