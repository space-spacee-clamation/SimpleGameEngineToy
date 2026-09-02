// 课程质检脚本：node tools/check-lesson.mjs <课时ID>   例: node tools/check-lesson.mjs L0.1
// 校验：数据结构完整、无模板残留风险、三类实验默认代码可无错运行、源码走读路径真实存在
import fs from 'node:fs'
import path from 'node:path'
import { hlsl2glsl } from '../src/lib/hlsl2glsl.js'

var BT = String.fromCharCode(96)          // 反引号（避免脚本里直接书写）
var DOLLAR_BRACE = '$' + '{'              // 模板插值序列

var id = process.argv[2]
if (!id) { console.error('用法: node tools/check-lesson.mjs <课时ID>'); process.exit(1) }

var GODOT = path.resolve(import.meta.dirname, '../../godot')
var problems = []
var oks = []

function bad(msg) { problems.push(msg) }
function good(msg) { oks.push(msg) }

var mod
try {
  mod = await import(new URL('../src/lessons/' + id + '.js', import.meta.url).href)
} catch (e) {
  console.error('无法加载课程文件:', e.message)
  process.exit(1)
}
var d = mod.default
if (!d) { bad('缺少 default 导出') }
else {
  if (d.id !== id) bad('id 字段(' + d.id + ')与文件名不一致')
  if (!Array.isArray(d.coreQuestions) || d.coreQuestions.length < 2) bad('coreQuestions 应有 2~4 条')
  if (!Array.isArray(d.sections) || d.sections.length < 3) bad('sections 太少（至少 概念/实验/收尾 三段）')
}

var hasLab = false
var seenKeys = {}

for (var s of (d.sections || [])) {
  if (s.type === 'text') {
    if (!s.html) { bad('text 段缺少 html: ' + (s.title || '')); continue }
    if (s.html.indexOf(BT) >= 0) bad('text html 含反引号: ' + s.title)
    if (s.html.indexOf(DOLLAR_BRACE) >= 0) bad('text html 含模板插值序列: ' + s.title)
  } else if (s.type === 'source') {
    if (!Array.isArray(s.files) || !s.files.length) { bad('source 段缺少 files'); continue }
    for (var f of s.files) {
      var p = path.join(GODOT, f.path)
      if (!fs.existsSync(p)) bad('源码路径不存在(godot/): ' + f.path)
      else good('源码 OK: ' + f.path)
    }
  } else if (s.type === 'lab') {
    hasLab = true
    if (!s.key) bad('lab 缺 key: ' + s.title)
    else if (seenKeys[s.key]) bad('lab key 重复: ' + s.key)
    else seenKeys[s.key] = 1
    if (!s.code) { bad('lab 缺 code: ' + s.title); continue }
    if (s.code.indexOf(DOLLAR_BRACE) >= 0) bad('lab code 含模板插值序列: ' + s.key)
    try {
      if (s.lab === 'code') checkCodeLab(s)
      else if (s.lab === 'shader') checkShaderLab(s)
      else if (s.lab === 'physics') checkPhysicsLab(s)
      else bad('未知 lab 类型: ' + s.lab)
    } catch (e) {
      bad('lab "' + s.key + '" 运行出错: ' + e.message)
    }
  } else {
    bad('未知 section 类型: ' + s.type)
  }
}

if (!hasLab) bad('本课没有实践 lab（每课必须有）')

function checkCodeLab(s) {
  var appRef = null
  var api = { W: 720, H: 440, run: function (app) {
    if (!app || typeof app.setup !== 'function' || typeof app.update !== 'function' || typeof app.draw !== 'function')
      throw new Error('engine.run 缺少 setup/update/draw')
    appRef = app
  } }
  new Function('engine', '"use strict";\n' + s.code)(api)
  if (!appRef) throw new Error('代码没有调用 engine.run')
  var state = {}
  appRef.setup(state)
  var input = { keys: {}, down: function () { return false }, pressed: function () { return false }, mouse: { x: 0, y: 0, down: false, clicked: false } }
  var ctx = new Proxy({}, {
    get: function (t, k) {
      if (k === 'measureText') return function () { return { width: 0 } }
      if (typeof k === 'string') return function () {}
      return undefined
    }
  })
  for (var i = 0; i < 5; i++) appRef.update(state, 1 / 60, input)
  appRef.draw(state, ctx)
  good('code lab 运行通过: ' + s.key)
}

function checkShaderLab(s) {
  var r = hlsl2glsl(s.code)
  if (!r.ok) throw new Error('HLSL 转译失败: ' + r.error)
  good('shader 转译通过: ' + s.key)
}

function checkPhysicsLab(s) {
  var fns = null
  var api = { run: function (h) {
    if (!h || typeof h.collide !== 'function' || typeof h.resolve !== 'function')
      throw new Error('physics.run 缺 collide/resolve')
    fns = h
  } }
  new Function('physics', '"use strict";\n' + s.code)(api)
  if (!fns) throw new Error('代码没有调用 physics.run')
  var a = { x: 10, y: 10, vx: 1, vy: 0, r: 8, m: 64 }
  var b = { x: 14, y: 10, vx: -1, vy: 0, r: 8, m: 64 }
  var hit = fns.collide(a, b)
  if (hit) {
    if (typeof hit.nx !== 'number' || typeof hit.ny !== 'number' || typeof hit.depth !== 'number') throw new Error('collide 返回缺字段')
    fns.resolve(a, b, hit, { gravity: 900, restitution: 0.8, substeps: 2 })
    if (!isFinite(a.x) || !isFinite(b.vx)) throw new Error('resolve 产生非有限数值')
  }
  good('physics lab 运行通过: ' + s.key)
}

console.log('== ' + id + ' 『' + (d.title || '') + '』 sections=' + ((d.sections || []).length) + ' ==')
for (var o of oks) console.log('  OK ' + o)
if (problems.length) {
  for (var p of problems) console.log('  X  ' + p)
  console.log('结论: 不通过 (' + problems.length + ' 个问题)')
  process.exit(1)
} else {
  console.log('结论: 通过')
}
