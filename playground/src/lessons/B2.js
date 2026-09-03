// B2 · 液体渲染 II：让粒子看起来像水
export default {
  id: 'B2',
  title: '液体渲染 II：让粒子看起来像水',
  est: '2 小时',
  coreQuestions: [
    '为什么「模拟出一群粒子」和「画出一团水」是两件事？粒子到水面之间隔着哪几步？（数据怎么流动）',
    '密度场、阈值、法线这些「外观数据」归谁持有？它们和粒子的位置数据是同一份吗？（所有权归谁）',
    '模拟、密度累加、阈值着色、法线重建、配色，这一串各自在第几帧、以什么顺序发生？为什么顺序不能颠倒？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '粒子不等于水：模拟与外观的分离',
      html: `<p>B1 里我们让一千个粒子互相推挤，密度、压强、黏性三项力一起上，忙了半天……但屏幕上仍然是一堆点。真实的水是<b>连续的一团</b>：表面光滑、能反射高光、折射后面的东西。点永远点不出这种「水感」。</p>
<p>进阶专题要教你的第一件事，是这条主线思想：<b>模拟归模拟，外观是一趟独立的后处理</b>。粒子只是「哪里有质量」的载体；它长成什么样，是之后一整套渲染逻辑的事。把这两个阶段拆开，引擎才能各自治病：物理要稳定性，材质要好看，谁也别绑架谁。</p>
<p>那么，从一堆离散点到一团连续水面，中间到底隔着几步？工业界给出的标准答案，正是本课的三张牌：</p>
<table>
  <tr><th>步骤</th><th>解决什么问题</th><th>核心技巧</th></tr>
  <tr><td>① 密度场挤出（metaball）</td><td>离散点 → 连续的「密度标量场」</td><td>每个粒子向外贡献一个核函数，全场累加</td></tr>
  <tr><td>② 阈值等值线</td><td>连续场 → 明确的「水面边界」</td><td>密度大于阈值算水体，等于阈值就是表面</td></tr>
  <tr><td>③ 屏幕空间平滑</td><td>网格化锯齿 → 光滑连续面</td><td>把场当一张图，多采样模糊糊平</td></tr>
  <tr><td>④ 法线重建 + 配色</td><td>一团色块 → 会反光、会折射的「水」</td><td>密度梯度代法线 → 高光/菲涅尔/折射</td></tr>
</table>
<p>读源码时请把这条链记在脑子里：Godot 引擎里，大到全局光照、小到 SSAO，走的都是同一条「<b>先离散后连续、先场后表面、先模型后着色</b>」的路。</p>`
    },
    {
      type: 'text',
      title: 'metaball 的数学：一滴水是一座小山',
      html: `<p>metaball（元气球）的思路朴素得像搭积木：<b>每个粒子不是画一个点，而是贡献一整片「密度场」</b>——离粒子越近密度越高，越远越低，像个光滑的小山包。把所有粒子的小山叠在一起，就得到一张完整的密度标量场 <code>D(x,y)</code>。</p>
<p>常用的核函数是「二次衰减」（还有高斯核等变体）：</p>
<pre>r = 距离 / 核半径 R
核(r) = (1 - r²)²        （当 r &lt; 1，否则 0）
D(p) = Σ 核( 到每个粒子的距离 )</pre>
<p>关键在「<b>阈值等值线</b>」：设定一个密度阈值 <code>thr</code>，<code>D &gt; thr</code> 的像素属于水，<code>D &lt; thr</code> 的像素属于空气，<code>D = thr</code> 的等高线就是水面。单看一个粒子它只是块圆斑；一旦两个粒子靠得够近、小山互相叠加，中间的「鞍部」会把两座山连成一座——<b>水珠自然融合成水滴，再融合成水洼</b>，这正是 metaball 名字的由来：球体在挤近时「元气」般地吸附合并。</p>
<p>三个灵魂拷问在这里第一次显形：<b>数据怎么流动</b>——粒子的位置是一份数据，密度场是「由位置推出来」的第二份数据，水体边界是「由密度推出来」的第三份，一层喂一层；<b>所有权归谁</b>——粒子位置属于物理/模拟模块，密度场属于渲染模块，它俩不是同一份数据，而是「消费者-生产者」关系；<b>什么时候发生</b>——每一帧都是先动粒子、再重算场、再按阈值着色，顺序固定，因为场依赖最新粒子位置。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'metaball',
      title: '实验 1：CodeLab metaball——把一汪会流动的粒子挤成水面',
      height: 600,
      code: `// metaball 沙盘：粒子（自动流动的一汪水）→ 网格密度场累加 → 阈值着色 + 密度梯度假法线打高光
// 右侧滑杆：密度阈值 / 核半径 / 高光强度 / 水色；鼠标拖滑杆调参
// 按 C：切换「裸粒子」对比模式（看粒子本身）与 metaball 模式（看挤出的水面）
// 按 R：重新撒一汪水（换随机种子）

engine.run({
  setup: function (state) {
    state.W = 480; state.H = 432;   // 左区：水面视口
    state.cell = 12;                // 密度场网格边长（像素）
    state.GX = Math.floor(state.W / state.cell);   // 40
    state.GY = Math.floor(state.H / state.cell);   // 36
    state.field = new Float32Array(state.GX * state.GY);   // 密度标量场
    state.parts = [];               // 粒子容器
    state.t = 0;                    // 运行秒数
    state.mode = 'metaball';        // 'metaball' | 'raw'
    // 滑杆定义：key / 名称 / 取值范围 / 初值（lo/hi 用于映射，v 是 0..1 归一化进度）
    state.sliders = [
      { key: 'thr',   name: '密度阈值',      lo: 0.10, hi: 2.00, v: 0.18 },
      { key: 'rad',   name: '核半径(模糊)',  lo: 0.50, hi: 2.60, v: 0.34 },
      { key: 'spec',  name: '高光强度',      lo: 0.00, hi: 2.20, v: 0.55 },
      { key: 'hue',   name: '水色',          lo: 0.00, hi: 1.00, v: 0.42 }
    ];
    state.drag = -1;                 // 正在拖动的滑杆索引（-1 无）
    state.seed = 20260903;           // 随机种子（R 键换一个）
    spawnWater(state);
  },

  update: function (state, dt, input) {
    state.t += dt;
    // —— 粒子流动：一个缓慢的涡流场 + 轻微下沉，让这汪水自己动起来 ——
    var i, w = state.W, h = state.H;
    for (i = 0; i < state.parts.length; i++) {
      var p = state.parts[i];
      var fx = Math.sin(p.y * 0.035 + state.t * 0.9) * 26;   // 流场力：左右摇摆
      var fy = Math.cos(p.x * 0.035 + state.t * 0.7) * 14 - 6; // 轻微下沉
      p.vx += fx * dt; p.vy += fy * dt;
      p.vx *= 0.985; p.vy *= 0.985;                            // 阻尼，防止越流越快
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 10) { p.x = 10; p.vx *= -0.6; }
      if (p.x > w - 10) { p.x = w - 10; p.vx *= -0.6; }
      if (p.y < 12) { p.y = 12; p.vy *= -0.6; }
      if (p.y > h - 8) { p.y = h - 8; p.vy *= -0.6; }
    }
    // —— 滑杆交互：点击滑块进入拖动，拖动更新值 ——
    var m = input.mouse;
    if (m.down && state.drag < 0) {
      for (i = 0; i < state.sliders.length; i++) {
        var s = state.sliders[i];
        if (Math.abs(m.x - (506 + s.v * 176)) < 10 && Math.abs(m.y - s.y) < 12) { state.drag = i; break; }
      }
    }
    if (!m.down) state.drag = -1;
    if (state.drag >= 0) {
      var sd = state.sliders[state.drag];
      sd.v = clamp01((m.x - 506) / 176);
    }
    // —— 键盘 ——
    if (input.pressed('KeyC')) state.mode = (state.mode === 'metaball' ? 'raw' : 'metaball');
    if (input.pressed('KeyR')) { state.seed = (state.seed * 1103515245 + 12345) >>> 0; spawnWater(state); }
  },

  draw: function (state, ctx) {
    var i, j;
    // —— ① 密度场累加：把每个粒子的核函数撒进网格 ——
    var rad = val(state, 'rad') * state.cell;   // 核半径（像素）
    for (i = 0; i < state.field.length; i++) state.field[i] = 0;
    for (i = 0; i < state.parts.length; i++) {
      var p = state.parts[i];
      var cx = Math.floor(p.x / state.cell), cy = Math.floor(p.y / state.cell);
      var rng = Math.ceil(rad / state.cell);    // 影响范围的格子数
      for (var gy = cy - rng; gy <= cy + rng; gy++) {
        if (gy < 0 || gy >= state.GY) continue;
        for (var gx = cx - rng; gx <= cx + rng; gx++) {
          if (gx < 0 || gx >= state.GX) continue;
          var px = gx * state.cell + state.cell * 0.5;
          var py = gy * state.cell + state.cell * 0.5;
          var dx = px - p.x, dy = py - p.y;
          var r2 = (dx * dx + dy * dy) / (rad * rad);
          if (r2 >= 1) continue;
          var k = 1 - r2;
          state.field[gy * state.GX + gx] += k * k;   // 二次衰减核，同样带出梯度（可用作法线）
        }
      }
    }
    var thr = val(state, 'thr');

    // —— 背景 ——
    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, engine.W, engine.H);

    if (state.mode === 'raw') {
      // 对比模式：直接画粒子（点就是点，永远是一堆圆粒）
      for (i = 0; i < state.parts.length; i++) {
        var q = state.parts[i];
        ctx.fillStyle = 'rgba(80,180,210,0.9)';
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3, 0, 6.2832);
        ctx.fill();
      }
    } else {
      // —— ② + ④ metaball 模式：阈值着色 + 梯度法线高光 ——
      var scale = 2.6;    // 梯度 → 法线的陡度系数
      var specI = val(state, 'spec');
      var hue = val(state, 'hue');
      var Lx = 0.42, Ly = 0.58, Lz = 0.70;   // 光方向（已归一化）
      var Ll = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);
      Lx /= Ll; Ly /= Ll; Lz /= Ll;
      // 半程向量 H = normalize(L + V)，V = (0,0,1)
      var Hx = Lx, Hy = Ly, Hz = Lz + 1;
      var Hl = Math.sqrt(Hx * Hx + Hy * Hy + Hz * Hz);
      Hx /= Hl; Hy /= Hl; Hz /= Hl;
      for (j = 0; j < state.GY; j++) {
        for (i = 0; i < state.GX; i++) {
          var d = state.field[j * state.GX + i];
          var a = clamp01((d - (thr - 0.10)) / 0.22);      // 阈值附近软边，让边缘顺滑
          if (a <= 0.001) continue;
          // 梯度 = 中心差分（密度下降方向，反向即表面朝外法线）
          var gx = 0, gy = 0;
          var iL = Math.max(i - 1, 0), iR = Math.min(i + 1, state.GX - 1);
          var jU = Math.max(j - 1, 0), jD = Math.min(j + 1, state.GY - 1);
          gx = state.field[j * state.GX + iR] - state.field[j * state.GX + iL];
          gy = state.field[jD * state.GX + i] - state.field[jU * state.GX + i];
          var nx = -gx * scale, ny = -gy * scale, nz = 1;
          var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx /= nl; ny /= nl; nz /= nl;
          // 漫反射 N·L
          var ndl = Math.max(nx * Lx + ny * Ly + nz * Lz, 0);
          // 高光 (N·H)^sh
          var ndh = Math.max(nx * Hx + ny * Hy + nz * Hz, 0);
          var spec = Math.pow(ndh, 48) * specI;
          // 菲涅尔：越靠近掠射角（nz 越小）反射越强 → 边缘更亮、更「水」
          var fres = Math.pow(1 - Math.max(nz, 0), 3);
          // 水色：hue 在「青碧」与「深蓝」之间插值
          var r = lerp(0.13, 0.07, hue) + spec;
          var g = lerp(0.48, 0.30, hue) + spec * 0.9;
          var b = lerp(0.50, 0.60, hue) + spec * 0.8 + fres * 0.25;
          r = Math.min(r + fres * 0.30, 1);
          g = Math.min(g + fres * 0.40, 1);
          b = Math.min(b + fres * 0.45, 1);
          var lum = 0.32 + 0.68 * ndl;    // 亮度 = 环境 + 漫反射
          r *= lum; g *= lum; b *= lum;
          ctx.fillStyle = 'rgba(' + Math.floor(r * 255) + ',' + Math.floor(g * 255) + ',' + Math.floor(b * 255) + ',' + a.toFixed(3) + ')';
          ctx.fillRect(i * state.cell, j * state.cell, state.cell, state.cell);
        }
      }
    }

    // —— 右侧控制面板 ——
    drawPanel(state, ctx);
  }
});

// 撒一汪水：在中央椭圆内随机铺 N 个粒子，位置/速度都来自种子随机数
function spawnWater(state) {
  state.parts = [];
  var rng = mulberry(state.seed);
  for (var i = 0; i < 54; i++) {
    var ang = rng() * 6.2832;
    var rr = Math.sqrt(rng()) * 150;      // sqrt 让粒子在盘内均匀分布（不是聚在中心）
    state.parts.push({
      x: 240 + Math.cos(ang) * rr * 1.05,
      y: 216 + Math.sin(ang) * rr * 0.80,
      vx: (rng() - 0.5) * 30,
      vy: (rng() - 0.5) * 30
    });
  }
}

// 自带种子的伪随机数生成器（mulberry32），保证每次开局可复现
function mulberry(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function val(state, key) {
  for (var i = 0; i < state.sliders.length; i++) {
    if (state.sliders[i].key === key) {
      var s = state.sliders[i];
      return s.lo + s.v * (s.hi - s.lo);
    }
  }
  return 0;
}

function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function lerp(a, b, t) { return a + (b - a) * t; }

function drawPanel(state, ctx) {
  var px = 490, pw = 226;
  ctx.fillStyle = '#0b111c';
  ctx.fillRect(px - 6, 0, pw + 6, engine.H);
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '13px sans-serif';
  ctx.fillText('metaball 参数', px, 28);
  ctx.font = '12px monospace';
  var sl = state.sliders;
  for (var i = 0; i < sl.length; i++) {
    var s = sl[i];
    s.y = 58 + i * 74;                       // 记录滑杆屏幕 y（update 里命中检测也用它）
    var v = val(state, s.key);
    ctx.fillStyle = '#9db4d0';
    ctx.font = '12px sans-serif';
    ctx.fillText(s.name, px, s.y - 8);
    ctx.fillStyle = '#e8b04b';
    ctx.fillText(v.toFixed(2), px + 150, s.y - 8);
    // 轨道
    ctx.fillStyle = '#1b2940';
    ctx.fillRect(px, s.y - 2, pw - 28, 4);
    // 滑块
    var sx = px + s.v * (pw - 28);
    ctx.fillStyle = state.drag === i ? '#ffd54f' : '#5aa9e6';
    ctx.fillRect(sx - 5, s.y - 8, 10, 16);
    // 辅助说明行
    ctx.fillStyle = '#526583';
    ctx.font = '11px monospace';
    var hint = { thr: '越大水面越瘦', rad: '越大越柔和', spec: '高光锐度', hue: '青碧→深蓝' }[s.key];
    ctx.fillText(hint, px, s.y + 22);
  }
  // 底部：模式与操作提示
  var modeTxt = state.mode === 'raw' ? '当前：裸粒子（一堆点）' : '当前：metaball（连续水面）';
  ctx.fillStyle = state.mode === 'raw' ? '#7fb3e0' : '#62d6a8';
  ctx.font = '12px sans-serif';
  ctx.fillText(modeTxt, px, 380);
  ctx.fillStyle = '#526583';
  ctx.font = '11px monospace';
  ctx.fillText('C 切换对比 · R 重新撒水', px, 400);
  ctx.fillText('拖动右侧滑杆调参', px, 416);
}
`
    },
    {
      type: 'text',
      title: '屏幕空间平滑与法线重建：两处「看起来像水」的关键',
      html: `<p>实验里你拖动「核半径」和「密度阈值」时，水面的胖瘦软硬在变——但你有没有意识到，那一个个 12px 的格子只是<b>密度场的采样点</b>？真正的连续水面是场函数在像素间无限稠密采样出来的。落到屏幕上的做法，就是把这张离散的场<b>当成一张贴图</b>，用模糊把它糊成连续面——<b>屏幕空间平滑</b>。</p>
<p>这话是不是很耳熟？对，就是 L4.4 的套路：后处理不产生新信息，只是对上一张贴图的重采样。metaball 的密度场是「上一张贴图」，模糊是「这一站 Pass」，阈值是「这一站的分支」——<b>液体外观就是一趟贴着屏幕跑的后处理链</b>，和 Bloom 的区别只是：Bloom 喂进去的是亮度，这里喂进去的是质量密度。</p>
<p>第二处关键是<b>法线重建</b>。一片没有明暗的纯色，怎么都像剪贴画；水之所以「水」，全在表面随角度反光、随角度折射。可我们根本没有网格，没有真正的法线——那法线从哪来？答案是<b>密度梯度</b>：把密度场看成一幅「地形图」，密度越高山越高，那么表面法线就是这座山的坡度朝向，即 <code>normal ≈ normalize( -∇D, 1 )</code>。用中心差分求梯度，就凭空造出了法线，进而能打高光（N·H）、算菲涅尔（1−nz）。</p>
<p>三个拷问再看一眼：<b>数据怎么流动</b>——粒子位置 → 密度场 → 阈值掩码 → 梯度 → 法线 → 配色，六张「图」首尾相接；<b>所有权归谁</b>——粒子归模拟，场和法线是渲染这一帧临时算出来的暂存，帧末即弃；<b>什么时候发生</b>——每帧都完整地从头跑一遍这条链，因为它要看最新一帧的粒子。这就是「外观是独立的后处理」的全部含义。</p>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'smooth',
      title: '实验 2：ShaderLab 屏幕空间水体近似——模糊圆点阵 + 法线重建 + 折射配色',
      height: 560,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // ════════ 可编辑旋钮（改完 Ctrl+Enter 重编译）════════
    const float THRESH = 0.48;   // 密度阈值：低于它不算水
    const float BLRAD  = 0.035;  // 平滑半径（多次采样的跨度），调大更糊
    const float SPEC   = 1.5;    // 高光强度
    const float REFR   = 0.10;   // 折射强度：水下背景被表面法线扳弯多少

    float aspect = u_resolution.x / u_resolution.y;
    float2 P = float2(uv.x * aspect, uv.y);   // 宽高比校正后的坐标

    // ════════ ① 程序化圆点阵：格子里的硬圆点，整体随时间缓慢漂移 ════════
    // 这不是水面，而是「粒子图」——每个格子中心一个硬圆点，点内=1、点外=0（不连续）。
    const float grid = 9.0;
    const float dotR = 0.16;

    // HIT(q)：点 q 是否落在某个圆点内（1=是，0=否）。硬、带尖边，就像没渲染前的裸粒子。
    #define HIT(q) (1.0 - step(dotR, length(frac((q) * grid - float2(sin(u_time * 0.5), cos(u_time * 0.7)) * 0.5) - 0.5)))

    // ════════ ② 多次采样平滑：把硬圆点在 3×3 邻域里各采一次再平均 = 模糊成连续密度场 ════════
    // 这就是 metaball 的「屏幕空间」版本：不显式累加核函数，而是把二值粒子图糊成 0..1 的场。
    #define DENS(q) ((HIT((q) + float2(-b, -b)) + HIT((q) + float2(0.0, -b)) + HIT((q) + float2(b, -b)) + HIT((q) + float2(-b, 0.0)) + HIT((q)) + HIT((q) + float2(b, 0.0)) + HIT((q) + float2(-b, b)) + HIT((q) + float2(0.0, b)) + HIT((q) + float2(b, b))) * 0.1111111)

    float b = BLRAD;
    float d0 = DENS(P);                                     // 中心密度
    float mask = smoothstep(THRESH - 0.06, THRESH + 0.06, d0);   // ③ 阈值等值线（软边）

    // ════════ ④ 法线重建：密度梯度（中心差分）→ 表面法线 ════════
    float eps = 0.006;
    float gx = DENS(P + float2(eps, 0.0)) - DENS(P - float2(eps, 0.0));
    float gy = DENS(P + float2(0.0, eps)) - DENS(P - float2(0.0, eps));
    float3 n = normalize(float3(-gx * 15.0, -gy * 15.0, 1.0));   // 陡度系数 15 控制法线起伏

    // ════════ ⑤ 用重建的法线打光 + 折射 ════════
    float3 L = normalize(float3((u_mouse.x - 0.5) * 1.8, 0.55, 0.8 + (u_mouse.y - 0.5) * 0.6));  // 光方向：鼠标可掰
    float3 H = normalize(L + float3(0.0, 0.0, 1.0));       // 半程向量
    float ndl = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, H), 0.0), 54.0) * SPEC;
    float fres = pow(1.0 - max(n.z, 0.0), 3.0);            // 菲涅尔：边缘掠射更强

    // 池底背景（供折射采样）：棋盘格 + 水纹
    float2 ruv = uv + n.xy * REFR;                          // 折射：表面法线把视线「扳弯」后采样背景
    float cb = mod(floor(ruv.x * 16.0) + floor(ruv.y * 12.0), 2.0);
    float3 bg = mix(float3(0.14, 0.28, 0.40), float3(0.55, 0.78, 0.90), cb);
    bg += 0.05 * sin(ruv.y * 44.0 + u_time * 1.4);         // 微光水纹

    // 水体：青蓝底色，越厚（菲涅尔越大）越深；漫反射 + 白高光 + 边缘天光反射
    float3 water = mix(float3(0.06, 0.34, 0.50), float3(0.02, 0.16, 0.30), fres);
    water = water * (0.28 + 0.72 * ndl) + float3(1.0, 1.0, 1.0) * spec;
    water += fres * float3(0.32, 0.55, 0.72) * 0.9;

    float3 col = mix(bg, water, mask);
    return float4(col, 1.0);
}
`
    },
    {
      type: 'source',
      title: '源码走读：Godot 的「屏幕空间 + 模糊 + 法线」长在哪',
      files: [
        { path: 'servers/rendering/renderer_rd/effects/copy_effects.cpp', note: '模糊与拷贝的军火库：gaussian_blur(736 行)、gaussian_glow(810 行)、make_mipmap(948 行)——每个方法都是一次全屏小 draw：绑定源纹理、把视口设成半尺寸、dispatch。你实验里「把粒子图糊成连续面」，引擎里就是把一张纹理喂给 gaussian_blur。注意 gaussian_glow 第一趟额外带 hdr_bleed_threshold：模糊与阈值提取融在一个 pass 里，这正是「糊 + 阈值」同一站的思想。' },
        { path: 'servers/rendering/renderer_rd/effects/ss_effects.cpp', note: '屏幕空间效果综合班：构造函数里 downsample_shader 用 USE_HALF_SIZE / GENERATE_MIPS 等 #define 变体把同一段 shader 编译成多种版本（56~70 行）——「同一场多次重采样」。SSIL 段(106 行起)的 blur_shader 按质量分级模糊，正是本课「屏幕空间平滑」的引擎版；SSAO/SSIL 都在屏幕空间里对着法线/深度场做 blur + 重建。' },
        { path: 'servers/rendering/renderer_rd/effects/ss_effects.h', note: '所有权地图：SSAORenderBuffers / SSILRenderBuffers 结构列出这些屏幕空间效果要持有哪些中间纹理（重要性图、模糊缓冲、法线缓冲……）。重点体会「谁持有谁」——这些缓冲归效果对象持有、跨帧复用，不是每帧 new；粒子模拟侧的粒子数据则完全不在这里，外观数据与模拟数据是两套各自的生命周期。' }
      ]
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>实验 1：把「密度阈值」一路拉高，看水面从整片收缩成几个孤岛——那些孤岛正是相邻粒子间「密度山鞍部」的准确位置。再拉低，看孤岛如何连回一整片。这就是 metaball 融合的可视化。</li>
  <li>实验 1：按住 C 切到裸粒子，你会发现「水」瞬间退回一堆点。来回切几次，体会「模拟」与「外观」之间隔了多远——粒子位置一行没变，视觉对象却从「点集」变成了「水面」。</li>
  <li>实验 1：把核半径拉到最大，水面会整体变肥、边缘变钝——核半径就是「一滴水的小山有多宽」，它同时决定了融合的软硬。</li>
  <li>实验 2：把 BLRAD 从 0.035 调到 0.002，圆点阵几乎原样露出（几乎没糊）；再调到 0.10，糊成一大团海。模糊半径就是「粒子图到水面的距离」。</li>
  <li>实验 2：把 REFR 从 0.10 调到 0.25，观察水面下的棋盘格被法线扳弯得更厉害——折射强度直接暴露了「法线重建」的质量。</li>
  <li>实验 2：用鼠标拖着光方向转，看高光沿水面起伏游走——高光每一格都跟着（重建出来的）法线变，这就是「没有网格也能反光」。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课你把「粒子」和「水」之间的鸿沟填平了。核心结论一句：<b>模拟归模拟，外观是一趟独立的后处理</b>。粒子只负责标出「哪里有质量」，把一堆点变成一团会反光、会折射的水，靠的是密度场挤出（metaball）、阈值等值线、屏幕空间平滑、法线重建这四步——每一步都是一次「数据搬家 + 重采样」，与你已经熟悉的 Bloom 后处理链是同一套路由。</p>
<p>三个拷问的答案，建议你默写一遍：数据沿「位置→密度→掩码→梯度→法线→颜色」这条链流动；粒子数据归模拟模块，密度/法线是渲染临时计算、帧末即弃的暂存；整条链每帧从头重跑，因为它必须反映最新帧的模拟结果。下一部曲 B3 我们给水面再加一块「波动方程」，让它真正地荡起来——到那时你会发现，法线重建这招依旧原封不动地复用。</p>`
    }
  ]
}
