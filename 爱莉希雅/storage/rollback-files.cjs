/** 只把已核验的隔离备份写进新建的系统临时目录，绝不覆盖现有工作区。 */
'use strict'
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createHash } = require('node:crypto')
const { 恢复隔离仓储, 恢复本机影子仓储, 相对路径 } = require('./sqlite-backup.cjs')
const 哈希 = (字节) => createHash('sha256').update(字节).digest('hex')
function 失败() { throw new Error('SQLITE_BACKUP_FILE_WRITE_FAILED') }
function 核对目录(目录) {
  if (fs.lstatSync(目录).isSymbolicLink() || !fs.statSync(目录).isDirectory() || fs.realpathSync(目录) !== 目录) 失败()
}
function 写入隔离回退(原, 范围) {
  return 发布回退(原, 范围, false)
}
function 写入本机影子回退(原, 范围, 选项) { return 发布回退(原, 范围, true, 选项) }
function 发布回退(原, 范围, 本机, 选项) {
  // 先用全新内存库复核schema、约束、正文与投影一致，坏包不会创建输出目录。
  const 仓 = 本机 ? 恢复本机影子仓储(原, 范围) : 恢复隔离仓储(原, 范围)
  let 包
  try {
    包 = 仓.创建备份({ 时间: 原.时间, 外部文件: 原.外部文件, 必须文件: 原.外部文件.map((x) => x.路径) }, 范围)
  } finally { 仓.关闭() }
  let 临时父 = fs.realpathSync(os.tmpdir())
  let 引用根 = null
  if (选项 !== undefined) {
    const d = 选项 && Object.getOwnPropertyDescriptors(选项)
    if (!本机 || !d || Reflect.ownKeys(d).some(k=>!['输出父目录','外部来源目录'].includes(k)||!Object.hasOwn(d[k],'value')) || !d.输出父目录 || typeof d.输出父目录.value !== 'string' || !path.isAbsolute(d.输出父目录.value) || /^[\\/]{2}/u.test(d.输出父目录.value)) 失败()
    for(let p=path.resolve(d.输出父目录.value);;p=path.dirname(p)){if(fs.lstatSync(p).isSymbolicLink())失败();if(p===path.dirname(p))break}
    临时父=fs.realpathSync(d.输出父目录.value);核对目录(临时父)
    if(临时父===path.parse(临时父).root)失败()
    if(d.外部来源目录){const p=d.外部来源目录.value;if(typeof p!=='string'||!path.isAbsolute(p)||/^[\\/]{2}/u.test(p))失败();for(let q=path.resolve(p);;q=path.dirname(q)){if(fs.lstatSync(q).isSymbolicLink())失败();if(q===path.dirname(q))break}引用根=fs.realpathSync(p);核对目录(引用根)}
  }
  function 读外部(一){
    if(!Object.hasOwn(一,'sha256'))return Buffer.from(一.base64,'base64')
    if(!本机||!引用根)throw Error('SQLITE_BACKUP_EXTERNAL_SOURCE_REQUIRED')
    let p=引用根;for(const part of 一.路径.split('/')){p=path.join(p,part);if(fs.lstatSync(p).isSymbolicLink())失败()}
    const s=fs.lstatSync(p);if(!s.isFile()||s.nlink!==1||s.size!==一.字节数)失败();const b=fs.readFileSync(p);if(哈希(b)!==一.sha256)失败();return b
  }
  // 文件引用不是附件字节：发布前逐个复核，缺失/篡改时不创建输出目录。
  for(const 一 of 包.外部文件)if(Object.hasOwn(一,'sha256'))读外部(一)
  const 根 = fs.mkdtempSync(path.join(临时父, 本机 ? 'elysia-sqlite-local-' : 'elysia-sqlite-E-'))
  const 临时 = path.join(根, 'staging'), 完成 = path.join(根, 'ready'), 已见 = new Set(), 清单 = []
  let 发布中 = false
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
    for (const 一 of 包.外部文件) 写(一.路径, 读外部(一))
    // 原格式没有操作回执等内部表；完整逻辑快照独立保留，不让旧读取器把它当记忆。
    写('migration/snapshot.json', Buffer.from(JSON.stringify(包), 'utf8'))
    const 核验清单 = { 版本: 1, 用途: 本机 ? 'local-shadow-rollback-verification' : 'isolated-rollback-verification', 快照指纹: 包.指纹, 文件: [...清单] }
    写('migration/manifest.json', Buffer.from(JSON.stringify(核验清单, null, 2), 'utf8'))
    核对目录(根); 核对目录(临时)
    if (path.dirname(path.resolve(完成)) !== 根 || fs.existsSync(完成)) 失败()
    发布中 = true; fs.renameSync(临时, 完成)
    return { 好: true, 根, 目录: 完成, 数据目录: path.join(完成, 'data'), 缓存目录: path.join(完成, 'cache'), 文件数: 清单.length, 指纹: 包.指纹 }
  } catch {
    // rename可能已生效而调用方未得到成功；这时必须报告不确定，不能声称没有ready。
    let 不确定 = false
    if (发布中) { try { 不确定 = fs.existsSync(完成) } catch { 不确定 = true } }
    const 错 = new Error(不确定 ? 'SQLITE_BACKUP_PUBLICATION_UNKNOWN' : 'SQLITE_BACKUP_FILE_WRITE_FAILED')
    错.隔离目录 = 根; 错.状态 = 不确定 ? 'unknown' : 'not-published'; throw 错
  }
}
module.exports = { 写入隔离回退, 写入本机影子回退 }
