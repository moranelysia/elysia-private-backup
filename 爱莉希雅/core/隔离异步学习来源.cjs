/** Synthetic-only source view bound to the database generation from a validated backup. */
'use strict'
const {createHash}=require('node:crypto'),{创建异步仓储门面}=require('../storage/sqlite-async-facade.cjs'),{校验隔离后台调度}=require('./隔离一次性假发送.cjs'),{校验虚构学习分段备份}=require('../storage/虚构学习分段备份.cjs')
const handles=new WeakMap(),fail=c=>{throw Error('ASYNC_LEARNING_SOURCE_'+c)},short=x=>createHash('sha256').update(x).digest('hex').slice(0,16)
async function 创建隔离异步学习来源({actor,调度器,备份}={}){校验隔离后台调度(调度器,actor);const checked=校验虚构学习分段备份(备份),content=checked.内容.toString('utf8');if(!Buffer.from(content,'utf8').equals(checked.内容))fail('ENCODING_INVALID');const expected=checked.数据库.指纹,f=创建异步仓储门面(actor)
 async function read({开始,结束}){const current=await f.备份.虚构分段快照({用途:'synthetic-segment-snapshot'});if(current.指纹!==expected)fail('DATABASE_CHANGED');const t=Date.parse(checked.原修改时间),start=Date.parse(开始),end=Date.parse(结束);if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)fail('PERIOD_INVALID');if(t<start||t>=end||!content.trim()||content.includes('还没有记过东西'))return null;return{编号:'学习进度:'+short(checked.原修改时间),类型:'学习进度',时间:checked.原修改时间,标题:'学习进度更新',摘要:content.trim().replace(/\s+/gu,' ').slice(0,1200)}}
 const handle=Object.freeze({});handles.set(handle,{actor,read});await read({开始:'2000-01-01T00:00:00.000Z',结束:'2100-01-01T00:00:00.000Z'});return handle}
async function 读取隔离异步学习来源(actor,handle,period){const h=handles.get(handle);if(!h||h.actor!==actor)fail('HANDLE_INVALID');return h.read(period)}
module.exports={创建隔离异步学习来源,读取隔离异步学习来源}
