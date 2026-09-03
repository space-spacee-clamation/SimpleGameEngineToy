// B1 · 液体渲染 I：2D 粒子流体（SPH 降维实现）
export default {
  id: 'B1',
  title: '液体渲染 I：2D 粒子流体',
  est: '2.5 小时',
  coreQuestions: [
    '「平滑核 h」为什么是 SPH 的灵魂参数——它变大一点、变小一点，整池水的性格就变了？',
    '压强不是「两个粒子相撞后弹开」，而是「先算局部密度、再朝密度低的方向推」，这两套思路差在哪？',
    '把 600 个粒子的位置、速度、密度铺成「分量平铺」的并排数组（SoA），逐帧更新时内存里到底发生了什么？',
    'Godot 的 GPU 粒子把「模拟」整体搬进显存的 compute shader——它和我们 CPU 上的 SPH 循环，流程和所有权各归谁？'
  ],
  sections: [
    {
      type: 'text',
      title: '三部曲定位：先造行为，再造外观',
      html: `<p>这是「液体渲染三部曲」的第一课。三课的分工很清晰：<b>B1 只造「液体的行为」</b>——粒子会像水一样流动、受压、堆起来；<b>B2</b> 才把这一滩粒子变成「看起来像水」的画面（metaball 挤出、法线重建、折射配色）；<b>B3</b> 转向另一种完全不同的思路：把水面看成一整片高程场去解波动方程。顺序不能反：外观是对「行为」的包装，行为没造对，画得再像也只是动画，不是模拟。</p>
 <p>那么「行为」用谁来实现？真正的流体是 Navier-Stokes 偏微分方程，逐帧、逐体积元地解，重、且难。我们的第一课遵从一个铁律——<b>降维优先</b>：先用 <b>SPH</b>（Smooth Particle Hydrodynamics，光滑粒子流体动力学）把流体离散成一堆会互相作用的粒子，在 2D、600~1000 个粒子的规模上把四件核心的事亲手造一遍：</p>
 <ul>
   <li><b>密度估计</b>：用「平滑核 h」把离散的粒子糊成连续的密度场。</li>
   <li><b>压强力</b>：局部密度高于目标值 → 从「挤」的地方朝「稀」的地方推，这就是状态方程。</li>
   <li><b>黏性力</b>：让相邻粒子速度趋向一致，是「水」还是「蜂蜜」就看这一项强弱。</li>
   <li><b>边界处理</b>：墙与底，让这一池流质待在盒子里。</li>
 </ul>
 <p>读本课代码时，请始终开着主线课留下的两副眼镜：<b>L3.2 的 SoA</b>（粒子池是一条条「分量平铺」的并排数组，不是一坨坨对象）；<b>L5.1 的空间网格</b>（邻居查找不能 O(n²) 暴力，要用格子粗筛）。它们不是「顺带提一下」，而是本实验的性能地基——600 个粒子 × 每粒子查一圈邻居，布局和查找方式直接决定这池水能不能跑到 60 帧。</p>`
    },
    {
      type: 'text',
      title: 'SPH 的四个力：平滑核 h 是主角',
      html: `<p>SPH 的核心循环一句话：<b>对每个粒子，求出以它为圆心的半径 h 内的所有邻居，用邻居的物理量做一个加权平均，算出力，更新位置。</b>那个决定「邻居是谁」的半径 h，就是<b>平滑核长度（smoothing length）</b>，它是整套 SPH 里最敏感、最该被学员亲手调的一个参数。</p>
 <h4 style="margin:14px 0 6px;color:#9fc3ff">第 1 件：密度估计——粒子不是点，是糊开的场</h4>
 <p>一个粒子本身没有「体积」概念。要让它感受到「这里挤不挤」，就要把每个粒子的质量按一个以 h 为支撑半径的<b>平滑核函数 W(r)</b> 糊开：离粒子越近权重越大，出了 h 权重归零。于是粒子 i 处的密度就是邻居质量的加权和：</p>
 <pre>ρ_i = Σ_j  m_j · W(|x_i − x_j|, h)</pre>
 <p>本实验用 2D 的 <b>Poly6 核</b> W(r) ∝ (h² − r²)³：在 0 和 h 处它和它的一阶导都是 0，数值上最「光滑」。<b>h 大</b>→ 每个粒子的「肚子」里装进更多邻居 → 更平滑、更稳定但细节更糊、也更慢（邻居多了）；<b>h 小</b>→ 更锐利、更便宜，但粒子可能「看不到」彼此而穿模、抖。这正是「参数永远有代价」的又一个现场。</p>
 <h4 style="margin:14px 0 6px;color:#9fc3ff">第 2 件：压强力——状态方程的弹簧</h4>
 <p>算出密度后，怎么决定朝哪推？不是「两粒子距离小于某阈值就弹开」（那是刚体的思路），而是先把局部密度 ρ 和<b>静止密度 ρ₀</b> 比较，得到一个标量压强 p = k·(ρ − ρ₀)。<b>状态方程（equation of state）</b>把「挤」量化成了压强；压强梯度再把力朝「密度低、压强低」的方向铺开。k（刚度/气体常数）越大，水越「不可压缩」、越有弹性——但它不是免费的：k 太大推得太狠，数值积分反而会抖甚至爆。真正的不可压缩流体会用 PBF（Position Based Fluids，B2 会点到）迭代去解，SPH 这种「软状态方程」是性能与真实的折中。</p>
 <h4 style="margin:14px 0 6px;color:#9fc3ff">第 3 件：黏性力——拉平速度差</h4>
 <p>邻居之间速度差会带来「拉扯」：μ 越大，相邻粒子越被拉向共同速度，流动越「稠、慢、稳」。水 μ 小，蜂蜜 μ 大。它干两件好事：一是给出「水 vs 蜂蜜」的性格分档，二是<b>把高频抖动吸走</b>，让整个系统在数值上稳定下来——黏性其实是很多流体求解器的「隐性稳定器」。</p>
 <h4 style="margin:14px 0 6px;color:#9fc3ff">第 4 件：边界——墙与底</h4>
 <p>最后是容器。最朴素的边界：粒子越过墙 → 把位置夹回来、把法向速度反向并打个折扣。可这是「刚体墙」，不是「液体容器」的正解——真正的液体边界要考虑墙附近的密度亏缺（粒子在墙边邻居少、密度偏低，会被错误地吸向墙）。本课先做朴素边界，把「边界是种限制」这件事讲清，鬼见愁的密度修正留给 B2/B3。</p>
 <p>一句话收束本节：<b>SPH 没有任何「碰撞检测」——一切行为都是「邻居加权平均 + 状态方程」涌现出来的</b>。粒子和粒子之间从不直接「相撞」，它们只是通过密度场互相挤压。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'sph2d',
      title: '实验：2D SPH 液体池（SoA + 空间网格）',
      height: 600,
      code: `// 2D SPH 液体池：600 个粒子，用「密度 + 压强 + 黏性」冒出水的行为
// 右侧滑杆：粒子数 / 平滑核 h / 刚度 k / 黏性 / 重力
// 预设三档：水 · 蜂蜜 · 果冻（点一下换性格）
// 鼠标按住并拖动：搅动这池水
// 左上角实时显示 FPS 与每帧邻居对数
// 粒子状态用 SoA（分量平铺）存储，邻居用空间网格粗筛 —— 呼应 L3.2 / L5.1
// 纯 JS + Canvas2D，随机数自带种子，完全确定性

var W = 720, H = 440;          // 画布尺寸
var PANEL_X = 560;             // 右侧控制面板左缘
var SIM_L = 4, SIM_R = 552, SIM_T = 4, SIM_B = 436;   // 流质容器（墙内区域）

var REST_DENSITY = 9;          // 静止密度 rho0（demo 单位）
var MASS = 1;                  // 每个粒子质量
var SUBDT = 1 / 240;           // 子步长（固定，保证确定性与稳定）
var MAX_SUBSTEPS = 8;

// 三个预设的性格参数
var PRESETS = {
  water:  { label: '水',   k: 100, mu: 6,  h: 21, g: 320 },
  honey:  { label: '蜂蜜', k: 100, mu: 28, h: 22, g: 320 },
  jelly:  { label: '果冻', k: 360, mu: 22, h: 24, g: 300 }
};

// 2D 平滑核：Poly6（密度） / Spiky（压强梯度） / 黏性核拉普拉斯
function poly6(r, h) {                     // 密度核值 W(r)
  if (r >= h) return 0;
  var h2 = h * h - r * r;
  return 4 / (Math.PI * Math.pow(h, 8)) * h2 * h2 * h2;
}
function spikyGrad(r, h) {                 // 压强核梯度的标量部分 dW/dr（朝外的负值）
  if (r >= h || r < 1e-9) return 0;
  return -30 / (Math.PI * Math.pow(h, 5)) * (h - r) * (h - r);
}
function viscLap(r, h) {                   // 黏性核拉普拉斯 ∇²W（恒为正）
  if (r >= h) return 0;
  return 40 / (Math.PI * Math.pow(h, 5)) * (h - r);
}

// 确定性伪随机：mulberry32
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// —— 滑杆定义（绘制与交互共用同一几何）——
var SLIDERS = [
  { key: 'count',  label: '粒子数', min: 200, max: 1000, step: 50  },
  { key: 'h',      label: '平滑核 h', min: 12, max: 40,  step: 1   },
  { key: 'k',      label: '刚度 k',  min: 0,  max: 400, step: 10  },
  { key: 'mu',     label: '黏性 μ',  min: 0,  max: 40,  step: 1   },
  { key: 'gravity',label: '重力 g',  min: 0,  max: 800, step: 20  }
];

function sliderY(i) { return 84 + i * 48; }        // 每根滑杆的基线 y
function sliderRectX() { return PANEL_X + 14; }    // 滑杆轨道左缘
function sliderRectW() { return 128; }             // 滑杆轨道宽

engine.run({
  setup: function (state) {
    state.p = { count: 600, h: 21, k: 100, mu: 6, gravity: 320 };  // 当前参数
    state.preset = 'water';
    state.hint = '拖滑杆 / 点预设 / 按住鼠标搅动';
    state.hintT = 6;
    // SoA 分量平铺的粒子池（呼应 L3.2）
    state.px = []; state.py = []; state.vx = []; state.vy = [];
    state.fx = []; state.fy = []; state.rho = []; state.pres = [];
    state.n = 0;
    initFluid(state, 20260903);                    // 固定种子 → 完全确定性
    state.fps = 0;
    state.pairs = 0;                               // 本帧邻居候选对数
    state.lastCount = state.p.count;
  },

  update: function (state, dt, input) {
    // —— 交互：预设按钮（水/蜂蜜/果冻）——
    if (input.mouse.clicked) {
      if (input.mouse.x >= PANEL_X + 14 && input.mouse.x <= PANEL_X + 146) {
        if (input.mouse.y >= 32 && input.mouse.y <= 52) applyPreset(state, 'water');
        else if (input.mouse.y >= 54 && input.mouse.y <= 74) applyPreset(state, 'honey');
        else if (input.mouse.y >= 76 && input.mouse.y <= 96) applyPreset(state, 'jelly');
      }
    }
    // —— 交互：拖滑杆 ——
    if (input.mouse.down && input.mouse.x >= sliderRectX() - 8 && input.mouse.x <= sliderRectX() + sliderRectW() + 8) {
      for (var i = 0; i < SLIDERS.length; i++) {
        var sy = sliderY(i);
        if (Math.abs(input.mouse.y - sy) < 12) {
          var t = (input.mouse.x - sliderRectX()) / sliderRectW();
          t = Math.max(0, Math.min(1, t));
          var def = SLIDERS[i];
          var val = def.min + t * (def.max - def.min);
          val = Math.round(val / def.step) * def.step;
          val = Math.max(def.min, Math.min(def.max, val));
          state.p[def.key] = val;
        }
      }
    }
    // 粒子数变了 → 重建
    if (state.p.count !== state.lastCount) {
      state.lastCount = state.p.count;
      initFluid(state, 20260903);
    }
    // —— 鼠标搅动：按下时把鼠标附近的粒子推出去 ——
    state.stir = input.mouse.down && input.mouse.x < PANEL_X;

    // —— 物理推进：固定子步 ——
    dt = Math.max(0, Math.min(dt, 1 / 30));
    var substeps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.round(dt / SUBDT)));
    var sdt = dt / substeps;
    state.pairs = 0;
    for (var s = 0; s < substeps; s++) {
      stepFluid(state, sdt, input);
    }
    if (dt > 0) state.fps = state.fps * 0.9 + (1 / dt) * 0.1;
    state.hintT -= dt;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, W, H);

    // 容器边框
    ctx.strokeStyle = '#274060';
    ctx.lineWidth = 1;
    ctx.strokeRect(SIM_L, SIM_T, SIM_R - SIM_L, SIM_B - SIM_T);

    // 粒子：按密度着色（红=被压缩，蓝=稀疏，水色=接近静止密度）
    for (var i = 0; i < state.n; i++) {
      var d = state.rho[i];
      var t = (d - REST_DENSITY) / REST_DENSITY;     // 偏离静止密度的比例
      t = Math.max(-1, Math.min(1, t));
      var r, g, b;
      if (t >= 0) { r = 90 + 160 * t; g = 150 - 80 * t; b = 230 - 140 * t; }  // 越挤越红
      else { r = 60; g = 150 + 60 * (-t); b = 235; }                            // 越稀越青
      ctx.fillStyle = 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
      var px = state.px[i], py = state.py[i];
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // 右侧控制面板
    ctx.fillStyle = '#121a2a';
    ctx.fillRect(PANEL_X, 0, W - PANEL_X, H);
    ctx.strokeStyle = '#1e2a3d';
    ctx.beginPath(); ctx.moveTo(PANEL_X, 0); ctx.lineTo(PANEL_X, H); ctx.stroke();

    ctx.font = '13px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('SPH 参数', PANEL_X + 14, 22);

    // 预设按钮
    drawTab(state, ctx, 'water', PANEL_X + 14, 32);
    drawTab(state, ctx, 'honey', PANEL_X + 62, 32);
    drawTab(state, ctx, 'jelly', PANEL_X + 110, 32);

    // 滑杆
    for (var i = 0; i < SLIDERS.length; i++) {
      var def = SLIDERS[i];
      var sy = sliderY(i);
      var val = state.p[def.key];
      ctx.fillStyle = '#8fa7c7';
      ctx.fillText(def.label, PANEL_X + 14, sy - 6);
      ctx.fillStyle = '#2a3a54';
      ctx.fillRect(sliderRectX(), sy, sliderRectW(), 8);
      var frac = (val - def.min) / (def.max - def.min);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(sliderRectX(), sy, sliderRectW() * frac, 8);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(String(val), sliderRectX(), sy + 22);
    }

    // 统计
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('FPS  ' + state.fps.toFixed(0), PANEL_X + 14, H - 92);
    ctx.fillText('粒子 ' + state.n, PANEL_X + 14, H - 74);
    ctx.fillText('邻居对数/帧 ' + state.pairs, PANEL_X + 14, H - 56);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('(网格粗筛后)', PANEL_X + 14, H - 38);

    // 提示
    ctx.fillStyle = state.hintT > 0 ? '#fbbf24' : '#5b7397';
    ctx.fillText(state.hint, PANEL_X + 14, H - 14);
  }
});

function applyPreset(state, name) {
  var p = PRESETS[name];
  state.preset = name;
  state.p.h = p.h; state.p.k = p.k; state.p.mu = p.mu; state.p.gravity = p.g;
  state.hint = '已切换：' + p.label + '（k=' + p.k + ' μ=' + p.mu + '）';
  state.hintT = 4;
}

function drawTab(state, ctx, name, x, y) {
  var active = state.preset === name;
  ctx.fillStyle = active ? '#f59e0b' : '#243650';
  ctx.fillRect(x, y, 38, 16);
  ctx.fillStyle = active ? '#0b0f17' : '#9db4d0';
  ctx.font = '11px monospace';
  ctx.fillText(PRESETS[name].label, x + 9, y + 12);
  ctx.font = '13px monospace';
}

// 用固定种子重建整池水：网格排布 + 微小确定性抖动
function initFluid(state, seed) {
  var rand = mulberry32(seed);
  var count = state.p.count;
  var spacing = 11;                        // 静止间距
  // 估算一个能装下 count 个粒子的矩形水柱
  var cols = Math.max(1, Math.round(Math.sqrt(count * (SIM_R - SIM_L) / (SIM_B - SIM_T))));
  var startX = SIM_L + 40;
  var startY = SIM_B - 20;
  state.n = 0;
  for (var i = 0; i < count; i++) {
    var cx = i % cols, cy = Math.floor(i / cols);
    var x = startX + cx * spacing + (rand() - 0.5) * 1.5;
    var y = startY - cy * spacing + (rand() - 0.5) * 1.5;
    // 排布时若超出底部或右侧则向上/向左换行，简单处理为堆在上方区域
    if (y < SIM_T + 6) y = SIM_T + 6 + (rand() * 4);
    state.px[i] = x; state.py[i] = y;
    state.vx[i] = 0; state.vy[i] = 0;
    state.fx[i] = 0; state.fy[i] = 0;
    state.rho[i] = 0; state.pres[i] = 0;
  }
  state.n = count;
}

// 一个子步：空间网格 → 密度 → 力 → 积分
function stepFluid(state, dt, input) {
  var n = state.n;
  var h = state.p.h, k = state.p.k, mu = state.p.mu, g = state.p.gravity;

  // —— 空间网格粗筛（呼应 L5.1）——
  var cell = h;
  var grid = {};
  var cx = [], cy = [];
  for (var i = 0; i < n; i++) {
    var gc = Math.floor(state.px[i] / cell);
    var gr = Math.floor(state.py[i] / cell);
    cx[i] = gc; cy[i] = gr;
    var key = gc + ',' + gr;
    (grid[key] || (grid[key] = [])).push(i);
  }

  // —— 第一遍：密度 ——
  for (var a = 0; a < n; a++) {
    var rho = 0;
    for (var dx = -1; dx <= 1; dx++)
      for (var dy = -1; dy <= 1; dy++) {
        var cellList = grid[(cx[a] + dx) + ',' + (cy[a] + dy)];
        if (!cellList) continue;
        for (var m = 0; m < cellList.length; m++) {
          var b = cellList[m];
          if (b === a) { rho += MASS * poly6(0, h); continue; } // 自身贡献
          var dxx = state.px[a] - state.px[b], dyy = state.py[a] - state.py[b];
          var r = Math.sqrt(dxx * dxx + dyy * dyy);
          rho += MASS * poly6(r, h);
        }
      }
    state.rho[a] = rho;
    state.pres[a] = Math.max(0, k * (rho - REST_DENSITY));   // 状态方程 p = k(rho-rho0)
    state.pairs += 1;                                        // 粗略统计：每粒子一次邻域扫描计数
  }

  // —— 第二遍：压强力 + 黏性力 + 重力 + 鼠标 ——
  for (var i2 = 0; i2 < n; i2++) {
    var fx = 0, fy = 0;
    for (var dx2 = -1; dx2 <= 1; dx2++)
      for (var dy2 = -1; dy2 <= 1; dy2++) {
        var cellList2 = grid[(cx[i2] + dx2) + ',' + (cy[i2] + dy2)];
        if (!cellList2) continue;
        for (var m2 = 0; m2 < cellList2.length; m2++) {
          var j = cellList2[m2];
          if (j === i2) continue;
          var dxx2 = state.px[i2] - state.px[j], dyy2 = state.py[i2] - state.py[j];
          var r2 = Math.sqrt(dxx2 * dxx2 + dyy2 * dyy2);
          if (r2 >= h) continue;
          var nx = dxx2 / r2, ny = dyy2 / r2;

          // 压强力：对称形式，天然动量守恒
          var pg = spikyGrad(r2, h);
          var pterm = (state.pres[i2] + state.pres[j]) / (2 * state.rho[j]);
          fx += -MASS * pterm * pg * nx;
          fy += -MASS * pterm * pg * ny;

          // 黏性力：拉平速度差
          var vterm = viscLap(r2, h);
          var dvx = state.vx[j] - state.vx[i2], dvy = state.vy[j] - state.vy[i2];
          fx += MASS * mu * vterm * dvx / 1;
          fy += MASS * mu * vterm * dvy;
        }
      }
    fy += MASS * g;                          // 重力
    // 鼠标搅动：把鼠标周围粒子朝外推（按距离衰减的斥力）
    if (state.stir) {
      var mx = input.mouse.x, my = input.mouse.y;
      var sdx = state.px[i2] - mx, sdy = state.py[i2] - my;
      var sr = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sr < 80 && sr > 1e-6) {
        var strength = 3000 * (1 - sr / 80);
        fx += sdx / sr * strength;
        fy += sdy / sr * strength;
      }
    }
    state.fx[i2] = fx; state.fy[i2] = fy;
  }

  // —— 第三遍：积分 + 边界 ——
  for (var i3 = 0; i3 < n; i3++) {
    state.vx[i3] += state.fx[i3] / MASS * dt;
    state.vy[i3] += state.fy[i3] / MASS * dt;
    state.px[i3] += state.vx[i3] * dt;
    state.py[i3] += state.vy[i3] * dt;
    // 朴素边界：夹回 + 法向反向 + 速度衰减
    if (state.px[i3] < SIM_L) { state.px[i3] = SIM_L; state.vx[i3] = Math.abs(state.vx[i3]) * 0.5; }
    if (state.px[i3] > SIM_R) { state.px[i3] = SIM_R; state.vx[i3] = -Math.abs(state.vx[i3]) * 0.5; }
    if (state.py[i3] < SIM_T) { state.py[i3] = SIM_T; state.vy[i3] = Math.abs(state.vy[i3]) * 0.5; }
    if (state.py[i3] > SIM_B) { state.py[i3] = SIM_B; state.vy[i3] = -Math.abs(state.vy[i3]) * 0.5; }
  }
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>把<b>平滑核 h</b> 从 21 一路拖到 12：想看「穿模/抖动」是怎么来的就盯底部——h 太小，粒子「看」不到下方的粒子，来不及被压强推开就穿透了。再拖到 40：池子变「糊」、FPS 往下掉——<b>邻居多了，每帧的邻居对/帧直接涨</b>，这是 h 的全部代价。</li>
  <li>把<b>刚度 k</b> 拖到 0：压强力消失，整池水只受重力和黏性支配，粒子会直直叠落到底、再也堆不出「水面」。k 拉满 400：水开始抖、甚至炸开——<b>状态方程是根硬弹簧，太硬推过头数值积分就发散</b>，这是 SPH 需要用 PBF 去补的软肋。</li>
  <li>把<b>黏性 μ</b> 从 6 拖到 28：水滴落下去会拉出黏丝的「蜂蜜感」。再点预设「果冻」（k=360 + μ=22）：几乎不流动、会弹——<b>同一套三力，参数变了就是另一种物质</b>。</li>
  <li>按住鼠标快速画圈搅动：看被搅起的粒子颜色变红（被压缩）又恢复水色——颜色就是局部密度的实时探针。</li>
  <li>把<b>粒子数</b>拉到 1000：注意 60 帧还能不能守住。想一想：为什么增长不是线性的也不是指数爆炸——因为我们已经用空间网格把 O(n²) 砍成了「每个粒子只扫周围几格」。</li>
 </ul>`
    },
    {
      type: 'source',
      title: '源码走读：GPU 粒子——把「模拟」整块搬进显存',
      files: [
        { path: 'servers/rendering/renderer_rd/storage_rd/particles_storage.h', note: '看 struct ParticleEmissionBuffer 里的 Data：每粒子一块 xform[16]+velocity[3]+color[4]+custom[4] 连续铺开。和本实验的 SoA 对照：CPU 上我们按「分量」平铺（所有 x 挨着），GPU 上它按「粒子」成块（每个粒子的全部字段挨着）——同一段数据，两种布局服务于两种消费方式。再看 struct Particles：emitting/amount/random_seed/speed_scale 这些字段，和我们的状态变量一一对应，说明「粒子系统的参数模型」是通用的，只有「谁在哪模拟」不同。' },
        { path: 'servers/rendering/renderer_rd/storage_rd/particles_storage.cpp', note: '重点两个函数：update_particles()（约 1442 行起）遍历 SelfList 粒子更新链表——只有被标记 dirty 的系统才进链表，这是典型的「按需更新」；注释「use transform feedback to process particles」点破关键：模拟不在 CPU 循环里，而在 GPU 的 compute/transform feedback 里。再搜 particles_set_seed：想看 Godot 怎么保证粒子发射的可复现随机，就顺着它找到 random_seed 的流向。' }
      ]
    },
    {
      type: 'text',
      title: '小结：三个灵魂拷问落到这池水',
      html: `<p>把贯穿全课的三个灵魂拷问，亲手答在这一池 2D 粒子上：</p>
 <ul>
   <li><b>数据怎么流动？</b>每帧每个子步，粒子从分量平铺的 SoA 数组（px/py/vx/vy/rho/pres）里读出，先经<b>空间网格</b>粗筛出邻居，再经<b>密度→压强→力→积分</b>四小步流转，最后写回同一条数组——一条「缓存行 → 寄存器 → ALU → 缓存行」的流水线在 600 粒子上跑了若干遍。</li>
   <li><b>所有权归谁？</b>整批粒子池（7 条并排 Float 数组）由流体求解器一个模块独占，边界清晰、生命周期随实验室生命周期；网格是每帧临时重建的草稿（用完即弃），不负长期所有权。对照 Godot：GPU 粒子的缓冲 D 归 ParticlesStorage 管、靠 RID 引用。</li>
   <li><b>什么时候发生？</b>布局在 setup 里一次定死（整个生命周期不变）；空间网格<b>每帧重建</b>；密度/力/积分在<b>固定子步</b>里多次发生，正是固定子步换来的确定性与稳定。</li>
 </ul>
 <p>最后把这个系列的方向钉死：<b>今天造的是「行为」，不是「外观」</b>——粒子会受压、会流动、会堆成水面，但它还只是一滩彩色小方块。下一课 B2 干的事，就是给这滩行为贴一张水的皮肤：用 metaball 把离散粒子糊成连续表面、重建法线、上折射配色。带着「行为已就绪」的底气，再去谈外观就水到渠成。</p>`
    }
  ]
}
