// L4.3 · 渲染器架构：RenderingServer 与剔除
export default {
  id: 'L4.3',
  title: '渲染器架构：RenderingServer 与剔除',
  est: '2.5 小时',
  coreQuestions: [
    '场景树是给你编辑的，渲染器为什么不直接遍历它，非要另建一棵「实例表」？（数据怎么流动）',
    'Node 和渲染数据之间靠什么连接？RID 句柄的所有权归谁、什么时候销毁？（所有权归谁）',
    '一帧里剔除发生在哪一步、谁执行？视锥测试和遮挡测试各花多少钱、各赚多少？（什么时候发生）'
  ],
  sections: [
    {
      type: 'text',
      title: '两棵树：逻辑组织 vs 渲染数据',
      html: `<p>你在编辑器里摆的是<b>场景树</b>：Node3D 挂着 MeshInstance3D，父子继承变换，层级用来表达「剑挂在手里」。但 GPU 不认识这棵树——它每帧只吃一个扁平列表：<b>这一帧要画哪些 mesh、用什么材质、矩阵是什么</b>。Godot 在中间立了一堵墙：场景层与渲染层之间唯一的通道是 <b>RenderingServer</b> 这个无头服务（L0.2 解剖图里的 servers/ 层）。你在 scene/ 里改任何属性，节点都不直接画图，而是转手调一次 server API；真正的绘制数据存在 servers/rendering/ 一侧。</p>
<p>这不是 Godot 的怪癖，而是跨引擎通用的<b>双表示架构</b>：Unity 把场景对象背后对应到 ScriptableRenderPipeline 的 DrawCommand 列表，Unreal 有 Scene / Primitive 的二元结构（FScene 持有 FPrimitiveSceneProxy），DirectX 游戏自研引擎则叫 RenderScene + RenderObject。它们共同回答一个问题：<b>「给程序员用的组织方式」和「给 GPU 用的喂入顺序」天然冲突</b>——前者要层级、可编辑、带脚本回调；后者要按材质排序、连续内存、能被 worker 线程并行扫描。两套需求各用一套数据结构，比强行共用一套便宜得多。</p>`
    },
    {
      type: 'text',
      title: 'RID：跨边界的唯一护照',
      html: `<p>既然两棵表示分开，同步就是核心问题。Godot 的答案是一枚轻量的不透明句柄 <b>RID</b>：8 字节整数，指向 RenderingServer 内部的一张记录。场景节点创建时向 server 要一个 RID（scene/3d/visual_instance_3d.cpp 里的 instance_create），之后所有变更都翻译成对 server 的方法调用——set_visible 变成 instance_set_visible，移动变成 instance_set_transform——最后由 free_rid 归还。<b>场景树从不持有渲染数据的指针，只持有编号</b>；反过来，server 侧的记录也不回指 Node，只挂一个 ObjectID 用于发可见性信号（instance_attach_object_instance_id）。</p>
<p>这条边界带来三个设计后果：</p>
<ul>
<li><b>渲染端是表，不是树。</b>Godot 4 的 RendererSceneCull 用三张平铺数组存全部实例：instance_data（标志位+基类型）、instance_aabbs（包围盒）、instance_visibility（可见性状态），外加 scenario 链表串起同一场景的实例。剔除时每帧线性扫表，缓存友好；而场景树的深度优先遍历要跟着指针跳来跳去，还随时可能被脚本回调卡住。</li>
<li><b>命令可以排队。</b>RID 是个值，于是「主线程下命令、渲染线程执行」成为可能：RenderingServerDefault::draw 把整帧工作压进 command_queue.push，再交给渲染线程上的 _draw 执行（rendering_server_default.cpp）。若边界上递的是裸指针，多线程第一天就炸。</li>
<li><b>所有权必须明确。</b>谁 create RID 谁负责 free；场景节点被删（NOTIFICATION_EXIT_TREE）时必须顺手把渲染侧记录清掉，否则表里留下悬空行。这就是「借源码学所有权」的老规矩：<b>句柄跨语言、跨线程、跨帧存活，指针不行</b>。</li>
</ul>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'twotrees',
      title: '实验 A：两棵树同步台——一条指令换一行记录',
      height: 560,
      code: `// 两棵树同步台：左=场景树（你编辑的世界），右=RenderingServer 实例表（GPU 吃的数据）
// N：往 Player 下追加一个 Mesh 子节点 → 右侧立刻多一行 RID 记录
// X：删除最近添加的子节点 → 对应 RID 被回收（注意编号复用）
// V：切换选中节点的 visible → 只传一条 instance_set_visible 命令
// Tab：在 Player / Enemy 两个父节点之间切换选中
// 空格：注入一次卡顿帧 —— 看命令队列积压、渲染线程消费，理解「解耦」的代价与好处

engine.run({
  setup: function (state) {
    state.tree = {
      root: { name: 'WorldRoot', children: [] },
      player: { name: 'Player', children: [], visible: true, added: [] },
      enemy: { name: 'Enemy', children: [], visible: true, added: [] }
    };
    state.tree.root.children.push(state.tree.player);
    state.tree.root.children.push(state.tree.enemy);
    state.sel = 0;              // 0=Player 1=Enemy
    state.ridNext = 101;        // RID 从 101 开始分配
    state.records = [];         // 渲染侧实例表：{ rid, name, vis, flash }
    state.queue = [];           // 待投递的命令：{ txt, op, rid, name }
    state.log = ['就绪：左侧每个可渲染节点，右侧一行记录'];
    state.logT = [2.5];         // 每条日志的高亮剩余秒数
    state.stall = 0;            // 卡顿剩余秒数
    state.consumT = 0;          // 消费节拍计时
    state.frames = 0;
    state.synced = 0;           // 已送达 server 的命令数
    state.pending = 0;          // 尚未消费的命令数
    // 预置两个网格子节点，各自占一条实例记录（必须在上面的初始化之后）
    addMesh(state, 'Sword');
    addMesh(state, 'Shield');
  },

  update: function (state, dt, input) {
    state.frames++;
    if (input.pressed('KeyN')) addMesh(state, 'Box' + (state.meshCount()));
    if (input.pressed('KeyX')) removeLastMesh(state);
    if (input.pressed('Tab')) { state.sel = 1 - state.sel; pushLog(state, '选中 ' + (state.sel === 0 ? 'Player' : 'Enemy')); }
    if (input.pressed('KeyV')) toggleVisible(state);
    if (input.pressed('Space') && state.stall <= 0) { state.stall = 0.6; pushLog(state, '注入卡顿帧：渲染线程停摆 0.6s，命令继续排队'); }

    // 渲染线程「心跳」：不卡顿时每 0.12s 消费一条命令
    if (state.stall > 0) { state.stall -= dt; }
    else if (state.queue.length > 0) {
      state.consumT = (state.consumT || 0) + dt;
      if (state.consumT >= 0.12) {
        state.consumT = 0;
        var cmd = state.queue.shift();
        state.pending--;
        state.synced++;
        applyRecord(state, cmd);
        pushLog(state, 'server 执行：' + cmd.txt);
      }
    }
    for (var i = 0; i < state.records.length; i++) state.records[i].flash = Math.max(0, state.records[i].flash - dt * 2);
    for (i = 0; i < state.logT.length; i++) state.logT[i] = Math.max(0, state.logT[i] - dt);
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('N 增子节点 · X 删 · V 切可见 · Tab 选父 · 空格注入卡顿帧', 12, 20);

    // ---- 左半：场景树 ----
    ctx.fillStyle = '#f472b6'; ctx.fillText('场景树（scene/：逻辑组织）', 16, 46);
    drawTree(state, ctx);

    // ---- 中缝：命令流 ----
    ctx.strokeStyle = '#1e2a3d'; ctx.beginPath(); ctx.moveTo(360, 36); ctx.lineTo(360, 470); ctx.stroke();
    ctx.fillStyle = '#9b8cff'; ctx.fillText('RenderingServer 命令', 372, 46);
    ctx.font = '12px monospace';
    var qy = 64;
    for (var i = 0; i < state.queue.length && i < 6; i++) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('▶ ' + state.queue[i].txt, 372, qy);
      qy += 18;
    }
    if (state.queue.length === 0) { ctx.fillStyle = '#3d5273'; ctx.fillText('(队列为空)', 372, qy); }
    ctx.fillStyle = state.stall > 0 ? '#f87171' : '#34d399';
    ctx.fillText(state.stall > 0 ? '渲染线程：卡顿中…' : '渲染线程：运行中', 372, 200);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('已送达命令: ' + state.synced, 372, 222);
    ctx.fillText('排队中: ' + state.pending, 372, 240);

    // ---- 右半：实例表 ----
    ctx.font = '13px monospace';
    ctx.fillStyle = '#34d399'; ctx.fillText('实例表（servers/rendering/：SoA 平铺）', 520, 46);
    ctx.fillStyle = '#5b7397'; ctx.fillText('RID   名称        可见', 520, 68);
    for (i = 0; i < state.records.length; i++) {
      var r = state.records[i], y = 90 + i * 22;
      if (y > 458) break;
      ctx.fillStyle = r.flash > 0 ? 'rgba(251,191,36,' + (r.flash * 0.8).toFixed(2) + ')' : 'transparent';
      ctx.fillRect(516, y - 14, 196, 20);
      ctx.fillStyle = r.vis ? '#e2e8f0' : '#5b7397';
      ctx.fillText(pad(r.rid, 6) + pad(r.name, 12) + (r.vis ? 'true' : 'false'), 520, y);
    }
    ctx.fillStyle = '#7d93b3'; ctx.fillText('行数 = 可渲染节点数；层级信息根本不在表里', 520, 478);

    // ---- 底部日志 ----
    ctx.fillStyle = '#1e2a3d'; ctx.fillRect(12, 492, 700, 56);
    ctx.fillStyle = '#8fa7c7'; ctx.font = '12px monospace';
    var start = Math.max(0, state.log.length - 3);
    for (i = 0; i < 3 && start + i < state.log.length; i++) {
      ctx.fillStyle = state.logT[start + i] > 0 ? '#fbbf24' : '#5b7397';
      ctx.fillText('> ' + state.log[start + i], 20, 510 + i * 16);
    }
  }
});

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

function pushLog(state, s) {
  state.log.push(s);
  state.logT.push(2.5);
  if (state.log.length > 40) { state.log.shift(); state.logT.shift(); }
}

function addMesh(state, name) {
  var parent = state.sel === 0 ? state.tree.player : state.tree.enemy;
  var node = { name: name, visible: true };
  parent.children.push(node);
  parent.added.push(name);
  var rid = state.ridNext++;
  state.queue.push({ op: 'add', rid: rid, name: name, txt: 'instance_create -> RID ' + rid });
  state.pending++;
  pushLog(state, '场景侧：' + parent.name + ' 下新增 ' + name + '，已向 server 递交命令');
}

function removeLastMesh(state) {
  var parent = state.sel === 0 ? state.tree.player : state.tree.enemy;
  if (parent.added.length === 0) { pushLog(state, parent.name + ' 没有可删的动态子节点'); return; }
  var name = parent.added.pop();
  for (var i = 0; i < parent.children.length; i++) {
    if (parent.children[i].name === name) { parent.children.splice(i, 1); break; }
  }
  var rec = findRec(state, name);
  if (rec) {
    state.queue.push({ op: 'del', rid: rec.rid, name: name, txt: 'free_rid(RID ' + rec.rid + ') 回收' });
    state.pending++;
  }
  pushLog(state, '场景侧：删除 ' + name + '，EXIT_TREE 通知触发 free_rid');
}

function toggleVisible(state) {
  var parent = state.sel === 0 ? state.tree.player : state.tree.enemy;
  parent.visible = !parent.visible;
  state.queue.push({ op: 'vis', rid: -1, name: parent.name, vis: parent.visible, txt: 'instance_set_visible(' + parent.name + ', ' + (parent.visible ? 'true' : 'false') + ')' });
  state.pending++;
  pushLog(state, '场景侧：' + parent.name + '.visible = ' + parent.visible + '（子树一起隐藏）');
}

function findRec(state, name) {
  for (var i = 0; i < state.records.length; i++) if (state.records[i].name === name) return state.records[i];
  return null;
}

function applyRecord(state, cmd) {
  if (cmd.op === 'add') {
    state.records.push({ rid: cmd.rid, name: cmd.name, vis: true, flash: 1 });
  } else if (cmd.op === 'del') {
    for (var i = 0; i < state.records.length; i++) {
      if (state.records[i].rid === cmd.rid) { state.records.splice(i, 1); break; }
    }
  } else {
    var rec = findRec(state, cmd.name);
    if (rec) { rec.vis = cmd.vis; rec.flash = 1; }
  }
}

function drawTree(state, ctx) {
  ctx.font = '13px monospace';
  var y = 68;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('WorldRoot', 24, y); y += 24;
  var parents = [state.tree.player, state.tree.enemy];
  for (var p = 0; p < 2; p++) {
    var node = parents[p];
    var hot = state.sel === p;
    ctx.fillStyle = hot ? '#fbbf24' : '#8fa7c7';
    ctx.fillText((hot ? '[选中] ' : '') + '+-- ' + node.name + (node.visible ? '' : ' (hidden)'), 40, y);
    y += 22;
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i];
      var dim = !node.visible;
      ctx.fillStyle = dim ? '#3d5273' : '#e2e8f0';
      ctx.fillText('|    +-- ' + c.name, 64, y);
      var rec = findRec(state, c.name);
      if (rec) { ctx.fillStyle = '#5b7397'; ctx.fillText('= RID ' + rec.rid, 220, y); }
      y += 20;
    }
    y += 8;
  }
  ctx.fillStyle = '#5b7397'; ctx.font = '12px monospace';
  ctx.fillText('树管「谁是谁的孩子」，', 24, 430);
  ctx.fillText('变换合成沿边走，脚本挂在这。', 24, 448);
}
`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'frustumcull',
      title: '实验 B：视锥剔除可视化——候选、通过、draw call',
      height: 560,
      code: `// 俯视 2D 世界里的相机视锥：扇形 = 近平面到远平面的楔形
// A/D 转向，W/S 前后移动，Q/E 拉近拉远相机（改变视野大小）
// C 循环切换模式：0 无剔除 → 1 视锥剔除 → 2 视锥+遮挡粗判（墙体挡住的不再画）
// R 重置物体布局（固定种子随机，每次一样）
// 统计条：候选 = 场景总数；通过 = 本帧提交绘制的数量；差值即省下的开销

engine.run({
  setup: function (state) {
    state.seed = 1337;
    state.mode = 0;
    state.cam = { x: 360, y: 400, ang: -Math.PI / 2, fov: 1.1, far: 300 };
    buildWorld(state);
    state.msg = ''; state.msgT = 0;
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyC')) {
      state.mode = (state.mode + 1) % 3;
      setMsg(state, ['模式 0：无剔除——所有物体一律提交', '模式 1：视锥剔除——AABB 出锥即丢', '模式 2：视锥 + 遮挡粗判——被墙挡住也丢'][state.mode]);
    }
    if (input.pressed('KeyR')) { buildWorld(state); setMsg(state, '世界已重置（同一种子）'); }
    var sp = 170 * dt;
    if (input.down('KeyA')) state.cam.ang -= 2.2 * dt;
    if (input.down('KeyD')) state.cam.ang += 2.2 * dt;
    if (input.down('KeyW')) { state.cam.x += Math.cos(state.cam.ang) * sp; state.cam.y += Math.sin(state.cam.ang) * sp; }
    if (input.down('KeyS')) { state.cam.x -= Math.cos(state.cam.ang) * sp; state.cam.y -= Math.sin(state.cam.ang) * sp; }
    if (input.down('KeyQ')) state.cam.far = Math.max(120, state.cam.far - 220 * dt);
    if (input.down('KeyE')) state.cam.far = Math.min(620, state.cam.far + 220 * dt);
    clampCam(state);
    runCull(state);
    state.msgT -= dt;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    // 世界网格背景
    ctx.strokeStyle = '#141d2e'; ctx.lineWidth = 1;
    for (var gx = 0; gx < 720; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 36); ctx.lineTo(gx, 470); ctx.stroke(); }
    for (var gy = 40; gy < 470; gy += 40) { ctx.beginPath(); ctx.moveTo(8, gy); ctx.lineTo(712, gy); ctx.stroke(); }

    // 视锥扇形
    var c = state.cam;
    ctx.fillStyle = state.mode === 0 ? 'rgba(90,169,230,0.06)' : 'rgba(90,169,230,0.13)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, c.far, c.ang - c.fov / 2, c.ang + c.fov / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5aa9e6'; ctx.lineWidth = 1.5; ctx.stroke();

    // 物体
    for (var i = 0; i < state.objs.length; i++) {
      var o = state.objs[i];
      var col = o.state === 2 ? '#34d399' : (o.state === 1 ? '#f87171' : '#3d5273');
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      if (o.state === 2) { ctx.strokeStyle = '#34d399'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // 墙
    ctx.fillStyle = '#5b7397';
    for (i = 0; i < state.walls.length; i++) {
      var w = state.walls[i];
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }
    // 相机本体
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(c.ang) * 16, c.y + Math.sin(c.ang) * 16); ctx.stroke();

    // HUD
    ctx.font = '13px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('A/D 转向 · W/S 前进后退 · Q/E 远近 · C 切模式 · R 重置', 12, 20);
    var passed = 0;
    for (i = 0; i < state.objs.length; i++) if (state.objs[i].state === 2) passed++;
    var total = state.objs.length;
    var names = ['无剔除', '视锥剔除', '视锥+遮挡'];
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('模式: ' + names[state.mode], 12, 496);
    ctx.fillText('候选: ' + total + '    通过(提交): ' + passed + '    剔除: ' + (total - passed), 220, 496);
    ctx.fillStyle = '#f472b6';
    ctx.fillText('估计 draw call: ' + (state.mode === 0 ? total : passed) + ' 次/帧', 12, 518);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('绿=通过并提交  红=进过视锥但被挡  灰=连视锥都没进', 220, 518);
    if (state.msgT > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText(state.msg, 12, 540); }
  }
});

function setMsg(state, s) { state.msg = s; state.msgT = 3; }

function rnd(state) {   // 自带 LCG，固定种子，可复现
  state.seed = (state.seed * 1664525 + 1013904223) % 4294967296;
  return state.seed / 4294967296;
}

function buildWorld(state) {
  state.seed = 1337;
  state.objs = [];
  for (var i = 0; i < 42; i++) {
    state.objs.push({ x: 30 + rnd(state) * 660, y: 50 + rnd(state) * 400, r: 5 + rnd(state) * 6, state: 0 });
  }
  state.walls = [
    { x: 250, y: 120, w: 14, h: 150 },
    { x: 430, y: 200, w: 160, h: 14 },
    { x: 120, y: 300, w: 14, h: 130 },
    { x: 520, y: 60, w: 14, h: 120 }
  ];
}

function clampCam(state) {
  var c = state.cam;
  c.x = Math.min(708, Math.max(12, c.x));
  c.y = Math.min(466, Math.max(40, c.y));
}

function inFrustum(state, o) {
  var c = state.cam, dx = o.x - c.x, dy = o.y - c.y;
  var d2 = dx * dx + dy * dy;
  if (d2 > (c.far + o.r) * (c.far + o.r)) return false;
  if (d2 < 400) return true;                 // 贴脸必见
  var ang = Math.atan2(dy, dx) - c.ang;
  while (ang > Math.PI) ang -= Math.PI * 2;
  while (ang < -Math.PI) ang += Math.PI * 2;
  return Math.abs(ang) < c.fov / 2 + Math.atan2(o.r, Math.sqrt(d2));
}

function occludedByWall(state, o) {
  var c = state.cam;
  for (var i = 0; i < state.walls.length; i++) {
    var w = state.walls[i];
    if (segHitsRect(c.x, c.y, o.x, o.y, w)) {
      // 墙要比物体近才算挡住：比较沿线参数即可（俯视近似）
      var tw = rectEnterT(c.x, c.y, o.x - c.x, o.y - c.y, w);
      if (tw >= 0 && tw < 1) {
        var dobj = Math.hypot(o.x - c.x, o.y - c.y);
        var dwall = dobj * tw;
        if (dwall < dobj - o.r * 0.5) return true;
      }
    }
  }
  return false;
}

function rectEnterT(px, py, dx, dy, w) {   // 射线进入矩形的 t（slab 法），不相交返回 -1
  var tmin = 0, tmax = 1;
  var lo = [w.x, w.y], hi = [w.x + w.w, w.y + w.h];
  for (var a = 0; a < 2; a++) {
    var d = a === 0 ? dx : dy, o = a === 0 ? px : py;
    if (Math.abs(d) < 1e-6) { if (o < lo[a] || o > hi[a]) return -1; continue; }
    var t1 = (lo[a] - o) / d, t2 = (hi[a] - o) / d;
    if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

function segHitsRect(x1, y1, x2, y2, w) {
  return rectEnterT(x1, y1, x2 - x1, y2 - y1, w) >= 0;
}

function runCull(state) {
  for (var i = 0; i < state.objs.length; i++) {
    var o = state.objs[i];
    if (state.mode === 0) { o.state = 2; continue; }
    if (!inFrustum(state, o)) { o.state = 0; continue; }
    if (state.mode === 2 && occludedByWall(state, o)) { o.state = 1; continue; }
    o.state = 2;
  }
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
<li>实验 A：连按 N 堆十几条命令，再按空格卡住渲染线程——看队列涨、表不动。这就是「命令队列」存在的意义：主线程永远不等渲染。</li>
<li>实验 A：删掉一个 Box 再新建，观察 RID 编号是否复用。真实引擎里 RID 内部是「索引+版本号」，防的就是「拿着旧编号打到新对象身上」（悬垂句柄）。</li>
<li>实验 B：站在人群边缘按 C 对比三种模式的「通过」数——物体越密、视野越窄，剔除收益越大；反之把相机拉到全场之上张开视角，模式 1 和 0 几乎没差。剔除不是免费午餐，它只在「大部分东西看不见」时才划算。</li>
<li>实验 B：Q 把 far 拉到最短，通过数骤降——远平面裁剪就是 LOD/雾效之外最便宜的「距离剔除」。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'scene/3d/visual_instance_3d.cpp', note: '边界的一侧：VisualInstance3D 构造时 instance_create 领 RID、属性变化转发 RS::instance_set_*、EXIT_TREE 时 free_rid——场景树向 server 说话的全部语法都在这。' },
        { path: 'servers/rendering/rendering_server_default.cpp', note: '帧的编舞：draw() 把 _draw 压进 command_queue 交给渲染线程；_draw 依次跑 scene->update、canvas->update、viewport->draw_viewports——先更新数据、后剔除出图，顺序写死在这里。' },
        { path: 'servers/rendering/renderer_scene_cull.cpp', note: '剔除的心脏：_scene_cull 逐实例扫 SoA 表，第 2936 行那一个 if 就是本课实验 B 的 C++ 原型——LAYER_CHECK && IN_FRUSTUM && VIS_CHECK && !OCCLUSION_CULLED；instance_owner/camera_owner/scenario_owner 三张 RID_Owner 表证明渲染侧根本不是树。' },
        { path: 'servers/rendering/renderer_scene_occlusion_cull.cpp', note: '遮挡那一票怎么投：HZBuffer 维护深度金字塔，update_mips 逐级取四邻最大深度上采样；is_occluded 拿物体 AABB 投影到最合适的 mip 层查一次深度——O(1) 的「大概被挡了」。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回到三个灵魂拷问。<b>数据怎么流动</b>：场景树的一次属性改动 → 一条带 RID 的 server 调用 → 命令队列 → 渲染线程落到实例表的某一行；每帧 _scene_cull 把表扫成「本帧可见列表」交给 draw call。<b>所有权归谁</b>：场景节点拥有 RID（谁 create 谁 free），server 拥有记录内容；ObjectID 回指仅用于发可见性通知，不构成所有权环。<b>什么时候发生</b>：登记在增删节点时（按需），变更在主线程排队，剔除在渲染线程每帧的 render_camera 阶段——且超过阈值会切片到 worker 线程并行。</p>
<p>记住这张对照：<b>树是给「人」看的，表是给「机器」喂的，RID 是两边唯一的握手</b>。下一课 L4.4 后处理，我们顺着 viewport->draw_viewports 往下走，看画面是怎么被一张张贴布组合出来的。</p>`
    }
  ]
}
