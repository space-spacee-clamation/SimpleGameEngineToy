// A5 · 软体入门:PBD——把『力』换成『位置』
export default {
  id: 'A5',
  title: '软体入门：PBD——把『力』换成『位置』',
  est: '2 小时',
  coreQuestions: [
    '把「力→加速度→位置」换成「直接把位置投影到约束满足」，丢掉了什么，换来了什么？',
    '一根约束一次投影就能满足，为什么要整遍迭代？迭代次数到底在买什么？',
    '刚度调小和迭代调少看起来都是「变软」，它们的本质区别是什么？',
    '撕裂为什么能用「当前长度 ÷ 静息长度」一个比值判定？XPBD 的 compliance 修好了 PBD 的什么病？'
  ],
  sections: [
  {
    type: 'text',
    title: '把『力』换成『位置』：弹簧的死路与 PBD 的活路',
    html: `<p>写布料，第一直觉是力学派：把布拆成质点网格，相邻点之间连弹簧，每帧算弹力、累加成加速度、积分成位置。这条路走得通，但有个出名的坑：<b>想让布硬，就得把弹簧系数调大，而显式积分的稳定步长跟弹簧系数成反比</b>——系数一大，仿真当场爆炸；换隐式积分能救，但几千个质点乘几千根弹簧，每帧解一个大型方程组，实时引擎吃不起。</p>
<p>游戏行业在 2000 年代换了个问法：<b>别算力了，直接改位置</b>。Jakobsen 在 1998 年用这招做了《杀手》(Hitman) 的布料与布娃娃，Müller 在 2007 年把它系统化成 <b>PBD（Position Based Dynamics，位置动力学）</b>：约束只说「这两个点的距离不该超过静息长度」，求解器就把两个点<b>直接投影</b>到满足的位置上——不经过力与加速度。位置修正天生有界，永远不会爆炸；「材料」不再是一堆物理参数，就是「约束被满足得有多彻底」。</p>
<p>配套的积分器是 <b>Verlet 积分</b>：速度不单独存，就等于「当前位置 − 上一帧位置」。它跟 PBD 天作之合——PBD 改完位置，速度隐式自动更新，不需要任何同步代码，还自带一点数值阻尼，正好当布料的空气阻力。本课实验里每个质点只存 x、y 与上一帧 px、py 四个数，外加一个 pin（钉住）标记。</p>
<table>
  <tr><th></th><th>力学派（弹簧 + 积分）</th><th>位置派（PBD）</th></tr>
  <tr><td>管线</td><td>力 → 加速度 → 速度 → 位置</td><td>约束 → 直接投影位置</td></tr>
  <tr><td>稳定性</td><td>弹簧越硬越炸，步长敏感</td><td>位置修正有界，天然稳定</td></tr>
  <tr><td>软硬</td><td>来自弹簧系数（物理量）</td><td>来自迭代 × 刚度（求解器参数）</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '约束求解：投影、迭代与刚度，以及 XPBD 补的洞',
    html: `<p>一根距离约束写成 C(p1,p2) = |p2-p1| - L，L 是静息长度。它的投影修正按逆质量加权、方向沿两点连线、正反对称地分给两端：<b>p1 沿 (p2-p1) 方向挪 (|p2-p1|-L) 的一半再乘 w1/(w1+w2)，p2 反向同样处理</b>——w 是逆质量，被钉住的点 w=0，雷打不动。</p>
<p>麻烦在于：布料是<b>一千多根约束共享同一批质点</b>。把 A-B 拉直，B-C 就被拉歪；把 B-C 扳回来，A-B 又超长。PBD 的答案朴素到惊人：<b>Gauss-Seidel 式逐根轮流投影</b>——从头到尾扫一遍算一次迭代，重复若干次。相邻约束轮流「抢」同一个点，每轮各让一步，迭代次数买的就是<b>约束之间妥协的轮数</b>：迭代低，来不及妥协，布像橡皮筋；迭代高，接近刚性网格。实验里按 Q/E，你亲手买卖这个「妥协轮数」。</p>
<p>刚度 k 表示每次投影只走 k 比例（欠松弛）。坏消息藏在公式里：有效刚度约等于 <b>1 - (1-k)^N</b>（N 是迭代次数）——调刚度和调迭代在互相打架，同一块布换个迭代次数手感全变，「材料属性」与「求解器配置」耦合在了一起。XPBD（Macklin 2016）的修法：把无量纲的刚度换成 <b>compliance α（柔度，单位米/牛，材料手册里真有这个量）</b>，每根约束配一个拉格朗日乘子 λ 逐步累积，修正分母从 w1+w2 变成 w1+w2+α/dt²。从此迭代只管收敛快慢，不管最终软硬——材料的归材料，求解器的归求解器。本课实验故意只做经典 PBD，让这个病当场发作；走读时你会看到 Jolt 后端的注释里躺着这两组公式的换算。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'cloth',
    title: '实验：可撕的布料——Verlet 积分 + 距离约束投影',
    height: 620,
    code: `// 可撕的布料:Verlet 积分 + 距离约束投影(PBD)
// 鼠标按下:抓住最近质点拖拽(抓住顶部黄钉=拔钉)   按住 C:剪刀,划过布面剪断约束
// Q/E 调约束迭代次数   Z/X 调刚度   A/D 调撕裂阈值   W 开关风   R 重置布料

engine.run({
  setup: function (state) {
    state.time = 0; state.acc = 0;
    state.iters = 5; state.stiff = 1.0; state.tear = 3.0;
    state.wind = false; state.cut = false;
    state.mx = 0; state.my = 0; state.grab = null;
    buildCloth(state);
  },

  update: function (state, dt, input) {
    state.time += dt;
    // 三参数热调:迭代(妥协轮数)/刚度(每轮走多少)/撕裂阈值(长度比上限)
    if (input.pressed('KeyQ')) state.iters = Math.max(1, state.iters - 1);
    if (input.pressed('KeyE')) state.iters = Math.min(15, state.iters + 1);
    if (input.pressed('KeyZ')) state.stiff = Math.max(0.05, state.stiff - 0.05);
    if (input.pressed('KeyX')) state.stiff = Math.min(1, state.stiff + 0.05);
    if (input.pressed('KeyA')) state.tear = Math.max(1.6, state.tear - 0.2);
    if (input.pressed('KeyD')) state.tear = Math.min(8, state.tear + 0.2);
    if (input.pressed('KeyW')) state.wind = !state.wind;
    if (input.pressed('KeyR')) buildCloth(state);
    state.cut = input.down('KeyC');

    // 鼠标:按下抓取(顺手拔钉);按住 C 则光标划过即剪
    var m = input.mouse;
    state.mx = m.x; state.my = m.y;
    if (m.down) {
      if (!state.grab) {
        var g = nearestPt(state, m.x, m.y, 16);
        if (g) {
          state.grab = g;
          if (g.pin) { g.pin = false; state.pinCount = state.pinCount - 1; }
        }
      }
    } else {
      state.grab = null;
    }
    if (state.cut) cutNear(state, m.x, m.y, 16);

    // 固定步长推进:渲染帧之间按累加器补步,最多 3 步防死亡螺旋
    state.acc += (dt < 0.1 ? dt : 0.1);
    var n = 0;
    while (state.acc >= FIXED && n < 3) {
      physStep(state, FIXED);
      state.acc -= FIXED;
      n = n + 1;
    }
    if (n === 3) state.acc = 0;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawCloth(state, ctx);
    drawPins(state, ctx);
    drawCursor(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 常量与构建 ----------
var REST = 22;          // 网格间距(像素),也是每根约束的静息长度
var COLS = 27;          // 布料列数
var ROWS = 17;          // 布料行数
var USE_SHEAR = true;   // 剪切(对角)约束开关:关掉试试布会怎么歪
var GRAV = 700;         // 重力加速度(px/s^2)
var DAMP = 0.99;        // Verlet 每步速度阻尼(兼当空气阻力)
var FIXED = 1 / 60;     // 固定物理步长(秒)

function buildCloth(state) {
  var x0 = (engine.W - (COLS - 1) * REST) / 2;
  var y0 = 26;
  var r, c, i;
  state.pts = [];
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      var x = x0 + c * REST, y = y0 + r * REST;
      state.pts.push({ x: x, y: y, px: x, py: y, pin: false });
    }
  }
  // 顶部每隔 4 列钉一枚 pin(两端角上必钉),把布挂起来
  state.pinCount = 0;
  for (c = 0; c < COLS; c += 4) { state.pts[c].pin = true; state.pinCount++; }
  if (!state.pts[COLS - 1].pin) { state.pts[COLS - 1].pin = true; state.pinCount++; }
  // 约束两层:结构(横/竖)保形状,剪切(对角)抗扭曲
  state.cons = [];
  function addCon(a, b, rest) {
    state.cons.push({ pa: state.pts[a], pb: state.pts[b], rest: rest, dead: false });
  }
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      i = r * COLS + c;
      if (c + 1 < COLS) addCon(i, i + 1, REST);
      if (r + 1 < ROWS) addCon(i, i + COLS, REST);
      if (USE_SHEAR && c + 1 < COLS && r + 1 < ROWS) {
        addCon(i, i + COLS + 1, REST * Math.SQRT2);
        addCon(i + 1, i + COLS, REST * Math.SQRT2);
      }
    }
  }
  state.totalCons = state.cons.length;
  state.broken = 0;
  state.grab = null;
  state.acc = 0;
}

// ---------- 物理:一步 = 积分 + 撕裂 + 迭代投影 + 边界 ----------
function physStep(state, h) {
  var pts = state.pts, i, p;
  var hh = h * h;
  var windX = 0;
  if (state.wind) windX = Math.sin(state.time * 1.7) * 230 + Math.sin(state.time * 0.53) * 130;
  // Verlet 积分:速度=新旧位置差,重力/风直接加在位置上
  for (i = 0; i < pts.length; i++) {
    p = pts[i];
    if (p.pin || p === state.grab) continue;
    var vx = (p.x - p.px) * DAMP;
    var vy = (p.y - p.py) * DAMP;
    p.px = p.x; p.py = p.y;
    p.x += vx + windX * hh;
    p.y += vy + GRAV * hh;
  }
  // 抓取:把质点直接搬到鼠标处(px/py 留旧值,松手自带惯性)
  if (state.grab) {
    state.grab.px = state.grab.x; state.grab.py = state.grab.y;
    state.grab.x = state.mx; state.grab.y = state.my;
  }
  // 撕裂检查放在求解之前:此刻伸长最大,超阈值的当场剪断
  tearCheck(state);
  solveConstraints(state);
  clampBounds(state);
}

function tearCheck(state) {
  for (var i = 0; i < state.cons.length; i++) {
    var c = state.cons[i];
    if (c.dead) continue;
    var dx = c.pb.x - c.pa.x, dy = c.pb.y - c.pa.y;
    var t = c.rest * state.tear;
    if (dx * dx + dy * dy > t * t) { c.dead = true; state.broken++; }
  }
}

function solveConstraints(state) {
  var it, i;
  // Gauss-Seidel:逐根投影,整遍算一次迭代;迭代次数买的是约束间的妥协轮数
  for (it = 0; it < state.iters; it++) {
    for (i = 0; i < state.cons.length; i++) {
      var c = state.cons[i];
      if (c.dead) continue;
      var p1 = c.pa, p2 = c.pb;
      // 逆质量权重:钉住/被抓住的点 w=0,纹丝不动
      var w1 = (p1.pin || p1 === state.grab) ? 0 : 1;
      var w2 = (p2.pin || p2 === state.grab) ? 0 : 1;
      var ws = w1 + w2;
      if (ws === 0) continue;
      var dx = p2.x - p1.x, dy = p2.y - p1.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.0001) continue;
      var corr = (d - c.rest) / d * state.stiff;
      p1.x += dx * corr * (w1 / ws);
      p1.y += dy * corr * (w1 / ws);
      p2.x -= dx * corr * (w2 / ws);
      p2.y -= dy * corr * (w2 / ws);
    }
  }
}

function clampBounds(state) {
  // 地板和墙也是「约束」:直接投影位置,不是弹力
  var floor = engine.H - 6;
  for (var i = 0; i < state.pts.length; i++) {
    var p = state.pts[i];
    if (p.y > floor) {
      var vy = p.y - p.py, vx = p.x - p.px;
      p.y = floor;
      p.py = p.y + vy * 0.3;   // 反弹 30%
      p.px = p.x - vx * 0.55;  // 地面摩擦:切向速度打折
    }
    if (p.x < 4) { p.x = 4; p.px = p.x; }
    else if (p.x > engine.W - 4) { p.x = engine.W - 4; p.px = p.x; }
  }
}

// ---------- 交互工具 ----------
function nearestPt(state, mx, my, rad) {
  var best = null, bd = rad * rad;
  for (var i = 0; i < state.pts.length; i++) {
    var p = state.pts[i];
    var dx = p.x - mx, dy = p.y - my;
    var d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best;
}

function cutNear(state, mx, my, rad) {
  var r2 = rad * rad;
  for (var i = 0; i < state.cons.length; i++) {
    var c = state.cons[i];
    if (c.dead) continue;
    // 光标到线段的最近距离:向线段投影并夹紧
    var ax = c.pa.x, ay = c.pa.y;
    var ex = c.pb.x - ax, ey = c.pb.y - ay;
    var len2 = ex * ex + ey * ey;
    var t = len2 > 0 ? ((mx - ax) * ex + (my - ay) * ey) / len2 : 0;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var dx = ax + ex * t - mx, dy = ay + ey * t - my;
    if (dx * dx + dy * dy < r2) { c.dead = true; state.broken++; }
  }
}

// ---------- 绘制 ----------
function drawCloth(state, ctx) {
  // 按拉伸比分三桶批量描线:青=静息附近,黄=拉伸,红=临近撕裂
  strokeBucket(ctx, state, 0, 1.15, '#3f5f86', 1);
  strokeBucket(ctx, state, 1.15, state.tear * 0.8, '#d9b04c', 1);
  strokeBucket(ctx, state, state.tear * 0.8, 1e9, '#f8656c', 1.6);
}

function strokeBucket(ctx, state, lo, hi, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (var i = 0; i < state.cons.length; i++) {
    var c = state.cons[i];
    if (c.dead) continue;
    var dx = c.pb.x - c.pa.x, dy = c.pb.y - c.pa.y;
    var ratio = Math.sqrt(dx * dx + dy * dy) / c.rest;
    if (ratio > lo && ratio <= hi) {
      ctx.moveTo(c.pa.x, c.pa.y);
      ctx.lineTo(c.pb.x, c.pb.y);
    }
  }
  ctx.stroke();
}

function drawPins(state, ctx) {
  ctx.fillStyle = '#ffd479';
  for (var i = 0; i < state.pts.length; i++) {
    var p = state.pts[i];
    if (p.pin) ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
}

function drawCursor(state, ctx) {
  if (state.grab) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(state.grab.x, state.grab.y, 7, 0, 6.2832); ctx.stroke();
  }
  if (state.cut) {
    ctx.strokeStyle = '#f8656c'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(state.mx, state.my, 16, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawHud(state, ctx) {
  var alive = state.totalCons - state.broken;
  ctx.fillStyle = 'rgba(11,15,23,0.85)'; ctx.fillRect(8, 8, 318, 92);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('鼠标按下:抓取拖拽(抓住黄钉=拔钉)', 16, 26);
  ctx.fillText('按住 C:剪刀划过剪断   W:风   R:重置', 16, 44);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('Q/E 迭代=' + state.iters + '   Z/X 刚度=' + state.stiff.toFixed(2), 16, 62);
  ctx.fillText('A/D 撕裂阈值=' + state.tear.toFixed(1) + 'x', 16, 80);
  ctx.fillStyle = 'rgba(11,15,23,0.85)'; ctx.fillRect(engine.W - 216, 8, 208, 74);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('约束 ' + alive + '/' + state.totalCons + '   断裂 ' + state.broken, engine.W - 208, 26);
  ctx.fillText('迭代 ' + state.iters + ' 次/步·投影 ' + (state.iters * alive) + ' 次', engine.W - 208, 44);
  ctx.fillText('钉住 ' + state.pinCount + '   风:' + (state.wind ? '开' : '关'), engine.W - 208, 62);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>把迭代压到 1：</b>连按 4 次 Q，布料立刻下垂拉长、晃动发绵；再按 E 拉回 10~15，网格变硬挺。右上角的「投影次数/步」同步缩水——你亲眼看到了迭代次数买到的妥协轮数。</li>
  <li><b>把刚度拧软：</b>按 Z 把刚度降到 0.2 左右，同样的迭代次数，布明显变软。这时再按 Q/E 你会发现：软硬同时被两个旋钮管着，有效刚度约等于 1-(1-k)^迭代——材料参数和求解器配置耦合，这正是 PBD 的病。</li>
  <li><b>完整撕下一角：</b>抓住左下角慢慢拖，布顺从地跟；猛地一拽，约束成片超过撕裂阈值断裂（红色闪现后消失），整块下来。抓住顶部的黄色钉子按下，等于把钉拔掉。</li>
  <li><b>剪刀开豁口：</b>按住 C 让光标划过布面，附近约束被剪断。剪一道斜豁口再看：豁口两边的布只靠剩余约束维系，垂坠感立刻不同。</li>
  <li><b>开风看材质：</b>按 W 开风。低迭代加低刚度时布像绸子，高迭代时布像旗子——同一场风，材料不同。</li>
  <li><b>拆掉剪切约束：</b>把代码里的 USE_SHEAR 改成 false 再运行，约束从 1706 根掉到 874 根，布斜向一搓就歪成菱形网格；开回来，对角线把形状锁住。经典布料模型分三层：结构（横竖）、剪切（对角）、弯曲（隔点），本课实现了前两层。</li>
  <li><b>极限实验：</b>迭代压到 1、阈值压到 1.6，抓住布角快速抖动——观察断裂的链式反应：一根断，邻居瞬间超载跟着断。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 仓库里的软体实现——PBD 与 XPBD 各一处',
    files: [
      { path: 'modules/godot_physics_3d/godot_soft_body_3d.cpp', note: '规划表说「Godot 锚点弱」——核验后要反过来讲：内置物理后端的软体就是一个货真价实的 PBD 求解器（Bullet btSoftBody 血统）。顺着 predict_motion（重力只贡献这一步的位移，node.q 存旧位置）→ solve_constraints（外层 for (isolve < iteration_count) 就是本课的迭代次数）→ solve_links（对每根 Link 直接改 node.x，del*k*im 就是位置投影）→ 末尾用 (node.x - node.q) 反推速度——「力→位置」管线加「位置差当速度」，正是本课心智模型的工业版。搜 predict_motion / solve_constraints / solve_links / set_iteration_count。' },
      { path: 'modules/godot_physics_3d/godot_soft_body_3d.h', note: '软体的数据布局：struct Node 只有 x（位置）/ q（旧位置）/ v（速度）/ im（逆质量），与实验里质点的 x/y/px/py/pin 一一对应；struct Link 的 c0/c1/c2 是预计算的求解常数（含静息长度平方）；文件底部默认值 iteration_count = 5、linear_stiffness = 0.5——Godot 出厂布料的「迭代 × 刚度」就调在这组参数上，可当实验调参的参照系。' },
      { path: 'modules/jolt_physics/objects/jolt_soft_body_3d.cpp', note: 'XPBD 一瞥的一手材料：Jolt 后端不用经典 PBD 而用 XPBD。约 190~220 行的注释块把两组公式并排写清——经典 PBD 的修正分母是 w1+w2，XPBD 是 w1+w2+compliance/dt^2，还推导出 compliance = dt^2 * (1/k - 1) * (w1+w2)，把 Godot 的刚度系数翻译成柔度。搜 set_stiffness_coefficient 与注释关键词 XPBD / compliance。PBD 本体是外部经典算法（Jakobsen 1998、Müller 2007），这段注释正是它进入引擎源码的活标本。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>PBD 把「模拟材料」从力学搬进了几何学：Verlet 负责记住上一帧的位置，约束负责宣布「哪些相对关系不许变」，求解器做的唯一一件事是把位置投影到约束的满足域里。弹簧、力、加速度在这条管线里全部消失——布料的软硬不再来自材料参数，而来自<b>约束被满足得有多彻底</b>（迭代 × 刚度）；撕裂也不再来自应力计算，而来自一个朴素的比值：当前长度 ÷ 静息长度。</p>
<ul>
  <li><b>数据怎么流动？</b>每固定步：外部输入（重力/风/鼠标）只给出「这一步想怎么动」→ Verlet 用新旧位置差推出隐式速度并积分 → 撕裂检查用当前长度筛掉超阈值的约束 → 剩余约束按 Gauss-Seidel 顺序迭代投影位置 → 位置直接送去渲染。全程没有力与加速度，数据流是「位置进、位置出」。</li>
  <li><b>所有权归谁？</b>质点数组与约束数组由模拟器统一持有；「抓取」是把某个质点这一步的写权临时让给鼠标（等效逆质量 0）；pin 是永久让渡写权；约束断裂 = 从求解集合除名但对象保留（只为统计）。对照引擎：Godot 内置软体的节点数组归物理后端持有，场景层每帧经 soft_body_update_rendering_server 拉走顶点去渲染——模拟与渲染共享数据，但不共享所有权。</li>
  <li><b>什么时候发生？</b>固定步长 1/60 秒推进，渲染帧之间用累加器补步（上限 3 步防死亡螺旋）；约束迭代发生在物理步内部，与渲染帧率完全解耦——所以「橡皮感」不会因为屏幕 144Hz 而消失，它生长在物理步里。这也回扣了 L1.1：迭代式求解器的收敛度依赖步长恒定，引擎执着于固定步长正是为此。</li>
</ul>`
  }
  ]
};
