/** 只接收测试临时盘库和虚构备份参数；结果仅哈希/计数，不启动业务核心。 */
'use strict'
const fs=require('node:fs'),{createHash}=require('node:crypto'),{打开隔离盘库}=require('../../storage/sqlite-disk.cjs'),{备份范围}=require('../../storage/sqlite-backup.cjs')
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
let d
try{const [目录,用途]=process.argv.slice(2);d=打开隔离盘库({目录,用途,...(用途==='isolated-local-sqlite-disk'?{包含私密:true}:{})});const q=JSON.parse(fs.readFileSync(0,'utf8')),r=d.仓储,b=r.创建备份(q,备份范围);console.log(JSON.stringify({好:r.核验().好,备份:sha(b),原格式:sha(r.导出原格式(备份范围)),资源:sha(d.读取资源元数据()),消息:r.会话.取统计().消息数}))}
catch(e){console.log(JSON.stringify({好:false,代码:/^SQLITE_[A-Z_]+$/u.test(e.message)?e.message:'READER_REJECTED'}));process.exitCode=1}
finally{d?.关闭()}
