// A4 · 约束的艺术：关节、马达与布娃娃
export default {
  id: 'A4',
  title: '约束的艺术：关节、马达与布娃娃',
  est: '2 小时',
  coreQuestions: [
    '「不许动」这种否定式的规则，怎么变成求解器能吃的正向数据？',
    '马达凭什么不用写任何新的求解代码——它和限位为什么共用同一行公式？',
    '可断关节是「冲量超阈值就删除约束」，为什么这一删会连锁改变 island 的结构？',
    '布娃娃的稳定性到底是谁给的：关节刚度、迭代次数，还是限位角度？'
  ],
  sections: [
    {
      type: 'text',
      title: '把「不许动」写成方程：约束 = 数据',
      html: '<p>A3 里我们看的是接触：两个盒子互相顶住。这一课看它的孪生兄弟——<b>关节（joint）</b>：链条的一节不许离下一节太远、门只能绕合页转、膝盖不能向后弯。三件事看起来天差地别，在引擎里却是<b>同一个接口的三个实现</b>。</p>' +
'<p>先看 Godot 的物理内核怎么定义这类东西。<code>godot_constraint_3d.h</code> 里的基类 <code>GodotConstraint3D</code> 只有三个纯虚函数：</p>' +
'<pre>virtual bool setup(real_t p_step);      // 本步开始：按当前姿态重建雅可比、清零累加器\nvirtual bool pre_solve(real_t p_step);  // 迭代前：把上一步攒下的冲量先施加回去（暖启动）\nvirtual void solve(real_t p_step);      // 每次迭代调用一次：只满足自己这一条方程</pre>' +
'<p>接触（<code>GodotBodyPair3D</code>）实现它，每一种关节也实现它。<b>这就是全部契约</b>：只要你能在这三步里报告「我还差多少速度」并施加修正冲量，A3 那套顺序冲量循环就会一视同仁地把你扫进收敛。</p>' +
'<p>关键在于翻译这一步。「两点必须重合」「这根轴不许歪」是否定式规则，求解器读不懂；物理学家把它们改写成<b>关于速度的线性方程</b>：</p>' +
'<pre>C(v) = J·v + b = 0        // 每个被锁的自由度一条；J 叫雅可比（Jacobian），把两体速度投影到约束方向</pre>' +
'<p>J 描述「这个自由度上，哪些线速度/角速度分量参与较劲」（含力臂 r×n 与转动惯量的贡献），b 是从位置误差折算来的补偿速度（Baumgarte 稳定法）。于是「不许动」变成了一个可以求根的数据结构。Godot 把这条投影数学包成小类 <code>GodotJacobianEntry3D</code>，注释里明写着「Adapted to Godot from the Bullet library」——它算出的 <code>m_Adiag</code> 正是有效质量的倒数，也就是 L5.2 里那个 <code>1/m_a + 1/m_b</code> 的带转动版。对照着看，关节和接触真的只是同一家族的不同成员：</p>' +
'<table>' +
'  <tr><th></th><th>接触（A2/A3）</th><th>关节（本课）</th></tr>' +
'  <tr><td>何时存在</td><td>只在重叠的那几步</td><td>每步都在，直到被删除</td></tr>' +
'  <tr><td>单条方程的解集</td><td>只能推：累加冲量钳到非负</td><td>一般双向对称；限位退化为单向</td></tr>' +
'  <tr><td>违反的下场</td><td>穿透（有 slop 容忍）</td><td>拉开/错位（靠 bias 拉回）</td></tr>' +
'  <tr><td>求解器眼里</td><td colspan="2">都是 GodotConstraint3D，都走 setup → pre_solve → N × solve</td></tr>' +
'</table>'
    },
    {
      type: 'text',
      title: 'PinJoint 与 HingeJoint：锁点、锁轴、限位、马达',
      html: '<p><b>PinJoint（固定关节）</b>是最小可用的关节：把 A 体的锚点 <code>m_pivotInA</code> 和 B 体的锚点 <code>m_pivotInB</code> 钉在世界里同一点。它的 <code>setup()</code> 干的事一目了然——构造 <b>3 个</b> <code>GodotJacobianEntry3D</code>，法线依次取世界 X/Y/Z，等于三条速度方程：<b>枢轴点的相对速度在三个轴上都为零</b>。注意它没锁转动，所以 PinJoint 就是「球铰」。而 <code>solve()</code> 更短，核心一行：位置误差除 dt 得到 bias 速度，再沿三条轴各来一发冲量分别 <code>apply_impulse</code> 到两体。它是整个 joints 目录最短的实现，却包含了约束求解的全部要素。</p>' +
'<p><b>HingeJoint（铰链关节）</b>在此基础上做减法：允许绕一根轴转，其余全锁。它的 setup 建了 <b>6 条方程</b>——3 条线性管枢轴对齐（逻辑同 pin），3 条角向（<code>m_jacAng</code>）两条锁死轴向倾斜、一条留给限位与马达处理绕轴转速。真正精彩的是<b>限位</b>的处理方式。setup() 算出当前铰链角后：</p>' +
'<pre>if (hingeAngle &lt;= lower) { m_correction = lower - hingeAngle; m_limitSign = +1; m_solveLimit = true; }\nelse if (hingeAngle &gt;= upper) { m_correction = upper - hingeAngle; m_limitSign = -1; m_solveLimit = true; }</pre>' +
'<p>然后 solve() 里对限位通道：</p>' +
'<pre>real_t temp = m_accLimitImpulse;\nm_accLimitImpulse = MAX(m_accLimitImpulse + impulseMag, real_t(0));   // 累加器只许单向增长\nimpulseMag = m_accLimitImpulse - temp;</pre>' +
'<p>眼熟吗？这正是 A3 里接触冲量的 <code>c.acc_normal_impulse = MAX(jn_old + jn, 0)</code>。<b>限位不是新发明，它就是一条「只会单向推开的接触」</b>——接触防止两盒互穿，限位防止两骨互折，连累加器的写法都同构。这里还藏着一个设计决定：关节创建时默认把两个 body 间的碰撞禁用（<code>disabled_collisions_between_bodies</code>）——否则你的大腿和躯干永远卡在一起。</p>' +
'<p><b>马达（motor）</b>回答另一个问题：约束只会让相对速度归零，可我<b>想让它转起来</b>怎么办？答案优雅得令人发笑——什么都不加，只把目标速度挪进方程：</p>' +
'<pre>real_t motor_relvel = desiredMotorVel - projRelVel;           // 「目标 − 实际」代替了「0 − 实际」\nunclipped = m_kHinge * motor_relvel;                          // kHinge：绕轴方向有效质量倒数\nclipped = CLAMP(unclipped, ±m_maxMotorImpulse);               // 扭矩上限 = 每步冲量预算</pre>' +
'<p>扭矩上限决定了轮子爬不爬得动坡、布娃娃能不能把头撑起来——马达是「愿望」，上限是「肌肉力量」。另外值得知道：这套 pin/hinge 继承自 Bullet，用的是「误差折算偏置速度」的软约束；另一条路线 XPBD 把约束直接写进位置投影，刚度可逼近理想刚性——那是 A5 的正题。两种路线，同一个接口。</p>'
    },
    {
      type: 'text',
      title: '布娃娃与断裂：约束图也是图',
      html: '<p>把上面的零件组装起来就是<b>布娃娃（ragdoll）</b>：骨骼树里每根 bone 挂一个刚体，父子 bone 之间放一个带限位的铰链或 cone-twist 关节，扔进场景，重力接管一切。游戏工业里它几乎是免费的——从《Half-Life 2》到《GTA》，角色死亡效果全是这条路。但布娃娃出了名难驯服，翻车现场通常三类病：</p>' +
'<ul>' +
'  <li><b>反关节</b>：限位没开或设错，肘/膝向后折断。解剖学限位（如膝关节只许 0°~150° 屈曲）是把「人类不该有的动作」编码成数据。</li>' +
'  <li><b>过度柔软</b>：角色像一滩水。原因是迭代不足——一整串关节是强耦合系统，误差要很多遍才扫得平。</li>' +
'  <li><b>能量注入</b>：bias 太猛或落地冲击太大，关节越晃越疯。约束修位置误差时会「无中生有」造速度，这是所有引擎的通病，只能调参压制。</li>' +
'</ul>' +
'<p>这直接呼应 A3 的核心结论：<b>关节和接触一样，是 island 这张图的边</b>。<code>godot_step_3d.cpp</code> 的 <code>_populate_island()</code> 沿 body 的 constraint map 递归扩散收集连通域——布娃娃的所有骨头因关节相连，永远是<b>同一个岛</b>：一起被并行调度，也一起睡、一起醒。</p>' +
'<p>于是「可断关节」获得了一个漂亮的定义：<b>当某条约束承受的冲量超过阈值，把它从图上删掉</b>。若这条边恰是桥（bridge），一个岛当场裂成两个岛——半截身体从此独立休眠，不再拖累另一半的求解预算。你看，断裂不是特效脚本，而是图论事件。（Godot 内置关节没有现成的 breakable 属性，需要自己监控受力或删除 joint——思想来自 Havok/PhysX 的 breaking threshold，实验④会亲手实现它。）</p>' +
'<table>' +
'  <tr><th>节点</th><th>类型</th><th>自由度账目</th><th>典型用途</th></tr>' +
'  <tr><td>PinJoint3D / DampedSpringJoint2D</td><td>球铰（+弹簧）</td><td>锁 3 移，放 3 转</td><td>吊灯、链条、抓钩绳</td></tr>' +
'  <tr><td>HingeJoint3D</td><td>铰链 + 限位 + 马达</td><td>锁 5，放 1 转</td><td>门、车轮、四肢</td></tr>' +
'  <tr><td>SliderJoint3D</td><td>直线导轨</td><td>放 1 移，锁其余</td><td>活塞、抽屉</td></tr>' +
'  <tr><td>ConeTwistJoint3D / Generic6DOFJoint3D</td><td>六轴逐条开关</td><td>任意组合</td><td>肩膀髋部、载具悬挂</td></tr>' +
'</table>'
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'jointsandbox',
      title: '实验：关节沙盘（链条 / 布娃娃 / 马达 / 可断关节）',
      height: 600,
      code: `// 关节沙盘：四块面板，全部跑同一个「顺序冲量 + 累加器」内核
// Tab 切换面板 · 空格重置 · 鼠标拖拽抓取刚体
// 面板① 链条：上下方向键改刚度 K（拉低 = 橡皮链条），R 切松弛模式（模拟少迭代）
// 面板② 布娃娃：L 开关限位（关掉看肢体反关节恐怖现场），拖拽头部甩出去
// 面板③ 马达：左右方向键改目标转速，上下改最大扭矩（爬坡要看功率！）
// 面板④ 可断关节：上下改断裂阈值，C 给重物一记横向锤击，盯住高亮的断口
engine.run({
  setup: function (state) {
    state.panel = 1;
    state.msg = ''; state.msgT = 0;
    state.drag = null;
    state.fixed = 1 / 60; state.subs = 4;
    state.g = 900; state.floorY = 402;
    state.rng = mulberry32(20260903);   // 自带种子，可复现
    buildChain(state); buildRag(state); buildMotor(state); buildBreak(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('Tab')) { state.panel = state.panel % 4 + 1; state.drag = null; }
    if (input.pressed('Digit1')) state.panel = 1;
    if (input.pressed('Digit2')) state.panel = 2;
    if (input.pressed('Digit3')) state.panel = 3;
    if (input.pressed('Digit4')) state.panel = 4;
    if (input.pressed('Space')) rebuildCurrent(state);

    var mx = input.mouse.x, my = input.mouse.y;
    grabHandle(state, input, mx, my);

    if (state.panel === 1) {
      if (input.pressed('ArrowUp'))   { state.chain.k = Math.min(1, state.chain.k + 0.05); say(state, '刚度 K = ' + state.chain.k.toFixed(2)); }
      if (input.pressed('ArrowDown')) { state.chain.k = Math.max(0.02, state.chain.k - 0.05); say(state, '刚度 K = ' + state.chain.k.toFixed(2)); }
      if (input.pressed('KeyR')) { state.chain.relax = !state.chain.relax; say(state, state.chain.relax ? '松弛模式：距离约束每步只兑现一半 —— 等效于降迭代次数' : '满强度求解'); }
      stepChain(state);
    } else if (state.panel === 2) {
      if (input.pressed('KeyL')) { state.rag.limitsOn = !state.rag.limitsOn; rebuildRagBodies(state); state.rag.trail = []; say(state, state.rag.limitsOn ? '限位已开启：看肢体外红色的限位扇形' : '限位关闭！（反关节预警）'); }
      stepRag(state);
    } else if (state.panel === 3) {
      if (input.pressed('ArrowLeft'))  { state.motor.target -= 0.5; }
      if (input.pressed('ArrowRight')) { state.motor.target += 0.5; }
      if (input.pressed('ArrowUp'))    { state.motor.maxTorque = Math.min(3000, state.motor.maxTorque + 100); }
      if (input.pressed('ArrowDown'))  { state.motor.maxTorque = Math.max(50, state.motor.maxTorque - 100); }
      stepMotor(state);
    } else {
      if (input.pressed('ArrowUp'))   { state.brk.threshold += 250; say(state, '断裂阈值 = ' + state.brk.threshold); }
      if (input.pressed('ArrowDown')) { state.brk.threshold = Math.max(200, state.brk.threshold - 250); say(state, '断裂阈值 = ' + state.brk.threshold); }
      if (input.pressed('KeyC')) hammerBreak(state);
      stepBreak(state);
    }
    if (state.msgT > 0) state.msgT -= dt;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.fillStyle = '#1c2739'; ctx.fillRect(0, state.floorY, engine.W, engine.H - state.floorY);
    ctx.strokeStyle = '#3b4d6b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, state.floorY); ctx.lineTo(engine.W, state.floorY); ctx.stroke();
    if (state.panel === 1) drawChain(state, ctx);
    else if (state.panel === 2) drawRag(state, ctx);
    else if (state.panel === 3) drawMotor(state, ctx);
    else drawBreak(state, ctx);
    drawFrame(state, ctx);
  }
});

// ---------------- 通用工具（纯函数，不碰 DOM/定时器） ----------------

function mulberry32(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function vlen(x, y) { return Math.sqrt(x * x + y * y); }
function angNorm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function say(state, text) { state.msg = text; state.msgT = 4; }

function makeBody(x, y, r, mass) {
  var I = 0.5 * mass * r * r;
  return { x: x, y: y, vx: 0, vy: 0, w: 0, rot: 0, r: r, invM: 1 / mass, invI: 1 / I, stat: false };
}
function pointVel(b, rx, ry) { return { x: b.vx - b.w * ry, y: b.vy + b.w * rx }; }
function applyLinear(b, ix, iy, rx, ry) {
  b.vx += ix * b.invM; b.vy += iy * b.invM;
  b.w += b.invI * (rx * iy - ry * ix);
}
function applyPair(ba, bb, ix, iy, rax, ray, rbx, rby) {
  if (ba && !ba.stat) applyLinear(ba, -ix, -iy, rax, ray);
  if (bb && !bb.stat) applyLinear(bb, ix, iy, rbx, rby);
}
function integrate(bs, g, dt, floorY) {
  var i, b, vn, fr;
  for (i = 0; i < bs.length; i++) {
    b = bs[i];
    if (b.stat || b.grabbed) continue;
    b.vy += g * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.w * dt;
    if (b.y > floorY - b.r) {                    // 圆 vs 地面：接触还是 A3 那套（只推 + 摩擦）
      b.y = floorY - b.r;
      vn = b.vy;
      if (vn > 0) { b.vy = -vn * 0.12; fr = clamp(-b.vx * 0.6, -Math.abs(vn), Math.abs(vn)); b.vx += fr; }
      b.w *= 0.95;
    }
    if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * 0.3; }
    if (b.x > 720 - b.r) { b.x = 720 - b.r; if (b.vx > 0) b.vx = -b.vx * 0.3; }
  }
}
function bodiesOf(state) {
  if (state.panel === 1) return state.chain.bs;
  if (state.panel === 2) return state.rag.bs;
  if (state.panel === 3) return [state.motor.wheel];
  return state.brk.bs;
}
function rebuildCurrent(state) {
  if (state.panel === 1) buildChain(state);
  else if (state.panel === 2) { rebuildRagBodies(state); state.rag.trail = []; }
  else if (state.panel === 3) buildMotor(state);
  else buildBreak(state);
  state.drag = null;
}
function grabHandle(state, input, mx, my) {   // 鼠标抓取 = 运动学拖拽：给被抓体施加跟随速度
  var bs = bodiesOf(state), i, b, d;
  if (input.mouse.clicked) {
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      d = vlen(b.x - mx, b.y - my);
      if (d < b.r + 12 && !b.stat) { state.drag = { b: b, lx: mx - b.x, ly: my - b.y }; break; }
    }
  }
  if (state.drag) {
    if (!input.mouse.down || bs.indexOf(state.drag.b) < 0) { state.drag.b.grabbed = false; state.drag = null; }
    else {
      b = state.drag.b;
      b.grabbed = true;
      b.vx = clamp(((mx - state.drag.lx) - b.x) * 30, -1500, 1500);
      b.vy = clamp(((my - state.drag.ly) - b.y) * 30, -1500, 1500);
    }
  }
}
function drawTag(ctx, x, y, text) {
  ctx.font = '12px monospace'; ctx.fillStyle = '#8fa7c7';
  ctx.fillText(text, x, y);
}
function drawBar(ctx, x, y, frac, label) {       // 冲量/阈值仪表
  ctx.fillStyle = '#24344d'; ctx.fillRect(x, y, 120, 8);
  ctx.fillStyle = frac > 0.75 ? '#f87171' : '#fbbf24';
  ctx.fillRect(x, y, 120 * clamp(frac, 0, 1), 8);
  ctx.font = '11px monospace'; ctx.fillStyle = '#7d93b3';
  ctx.fillText(label, x + 126, y + 8);
}

// ---------------- 面板①：距离关节链条 ----------------

function buildChain(state) {
  if (!state.chain) state.chain = {};
  var c = state.chain;
  if (c.k === undefined) c.k = 1;
  var bs = [], js = [], i, n = 10, seg = 27;
  bs.push({ x: 360, y: 56, vx: 0, vy: 0, w: 0, rot: 0, r: 7, invM: 0, invI: 0, stat: true });
  for (i = 1; i <= n; i++) bs.push(makeBody(360, 56 + i * seg, 9, 1));
  for (i = 0; i < n; i++) js.push({ a: i, b: i + 1, rest: seg, acc: 0 });
  c.bs = bs; c.js = js; c.n = n;
}
function chainSolve(state) {                      // 每条距离关节：沿轴的速度方程 + bias
  var c = state.chain, i, j, ba, bb, dx, dy, d, nx, ny, err, va, vb, cdot, km, lam, old;
  for (i = 0; i < c.js.length; i++) {
    j = c.js[i]; ba = c.bs[j.a]; bb = c.bs[j.b];
    dx = bb.x - ba.x; dy = bb.y - ba.y; d = vlen(dx, dy);
    if (d < 0.0001) continue;
    nx = dx / d; ny = dy / d;
    err = d - j.rest;                             // 位置误差（>0 被拉长）
    va = pointVel(ba, nx * j.rest * 0.5, ny * j.rest * 0.5);
    vb = pointVel(bb, -nx * j.rest * 0.5, -ny * j.rest * 0.5);
    cdot = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
    km = ba.invM + bb.invM;
    lam = -(cdot + (8 / state.fixed) * c.k * err) / km;   // k = bias 刚度：K 越小越「橡皮」
    old = j.acc;
    j.acc += lam;
    if (c.relax) j.acc = old + (j.acc - old) * 0.5;       // 松弛：每步只兑一半 ≈ 迭代不足
    lam = j.acc - old;                            // 累加器模式：暖启动同款
    applyPair(ba, bb, nx * lam, ny * lam, nx * j.rest * 0.5, ny * j.rest * 0.5, -nx * j.rest * 0.5, -ny * j.rest * 0.5);
  }
}
function stepChain(state) {
  var c = state.chain, it, s;
  for (s = 0; s < state.subs; s++) {
    integrate(c.bs, state.g, state.fixed / state.subs, state.floorY);
    for (it = 0; it < 10; it++) chainSolve(state);
  }
}
function drawChain(state, ctx) {
  var c = state.chain, i, j, ba, bb, dx, dy, t;
  ctx.fillStyle = '#3b4d6b'; ctx.fillRect(c.bs[0].x - 26, c.bs[0].y - 12, 52, 8);  // 天花板
  for (i = 0; i < c.js.length; i++) {
    j = c.js[i]; ba = c.bs[j.a]; bb = c.bs[j.b];
    dx = bb.x - ba.x; dy = bb.y - ba.y;
    t = clamp(Math.abs(vlen(dx, dy) - j.rest) / 14, 0, 1);   // 拉伸越多越红
    ctx.strokeStyle = 'rgb(' + Math.round(90 + t * 158) + ',' + Math.round(180 - t * 120) + ',110)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
    ctx.fillStyle = '#fbbf24';                                // 关节 = 小圆点
    ctx.beginPath(); ctx.arc((ba.x + bb.x) / 2, (ba.y + bb.y) / 2, 3, 0, 7); ctx.fill();
  }
  for (i = 0; i < c.bs.length; i++) {
    ba = c.bs[i];
    ctx.fillStyle = ba.stat ? '#8fa7c7' : (ba.grabbed ? '#fde68a' : '#dfe9f5');
    ctx.beginPath(); ctx.arc(ba.x, ba.y, ba.r, 0, 7); ctx.fill();
  }
  drawTag(ctx, 12, 420, '① 链条：K=' + c.k.toFixed(2) + (c.relax ? ' · 松弛中' : '') + ' —— 把 K 拉低，钢索变皮筋（bias 变小 = 每步只还一部分债）');
}

// ---------------- 面板②：布娃娃（头+躯干+四肢，铰接+限位） ----------------

function buildRag(state) {
  if (!state.rag) state.rag = { limitsOn: true };
  rebuildRagBodies(state);
  state.rag.trail = [];
}
function rebuildRagBodies(state) {
  var r = state.rag, sx = 250 + state.rng() * 30, sy = 118;
  var bs = [
    makeBody(sx, sy, 13, 4),              // 0 头
    makeBody(sx, sy + 42, 17, 8),         // 1 躯干
    makeBody(sx - 32, sy + 38, 9, 2),     // 2 左上臂
    makeBody(sx - 54, sy + 56, 8, 1.6),   // 3 左下臂
    makeBody(sx + 32, sy + 38, 9, 2),     // 4 右上臂
    makeBody(sx + 54, sy + 56, 8, 1.6),   // 5 右下臂
    makeBody(sx - 11, sy + 80, 10, 3),    // 6 左大腿
    makeBody(sx - 15, sy + 110, 8, 2),    // 7 左小腿
    makeBody(sx + 11, sy + 80, 10, 3),    // 8 右大腿
    makeBody(sx + 15, sy + 110, 8, 2)     // 9 右小腿
  ];
  function mk(a, b, rest, lo, hi) { return { a: a, b: b, rest: rest, lo: lo, hi: hi, accD: 0, accA: 0 }; }
  r.bs = bs;
  r.js = [
    mk(0, 1, 29, -0.7, 0.7),            // 脖子：左右点头各 40°
    mk(1, 2, 25, -2.4, -0.5),           // 左肩：外展范围（相对姿势角）
    mk(2, 3, 22, 0.2, 2.4),             // 左肘：只许向内弯 —— 反关节的第一道闸门
    mk(1, 4, 25, 0.5, 2.4),             // 右肩
    mk(4, 5, 22, -2.4, -0.2),           // 右肘
    mk(1, 6, 28, -0.4, 1.4),            // 左髋
    mk(6, 7, 24, -2.4, -0.2),           // 左膝：只许向后弯
    mk(1, 8, 28, -1.4, 0.4),            // 右髋
    mk(8, 9, 24, 0.2, 2.4)              // 右膝
  ];
  r.psDraw = null;
}
function ragPairs(state) {              // 预计算锚点与法线（对应 Godot 的 setup 阶段）
  var out = [], i, j, ba, bb, dx, dy, d, nx, ny;
  for (i = 0; i < state.rag.js.length; i++) {
    j = state.rag.js[i]; ba = state.rag.bs[j.a]; bb = state.rag.bs[j.b];
    dx = bb.x - ba.x; dy = bb.y - ba.y; d = vlen(dx, dy);
    if (d < 0.001) { out.push(null); continue; }
    nx = dx / d; ny = dy / d;
    out.push({ j: j, ba: ba, bb: bb, ax: ba.x + nx * j.rest * 0.5, ay: ba.y + ny * j.rest * 0.5,
               bx: bb.x - nx * j.rest * 0.5, by: bb.y - ny * j.rest * 0.5, nx: nx, ny: ny, atLim: false });
  }
  return out;
}
function ragDistSolve(state, ps) {      // 锁移：沿骨轴的距离约束
  var i, p, ba, bb, dx, dy, d, err, va, vb, cdot, km, lam, old;
  for (i = 0; i < ps.length; i++) {
    p = ps[i]; if (!p) continue;
    ba = p.ba; bb = p.bb;
    dx = bb.x - ba.x; dy = bb.y - ba.y; d = vlen(dx, dy);
    if (d < 0.001) continue;
    err = d - p.j.rest;
    va = pointVel(ba, p.ax - ba.x, p.ay - ba.y);
    vb = pointVel(bb, p.bx - bb.x, p.by - bb.y);
    cdot = (vb.x - va.x) * p.nx + (vb.y - va.y) * p.ny;
    km = ba.invM + bb.invM;
    lam = -(cdot + (8 / state.fixed) * err) / km;
    old = p.j.accD; p.j.accD += lam; lam = p.j.accD - old;
    applyPair(ba, bb, p.nx * lam, p.ny * lam, p.ax - ba.x, p.ay - ba.y, p.bx - bb.x, p.by - bb.y);
  }
}
function ragAngSolve(state, ps) {       // 限位 = 单向累加冲量：MAX(acc,0) 的接触同款
  var i, p, ba, bb, rel, e, tgt, wr, den, lam, old, dir;
  for (i = 0; i < ps.length; i++) {
    p = ps[i]; if (!p) continue;
    ba = p.ba; bb = p.bb;
    rel = angNorm(bb.rot - ba.rot);
    e = 0; dir = 0;
    if (state.rag.limitsOn) {
      if (rel < p.j.lo) { e = p.j.lo - rel; dir = 1; }              // 低于下限：往正方向顶
      else if (rel > p.j.hi) { e = rel - p.j.hi; dir = -1; }        // 高于上限：往负方向顶
    }
    wr = bb.w - ba.w;
    tgt = e > 0 ? -dir * clamp(e * 12, 0, 6) : 0;                   // bias：超限越多顶得越急
    den = ba.invI + bb.invI;
    lam = -(wr - tgt) / den;
    old = p.j.accA;
    p.j.accA += lam;
    if (e > 0) p.j.accA = dir > 0 ? Math.max(p.j.accA, 0) : Math.min(p.j.accA, 0);  // 单向钳制
    else p.j.accA = 0;                                              // 限位内 = 自由摆动
    lam = p.j.accA - old;
    if (!ba.stat) ba.w -= ba.invI * lam;
    if (!bb.stat) bb.w += bb.invI * lam;
    p.atLim = e > 0.02;
  }
}
function stepRag(state) {
  var r = state.rag, it, s, ps;
  for (s = 0; s < state.subs; s++) {
    integrate(r.bs, state.g, state.fixed / state.subs, state.floorY);
    ps = ragPairs(state);
    for (it = 0; it < 8; it++) { ragDistSolve(state, ps); ragAngSolve(state, ps); }
  }
  r.psDraw = ps;                                                     // 供绘制读取限位状态
  r.trail.push({ x: r.bs[0].x, y: r.bs[0].y });                      // 头部轨迹：翻滚是不是「活」的
  if (r.trail.length > 100) r.trail.shift();
}
function drawRag(state, ctx) {
  var r = state.rag, bs = r.bs, i, j, ba, bb, p, mid;
  ctx.strokeStyle = '#243a55'; ctx.lineWidth = 1;                    // 头部轨迹
  ctx.beginPath();
  for (i = 0; i < r.trail.length; i++) { p = r.trail[i]; if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
  ctx.stroke();
  ctx.lineCap = 'round';
  for (i = 0; i < r.js.length; i++) {                                // 骨段
    j = r.js[i]; ba = bs[j.a]; bb = bs[j.b];
    ctx.strokeStyle = '#46608a'; ctx.lineWidth = Math.min(ba.r, bb.r) * 1.2;
    ctx.beginPath(); ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
  }
  for (i = 0; i < r.js.length; i++) {                                // 限位扇形 + 关节点
    j = r.js[i]; ba = bs[j.a]; bb = bs[j.b];
    mid = { x: (ba.x + bb.x) / 2, y: (ba.y + bb.y) / 2 };
    p = r.psDraw ? r.psDraw[i] : null;
    if (r.limitsOn && p && p.atLim) {                                // 顶到限位：红色扇形亮起
      ctx.fillStyle = 'rgba(248,113,113,0.35)';
      ctx.beginPath(); ctx.moveTo(ba.x, ba.y);
      ctx.arc(ba.x, ba.y, ba.r + 10, ba.rot + j.lo, ba.rot + j.hi);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(mid.x, mid.y, 3, 0, 7); ctx.fill();
  }
  for (i = 0; i < bs.length; i++) {
    ba = bs[i];
    ctx.fillStyle = i === 0 ? '#fde68a' : (ba.grabbed ? '#fef3c7' : '#dfe9f5');
    ctx.beginPath(); ctx.arc(ba.x, ba.y, ba.r, 0, 7); ctx.fill();
  }
  drawTag(ctx, 12, 420, '② 布娃娃：限位 ' + (r.limitsOn ? '开（红扇形=正在顶限位）' : '关！看肘膝反关节') + ' —— 抓住头部抛向斜坡试试翻滚');
}

// ---------------- 面板③：马达驱动轮爬坡 ----------------

function buildMotor(state) {
  if (!state.motor) state.motor = { target: 8, maxTorque: 600 };
  var m = state.motor;
  m.wheel = makeBody(120, 320, 26, 6);
  m.hist = [];
  m.slip = 0;
}
function groundYAt(x) {                                              // 地形：平地 → 缓坡 → 高台
  if (x <= 300) return 360;
  if (x <= 460) return 360 - (x - 300) * 0.45;
  return 288;
}
function groundNAt(x) {
  if (x > 300 && x < 460) { var l = vlen(1, 0.45); return { x: 0.45 / l, y: -1 / l }; }   // 指向斜上方
  return { x: 0, y: -1 };
}
function stepMotor(state) {
  var m = state.motor, w = m.wheel, dt = state.fixed / state.subs, s, n, gy, pen, rx, ry, vp, vn, kt, jn, tx, ty, vt, jt, maxF, err, want, maxImp;
  for (s = 0; s < state.subs; s++) {
    w.vy += state.g * dt;
    w.x += w.vx * dt; w.y += w.vy * dt; w.rot += w.w * dt;
    gy = groundYAt(w.x);
    pen = (w.y + w.r) - gy;
    if (pen > 0) {
      n = groundNAt(w.x);
      w.x += n.x * pen; w.y += n.y * pen;
      rx = 0; ry = w.r;                                              // 接触点近似在轮心正下方
      vp = pointVel(w, rx, ry);
      vn = vp.x * n.x + vp.y * n.y;                                  // 沿法线速度（vn<0 = 压地）
      kt = w.invM + w.invI * (rx * rx + ry * ry);
      jn = vn < 0 ? -vn / kt : 0;                                    // 接触只推不拉 —— A3 同款
      applyLinear(w, n.x * jn, n.y * jn, rx, ry);
      tx = -n.y; ty = n.x;                                           // 切向摩擦 = 轮胎
      vp = pointVel(w, rx, ry);
      vt = vp.x * tx + vp.y * ty;                                    // 接触点切速：转太快 = 打滑
      maxF = jn * 0.9;                                               // 库仑锥近似：摩擦 ≤ μ·法向冲量
      jt = clamp(-vt / kt, -maxF, maxF);
      m.slip = Math.abs(vt) > 60 ? 1 : 0;
      applyLinear(w, tx * jt, ty * jt, rx, ry);
    }
    err = m.target - w.w;                                            // ★ 马达：目标速度项塞进同一方程
    maxImp = m.maxTorque * state.fixed;                              // 扭矩上限 = 每步冲量预算
    want = clamp(err / w.invI, -maxImp, maxImp);                     // 马达同款：CLAMP(±预算)
    w.w += want * w.invI;
    if (w.x > 706) { w.x = 40; w.y = 300; w.vx = 0; w.vy = 0; w.w = 0; }
  }
  m.hist.push(w.w);
  if (m.hist.length > 200) m.hist.shift();
}
function drawMotor(state, ctx) {
  var m = state.motor, w = m.wheel, i, hx, hy;
  ctx.fillStyle = '#1c2739';                                         // 地形多边形
  ctx.beginPath();
  ctx.moveTo(0, 440); ctx.lineTo(0, 360); ctx.lineTo(300, 360); ctx.lineTo(460, 288); ctx.lineTo(720, 288); ctx.lineTo(720, 440);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3b4d6b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 360); ctx.lineTo(300, 360); ctx.lineTo(460, 288); ctx.lineTo(720, 288); ctx.stroke();
  ctx.fillStyle = '#dfe9f5';
  ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;                    // 辐条：看得见轮子在转
  for (i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x + Math.cos(w.rot + i * Math.PI / 2) * (w.r - 3), w.y + Math.sin(w.rot + i * Math.PI / 2) * (w.r - 3));
    ctx.stroke();
  }
  ctx.fillStyle = '#fbbf24';                                         // 轴心 = 关节可视化
  ctx.beginPath(); ctx.arc(w.x, w.y, 4, 0, 7); ctx.fill();
  var mid = 120, hh = 80;                                            // 角速度示波窗
  ctx.strokeStyle = '#24344d'; ctx.lineWidth = 1;
  ctx.strokeRect(500, mid - hh / 2, 200, hh);
  ctx.strokeStyle = '#2c3e55';
  ctx.beginPath(); ctx.moveTo(504, mid); ctx.lineTo(696, mid); ctx.stroke();
  ctx.strokeStyle = '#fbbf24';
  ctx.beginPath();
  for (i = 0; i < m.hist.length; i++) {
    hx = 500 + (i / 199) * 200;
    hy = mid - clamp(m.hist[i] / 12, -1, 1) * (hh / 2 - 4);
    if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
  }
  ctx.stroke();
  ctx.font = '11px monospace'; ctx.fillStyle = '#7d93b3';
  ctx.fillText('轮子角速度 w（中线=0）', 504, mid - hh / 2 - 5);
  drawBar(ctx, 500, 200, Math.abs(m.target - w.w) / 6, '马达欠速');
  drawTag(ctx, 12, 420, '③ 马达：目标 w=' + m.target.toFixed(1) + ' rad/s · 扭矩预算=' + m.maxTorque + (m.slip ? ' · 打滑!' : '') + ' —— 预算不够，坡就上不去');
}

// ---------------- 面板④：可断关节（绳吊重物） ----------------

function buildBreak(state) {
  if (!state.brk) state.brk = { threshold: 1200, hits: 0 };
  var b = state.brk;
  var bs = [
    { x: 360, y: 40, vx: 0, vy: 0, w: 0, rot: 0, r: 8, invM: 0, invI: 0, stat: true },
    makeBody(360, 150, 11, 2),
    makeBody(360, 296, 24, 12)
  ];
  b.bs = bs;
  b.js = [
    { a: 0, b: 1, rest: 110, acc: 0, broken: false, flash: 0 },
    { a: 1, b: 2, rest: 135, acc: 0, broken: false, flash: 0 }
  ];
}
function breakSolve(state) {
  var b = state.brk, i, j, ba, bb, dx, dy, d, nx, ny, err, va, vb, cdot, km, lam;
  for (i = 0; i < b.js.length; i++) {
    j = b.js[i];
    if (j.flash > 0) j.flash -= 0.02;
    if (j.broken) continue;                                          // 已删除的约束：什么都不做
    ba = b.bs[j.a]; bb = b.bs[j.b];
    dx = bb.x - ba.x; dy = bb.y - ba.y; d = vlen(dx, dy);
    if (d < 0.001) continue;
    nx = dx / d; ny = dy / d;
    err = d - j.rest;
    va = pointVel(ba, 0, 0); vb = pointVel(bb, 0, 0);
    cdot = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
    km = ba.invM + bb.invM;
    lam = -(cdot + (8 / state.fixed) * err) / km;
    j.acc += lam;                                                    // 本步累计冲量（瞬时）
    if (Math.abs(j.acc) > b.threshold) {                             // ★ 断裂判定：越过阈值 → 从图上删边
      j.broken = true; j.flash = 1;
      b.hits++;
      say(state, '啪！第 ' + (i + 1) + ' 根绳累加冲量 ' + Math.abs(j.acc).toFixed(0) + ' 越过阈值 —— 约束已从 island 图上删除');
      continue;
    }
    applyPair(ba, bb, nx * lam, ny * lam, 0, 0, 0, 0);
  }
}
function stepBreak(state) {
  var b = state.brk, s, it, i;
  for (s = 0; s < state.subs; s++) {
    integrate(b.bs, state.g, state.fixed / state.subs, state.floorY);
    for (it = 0; it < 10; it++) {
      for (i = 0; i < b.js.length; i++) b.js[i].acc = 0;             // 演示瞬时冲量峰值判定（简化）
      breakSolve(state);
    }
  }
}
function hammerBreak(state) {
  var w = state.brk.bs[2];
  w.vx += 950 + state.rng() * 150;                                   // 种子随机：可复现的锤子
  say(state, '锤击！盯住两根绳上的 |P| 读数');
}
function drawBreak(state, ctx) {
  var b = state.brk, bs = b.bs, i, j, ba, bb, t, mx, my;
  ctx.fillStyle = '#3b4d6b'; ctx.fillRect(bs[0].x - 30, 28, 60, 8);
  for (i = 0; i < b.js.length; i++) {
    j = b.js[i]; ba = bs[j.a]; bb = bs[j.b];
    mx = (ba.x + bb.x) / 2; my = (ba.y + bb.y) / 2;
    if (j.broken) {
      ctx.strokeStyle = 'rgba(248,113,113,' + (0.25 + Math.max(0, j.flash) * 0.75).toFixed(2) + ')';
      ctx.lineWidth = 3 + Math.max(0, j.flash) * 6;                  // 断裂瞬间高亮放大
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f87171'; ctx.font = 'bold 13px monospace';
      ctx.fillText('断!', mx + 8, my);
    } else {
      t = clamp(Math.abs(j.acc) / b.threshold, 0, 1);                // 颜色随载荷逼近阈值变红
      ctx.strokeStyle = 'rgb(' + Math.round(120 + t * 128) + ',' + Math.round(200 - t * 150) + ',120)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(mx, my, 3.5, 0, 7); ctx.fill();
      ctx.font = '11px monospace'; ctx.fillStyle = '#7d93b3';
      ctx.fillText('|P|=' + Math.abs(j.acc).toFixed(0), mx + 8, my - 4);
    }
  }
  for (i = 0; i < bs.length; i++) {
    ba = bs[i];
    ctx.fillStyle = i === 2 ? '#93c5fd' : (i === 0 ? '#8fa7c7' : (ba.grabbed ? '#fde68a' : '#dfe9f5'));
    ctx.beginPath(); ctx.arc(ba.x, ba.y, ba.r, 0, 7); ctx.fill();
  }
  drawTag(ctx, 12, 420, '④ 可断：阈值=' + b.threshold + ' · C=锤击 · 已断 ' + b.hits + '/2 —— 断掉的虚线就是消失的图边');
}

// ---------------- HUD ----------------

function drawFrame(state, ctx) {
  var names = ['① 链条', '② 布娃娃', '③ 马达', '④ 可断'];
  var i;
  ctx.font = '13px monospace';
  for (i = 0; i < 4; i++) {
    ctx.fillStyle = state.panel === i + 1 ? '#fbbf24' : '#3b4d6b';
    ctx.fillText(names[i], 12 + i * 88, 22);
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('Tab/1-4 切换 · 空格重置 · 拖拽抓取', 396, 22);
  if (state.msgT > 0) {
    ctx.fillStyle = 'rgba(11,15,23,0.88)';
    ctx.fillRect(10, 32, 700, 24);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(state.msg, 16, 49);
  }
}
`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: '<ul>' +
'  <li><b>面板①：找「刚度」的真相。</b>按 ↓ 把 K 从 1.00 拉到 0.10：链条从钢索变皮筋。这不是换了物理——只是 bias 系数变小，每步只偿还一小部分位置误差，误差永远还不清。再按 R 开松弛模式：同样的 K，收敛肉眼可见地更慢，体会「刚度 ≈ 迭代买到的东西」。</li>' +
'  <li><b>面板②：恐怖现场复现。</b>按 L 关掉限位，抓住头部甩出去：肘、膝出现人类不可能的反折。开回来，肢体顶到限位角的瞬间会亮起红色扇形——那就是 <code>m_solveLimit</code> 被触发的可视化。对比头部轨迹曲线：有限位的角色翻滚「有骨架」，没有限位的像一袋面条。</li>' +
'  <li><b>面板③：马达的预算。</b>目标转速拉到 15、扭矩压到 50：轮子在坡前空转打滑——愿望很大，肌肉很小。把扭矩一格格加上去：同一行公式什么都没改，只是 CLAMP 的边界变了，轮子就上去了。「马达 = 目标速度项 + 冲量钳制」的全部秘密就在这。</li>' +
'  <li><b>面板④：断裂 = 图论事件。</b>阈值拉高后用 C 反复锤击，盯住冲量读数逼近阈值的样子；断掉下面那根绳，上半截立刻安静下来——它和重物不再同属一个 island。空格重置再来。</li>' +
'</ul>'
    },
    {
      type: 'source',
      title: '源码走读：Godot 4.x 的 joints 家族',
      files: [
        { path: 'modules/godot_physics_3d/godot_constraint_3d.h', note: '81 行的世界观：GodotConstraint3D 只有 setup / pre_solve / solve 三个纯虚函数，外加持有哪些 body（get_body_ptr）、priority、island_step 标记与 disabled_collisions_between_bodies。先读它，再看每种关节都眼熟。' },
        { path: 'modules/godot_physics_3d/joints/godot_pin_joint_3d.cpp', note: '最小完整约束：setup() 建 3 个 GodotJacobianEntry3D（世界 XYZ 各一条速度方程）；solve() 里 depth * tau / dt 是位置误差折算的 bias 速度，减 damping * rel_vel 后沿轴 apply_impulse 到两体；set_param 暴露 PIN_JOINT_BIAS / DAMPING / IMPULSE_CLAMP——最后那个就是弱化版「可断关节」。' },
        { path: 'modules/godot_physics_3d/joints/godot_hinge_joint_3d.cpp', note: '关节全家桶：setup() 末尾的限位判定（m_correction / m_limitSign / m_solveLimit）；solve() 搜 MAX(m_accLimitImpulse + impulseMag, 0)——和 A3 接触累加器同款单向钳制；再看到 apply motor 段：desiredMotorVel - projRelVel，马达只是把目标速度塞进同一方程，再用 m_maxMotorImpulse 钳制。' },
        { path: 'modules/godot_physics_2d/godot_joints_2d.cpp', note: '2D 版（基于 Chipmunk）：GodotPinJoint2D::setup 显式拼 2x2 质量矩阵 K 再 affine_inverse，softness 加在对角线上——实验①那个 K 滑杆的官方亲戚；solve 里 wr -= motor_target_velocity 一行证明马达 = 目标速度项；文件尾部 GodotDampedSpringJoint2D 是「软约束」的另一极。' },
        { path: 'modules/jolt_physics/joints/jolt_hinge_joint_3d.cpp', note: '换后端不换概念：_build_hinge 里 mLimitsMin/mLimitsMax 填限位、mLimitsSpringSettings 允许限位弹软化；_update_motor_state 把马达切成 EMotorState::Velocity，SetTargetAngularVelocity + mMinTorqueLimit/mMaxTorqueLimit——和手写版逐词对应。两套后端共享同一套 PhysicsServer3D 关节 API。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: '<p>这一课的主张只有一句话：<b>约束是把「不许动」翻译成数据，再喂给 A3 那台求解器</b>。锁点（pin）、锁轴与限位（hinge）、马达（目标速度项）、弹簧（softness）、断裂（删除约束），全都是 GodotConstraint3D 的 setup / pre_solve / solve 三步曲的不同编曲。限位和接触共用单向累加器，马达和限位共用同一行冲量公式，Jolt 与内置后端共用同一套服务器 API——引擎设计的复用往往不是共享代码，而是<b>共享方程的形状</b>。</p>' +
'<p>回到三个灵魂拷问：</p>' +
'<ul>' +
'  <li><b>数据怎么流动？</b>锚点与轴向（局部坐标常量）→ 每步 setup 按当前姿态投影出雅可比与 bias → solve 读两体的线/角速度、算出冲量、再写回两体速度；马达的目标速度与扭矩上限作为参数汇入同一行公式。</li>' +
'  <li><b>所有权归谁？</b>关节持有两个 body 的裸指针并登记进各自的 constraint map（双向链接，销毁时摘除）；冲量累加器住在关节对象里跨步常驻；island 只是每步沿这些边重组的临时视图，不拥有任何东西。</li>' +
'  <li><b>什么时候发生？</b>setup / pre_solve 每步一次，solve 每步被迭代次数次扫过；限位状态每步重判；断裂发生在某步累加冲量越过阈值的瞬间——从图上删除一条边，island 随之裂变。</li>' +
'</ul>' +
'<p>下一课 A5 的 XPBD 会把这条路走得更彻底：连「力」和「速度」都不要了，直接对位置投影。届时你会看到「约束即数据」贯彻到底是什么样子。</p>'
    }
  ]
}
