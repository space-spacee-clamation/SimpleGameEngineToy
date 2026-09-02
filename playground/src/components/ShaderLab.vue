<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/mode/clike/clike.js'
import { hlsl2glsl } from '../lib/hlsl2glsl.js'

// 基于 clike 自定义 HLSL 高亮（该 CM5 发行版没有内置 x-shader mode）
function words(str) {
  var o = {}
  str.split(' ').forEach(function (w) { if (w) o[w] = true })
  return o
}
CodeMirror.defineMIME('text/x-hlsl', {
  name: 'clike',
  keywords: words('return if else for while do break continue discard struct void inline static const uniform'),
  types: words('float float1 float2 float3 float4 half half2 half3 half4 fixed fixed2 fixed3 fixed4 int int1 int2 int3 int4 bool bool2 bool3 bool4 float2x2 float3x3 float4x4 sampler sampler2D samplerCube void'),
  builtin: words('abs acos all any asin atan atan2 ceil clamp clip cos cross ddx ddy degrees determinant dot exp exp2 faceforward floor frac frexp fwidth isinf isnan length lerp lit log log10 log2 max min mul normalize pow radians reflect refract round rsqrt saturate sign sin sincos smoothstep sqrt step tan tex2D transpose trunc u_time u_mouse u_resolution'),
  atoms: words('true false')
})

const props = defineProps({
  code: { type: String, required: true },
  title: { type: String, default: 'Shader 实验室' },
  persistKey: { type: String, required: true },
  height: { type: Number, default: 460 }
})

const hostRef = ref(null)
const canvasRef = ref(null)
const statusOk = ref(false)
const statusText = ref('等待编译')
const errors = ref([])
const savedTip = ref(false)

var cm = null
var gl = null
var program = null
var buffer = null
var raf = 0
var debounceTimer = 0
var tipTimer = 0
var startMs = performance.now()
var mouse = { x: 0.5, y: 0.5 }
var uniformLoc = {}
var lastHeaderLines = 0
var lastBodyStart = 1

var VERT_SRC = 'attribute vec2 a_pos;\nvarying vec2 v_uv;\nvoid main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }'

function storageKey() { return 'ged-lab:' + props.persistKey }

function compile() {
  if (!gl) return
  var t = hlsl2glsl(cm ? cm.getValue() : props.code)
  lastHeaderLines = t.headerLines || 0
  lastBodyStart = t.bodyStartLine || 1
  if (!t.ok) {
    statusOk.value = false
    statusText.value = '✕ 转译失败'
    errors.value = [{ line: 0, msg: t.error }]
    return
  }
  var res = buildProgram(t.glsl)
  if (res.ok) {
    if (program) gl.deleteProgram(program)
    program = res.program
    uniformLoc = {
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_mouse: gl.getUniformLocation(program, 'u_mouse'),
      u_resolution: gl.getUniformLocation(program, 'u_resolution')
    }
    statusOk.value = true
    statusText.value = '✓ 编译通过'
    errors.value = []
  } else {
    statusOk.value = false
    statusText.value = '✕ 编译失败'
    errors.value = res.errors
  }
}

function compileShader(type, src) {
  var s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    var log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    return { ok: false, log: log }
  }
  return { ok: true, shader: s }
}

// 把 GLSL 报错行号映射回 HLSL 原文行号
function mapErrors(log) {
  var out = []
  var arr = String(log || '').split('\n')
  for (var i = 0; i < arr.length && out.length < 5; i++) {
    var m = arr[i].match(/ERROR:\s*\d+:(\d+):\s*(.*)/)
    if (m) {
      var glslLine = parseInt(m[1], 10)
      var n = glslLine - lastHeaderLines - 1 + lastBodyStart
      out.push({ line: n >= 1 ? n : glslLine, msg: m[2] })
    }
  }
  if (!out.length && log) out.push({ line: 0, msg: String(log).slice(0, 300) })
  return out
}

function buildProgram(glslSrc) {
  var vs = compileShader(gl.VERTEX_SHADER, VERT_SRC)
  if (!vs.ok) return { ok: false, errors: [{ line: 0, msg: '顶点着色器异常: ' + vs.log }] }
  var fs = compileShader(gl.FRAGMENT_SHADER, glslSrc)
  if (!fs.ok) {
    gl.deleteShader(vs.shader)
    return { ok: false, errors: mapErrors(fs.log) }
  }
  var p = gl.createProgram()
  gl.attachShader(p, vs.shader)
  gl.attachShader(p, fs.shader)
  gl.bindAttribLocation(p, 0, 'a_pos')
  gl.linkProgram(p)
  gl.deleteShader(vs.shader)
  gl.deleteShader(fs.shader)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    var log = gl.getProgramInfoLog(p)
    gl.deleteProgram(p)
    return { ok: false, errors: [{ line: 0, msg: '链接失败: ' + log }] }
  }
  return { ok: true, program: p }
}

function frame() {
  raf = requestAnimationFrame(frame)
  if (!gl || !program) return
  gl.viewport(0, 0, 720, 440)
  gl.useProgram(program)
  gl.uniform1f(uniformLoc.u_time, (performance.now() - startMs) / 1000)
  gl.uniform2f(uniformLoc.u_mouse, mouse.x, mouse.y)
  gl.uniform2f(uniformLoc.u_resolution, 720, 440)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function initGL() {
  var canvas = canvasRef.value
  canvas.width = 720
  canvas.height = 440
  gl = canvas.getContext('webgl', { antialias: true })
  buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
}

function saveCode() {
  try {
    localStorage.setItem(storageKey(), cm.getValue())
    savedTip.value = true
    clearTimeout(tipTimer)
    tipTimer = setTimeout(function () { savedTip.value = false }, 1500)
  } catch (e) {}
}

function resetCode() {
  cm.setValue(props.code)
  try { localStorage.setItem(storageKey(), props.code) } catch (e) {}
  compile()
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compile() }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCode() }
}

function onMove(e) {
  var r = canvasRef.value.getBoundingClientRect()
  mouse.x = (e.clientX - r.left) / r.width
  mouse.y = 1 - (e.clientY - r.top) / r.height
}

onMounted(function () {
  initGL()
  var saved = null
  try { saved = localStorage.getItem(storageKey()) } catch (e) {}
  var ta = document.createElement('textarea')
  ta.value = (saved != null) ? saved : props.code
  hostRef.value.appendChild(ta)
  cm = CodeMirror.fromTextArea(ta, {
    mode: 'text/x-hlsl',
    lineNumbers: true,
    lineWrapping: true
  })
  cm.setSize('100%', props.height + 'px')
  cm.on('change', function () {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(compile, 800)
  })
  canvasRef.value.addEventListener('pointermove', onMove)
  canvasRef.value.addEventListener('pointerdown', onMove)
  window.addEventListener('keydown', onKey)
  compile()
  frame()
})

onUnmounted(function () {
  cancelAnimationFrame(raf)
  clearTimeout(debounceTimer)
  clearTimeout(tipTimer)
  window.removeEventListener('keydown', onKey)
  if (gl) {
    if (program) gl.deleteProgram(program)
    if (buffer) gl.deleteBuffer(buffer)
    var ext = gl.getExtension('WEBGL_lose_context')
    if (ext) ext.loseContext()
    gl = null
  }
})
</script>

<template>
  <div class="slab">
    <div class="slab-head">
      <span class="slab-title">{{ title }}</span>
      <span class="slab-status" :class="statusOk ? 'ok' : 'bad'">{{ statusText }}</span>
      <span class="slab-btns">
        <button class="btn" @click="compile">▶ 重新编译</button>
        <button class="btn" @click="resetCode">↺ 重置</button>
        <button class="btn" @click="saveCode">💾 保存</button>
        <span v-if="savedTip" class="tip">已保存 ✓</span>
      </span>
    </div>
    <div class="slab-body">
      <div ref="hostRef" class="slab-editor"></div>
      <div class="slab-view">
        <canvas ref="canvasRef" class="slab-canvas"></canvas>
        <div class="slab-errs" v-if="errors.length">
          <div v-for="(e, i) in errors" :key="i" class="err-line">
            <template v-if="e.line > 0"><b>第 {{ e.line }} 行</b>：{{ e.msg }}</template>
            <template v-else>{{ e.msg }}</template>
          </div>
        </div>
      </div>
    </div>
    <details class="slab-help">
      <summary>HLSL 使用说明</summary>
      <pre>入口结构（固定）：
float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // uv：0~1 画布坐标，左下 (0,0)
    return float4(r, g, b, 1.0);
}

可用 uniform：
  u_time       运行秒数（float）
  u_mouse      鼠标位置 0~1，y 向上（float2）
  u_resolution 画布像素尺寸（float2）

内置转译支持：float2/3/4→vec2/3/4、half/fixed 系列同理、
mul(A,B)→(A*B)、lerp→mix、saturate→clamp、frac→fract、
atan2→atan、tex2D→texture2D、float4x4→mat4 等。
采样器请写 sampler2D。编译失败时保留上一个成功版本继续显示。</pre>
    </details>
  </div>
</template>

<style scoped>
.slab {
  background: #111a2a; border: 1px solid #1e2a3d; border-radius: 12px;
  padding: 14px; margin: 14px 0;
}
.slab-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.slab-title { font-weight: 600; color: #cfe3ff; }
.slab-status { font-size: 12.5px; border-radius: 999px; padding: 2px 10px; }
.slab-status.ok { background: #123529; color: #6ee7b7; border: 1px solid #1f6f4d; }
.slab-status.bad { background: #3a1420; color: #f87171; border: 1px solid #7f1d1d; }
.slab-btns { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tip { color: #6ee7b7; font-size: 12.5px; }
.slab-body { display: flex; gap: 12px; flex-wrap: wrap; }
.slab-editor { flex: 1 1 340px; min-width: 300px; border-radius: 8px; overflow: hidden; border: 1px solid #1e2a3d; }
.slab-view { flex: 1 1 340px; min-width: 300px; }
.slab-canvas { width: 100%; aspect-ratio: 720 / 440; display: block; background: #000; border-radius: 8px; border: 1px solid #1e2a3d; }
.slab-errs { background: #1a0e14; border: 1px solid #7f1d1d; border-radius: 8px; padding: 8px 12px; margin-top: 8px; }
.err-line { color: #f87171; font-size: 12.5px; font-family: ui-monospace, Consolas, monospace; margin: 2px 0; }
.err-line b { color: #fbbf24; }
.slab-help { margin-top: 10px; color: #7d93b3; font-size: 12.5px; }
.slab-help summary { cursor: pointer; color: #4d8fd6; }
.slab-help pre { margin-top: 8px; }

.slab :deep(.CodeMirror) { background: #0d1420; color: #d7e0ea; height: auto; font-family: ui-monospace, Consolas, monospace; font-size: 13px; line-height: 1.5; }
.slab :deep(.CodeMirror-gutters) { background: #0d1420; border-right: 1px solid #1e2a3d; }
.slab :deep(.CodeMirror-cursor) { border-left: 2px solid #9fc3ff; }
.slab :deep(.CodeMirror-selected) { background: #24405f; }
.slab :deep(.cm-keyword) { color: #c792ea; }
.slab :deep(.cm-number) { color: #f78c6c; }
.slab :deep(.cm-string) { color: #a5d6a7; }
.slab :deep(.cm-comment) { color: #5c7292; font-style: italic; }
.slab :deep(.cm-def) { color: #82aaff; }
.slab :deep(.cm-variable) { color: #d7e0ea; }
.slab :deep(.cm-property) { color: #80cbc4; }
.slab :deep(.cm-atom) { color: #f78c6c; }
.slab :deep(.cm-operator) { color: #89ddff; }
</style>
