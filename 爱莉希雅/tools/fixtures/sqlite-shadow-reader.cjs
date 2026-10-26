/** 独立子进程：只读冻结源码和显式数据根，结果只输出摘要哈希。 */
'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),{createHash}=require('node:crypto')
const [source,dataRoot,checksFile]=process.argv.slice(2),root=fs.realpathSync(dataRoot),code=fs.realpathSync(source)
if(checksFile)assert.ok(path.dirname(path.resolve(checksFile))===path.dirname(path.dirname(code))&&path.basename(checksFile)==='mutation-checks.json','SHADOW_CHECK_SCOPE_INVALID')
const 内含=(a,b)=>{const r=path.relative(a,b);return !path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
process.env.ELYSIA_WORKSPACE_ROOT=path.join(root,'workspace');process.env.ELYSIA_CONFIG_FILE=path.join(root,'migration','absent-config.json');process.env.ELYSIA_DATA_DIR=path.join(root,'data');process.env.ELYSIA_CACHE_DIR=path.join(root,'cache');process.env.ELYSIA_学习区=path.join(root,'workspace','学习');process.env.ELYSIA_PERSONA_PATH=path.join(root,'resource','persona')
const oldLoad=Module._load,oldRead=fs.readFileSync
Module._load=function(n,...a){if(/^(?:node:)?(?:https?|net|tls|electron)$/u.test(n)||/模型客户端|deepseek|钥匙|GPTSoVITS/u.test(n))throw Error('SHADOW_EXTERNAL_FORBIDDEN');return oldLoad.call(this,n,...a)}
global.fetch=()=>{throw Error('SHADOW_NETWORK_FORBIDDEN')}
fs.readFileSync=function(p,...a){if(typeof p!=='number'){const q=path.resolve(String(p));assert.ok(内含(root,q)||(checksFile&&q===path.resolve(checksFile))||(内含(code,q)&&/\.(?:cjs|js|json)$/u.test(q)),'SHADOW_READ_OUTSIDE_ROOT')}return oldRead.call(this,p,...a)}
for(const n of ['writeFileSync','openSync','mkdirSync','renameSync','unlinkSync','rmSync','appendFileSync']){if(n==='openSync'){const old=fs[n];fs[n]=(p,flags,...a)=>{assert.ok(flags==='r'||flags===0,'SHADOW_WRITE_FORBIDDEN');return old.call(fs,p,flags,...a)}}else fs[n]=()=>{throw Error('SHADOW_WRITE_FORBIDDEN')}}
const 哈希=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
try{
 const mem=require(path.join(code,'脑/记忆.cjs')),temp=require(path.join(code,'脑/临时记忆.cjs')),priv=require(path.join(code,'脑/私密日记.cjs'))
 const sessions=mem.对话列表(),history=sessions.map(s=>{mem.设当前对话(s.编号);return{编号:s.编号,消息:mem.读聊天记录(0)}}),long=mem.全部长期记忆(),temporary=['有效','已归档','已晋升'].map(生命周期=>temp.查询({生命周期,包括归档:true,限量:1000}))
 const diary=require(path.join(code,'脑/记忆日记.cjs')).创建日记系统({数据目录:process.env.ELYSIA_DATA_DIR}).给界面()
 const privateView=priv.创建私密日记库({数据目录:process.env.ELYSIA_DATA_DIR}).给本机界面()
 const graph=require(path.join(code,'脑/记忆关系图.cjs')).创建关系图库({长期记忆库:mem}).查询()
 const work=require(path.join(code,'脑/工作索引.cjs')).给界面(),usage=require(path.join(code,'脑/用量.cjs')).读全部()
 const values={sessions,history,long,temporary,diary,privateView,graph,work,usage,privateEvaluations:priv.读评估索引(process.env.ELYSIA_DATA_DIR)}
 if(checksFile){const c=JSON.parse(fs.readFileSync(checksFile,'utf8'));assert.equal(long.find(x=>x.编号===c.edit.编号).内容,c.edit.内容);assert.equal(long.find(x=>x.编号===c.edit.编号).时间,c.edit.时间);assert.ok(!long.some(x=>x.编号===c.deleted.编号&&x.类别===c.deleted.类别));assert.equal(mem.读聊天记录(0,{对话:c.chat}).length,2);assert.equal(temp.取一条(c.promoted.临时).晋升.目标编号,c.promoted.长期);if(c.deletedTemp)assert.equal(temp.取一条(c.deletedTemp),null);assert.ok(diary.列表.some(x=>x.标题===c.diaryTitle));assert.equal(privateView.列表.length,0);assert.equal(sessions.find(x=>x.编号===c.oldSession.编号).标题,c.oldSession.标题);assert.equal(sessions.find(x=>x.编号===c.oldSession.编号).建于,c.oldSession.建于)}
 process.stdout.write(JSON.stringify({哈希:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,哈希(v)])),计数:{会话:sessions.length,消息:history.reduce((n,x)=>n+x.消息.length,0),长期:long.length,普通日记:diary.列表.length,私密日记:privateView.列表.length,用量:usage.length},人工改动核对:!!checksFile}))
}catch(e){process.stderr.write(/^SQLITE_|^SHADOW_/u.test(e.message)?e.message:'SHADOW_READER_REJECTED');process.exitCode=1}
