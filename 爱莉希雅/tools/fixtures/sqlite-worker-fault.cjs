/** 仅测试通过Worker构造器替身预载；生产监督器固定execArgv=[]，无故障参数。 */
'use strict'
const {parentPort}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite')
const cfg=JSON.parse(process.env.SQLITE_FIXTURE_FAULT??'{}'),original=DatabaseSync.prototype.exec
if(cfg.audit){const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{workerData}=require('node:worker_threads'),root=workerData.options.目录,source=path.resolve(__dirname,'../..'),read=fs.readFileSync,load=Module._load;const inside=(a,b)=>{const r=path.relative(a,b);return !path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)};fs.readFileSync=function(file,...args){if(typeof file!=='string'||(!inside(root,path.resolve(file))&&!(inside(source,path.resolve(file))&&(/\.(cjs|js)$/u.test(file)||path.basename(file)==='package.json'))))throw Error('FIXTURE_READ_OUTSIDE_ISOLATION');return read.call(this,file,...args)};Module._load=function(id,...args){if(/^(node:)?(http|https|net|tls|dns)$/u.test(id)||/(?:^|[/\\])(配置|模型连接|对话)\.cjs$/u.test(id))throw Error('FIXTURE_BUSINESS_OR_NETWORK_FORBIDDEN');return load.call(this,id,...args)}}
const prepare=DatabaseSync.prototype.prepare;let journalWrites=0
DatabaseSync.prototype.prepare=function(sql,...args){if(['journal-fail','journal-fail-second'].includes(cfg.stage)&&sql.startsWith("INSERT INTO repository_meta(key,value) VALUES('disk_worker_receipts'")){let match=false;try{match=!!prepare.call(this,"SELECT 1 FROM chat_sessions WHERE conversation_id='fixture-target'").get()}catch{}if(match&&++journalWrites >= (cfg.stage==='journal-fail-second'?2:1))throw Error('SQLITE_WORKER_FIXTURE_JOURNAL_FAILURE')}return prepare.call(this,sql,...args)}
parentPort.postMessage({fixture:true,kind:'env',secretPresent:Object.hasOwn(process.env,'ELYSIA_WORKER_TEST_SECRET')})
let used=false, commits=0
DatabaseSync.prototype.exec=function(sql,...args){let match=false;if(sql==='COMMIT'&&!used){try{match=!!this.prepare("SELECT 1 FROM chat_sessions WHERE conversation_id='fixture-target'").get();if(match&&++commits<=(cfg.skip??0))match=false}catch{}}
 if(match){used=true;if(cfg.stage==='before'){parentPort.postMessage({fixture:true,kind:'phase',stage:'before'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,cfg.delay??30000)}}
 const value=original.call(this,sql,...args)
 if(match&&cfg.stage==='after'){parentPort.postMessage({fixture:true,kind:'phase',stage:'after'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,cfg.delay??30000)}
 return value
}
