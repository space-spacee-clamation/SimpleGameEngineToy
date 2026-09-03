// L3.2 · 引擎数学库设计：SIMD、缓存与布局
export default {
  id: 'L3.2',
  title: '引擎数学库设计：SIMD、缓存与布局',
  est: '1.5 小时',
  coreQuestions: [
    '一次「批量更新一万个对象的位置」在内存里到底发生了什么——为什么数学类型的「布局」本身就是性能契约，不只是接口？',
    '数据并行时，AoS（结构数组）与 SoA（分量平铺）谁替计算挡在了内存前面？只更新一个分量时，差距有多大？',
    'SIMD 为什么和 SoA 是天生一对？一条指令算 1 个数和一次算 4 个数，卡点到底在哪一步？',
    'Godot 主干坚持把 Vector3 保留成紧凑 3 分量、又给数学函数打上 _ALWAYS_INLINE_——「什么时候值得优化、什么时候不值得」它怎么回答？'
  ],
  sections: [
    {
      type: 'text',
      title: '教科书数学 vs 引擎数学：同一行代码，两种命运',
      html: `<p>教科书里的数学库长这样：一个 <code>Vector3</code> 有 <code>x/y/z</code>，<code>operator+</code> 逐分量相加，正确性证明完就翻篇。引擎里同一行 <code>pos = pos + vel * dt</code>，命运却完全不同——因为它不是一次算一个向量，而是一帧要算<b>十万个</b>。这时候真正决定帧率的是三件事：<b>数据怎么摆（布局）、CPU 一次能吞多少（SIMD）、缓存里还剩多少没被踢掉（cache）</b>。这正是本课和教科书分道扬镳的地方。</p>
<p>换个角度问那三个灵魂拷问：一个位置更新<b>不是</b>「一次函数调用」，而是「把 N 个向量从内存拖进寄存器、各加一次、再拖回内存」的搬运工。搬运的成本取决于它们在内存里<b>怎么排</b>。排错了，CPU 大部分时间在等内存；排对了，ALU 才会真正热起来。教科书画的是向量箭头，引擎设计的是<b>内存里字节的排布</b>。</p>
<h4 style="margin:14px 0 6px;color:#9fc3ff">差异一：元素大小 × 缓存行 —— 48 字节 vs 4 字节</h4>
<p>CPU 从不按「一个变量」取内存，它永远成块地取，一块叫<b>缓存行（cache line）</b>，主流平台是 <b>64 字节</b>。你访问 1 个字节，硬件把包含它的整条 64 字节一起搬进 L1。于是一切设计的原点是：<b>我辛苦搬进来的这 64 字节，有多少是我真正要用的？</b></p>
<table>
  <tr><th>布局</th><th>内存里怎么排</th><th>只更新 x 分量时</th></tr>
  <tr><td><b>AoS</b>（结构数组 / Array of Structs）</td><td>每对象 48 字节连在一起：x y z + 其它字段</td><td>每搬 64 字节只用到一点点 x，利用率 <b>≈ 4/48</b></td></tr>
  <tr><td><b>SoA</b>（分量平铺 / Struct of Arrays）</td><td>所有 x 挨着放、所有 y 挨着放……</td><td>一条 64B 行装满 16 个 x，<b>整行全用到</b></td></tr>
</table>
<p>AoS 里对象字段挤在一起（对象局部性好，适合「处理一个对象的各个属性」），一旦你要「对所有对象的同一属性做同一件事」，就变成隔着一堆用不到的字段跳着读——每次跳都拖进一整行却只用几字节。SoA 把这批分量收拢到一条连续带子上，扫描时缓存行利用率直接拉满。这就是为什么物理、粒子、剔除这类<b>批量同类运算</b>的系统偏爱 SoA。</p>`
    },
    {
      type: 'text',
      title: 'SIMD：一条指令喂饱四个数',
      html: `<p>普通 CPU 一条加法指令算一对数（标量）。<b>SIMD</b>（Single Instruction, Multiple Data，SSE/AVX/NEON）把寄存器拉宽成 128/256 位，一条指令同时处理 4 个 float——<b>同一条 ADD，喂 4 个数据</b>。理论上一批向量加法可以快近 4 倍。但收益能不能兑现，卡在同一个地方：<b>这 4 个数在内存里得是连续的。</b></p>
<pre>标量： for(i=0;i&lt;N;i++){ ax+=vx[i]; ay+=vy[i]; az+=vz[i]; }   // N 次循环，一次次 load/add/store
SIMD： 一次 load 4 个 x 分量 → 1 条指令 → 4 个结果
        要求 x 分量在内存里紧挨着 —— 只有 SoA 给得出来</pre>
<p>这正是 SoA 与 SIMD <b>天生一对</b>的原因：一条 <code>load_ps</code> 要一次读入连续的 4 个 float。AoS 里 <code>x0,y0,z0,?,?,x1,...</code> 交错排布，想攒齐 <code>x0,x1,x2,x3</code> 得先做<b>反交错（de-interleave / shuffle）</b>把散落的 x 拼进一个宽寄存器，拼装的开销常常把 4 倍加速吃回去大半。SoA 因为 x 本就挨着，load 完即用，SIMD 才算得动。</p>
<h4 style="margin:14px 0 6px;color:#9fc3ff">Godot 的取舍：把该做的做完，把不该做的留下</h4>
<p>有意思的是，Godot 主干<b>没有</b>把 <code>Vector3</code> 补齐成 4 分量（W）来做「手动 SIMD」——它老老实实是 <code>x,y,z</code> 三个 float（12 字节），并在头文件里用 <code>static_assert</code> 钉死三者连续。<b>4 对齐的 Vector4</b> 才是给 SIMD 用的；3 分量的 Vector3 若硬塞进 SIMD 寄存器要么浪费一个槽、要么破坏 SoA 对齐。Godot 的哲学是：基础数学类型保持小而干净，把<b>批量热路径</b>交给会用的模块（如粒子、渲染的 SoA 数组、Job System）自己向量化，再用 <code>_ALWAYS_INLINE_</code> 逼编译器把函数体展开、留下可供<b>自动向量化</b>识别的直线代码。什么时候值得手动 SIMD、什么时候交给编译器和布局——本身就是一种设计判断。下一节的双联沙盘，会把这些数字亲手跑出来。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'simd-layout',
      title: '实验：内存布局 × SIMD 双联沙盘',
      height: 520,
      code: `// 左半：N=64 实体的位置数据，只批量更新 x 分量
//   Tab / L 键：切换 AoS（结构数组）与 SoA（分量平铺）
//   把内存画成 64B 缓存行色块，统计「加载了几行、命中率」
// 右半：SIMD 4-lane 面板，同一段加法
//   标量按周期一根根点亮 vs 一条 SIMD 指令四路并行
// 空格：重放两条时间线
// (纯 JS + Canvas 2D；不碰 DOM、不用随机、不建定时器)

var N = 64;          // 实体数量
var ELEM = 48;       // AoS 里一个实体占的字节数（x y z + 其它字段）
var LINE = 64;       // 缓存行字节数
var F4 = 4;          // float 字节数

function linesFor(bytes){ return Math.ceil(bytes / LINE); }

engine.run({
  setup: function (state) {
    state.aoS = true;    // 当前布局
    state.p = 0;         // 左侧扫描进度 0..1
    state.cyc = 0;       // 右半：已消耗的周期数
    state.running = true;
    state.rate = 22;     // 每秒推进多少个「周期」
  },

  update: function (state, dt, input) {
    if (input.pressed('Space')) { state.p = 0; state.cyc = 0; state.running = true; }
    if (input.pressed('Tab')) state.aoS = !state.aoS;
    if (input.pressed('KeyL')) state.aoS = !state.aoS;

    if (state.running) state.cyc += dt * state.rate;
    if (state.cyc >= 68) { state.cyc = 0; }

    // 左侧扫描指针与布局对齐，跑满一轮再重跑
    if (state.running) {
      state.p += dt * 0.55;
      if (state.p > 1) state.p = 1;
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('内存布局 × SIMD 双联沙盘', 12, 20);

    // 左半几何
    var lX = 10, lY = 44, lW = 330;
    var rX = 358, rY = 44;

    // ---------- 左：布局与缓存行 ----------
    ctx.fillStyle = '#c7d3e6';
    ctx.fillText(state.aoS ? '当前布局：AoS（结构数组）' : '当前布局：SoA（分量平铺）', lX, lY);
    var desc = state.aoS ? '每对象 48B 连排，只 x 有用' : 'x 分量连续 256B，整行皆有用';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText(desc, lX, lY + 16);

    // 用一个窗口展示前 4 条缓存行 = 256 字节
    var winBytes = 256;
    var winH = 108;
    var wy = lY + 28;
    var px = lW / (winBytes / F4);   // 每个 float 槽宽（4 字节一格）
    var cellH = winH / 4;

    // 背景
    ctx.fillStyle = '#0f1723';
    ctx.fillRect(lX, wy, lW, winH);

    if (state.aoS) {
      // 画 ELEM=48 字节的实体块：x 用绿色，其余字节用灰
      var bytesShown = 0, idx = 0;
      // 逐字节绘制：x=绿（每 48B 起首 4B），其它=灰蓝
      for (var b = 0; b < winBytes; b += F4) {
        var slot = idx;                 // 第几个 float 槽
        var isX = (b % ELEM) === 0;
        var loaded = (b / winBytes) <= state.p;
        if (isX) ctx.fillStyle = loaded ? '#34d399' : '#194b3a';
        else ctx.fillStyle = loaded ? '#5a4b18' : '#20283a';
        var cx = lX + slot * px;
        ctx.fillRect(cx, wy + cellH * 0, Math.max(1, px - 0.6), winH);
        idx++;
        void bytesShown;
      }
    } else {
      // SoA：64 个 x 连续，占 256B = 4 条满行，全部绿色
      var j = 0;
      for (var b2 = 0; b2 < winBytes; b2 += F4) {
        var loaded2 = (b2 / winBytes) <= state.p;
        ctx.fillStyle = loaded2 ? '#34d399' : '#194b3a';
        ctx.fillRect(lX + j * px, wy, Math.max(1, px - 0.6), winH);
        j++;
      }
    }

    // 缓存行分隔线（每 64B = 16 槽）
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var k = 0; k <= winBytes; k += LINE) {
      var lx = lX + (k / F4) * px;
      ctx.moveTo(lx, wy - 3);
      ctx.lineTo(lx, wy + winH + 3);
    }
    ctx.stroke();

    ctx.fillStyle = '#7d93b3';
    ctx.fillText('红框 = 64B 缓存行', lX, wy + winH + 16);
    ctx.fillText('绿 = 本次要用的 x 分量  灰黄 = 被搬进却没用到', lX, wy + winH + 32);

    // 统计整段 N 个实体
    var totAoS = N * ELEM, totSoA = N * F4;
    var used = N * F4;
    var linesAoS = linesFor(totAoS), linesSoA = linesFor(totSoA);
    var utilAoS = Math.round(used / (linesAoS * LINE) * 100);
    var utilSoA = Math.round(used / (linesSoA * LINE) * 100);
    var sy = wy + winH + 52;
    ctx.font = '12px monospace';
    ctx.fillStyle = state.aoS ? '#f59e0b' : '#34d399';
    ctx.fillText('AoS：加载 ' + linesAoS + ' 行 / 命中率 ' + utilAoS + '%', lX, sy);
    ctx.fillStyle = state.aoS ? '#34d399' : '#f59e0b';
    ctx.fillText('SoA：加载 ' + linesSoA + ' 行 / 命中率 ' + utilSoA + '%', lX, sy + 18);
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('同样 64 次加法，SoA 少读 ' + (linesAoS - linesSoA) + ' 条缓存行', lX, sy + 36);
    ctx.fillStyle = '#5b7397';
    ctx.fillText(state.aoS ? '差距：AoS 搬运浪费巨大(每行仅 x 有用)' : '差距：SoA 满行利用，喂给 SIMD 最省', lX, sy + 54);

    // 中缝分隔
    ctx.strokeStyle = '#1e2a3d';
    ctx.beginPath();
    ctx.moveTo(349, 12);
    ctx.lineTo(349, engine.H - 12);
    ctx.stroke();

    // ---------- 右：SIMD 4-lane ----------
    ctx.font = '13px monospace';
    ctx.fillStyle = '#c7d3e6';
    ctx.fillText('SIMD 4-lane：同一段向量加法', rX, rY);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('一条 ADD 一次吞 4 个 x', rX, rY + 16);

    // 标量按周期点亮：需要 64 拍
    var sY = rY + 34;
    var sW = 340;
    ctx.fillStyle = '#c7d3e6';
    ctx.fillText('标量：1 数/周期', rX, sY + 4);
    var scellW = sW / N;
    for (var si = 0; si < N; si++) {
      var done = si < state.cyc;
      ctx.fillStyle = done ? '#f87171' : '#2a2233';
      ctx.fillRect(rX + si * scellW, sY + 12, Math.max(1, scellW - 0.5), 14);
    }

    // SIMD：16 组，每组 4 lane，1 组/周期，需要 16 拍
    var mY = sY + 42;
    ctx.fillStyle = '#c7d3e6';
    ctx.fillText('SIMD：4 数/指令', rX, mY);
    var groups = N / 4;
    var gW = (sW / groups);
    var laneH = 6;
    for (var gi = 0; gi < groups; gi++) {
      var gDone = gi < Math.floor(state.cyc);
      var px0 = rX + gi * gW;
      for (var ln = 0; ln < 4; ln++) {
        ctx.fillStyle = gDone ? '#34d399' : '#1d3350';
        ctx.fillRect(px0, mY + 8 + ln * (laneH + 2), Math.max(1, gW - 1.5), laneH);
      }
    }

    // 周期刻度
    var tY = mY + 44;
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('已用周期 ' + Math.floor(state.cyc) + '  标量进度 ' + Math.min(N, Math.floor(state.cyc)) + '/' + N + '  SIMD进度组 ' + Math.min(groups, Math.floor(state.cyc)) + '/' + groups, rX, tY + 10);

    ctx.font = '12px monospace';
    var scEnd = Math.min(N, Math.floor(state.cyc));
    var simdEnd = Math.min(N, Math.floor(state.cyc) * 4);
    ctx.fillStyle = '#f87171';
    ctx.fillText('标量还剩 ' + (N - scEnd) + ' 个没加', rX, tY + 32);
    ctx.fillStyle = '#34d399';
    ctx.fillText('SIMD 还剩 ' + Math.max(0, N - simdEnd) + ' 个没加 → 约 4× 提前', rX, tY + 50);

    // 布局提示
    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px monospace';
    ctx.fillText('空格：重放   L / Tab：切换布局', 10, engine.H - 10);
  }
});
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>在沙盘左半按 <code>L</code>：盯着「命中率」从 <b>8%</b>（4/48 附近）跳到 <b>100%</b>。同样是 64 次 x 分量加法，AoS 要拖 48 条缓存行、SoA 只拖 4 条——<b>数据怎么摆，直接决定了搬运成本</b>。</li>
  <li>看右半两条时间线：标量一格一格点亮、SIMD 一格点四个。把「已用周期」读出声——SIMD 大约 1/4 的周期就跑完 N 个加法。但注意：SIMD 那面板假设的是 <b>SoA 的 x</b>（连续 4 个数），换成 AoS 就得多一步把散落的 x 拼进宽寄存器。</li>
  <li>反向思考：如果任务是「给<b>单个</b>对象同时读它的 x、y、z、名字、血量」，AoS 反而赢——因为它把这些字段挨着放，一次缓存行全命中。SoA 会为了凑齐一个对象的各属性去读 6 条不同分带。<b>没有绝对好坏，取决于「按对象纵向读」还是「按属性横向扫」。</b></li>
  <li>想一想第 8 阶段 Job System：一个 SoA 数组切成 4 段丢给 4 个 worker，段与段之间没有共享字节、连缓存行都不跨界写——这叫<b>避免伪共享（false sharing）</b>。SoA 的连续布局让任务切分几乎零摩擦。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：Godot 怎么摆数据、怎么逼出 SIMD',
      files: [
        { path: 'core/math/vector3.h', note: '看结构体本体与 operator[]：x/y/z 三个 float 紧挨着，头文件用 static_assert 钉死连续布局（offsetof x=0,y=1,z=2、sizeof==3*4）。Godot 故意不补第 4 分量——把 SIMD 交给会用的模块和布局自己负责。这就是「布局即契约」的活教材。' },
        { path: 'core/typedefs.h', note: '找编译相关的宏 _ALWAYS_INLINE_ / _FORCE_INLINE_ / _NO_INLINE_：math 头里几乎每个小函数都带 _FORCE_INLINE_，目的是让函数体被展平成直线代码，编译器才有机会自动向量化。SIMD 不总是手写 intrinsics，逼出自动向量化的这一环同样关键。' },
        { path: 'core/math/math_funcs.h', note: 'lerp / snapped / is_zero_approx 这些标量参照实现：它们是「教科书那一层」的正确性代码。热批量路径往往绕开单元素函数、直接在 SoA 数组上写循环去自动向量化——同一个数学库，冷热两条路，读时要分清哪段会被反复执行。' }
      ]
    },
    {
      type: 'text',
      title: '小结：数学库设计是内存布局的艺术',
      html: `<p>教科书只回答「这个算法对不对」，引擎数学库还要回答<b>「这批数据在内存里怎么走」</b>。把三个灵魂拷问落到本课：</p>
<ul>
  <li><b>数据怎么流动</b>：一次批量更新不是「一次函数调用」，而是「缓存行 → 寄存器 → ALU → 缓存行」的流水线；AoS/SoA 决定流水线上每一搬有多少是白搬的。SoA 让「按属性横向扫」时几乎全程满载。</li>
  <li><b>所有权归谁</b>：连续 SoA 数组通常归属某个系统（粒子池、Job System 的一段切片）独占，边界清晰；共享写同一缓存行会诱发伪共享，切分时要把边界对齐到行。</li>
  <li><b>什么时候发生</b>：布局在<b>设计/构造期</b>就定死（换布局代价极高，所以 Vector3 的 12 字节不会临场改）；SIMD 向量化发生在<b>编译期</b>（内联 + 直线代码，或热路径手写 intrinsics），逐帧在<b>数据并行的批量阶段</b>兑现收益。</li>
</ul>
<p>一句话收束：<b>引擎数学库不是把向量算得更准，而是把百万个向量的字节排得更省。</b>下一课 L3.1 我们进入旋转的表示与四元数——那里同样会看到「为布局与数值稳定做的设计取舍」。</p>`
    }
  ]
}