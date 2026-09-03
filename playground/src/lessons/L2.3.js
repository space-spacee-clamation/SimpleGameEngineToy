// L2.3 · 引擎内存管理：引用计数、Arena 与 COW
export default {
  id: 'L2.3',
  title: '引擎内存管理：引用计数、Arena 与 COW',
  est: '2 小时',
  coreQuestions: [
    '教科书里最省心的 malloc/free，为什么游戏引擎反而要绕开它？时间、所有权、缓存三笔账里哪笔最致命？',
    '引用计数把「什么时候销毁」变成「计数归零那一行」——这行代码取决于谁？循环引用为什么永远归不了零？',
    'Arena 把回收攒成「一次重置」，买到了什么、又卖掉了什么？为什么对象的生命周期必须与批次对齐？',
    'COW 的零成本拷贝真的免费吗？不付的账挂到哪个时刻？它和引用计数是并列关系还是叠加关系？'
  ],
  sections: [
    {
      type: 'text',
      title: '引擎为什么慎用通用堆：三笔账',
      html: `<p>先看一个日常：一帧 60Hz 的动作游戏里，寻路的临时节点、每帧重建的剔除列表、死亡复活的粒子——短命对象以百计。如果这些都随手走通用堆的 <b>malloc / free</b>，你会陆续偿还三笔账。</p>
<p><b>第一笔：什么时候分配、什么时候释放，不可控。</b>malloc 的耗时取决于堆当下的状态——空闲链碎成什么样、要扫描多少候选块，今天 O(1) 不代表明天 O(1)；多线程下它还涉及锁与排队。最坏情况全部落在你的游戏循环里，偶发的「莫名一卡」往往就是它。<b>对帧率而言，不可预测比慢更致命</b>：慢可以优化常数，抖没有谱。</p>
<p><b>第二笔：裸指针不携带所有权信息。</b>malloc 给你一块 n 字节的内存，类型系统里看不出「谁负责释放、何时该释放」。忘还是泄漏，早还是悬空，重还是崩溃——这不是编码习惯问题，是<b>信息问题</b>：通用堆的分配压根不记录归属，所有权只存在于开发者脑子里和口头约定中。</p>
<p><b>第三笔：数据流动四散。</b>通用堆服务整个进程，你的粒子在地址空间的邻居多半是毫不相干的贴图与音频缓冲。每帧遍历绘制时缓存 miss 一片——内存带宽再快，也扛不住把局部性丢在分配那一刻。</p>
<p>所以引擎在通用堆之上叠自己的策略：<b>用引用计数管「何时释放」，用池与 Arena 管「归属与批量回收」，用写时复制把「要不要拷贝」推迟到最后时刻</b>。「借源码学设计」的关键就在这张对比表——注意每一行问的恰好是我们的三个灵魂拷问：什么时候发生、所有权归谁、数据怎么流动（碎片与局部性）。</p>
<table>
  <tr><th>策略</th><th>分配何时发生</th><th>回收何时发生</th><th>所有权归谁</th><th>最坑的一幕</th></tr>
  <tr><td>通用堆 malloc</td><td>任意时刻</td><td>任意时刻</td><td>裸指针，没人认领</td><td>一帧里一次 malloc 抖 2ms；碎片积累到失控</td></tr>
  <tr><td>引用计数 Ref</td><td>对象构造时</td><td>计数归零那一行，精确到语句</td><td>所有持有者各占一份</td><td>循环引用永不归零；多线程原子加减争用</td></tr>
  <tr><td>池 / Arena</td><td>批次内 bump 指针，几条指令</td><td>批次边界（帧末 / 关卡末）整片重置</td><td>批次或池本身，对象不单独还</td><td>单对象提前 free 没意义；跨批次引用 = 悬空</td></tr>
  <tr><td>写时复制 COW</td><td>推迟到首次真写</td><td>数据块头引用归零时</td><td>句柄共享块计数，写入瞬间写者独占</td><td>循环里「顺手」写一次，全量 memcpy 被悄悄付了 n 遍</td></tr>
</table>`
    },
    {
      type: 'text',
      title: '三种解药的「何时 / 谁 / 账」',
      html: `<p><b>引用计数：把所有权交给「所有持有者」。</b>Godot 的 <code>RefCounted</code> 只有三个核心方法——<code>reference</code> +1、<code>unreference</code> -1、<code>init_ref</code> 管首次引用；而 <code>Ref</code> 智能指针把每一次赋值和析构自动接到这套计数上。好处：回收「当刻发生」，不需要等垃圾回收停下来清场。代价呢？「何时销毁」变成由<b>代码细节</b>决定：多一个临时 <code>Ref</code>、多一条提前 return，销毁就换到另一行另一个时刻；更糟的是连锁销毁——归零触发析构、析构又让它持有的成员归零、成员再连锁……一条语句可能顺手毁掉一整棵对象树，这种「恰好死在这一帧」的尖刺，和 malloc 抖动是同一种病。两个经典坑：<b>循环引用</b>（A 引用 B、B 引用 A，计数永不归零）和<b>线程争用</b>（每次拷贝都是一次原子加减，多线程热路径上不便宜）。Godot 的对策不是给引用计数配一个 GC，而是<b>从架构上避免成环</b>：节点回指父亲用裸 <code>ObjectID</code>，<code>Resource</code>"被场景树持有"的方向保持单向；Debug 构建再兜底——<code>RefCounted</code> 在调试模式里登记全部活动实例，退出时把没归零的报告出来。</p>
<p><b>Arena / 池：把回收攒成批量。</b>先预开大块，分配 = 指针前移加对齐（几条指令，无锁、不搜索、不碎片），释放 = 整块清零或把页交还。买到的：分配回收都快到可以忽略，一块 Arena 里的数据天然相邻（缓存友好，顺手还了第三笔账）。卖掉的：<b>对象没有"自己的"回收时刻，只有批次边界</b>——生命周期若不齐，早死的对象会留下永久空洞，而 Arena 恰恰不做单个 free；最危险的是引用跨出批次活下来，成了悬垂（所以帧临时 Arena 里的指针禁止存进持久结构）。池化（ObjectPool / 固定块 freelist）是温和妥协：同一类型、可预测增删，回收进 freelist 等下家复用——代价是块大小固定，长寿命对象占着池位就是赖着不走，且 freelist 本身也是共享原子状态。Godot 的 <code>PagedAllocator</code> 就是后者。</p>
<p><b>COW：把拷贝的账挂到「首次真实写入」。</b>Godot 的 <code>Vector</code>、<code>String</code>，数据其实躺在一个引用计数的共享块后面，<code>CowData</code> 的块头里就写着 refcount / capacity / size。拷贝 = 句柄 + 计数 +1，零内存搬运——传参、存历史、发命令，只要没人写，拷贝就是免费的。坑有两条：一是<b>隐形的 O(n)</b>——写那一瞬间才分裂（fork）+ 逐元素 memcpy，谁也没想到「一个赋值而已」在最坏情况背了一整趟拷贝；二是<b>读路径也可能有锁/原子</b>，跨线程按值传递大 Vector 看似免费，写入时刻却随机弹在某个线程头上。还要留意：COW 的「何时回收」本身又是引用计数（块头那个计数）——所以它和引用计数不是并列而是<b>叠加</b>，循环引用坑换到"块"这个尺度上同样存在。把三个策略摆在一起看，答案很清楚：没有哪种所有权模型消灭了问题，只是选择<b>由谁、在什么时候付账</b>。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'memsandbox',
      title: '实验：内存策略沙盘——一块堆的三种命运',
      height: 520,
      code: `// 内存策略沙盘：同一块「堆」（40 格），三种所有权与回收时机
// Q 引用计数：N 新建  B 转借引用  X 拆循环边/放手一份  R 主人全部放手  L 造循环泄漏
// A Arena    ：空格 分配（bump 滑动）  F 释放单个（仅墓碑）  G 整块重置（批次边界）
// C COW      ：空格 拷贝选中句柄（共享）  E 写入选中（独占原地 / 共享 fork）  D 丢句柄(离开作用域→计数归零白闪)  ← →/点击 换选中
// 顶部 Q/A/C 点页签或按键切换；Backspace 重置当前模式（初始世界每次都相同，随机可复现）
// 顶栏与中栏三行账：分配次数（何时发生） / 回收方式（归谁） / 拷贝与空洞（账挂在哪）

var CELLS = 40;                       // 堆一共 40 格
var HX = 12, CW = 17, HY = 44, CH = 76;
var OWNERS = ['A', 'B', 'C'];
var OWN_Y = 212, OWN_W = 140, OWN_H = 44;   // 引用计数模式：三个主人
var HND_Y = 212, HND_W = 104, HND_H = 44;   // COW 模式：句柄行
var TABX = 438, TABW = 30;
var PAL = ['#4d8fd6', '#34d399', '#f59e0b', '#f472b6', '#9b8cff', '#22d3ee', '#f97316', '#a3e635'];

engine.run({
  setup: function (state) {
    state.mode = 'q';
    state.seed = 20260902;            // xorshift 种子：所有随机可复现（不用 Math.random）
    state.sel = 0; state.fx = [];
    state.msg = ''; state.msgT = 9;
    resetWorlds(state);
    switchMsg(state);
  },

  update: function (state, dt, input) {
    var i;
    state.msgT -= dt;
    for (i = state.fx.length - 1; i >= 0; i--) {          // 白闪衰减
      state.fx[i].t -= dt * 2.5;
      if (state.fx[i].t <= 0) state.fx.splice(i, 1);
    }
    for (i = 0; i < state.c.blocks.length; i++) state.c.blocks[i].fresh = Math.max(0, state.c.blocks[i].fresh - dt);
    for (i = 0; i < state.c.handles.length; i++) state.c.handles[i].fresh = Math.max(0, state.c.handles[i].fresh - dt);

    if (input.pressed('KeyQ')) { state.mode = 'q'; state.sel = 0; switchMsg(state); }
    if (input.pressed('KeyA')) { state.mode = 'a'; state.sel = 0; switchMsg(state); }
    if (input.pressed('KeyC')) { state.mode = 'c'; state.sel = 0; switchMsg(state); }
    if (input.pressed('Backspace')) { resetWorlds(state); switchMsg(state); }
    if (input.mouse.clicked && input.mouse.y <= 30 && input.mouse.x >= TABX - 2 && input.mouse.x <= TABX + 3 * TABW) {
      var ti = Math.floor((input.mouse.x - TABX) / TABW);
      if (ti >= 0 && ti <= 2) { state.mode = 'qac'[ti]; state.sel = 0; switchMsg(state); }
    }
    if (state.mode === 'q') { qInput(state, input); qSweep(state); }
    else if (state.mode === 'a') aInput(state, input);
    else cInput(state, input);
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    drawTabs(state, ctx);
    drawStats(state, ctx);
    heapBase(state, ctx);
    if (state.mode === 'q') { drawQLines(state, ctx); drawQBlocks(state, ctx); drawQOwners(state, ctx); }
    else if (state.mode === 'a') drawAHeap(state, ctx);
    else { drawCLines(state, ctx); drawCBlocks(state, ctx); drawCHandles(state, ctx); }
    drawFx(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------------- 公共 ----------------
function rnd(state) {                       // xorshift32：与页面刷新无关的确定性随机
  var x = state.seed;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x | 0;
  return (x >>> 0) / 4294967296;
}
function irnd(state, n) { return Math.floor(rnd(state) * n); }
function setMsg(state, s) { state.msg = s; state.msgT = 5; }
function switchMsg(state) {
  if (state.mode === 'q') setMsg(state, '引用计数：回收发生在最后一条引用断掉那一行——归零当刻，白闪可见');
  else if (state.mode === 'a') setMsg(state, 'Arena：分配是 bump 指针滑动；回收攒到批次边界（G）或堆满时，一次清零');
  else setMsg(state, 'COW：拷贝零成本（只加句柄）；账挂到【首次真实写入】——E 一下看分配与拷贝跳变');
}
function resetWorlds(state) {
  state.fx = [];
  resetQ(state); resetA(state); resetC(state);
  state.sel = 0;
}
function firstFit(items, len) {             // 在一堆 [start,len] 里找连续 len 格（首次适配）
  var occ = [], i, j, ok;
  for (i = 0; i < items.length; i++) for (j = 0; j < items[i].len; j++) occ[items[i].start + j] = true;
  for (i = 0; i + len <= CELLS; i++) {
    ok = true;
    for (j = 0; j < len; j++) if (occ[i + j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}
function ownBoxX(i) { return 26 + i * 186; }
function hndX(i) { return 20 + i * 113; }
function cxOf(it) { return HX + (it.start + it.len / 2) * CW; }

function drawTabs(state, ctx) {
  var tags = ['Q', 'A', 'C'], i;
  for (i = 0; i < 3; i++) {
    var x = TABX + i * TABW, on = (state.mode === tags[i].toLowerCase());
    ctx.fillStyle = on ? '#2d3f5e' : '#0e1626'; ctx.fillRect(x, 6, 24, 22);
    ctx.strokeStyle = on ? '#9b8cff' : '#3d5273'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(x, 6, 24, 22);
    ctx.fillStyle = on ? '#e2e8f0' : '#5b7397'; ctx.font = '12px monospace';
    ctx.fillText(tags[i], x + 8, 21);
  }
  ctx.fillStyle = '#3d5273'; ctx.font = '10px monospace';
  ctx.fillText('模式', TABX + 3 * TABW + 6, 21);
  ctx.font = '12px monospace';
}
function drawStats(state, ctx) {
  var i, s = '', q = state.q, leaks = 0;
  if (state.mode === 'q') {
    for (i = 0; i < q.items.length; i++) if (qOwnerCount(q.edges, q.items[i].id) === 0 && qCountOf(q.edges, q.items[i].id) > 0) leaks++;
    s = '引用计数 | 分配 ' + q.alloc + ' · 即时 free ' + q.freed + ' · 在堆 ' + q.items.length + ' · 循环泄漏(红虚线) ' + leaks;
  } else if (state.mode === 'a') {
    var dead = 0;
    for (i = 0; i < state.a.blocks.length; i++) if (state.a.blocks[i].dead) dead++;
    s = 'Arena | 分配 ' + state.a.alloc + ' (bump=' + state.a.bump + '/40) · 墓碑 ' + dead + ' · 整块重置 ' + state.a.resets + ' 次';
  } else {
    s = 'COW | 真分配 ' + state.c.allocs + ' 块 · 共享拷贝 ' + state.c.shares + ' 次 · 写时拷贝 ' + state.c.copies + ' 格 · 归零回收 ' + state.c.freed + ' 块';
  }
  ctx.fillStyle = '#8fa7c7'; ctx.font = '12px monospace';
  ctx.fillText(s, 12, 22);
}
function heapBase(state, ctx) {
  ctx.fillStyle = '#0d1526'; ctx.fillRect(HX, HY, CELLS * CW, CH);
  ctx.strokeStyle = '#16223a'; ctx.lineWidth = 1;
  for (var i = 0; i <= CELLS; i++) {
    ctx.beginPath(); ctx.moveTo(HX + i * CW, HY); ctx.lineTo(HX + i * CW, HY + CH); ctx.stroke();
  }
  ctx.strokeStyle = '#2f4468'; ctx.strokeRect(HX, HY, CELLS * CW, CH);
}
function drawFx(state, ctx) {                      // 白闪 = 「当刻回收」发生的那块地皮
  for (var i = 0; i < state.fx.length; i++) {
    var f = state.fx[i];
    ctx.fillStyle = 'rgba(255,255,255,' + (f.t * 0.75).toFixed(2) + ')';
    ctx.fillRect(HX + f.start * CW + 1, HY + 4, f.len * CW - 2, CH - 8);
  }
}
function drawHud(state, ctx) {
  var mode = state.mode, a = state.a, c = state.c, q = state.q;
  var r1 = '', r2 = '', cnt = '';
  if (mode === 'q') {
    var leaks = 0, i;
    for (i = 0; i < q.items.length; i++) if (qOwnerCount(q.edges, q.items[i].id) === 0) leaks++;
    r1 = '回收时机：最后一条引用断掉那一行（B 转借=多一个主人；X 先拆环边，否则放一份主人引用）';
    r2 = '两个坑：循环引用永不归零（红虚线）· 每份引用都是原子加减——Godot 见 ref_counted.h：reference/unreference';
    cnt = '分配 ' + q.alloc + ' 次 · 归零当刻 free ' + q.freed + ' 次 · 在堆 ' + q.items.length + ' 块（无主循环 ' + leaks + '）· 点主人框可看它的引用';
  } else if (mode === 'a') {
    r1 = '分配：bump 指针只进不退（无搜索、无锁、零碎片）；回收：批次边界一次清零，成本与对象数无关';
    r2 = '坑：F 释放单个只是墓碑，空间回不来也不能复用；引用活过重置的那一刻 = 悬空';
    cnt = '分配 ' + a.alloc + ' · 墓碑 ' + a.singles + ' · 整块重置 ' + a.resets + ' 次 · 已占 ' + a.bump + '/40 格';
  } else {
    r1 = '拷贝只给块头 +1（0 分配 0 拷贝）；首次写入才 fork：1 次分配 + 整块 memcpy——账从【写】这一刻结';
    r2 = '老块被最后一个写入者 fork 走时计数归零、当刻回收：COW 的【何时】仍是引用计数，它是叠加不是并列';
    cnt = '真分配 ' + c.allocs + ' · 共享 ' + c.shares + ' 次 · 累计拷贝 ' + c.copies + ' 格 · 归零回收 ' + c.freed + ' 块';
  }
  ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
  ctx.fillText(r1, 12, 224);
  ctx.fillStyle = '#5b7397';
  ctx.fillText(r2, 12, 246);
  ctx.fillStyle = '#a5b4c8'; ctx.font = '12px monospace';
  ctx.fillText(cnt, 12, 266);
  ctx.fillStyle = state.msgT > 0 ? '#fbbf24' : '#3d5273';
  ctx.fillText(state.msg, 12, 300);
  var keys = mode === 'q'
    ? '键位：N 新建 · B 转借 · X 拆环/放手 · L 造循环 · R 主人全放手'
    : mode === 'a' ? '键位：空格 分配 · F 标记释放（墓碑） · G 整块重置' : '键位：空格 拷贝 · E 写入 · D 丢句柄 · ← →/点击 换选中';
  ctx.fillStyle = '#c3d0de';
  ctx.fillText(keys + ' · Q/A/C 切换 · Backspace 重置', 12, 402);
  ctx.fillStyle = '#4a5f80'; ctx.font = '11px monospace';
  ctx.fillText('同一块堆上比较三种所有权模型：计数管【何时】、Arena 管【归属】、COW 把账挂到【写】——三行账就在中栏', 12, 422);
}

// ---------------- 模式 Q：引用计数 ----------------
function resetQ(state) {
  state.q = { items: [], edges: [], nextItem: 1, nextOwner: 0, alloc: 0, freed: 0 };
  qAdd(state); qAdd(state); qAdd(state);      // 三个初始对象，主人 A B C 轮流持有
}
function qAdd(state) {                        // 返回新 id，堆放不下返回 -1
  var q = state.q, len = 2 + irnd(state, 3);  // 2~4 格
  var st = firstFit(q.items, len);
  if (st < 0) return -1;
  var id = q.nextItem++;
  q.items.push({ id: id, start: st, len: len, hue: (id * 3) % PAL.length });
  var ow = OWNERS[q.nextOwner % 3]; q.nextOwner++;
  q.edges.push({ from: 'owner', owner: ow, to: id });
  q.alloc++;
  return id;
}
function qItemOf(items, id) {
  for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
  return null;
}
function qCountOf(edges, id) {                // 计数 = 指向它的所有边（主人 + 对象互指都算）
  var n = 0;
  for (var i = 0; i < edges.length; i++) if (edges[i].to === id) n++;
  return n;
}
function qOwnerCount(edges, id) {
  var n = 0;
  for (var i = 0; i < edges.length; i++) if (edges[i].to === id && edges[i].from === 'owner') n++;
  return n;
}
function qInput(state, input) {
  var q = state.q, i, e;
  if (input.pressed('KeyN')) {
    var id = qAdd(state);
    if (id < 0) setMsg(state, '碎片化：找不到连续 2~4 格放新对象——Arena 的 bump 从不需要这段搜索');
    else setMsg(state, '新对象 D' + id + '，主人 ' + OWNERS[(q.nextOwner - 1) % 3] + ' 持有：计数 1');
  }
  if (input.pressed('KeyB')) {
    if (!q.items.length) { setMsg(state, '先按 N 造对象'); return; }
    var it = q.items[irnd(state, q.items.length)];
    var ow = OWNERS[q.nextOwner % 3]; q.nextOwner++;
    q.edges.push({ from: 'owner', owner: ow, to: it.id });
    setMsg(state, ow + ' 转借持有 D' + it.id + '：现在计数 ' + qCountOf(q.edges, it.id) + '——谁都能放手，全放光它才死');
  }
  if (input.pressed('KeyX')) {                // 优先拆一条循环边，否则放手一份主人引用
    var oi = -1;
    for (i = 0; i < q.edges.length; i++) if (q.edges[i].from === 'obj') { oi = i; break; }
    if (oi >= 0) {
      var rm = q.edges.splice(oi, 1)[0];
      setMsg(state, '拆掉循环边 D' + rm.src + '→D' + rm.to + '：计数归零者当刻回收——这就是 Godot 靠架构拆环的效果');
      qSweep(state);
    } else {
      e = [];
      for (i = 0; i < q.edges.length; i++) if (q.edges[i].from === 'owner') e.push(i);
      if (!e.length) { setMsg(state, '主人手里没引用了；先 N 或 B 造一份'); return; }
      var del = q.edges.splice(e[irnd(state, e.length)], 1)[0];
      setMsg(state, del.owner + ' 放手 D' + del.to + '：计数 →' + qCountOf(q.edges, del.to) + '（归零就发生在这一行）');
      qSweep(state);
    }
  }
  if (input.pressed('KeyR')) {
    var n = 0;
    for (i = q.edges.length - 1; i >= 0; i--) if (q.edges[i].from === 'owner') { q.edges.splice(i, 1); n++; }
    setMsg(state, '主人全部放手（-' + n + ' 份引用）：白闪处=当刻回收；红虚线块=循环泄漏');
    qSweep(state);
  }
  if (input.pressed('KeyL')) {
    var pid = qAdd(state), qid = pid < 0 ? -1 : qAdd(state);
    if (pid < 0 || qid < 0) { setMsg(state, '堆太碎塞不下循环对象：先 X/R 清一清'); return; }
    q.edges.push({ from: 'obj', src: pid, to: qid });
    q.edges.push({ from: 'obj', src: qid, to: pid });
    setMsg(state, '循环 D' + pid + '↔D' + qid + '（橙弧）。现在按 R 让主人全放手：它俩计数仍各为 1，永远等不到 free');
  }
}
function qSweep(state) {                      // 结算计数为 0 的对象（连锁：死者的边先摘）
  var q = state.q, again = true, guard = 0;
  while (again && guard++ < 40) {
    again = false;
    for (var i = q.items.length - 1; i >= 0; i--) {
      var it = q.items[i];
      if (qCountOf(q.edges, it.id) === 0) {
        q.freed++;
        state.fx.push({ start: it.start, len: it.len, t: 1 });
        for (var j = q.edges.length - 1; j >= 0; j--) {
          var ed = q.edges[j];
          if (ed.to === it.id || (ed.from === 'obj' && ed.src === it.id)) { q.edges.splice(j, 1); }
        }
        q.items.splice(i, 1);
        again = true;
      }
    }
  }
}
function drawQLines(state, ctx) {
  var i, e, it;
  for (i = 0; i < state.q.edges.length; i++) {          // 主人 → 对象
    e = state.q.edges[i];
    if (e.from !== 'owner') continue;
    it = qItemOf(state.q.items, e.to);
    if (!it) continue;
    var ox = ownBoxX(OWNERS.indexOf(e.owner));
    if (ox < 0) continue;
    ctx.strokeStyle = '#3d5273'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox + OWN_W / 2, OWN_Y); ctx.lineTo(cxOf(it), HY + CH + 1); ctx.stroke();
  }
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5;    // 对象 → 对象（循环弧）
  for (i = 0; i < state.q.edges.length; i++) {
    e = state.q.edges[i];
    if (e.from !== 'obj') continue;
    var sa = qItemOf(state.q.items, e.src), tb = qItemOf(state.q.items, e.to);
    if (!sa || !tb) continue;
    var ax = cxOf(sa), bx = cxOf(tb);
    ctx.beginPath(); ctx.moveTo(ax, HY + CH + 1); ctx.quadraticCurveTo((ax + bx) / 2, HY + CH + 20, bx, HY + CH + 1); ctx.stroke();
  }
}
function drawQBlocks(state, ctx) {
  for (var i = 0; i < state.q.items.length; i++) {
    var it = state.q.items[i];
    var n = qCountOf(state.q.edges, it.id), ownerN = qOwnerCount(state.q.edges, it.id);
    var x = HX + it.start * CW + 1, w = it.len * CW - 3;
    ctx.fillStyle = PAL[it.hue % PAL.length]; ctx.fillRect(x, HY + 4, w, CH - 8);
    if (ownerN === 0) {
      ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(x, HY + 4, w, CH - 8); ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(4,10,22,0.35)'; ctx.fillRect(x, HY + 4, w, 16);      // 顶条压字
    ctx.fillStyle = '#e2e8f0'; ctx.font = '10px monospace'; ctx.fillText('D' + it.id, x + 5, HY + 16);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '12px monospace';
    ctx.fillText(n <= 1 ? '计数 1' : '计数 ' + n, x + 5, HY + 44);
    ctx.fillStyle = '#a5b4c8'; ctx.font = '10px monospace';
    ctx.fillText(ownerN === 0 ? '无主循环' : it.len + ' 格', x + 5, HY + CH - 12);
  }
  ctx.font = '12px monospace';
}
function drawQOwners(state, ctx) {
  for (var i = 0; i < OWNERS.length; i++) {
    var x = ownBoxX(i), held = 0;
    for (var j = 0; j < state.q.edges.length; j++) if (state.q.edges[j].from === 'owner' && state.q.edges[j].owner === OWNERS[i]) held++;
    ctx.fillStyle = '#101a2b'; ctx.fillRect(x, OWN_Y, OWN_W, OWN_H);
    ctx.strokeStyle = held > 0 ? '#4a5f80' : '#26334f'; ctx.lineWidth = 1.5; ctx.strokeRect(x, OWN_Y, OWN_W, OWN_H);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '12px monospace';
    ctx.fillText('主人 ' + OWNERS[i], x + 10, OWN_Y + 18);
    ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
    ctx.fillText('持有引用 ' + held + ' 份', x + 10, OWN_Y + 34);
  }
  ctx.font = '12px monospace';
}

// ---------------- 模式 A：Arena ----------------
function resetA(state) {
  state.a = { blocks: [], bump: 0, nextId: 1, alloc: 0, singles: 0, resets: 0 };
}
function aInput(state, input) {
  if (input.pressed('Space')) aAlloc(state);
  if (input.pressed('KeyF')) aFree1(state);
  if (input.pressed('KeyG')) aReset(state);
}
function aAlloc(state) {
  var a = state.a, len = 1 + irnd(state, 3);
  if (a.bump + len > CELLS) {
    var n = a.blocks.length;
    aResetCore(state); a.resets++;
    setMsg(state, '分配撞墙：自动整块重置——一次回收 ' + n + ' 块，free 成本与对象数无关');
    return;
  }
  var id = a.nextId++;
  a.blocks.push({ id: id, start: a.bump, len: len, hue: (id * 5) % PAL.length, dead: false });
  a.bump += len; a.alloc++;
  setMsg(state, 'bump 分配 ' + len + ' 格：只做加法，无搜索、无锁、不碎片——这就是池化快在哪');
}
function aFree1(state) {                      // Arena 的单对象释放只能打墓碑
  var a = state.a, last = -1;
  for (var i = 0; i < a.blocks.length; i++) if (!a.blocks[i].dead) last = i;
  if (last < 0) { setMsg(state, '没有活对象可释放'); return; }
  a.blocks[last].dead = true; a.singles++;
  setMsg(state, 'D' + a.blocks[last].id + ' 释放 = 打墓碑：空间回不来、bump 不后退，等 G 整块重置');
}
function aResetCore(state) {
  var a = state.a;
  for (var i = 0; i < a.blocks.length; i++) if (!a.blocks[i].dead) state.fx.push({ start: a.blocks[i].start, len: a.blocks[i].len, t: 1 });
  a.blocks = []; a.bump = 0;
}
function aReset(state) {
  var n = state.a.blocks.length;
  aResetCore(state); state.a.resets++;
  setMsg(state, '帧末边界：整块重置一次回收全部 ' + n + ' 块，bump 归 0');
}
function drawAHeap(state, ctx) {
  var a = state.a, i;
  if (a.bump < CELLS) {                          // 未用预留区
    ctx.fillStyle = '#0e1728'; ctx.fillRect(HX + a.bump * CW + 1, HY + 4, (CELLS - a.bump) * CW - 2, CH - 8);
    ctx.strokeStyle = '#17253d'; ctx.strokeRect(HX + a.bump * CW + 1, HY + 4, (CELLS - a.bump) * CW - 2, CH - 8);
    if ((CELLS - a.bump) * CW > 80) { ctx.fillStyle = '#5b7397'; ctx.font = '10px monospace'; ctx.fillText('预留未动', HX + a.bump * CW + 8, HY + 44); }
  }
  for (i = 0; i < a.blocks.length; i++) {
    var bl = a.blocks[i], x = HX + bl.start * CW + 1, w = bl.len * CW - 3;
    ctx.fillStyle = bl.dead ? '#1c2740' : PAL[bl.hue % PAL.length]; ctx.fillRect(x, HY + 4, w, CH - 8);
    if (bl.dead) { ctx.strokeStyle = '#33405c'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(x, HY + 4, w, CH - 8); ctx.setLineDash([]); }
    ctx.fillStyle = bl.dead ? '#7d93b3' : '#e2e8f0'; ctx.font = '10px monospace';
    ctx.fillText(bi(bl.id), x + 5, HY + 16);
    ctx.fillText('D' + bl.id, x + 5, HY + CH - 12);
    if (bl.dead && w >= 40) { ctx.fillStyle = '#c9915e'; ctx.fillText('空洞', x + 5, HY + 44); }
  }
  var bx = HX + a.bump * CW;                      // bump 指针
  ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, HY - 10); ctx.lineTo(bx, HY + CH + 10); ctx.stroke();
  ctx.fillStyle = '#f87171'; ctx.font = '10px monospace';
  ctx.fillText('bump ' + a.bump, bx - 16, HY - 14);
  ctx.font = '12px monospace';
}
function bi(id) { return String(id); }

// ---------------- 模式 C：写时复制 COW ----------------
function resetC(state) {
  state.c = { blocks: [], handles: [], allocs: 0, shares: 0, copies: 0, freed: 0, nextId: 1 };
  var b = { id: state.c.nextId++, start: 0, len: 6, hue: 4, fresh: 0 };
  state.c.blocks.push(b);
  for (var i = 0; i < 3; i++) state.c.handles.push({ name: 'H' + (i + 1), bid: b.id, fresh: 0 });
  state.sel = 0;
}
function cBlockOf(state, id) {
  for (var i = 0; i < state.c.blocks.length; i++) if (state.c.blocks[i].id === id) return state.c.blocks[i];
  return null;
}
function cRefs(state, id) {                     // 块头计数 = 有多少句柄指向它
  var n = 0;
  for (var i = 0; i < state.c.handles.length; i++) if (state.c.handles[i].bid === id) n++;
  return n;
}
function cInput(state, input) {
  var i;
  if (input.pressed('Space')) cCopy(state);
  if (input.pressed('KeyE')) cWrite(state);
  if (input.pressed('KeyD')) cDrop(state);
  if (state.c.handles.length > 0) {
    if (input.pressed('ArrowRight')) state.sel = (state.sel + 1) % state.c.handles.length;
    if (input.pressed('ArrowLeft')) state.sel = (state.sel + state.c.handles.length - 1) % state.c.handles.length;
    if (input.mouse.clicked && input.mouse.y >= HND_Y && input.mouse.y <= HND_Y + HND_H) {
      for (i = 0; i < state.c.handles.length; i++) {
        var hx = hndX(i);
        if (input.mouse.x >= hx && input.mouse.x <= hx + HND_W) {
          state.sel = i;
          setMsg(state, '选中 ' + state.c.handles[i].name + '（指向 B' + state.c.handles[i].bid + '，计数 ' + cRefs(state, state.c.handles[i].bid) + '）');
        }
      }
    }
  }
}
function cCopy(state) {                         // 拷贝 = 新句柄共享同一块：0 分配 0 拷贝
  var c = state.c;
  if (c.handles.length >= 7) { setMsg(state, '句柄 7 个封顶：按 E 写共享块，才会 fork 出新块'); return; }
  var h = c.handles[state.sel % c.handles.length];
  c.handles.push({ name: 'H' + (c.handles.length + 1), bid: h.bid, fresh: 0.9 });
  c.shares++;
  var b = cBlockOf(state, h.bid);
  setMsg(state, '拷贝 = 句柄 + 1（0 分配 0 拷贝）：B' + h.bid + ' 的计数变 ' + cRefs(state, h.bid) + (b ? '，共享 ' + b.len + ' 格数据' : '') + '——账欠到了【写】');
}
function cWrite(state) {                        // 写：独占原地改；共享先 fork 再写
  var c = state.c;
  if (!c.handles.length) return;
  var h = c.handles[state.sel % c.handles.length];
  var b = cBlockOf(state, h.bid);
  if (!b) { setMsg(state, '该句柄的数据块已被回收'); return; }
  var r0 = cRefs(state, b.id);
  if (r0 <= 1) {
    b.hue = (b.hue + 1) % PAL.length; b.fresh = 0.8;
    setMsg(state, '独占（计数 = 1）：原地改个颜色，0 分配 0 拷贝——抄而不写的人在这里领免费午餐');
    return;
  }
  var s = firstFit(c.blocks, b.len);
  if (s < 0) { setMsg(state, '堆满：fork 凑不出连续 ' + b.len + ' 格——COW 的分配失败也悄无声息'); return; }
  h.bid = c.nextId;                              // 写者整体转移到新块
  c.blocks.push({ id: c.nextId++, start: s, len: b.len, hue: (b.hue + 3) % PAL.length, fresh: 1 });
  c.allocs++; c.copies += b.len;
  var r1 = cRefs(state, b.id);                       // 写者携句柄整体迁走，老块自然少一份
  cSweep(state);
  var deadStill = cBlockOf(state, b.id) === null;
  setMsg(state, 'fork 发生：1 次分配 + ' + b.len + ' 格 memcpy 当场结清；老块 B' + b.id + ' 计数 ' + r0 + (deadStill ? ' → 0，白闪当刻回收——COW 的【何时】就是引用计数归零' : ' → ' + r1));
}
function cDrop(state) {                             // 句柄离开作用域：块头计数 -1，归零当刻回收
  var c = state.c;
  if (!c.handles.length) { setMsg(state, '没有句柄了，按 Backspace 重置'); return; }
  var idx = state.sel % c.handles.length, h = c.handles[idx];
  c.handles.splice(idx, 1);
  state.sel = 0;
  cSweep(state);
  var b = cBlockOf(state, h.bid);
  setMsg(state, b ? h.name + ' 出作用域：B' + b.id + ' 还剩 ' + cRefs(state, b.id) + ' 人共用，不回收' : h.name + ' 出作用域：B' + h.bid + ' 计数归零——白闪那格就是它的坟');
}
function cSweep(state) {
  for (var i = state.c.blocks.length - 1; i >= 0; i--) {
    var b = state.c.blocks[i];
    if (cRefs(state, b.id) === 0) {
      state.fx.push({ start: b.start, len: b.len, t: 1 });
      state.c.blocks.splice(i, 1);
      state.c.freed++;
    }
  }
}
function drawCLines(state, ctx) {
  for (var i = 0; i < state.c.handles.length; i++) {
    var h = state.c.handles[i], b = cBlockOf(state, h.bid);
    if (!b) continue;
    ctx.strokeStyle = (i === state.sel % state.c.handles.length) ? '#34d399' : '#3d5273';
    ctx.lineWidth = (i === state.sel % state.c.handles.length) ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(hndX(i) + HND_W / 2, HND_Y); ctx.lineTo(cxOf(b), HY + CH); ctx.stroke();
  }
}
function drawCBlocks(state, ctx) {
  for (var i = 0; i < state.c.blocks.length; i++) {
    var bl = state.c.blocks[i];
    var n = cRefs(state, bl.id);
    var x = HX + bl.start * CW + 1, w = bl.len * CW - 3;
    ctx.fillStyle = PAL[bl.hue % PAL.length]; ctx.fillRect(x, HY + 4, w, CH - 8);
    if (bl.fresh > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (bl.fresh * 0.5).toFixed(2) + ')'; ctx.fillRect(x, HY + 4, w, CH - 8); }
    if (n > 1) { ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.strokeRect(x, HY + 4, w, CH - 8); }   // 共享中
    ctx.fillStyle = '#0b0f17'; ctx.font = '10px monospace'; ctx.fillText('B' + bl.id, x + 5, HY + 16);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText((i & 1) === 0 ? '计数 ' + n : '块 ' + bl.id, x + 5, HY + 44);
    ctx.font = '10px monospace'; ctx.fillStyle = n > 1 ? '#ffe9c9' : '#e2e8f0';
    ctx.fillText(n > 1 ? n + ' 人共享 · ' + bl.len + ' 格' : '独占 · ' + bl.len + ' 格', x + 5, HY + CH - 12);
  }
  ctx.font = '12px monospace';
}
function drawCHandles(state, ctx) {
  for (var i = 0; i < state.c.handles.length; i++) {
    var h = state.c.handles[i], x = hndX(i), on = (i === state.sel % state.c.handles.length);
    ctx.fillStyle = '#101a2b'; ctx.fillRect(x, HND_Y, HND_W, HND_H);
    ctx.strokeStyle = on ? '#34d399' : '#4a5f80'; ctx.lineWidth = on ? 2.5 : 1.5; ctx.strokeRect(x, HND_Y, HND_W, HND_H);
    if (h.fresh > 0) { ctx.fillStyle = 'rgba(251,191,36,' + (h.fresh * 0.4).toFixed(2) + ')'; ctx.fillRect(x, HND_Y, HND_W, HND_H); }
    var r = cRefs(state, h.bid);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '12px monospace';
    ctx.fillText(h.name + ' → B' + h.bid, x + 8, HND_Y + 18);
    ctx.fillStyle = r > 1 ? '#f59e0b' : '#a5b4c8'; ctx.font = '11px monospace';
    ctx.fillText(r > 1 ? 'r' + r + ' 共享' : 'r' + r + ' 独占', x + 8, HND_Y + 34);
  }
  ctx.font = '12px monospace';
}`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>按 <b>L</b> 造一对循环引用的对象，再按 <b>R</b> 让所有主人放手：堆上会留下两个互相指着的 r1 对象，「已回收」计数对它们永远无能为力。这就是 Godot 调试版退出时打印 leaked RefCounted instance 的东西。按 <b>X</b> 一份份慢慢放，对比白闪（归零当刻）留下的位置。</li>
  <li>切到 A：连按 <b>空格</b> 把格子喂到撞墙——满员那次会看到自动整块重置，全程「单个释放: 0」；再按 <b>F</b> 三次造墓碑空洞，继续按空格——bump 指针从不回头看空洞；按 <b>G</b>：bump 归 0，一次回收全部。</li>
  <li>切到 C：连按 <b>空格</b> 把句柄加到 7——数据块的引用线全橙、顶栏「真分配」纹丝不动，这就是零成本拷贝；按 <b>E</b> 一下——fork 出新块，顶栏「真分配 +1、写时拷贝 6 格」当场跳变，拖欠的拷贝费当场结清。<b>← →</b> 换到 r1 独占句柄再按 E：原地改色，成本 0。</li>
  <li>终极对照：在 C 里连按 <b>D</b> 逐个丢句柄（模拟函数作用域结束、Ref 析构），盯住顶栏「归零回收」与格子上的白闪——每一次白闪都是块头计数归零的当刻。E 演示了账从【复制时】挪到【首次写】，D 演示了 COW 的【何时】终究由引用计数决定：三种策略是同一问题（谁、何时、付多少）的三种答案。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 把三种策略分别写在哪',
      files: [
        { path: 'core/object/ref_counted.h', note: '引用计数的本体：RefCounted 里的 SafeRefCount refcount / refcount_init 和 init_ref / reference / unreference 三件套；往下看模板 Ref 的 ref_pointer——注意它把旧引用装进 cleanup_ref 局部变量、靠离开作用域触发 unreference：回收时机就藏在这些花括号里。' },
        { path: 'core/templates/cowdata.h', note: 'COW 的教科书实现：文件头的 ASCII 布局图——数据区最前面藏着 refcount / capacity / size；搜 copy-on-write、conditional_increment、get_m / set——读不动块头，写之前检查 refs，不等于 1 就分配新块整块 memcpy 后 SWAP。沙盘 E 键的 fork 分支是它的卡通版。' },
        { path: 'core/templates/paged_allocator.h', note: '池化的落地，比 Arena 更精细：PagedAllocator 每次按 2 的幂整页申请，页内切成固定大小对象；"释放"只是把块挂回 available_pool 空闲表。搜 alloc、configure，数一数 free：整页内存直到析构前从不归还系统——用内存换速度。' }
      ]
    },
    {
      type: 'text',
      title: '小结与全景：没有万能药，只有分层',
      html: `<p>三个灵魂拷问在这一课的答案：<b>数据怎么流动</b>——分配策略决定对象在地址空间的邻居是谁：Arena 把批次排成连续（缓存友好），通用堆和引用计数则听任散布。<b>所有权归谁</b>——引用计数写进类型（每个 Ref 持有一份），Arena 写进批次（对象没有所有权），COW 写进块头句柄表（写者独占）。<b>什么时候发生</b>——引用计数由「归零那一行」决定；Arena 攒到批次边界一次清零；COW 把分配和拷贝都推迟到首次真实写入。</p>
<p>Godot 的现实结构就是分层：底层 <code>Memory</code>（core/os/memory.h 的 <code>memnew</code> / <code>memrealloc</code>，配自定义分配器可切换）之上，<code>Ref&lt;Resource&gt;</code> 管资源生命周期，<code>Vector</code> / <code>String</code> 的数据躺在 CowData 共享块里，节点进 PagedAllocator 式的页池。每种机制都在回答"何时、谁付、付多少"——没有哪种消灭了问题，只是选择了把账挂给谁。下节课 L2.4，一次 GDScript 调用穿透 C++ 时，Variant 拆装箱背后走的正是这一课的分配器与智能指针。</p>`
    }
  ]
}