// G3 · 样条与路径:Catmull-Rom 与 Bézier
export default {
  id: 'G3',
  title: '样条与路径：Catmull-Rom 与 Bézier',
  est: '2 小时',
  coreQuestions: [
    'Catmull-Rom「过点」、Bézier「不过点」——控制点的含义差在哪？',
    '张量（tension）旋钮改变了曲线的什么？',
    '为什么匀速走曲线必须做弧长重参数化？均匀 t 参数的坑在哪？',
    '相机轨迹、运动路径、UI 动效为什么共享同一套数学？'
  ],
  sections: [
  {
    type: 'text',
    title: '两种样条，两种哲学',
    html: `<p><b>Catmull-Rom</b> 是「插值样条」：<b>曲线穿过每一个控制点</b>，控制点就是路径要经过的地方——放路径点、相机路标最顺手。每段曲线由相邻 4 个点决定（两端各补一个虚拟点），切向由邻点差值给出，<b>张量（tension）</b>旋钮收紧或放松切向：t=0 标准样条，t 越大切越「紧」。</p>
<p><b>Bézier</b> 是「逼近样条」：曲线只被控制多边形包络牵引、一般不过中间点——造型工具（矢量绘图、字体轮廓）的母语。三次 Bézier 由 4 个控制点定义，两个「把手」控制出入切向。</p>
<table>
  <tr><th>维度</th><th>Catmull-Rom</th><th>三次 Bézier</th></tr>
  <tr><td>过点</td><td>过（点=路径）</td><td>不过（点=骨架）</td></tr>
  <tr><td>交互</td><td>拖点即改形</td><td>拖点+拖把手</td></tr>
  <tr><td>典型用户</td><td>关卡/相机/运动路径</td><td>美术/字体/UI 缓动</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '弧长重参数化：匀速走曲线的秘密',
    html: `<p>曲线的标准参数是 t∈[0,1]，但 <b>t 与「走过的距离」不成正比</b>——控制点密的区域 t 走一点弧长走很多。直接用 t 驱动相机，会出现「某段飞快、某段龟速」。</p>
<p>解法：<b>弧长重参数化</b>——先把曲线按 t 采样成一张「累计弧长表」，要前进 Δs 时反查「哪个 t 对应这段弧长」。一次预计算 O(采样数)，运行时一次二分/扫查。本课实验用回车键切换两种模式，肉眼对比「均匀 t」的忽快忽慢与「弧长」的匀速。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'spline',
    title: '实验：样条编辑器（拖点/换类型/张量/匀速开关）',
    height: 620,
    code: `// 鼠标拖控制点  A=在指针处加点  D=删末点  Tab=切类型(Catmull-Rom/贝塞尔/折线)
// Q/E=张量  回车=匀速开关(弧长重参数化)  空格=暂停走点

engine.run({
  setup: function (state) {
    state.type = 0;             // 0=Catmull-Rom 1=贝塞尔 2=折线
    state.tension = 0.5;
    state.uniformSpeed = true;
    state.drag = -1;
    state.s = 0;                // 弧长/参数进度
    state.paused = false;
    state.pts = [
      { x: 80, y: 300 }, { x: 200, y: 140 }, { x: 360, y: 330 },
      { x: 480, y: 150 }, { x: 620, y: 320 }
    ];
    state.samples = [];
    state.arcLen = [];
    state.trail = [];
    state.log = ['拖动控制点;Tab 换曲线类型'];
    resample(state);
  },

  update: function (state, dt, input) {
    state.t = (state.t || 0) + dt;
    if (input.pressed('Tab')) { state.type = (state.type + 1) % 3; resample(state); pushLog(state, ['Catmull-Rom(过点,张量可调)', '三次贝塞尔(控制多边形逼近)', '折线(基线对照)'][state.type]); }
    if (input.pressed('KeyQ')) { state.tension = Math.max(0, state.tension - 0.1); resample(state); pushLog(state, '张量=' + state.tension.toFixed(1)); }
    if (input.pressed('KeyE')) { state.tension = Math.min(1, state.tension + 0.1); resample(state); pushLog(state, '张量=' + state.tension.toFixed(1)); }
    if (input.pressed('Enter')) { state.uniformSpeed = !state.uniformSpeed; pushLog(state, state.uniformSpeed ? '匀速模式:弧长重参数化' : '裸 t 模式:注意忽快忽慢'); }
    if (input.pressed('Space')) state.paused = !state.paused;
    if (input.pressed('KeyA')) { state.pts.push({ x: clamp(input.mouse.x, 12, 708), y: clamp(input.mouse.y, 12, 608) }); resample(state); }
    if (input.pressed('KeyD') && state.pts.length > 2) { state.pts.pop(); resample(state); }
    // 拖点
    if (input.mouse.down) {
      if (state.drag < 0) {
        for (var i = 0; i < state.pts.length; i++) {
          if (dist(input.mouse.x, input.mouse.y, state.pts[i].x, state.pts[i].y) < 14) state.drag = i;
        }
      }
      if (state.drag >= 0) {
        state.pts[state.drag].x = clamp(input.mouse.x, 12, 708);
        state.pts[state.drag].y = clamp(input.mouse.y, 12, 608);
        resample(state);
      }
    } else state.drag = -1;
    // 走点
    if (!state.paused && state.arcLen.length > 1) {
      var total = state.arcLen[state.arcLen.length - 1];
      if (state.uniformSpeed) {
        state.s += 130 * dt;                       // 每秒 130px,真正的匀速
        if (state.s > total) state.s = 0;
      } else {
        state.s = (state.s + 0.35 * dt * state.pts.length * 12) % (total || 1);
      }
      var p = evalAt(state, state.s);
      state.cur = p;
      state.trail.push(p);
      if (state.trail.length > 40) state.trail.shift();
    }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    // 控制多边形
    ctx.strokeStyle = 'rgba(91,115,151,0.5)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (var i = 0; i < state.pts.length; i++) {
      if (i === 0) ctx.moveTo(state.pts[i].x, state.pts[i].y); else ctx.lineTo(state.pts[i].x, state.pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // 曲线
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var s = 0; s < state.samples.length; s++) {
      var p = state.samples[s];
      if (s === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    // 控制点
    for (var j = 0; j < state.pts.length; j++) {
      ctx.fillStyle = state.drag === j ? '#ffd479' : '#5b8fd6';
      ctx.beginPath();
      ctx.arc(state.pts[j].x, state.pts[j].y, 7, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#0b0f17';
      ctx.font = '10px monospace';
      ctx.fillText(String(j), state.pts[j].x - 3, state.pts[j].y + 3);
    }
    // 走点与尾迹
    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.beginPath();
    for (var k = 0; k < state.trail.length; k++) {
      var q = state.trail[k];
      if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    if (state.cur) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(state.cur.x, state.cur.y, 6, 0, 6.2832);
      ctx.fill();
    }
    drawHud(state, ctx);
  }
});

// ---------- 曲线求值与弧长 ----------

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function dist(x1, y1, x2, y2) {
  var dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function resample(state) {
  state.samples = [];
  state.arcLen = [];
  var n = state.pts.length;
  if (n < 2) return;
  var total = 0;
  var SEG = 40;
  if (state.type === 1 && n >= 4) {
    // 贝塞尔:每 4 点一段
    for (var seg = 0; seg + 3 < n; seg += 3) {
      for (var i = 0; i <= SEG; i++) {
        var t = i / SEG;
        var p = cubicBez(state.pts[seg], state.pts[seg + 1], state.pts[seg + 2], state.pts[seg + 3], t);
        push(state, p);
      }
    }
  } else if (state.type === 2) {
    for (var l = 0; l < n; l++) push(state, state.pts[l]);
  } else {
    // Catmull-Rom:相邻 4 点一段
    for (var c = 0; c < n - 1; c++) {
      var p0 = state.pts[Math.max(0, c - 1)];
      var p1 = state.pts[c];
      var p2 = state.pts[c + 1];
      var p3 = state.pts[Math.min(n - 1, c + 2)];
      for (var k = 0; k < SEG; k++) {
        var tt = k / SEG;
        push(state, catmull(p0, p1, p2, p3, state.tension, tt));
      }
    }
    push(state, state.pts[n - 1]);
  }
  // 累计弧长表
  state.arcLen.push(0);
  for (var a = 1; a < state.samples.length; a++) {
    total += dist(state.samples[a - 1].x, state.samples[a - 1].y, state.samples[a].x, state.samples[a].y);
    state.arcLen.push(total);
  }
  state.total = total;
}

function push(state, p) {
  state.samples.push(p);
}

function catmull(p0, p1, p2, p3, tension, t) {
  var t2 = t * t, t3 = t2 * t;
  var m = 1 - tension;
  var w = [
    (-m * p0.x + (2 - tension) * p1.x + (1 + tension) * p2.x - m * p3.x) * 0.5,
    (2 * m * p0.x + (tension - 3) * p1.x + (3 - 2 * tension) * p2.x + m * p3.x) * 0.5,
    (-m * p0.x + (2 * m - m) * p1.x + m * p2.x) * 0.5
  ];
  var x = w[0] * t3 + w[1] * t2 + w[2] * t + p1.x;
  var wy = [
    (-m * p0.y + (2 - tension) * p1.y + (1 + tension) * p2.y - m * p3.y) * 0.5,
    (2 * m * p0.y + (tension - 3) * p1.y + (3 - 2 * tension) * p2.y + m * p3.y) * 0.5,
    (-m * p0.y + m * p1.y) * 0.5
  ];
  var y = wy[0] * t3 + wy[1] * t2 + wy[2] * t + p1.y;
  return { x: x, y: y };
}

function cubicBez(p0, p1, p2, p3, t) {
  var it = 1 - t, a = it * it * it, b = 3 * it * it * t, c = 3 * it * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function evalAt(state, dist2) {
  // 弧长表反查:匀速模式给「距离」;裸 t 模式把 dist2 当采样序号用
  if (!state.uniformSpeed) {
    var idx = Math.floor(dist2 / 12) % state.samples.length;
    return state.samples[idx];
  }
  var lo = 0, hi = state.arcLen.length - 1;
  if (dist2 <= 0) return state.samples[0];
  if (dist2 >= state.total) return state.samples[hi];
  while (lo < hi - 1) {
    var mid = (lo + hi) >> 1;
    if (state.arcLen[mid] < dist2) lo = mid; else hi = mid;
  }
  var segLen = state.arcLen[hi] - state.arcLen[lo] || 1;
  var f = (dist2 - state.arcLen[lo]) / segLen;
  var A = state.samples[lo], B = state.samples[hi];
  return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f };
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
  var tn = ['Catmull-Rom', '贝塞尔', '折线'][state.type];
  ctx.fillText('类型:' + tn + '  张量 ' + state.tension.toFixed(1) + '  控制点 ' + state.pts.length +
    '  曲线长 ' + Math.round(state.total || 0) + 'px  匀速:' + (state.uniformSpeed ? 'ON' : 'OFF'), 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('拖控制点  A=加点  D=删末点  Tab=类型  Q/E=张量  回车=匀速开关  空格=暂停', 16, 596);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 430, 596 - 0 + i * 0 - 0 + i * 12 + 0);
  }
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>拖点对比两种样条：</b>Catmull-Rom 的曲线永远粘着你拖的点；切贝塞尔后同样的点变成「骨架」——控制点语义的差别一目了然。</li>
  <li><b>拧张量（Q/E）：</b>0 时标准 Catmull-Rom；拉到 1 曲线绷紧几乎变成折线——「切向强度」旋钮。</li>
  <li><b>把点排成疏密不均：</b>关掉匀速（回车）——走点在密点区飞驰、疏点区蠕动（裸 t 的均匀参数≠均匀速度）；开回匀速立刻痊愈。</li>
  <li><b>A 在远处加点：</b>曲线自动延长并保持光滑——插值样条「加路标不用管切向」的省心之处。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎的曲线资产',
    files: [
      { path: 'scene/resources/curve.cpp', note: 'Curve 资产：1D 关键帧曲线（add_point/bake）——动画缓动与音频包络共用；本课弧长表的亲戚是它的 bake。建议搜索：add_point、bake、get_minmax。' },
      { path: 'scene/resources/curve_texture.cpp', note: '曲线烘焙成纹理：shader 里查 1D 曲线的桥——「预计算成表，运行时查表」思想的资产化。建议搜索：_update、bake、texture。' },
      { path: 'core/math/geometry_2d.h', note: '2D 几何工具集：线段相交/最近点/多边形工具——样条平滑与碰撞检测共享的数学地基。建议搜索：segment_intersects_segment、get_closest_point_to_segment。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>样条是把「少量控制点」变成「无限光滑路径」的压缩术：Catmull-Rom 用过点换交互直觉，Bézier 用把手换取型能力；弧长重参数化是让路径「可匀速行走」的必备后处理。相机轨道、AI 巡逻线、UI 缓动、音频包络——同一套数学贯穿全引擎。</p>
<ul>
  <li><b>数据怎么流动？</b>控制点→分段求值→采样表→累计弧长表→反查 t→匀速走点。</li>
  <li><b>所有权归谁？</b>控制点归编辑器/设计师；采样表与弧长表是派生缓存——点一变全部重算（回扣 C3 脏标记）。</li>
  <li><b>什么时候发生？</b>编辑时重采样、运行时只查表——「贵的算一次，便宜的查万次」在曲线这里的具象就是 bake。</li>
</ul>`
  }
  ]
};
