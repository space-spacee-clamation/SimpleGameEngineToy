// D1 · 高度场地形 I:从噪声到法线
export default {
  id: 'D1',
  title: '高度场地形 I：从噪声到法线',
  est: '2.5 小时',
  coreQuestions: [
    '一维噪声到无限地形之间，多倍频叠加到底在买什么？',
    '高度场怎么变成「看起来像地形」——法线和坡度各管什么？',
    '贴图分层的雪线/草/岩阈值，为什么必须跟着坡度而不是只看高度？',
    '参数一变整条链重算，引擎靠什么不让编辑器卡死？'
  ],
  sections: [
  {
    type: 'text',
    title: 'heightmap 管线全景：一张二维网格撑起整座山',
    html: `<p>所有开放世界地形的第一站都是 <b>heightmap</b>：一张二维网格，每格存一个高度值。高度从哪来？<b>分形噪声</b>——把多层的「连续随机起伏」叠在一起：</p>
<table>
  <tr><th>参数</th><th>含义</th><th>调大会怎样</th></tr>
  <tr><td>octaves 倍频数</td><td>叠几层噪声</td><td>细节变多，算力线性上涨</td></tr>
  <tr><td>persistence 持续度</td><td>每层振幅的衰减系数</td><td>高频层更吵，地形「毛躁」</td></tr>
  <tr><td>lacunarity 频率倍增</td><td>每层频率的放大倍数</td><td>层与层「颗粒度」拉开（通常取 2）</td></tr>
</table>
<p>一句话：<b>低频层给轮廓，高频层给细节</b>。倍频数是 1 时只有绵延大形状；拉到 8，山脊上开始有岩石的锯齿。这是 D 系列开门课——D2 解决「这么大的地形怎么画得动」（LOD 与裙边），D3 解决「比内存还大的世界怎么装得下」（流式加载）。</p>`
  },
  {
    type: 'text',
    title: '从高度到「像地形」：法线、坡度与三层着色',
    html: `<p>高度图本身只是一堆数字，让它「看起来像地形」要两次换算：</p>
<p><b>① 法线（光照的灵魂）。</b>每个格点看左右/上下邻居的高度差（中央差分），就得到这一格表面朝哪——法线朝向光，格子就亮。山地所有的明暗起伏，全是这一步送的。</p>
<p><b>② 坡度（贴图的裁判）。</b>法线的「朝上分量」越小说越陡。真实世界的规则是<b>陡处露岩、平处铺草、高处积雪</b>——所以分层着色永远同时看「高度阈值」和「坡度阈值」：只看高度会把雪铺上悬崖，只看坡度会让谷底不长草。</p>
<p>还有个工程问题藏在里面：参数动一格，整条「噪声→高度→法线→着色」链全要重算。本课实验每次改参数都老实全量重算（区域小无所谓），引擎里的做法见小结第三条。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'heightmap',
    title: '实验：三联视图高度图生成器（参数实时调）',
    height: 620,
    code: `// 左=高度+分层着色  中=法线光照  右=坡度图
// Q/E 倍频数  Z/X 持续度  A/D 噪声尺度  R/F 雪线  方向键平移  空格换种子

var GW = 104, GH = 110, CELL = 2;

engine.run({
  setup: function (state) {
    state.oct = 5;
    state.persist = 0.5;
    state.scale = 0.03;
    state.snowLine = 0.72;
    state.ox = 0;
    state.oy = 0;
    state.seed = 20260903;
    state.ms = 0;
    rebuild(state);
  },

  update: function (state, dt, input) {
    var dirty = false;
    if (input.pressed('KeyQ')) { state.oct = Math.min(8, state.oct + 1); dirty = true; }
    if (input.pressed('KeyE')) { state.oct = Math.max(1, state.oct - 1); dirty = true; }
    if (input.pressed('KeyZ')) { state.persist = Math.min(0.9, state.persist + 0.05); dirty = true; }
    if (input.pressed('KeyX')) { state.persist = Math.max(0.1, state.persist - 0.05); dirty = true; }
    if (input.pressed('KeyA')) { state.scale = Math.min(0.12, state.scale * 1.2); dirty = true; }
    if (input.pressed('KeyD')) { state.scale = Math.max(0.008, state.scale / 1.2); dirty = true; }
    if (input.pressed('KeyR')) { state.snowLine = Math.min(0.95, state.snowLine + 0.03); dirty = true; }
    if (input.pressed('KeyF')) { state.snowLine = Math.max(0.3, state.snowLine - 0.03); dirty = true; }
    if (input.down('ArrowLeft')) { state.ox -= 60 * dt; dirty = true; }
    if (input.down('ArrowRight')) { state.ox += 60 * dt; dirty = true; }
    if (input.down('ArrowUp')) { state.oy -= 60 * dt; dirty = true; }
    if (input.down('ArrowDown')) { state.oy += 60 * dt; dirty = true; }
    if (input.pressed('Space')) { state.seed = (state.seed * 16807) % 2147483647; dirty = true; }
    if (dirty) rebuild(state);
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    var x0 = 16, y0 = 44;
    var t0 = performance.now();
    for (var j = 0; j < GH; j++) {
      for (var i = 0; i < GW; i++) {
        var k = j * GW + i;
        // 高度+分层
        ctx.fillStyle = layerColor(state.h[k]);
        ctx.fillRect(x0 + i * CELL, y0 + j * CELL, CELL - 1, CELL - 1);
        // 法线光照
        ctx.fillStyle = shadeNormal(state, i, j);
        ctx.fillRect(x0 + 224 + i * CELL, y0 + j * CELL, CELL - 1, CELL - 1);
        // 坡度
        ctx.fillStyle = slopeColor(state, i, j);
        ctx.fillRect(x0 + 448 + i * CELL, y0 + j * CELL, CELL - 1, CELL - 1);
      }
    }
    state.ms = performance.now() - t0;
    drawHud(state, ctx);
  }
});

// ---------- 噪声与重建 ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePerm(seed) {
  var rng = mulberry32(seed);
  var p = new Uint8Array(512);
  var base = [];
  for (var i = 0; i < 256; i++) base.push(i);
  for (var j = 255; j > 0; j--) {
    var r = Math.floor(rng() * (j + 1));
    var tmp = base[j]; base[j] = base[r]; base[r] = tmp;
  }
  for (var k = 0; k < 512; k++) p[k] = base[k & 255];
  return p;
}

function grad(hash, x, y) {
  switch (hash & 7) {
    case 0: return x + y;
    case 1: return x - y;
    case 2: return -x + y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function perlin(perm, x, y) {
  var xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
  var xf = x - Math.floor(x), yf = y - Math.floor(y);
  var u = fade(xf), v = fade(yf);
  var aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
  var ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
  var x1 = grad(aa, xf, yf) * (1 - u) + grad(ba, xf - 1, yf) * u;
  var x2 = grad(ab, xf, yf - 1) * (1 - u) + grad(bb, xf - 1, yf - 1) * u;
  return (x1 * (1 - v) + x2 * v) * 0.5 + 0.5;
}

function rebuild(state) {
  var n = GW * GH;
  if (!state.h || state.h.length !== n) {
    state.h = new Float32Array(n);
    state.nx = new Float32Array(n);
    state.ny = new Float32Array(n);
    state.slope = new Float32Array(n);
  }
  var perm = makePerm(state.seed);
  var i, j, k;
  for (j = 0; j < GH; j++) {
    for (i = 0; i < GW; i++) {
      var wx = (i + state.ox) * state.scale;
      var wy = (j + state.oy) * state.scale;
      state.h[j * GW + i] = fbm(perm, wx, wy, state.oct, state.persist);
    }
  }
  // 中央差分:法线与坡度
  for (j = 0; j < GH; j++) {
    for (i = 0; i < GW; i++) {
      k = j * GW + i;
      var hl = state.h[j * GW + Math.max(0, i - 1)];
      var hr = state.h[j * GW + Math.min(GW - 1, i + 1)];
      var hu = state.h[Math.max(0, j - 1) * GW + i];
      var hd = state.h[Math.min(GH - 1, j + 1) * GW + i];
      var dx = (hr - hl) * 14, dy = (hd - hu) * 14;
      var inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      state.nx[k] = -dx * inv;
      state.ny[k] = -dy * inv;
      state.slope[k] = 1 - inv;
    }
  }
}

function fbm(perm, x, y, oct, persist) {
  var amp = 1, freq = 1, sum = 0, norm = 0;
  for (var o = 0; o < oct; o++) {
    sum += perlin(perm, x * freq + o * 37.7, y * freq - o * 17.3) * amp;
    norm += amp;
    amp *= persist;
    freq *= 2;
  }
  return sum / norm;
}

// ---------- 着色 ----------

function layerColor(h) {
  if (h > 0.78) return '#e8f4ff';
  if (h > 0.72) return '#c9d8e8';
  if (h > 0.45) return '#3f7d4c';
  if (h > 0.3) return '#8a9a5b';
  return '#2b5d8a';
}

function shadeNormal(state, i, j) {
  var k = j * GW + i;
  var lx = 0.55, ly = -0.45, lz = 0.7;
  var d = state.nx[k] * lx + state.ny[k] * ly + (1 - state.slope[k]) * lz;
  if (d < 0) d = 0;
  var v = Math.floor(30 + d * 200);
  return 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 18) + ')';
}

function slopeColor(state, i, j) {
  var s = state.slope[j * GW + i];
  if (s > 0.45) return 'rgb(220,90,80)';
  if (s > 0.25) return 'rgb(210,180,90)';
  return 'rgb(90,160,110)';
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.9)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('倍频 ' + state.oct + '  持续度 ' + state.persist.toFixed(2) + '  尺度 ' + state.scale.toFixed(3) +
    '  雪线 ' + state.snowLine.toFixed(2) + '  重算 ' + state.ms.toFixed(1) + 'ms  种子 ' + state.seed, 16, 26);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('高度+分层', 16, 40);
  ctx.fillText('法线光照', 240, 40);
  ctx.fillText('坡度', 464, 40);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>倍频从 1 拉到 8（Q 连按）：</b>左图从「馒头丘陵」长出「岩石锯齿」，中图的明暗细节同步变密——低频给轮廓、高频给细节，一按便知。</li>
  <li><b>把持续度打到 0.9（Z）：</b>高频层几乎不衰减，地形毛躁得像沙漠——这就是「细节吵闹」；打回 0.3 立刻温润。</li>
  <li><b>方向键平移：</b>采样窗口滑过无限噪声原野——地形没有尽头，尽头的只有你的坐标系。</li>
  <li><b>调雪线（R/F）：</b>左图雪线整体移动；再对照右图坡度图——悬崖上那条「红色带」永远盖不上雪的干净分层，这就是为什么分层要同时看高度和坡度。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：从实验参数到引擎实现',
    files: [
      { path: 'modules/noise/fastnoise_lite.cpp', note: 'Godot 内置的 FastNoiseLite：本课 fbm 的工业版——开箱即用的倍频/持续度/频率倍增与 domain warp。建议搜索：fbm、octaves、fractal_bounding、domain_warp。' },
      { path: 'scene/resources/3d/height_map_shape_3d.cpp', note: '高度图怎么变成物理碰撞形状：逐格高度采样、构建凹凸形状与法线，跟本课中央差分同一个物理量。建议搜索：get_height、_build、shape_data。' },
      { path: 'modules/jolt_physics/shapes/jolt_height_map_shape_3d.cpp', note: 'Jolt 后端的高度图碰撞形状：同一份高度数据的另一条实现路线，体会 PhysicsServer 抽象层为什么存在。建议搜索：HeightField、SetHeightField、GetHeightfield。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>heightmap 是「用一张二维数组冒充一座山」的伟大骗局：分形噪声给高度，中央差分给法线与坡度，阈值分层给皮肤。D2 要解决它的第一个工程代价（画不动），D3 解决第二个（装不下）。</p>
<ul>
  <li><b>数据怎么流动？</b>噪声参数→高度场→（差分）→法线/坡度→着色与光照；参数是唯一输入，其余全是派生。</li>
  <li><b>所有权归谁？</b>高度/法线/坡度三张表都由参数表派生——真正的真相源只有种子和四个参数；引擎里这三张表归地形资源（Resource）所有。</li>
  <li><b>什么时候发生？</b>参数一变整链重算，本课每次全量、约几毫秒；引擎的做法是脏标记+分块重算（只重算被编辑的 chunk 及其邻居），思路与 C3 的 change detection 一脉相承。</li>
</ul>`
  }
  ]
};
