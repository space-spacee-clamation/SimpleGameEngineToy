// G1 · IK 反向运动学：脚要踩在地上
export default {
  id: 'G1',
  title: 'IK 反向运动学：脚要踩在地上',
  est: '2 小时',
  coreQuestions: [
    'FK 是「给角度求末端位置」，IK 反过来「给目标反解角度」——这个反问题为什么一般没有唯一解、也没有解析解？',
    '两骨骼解析解（余弦定理）一步到位零迭代，为什么引擎不拿它当万能钥匙，还要写 FABRIK/CCD 这种迭代法？',
    '一帧之内，IK 的数据从哪来（地形射线/抓取点）、算完写到哪去？它和 L7.2 的动画混合是什么先后关系？'
  ],
  sections: [
    {
      type: 'text',
      title: '正着算与反着算：FK 与 IK 是一对互逆问题',
      html: `<p>L7.2 里我们见过姿态的正向流水线：<b>每根骨骼存一个局部变换，沿父子链累乘，得到末端在世界空间的位置</b>——这就是正向运动学 FK（Forward Kinematics）。给它一组角度，它能算出脚尖在哪，快且唯一。但游戏里我们真正想要的是<b>反过来的东西</b>：「脚尖<u>应该</u>在这块石头上，请把膝盖和髋转成能让它落在那的角度」。这就是逆向运动学 IK（Inverse Kinematics）。</p>
<p>反问题天生比正问题难，难点有三层。<b>第一，多解</b>：同一个末端目标，肘可以朝外翻也可以朝内翻（想象伸手够桌上的杯子，手臂能折向任意一圈），解是一个流形而不是一个点——所以 IK 必须引入额外偏好（极向量 pole、旋转限制、或「离当前姿态最近」）才能挑出一个解。<b>第二，可能无解</b>：目标在臂长圈外，物理上到不了；这时诚实的做法不是硬凑，而是把目标投影回可达边界（摊直手臂贴外圈），并让调用方知道发生了截断。<b>第三，骨骼越多越没有闭式解</b>：三节以上的一般链，方程组是非线性的，没人能给出又稳又全的公式——于是工业界分成两路：<b>能解析就解析（专治两骨骼），不能解析就迭代（通用链）</b>。</p>
<table>
  <tr><th></th><th>FK 正向</th><th>IK 逆向</th></tr>
  <tr><td>输入</td><td>各关节角度/局部变换</td><td>末端目标位置（+朝向偏好）</td></tr>
  <tr><td>输出</td><td>末端位置</td><td>一组关节角度</td></tr>
  <tr><td>解的性质</td><td>唯一、确定</td><td>可能多解 / 无解，需挑选与投影</td></tr>
  <tr><td>成本</td><td>一次链式乘法</td><td>解析解若干三角函数；迭代法 N 轮传播</td></tr>
</table>`
    },
    {
      type: 'text',
      title: '两条经典路线：余弦定理解析解 vs CCD/FABRIK 迭代解',
      html: `<p><b>路线一：两骨骼解析解。</b>髋-膝-踝恰好构成一个三角形：两边长是骨长 l1、l2（常量），第三边 d 是髋到目标的距离（现场可算）。余弦定理直接把两个内角抠出来：髋部相对「髋→目标」方向的偏角 cos(θ1) = (l1² + d² − l2²) / (2·l1·d)，膝关节角 cos(θ2) = (l1² + l2² − d²) / (2·l1·l2)。再叠加「目标方向本身的 atan2 角度」和「膝盖翻向」（θ1 取正还是负），一条链一步到位，<b>零迭代、结果精确</b>。代价是它的适用面被焊死在两节链上——而且 d 一旦掉出 (|l1−l2|, l1+l2) 区间，acos 的参数越界，必须先做可达性投影。人的腿、手臂、动物的前肢恰好都是两节主链，所以这条「窄而精」的路在角色动画里出场率极高。</p>
<p><b>路线二：迭代法。</b>对任意长度的链，用「反复小步修正」逼近。<b>CCD（Cyclic Coordinate Descent）</b>的思想最朴素：从<b>最靠近末端的关节往根方向</b>逐个处理——转动当前关节，让「末端此刻的位置」朝目标转过去一点；一轮转完全链，误差变小一点，再来一轮。每步只做一个旋转、实现简单、还能顺手夹住关节限位；缺点是收敛慢，长链可能要几十轮。<b>FABRIK（Forward And Backward Rotating Iterative Kinematics）</b>换了个套路：每轮先把<b>末端直接拽到目标上</b>，然后从末端往根逐节「拉直」保持骨长（backward pass），再把根钉回原位、从根往末端逐节推回去（forward pass）。前后双向传播让它在大多数姿态下<b>两三遍就收敛到肉眼不可分辨</b>，比 CCD 快得多，还天然保持骨长不被拉伸。两者都是「给结果反推动作」的贪心近似：不保证全局最优，但每帧都便宜。</p>
<table>
  <tr><th>方案</th><th>适用链长</th><th>单帧成本</th><th>精度</th><th>典型落点</th></tr>
  <tr><td>解析两骨骼</td><td>恰好 2 节</td><td>一次 acos + 一次 atan2</td><td>精确命中</td><td>膝盖/手肘、贴地脚</td></tr>
  <tr><td>CCD</td><td>任意</td><td>轮数 × 链长 × 旋转</td><td>渐近收敛，看轮数</td><td>触手、尾巴、简单脊柱</td></tr>
  <tr><td>FABRIK</td><td>任意</td><td>轮数 × 链长 × 两次遍历</td><td>收敛极快（常 2~3 轮）</td><td>长链、绳索、四足腿部</td></tr>
</table>
<p>最后校准一下预期：<b>IK 不是用来产生大动作的</b>。让角色从门口走到桌边靠动画状态机（L7.2），到了桌边手该落在杯子的哪个面上——才是 IK 的活。行话叫「动画管大体动作，IK 管最后几厘米的修正」。它永远是对已有姿态的<u>微调层</u>，这也决定了它在帧流水线里的位置：混合完成之后、蒙皮之前。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'footik',
      title: '实验：脚部贴地沙盘',
      height: 560,
      code: `// 脚部贴地 IK 沙盘：起伏地形上的两骨骼腿，三种模式对比
// 1/2/3 切换解法：无 IK（纯 FK 摆动）/ 解析两骨骼（余弦定理）/ 迭代（FABRIK 或 CCD，按 A 换）
// K 切换膝盖朝向（同一目标两组解，直观感受 IK 的多解性）
// [ ] 调迭代上限（调到 1~2 次能看见「没收敛完」的中间态）
// 上下方向键 调步幅   左右方向键 调贴地预测提前量（脚往前看的距离）
// 空格 暂停逐帧观察   鼠标拖黄色十字 = 手动抬落点目标（拖出可达圈看解析解如何摊直贴边）
// 右下角曲线：前脚脚尖与地面的高度差（正=插地，负=悬空），无 IK 模式会看到大片红区

var L1 = 64;      // 大腿长
var L2 = 58;      // 小腿长
var FOOT = 17;    // 脚掌长（踝到脚尖）
var REACH = L1 + L2 - 0.001;                  // 最大可达半径
var INNER = Math.abs(L1 - L2) + 0.001;        // 最小可达半径（折叠极限）

engine.run({
  setup: function (state) {
    state.camX = 0;            // 地形滚动量（角色屏幕位置不动，地形向左滚 = 向右走）
    state.phase = 0;           // 步态相位
    state.stride = 64;         // 步幅 px
    state.lead = 12;           // 贴地预测提前量 px
    state.maxIter = 8;         // 迭代上限
    state.mode = 1;            // 0 无 IK / 1 解析 / 2 迭代
    state.iterAlgo = 0;        // 0 FABRIK / 1 CCD
    state.kneeFlip = false;    // 膝盖朝向
    state.paused = false;
    state.t = 0;
    state.errHist = [];        // 前脚脚尖-地面高度差曲线
    state.iterUsed = 0;        // 本帧实际迭代次数
    state.drag = -1;           // 正在拖哪个脚的落点：-1 无 / 0 后脚 / 1 前脚
    state.targets = [{ x: 200, y: 280 }, { x: 200, y: 280 }];
    state.hipX = 200; state.hipY = 190;
    state.msg = '按 1/2/3 切换解法 · K 换膝盖朝向'; state.msgT = 5;
  },

  update: function (state, dt, input) {
    var i;
    if (input.pressed('Space')) { state.paused = !state.paused; say(state, state.paused ? '已暂停：逐帧看链条怎么逼近目标' : '继续行走'); }
    if (input.pressed('Digit1')) { state.mode = 0; say(state, '无 IK：固定摆动动画，坡上必然插地/悬空'); }
    if (input.pressed('Digit2')) { state.mode = 1; say(state, '解析 IK：余弦定理一步到位，零迭代'); }
    if (input.pressed('Digit3')) { state.mode = 2; say(state, '迭代 IK：逐步逼近，可视化收敛过程'); }
    if (input.pressed('KeyA') && state.mode === 2) { state.iterAlgo = 1 - state.iterAlgo; say(state, state.iterAlgo === 0 ? '迭代算法 = FABRIK（前后双向传播）' : '迭代算法 = CCD（从末端往根逐节旋转）'); }
    if (input.pressed('KeyK')) { state.kneeFlip = !state.kneeFlip; say(state, '膝盖朝向 = ' + (state.kneeFlip ? '向后（反关节）' : '向前')); }
    if (input.pressed('BracketLeft')) { state.maxIter = Math.max(1, state.maxIter - 1); say(state, '迭代上限 = ' + state.maxIter + ' 轮'); }
    if (input.pressed('BracketRight')) { state.maxIter = Math.min(30, state.maxIter + 1); say(state, '迭代上限 = ' + state.maxIter + ' 轮'); }
    if (input.down('ArrowUp')) state.stride = Math.min(80, state.stride + 50 * dt);
    if (input.down('ArrowDown')) state.stride = Math.max(30, state.stride - 50 * dt);
    if (input.down('ArrowLeft')) state.lead = Math.max(0, state.lead - 25 * dt);
    if (input.down('ArrowRight')) state.lead = Math.min(20, state.lead + 25 * dt);

    if (!state.paused) { state.camX += 92 * dt; state.phase += dt * 2.4; }

    var swing = Math.sin(state.phase);
    var hipX = 200 - swing * 8;                     // 髋随重心小幅摇摆（身体骑在支撑脚上方）
    var hipY = 190 - swing * swing * 6;             // 每一步身体起伏两次
    state.hipX = hipX; state.hipY = hipY;

    // ---- 两只脚的期望落点：x 在 ±stride/2 间往复，y 取「前方 lead 处」的地面高度 ----
    for (i = 0; i < 2; i++) {
      var sgn = i === 1 ? 1 : -1;                   // 1 前脚 0 后脚
      var localX = sgn * state.stride * 0.5 - swing * state.stride * 0.5 * sgn;
      var dir = localX >= 0 ? 1 : -1;
      var lookWorld = state.camX + hipX + localX + state.lead * dir;  // 往前走就把采样点往前挪：预测落脚面高度
      state.targets[i].x = hipX + localX + state.lead * dir;
      state.targets[i].y = groundY(lookWorld);
    }

    // ---- 鼠标拖动落点目标 ----
    if (input.mouse.clicked) {
      state.drag = -1;
      for (i = 0; i < 2; i++) {
        var t = state.targets[i];
        if (dist(input.mouse.x, input.mouse.y, t.x, t.y) < 18) { state.drag = i; say(state, '拖动落点：拖出可达圈试试，解析解会把腿摊直贴在外圈上'); break; }
      }
    }
    if (state.drag >= 0) {
      if (!input.mouse.down) state.drag = -1;
      else { state.targets[state.drag].x = clamp(input.mouse.x, 60, 400); state.targets[state.drag].y = clamp(input.mouse.y, 110, 380); }
    }

    // ---- 解两条腿 ----
    var legs = [];
    var iter = 0;
    for (i = 0; i < 2; i++) {
      var tg = state.targets[i];
      var knee, foot;
      var baseAng = -Math.PI / 2 + swing * 0.5 * (i === 0 ? -1 : 1);   // 无 IK 时的“动画”摆腿
      var bend = 0.95 * (i === 0 ? -1 : 1);
      var fkKnee = { x: hipX + Math.cos(baseAng) * L1, y: hipY + Math.sin(baseAng) * L1 };
      var fkFoot = { x: fkKnee.x + Math.cos(baseAng + bend) * L2, y: fkKnee.y + Math.sin(baseAng + bend) * L2 };
      if (state.mode === 0) {
        knee = fkKnee; foot = fkFoot;                                   // 纯 FK：不管地形
      } else if (state.mode === 1) {
        var r = solveTwoBone(hipX, hipY, tg.x, tg.y, state.kneeFlip);
        knee = { x: r.kx, y: r.ky }; foot = { x: r.fx, y: r.fy };        // 解析：踝精确落在（投影后的）目标上
      } else {
        var pts = [{ x: hipX, y: hipY }, { x: fkKnee.x, y: fkKnee.y }, { x: fkFoot.x, y: fkFoot.y }];
        if (state.iterAlgo === 0) iter = fabrik(pts, tg.x, tg.y, state.maxIter);
        else iter = ccd(pts, tg.x, tg.y, state.maxIter);
        knee = { x: pts[1].x, y: pts[1].y }; foot = { x: pts[2].x, y: pts[2].y };  // 迭代：从 FK 姿态出发逐步逼近
      }
      var tipX = foot.x + (i === 0 ? -FOOT : FOOT);
      legs.push({ hip: { x: hipX, y: hipY }, knee: knee, foot: foot, tip: { x: tipX, y: foot.y } });
    }
    state.iterUsed = iter;
    state.legs = legs;

    // ---- 前脚脚尖与地面的高度差（误差曲线）----
    var err = legs[1].tip.y - groundY(state.camX + legs[1].tip.x);
    state.err = err;
    if (!state.paused) {
      state.errHist.push(err);
      while (state.errHist.length > 210) state.errHist.shift();
    }
    state.t += dt;
    if (state.msgT > 0) state.msgT -= dt;
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    drawTerrain(ctx, state);

    // 躯干与头
    var bodyTop = state.hipY - 128;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#9fb4cf'; ctx.lineWidth = 6;
    seg(ctx, state.hipX, state.hipY, state.hipX, bodyTop + 26);
    ctx.fillStyle = '#e2e8f0';
    ball(ctx, state.hipX, bodyTop + 6, 15);
    ctx.strokeStyle = '#5b7397'; ctx.lineWidth = 4;
    seg(ctx, state.hipX, bodyTop + 34, state.hipX + 30, bodyTop + 74);
    seg(ctx, state.hipX, bodyTop + 34, state.hipX - 30, bodyTop + 76);

    // 两条腿（后脚暗、前脚亮）
    for (i = 0; i < 2; i++) {
      var L = state.legs[i];
      var back = i === 0;
      ctx.strokeStyle = back ? '#4a5f80' : '#cbd8ea';
      ctx.lineWidth = 6;
      seg(ctx, L.hip.x, L.hip.y, L.knee.x, L.knee.y);
      seg(ctx, L.knee.x, L.knee.y, L.foot.x, L.foot.y);
      ctx.lineWidth = 5;
      seg(ctx, L.foot.x, L.foot.y, L.tip.x, L.tip.y);
      ctx.fillStyle = back ? '#4a5f80' : '#cbd8ea';
      dot(ctx, L.knee.x, L.knee.y, 4);
      if (!back) dot(ctx, L.hip.x, L.hip.y, 4);
    }

    // 目标十字与残差虚线（无 IK 模式不显示目标：它压根没在用目标）
    if (state.mode !== 0) {
      for (i = 0; i < 2; i++) {
        var t = state.targets[i];
        ctx.strokeStyle = i === state.drag ? '#f472b6' : '#fbbf24';
        ctx.lineWidth = 1.5;
        cross(ctx, t.x, t.y, 7);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(251,191,36,0.5)';
        seg(ctx, state.legs[i].foot.x, state.legs[i].foot.y, t.x, t.y);
        ctx.setLineDash([]);
      }
    }

    drawPanel(state, ctx);
    drawErrorGraph(state, ctx);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#5b7397';
    ctx.fillText('1/2/3 解法 · K 膝盖朝向 · A 换迭代算法 · [ ] 迭代上限 · 上下 步幅 · 左右 预测提前量 · 空格 暂停 · 拖黄十字', 12, engine.H - 10);
    if (state.msgT > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText(state.msg, 12, engine.H - 28); }
  }
});

// ================= 数学核心 =================

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
function say(state, s) { state.msg = s; state.msgT = 4; }

// 地形：正弦叠加（倍频递减），确定性函数——同一个世界 x 永远是同一个高度
function groundY(wx) {
  return 280 + Math.sin(wx * 0.008) * 18 + Math.sin(wx * 0.021 + 1.7) * 9 + Math.sin(wx * 0.047 + 0.6) * 4;
}

// 解析两骨骼 IK：余弦定理。返回膝 kx,ky 与踝 fx,fy（踝被投影进可达环后精确落在目标上）
function solveTwoBone(hx, hy, tx, ty, flip) {
  var dx = tx - hx, dy = ty - hy;
  var d = Math.sqrt(dx * dx + dy * dy);
  var clipped = false;
  if (d < 0.0001) { dx = 0; dy = INNER; d = INNER; clipped = true; }
  if (d > REACH) { dx *= REACH / d; dy *= REACH / d; d = REACH; clipped = true; }
  else if (d < INNER) { dx *= INNER / d; dy *= INNER / d; d = INNER; clipped = true; }
  var ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);   // 髋处内角：邻边 L1、d，对边 L2 —— 余弦定理
  ca = clamp(ca, -1, 1);                                  // 数值保险：acos 定义域
  var alpha = Math.acos(ca);
  var beta = Math.atan2(dy, dx);
  var s = flip ? 1 : -1;                                  // 同一目标的两组解：膝盖向前 or 向后
  return {
    kx: hx + Math.cos(beta + s * alpha) * L1,
    ky: hy + Math.sin(beta + s * alpha) * L1,
    fx: hx + dx, fy: hy + dy,                             // 踝 = 投影后的目标：精确命中
    clipped: clipped
  };
}

// FABRIK：末端拽到目标 -> backward 从末端往根逐节保距 -> forward 从根往末端逐节保距；循环至收敛或到上限
function fabrik(pts, tx, ty, maxIter) {
  var n = pts.length;
  var lens = [L1, L2];
  var it;
  for (it = 0; it < maxIter; it++) {
    pts[n - 1].x = tx; pts[n - 1].y = ty;                 // 先粗暴地把末端放到目标上
    for (var i = n - 2; i >= 0; i--) {                    // backward：以 i+1 为锚，把 i 沿原方向放回骨长处
      var dx = pts[i].x - pts[i + 1].x, dy = pts[i].y - pts[i + 1].y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      pts[i].x = pts[i + 1].x + dx / d * lens[i];
      pts[i].y = pts[i + 1].y + dy / d * lens[i];
    }
    for (var j = 1; j < n; j++) {                         // forward：根钉住，以 j-1 为锚把 j 沿新方向放回骨长处
      var ex = pts[j].x - pts[j - 1].x, ey = pts[j].y - pts[j - 1].y;
      var ed = Math.sqrt(ex * ex + ey * ey) || 1;
      pts[j].x = pts[j - 1].x + ex / ed * lens[j - 1];
      pts[j].y = pts[j - 1].y + ey / ed * lens[j - 1];
    }
    var rx = pts[n - 1].x - tx, ry = pts[n - 1].y - ty;
    if (rx * rx + ry * ry < 0.25) { it++; break; }        // 容差内提前收工
  }
  return it;
}

// CCD：从最靠近末端的关节往根逐个旋转，每次把「当前末端方向」朝「目标方向」转过去
function ccd(pts, tx, ty, maxIter) {
  var it;
  for (it = 0; it < maxIter; it++) {
    for (var a = pts.length - 2; a >= 1; a--) {           // 跳过根（0）：根是权威位置
      var hx = pts[a].x, hy = pts[a].y;
      var eff = pts[pts.length - 1];
      var cdx = eff.x - hx, cdy = eff.y - hy;
      var tdx = tx - hx, tdy = ty - hy;
      var cl = Math.sqrt(cdx * cdx + cdy * cdy), tl = Math.sqrt(tdx * tdx + tdy * tdy);
      if (cl < 0.001 || tl < 0.001) continue;             // 退化情形：方向未定义，跳过此关节
      var rot = Math.atan2(tdy, tdx) - Math.atan2(cdy, cdx);
      var c = Math.cos(rot), s = Math.sin(rot);
      for (var j = a + 1; j < pts.length; j++) {          // 绕关节 a 旋转其下游全部骨骼
        var vx = pts[j].x - hx, vy = pts[j].y - hy;
        pts[j].x = hx + vx * c - vy * s;
        pts[j].y = hy + vx * s + vy * c;
      }
    }
    var rx = pts[pts.length - 1].x - tx, ry = pts[pts.length - 1].y - ty;
    if (rx * rx + ry * ry < 0.25) { it++; break; }
  }
  return it;
}

// ================= 绘制 =================

function drawTerrain(ctx, state) {
  var wx0 = state.camX;
  ctx.beginPath();
  ctx.moveTo(-40, engine.H);
  for (var sx = -40; sx <= engine.W + 40; sx += 4) ctx.lineTo(sx, groundY(wx0 + sx));
  ctx.lineTo(engine.W + 40, engine.H);
  ctx.closePath();
  ctx.fillStyle = '#132033';
  ctx.fill();
  ctx.strokeStyle = '#3d5a80';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (var px = -40; px <= engine.W + 40; px += 4) {
    var y = groundY(wx0 + px);
    if (px === -40) ctx.moveTo(px, y); else ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#1e2a3d';
  ctx.lineWidth = 1;
  var g0 = Math.floor(wx0 / 40) * 40;                     // 随滚动移动的草纹，强化「地形在动」
  for (var gx = g0 - wx0; gx < engine.W + 40; gx += 40) {
    var gy = groundY(wx0 + gx);
    ctx.beginPath(); ctx.moveTo(gx, gy + 5); ctx.lineTo(gx + 5, gy + 12); ctx.stroke();
  }
}

function drawPanel(state, ctx) {
  var X = 470, Y = 16, W = 236, H = 196;
  ctx.fillStyle = 'rgba(13,20,32,0.92)';
  ctx.fillRect(X, Y, W, H);
  ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
  ctx.strokeRect(X, Y, W, H);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('解法: ' + ['① 无 IK（纯 FK 动画）', '② 解析两骨骼 IK', '③ 迭代 IK'][state.mode], X + 10, Y + 22);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#9fb4cf';
  ctx.fillText('步幅 ' + state.stride.toFixed(0) + 'px（上下键）', X + 10, Y + 44);
  ctx.fillText('预测提前量 ' + state.lead.toFixed(0) + 'px（左右键）', X + 10, Y + 60);
  ctx.fillText('膝盖朝向 ' + (state.kneeFlip ? '向后' : '向前') + '（K）', X + 10, Y + 76);
  if (state.mode === 1) {
    ctx.fillStyle = '#34d399';
    ctx.fillText('迭代次数: 0 —— 余弦定理一步到位', X + 10, Y + 96);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('仅限两节链；目标出界时自动投影', X + 10, Y + 114);
    ctx.fillText('回可达环（腿摊直贴外圈）', X + 10, Y + 128);
  } else if (state.mode === 2) {
    ctx.fillStyle = '#fbbf24';
    ctx.fillText((state.iterAlgo === 0 ? 'FABRIK' : 'CCD') + ' 本帧迭代 ' + state.iterUsed + ' / 上限 ' + state.maxIter + '（[ ] 调）', X + 10, Y + 96);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('A 换算法；上限压到 1~2 次能看见', X + 10, Y + 114);
    ctx.fillText('「没收敛完」的中间态长什么样', X + 10, Y + 128);
  } else {
    ctx.fillStyle = '#ef4444';
    ctx.fillText('误差曲线进红区 = 脚插进地里', X + 10, Y + 96);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('动画只管大体动作，最后几厘米', X + 10, Y + 114);
    ctx.fillText('它真的管不了', X + 10, Y + 128);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('黄十字 = 脚踝目标落点（可拖）', X + 10, Y + 152);
  ctx.fillText('虚线 = 踝与目标的残差', X + 10, Y + 168);
  ctx.fillText(state.paused ? '已暂停（空格继续）' : '行走中：地形向左滚 = 角色向右走', X + 10, Y + 184);
}

function drawErrorGraph(state, ctx) {
  var X = 470, Y = 226, W = 236, H = 120;
  ctx.fillStyle = 'rgba(13,20,32,0.92)';
  ctx.fillRect(X, Y, W, H);
  ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
  ctx.strokeRect(X, Y, W, H);
  var mid = Y + 60;
  ctx.fillStyle = 'rgba(239,68,68,0.10)';
  ctx.fillRect(X + 1, mid, W - 2, 54);                    // 红半区 = 插地
  ctx.strokeStyle = '#2f4468';
  ctx.beginPath(); ctx.moveTo(X, mid); ctx.lineTo(X + W, mid); ctx.stroke();
  var hist = state.errHist;
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (var i = 0; i < hist.length; i++) {
    var px = X + 2 + i;
    var py = mid + clamp(hist[i], -54, 54);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.font = '11px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('前脚脚尖 vs 地面 高度差 (px)', X + 8, Y + 14);
  ctx.fillStyle = '#5b7397';
  ctx.fillText('+下(插地)', X + W - 60, mid + 12);
  ctx.fillText('-上(悬空)', X + W - 60, mid - 6);
  var e = state.err;
  ctx.fillStyle = e > 1 ? '#ef4444' : (e < -1 ? '#60a5fa' : '#34d399');
  ctx.fillText('当前 ' + e.toFixed(1) + 'px', X + 8, Y + H - 8);
}

function seg(ctx, ax, ay, bx, by) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function ball(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function cross(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.stroke();
}
`
    },
    {
      type: 'text',
      title: '读实验结果：四种行为对照',
      html: `<p>把三种模式和两种迭代算法各玩一分钟，你应该观察到这些现象：</p>
<ol>
  <li><b>无 IK（按 1）</b>：腿在平地尚可，走上坡下坡立刻穿帮——脚尖要么插进地里（误差曲线进红区），要么悬在半空。注意这不是「动画做得不好」，而是<b>动画根本不知道地形的存在</b>：它采样的是预制的姿态轨道，输出的角度与世界无关。这正是 L7.2「数据怎么流动」的另一半：动画流只携带「时间→姿态」这一条信息，环境信息得有人另外接进来。</li>
  <li><b>解析 IK（按 2）</b>：踝精确钉在地面采样点上，误差曲线贴着零线。面板显示迭代次数恒为 0——余弦定理没有「逐步逼近」这回事。此时按 <b>K</b> 翻转膝盖朝向：末端位置<u>分毫不差</u>，整条腿却换了姿势。这就是开头说的「多解」：同一个目标对应两支解（膝内翻或外翻），所谓「解 IK」其实一直是「解 IK + 选支策略」。</li>
  <li><b>迭代 IK（按 3）</b>：起点不再是「正确姿态」而是「FK 动画姿态」，每轮迭代链条肉眼可见地向目标蜷过去。把迭代上限用 <b>[</b> 压到 1~2：FABRIK 通常已经贴住目标（双向传播收敛极快），CCD 往往还差着一截——<b>同样的预算，两种算法买到的收敛质量不同</b>。这与 A3 课「求解器迭代次数在买什么」是同一种权衡。</li>
  <li><b>拖出可达圈</b>：用鼠标把黄十字拖远，解析模式下腿会摊直、踝停在以髋为圆心的可达外圈上——这就是「投影」，同时残差虚线诚实地暴露了「目标没追上」。好的 IK 从不假装成功。</li>
</ol>
<p>还有一个参数值得玩味：<b>预测提前量</b>（左右键）。脚踩下去的位置的地面高度好办，难的是<u>迈步中的脚即将落到哪里</u>。把提前量拉到最大，前脚在抬起阶段就开始贴合前方坡面；归零则总是慢半拍。真实项目里这一步常常配合「射线检测未来落脚点 + 权重过渡」：脚跟刚触地时 IK 权重从 0 渐增到 1，避免整条腿突然弹跳——所谓「贴地过渡」。</p>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 把 IK 做成骨骼上的修改器',
      files: [
        { path: 'scene/resources/2d/skeleton/skeleton_modification_2d_twoboneik.cpp', note: '2D 两骨骼 IK 的 _execute()：搜 angle_0 / angle_1 附近——正是本课的余弦定理（注释坦承改编自 theorangeduck 与 alanzucconi 的经典文章）。重点看三件事：target_minimum_distance/target_maximum_distance 如何做可达性投影（我们的 clipped）；flip_bend_direction 如何一行切换膝盖朝向（我们的 kneeFlip）；std::isnan 分支如何在数值越界时宁可不写也不污染骨骼。' },
        { path: 'scene/resources/2d/skeleton/skeleton_modification_2d_fabrik.cpp', note: '2D FABRIK：_execute() 里 while (target_distance > chain_tolarance) { chain_backwards(); chain_forwards(); ... } 外加 chain_max_iterations 熔断——和本实验 fabrik() 的循环结构逐行对应。再看文件末尾如何把解出的 Transform 经 set_bone_local_pose_override(..., stack->strength, ...) 写回：强度就是「IK 混入比例」，这是做贴地过渡开关的官方接口。' },
        { path: 'scene/2d/skeleton_2d.cpp', note: '时机与所有权的答案在这：NOTIFICATION_INTERNAL_PROCESS 里调 execute_modifications()，先关掉 transform cache、跑栈、再把 local_pose_override 按强度与动画姿态插值合成写回 Bone2D——即「动画先写姿态，IK 修改器在其后叠加修正」。同文件搜 _update_process_mode 可见进程/物理两种执行节拍的选择。' },
        { path: 'scene/3d/two_bone_ik_3d.cpp', note: '4.x 的 3D 形态：TwoBoneIK3D::_process_joints()。几何思路与 2D 版同源但更聪明——不再 acos 求角，而是直接解「两个圆的交点」：a=(l²+r1²−r2²)/2l、h=√(r1²−a²)，得到膝候选点后取<u>离 pole 目标更近</u>的那个。pole_node 就是我们说的「选支策略」的工程化：用一个外部节点代替 flip 布尔值。' },
        { path: 'scene/3d/ccd_ik_3d.cpp', note: '3D CCD：_solve_iteration() 的双层循环（外层 ancestor 从末端往根、内层更新下游），每步用 Quaternion(head_to_effector, head_to_destination) 构造「把当前末端方向转到目标方向」的旋转——与本实验 ccd() 的 atan2 之差是 2D 等价物。另留意 rotation_axis 投影与 limitation 分支：迭代中随时夹紧关节限位。' },
        { path: 'scene/3d/iterate_ik_3d.h', note: '所有迭代类 3D IK（CCD/FABRIK/Jacobian/Spline）的共同基类 IterateIK3D：搜 max_iterations = 4 与 min_distance = 0.001——默认只迭代四轮！再加「误差小于阈值提前退出」。这就是引擎对「每帧预算」的回答：宁可下一帧继续追，不在一帧里赌到底。' }
      ]
    },
    {
      type: 'text',
      title: 'Godot 的结构决定：为什么 IK 是「修改器」而不是「节点」',
      html: `<p>4.x 曾有一个独立的 SkeletonIK3D 节点，后来整个体系重构成 <b>SkeletonModifier3D / SkeletonModificationStack2D</b>：IK 不再是场景树里的一等公民，而是挂在骨骼系统上的<u>一段可插拔的骨骼姿态修改逻辑</u>。这个形态变化本身就回答了三个灵魂拷问。</p>
<p><b>数据怎么流动</b>：完整链路是「AnimationMixer 采样+混合出基础姿态 →（写进骨骼）→ 修改器栈按序执行，每个 _execute 读当前骨骼全局变换、解自己的小方程、产出 override → 按 strength 与基础姿态插值合成 → 最终姿态交给蒙皮/渲染」。IK 处在 L7.2 那条流水线的<u>最后一站</u>：它消费的不是动画数据，而是「动画的输出 + 世界的输入（目标节点/射线命中的位置）」。</p>
<p><b>所有权归谁</b>：修改器配置（链定义、迭代上限、强度）是 <b>Resource</b>，可跨实例共享；但它引用的 target_node、pole_node 只存 ObjectID 缓存并每帧校验有效性（源码里满屏的 WARN_PRINT_ONCE("cache is out of date")），骨骼本体归 Skeleton 节点。谁都不「拥有」求解出来的姿态，它只是一次写入的临时结果——所以才有 pose override + 强度插值这套「可撤销写入」的设计，防止 IK 永久劫持骨骼。</p>
<p><b>什么时候发生</b>：内部处理通知（NOTIFICATION_INTERNAL_PROCESS / PHYSICS_PROCESS），即每帧、在动画混合之后、可由 callback mode 选进程或物理节拍——需要贴着碰撞体走路的角色多半选物理帧。迭代上限默认 4 意味着它是「每帧有限预算的渐进任务」，目标大幅移动时你会看到末端花几帧<u>追</u>上去，而不是瞬移。</p>
<p>顺带一提视野里的全景：主干 scene/3d/ 下有 ccd_ik_3d、fabr_ik_3d、jacobian_ik_3d、spline_ik_3d、two_bone_ik_3d 五种求解器共用 IterateIK3D/ChainIK3D 骨架——Jacobian 伪逆是第三条理论路线（把问题线性化成 Δθ = J⁺Δx，本课不展开，知道名字即可）；2D 侧则在 scene/resources/2d/skeleton/ 提供 TwoBone/CCD/FABRIK 三件套加 LookAt、Jiggle、PhysicalBones 等同族修改器。<b>「修改器栈」是个通用槽位，IK 只是住在里面的第一种房客</b>——这句话是通往 G2（弹簧骨骼）的门。</p>`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>切到迭代模式，把上限压到 1，来回按 A 比较 FABRIK 与 CCD 的单轮质量差；再按空格暂停，逐帧看链条怎么蜷向目标。</li>
  <li>解析模式下把鼠标目标拖到髋的<u>正下方贴身处</u>（进入最小可达半径以内）：腿会别扭地「折叠贴内圈」——想想为什么现实膝盖不能这么转，以及引擎用什么拦住它（关节限位，源码里 limitation 分支）。</li>
  <li>把预测提前量拉到最大再慢慢归零，盯住误差曲线过坡瞬间的尖峰：提前量买的到底是什么？如果地形突变（悬崖）它还会失效吗？</li>
  <li>按 K 观察膝盖翻转的瞬间：末端轨迹完全不变。思考 FPS 游戏里「枪托贴合肩膀」的 IK 若允许这样翻转会出什么鬼畜画面，选支策略该参考什么（提示：上一帧的膝盖位置）。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回到三个灵魂拷问。<b>数据怎么流动</b>：世界（地形射线/抓取点）给出末端目标，IK 反推出各关节角度，作为「override」按强度混合叠在动画混合的结果之上——它是 L7.2 流水线写回之前的最后一层修正，动画管大体动作，IK 管最后几厘米。<b>所有权归谁</b>：链配置与迭代参数是可共享的 Resource；目标节点是别人持有的外部对象（只存 ID 缓存、每帧验尸）；解出的姿态不属于任何人，只是骨骼变换的一次带强度的临时覆写。<b>什么时候发生</b>：每帧内部处理通知、动画之后蒙皮之前，可选进程/物理节拍；迭代法在固定预算内渐进收敛（Godot 默认才 4 轮），宁可下帧再追也不在一帧里赌到底。</p>
<p>方法层面记住两张牌：<b>两骨骼解析解</b>——余弦定理一步到位、零迭代、精确命中，但只吃两节链且必须处理可达性投影与选支；<b>迭代解</b>——CCD 从末端往根逐节旋转、简单但慢，FABRIK 前后双向传播、两三遍就够，通吃任意链长。工程上二者常常共存：腿用解析、触手用迭代、脊柱用样条。</p>
<p>留一个钩子：本课的目标点全是「问世界要来的」（地形高度）。下一课 G2 我们把「世界对骨骼的反作用」更进一步——让头发、尾巴、配饰用弹簧自己动起来，那时修改器栈里住的就是另一批房客了。</p>`
    }
  ]
}
