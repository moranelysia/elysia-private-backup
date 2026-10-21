'use strict'

const fs = require('node:fs')
const path = require('node:path')
const AdmZip = require('adm-zip')

function 是同一路径或在里面(候选, 根) {
  const a = path.resolve(候选)
  const b = path.resolve(根)
  const rel = path.relative(b, a)
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))
}

function 时间戳(现在 = new Date()) {
  const 补 = (数) => String(数).padStart(2, '0')
  return (
    `${现在.getFullYear()}${补(现在.getMonth() + 1)}${补(现在.getDate())}` +
    `-${补(现在.getHours())}${补(现在.getMinutes())}${补(现在.getSeconds())}`
  )
}

/**
 * 导出“用户自己产生的数据”。程序代码、缓存和加密 Key 都不进备份。
 * 目录里的符号链接 / junction 也跳过，避免顺着链接把别处整棵盘抄进去。
 */
function 创建用户备份({ 目标文件, 角色卡路径, 数据目录, 学习区根, 应用版本 = '', 现在 = new Date() }) {
  if (!目标文件) throw new Error('没有选择备份文件')

  const 目标 = path.resolve(目标文件)
  const 来源们 = [角色卡路径, 数据目录, 学习区根].filter(Boolean).map((值) => path.resolve(值))
  for (const 来源 of 来源们) {
    const 是文件 = fs.existsSync(来源) && fs.statSync(来源).isFile()
    const 会把自己包进去 = 是文件 ? 目标 === 来源 : 是同一路径或在里面(目标, 来源)
    if (会把自己包进去) throw new Error('备份文件不能放在要备份的数据目录里面')
  }

  const zip = new AdmZip()
  let 文件数 = 0
  let 原始字节 = 0
  let 跳过链接 = 0

  function 加文件(磁盘文件, 包内名字) {
    const 内容 = fs.readFileSync(磁盘文件)
    zip.addFile(包内名字.replace(/\\/g, '/'), 内容)
    文件数++
    原始字节 += 内容.length
  }

  function 加目录(磁盘目录, 包内目录) {
    if (!fs.existsSync(磁盘目录)) return
    const 项们 = fs.readdirSync(磁盘目录, { withFileTypes: true })
    if (!项们.length) zip.addFile((包内目录.replace(/\\/g, '/') + '/'), Buffer.alloc(0))

    for (const 项 of 项们) {
      const 源 = path.join(磁盘目录, 项.name)
      const 包内 = path.posix.join(包内目录.replace(/\\/g, '/'), 项.name)
      if (项.isSymbolicLink()) {
        跳过链接++
      } else if (项.isDirectory()) {
        加目录(源, 包内)
      } else if (项.isFile()) {
        加文件(源, 包内)
      }
    }
  }

  if (角色卡路径 && fs.existsSync(角色卡路径)) 加文件(path.resolve(角色卡路径), 'elysia.cosplay.v2.json')
  加目录(path.resolve(数据目录), '记忆')
  加目录(path.resolve(学习区根), '学习')

  const 清单 = {
    格式版本: 1,
    应用版本: String(应用版本 || ''),
    创建时间: 现在.toISOString(),
    内容: ['elysia.cosplay.v2.json', '记忆/', '学习/'],
    不包含: ['API Key', '缓存', '程序文件'],
  }
  zip.addFile('backup-manifest.json', Buffer.from(JSON.stringify(清单, null, 2) + '\n', 'utf8'))
  zip.addFile(
    '这份备份是什么.txt',
    Buffer.from(
      '这是“爱莉希雅”当前用户数据的备份。\n' +
      '包含：人格卡、记忆、聊天、附件和学习资料。\n' +
      '不包含：API Key、机器相关设置、缓存和程序文件。\n' +
      '这份 zip 没有密码，请放在只有你能访问的位置。\n',
      'utf8',
    ),
  )

  fs.mkdirSync(path.dirname(目标), { recursive: true })
  const 临时文件 = 目标 + '.tmp'
  try {
    zip.writeZip(临时文件)
    fs.rmSync(目标, { force: true })
    fs.renameSync(临时文件, 目标)
  } catch (错误) {
    try { fs.rmSync(临时文件, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }

  return { 目标文件: 目标, 文件数, 原始字节, 压缩字节: fs.statSync(目标).size, 跳过链接 }
}

module.exports = { 创建用户备份, 时间戳, 是同一路径或在里面 }
