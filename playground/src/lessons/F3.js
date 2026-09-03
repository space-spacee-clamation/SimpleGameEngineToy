// F3 · 相机系统:跟随、震屏与遮挡处理
export default {
  id: 'F3',
  title: '相机系统：跟随、震屏与遮挡处理',
  est: '2 小时',
  coreQuestions: [
    '硬跟随、阻尼跟随、前瞻、死区——四种跟随差在「手感」的哪一层？',
    '震屏为什么用 trauma 平方而不是线性抖动？',
    '视差滚动和相机是什么关系？',
    '相机被墙挡住（遮挡）时，引擎层有什么招？'
  ],
  sections: [
  {
    type: 'text',
    title: '相机是「手感」的引擎级来源',
    html: `<p>同样一段跑跳，硬跟随的镜头像监控探头，阻尼跟随像摄影师跟拍——<b>关卡没变，手感天差地别</b>。相机系统的本质是一个滤波器：玩家位置（噪声输入）→滤波策略→镜头位置（平滑输出）。</p>
<table>
  <tr><th>策略</th><th>做法</th><th>性格</th></tr>
  <tr><td>硬跟随</td><td>镜头=玩家位置</td><td>精准但僵硬，任何微小位移都直通画面</td></tr>
  <tr><td>阻尼跟随</td><td>镜头每帧朝玩家滑行（指数趋近）</td><td>柔和；急停时有一点「追上来」的余韵</td></tr>
  <tr><td>前瞻</td><td>阻尼基础上沿速度方向预支一段偏移</td><td>「看向要去的地方」，跑动感最强</td></tr>
  <tr><td>死区</td><td>玩家在中央框内不动镜头，出框才追</td><td>静观其变；站桩时画面最稳</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '震屏、视差与遮挡',
    html: `<p><b>震屏</b>的正确姿势是 <b>trauma（创伤值）模型</b>：受击加 trauma，抖动幅度 = trauma²，trauma 随时间衰减——小打小抖、大打狂抖，且平方让「轻度受击」几乎不影响可读性。抖动用高频噪声而非随机数，画面才「抖得有质感」。</p>
<p><b>视差滚动</b>不是相机的功能，是背景层的勾当：远景以 0.3 倍相机速度滚动、中景 0.6 倍——深度感就这么来的。相机只管自己的变换，各层按系数取自己的那份。</p>
<p><b>遮挡处理</b>是相机最难的分支：镜头与玩家之间被墙挡住时，引擎的招有——把墙临时半透明（Godot 的景深淡出）、把镜头拉近贴到玩家头顶、或沿视线方向推镜头直到可见。2D 平台游戏少见这个问题，3D 越肩视角游戏几乎每帧都在解它。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'camera',
    title: '实验：四种跟随 + trauma 震屏（同一操作换手感）',
    height: 620,
    code: `// A/D=跑  W=跳  Tab=切换跟随策略  H=受击震屏  R=重置
// 顶栏显示当前策略与镜头坐标;世界 3000px 宽,视差双层背景

var WORLD_W = 3000, VIEW_W = 688;

engine.run({
  setup: function (state) {
    state.mode = 2;              // 0硬跟 1阻尼 2前瞻 3死区
    state.px = 400;
    state.py = 0;
    state.pvx = 0;
    state.pvy = 0;
    state.grounded = true;
    state.camX = state.px;
    state.camY = 0;
    state.trauma = 0;
    state.shakeX = 0;
    state.shakeY = 0;
    state.rng = mulberry32(20260903);
    buildTerrain(state);
    state.log = ['前瞻模式:镜头看向你要去的地方'];
    state.camTrail = [];
  },

  update: function (state, dt, input) {
    state.t = (state.t || 0) + dt;
    if (input.pressed('Tab')) { state.mode = (state.mode + 1) % 4; pushLog(state, ['硬跟随', '阻尼跟随', '前瞻跟随', '死区跟随'][state.mode]); }
    if (input.pressed('KeyH')) { state.trauma = Math.min(1, state.trauma + 0.6); pushLog(state, '受击!trauma=' + state.trauma.toFixed(2)); }
    if (input.pressed('KeyR')) resetAll(state);
    // 玩家
    var acc = 0;
    if (input.down('KeyA')) acc -= 500;
    if (input.down('KeyD')) acc += 500;
    state.pvx += acc * dt;
    state.pvx *= (1 - 2.4 * dt);
    if (input.down('KeyW') && state.grounded) { state.pvy = -330; state.grounded = false; }
    state.pvy += 900 * dt;
    state.px += state.pvx * dt;
    state.py += state.pvy * dt;
    var groundY = groundAt(state, state.px);
    if (state.py >= groundY) { state.py = groundY; state.pvy = 0; state.grounded = true; }
    state.px = clamp(state.px, 20, WORLD_W - 20);

    // 相机:四种策略
    var wantX = state.px;
    if (state.mode === 2) wantX = state.px + clamp(state.pvx * 0.45, -160, 160);
    if (state.mode === 3) {
      var dz = state.px - state.camX;
      if (Math.abs(dz) > 70) state.camX += dz - Math.sign(dz) * 70;
    }
    if (state.mode === 0) state.camX = wantX;
    else if (state.mode === 1 || state.mode === 2) state.camX += (wantX - state.camX) * Math.min(1, 5 * dt);
    state.camX = clamp(state.camX, VIEW_W / 2, WORLD_W - VIEW_W / 2);
    // 震屏:trauma 平方 + 高频噪声
    state.trauma = Math.max(0, state.trauma - 1.4 * dt);
    var sh = state.trauma * state.trauma * 22;
    state.shakeX = (sinNoise(state.t * 31) ) * sh;
    state.shakeY = (sinNoise(state.t * 29 + 7)) * sh * 0.6;

    state.camTrail.push(state.camX);
    if (state.camTrail.length > 40) state.camTrail.shift();
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var camL = state.camX - VIEW_W / 2 + state.shakeX;
    // 视差背景两层
    drawParallax(ctx, camL * 0.25, 120, '#16283e', 46);
    drawParallax(ctx, camL * 0.55, 90, '#1d3350', 90);
    // 地面与地标
    var gy = 420;
    ctx.fillStyle = '#243447';
    ctx.fillRect(0, gy, engine.W, engine.H - gy);
    var startX = Math.floor(camL / 60) * 60;
    for (var gx = startX; gx < camL + VIEW_W + 60; gx += 60) {
      var sx2 = gx - camL;
      var h2 = 18 + ((gx * 2654435761) >>> 0) % 42;
      ctx.fillStyle = '#2c3f57';
      ctx.fillRect(sx2, gy - h2, 58, h2 + 2);
      ctx.fillStyle = '#31517a';
      ctx.fillRect(sx2 + 8, gy - h2 - 26, 20, 24);
    }
    // 玩家
    var psx = state.px - camL;
    var psy = 420 - 14 - state.py;
    ctx.fillStyle = '#ffd479';
    ctx.fillRect(psx - 7, psy, 14, 20);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(psx - 3, psy - 6, 6, 6);
    // 相机锚点轨迹(青色刻度)
    for (var i = 0; i < state.camTrail.length; i++) {
      var tx = state.camTrail[i] - camL;
      ctx.fillStyle = i === state.camTrail.length - 1 ? '#6ee7b7' : 'rgba(110,231,183,0.25)';
      ctx.fillRect(tx - 1, 30, 2, 8);
    }
    drawHud(state, ctx);
  }
});

// ---------- 世界 ----------

function buildTerrain(state) {
  state.t0 = 0;
}

function groundAt(state, x) {
  // 台地高度:几段平台制造跳跃点
  if (x > 900 && x < 1100) return -70;
  if (x > 1500 && x < 1750) return -120;
  if (x > 2200 && x < 2350) return -40;
  return 0;
}

function drawParallax(ctx, off, step, color, top) {
  ctx.fillStyle = color;
  var first = -((off % step) + step) % step;
  for (var x = first; x < engine.W + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x - 40, 420);
    ctx.lineTo(x + step / 2, top + (((x + off) * 7919) >>> 0) % 60);
    ctx.lineTo(x + step + 40, 420);
    ctx.closePath();
    ctx.fill();
  }
}

function resetAll(state) {
  state.px = 400; state.py = 0; state.pvx = 0; state.pvy = 0;
  state.grounded = true; state.camX = 400; state.trauma = 0;
  state.camTrail = [];
  pushLog(state, '重置');
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function sinNoise(x) { return Math.sin(x) * 0.6 + Math.sin(x * 2.9 + 1.7) * 0.4; }

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
  ctx.fillRect(8, 6, 704, 20);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var modeName = ['硬跟随', '阻尼跟随', '前瞻跟随', '死区跟随'][state.mode];
  ctx.fillText('策略:' + modeName + '  镜头X ' + Math.round(state.camX) + '  trauma ' + state.trauma.toFixed(2) +
    '  抖动 ' + Math.round((state.trauma * state.trauma * 22) * 10) / 10 + 'px', 16, 20);
  ctx.fillStyle = state.trauma > 0 ? '#f87171' : '#2c3e55';
  ctx.fillRect(560, 10, 150 * state.trauma, 8);
  ctx.strokeStyle = '#3b4d6b';
  ctx.strokeRect(560, 10, 150, 8);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('A/D=跑  W=跳  Tab=换策略  H=受击  R=重置  (青色刻度=镜头锚点轨迹)', 16, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>Tab 四连切：</b>同一段冲刺急停——硬跟随戛然而止、阻尼滑行半拍、前瞻已经看向下一程、死区纹丝不动。「手感」被拆成了四个可切换的滤波器。</li>
  <li><b>看青色刻度：</b>那是镜头锚点的轨迹——硬跟随是一根绷直的线，阻尼是拖尾曲线，前瞻永远冲在玩家前面。</li>
  <li><b>按 H 震屏：</b>连按三下感受 trauma 叠加：1 次 0.6 的 trauma 抖 8px、2 次抖 31px——平方曲线让「连续受击」惩罚陡增，这是可读性与打击感的平衡点。</li>
  <li><b>跳上高台（900~1100 与 1500~1750 处）：</b>本课相机只锁 X 轴——试试在脑子里加一条「Y 轴死区」，高台镜头该怎么动？这就是相机系统长大成人的方向。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：相机的引擎层实现',
    files: [
      { path: 'scene/2d/camera_2d.cpp', note: '2D 相机：limit 边界、drag_margin（死区的引擎版）、offset 与 position smoothing——本课四策略的官方合体。建议搜索：drag_margin、position_smoothing、limit。' },
      { path: 'scene/3d/camera_3d.cpp', note: '3D 相机：fov/投影与碰撞遮挡的宿主——越肩视角的「镜头拉近避墙」在这里实现。建议搜索：get_camera_transform、is_position_in_frustum。' },
      { path: 'scene/main/viewport.cpp', note: 'canvas transform：相机如何变成「全屏一个矩阵位移」——视差层各取系数也是从这里分账。建议搜索：canvas_transform、set_canvas_transform。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>相机系统 = 滤波（四种跟随策略）+ 效果层（trauma 震屏）+ 约束（边界/死区/遮挡）。它不生产内容，却决定玩家「感受」内容的方式——这就是手感三件套之外最被低估的引擎级手感来源。</p>
<ul>
  <li><b>数据怎么流动？</b>玩家位置/速度→滤波策略→镜头锚点→叠加 trauma 抖动→canvas 变换→各渲染层按视差系数分账。</li>
  <li><b>所有权归谁？</b>镜头状态归相机组件；trauma 归「事件系统」注入；玩家永远不知道镜头的存在——这是它唯一的 KPI。</li>
  <li><b>什么时候发生？</b>滤波每帧连续、抖动每帧重采样、死区判断在玩家移动之后——相机的所有工作都排在「世界更新完、渲染开始前」的窄缝里。</li>
</ul>`
  }
  ]
};
