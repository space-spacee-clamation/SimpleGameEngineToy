// L1 · 性能剖析器怎么做
export default {
  id: 'L1',
  title: '性能剖析器怎么做',
  est: '2 小时',
  coreQuestions: [
    '插桩（instrumentation）和采样（sampling）各在测什么、各骗你什么？',
    '一帧的时间线怎么被拆成「谁占了谁」？',
    '热点榜（hotspots）为什么比总耗时更有用？',
    '剖析器自身的开销（observer effect）怎么量、怎么躲？'
  ],
  sections: [
  {
    type: 'text',
    title: '两种流派：插桩与采样',
    html: `<table>
  <tr><th>流派</th><th>做法</th><th>强项 / 盲区</th></tr>
  <tr><td>插桩</td><td>在代码关键点埋 performance.now 之类的「打卡机」</td><td>精确知道「哪一段」耗时 / 只有被埋的点才可见，且打卡本身有开销</td></tr>
  <tr><td>采样</td><td>每隔固定间隔拍一张「调用栈快照」，统计落点频率</td><td>零侵入、全覆盖 / 精度受采样频率限制，短函数会漏</td></tr>
</table>
<p>引擎内置剖析器（Godot 的 Profiler 面板）基本是插桩流：引擎在 process/physics/服务器调用等关键边界埋点，编辑器远程接收帧时间线。本课亲手埋四个点，体会它的能与不能。</p>`
  },
  {
    type: 'text',
    title: '时间线、热点榜与观察者效应',
    html: `<p><b>帧时间线</b>把一帧切成段：物理、寻路、粒子、逻辑各占一段——一眼看出「这帧 22ms 是寻路吃了 15ms」。<b>热点榜</b>把最近 N 帧按系统累计排序——它回答的是更重要的问题：<b>「我该优化谁」</b>。总耗时说「物理很贵」，热点榜说「寻路才是第一元凶」。</p>
<p><b>观察者效应</b>：每次 performance.now 都要花 0.5~2μs，一帧埋几十个点、60fps 跑一天——剖析本身也在烧时间。工程对策：埋点密度克制、生产构建整段剔除（F6 的「零成本关闭」）、以及<b>亲自量一次打卡机的开销</b>（本课右下角就量给你看）。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'profiler',
    title: '实验：迷你剖析器（帧时间线 + 热点榜 + 插桩开销）',
    height: 620,
    code: `// 1/2/3/4=给四个系统加负载(循环切换 关/轻/重)  T=时间线/热点榜  空格=暂停
// 四个系统:物理模拟 / 寻路查询 / 粒子更新 / 日志IO(故意低效的字符串拼接)

var SYS = ['物理', '寻路', '粒子', '日志'];
var LEVEL_MS = [0, 0.8, 3.5];

engine.run({
  setup: function (state) {
    state.levels = [1, 2, 1, 0];
    state.paused = false;
    state.showHot = false;
    state.frame = 0;
    state.tl = [];               // 每帧的时间线:各系统段
    state.frameMs = [];
    state.overhead = 0;
    state.rng = mulberry32(20260903);
    state.junk = [];
    state.log = ['1/2/3/4 加负载;找到第一元凶'];
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyT')) { state.showHot = !state.showHot; }
    if (input.pressed('Space')) { state.paused = !state.paused; }
    for (var k = 0; k < 4; k++) {
      if (input.pressed('Digit' + (k + 1))) {
        state.levels[k] = (state.levels[k] + 1) % 3;
        pushLog(state, SYS[k] + ' 负载=' + ['关', '轻', '重'][state.levels[k]]);
      }
    }
    if (state.paused) return;
    state.frame++;
    // 四个系统依序执行,各自插桩
    var segs = [];
    var frameStart = performance.now();
    for (var s = 0; s < 4; s++) {
      var t0 = performance.now();
      workload(state, s, LEVEL_MS[state.levels[s]]);
      var t1 = performance.now();
      segs.push(t1 - t0);
    }
    var frameTotal = performance.now() - frameStart;
    state.tl.push(segs);
    if (state.tl.length > 90) state.tl.shift();
    state.frameMs.push(frameTotal);
    if (state.frameMs.length > 90) state.frameMs.shift();
    // 量一次插桩自身的开销:空转 loop 对比 loop+4 次 now
    var n = 2000, t0 = performance.now();
    for (var q = 0; q < n; q++) { var dummy = q * 3; }
    var bare = performance.now() - t0;
    t0 = performance.now();
    for (var w = 0; w < n; w++) { var d2 = w * 3; performance.now(); performance.now(); performance.now(); performance.now(); }
    var withNow = performance.now() - t0;
    state.overhead = withNow - bare;
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (!state.showHot) drawTimeline(state, ctx);
    else drawHotspots(state, ctx);
    drawOverhead(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 工作负载:故意写实的四种开销 ----------

function workload(state, sys, ms) {
  if (ms <= 0) return;
  var deadline = performance.now() + ms;
  var acc = 0;
  while (performance.now() < deadline) {
    if (sys === 0) { acc += Math.sin(acc + 1.7) * Math.sqrt(acc + 2); }          // 物理:浮点密集
    else if (sys === 1) {
      var open = [];
      for (var i = 0; i < 60; i++) open.push({ f: state.rng(), g: i });          // 寻路:开表插入+扫最小
      var bi = 0;
      for (var j = 1; j < open.length; j++) if (open[j].f < open[bi].f) bi = j;
      acc += open[bi].f;
    } else if (sys === 2) {
      acc += state.rng() * 0.001;                                                 // 粒子:轻量取数
    } else {
      state.junk.push('frame' + state.frame + ' 写日志,字符串拼接是低效 IO 的替身 ' + acc);
      if (state.junk.length > 50) state.junk.shift();
      acc += state.junk.length;
    }
  }
}

// ---------- 工具 ----------

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

function avg(arr) {
  if (!arr.length) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

var COLORS = ['#6ee7b7', '#5b8fd6', '#f59e0b', '#f87171'];

// ---------- 绘制 ----------

function drawTimeline(state, ctx) {
  var x0 = 16, y0 = 56, w = 688, h = 300;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('帧时间线(最近 90 帧,堆叠段=各系统耗时,红框=超 16.6ms):', x0, y0 - 10);
  var n = state.tl.length;
  var bw = w / 90;
  for (var i = 0; i < n; i++) {
    var segs = state.tl[i];
    var yy = y0;
    var total = 0;
    for (var s = 0; s < 4; s++) {
      var hh = segs[s] * 6;
      ctx.fillStyle = COLORS[s];
      ctx.fillRect(x0 + i * bw, yy, bw - 1, hh);
      yy += hh;
      total += segs[s];
    }
    if (total > 16.6) {
      ctx.strokeStyle = '#f87171';
      ctx.strokeRect(x0 + i * bw, y0, bw - 1, Math.min(h, yy - y0));
    }
  }
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  // 16.6ms 预算线
  var by = y0 + 16.6 * 6;
  if (by < y0 + h) {
    ctx.strokeStyle = '#f87171';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, by);
    ctx.lineTo(x0 + w, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f87171';
    ctx.fillText('16.6ms 预算线', x0 + 4, by - 4);
  }
  // 图例
  for (var l = 0; l < 4; l++) {
    ctx.fillStyle = COLORS[l];
    ctx.fillRect(x0 + l * 100, y0 + h + 8, 10, 10);
    ctx.fillStyle = '#9db4d0';
    ctx.fillText(SYS[l] + ' ' + avgSeg(state, l).toFixed(2) + 'ms', x0 + l * 100 + 14, y0 + h + 17);
  }
}

function avgSeg(state, s) {
  var sum = 0;
  for (var i = 0; i < state.tl.length; i++) sum += state.tl[i][s];
  return state.tl.length ? sum / state.tl.length : 0;
}

function drawHotspots(state, ctx) {
  var x = 16, y = 56;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('热点榜(按平均耗时排序,该优化谁一目了然):', x, y - 10);
  var rows = [];
  for (var s = 0; s < 4; s++) rows.push({ name: SYS[s], ms: avgSeg(state, s), lvl: state.levels[s] });
  rows.sort(function (a, b) { return b.ms - a.ms; });
  var total = rows[0].ms + rows[1].ms + rows[2].ms + rows[3].ms;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var ry = y + i * 46;
    ctx.fillStyle = '#141a24';
    ctx.fillRect(x, ry, 688, 38);
    ctx.strokeStyle = i === 0 ? '#ffd479' : '#3b4d6b';
    ctx.strokeRect(x, ry, 688, 38);
    ctx.fillStyle = COLORS[SYS.indexOf(r.name)];
    ctx.fillRect(x + 8, ry + 8, 120 * Math.min(1, r.ms / Math.max(total / 2, 0.1)), 22);
    ctx.fillStyle = '#9db4d0';
    ctx.font = '12px monospace';
    ctx.fillText((i + 1) + '. ' + r.name + '  ' + r.ms.toFixed(2) + 'ms/帧  负载:' + ['关', '轻', '重'][r.lvl], x + 150, ry + 24);
    ctx.fillStyle = '#5b7397';
    ctx.fillText(total > 0 ? Math.round(r.ms / total * 100) + '%' : '0%', x + 620, ry + 24);
  }
  ctx.fillStyle = '#ffd479';
  ctx.font = '11px monospace';
  ctx.fillText('第一名是「下一刀该砍谁」——剖析器的全部输出就是这句话', x, y + 200);
}

function drawOverhead(state, ctx) {
  var x = 16, y = 380;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('插桩自身开销(2000 次循环,裸跑 vs 裸跑+4 次 performance.now):', x, y - 8);
  ctx.fillStyle = '#141a24';
  ctx.fillRect(x, y, 688, 46);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x, y, 688, 46);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('裸跑 ' + state.overhead.toFixed(1) + 'ms 档差 → 打卡机每次约 ' + (state.overhead / 2000 / 4 * 1000).toFixed(2) + 'μs', x + 10, y + 28);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('一帧埋 40 个点 ≈ 烧掉 ' + (state.overhead / 2000 / 4 * 40).toFixed(1) + 'μs/帧——克制埋点+生产剔除的理由', x + 380, y + 28);
}

function drawHud(state, ctx) {
  var total = state.frameMs.length ? avg(state.frameMs) : 0;
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('帧 ' + state.frame + (state.paused ? ' [暂停]' : '') + '  平均帧耗时 ' + total.toFixed(2) + 'ms  视图:' + (state.showHot ? '热点榜' : '时间线'), 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('1/2/3/4=四系统加负载  T=时间线/热点榜  空格=暂停', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('配方:把「寻路」和「粒子」都调到重——先超预算,再看热点榜点名', 430, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>先把「寻路」按到重：</b>时间线上蓝色段隆起，红框出现——超预算的帧被自动标记，这就是剖析器的「体检异常」。</li>
  <li><b>T 切热点榜：</b>排序把元凶顶到第一名并给出百分比——「该优化谁」比「总共多慢」更有行动价值。</li>
  <li><b>对比两种负载的成本：</b>「日志」调到重，涨得比「粒子」快得多——字符串拼接这种「隐形 IO」正是热点榜最擅长抓的隐形杀手。</li>
  <li><b>看插桩开销：</b>打卡机一次约 0.5~2μs，一帧埋 40 个点也才几十 μs——但它随埋点密度线性增长，所以工业剖析器的埋点是精心挑选的「关卡」而不是乱枪打鸟。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的剖析管线',
    files: [
      { path: 'main/performance.cpp', note: '性能计数器 PERF_WATCH：帧时间/对象数/显存等指标统一登记成可订阅表——剖析器与 HUD 的共同数据源。建议搜索：PERF_WATCH、add_zone_monitor。' },
      { path: 'editor/debugger/editor_debugger_server.cpp', note: '远程调试通道：把运行中游戏的剖析数据流回编辑器 Profiler 面板。建议搜索：profiler、_put_msg、enable_profiling。' },
      { path: 'editor/editor_log.cpp', note: '编辑器日志：带分类与等级的事件流水——控制台输出的正统实现（对照 F6 的迷你控制台）。建议搜索：add_line、set_indent、error。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>剖析器 = 插桩埋点（哪段多久）+ 时间线（一帧的解剖图）+ 热点榜（该优化谁）+ 开销自省（我量自己）。它把「感觉卡」变成「寻路 15ms」——性能优化的每一步都从这句话开始。</p>
<ul>
  <li><b>数据怎么流动？</b>关键边界打卡→每帧时间线→滑动窗口聚合→热点排序→超预算标记。</li>
  <li><b>所有权归谁？</b>埋点归引擎各子系统（各自知道自己该在哪打卡），聚合与展示归剖析器，开关归构建配置。</li>
  <li><b>什么时候发生？</b>插桩每帧常驻（编辑构建），采样/远程回传按需开启——「观察」与「运行」共享时间轴但互不污染。</li>
</ul>`
  }
  ]
};
