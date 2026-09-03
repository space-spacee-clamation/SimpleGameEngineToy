// A1 · 连续碰撞检测 CCD：子弹为什么能穿过薄墙
export default {
  id: 'A1',
  title: '连续碰撞检测 CCD：子弹为什么能穿过薄墙',
  est: '2 小时',
  coreQuestions: [
    '子弹穿过薄墙，「没检测到」的根因是几何算错了，还是时间采样太疏了？',
    '子步细分、前瞻接触（speculative）、扫掠判定三种治法，各自的开销与代价是什么？',
    '引擎里的 CCD 为什么往往只开给「少数快速小物体」，而不是全场景默认开？'
  ],
  sections: [
    {
      type: 'text',
      title: '漏检不是几何问题，是时间采样问题',
      html: `<p>主线课 L5.1、L5.2 教会了我们「谁碰上了（broadphase→narrowphase）」和「碰上之后怎么办（冲量）」。这两段有个共同前提：<b>检测发生在某个离散时刻 t，只比较那一瞬间的包围盒/形状有没有重叠</b>。但现实里物体是<b>连续运动</b>的——我们把每帧一次的位置快照当成了运动的全部。</p>
<p>灾难就藏在两次快照的<b>间隙</b>里。假设一帧时长 dt，子弹速度 v，墙厚 w。只要 <b>v × dt &gt; w</b>，子弹这一帧的「起点」在墙左、「终点」在墙右，两个采样点都不在墙内——检测器看到的是「起点没碰，终点也没碰」，于是放行。子弹安然无恙地穿过本该拦住它的墙。这不是 SAT/GJK 算错了交点（几何全程没错），而是<b>我们根本拿错了时间点去问几何</b>。</p>
<table>
  <tr><th>速度 v × 步长 dt</th><th>相对墙厚 w</th><th>离散检测的结果</th></tr>
  <tr><td>位移 &lt; 墙厚</td><td>本帧位移覆盖进墙体</td><td>能检测到，正常</td></tr>
  <tr><td>位移 ≈ 墙厚</td><td>临界</td><td>时好时坏，看相位</td></tr>
  <tr><td>位移 &gt; 墙厚</td><td>位移越过墙体</td><td><b>漏检（tunneling）</b>，子弹穿墙</td></tr>
</table>
<p>这就把问题定性清楚了：<b>漏检是「两次采样之间的运动信息被丢弃」造成的，根子在时间采样论（temporal sampling），不在几何论</b>。所以治本的方向不是「把几何算得更准」，而是「让检测覆盖住两次采样之间那一段连续运动」——这就是<b>连续碰撞检测（Continuous Collision Detection, CCD）</b>要解决的事。</p>`
    },
    {
      type: 'text',
      title: '三种治法：子步、前瞻、扫掠',
      html: `<p>要覆盖采样间隙，工业界有三条路，代价各不相同：</p>
<ol>
  <li><b>子步细分（substepping）</b>：把 dt 切成 N 份，逐份积分、逐份检测。位移被摊薄到每份，只要 N 够大，每份位移都小于最薄的碰撞体，漏检自然消失。<b>代价：检测（和积分）开销线性 ×N</b>——而且是对<b>全场景所有物体</b>一起涨，最贵，但实现最简单、最通用。</li>
  <li><b>前瞻接触 / speculative contacts</b>：不缩小步长，而是把每个物体的「本帧位移」变成一个<b>膨胀后的包围盒</b>（起点与终点的扫掠包络），用这个膨胀盒去做 broadphase，提前把「马上要碰上」的对捞出来，再保守地提前求解。<b>一句口诀：允许提前接触，绝不允许漏过</b>。代价比子步小，但会引入「还没碰到就弹开」的虚假接触，需要去抖。</li>
  <li><b>CCD 专用形状 / 扫掠 TOI</b>：只给「又小又快」的特殊物体（如子弹胶囊）做<b>真扫掠</b>——把形状沿运动轨迹拉成一个扫掠体，与静态几何求<b>首个命中时间（time of impact, TOI）</b>，精确停靠在接触瞬间。<b>代价：扫掠体与 TOI 求解远贵于普通 discrete 检测</b>，所以只能用在少数体上，不能全开。</li>
</ol>
<p>三者互补：现代引擎通常是「<b>默认离散 + 对快速体开 CCD/扫掠 + 需要更强稳定性时再上子步</b>」。Godot 的 <code>continuous_cd</code> 属性走的就是「前瞻接触」的思路（详见源码走读）。下面这个实验台让你亲手把三种策略的穿透率与开销曲线拉出来对比。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'ccd',
      title: '实验：穿墙实验台',
      height: 600,
      code: `// 穿墙实验台：离散检测的时间盲区与三种治法
// 1/2/3 切换策略：离散 / 子步细分 / sweep 包络（前瞻接触）
// 上下方向键 调速度 50~2000 px/s   左右方向键 调墙厚 2~60 px   N/M 调子步数
// 回车 发射一枚炮弹（自动连发开关 A）  R 清空统计
// 观察：穿透数、每帧判定次数（开销）、sweep 模式下本帧扫掠胶囊

engine.run({
  setup: function (state) {
    state.mode = 0;                  // 0 离散 / 1 子步 / 2 sweep
    state.speed = 800;               // 炮弹速度 px/s
    state.wallW = 8;                 // 墙厚 px
    state.substeps = 4;              // 子步数 N
    state.auto = true;               // 自动连发
    state.fireTimer = 0;
    state.bullets = [];              // {x, r, passed, hitT}
    state.wallX = engine.W - 180;
    state.hits = 0;
    state.passes = 0;                // 穿墙（漏检）次数
    state.checks = 0;                // 本帧判定次数（开销）
    state.maxChecks = 0;
    state.lastHit = null;            // 最近一次命中可视化
    state.frames = 0;
    state.rngSeed = 12345;
  },

  update: function (state, dt, input) {
    // —— 参数调节 ——
    if (input.down('Key1')) state.mode = 0;
    if (input.down('Key2')) state.mode = 1;
    if (input.down('Key3')) state.mode = 2;
    if (input.down('ArrowUp'))   state.speed = Math.min(2000, state.speed + 25);
    if (input.down('ArrowDown')) state.speed = Math.max(50,   state.speed - 25);
    if (input.down('ArrowLeft'))  state.wallW = Math.max(2,  state.wallW - 1);
    if (input.down('ArrowRight')) state.wallW = Math.min(60, state.wallW + 1);
    if (input.pressed('KeyN')) state.substeps = Math.max(1, state.substeps - 1);
    if (input.pressed('KeyM')) state.substeps = Math.min(16, state.substeps + 1);
    if (input.pressed('KeyA')) state.auto = !state.auto;
    if (input.pressed('KeyR')) { state.hits = 0; state.passes = 0; state.maxChecks = 0; state.bullets = []; }
    if (input.pressed('Enter')) fire(state);

    // —— 自动连发 ——
    if (state.auto) {
      state.fireTimer -= dt;
      if (state.fireTimer <= 0) { fire(state); state.fireTimer = 0.55; }
    }

    this.checkCount = 0;  // 便捷计数器，传递给检测函数
    var me = this;

    // —— 推进炮弹，按策略做检测 ——
    state.lastHit = null;
    for (var i = 0; i < state.bullets.length; i++) {
      var b = state.bullets[i];
      if (b.passed) continue;  // 已穿过的不再动

      if (state.mode === 0) {
        advanceDiscrete(state, b, dt, me);   // 离散一步
      } else if (state.mode === 1) {
        advanceSubstep(state, b, dt, me);    // 子步细分
      } else {
        advanceSweep(state, b, dt, me);      // sweep 包络
      }
    }
    state.checks = this.checkCount;
    if (state.checks > state.maxChecks) state.maxChecks = state.checks;

    // 清理出屏炮弹
    var keep = [];
    for (var i = 0; i < state.bullets.length; i++) {
      if (state.bullets[i].x < engine.W + 30) keep.push(state.bullets[i]);
    }
    state.bullets = keep;
    state.frames++;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);

    // —— 墙体 ——
    var y0 = 60, y1 = engine.H - 60;
    ctx.fillStyle = '#1e2a3d';
    ctx.fillRect(state.wallX, y0, state.wallW, y1 - y0);
    ctx.strokeStyle = '#4a5f80';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(state.wallX, y0, state.wallW, y1 - y0);
    ctx.fillStyle = '#7d93b3';
    ctx.font = '12px monospace';
    ctx.fillText('墙厚 ' + state.wallW + 'px', state.wallX + 2, y0 - 8);

    // —— 判定指示灯：每帧位移 vs 墙厚 ——
    var step = state.speed * (1 / 60);
    var danger = step > state.wallW;
    ctx.beginPath();
    ctx.arc(30, 30, 7, 0, Math.PI * 2);
    ctx.fillStyle = danger ? '#ef4444' : '#34d399';
    ctx.fill();
    ctx.fillStyle = '#9db4d0';
    ctx.fillText('每帧位移 ' + step.toFixed(0) + 'px' + (danger ? '  >= 墙厚 -> 会穿' : '  < 墙厚 -> 安全'), 44, 35);

    // —— 炮弹 ——
    for (var i = 0; i < state.bullets.length; i++) {
      var b = state.bullets[i];
      if (state.mode === 2 && !b.passed && b.prevX !== undefined) {
        // sweep 模式：画出本帧扫掠胶囊（上一位置 -> 当前位置 的包络段）
        ctx.strokeStyle = 'rgba(96,165,250,0.30)';
        ctx.lineWidth = b.r * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.prevX, b.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.lineWidth = 1;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.passed ? '#64748b' : (b.hitT !== undefined ? '#fbbf24' : '#60a5fa');
      ctx.fill();
    }

    // —— 命中时刻可视化 ——
    if (state.lastHit) {
      var h = state.lastHit;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // —— 统计面板 ——
    var modeName = ['1 离散一步', '2 子步细分 N=' + state.substeps, '3 sweep 包络'][state.mode];
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px monospace';
    ctx.fillText('策略: ' + modeName, 520, 32);
    ctx.fillStyle = '#9db4d0';
    ctx.fillText('速度 ' + state.speed + ' px/s (上下)   墙厚 ' + state.wallW + ' px (左右)', 520, 54);
    ctx.fillText('子步 N=' + state.substeps + ' (N/M)   自动连发 ' + (state.auto ? '开(A)' : '关(A)'), 520, 74);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('命中 ' + state.hits, 520, 100);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('穿透 ' + state.passes, 620, 100);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('本帧判定次数 ' + state.checks + ' (峰值 ' + state.maxChecks + ')', 520, 122);

    // —— 穿透率条 ——
    var total = state.hits + state.passes;
    var rate = total === 0 ? 0 : state.passes / total;
    ctx.fillStyle = '#1e2a3d';
    ctx.fillRect(520, 138, 176, 14);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(520, 138, 176 * rate, 14);
    ctx.fillStyle = '#9db4d0';
    ctx.font = '12px monospace';
    ctx.fillText('穿透率 ' + (rate * 100).toFixed(0) + '%', 520, 166);

    ctx.fillStyle = '#5b7397';
    ctx.font = '12px monospace';
    ctx.fillText('回车 发射 · 1/2/3 策略 · R 清空', 12, engine.H - 16);
  }
});

// —— 检测函数：炮弹（圆） vs 竖直厚墙 ——
function checkHitOne(state, b, me) {
  me.checkCount++;
  var left = state.wallX;
  var right = state.wallX + state.wallW;
  // 圆与墙带的重叠：圆心进入 [left - r, right + r] 区间且 y 在墙高度内
  if (b.x + b.r >= left && b.x - b.r <= right && b.y >= 60 && b.y <= engine.H - 60) {
    return true;
  }
  // 已越过墙（圆心跑到墙右且完全不重叠）-> 判为穿透
  if (b.x - b.r > right) return 'passed';
  return false;
}

function doHit(state, b) {
  state.hits++;
  b.hitT = state.frames;
  b.vx = 0;                        // 命中即停（演示用）
  state.lastHit = { x: b.x, y: b.y, r: b.r };
  b.done = true;
}

// 1 离散：一步推进
function advanceDiscrete(state, b, dt, me) {
  b.prevX = b.x;
  b.x += b.vx * dt;
  var r = checkHitOne(state, b, me);
  if (r === true) { if (!b.done) doHit(state, b); }
  else if (r === 'passed') { state.passes++; b.passed = true; }
}

// 2 子步细分：切成 N 份
function advanceSubstep(state, b, dt, me) {
  var n = state.substeps;
  var subdt = dt / n;
  for (var s = 0; s < n; s++) {
    b.prevX = b.x;
    b.x += b.vx * subdt;
    var r = checkHitOne(state, b, me);
    if (r === true) { if (!b.done) doHit(state, b); break; }
    if (r === 'passed') { state.passes++; b.passed = true; break; }
  }
}

// 3 sweep 包络（前瞻接触）：对「本帧扫掠段」做 线段 vs 墙带 的区间全覆盖判定
function advanceSweep(state, b, dt, me) {
  b.prevX = b.x;
  var x0 = b.x;                    // 本帧起点
  var x1 = b.x + b.vx * dt;        // 本帧终点（扫掠包络的两个端点）
  var left = state.wallX - b.r;    // 墙带外扩一个半径 = 每帧位移的覆盖范围
  var right = state.wallX + state.wallW + b.r;
  var yOK = (b.y >= 60 && b.y <= engine.H - 60);

  me.checkCount++;                 // 一次扫掠判定，而不是逐采样点

  if (yOK && x0 <= right && x1 >= left) {
    // 扫掠段 [x0,x1] 与墙带 [left,right] 相交 -> 必然本帧会接触
    if (!b.done) {
      // 用线性插值反推出「首个接触时间」的那一点，作为命中点（TOI 的降维版）
      var t = x1 > x0 ? Math.max(0, (left - x0) / (x1 - x0)) : 0;
      if (t > 1) t = 1;
      b.x = x0 + (x1 - x0) * t;
      b.prevX = x0;
      doHit(state, b);
    }
  } else if (x0 > right) {
    // 扫掠段整体在墙右 -> 确实穿过（起点已在墙右）
    state.passes++;
    b.passed = true;
  } else {
    b.x = x1;                      // 没碰到，正常走到终点
  }
}

// —— 发射：用固定种子 RNG 决定炮弹竖直落点 ——
function fire(state) {
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  var rnd = state.rngSeed / 4294967296;
  var y = 60 + rnd * (engine.H - 130);
  state.bullets.push({ x: 30, y: y, r: 6, vx: state.speed, passed: false, done: false, prevX: 30 });
}
`
    },
    {
      type: 'text',
      title: '读实验结果：三个必看的现象',
      html: `<p>先别急着看源码，把实验台玩通，你会得到三组「用手摸出来」的结论：</p>
<ol>
  <li><b>离散一步</b>：速度拉到超过 <code>墙厚 × 60</code>（约 480 px/s 以上），穿透率开始往上爬；速度 2000 时几乎颗颗穿。<b>穿墙不是概率玄学，而是由 <code>v·dt &gt; w</code> 决定的确定性结果</b>——把墙厚拉大到和每帧位移相当，穿透消失。</li>
  <li><b>子步细分</b>：N 越大穿透越少，但看右下角「判定次数」——<b>开销随 N 线性涨</b>（N=16 时是 N=1 的 16 倍）。这是全场景一起变慢，最贵。</li>
  <li><b>sweep 包络</b>：速度随便拉，扫掠段覆盖本帧完整位移，<b>一次判定就覆盖住整个时间片</b>，判定次数几乎不涨，穿透也压得住——但命中点是用线性插值「反推」出来的<b>近似首个接触时间</b>，这是它和真 TOI 的差别。</li>
</ol>
<p>注意 sweep 模式下画出来的半透明<b>扫掠胶囊</b>：它就是「起点到终点这段运动」被膨胀成的包络。前瞻接触的本质，就是把「一个点在 t 时刻的坐标」升级成「一条线段覆盖 [t, t+dt] 整个区间」——<b>把时间维度重新塞回几何里</b>。</p>`
    },
    {
      type: 'source',
      files: [
        { path: 'modules/godot_physics_3d/godot_body_pair_3d.cpp', note: '搜 _test_ccd：Godot 3D 的 CCD 实现在「刚体对」这一层。看它的两步——先用 motion 判定「是否够快（位移 > 1/3 自身大小）」再沿运动方向做 segment cast。注意注释写的实话：它靠降低速度让下一帧刚好轻微重叠，动量会比真实反弹弱。' },
        { path: 'modules/godot_physics_3d/godot_body_3d.cpp', note: '搜 continuous_cd 相关成员：CCD 是挂载在单个刚体上的开关（只有开了的体才参与），印证「只给少数快速小物体开」的设计。' },
        { path: 'modules/godot_physics_2d/godot_body_pair_2d.cpp', note: '2D 版对照：同样有 CAST_SHAPE / CAST_RAY 两种连续模式（在 check_ccd 分支里），与 3D 的 segment cast 思路一致，可对比降维实现。' }
      ]
    },
    {
      type: 'text',
      title: 'Godot 是怎么做 CCD 的：是「前瞻接触」，不是真 TOI',
      html: `<p>读完上面三个文件，你会发现一件反直觉的事：<b>Godot 的 <code>continuous_cd</code> 并不是教科书里那种「扫掠体求 time of impact、把物体停在精确接触瞬间」的真 CCD</b>。它的实现（<code>_test_ccd</code>）是这样：</p>
<ol>
  <li>先算本帧运动 <code>motion = velocity × step</code>，并判断物体是否「够快」——只有位移大于自身在该方向尺寸的 1/3，才值得做 CCD（<b>和我们的实验一样，先判 <code>v·dt</code> 与物体尺寸的关系</b>）。</li>
  <li>够快的话，从形状沿运动方向取最前的「支持点」（support point），沿运动方向 cast 一段线段，看会不会撞上下一步的对方。</li>
  <li>会撞的话，<b>压低速度</b>，让物体下一帧结束时停在一个「刚好轻微重叠」的位置——下次离散检测就能抓住它。</li>
</ol>
<p>注意第 3 步：Godot 不是在时间轴上精确求解接触时刻，而是<b>前瞻性地「减速」以便让离散检测下一帧能兜住</b>。这正是「speculative contacts / 前瞻接触」的思想——<b>用一次廉价的 cast + 速度修正，换取「绝不放跑」，代价是动量不守恒（注释里坦率写了：弹跳会比真实弱）</b>。这个取舍和我们的 sweep 模式异曲同工：命中点是近似反推的，不是解析精确的。</p>
<p>为什么要这样设计？因为<b>真 TOI 扫掠对任意凸形状很贵</b>（含旋转时尤其难），而「减速兜底」便宜且一定不漏。引擎的永恒命题：<b>精确有价，保守兜底往往更划算</b>。</p>`
    },
    {
      type: 'text',
      title: '三个灵魂拷问：回到 CCD 上',
      html: `<p><b>数据怎么流动？</b>CCD 把「本帧位移（velocity × dt）」这个<u>时间跨度</u>当作输入，喂给检测层——普通离散检测只需要「当前位置」，CCD 额外需要「到下一帧的运动包络」，这是数据流里多出来的一段。</p>
<p><b>所有权归谁？</b>CCD 开关（<code>continuous_cd</code>）挂在单个<b>刚体</b>身上，但真正的检测发生在<b>刚体对（body pair）</b>这一层——谁创建、谁持有这段 state 决定了「只对开着 CCD 的那一方做 cast，且只在 pair 成立时做」。</p>
<p><b>什么时候发生？</b>CCD 在<b>每帧 step、narrowphase 阶段</b>对「快速运动体」按需触发，而不是常驻——先判快不快，不够快直接跳过（<code>fast_object</code> 分支），这就是「按需」的体现。</p>
<p>最后回到开头的三问：漏检的本质是<b>时间采样过疏</b>；子步细分是「把时间片切密」（贵而通用），前瞻/扫掠是「把运动包络进几何」（便宜而近似），CCD 专用体是「只给少数快体精确扫掠」（贵但只付该付的）。三者是同一根轴上的三个刻度。</p>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>这一课把主线物理三连（L5.1 的 broadphase、L5.2 的求解、L5.3 的 Server 分层）补上了<b>时间维度</b>的补丁：碰撞不只是「这一刻谁和谁重叠」，而是「从这一刻到下一刻谁经过了谁」。记住三句话：</p>
<ul>
  <li><b>漏检是时间采样问题，不是几何问题</b>——<code>v·dt &gt; w</code> 一锤定音。</li>
  <li><b>三种治法各有代价</b>：子步贵而通用、前瞻/扫掠便宜而近似、CCD 专用体精而小众。</li>
  <li><b>引擎的务实答案是「默认离散 + 对快速体开 CCD」</b>，Godot 用的是廉价的「减速兜底」型前瞻接触，而非解析 TOI。</li>
</ul>
<p>下一课 A2 我们钻到「碰上之后」的最精细处——接触流形：为什么两个盒子相撞，接触点不止一个。那里你会再次看到「离散 vs 连续」的取舍：多一点、稳一点的接触，往往比快一点、漏一点的接触更值钱。</p>`
    }
  ]
}
