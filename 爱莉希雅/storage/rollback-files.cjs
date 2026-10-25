/** 只把已核验的隔离备份写进新建的系统临时目录，绝不覆盖现有工作区。 */
'use strict'
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createHash } = require('node:crypto')
const { 恢复隔离仓储, 相对路径 } = require('./sqlite-backup.cjs')
const 哈希 = (字节) => createHash('sha256').update(字节).digest('hex')
function 失败() { throw new Error('SQLITE_BACKUP_FILE_WRITE_FAILED') }
function 核对目录(目录) {
  if (fs.lstatSync(目录).isSymbolicLink() || !fs.statSync(目录).isDirectory() || fs.realpathSync(目录) !== 目录) 失败()
}
function 写入隔离回退(原, 范围) {
  // 先用全新内存库复核schema、约束、正文与投影一致，坏包不会创建输出目录。
  const 仓 = 恢复隔离仓储(原, 范围)
  let 包
  try {
    包 = 仓.创建备份({ 时间: 原.时间, 外部文件: 原.外部文件, 必须文件: 原.外部文件.map((x) => x.路径) }, 范围)
  } finally { 仓.关闭() }
  const 临时父 = fs.realpathSync(os.tmpdir()), 根 = fs.mkdtempSync(path.join(临时父, 'elysia-sqlite-E-'))
  const 临时 = path.join(根, 'staging'), 完成 = path.join(根, 'ready'), 已见 = new Set(), 清单 = []
  try {
    核对目录(根); fs.mkdirSync(临时, { mode: 0o700 }); 核对目录(临时)
    function 写(相对, 字节) {
      相对路径(相对)
      const 键 = 相对.toLowerCase(); if (已见.has(键)) 失败(); 已见.add(键)
      核对目录(根); 核对目录(临时)
      let 父 = 临时
      const 段们 = 相对.split('/')
      for (const 段 of 段们.slice(0, -1)) {
        const 下 = path.join(父, 段)
        try { fs.mkdirSync(下, { mode: 0o700 }) } catch (错) { if (错.code !== 'EEXIST') throw 错 }
        核对目录(下); 父 = 下
      }
      const 文件 = path.join(父, 段们.at(-1)), fd = fs.openSync(文件, 'wx', 0o600)
      try { fs.writeFileSync(fd, 字节); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      const 重读 = fs.readFileSync(文件)
      if (!重读.equals(字节)) 失败()
      清单.push({ 路径: 相对, 字节数: 字节.length, sha256: 哈希(字节) })
    }
    for (const 一 of 包.文档) 写(一.路径, Buffer.from(一.原文, 'utf8'))
    for (const 一 of 包.外部文件) 写(一.路径, Buffer.from(一.base64, 'base64'))
    // 原格式没有操作回执等内部表；完整逻辑快照独立保留，不让旧读取器把它当记忆。
    写('migration/snapshot.json', Buffer.from(JSON.stringify(包), 'utf8'))
    const 核验清单 = { 版本: 1, 用途: 'isolated-rollback-verification', 快照指纹: 包.指纹, 文件: [...清单] }
    写('migration/manifest.json', Buffer.from(JSON.stringify(核验清单, null, 2), 'utf8'))
    核对目录(根); 核对目录(临时)
    if (path.dirname(path.resolve(完成)) !== 根 || fs.existsSync(完成)) 失败()
    fs.renameSync(临时, 完成)
    return { 好: true, 根, 目录: 完成, 数据目录: path.join(完成, 'data'), 缓存目录: path.join(完成, 'cache'), 文件数: 清单.length, 指纹: 包.指纹 }
  } catch {
    // 失败不发布ready；只留下本次新建的staging供定位，没有旧目标需要回滚。
    const 错 = new Error('SQLITE_BACKUP_FILE_WRITE_FAILED'); 错.隔离目录 = 根; throw 错
  }
}
module.exports = { 写入隔离回退 }
