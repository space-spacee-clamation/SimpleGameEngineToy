// A2 · 接触流形:两个盒子的接触不止一个点
export default {
  id: 'A2',
  title: '接触流形：两个盒子的接触不止一个点',
  est: '2 小时',
  coreQuestions: [
    '「接触」到底是几个点？为什么单点撑不起一座塔？',
    'reference face 与 incident face 是怎么选的？为什么裁剪总在 incident 上做？',
    '为什么面面接触裁完最多剩两个点？',
    '流形点如何喂给顺序冲量求解器？'
  ],
  sections: [
  {
    type: 'text',
    title: '碰撞检测的产出不是「撞了」，是一张交接清单',
    html: `<p>回顾 A1：检测层回答的是「什么时候、在哪里撞上了」。本课回答它的下半句：<b>撞在哪些点上、各穿多深</b>——这张清单叫<b>接触流形（contact manifold）</b>，是喂给 A3 顺序冲量求解器的<b>全部输入</b>。求解器拿到它之后，对每个点建一行约束（雅可比），点数就是约束行数：清单开多少行，塔就按多少行来撑。</p>
<p>直觉陷阱：两个平面贴在一起，接触「理应是一整面」。但求解器只需要、也只该拿<b>有限个代表点</b>——面面接触沿分离轴投影就是一条线段，线段由两个端点唯一确定。所以「裁完最多剩两个点」不是近似妥协，是<b>数学上恰好完备</b>。</p>`
  },
  {
    type: 'text',
    title: '流形四步：选轴、选面、裁剪、保留',
    html: `<p>两个旋转盒子相交时，流形的生成只有四步，每步都在缩小范围：</p>
<table>
  <tr><th>步骤</th><th>做什么</th><th>为什么</th></tr>
  <tr><td>1. SAT 选轴</td><td>测四条候选轴（两盒各两条面法线），取重叠最小的一条作接触法线</td><td>最小重叠轴=最浅的穿插方向，接触必然沿它发生</td></tr>
  <tr><td>2. 选 reference face</td><td>胜出轴所属的盒上，朝向对方的那个面</td><td>它是数据基准面：接触点最终都要落在它的平面上</td></tr>
  <tr><td>3. 选 incident face</td><td>另一只盒上，与法线最反向（最朝向 reference）的面</td><td>它是最可能先碰到 reference 的面</td></tr>
  <tr><td>4. 裁剪</td><td>用 reference 面两侧的边平面裁剪 incident 面线段，保留落在宽度内且穿透深度大于零的点</td><td>把「面」裁成「点」，且保证点不越界</td></tr>
</table>
<p>然后回答那个致命问题：<b>为什么单点撑不起一座塔？</b>盒子压在支点上，重心在支点正上方时力矩平衡；但凡有一丝偏移，重力就产生绕支点的力矩，而<b>单点没有任何力矩能反抗它</b>——塔只能绕支点转下去。两个支点（盒角）连成一条支撑边，重心投影落在边内就被顶回来。这就是流形要两个点的全部理由：<b>两个点=一条支撑边=力矩有着落</b>。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'clipsteps',
    title: '实验：裁剪四步单步演示 + 单点/两点支撑双塔',
    height: 620,
    code: `// 接触流形实验台:上半=裁剪四步(空格单步),下半=单点 vs 两点支撑双塔(按住 J 吹风)
// A/D 旋转上方盒子   W/S 上移下移   R 全部重置

engine.run({
  setup: function (state) {
    state.step = 0; state.ang = 0.17; state.off = 0; state.time = 0;
    state.left = { tilt: 0, spin: 0 }; state.right = { tilt: 0 };
    rebuild(state);
  },

  update: function (state, dt, input) {
    state.time += dt;
    if (input.pressed('Space')) state.step = (state.step + 1) % 5;
    if (input.pressed('KeyR')) {
      state.step = 0; state.ang = 0.17; state.off = 0;
      state.left.tilt = 0; state.left.spin = 0; state.right.tilt = 0;
    }
    if (input.down('KeyA')) state.ang -= 0.9 * dt;
    if (input.down('KeyD')) state.ang += 0.9 * dt;
    if (input.down('KeyW')) state.off -= 18 * dt;
    if (input.down('KeyS')) state.off += 18 * dt;
    var wind = input.down('KeyJ');
    if (wind) state.left.spin += 55 * dt;
    if (state.left.tilt > 10) state.left.spin += 100 * dt;
    state.left.tilt += state.left.spin * dt;
    if (!wind && state.left.tilt <= 10) state.left.spin = Math.max(0, state.left.spin - 45 * dt);
    if (state.left.tilt > 78) { state.left.tilt = 78; state.left.spin = 0; }
    var target = wind ? 5.5 : 0;
    state.right.tilt += (target - state.right.tilt) * Math.min(1, 5 * dt);
    if (wind) state.right.tilt += Math.sin(state.time * 15) * 0.04;
    rebuild(state);
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    drawClip(state, ctx);
    drawTowers(state, ctx);
    drawHud(state, ctx);
  }
});

function obbVerts(cx, cy, w, h, ang) {
  var c = Math.cos(ang), s = Math.sin(ang);
  var hw = w / 2, hh = h / 2;
  var xs = [-hw, hw, hw, -hw], ys = [-hh, -hh, hh, hh];
  var out = [];
  for (var i = 0; i < 4; i++) out.push({ x: cx + xs[i] * c - ys[i] * s, y: cy + xs[i] * s + ys[i] * c });
  return out;
}

function faceInfo(v, i, cx, cy) {
  var p0 = v[i], p1 = v[(i + 1) % 4];
  var ex = p1.x - p0.x, ey = p1.y - p0.y;
  var len = Math.sqrt(ex * ex + ey * ey);
  var nx = -ey / len, ny = ex / len;
  var mx = (p0.x + p1.x) / 2 - cx, my = (p0.y + p1.y) / 2 - cy;
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
  return { p0: p0, p1: p1, nx: nx, ny: ny };
}

function project(v, ax, ay) {
  var mn = 1e9, mx = -1e9;
  for (var i = 0; i < v.length; i++) {
    var d = v[i].x * ax + v[i].y * ay;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }
  return { min: mn, max: mx };
}

function bestFace(faces, nx, ny, sign) {
  var bi = 0, bs = -1e9;
  for (var i = 0; i < faces.length; i++) {
    var s = sign * (faces[i].nx * nx + faces[i].ny * ny);
    if (s > bs) { bs = s; bi = i; }
  }
  return faces[bi];
}

function bestOf(axes) {
  var b = null;
  for (var i = 0; i < axes.length; i++) {
    if (axes[i].overlap <= 0) continue;
    if (!b || axes[i].overlap < b.overlap) b = axes[i];
  }
  return b;
}

function rebuild(state) {
  var cAx = 402, cAy = 100 + state.off, cBx = 382, cBy = 176;
  var A = obbVerts(cAx, cAy, 132, 82, state.ang);
  var B = obbVerts(cBx, cBy, 152, 92, -0.22);
  state.A = A; state.B = B;
  var fa = [faceInfo(A, 0, cAx, cAy), faceInfo(A, 1, cAx, cAy), faceInfo(A, 2, cAx, cAy), faceInfo(A, 3, cAx, cAy)];
  var fb = [faceInfo(B, 0, cBx, cBy), faceInfo(B, 1, cBx, cBy), faceInfo(B, 2, cBx, cBy), faceInfo(B, 3, cBx, cBy)];
  state.fa = fa; state.fb = fb;
  var axes = [
    { ax: fa[0].nx, ay: fa[0].ny, owner: 'A' },
    { ax: fa[1].nx, ay: fa[1].ny, owner: 'A' },
    { ax: fb[0].nx, ay: fb[0].ny, owner: 'B' },
    { ax: fb[1].nx, ay: fb[1].ny, owner: 'B' }
  ];
  var i, best = null;
  for (i = 0; i < axes.length; i++) {
    var pa = project(A, axes[i].ax, axes[i].ay);
    var pb = project(B, axes[i].ax, axes[i].ay);
    axes[i].overlap = Math.min(pa.max - pb.min, pb.max - pa.min);
    if (axes[i].overlap <= 0) { best = null; break; }
    if (!best || axes[i].overlap < best.overlap) best = axes[i];
  }
  state.axes = axes; state.hit = !!best;
  if (!best) { state.contacts = []; state.clipPts = []; return; }
  var nx = best.ax, ny = best.ay;
  if (nx * (cBx - cAx) + ny * (cBy - cAy) < 0) { nx = -nx; ny = -ny; }
  state.nx = nx; state.ny = ny; state.owner = best.owner;
  var rf, inc;
  if (best.owner === 'A') { rf = bestFace(fa, nx, ny, 1); inc = bestFace(fb, nx, ny, -1); }
  else { rf = bestFace(fb, nx, ny, -1); inc = bestFace(fa, nx, ny, 1); }
  state.refFace = rf; state.incFace = inc;
  var rx = rf.p1.x - rf.p0.x, ry = rf.p1.y - rf.p0.y;
  var rl = Math.sqrt(rx * rx + ry * ry);
  var sx = rx / rl, sy = ry / rl;
  var t0 = (inc.p0.x - rf.p0.x) * sx + (inc.p0.y - rf.p0.y) * sy;
  var t1 = (inc.p1.x - rf.p0.x) * sx + (inc.p1.y - rf.p0.y) * sy;
  var d = t1 - t0, tn, tf;
  if (Math.abs(d) < 1e-9) { tn = 0; tf = 1; }
  else {
    tn = Math.max(0, Math.min((0 - t0) / d, (rl - t0) / d));
    tf = Math.min(1, Math.max((0 - t0) / d, (rl - t0) / d));
  }
  var kept = [];
  if (tn <= tf) {
    kept.push({ x: inc.p0.x + (inc.p1.x - inc.p0.x) * tn, y: inc.p0.y + (inc.p1.y - inc.p0.y) * tn });
    kept.push({ x: inc.p0.x + (inc.p1.x - inc.p0.x) * tf, y: inc.p0.y + (inc.p1.y - inc.p0.y) * tf });
  }
  for (i = 0; i < kept.length; i++) kept[i].d = (kept[i].x - rf.p0.x) * rf.nx + (kept[i].y - rf.p0.y) * rf.ny;
  state.clipPts = kept;
  var cps = [];
  for (i = 0; i < kept.length; i++) if (kept[i].d < 0) cps.push({ x: kept[i].x, y: kept[i].y, depth: -kept[i].d });
  state.contacts = cps;
}

function poly(v, ctx) {
  ctx.beginPath();
  ctx.moveTo(v[0].x, v[0].y);
  for (var i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
}

function drawClip(state, ctx) {
  var i;
  ctx.fillStyle = '#16324f'; poly(state.B, ctx); ctx.fill();
  ctx.strokeStyle = '#5b8fd6'; ctx.lineWidth = 1.5; poly(state.B, ctx); ctx.stroke();
  ctx.fillStyle = '#4a2c14'; poly(state.A, ctx); ctx.fill();
  ctx.strokeStyle = '#f59e0b'; poly(state.A, ctx); ctx.stroke();
  if (!state.hit) {
    ctx.fillStyle = '#f87171'; ctx.font = '13px monospace';
    ctx.fillText('两盒不相交(按 R 重置)', 300, 240);
    return;
  }
  if (state.step === 0) {
    var hot = bestOf(state.axes);
    for (i = 0; i < state.axes.length; i++) {
      var ax = state.axes[i];
      var cx0 = ax.owner === 'A' ? 402 : 382;
      var cy0 = ax.owner === 'A' ? 100 + state.off : 176;
      var isHot = ax === hot;
      ctx.strokeStyle = isHot ? '#ffd479' : '#2c3e55';
      ctx.lineWidth = isHot ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx0 - ax.ax * 130, cy0 - ax.ay * 130);
      ctx.lineTo(cx0 + ax.ax * 130, cy0 + ax.ay * 130);
      ctx.stroke();
      ctx.fillStyle = isHot ? '#ffd479' : '#5b7397';
      ctx.font = '11px monospace';
      ctx.fillText(ax.owner + '面 o=' + ax.overlap.toFixed(1), cx0 + ax.ax * 96 - 30, cy0 + ax.ay * 96 + 4);
    }
    ctx.fillStyle = '#9db4d0'; ctx.font = '12px monospace';
    ctx.fillText('SAT:四条候选轴,重叠最小者=接触法线(黄)', 20, 20);
  }
  if (state.step >= 1) {
    var rf = state.refFace;
    ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(rf.p0.x, rf.p0.y); ctx.lineTo(rf.p1.x, rf.p1.y); ctx.stroke();
    ctx.fillStyle = '#ffd479'; ctx.font = '12px monospace';
    ctx.fillText('reference(基准面)', rf.p0.x - 30, rf.p0.y - 8);
  }
  if (state.step >= 2) {
    var ic = state.incFace;
    ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ic.p0.x, ic.p0.y); ctx.lineTo(ic.p1.x, ic.p1.y); ctx.stroke();
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('incident(被裁剪面)', ic.p0.x - 20, ic.p0.y - 8);
  }
  if (state.step >= 3) {
    var rf2 = state.refFace;
    ctx.strokeStyle = '#7d93b3'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(rf2.p0.x, rf2.p0.y); ctx.lineTo(rf2.p0.x + state.nx * 60, rf2.p0.y + state.ny * 60);
    ctx.moveTo(rf2.p1.x, rf2.p1.y); ctx.lineTo(rf2.p1.x + state.nx * 60, rf2.p1.y + state.ny * 60);
    ctx.stroke();
    ctx.setLineDash([]);
    for (i = 0; i < state.clipPts.length; i++) {
      var cp = state.clipPts[i];
      if (cp.d >= 0) {
        ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cp.x - 5, cp.y - 5); ctx.lineTo(cp.x + 5, cp.y + 5);
        ctx.moveTo(cp.x + 5, cp.y - 5); ctx.lineTo(cp.x - 5, cp.y + 5); ctx.stroke();
      }
    }
    ctx.fillStyle = '#9db4d0';
    ctx.fillText('用基准面两侧边平面裁 incident 线段(红叉=越界被裁)', 20, 236);
  }
  if (state.step >= 4) {
    for (i = 0; i < state.contacts.length; i++) {
      var pt = state.contacts[i];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#cfe3ff'; ctx.font = '11px monospace';
      ctx.fillText('深度 ' + pt.depth.toFixed(1), pt.x + 8, pt.y - 6);
    }
    ctx.fillStyle = '#9db4d0';
    ctx.fillText('保留穿透>0 的点:共 ' + state.contacts.length + ' 个接触点 → 喂给求解器(A3)', 20, 258);
  }
}

function tower(ctx, px, py, tilt, color) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(tilt * Math.PI / 180);
  for (var i = 0; i < 3; i++) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75 - i * 0.12;
    ctx.fillRect(-28, -30 - i * 30, 56, 26);
    ctx.strokeStyle = '#0b0f17'; ctx.lineWidth = 1;
    ctx.strokeRect(-28, -30 - i * 30, 56, 26);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(px - 8, py + 12); ctx.lineTo(px + 8, py + 12); ctx.lineTo(px, py + 2); ctx.closePath(); ctx.fill();
}

function drawTowers(state, ctx) {
  ctx.fillStyle = '#1c2739'; ctx.fillRect(0, 420, engine.W, engine.H - 420);
  ctx.strokeStyle = '#3b4d6b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 420); ctx.lineTo(engine.W, 420); ctx.stroke();
  tower(ctx, 200, 420, state.left.tilt, '#f59e0b');
  tower(ctx, 520, 420, state.right.tilt, '#34d399');
  ctx.fillStyle = '#9db4d0'; ctx.font = '12px monospace';
  ctx.fillText('单点支撑(质心下一个支点)', 116, 436);
  ctx.fillText('两点支撑(盒角两个支点)', 438, 436);
  if (state.left.tilt > 40) {
    ctx.fillStyle = '#f87171'; ctx.font = '14px monospace';
    ctx.fillText('倾覆!', 172, 296);
  }
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.85)'; ctx.fillRect(8, 8, 320, 74);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('上半:裁剪四步 step ' + state.step + '/4(空格)  A/D 旋转  W/S 移动', 16, 26);
  ctx.fillText('下半:按住 J 吹风  R 全部重置', 16, 44);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('接触点数: ' + state.contacts.length + '   倾角: 左' + state.left.tilt.toFixed(0) + '° 右' + state.right.tilt.toFixed(0) + '°', 16, 62);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>让 reference 换盒：</b>按 A/D 把上盒转到 25° 左右，回 step 0 看 SAT 胜出轴从竖直翻到斜向——胜出轴换了，step 1 的 reference face 就换到另一只盒上。</li>
  <li><b>看两点的深度差：</b>转回小角度并按 S 把上盒压深，step 4 的两个接触点深度数值并不相等——这就是真实流形，逐点各有各的穿透。</li>
  <li><b>看退化：</b>转到两盒几乎平行（角度差接近 0）时，裁剪常常只剩 1 个点——面面接触退化成点面接触，本课开头的问题在这里现出原形。</li>
  <li><b>双塔吹风：</b>按住 J 吹 3 秒松开：左塔（单点）一去不回，右塔（两点）倾斜后回正。按 R 复位再试一次，两次轨迹完全一致——因为随机数是自带种子的。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：流形生成的工业实现',
    files: [
      { path: 'modules/godot_physics_3d/godot_collision_solver_3d_sat.cpp', note: 'SAT 轴测试、reference/incident face 选择与裁剪生成本课四步的工业实现；搜 generate_contacts 与 face 相关函数。' },
      { path: 'modules/godot_physics_3d/godot_collision_solver_3d.cpp', note: '碰撞求解入口：按形状对分发，凸-凸形状走 SAT 路线；看它如何整理形状数据后调用 sat 模块。' },
      { path: 'modules/godot_physics_3d/godot_body_pair_3d.cpp', note: '流形点的下游：每个接触点变成一行约束喂给顺序冲量（回扣 A3）；搜 contact 看 depth/normal 如何被消费。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>接触流形是检测与求解之间的一张<b>交接清单</b>：SAT 选出接触法线，reference/incident 的面选择确立数据基准，一次裁剪把「面」收缩成至多两个「点」，每个点带法线与深度。单点撑不住塔，两点连成支撑边——<b>流形的宽度，就是物理世界的稳定宽度</b>。</p>
<ul>
  <li><b>数据怎么流动？</b>两个 OBB → SAT 选轴 → 选面 → 裁剪 → 带法线与深度的 1~2 个接触点 → 每点一行约束进顺序冲量求解器。</li>
  <li><b>所有权归谁？</b>接触点是检测层的临时产物，本身无所有权；法线与深度一旦写进接触结构，就移交给求解器消费，生命周期只有一帧（跨帧缓存的暖启动是 A3 的话题）。</li>
  <li><b>什么时候发生？</b>每固定步的 narrowphase 生成一次；步内先 SAT 后选面再裁剪，顺序固定；塔的稳与不稳，在清单交付的那一刻已经注定。</li>
</ul>`
  }
  ]
};
