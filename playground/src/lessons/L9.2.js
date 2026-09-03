// L9.2 · 毕业项目：给 Godot 加功能 / mini-engine / 深度报告（全课程最后一课）
export default {
  id: 'L9.2',
  title: '毕业项目：给 Godot 加功能 / mini-engine / 深度报告',
  est: '自定',
  coreQuestions: [
    '选题到底在选什么——你要切穿哪条数据怎么流动、碰谁的所有权边界、改动在什么时候发生？',
    '范围归谁所有：是你的热情与愿望清单，还是工作量、风险、展示效果三条预算线？',
    '可展示、可讲述、可被追问，分别必须在项目时间轴的哪个时刻成为事实？——晚发生的一切都是风险。'
  ],
  sections: [
    {
      type: 'text',
      title: '毕业项目：把整门课变成一件作品',
      html: `<p>这是全课程最后一课，也是一次身份切换：前 25 课你在读别人的引擎，这一课起，你手里要产出一件<b>可展示、可讲述、可被追问</b>的作品。本课 est 为「自定」——项目周期本身就是毕业设计的一部分：下面所有预算线按两周基准给出，压到一周全部减半、放到四周等比放宽，但<b>验收三关不变</b>。三个方向不是三种口味，而是三种风险结构，选之前先看清各自怎么估工作量、怎么判风险、能回扣前面哪几个阶段。</p>
<p><b>方向 A：给 Godot 加功能。</b>适合已有本地编译环境、想走引擎开发岗的同学。选题标准只有一条：找<b>小切口、深穿透</b>的改动——给一个 Node 加个带反射的属性，你会路过神宏三件套背后的 ClassDB（L2.2）、属性序列化（L6.1）、Inspector（L8.3）、乃至脚本绑定（L2.4），一条改动穿过三四层，答辩时才讲得出「数据怎么流动」。<b>工作量怎么估</b>：去 git log 里找三条同类上游提交，取中位数，拍脑袋的估时一律乘以二。<b>最大风险</b>：主干漂移与序列化/ABI 兼容——属性与 bind_method 的登记顺序会牵连 .tscn 兼容性，这类雷在课堂上都点过名。</p>
<p><b>方向 B：mini-engine。</b>最容易犯的错是写成「小游戏」或贪全景的玩具引擎——几个月后你得到一个处处半成品的庞然大物。正确姿势是<b>照抄一条接口契约，重写竖切面的最小实现</b>：把 servers/physics_2d/physics_server_2d.h 或 RenderingServer 的默认实现当范本，连入参命名、句柄风格、无头（headless）可测性都照抄，然后只实现一个竖切片。答辩的核心问题只有一个：「<b>哪些地方你和 Godot 不一样，是取舍还是没做？</b>」——交付物里必须有一张逐条对照表。回扣点密集：L0.1 的主循环、L1.1 的时间步长、L2.1 的场景树、L5.1/L5.2 的碰撞与冲量，全在你手里原地复活。</p>
<p><b>方向 C：深度报告。</b>适合暂时不具备编译环境、或目标是引擎研究/技术策展岗的同学。但报告不是读书感想：必须有<b>可证伪的论点 + 可复现的证据链</b>——「Variant 装箱在这条热路径上贡献了多少开销，因为一次跨语言传值要过几道门」「换物理后端真正要动手术的地方只有接口层这几类」。骨架就用 L1.2 走过的那一遍一帧之旅（Main::iteration），纵深扎进其中一段；L9.1 的垂直/水平走读方法在这里全额兑现。</p>
<table>
  <tr><th>方向</th><th>工作量画像</th><th>风险画像</th><th>展示画像</th><th>主回扣阶段</th></tr>
  <tr><td>A 给 Godot 加功能</td><td>中：估时拿上游同类提交校准</td><td>主干漂移、序列化兼容</td><td>强且有实物：改前/改后</td><td>P1/P2/P6/P8</td></tr>
  <tr><td>B mini-engine</td><td>高：从零起步处处是坑</td><td>贪全景，处处半成品</td><td>中：对照表 + 30 秒 demo</td><td>P0/P1/P2/P5</td></tr>
  <tr><td>C 深度报告</td><td>低到中：时间全花在证据链</td><td>写成感想文、论断无证据</td><td>弱：全靠图与曲线撑</td><td>P1/P2/P4/P9</td></tr>
</table>`
    },
    {
      type: 'text',
      title: '范围裁剪与验收：先有预算线，再谈愿望清单',
      html: `<p>毕业项目死于范围失控，不死于能力不足。裁剪原则三句话：<b>先定预算线，再填特性卡；砍要横着砍（整条特性出局），不竖着砍（半截功能）；演示物出现的时间点，比功能数量重要</b>。</p>
<p>三条预算线，也就是课内规划台的三根横条（两周基准）：<b>工作量 ≤ 26 点</b>——一点约一课内小时当量，这就是 L1.1「上限即设计」搬进项目管理：时间债还不完就赖账，宁可少做，不可延期；<b>风险 ≤ 9 点</b>——风险点是你要押注但尚未验证的假设数，没跑过的线程模型、没读过的上游代码都记风险点，超限先回 D1 用 50 行小原型验掉；<b>展示效果 ≥ 16 点</b>——是下限不是上限，答辩没有画面，讲得再深也减半分。每条特性必须写成「可观察后果」：「优化物理」不是特性，「500 刚体场景中把碰撞配对次数从 O(n²) 降进网格分桶、并在 HUD 实时显示对比计数」才是——这句话 L5.1 已经替你演过一遍。</p>
<p>里程碑倒排，四站各有<b>完成定义（DoD）</b>，全部按「什么时候发生」倒排：D1 发现期——入口走读 + 数据流草图 + 风险验真，产出恰好一页 A4（写不满是没钻透，写三页是没裁剪）；<b>D2 竖切片——到站必须能演示：丑没关系，数据必须真的穿过你的改动</b>，未达标当场砍范围；D3 完成度——勾选特性全部落地或明确写明降级，边界有兜底、复现步骤进文档；D4 打磨与预演——三页幻灯、二十分钟答辩排练，最后两天不加任何新特性。可展示的成为事实的时间在 D2，可讲述在 D3，可被追问靠 D4——晚于这个节奏的东西，本质上都还没做完。</p>
<p>验收三关，逐条给定义：<b>可展示</b>——不超过 60 秒、带 before/after 对比的录屏，考官没读过你的代码也能看懂；<b>可讲述</b>——五分钟、零代码，只靠一张「你的改动在引擎大图里」的数据流图加一本取舍账；<b>可被追问</b>——三个经典追问各限时 20 秒当场答。三张必考题：</p>
<table>
  <tr><th>经典追问</th><th>考官真正在测什么</th><th>答题要点</th></tr>
  <tr><td>这个功能 Godot 官方为什么不做、或不这么做？</td><td>你懂不懂权衡，看没看过上游讨论</td><td>讲 trade-off 与 issue 现状；承认官方的平台约束，说清你的场景为何不同</td></tr>
  <tr><td>哪些是主动取舍，哪些是没来得及？</td><td>你有架构判断，还是只在堆功能</td><td>拿预算线说话：砍了哪条特性、为什么它性价比最差、砍掉的代价是什么</td></tr>
  <tr><td>你的改动穿过哪条数据流？碰了谁的所有权？什么时候发生？</td><td>三个灵魂拷问长没长在你身上</td><td>一张图讲完数据怎么流动、所有权归谁、什么时候发生——这是全课程送的分数</td></tr>
</table>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'planboard',
      title: '实验：毕业项目规划台',
      height: 560,
      code: `// 毕业项目规划台：选方向 → 勾特性 → 盯预算与里程碑 → 预演答辩
// 数字 1/2/3 选方向（0 返回方向总览）；方向内 ↑↓ 移动光标、空格勾选/取消纳入范围
// ←→ 在 D1~D4 里程碑间移动查看完成定义 DoD；H 翻出模拟答辩卡；R 全部重置
// 右侧三条预算线是硬约束：工作量 26 点、风险 9 点，超一条就红警——逼你砍范围，别延期

var DIRS = [
  {
    name: '给 Godot 加功能', start: 'core/object/class_db.cpp',
    feats: [
      { n: 'GDScript 编译期检查', w: 5, r: 2, d: 5 },
      { n: '给 Node 加反射属性', w: 4, r: 1, d: 6 },
      { n: 'Inspector 自定义控件', w: 7, r: 3, d: 8 },
      { n: '新增一个单例并注册', w: 5, r: 2, d: 4 },
      { n: '修一条真实上游 issue', w: 6, r: 3, d: 7 },
      { n: '一个功能两种做法对比', w: 6, r: 2, d: 6 }
    ]
  },
  {
    name: 'mini-engine', start: 'servers/rendering/ 契约层',
    feats: [
      { n: '主循环 + 固定步长', w: 4, r: 1, d: 5 },
      { n: '最小场景树与变换', w: 5, r: 2, d: 6 },
      { n: '迷你 ClassDB 反射', w: 7, r: 4, d: 8 },
      { n: 'ID 风格句柄与无头层', w: 6, r: 3, d: 7 },
      { n: '碰撞网格 + 冲量求解', w: 7, r: 3, d: 8 },
      { n: '场景资源热重载', w: 6, r: 3, d: 6 }
    ]
  },
  {
    name: '深度报告', start: 'main/main.cpp',
    feats: [
      { n: '一帧之旅全链路图', w: 4, r: 0, d: 6 },
      { n: 'Variant 装箱成本实测', w: 5, r: 2, d: 7 },
      { n: '信号 vs 回调解耦证据', w: 4, r: 1, d: 6 },
      { n: 'PhysicsServer 边界报告', w: 6, r: 2, d: 7 },
      { n: 'Job 系统并行度测量', w: 7, r: 3, d: 8 },
      { n: '换后端手术报告', w: 6, r: 3, d: 6 }
    ]
  }
];

var DIRSUBS = [
  '改穿一条真实调用链，讲清层级与兼容',
  '照抄一条接口契约，重写最小实现',
  '可证伪的论点 + 可复现的证据链'
];

var DEMO_LINES = [
  '改前 / 改后 60 秒同屏对比录屏',
  '同一演示：mini 侧真跑 + Godot 概念逐条对照图',
  '三张图：一帧之旅 / 一条数据流 / 实测曲线'
];

var TALK_LINES = [
  '我的改动穿过哪条数据流、碰了谁的所有权、什么时候生效',
  '我照抄了哪条契约、刻意砍掉哪几层、砍掉的代价各是什么',
  '我的论点、证据、以及能推翻它的实验分别是什么'
];

var MILES = [
  { id: 'D1', name: '发现期', tag: '走读', dod: ['入口走读 3 条 + 切入点数据流草图一页', '把最大的不确定性先做成 50 行小原型验掉', '风险清单 + 拟砍项，写满一页 A4 就收手'] },
  { id: 'D2', name: '竖切片', tag: '闭环', dod: ['最小端到端闭环跑通，30 秒录屏存档', '丑没关系：数据必须真的穿过你的改动', '未达标就当场砍范围——绝不变相延期'] },
  { id: 'D3', name: '完成度', tag: '落地', dod: ['勾选特性全部落地，或明确写明如何降级', '边界输入与错误路径都有兜底测试', '复现步骤写进 README，代码开始冻结'] },
  { id: 'D4', name: '打磨预演', tag: '排练', dod: ['三页幻灯：流图 / before-after / 取舍账', '三个经典追问各练到 20 秒能答完', '最后 2 天不加新特性：只排练和修 bug'] }
];

var DEFENSE = [
  { q: '追问 1：这个功能 Godot 官方为什么不做，或者不这么做？', a: '答题要点：讲 trade-off 与上游 issue 现状，别回答「他们没想到」。' },
  { q: '追问 2：你的范围里，哪些是主动放弃、哪些只是没来得及？', a: '答题要点：拿三条预算线说话——砍了谁、为什么它的 d/w 最差。' },
  { q: '追问 3：你的改动穿过什么数据流？碰了谁的所有权？何时发生？', a: '答题要点：一张图回答三个灵魂拷问——这是全课程的送分题。' }
];

var BW = 26, BR = 9, BD_MIN = 16, BD_CAP = 24, D2_BUDGET = 13;

engine.run({
  setup: function (state) {
    state.dir = -1; state.cur = 0; state.ms = 0; state.def = false;
    state.picked = emptyPicked();
    recalc(state);
  },

  update: function (state, dt, input) {
    var i;
    if (input.pressed('KeyR')) {
      state.dir = -1; state.cur = 0; state.ms = 0; state.def = false;
      state.picked = emptyPicked();
    }
    for (i = 1; i <= 3; i++) {
      if (input.pressed('Digit' + i)) {
        if (state.dir !== i - 1) { state.dir = i - 1; state.cur = 0; state.picked = emptyPicked(); }
      }
    }
    if (input.pressed('Digit0') || input.pressed('Backspace') || input.pressed('Escape')) state.dir = -1;
    if (state.dir >= 0) {
      if (input.pressed('ArrowUp')) state.cur = (state.cur + 5) % 6;
      if (input.pressed('ArrowDown')) state.cur = (state.cur + 1) % 6;
      if (input.pressed('Space')) state.picked[state.cur] = !state.picked[state.cur];
    }
    if (input.pressed('ArrowLeft')) state.ms = Math.max(0, state.ms - 1);
    if (input.pressed('ArrowRight')) state.ms = Math.min(3, state.ms + 1);
    if (input.pressed('KeyH')) state.def = !state.def;
    recalc(state);
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('毕业项目规划台｜1/2/3 选方向 · ↑↓ 光标 · 空格勾选 · ←→ 里程碑 · H 答辩 · 0 返回 · R 重置', 12, 22);
    drawLeft(state, ctx);
    drawRight(state, ctx);
    drawBottom(state, ctx);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('预算线就是裁剪刀：两周只是基准（周期自定、预算等比缩放），超载砍范围、别延期', 12, 438);
  }
});

function emptyPicked() { return [false, false, false, false, false, false]; }

function recalc(state) {
  var d = state.dir >= 0 ? DIRS[state.dir] : null;
  state.sw = 0; state.sr = 0; state.sd = 0; state.n = 0;
  state.plan = [[], [], [], []]; state.d2w = 0; state.worst = null;
  for (var i = 0; i < 6; i++) {
    if (!d || !state.picked[i]) continue;
    var f = d.feats[i];
    state.sw += f.w; state.sr += f.r; state.sd += f.d; state.n++;
    var dst = (state.d2w + f.w <= D2_BUDGET) ? 1 : 2;   // 特性只落 D2/D3：D1 归走读，D4 归排练
    if (dst === 1) state.d2w += f.w;
    state.plan[dst].push(i);
    if (!state.worst || f.w * state.worst.d > state.worst.w * f.d) state.worst = f;
  }
  if (state.n === 0) state.judge = { t: '尚未纳入特性：先选方向，再空格勾第一刀', c: '#7d93b3' };
  else if (state.sw > BW) state.judge = { t: '超载 ' + (state.sw - BW) + ' 点：先砍「' + state.worst.n + '」', c: '#f87171' };
  else if (state.sr > BR) state.judge = { t: '风险超标 ' + state.sr + '/' + BR + '：回 D1 验证最大假设', c: '#f87171' };
  else if (state.sd < BD_MIN) state.judge = { t: '展示 ' + state.sd + '/' + BD_MIN + ' 偏低：答辩要有画面', c: '#fbbf24' };
  else state.judge = { t: '切片成立：' + state.sw + '/26 · 风险 ' + state.sr + ' · 展示 ' + state.sd, c: '#34d399' };
}

function drawLeft(state, ctx) {
  var i;
  ctx.fillStyle = '#0e1626'; ctx.fillRect(10, 34, 288, 252);
  ctx.strokeStyle = '#24364f'; ctx.lineWidth = 1; ctx.strokeRect(10, 34, 288, 252);
  if (state.dir < 0) {
    ctx.fillStyle = '#9b8cff'; ctx.fillText('第①步 · 选一个方向（数字键）', 20, 52);
    for (i = 0; i < 3; i++) {
      var cy = 60 + i * 74;
      ctx.fillStyle = '#16233a'; ctx.fillRect(20, cy, 268, 68);
      ctx.strokeStyle = '#2f4a6e'; ctx.strokeRect(20, cy, 268, 68);
      ctx.font = '13px monospace'; ctx.fillStyle = '#e2e8f0';
      ctx.fillText((i + 1) + ' ' + DIRS[i].name, 32, cy + 20);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#7d93b3'; ctx.fillText(DIRSUBS[i], 32, cy + 38);
      ctx.fillStyle = '#5aa9e6'; ctx.fillText('起点 ' + DIRS[i].start, 32, cy + 56);
    }
    ctx.fillStyle = '#5b7397';
    ctx.fillText('选题 = 挑一条你讲得清层级与所有权的数据流', 20, 282);
    return;
  }
  var d = DIRS[state.dir];
  ctx.fillStyle = '#9b8cff';
  ctx.fillText('第②步 · ' + d.name + ' · 已勾 ' + state.n + ' 项', 20, 52);
  ctx.fillStyle = '#7d93b3';
  ctx.fillText('↑↓ 移动 · 空格勾选（每条都要有可观察后果）', 20, 66);
  for (i = 0; i < 6; i++) {
    var f = d.feats[i], ry = 84 + i * 31;
    if (i === state.cur) { ctx.fillStyle = '#1b2c4a'; ctx.fillRect(18, ry - 15, 272, 27); }
    ctx.strokeStyle = state.picked[i] ? '#34d399' : '#4a5f80'; ctx.lineWidth = 1;
    ctx.strokeRect(24, ry - 11, 13, 13);
    if (state.picked[i]) { ctx.fillStyle = '#34d399'; ctx.fillRect(27, ry - 8, 7, 7); }
    ctx.fillStyle = state.picked[i] ? '#e2e8f0' : '#8fa7c7';
    ctx.fillText((i + 1) + '. ' + f.n, 44, ry);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('w' + f.w + ' r' + f.r + ' d' + f.d, 226, ry);
  }
}

function drawRight(state, ctx) {
  ctx.fillStyle = '#0e1626'; ctx.fillRect(308, 34, 402, 252);
  ctx.strokeStyle = '#24364f'; ctx.lineWidth = 1; ctx.strokeRect(308, 34, 402, 252);
  ctx.fillStyle = '#f59e0b'; ctx.fillText('第③步 · 预算台（两周基准：工作量上限 26 点）', 316, 52);
  drawMeter(ctx, '工作量', state.sw, BW, '#f59e0b', state.sw > BW ? 1 : 0, 70);
  drawMeter(ctx, '风险', state.sr, BR, '#f472b6', state.sr > BR ? 1 : 0, 94);
  drawMeter(ctx, '展示', state.sd, BD_CAP, '#34d399', 0, 118);
  var tx = 380 + 230 * BD_MIN / BD_CAP;              // 展示效果下限刻度：≥16 才撑得住答辩
  ctx.strokeStyle = '#34d399'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx, 110); ctx.lineTo(tx, 118); ctx.stroke();
  ctx.fillStyle = state.judge.c; ctx.font = '13px monospace';
  ctx.fillText(state.judge.t, 316, 140);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#5aa9e6'; ctx.fillText('里程碑倒排 · ←→ 查看每站 DoD', 316, 164);
  for (var i = 0; i < 4; i++) {
    var bx = 316 + i * 99, sel = state.ms === i;
    ctx.fillStyle = sel ? '#213050' : '#16233a'; ctx.fillRect(bx, 172, 96, 30);
    ctx.strokeStyle = sel ? '#fbbf24' : '#2f4a6e'; ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(bx, 172, 96, 30);
    ctx.fillStyle = sel ? '#fbbf24' : '#e2e8f0';
    ctx.fillText(MILES[i].id + ' ' + MILES[i].name, bx + 8, 185);
    var cnt = state.plan[i].length;
    if (cnt > 0) {                                    // 勾选特性自动排进 D2/D3 时间轴
      ctx.fillStyle = i === 1 ? '#34d399' : '#6ee7b7';
      for (var k = 0; k < cnt && k < 7; k++) ctx.fillRect(bx + 8 + k * 12, 191, 9, 6);
    } else if (i === 0 || i === 3) {
      ctx.fillStyle = '#fbbf24'; ctx.fillText(MILES[i].tag, bx + 8, 196);
    } else {
      ctx.fillStyle = '#3d5170'; ctx.fillText('未纳入', bx + 8, 196);
    }
  }
  var m = MILES[state.ms];
  ctx.fillStyle = '#9fb3cf';
  ctx.fillText(m.id + ' · ' + m.name + ' 完成定义：', 316, 222);
  ctx.fillStyle = '#cbd7e8';
  for (var j = 0; j < 3; j++) ctx.fillText('· ' + m.dod[j], 322, 240 + j * 16);
}

function drawMeter(ctx, label, v, cap, color, over, y) {
  ctx.fillStyle = '#8fa7c7'; ctx.fillText(label, 316, y + 2);
  ctx.fillStyle = '#16233a'; ctx.fillRect(380, y - 7, 230, 11);
  ctx.fillStyle = over ? '#f87171' : color;
  ctx.fillRect(380, y - 7, 230 * Math.min(v / cap, 1), 11);
  ctx.strokeStyle = '#2f4a6e'; ctx.lineWidth = 1; ctx.strokeRect(380, y - 7, 230, 11);
  ctx.fillStyle = over ? '#f87171' : '#cbd7e8';
  ctx.fillText(v + '/' + cap, 622, y + 2);
}

function drawBottom(state, ctx) {
  ctx.fillStyle = '#0e1626'; ctx.fillRect(10, 294, 700, 134);
  ctx.strokeStyle = '#24364f'; ctx.lineWidth = 1; ctx.strokeRect(10, 294, 700, 134);
  var d = state.dir >= 0 ? DIRS[state.dir] : null;
  var i;
  if (state.def) {
    ctx.fillStyle = '#f472b6';
    ctx.fillText('模拟答辩 · 考官三问（H 返回开题卡 · 每问限时 20 秒）', 20, 312);
    for (i = 0; i < 3; i++) {
      ctx.fillStyle = '#e2e8f0'; ctx.fillText(DEFENSE[i].q, 20, 330 + i * 33);
      ctx.fillStyle = '#7d93b3'; ctx.fillText(DEFENSE[i].a, 32, 344 + i * 33);
    }
    return;
  }
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('开题卡 · 随勾选实时生成（H 翻到答辩预演）', 20, 312);
  ctx.fillStyle = '#cbd7e8';
  ctx.fillText('方向：' + (d ? d.name + ' ｜ 起点 ' + d.start : '未选 —— 按 1/2/3 定方向'), 20, 330);
  var first = '';
  if (d && state.n > 0) { for (i = 0; i < 6; i++) { if (state.picked[i]) { first = ' · 首刀「' + d.feats[i].n + '」'; break; } } }
  ctx.fillText('范围：' + (state.n > 0 ? state.n + ' 项特性' + first : '空 —— ↑↓ 移动后空格勾选'), 20, 348);
  ctx.fillStyle = state.judge.c;
  ctx.fillText('判定：' + state.judge.t, 20, 366);
  ctx.fillStyle = '#cbd7e8';
  ctx.fillText('可展示：' + (d ? DEMO_LINES[state.dir] : '先定方向再谈画面'), 20, 384);
  ctx.fillText('可讲述：' + (d ? TALK_LINES[state.dir] : '一张流图 + 一本取舍账'), 20, 402);
  ctx.fillText('可追问：' + (state.n >= 3 ? '按 H 迎考——三问各限时 20 秒' : '勾满 3 条再预演'), 20, 420);
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>按 1/2/3 换三个方向，各自把六张卡<b>全部勾上</b>，比较红警的措辞：A 先爆的是工作量，B 甚至两个一起红——§1 那张风险画像表，规划台里是可跑的。</li>
  <li>把工作量压回 26 点以下：红警会点名你勾选里性价比最差的特性（w/d 最大者），照它砍一刀。对着愿望清单下刀会心软，对着预算线下刀冷静——这就是「范围归谁所有」的答案。</li>
  <li>勾几条特性后用 ←→ 走完 D1~D4：方块只落在 D2/D3（D1 固定走读、D4 固定排练），D2 预算装不下一律进 D3；把选中站的 DoD 念出声，念不顺口语的那条，就是你范围里的借口。</li>
  <li>按 H 进答辩模式，对着当前方向的第一条已勾特性，三个追问各限时 20 秒说一遍。卡壳之处记下来——那是前面 8 个阶段给你留的知识债清单，回坑里补走读，比在项目里硬撑便宜。</li>
  <li>改代码顶部的 <code>var BW = 26, BR = 9</code> 各减半再 Ctrl+Enter 重跑：体验「一周极限版」毕业设计——预算线一收紧，砍起特性来毫不留情，这就是等比缩放周期的真实手感。</li>
</ul>`
    },
    {
      type: 'source',
      title: '三个方向的源码起点（各认一条，读到能讲为止）',
      files: [
        { path: 'core/object/class_db.cpp', note: '方向 A 的大门：ClassDB::bind_methodfi 与整套注册方法族——任何新功能都要在这里登记成 MethodBind 存进类表，脚本和编辑器才「看得见」它；动手加功能前，先在这找到你的海关通道。' },
        { path: 'servers/rendering/rendering_server_default.cpp', note: '方向 B 的契约范本：_free(RID) 按句柄归属把释放分发给 canvas / storage 等子实现，_draw 是每帧入口——看服务层如何用 RID 把 API 与实现隔成两层，你的 mini-engine 接口值得照这个手感逐行抄。' },
        { path: 'main/main.cpp', note: '方向 C 的报告骨架：从 Main::iteration 读起——每帧按固定步长切出的物理步、max_physics_steps 的防螺旋上限、各系统回调的先后顺序；一帧之旅就是你报告目录的天然结构。' }
      ]
    },
    {
      type: 'text',
      title: '小结：你带走的不是一门 Godot',
      html: `<p>把三个灵魂拷问原封不动还给你，换成「你的」版本收尾这一课、也是整门课程：<b>你的项目切穿了哪条数据怎么流动？动的是谁的所有权？改动在什么时候发生？</b>三句话答得上来，作品就立得住；哪句含糊，含糊处就是 D1 该补的走读。本课没有课后作业——毕业项目本身就是课内启动的自主工程，规划台就是开题现场：选方向、勾特性、压预算、走完 D1~D4 的 DoD、按 H 预演一遍答辩，让那张「可展示、可讲述、可被追问」的开题卡带着你的数据落地。将来不管走多深、换哪个引擎，陪你毕业的不是 Godot 的 API，而是这套「读复杂系统 → 在约束下裁剪 → 用证据讲述」的判断。祝毕业，后会有期。</p>`
    }
  ]
}
