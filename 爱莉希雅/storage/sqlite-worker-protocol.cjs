/** S-16C纯协议：无SQL/文件/执行能力。C只开放基础会话写入，全部业务接线留D。 */
'use strict'
const {createHash}=require('node:crypto'),{纯数据}=require('./sqlite-state.cjs')
const MAX_INPUT=65536,MAX_RESULT=262144,MAX_LOG=1048576,MAX_RECEIPTS=2048
const REGISTRY=Object.freeze({
 '会话.登记对话':[true,2], '会话.更新对话':[true,2], '会话.存对话一轮':[true,1],
 '会话.读取对话':[false,1], '会话.列对话':[false,1], '会话.读消息页':[false,1], '会话.读最近聊天':[false,2], '会话.取统计':[false,0],
 '记忆.取统计':[false,0], '记忆.列长期':[false,1], '日记.读取共享':[false,0],
 '旧格式.读最早历史页':[false,1], '旧格式.读消息页':[false,1],
})
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex')
function fail(c){throw Error('SQLITE_WORKER_'+c)}
function exact(o,keys){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).sort().join(',')!==keys.slice().sort().join(','))fail('PROTOCOL_INVALID')}
function stable(x){return Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x}
function command(input){const q=纯数据(input);if(Buffer.byteLength(JSON.stringify(q))>MAX_INPUT)fail('INPUT_LIMIT');const spec=Object.hasOwn(REGISTRY,q.操作)?REGISTRY[q.操作]:null;if(!spec)fail('OPERATION_FORBIDDEN');exact(q,spec[0]?['操作','参数','操作编号']:['操作','参数']);if(!Array.isArray(q.参数)||q.参数.length!==spec[1])fail('PROTOCOL_INVALID');if(spec[0]&&(typeof q.操作编号!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/u.test(q.操作编号)))fail('ID_INVALID');return{q,write:spec[0],bytes:Buffer.byteLength(JSON.stringify(q)),digest:hash(stable({操作:q.操作,参数:q.参数}))}}
function result(x){const r=纯数据({值:x}).值;if(Buffer.byteLength(JSON.stringify(r))>MAX_RESULT)fail('RESULT_LIMIT');return r}
function makeLog(rows){const body={版本:1,回执:rows};const out={...body,指纹:hash(body)};if(rows.length>MAX_RECEIPTS||Buffer.byteLength(JSON.stringify(out))>MAX_LOG)fail('JOURNAL_FULL');return out}
function validateLog(x){x=纯数据(x);exact(x,['版本','回执','指纹']);if(x.版本!==1||!Array.isArray(x.回执)||x.回执.length>MAX_RECEIPTS||Buffer.byteLength(JSON.stringify(x))>MAX_LOG||x.指纹!==hash({版本:x.版本,回执:x.回执}))fail('JOURNAL_INVALID');const seen=new Set();for(const r of x.回执){exact(r,['编号','指纹','结果']);if(typeof r.编号!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/u.test(r.编号)||seen.has(r.编号)||typeof r.指纹!=='string'||!/^[a-f0-9]{64}$/u.test(r.指纹)||r.结果?.好!==true)fail('JOURNAL_INVALID');seen.add(r.编号);result(r.结果)}return x}
module.exports={REGISTRY,MAX_INPUT,MAX_RESULT,MAX_LOG,MAX_RECEIPTS,command,result,makeLog,validateLog,hash,exact,fail}
