// C1 · ECS 世界观：archetype vs sparse set vs Node
export default {
  id: 'C1',
  title: 'ECS 世界观：archetype vs sparse set vs Node',
  est: '2 小时',
  coreQuestions: [
    '同一批实体住进 archetype、sparse set、Node 树三种存储，为什么「遍历一遍」的成本由内存布局决定，而不是由代码写得好不好决定？缓存行在里面买到了什么？',
    '「只有部分实体拥有某组件组合」（Query）在三种存储下分别要付出什么？为什么 archetype 能把这笔钱几乎免掉？',
    '随机增删实体时，三种存储各疼在哪一步：是增删本身贵，还是增删之后的布局被搅乱、让之后的遍历变贵？',
    'Node 树明知指针跳与逐节点调用不快，为什么仍是 Godot 的主世界观？数据导向的边界画在哪？'
  ],
  sections: [
    {
      type: 'text',
      title: '世界观先行：同一批实体，三种命运',
      html: `<p>主线 L2.1 用 cache line 解释了「顺序扫数组为什么快」；L3.2 把「数据怎么摆」拆成了 AoS 与 SoA。这一课把镜头推到引擎架构的真刀真枪处：面对「实体到底该住在什么内存布局里」，业界真的分出了三条路线，而同一个「每帧把实体遍历一遍」的动作，在三条路线里的命运完全不同。<b>先立住一个判断：遍历快慢是布局决定的，不是代码风格决定的。</b></p>
<table>
  <tr><th>路线</th><th>内存布局</th><th>访问一条数据的路径</th><th>代表</th></tr>
  <tr><td><b>archetype（原型）</b></td><td>按<b>组件组合</b>分块；每块几条平行数组，块内 SoA 连续</td><td>顺着块顺序直读，零跳转</td><td>Bevy / Unity DOTS</td></tr>
  <tr><td><b>sparse set（稀疏集）</b></td><td>每种组件一个池：dense 数组（实体与数据对齐）+ 稀疏索引（实体 id → dense 下标）</td><td>池内连续；<b>跨组件多一跳索引</b></td><td>EnTT</td></tr>
  <tr><td><b>Node 树</b></td><td>每个实体一个完整对象：自带字段与方法，挂在父节点的 children 里</td><td><b>每节点一跳指针</b>，整树递归</td><td>Godot 场景树</td></tr>
</table>
<p>三条路线对「查询（Query）」的回答差别最大。所谓查询，就是<b>只有部分实体拥有某组件组合</b>时（本课沙盘里是 13000 个实体中带 Extra 的 3000 个），系统只想摸那部分：archetype 的回答最霸道——组合本身就是分块依据，查询等于<b>挑块</b>，块外的实体碰都不碰；sparse set 的回答是——扫那个组件自己的池（dense 依旧连续），但要用到的其它组件得<b>拿实体 id 隔着索引跳过去拿</b>；Node 树的回答最老实——没有索引，<b>全树走一遍、逐个判断</b>：判断本身不贵，贵在把上万个散落的堆对象挨个拉进缓存。</p>
<p>顺带把下一课的位置摆正：C2 亲手写的 mini-ECS 用「一张平铺数组 + 位掩码」，那是 archetype 的<b>退化形态</b>——所有实体恰好同一组合，一张表就是一块。本课把完整光谱铺开，C2 再去把「多块」的世界亲手写出来。本课实验独立可跑，不依赖任何其它课程的代码。</p>`
    },
    {
      type: 'text',
      title: '缓存局部性：三种布局的账本',
      html: `<p>为什么布局能决定快慢？复用 L3.2 的结论：CPU 从不按字节取内存，它按 <b>64 字节的缓存行</b>整块搬运。三种布局各自的「搬运账本」完全不同：</p>
<ul>
  <li><b>archetype</b>：扫一块 = 顺着几条连续数组直读。每搬一条缓存行，行里每个字节都有用；预取器认出「直线访问」的模式后，甚至会抢在你用到之前把后面的行装进缓存。<b>遍历成本逼近纯内存带宽</b>。</li>
  <li><b>sparse set</b>：单池扫描同样连续；但「移动系统要 pos 和 vel」这种跨池访问，每条数据都得先查索引、再跳进另一个池的某个位置。各池 dense 各自连续，<b>池与池之间的顺序互不相干</b>——增删越频繁，跳的落点越散，每次跳都是一次潜在缓存 miss。</li>
  <li><b>Node 树</b>：每个节点是独立堆对象，访问它 = 指针解引用一次；递归下钻 children = 每层再跳一次；对象自带行为 = 每节点还要一次方法调用（Godot 的 <code>_process</code> 正是每节点虚调用）。一万个节点就是一万个随机堆地址——L2.1 里「树慢」的微观原因全在这。</li>
</ul>
<p>但没有全能冠军，archetype 把疼挪到了<b>增删</b>上：实体一换组件组合（比如突然获得 Extra）就要从一块<b>搬家</b>到另一块，全部组件数据拷一遍；块满要开新块，块空要回收。sparse set 把疼摊薄：增删只是池内一次 swap（O(1)），代价是池序被打乱、跨池跳转更散。Node 树的疼在查询：增删一个节点只是 children 里一次挪动，可查询永远全树走。<b>三种存储，三种「疼的位置」——按你的访问模式选型，而不是按名气。</b></p>
<p>最后交代一句实验的可信度：这些差异在浏览器 JS 里同样测得出来——JIT 不会替你改布局，TypedArray 的连续是真实的连续，对象图的指针追逐也是真实的追逐；只是 JS 的差距没有原生 C++ 那么悬殊（隐藏类与内联缓存会兜住一部分），<b>看方向，也看柱子之间的倍数与访问账本</b>。下面把同一批实体住进三种模拟存储，每帧实测。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'stores',
      title: '实验：三种存储遍历成本沙盘',
      height: 620,
      code: `// 三种存储遍历成本沙盘 —— 同一批实体（10000 移动 + 3000 带额外）分别住进三种模拟存储
// 每帧对三种存储各跑一遍同样的遍历任务，performance.now 实测耗时做滚动平均（跑 REPEAT 遍取均值抬高精度）
// 场景：1=满遍历  2=Query 条件遍历（只要带 Extra 的 3000 个）  3=边增删边遍历（每帧一小批，C=一次性批量）
// Q/E 聚焦某个存储（底部布局示意高亮）  R 重置
// 说明：浏览器 JS 的差距被 JIT 与隐藏类压缩过，比原生 C++ 温和——看方向，也看柱子倍数与右侧访问账本
// 纯 JS + Canvas2D；随机数自带种子（无 Math.random，可复现）；本实验独立可跑，不依赖任何其它课程代码

// ---------- 带种子的随机数（可复现） ----------
var seed = 20260903;
function srand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function randInt(n) { return (srand() * n) | 0; }

// ---------- 规模与常量 ----------
var N_MOVER = 10000;          // 只带 Pos+Vel 的实体
var N_EXTRA = 3000;           // 额外带 Extra 的实体（本课 Query 的目标组合）
var MAX_ENT = N_MOVER + N_EXTRA;
var CHUNK_CAP = 256;          // archetype 每块容量（试试改成 64 再重跑）
var N_GROUP = 20;             // Node 树的组节点数（每组 650 个叶子）
var REPEAT = 3;               // 每帧遍历跑 3 遍取均值，抬高计时精度（三种存储同待遇）
var BURST = 2000;             // 按 C 一次批量增删的规模
var SCEN_NOTE = [
  '移动系统扫全部 13000 个实体（Pos+Vel）：比的是纯顺序扫描下，三种布局各自的搬运成本。',
  '只要带 Extra 的 3000 个：archetype 挑块直扫；sparse set 扫最小池再跳索引；Node 树全树走+逐个判断。',
  '每帧随机增删一批后照常满遍历：增删不计入柱子，看布局被搅动后柱子会不会被拖高；按 C 来一次 2000 的批量。'
];

// ==================================================================
// 存储一：archetype 模拟 —— 按组件组合分块，块内 SoA 连续（Bevy/Unity DOTS 路线）
//   A1 = Pos+Vel；A2 = Pos+Vel+Extra。每块是几条平行 TypedArray（块内 SoA）
// ==================================================================
function makeChunk(withExtra) {
  return {
    len: 0,
    px: new Float32Array(CHUNK_CAP), py: new Float32Array(CHUNK_CAP),
    vx: new Float32Array(CHUNK_CAP), vy: new Float32Array(CHUNK_CAP),
    hue: withExtra ? new Float32Array(CHUNK_CAP) : null
  };
}
function archAppend(st, isA2, x, y, vx0, vy0, hue) {
  var list = isA2 ? st.a2 : st.a1;
  var ch = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].len < CHUNK_CAP) { ch = list[i]; break; }   // 找有空槽的块
  }
  if (ch === null) { ch = makeChunk(isA2); list.push(ch); } // 全满：开新块
  var s = ch.len;
  ch.px[s] = x; ch.py[s] = y; ch.vx[s] = vx0; ch.vy[s] = vy0;
  if (isA2) ch.hue[s] = hue;
  ch.len = s + 1;
  if (isA2) st.alive2++; else st.alive1++;
}
function archRemoveAt(list, ci, si) {                       // 块内 swap-remove
  var ch = list[ci];
  var last = ch.len - 1;
  if (si !== last) {
    ch.px[si] = ch.px[last]; ch.py[si] = ch.py[last];
    ch.vx[si] = ch.vx[last]; ch.vy[si] = ch.vy[last];
    if (ch.hue) ch.hue[si] = ch.hue[last];
  }
  ch.len = last;
}
function buildArchetype() {
  var st = { a1: [], a2: [], alive1: 0, alive2: 0, churn: 0, moves: 0 };
  for (var i = 0; i < N_MOVER; i++) {
    archAppend(st, false, srand() * 720, srand() * 440, (srand() - 0.5) * 120, (srand() - 0.5) * 120, 0);
  }
  for (var j = 0; j < N_EXTRA; j++) {
    archAppend(st, true, srand() * 720, srand() * 440, (srand() - 0.5) * 120, (srand() - 0.5) * 120, srand() * 360);
  }
  return st;
}
function archTraverseFull(st, dt) {     // 满遍历：两块原型全扫（顺着块直读）
  var list = st.a1, c, ch, i, n, px, py, vx, vy, hu;
  for (c = 0; c < list.length; c++) {
    ch = list[c]; n = ch.len;
    px = ch.px; py = ch.py; vx = ch.vx; vy = ch.vy;
    for (i = 0; i < n; i++) {
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      if (px[i] < 0 || px[i] > 720) vx[i] = -vx[i];
      if (py[i] < 0 || py[i] > 440) vy[i] = -vy[i];
    }
  }
  list = st.a2;
  for (c = 0; c < list.length; c++) {
    ch = list[c]; n = ch.len;
    px = ch.px; py = ch.py; vx = ch.vx; vy = ch.vy; hu = ch.hue;
    for (i = 0; i < n; i++) {
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      hu[i] = (hu[i] + dt * 40) % 360;
      if (px[i] < 0 || px[i] > 720) vx[i] = -vx[i];
      if (py[i] < 0 || py[i] > 440) vy[i] = -vy[i];
    }
  }
}
function archTraverseQuery(st, dt) {    // Query：只扫 A2 的块（组合本身就是索引）
  var list = st.a2, c, ch, i, n, px, py, vx, vy, hu;
  for (c = 0; c < list.length; c++) {
    ch = list[c]; n = ch.len;
    px = ch.px; py = ch.py; vx = ch.vx; vy = ch.vy; hu = ch.hue;
    for (i = 0; i < n; i++) {
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      hu[i] = (hu[i] + dt * 40) % 360;
      if (px[i] < 0 || px[i] > 720) vx[i] = -vx[i];
      if (py[i] < 0 || py[i] > 440) vy[i] = -vy[i];
    }
  }
}
function churnArch(st, n) {             // 随机增删：一半概率换组合（=跨块搬家，拷全部组件）
  for (var k = 0; k < n; k++) {
    var wasA2 = randInt(10) < 3;        // 按人口比例选池（10000:3000 约等于 10:3）
    var list = wasA2 ? st.a2 : st.a1;
    if (list.length === 0) continue;
    var ci = randInt(list.length);
    while (list[ci].len === 0) ci = (ci + 1) % list.length;
    var ch = list[ci];
    var si = randInt(ch.len);
    var x = ch.px[si], y = ch.py[si], vx0 = ch.vx[si], vy0 = ch.vy[si];
    archRemoveAt(list, ci, si);
    if (wasA2) st.alive2--; else st.alive1--;
    var toA2 = (randInt(2) === 0) ? !wasA2 : wasA2;
    archAppend(st, toA2, x, y, vx0, vy0, srand() * 360);
    st.churn++;
    if (toA2 !== wasA2) st.moves++;     // 跨组合 = 搬家：组件数据从一块拷到另一块
  }
}

// ==================================================================
// 存储二：sparse set 模拟 —— 每种组件一个池：dense(实体与数据对齐) + sparse 索引（EnTT 路线）
//   池内部连续，但跨组件访问必须拿实体 id 去另一池的 sparse 表换下标——多一跳
//   三种池同构共用 a/b/c 槽位（hue 池用 a，其余槽闲置占位），换来 swap-remove 的统一实现
// ==================================================================
function makePool() {
  return { ent: [], sparse: new Int32Array(MAX_ENT).fill(-1), a: [], b: [], c: [] };
}
function ssAdd(pool, e, v1, v2, v3) {
  pool.sparse[e] = pool.ent.length;
  pool.ent.push(e); pool.a.push(v1); pool.b.push(v2); pool.c.push(v3);
}
function ssRemove(pool, e) {            // 与末位交换后弹出：O(1)
  var i = pool.sparse[e];
  var last = pool.ent.length - 1;
  var le = pool.ent[last];
  pool.ent[i] = le;
  pool.a[i] = pool.a[last]; pool.b[i] = pool.b[last]; pool.c[i] = pool.c[last];
  pool.sparse[le] = i;
  pool.ent.pop(); pool.a.pop(); pool.b.pop(); pool.c.pop();
  pool.sparse[e] = -1;
}
function buildSparse() {
  var st = { pos: makePool(), vel: makePool(), ext: makePool(), freeIds: [], nextId: 0, churn: 0 };
  var i, e;
  for (i = 0; i < N_MOVER; i++) {
    e = st.nextId++;
    ssAdd(st.pos, e, srand() * 720, srand() * 440, 0);
    ssAdd(st.vel, e, (srand() - 0.5) * 120, (srand() - 0.5) * 120, 0);
  }
  for (i = 0; i < N_EXTRA; i++) {
    e = st.nextId++;
    ssAdd(st.pos, e, srand() * 720, srand() * 440, 0);
    ssAdd(st.vel, e, (srand() - 0.5) * 120, (srand() - 0.5) * 120, 0);
    ssAdd(st.ext, e, srand() * 360, 0, 0);
  }
  return st;
}
function ssTraverseFull(st, dt) {       // 满遍历：扫 Pos 池，速度拿 id 跳进 Vel 池
  var pos = st.pos, vel = st.vel;
  var ent = pos.ent, px = pos.a, py = pos.b;
  var sp = vel.sparse, vx = vel.a, vy = vel.b;
  var n = ent.length;
  for (var i = 0; i < n; i++) {
    var j = sp[ent[i]];                 // 一跳：实体 id → Vel 池 dense 下标
    px[i] += vx[j] * dt;
    py[i] += vy[j] * dt;
    if (px[i] < 0 || px[i] > 720) vx[j] = -vx[j];
    if (py[i] < 0 || py[i] > 440) vy[j] = -vy[j];
  }
}
function ssTraverseQuery(st, dt) {      // Query：扫 Extra 池（最小池），pos/vel 都要跳
  var pos = st.pos, vel = st.vel, ext = st.ext;
  var ent = ext.ent, hue = ext.a;
  var spP = pos.sparse, px = pos.a, py = pos.b;
  var spV = vel.sparse, vx = vel.a, vy = vel.b;
  var n = ent.length;
  for (var i = 0; i < n; i++) {
    var e = ent[i];
    var jp = spP[e], jv = spV[e];       // 两次跳：Pos 池一次、Vel 池一次
    px[jp] += vx[jv] * dt;
    py[jp] += vy[jv] * dt;
    hue[i] = (hue[i] + dt * 40) % 360;
    if (px[jp] < 0 || px[jp] > 720) vx[jv] = -vx[jv];
    if (py[jp] < 0 || py[jp] > 440) vy[jv] = -vy[jv];
  }
}
function churnSparse(st, n) {           // 增删本身便宜（swap），但各池 dense 顺序会被搅乱
  for (var k = 0; k < n; k++) {
    var posN = st.pos.ent.length;
    if (posN === 0) continue;
    var e = st.pos.ent[randInt(posN)];  // 随机抓一个活实体（全部都在 Pos 池里）
    var hadExtra = st.ext.sparse[e] >= 0;
    ssRemove(st.pos, e); ssRemove(st.vel, e);
    if (hadExtra) ssRemove(st.ext, e);
    st.freeIds.push(e);
    var withExtra = (randInt(2) === 0) ? !hadExtra : hadExtra;
    var nid = st.freeIds.length > 0 ? st.freeIds.pop() : st.nextId++;
    ssAdd(st.pos, nid, srand() * 720, srand() * 440, 0);
    ssAdd(st.vel, nid, (srand() - 0.5) * 120, (srand() - 0.5) * 120, 0);
    if (withExtra) ssAdd(st.ext, nid, srand() * 360, 0, 0);
    st.churn++;
  }
}

// ==================================================================
// 存储三：Node 树模拟 —— 每个实体一个完整对象，挂在父节点 children 里（Godot 路线）
//   根 → 20 个组节点 → 每组 650 个叶子；遍历=递归下钻，每节点一跳指针
//   叶子自带 onTick/onTickQ 方法：对象自带行为，访问它 = 指针跳 + 一次方法调用（对应 Godot 的每节点虚调用）
// ==================================================================
function makeNodeObj(withExtra, x, y, vx0, vy0, hue) {
  return {
    x: x, y: y, vx: vx0, vy: vy0, hue: hue,
    hasExtra: withExtra, children: [],
    onTick: function (dt) {             // 移动系统「长在对象身上」
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < 0 || this.x > 720) this.vx = -this.vx;
      if (this.y < 0 || this.y > 440) this.vy = -this.vy;
    },
    onTickQ: function (dt) {            // Query 场景：移动 + 变色
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.hue = (this.hue + dt * 40) % 360;
      if (this.x < 0 || this.x > 720) this.vx = -this.vx;
      if (this.y < 0 || this.y > 440) this.vy = -this.vy;
    }
  };
}
function buildNodeTree() {
  var root = makeNodeObj(false, 0, 0, 0, 0, 0);
  var per = (N_MOVER + N_EXTRA) / N_GROUP;
  var gi = 0;
  for (var g = 0; g < N_GROUP; g++) {
    var grp = makeNodeObj(false, 0, 0, 0, 0, 0);
    root.children.push(grp);
    for (var i = 0; i < per; i++) {
      grp.children.push(makeNodeObj(gi >= N_MOVER, srand() * 720, srand() * 440, (srand() - 0.5) * 120, (srand() - 0.5) * 120, srand() * 360));
      gi++;
    }
  }
  return { root: root, churn: 0, moves: 0 };
}
function nodeVisitFull(n, dt) {         // 递归：叶子=实体本体，每组节点一跳 children
  var kids = n.children;
  if (kids.length === 0) { n.onTick(dt); return; }
  for (var i = 0; i < kids.length; i++) nodeVisitFull(kids[i], dt);
}
function nodeVisitQuery(n, dt) {        // Query 没有索引：全树照走 + 逐个判断 hasExtra
  var kids = n.children;
  if (kids.length === 0) {
    if (n.hasExtra) n.onTickQ(dt);
    return;
  }
  for (var i = 0; i < kids.length; i++) nodeVisitQuery(kids[i], dt);
}
function churnNode(st, n) {             // 增删=父节点 children 指针数组的一次挪动
  var root = st.root;
  for (var k = 0; k < n; k++) {
    var grp = root.children[randInt(N_GROUP)];
    var kids = grp.children;
    if (kids.length === 0) continue;
    var idx = randInt(kids.length);
    var removed = kids[idx];
    kids.splice(idx, 1);                // 指针数组擦除：后续指针整体前移（remove_child 的疼）
    var toExtra = (randInt(2) === 0) ? !removed.hasExtra : removed.hasExtra;
    root.children[randInt(N_GROUP)].children.push(makeNodeObj(toExtra, removed.x, removed.y, removed.vx, removed.vy, srand() * 360));
    st.churn++;
    if (toExtra !== removed.hasExtra) st.moves++;
  }
}

// ---------- 每帧驱动 ----------
function emaAdd(oldV, v) { return oldV < 0 ? v : oldV * 0.9 + v * 0.1; }

engine.run({
  setup: function (state) {
    state.arch = buildArchetype();
    state.ss = buildSparse();
    state.nt = buildNodeTree();
    state.scenario = 0;
    state.focus = 0;
    state.churnRate = 60;
    state.emaArch = -1; state.emaSparse = -1; state.emaNode = -1;
    state.animT = 0; state.frames = 0; state.flash = 0;
    state.note = SCEN_NOTE[0];
  },

  update: function (state, dt, input) {
    if (input.pressed('Digit1')) { state.scenario = 0; state.note = SCEN_NOTE[0]; }
    if (input.pressed('Digit2')) { state.scenario = 1; state.note = SCEN_NOTE[1]; }
    if (input.pressed('Digit3')) { state.scenario = 2; state.note = SCEN_NOTE[2]; }
    if (input.pressed('KeyQ')) state.focus = (state.focus + 2) % 3;
    if (input.pressed('KeyE')) state.focus = (state.focus + 1) % 3;
    if (input.pressed('KeyR')) {
      state.arch = buildArchetype();
      state.ss = buildSparse();
      state.nt = buildNodeTree();
      state.emaArch = -1; state.emaSparse = -1; state.emaNode = -1;
      state.note = '已重置（三种存储用同一批随机数重建）。' + SCEN_NOTE[state.scenario];
    }
    if (input.pressed('KeyC')) {
      var b = state.scenario === 2 ? BURST : 200;
      churnArch(state.arch, b);
      churnSparse(state.ss, b);
      churnNode(state.nt, b);
      state.flash = 0.8;
    }
    state.flash = Math.max(0, state.flash - dt);

    // 场景③：每帧一小批增删（不计入遍历计时），增删完照常遍历
    if (state.scenario === 2) {
      churnArch(state.arch, state.churnRate);
      churnSparse(state.ss, state.churnRate);
      churnNode(state.nt, state.churnRate);
    }

    // 三种存储跑同一个遍历任务，分别实测（各跑 REPEAT 遍取均值）
    var t0, t1, r;
    t0 = performance.now();
    for (r = 0; r < REPEAT; r++) {
      if (state.scenario === 1) archTraverseQuery(state.arch, dt); else archTraverseFull(state.arch, dt);
    }
    t1 = performance.now();
    state.emaArch = emaAdd(state.emaArch, (t1 - t0) / REPEAT);

    t0 = performance.now();
    for (r = 0; r < REPEAT; r++) {
      if (state.scenario === 1) ssTraverseQuery(state.ss, dt); else ssTraverseFull(state.ss, dt);
    }
    t1 = performance.now();
    state.emaSparse = emaAdd(state.emaSparse, (t1 - t0) / REPEAT);

    t0 = performance.now();
    for (r = 0; r < REPEAT; r++) {
      if (state.scenario === 1) nodeVisitQuery(state.nt.root, dt); else nodeVisitFull(state.nt.root, dt);
    }
    t1 = performance.now();
    state.emaNode = emaAdd(state.emaNode, (t1 - t0) / REPEAT);

    state.animT += dt;
    state.frames++;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.fillStyle = '#cfe3ff';
    ctx.font = '14px monospace';
    ctx.fillText('三种存储遍历成本沙盘 —— 同一批实体（10000 移动 + 3000 带额外），三种命运', 12, 22);
    ctx.fillStyle = '#5b7397';
    ctx.font = '12px monospace';
    ctx.fillText('1/2/3 切换场景   Q/E 聚焦存储   C 批量增删   R 重置（随机数带种子，全部可复现）', 12, 40);
    drawBars(state, ctx);
    drawInfo(state, ctx);
    drawLayouts(state, ctx);
  }
});

// ---------- 绘制：柱状对比 ----------
function barVal(v) { return v < 0 ? 0 : v; }
function drawBars(state, ctx) {
  var x = 12, y = 50, w = 220, h = 252;
  ctx.fillStyle = '#0f1723';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#1e2a3d';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('每帧遍历耗时（滚动平均）', x + 10, y + 18);

  var vals = [barVal(state.emaArch), barVal(state.emaSparse), barVal(state.emaNode)];
  var names = ['archetype', 'sparse set', 'Node 树'];
  var cols = ['#34d399', '#60a5fa', '#f87171'];
  var mx = Math.max(vals[0], vals[1], vals[2], 0.01);
  var base = y + h - 34;
  var maxH = h - 92;
  var bw = 40;
  var xs = [x + 16, x + 82, x + 148];
  var i;
  for (i = 0; i < 3; i++) {
    var bh = Math.max(2, vals[i] / mx * maxH);
    ctx.fillStyle = cols[i];
    ctx.fillRect(xs[i], base - bh, bw, bh);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText((vals[i] * 1000).toFixed(1) + 'μs', xs[i] + bw / 2, base - bh - 6);
    ctx.fillStyle = cols[i];
    ctx.fillText(names[i], xs[i] + bw / 2, base + 14);
    ctx.textAlign = 'left';
    if (state.focus === i) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.strokeRect(xs[i] - 4, y + 26, bw + 8, base - (y + 26) + 16);
    }
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('跑 ' + REPEAT + ' 遍取均值 · 柱高相对最慢者', x + 10, y + h - 6);
}

// ---------- 绘制：右侧信息与账本 ----------
function wrapText(text, x, y, maxW, ctx) {
  var line = '', yy = y;
  for (var i = 0; i < text.length; i++) {
    var test = line + text.charAt(i);
    if (test.length * 12 > maxW && line !== '') {
      ctx.fillText(line, x, yy);
      yy += 16;
      line = text.charAt(i);
    } else {
      line = test;
    }
  }
  if (line !== '') ctx.fillText(line, x, yy);
}
function drawInfo(state, ctx) {
  var x = 244, y = 50, w = 464, h = 252;
  ctx.fillStyle = '#0f1723';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#1e2a3d';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  var names = ['场景① 满遍历', '场景② Query 条件遍历', '场景③ 边增删边遍历'];
  ctx.fillStyle = '#fbbf24';
  ctx.font = '13px monospace';
  ctx.fillText(names[state.scenario], x + 12, y + 22);
  ctx.fillStyle = '#9db4d0';
  ctx.font = '12px monospace';
  wrapText(state.note, x + 12, y + 42, w - 24, ctx);

  var arch = state.arch, ss = state.ss;
  var archVisit = state.scenario === 1 ? arch.alive2 : (arch.alive1 + arch.alive2);
  var ssVisit = state.scenario === 1 ? ss.ext.ent.length : ss.pos.ent.length;
  var ssHops = state.scenario === 1 ? ss.ext.ent.length * 2 : ss.pos.ent.length;
  var nodeVisit = N_MOVER + N_EXTRA + N_GROUP + 1;
  var rows = [
    ['archetype ', '块 ' + (arch.a1.length + arch.a2.length) + ' · 直读 ' + archVisit + ' · 增删 ' + arch.churn + '/搬家 ' + arch.moves, '#34d399'],
    ['sparse set', '池 ' + ss.pos.ent.length + '+' + ss.ext.ent.length + ' · 扫 ' + ssVisit + ' · 跳 ' + ssHops + ' · 增删 ' + ss.churn, '#60a5fa'],
    ['Node 树   ', '走 ' + nodeVisit + '（Query 同价）· 增删 ' + state.nt.churn, '#f87171']
  ];
  var ly = y + 108;
  for (var i = 0; i < 3; i++) {
    ctx.fillStyle = rows[i][2];
    ctx.font = '11px monospace';
    ctx.fillText(rows[i][0], x + 8, ly);
    ctx.fillStyle = '#c7d3e6';
    ctx.fillText(rows[i][1], x + 84, ly);
    ly += 20;
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('直读=顺块顺序扫；扫+跳=过 sparse 表再够另一池；Node 无索引，Query 与满遍历同价。', x + 8, ly + 8);
  ctx.fillText('柱子只算纯遍历耗时；增删/搬家的成本进这份账本，不进柱子。', x + 8, ly + 24);
  if (state.flash > 0) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('批量增删已注入三种存储（增删本身不计入柱子）', x + 8, y + h - 12);
  } else if (state.scenario === 2) {
    ctx.fillStyle = '#5b7397';
    ctx.fillText('每帧随机增删 ' + state.churnRate + ' 个 × 3 种存储（不计入柱子）', x + 8, y + h - 12);
  }
}

// ---------- 绘制：三种内存布局示意 ----------
function panelFrame(ctx, x, y, w, h, hot, title, col) {
  ctx.fillStyle = '#0f1723';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hot ? '#fbbf24' : '#1e2a3d';
  ctx.lineWidth = hot ? 2 : 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.font = '12px monospace';
  ctx.fillText(title, x + 8, y + 16);
}
function drawLayouts(state, ctx) {
  drawArchLayout(state, ctx, 12, 312, 228, 120, state.focus === 0);
  drawSparseLayout(state, ctx, 246, 312, 228, 120, state.focus === 1);
  drawNodeLayout(state, ctx, 480, 312, 228, 120, state.focus === 2);
}
function drawArchLayout(state, ctx, x, y, w, h, hot) {
  panelFrame(ctx, x, y, w, h, hot, '① archetype：按组合分块', '#34d399');
  var st = state.arch;
  var cells = st.a1.length;
  var cw = (w - 60) / Math.max(cells, 1);
  var rowY = y + 34;
  for (var i = 0; i < cells; i++) {
    ctx.fillStyle = '#34d399';
    ctx.fillRect(x + 34 + i * cw, rowY, Math.max(1, cw - 1), 12);
  }
  var head = cells > 0 ? Math.floor(state.animT * 6) % cells : 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 34 + head * cw, rowY, Math.max(1, cw - 1), 12);
  ctx.fillStyle = '#6ee7b7';
  ctx.font = '10px monospace';
  ctx.fillText('A1 ' + st.alive1, x + 2, rowY + 10);
  var cells2 = st.a2.length;
  var cw2 = (w - 60) / Math.max(cells2, 1);
  var rowY2 = y + 56;
  for (var j = 0; j < cells2; j++) {
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(x + 34 + j * cw2, rowY2, Math.max(1, cw2 - 1), 12);
  }
  var head2 = cells2 > 0 ? Math.floor(state.animT * 2) % cells2 : 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 34 + head2 * cw2, rowY2, Math.max(1, cw2 - 1), 12);
  ctx.fillStyle = '#fdba74';
  ctx.fillText('A2 ' + st.alive2, x + 2, rowY2 + 10);
  ctx.fillStyle = '#9db4d0';
  ctx.font = '11px monospace';
  ctx.fillText('块内 SoA 连续：白格=读头直读', x + 8, y + 84);
  ctx.fillText('Query=只扫 A2 块，零浪费', x + 8, y + 98);
  ctx.fillText('增删=块内换位 / 跨块搬家 ' + st.moves + ' 次', x + 8, y + 112);
}
function drawSparseLayout(state, ctx, x, y, w, h, hot) {
  panelFrame(ctx, x, y, w, h, hot, '② sparse set：dense+稀疏索引', '#60a5fa');
  var n = 20;
  var cw = (w - 24) / n;
  var dy = y + 32;
  for (var i = 0; i < n; i++) {
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(x + 12 + i * cw, dy, cw - 2, 14);
  }
  ctx.fillStyle = '#93c5fd';
  ctx.font = '10px monospace';
  ctx.fillText('dense：组件按池序连续', x + 12, dy + 28);
  var sy = y + 74;
  var filled = [1, 4, 5, 9, 12, 14, 17, 19];
  for (var s = 0; s < n; s++) {
    ctx.fillStyle = filled.indexOf(s) >= 0 ? '#2563eb' : '#131c2b';
    ctx.fillRect(x + 12 + s * cw, sy, cw - 2, 14);
  }
  var phase = Math.floor(state.animT * 2) % 4;
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1;
  for (var k = 0; k < 3; k++) {
    var di = (phase * 5 + k * 6) % n;
    var si = filled[(phase + k * 2) % filled.length];
    ctx.beginPath();
    ctx.moveTo(x + 12 + di * cw + cw / 2, dy + 14);
    ctx.lineTo(x + 12 + si * cw + cw / 2, sy);
    ctx.stroke();
  }
  ctx.fillStyle = '#9db4d0';
  ctx.font = '11px monospace';
  ctx.fillText('池内各自连续，跨池=查 sparse 跳一次', x + 8, y + 104);
  ctx.fillText('增删=池内 swap，池序会被打乱', x + 8, y + 118);
}
function drawNodeLayout(state, ctx, x, y, w, h, hot) {
  panelFrame(ctx, x, y, w, h, hot, '③ Node 树：对象+children', '#f87171');
  var cx = x + w / 2;
  var rootY = y + 34;
  var gy = y + 58;
  var gx = [x + 44, cx, x + w - 44];
  var ly = y + 86;
  var n = 21;
  var step = (w - 24) / n;
  ctx.strokeStyle = '#33415c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  var g, l, lx;
  for (g = 0; g < 3; g++) { ctx.moveTo(cx, rootY); ctx.lineTo(gx[g], gy); }
  for (g = 0; g < 3; g++) {
    for (l = 0; l < 7; l++) {
      lx = x + 12 + (g * 7 + l) * step + step / 2;
      ctx.moveTo(gx[g], gy);
      ctx.lineTo(lx, ly);
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.beginPath(); ctx.arc(cx, rootY, 4, 0, 6.283); ctx.fill();
  for (g = 0; g < 3; g++) {
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath(); ctx.arc(gx[g], gy, 3, 0, 6.283); ctx.fill();
  }
  var head = Math.floor(state.animT * 10) % n;
  for (var i = 0; i < n; i++) {
    ctx.fillStyle = i === head ? '#ffffff' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(x + 12 + i * step + step / 2, ly, i === head ? 3.5 : 2.5, 0, 6.283);
    ctx.fill();
  }
  ctx.fillStyle = '#9db4d0';
  ctx.font = '11px monospace';
  ctx.fillText('白点=递归读头，每节点一跳指针', x + 8, y + 104);
  ctx.fillText('Query 无索引：全树走+逐个判断', x + 8, y + 118);
}
`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li><b>读满遍历：</b>默认就是场景①。三根柱子通常 archetype 最矮、Node 树最高。对着底部示意图数一数：archetype 一整帧是「直读」，Node 树是「children 一跳 + 对象字段一跳 + 每节点一次自带方法调用」——柱子的高度差就是跳的价。</li>
  <li><b>看查询命运：</b>按 <code>2</code>。archetype 的柱子断崖式变矮（只扫带 Extra 的那几块，块外零浪费）；Node 树几乎纹丝不动（全树照走，多数节点白判断一次）；sparse set 降到 3000 但每条要跳两次索引。<b>「查询便宜」是布局送的，不是代码送的。</b></li>
  <li><b>看增删的疼：</b>按 <code>3</code>。增删不计入柱子，但右侧「增删/搬家」账本在涨：archetype 跨组合要搬家（拷数据），sparse set 增删本身便宜但池序越搅越乱（跳的落点越来越散），Node 树只是 children 里一次挪动。按 <code>C</code> 注入一次 2000 的批量增删，再对比柱子与账本。</li>
  <li><b>数跳数：</b>按 <code>Q</code>/<code>E</code> 聚焦某个存储，对照示意图数「遍历一条数据要跨几条箭头」；再按 <code>1</code>/<code>2</code> 对比同一存储两种场景的访问量差异。</li>
  <li><b>调块大小：</b>把代码里的 <code>CHUNK_CAP</code> 从 256 改成 64（按 Ctrl+Enter 重跑）：满遍历柱子几乎不变——顺序读还是顺序读；但块数量翻 4 倍、开块回收更频繁。体会「块大小」是 archetype 的真实调参项。</li>
  <li><b>反向一问：</b>Node 树这么慢，为什么 Godot 不换？带着这个问题去源码走读——答案不在性能，在「人」。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：Node 世界观的源码对照',
      files: [
        { path: 'core/object/object.h', note: '每个 Node 的地基：一个堆上完整对象。看 notification() 到 _notification 的虚函数分发——「每节点一次自带行为调用」在 C++ 里就是它；再看 ObjectID _instance_id 与 ObjectDB——引擎全局维护一张「ID → 对象指针」登记表，跨系统引用全靠查表加跳转，这正是 Node 世界里「稀疏索引」的影子（呼应主线 L2.1/L2.2）。建议搜索：notification、get_instance_id、ObjectDB。' },
        { path: 'scene/main/node.cpp', note: '子节点的持有与遍历入口：data.children 是一张按名字索引的 HashMap，而 data.children_cache 是一块按需重建的平铺 LocalVector——树自己也要缓存一块连续数组才跑得动（呼应 L3.2 的连续性）。看 add_child / remove_child 怎么维护这两份结构，看 _propagate_ready / _propagate_enter_tree 系列如何递归下钻、逐子调用——本课 Node 沙盘的「每节点一跳」在引擎里就是这条路径。建议搜索：children_cache、_propagate_ready、add_child。' },
        { path: 'core/templates/paged_array.h', note: 'Godot 自带的「分块连续数组」：一页 = 一段连续内存，页与页串成逻辑数组，page = index 右移 shift 两步定位。它正是 archetype「按组合分块、块内连续」在容器层面的同构物——Godot 不内置 ECS，但数据导向的容器思想它自己一直在用（呼应 L3.2 的 SoA）。建议搜索：page_size、PagedArrayPool。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>同一批实体，三种存储，三种命运。把结论钉回三个灵魂拷问：</p>
<ul>
  <li><b>数据怎么流动？</b>遍历的形状由布局决定：archetype 里系统是一段顺着连续数组的直线流；sparse set 里是「扫一张表、隔索引跳另一张表」；Node 树里是递归下钻、每节点一次指针跳加一次自带方法调用。<b>布局平，数据流就直；布局散，数据流就跳——系统代码长什么样，是它的存储决定的。</b></li>
  <li><b>所有权归谁？</b>archetype 的槽归原型块所有：实体换组合=搬家，块空=回收；sparse set 里实体 id 归全局、组件槽归各池，增删各池自行 swap；Node 树里子节点归父节点持有，删父=级联删子——树的层级同时就是所有权链（L2.2 的对象释放、L2.3 的内存管理都挂在这条链上）。</li>
  <li><b>什么时候发生？</b>布局是实体进出场时的一次性决定，遍历成本是它每帧付的利息：Query 在 archetype 是每帧开头挑块、在 sparse set 是每帧扫最小池加跳索引、在 Node 树是每帧全树走加逐个判断——谁也逃不掉每帧重付，区别只在利率。</li>
</ul>
<p>下一课 C2 就把这些判断压进 200 行 JS：手写 archetype 存储 + 位掩码 Query + 纯函数 System。本课沙盘里的每一根柱子，到那节课都会变成你亲手写出的代码。</p>`
    }
  ]
}
