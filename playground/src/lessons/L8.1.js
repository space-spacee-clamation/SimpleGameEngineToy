// L8.1 · 多线程与 Job System：任务并行
export default {
  id: 'L8.1',
  title: '多线程与 Job System：任务并行',
  est: '2.5 小时',
  coreQuestions: [
    '一帧的活被拆成任务图后，数据是怎么在主线程与 worker 之间流动的？谁把任务交给谁、谁又把结果交回给谁？',
    '一个任务运行期间写到的那份数据，所有权归谁？为什么 Godot 的场景节点默认不许 worker 线程碰？',
    '任务的派发、等待、唤醒分别在什么时候发生？worker 空闲时在干什么，主线程等结果时又在干什么？',
    '为什么 worker 从 4 加到 8 往往提不了速？临界路径和任务粒度各自在什么时刻成为瓶颈？'
  ],
  sections: [
    {
      type: 'text',
      title: '先划清一件事：Job System 并行的是「时间」，不是「空间」',
      html: `<p>用过引擎的人大概都听过一句话：「把耗时逻辑丢到别的线程去」。这句话含糊得可怕，因为它同时混着两种完全不同的并行。</p>
<p><b>数据并行（按空间切分）</b>：一份工作被切成 N 片互不相干的元素，每个 worker 拿一片，做完即散。Godot 物理里给所有约束做 setup、可见性剔除按 bin 切片，全是这一类。<br>
<b>任务并行（按时间切分）</b>：一帧里有若干件<i>性质不同</i>的活（AI、寻路、动画采样、剔除、粒子），它们之间只有先后依赖，于是让空闲的线程去领下一件能干的事。业界说的 Job System / task graph 就是这个东西，也是本课的主角。</p>
<p>两者的共同前提只有一条：<b>同一块内存不能有两个线程同时在写</b>。这不是性能建议，是正确性红线；一旦你打算开第二个线程，这条就从「洁癖」变成「契约」。所以本课的重点不在「怎么并行」，而在<b>边界在哪、谁拥有数据、什么时候交接</b>。`,
    },
    {
      type: 'text',
      title: '一帧的解剖：主线程、渲染提交、worker 池各管哪一段',
      html: `<p>把 Godot 桌面端的一帧拆开看，线程归属其实泾渭分明：</p>
<table>
  <tr><th>阶段</th><th>跑在哪个线程</th><th>能否并行</th><th>原因</th></tr>
  <tr><td>取输入事件、窗口消息泵</td><td>主线程（OS 要求）</td><td>不能</td><td>Win32 消息循环绑死在创建窗口的那个线程上</td></tr>
  <tr><td>脚本 _process、场景树遍历</td><td>默认主线程</td><td>可按节点组 opt-in 到 worker</td><td>Node 与场景树结构非线程安全</td></tr>
  <tr><td>物理 step：约束 setup、island 求解</td><td>worker 池 group task</td><td>能，天然可切</td><td>island 之间互不牵连；但 pre-solve 那段源码注释明说「涉及线程不安全处理，所以不上线程」</td></tr>
  <tr><td>可见性剔除 / 场景剔除</td><td>worker 池 group task</td><td>能，但有阈值</td><td>bin 里的实例数超过 thread_cull_threshold 才值得发任务，否则就地同步做更快</td></tr>
  <tr><td>着色器编译、SDF 生成、纹理压缩</td><td>worker 池，多为低优先级</td><td>能，接近纯函数</td><td>可中断、可延后，不该抢帧内预算</td></tr>
  <tr><td>命令缓冲提交 + present</td><td>主线程（Godot 4 默认）</td><td>不在这一层并行</td><td>图形驱动 API 大多单线程亲和；跨设备并行交给多 queue</td></tr>
  <tr><td>GPU 真正执行命令流</td><td>显卡</td><td>与 CPU 全程重叠</td><td>提交完 CPU 就自由了，这是最便宜的一层并行</td></tr>
</table>
<p>注意倒数第二行那个反直觉的事实：<b>Godot 4 并没有一条常驻的「渲染线程」在替主线程画画面</b>（那是 Godot 3 时代的分离线程模型）。今天 CPU 侧的 draw call 提交仍在主线程，靠 <code>release_rendering_thread()</code> 这类接口跟 OS 的窗口上下文握手；真正与 CPU 并行的是 GPU。换句话说，「渲染并行」早就发生了，只不过发生在<b>设备边界</b>上，而不是线程边界上。</p>
<p>那 worker 池算不算「渲染线程」？半个：它是常驻的通用工人池，渲染层的剔除、shader 编译只是它的<b>客户</b>之一。这决定了它的设计取向——它不是渲染专属线程，而是一个谁都能来投递一块活的公共劳务市场。`,
    },
    {
      type: 'text',
      title: 'WorkerThreadPool：劳务市场的三件套',
      html: `<p>读 <code>core/object/worker_thread_pool.h</code> 只要抓住三个概念。</p>
<p><b>① Task = 一次雇佣合同。</b>字段一目了然：<code>Callable callable</code>（或一个 C 函数指针 <code>native_func</code> 加 <code>void* userdata</code>）、<code>String description</code>（Profiler 里看到的那行字）、<code>Semaphore done_semaphore</code>（雇主等回执）、<code>bool completed : 1</code>。注意它<b>没有</b>「返回值」字段——任务的结果必须写回调用方自己准备好的那块内存里。这就是所有权的交接点：你把数据借出去，对方就地写回来，还你一个「完成了」的信号。</p>
<p><b>② Group = 一批同质的工分。</b><code>_add_group_task(..., int p_elements, int p_tasks, ...)</code> 建一个 Group（原子计数器 <code>index</code>、目标数 <code>max</code>、完成计数 <code>completed_index</code>、一把 <code>done_semaphore</code>），然后一次性投出 <code>p_tasks</code> 个 Task，而这些 Task <b>不预分配工作内容</b>。每个 Task 被某个 worker 拿到后进循环：<code>work_index = group-&gt;index.postincrement()</code>，抢到几号就干第几号元素，越界才退出。<b>这叫动态领工（claim-on-demand），是负载均衡的真身</b>：慢的工人自然少领几件，快的多领几件，不需要调度器预先均分——预先均分恰恰是负载不均的来源。</p>
<p><b>③ 两条队列 + 轮转唤醒。</b>成员里摆着 <code>task_queue</code> 与 <code>low_priority_task_queue</code> 两条 SelfList，外加一句极诚实的注释：<code>uint32_t notify_index = 0; // For rotating across threads, no help distributing load.</code> 轮转指针只保证「不被同一个工人反复打扰」，<b>对负载均衡一点帮助都没有</b>；均衡全靠上面那个原子计数器。低优先级配额在 init 里算出（<code>max_low_priority_threads = CLAMP(threads * ratio, 1, threads - 1)</code>），游戏运行时比例很小、编辑器里直接给 0.75——编辑器要的就是「别抢我的交互帧」。</p>
<p>还有两个细节值得记：Task 与 Group 用 <code>PagedAllocator</code> 分页分配（一帧几百个小任务，逐个 new 会把缓存线踩烂）；<code>CACHE_LINE_BYTES</code> 在 <code>thread.h</code> 里被显式定义成硬件干扰宽度（编译器不给就用保守的 128）——热路径上的原子计数器和每线程状态必须各占一条缓存线，否则两个核互相把对方的 cache line 打失效，多线程反而比单线程慢。`,
    },
    {
      type: 'text',
      title: '任务图与它的三条铁律',
      html: `<p>有了劳务市场，还缺一张图。<b>任务图（task graph）就是一张 DAG：节点是任务，边是「A 的输出是 B 的输入」这条数据依赖。</b>调度规则可以写成五行伪码：</p>
<pre>tick:
  for t in tasks: if 所有前驱都 completed 且 t 未派发 -> 入队
  for w in workers: if w 空闲 且 队列非空 -> 队首交给 w
  for 运行中的 t: t.remaining -= 1        // 时间片推进
  完成的 t 点亮，解锁其后继</pre>
<p>由此得到三条铁律，也就是本课实验台要你亲手撞上的三堵墙。</p>
<p><b>铁律一：加速比的上限是临界路径，不是 worker 数量。</b>临界路径（critical path）是图中最长的那条依赖链——它无论多少人都只能串行走完。若一帧总工作量 100 tick、最长链 40 tick，那么 8 个 worker 也只能压到 40 tick，加速比封顶 2.5 倍。这就是 Amdahl 定律在任务图上的形状：分子是总量，分母里那个不可并行的常数项才是杀手。</p>
<p><b>铁律二：收益会被派发成本吃掉，所以存在「最小经济任务规模」。</b>一次 add_task 要走完整套礼仪：拿 <code>task_mutex</code> → 入队 → <code>_notify_threads</code> 找空闲线程 → <code>cond_var.notify_one()</code> 唤醒一条睡死的 OS 线程 → 工人跑完再 post 信号量唤醒等待者。唤醒一条真正睡着的线程是微秒级的贵操作。Godot 在可见性剔除里就是这么判定的：<b>bin 里的实例数不超过 <code>thread_cull_threshold</code> 就直接在当前线程同步做掉</b>。实验台里那颗「任务粒度」开关就是这条盈亏线的可视化。</p>
<p><b>铁律三：等待的人不该干等。</b>池内线程调 <code>wait_for_task_completion</code> 时走 <code>_wait_collaboratively</code>：一边等自己的任务，一边从 <code>task_queue</code> 里捞别人的活来干，捞不到才 <code>cond_var.wait</code> 睡下；而普通用户线程（例如主线程的非池路径）只能睡在 <code>done_semaphore</code> 上等回执。<b>「等待」被变成了「顺便打工」</b>，这是现代 job system 防空转的标准手法，也解释了为什么实验台上 worker 的空闲色会成片出现——那是协作没做起来的样子。</p>
<p>最后是所有权。任务运行期间它写的那块内存归它独占（group 里每个 work_index 对应不相交的元素区间，正是为了让「独占」可以按索引证明）。Godot 用一组显式闸门兜底：<code>Thread::is_main_thread()</code> 做断言、<code>set_current_thread_safe_for_nodes(false)</code> 标记当前线程能否碰 Node、<code>MessageQueue::set_thread_singleton_override(nullptr)</code> 把 deferred call 队列换成线程局部的空实现，防止 worker 里发出的延迟调用串味到主线程。而 <code>SceneTree::_process_groups_thread</code> 那条路径更直白：只有你在 Inspector 里把某个节点标成 In Sub Thread，它那一整棵子树的 _process 才会被打包成 group task 丢进池里；默认情况一切照旧在主线程串行。</p>`,
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'jobgraph',
      title: '实验：一帧的任务图调度台',
      height: 560,
      code: `// 一帧的任务图调度台：模拟并行，不真开线程
// 空格：自动播放 / 暂停       S：手动推进一个调度 tick
// 数字键 1/2/4/8：切换 worker 数      G：切换任务粒度（粗批 / 细拆）      R：重置本帧
// 看点：灰色长条 = 空闲 worker（空转）；红框 = 临界路径上的任务；右下是加速比与空闲率

engine.run({
  setup: function (state) {
    state.nw = 4;
    state.granularity = 0;   // 0 = 粗批（大任务），1 = 细拆（每步切成两半，但要付派发开销）
    state.auto = false;
    buildFrame(state);
  },

  update: function (state, dt, input) {
    var i, busy = 0;
    if (input.pressed('Digit1')) { state.nw = 1; buildFrame(state); }
    if (input.pressed('Digit2')) { state.nw = 2; buildFrame(state); }
    if (input.pressed('Digit4')) { state.nw = 4; buildFrame(state); }
    if (input.pressed('Digit8')) { state.nw = 8; buildFrame(state); }
    if (input.pressed('KeyG')) { state.granularity = state.granularity === 0 ? 1 : 0; buildFrame(state); }
    if (input.pressed('KeyR')) { buildFrame(state); }
    if (input.pressed('Space')) { state.auto = !state.auto; }
    var stepping = input.pressed('KeyS');

    // 每个渲染帧推进一个调度 tick：这就是「模拟并行」——时间被切成等长的薄片
    if (!state.done && (state.auto || stepping)) {
      for (i = 0; i < state.workers.length; i++) { if (state.workers[i].task >= 0) busy++; }
      state.idleTicks += state.workers.length - busy;
      state.totalTicks += state.workers.length;
      runSchedulerTick(state);
    }
    if (state.done) { state.auto = false; }
  },

  draw: function (state, ctx) {
    var i, k, t, w;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('workers: ' + state.nw + '   粒度: ' + (state.granularity === 0 ? '粗批' : '细拆') + '   tick: ' + state.tick + '   ' + (state.done ? '本帧排完' : (state.auto ? '播放中' : '暂停')), 12, 20);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('空格 播放/暂停 · S 单步一格 · 1/2/4/8 改 worker 数 · G 改粒度 · R 重置', 12, 38);

    // ---- 依赖边（先画线，方块压住端头）----
    ctx.strokeStyle = '#3b526f';
    ctx.lineWidth = 1;
    for (i = 0; i < state.tasks.length; i++) {
      t = state.tasks[i];
      for (k = 0; k < t.deps.length; k++) {
        var d = state.tasks[t.deps[k]];
        ctx.beginPath();
        ctx.moveTo(d.x + d.w, d.y + d.h / 2);
        ctx.lineTo(t.x, t.y + d.h / 2);
        ctx.stroke();
      }
    }

    // ---- 任务节点 ----
    for (i = 0; i < state.tasks.length; i++) {
      t = state.tasks[i];
      var col = '#1a2438';
      if (t.state === 'run') col = '#2f6bd8';
      else if (t.state === 'ready') col = '#1f5c46';
      else if (t.state === 'done') col = '#34d399';
      ctx.fillStyle = col;
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = t.onCP ? '#f87171' : '#2f4468';
      ctx.lineWidth = t.onCP ? 2 : 1;
      ctx.strokeRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
      ctx.fillStyle = t.state === 'done' ? '#062a1e' : '#dbe6f3';
      ctx.font = '11px monospace';
      var info = t.cost + 't';
      if (t.overhead > 0) { info = info + ' +' + t.overhead + 'o'; }
      if (t.h >= 30) {                       // 方块够高才分两行写
        ctx.fillText(t.name, t.x + 5, t.y + 14);
        ctx.font = '10px monospace';
        ctx.fillStyle = t.state === 'done' ? '#0a3a2a' : '#8fa7c7';
        ctx.fillText(info, t.x + 5, t.y + 27);
      } else {
        ctx.fillText(t.name + ' ' + info, t.x + 4, t.y + 12);
      }
      if (t.state === 'run') {
        var p = 1 - t.remaining / t.cost;
        ctx.fillStyle = '#0e1728';
        ctx.fillRect(t.x + 4, t.y + t.h - 7, t.w - 8, 4);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(t.x + 4, t.y + t.h - 7, (t.w - 8) * p, 4);
      }
    }

    // ---- worker 泳道 ----
    ctx.font = '11px monospace';
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('worker 池（每格一个调度 tick）', 12, 272);
    for (i = 0; i < state.workers.length; i++) {
      w = state.workers[i];
      var y = 278 + i * 17;
      if (w.task >= 0) {
        t = state.tasks[w.task];
        ctx.fillStyle = '#101a2b';
        ctx.fillRect(78, y, 420, 14);
        ctx.fillStyle = '#2f6bd8';
        ctx.fillRect(78, y, 420 * (1 - t.remaining / t.cost), 14);
        ctx.fillStyle = '#dbe6f3';
        ctx.fillText(w.name + '  ' + t.name, 84, y + 11);
      } else {
        ctx.fillStyle = '#22303f';
        ctx.fillRect(78, y, 420, 14);
        ctx.fillStyle = '#5b7397';
        ctx.fillText(w.name + '  idle（阻塞在 cond_var.wait）', 84, y + 11);
      }
    }

    // ---- 右侧度量面板 ----
    ctx.strokeStyle = '#1e2a3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(516, 52, 194, 250);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9b8cff';
    ctx.fillText('度量', 530, 72);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('串行总量 serial', 530, 94);
    ctx.fillText('  ' + state.serialCost + ' ticks', 530, 110);
    ctx.fillText('实际 makespan', 530, 132);
    ctx.fillText('  ' + state.makespan + ' ticks', 530, 148);
    ctx.fillText('理论下限 CP', 530, 170);
    ctx.fillText('  ' + state.cp + ' ticks', 530, 186);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('加速比 ' + state.speedup.toFixed(2) + 'x', 530, 210);
    ctx.fillText('上限 serial/CP = ' + state.maxSpeedup.toFixed(2) + 'x', 530, 226);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('空闲率 ' + (idleRate(state) * 100).toFixed(0) + '%', 530, 250);
    ctx.fillStyle = '#f87171';
    ctx.fillText('红框 = 临界路径', 530, 272);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('灰条 = worker 空转', 530, 288);

    if (state.done) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '13px monospace';
      ctx.fillText('排完了：按 R 重置后改 worker 数（1/2/4/8）看加速比饱和，再按 G 换粒度对比负载均衡', 12, 434);
    }
  }
});

function idleRate(state) {
  if (state.totalTicks <= 0) return 0;
  return state.idleTicks / state.totalTicks;
}

// 一帧的任务表：col = 第几列（拓扑层次），row = 行位，cost = 工作量（tick）
var FRAME_DEFS = [
  { name: 'Input',          col: 0, row: 1, cost: 2, deps: [] },
  { name: 'PhysicsSync',    col: 1, row: 1, cost: 6, deps: [0] },
  { name: 'AI',             col: 2, row: 0, cost: 8, deps: [1] },
  { name: 'AnimSample',     col: 2, row: 1, cost: 6, deps: [1] },
  { name: 'GameLogic',      col: 2, row: 2, cost: 7, deps: [1] },
  { name: 'Cull',           col: 2, row: 3, cost: 5, deps: [1] },
  { name: 'Particles',      col: 2, row: 4, cost: 4, deps: [1] },
  { name: 'NavBake',        col: 3, row: 0, cost: 6, deps: [2] },
  { name: 'TransformFlush', col: 3, row: 2, cost: 4, deps: [3, 4] },
  { name: 'RenderSubmit',   col: 4, row: 2, cost: 5, deps: [7, 8, 5, 6] }
];

function buildFrame(state) {
  var fine = state.granularity === 1;
  var split = { AI: 2, AnimSample: 2, GameLogic: 2, Cull: 2, NavBake: 2 };
  var nodes = [], nameIdx = {}, i, j;
  for (i = 0; i < FRAME_DEFS.length; i++) {
    var d = FRAME_DEFS[i];
    var parts = (fine && split[d.name]) ? split[d.name] : 1;
    nameIdx[d.name] = [];
    for (j = 0; j < parts; j++) {
      var cost = Math.max(1, Math.round(d.cost / parts));
      nodes.push({
        name: parts > 1 ? (d.name + '-' + (j + 1)) : d.name,
        col: d.col, row: d.row, partIdx: j, parts: parts,
        cost: cost, remaining: cost, overhead: fine ? 1 : 0,
        deps: [], state: 'wait', onCP: false, estEnd: 0, estStart: 0, x: 0, y: 0, w: 78, h: 32
      });
      nameIdx[d.name].push(nodes.length - 1);
    }
  }
  // 依赖：原任务的前驱 -> 本组每个子任务；组内串成链，代表「合并点」
  for (i = 0; i < FRAME_DEFS.length; i++) {
    var tgt = nameIdx[FRAME_DEFS[i].name];
    for (j = 0; j < tgt.length; j++) {
      var node = nodes[tgt[j]];
      var head = FRAME_DEFS[i].deps;
      for (var q = 0; q < head.length; q++) {
        var src = nameIdx[FRAME_DEFS[head[q]].name];
        for (var s = 0; s < src.length; s++) {
          if (node.deps.indexOf(src[s]) < 0) node.deps.push(src[s]);
        }
      }
      if (j > 0) node.deps.push(tgt[j - 1]);
    }
  }
  layoutTasks(nodes);
  state.tasks = nodes;
  state.workers = [];
  for (i = 0; i < state.nw; i++) state.workers.push({ name: 'W' + i, task: -1 });
  state.tick = 0;
  state.makespan = 0;
  state.idleTicks = 0;
  state.totalTicks = 0;
  state.done = false;
  state.auto = false;
  state.serialCost = 0;
  for (i = 0; i < nodes.length; i++) state.serialCost += nodes[i].cost + nodes[i].overhead;
  computeCriticalPath(state);
  state.cp = 0;
  for (i = 0; i < nodes.length; i++) if (nodes[i].estEnd > state.cp) state.cp = nodes[i].estEnd;
  state.maxSpeedup = state.cp > 0 ? state.serialCost / state.cp : 1;
  state.speedup = 1;
}

function layoutTasks(nodes) {
  var colX = [14, 108, 202, 300, 400];
  var lane = {}, count = {}, i;
  for (i = 0; i < nodes.length; i++) count[nodes[i].col] = (count[nodes[i].col] || 0) + 1;
  var busiest = 1;
  for (i = 0; i < 5; i++) if ((count[i] || 0) > busiest) busiest = count[i];
  // 图区高度固定（y 52~248），列里节点越多，行距越紧、方块越矮
  var pitch = Math.max(24, Math.floor(188 / busiest));
  var boxH = Math.max(20, pitch - 6);
  for (i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    lane[n.col] = lane[n.col] === undefined ? 0 : lane[n.col] + 1;
    n.x = colX[n.col];
    n.y = 52 + lane[n.col] * pitch;
    n.h = boxH;
  }
}

// 无限资源下的最早结束时间 = 最长链长度；沿 estEnd/estStart 回溯把这条链染红
function computeCriticalPath(state) {
  var tasks = state.tasks, changed = true, guard = 0, i, k;
  for (i = 0; i < tasks.length; i++) { tasks[i].estStart = 0; tasks[i].estEnd = tasks[i].cost + tasks[i].overhead; }
  while (changed && guard < 200) {
    changed = false; guard++;
    for (i = 0; i < tasks.length; i++) {
      var t = tasks[i], s = 0;
      for (k = 0; k < t.deps.length; k++) {
        var d = tasks[t.deps[k]];
        if (d.estEnd > s) s = d.estEnd;
      }
      t.estStart = s;
      var e = s + t.cost + t.overhead;
      if (e !== t.estEnd) { t.estEnd = e; changed = true; }
    }
  }
  var end = 0;
  for (i = 0; i < tasks.length; i++) if (tasks[i].estEnd > end) end = tasks[i].estEnd;
  var stack = [];
  for (i = 0; i < tasks.length; i++) if (tasks[i].estEnd === end) stack.push(i);
  while (stack.length) {
    var ci = stack.pop(), ct = tasks[ci];
    if (ct.onCP) continue;
    ct.onCP = true;
    for (var q = 0; q < ct.deps.length; q++) {
      var pd = tasks[ct.deps[q]];
      if (pd.estEnd === ct.estStart) stack.push(ct.deps[q]);
    }
  }
}

function runSchedulerTick(state) {
  var i, k, w, t;
  // 1) 推进运行中的任务（先付派发/唤醒开销，再干活）
  for (i = 0; i < state.workers.length; i++) {
    w = state.workers[i];
    if (w.task < 0) continue;
    t = state.tasks[w.task];
    if (t.overhead > 0) { t.overhead--; continue; }
    t.remaining--;
    if (t.remaining <= 0) { t.state = 'done'; w.task = -1; }
  }
  // 2) 解锁：前驱全 done 的任务变就绪
  for (i = 0; i < state.tasks.length; i++) {
    t = state.tasks[i];
    if (t.state !== 'wait') continue;
    var ok = true;
    for (k = 0; k < t.deps.length; k++) { if (state.tasks[t.deps[k]].state !== 'done') { ok = false; break; } }
    if (ok) t.state = 'ready';
  }
  // 3) 派活：空闲 worker 从队首领任务（近似 task_queue + _notify_threads）
  for (i = 0; i < state.workers.length; i++) {
    w = state.workers[i];
    if (w.task >= 0) continue;
    for (k = 0; k < state.tasks.length; k++) {
      t = state.tasks[k];
      if (t.state === 'ready') { t.state = 'run'; w.task = k; break; }
    }
  }
  state.tick++;
  state.makespan = state.tick;
  state.speedup = state.makespan > 0 ? state.serialCost / state.makespan : 1;
  var allDone = true;
  for (i = 0; i < state.tasks.length; i++) { if (state.tasks[i].state !== 'done') allDone = false; }
  if (allDone) state.done = true;
}`
    },
    {
      type: 'text',
      title: '试一试（课内动手，不是作业）',
      html: `<ul>
  <li>按 <b>1 → 2 → 4 → 8</b> 依次加 worker（每次改数会自动重排本帧），盯右下的加速比：从 1 到 2 提升明显，4 之后基本躺平——因为 makespan 已经贴住红色的临界路径下限，多出来的工人只会增加空转。<b>这就是「worker 加倍不等于提速加倍」的现场证据</b>。</li>
  <li>按 <b>G</b> 切到细拆再重排一遍：AI / 动画 / 逻辑 / 剔除 / 寻路各切成两半，负载均衡变好、峰值空转下降，但每个子任务要多付 1 tick 派发开销（方块上的 +1o），而且组内多了一条「合并」边。粗批与细拆的胜负手取决于「省下的等待」是否大于「多付的开销」——Godot 的 <code>thread_cull_threshold</code> 就是把这条盈亏线写成了常量。</li>
  <li>按 <b>S</b> 逐格单步，数一数每一格里灰色 idle 条的数量：某一格只剩一两个任务可跑、其余 worker 全灰——那不是 bug，是<b>依赖图在这一刻不允许并行</b>。想提速只能改图（提前解锁、拆掉假依赖），不能靠人海。</li>
  <li>试着在心里改这张图：如果把 RenderSubmit 对 NavBake 的依赖去掉（渲染不必等寻路结果），最长链立刻缩短一截。真实引擎里这种「拆掉假依赖」的收益通常远大于再加两条线程。</li>
  <li>留一个思考：本实验台每 tick 只做一次「派活」决策且没有锁。真实 WorkerThreadPool 里 <code>task_mutex</code> 每次入队出队都要抢，多个 worker 抢同一条全局队列会成为新瓶颈——所以才需要 low_priority 配额、pump task、per-thread 条件变量这些减压阀。想想该给这张图加上「锁竞争」这一维吗？</li>
</ul>`,
    },
    {
      type: 'source',
      title: '源码走读：劳务市场的账本',
      files: [
        { path: 'core/object/worker_thread_pool.h', note: '看 Task / Group 两个内部结构：Task 只有 callable + done_semaphore + completed 位，没有返回值字段；Group 带着原子 index / completed_index / max 与一把 done_semaphore。再看 PagedAllocator、task_queue 与 low_priority_task_queue 两条 SelfList，以及 notify_index 那句 no help distributing load 的注释——本课三个概念全在这一个头文件里。' },
        { path: 'core/object/worker_thread_pool.cpp', note: '三段必读：_thread_function（拿不到任务就 cond_var.wait 睡下，对应实验台里的灰色 idle 条）；_process_task 里 group 分支的 while(true) + index.postincrement()（动态领工分片，负载均衡的真身，注释还写了 for groups, tasks get rid of themselves）；_notify_threads 的两轮唤醒（第一轮只叫醒没在干活的线程以保持调用栈尽量浅，第二轮才打扰正在等待的线程）。顺带看 _post_tasks：threads.is_empty() 时直接在调用线程跑掉——无线程构建的退化路径。' },
        { path: 'core/os/thread.h', note: '最薄的一层抽象：MAIN_ID = 1 与 is_main_thread()（直接比 caller_id，注释明说是为了省一点校验开销）、Priority 三档、CACHE_LINE_BYTES（拿不到 hardware_destructive_interference_size 就用 128）、PlatformFunctions 钩子（专有平台可整体替换 Thread 实现）。注意这里没有任何「渲染线程」：Godot 4 的渲染提交就在主线程，跨线程边界的事交给 worker 池与 GPU。' }
      ]
    },
    {
      type: 'text',
      title: '小结：三问三答',
      html: `<p><b>数据怎么流动？</b>主线程准备好输入数据和输出缓冲区，把「函数指针 + userdata 指针」投进 task_queue；worker 从队列摘走任务，就地把结果写回那块缓冲区，最后 post 一把 done_semaphore；主线程醒来接手继续往下游传。流动的是<b>指针与内存的所有权</b>，不是拷贝——所以每一次投递都必须回答清楚：这块内存在这段时间归谁。</p>
<p><b>所有权归谁？</b>池持有 Task/Group 对象本身（PagedAllocator 分配，group 的任务用完自己释放）；userdata 归调用方；<b>被触碰的业务数据则始终归主线程独占授权</b>——Node 默认不许 worker 碰，除非你在 Inspector 里显式把某个节点标为 In Sub Thread，而 pre-solve 这类线程不安全的段落干脆不上线程。</p>
<p><b>什么时候发生？</b>启动时 <code>WorkerThreadPool::init()</code> 一次性拉起常驻线程（默认按逻辑处理器数，编辑器里 75% 留给低优先级）；每帧按需 add_task / add_group_task，派发即入队即唤醒；等待发生在 wait_for_*_completion，而池内线程的等待会被降级成 _wait_collaboratively 的「边等边打工」。</p>
<p>带走三句话：<b>加速比由图决定，不由人数决定；粒度有盈亏线，太细会被派发开销吃光；等待者应该变成打工者。</b>下一课 L8.2 网络同步会再遇到同一套「两套时钟 + 时间债」的老问题——那时你会发现，跨机器并行与跨线程并行，难点从来是同一个：什么时候允许谁看哪份数据。</p>`,
    },
  ]
}
