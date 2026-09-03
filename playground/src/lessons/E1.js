// E1 · 定点数与确定性:帧同步的地基
export default {
  id: 'E1',
  title: '定点数与确定性：帧同步的地基',
  est: '2 小时',
  coreQuestions: [
    '帧同步凭什么能只传输入？它对「计算」提出了什么苛刻要求？',
    'float 的舍入误差怎么滚成雪球？第一个分叉帧意味着什么？',
    '定点数的加减乘除怎么做？平方根这类「除不尽」的运算怎么办？',
    '为什么 lockstep 引擎连 Math.sin 都要慎用？'
  ],
  sections: [
  {
    type: 'text',
    title: '帧同步的豪赌：只传输入，各自计算',
    html: `<p>帧同步（lockstep）网游只广播「第 N 帧玩家按了什么」，每台机器<b>各自</b>跑同一份模拟——省下的是整个世界状态的带宽，押上的是<b>确定性</b>：任何一台机器算出的任何一个比特不同，雪球从此越滚越大，几百帧后「你看到的游戏」和「他看到的游戏」是两个世界。</p>
<p><b>float 就是那个先裂缝。</b>同样的 0.1+0.2，同样的代码，不同编译器、不同 CPU 指令集、甚至不同的中间精度（x87 的 80 位寄存器、FMA 融合乘加）都可能给出最后一个比特不同的结果。本课实验让「float 世界」和「定点世界」跑同一条混沌弹球，看哈希对账从第几帧分叉。</p>`
  },
  {
    type: 'text',
    title: '定点数：把小数变成整数的手艺',
    html: `<p>定点数的思路：<b>约定小数点位置，全程用整数算</b>。取 1024 表示 1.0，则 0.5 存成 512、0.25 存成 256：</p>
<table>
  <tr><th>运算</th><th>实现</th><th>要点</th></tr>
  <tr><td>加/减</td><td>整数加减</td><td>精确、可交换、任何平台同一结果</td></tr>
  <tr><td>乘</td><td>(a*b + 512) / 1024 再取整</td><td>舍入方向要全项目统一</td></tr>
  <tr><td>除</td><td>(a*1024) / b 取整</td><td>除不尽时有约定误差，但误差可复现</td></tr>
  <tr><td>开方/三角</td><td>查表 / 牛顿迭代整数版</td><td>绝不调平台 sin/sqrt——那是不确定性的上游源头</td></tr>
</table>
<p>代价是动态范围和精度都锁死在刻度上；收益是<b>每一次运算在任何机器上比特级相同</b>——这正是回放（E3）、帧同步和反外挂对账敢把命押在上面的地基。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'fixedpoint',
    title: '实验：float 世界 vs 定点世界——万步对账分叉现场',
    height: 620,
    code: `// 空格=开始/暂停快进  回车=换初始条件重来  同一条混沌弹球,两套数字域各自跑
// 弹球带位置相关的间断加速项:微小的舍入差会被反弹和间断逐帧放大

var CHECK_GAP = 500, TOTAL_STEPS = 10000;

engine.run({
  setup: function (state) {
    state.run = false;
    state.step = 0;
    state.seedIv = 1;
    initWorlds(state);
    state.log = ['按空格开始万步快进'];
  },

  update: function (state, dt, input) {
    if (input.pressed('Space')) {
      state.run = !state.run;
      pushLog(state, state.run ? '快进中:每帧 8 步' : '暂停');
    }
    if (input.pressed('Enter')) {
      state.seedIv++;
      initWorlds(state);
      pushLog(state, '重开:第 ' + state.seedIv + ' 组初始条件');
    }
    if (!state.run) return;
    for (var k = 0; k < 8 && state.step < TOTAL_STEPS; k++) {
      stepBoth(state);
      state.step++;
      if (state.step % CHECK_GAP === 0) record(state);
    }
    if (state.step >= TOTAL_STEPS && state.run) {
      state.run = false;
      pushLog(state, state.diverged ? '对账结束:分叉于第 ' + state.divergeFrame + ' 步' : '对账结束:居然全同(理论上不该发生)');
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawHud(state, ctx);
    drawHashes(state, ctx);
    drawDrift(state, ctx);
  }
});

// ---------- 两个世界 ----------

var SCALE = 1024;
var DT_F = 1 / 64;
var DT_I = 16;                    // 1/64 秒的定点表示:16/1024
var BOX_F = 4.0, BOX_I = 4096;    // 盒子 4 米

function initWorlds(state) {
  var r = mulberry32(20260903 * state.seedIv % 2147483647);
  state.f = [];
  state.i = [];
  for (var b = 0; b < 3; b++) {
    state.f.push({ x: 0.5 + b * 1.2, v: 0.6 + r() * 0.5 });
    var iv = Math.floor((0.6 + r() * 0.5) * SCALE);
    state.i.push({ x: Math.floor((0.5 + b * 1.2) * SCALE), v: iv });
  }
  state.step = 0;
  state.hf = [];
  state.hi = [];
  state.driftMax = 0;
  state.diverged = false;
  state.divergeFrame = -1;
  state.checks = [];
}

function stepBoth(state) {
  // float 世界
  for (var b = 0; b < 3; b++) {
    var e = state.f[b];
    var a = (e.x % 3.0 - 1.5) * 0.02;
    e.v += a * DT_F;
    e.x += e.v * DT_F;
    if (e.x > BOX_F) { e.x = 2 * BOX_F - e.x; e.v = -e.v; }
    if (e.x < 0) { e.x = -e.x; e.v = -e.v; }
  }
  // 定点世界:同一套物理,整数域
  for (var c = 0; c < 3; c++) {
    var q = state.i[c];
    var am = q.x % 3072 - 1536;
    var ai = Math.floor((am * 20 + 512) / 1024);
    q.v += ai * DT_I;
    q.x += q.v * DT_I;
    if (q.x > BOX_I) { q.x = 2 * BOX_I - q.x; q.v = -q.v; }
    if (q.x < 0) { q.x = -q.x; q.v = -q.v; }
  }
  // 漂移计
  for (var d = 0; d < 3; d++) {
    var diff = Math.abs(state.f[d].x - state.i[d].x / SCALE);
    if (diff > state.driftMax) state.driftMax = diff;
    if (!state.diverged && diff > 0.25) {
      state.diverged = true;
      state.divergeFrame = state.step;
    }
  }
}

function record(state) {
  var hf = 0, hi = 0;
  for (var b = 0; b < 3; b++) {
    hf = (Math.imul(hf, 31) + Math.floor(state.f[b].x * 1024)) | 0;
    hi = (Math.imul(hi, 31) + state.i[b].x) | 0;
  }
  state.hf.push(hf);
  state.hi.push(hi);
  state.checks.push({ at: state.step, same: hf === hi });
  if (!state.diverged && hf !== hi) {
    state.diverged = true;
    state.divergeFrame = state.step;
  }
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

// ---------- 绘制 ----------

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.9)';
  ctx.fillRect(8, 6, 704, 44);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('步数 ' + state.step + '/' + TOTAL_STEPS + '  ' + (state.run ? '快进中' : '已停') +
    '  最大漂移 ' + (state.driftMax * 1000).toFixed(3) + 'mm', 16, 24);
  ctx.fillStyle = state.diverged ? '#f87171' : '#6ee7b7';
  ctx.fillText(state.diverged ? '已分叉:首个不一致见红格(第 ' + state.divergeFrame + ' 步附近)' : '两世界尚且一致', 16, 42);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('空格=开始/暂停  回车=换初始条件', 470, 42);
}

function drawHashes(state, ctx) {
  var x0 = 16, y0 = 70;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('哈希对账(每 ' + CHECK_GAP + ' 步一格:上=float世界 下=定点世界)', x0, y0 - 6);
  var n = state.checks.length;
  for (var i = 0; i < n; i++) {
    var same = state.checks[i].same;
    var cx = x0 + (i % 10) * 69, cy = y0 + Math.floor(i / 10) * 64;
    ctx.strokeStyle = same ? '#6ee7b7' : '#f87171';
    ctx.strokeRect(cx, cy, 64, 54);
    ctx.fillStyle = same ? '#a7f3d0' : '#f87171';
    ctx.font = '10px monospace';
    ctx.fillText('f ' + fmtHash(state.hf[i]), cx + 4, cy + 16);
    ctx.fillText('i ' + fmtHash(state.hi[i]), cx + 4, cy + 32);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('步' + state.checks[i].at, cx + 4, cy + 48);
  }
}

function fmtHash(h) {
  var v = (h >>> 0).toString(16);
  var out = '';
  for (var i = 0; i < 6 - v.length; i++) out += '0';
  return out + v;
}

function drawDrift(state, ctx) {
  var x0 = 16, y0 = 560;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('最大漂移(mm,对数尺):', x0, y0 - 8);
  var f = state.driftMax * 1000;
  var bar = f <= 0 ? 0 : Math.min(1, Math.log10(f * 10 + 1) / 4);
  ctx.fillStyle = '#2c3e55';
  ctx.fillRect(x0 + 180, y0 - 18, 400, 14);
  ctx.fillStyle = f > 250 ? '#f87171' : '#f59e0b';
  ctx.fillRect(x0 + 180, y0 - 18, 400 * bar, 14);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('0.1mm', x0 + 180, y0 + 12);
  ctx.fillText('1m', x0 + 560, y0 + 12);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 420, 22 + i * 12);
  }
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>空格开始：</b>前几个对账格大概率还是绿的——浮点误差在悄悄累积；某一步起，加速项的间断点（x mod 3）处一侧刚好跨过边界，加速度符号翻转，轨迹分道扬镳，红格出现。</li>
  <li><b>看首个红格：</b>它就是「作弊发生帧」的隐喻——回放对账（E3）定位 bug/外挂，靠的就是这条哈希链上第一个不一致的格子。</li>
  <li><b>回车换初始条件：</b>有的初始条件下能撑到最后才分叉，有的一千步内就崩——混沌系统对舍入误差的放大是随机应变的，这正是它可怕的地方。</li>
  <li><b>盯漂移尺：</b>从毫米级涨到米级只要几千步——「最后一个比特的不同」从来不是小问题。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：确定性的三道关卡',
    files: [
      { path: 'core/math/math_funcs.cpp', note: '平台数学函数的实现层：sin/sqrt 这类函数在不同平台可能给出最后一个比特不同的结果——lockstep 引擎慎用它们的原因。建议搜索：sin、sqrt、fast。' },
      { path: 'main/main.cpp', note: 'Main::iteration 的固定步主循环：回放与帧同步的节拍器——「同一份输入按同一顺序喂给同一个循环」的循环。建议搜索：iteration、fixed_fps、advance。' },
      { path: 'core/input/input.cpp', note: '输入单例：lockstep 录制的第一数据源——只有「按帧采样的离散输入」是安全的同步内容，采样时序本身就是约定的一部分。建议搜索：parse_input_event、action_press。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>帧同步把「网络」问题变成了「计算」问题：只要计算确定，输入就是唯一需要同步的东西。定点数用「整数+统一舍入约定」买下比特级一致，代价是精度刻度与实现纪律；受控 float 路线（锁指令集/禁超越函数）是工业界的折中。</p>
<ul>
  <li><b>数据怎么流动？</b>输入→固定步模拟（同一顺序、同一运算）→世界状态→定期哈希→对账链；任何一环引入平台差异，链就会在那一帧断开。</li>
  <li><b>所有权归谁？</b>状态归模拟独有且可整体重建——所以哈希才能概括「整个世界」；定点工具函数全项目共享同一份舍入约定。</li>
  <li><b>什么时候发生？</b>模拟在固定步内推进，哈希在对账点计算，分叉定位在回放时进行——三件事都被钉在「帧」这把尺子上。</li>
</ul>`
  }
  ]
};
