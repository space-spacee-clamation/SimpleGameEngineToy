// F6 · 引擎调试工具链:debug draw、控制台与 HUD
export default {
  id: 'F6',
  title: '引擎调试工具链：debug draw、控制台与 HUD',
  est: '2 小时',
  coreQuestions: [
    '引擎怎么「看见」自己——debug draw 都画些什么？',
    '性能剖析条的每一段代表哪一类开销？',
    '控制台/日志在引擎里承担什么角色？',
    '为什么这些工具不能是「开发完再补」的？'
  ],
  sections: [
  {
    type: 'text',
    title: '引擎的第一件功能是「能被观察」',
    html: `<p>物理没撞上、动画穿模、寻路撞墙——这些问题共同的特点是<b>光看画面看不出来</b>。所以成熟引擎的第一批功能不是渲染特效，而是<b>观察工具</b>：</p>
<table>
  <tr><th>工具</th><th>画什么</th><th>回答什么问题</th></tr>
  <tr><td>debug draw</td><td>碰撞框/速度向量/射线/网格覆盖</td><td>「模拟层眼里世界长什么样」</td></tr>
  <tr><td>profiler 条</td><td>每帧时间拆成 sim/逻辑/渲染三段</td><td>「这一帧的时间花在哪了」</td></tr>
  <tr><td>控制台/日志</td><td>带帧号的事件流水</td><td>「什么时候发生了什么」</td></tr>
  <tr><td>HUD 开关</td><td>以上全部按层开关</td><td>「按需组合观察手段」</td></tr>
</table>
<p>本课把这些装进同一个小沙盘：物理球世界里按 1~5 开关五种观察层——<b>给之前所有课程实验同款的自省能力</b>。</p>`
  },
  {
    type: 'text',
    title: 'debug draw 的工程纪律',
    html: `<p>debug draw 有三条铁律：<b>①零侵入</b>——工具代码与游戏逻辑分离，删掉工具一行不用改游戏；<b>②零成本关闭</b>——生产构建里这些绘制要么不编译要么一分支跳过；<b>③带帧号</b>——日志没有帧号就没有「何时」。Godot 的实现散布在 RenderingServer（ ImmediateMesh/调试材质）、物理服务器的 debug 步进回调与编辑器的 profiler 面板——本课把它们浓缩成一层可开关的 2D 覆盖。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'debugtools',
    title: '实验：五层观察沙盘（1~5 开关 + 控制台）',
    height: 620,
    code: `// 空格=暂停  P=再生成 8 颗球  1=碰撞框 2=速度向量 3=射线 4=空间网格 5=剖析条
// 底部控制台:带帧号的事件流水;按住左键=用射线吸引球

var MAXB = 40;

engine.run({
  setup: function (state) {
    state.paused = false;
    state.frame = 0;
    state.layers = { 1: true, 2: false, 3: false, 4: false, 5: false };
    state.bx = new Float32Array(MAXB);
    state.by = new Float32Array(MAXB);
    state.bvx = new Float32Array(MAXB);
    state.bvy = new Float32Array(MAXB);
    state.bn = 0;
    state.rng = mulberry32(20260903);
    state.console = [];
    state.frameBars = [];
    state.msSim = []; state.msDraw = [];
    state.rayHits = 0;
    for (var i = 0; i < 12; i++) spawnBall(state);
    clog(state, '沙盘就绪:12 颗球,5 层观察待命');
  },

  update: function (state, dt, input) {
    state.frame++;
    if (input.pressed('Space')) { state.paused = !state.paused; clog(state, (state.paused ? '暂停' : '继续') + ' @帧' + state.frame); }
    if (input.pressed('KeyP')) { for (var p = 0; p < 8 && state.bn < MAXB; p++) spawnBall(state); clog(state, '生成 8 颗球,当前 ' + state.bn + ' 颗 @帧' + state.frame); }
    var keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    var names = ['碰撞框', '速度向量', '射线', '空间网格', '剖析条'];
    for (var k = 0; k < 5; k++) {
      if (input.pressed(keys[k])) {
        state.layers[k + 1] = !state.layers[k + 1];
        clog(state, names[k] + '层' + (state.layers[k + 1] ? '开启' : '关闭') + ' @帧' + state.frame);
      }
    }
    var t0 = performance.now();
    if (!state.paused) stepSim(state, dt, input);
    var t1 = performance.now();
    pushAvg(state.msSim, t1 - t0);
    state.msDraw = state.msSim;   // 本课渲染即覆盖层,合并计
    var bucket = { sim: avg(state.msSim), fps: 1000 / Math.max(16.6, avg(state.msSim) + 14) };
    state.frameBars.push(bucket);
    if (state.frameBars.length > 90) state.frameBars.shift();
    while (state.console.length > 6) state.console.shift();
  },

  draw: function (state, ctx) {
    var t0 = performance.now();
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var x0 = 16, y0 = 44, W = 620, H = 400;
    ctx.fillStyle = '#101826';
    ctx.fillRect(x0, y0, W, H);
    if (state.layers[4]) drawGrid(state, ctx, x0, y0, W, H);
    for (var i = 0; i < state.bn; i++) {
      var px = x0 + state.bx[i], py = y0 + state.by[i];
      if (state.layers[1]) {
        ctx.strokeStyle = '#6ee7b7';
        ctx.strokeRect(px - 7, py - 7, 14, 14);
      }
      if (state.layers[2]) {
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + state.bvx[i] * 0.18, py + state.bvy[i] * 0.18);
        ctx.stroke();
      }
      if (state.layers[3]) {
        var mx = state.mouse ? state.mouse.x - x0 : 560;
        var my = state.mouse ? state.mouse.y - y0 : 200;
        ctx.strokeStyle = 'rgba(248,113,113,0.5)';
        ctx.beginPath();
        ctx.moveTo(x0 + 560, y0 + 200);
        ctx.lineTo(px, py);
        ctx.stroke();
        if (rayHit(state, 560, 200, state.bx[i], state.by[i], mx, my)) {
          ctx.fillStyle = '#f87171';
          ctx.fillRect(px - 2, py - 2, 4, 4);
        }
      }
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, 6.2832);
      ctx.fill();
    }
    ctx.strokeStyle = '#2c3e55';
    ctx.strokeRect(x0, y0, W, H);
    if (state.layers[5]) drawProfiler(state, ctx, x0, y0 + H + 10);
    drawConsole(state, ctx);
    drawHud(state, ctx);
    state.lastDraw = performance.now() - t0;
  }
});

// ---------- 模拟与观察 ----------

function spawnBall(state) {
  if (state.bn >= MAXB) return;
  var i = state.bn++;
  state.bx[i] = 30 + state.rng() * 560;
  state.by[i] = 30 + state.rng() * 340;
  state.bvx[i] = (state.rng() - 0.5) * 160;
  state.bvy[i] = (state.rng() - 0.5) * 160;
}

function stepSim(state, dt, input) {
  state.mouse = { x: input.mouse.x, y: input.mouse.y, down: input.mouse.down };
  for (var i = 0; i < state.bn; i++) {
    if (input.mouse.down) {
      var dx = input.mouse.x - 16 - state.bx[i], dy = input.mouse.y - 44 - state.by[i];
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      state.bvx[i] += dx / d * 90 * dt;
      state.bvy[i] += dy / d * 90 * dt;
    }
    state.bvx[i] *= (1 - 0.1 * dt);
    state.bvy[i] *= (1 - 0.1 * dt);
    state.bx[i] += state.bvx[i] * dt;
    state.by[i] += state.bvy[i] * dt;
    if (state.bx[i] < 8) { state.bx[i] = 8; state.bvx[i] = Math.abs(state.bvx[i]); }
    if (state.bx[i] > 612) { state.bx[i] = 612; state.bvx[i] = -Math.abs(state.bvx[i]); }
    if (state.by[i] < 8) { state.by[i] = 8; state.bvy[i] = Math.abs(state.bvy[i]); }
    if (state.by[i] > 392) { state.by[i] = 392; state.bvy[i] = -Math.abs(state.bvy[i]); }
  }
}

function rayHit(state, x1, y1, x2, y2, mx, my) {
  // 射线=炮塔(560,200)到球;命中=球心距线段<10 且在指针半平面
  var dx = x2 - x1, dy = y2 - y1;
  var len2 = dx * dx + dy * dy || 1;
  var t = ((mx - x1) * dx + (my - y1) * dy) / len2;
  if (t < 0 || t > 1) return false;
  var px = x1 + dx * t, py = y1 + dy * t;
  var ddx = mx - px, ddy = my - py;
  return ddx * ddx + ddy * ddy < 100;
}

function drawGrid(state, ctx, x0, y0, W, H) {
  ctx.strokeStyle = 'rgba(91,143,214,0.3)';
  for (var gx = 0; gx <= W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(x0 + gx, y0);
    ctx.lineTo(x0 + gx, y0 + H);
    ctx.stroke();
  }
  for (var gy = 0; gy <= H; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + gy);
    ctx.lineTo(x0 + W, y0 + gy);
    ctx.stroke();
  }
  for (var i = 0; i < state.bn; i++) {
    var cx = Math.floor(state.bx[i] / 40) * 40, cy = Math.floor(state.by[i] / 40) * 40;
    ctx.fillStyle = 'rgba(91,143,214,0.22)';
    ctx.fillRect(x0 + cx, y0 + cy, 40, 40);
  }
  ctx.fillStyle = '#5b8fd6';
  ctx.font = '10px monospace';
  ctx.fillText('broadphase 网格(40px):占位格高亮', x0 + 6, y0 + 14);
}

function drawProfiler(state, ctx, x, y) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('剖析条(每帧:模拟耗时;蓝=正常 红=超 16.6ms 预算):', x, y + 2);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x, y + 8, 620, 26);
  var n = state.frameBars.length;
  for (var i = 0; i < n; i++) {
    var v = Math.min(16.6, state.frameBars[i].sim);
    var bh = v / 16.6 * 26;
    ctx.fillStyle = state.frameBars[i].sim > 16.6 ? '#f87171' : '#5b8fd6';
    ctx.fillRect(x + i * (620 / 90), y + 34 - bh, 620 / 90 - 1, bh);
  }
}

function drawConsole(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('控制台(带帧号的事件流水):', 16, 530);
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(16, 536, 620, 76);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(16, 536, 620, 76);
  ctx.font = '10px monospace';
  for (var i = 0; i < state.console.length; i++) {
    ctx.fillStyle = i === state.console.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.console[i], 22, 548 + i * 11);
  }
}

function clog(state, s) {
  state.console.push('[' + String(state.frame).padStart ? '[' + state.frame + '] ' + s : s);
}

function pushAvg(arr, v) {
  arr.push(v);
  if (arr.length > 30) arr.shift();
}

function avg(arr) {
  if (!arr.length) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var l = state.layers;
  ctx.fillText('帧 ' + state.frame + '  球 ' + state.bn + '  [1]碰撞框' + (l[1] ? '●' : '○') +
    ' [2]速度' + (l[2] ? '●' : '○') + ' [3]射线' + (l[3] ? '●' : '○') + ' [4]网格' + (l[4] ? '●' : '○') +
    ' [5]剖析' + (l[5] ? '●' : '○'), 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('空格=暂停  P=生成  按住左键=力场吸球  1~5=开关观察层', 660 - 470, 26);
}`

  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>全开五层：</b>同一帧里你看五种真相——碰撞框是模拟的「真身」，速度向量是它的「意图」，射线是「提问」，网格是「检索结构」，剖析条是「体检表」。</li>
  <li><b>按 P 暴力生成：</b>球多到剖析条变红的瞬间，观察哪一层最贵——打开的观察层越多，overhead 越高，这正是「工具要能关」的原因。</li>
  <li><b>控制台对帧：</b>每个事件都带帧号——把它和剖析条对齐，「变红的那几帧发生了什么」一目了然。没有帧号的日志只是散文。</li>
  <li><b>按住左键画射线阵：</b>开启射线层后，所有炮塔-球连线实时重算——debug draw 的成本也过帧预算，工业引擎会做分级 LOD。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的自省设施',
    files: [
      { path: 'servers/rendering/renderer_rd/effects/debug_effects.cpp', note: '渲染后端的调试效果集合：阴影级联可视化、光照体绘制等「引擎看见自己」的画面从这出。建议搜索：debug、cascades、visualize。' },
      { path: 'main/performance.cpp', note: '引擎性能计数器：PERF_WATCH 系列把帧时间/对象数/显存做成可订阅的表——HUD 与剖析器共同的 数据源。建议搜索：PERF_WATCH、add_zone_monitor。' },
      { path: 'editor/debugger/editor_debugger_server.cpp', note: '编辑器调试器服务：把运行中的游戏状态流回编辑器面板（远端剖析/日志）的通道。建议搜索：debugger、_put_msg、profiler。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>调试工具链是引擎的神经系统：debug draw 传递「空间真相」、剖析条传递「时间真相」、控制台传递「事件真相」。三者都带开关、都带帧号、都零侵入——这是它们能陪引擎走到最后的纪律。</p>
<ul>
  <li><b>数据怎么流动？</b>模拟状态→各观察层独立取数→覆盖绘制；事件→控制台；帧耗时→剖析环。</li>
  <li><b>所有权归谁？</b>工具层不拥有任何游戏状态——它只读；关闭即零成本（一个布尔分支）。</li>
  <li><b>什么时候发生？</b>与游戏同帧发生但排在逻辑之后；生产构建里整层剔除——观察是开发时的特权。</li>
</ul>`
  }
  ]
};
