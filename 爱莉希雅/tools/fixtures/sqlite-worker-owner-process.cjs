/** 独立虚构服务：hold用于退出/跨进程所有权测试，不连接模型或正式渠道。 */
'use strict'
const {启动隔离存储Worker}=require('../../storage/sqlite-worker.cjs')
const [mode,目录]=process.argv.slice(2)
;(async()=>{let a;try{a=await 启动隔离存储Worker({用途:'synthetic-sqlite-disk',目录});if(mode==='hold'){await a.调用({操作:'会话.登记对话',操作编号:'child-op',参数:['child-chat',{建于:'2026-10-27T00:00:00.000Z'}]});console.log(JSON.stringify({ready:true,pid:process.pid}));process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{if(x.trim()==='crash')process.exit(9);if(x.trim()==='close')a.关闭().then(()=>process.exit(0))});process.stdin.resume()}else{await a.关闭();console.log(JSON.stringify({好:true}))}}catch(e){if(a)await a.关闭();console.log(JSON.stringify({好:false,代码:/^SQLITE_[A-Z_]+$/u.test(e.message)?e.message:'FIXTURE_REJECTED'}));process.exitCode=1}})()
