// L9.1 · 大型 C++ 项目阅读方法论
export default {
  id: 'L9.1',
  title: '大型 C++ 项目阅读方法论',
  est: '2 小时',
  coreQuestions: [
    "面对几百万行、编译要一小时的引擎，为什么「按目录逛」必然失败，而「沿一条数据流走到底」能赢？",
    "垂直走读和水平走读各自回答什么问题？什么时候必须换到另一种姿势？",
    "一个名字（方法名、类名）是怎么在运行时被解析成一次真正的函数调用的？这条链路的每一站你能报出文件名吗？",
    "没有断点可下、跑不起来的时候，grep、调用树卡片、伪码复述怎么凑齐「断点/日志/调用树」这套三件套的替代能力？"
  ],
  sections: [
    {
    "type": "text",
    "title": "毕业第一课：从「读懂一课」到「自己能吃下一座库」",
    "html": "<p>前八个阶段，每一次源码走读都是我把线路铺好、把关键词圈出来，你沿路捡珠子。这一课把铺路的手艺本身交给你。Godot 主干有<b>数百万行 C++</b>：编译一次几十分钟，调试器挂不上，你不可能「把整个项目读完」——世界上也没人读过它的每一行，包括核心开发者。他们只是各自吃透了几条链路，外加一套<b>在需要时快速吃透一条新链路的流程</b>。这套流程，就是本课的全部教学内容。</p>\n<p>方法论不是玄学，它同样要过三个灵魂拷问——只不过这次被拷问的对象不是某个子系统，而是「读代码」这件事本身：<b>注意力这种资源怎么流动</b>（先抓什么后抓什么，决定你在第 30 分钟是胸有成图还是满屏标签页）；<b>理解的所有权归谁</b>（只有转写成自己的伪码，一段代码才算被你拥有，而不是被你的眼睛路过过）；<b>什么时候该垂直、什么时候该水平</b>（姿势选错，两小时等于白坐）。下面逐条展开。</p>"
  },
    {
    "type": "text",
    "title": "两种姿势：垂直走读与水平走读",
    "html": "<p>看同一个仓库有两种根本不同的姿势，回答两类不同的问题。搞混它们，是初学者读大项目最常见的失败方式。</p>\n<table>\n  <tr><th></th><th>垂直走读</th><th>水平走读</th></tr>\n  <tr><td>提问方式</td><td>「一件事是怎么完成的？」</td><td>「同一层都有谁？接口长什么样？」</td></tr>\n  <tr><td>移动方向</td><td>从入口出发，一路向下换层</td><td>锁死一层，横向扫过去不换层</td></tr>\n  <tr><td>单位</td><td>一条链路（一帧、一次调用、一次加载）</td><td>一个目录（servers/、core/、modules/）</td></tr>\n  <tr><td>终点</td><td>数据落到最终消费者手里</td><td>一张同层对比表</td></tr>\n  <tr><td>产出</td><td>一串调用栈卡片（lab 里的东西）</td><td>一份分层地图（L0.2 解剖图的局部精修）</td></tr>\n</table>\n<p>两条铁律。<b>其一，先垂直，后水平。</b>COURSE_PLAN §6 那句「每课只沿一条数据流走到底，不贪全景」，这里展开成完整理由：水平走读的前提是知道「每层的职责边界在哪」，而这个边界感恰恰来自垂直经验——你没走过 main → scene → server 这条竖井，就分不清 RenderingServer 和 TextureStorage 各管什么，横着扫只会看到一堆长得差不多的名词。顺序反过来，就是在把字典当小说读。<b>其二，垂直路上禁止分叉。</b>走到一站，发现它调用了十个函数，只挑「携带本条数据的那个」跟下去，其余全部记进 TODO 清单留待下次。分支欲望是垂直走读的头号杀手：每条岔路都看一眼，一小时后你已在第七层里迷路，最初那条数据流反而没人记得。</p>\n<p>那水平走读何时出场？三种时机：① 你已经垂直穿过某层，想摸清这层的全貌与惯例；② 准备在这一层<b>新增或替换一个实现</b>（比如给 servers/ 加一个后端），需要先比较同层邻居的接口形状；③ 评估改动的影响半径——「我动这一层，谁会被波及」。一句话：<b>垂直建立坐标系，水平在坐标系里批量作业。</b>没有坐标系的水平扫描，就是按目录逛。</p>"
  },
    {
    "type": "text",
    "title": "找入口：带着问题进门，别带好奇心",
    "html": "<p>垂直走读最难的一步是第一步：<b>入口在哪</b>。答案是：入口不在文件系统里，在你的问题里。「按目录逛」之所以失败，是因为目录是按<b>编译单元</b>组织的，不是按<b>数据流</b>组织的——main/ 里躺着主循环也躺着命令行参数解析，core/io/ 里躺着资源加载也躺着压缩器。照着目录读，你永远在读「别人怎么收纳文件」，而不是「数据怎么流动」。</p>\n<p>所以开工前先写下一个<b>问题句</b>，句式固定为「X 是什么时候、被谁、交给 Y 的」：「_process 是被谁调用的」「png 是谁变成纹理的」「脚本里一句 add_child，C++ 那边发生了什么」。问题句自带验收标准：链路走完的标志，是沿途每一站都能填进这个句子。然后才去定位入口，四个抓手按优先级排：</p>\n<ul>\n<li><b>字符串反查</b>：引擎里凡是能被名字调用的东西，注册处必留字符串。搜 <code>D_METHOD</code>、<code>GDVIRTUAL</code>、<code>GLOBAL_DEF</code>、设置键名、报错文案——这是静态语言里最好用的「反射锚点」。</li>\n<li><b>生命周期约定</b>：OS 消息循环、<code>main()</code>、启动/退出、每帧 iteration——程序绕不开的几个时刻，天然的顶层入口。</li>\n<li><b>文档与 API 注释</b>：官方文档告诉你「谁负责什么」，帮你猜中第一站落在哪个目录。</li>\n<li><b>调用树工具</b>：clangd / IDE 的 call hierarchy，选中目标函数反向看 caller，一步顶手工 grep 十步。</li>\n</ul>\n<p>有了第一站，后面每一站的推进规则都一样：<b>盯住那份数据，谁接住它就跟谁走。</b>先数据流、后控制流——if/else、错误处理、线程同步统统先跳过，等链路通了再回头补第二遍。一遍只追一个维度，是大项目里唯一不被淹死的游法。</p>"
  },
    {
    "type": "lab",
    "lab": "code",
    "key": "walkthrough",
    "title": "实验：垂直走读追踪台",
    "height": 560,
    code: `// 垂直走读追踪台：三条 Godot 真实走读线路（每张卡片 = 一站：文件 + 函数 + 搜索关键词 + 交接语）
// 选择页：数字键 1/2/3 或 ←→ 选线路 · H 切换「水平走读」对比视图 · Enter 开始挑战
// 挑战页：↑↓ 选右侧乱序卡片 · Enter 放入左侧当前槽位 · Backspace 撤回最后一张
//   放错会红闪并提示：这一站的输出还不是下一站的输入——想想谁先拿到数据
// 讲解页：排对整条链路后自动进入 · ←→ 逐站细看交接与三个灵魂拷问 · Esc 随时回选择页

var ROUTES = [
  { name: '一帧之旅', q: '一帧的时间，是谁切成物理步、又是谁交给每个节点的？',
    cards: [
      { file: 'main/main.cpp', fn: 'Main::iteration()', kw: 'Main::iteration',
        hand: '收到 OS 消息循环的唤醒，先问计时站：本帧欠了多少时间？',
        d: '进：usec 时间戳；出：向 advance 要一份时间表', o: 'main 持有 MainLoop 与各 Server 单例', t: '每帧一次，由 OS 消息循环驱动',
        why: '全引擎总调度台：一帧从这里开始，不再返回。' },
      { file: 'main/main_timer_sync.cpp', fn: 'MainFrameTime advance(...)', kw: 'time_accum',
        hand: '把墙钟差值折成 physics_steps 个物理步 + process_step 秒逻辑时长',
        d: '进：累积的时间债；出：本帧的还款计划', o: 'tsync 只管时间状态，不碰业务数据', t: '每帧开头第一件事',
        why: 'L1.1 玩具累积器的工业版：变量名 time_accum 都没改。' },
      { file: 'scene/main/scene_tree.cpp', fn: 'SceneTree::_process_group()', kw: '_process_group',
        hand: '把 process_step 摊进每个 process group，按优先级逐个点名节点',
        d: '进：一份逻辑时长；出：对每个节点的一次 notification', o: '场景树持有全部活动节点', t: '每帧一次（物理分支按 tick 多次）',
        why: '函数头尾各 flush 一次 call_queue：中途删节点也不炸。' },
      { file: 'scene/main/node.cpp', fn: 'Node::_notification(NOTIFICATION_PROCESS)', kw: 'NOTIFICATION_PROCESS',
        hand: '通知翻成虚调用 _process(delta)，最后一棒交给你的脚本',
        d: '进：通知码 + delta；出：你写的游戏逻辑被执行', o: '节点自身；开关是 set_process(true)', t: '入树且开启处理后，每帧一次',
        why: '旅程的终点，恰是你日常写代码的起点。' },
      { file: 'servers/rendering/rendering_server_default.cpp', fn: 'RenderingServerDefault::draw()', kw: 'RenderingServerDefault::draw',
        hand: '把攒了一整帧的绘制命令提交 GPU 并交换缓冲',
        d: '进：命令队列 + present 意愿；出：屏幕上的画面', o: 'Server 独占渲染命令队列，场景树不碰 GPU', t: '每帧末尾一次，GPU 侧异步执行',
        why: '链路终点在硬件不在代码——学会知道何时该停。' }
    ] },
  { name: '一次方法调用', q: '脚本里一句 player.add_child(x)，C++ 那边经历了什么？',
    cards: [
      { file: 'core/object/object.cpp', fn: 'Object::callp(name, args)', kw: 'Object::callp',
        hand: '动态派发大门：先问脚本实例要不要接单，没人接再往原生表走',
        d: '进：StringName 方法名 + Variant 实参数组；出：转发决定', o: '被调对象自己；实参所有权留在调用方栈上', t: '每次按名字调用，按需发生',
        why: '约 883 行 script_instance->callp 优先——重写天然生效。' },
      { file: 'core/object/script_instance.h', fn: 'ScriptInstance::callp()', kw: 'virtual Variant callp',
        hand: '抽象插座：GDScript/C# 等各自实现，引擎只认这一个签名',
        d: '进：同样的名字+实参；出：脚本侧结果或 INVALID_METHOD', o: '脚本语言运行时持有实例数据', t: '仅当对象身上挂着脚本',
        why: '跨语言边界的形状——脚本绑定那一课的正文在这里。' },
      { file: 'core/object/class_db.cpp', fn: 'ClassDB::get_method(class, name)', kw: 'ClassDB::get_method',
        hand: '查全局注册表：类名 + 方法名 → MethodBind 指针',
        d: '进：两个 StringName；出：一个函数包装对象的指针', o: 'ClassDB 单例持有全引擎方法表', t: '启动时宏注册填表，运行时只读查询',
        why: '-fno-rtti 换来的穷人版反射：编译器不给的元数据，宏补齐。' },
      { file: 'core/object/method_bind.h', fn: 'MethodBind::call(obj, args)', kw: 'ptrcall',
        hand: '拆箱：一串 Variant 还原成真实 C++ 形参，转调成员函数',
        d: '进：Variant 数组；出：栈上真参数 + 返回值装箱', o: '不持有数据，纯转调', t: '每次调用现场拆装——热路径成本所在',
        why: 'varcall 通用带检查，ptrcall 免装箱：性能细节在绑定课。' },
      { file: 'scene/main/node.cpp', fn: 'void Node::add_child(...)', kw: 'void Node::add_child',
        hand: '链路终点：一个平平无奇的 C++ 成员函数，开始真正干活',
        d: '进：强类型 Node*；出：挂树、发 NOTIFICATION_PARENTED', o: '父节点从此持有子节点', t: '此刻才轮到场景语义登场',
        why: '五站走完，名字才第一次变成地址——绑定的全部真相。' }
    ] },
  { name: '一次资源加载', q: '磁盘上一个 .tscn，何时、被谁变成内存里的活对象？',
    cards: [
      { file: 'core/io/resource_loader.cpp', fn: 'ResourceLoader::load(path)', kw: 'ResourceLoader::load',
        hand: '统一入口：规范化 res:// 路径，生成 LoadToken 委托内部流程',
        d: '进：路径字符串；出：加载令牌', o: '调用方拿到的永远是 Ref 共享计数', t: '按需；也可 threaded 挪到后台线程',
        why: '约 725 行：同步加载只是「发起 + 立刻等待」的糖衣。' },
      { file: 'core/io/resource.h', fn: 'class ResourceCache', kw: 'ResourceCache',
        hand: '缓存第一站：同一路径第二次命中，直接递回旧对象',
        d: '进：本地路径；出：命中的旧 Ref，未命中放行继续', o: '进程级缓存表；对象本体归引用计数管', t: '每次加载前查；命中即短路',
        why: '「什么时候发生」的答案常藏在「不发生」里。' },
      { file: 'scene/resources/resource_format_text.cpp', fn: 'ResourceFormatLoaderText::load()', kw: 'ResourceFormatLoaderText',
        hand: '格式解析：把文本语法翻成「建什么类、设什么属性、连什么依赖」',
        d: '进：文件字节流；出：类型名 + 属性 + 子资源引用', o: '解析器无状态，产物所有权随即移交', t: '缓存未命中才发生；格式靠扩展名认领',
        why: '约 1397 行；.tres/.tscn 的方言在这里被翻译成对象描述。' },
      { file: 'core/object/class_db.cpp', fn: 'ClassDB::instantiate(type)', kw: 'ClassDB::instantiate',
        hand: '按类型名造出空对象——与线路二在此交汇，注册表再次登场',
        d: '进：一个 StringName；出：活的 Object*', o: '造出的对象立即交给 Ref / 场景树收养', t: '每个未缓存的类型一次',
        why: '两条线路共用一张表：引擎的地基永远比上层薄。' },
      { file: 'scene/main/node.cpp', fn: 'Node::_ready() 通知', kw: 'NOTIFICATION_READY',
        hand: '组装完毕的节点收到 ready：脚本终于拿到一棵完整的树',
        d: '进：一棵挂好的子树；出：可运行的游戏世界', o: '所有权已落定：父持子、场景持根', t: '入树瞬间，一次性',
        why: '加载的终点不是 new 成功，而是对象「可用」。' }
    ] },
];

var HORIZON = [
  ['servers/rendering/', 'RenderingServer', 'Main::iteration 每帧驱动'],
  ['servers/physics_2d/', 'PhysicsServer2D', '物理 tick 内 sync + step'],
  ['servers/physics_3d/', 'PhysicsServer3D', '物理 tick 内 sync + step'],
  ['servers/audio/', 'AudioServer', '混音线程自走节拍'],
  ['servers/navigation_2d/', 'NavigationServer2D', '每帧分片增量计算'],
  ['servers/navigation_3d/', 'NavigationServer3D', '每帧分片增量计算'],
  ['servers/display/', 'DisplayServer', '窗口与输入事件的 OS 桥'],
  ['servers/text/', 'TextServer', '字体整形，按需服务']
];

engine.run({
  setup: function (state) {
    state.route = 0; state.mode = 'select'; state.view = 'vertical';
    state.pick = 0; state.pool = []; state.placed = [];
    state.flash = 0; state.page = 0; state.msg = ''; state.msgT = 0;
    state.seedv = 20260903; state.mistakes = 0; state.t = 0;
  },

  update: function (state, dt, input) {
    state.t += dt;
    if (state.flash > 0) state.flash -= dt;
    if (state.msgT > 0) state.msgT -= dt;
    if (input.pressed('Escape')) { state.mode = 'select'; state.view = 'vertical'; return; }

    if (state.mode === 'select') {
      for (var i = 0; i < 3; i++) {
        if (input.pressed('Digit' + (i + 1))) state.route = i;
      }
      if (input.pressed('ArrowLeft')) state.route = (state.route + 2) % 3;
      if (input.pressed('ArrowRight')) state.route = (state.route + 1) % 3;
      if (input.pressed('KeyH')) state.view = state.view === 'vertical' ? 'horizon' : 'vertical';
      if (input.pressed('Enter')) startChallenge(state);
      return;
    }

    if (state.mode === 'challenge') {
      var n = state.pool.length;
      if (n === 0) { state.mode = 'explain'; state.page = 0; return; }
      if (input.pressed('ArrowUp')) state.pick = (state.pick + n - 1) % n;
      if (input.pressed('ArrowDown')) state.pick = (state.pick + 1) % n;
      if (input.pressed('Backspace') && state.placed.length > 0) {
        var back = state.placed.pop();
        state.pool.splice(0, 0, back);
        state.pick = 0;
      }
      if (input.pressed('Enter')) {
        var want = ROUTES[state.route].cards[state.placed.length];
        var got = state.pool[state.pick];
        if (got === want) {
          state.placed.push(got);
          state.pool.splice(state.pick, 1);
          if (state.pool.length === 0) { state.mode = 'explain'; state.page = 0; }
          else if (state.pick >= state.pool.length) state.pick = state.pool.length - 1;
        } else {
          state.flash = 0.5; state.mistakes++;
          state.msg = '这一站的输出还不是下一站的输入——想想谁先拿到数据';
          state.msgT = 3.5;
        }
      }
      return;
    }

    if (state.mode === 'explain') {
      var total = ROUTES[state.route].cards.length;
      if (input.pressed('ArrowLeft')) state.page = (state.page + total - 1) % total;
      if (input.pressed('ArrowRight')) state.page = (state.page + 1) % total;
      if (input.pressed('Enter')) startChallenge(state);
      return;
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.mode === 'select') drawSelect(state, ctx);
    else if (state.mode === 'challenge') drawChallenge(state, ctx);
    else drawExplain(state, ctx);
    drawHint(state, ctx);
  }
});

// 自带种子的线性同余随机数：可复现，不许用 Math.random
function rnd(state) {
  state.seedv = (state.seedv * 1103515245 + 12345) % 2147483648;
  return state.seedv / 2147483648;
}

// Fisher-Yates 洗牌；若恰好洗成原序则首尾交换一次，保证挑战有意义
function startChallenge(state) {
  var cards = ROUTES[state.route].cards.slice();
  for (var i = cards.length - 1; i > 0; i--) {
    var j = Math.floor(rnd(state) * (i + 1));
    var tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp;
  }
  var shuffled = cards.map(function (c) { return c.fn; }).join("|");
  var original = ROUTES[state.route].cards.map(function (c) { return c.fn; }).join("|");
  if (shuffled === original) {
    var t2 = cards[0]; cards[0] = cards[cards.length - 1]; cards[cards.length - 1] = t2;
  }
  state.pool = cards; state.placed = []; state.pick = 0;
  state.mode = 'challenge'; state.mistakes = 0;
}

// 底部快捷键提示 + 错位反馈
function drawHint(state, ctx) {
  var hint = '1/2/3 选线路 · Enter 开始挑战 · H 水平视图';
  if (state.mode === 'challenge') hint = '↑↓ 选卡 · Enter 放入槽位 · Backspace 撤回 · Esc 退出';
  if (state.mode === 'explain') hint = '←→ 翻页 · Enter 重新挑战 · Esc 回选择';
  ctx.fillStyle = '#55677f'; ctx.font = '12px monospace';
  ctx.fillText(hint, 24, 430);
  if (state.mode === 'challenge' && state.msgT > 0) {
    ctx.fillStyle = '#ef4444'; ctx.font = '13px monospace';
    ctx.fillText(state.msg + '（失误 ' + state.mistakes + ' 次）', 24, 412);
  }
}

// 选择页：三条线路一览（含链路预览），或 servers/ 层的水平走读对比视图
function drawSelect(state, ctx) {
  ctx.font = '18px monospace'; ctx.fillStyle = '#e6eefb';
  ctx.fillText('垂直走读追踪台 —— 选一条线路', 24, 34);
  if (state.view === 'horizon') {
    ctx.font = '14px monospace'; ctx.fillStyle = '#60a5fa';
    ctx.fillText('水平走读：锁死 servers/ 这一层，横着扫', 24, 62);
    ctx.font = '12px monospace';
    for (var i = 0; i < HORIZON.length; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      var x = 24 + col * 350, y = 78 + row * 40;
      ctx.fillStyle = '#121b2a'; ctx.fillRect(x, y, 336, 34);
      ctx.strokeStyle = '#24344d'; ctx.strokeRect(x + 0.5, y + 0.5, 335, 33);
      ctx.fillStyle = '#34d399'; ctx.fillText(HORIZON[i][0], x + 8, y + 14);
      ctx.fillStyle = '#a9bcd4'; ctx.fillText(HORIZON[i][1] + ' · ' + HORIZON[i][2], x + 8, y + 28);
    }
    ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
    ctx.fillText('同层看点：接口形状一致、驱动时机各异——新增后端照抄邻居即可。', 24, 262);
    ctx.fillText('水平视图回答「这层有谁」；Enter 仍进入所选线路的垂直挑战。', 24, 278);
    return;
  }
  for (var r = 0; r < ROUTES.length; r++) {
    var sel = r === state.route;
    var y2 = 58 + r * 118;
    ctx.fillStyle = sel ? '#16233a' : '#101826'; ctx.fillRect(24, y2, 672, 106);
    ctx.strokeStyle = sel ? '#4d8fd6' : '#24344d'; ctx.strokeRect(24.5, y2 + 0.5, 671, 105);
    ctx.font = '16px monospace'; ctx.fillStyle = sel ? '#fbbf24' : '#8fa7c7';
    ctx.fillText((r + 1) + '. ' + ROUTES[r].name + '（' + ROUTES[r].cards.length + ' 站）', 40, y2 + 26);
    ctx.font = '12px monospace'; ctx.fillStyle = '#a9bcd4';
    wrapLines(ctx, '问题句：' + ROUTES[r].q, 40, y2 + 50, 636, 17);
    var chain = ROUTES[r].cards.map(function (c) { return c.file.split('/').pop(); }).join(' -> ');
    ctx.fillStyle = sel ? '#7dd3fc' : '#55677f';
    wrapLines(ctx, chain, 40, y2 + 86, 636, 15);
  }
}

// 挑战页：左=有序槽位，右=乱序候选
function drawChallenge(state, ctx) {
  var route = ROUTES[state.route];
  ctx.font = '15px monospace'; ctx.fillStyle = '#e6eefb';
  ctx.fillText('挑战：把卡片排回正确的调用顺序 —— ' + route.name, 24, 30);
  ctx.font = '12px monospace'; ctx.fillStyle = '#7d93b3';
  wrapLines(ctx, '问题句：' + route.q, 24, 50, 680, 15);
  var flashOn = state.flash > 0 && Math.floor(state.t * 12) % 2 === 0;
  var topY = 74, cardH = 46, gap = 8;
  for (var i = 0; i < route.cards.length; i++) {
    var y = topY + i * (cardH + gap);
    var done = i < state.placed.length;
    var cur = i === state.placed.length;
    ctx.fillStyle = done ? '#12291f' : (cur && !flashOn ? '#16233a' : '#101826');
    ctx.fillRect(24, y, 330, cardH);
    ctx.strokeStyle = flashOn && cur ? '#ef4444' : (done ? '#34d399' : (cur ? '#fbbf24' : '#24344d'));
    ctx.strokeRect(24.5, y + 0.5, 329, cardH - 1);
    ctx.font = '11px monospace';
    if (done) {
      var c = state.placed[i];
      ctx.fillStyle = '#34d399'; ctx.fillText('#' + (i + 1) + '  ' + c.file, 32, y + 18);
      ctx.fillStyle = '#a9bcd4'; ctx.fillText(c.fn, 32, y + 36);
    } else {
      ctx.fillStyle = cur ? '#fbbf24' : '#55677f';
      ctx.fillText(cur ? '#' + (i + 1) + '  <- 当前槽位' : '#' + (i + 1), 32, y + 28);
    }
  }
  ctx.font = '12px monospace'; ctx.fillStyle = '#7d93b3';
  ctx.fillText('候选卡片（乱序）：', 386, 84);
  for (var p = 0; p < state.pool.length; p++) {
    var py = 92 + p * (cardH + gap);
    var picked = p === state.pick;
    ctx.fillStyle = picked ? '#1d2f4d' : '#101826';
    ctx.fillRect(386, py, 310, cardH);
    ctx.strokeStyle = picked ? '#60a5fa' : '#24344d';
    ctx.strokeRect(386.5, py + 0.5, 309, cardH - 1);
    var pc = state.pool[p];
    ctx.fillStyle = picked ? '#fbbf24' : '#8fa7c7';
    ctx.fillText(pc.file, 394, py + 18);
    ctx.fillStyle = '#a9bcd4';
    ctx.fillText(pc.fn, 394, py + 36);
  }
  if (flashOn) {
    ctx.fillStyle = '#ef4444'; ctx.font = '13px monospace';
    ctx.fillText('x 错位！', 360, 60);
  }
}

// 讲解页：逐站展开——交接语 + 三个灵魂拷问 + 为什么值得停一站
function drawExplain(state, ctx) {
  var route = ROUTES[state.route];
  var total = route.cards.length;
  var c = route.cards[state.page];
  ctx.font = '15px monospace'; ctx.fillStyle = '#e6eefb';
  ctx.fillText(route.name + ' · 讲解 ' + (state.page + 1) + ' / ' + total, 24, 30);
  ctx.font = '12px monospace'; ctx.fillStyle = '#7d93b3';
  wrapLines(ctx, '问题句：' + route.q, 24, 50, 680, 15);
  ctx.fillStyle = '#16233a'; ctx.fillRect(24, 74, 672, 92);
  ctx.strokeStyle = '#24344d'; ctx.strokeRect(24.5, 74.5, 671, 91);
  ctx.font = '14px monospace'; ctx.fillStyle = '#60a5fa';
  ctx.fillText('第 ' + (state.page + 1) + ' 站', 40, 96);
  ctx.fillStyle = '#34d399'; ctx.fillText(c.file, 120, 96);
  ctx.font = '13px monospace'; ctx.fillStyle = '#e6eefb';
  ctx.fillText(c.fn, 40, 118);
  ctx.fillStyle = '#fbbf24'; ctx.font = '12px monospace';
  ctx.fillText('搜索关键词：' + c.kw, 40, 140);
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('在仓库里搜这个词，就能跳到我说的位置。', 320, 140);
  var rows = [
    ['交接', c.hand],
    ['数据怎么流动', c.d],
    ['所有权归谁', c.o],
    ['什么时候发生', c.t],
    ['为何值得停一站', c.why]
  ];
  var y = 188;
  for (var i = 0; i < rows.length; i++) {
    ctx.fillStyle = '#55677f'; ctx.font = '12px monospace';
    ctx.fillText('- ' + rows[i][0], 32, y);
    ctx.fillStyle = '#c9d7ec';
    y = wrapLines(ctx, rows[i][1], 160, y, 530, 16) + 8;
  }
  var xs = 24;
  for (var s = 0; s < total; s++) {
    ctx.fillStyle = s === state.page ? '#fbbf24' : '#24344d';
    ctx.fillRect(xs + s * 16, 400, 10, 6);
  }
  ctx.fillStyle = '#55677f'; ctx.font = '11px monospace';
  ctx.fillText('<- 上一站    下一站 ->', 24, 420);
}

// 简易中文换行：按字符宽度估算切行（Canvas 没有自动换行）
function wrapLines(ctx, text, x, y, maxW, lh) {
  var chars = String(text).split("");
  var perLine = Math.max(8, Math.floor(maxW / 12));
  var lines = [], cur = "";
  for (var i = 0; i < chars.length; i++) {
    cur += chars[i];
    if (cur.length >= perLine) { lines.push(cur); cur = ""; }
  }
  if (cur !== "") lines.push(cur);
  for (var l = 0; l < lines.length; l++) ctx.fillText(lines[l], x, y + l * lh);
  return y + (lines.length - 1) * lh;
}`
  },
    {
    "type": "text",
    "title": "读码三件套：断点、日志、调用树",
    "html": "<p>光读不够，得让代码「开口」。三件套按成本排序：<b>调用树最便宜，日志次之，断点最重</b>——能用前者解决的不用后者。</p>\n<p><b>调用树</b>：IDE 的 call hierarchy、clangd 交叉引用，或者像刚才 lab 那样手搭卡片序列。它回答「静态上谁能到这里」，零编译、零污染，永远先用它画草图。<b>日志</b>：在怀疑的站点插一行打印（Godot 现成的有 <code>print_line</code>、<code>ERR_PRINT</code>、性能探测打点），回答「运行时真的到过这里吗、顺序对不对」。日志改变不了行为却处处留痕，是性价比最高的动态手段。<b>断点</b>：信息最全——能停下来看栈、看变量、单步——但编译几十分钟、条件断点还可能被优化器吃掉，成本最高。三件套的纪律：<b>一次只验证一个假设。</b>先写下「我认为 X 在 Y 之后被 Z 调用」，再挑最便宜的手段去证伪。带着十个疑问同时开调试器，等于没带。</p>\n<p>跑不起来怎么办？我们这份浅克隆就不打算编译。没关系：<b>grep 是断点的静态替身，调用树卡片是调试器调用栈的纸面替身。</b>把「当前关注的那一站」当作暂停的线程，问自己：此刻寄存器里是什么（哪份数据）、栈帧是什么（哪些字段）、下一步指令是什么（谁接住它）——三问答得上来，和真挂上调试器的收获差距不大。差异在意外：静态读不到「实际走了哪个分支」，所以关键结论仍要用日志或最小工程复核。</p>"
  },
    {
    "type": "text",
    "title": "闭环：读一段 → 写一段伪码 → 改一段",
    "html": "<p>眼睛滑过一万行，不如手写三十行伪码。走完一站，合上源码，用自己的话写出它的骨架——哪怕只有一行「advance(时间差) → 步数 + 逻辑时长」也算数。写不出，就是没懂，回去重读那一站，而不是硬着头皮往下走。<b>伪码是理解的编译器：源码是别人的，伪码才是你的。</b>这一步同时回答了「所有权归谁」：转写时你会被迫交代每个对象谁创建、谁释放，含糊不得。</p>\n<p>第三拍更进一步：改一段。在本地克隆里做一次微型手术——把物理 tick 默认值改成 120、把一个日志级别调高，然后推演它会波及链路上的哪几站。改不动的地方，就是你还没读懂的地方；改完编译不过，报错信息会精确指出你心智模型里的漏洞。三步的顺序不可颠倒：没读完就改是自作聪明，读完不写伪码是自欺欺人。</p>\n<p>最后，把方法论收拢成五条军规，以后吃任何大项目都适用：</p>\n<ul>\n<li>带着问题句进门：「X 什么时候被谁交给 Y」，没有句子不开工。</li>\n<li>先垂直建立坐标系，再水平批量作业；垂直路上禁止分叉。</li>\n<li>盯数据流跟函数，不盯目录结构闲逛；一遍只追一个维度。</li>\n<li>三件套按便宜程度排队上场，一次只验证一个假设。</li>\n<li>每一站合上书默写伪码，写不出就停下；敢改一段才算毕业。</li>\n</ul>"
  },
    {
    "type": "source",
    "title": "三条线路的站点清单（路径均已验证存在）",
    "files": [
      {
        "path": "main/main.cpp",
        "note": "三条线路的共同上游。搜 Main::iteration 直达每帧总调度台（约 4888 行）；搜 advance.physics_steps 看物理步如何被切片。"
      },
      {
        "path": "main/main_timer_sync.cpp",
        "note": "线路①第 2 站。搜 time_accum 找到累积器本尊（约 355 行），看它折出 physics_steps 与 process_step 两份账。"
      },
      {
        "path": "scene/main/scene_tree.cpp",
        "note": "线路①第 3 站。搜 _process_group 跳到约 1183 行：留意头尾两次 call_queue.flush()——延迟销毁的安全阀藏在这两行里。"
      },
      {
        "path": "scene/main/node.cpp",
        "note": "线路①终点兼线路②目标函数所在。搜 NOTIFICATION_PROCESS 看通知如何翻成 _process 虚调用；搜 void Node::add_child 到达线路②终点。"
      },
      {
        "path": "core/object/object.cpp",
        "note": "线路②第 1 站。搜 Object::callp（约 851 行）：script_instance 优先、原生方法表兜底的派发次序一目了然。"
      },
      {
        "path": "core/object/class_db.cpp",
        "note": "线路②③的交汇点。对照搜 ClassDB::get_method（约 1081 行）与 ClassDB::instantiate（约 687 行）：「按名字调用」与「按名字建造」是同一张表的两次查询。"
      },
      {
        "path": "core/io/resource_loader.cpp",
        "note": "线路③第 1 站。搜 ResourceLoader::load（约 725 行）看入口如何薄；再搜 load_threaded_request 体会「什么时候发生」的第三种答案：后台线程。"
      }
    ]
  },
    {
    "type": "text",
    "title": "试一试（课内可选）",
    "html": "<ul>\n<li>给 lab 添第四条线路：在 <code>ROUTES</code> 数组里仿照现有条目写一组新卡片，主题建议「一次输入事件之旅」——从 platform/ 下的窗口回调，到 Input 单例，再到节点的 <code>_unhandled_input</code>。写卡片的过程就是独立走一条新线的过程：每一站的关键词必须先 grep 验证存在，编不出来的站就是没读懂的站。</li>\n<li>把 <code>startChallenge</code> 里防「洗牌恰好洗成原序」的那段交换删掉，观察卡片偶尔「顺手就是对的」时的体感——说明顺序感已经建立，可以升级难度：凭记忆直接挑战，不看选择页的链路预览。</li>\n<li>在讲解页任选一站的「所有权归谁」，打开对应源文件用 15 分钟验证我的说法。找不到证据链就改判，并把自己的判断写进伪码笔记——这是「读一段→写一段」的第一次实战。</li>\n</ul>"
  },
    {
    "type": "text",
    "title": "小结：把三个灵魂拷问还给你自己",
    "html": "<p>这一课其实没有新知识——前八个阶段每一个知识点，都是这套流程生产出来的：L1.2 是一帧之旅的成品，L2.2 是一次方法调用的成品，资源系统那一章会是资源加载的成品。方法论的价值在于让你离开我也能生产它们。用三个灵魂拷问给本课收官：<b>注意力往哪流</b>——问题句牵引数据流，垂直优先；<b>理解归谁</b>——归写了伪码、做了微手术的人，不归开了二十个标签页的人；<b>什么时候用哪种姿势</b>——建坐标系用垂直，批量作业用水平。下一课 L9.2 毕业实战，选题三选一：给 Godot 提一个真 PR、造一个 mini-engine、或挑一条本课程的线路做深度勘误报告——标准只有一条：可展示、可讲述、可被追问。祝你好运，工程师。</p>"
  }
  ]
}
