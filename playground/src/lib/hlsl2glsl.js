// HLSL → GLSL ES 1.0 转译器（教学平台专用子集）
// 约定入口：float4 main(float2 uv : TEXCOORD0) : SV_TARGET { ... }
// 关键约束：函数体逐行 1:1 保留（不增删/合并行），只做行内替换 —— GLSL 报错行号映射回 HLSL 依赖这一点。

export function hlsl2glsl(src) {
  if (typeof src !== 'string') src = String(src == null ? '' : src)
  var text = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  var start = text.indexOf('{')
  if (start < 0) {
    return { ok: false, error: '未找到 main 函数体：请保留 float4 main(float2 uv : TEXCOORD0) : SV_TARGET { ... } 的结构' }
  }
  var depth = 0
  var end = -1
  for (var i = start; i < text.length; i++) {
    var ch = text.charAt(i)
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end < 0) {
    return { ok: false, error: '花括号不配对：请检查 main 函数体的 { 与 } 是否成对' }
  }

  var body = text.slice(start + 1, end)
  var lines = body.split('\n')
  // body 第一行在原文中的行号（1 基），用于错误行号映射
  var bodyStartLine = text.slice(0, start + 1).split('\n').length

  var out = new Array(lines.length)
  for (var k = 0; k < lines.length; k++) out[k] = transpileLine(lines[k])

  var header = [
    'precision highp float;',
    'uniform float u_time;      // 秒',
    'uniform vec2 u_mouse;      // 0..1，y 向上',
    'uniform vec2 u_resolution; // 画布像素',
    'varying vec2 v_uv;',
    'vec4 main_image(vec2 uv) {'
  ]
  var glsl = header.join('\n') + '\n' + out.join('\n') + '\n}\nvoid main() { gl_FragColor = main_image(v_uv); }\n'
  return { ok: true, glsl: glsl, headerLines: header.length, bodyStartLine: bodyStartLine }
}

// ---------- 行内转译 ----------

function trim(s) { return s.trim() }
function wrap(s) { return '(' + s.trim() + ')' }

// 顶层逗号切分参数（带一层以上嵌套括号也能正确处理）
function splitArgs(s) {
  var parts = []
  var d = 0
  var cur = ''
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c === '(') d++
    else if (c === ')') d--
    if (c === ',' && d === 0) { parts.push(cur); cur = '' }
    else cur += c
  }
  parts.push(cur)
  return parts
}

// 把 name(A, B) 形式的调用替换为 build(args) 的返回值
function replaceCall(line, name, build) {
  var re = new RegExp('\\b' + name + '\\s*\\(', 'g')
  var result = ''
  var rest = line
  var m
  while ((m = re.exec(rest)) !== null) {
    var open = m.index + m[0].length - 1
    var d = 1
    var j = open + 1
    for (; j < rest.length; j++) {
      var c = rest.charAt(j)
      if (c === '(') d++
      else if (c === ')') {
        d--
        if (d === 0) break
      }
    }
    if (d !== 0) return line // 括号不配对：该行保持原样，让 GLSL 编译器去报错
    var inner = rest.slice(open + 1, j)
    result += rest.slice(0, m.index) + build(splitArgs(inner))
    rest = rest.slice(j + 1)
    re.lastIndex = 0
  }
  return result + rest
}

function transpileLine(line) {
  // 先处理带括号的调用，再做类型/函数名 token 替换
  line = replaceCall(line, 'saturate', function (a) { return 'clamp(' + a[0].trim() + ', 0.0, 1.0)' })
  line = replaceCall(line, 'lerp', function (a) { return 'mix(' + a.map(trim).join(', ') + ')' })
  line = replaceCall(line, 'mul', function (a) { return a.map(wrap).join(' * ') })
  line = line.replace(/\bfrac\b/g, 'fract')
  line = line.replace(/\batan2\b/g, 'atan')
  line = line.replace(/\btex2D\b/g, 'texture2D')
  line = line.replace(/\bfloat4x4\b/g, 'mat4')
  line = line.replace(/\bfloat3x3\b/g, 'mat3')
  line = line.replace(/\bfloat2x2\b/g, 'mat2')
  line = line.replace(/\bfloat([1-4])\b/g, 'vec$1')
  line = line.replace(/\bhalf4\b/g, 'vec4')
  line = line.replace(/\bhalf3\b/g, 'vec3')
  line = line.replace(/\bhalf2\b/g, 'vec2')
  line = line.replace(/\bhalf\b/g, 'float')
  line = line.replace(/\bfixed4\b/g, 'vec4')
  line = line.replace(/\bfixed3\b/g, 'vec3')
  line = line.replace(/\bfixed2\b/g, 'vec2')
  line = line.replace(/\bfixed\b/g, 'float')
  line = line.replace(/\bint([2-4])\b/g, 'ivec$1')
  return line
}
