// D3 · 无限世界流式加载:cell 与内存预算
export default {
  id: 'D3',
  title: '无限世界流式加载：cell 与内存预算',
  est: '2 小时',
  coreQuestions: [
    '无限世界凭什么装进有限内存——cell 划分和坐标映射是怎么做的？',
    '同步硬加载和异步分帧加载，帧时间表上的差距有多触目？',
    '加载预算、优先级、LRU 卸载各解决什么问题？',
    '为什么说「同步加载是原型期的特权」？'
  ],
  sections: [
  {
    type: 'text',
    title: '无限世界 = 把空间切成 cell',
    html: `<p>「无限地图」从不无限——它只是<b>按需生成</b>。第一刀是把世界空间切成 <b>cell</b>（chunk）：世界坐标整除 cell 尺寸就映射到格子坐标，玩家周围半径 R 内的 cell 才有资格存在。每个 cell 的内容（地形网格、装饰、碰撞数据）在<b>进入半径时才加载</b>，离开太远就卸载。</p>
<p>于是引擎手里多了一支<b>加载队列</b>：谁先进来？<b>优先级 = 距离 + 视线加权</b>（你面朝的方向先加载）。一次进来多少？<b>预算说了算</b>——每帧只花固定的「加载工时」，花完就停，剩下的明天再干。</p>`
  },
  {
    type: 'text',
    title: '预算经济学：帧时间是硬通货',
    html: `<table>
  <tr><th>策略</th><th>帧时间表现</th><th>代价</th></tr>
  <tr><td>同步硬加载</td><td>进入半径的瞬间全量加载，帧时间爆出红色尖峰（卡顿锯齿）</td><td>实现一行代码</td></tr>
  <tr><td>异步 + 预算</td><td>工时被摊到许多帧上，帧时间平滑如镜</td><td>队列/优先级/状态机一套管家体系</td></tr>
</table>
<p>内存侧同理：<b>预算封顶 + LRU 卸载</b>——最久没被需要的 cell 先走。加载管线的关键认知：<b>玩家移动速度是需求方，预算是供给方</b>；冲刺（需求 ×2.4）就是给供给端上压力，这一课让你亲眼看见供给不足长什么样。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'streaming',
    title: '实验：流式加载模拟器（同步 vs 异步+预算）',
    height: 620,
    code: `// WASD/方向键移动  Shift=冲刺  Tab=切模式(同步/异步+预算)  Q/E=调预算  空格=换世界
// 左=世界(cell 点亮=已加载,渐亮=加载中)  右=队列/预算/内存面板  底部=帧时间柱状图

var CW = 14, COLS = 40, ROWS = 30;
var MEM_CELL = 2, MEM_BUDGET = 96;

engine.run({
  setup: function (state) {
    state.px = COLS * CW / 2;
    state.py = ROWS * CW / 2;
    state.hx = 1; state.hy = 0;
    state.mode = 1;              // 0=同步 1=异步+预算
    state.budget = 3;            // 每帧工时
    state.seed = 20260903;
    state.cells = {};
    state.queue = [];
    state.frameCost = [];
    state.overFrames = 0;
    state.unloading = {};
    state.log = ['异步+预算模式:Tab 可切同步对比'];
    rebuildSeed(state);
  },

  update: function (state, dt, input) {
    var sp = input.down('Shift') ? 8.4 : 3.5;
    var moved = false;
    if (input.down('KeyA') || input.down('ArrowLeft')) { state.px -= sp; state.hx = -1; state.hy = 0; moved = true; }
    if (input.down('KeyD') || input.down('ArrowRight')) { state.px += sp; state.hx = 1; state.hy = 0; moved = true; }
    if (input.down('KeyW') || input.down('ArrowUp')) { state.py -= sp; state.hx = 0; state.hy = -1; moved = true; }
    if (input.down('KeyS') || input.down('ArrowDown')) { state.py += sp; state.hx = 0; state.hy = 1; moved = true; }
    if (input.pressed('Tab')) {
      state.mode = 1 - state.mode;
      state.overFrames = 0;
      pushLog(state, state.mode === 1 ? '异步+预算模式(工时/帧=' + state.budget + ')' : '同步硬加载模式(进半径即全量)');
    }
    if (input.pressed('KeyQ')) { state.budget = Math.max(1, state.budget - 1); pushLog(state, '预算=' + state.budget); }
    if (input.pressed('KeyE')) { state.budget = Math.min(8, state.budget + 1); pushLog(state, '预算=' + state.budget); }
    if (input.pressed('Space')) { state.seed = (state.seed * 16807) % 2147483647; state.cells = {}; state.queue = []; rebuildSeed(state); pushLog(state, '换了个世界'); }

    state.px = clamp(state.px, 8, COLS * CW - 8);
    state.py = clamp(state.py, 8, ROWS * CW - 8);

    // 需求:半径内未加载的 cell 入队
    var pcx = state.px / CW, pcy = state.py / CW;
    var R = 5.5, i, key;
    var want = [];
    for (var gy = 0; gy < ROWS; gy++) {
      for (var gx = 0; gx < COLS; gx++) {
        key = gx + ',' + gy;
        if (state.cells[key] || state.queueMap[key]) continue;
        var d = dist(gx + 0.5, gy + 0.5, pcx, pcy);
        if (d <= R) {
          var dirx = (gx + 0.5) * CW - state.px, diry = (gy + 0.5) * CW - state.py;
          var norm = Math.sqrt(dirx * dirx + diry * diry) || 1;
          var face = (dirx / norm) * state.hx + (diry / norm) * state.hy;
          var prio = d + (face > 0.7 ? 0 : 2.5);
          want.push({ gx: gx, gy: gy, prio: prio, prog: 0, work: 0.6 + hash01(state, gx * 7 + 1, gy * 7 + 3) * 0.9 });
        }
      }
    }
    want.sort(function (a, b) { return a.prio - b.prio; });
    var loadedNow = 0;
    for (i = 0; i < want.length; i++) {
      if (state.mode === 0) {
        state.cells[key = want[i].gx + ',' + want[i].gy] = { prog: 1 };
        loadedNow++;
      } else {
        state.queue.push(want[i]);
        state.queueMap[want[i].gx + ',' + want[i].gy] = 1;
      }
    }
    // 供给:异步模式按预算花工时
    var work = state.mode === 1 ? state.budget : 0;
    while (work > 0 && state.queue.length) {
      var head = state.queue[0];
      var rate = Math.min(work, head.work - head.prog);
      head.prog += rate;
      work -= rate;
      if (head.prog >= head.work - 0.0001) {
        state.cells[head.gx + ',' + head.gy] = { prog: 1 };
        state.queueMap[head.gx + ',' + head.gy] = 0;
        state.queue.shift();
      }
    }
    // 内存:超预算 LRU 卸载最远的已加载 cell
    var memBytes = 0, keys = [];
    for (key in state.cells) {
      memBytes += MEM_CELL;
      var parts = key.split(',');
      keys.push({ key: key, d: dist(+parts[0] + 0.5, +parts[1] + 0.5, pcx, pcy) });
    }
    var mem = Math.min(MEM_BUDGET, memBytes);
    while (memBytes > MEM_BUDGET) {
      keys.sort(function (a, b) { return b.d - a.d; });
      var far = keys.shift();
      if (!far || far.d <= R + 1) break;   // 半径+1 内的不卸
      delete state.cells[far.key];
      state.unloading[far.key] = 0.3;
      memBytes -= MEM_CELL;
    }
    for (key in state.unloading) {
      state.unloading[key] -= dt;
      if (state.unloading[key] <= 0) delete state.unloading[key];
    }
    state.mem = mem;
    state.loadedCount = 0;
    for (key in state.cells) state.loadedCount++;

    // 帧时间模型:同步=基础3ms+每个硬加载12ms;异步=基础3ms+每工时0.35ms
    var ms = 3;
    if (state.mode === 0) ms += loadedNow * 12;
    else ms += state.budget * 0.35;
    state.frameCost.push(ms);
    if (state.frameCost.length > 120) state.frameCost.shift();
    if (ms > 16.6) state.overFrames++;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawWorld(state, ctx);
    drawPanel(state, ctx);
    drawFrameChart(state, ctx);
  }
});

// ---------- 工具 ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function dist(x1, y1, x2, y2) {
  var dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function rebuildSeed(state) {
  state.hashBase = state.seed % 65020;
  state.queueMap = {};
}

function hash01(state, a, b) {
  var v = (state.hashBase + a * 251 + b * 173) % 65025;
  return (v % 1000) / 1000;
}

// ---------- 绘制 ----------

function drawWorld(state, ctx) {
  var x0 = 16, y0 = 44;
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(x0, y0, COLS * CW, ROWS * CW);
  var gx, gy, key;
  for (gy = 0; gy < ROWS; gy++) {
    for (gx = 0; gx < COLS; gx++) {
      key = gx + ',' + gy;
      var h = hash01(state, gx + 3, gy + 5);
      var px = x0 + gx * CW, py = y0 + gy * CW;
      if (state.cells[key]) {
        ctx.fillStyle = h > 0.72 ? '#2b5d8a' : (h > 0.4 ? '#2f6d4f' : '#3b5a3f');
        ctx.fillRect(px + 1, py + 1, CW - 2, CW - 2);
      } else if (state.queueMap[key]) {
        var q = findQueue(state, key);
        var p = q ? q.prog / q.work : 0;
        ctx.fillStyle = 'rgb(' + Math.floor(20 + 60 * p) + ',' + Math.floor(26 + 90 * p) + ',' + Math.floor(40 + 60 * p) + ')';
        ctx.fillRect(px + 1, py + 1, CW - 2, CW - 2);
      } else if (state.unloading[key]) {
        ctx.fillStyle = '#3a2a20';
        ctx.fillRect(px + 1, py + 1, CW - 2, CW - 2);
      } else {
        ctx.fillStyle = '#121a28';
        ctx.fillRect(px + 1, py + 1, CW - 2, CW - 2);
      }
    }
  }
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, COLS * CW, ROWS * CW);
  // 玩家与朝向
  var px2 = x0 + state.px, py2 = y0 + state.py;
  ctx.strokeStyle = 'rgba(255,212,121,0.25)';
  ctx.beginPath();
  ctx.arc(px2, py2, 5.5 * CW, 0, 6.2832);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px2, py2, 4, 0, 6.2832);
  ctx.fill();
  ctx.strokeStyle = '#ffd479';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px2, py2);
  ctx.lineTo(px2 + state.hx * 12, py2 + state.hy * 12);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function findQueue(state, key) {
  for (var i = 0; i < state.queue.length; i++) {
    if (state.queue[i].gx + ',' + state.queue[i].gy === key) return state.queue[i];
  }
  return null;
}

function drawPanel(state, ctx) {
  var x = 592, y = 48;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText(state.mode === 1 ? '异步+预算' : '同步硬加载', x, y);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('队列(按优先级)', x, y + 22);
  for (var i = 0; i < Math.min(8, state.queue.length); i++) {
    var q = state.queue[i];
    var p = Math.floor(q.prog / q.work * 6);
    var bar = '';
    for (var k = 0; k < 6; k++) bar += k < p ? '▓' : '░';
    ctx.fillStyle = i === 0 ? '#ffd479' : '#5b7397';
    ctx.fillText('(' + q.gx + ',' + q.gy + ') ' + bar, x, y + 40 + i * 16);
  }
  if (!state.queue.length) {
    ctx.fillStyle = '#3b4d6b';
    ctx.fillText('(空)', x, y + 40);
  }
  // 预算与内存
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('加载预算 ' + state.budget + ' 工时/帧(Q/E)', x, y + 190);
  ctx.fillStyle = '#2c3e55';
  ctx.fillRect(x, y + 200, 108, 10);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(x, y + 200, 108 * state.budget / 8, 10);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('内存 ' + state.mem + '/' + MEM_BUDGET + 'MB', x, y + 232);
  ctx.fillStyle = '#2c3e55';
  ctx.fillRect(x, y + 242, 108, 10);
  ctx.fillStyle = state.mem > MEM_BUDGET * 0.85 ? '#f87171' : '#5b8fd6';
  ctx.fillRect(x, y + 242, 108 * state.mem / MEM_BUDGET, 10);
  ctx.fillStyle = '#9db4d0';
  ctx.fillText('已加载 cell: ' + state.loadedCount, x, y + 274);
}

function drawFrameChart(state, ctx) {
  var x0 = 16, y0 = 500, w = 688, h = 84;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('帧时间(近120帧)  红线=16.6ms  超帧累计 ' + state.overFrames, x0, y0 - 6);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x0, y0, w, h);
  var n = state.frameCost.length;
  var bw = w / 120;
  var mx = 60;
  for (var i = 0; i < n; i++) {
    var v = Math.min(mx, state.frameCost[i]);
    var bh = v / mx * h;
    ctx.fillStyle = state.frameCost[i] > 16.6 ? '#f87171' : '#3d5a80';
    ctx.fillRect(x0 + i * bw, y0 + h - bh, Math.max(1, bw - 1), bh);
  }
  var ly = y0 + h - 16.6 / mx * h;
  ctx.strokeStyle = '#f87171';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, ly);
  ctx.lineTo(x0 + w, ly);
  ctx.stroke();
  ctx.setLineDash([]);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>先跑异步（默认）：</b>按住 Shift 冲刺，底部帧时间柱全程贴着红线下面走——预算把加载工时摊平了，队列在右栏排队消化。</li>
  <li><b>切同步（Tab）再冲刺：</b>同样的跑法，帧时间柱成片打穿红线，超帧计数狂飙——这就是「进入半径的瞬间全量加载」的真实手感，玩家管它叫卡。</li>
  <li><b>把预算 Q 到 1：</b>冲刺时看地图——点亮速度跟不上你，身后一片暗格欠账；这就是供给不足的世界边。</li>
  <li><b>看 LRU：</b>原地转圈把内存条顶到 85% 红区，然后朝一个方向猛冲——最远的 cell 会带一阵暗红色淡出被卸载，给新 cell 腾地方。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎的异步加载管线',
    files: [
      { path: 'core/io/resource_loader.cpp', note: '资源加载入口：同步 load 与后台线程加载（load_threaded_request/get）的路由——本课「异步+预算」的引擎级原型。建议搜索：load_threaded_request、load_threaded_get、thread_load。' },
      { path: 'core/io/resource_format_binary.cpp', note: '二进制资源格式的读写：一份 cell 数据落盘长什么样、怎么被快速解析。建议搜索：ResourceLoaderBinary、parse_variant。' },
      { path: 'core/io/resource_uid.cpp', note: '资源 UID：跨会话稳定引用，是流式世界把 cell 与资源挂接起来的地基。建议搜索：UID、create_for_path、id_for_path。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>流式加载的全部魔术：<b>把「无限」拆成 cell，把「加载」拆成每帧一点点的工时，把「有限内存」交给 LRU。</b>玩家只看见世界在脚下生长，看不见队列、预算与卸载器在幕后搬砖。</p>
<ul>
  <li><b>数据怎么流动？</b>玩家坐标→cell 坐标→需求集合→优先级队列→预算内分帧加载→进内存；超限的旧 cell 沿 LRU 淡出。</li>
  <li><b>所有权归谁？</b>cell 数据归世界所有，玩家只是引用者；LRU 是所有权回收器——「离开半径+内存超限」就是收回通知。</li>
  <li><b>什么时候发生？</b>需求每帧评估；加载永远在帧预算内分摊；卸载延迟半帧做淡出——同步加载只属于原型期， shipped 世界的第一戒律就是「不许在玩家帧里干重活」。</li>
</ul>`
  }
  ]
};
