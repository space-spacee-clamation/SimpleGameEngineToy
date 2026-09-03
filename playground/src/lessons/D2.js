// D2 · 高度场地形 II:LOD 与裙边
export default {
  id: 'D2',
  title: '高度场地形 II：LOD 与裙边',
  est: '2 小时',
  coreQuestions: [
    '为什么远处地形可以用稀疏网格画，近处必须密？顶点预算怎么算？',
    '相邻 chunk 细节级别不同时，边界上发生了什么？',
    '裙边和缝合 index buffer 各在买什么？',
    '为什么 LOD 切换要加迟滞（hysteresis）？'
  ],
  sections: [
  {
    type: 'text',
    title: '顶点预算：近处密、远处稀',
    html: `<p>D1 的一张 heightmap 全 LOD0 画下来是 <b>(N-1)² 个四边形</b>——地形一大就画不动。出路：<b>chunk 分块 + 视距分级</b>。把地形切成块，每块按与相机的距离选网格密度：近处 LOD0（8×8 格）、中距 LOD1（4×4）、远处 LOD2（2×2）。</p>
<p>本课的沙盘（24 个 chunk）算一笔账：全部 LOD0 要 <b>1944 个顶点</b>；分级后通常只要两三百——而远处的稀疏在屏幕上根本看不出来。<b>顶点预算是花在「看得清的地方」的。</b></p>`
  },
  {
    type: 'text',
    title: '裂缝、裙边与迟滞',
    html: `<p><b>裂缝的成因。</b>相邻两个 chunk 级别不同：细的一侧边界有 9 个顶点，粗的一侧只有 5 个——粗侧的边「直直地拉过去」，细侧多出来的 4 个顶点悬空，从侧面看就是一条条<b>裂缝（T-junction 走光）</b>。</p>
<table>
  <tr><th>补法</th><th>思路</th><th>代价</th></tr>
  <tr><td>裙边 skirt</td><td>细侧边缘垂下一条「裙摆」，把缝从视觉上堵住</td><td>实现极简、任何组合通吃；近看有垂布痕迹</td></tr>
  <tr><td>缝合 index</td><td>按邻居级别动态生成边界索引，几何严丝合缝</td><td>干净；边界要枚举邻接组合，复杂易错</td></tr>
</table>
<p><b>迟滞 hysteresis。</b>相机在分级阈值附近晃动时，chunk 会在 LOD0/1 之间反复横跳（网格重建抖动+视觉闪烁）。解法：升级和降级用两个错开一点的阈值——像空调温控一样「制冷 26°、制热 24°」，让状态切换有粘性。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'lodskirt',
    title: '实验：chunk 分级沙盘——裂缝数 vs 顶点数',
    height: 620,
    code: `// 方向键移动相机(黄色箭头)  回车切裙边  空格换地形  H 锁定一块 chunk 到 LOD0
// 红点=边界 T-junction(裂缝源头)  右下小地图=各 chunk 当前级别

var COLS = 6, ROWS = 4, CHUNK = 8;
var WORLD_W = COLS * CHUNK, WORLD_H = ROWS * CHUNK;
var SEGS = [8, 4, 2];
var SX = 16, SY = 44, PPU_X = 14.3, PPU_Y = 11.4;

engine.run({
  setup: function (state) {
    state.camX = WORLD_W / 2;
    state.skirt = false;
    state.lock = false;
    state.seed = 20260903;
    state.log = ['方向键移动相机,看分级流动'];
    state.hyst = {};   // chunk 迟滞状态
    rebuild(state);
  },

  update: function (state, dt, input) {
    if (input.down('ArrowLeft')) state.camX = Math.max(4, state.camX - 14 * dt);
    if (input.down('ArrowRight')) state.camX = Math.min(WORLD_W - 4, state.camX + 14 * dt);
    if (input.pressed('Enter')) { state.skirt = !state.skirt; pushLog(state, state.skirt ? '裙边:开(细侧边缘垂裙摆)' : '裙边:关'); }
    if (input.pressed('KeyH')) { state.lock = !state.lock; pushLog(state, state.lock ? '锁定 chunk(2,1) 强制 LOD0' : '解锁 chunk'); }
    if (input.pressed('Space')) { state.seed = (state.seed * 48271) % 2147483647; state.hyst = {}; rebuild(state); pushLog(state, '重掷地形'); }
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var t0 = performance.now();
    var stats = drawTerrain(state, ctx);
    state.ms = performance.now() - t0;
    drawMinimap(state, ctx, stats);
    drawHud(state, ctx, stats);
  }
});

// ---------- 高度场(任意位置连续采样,任意 LOD 都取同一真相) ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTable(seed) {
  var rng = mulberry32(seed);
  var t = new Float32Array(256 * 256);
  for (var i = 0; i < t.length; i++) t[i] = rng();
  return t;
}

function hash01(tab, ix, iy) {
  ix = ix & 255; iy = iy & 255;
  return tab[(ix * 251 + iy * 173) & 65025];
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(tab, x, y) {
  var ix = Math.floor(x), iy = Math.floor(y);
  var fx = smooth(x - ix), fy = smooth(y - iy);
  var a = hash01(tab, ix, iy), b = hash01(tab, ix + 1, iy);
  var c = hash01(tab, ix, iy + 1), d = hash01(tab, ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function terrainH(tab, x, y) {
  var v = valueNoise(tab, x * 0.06, y * 0.06) * 0.65;
  v += valueNoise(tab, x * 0.14 + 40, y * 0.14) * 0.25;
  v += valueNoise(tab, x * 0.34 - 20, y * 0.34 + 9) * 0.10;
  return v;
}

function rebuild(state) {
  state.tab = makeTable(state.seed);
}

// ---------- LOD 与绘制 ----------

function lodFor(state, cx, cy) {
  if (state.lock && cx === 2 && cy === 1) return 0;
  var d = Math.abs(cx + 0.5 - state.camX);
  // 迟滞:升级阈值紧、降级阈值松,状态有粘性
  var key = cx + ',' + cy;
  var cur = state.hyst[key];
  var raw = d < 1.5 ? 0 : (d < 3.2 ? 1 : 2);
  if (cur === undefined) { state.hyst[key] = raw; return raw; }
  var upT = [1.35, 3.0], downT = [1.65, 3.4];
  var lod = cur;
  if (raw < cur) { if (d < upT[cur - 1]) lod = raw; }
  else if (raw > cur) { if (d > downT[raw - 1]) lod = raw; }
  state.hyst[key] = lod;
  return lod;
}

function drawTerrain(state, ctx) {
  var tab = state.tab;
  var verts = 0, cracks = 0;
  var lods = [];
  for (var cy = 0; cy < ROWS; cy++) {
    for (var cx = 0; cx < COLS; cx++) {
      var lod = lodFor(state, cx, cy);
      lods.push(lod);
      var s = SEGS[lod];
      verts += (s + 1) * (s + 1);
      var ox = cx * CHUNK, oy = cy * CHUNK;
      ctx.strokeStyle = lod === 0 ? 'rgba(110,231,183,0.5)' : (lod === 1 ? 'rgba(91,143,214,0.4)' : 'rgba(91,115,151,0.3)');
      ctx.lineWidth = 1;
      var i, j;
      for (i = 0; i <= s; i++) {
        ctx.beginPath();
        for (j = 0; j < s; j++) {
          var x0 = sx(ox + i * CHUNK / s), y0 = sy(oy + j * CHUNK / s);
          var x1 = sx(ox + i * CHUNK / s), y1 = sy(oy + (j + 1) * CHUNK / s);
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        ctx.beginPath();
        for (j = 0; j < s; j++) {
          var xa = sx(ox + j * CHUNK / s), ya = sy(oy + i * CHUNK / s);
          var xb = sx(ox + (j + 1) * CHUNK / s), yb = sy(oy + i * CHUNK / s);
          ctx.moveTo(xa, ya);
          ctx.lineTo(xb, yb);
        }
        ctx.stroke();
      }
    }
  }
  // 边界裂缝检测:水平相邻
  for (cy = 0; cy < ROWS; cy++) {
    for (cx = 0; cx < COLS - 1; cx++) {
      var l = lods[cy * COLS + cx], r = lods[cy * COLS + cx + 1];
      if (l !== r) cracks += borderCracks(state, ctx, cx + 1, cy, 'v', Math.max(l, r), Math.min(l, r));
    }
  }
  for (cy = 0; cy < ROWS - 1; cy++) {
    for (cx = 0; cx < COLS; cx++) {
      var u = lods[cy * COLS + cx], d2 = lods[(cy + 1) * COLS + cx];
      if (u !== d2) cracks += borderCracks(state, ctx, cx, cy + 1, 'h', Math.max(u, d2), Math.min(u, d2));
    }
  }
  // 相机标记
  var camScreen = sx(state.camX);
  ctx.strokeStyle = '#ffd479';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(camScreen, SY - 6);
  ctx.lineTo(camScreen, SY + (WORLD_H * PPU_Y) + 4);
  ctx.stroke();
  ctx.fillStyle = '#ffd479';
  ctx.beginPath();
  ctx.moveTo(camScreen - 5, SY - 6);
  ctx.lineTo(camScreen + 5, SY - 6);
  ctx.lineTo(camScreen, SY + 3);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  return { verts: verts, cracks: cracks, lods: lods, full: 24 * 81 };
}

function borderCracks(state, ctx, cx, cy, dir, fine, coarse) {
  var n = SEGS[fine] - SEGS[coarse];
  var wx = cx * CHUNK, wy = cy * CHUNK;
  var i;
  if (state.skirt) {
    ctx.strokeStyle = 'rgba(20,26,36,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (dir === 'v') { ctx.moveTo(sx(wx), sy(wy)); ctx.lineTo(sx(wx), sy(wy + CHUNK)); }
    else { ctx.moveTo(sx(wx), sy(wy)); ctx.lineTo(sx(wx + CHUNK), sy(wy)); }
    ctx.stroke();
    ctx.lineWidth = 1;
    return 0;
  }
  ctx.fillStyle = '#f87171';
  for (i = 1; i <= n; i++) {
    var t = i / (SEGS[fine] + 1);
    var px = dir === 'v' ? sx(wx) : sx(wx + CHUNK * t);
    var py = dir === 'v' ? sy(wy + CHUNK * t) : sy(wy);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, 6.2832);
    ctx.fill();
  }
  return n;
}

function sx(wx) { return SX + wx * PPU_X; }
function sy(wy) { return SY + wy * PPU_Y; }

function drawMinimap(state, ctx, stats) {
  var mx = 620, my = 378;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '11px monospace';
  ctx.fillText('LOD 分级小地图', 620, 372);
  for (var cy = 0; cy < ROWS; cy++) {
    for (var cx = 0; cx < COLS; cx++) {
      var lod = stats.lods[cy * COLS + cx];
      ctx.fillStyle = lod === 0 ? '#2f6d4f' : (lod === 1 ? '#2f5a8a' : '#27364d');
      ctx.fillRect(mx + cx * 13, my + cy * 13, 12, 12);
    }
  }
  var col = Math.floor(state.camX / CHUNK);
  ctx.strokeStyle = '#ffd479';
  ctx.strokeRect(mx + col * 13, my, 13, ROWS * 13);
}

function drawHud(state, ctx, stats) {
  ctx.fillStyle = 'rgba(11,15,23,0.9)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('顶点 ' + stats.verts + '(全LOD0 要 ' + stats.full + ')  裂缝 ' + stats.cracks +
    '  裙边 ' + (state.skirt ? 'ON' : 'OFF') + '  重绘 ' + state.ms.toFixed(1) + 'ms', 16, 26);
  ctx.fillStyle = stats.cracks > 0 ? '#f87171' : '#6ee7b7';
  ctx.fillText(stats.cracks > 0 ? '边界顶点错位:红点即裂缝源头(T-junction)' : '无裂缝', 16, 476);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('方向键=移动相机  回车=裙边  空格=换地形  H=锁定chunk(2,1)', 16, 496);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 16, 516 + i * 14);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('绿色网格=LOD0(8格)  蓝=LOD1(4格)  暗灰=LOD2(2格)', 16, 570);
  ctx.fillText('绿0 黄1 蓝2', 620, 440);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>移动相机（方向键）：</b>右下小地图的分级随距离流动，绿→蓝的波纹跟着黄色相机标记走——这就是视距分级。</li>
  <li><b>数裂缝：</b>裙边关着时，凡是小地图上相邻色块不同级的边界，地形上就有红点；顶栏「裂缝」数=这些 T-junction 的总数。</li>
  <li><b>打开裙边（回车）：</b>深色裙摆沿细侧边缘垂下，红点清零——缝还在几何上，只是被堵在视觉外。工业里大多数引擎首选这招，因为便宜且万能。</li>
  <li><b>锁定一块（H）：</b>chunk(2,1) 被强制 LOD0，它四周立刻裂缝爆增——「边界协议」只在邻居级别一致时才免费，破坏一致性的代价当场可见。</li>
  <li><b>看顶点账：</b>顶栏的「顶点 vs 全 LOD0」两个数字，随相机位置实时变化——分级省下的每一分都看得见。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：LOD 在渲染后端的真实落点',
    files: [
      { path: 'servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.cpp', note: '3D 渲染列表按实例距离做 LOD 分级的地方：同一份几何，不同距离进不同绘制档位。建议搜索：lod、_setup_lod、geometry_instance。' },
      { path: 'servers/rendering/renderer_rd/storage_rd/mesh_storage.cpp', note: 'mesh 的 LOD 层级存储：一个网格带多少档、各档的切换距离范围。建议搜索：lod_count、lod_ranges、set_lod_range。' },
      { path: 'servers/rendering/renderer_rd/storage_rd/light_storage.cpp', note: 'LOD 思想的旁证：连光照存储也有分档逻辑——「按距离降密度」是渲染各子系统的通用手段。建议搜索：lod。注：裙边 skirt 是地形网格的经典外部技巧，Godot 主干无内置地形，故无直接对应物——如实标注，不硬凑。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>LOD 的全部内容就一句话：<b>把精度花在看得见的地方，再用裙边或缝合把分级接缝补上，用迟滞让切换不抖。</b>这三个决定共同组成了大世界渲染的顶点经济学。</p>
<ul>
  <li><b>数据怎么流动？</b>相机距离→每 chunk 分级→网格密度与裙边生成→绘制；高度真相只有一份（连续函数），任何 LOD 的顶点都从它采样。</li>
  <li><b>所有权归谁？</b>每 chunk 独立持有自己的网格与裙边；边界是对邻协议——邻居级别一致时免费，不一致时要花钱（缝合）或作弊（裙边）。</li>
  <li><b>什么时候发生？</b>分级每帧评估（很便宜），网格重建只在级别变化时发生（贵）；迟滞存在的全部意义，就是让「变化」尽量少发生。</li>
</ul>`
  }
  ]
};
