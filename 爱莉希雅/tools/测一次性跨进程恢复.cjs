'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process')
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'elysia-C3C5-fixture-'))
for(const [k,v] of Object.entries({ELYSIA_WORKSPACE_ROOT:root,ELYSIA_CONFIG_FILE:path.join(root,'absent.json'),ELYSIA_PERSONA_PATH:path.join(root,'absent-persona.json'),ELYSIA_DATA_DIR:path.join(root,'data'),ELYSIA_CACHE_DIR:path.join(root,'cache')}))process.env[k]=v
const {新建隔离盘库,恢复虚构轮次盘库}=require('../storage/sqlite-disk.cjs'),{启动隔离存储Worker}=require('../storage/sqlite-worker.cjs'),{创建异步仓储门面}=require('../storage/sqlite-async-facade.cjs'),{创建严格凭据,创建真实模型连接}=require('../脑/模型连接.cjs'),{创建隔离一次性真实发送}=require('../core/隔离一次性假发送.cjs')
const roots=new Set([root]),actors=new Set(),brokers=new Set(),children=new Set(),tests=[],test=(n,f)=>tests.push([n,f]),purpose='synthetic-turn-disk-v3',time='2026-10-28T00:00:00.000Z'
function fresh(){const d=新建隔离盘库({用途:purpose});roots.add(d.目录);d.关闭();return{用途:purpose,目录:d.目录}}
async function start(o=fresh()){const a=await 启动隔离存储Worker(o);actors.add(a);return a}
async function seed(a){await 创建异步仓储门面(a).会话.登记对话('fixture-target',{建于:time},{操作编号:'fault-seed'})}
async function usage(a){const s=await 创建异步仓储门面(a).状态.打开后端('usage','headless');try{return(await s.读取分段快照()).数据||[]}finally{await s.关闭()}}
const request=version=>({轮次键:'turn-process',指纹:'a'.repeat(64),模型:'deepseek-flash',预期用量版本:version,消息们:[{role:'user',content:'虚构消息'}]})
function make(a,send){const c=创建严格凭据({读取:()=> 'fixture-key-only-1234567890'}),model=创建真实模型连接({凭据:c,fetch函数:send}),broker=创建隔离一次性真实发送({actor:a,模型连接:model,取现在:()=>new Date(time)});brokers.add(broker);return broker}
function fake(){return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'虚构恢复回复'}}],usage:null}),{headers:{'content-type':'application/json'}})}
async function terminateAt(o,stage,skip){
  const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','ELYSIA_WORKSPACE_ROOT','ELYSIA_CONFIG_FILE','ELYSIA_PERSONA_PATH','ELYSIA_DATA_DIR','ELYSIA_CACHE_DIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
  const child=cp.fork(path.join(__dirname,'fixtures/一次性恢复子进程.cjs'),[o.目录,stage,String(skip)],{env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});children.add(child);let calls=0,stderr=''
  child.stderr.on('data',chunk=>{stderr+=String(chunk).slice(0,2000)});child.stdout.resume()
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})))
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('FIXTURE_PHASE_TIMEOUT')),15000);child.on('message',m=>{if(m.type==='fake-http')calls++;if(m.type==='phase'){clearTimeout(timer);resolve()}if(m.type==='error'||m.type==='unexpected-completion'){clearTimeout(timer);reject(Error('FIXTURE_CHILD_'+(m.code||m.type)))}});child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('close',code=>{clearTimeout(timer);reject(Error('FIXTURE_EXIT_'+code+' '+stderr))})})
  assert.equal(child.kill(),true);await closed;children.delete(child);return calls
}
for(const [label,skip] of [['started',0],['dispatch',1],['result',2]])for(const stage of ['before','after'])test(label+' '+stage+' 进程终止后恢复不盲目重发',async()=>{
  const o=fresh(),initial=await start(o);await seed(initial);await initial.关闭();const calls=await terminateAt(o,stage,skip);assert.equal(calls,label==='result'?1:0)
  const a=await start(o),f=创建异步仓储门面(a),row=await f.轮次执行.读取('turn-process'),rows=await usage(a)
  const wanted=label==='started'?(stage==='before'?null:'reserved'):label==='dispatch'?(stage==='before'?'reserved':'dispatch_possible'):(stage==='before'?'dispatch_possible':'result_ready')
  assert.equal(row?.状态??null,wanted);assert.deepEqual(rows.map(x=>x.状态),wanted===null?[]:wanted==='result_ready'?['started','succeeded']:['started'])
  if(wanted==='result_ready')assert.equal(await f.轮次执行.取暂存结果('turn-process'),'跨进程虚构回复')
  if(row){let retries=0;const broker=make(a,async()=>{retries++;return fake()});await assert.rejects(broker.要一轮(request(rows.length)),/SYNTHETIC_SEND_UNCERTAIN/u);assert.equal(retries,0);await broker.关闭()}
})
test('旧快照恢复后即使原库后来已发请求，也不能自动再发送',async()=>{const original=await start(),f=创建异步仓储门面(original),snapshot=await f.备份.虚构轮次快照({用途:'synthetic-turn-snapshot'});let calls=0;const first=make(original,async()=>{calls++;return fake()});await first.要一轮(request(0));await first.关闭();const restored=恢复虚构轮次盘库(snapshot);roots.add(restored.目录);const b=await start({用途:restored.用途,目录:restored.目录});let retries=0;const second=make(b,async()=>{retries++;return fake()});await assert.rejects(second.要一轮(request(0)),/SYNTHETIC_SEND_UNCERTAIN/u);assert.equal(calls,1);assert.equal(retries,0);await second.关闭()})
;(async()=>{let passed=0;try{for(const [name,fn]of tests){try{await fn();passed++;console.log('PASS '+name)}catch(e){process.exitCode=1;console.error('FAIL '+name,e)}}console.log(`S16D3 C3C5 cross-process recovery: ${passed}/${tests.length}; fake HTTP only`)}finally{for(const child of children)try{child.kill()}catch{}for(const b of brokers)try{await b.关闭()}catch{}for(const a of actors)try{await a.关闭()}catch{}for(const dir of roots){const real=fs.realpathSync(dir);if(path.dirname(real)!==fs.realpathSync(os.tmpdir())||!/^elysia-(sqlite-disk|C3C5-fixture)-[a-zA-Z0-9]+$/u.test(path.basename(real))||fs.lstatSync(dir).isSymbolicLink())throw Error('CLEANUP_OUTSIDE');fs.rmSync(real,{recursive:true,force:true})}}})()
