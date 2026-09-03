// B7 · 透明物排序与 OIT 一瞥
export default {
  id: 'B7',
  title: '透明物排序与 OIT 一瞥',
  est: '2 小时',
  coreQuestions: [
    '不透明物靠 z-buffer 逐像素「近者胜」，与绘制顺序彻底解耦；透明物为什么被混合公式逼回「远→近逐个糊」的顺序游戏？',
    '画家算法为什么对穿插与成环无解？引擎怎么把整块几何的深度压缩成「支点距离 + 打包 sort key」，这个近似又在哪儿撒谎？',
    'depth peeling 与加权平均 OIT 各用什么代价换掉排序？对照 Godot：2D 的 z 桶与 y-sort 各解决什么，3D 的透明排序又发生在哪一层？'
  ],
  sections: [
  {
    type: 'text',
    title: '不透明的秩序：z-buffer 为什么赢',
    html: `<p>不透明的世界里，<b>可见性可以被逐像素裁决</b>：z-buffer 给每个像素记一个「至今离相机最近的深度」，新片元要么更近、要么滚蛋——一百万个物体乱序提交，结果也一模一样。这份「顺序无关」是 GPU 管线最舒服的秩序，也是 L4.3 里不透明 pass 敢乱序合批的底气。</p>
<p>透明一来，两根支柱同时塌。<b>第一塌：混合不可交换。</b>alpha blend 的公式是 dst' = src×α + dst×(1−α)，它不满足交换律：拿纯红 (255,0,0) 与纯蓝 (0,0,255) 各 α=0.5 叠在黑底上，先红后蓝得到 (64,0,128)，先蓝后红得到 (128,0,64)——红蓝分量直接互换。<b>绘制顺序本身就是画面数据的一部分</b>，这是混合从数学上带来的判决，不是实现瑕疵。</p>
<p><b>第二塌：深度写入自相残杀。</b>若透明物照常写 z-buffer，先画的那块占住「最近深度」，后面所有透明片元深度测试全部失败——十层玻璃只剩最先画的那一层。所以引擎的标准秩序是一条单向车道：<b>不透明先画（顺序无所谓，写深度）→ 透明后画（读深度，换取与不透明世界的正确遮挡；不写深度），并按远→近排序</b>。这个「远→近逐个糊」就是画家算法（painter's algorithm）：像画家一样先画远景、再把近景糊上去——排序从此成为透明渲染的宿命。</p>`
  },
  {
    type: 'text',
    title: '排序的死穴、支点的谎言与 OIT 的两条出路',
    html: `<p>画家算法有一个致命假设：任何两个物体总能分出「谁整体在前」。<b>穿插几何打破它</b>：两块长板十字斜插，每块都有一半在前面——任何全局顺序都不对；三块板首尾成环更是<b>数学上无解</b>，这不是算法不够好，是问题本身没有答案（实验里按 G 就能滚出这种环路）。工程上的补救只有一个字：<b>切</b>——把穿插处细分成小片，把「物体级排序」降级成「片级排序」，用数量换正确。而排序每帧、每个视口都要重做，n 个物体 O(n log n)。引擎的对策是把比较压成整数：把深度、材质、状态打包进一个 64 位 sort key，一次整数比较顶一串指针比较，还顺便让「同材质相邻」喂饱合批。</p>
<p>更狠的近似是连几何都不看，只看<b>一个点</b>：物体的排序支点（原点，或包围盒中心）到相机的距离。Godot 把这两个旋钮直接暴露给了用户：VisualInstance3D 的 <code>sorting_offset</code>（手动把排序深度推远推近）与 <code>sorting_use_aabb_center</code>（支点改用包围盒中心），材质另有 render_priority 强行插队。支点对不上几何时——细长的、斜插的物体——谎言立刻穿帮，这就是实验里闪烁的红区。</p>
<p>能不能干脆不排序？这就是 <b>OIT（order-independent transparency，顺序无关透明）</b> 的问题。<b>depth peeling 逐层剥离</b>：第一遍只留每像素最近的一层（与 z-buffer 同一张深度图），第二遍剥掉已画的、留下第二层……要 N 遍才剥 N 层，精确但昂贵，层数还难预估。<b>加权平均 OIT（WBOIT）</b> 则彻底放弃顺序：一遍内逐像素累加 Σw·α·C 与 Σw·α，最后一次除法还原颜色，权重 w 随深度分配「谁更可能在前谁话语权大」。代价是颜色变成加权平均——对比度损失、层与层的正确遮挡关系被抹平、极端场景发灰；换来零排序、一遍完成、<b>永不闪烁</b>。烟、火、粒子这些「本就没有严格层」的东西用它血赚；彩色玻璃后压着可读文字，还是老实排序。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'sorting',
    title: '实验：排序错误现场——穿插玻璃板的四种活法',
    height: 620,
    code: `// 排序错误现场:穿插的半透明玻璃板,四种活法(正交投影,深度=z,越大离相机越近)
// 模式 1 不排序:每 0.5 秒随机重掷绘制顺序——混合不可交换,画面持续闪变
// 模式 2 中心排序:画家算法,只看每块板支点(中心)的深度——穿插带当场穿帮
// 模式 3 细分排序:把板切成小片再全排——近似逐片元排序,穿插带基本愈合
// 模式 4 加权平均:WBOIT,彻底不排序——一遍加权平均,错得稳定但发灰
// 红色闪烁 = 该像素与「逐像素精确排序参考解」不符;右侧深度尺 = 每块板的深度区间与支点
// 键 1/2/3/4 切模式,G 或点「随机场景」按钮换一个穿插现场

var SCENE = { x: 0, y: 46, w: 660, h: 392 };  // 场景区(避开顶部按钮行与右侧深度尺)
var STEP = 4;                                 // 参考解采样步长(px)
var COLS = 165, ROWS = 98;                    // 采样网格 165x98
var NS = COLS * ROWS;                         // 采样总数
var BG = { r: 13, g: 20, b: 32 };             // 场景底色 #0d1420
var CELL = 30, PCAP = 10;                     // 细分目标尺寸(px)与每边片数上限
var ERR_TH = 30;                              // 判定与参考解不符的通道差阈值
var MARK_CAP = 900;                           // 闪烁标记上限

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
}

// 自带种子的确定性随机数(不用 Math.random,重跑结果一致)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 造一块玻璃板:中心/宽高/平面内旋转/角点深度 z0/沿 u 全边的深度差 dzU/沿 v 的 dzV
function makeShard(cx, cy, w, h, rot, z0, dzU, dzV, col, a, name) {
  var cu = Math.cos(rot), su = Math.sin(rot);
  var ux = w * cu, uy = w * su;               // 边向量 u(全边长)
  var vx = -h * su, vy = h * cu;              // 边向量 v
  var px = cx - ux / 2 - vx / 2, py = cy - uy / 2 - vy / 2;
  var cs = [
    { x: px, y: py },
    { x: px + ux, y: py + uy },
    { x: px + ux + vx, y: py + uy + vy },
    { x: px + vx, y: py + vy }
  ];
  var zmin = z0, zmax = z0 + dzU + dzV, tmp;
  if (zmin > zmax) { tmp = zmin; zmin = zmax; zmax = tmp; }
  return {
    p: cs, z0: z0, dzU: dzU, dzV: dzV,
    ux: ux, uy: uy, vx: vx, vy: vy,
    zc: z0 + dzU * 0.5 + dzV * 0.5,           // 支点深度(中心)= 画家算法的排序键
    zmin: zmin, zmax: zmax, col: col, a: a, name: name
  };
}

// 屏幕点是否在板内:解参数 (s,t),顺手得到该点精确深度 z = z0 + s*dzU + t*dzV
function hitShard(sh, sx, sy) {
  var dx = sx - sh.p[0].x, dy = sy - sh.p[0].y;
  var det = sh.ux * sh.vy - sh.uy * sh.vx;
  if (det > -1e-6 && det < 1e-6) return null;
  var s = (dx * sh.vy - dy * sh.vx) / det;
  var t = (sh.ux * dy - sh.uy * dx) / det;
  if (s < -0.001 || s > 1.001 || t < -0.001 || t > 1.001) return null;
  return { s: s, t: t, z: sh.z0 + s * sh.dzU + t * sh.dzV };
}

// 默认现场:背板 + 一对深度斜率相反的十字穿插板 + 竖插板 + 前后各一块干净板
function buildDefault() {
  var shards = [];
  shards.push(makeShard(330, 250, 560, 300, 0, -90, 0, 0, { r: 59, g: 110, b: 165 }, 0.26, '背板'));
  shards.push(makeShard(300, 230, 520, 110, 0, -30, 70, 0, { r: 34, g: 211, b: 238 }, 0.5, '斜板A'));
  shards.push(makeShard(300, 250, 520, 110, 0, 40, -70, 0, { r: 245, g: 158, b: 11 }, 0.5, '斜板B'));
  shards.push(makeShard(330, 240, 120, 330, 0, 10, 0, 50, { r: 52, g: 211, b: 153 }, 0.48, '竖板C'));
  shards.push(makeShard(480, 330, 180, 120, -0.35, 80, 0, 0, { r: 251, g: 113, b: 133 }, 0.5, '前卡'));
  shards.push(makeShard(150, 300, 150, 100, 0.5, 5, 0, 0, { r: 167, g: 139, b: 250 }, 0.52, '小卡'));
  return shards;
}

// 随机现场:六块带深度斜率的板,挤在场地中央(大概率两两穿插成环) + 前后各一块干净板
function buildRandom(seed) {
  var rnd = mulberry32(seed);
  var pal = [
    { r: 34, g: 211, b: 238 }, { r: 245, g: 158, b: 11 }, { r: 52, g: 211, b: 153 },
    { r: 251, g: 113, b: 133 }, { r: 167, g: 139, b: 250 }, { r: 56, g: 189, b: 248 }
  ];
  var shards = [];
  shards.push(makeShard(330, 250, 560, 300, 0, -95, 0, 0, { r: 59, g: 110, b: 165 }, 0.24, '背板'));
  var i;
  for (i = 0; i < 6; i++) {
    shards.push(makeShard(
      230 + rnd() * 200, 170 + rnd() * 150,
      220 + rnd() * 180, 110 + rnd() * 60,
      (rnd() - 0.5) * 1.0,
      -40 + rnd() * 70,
      (rnd() - 0.5) * 180, (rnd() - 0.5) * 90,
      pal[Math.floor(rnd() * pal.length)],
      0.35 + rnd() * 0.2, '板' + (i + 1)));
  }
  shards.push(makeShard(330 + (rnd() - 0.5) * 200, 320 + (rnd() - 0.5) * 60, 170, 110,
    (rnd() - 0.5) * 0.8, 78 + rnd() * 12, 0, 0, { r: 251, g: 113, b: 133 }, 0.42, '前卡'));
  return shards;
}

// 模式 3 细分:每块板切成约 CELL 大小的小片,片深取片中心——支点谎言的最小修正
function buildPieces(shards) {
  var pieces = [];
  var k;
  for (k = 0; k < shards.length; k++) {
    var sh = shards[k];
    var lu = Math.sqrt(sh.ux * sh.ux + sh.uy * sh.uy);
    var lv = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
    var n = Math.min(PCAP, Math.max(1, Math.ceil(lu / CELL)));
    var m = Math.min(PCAP, Math.max(1, Math.ceil(lv / CELL)));
    sh.pn = n; sh.pm = m; sh.pi0 = pieces.length;   // 该板小片的全局起点
    var i, j, q;
    for (j = 0; j < m; j++) {
      for (i = 0; i < n; i++) {
        var s0 = i / n, s1 = (i + 1) / n, t0 = j / m, t1 = (j + 1) / m;
        var sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
        var sQ = [s0, s1, s1, s0], tQ = [t0, t0, t1, t1];
        var c = [];
        for (q = 0; q < 4; q++) {
          c.push({ x: sh.p[0].x + sQ[q] * sh.ux + tQ[q] * sh.vx, y: sh.p[0].y + sQ[q] * sh.uy + tQ[q] * sh.vy });
        }
        pieces.push({ idx: pieces.length, si: k, c: c, z: sh.z0 + sm * sh.dzU + tm * sh.dzV });
      }
    }
  }
  return pieces;
}

// 采样缓存:每个样本记录覆盖它的板(含精确深度)、它落进的小片,以及参考解颜色
function buildSampleCache(state) {
  var covCnt = new Uint8Array(NS);
  var covSi = new Uint8Array(NS * 12);
  var covZ = new Float32Array(NS * 12);
  var pieCnt = new Uint8Array(NS);
  var piePi = new Uint16Array(NS * 12);
  var refR = new Uint8Array(NS), refG = new Uint8Array(NS), refB = new Uint8Array(NS);
  var i, j, k, q;
  for (j = 0; j < ROWS; j++) {
    for (i = 0; i < COLS; i++) {
      var idx = j * COLS + i;
      var sx = SCENE.x + i * STEP + 2, sy = SCENE.y + j * STEP + 2;
      var n = 0, np = 0;
      for (k = 0; k < state.shards.length; k++) {
        var h = hitShard(state.shards[k], sx, sy);
        if (!h) continue;
        if (n < 12) { covSi[idx * 12 + n] = k; covZ[idx * 12 + n] = h.z; n++; }
        var sh = state.shards[k];
        if (np < 12) {                                // 该点落进这块板的哪一片
          var ci = Math.min(sh.pn - 1, Math.max(0, Math.floor(h.s * sh.pn)));
          var cj = Math.min(sh.pm - 1, Math.max(0, Math.floor(h.t * sh.pm)));
          piePi[idx * 12 + np] = sh.pi0 + cj * sh.pn + ci;
          np++;
        }
      }
      covCnt[idx] = n; pieCnt[idx] = np;
      // 参考解:该像素所有片按真实深度远→近精确合成(每像素自己的正确顺序)
      var order = [];
      for (k = 0; k < n; k++) order.push(k);
      order.sort(function (a, b) { return covZ[idx * 12 + a] - covZ[idx * 12 + b]; });
      var r = BG.r, g = BG.g, b = BG.b;
      for (q = 0; q < order.length; q++) {
        var shq = state.shards[covSi[idx * 12 + order[q]]];
        r = shq.col.r * shq.a + r * (1 - shq.a);
        g = shq.col.g * shq.a + g * (1 - shq.a);
        b = shq.col.b * shq.a + b * (1 - shq.a);
      }
      refR[idx] = Math.round(r); refG[idx] = Math.round(g); refB[idx] = Math.round(b);
    }
  }
  state.covCnt = covCnt; state.covSi = covSi; state.covZ = covZ;
  state.pieCnt = pieCnt; state.piePi = piePi;
  state.refR = refR; state.refG = refG; state.refB = refB;
}

// 按「当前模式的绘制顺序」解析重演一遍合成,产出 curR/G/B;
// 它与参考解逐样本比对,差异就是屏幕上该闪红的位置
function buildComposite(state) {
  var curR = new Uint8Array(NS), curG = new Uint8Array(NS), curB = new Uint8Array(NS);
  var mode = state.mode;
  var rankS = null, rankP = null;
  var oi;
  if (mode === 1 || mode === 2) {
    rankS = {};
    for (oi = 0; oi < state.order.length; oi++) rankS[state.order[oi]] = oi;
  } else if (mode === 3) {
    rankP = {};
    for (oi = 0; oi < state.pieceOrder.length; oi++) rankP[state.pieceOrder[oi].idx] = oi;
  }
  var zr = state.zMax - state.zMin + 1e-6;
  var jj, ii, k, q;
  for (jj = 0; jj < ROWS; jj++) {
    for (ii = 0; ii < COLS; ii++) {
      var idx = jj * COLS + ii;
      var r = BG.r, g = BG.g, b = BG.b;
      if (mode === 4) {
        // WBOIT:一次加权平均,无顺序;权重随深度给「更可能在前」的片元更大话语权
        var cnt4 = state.covCnt[idx];
        var den = 0, numR = 0, numG = 0, numB = 0, accA = 0;
        for (k = 0; k < cnt4; k++) {
          var sh4 = state.shards[state.covSi[idx * 12 + k]];
          var dn = (state.covZ[idx * 12 + k] - state.zMin) / zr;
          if (dn < 0) dn = 0;
          if (dn > 1) dn = 1;
          var wa = (0.06 + 0.94 * dn) * sh4.a;
          numR += wa * sh4.col.r; numG += wa * sh4.col.g; numB += wa * sh4.col.b;
          den += wa; accA += sh4.a;
        }
        if (den > 0.0001) {
          if (accA > 1) accA = 1;
          r = numR / den * accA + BG.r * (1 - accA);
          g = numG / den * accA + BG.g * (1 - accA);
          b = numB / den * accA + BG.b * (1 - accA);
        }
      } else {
        // 模式 1/2/3:按各自的顺序重演 src-over(远→近应按 z 升序逐个糊)
        var isP = (mode === 3);
        var cnt2 = isP ? state.pieCnt[idx] : state.covCnt[idx];
        var used = 0;
        for (q = 0; q < cnt2; q++) {
          var best = -1, bestRank = 1e18;
          for (k = 0; k < cnt2; k++) {
            if ((used & (1 << k)) !== 0) continue;
            var rk = 1e17;
            if (isP) {
              var pv = rankP[state.piePi[idx * 12 + k]];
              if (pv !== undefined) rk = pv;
            } else {
              var sv = rankS[state.covSi[idx * 12 + k]];
              if (sv !== undefined) rk = sv;
            }
            if (rk < bestRank) { bestRank = rk; best = k; }
          }
          if (best < 0) break;
          used = used | (1 << best);
          var shB;
          if (isP) shB = state.shards[state.pieces[state.piePi[idx * 12 + best]].si];
          else shB = state.shards[state.covSi[idx * 12 + best]];
          r = shB.col.r * shB.a + r * (1 - shB.a);
          g = shB.col.g * shB.a + g * (1 - shB.a);
          b = shB.col.b * shB.a + b * (1 - shB.a);
        }
      }
      curR[idx] = Math.round(r);
      curG[idx] = Math.round(g);
      curB[idx] = Math.round(b);
    }
  }
  state.curR = curR; state.curG = curG; state.curB = curB;
}

// 与参考解逐样本比对:差异超过阈值的样本位置记为闪烁标记
function compareMarks(state) {
  var marks = [];
  var err = 0;
  var idx;
  for (idx = 0; idx < NS; idx++) {
    var d = Math.abs(state.curR[idx] - state.refR[idx]);
    var d2 = Math.abs(state.curG[idx] - state.refG[idx]); if (d2 > d) d = d2;
    var d3 = Math.abs(state.curB[idx] - state.refB[idx]); if (d3 > d) d = d3;
    if (d > ERR_TH) {
      err++;
      if (marks.length < MARK_CAP) marks.push(idx);
    }
  }
  state.marks = marks;
  state.errCount = err;
  state.errRate = (err * 100 / NS).toFixed(1);
}

// 模式 1 的随机绘制顺序(自带种子,重跑一致)
function shuffledIdx(state) {
  var idxs = [];
  var k;
  for (k = 0; k < state.shards.length; k++) idxs.push(k);
  var rnd = mulberry32(state.seed * 7919 + state.shuffleNo * 104729);
  for (k = idxs.length - 1; k > 0; k--) {
    var j = Math.floor(rnd() * (k + 1));
    var tmp = idxs[k]; idxs[k] = idxs[j]; idxs[j] = tmp;
  }
  return idxs;
}

// 模式 3 的片级排序(每帧都排,顺手测耗时——真实引擎每帧也重排)
function sortPieces(state) {
  var t0 = nowMs();
  var arr = state.pieces.slice();
  arr.sort(function (a, b) { return a.z - b.z; });
  state.sortMs = nowMs() - t0;
  return arr;
}

function setMode(state, m) {
  if (state.mode === m) return;
  state.mode = m;
  state.cacheDirty = true;
}

// 换现场:重建板/小片/采样缓存;种子 7 是手工调好的默认穿插现场
function loadScene(state, seed) {
  state.seed = seed;
  state.shuffleNo = 0;
  state.shards = (seed === 7) ? buildDefault() : buildRandom(seed);
  var zmin = 1e9, zmax = -1e9, k;
  for (k = 0; k < state.shards.length; k++) {
    if (state.shards[k].zmin < zmin) zmin = state.shards[k].zmin;
    if (state.shards[k].zmax > zmax) zmax = state.shards[k].zmax;
  }
  state.zMin = zmin; state.zMax = zmax;
  state.pieces = buildPieces(state.shards);
  buildSampleCache(state);
  state.order = shuffledIdx(state);
  state.pieceOrder = state.pieces;
  state.cacheDirty = true;
}

function sceneOrder(state) {
  var a = [], k;
  for (k = 0; k < state.shards.length; k++) a.push(k);
  return a;
}

function rgbCss(col) {
  return 'rgb(' + col.r + ',' + col.g + ',' + col.b + ')';
}

function rgbaCss(col, a) {
  return 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + a + ')';
}

function poly4(pts, ctx) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
}

function drawShardsByOrder(state, ctx, order) {
  var k;
  for (k = 0; k < order.length; k++) {
    var sh = state.shards[order[k]];
    ctx.fillStyle = rgbCss(sh.col);
    ctx.globalAlpha = sh.a;
    poly4(sh.p, ctx);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 模式 4 的画法:把逐像素加权平均的结果整体放大。
// canvas 2D 没有逐像素除法,无法直接表达 WBOIT——这正是 OIT 必须动用特殊管线的原因。
function drawWboitImage(state, ctx) {
  var data = state.lo.img.data;
  var i;
  for (i = 0; i < NS; i++) {
    data[i * 4] = state.curR[i];
    data[i * 4 + 1] = state.curG[i];
    data[i * 4 + 2] = state.curB[i];
    data[i * 4 + 3] = 255;
  }
  state.lo.cx.putImageData(state.lo.img, 0, 0);
  ctx.drawImage(state.lo.cv, SCENE.x, SCENE.y, SCENE.w, SCENE.h);
}

// 右侧深度尺:长条=该板的深度区间,圆点=排序支点(画家算法只看这个点)
function drawRuler(state, ctx) {
  var top = 64, bot = 420;
  var span = state.zMax - state.zMin + 1e-6;
  function mapZ(z) { return top + (state.zMax - z) / span * (bot - top); }
  ctx.fillStyle = '#0e1626';
  ctx.fillRect(658, 46, 62, 392);
  ctx.strokeStyle = '#2c3e55';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(689, top - 6); ctx.lineTo(689, bot + 6); ctx.stroke();
  ctx.fillStyle = '#7d93b3';
  ctx.font = '11px monospace';
  ctx.fillText('近', 684, top - 10);
  ctx.fillText('远', 684, bot + 16);
  var k;
  for (k = 0; k < state.shards.length; k++) {
    var sh = state.shards[k];
    var yA = mapZ(sh.zmax), yB = mapZ(sh.zmin);
    ctx.fillStyle = rgbaCss(sh.col, 0.45);
    ctx.fillRect(672, yA, 12, Math.max(2, yB - yA));
    ctx.fillStyle = rgbaCss(sh.col, 1);
    ctx.beginPath(); ctx.arc(678, mapZ(sh.zc), 3, 0, 6.2832); ctx.fill();
  }
}

function drawMarks(state, ctx) {
  var fl = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(state.t * 9));
  ctx.fillStyle = 'rgb(255,80,80)';
  var i;
  for (i = 0; i < state.marks.length; i++) {
    var idx = state.marks[i];
    var sx = SCENE.x + (idx % COLS) * STEP;
    var sy = SCENE.y + Math.floor(idx / COLS) * STEP;
    ctx.globalAlpha = fl;
    ctx.fillRect(sx, sy, STEP, STEP);
  }
  ctx.globalAlpha = 1;
  if (state.errCount > 0) {
    ctx.fillStyle = 'rgba(255,93,93,0.9)';
    ctx.font = '12px monospace';
    ctx.fillText('红闪 ' + state.errCount + ' 处与逐像素精确解不符', SCENE.x + 12, SCENE.y + SCENE.h - 12);
  }
}

function drawButtons(state, ctx) {
  ctx.font = '12px monospace';
  var i;
  for (i = 0; i < state.btns.length; i++) {
    var bt = state.btns[i];
    var active = (bt.id === state.mode);
    ctx.fillStyle = active ? '#1d3252' : '#141f33';
    ctx.fillRect(bt.x, bt.y, bt.w, bt.h);
    ctx.strokeStyle = active ? '#4d8fd6' : '#22314b';
    ctx.lineWidth = 1;
    ctx.strokeRect(bt.x + 0.5, bt.y + 0.5, bt.w - 1, bt.h - 1);
    ctx.fillStyle = active ? '#cfe3ff' : '#8fa7c7';
    ctx.fillText(bt.label, bt.x + 10, bt.y + 18);
  }
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.82)';
  ctx.fillRect(10, 58, 400, 62);
  ctx.font = '12px monospace';
  var names = { 1: '不排序(每 0.5s 重掷顺序)', 2: '按中心深度排序(画家算法)', 3: '细分小片再排序(近似片元)', 4: '加权平均 WBOIT(无排序)' };
  ctx.fillStyle = '#ffd479';
  ctx.fillText('模式 ' + state.mode + ' · ' + names[state.mode], 18, 76);
  var frag = (state.mode === 3) ? state.pieces.length : state.shards.length;
  var sortTxt = (state.mode === 1 || state.mode === 4) ? '不排' : state.sortMs.toFixed(3) + ' ms';
  ctx.fillStyle = '#9db4d0';
  ctx.fillText('片元 ' + frag + ' · 排序 ' + sortTxt + ' · 错误率 ' + state.errRate + '%', 18, 94);
  ctx.fillStyle = '#7d93b3';
  ctx.fillText('键 1/2/3/4 切换 · G 换场景 · 红闪=与逐像素精确排序不符', 18, 112);
}

engine.run({
  setup: function (state) {
    state.mode = 1;
    state.seed = 7;
    state.shuffleNo = 0;
    state.t = 0;
    state.tick = 0;
    state.sortMs = 0;
    state.marks = [];
    state.errCount = 0;
    state.errRate = '0.0';
    state.btns = [
      { id: 1, label: '1 不排序', x: 10, y: 8, w: 100, h: 28 },
      { id: 2, label: '2 中心排序', x: 116, y: 8, w: 104, h: 28 },
      { id: 3, label: '3 细分排序', x: 226, y: 8, w: 104, h: 28 },
      { id: 4, label: '4 加权平均', x: 336, y: 8, w: 104, h: 28 },
      { id: 0, label: '随机场景(G)', x: 470, y: 8, w: 132, h: 28 }
    ];
    // 低清画布只在浏览器里有(document);无 document 的环境自动走兜底路径
    state.lo = null;
    if (typeof document !== 'undefined' && document.createElement) {
      try {
        var cv = document.createElement('canvas');
        cv.width = COLS; cv.height = ROWS;
        var cx2 = cv.getContext('2d');
        if (cx2) state.lo = { cv: cv, cx: cx2, img: cx2.createImageData(COLS, ROWS) };
      } catch (e) { state.lo = null; }
    }
    loadScene(state, state.seed);
  },

  update: function (state, dt, input) {
    state.t += dt;
    state.tick++;
    // 键盘切模式/换场景
    if (input.pressed('Digit1')) setMode(state, 1);
    if (input.pressed('Digit2')) setMode(state, 2);
    if (input.pressed('Digit3')) setMode(state, 3);
    if (input.pressed('Digit4')) setMode(state, 4);
    var gHit = input.pressed('KeyG');
    // 鼠标点按钮
    if (input.mouse.clicked) {
      var bi;
      for (bi = 0; bi < state.btns.length; bi++) {
        var bt = state.btns[bi];
        if (input.mouse.x >= bt.x && input.mouse.x <= bt.x + bt.w &&
            input.mouse.y >= bt.y && input.mouse.y <= bt.y + bt.h) {
          if (bt.id === 0) gHit = true;
          else setMode(state, bt.id);
        }
      }
    }
    if (gHit) {
      state.seed = (state.seed * 48271) % 2147483647;   // 线性同余推进种子
      loadScene(state, state.seed);
    }
    // 模式 1:每 0.5 秒重掷一次绘制顺序(混合不可交换 → 画面闪变)
    if (state.mode === 1 && (state.tick % 30) === 1) {
      state.shuffleNo++;
      state.order = shuffledIdx(state);
      state.cacheDirty = true;
    }
    // 每帧重排(引擎每帧都重排——相机一动,顺序全变),顺手测耗时
    if (state.mode === 2) {
      var t0 = nowMs();
      var idxs = [], k;
      for (k = 0; k < state.shards.length; k++) idxs.push(k);
      idxs.sort(function (a, b) { return state.shards[a].zc - state.shards[b].zc; });
      state.order = idxs;
      state.sortMs = nowMs() - t0;
    } else if (state.mode === 3) {
      state.pieceOrder = sortPieces(state);
    } else {
      state.sortMs = 0;
    }
    if (state.cacheDirty) {
      buildComposite(state);
      compareMarks(state);
      state.cacheDirty = false;
    }
  },

  draw: function (state, ctx) {
    // 底色与场景细网格
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.strokeStyle = '#151f30';
    ctx.lineWidth = 1;
    var gv;
    for (gv = SCENE.x; gv <= SCENE.x + SCENE.w; gv += 55) {
      ctx.beginPath(); ctx.moveTo(gv + 0.5, SCENE.y); ctx.lineTo(gv + 0.5, SCENE.y + SCENE.h); ctx.stroke();
    }
    for (gv = SCENE.y; gv <= SCENE.y + SCENE.h; gv += 49) {
      ctx.beginPath(); ctx.moveTo(SCENE.x, gv + 0.5); ctx.lineTo(SCENE.x + SCENE.w, gv + 0.5); ctx.stroke();
    }
    // 场景:按当前模式画
    if (state.mode === 4) {
      if (state.lo) drawWboitImage(state, ctx);
      else drawShardsByOrder(state, ctx, sceneOrder(state));   // 无 document 时的兜底
    } else if (state.mode === 3) {
      var i;
      for (i = 0; i < state.pieceOrder.length; i++) {
        var pc = state.pieceOrder[i];
        var sh = state.shards[pc.si];
        ctx.fillStyle = rgbCss(sh.col);
        ctx.globalAlpha = sh.a;
        poly4(pc.c, ctx);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      drawShardsByOrder(state, ctx, state.order);
    }
    drawRuler(state, ctx);
    drawMarks(state, ctx);
    drawButtons(state, ctx);
    drawHud(state, ctx);
  }
});`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>看平局怎么判：</b>模式 2 下，斜板 A 与斜板 B 的支点深度恰好同为 5（深度尺上两个圆点重合）——排序键打平，只能按提交顺序硬排，结果交叉带右半边整片判错。真实引擎里，这就是「排序不稳定导致画面闪变」的来源之一。</li>
  <li><b>抓支点的谎言：</b>盯着红闪带的边界：同一条板上，支点深度说的是一个序，逐像素的真实深度说的是相反的序——排序键只有一个点，而深度属于整块几何。</li>
  <li><b>看细分的价：</b>切到模式 3，片元数从 6 跳到两百多，排序耗时跟着涨；若帧率掉了，那也是成本的一部分——引擎不敢无限细分，只能切到「够用」。</li>
  <li><b>辨认两种错误：</b>模式 1 的红区每 0.5 秒乱跳（顺序噪声），模式 4 的红区站桩不动（稳定偏色）。WBOIT 不是「更对」，是「错得稳定」——很多场合这比闪烁值钱。</li>
  <li><b>找无解题：</b>按 G 多滚几个场景，直到三块板两两穿插成环——任何排序都救不了它们，只有「切」（模式 3）和「不排」（模式 4）还有话可说。</li>
  <li><b>留意模式 4 的画法：</b>它不是逐个画玻璃板，而是把逐像素加权平均的结果整体放大——canvas 2D 没有逐像素除法，这正是 OIT 必须动用特殊管线的原因。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 把透明排序放在哪一层',
    files: [
      { path: 'servers/rendering/renderer_canvas_cull.cpp', note: '2D 的答案：不排序，分桶。_render_canvas_item_tree 开出 8193 个 z 桶（CANVAS_ITEM_Z_MIN/MAX 为 ±4096），_attach_canvas_item_for_draw 把每个 canvas item 挂进自己 z_index 对应的桶，最后按桶号串成一条渲染链——桶内顺序就是场景树顺序（画家顺序）；y-sort 节点先被 _collect_ysort_children 拍平成按 Y 排好序的数组再入桶。所以 Godot 2D 用 z_index 与 y-sort 把「深度」问题化简成了「桶 + 行序」，根本没有逐像素深度这回事。搜 _collect_ysort_children、z_list、canvas_item_set_z_index。' },
      { path: 'servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.cpp', note: '3D 的答案：透明排序发生在 render list 这一层。_fill_render_list 给每个实例算 depth = 相机原点到支点的距离 − sorting_offset（支点可选 AABB 中心，即 sorting_use_aabb_center；正交相机另有近平面距离版），顺手把深度量化成 4 位 depth_layer 打进排序信息；再到 _render_scene 看三连：不透明列表 sort_by_key()（按状态键排，为了合批），透明列表 sort_by_reverse_depth_and_priority()（远→近），透明片元单独进 RENDER_LIST_ALPHA、在不透明 pass 之后画。搜 sort_by_reverse_depth_and_priority、sorting_offset、depth_layer。' },
      { path: 'servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.h', note: '排序比较器本体：SortByKey 先比 sort_key2 再比 sort_key1——两个 64 位键把材质/状态打包成整数（同键相邻喂合批）；SortByReverseDepthAndPriority 先比材质 render_priority、再按 depth 从远到近；旁边还有阴影专用的 SortByDepth（近→远）。文件里那句「should eventually be replaced by radix」的注释，就是排序成本仍压在 CPU 上、且工业界一直惦记 radix 基数排序的自白。搜 sort_by_reverse_depth_and_priority、SortByKey。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>透明渲染的秩序一句话：<b>不透明靠 z-buffer 免排序，透明必须排序（或买 OIT），而排序的输入被引擎压缩成「一个支点、一个键」</b>。穿插与成环让排序无解，细分与 OIT 是两条救赎，各自的代价都明码标价。</p>
<ul>
  <li><b>数据怎么流动？</b>每帧剔除产出实例列表 → 3D：_fill_render_list 给每个实例算一个标量 depth（支点到相机的距离 − sorting_offset），分进不透明/透明两条 render list → 不透明按状态键排（为合批），透明按（priority，远→近）排 → 光栅化时透明 pass 在不透明之后执行、读深度不写深度、逐个糊上去。2D 更简单：场景树 → z 桶串成一条链 → 桶内按树序（或 y-sort 拍平后的行序）执行。实验里对应：采样缓存（场景）→ 每帧 order（排序）→ 逐个 blend（绘制）→ 与逐像素精确解比对（质检）。</li>
  <li><b>所有权归谁？</b>depth 与 sort key 是渲染列表的临时产物，生命周期一帧，下帧相机一动全部作废重算；排序支点的两个参数（sorting_offset / sorting_use_aabb_center）归场景层的 VisualInstance3D 所有，渲染服务器只读；最终的「谁盖谁」裁决权在 GPU 的混合单元——而 WBOIT 把裁决权提前收归一遍像素计算。</li>
  <li><b>什么时候发生？</b>排序发生在每帧、每视口、每条 render list 提交 draw call 之前（相机一动全部重排）；2D 的 z 分桶发生在剔除阶段；depth peeling 把成本换成每帧多遍渲染，WBOIT 把排序从每帧 CPU 挪进一遍 GPU 计算——顺序问题没有被消灭，只是被换成了另一种时间支付方式。</li>
</ul>`
  }
  ]
};
