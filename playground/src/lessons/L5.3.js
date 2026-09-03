// L5.3 · PhysicsServer：无头服务层与 Jolt
export default {
  id: 'L5.3',
  title: 'PhysicsServer：无头服务层与 Jolt',
  est: '2 小时',
  coreQuestions: [
    '物理为什么被做成一个不认识场景树的 Server？数据在一帧里怎么来回流动？',
    '后端（内置 / Jolt）是在什么时候、被谁创建和替换的？注册表管到哪一步？',
    '接口边界画在哪一层，才能既换得掉后端、又不用改一行场景代码？'
  ],
  sections: [
    {
      type: 'text',
      title: '一帧里的两次握手：sync 与 step',
      html: `<p>L5.1 解决了「谁碰上了」，L5.2 解决了「碰上之后怎么办」。这一课不再往下挖算法，而是把镜头拉高：你写的那套 <b>integrate → collide → resolve</b>，在引擎里被放进了哪一层？</p>
<p>先看 Godot 主循环里物理这一段的确切顺序（main/main.cpp 的 Main::iteration，简化后是这样）：</p>
<pre>for (每个固定的物理子步) {
    PhysicsServer3D::get_singleton()-&gt;sync();          // ① 收：场景树 → 服务器
    PhysicsServer3D::get_singleton()-&gt;flush_queries(); // ② 把排队的查询结果发出去
    OS::get_singleton()-&gt;get_main_loop()-&gt;physics_process(dt);  // ③ 你的 _physics_process
    PhysicsServer3D::get_singleton()-&gt;end_sync();      // ④ 封箱：此后再写入要报错
    PhysicsServer3D::get_singleton()-&gt;step(dt);         // ⑤ 算：真正跑一遍模拟
}</pre>
<p>三个灵魂拷问在这五行里一次答完：</p>
<ul>
  <li><b>数据怎么流动</b>：单向、批量。节点把「我刚改了位置/速度/施加了冲量」写进服务器（①），服务器不立刻响应；等你的脚本跑完（③），才一次性 <b>step</b>（⑤）；算完的结果再回调给节点。</li>
  <li><b>所有权归谁</b>：<b>服务器持有物理状态</b>（速度、接触、休眠标志），节点只是「投影」。RigidBody2D 的 global_position 不是权威，权威的变换在服务器内部的那个 body 上。</li>
  <li><b>什么时候发生</b>：同步只在 sync…end_sync 这段窗口内合法（doing_sync 标志），step 只发生在固定子步末尾，一次一整套。这就是为什么你在 _physics_process 里改 velocity 不会立刻看到物体动——它要等第⑤步。</li>
</ul>
<p>于是第一个结论浮出来：<b>物理被做成 Server，不是为了封装好看，是为了拿到这个「批处理窗口」</b>。只有当调用方与计算方之间隔着一张登记表（RID）和一次同步，服务器才有自由把内部实现换成多线程、换成交叉编译的求解器、或者干脆换成另一家库。</p>`
    },
    {
      type: 'text',
      title: '接口边界画在哪：RID + 纯虚函数 + 注册表',
      html: `<p>servers/physics_3d/physics_server_3d.h 里的 <b>PhysicsServer3D</b> 是一个几乎全是 <code>= 0</code> 的抽象类。它的形状值得逐段看：</p>
<table>
  <tr><th>接口分段</th><th>代表方法</th><th>说明</th></tr>
  <tr><td>Shape API</td><td>box_shape_create / shape_set_data</td><td>几何体也是资源，返回 RID</td></tr>
  <tr><td>Space API</td><td>space_create / space_set_param / space_get_direct_state</td><td>一个「世界」；重力、迭代参数都挂在 space 上</td></tr>
  <tr><td>Body / Area / Joint API</td><td>body_create / body_set_state / joint_make_pin</td><td>按对象类型分组，全靠 RID 指认对象</td></tr>
  <tr><td>生命周期</td><td>init / sync / end_sync / step / flush_queries / finish</td><td>就是上一课那五行的镜像</td></tr>
  <tr><td>统计</td><td>get_process_info(p_info)</td><td>活动体数、睡眠体数、活跃 area 数……后端自己报</td></tr>
</table>
<p>注意两件它<b>没有</b>做的事：不认识 Node，不认识 GDScript。整个头文件里没有一处 include scene/。反向依赖才是允许的：scene/2d/physics/physics_body_2d.cpp 的构造函数写着 <code>CollisionObject2D(PhysicsServer2D::get_singleton()-&gt;body_create(), false)</code>——<b>节点在自己出生时向服务器租一个 RID</b>；World2D 则负责 <code>space_create()</code>。所以所有权链是：Viewport 持有 World2D，World2D 持有一个 space RID，每个物理节点持有一个 body RID，而真正的物理数据结构躺在服务器内部的 owner 表里。</p>
<p>第三块拼图是 <b>PhysicsServer3DManager</b>（servers/physics_3d/physics_server_3d_manager.cpp）。它只做三件事：</p>
<pre>register_server(name, create_callback)   // 模块启动时来自报家门
set_default_server(name, priority)       // 谁兜底
new_server(GLOBAL_GET("physics/3d/physics_engine"))  // 启动时按项目设置造一个</pre>
<p>Jolt 是怎么进来的？modules/jolt_physics/register_types.cpp 里只有寥寥几行：</p>
<pre>PhysicsServer3D *create_jolt_physics_server() {
    bool run_on_separate_thread = GLOBAL_GET("physics/3d/run_on_separate_thread");
    JoltPhysicsServer3D *physics_server = memnew(JoltPhysicsServer3D(run_on_separate_thread));
    return memnew(PhysicsServer3DWrapMT(physics_server, run_on_separate_thread));  // 外面再套一层线程壳
}
initialize_...(): PhysicsServer3DManager::get_singleton()-&gt;register_server("Jolt Physics", callable_mp_static(&amp;create_jolt_physics_server));</pre>
<p>内置后端同理注册为 <code>"GodotPhysics3D"</code>。启动时 Manager 读项目设置挑一个，<b>挑不中就用 set_default_server 设的默认，再没有就退到 PhysicsServer3DDummy</b>（physics_server_3d_dummy.h：所有方法空实现、getter 返回零值，让「关掉物理模块」的导出照样能跑）。这条 fallback 链本身就是接口边界的最好证明：<b>连「没有物理」都能是一种后端</b>。</p>
<p>顺带两个设计细节：① <b>WrapMT 是装饰器</b>——同一个抽象接口的另一份实现，把方法调用塞进 CommandQueueMT 交给物理线程，sync/end_sync 定义了两个线程之间的可见窗口。② <b>2D 与 3D 是两套完全独立的接口</b>（PS2DE / PS3DE 枚举各一份），Jolt 只提供 3D 后端，Godot 4.x 的 2D 至今只有内置实现可选——接口边界不是免费的，画两圈就要付两份钱。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'server-backend',
      title: '实验：同一接口 × 两个后端',
      height: 560,
      code: `// 同一个 PhysicsServer 接口，两套后端性格。
// Tab：切换后端（内置简化版 / 工业版）—— 场景一个字没改
// 点击画布：在鼠标处投放一颗球（走的是 server.add_body，不是直接改数组）
// S：暂停/继续   R：重置场景
// 底部动画是调用链：SceneTree → Space → 抽象接口 → 当前后端；换后端时虚线换向

engine.run({
  setup: function (state) {
    state.seed = 12345;
    state.paused = false;
    state.backendIdx = 0;

    // —— 两个后端：实现同一组方法，行为参数完全不同 ——
    // 两个后端实现同一组方法，只有参数不同 —— 性格就写在这几行里
    state.backends = [ makeBackend('内置简化版', { substeps: 1, iterations: 2, sleepLin: 999, sleepAng: 999, slop: 0.5,  bias: 0.8,  restitution: 0.35, friction: 0.15, grip: 0.12, jitter: 1.0 }),
                       makeBackend('工业版',     { substeps: 3, iterations: 8, sleepLin: 6.0,  sleepAng: 0.35, slop: 0.02, bias: 0.25, restitution: 0.55, friction: 0.5,  grip: 0.62, jitter: 0.15 }) ];
    state.server = null;
    buildScene(state);

    state.chainT = 0;      // 调用链动画的相位
    state.flash = 0;       // 换后端时的闪光
    state.log = [];        // 最近几次接口调用
    state.frames = 0;
  },

  update: function (state, dt, input) {
    if (input.pressed('Tab')) switchBackend(state);
    if (input.pressed('KeyS')) state.paused = !state.paused;
    if (input.pressed('KeyR')) buildScene(state);
    if (input.mouse.clicked && input.mouse.y < SCENE_H && input.mouse.x < engine.W - SIDE_W) {
      var nb = ballAt(state, input.mouse.x, input.mouse.y, rand(state));
      var nrid = state.server.add_body(nb);
      state.nodes.push(makeNode('RigidBody2D#' + nrid, nrid, nb));   // 节点侧只登记 rid，不持有物理状态
      pushLog(state, 'body_create -> RID ' + nrid);
    }
    if (state.flash > 0) state.flash -= dt * 2.2;

    if (!state.paused) {
      state.frames++;
      state.chainT += dt;
      state.server.step(dt);                    // ← 唯一的入口：接口只有一个 step
      state.server.syncTransforms(state.nodes); // 回写：服务器 → 场景节点（投影刷新）
      if (state.frames % 180 === 0) pushLog(state, 'sync -> step(dt) -> end_sync  x' + state.server.statSub);
    }
  },

  draw: function (state, ctx) {
    var B = engine.W - SIDE_W;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);

    // ---- 左：场景 ----
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, B, engine.H); ctx.clip();
    drawScene(state, ctx, B);
    ctx.restore();

    // ---- 右：侧栏统计 ----
    drawSidebar(state, ctx, B);

    // ---- 底：调用链 ----
    drawChain(state, ctx, B);
  }
});

// ================= 常量 =================
var GRAV = 1500;
var MAXSP = 620;   // 速度上限：求解余量太粗时防止能量爆炸（真实引擎里的 velocity clamp）
var FLOOR_Y = 300;
var SCENE_H = 300;
var SIDE_W = 232;

// 斜坡：从 (60,150) 到 (300,272)，法线朝左上
var RAMP = { x1: 60, y1: 150, x2: 300, y2: 272 };
var RAMP_NX = -(RAMP.y2 - RAMP.y1), RAMP_NY = (RAMP.x2 - RAMP.x1);
(function () { var l = Math.sqrt(RAMP_NX * RAMP_NX + RAMP_NY * RAMP_NY); RAMP_NX /= l; RAMP_NY /= l; if (RAMP_NY > 0) { RAMP_NX = -RAMP_NX; RAMP_NY = -RAMP_NY; } })();

// ================= 后端工厂：同一接口，不同性格 =================
function makeBackend(name, cfg) {
  return {
    name: name,
    cfg: cfg,
    bodies: [],
    nextRid: 1,
    seed: 987654321,
    statIter: 0,
    statActive: 0,
    statSleep: 0,
    statSub: 0,

    // 接口：add_body / remove_body / step / get_transform / query ...
    add_body: function (b) { b.rid = this.nextRid++; b.sleepTimer = 0; b.sleeping = false; this.bodies.push(b); return b.rid; },
    remove_body: function (rid) { for (var i = 0; i < this.bodies.length; i++) if (this.bodies[i].rid === rid) { this.bodies.splice(i, 1); return; } },

    step: function (dt) {
      var cfg = this.cfg;
      var subs = cfg.substeps, h = dt / subs, it, s, i;
      this.statSub = subs; this.statIter = 0; this.statActive = 0; this.statSleep = 0;
      for (s = 0; s < subs; s++) {
        // ① 积分
        for (i = 0; i < this.bodies.length; i++) {
          var b = this.bodies[i];
          if (b.static || b.sleeping) continue;
          b.vx *= (1 - cfg.friction * h); b.vy *= (1 - cfg.friction * h);
          b.vy += GRAV * h;
          clampSpeed(b);
          b.x += b.vx * h; b.y += b.vy * h; b.rot += b.av * h;
          b.av = Math.max(-9, Math.min(9, b.av));
          b.noise *= 0.6;   // 残留求解噪声逐子步衰减（迭代越多衰得越干净）
        }
        // ② + ③ 检测与求解：迭代 cfg.iterations 次（堆叠稳定性就靠它）
        for (it = 0; it < cfg.iterations; it++) {
          this.statIter++;
          for (i = 0; i < this.bodies.length; i++) solveOne(this, this.bodies[i]);
          solvePairs(this);   // 体-体接触：同一批迭代里一起收敛，迭代越少塔越软
        }
      }
      // ④ 睡眠判定（内置版阈值 999 = 永不睡；工业版会真的睡着）
      for (i = 0; i < this.bodies.length; i++) {
        var o = this.bodies[i];
        if (o.static) continue;
        if (o.sleeping) { this.statSleep++; continue; }
        this.statActive++;
        var slow = (Math.abs(o.vx) + Math.abs(o.vy) < cfg.sleepLin) && (Math.abs(o.av) < cfg.sleepAng);
        o.sleepTimer = slow ? o.sleepTimer + dt : 0;
        if (cfg.sleepLin < 900 && o.sleepTimer > 0.7) { o.sleeping = true; o.vx = 0; o.vy = 0; o.av = 0; }
      }
    },

    get_transform: function (rid) { for (var i = 0; i < this.bodies.length; i++) if (this.bodies[i].rid === rid) return this.bodies[i]; return null; },

    // 回写：服务器把权威变换「投影」回场景节点（对应 RigidBody2D::_body_state_changed）
    syncTransforms: function (nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var b = this.get_transform(nodes[i].rid);
        if (!b) continue;
        nodes[i].x = b.x; nodes[i].y = b.y; nodes[i].rot = b.rot; nodes[i].sleeping = b.sleeping;
      }
    }
  };
}

function clampSpeed(b) {
  var s2 = b.vx * b.vx + b.vy * b.vy;
  if (s2 > MAXSP * MAXSP) { var k = MAXSP / Math.sqrt(s2); b.vx *= k; b.vy *= k; }
}

// 单个刚体对静态环境（地面 / 斜坡 / 墙 / 天花板）的约束求解
function solveOne(be, b) {
  if (b.static) return;
  var cfg = be.cfg, e = cfg.restitution;
  // 天花板：位置修正过猛时物体可能被弹飞，这里兜住，保证画面里始终看得见
  if (b.y - b.r < 28) { b.y = b.r + 28; if (b.vy < 0) b.vy = -b.vy * 0.2; }
  // 地面
  if (b.y + b.r > FLOOR_Y) {
    var pen = b.y + b.r - FLOOR_Y;
    if (pen > cfg.slop) b.y -= (pen - cfg.slop) * cfg.bias;
    if (b.vy > 0) { b.vy = -b.vy * e * 0.25; if (Math.abs(b.vy) < 12) b.vy = 0; }
    b.vx *= (1 - cfg.friction * 0.5);
    b.av = b.av * 0.7 + b.vx * 0.02;
    // 求解余量太粗 + 迭代太少 = 每帧残留噪声（jitter），内置版明显更吵
    b.noise = be.cfg.jitter * (beRand(be) - 0.5) * 1.4;
  }
  // 左右墙
  var W = engine.W - SIDE_W;
  if (b.x - b.r < 0) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * e; }
  if (b.x + b.r > W) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * e; }
  // 斜坡：点到半平面
  var dx = b.x - RAMP.x1, dy = b.y - RAMP.y1;
  var dist = dx * RAMP_NX + dy * RAMP_NY;            // 负 = 穿进斜面
  var along = dx * (RAMP.x2 - RAMP.x1) + dy * (RAMP.y2 - RAMP.y1);
  var len2 = (RAMP.x2 - RAMP.x1) * (RAMP.x2 - RAMP.x1) + (RAMP.y2 - RAMP.y1) * (RAMP.y2 - RAMP.y1);
  if (along > 0 && along < len2 && dist > -b.r) {
    var pen2 = b.r + dist;                            // 需要沿法线推出的量
    if (pen2 > cfg.slop) { b.x += RAMP_NX * (pen2 - cfg.slop) * cfg.bias; b.y += RAMP_NY * (pen2 - cfg.slop) * cfg.bias; }
    var vn = b.vx * RAMP_NX + b.vy * RAMP_NY;
    if (vn < 0) { b.vx -= (1 + e) * vn * RAMP_NX * 0.18; b.vy -= (1 + e) * vn * RAMP_NY * 0.18; }
    var tx = -RAMP_NY, ty = RAMP_NX, vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * cfg.friction * 0.4 * tx; b.vy -= vt * cfg.friction * 0.4 * ty;
  }
}

// 体-体接触（全部按圆处理：方块只是画成方的）——顺序冲量 + 位置修正
function solvePairs(be) {
  var cfg = be.cfg, bs = be.bodies, n = bs.length;
  for (var a = 0; a < n; a++) {
    for (var b = a + 1; b < n; b++) {
      var A = bs[a], B = bs[b];
      if (A.sleeping && B.sleeping) continue;
      var dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r;
      var d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = rr - d;
      // 位置修正：留 slop 余量，修正系数 bias 越大越硬也越容易抖
      if (pen > cfg.slop) {
        var push = (pen - cfg.slop) * cfg.bias * 0.5;
        if (!A.sleeping) { A.x -= nx * push; A.y -= ny * push; }
        if (!B.sleeping) { B.x += nx * push; B.y += ny * push; }
        A.noise = cfg.jitter * (beRand(be) - 0.5) * 1.6;
        B.noise = cfg.jitter * (beRand(be) - 0.5) * 1.6;
      }
      // 法向相对速度：正在靠近才给冲量
      var rvn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rvn < 0) {
        var j = -(1 + cfg.restitution * 0.15) * rvn * 0.5;
        if (!A.sleeping) { A.vx -= j * nx; A.vy -= j * ny; }
        if (!B.sleeping) { B.vx += j * nx; B.vy += j * ny; }
      }
      // 切向摩擦：塔能站住靠它；内置版摩擦弱 + 迭代少，所以会慢慢滑开、抖
      var tx = -ny, ty = nx;
      var rvt = (B.vx - A.vx) * tx + (B.vy - A.vy) * ty;
      var jt = -rvt * 0.5 * cfg.grip;
      if (!A.sleeping) { A.vx -= jt * tx; A.vy -= jt * ty; }
      if (!B.sleeping) { B.vx += jt * tx; B.vy += jt * ty; }
      if (!A.sleeping) clampSpeed(A);
      if (!B.sleeping) clampSpeed(B);
    }
  }
}

// ================= 场景构建（走接口，不碰后端内部） =================
function buildScene(state) {
  var be = state.backends[state.backendIdx];
  be.bodies.length = 0; be.nextRid = 1;
  state.nodes = [];
  // 一摞方块（3 个）+ 一颗弹球：只通过接口注册，节点侧只留 rid 与投影字段
  var bx = 430, by = FLOOR_Y - 14;
  for (var i = 0; i < 3; i++) {
    var box = { kind: 'box', x: bx, y: by - i * 27, vx: 0, vy: 0, r: 14, av: 0, rot: 0, static: false, hue: 38, noise: 0 };
    var rid = be.add_body(box);
    state.nodes.push(makeNode('RigidBody2D#' + rid, rid, box));
  }
  var ball = ballAt(state, 120, 60, 0.5);
  be.add_body(ball);
  state.nodes.push(makeNode('RigidBody2D#ball', ball.rid, ball));
  state.server = be;
  state.chainT = 0;
}

// 「场景节点」= 服务器状态的投影，画布只读它，绝不直接读 bodies[]
function makeNode(name, rid, b) {
  return { name: name, rid: rid, x: b.x, y: b.y, rot: b.rot, sleeping: false, kind: b.kind, r: b.r, hue: b.hue };
}

function ballAt(state, x, y, rnd) {
  return { kind: 'ball', x: x, y: y, vx: (rnd - 0.5) * 90, vy: 20, r: 11, av: 0, rot: 0, static: false, hue: 205, noise: 0 };
}

// 自带种子的随机数（不用 Math.random）：state 一份、每个后端各一份，保证可复现
function lcg(s) { return (s * 1103515245 + 12345) % 2147483648; }
function rand(state) { state.seed = lcg(state.seed); return (state.seed >>> 8) / 8388608; }
function beRand(be) { be.seed = lcg(be.seed); return (be.seed >>> 8) / 8388608; }

function switchBackend(state) {
  // 关键演示：换后端 = 换一个实现了同一接口的对象，并重建同样的场景
  var snapshot = collectSnapshot(state);                 // 先读旧后端的权威状态
  var oldName = state.server.name;
  state.backendIdx = (state.backendIdx + 1) % 2;
  buildScene(state);                                     // 新后端：同一份初始场景，另一套参数
  pushLog(state, 'Manager.new_server("' + state.server.name + '")');
  var note = '上一后端 ' + oldName + ' 留下的姿态: ' + snapshot;
  state.prevNote = note.length > 58 ? note.slice(0, 58) + '...' : note;
  state.flash = 1;
}

function collectSnapshot(state) {
  var out = [];
  for (var i = 0; i < state.nodes.length; i++) {
    var t = state.server.get_transform(state.nodes[i].rid);
    if (t) out.push(Math.round(t.x) + ',' + Math.round(t.y));
  }
  return out.join(' | ');
}

function pushLog(state, s) {
  state.log.unshift(s);
  if (state.log.length > 4) state.log.pop();
}

// ================= 绘制 =================
function drawScene(state, ctx, W) {
  var be = state.server;
  // 地面
  ctx.fillStyle = '#131c2b'; ctx.fillRect(0, FLOOR_Y, W, engine.H - FLOOR_Y);
  ctx.strokeStyle = '#2f4468'; ctx.beginPath(); ctx.moveTo(0, FLOOR_Y); ctx.lineTo(W, FLOOR_Y); ctx.stroke();
  // 斜坡
  ctx.strokeStyle = '#4a5f80'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(RAMP.x1, RAMP.y1); ctx.lineTo(RAMP.x2, RAMP.y2); ctx.stroke(); ctx.lineWidth = 1;
  // 后端名条
  ctx.fillStyle = 'rgba(245,158,11,0.12)'; ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = '#f59e0b'; ctx.font = '13px monospace';
  ctx.fillText('后端: ' + be.name + '   (substeps=' + be.cfg.substeps + ', iterations=' + be.cfg.iterations + ')', 10, 17);

  // 注意：这里读的是「节点投影」，不是后端内部数组——这就是 servers/ 层的意义
  for (var i = 0; i < state.nodes.length; i++) {
    var b = state.nodes[i];
    var src = be.get_transform(b.rid);
    var jx = src ? src.noise * be.cfg.jitter * 3 : 0;
    ctx.save();
    ctx.translate(b.x + jx, b.y);
    ctx.rotate(b.rot);
    if (b.kind === 'box') {
      ctx.fillStyle = b.sleeping ? '#3b4a63' : 'hsl(' + b.hue + ',62%,52%)';
      ctx.fillRect(-b.r, -b.r, b.r * 2, b.r * 2);
      ctx.strokeStyle = '#0b0f17'; ctx.strokeRect(-b.r, -b.r, b.r * 2, b.r * 2);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.sleeping ? '#33445f' : 'hsl(' + b.hue + ',68%,55%)'; ctx.fill();
      ctx.strokeStyle = '#0b0f17'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b.r, 0); ctx.strokeStyle = 'rgba(11,15,23,0.6)'; ctx.stroke();
    }
    ctx.restore();
    if (b.sleeping) { ctx.fillStyle = '#8fa7c7'; ctx.font = '11px monospace'; ctx.fillText('z', b.x + b.r + 2, b.y - b.r); }
  }
  ctx.fillStyle = '#5b7397'; ctx.font = '12px monospace';
  ctx.fillText('点击投放球 · Tab 换后端 · S 暂停 · R 重置', 10, FLOOR_Y + 22);
}

function drawSidebar(state, ctx, W) {
  var x = W + 12, y = 20, be = state.server;
  ctx.fillStyle = '#9db4d0'; ctx.font = '13px monospace';
  ctx.fillText('— 每帧统计 —', x, y); y += 24;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('子步 substeps : ' + be.statSub, x, y); y += 20;
  ctx.fillText('求解迭代次数 : ' + be.statIter, x, y); y += 20;
  ctx.fillText('活动体 active : ' + be.statActive, x, y); y += 20;
  ctx.fillStyle = '#7d93b3';
  ctx.fillText('睡眠体 sleeping: ' + be.statSleep, x, y); y += 20;
  ctx.fillText('速度阈值     : ' + (be.cfg.sleepLin > 900 ? '∞(不睡)' : be.cfg.sleepLin + ' px/s'), x, y); y += 20;
  ctx.fillText('穿透余量 slop : ' + be.cfg.slop, x, y); y += 26;

  ctx.fillStyle = '#9b8cff'; ctx.fillText('最近的接口调用', x, y); y += 18;
  ctx.fillStyle = '#7d93b3';
  for (var i = 0; i < state.log.length; i++) { ctx.fillText(state.log[i], x, y); y += 16; }
  y += 8;
  ctx.fillStyle = '#5b7397';
  ctx.fillText('提示：工业版会睡着，', x, y); y += 15;
  ctx.fillText('内置版永远醒着烧 CPU。', x, y);
}

function drawChain(state, ctx, W) {
  var y0 = SCENE_H + 46, h = 30;
  ctx.fillStyle = '#0d1420'; ctx.fillRect(0, SCENE_H + 30, W, engine.H - SCENE_H - 30);
  ctx.fillStyle = '#8fa7c7'; ctx.font = '12px monospace';
  ctx.fillText('调用链（当前帧第 ' + state.frames + ' 帧）', 10, SCENE_H + 44);

  var boxes = [
    { t: 'SceneTree / World2D', x: 10 },
    { t: 'Space (RID)', x: 150 },
    { t: 'PhysicsServer 接口', x: 292 },
    { t: state.server.name, x: 452 }
  ];
  var phase = (state.chainT * 1.1) % 4;
  for (var i = 0; i < boxes.length; i++) {
    var b = boxes[i], w = i === 3 ? W - b.x - 12 : 128;
    var hot = Math.floor(phase) === i;
    ctx.fillStyle = i === 2 ? '#1b2740' : '#16233a';
    ctx.fillRect(b.x, y0, w, h);
    ctx.strokeStyle = hot ? '#fbbf24' : (i === 2 ? '#9b8cff' : '#3a4f70');
    ctx.lineWidth = hot ? 2.2 : 1.2;
    ctx.strokeRect(b.x, y0, w, h); ctx.lineWidth = 1;
    ctx.fillStyle = i === 2 ? '#c3b5ff' : '#dbe4ef';
    ctx.fillText(b.t, b.x + 8, y0 + 19);
    if (i < boxes.length - 1) {
      var nx = boxes[i + 1].x;
      var dashed = (i === 2);   // 接口 → 后端：虚线，指向当前实现
      ctx.strokeStyle = dashed ? (state.flash > 0 ? '#f59e0b' : '#5aa9e6') : '#3a4f70';
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(b.x + w + 2, y0 + h / 2); ctx.lineTo(nx - 6, y0 + h / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(nx - 6, y0 + h / 2); ctx.lineTo(nx - 13, y0 + h / 2 - 4); ctx.lineTo(nx - 13, y0 + h / 2 + 4);
      ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('实线 = 固定调用 · 虚线 = 运行时绑定的后端实现（Tab 换向后虚线换向）', 10, y0 + h + 22);
  if (state.prevNote) {                                  // 上一个后端留下的最终姿态
    ctx.fillStyle = '#7d93b3';
    ctx.fillText(state.prevNote, 10, y0 + h + 40);
  }
  if (state.flash > 0) {
    ctx.fillStyle = 'rgba(245,158,11,' + (state.flash * 0.8).toFixed(2) + ')';
    ctx.fillRect(boxes[3].x, y0, W - boxes[3].x - 12, h);
  }
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>连续按 <b>Tab</b> 来回切后端，盯住右下角那条<b>虚线</b>：它换向了，但 SceneTree → Space → 接口这三段实线一个字没变。<b>接口边界画在哪，后端就能换到哪</b>——这正是 Jolt 进入 Godot 的方式。</li>
  <li>先在「内置简化版」下点几下鼠标堆一堆球，等它们停下，再按 Tab：新后端会重建同样的初始场景（就像重启进程换了物理引擎），你会发现旧场景的<b>最终姿态</b>完全不同——内置版抖动、永远醒着；工业版安静、会打 z。这不是「谁更准」，而是两套不同的工程取舍。</li>
  <li>看侧栏「求解迭代次数」：内置版 1 子步 × 2 迭代 = 2，工业版 3 × 8 = 24。<b>多出来的十倍 CPU 买到了什么？</b>买到了方块摞起来不塌、不抖。这跟 L5.2 里你把修正系数从 0.8 改成 1.0 看到的抖动是同一件事的两面：位置修正越硬，越需要更多迭代去消化冲突。</li>
  <li>留意「睡眠体」：内置版阈值写成 999（永不睡），所以哪怕场上物体全停，active 计数也不降——这就是很多自研引擎静悄悄地浪费掉的那部分预算。Jolt 侧对应 physics/jolt_physics_3d/simulation/sleep_velocity_threshold（默认 0.03 m/s）与 sleep_time_threshold（0.5 s）。</li>
  <li>想更进一步：把 makeBackend 里某个字段（比如 substeps）改成两边一样，你会看到那两个后端的<b>行为差异随之缩小</b>。所谓「物理引擎的性格」，拆开就是一串可枚举的参数——这也解释了为什么 Godot 能把它们全部暴露成项目设置。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'servers/physics_3d/physics_server_3d.h', note: '接口本体：几乎全是 = 0 的纯虚函数，按 Shape / Space / Area / Body / Joint 分段，最后 init / sync / end_sync / step / flush_queries / finish 六个生命周期方法与 get_process_info 统计口。通读一遍只需回答：它有没有任何一处提到 Node？' },
        { path: 'servers/physics_3d/physics_server_3d_manager.cpp', note: '后端注册表与选择逻辑：register_server / set_default_server / new_server，以及 initialize_server 里「项目设置 → 默认后端 → Dummy」三级 fallback。setting_property_name 就是 physics/3d/physics_engine。' },
        { path: 'modules/jolt_physics/register_types.cpp', note: 'Jolt 的全部入场券：一个 create_jolt_physics_server 工厂 + 一行 register_server(JOLT_PHYSICS_NAME, ...)（该常量在 physics_server_3d_manager.h 里定义为 "Jolt Physics"）。注意返回值外面还套了一层 PhysicsServer3DWrapMT——后端与线程模型是正交的两件事。' },
        { path: 'modules/jolt_physics/spaces/jolt_space_3d.cpp', note: '接口另一侧的真实世界：step() 里调 physics_system-&gt;Update(p_step, 1, temp_allocator, job_system)，_pre_step/_post_step 负责把 Godot 的对象包装进 Jolt 的 BodyID 体系；mNumVelocitySteps / mNumPositionSteps 从 JoltProjectSettings 读入。沙盒里的 substeps × iterations 就是这里的映射。' },
        { path: 'servers/physics_3d/physics_server_3d_dummy.h', note: '「没有物理」也实现同一接口：所有 setter 空转、getter 返回零值。看完这份你就明白为什么接口边界必须严格到「连空实现都能满足」。' },
        { path: 'main/main.cpp', note: '搜 PhysicsServer3D::get_singleton()-&gt;step 附近约 50 行：sync → flush_queries → physics_process → end_sync → step 的确切顺序，以及 advance.physics_steps 那个固定子步循环。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回到三个拷问，用这一课的答案收口：</p>
<ul>
  <li><b>数据怎么流动</b>：一帧内两次握手。节点在 sync 窗口内把意图批量写入服务器，服务器 step 完之后通过 body_set_state_sync_callback 之类的回调把权威变换写回节点（RigidBody2D::_body_state_changed 就是这个回调）。中间隔着 RID，不隔着指针。</li>
  <li><b>所有权归谁</b>：物理状态的权威在服务器内部的 RID owner 表里；World2D 拥有一个 space，每个节点租一个 body RID 并在析构时 free_rid。节点是投影，不是真相。</li>
  <li><b>什么时候发生</b>：后端选择在<b>启动时</b>由 Manager 依项目设置做一次（改了这个设置要重启，源码里 set_restart_if_changed 明写着）；同步与 step 发生在<b>每个固定物理子步</b>；查询的派发发生在 flush_queries。</li>
</ul>
<p>而「物理为什么要做成 Server」这个问题，答案不在物理里：<b>Server 层买到的是「实现的可替换性 + 批处理窗口 + 跨线程边界」</b>。代价同样真实——多一层间接、多一份 2D/3D 双份接口、以及 sync/end_sync 这套容易踩错的时序契约（在主线程外读 direct state 会报错，就是它在把关）。下一站 P6 我们去看资源系统，那里有另一种「无头服务」的味道：导入管线。</p>`
    }
  ]
}
