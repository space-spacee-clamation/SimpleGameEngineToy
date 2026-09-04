// G4 · 变形目标:BlendShape 与表情
export default {
  id: 'G4',
  title: '变形目标：BlendShape 与表情',
  est: '2 小时',
  coreQuestions: [
    'morph target 与骨骼动画同为「顶点动起来」，本质区别是什么？',
    'final = base + Σ wᵢ·deltaᵢ 里，权重叠加能拼出什么、又会冲突在哪？',
    '眨眼与口型为什么是 morph 的两大工业应用？',
    'blend shape 的混合发生在管线哪一级、每一帧谁在改权重？'
  ],
  sections: [
  {
    type: 'text',
    title: '顶点的另一条动画路',
    html: `<p>骨骼动画动的是「变换」（矩阵推着顶点走），<b>morph target 动的是「形状」</b>——每个表情预先存一份<b>顶点位移表 delta</b>（底模不动），运行时按权重线性叠加：</p>
<p><code>final = base + w₁·delta微笑 + w₂·delta惊讶 + w₃·delta皱眉 + …</code></p>
<p>权重连续可插值，所以表情之间能平滑过渡；权重可叠加，所以「0.6 微笑 + 0.4 惊讶」能拼出「吃惊地笑」——直到两个表情动同一块肌肉朝相反方向，出现<b>冲突区</b>，那就要美术调权重曲线来仲裁。</p>`
  },
  {
    type: 'text',
    title: '眨眼、口型与管线位置',
    html: `<p>morph 的两大工业应用：<b>眨眼</b>（把上眼睑的一小片顶点压下来，一个 delta 走天下）与<b>口型</b>（viseme：把音素映射成嘴部 morph 权重序列，语音驱动表情的技术底座）。两者的共同点：都是「少量顶点、高频变化」——骨骼动画管大动作，morph 管微表情，分工明确。</p>
<p>管线位置：blend shape 的混合发生在<b>顶点着色器</b>里（引擎把 delta 表做成顶点属性/纹理，权重是 uniform），与骨骼蒙皮同级——所以它每帧零 CPU 成本，改权重就像改一个数字。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'blendshape',
    title: '实验：2D 网格表情沙盘（权重滑杆 + delta 箭头）',
    height: 620,
    code: `// 1/2/3=选表情  Q/E=当前权重加减  空格=自动表情播放(权重平滑随机插值)
// wireframe=合成后的网格  绿箭头=选中表情的 delta 方向  底部=权重条与合成公式

var ROWS = 16, COLS = 13;

engine.run({
  setup: function (state) {
    state.sel = 0;
    state.w = [0, 0, 0];
    state.wTarget = [0, 0, 0];
    state.auto = false;
    state.t = 0;
    state.rng = mulberry32(20260903);
    state.autoTimer = 0;
    buildBase(state);
    state.log = ['1/2/3 选表情,Q/E 调权重;空格=自动播放'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('Digit1')) state.sel = 0;
    if (input.pressed('Digit2')) state.sel = 1;
    if (input.pressed('Digit3')) state.sel = 2;
    if (input.pressed('KeyQ')) state.wTarget[state.sel] = clamp(state.wTarget[state.sel] - 0.15, 0, 1);
    if (input.pressed('KeyE')) state.wTarget[state.sel] = clamp(state.wTarget[state.sel] + 0.15, 0, 1);
    if (input.pressed('Space')) {
      state.auto = !state.auto;
      pushLog(state, state.auto ? '自动表情播放:权重平滑追随机目标' : '手动模式');
    }
    if (state.auto) {
      state.autoTimer -= dt;
      if (state.autoTimer <= 0) {
        state.autoTimer = 1.2;
        for (var r = 0; r < 3; r++) state.wTarget[r] = state.rng();
      }
    }
    for (var w = 0; w < 3; w++) {
      state.w[w] += (state.wTarget[w] - state.w[w]) * Math.min(1, 6 * dt);
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var blink = blinkAmount(state.t);
    // 逐顶点合成:final = base + w1*d1 + w2*d2 + w3*d3 + autoBlink*dBlink
    var fx = [], fy = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var k = r * COLS + c;
        var bx2 = state.base[k].x, by2 = state.base[k].y;
        var dx1 = 0, dy1 = 0, dx2 = 0, dy2 = 0, dx3 = 0, dy3 = 0, dyb = 0;
        var m1 = deltaSmile(bx2, by2);
        var m2 = deltaSurprise(bx2, by2);
        var m3 = deltaAngry(bx2, by2);
        dx1 = m1.x; dy1 = m1.y;
        dx2 = m2.x; dy2 = m2.y;
        dx3 = m3.x; dy3 = m3.y;
        if (isUpperLid(bx2, by2)) dyb = 7 * blink;
        fx[k] = bx2 + state.w[0] * dx1 + state.w[1] * dx2 + state.w[2] * dx3;
        fy[k] = by2 + state.w[0] * dy1 + state.w[1] * dy2 + state.w[2] * dy3 + dyb;
      }
    }
    // wireframe
    ctx.strokeStyle = 'rgba(110,231,183,0.55)';
    ctx.lineWidth = 1;
    for (r = 0; r < ROWS; r++) {
      ctx.beginPath();
      for (c = 0; c < COLS; c++) {
        var k2 = r * COLS + c;
        if (c === 0) ctx.moveTo(fx[k2], fy[k2]); else ctx.lineTo(fx[k2], fy[k2]);
      }
      ctx.stroke();
    }
    for (c = 0; c < COLS; c++) {
      ctx.beginPath();
      for (r = 0; r < ROWS; r++) {
        var k3 = r * COLS + c;
        if (r === 0) ctx.moveTo(fx[k3], fy[k3]); else ctx.lineTo(fx[k3], fy[k3]);
      }
      ctx.stroke();
    }
    // 眼睛与嘴(跟随网格)
    drawFeatures(state, fx, fy, blink, ctx);
    // 选中表情的 delta 箭头
    drawDeltas(state, ctx, state.sel);
    drawHud(state, ctx);
  }
});

// ---------- 底模与区域函数 ----------

var CX = 300, CY = 300, RX = 150, RY = 185;
var EYE_Y = -40, MOUTH_Y = 78, BROW_Y = -78;

function buildBase(state) {
  state.base = [];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var a = (c / (COLS - 1)) * Math.PI;
      var rr = Math.sin((r / (ROWS - 1)) * Math.PI);
      state.base.push({
        x: CX + Math.cos(a - Math.PI / 2) * RX * rr,
        y: CY - RY + (r / (ROWS - 1)) * 2 * RY
      });
    }
  }
}

function inMouth(x, y) { return Math.abs(y - (CY + MOUTH_Y)) < 26 && Math.abs(x - CX) < 60; }
function inBrow(x, y) { return Math.abs(y - (CY + BROW_Y)) < 12 && (Math.abs(x - CX + 55) < 30 || Math.abs(x - CX - 55) < 30); }
function isUpperLid(x, y) {
  return (Math.abs(y - (CY + EYE_Y) + 6) < 8 && Math.abs(x - CX + 55) < 22) ||
         (Math.abs(y - (CY + EYE_Y) + 6) < 8 && Math.abs(x - CX - 55) < 22);
}

function deltaSmile(x, y) {
  if (!inMouth(x, y)) return { x: 0, y: 0 };
  var corner = Math.pow(Math.abs(x - CX) / 60, 2);
  return { x: (x > CX ? 2 : -2) * corner, y: -7 * corner };
}

function deltaSurprise(x, y) {
  var out = { x: 0, y: 0 };
  if (inMouth(x, y)) {
    var dx = (x - CX) / 26, dy = (y - (CY + MOUTH_Y)) / 13;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    out.x = dx / d * 4;
    out.y = dy / d * 4;
  }
  if (inBrow(x, y)) out.y = -6;
  return out;
}

function deltaAngry(x, y) {
  var out = { x: 0, y: 0 };
  if (inMouth(x, y)) {
    var corner = Math.pow(Math.abs(x - CX) / 60, 2);
    out.y = 6 * corner;
  }
  if (inBrow(x, y)) {
    out.y = 5;
    out.x = (x < CX ? 6 : -6) * 0.6;
  }
  return out;
}

function blinkAmount(t) {
  var ph = (t % 3.2) / 3.2;
  var v = Math.max(0, Math.sin(ph * Math.PI * 2));
  return v * v * v * v;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 特征与 HUD ----------

function drawFeatures(state, fx, fy, blink, ctx) {
  // 眼睛:上睑下压用 blink 画眼缝
  var eyeY = CY + EYE_Y;
  for (var e = -1; e <= 1; e += 2) {
    var ex = CX + e * 55;
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + blink * 3, 16, 7 * (1 - blink), 0, 0, 6.2832);
    ctx.fill();
  }
  // 嘴线:采样网格中嘴部顶点连线
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  var started = false;
  for (var c = 0; c < COLS; c++) {
    var r = Math.round((MOUTH_Y + RY) / (2 * RY) * (ROWS - 1));
    var k = r * COLS + c;
    var bx2 = state.base[k].x, by2 = state.base[k].y;
    if (!inMouth(bx2, by2)) continue;
    if (!started) { ctx.moveTo(fx[k], fy[k]); started = true; } else ctx.lineTo(fx[k], fy[k]);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawDeltas(state, ctx, sel) {
  ctx.strokeStyle = 'rgba(110,231,183,0.7)';
  for (var r = 0; r < ROWS; r += 2) {
    for (var c = 0; c < COLS; c += 2) {
      var k = r * COLS + c;
      var b = state.base[k];
      var d = sel === 0 ? deltaSmile(b.x, b.y) : (sel === 1 ? deltaSurprise(b.x, b.y) : deltaAngry(b.x, b.y));
      if (Math.abs(d.x) + Math.abs(d.y) < 0.5) continue;
      var w = state.w[sel];
      if (w < 0.05) continue;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + d.x * w * 2, b.y + d.y * w * 2);
      ctx.stroke();
    }
  }
}

function drawHud(state, ctx) {
  var names = ['微笑', '惊讶', '皱眉'];
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 24);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('final = base + ' + state.w[0].toFixed(2) + '·微笑 + ' + state.w[1].toFixed(2) + '·惊讶 + ' +
    state.w[2].toFixed(2) + '·皱眉  (眨眼自动 ' + Math.round(blinkAmount(state.t) * 100) + '%)', 16, 24);
  for (var i = 0; i < 3; i++) {
    var y = 44 + i * 26;
    var on = state.sel === i;
    ctx.fillStyle = on ? '#14301f' : '#141a24';
    ctx.fillRect(16, y, 200, 20);
    ctx.strokeStyle = on ? '#ffd479' : '#3b4d6b';
    ctx.strokeRect(16, y, 200, 20);
    ctx.fillStyle = on ? '#ffd479' : '#5b7397';
    ctx.fillText((i + 1) + ' ' + names[i], 24, y + 14);
    ctx.fillStyle = '#2c3e55';
    ctx.fillRect(230, y + 6, 160, 8);
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(230, y + 6, 160 * state.w[i], 8);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('1/2/3=选表情  Q/E=权重  空格=自动播放  绿箭头=选中表情的 delta', 16, 140);
  ctx.fillText('冲突演示:微笑+皱眉同时拉满=哭笑不得(同一块肌肉被两个 delta 拉扯)', 16, 156);
}`

  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>单独拉满一个表情（选它按 E 连按）：</b>绿箭头显示每个顶点的位移方向——微笑只动嘴角和脸颊，惊讶把嘴拉成 O、眉上抬。</li>
  <li><b>微笑 1.0 + 皱眉 1.0：</b>嘴部两个 delta 一个上提一个下拉，合成出「哭笑不得」的僵住表情——冲突区现场，工业里由美术的权重曲线或优先级仲裁。</li>
  <li><b>看眨眼：</b>它不由任何权重滑杆控制，是时间驱动的第四个 delta——微表情的「自动化」正是 NPC 脸活起来的关键。</li>
  <li><b>空格自动播放：</b>权重平滑地追随机目标——语音驱动口型、AI 驱动表情，底层都是这套「平滑追权重」。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：blend shape 的引擎实现',
    files: [
      { path: 'servers/rendering/renderer_rd/storage_rd/mesh_storage.cpp', note: 'blend shape 的存储与混合：每表情一份顶点 delta、按权重在管线里叠加——本课公式的引擎版。建议搜索：blend_shape、blend_shape_track、mount。' },
      { path: 'servers/rendering/renderer_rd/storage_rd/mesh_storage.h', note: 'blend shape 相关结构定义：delta 缓冲/规格/归一化字段的家。建议搜索：BlendShape、blend_shape_mode。' },
      { path: 'servers/rendering/renderer_rd/shaders/scene_forward_aa_inc.glsl', note: '顶点着色器侧：blend shape 位移如何与骨骼蒙皮同级叠加到顶点上——「每帧零 CPU 成本」的出处。建议搜索：blend、NORMAL、vertex。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>morph target 用「一叠位移表 + 几个权重」给顶点做动画：加法合成天然支持插值与叠加，冲突靠美术与系统仲裁；混合发生在顶点着色器，与骨骼蒙皮平级——微表情的活，全在 GPU 上白送。</p>
<ul>
  <li><b>数据怎么流动？</b>权重（动画系统每帧注入）→ delta 加权求和 → 顶点位置 → 法线重算 → 蒙皮/上屏。</li>
  <li><b>所有权归谁？</b>delta 表归网格资源（美术资产），权重归动画/驱动系统每帧临时注入——资产与运行时解耦。</li>
  <li><b>什么时候发生？</b>混合每帧在 GPU 进行，权重变化即改即生效；资产侧的 delta 只有导入/编辑时才重算。</li>
</ul>`
  }
  ]
};
