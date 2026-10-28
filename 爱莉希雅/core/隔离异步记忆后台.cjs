/** Synthetic-only background scheduling; production entry points remain untouched. */
'use strict'
const {创建后台任务}=require('./后台任务.cjs'),{创建隔离异步记忆提取}=require('./隔离异步记忆提取.cjs')
function 创建隔离异步记忆后台({actor,调度器,模型,取现在=()=>new Date(),间隔=60000,首次=60000,设延时=setTimeout,清延时=clearTimeout}={}){
 if(!Number.isSafeInteger(间隔)||间隔<1000||!Number.isSafeInteger(首次)||首次<0)throw Error('ASYNC_MEMORY_BACKGROUND_INVALID')
 const 提取=创建隔离异步记忆提取({actor,调度器,模型,取现在}),owner={},tasks=创建后台任务({所有者:owner,现在:()=>{const d=取现在();if(!(d instanceof Date)||!Number.isFinite(d.getTime()))throw Error('ASYNC_MEMORY_BACKGROUND_CLOCK_INVALID');return d.getTime()},设延时,清延时,任务们:[{名字:'extract',间隔,首次,执行:async({检查写入})=>{检查写入();await 提取.推进();检查写入()}}]})
 let stopping=null
 return Object.freeze({启动:()=>tasks.启动(),通知:()=>tasks.通知('extract'),推进:()=>tasks.推进(),取状态:()=>tasks.取状态(),停止(){if(!stopping){const close=提取.关闭();stopping=tasks.停止().then(async result=>{if(!result.超时)await close;return result})}return stopping}})
}
module.exports={创建隔离异步记忆后台}
