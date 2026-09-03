// B5 · 可破坏场景 II：预分片与运行时切割
export default {
  id: 'B5',
  title: '可破坏场景 II：预分片与运行时切割',
  est: '2 小时',
  coreQuestions: [
    '为什么工业界的「破坏」几乎都是离线预切好，运行时只做激活，而不是现场任意切割？',
    '碎片脱落这件事，在物理引擎内部到底是一句「换 mode」还是一场碰撞重算？所有权发生了什么变化？',
    '破坏层级（大块再碎成小块）为什么不能无限递归，上限卡在物理上的哪一环？'
  ],
  sections: [
    {
      type: 'text',
      title: '两种「把墙打碎」的路线',
      html: `<p>B4 我们用像素/体素 mask 做了 2D 可破坏地形：炸出一个坑，孤岛连通域就掉下来。那条路线贵在「按需精细」，每次炸都重新算连通域。但真正的游戏里，一面墙、一个柱子、一扇门的破坏往往<b>只有几种固定形态</b>——玩家撞碎它之前，你早就知道它会碎成什么样。</p>
<p>于是工业界的主流是<b>预分片（pre-fracture）</b>：在内容制作期（离线，美术用 Houdini / Blender 的 Cell Fracture 插件）就把整块墙切成 N 块碎片，保存成「一大块 + 一包碎片」的资源。运行时引擎<b>不切割任何东西</b>，它只做一件轻量的事——<b>激活</b>：碰撞点附近、冲击量超过阈值的碎片，从 static 切到 rigid，被撞飞。整堵墙在被打到之前，物理眼里就是一个普通的静态刚体，几乎免费。</p>
<p>另一条路线是<b>运行时任意切割（runtime fracture）</b>：子弹打中任意位置，就在那个位置现场做布尔运算（差集），把碎块切成两块，再各自做<b>凸分解</b>、生成新碰撞体。这一路为什么昂贵而罕用？看下面这张表。</p>
<table>
  <tr><th></th><th>预分片（pre-fracture）</th><th>运行时切割（runtime fracture）</th></tr>
  <tr><td>切割时机</td><td>离线、美术手里</td><td>游戏中、命中瞬间</td></tr>
  <tr><td>运行时成本</td><td>只切换 mode，几乎免费</td><td>布尔运算 + 凸分解 + 重建碰撞体</td></tr>
  <tr><td>破坏形态</td><td>固定几种，可控、可预览</td><td>任意、更震撼，但难调</td></tr>
  <tr><td>碰撞体来源</td><td>切完顺手生成的凸包</td><td>现场实时算，卡顿风险高</td></tr>
  <tr><td>典型玩家</td><td>战地、GTA 的墙体、栅栏</td><td>少数主打「任意切割」的玩法</td></tr>
</table>
<p>这背后是一道物理题的硬约束：<b>碰撞体几乎必须是凸的</b>（凹体要拆成多个凸体才能稳定求解）。一个任意的切面会在切割处产生凹多边形，必须<b>凸分解</b>再生成新碰撞形状。预分片把这些一次性算好存进资源；运行时切割则要在 16ms 的帧预算里重跑一遍——这就是它罕用的根本原因。预分片的碎片切开面同理也是凸包，切面的「锯齿感」正是凸约束的痕迹。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'prefracture',
      title: '实验：预分片墙，一球撞碎',
      height: 620,
      code: `// 预分片墙：一堵墙已离线切成 N×M 碎片，运行时只做「激活」
// 点击画布发射弹球 → 撞击点周围、冲击量超阈值的碎片「脱落」变成刚体（继承初速度）
//   模式键 B：整块墙（不碎） / 预分片墙 对比    ←→ 调碎片密度(3~12)
//   1/2：增/减脱落冲击阈值    3/4：增/减二次破碎上限（碎片再碎一次的深度）
//   5 切换「伪 Voronoi 色块」着色（视觉上像不规则碎片，物理仍是网格）
// 右上角实时统计本帧唤醒的刚体数 → 那就是「激活事件」的价格
engine.run({
  setup: function (state) {
    state.seed = 20260903;
    state.mode = 'pre';            // 'whole' 整块 | 'pre' 预分片
    state.density = 8;             // 每边碎片数（3~12）
    state.thresh = 180;            // 脱落冲击阈值（碰撞法向冲量）
    state.maxDepth = 1;            // 二次破碎上限（0=碎片不再碎，+ 才再碎）
    state.showVoronoi = false;     // 伪 Voronoi 着色
    state.balls = [];              // 弹球（始终刚性）
    state.frags = [];              // 碎片：静态(未脱落) 与 刚性(已脱落) 混在一张表
    state.wall = { x: 180, y: 120, w: 380, h: 170 };   // 墙的外接矩形
    state.flash = [];              // 脱落瞬间的高亮
    state.statWake = 0;            // 本帧唤醒数（被激活的碎片）
    state.statActive = 0;          // 当前活动(刚性)体总数
    state.statStatic = 0;
    buildWall(state);
  },

  update: function (state, dt, input) {
    var i, f;
    state.statWake = 0;

    // ---- 模式切换 ----
    if (input.pressed('KeyB')) { state.mode = (state.mode === 'pre') ? 'whole' : 'pre'; buildWall(state); }
    if (input.pressed('Escape')) state.showVoronoi = !state.showVoronoi;

    // ---- 滑块：←→ 碎片密度，1/2 阈值，3/4 二次破碎上限 ----
    if (input.down('ArrowLeft') || input.pressed('ArrowLeft')) { state.density = Math.max(3, state.density - 1); buildWall(state); }
    if (input.down('ArrowRight') || input.pressed('ArrowRight')) { state.density = Math.min(12, state.density + 1); buildWall(state); }
    if (input.pressed('Digit1')) { state.thresh = Math.max(40, state.thresh - 20); }
    if (input.pressed('Digit2')) { state.thresh = Math.min(400, state.thresh + 20); }
    if (input.pressed('Digit3')) { state.maxDepth = Math.max(0, state.maxDepth - 1); }
    if (input.pressed('Digit4')) { state.maxDepth = Math.min(3, state.maxDepth + 1); }

    // ---- 点击发射弹球（向左飞去撞击墙） ----
    if (input.mouse.clicked) {
      var b = { x: input.mouse.x, y: input.mouse.y, px: input.mouse.x, py: input.mouse.y, vx: 620, vy: 0, r: 7, hue: 205, depth: 1 };
      if (b.y > 30 && b.y < 430 && b.x < 150) state.balls.push(b);   // 限定在左半区投放，确保朝墙飞
    }

    // ---- 积分：弹球与已脱落的碎片按刚体运动 ----
    var GRAV = 900;
    for (i = 0; i < state.balls.length; i++) {
      var bl = state.balls[i];
      bl.px = bl.x; bl.py = bl.y;
      bl.vy += GRAV * dt; bl.x += bl.vx * dt; bl.y += bl.vy * dt;
      // 四面墙反弹，模拟沙盒边界
      if (bl.x < bl.r) { bl.x = bl.r; bl.vx = Math.abs(bl.vx) * 0.7; }
      if (bl.x > 700 - bl.r) { bl.x = 700 - bl.r; bl.vx = -Math.abs(bl.vx) * 0.7; }
      if (bl.y < 20 + bl.r) { bl.y = 20 + bl.r; bl.vy = Math.abs(bl.vy) * 0.7; }
      if (bl.y > 430 - bl.r) { bl.y = 430 - bl.r; bl.vy = -Math.abs(bl.vy) * 0.7; bl.vx *= 0.96; }
    }
    for (i = 0; i < state.frags.length; i++) {
      f = state.frags[i];
      if (!f.active) continue;
      f.vy += GRAV * dt; f.vx *= (1 - 0.3 * dt);
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y > 430 - f.half) { f.y = 430 - f.half; f.vy = -Math.abs(f.vy) * 0.4; f.vx *= 0.9; }
      if (f.x < f.half) { f.x = f.half; f.vx = Math.abs(f.vx) * 0.5; }
      if (f.x > 700 - f.half) { f.x = 700 - f.half; f.vx = -Math.abs(f.vx) * 0.5; }
    }

    // ---- 碰撞检测：球 vs 碎片（也处理球 vs 整块墙） ----
    if (state.mode === 'whole') collideWholeWall(state, dt);
    else for (i = 0; i < state.balls.length; i++) collideFragments(state, state.balls[i]);

    // ---- 碎片 vs 碎片（已脱落的两块互撞一下，让破坏的碎块堆得更自然） ----
    for (i = 0; i < state.frags.length; i++) {
      var a = state.frags[i]; if (!a.active) continue;
      for (var j = i + 1; j < state.frags.length; j++) {
        var c = state.frags[j]; if (!c.active) continue;
        var ddx = c.x - a.x, ddy = c.y - a.y, rr = a.half + c.half;
        if (ddx * ddx + ddy * ddy >= rr * rr) continue;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 0.001;
        var nx = ddx / dd, ny = ddy / dd, push = (rr - dd) * 0.5;
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        var rvn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rvn < 0) { var imp = -rvn * 0.5; a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny; }
      }
    }

    // ---- 统计与高亮衰减 ----
    state.statActive = 0; state.statStatic = 0;
    for (i = 0; i < state.frags.length; i++) { if (state.frags[i].active) state.statActive++; else state.statStatic++; }
    for (i = 0; i < state.flash.length; i++) { state.flash[i].t -= dt; if (state.flash[i].t < 0) state.flash.splice(i--, 1); }
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, 700, 460);
    // 地面
    ctx.fillStyle = '#131c2b'; ctx.fillRect(0, 430, 700, 30);
    ctx.strokeStyle = '#2f4468'; ctx.beginPath(); ctx.moveTo(0, 430); ctx.lineTo(700, 430); ctx.stroke();

    // 墙 / 碎片
    if (state.mode === 'whole') drawWhole(state, ctx);
    else for (i = 0; i < state.frags.length; i++) drawFrag(state.frags[i], state, ctx);

    // 高亮（脱落瞬间）
    for (i = 0; i < state.flash.length; i++) {
      var fl = state.flash[i];
      ctx.fillStyle = 'rgba(251,191,36,' + (fl.t * 0.6).toFixed(2) + ')';
      ctx.fillRect(fl.x - fl.half, fl.y - fl.half, fl.half * 2, fl.half * 2);
    }

    // 弹球
    for (i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(' + b.hue + ',72%,56%)'; ctx.fill();
      ctx.strokeStyle = '#0b0f17'; ctx.stroke();
    }

    // ---- 右侧统计面板 ----
    var x = 430, y = 20;
    ctx.fillStyle = '#0d1420'; ctx.fillRect(x - 6, 8, 276, 200);
    ctx.fillStyle = '#9db4d0'; ctx.font = '12px monospace';
    ctx.fillText('— 破坏预算 —', x, y); y += 22;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('本帧唤醒(激活)碎片 : ' + state.statWake, x, y); y += 18;
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('活动(刚性)体总数   : ' + state.statActive, x, y); y += 18;
    ctx.fillText('静态(未脱落)碎片   : ' + state.statStatic, x, y); y += 18;
    ctx.fillText('模式                 : ' + (state.mode === 'pre' ? '预分片墙' : '整块墙'), x, y); y += 18;
    ctx.fillText('碎片密度(每边)      : ' + state.density, x, y); y += 18;
    ctx.fillText('脱落冲击阈值        : ' + state.thresh, x, y); y += 18;
    ctx.fillText('二次破碎上限        : ' + state.maxDepth, x, y); y += 18;
    ctx.fillText('着色                 : ' + (state.showVoronoi ? '伪Voronoi' : '网格'), x, y); y += 24;

    // ---- 底部提示 ----
    ctx.fillStyle = '#5b7397'; ctx.font = '11px monospace';
    ctx.fillText('点击左半区发射弹球 · B 切模式 · ←→ 密度 · 1/2 阈值 · 3/4 二次破碎 · Esc 着色', 10, 452);
    // 左上角标题条
    ctx.fillStyle = 'rgba(245,158,11,0.12)'; ctx.fillRect(0, 0, 700, 20);
    ctx.fillStyle = '#f59e0b'; ctx.font = '11px monospace';
    ctx.fillText('预分片：墙体离线切好，运行时只做「激活」这一件便宜事', 10, 14);
  }
});

// ================= 确定性随机（自带种子） =================
function lcg(s) { return (s * 1103515245 + 12345) % 2147483648; }
function rand(state) { state.seed = lcg(state.seed); return (state.seed >>> 8) / 8388608; }

// ================= 建墙：把整块墙按 density×density 切成碎片（离线预切的运行时等价） =================
function buildWall(state) {
  state.frags = []; state.flash = [];
  var w = state.wall, n = state.density;
  var fw = w.w / n, fh = w.h / n;
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      // 每个碎片的颜色偏移用伪随机抖动：视觉上像 Voronoi 分割的不规则块
      var jitter = (rand(state) - 0.5) * 0.5;
      state.frags.push({
        cx: c, cy: r,
        x: w.x + (c + 0.5) * fw + (rand(state) - 0.5) * fw * 0.1,
        y: w.y + (r + 0.5) * fh + (rand(state) - 0.5) * fh * 0.1,
        half: Math.min(fw, fh) * 0.42,
        active: false,           // 尚未脱落 = 静态，物理眼里它还在整块墙里
        vx: 0, vy: 0,
        hue: 38 + jitter * 10,   // 暖色系，按列轻微渐变
        depth: 0,                // 破坏层级：0=大块，1=再碎一次，以此类推
        parent: null
      });
    }
  }
}

// ================= 整块墙模式：墙壁是一整个静态刚体，球打上去只弹回 =================
function collideWholeWall(state, dt) {
  for (var i = 0; i < state.balls.length; i++) {
    var b = state.balls[i];
    var closestX = Math.max(state.wall.x, Math.min(b.x, state.wall.x + state.wall.w));
    var closestY = Math.max(state.wall.y, Math.min(b.y, state.wall.y + state.wall.h));
    var dx = b.x - closestX, dy = b.y - closestY;
    var d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) continue;
    var d = Math.sqrt(d2) || 0.001;
    var nx = dx / d, ny = dy / d;
    b.x = closestX + nx * (b.r + 0.5);
    b.y = closestY + ny * (b.r + 0.5);
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
  }
}

// ================= 预分片：球撞击 → 半径内碎片脱落（激活） =================
function collideFragments(state, ball) {
  var activations = 0;
  for (var i = 0; i < state.frags.length; i++) {
    var f = state.frags[i];
    var dx = ball.x - f.x, dy = ball.y - f.y, rr = ball.r + f.half;
    if (dx * dx + dy * dy > rr * rr) continue;
    // 命中瞬间的冲量：用球速与法向投影估计碰撞强度（法线从球指向碎片）
    var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var nx = dx / d, ny = dy / d;
    var impact = Math.abs(ball.vx * nx + ball.vy * ny) * 2.2;  // 冲击量估计

    if (!f.active) {
      // —— 激活：静态 → 刚性。这是本课的核心事件，也是唯一「贵」的地方 ——
      if (impact > state.thresh) {
        f.active = true;
        // 继承初速度：球把动量传给碎片（沿法线方向给一个正比于冲击量的初速）
        f.vx = ball.vx * 0.55 + nx * impact * 0.15;
        f.vy = ball.vy * 0.55 + ny * impact * 0.15;
        state.flash.push({ x: f.x, y: f.y, half: f.half, t: 0.5 });
        state.statWake++;   // 本帧唤醒数 +1
        activations++;
      }
      // 未达阈值：碎片纹丝不动，球被弹回（静态体一点都不消耗）
      var vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) { ball.vx -= 1.6 * vn * nx; ball.vy -= 1.6 * vn * ny; }
    } else {
      // 已脱落的碎片是刚性体：正常的冲量响应 + 位置修正（L5.2 的三段式）
      var pen = rr - d;
      if (pen > 0) {
        ball.x += nx * pen * 0.5; ball.y += ny * pen * 0.5;
        f.x -= nx * pen * 0.5; f.y -= ny * pen * 0.5;
        maybeSecondaryFracture(state, f, ball, impact);
        var rvn = (f.vx - ball.vx) * nx + (f.vy - ball.vy) * ny;
        if (rvn < 0) {
          var j = -rvn * 0.5;
          ball.vx -= j * nx; ball.vy -= j * ny;
          f.vx += j * nx; f.vy += j * ny;
        }
      }
    }
  }
}

// ================= 二次破碎：脱离的大块被更强的后续撞击打中，再碎成小半（破坏层级） =================
function maybeSecondaryFracture(state, f, ball, impact) {
  if (state.maxDepth <= 0) return;               // 上限为 0：禁止二次破碎
  if (f.depth >= state.maxDepth) return;         // 已经碎到上限
  if (impact < state.thresh * 1.15) return;      // 需要更强的冲击才二次破裂
  // 把一块拆成两小块（沿撞击法线方向一分为二），每块继承快于原块的速度
  f.depth++;
  var sh = f.half * 0.72;
  var leftSide = ball.x > f.x;
  var child = {
    cx: f.cx, cy: f.cy + 0.5,
    x: f.x + (leftSide ? -sh : sh), y: f.y,
    half: sh, active: true,
    vx: f.vx + (leftSide ? -120 : 120), vy: f.vy - 60,
    hue: f.hue + 6, depth: f.depth, parent: f
  };
  f.half = sh;
  f.x += (leftSide ? sh : -sh);
  f.vx += (leftSide ? 120 : -120); f.vy += 60;
  state.frags.push(child);
  state.flash.push({ x: child.x, y: child.y, half: child.half, t: 0.4 });
  state.statWake++;   // 二次破碎也是一次「场景新生体」
}

// ================= 绘制 =================
function drawFrag(f, state, ctx) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.fillStyle = f.active ? 'hsl(' + f.hue + ',62%,54%)' : 'hsl(' + f.hue + ',28%,40%)';
  if (state.showVoronoi) {
    // 伪 Voronoi 多边形：用种子让每个碎片长出不同边数的多边形，强化「不规则预切」的视觉
    drawNGon(ctx, f);
  } else {
    ctx.fillRect(-f.half, -f.half, f.half * 2, f.half * 2);
  }
  ctx.strokeStyle = '#0b0f17';
  ctx.lineWidth = 1;
  ctx.strokeRect(-f.half, -f.half, f.half * 2, f.half * 2);
  ctx.restore();
}

// 伪 Voronoi 着色：按格子中心生成一个多边形的视觉轮廓（物理仍是 bounding 圆近似）
function drawNGon(ctx, f) {
  var sides = 4 + Math.floor(((f.cx * 7 + f.cy * 13 + f.depth) % 3));   // 4~6 边
  var r = f.half * 1.18;
  ctx.beginPath();
  for (var i = 0; i < sides; i++) {
    var ang = (i / sides) * Math.PI * 2;
    var rr = r * (0.85 + 0.15 * (((f.cx * 3 + f.cy * 5 + i) % 3) / 2));
    var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0b0f17'; ctx.lineWidth = 1; ctx.stroke();
}

function drawWhole(state, ctx) {
  var w = state.wall;
  ctx.fillStyle = 'hsl(38,28%,42%)';
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.strokeStyle = '#0b0f17'; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = '#5b7397'; ctx.font = '11px monospace';
  ctx.fillText('整块墙：一个静态刚体，撞上只弹回，不产生任何碎片', w.x + 8, w.y + w.h / 2 - 8);
}
`
    },
    {
      type: 'text',
      title: '现场看懂「激活」到底贵在哪',
      html: `<p>把密度拉到 12，点一球撞进墙中央，盯着右上角那个「<b>本帧唤醒(激活)碎片</b>」的数字——它会瞬间跳出一个两位数。这个数字就是本课全部的秘密：<b>破坏的代价不在「切」，而在「唤醒」</b>。</p>
<p>整块墙模式（按 B）里，那堵墙是<b>一个</b>静态刚体，球撞上去只做一次反弹（<code>collideWholeWall</code> 里连碎片数组都没碰）。而预分片模式里，同一堵墙是 12×12 = 144 块小碎片，其中<b>绝大多数一直睡着</b>（active=false，物理在它身上花 0 计算）。只有当某块的冲击量越过阈值，它才被唤醒——从静态切到刚性、算初速度、重新进入碰撞求解。</p>
<p>这就是「激活」这个词在 Godot 内部的真实含义。源码 <code>godot_collision_object_3d</code> 里，静态体（BODY_MODE_STATIC）和刚体（BODY_MODE_RIGID）是<b>同一个 body 对象</b>，只是 <code>mode</code> 字段不同：切 mode 就是破坏的「开关」，而静→动的切换需要把这块重新挂进 active 列表、参与 island 求解。你把阈值调低（按 2），一球下去唤醒一大片，统计数字暴涨，卡顿感就是从这里来的——<b>一帧内唤醒的体越多，那一步 step 越贵</b>。</p>
<p>再按 3 调到「二次破碎上限 ≥1」，然后用第二球去撞一片已经脱落的碎片：这块碎片会<b>裂成两小块</b>（<code>maybeSecondaryFracture</code>），这就是破坏层级——大块碎成小块。但注意它绝不无限递归：上限卡在 maxDepth，而且物理引擎里每裂一次，场景就多出若干个新碰撞体，内存与求解成本都成倍涨。真实游戏里这个上限通常极保守（1~2 层）。</p>`
    },
    {
      type: 'source',
      files: [
        { path: 'modules/godot_physics_3d/godot_body_3d.h', note: '本课「激活」的主体。看 active / can_sleep 字段与 wakeup()（约 287 行：STATIC/KINEMATIC 直接 return，只有 RIGID 才 set_active(true)），以及 sleep_test() 判定什么速度下允许入睡。破坏 = 从 set_active(false) 到 set_active(true)。' },
        { path: 'modules/godot_physics_3d/godot_step_3d.cpp', note: 'step 的求解主场。看 _populate_island 用 island_step 遍历相连体、static bodies 不连通 island 的注释，以及 _solve_island 对 constraint 的逐个 solve——你唤醒的每个碎片都会被塞进这些 island，一步里唤醒越多越贵。' },
        { path: 'servers/physics_3d/physics_server_3d_enums.h', note: 'BodyMode 枚举：BODY_MODE_STATIC / KINEMATIC / RIGID（约 94 行）。预分片墙在线资源里都是 STATIC，脱落时才 set_mode 成 RIGID——这就是「激活」在接口层的样子。' },
        { path: 'scene/3d/physics/rigid_body_3d.cpp', note: '事件在上层怎么冒出来。看 _body_enter_tree / _body_inout（约 39~136 行）：contact monitor 把底层 body 的进出包装成 body_entered / body_shape_entered 信号。可破坏挂接点通常是监听这些信号，再决定哪些碎片 set_mode。' }
      ]
    },
    {
      type: 'text',
      title: '试一试（课内可选项）',
      html: `<ul>
  <li>把密度从 3 一路拉到 12 再各撞一球：碎片变碎，但「单块脱落」的视觉变化很小——因为预分片碎的是「网格」，视觉粒度受 density 控制。这正是<b>离线预切 vs 运行时切割</b>的分界线：预切粒度是内容制作者定死的，运行时想改也改不了。</li>
  <li>把阈值调到最低（按 1 连按），一球轰过去唤醒几乎整面墙：看「本帧唤醒」飙到几十甚至上百，卡顿感扑面而来。这是引擎里「破坏预算」的真实来源——不是切不动，是一帧唤醒太多体。</li>
  <li>按 B 切到整块墙：同样的球，同样的位置，墙纹丝不动、只弹回。这一下就把「静态刚体有多便宜」具象化了——它不参与任何求解，只在 broadphase 里占个位。</li>
  <li>按 Esc 打开伪 Voronoi 着色：视觉上碎块变成不规则多边形，更像 Houdini 那种 Cell Fracture 的产物。但记住——<b>物理碰撞体仍按小方块近似</b>，视觉多边形只是画出来的。真实引擎里这两者同样分离：渲染网格可以很华丽，碰撞体却是几个凸包。</li>
  <li>把二次破碎上限从 0 调到 3（按 4 三次），用连续两球轰同一片碎块：看它先裂成两半、半块再裂、再裂……每一层都会让「活动刚体总数」上一个台阶，这是破坏层级对内存与求解的双重压力。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>用三个灵魂拷问给这一课收口：</p>
<ul>
  <li><b>数据怎么流动？</b>整块墙的分片数据（位置、半宽、凸包）在加载时一次性生成，之后几乎不变；运行时真正流动的只有一枚枚「激活事件」——球带给某个碎片的冲击量越过阈值，就把它从静态表移进 active 列表，并把球的动量拆一份给它当初速度。</li>
  <li><b>所有权归谁？</b>静态碎片与脱落碎片是<b>同一种对象</b>，差别只是 active 标志（源码里是 body 的 mode）。整块墙由「墙」这个静态 body 统管；脱落的碎片各自成为独立 rigid body，所有权从「墙」转移到物理世界的 active/island 集合，由 step 的主循环接管其生命。</li>
  <li><b>什么时候发生？</b>切割（预分片）发生在<b>加载/制作期</b>，一次性；激活发生在<b>碰撞那个物理子步</b>，按需、局部的；睡眠判定发生在每步末尾（sleep_test 连续低速才入睡）。所以「破坏」不是一场持续的重算，而是一连串稀疏的、按需点的唤醒事件。</li>
</ul>
<p>于是回到开头那个问题：<b>为什么工业界选预分片而不是运行时任意切割？</b>因为运行时切割要在帧预算里现场做布尔运算与凸分解，重建碰撞体；而预分片把这一切都挪到了离线，运行时只剩一件事——<b>唤醒</b>。引擎愿意在每一帧为「唤醒」付的钱，远远小于它为「切割」付的钱。下一课 B4（可破坏场景 I：像素/体素破坏）会从另一个维度——连通域分裂与孤岛掉落——继续讲「破」这件事，两课合起来就是一套完整的可破坏场景心智模型。</p>`
    }
  ]
}
