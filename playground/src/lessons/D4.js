// D4 · 粒子系统架构:CPU vs GPU 粒子
export default {
  id: 'D4',
  title: '粒子系统架构：CPU vs GPU 粒子',
  est: '2 小时',
  coreQuestions: [
    '一个粒子系统拆开是哪三段？「池与回收」为什么是性能的命根？',
    'CPU 粒子和 GPU 粒子各把成本花在哪、把灵活性丢在哪？',
    '模拟耗时和绘制耗时为什么要分开看？',
    'Godot 为什么同时保留 CPUParticles 和 GPUParticles 两套？'
  ],
  sections: [
  {
    type: 'text',
    title: '粒子系统的引擎级三段式',
    html: `<p>所有粒子系统都是同一条管线：<b>emitter（发射器）→ affector（影响器）→ pool（池）</b>。</p>
<table>
  <tr><th>段</th><th>管什么</th><th>典型内容</th></tr>
  <tr><td>emitter</td><td>粒子从哪来</td><td>发射形状/速率/初速方向</td></tr>
  <tr><td>affector</td><td>粒子怎么活</td><td>重力/风/湍流/吸引，颜色与尺寸随寿命的曲线</td></tr>
  <tr><td>pool</td><td>粒子住哪</td><td>环形缓冲：死了的槽位原地复用，帧内绝不反复分配</td></tr>
</table>
<p><b>池是命根</b>：每秒上千个粒子生生死死，若走「new 一个对象、死了丢给 GC」，垃圾回收的尖峰会把帧时间打成锯齿。SoA 平行数组 + 槽位复用，让「发射一万颗粒子」只是一万次数组写。</p>`
  },
  {
    type: 'text',
    title: 'CPU vs GPU：把模拟搬进显存',
    html: `<table>
  <tr><th>维度</th><th>CPU 粒子</th><th>GPU 粒子</th></tr>
  <tr><td>数据在哪</td><td>主内存，每帧读改写</td><td>显存，模拟整个跑在 shader 里，数据不出卡</td></tr>
  <tr><td>吞吐</td><td>万级</td><td>十万到百万级</td></tr>
  <tr><td>灵活性</td><td>任意 gameplay 交互（读血量、查导航）</td><td>读回难，与游戏逻辑交互是弱项</td></tr>
  <tr><td>成本结构</td><td>模拟在 CPU、绘制走 API 提交</td><td>模拟+绘制都在 GPU，CPU 只发一次指令</td></tr>
</table>
<p>Godot 同时保留 <b>CPUParticles 与 GPUParticles</b> 两套组件，正是这条取舍的产品化：特效美术要百万火星用 GPU，玩法要「粒子打到开关」用 CPU。本课实验是 CPU 路线——因为你正在用 JS 写它，但成本结构的观察方法两边通用。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'particles',
    title: '实验：万级 CPU 粒子池（模拟/绘制成本分离）',
    height: 620,
    code: `// T=湍流  G=重力反转  P=纯模拟不绘制  空格=爆发3000  按住左键=吸引 右键=排斥
// HUD 实时拆账:存活数 / 发射速率 / 模拟ms / 绘制ms

var CAP = 12000;

engine.run({
  setup: function (state) {
    state.rng = mulberry32(20260903);
    state.x = new Float32Array(CAP);
    state.y = new Float32Array(CAP);
    state.vx = new Float32Array(CAP);
    state.vy = new Float32Array(CAP);
    state.life = new Float32Array(CAP);
    state.max = new Float32Array(CAP);
    state.count = 0;
    state.t = 0;
    state.emitAcc = 0;
    state.rate = 900;
    state.turb = true;
    state.grav = 1;
    state.pure = false;
    state.simMs = []; state.drawMs = [];
    state.cx = 360; state.cy = 300;
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (input.pressed('KeyT')) { state.turb = !state.turb; }
    if (input.pressed('KeyG')) { state.grav = -state.grav; }
    if (input.pressed('KeyP')) { state.pure = !state.pure; }
    // 发射:速率累积(爆发=一次性灌 3000)
    state.emitAcc += state.rate * dt;
    var burst = input.pressed('Space') ? 3000 : 0;
    var want = Math.floor(state.emitAcc) + burst;
    if (want > 0) {
      state.emitAcc -= Math.floor(state.emitAcc);
      var t0 = performance.now();
      for (var w = 0; w < want; w++) spawn(state);
      t0 = performance.now() - t0;
      if (burst > 0) state.burstMs = t0;
    }
    // 模拟
    var s0 = performance.now();
    step(state, dt, input);
    var s1 = performance.now();
    pushAvg(state.simMs, s1 - s0);
    // 绘制(纯模拟模式跳过)
    if (!state.pure) {
      var d0 = performance.now();
      state.drawList = collectDraw(state);
      var d1 = performance.now();
      pushAvg(state.drawMs, d1 - d0);
    } else {
      state.drawList = null;
      pushAvg(state.drawMs, 0);
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.drawList) {
      var xs = state.drawList.xs, ys = state.drawList.ys, cs = state.drawList.cs, n = state.drawList.n;
      for (var i = 0; i < n; i++) {
        ctx.fillStyle = cs[i];
        ctx.fillRect(xs[i], ys[i], 2.4, 2.4);
      }
    }
    // 发射器
    ctx.strokeStyle = '#ffd479';
    ctx.beginPath();
    ctx.arc(state.cx, state.cy, 7, 0, 6.2832);
    ctx.stroke();
    drawHud(state, ctx);
  }
});

// ---------- 池:SoA + 交换删除 ----------

function spawn(state) {
  var a = state.rng() * 6.2832;
  var sp = 40 + state.rng() * 120;
  if (state.count >= CAP) {
    // 池满:朴素溢出策略——覆盖最新写入的槽位(工业实现多用环形序或按寿命淘汰)
    state.count = CAP - 1;
  }
  var i = state.count;
  state.x[i] = state.cx;
  state.y[i] = state.cy;
  state.vx[i] = Math.cos(a) * sp;
  state.vy[i] = Math.sin(a) * sp - 30;
  state.max[i] = 1.1 + state.rng() * 1.1;
  state.life[i] = state.max[i];
  state.count++;
}

function step(state, dt, input) {
  var g = 70 * state.grav;
  var turb = state.turb;
  var t = state.t;
  var mx = input.mouse.x, my = input.mouse.y;
  var attract = input.mouse.down === true && input.mouse.clicked !== true;
  var repel = input.mouse.clicked === true;
  var i = 0;
  while (i < state.count) {
    state.life[i] -= dt;
    if (state.life[i] <= 0) {
      // 交换删除:最后一颗补位,槽位即刻复用
      state.count--;
      state.x[i] = state.x[state.count];
      state.y[i] = state.y[state.count];
      state.vx[i] = state.vx[state.count];
      state.vy[i] = state.vy[state.count];
      state.life[i] = state.life[state.count];
      state.max[i] = state.max[state.count];
      continue;
    }
    var vx = state.vx[i], vy = state.vy[i];
    vy += g * dt;
    if (turb) {
      vx += Math.sin(state.y[i] * 0.02 + t * 2.1) * 26 * dt;
      vy += Math.cos(state.x[i] * 0.017 - t * 1.7) * 26 * dt;
    }
    if (attract || repel) {
      var dx = mx - state.x[i], dy = my - state.y[i];
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      var f = (attract ? 90 : -90) / d;
      vx += dx / d * f * dt;
      vy += dy / d * f * dt;
    }
    state.vx[i] = vx;
    state.vy[i] = vy;
    state.x[i] += vx * dt;
    state.y[i] += vy * dt;
    i++;
  }
}

function collectDraw(state) {
  var n = state.count;
  var xs = new Float32Array(n), ys = new Float32Array(n), cs = new Array(n);
  for (var i = 0; i < n; i++) {
    xs[i] = state.x[i];
    ys[i] = state.y[i];
    var f = state.life[i] / state.max[i];
    cs[i] = f > 0.75 ? '#e8f4ff' : (f > 0.35 ? '#5b8fd6' : '#f59e0b');
  }
  return { xs: xs, ys: ys, cs: cs, n: n };
}

// ---------- 工具与 HUD ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 58);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('存活 ' + state.count + '/' + CAP + '  发射 ' + state.rate + '/s  湍流 ' + (state.turb ? 'ON' : 'OFF') +
    '  重力 ' + (state.grav > 0 ? '↓' : '↑') + '  模式 ' + (state.pure ? '纯模拟(不绘制)' : '模拟+绘制'), 16, 26);
  var sm = avg(state.simMs), dm = avg(state.drawMs);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('模拟 ' + sm.toFixed(2) + 'ms', 16, 46);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('绘制 ' + dm.toFixed(2) + 'ms', 140, 46);
  ctx.fillStyle = '#f87171';
  ctx.fillText('合计 ' + (sm + dm).toFixed(2) + 'ms / 16.6ms 帧预算', 264, 46);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('T=湍流  G=反转重力  P=纯模拟  空格=爆发3000  按住左键=吸引 右键=排斥', 16, 600);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>看成本结构：</b>湍流全开（默认）时模拟 ms 和绘制 ms 各占多少？按 P 进纯模拟模式——绘制那根柱瞬间归零，这就是「模拟与绘制分离」的账本。</li>
  <li><b>爆发看池：</b>空格一次灌 3000，存活数冲上平台又随寿命曲线整体衰减——池的占用率就是粒子系统的心电图。</li>
  <li><b>指针当力场：</b>按住左键拖一大圈，粒子群跟队成尾流；换右键把它们炸开——affector 只是「每帧往速度上加一项」的函数，你也写得出新的。</li>
  <li><b>把帧预算当尺子：</b>合计 ms 逼近 16.6 时浏览器开始掉帧——GPU 粒子的意义此刻不言自明：把左栏那根模拟柱整根搬进显存。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：从 JS 池到显存池',
    files: [
      { path: 'servers/rendering/renderer_rd/shaders/particles.glsl', note: 'GPU 粒子的模拟本体：emitter/affector（重力/湍流/吸引/碰撞）全在 shader 里，CPU 只负责发参数。建议搜索：USING_TURBULENCE、attractor、collide。' },
      { path: 'servers/rendering/renderer_rd/storage_rd/particles_storage.cpp', note: 'GPU 粒子的池：粒子缓冲的分配与管理系统，本课「池与回收」的显存版。建议搜索：alloc_particles、ParticleSystem、particle_buffer。' },
      { path: 'servers/rendering/rendering_server.h', note: '节点侧与后端的边界：particles_create() 返回 RID + 一串 set 参数——命令式 API 让 CPUParticles/GPUParticles 两种实现共用同一层抽象。建议搜索：particles_create、particles_set_emitting。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>粒子系统 = emitter × affector × pool 三段式；性能上限由「数据住哪」决定——主内存的池换来灵活性，显存的池换来吞吐。Godot 双轨并存的深意：引擎不该替你做这个取舍。</p>
<ul>
  <li><b>数据怎么流动？</b>发射→槽位写入→affector 逐项改速度/位置→寿命归零交还槽位→绘制提交；GPU 版把中段整体搬进 shader，数据全程不出卡。</li>
  <li><b>所有权归谁？</b>粒子没有身份，只有槽位——池拥有全部存储，交换删除让「死亡」变成一次数组拷贝，GC 永远不入场。</li>
  <li><b>什么时候发生？</b>发射按速率每帧累积；模拟走固定 dt；绘制紧随其后但可被 P 键单独关掉——能分开计量，才谈得上优化。</li>
</ul>`
  }
  ]
};
