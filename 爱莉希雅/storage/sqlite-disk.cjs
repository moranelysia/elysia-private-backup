/** S-16B：仅显式临时隔离根的盘库；不提供正式路径、网络或Worker入口。 */
'use strict'
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {DatabaseSync}=require('node:sqlite'),{createHash,randomUUID}=require('node:crypto')
const {接入隔离磁盘连接,取内部}=require('./sqlite-context.cjs')
const {创建隔离仓储,创建虚构轮次仓储,创建本机影子仓储,恢复隔离仓储,恢复本机影子仓储,内部备份测试,组合隔离盘连接}=require('./sqlite-backup.cjs')
const {纯数据}=require('./sqlite-state.cjs')
const {validateLog,makeLog}=require('./sqlite-worker-protocol.cjs')
const DB='repository.sqlite',MARK='disk-scope.json',LOCK='.open.lock',APP=0x454c5953,VERSION=2
const KEYS=['disk_storage_format','disk_metadata','disk_metadata_sha256']
const hash=x=>createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x))
function fail(c){throw Error('SQLITE_DISK_'+c)}
function exact(o,keys){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).sort().join(',')!==keys.slice().sort().join(','))fail('INPUT_INVALID')}
function scope(o,open){o=纯数据(o);exact(o,open?['用途','目录',...(Object.hasOwn(o,'包含私密')?['包含私密']:[])]:['用途',...(Object.hasOwn(o,'包含私密')?['包含私密']:[])]);const local=o.用途==='isolated-local-sqlite-disk',segment=o.用途==='synthetic-turn-disk-v4',turn=o.用途==='synthetic-turn-disk-v3'||segment;if(!local&&!turn&&o.用途!=='synthetic-sqlite-disk')fail('SCOPE_REQUIRED');if(local?o.包含私密!==true:Object.hasOwn(o,'包含私密'))fail('SCOPE_REQUIRED');return{...o,local,turn,segment}}
function chain(p){for(let q=p;;q=path.dirname(q)){if(fs.lstatSync(q).isSymbolicLink())fail('LINK_FORBIDDEN');if(q===path.dirname(q))break}}
function temp(){const p=fs.realpathSync(os.tmpdir()),project=path.resolve(__dirname,'..'),workspace=path.dirname(project),r=path.relative(workspace,p);if(!r||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)))fail('TEMP_PROTECTED');chain(p);return p}
function root(p){if(typeof p!=='string'||!path.isAbsolute(p)||path.dirname(path.resolve(p))!==temp()||!/^elysia-sqlite-disk-[a-zA-Z0-9]+$/u.test(path.basename(p))||path.resolve(p)!==p)fail('PATH_INVALID');chain(p);if(!fs.statSync(p).isDirectory()||fs.realpathSync(p)!==p)fail('PATH_INVALID');return p}
function regular(p){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('LINK_FORBIDDEN');return s}
const identity=s=>`${s.dev}/${s.ino}`
function inspect(dir,s){root(dir);for(const n of fs.readdirSync(dir)){if(![DB,DB+'-wal',DB+'-shm',DB+'-journal',MARK,LOCK].includes(n))fail('UNLISTED_FILE');regular(path.join(dir,n))}const m=path.join(dir,MARK);if(regular(m).size>1024)fail('MARKER_INVALID');const x=JSON.parse(fs.readFileSync(m,'utf8'));exact(x,['版本','用途','标识','状态']);if(x.版本!==1||x.用途!==s.用途||x.状态!=='ready'||typeof x.标识!=='string'||!/^[-a-f0-9]{36}$/u.test(x.标识))fail('MARKER_INVALID');return x}
function put(p,b){const fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function memory(local,pack,range,turn=false,segment=false){if(turn){if(pack!==undefined||range!==undefined)fail('BACKUP_UNSUPPORTED');return 创建虚构轮次仓储(segment)}if(pack!==undefined)return local?恢复本机影子仓储(pack,range):恢复隔离仓储(pack,range);return local?创建本机影子仓储({用途:'local-shadow-repository',包含私密:true}):创建隔离仓储({用途:'synthetic-sqlite-repository'})}
function save(db,m){const text=JSON.stringify(纯数据(m)),format=db.prepare("SELECT value FROM repository_meta WHERE key='disk_storage_format'").get()?.value??'1';if(!['1','2','3','4'].includes(format))fail('METADATA_INVALID');for(const [k,v]of [['disk_storage_format',format],['disk_metadata',text],['disk_metadata_sha256',hash(text)]])db.prepare('INSERT INTO repository_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v)}
function load(db,worker,turn=false,segment=false){const rows=db.prepare("SELECT key,value FROM repository_meta WHERE key GLOB 'disk_*' ORDER BY key").all(),m=Object.fromEntries(rows.map(r=>[r.key,r.value])),keys=['2','3'].includes(m.disk_storage_format)?[...KEYS,'disk_worker_receipts']:KEYS;if(rows.length!==keys.length||rows.some(r=>!keys.includes(r.key))||!(turn?m.disk_storage_format===(segment?'4':'3'):['1','2'].includes(m.disk_storage_format)))fail('METADATA_INVALID');if(['2','3'].includes(m.disk_storage_format)){const log=validateLog(JSON.parse(m.disk_worker_receipts));if(!turn&&!worker)fail('WORKER_REQUIRED');if(turn&&!worker&&(log.回执.length||db.prepare('SELECT count(*) AS n FROM synthetic_turn_attempts').get().n||db.prepare("SELECT 1 FROM repository_meta WHERE key='synthetic_restore_fence'").get()))fail('WORKER_REQUIRED')}if(segment){const state=require('./sqlite-segmented-receipts.cjs').核验(db);if(!worker&&(state.回执数||db.prepare('SELECT count(*) AS n FROM synthetic_turn_attempts').get().n||db.prepare("SELECT 1 FROM repository_meta WHERE key='synthetic_restore_fence'").get()))fail('WORKER_REQUIRED')}if(hash(m.disk_metadata)!==m.disk_metadata_sha256)fail('METADATA_INVALID');const p=JSON.parse(m.disk_metadata);if(JSON.stringify(p)!==m.disk_metadata)fail('METADATA_INVALID');return 纯数据(p)}
function 新建隔离盘库(options,pack,range){
 const s=scope(options,false);if(process.versions.electron)fail('NODE_ONLY');const m=memory(s.local,pack,range,s.turn,s.segment);let bytes
 try{const i=内部备份测试(m),meta=i.取持久元数据();i.db.exec('BEGIN IMMEDIATE');try{if(s.turn){i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_storage_format',?)").run(s.segment?'4':'3');if(!s.segment)i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_worker_receipts',?)").run(JSON.stringify(makeLog([])))}save(i.db,meta);i.db.exec(`PRAGMA user_version=${s.segment?4:s.turn?3:VERSION}; PRAGMA application_id=${APP}`);i.db.exec('COMMIT')}catch(e){i.db.exec('ROLLBACK');throw e}bytes=i.db.serialize();if(bytes.length>64*1024*1024)fail('LIMIT')}finally{m.关闭()}
 let dir,publishing=false
 try{dir=fs.mkdtempSync(path.join(temp(),'elysia-sqlite-disk-'));const marker={版本:1,用途:s.用途,标识:randomUUID(),状态:'creating'};put(path.join(dir,MARK),JSON.stringify(marker));put(path.join(dir,DB),bytes);if(hash(fs.readFileSync(path.join(dir,DB)))!==hash(bytes))fail('COPY_MISMATCH');put(path.join(dir,MARK+'.next'),JSON.stringify({...marker,状态:'ready'}));publishing=true;fs.renameSync(path.join(dir,MARK+'.next'),path.join(dir,MARK));return 打开隔离盘库({用途:s.用途,目录:dir,...(s.local?{包含私密:true}:{})})}
 catch(e){let published=false;try{published=publishing&&JSON.parse(fs.readFileSync(path.join(dir,MARK),'utf8')).状态==='ready'}catch{}const x=Error(published?'SQLITE_DISK_PUBLICATION_UNKNOWN':/^SQLITE_/u.test(e.message)?e.message:'SQLITE_DISK_CREATE_REJECTED');if(dir)x.隔离目录=dir;throw x}
}
function 恢复虚构轮次盘库(pack){
 if(process.versions.electron)fail('NODE_ONLY')
 const {仓储:m,回执}=require('./sqlite-turn-snapshot.cjs').恢复虚构轮次快照(pack);let bytes
 try{const i=内部备份测试(m),meta=i.取持久元数据();i.db.exec('BEGIN IMMEDIATE');try{i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_storage_format','3')").run();i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_worker_receipts',?)").run(JSON.stringify(validateLog(回执)));save(i.db,meta);i.db.exec(`PRAGMA user_version=3; PRAGMA application_id=${APP}`);i.db.exec('COMMIT')}catch(e){i.db.exec('ROLLBACK');throw e}bytes=i.db.serialize();if(bytes.length>64*1024*1024)fail('LIMIT')}finally{m.关闭()}
 let dir,publishing=false
 try{dir=fs.mkdtempSync(path.join(temp(),'elysia-sqlite-disk-'));const marker={版本:1,用途:'synthetic-turn-disk-v3',标识:randomUUID(),状态:'creating'};put(path.join(dir,MARK),JSON.stringify(marker));put(path.join(dir,DB),bytes);if(hash(fs.readFileSync(path.join(dir,DB)))!==hash(bytes))fail('COPY_MISMATCH');put(path.join(dir,MARK+'.next'),JSON.stringify({...marker,状态:'ready'}));publishing=true;fs.renameSync(path.join(dir,MARK+'.next'),path.join(dir,MARK));return Object.freeze({目录:dir,用途:'synthetic-turn-disk-v3',状态:'quarantined'})}
 catch(e){let published=false;try{published=publishing&&JSON.parse(fs.readFileSync(path.join(dir,MARK),'utf8')).状态==='ready'}catch{}const x=Error(published?'SQLITE_DISK_PUBLICATION_UNKNOWN':/^SQLITE_/u.test(e.message)?e.message:'SQLITE_DISK_CREATE_REJECTED');if(dir)x.隔离目录=dir;throw x}
}
// Explicit v3 synthetic snapshot import into a new v4 directory. Restored state is always fenced.
function 从旧快照恢复虚构分段盘(pack){
 if(process.versions.electron)fail('NODE_ONLY')
 const old=require('./sqlite-turn-snapshot.cjs').恢复虚构轮次快照(pack),target=创建虚构轮次仓储(true),src=内部备份测试(old.仓储),dst=内部备份测试(target),ledger=require('./sqlite-segmented-receipts.cjs');let bytes
 try{
  const original=src.取快照(),byName=new Map(original.表.map(t=>[t.名称,t]));dst.db.exec('BEGIN IMMEDIATE')
  try{
   dst.db.exec('PRAGMA defer_foreign_keys=ON')
   for(const t of src.表们)if(t.名称!=='sqlite_sequence')dst.db.exec(`DELETE FROM "${t.名称}"`)
   for(const t of src.表们){if(t.名称==='sqlite_sequence')continue;const data=byName.get(t.名称),q=dst.db.prepare(`INSERT INTO "${t.名称}"(${t.列.map(c=>'"'+c+'"').join(',')}) VALUES(${t.列.map(()=>'?').join(',')})`);for(const row of data.行)q.run(...row)}
   dst.db.exec('DELETE FROM sqlite_sequence');for(const row of byName.get('sqlite_sequence').行)dst.db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(...row)
   for(const row of old.回执.回执)ledger.事务追加(dst.db,row)
   const state=ledger.核验(dst.db);if(state.回执数!==old.回执.回执.length)fail('COPY_MISMATCH')
   for(const row of old.回执.回执)if(JSON.stringify(ledger.查找(dst.db,row.编号))!==JSON.stringify(row))fail('COPY_MISMATCH')
   dst.设置持久元数据(src.取持久元数据());target.核验()
   const after=dst.取快照(),targetTables=new Map(after.表.map(t=>[t.名称,t]));for(const t of original.表)if(JSON.stringify(targetTables.get(t.名称))!==JSON.stringify(t))fail('COPY_MISMATCH')
   const metadata=dst.取持久元数据();dst.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_storage_format','4')").run();save(dst.db,metadata);dst.db.exec(`PRAGMA user_version=4; PRAGMA application_id=${APP}; COMMIT`)
  }catch(e){if(dst.db.isTransaction)dst.db.exec('ROLLBACK');throw e}
  bytes=dst.db.serialize();if(bytes.length>64*1024*1024)fail('LIMIT')
 }finally{target.关闭();old.仓储.关闭()}
 let dir,publishing=false
 try{dir=fs.mkdtempSync(path.join(temp(),'elysia-sqlite-disk-'));const marker={版本:1,用途:'synthetic-turn-disk-v4',标识:randomUUID(),状态:'creating'};put(path.join(dir,MARK),JSON.stringify(marker));put(path.join(dir,DB),bytes);if(hash(fs.readFileSync(path.join(dir,DB)))!==hash(bytes))fail('COPY_MISMATCH');put(path.join(dir,MARK+'.next'),JSON.stringify({...marker,状态:'ready'}));publishing=true;fs.renameSync(path.join(dir,MARK+'.next'),path.join(dir,MARK));return Object.freeze({目录:dir,用途:'synthetic-turn-disk-v4',状态:'quarantined'})}
 catch(e){let published=false;try{published=publishing&&JSON.parse(fs.readFileSync(path.join(dir,MARK),'utf8')).状态==='ready'}catch{}const x=Error(published?'SQLITE_DISK_PUBLICATION_UNKNOWN':/^SQLITE_/u.test(e.message)?e.message:'SQLITE_DISK_CREATE_REJECTED');if(dir)x.隔离目录=dir;throw x}
}
function 恢复虚构分段盘库(pack){
 if(process.versions.electron)fail('NODE_ONLY');const store=require('./sqlite-segmented-snapshot.cjs').恢复虚构分段快照(pack),i=内部备份测试(store);let bytes
 try{const metadata=i.取持久元数据();i.db.exec('BEGIN IMMEDIATE');try{i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_storage_format','4')").run();save(i.db,metadata);i.db.exec(`PRAGMA user_version=4; PRAGMA application_id=${APP}; COMMIT`)}catch(e){if(i.db.isTransaction)i.db.exec('ROLLBACK');throw e}bytes=i.db.serialize();if(bytes.length>64*1024*1024)fail('LIMIT')}finally{store.关闭()}
 let dir,publishing=false
 try{dir=fs.mkdtempSync(path.join(temp(),'elysia-sqlite-disk-'));const marker={版本:1,用途:'synthetic-turn-disk-v4',标识:randomUUID(),状态:'creating'};put(path.join(dir,MARK),JSON.stringify(marker));put(path.join(dir,DB),bytes);if(hash(fs.readFileSync(path.join(dir,DB)))!==hash(bytes))fail('COPY_MISMATCH');put(path.join(dir,MARK+'.next'),JSON.stringify({...marker,状态:'ready'}));publishing=true;fs.renameSync(path.join(dir,MARK+'.next'),path.join(dir,MARK));return Object.freeze({目录:dir,用途:'synthetic-turn-disk-v4',状态:'quarantined'})}catch(e){let published=false;try{published=publishing&&JSON.parse(fs.readFileSync(path.join(dir,MARK),'utf8')).状态==='ready'}catch{}const x=Error(published?'SQLITE_DISK_PUBLICATION_UNKNOWN':/^SQLITE_/u.test(e.message)?e.message:'SQLITE_DISK_CREATE_REJECTED');if(dir)x.隔离目录=dir;throw x}
}
function 打开隔离盘库(options,声明){
 if(声明!==undefined){if(require('node:worker_threads').isMainThread)fail('WORKER_REQUIRED');声明=纯数据(声明);exact(声明,['版本','令牌','进程','启动','根','目录','数据库']);if(声明.版本!==2||声明.进程!==process.pid||typeof 声明.令牌!=='string'||!/^[a-f0-9-]{36}$/u.test(声明.令牌)||typeof 声明.启动!=='string'||!/^[a-f0-9-]{36}$/u.test(声明.启动))fail('OWNER_INVALID')}
 const s=scope(options,true);if(process.versions.electron)fail('NODE_ONLY');const dir=root(s.目录),file=path.join(dir,DB),lock=path.join(dir,LOCK),marker=inspect(dir,s),dirID=identity(fs.statSync(dir));const stat=regular(file);if(stat.size<100||stat.size>64*1024*1024)fail('FILE_INVALID')
 const head=Buffer.alloc(100),h=fs.openSync(file,'r');try{if(fs.readSync(h,head,0,100,0)!==100||head.subarray(0,16).toString()!=='SQLite format 3\0'||head.readUInt32BE(60)!==(s.segment?4:s.turn?3:VERSION)||head.readUInt32BE(68)!==APP)fail('FORMAT_UNSUPPORTED')}finally{fs.closeSync(h)}
 const fileID=identity(stat);if(声明&&(声明.根!==marker.标识||声明.目录!==dirID||声明.数据库!==fileID))fail('OWNER_INVALID');const token=JSON.stringify(声明??{版本:1,令牌:randomUUID()}),lockfd=(()=>{try{return fs.openSync(lock,'wx',0o600)}catch{fail('IN_USE')}})();let db,store,ctx,released=false
 function release(){if(released)return;fs.closeSync(lockfd);released=true;try{root(dir);if(identity(fs.statSync(dir))===dirID&&regular(lock).nlink===1&&fs.readFileSync(lock,'utf8')===token)fs.unlinkSync(lock)}catch{/* 不确定残锁不接管 */}}
 function check(){const current=inspect(dir,s);if(identity(fs.statSync(root(dir)))!==dirID||identity(regular(file))!==fileID||regular(lock).nlink!==1||fs.readFileSync(lock,'utf8')!==token||current.标识!==marker.标识)fail('OWNERSHIP_CHANGED')}
 function bind(connection,close){const context=接入隔离磁盘连接(connection,{本机:s.local,虚构轮次:s.turn,检查:check,...(close?{关闭后:release}:{})}),r=组合隔离盘连接(context,s.turn,s.segment);内部备份测试(r).设置持久元数据(load(connection,声明!==undefined,s.turn,s.segment));r.核验();return{context,r}}
 function format(connection,expected){if(connection.prepare('PRAGMA user_version').get().user_version!==(s.segment?4:s.turn?3:VERSION)||connection.prepare('PRAGMA application_id').get().application_id!==APP||connection.prepare('PRAGMA quick_check').get().quick_check!=='ok'||connection.prepare('PRAGMA foreign_key_check').all().length)fail('FORMAT_UNSUPPORTED');const schema=connection.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name').all().map(x=>({...x}));if(JSON.stringify(schema)!==JSON.stringify(expected))fail('SCHEMA_MISMATCH')}
 try{
  fs.writeFileSync(lockfd,token);fs.fsyncSync(lockfd);check()
  const template=memory(s.local,undefined,undefined,s.turn,s.segment);let expected;try{expected=copy(内部备份测试(template).架构)}finally{template.关闭()}
  db=new DatabaseSync(file,{readOnly:true,allowExtension:false,enableDoubleQuotedStringLiterals:false,timeout:250});db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA query_only=ON');format(db,expected);const ro=bind(db,false);ro.r.关闭();db=undefined;check()
  db=new DatabaseSync(file,{allowExtension:false,enableDoubleQuotedStringLiterals:false,timeout:250});format(db,expected);db.enableDefensive(true)
  db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA busy_timeout=250')
  if(db.prepare('PRAGMA journal_mode').get().journal_mode!=='wal'||db.prepare('PRAGMA synchronous').get().synchronous!==2||db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1||db.prepare('PRAGMA trusted_schema').get().trusted_schema!==0||db.prepare('PRAGMA busy_timeout').get().timeout!==250)fail('PRAGMA_MISMATCH')
  const b=bind(db,true);store=b.r;ctx=b.context;const i=内部备份测试(store)
  取内部(ctx).提交前=()=>save(db,i.取持久元数据())
  return Object.freeze({目录:dir,仓储:store,关闭:()=>store.关闭(),取状态:()=>store.取状态(),读取资源元数据:()=>{取内部(ctx);const m=i.取持久元数据();return{资源引用:m.资源引用,外部文件元数据:m.外部文件元数据}}})
 }catch(e){try{if(db?.isOpen)db.close();release()}catch{/* 关库/残锁不确定时保留 */}throw Error(/^SQLITE_(DISK|BACKUP|CONTEXT|CHAT|MEMORY|STATE|DIARY|LEGACY)_[A-Z_]+$/u.test(e.message)?e.message:'SQLITE_DISK_OPEN_REJECTED')}
}
function 核验隔离盘身份(options){const s=scope(options,true),dir=root(s.目录),m=inspect(dir,s);return{根:m.标识,目录:identity(fs.statSync(dir)),数据库:identity(regular(path.join(dir,DB)))}}
module.exports={新建隔离盘库,恢复虚构轮次盘库,从旧快照恢复虚构分段盘,恢复虚构分段盘库,打开隔离盘库,核验隔离盘身份}
