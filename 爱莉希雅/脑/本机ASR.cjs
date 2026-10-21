/** 本机 ASR 选择器：默认轻量 SenseVoice，旧 Paraformer 可显式回退。 */
'use strict'

const 配置 = require('./配置.cjs')
const SenseVoice = require('./SenseVoiceASR.cjs')
const Paraformer = require('./ParaformerASR.cjs')

const 选择 = 配置.ASR提供者 === 'paraformer' ? Paraformer : SenseVoice

module.exports = {
  ...选择,
  selected: 选择.id,
  fallback: Paraformer,
}
