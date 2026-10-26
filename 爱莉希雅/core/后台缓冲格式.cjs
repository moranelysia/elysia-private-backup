/** 从记忆后台原读取器抽出的纯校验；不访问配置、文件或网络。 */
'use strict'
function 校验后台缓冲(包) {
  if (包.版本 !== 1 || !Array.isArray(包.轮次) || 包.轮次.length > 100 || 包.轮次.some((一) => !一 || !/^channel-[a-zA-Z0-9_-]+$/u.test(一.对话) || typeof 一.消息编号 !== 'string' || typeof 一.用户原话 !== 'string' || 一.用户原话.length > 6000 || typeof 一.她的回复 !== 'string' || 一.她的回复.length > 6000 || !Number.isFinite(Date.parse(一.接收于)) || !Number.isFinite(Date.parse(一.消息时间)))) throw new Error('BACKGROUND_BUFFER_INVALID')
  return 包.轮次
}
module.exports = { 校验后台缓冲 }
