// G2 · 程序化动画与弹簧骨骼
export default {
  id: 'G2',
  title: '程序化动画与弹簧骨骼',
  est: '2 小时',
  coreQuestions: [
    '「跟着动的东西」为什么用弹簧-阻尼而不是直接复制父节点位置？',
    '刚度和阻尼各自给链条什么性格？低刚+低阻为什么像鞭子？',
    '弹簧骨骼和动画系统的正确叠加顺序是什么？',
    '鞭子效应为什么会沿链传播？速度继承在其中扮演什么角色？'
  ],
  sections: [
  {
    type: 'text',
    title: '二级运动：主动画之外的「活」',
    html: `<p>关键帧动画管得住四肢，管不住<b>头发、尾巴、披风、天线、配饰</b>——这些「跟着动的东西」如果也走关键帧，要么做不完、要么假。业界通用的答案：<b>弹簧-阻尼（spring-damper）</b>——每一节骨骼有自己的位置与速度，被弹簧拉向「父节点给的目标」，阻尼防止它永远荡下去。<b>主动画提供输入，弹簧提供性格。</b></p>
<p>这条思路在引擎里叫 spring bone / jiggle bone（Jet Set Radio 首创、VRM 模型标配）。它与动画层完全正交：动画先采样、弹簧后叠加，互不打架。</p>`
  },
  {
    type: 'text',
    title: '参数即性格',
    html: `<table>
  <tr><th>参数</th><th>调低</th><th>调高</th></tr>
  <tr><td>刚度 k</td><td>软垂拖沓（围巾）</td><td>生硬弹跳（筷子）</td></tr>
  <tr><td>阻尼 c</td><td>震铃：持续荡来荡去</td><td>黏滞：几乎不动像被冻住</td></tr>
</table>
<p>经典的「鞭子效应」来自<b>速度继承</b>：第 i 节的目标由第 i-1 节的位置给出，于是头的每一次加速都变成沿链传播的波——越往末梢延迟越明显、摆幅越大（能量在细端集中）。本课实验把这条链摊开给你调：同一个甩头动作，四组参数是四条完全不同的尾巴。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'springbones',
    title: '实验：12 节弹簧骨骼链（刚度/阻尼实时调）',
    height: 620,
    code: `// 鼠标按住=牵引头部(否则自动 8 字巡游)  Q/E=刚度  Z/X=阻尼  W=风  空格=甩头爆发
// 每节骨骼:弹簧拉向「上一节身后 L 处」,阻尼防震;尾巴颜色沿链渐变

var SEGS = 12, L = 20;

engine.run({
  setup: function (state) {
    state.k = 14;
    state.damp = 5;
    state.wind = false;
    state.t = 0;
    state.head = { x: 300, y: 260, vx: 0, vy: 0 };
    state.jx = new Float32Array(SEGS);
    state.jy = new Float32Array(SEGS);
    state.jvx = new Float32Array(SEGS);
    state.jvy = new Float32Array(SEGS);
    for (var i = 0; i < SEGS; i++) {
      state.jx[i] = 300 - (i + 1) * L;
      state.jy[i] = 260;
    }
    state.tipTrail = [];
    state.rng = mulberry32(20260903);
    state.log = ['拖住亮圆或让它自己巡游;Q/E 刚度 Z/X 阻尼'];
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('KeyQ')) { state.k = Math.max(2, state.k - 2); pushLog(state, '刚度 k=' + state.k); }
    if (input.pressed('KeyE')) { state.k = Math.min(40, state.k + 2); pushLog(state, '刚度 k=' + state.k); }
    if (input.pressed('KeyZ')) { state.damp = Math.max(0.5, state.damp - 0.5); pushLog(state, '阻尼 c=' + state.damp); }
    if (input.pressed('KeyX')) { state.damp = Math.min(14, state.damp + 0.5); pushLog(state, '阻尼 c=' + state.damp); }
    if (input.pressed('KeyW')) { state.wind = !state.wind; pushLog(state, state.wind ? '风场:开' : '风场:关'); }
    if (input.pressed('Space')) {
      var a = state.rng() * 6.2832;
      state.head.vx += Math.cos(a) * 420;
      state.head.vy += Math.sin(a) * 420;
      pushLog(state, '甩头!看波沿链传播');
    }
    // 头:鼠标牵引或 8 字巡游
    if (input.mouse.down && input.mouse.x > 20) {
      state.head.vx += (input.mouse.x - state.head.x) * 14 * dt * 6;
      state.head.vy += (input.mouse.y - state.head.y) * 14 * dt * 6;
      state.mouseDriving = true;
    } else {
      state.mouseDriving = false;
      var tx = 360 + Math.sin(state.t * 0.9) * 190;
      var ty = 200 + Math.sin(state.t * 1.8) * 90;
      state.head.vx += (tx - state.head.x) * 6 * dt * 6;
      state.head.vy += (ty - state.head.y) * 6 * dt * 6;
    }
    state.head.vx *= (1 - 3 * dt);
    state.head.vy *= (1 - 3 * dt);
    state.head.x += state.head.vx * dt;
    state.head.y += state.head.vy * dt;
    state.head.x = clamp(state.head.x, 20, 700);
    state.head.y = clamp(state.head.y, 60, 560);
    // 弹簧链:每节拉向「上一节身后 L 处」
    var px = state.head.x, py = state.head.y;
    var decay = Math.exp(-state.damp * dt);
    for (var s = 0; s < SEGS; s++) {
      var dx = px - state.jx[s], dy = py - state.jy[s];
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var tx2 = px - dx / d * L;
      var ty2 = py - dy / d * L;
      state.jvx[s] += (tx2 - state.jx[s]) * state.k * dt;
      state.jvy[s] += (ty2 - state.jy[s]) * state.k * dt;
      if (state.wind) {
        state.jvx[s] += Math.sin(state.t * 2.2 + s * 0.7) * 30 * dt;
        state.jvy[s] += Math.cos(state.t * 1.7 + s * 0.5) * 16 * dt;
      }
      state.jvx[s] *= decay;
      state.jvy[s] *= decay;
      state.jx[s] += state.jvx[s] * dt;
      state.jy[s] += state.jvy[s] * dt;
      px = state.jx[s];
      py = state.jy[s];
    }
    state.tipTrail.push([state.jx[SEGS - 1], state.jy[SEGS - 1]]);
    if (state.tipTrail.length > 90) state.tipTrail.shift();
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    // 梢部轨迹
    ctx.strokeStyle = 'rgba(245,158,11,0.3)';
    ctx.beginPath();
    for (var i = 0; i < state.tipTrail.length; i++) {
      var p = state.tipTrail[i];
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    // 链条:沿节渐变变细
    var px = state.head.x, py = state.head.y;
    for (var s = 0; s < SEGS; s++) {
      var f = s / SEGS;
      ctx.strokeStyle = 'rgb(' + Math.floor(110 + f * 120) + ',' + Math.floor(231 - f * 90) + ',' + Math.floor(183 - f * 60) + ')';
      ctx.lineWidth = 9 - f * 6.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(state.jx[s], state.jy[s]);
      ctx.stroke();
      px = state.jx[s];
      py = state.jy[s];
    }
    ctx.lineWidth = 1;
    // 梢
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(state.jx[SEGS - 1], state.jy[SEGS - 1], 4, 0, 6.2832);
    ctx.fill();
    // 头
    ctx.fillStyle = '#ffd479';
    ctx.beginPath();
    ctx.arc(state.head.x, state.head.y, 11, 0, 6.2832);
    ctx.fill();
    if (state.mouseDriving) {
      ctx.strokeStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.arc(state.head.x, state.head.y, 15, 0, 6.2832);
      ctx.stroke();
    }
    drawHud(state, ctx);
  }
});

// ---------- 工具 ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function dist(x1, y1, x2, y2) {
  var dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('刚度 k=' + state.k + '  阻尼 c=' + state.damp + '  风 ' + (state.wind ? 'ON' : 'OFF') +
    '  梢距头 ' + Math.round(dist(state.head.x, state.head.y, state.jx[SEGS - 1], state.jy[SEGS - 1])) + 'px', 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('鼠标=牵引头部  Q/E=刚度  Z/X=阻尼  W=风  空格=甩头  (橙线=梢部轨迹)', 16, 596);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('性格速查:k低c低=软鞭 k高c高=筷子 k低c高=拖把 c<1=震铃', 430, 596);
}`

  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>空格甩头（默认参数）：</b>看波动从头部出发、逐节放大传到梢部——速度继承就是鞭子效应的发动机。</li>
  <li><b>阻尼调到 1 以下（Z 连按）：</b>甩一次头，尾巴荡三四秒才停——「震铃」：弹簧只受激不收场。</li>
  <li><b>刚度拉满 40、阻尼拉满 14：</b>尾巴瞬间变筷子——弹簧追得紧、阻尼掐得死，二级运动名存实亡。</li>
  <li><b>开风（W）：</b>软参数下尾巴自己活了起来——持续外力+低阻尼=永动的飘动，这是「程序化」对关键帧的根本优势：它会响应任何扰动。</li>
  <li><b>拖鼠标画 8 字：</b>梢部轨迹（橙线）划出的半径比头大得多——能量沿链向细端集中，这就是为什么鞭梢能超音速。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：动画层与程序化层的叠加顺序',
    files: [
      { path: 'scene/animation/animation_mixer.cpp', note: '动画混合器：每帧把采样结果写进骨骼姿态的「主动画侧」——程序化弹簧必须排在它之后才有正确输入。建议搜索：_process_animation、blend、_blend_apply。' },
      { path: 'scene/3d/skeleton_3d.cpp', note: '骨骼数据结构与姿态更新：弹簧改写的正是这里的局部姿态，改完要触发全局姿态重算。建议搜索：set_bone_pose_position、force_update_all_bone_transforms。' },
      { path: 'servers/rendering/renderer_rd/shaders/skeleton.glsl', note: 'GPU 蒙皮侧：CPU 算完的最终姿态以骨骼矩阵上传，顶点在这里被「皮」到骨骼上——程序化结果最终经它变成画面。建议搜索：skin_matrix、bone_weights。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>弹簧骨骼 = 每节骨骼的弹簧-阻尼方程 + 速度沿链继承。它便宜（几百行）、可叠加（不碰动画底稿）、有性格（两个旋钮调出千种尾巴）——是「程序化动画」家族里性价比最高的第一站。</p>
<ul>
  <li><b>数据怎么流动？</b>头（或父骨骼）的位置与速度→每节弹簧方程→姿态覆盖→蒙皮上屏；动画层先采样，弹簧层后叠加。</li>
  <li><b>所有权归谁？</b>关键帧姿态是底稿、弹簧姿态是临时覆盖层——重置弹簧只需把每节拉回底稿位置，动画资产毫发无损。</li>
  <li><b>什么时候发生？</b>固定步长解算（大步长+高刚度会发散——弹簧方程也有自己的 CFL 条件），每帧动画后、蒙皮前。</li>
</ul>`
  }
  ]
};
