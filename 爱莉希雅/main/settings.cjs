'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** 创建一个小型 JSON 设置存储。写入时先落到临时文件，再原子替换。 */
function 创建设置存储(设置文件) {
  const 文件 = path.resolve(设置文件)
  const 临时文件 = 文件 + '.tmp'

  function 读设置() {
    try {
      const 值 = JSON.parse(fs.readFileSync(文件, 'utf8'))
      return 值 && typeof 值 === 'object' && !Array.isArray(值) ? 值 : {}
    } catch {
      return {}
    }
  }

  function 写设置(改的) {
    try {
      const 新的 = { ...读设置(), ...(改的 || {}) }
      fs.mkdirSync(path.dirname(文件), { recursive: true })
      fs.writeFileSync(临时文件, JSON.stringify(新的, null, 2) + '\n', 'utf8')
      fs.renameSync(临时文件, 文件)
      return true
    } catch {
      try {
        fs.rmSync(临时文件, { force: true })
      } catch {
        /* 清理失败不影响主程序 */
      }
      return false
    }
  }

  return { 设置文件: 文件, 读设置, 写设置 }
}

module.exports = { 创建设置存储 }
