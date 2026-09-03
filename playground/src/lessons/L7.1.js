// L7.1 · 输入、事件与 UI：事件路由与 Immediate GUI
export default {
  id: 'L7.1',
  title: '输入、事件与 UI：事件路由与 Immediate GUI',
  est: '2 小时',
  coreQuestions: [
    '数据怎么流动：一次点击从操作系统进到某个按钮的回调，中间经过几站？每一站各自做了什么变换？',
    '所有权归谁：命中测试（哪个 Control 收到这次点击）这件事，是控件自己管的，还是 Viewport 统一裁决的？',
    '什么时候发生：action mapping 在 Input 单例里生效，_gui_input 分发在 Viewport 里发生——它们分别处在主循环的哪一拍？'
  ],
  sections: [
    {
      type: 'text',
      title: '概念一：一次按键的旅程 —— 四站流水线',
      html: `<p>你在键盘上按下 <b>W</b>，屏幕上的角色动了。这中间发生了什么？对用过 Unity Input System 或 Unreal Enhanced Input 的人来说，答案并不陌生，但 Godot 把这条链路切得格外干净：<b>OS → Input → Window/Viewport → Control</b>，四站，各司其职。我们沿着「数据怎么流动」这一问，一站一站看。</p>
<p><b>第一站 OS / DisplayServer。</b>操作系统（Windows 的消息队列、Linux 的 X11/Wayland 事件）把原始输入塞给引擎。Godot 在 platform/ 层把这些翻译成统一的 <code>InputEvent</code> 对象——注意，这一步只做「翻译」，不做任何判断。<code>scene/main/window.cpp</code> 里的 <code>Window::_window_input</code> 是入口：它拿到一个 Ref&lt;InputEvent&gt;，先广播 <code>window_input</code> 信号，再调 <code>push_input(p_ev)</code> 把事件推进场景侧。</p>
<p><b>第二站 Input 单例。</b><code>core/input/input.cpp</code> 的 <code>_parse_input_event_impl</code> 是「记账员」：它维护三张哈希表——<code>keys_pressed</code>（逻辑键码）、<code>physical_keys_pressed</code>（物理键位）、以及鼠标按键掩码。关键设计在这里：<b>动作映射（action mapping）在这一层生效</b>。你在项目设置里把 W 绑成 <code>move_up</code>，就是写进 <code>InputMap</code>；每帧 <code>is_action_pressed("move_up")</code> 查的是这张表加当前按下集合的结果。游戏代码永远读「动作名」而不是「键码」，重绑定因此零成本——这是引擎替所有游戏做的第一次抽象。</p>
<p><b>第三站 Viewport 分发。</b>事件进入场景侧后，由 <code>Viewport::push_input</code> 主持一场严格的接力赛。源码里有一句注释（viewport.cpp 约 3547 行）值得抄下来：<i>"not a bug, must happen before GUI, order is _input -&gt; gui input -&gt; _unhandled input"</i>。也就是说同一帧内，每个事件最多被三个层次消费一次：</p>
<table>
  <tr><th>阶段</th><th>谁响应</th><th>用途</th></tr>
  <tr><td>_input</td><td>任意 Node 的 _input()</td><td>抢在 UI 之前的全局拦截（如调试热键）</td></tr>
  <tr><td>gui input</td><td>命中测试选中的 Control._gui_input()</td><td>UI 交互：点按钮、拖滑块</td></tr>
  <tr><td>_unhandled_input</td><td>Node 的 _unhandled_input()</td><td>没人接住的玩法输入：移动、攻击</td></tr>
</table>
<p>如果有人在前面调用了 <code>set_input_as_handled()</code>（或 Control 里等价的 <code>accept_event()</code>），后面的阶段直接跳过——这就是「已接受则停」的机制，一个布尔标志 <code>local_input_handled</code> 而已。</p>
<p><b>第四站 Control 链。</b>命中测试不是 Control 自己做的，而是 <code>Viewport::gui_find_control</code> 统一裁决：它从最上层往回遍历 GUI 根节点，递归子节点时<b>倒序</b>（<code>for (int i = child_count - 1; i &gt;= 0; i--)</code>）——因为 Godot 按子节点顺序绘制，后画者在上，所以倒序找到的第一个包含该点的控件就是「最上面那个」。找到目标后，<code>_call_gui_input</code> 依次触发 gui_input 信号、_gui_input 虚函数、C++ 的 gui_input()；若处理者调用 <code>accept_event()</code>，Viewport 置位 handled，冒泡到此为止；否则沿父链继续上溯。这解释了一个你早就习以为常的现象：<b>为什么叠在上面的半透明面板会挡住底下的按钮</b>——因为命中测试只认「谁在最上面且 mouse_filter 允许」，不认像素是否真的可见。</p>`
    },
    {
      type: 'text',
      title: '概念二：focus 与两种 GUI 范式',
      html: `<p><b>focus（键盘焦点）是什么？</b>鼠标事件靠命中测试找接收者，键盘事件没有坐标，怎么办？Godot 的答案：每个 Viewport 记一个 <code>gui.key_focus</code> 指针，键盘事件定向投递给它，再由它沿父链冒泡。左键按下时，Viewport 会向上走 hover 链找第一个 <code>_is_focusable()</code> 为真的 Control 并 <code>grab_focus(true)</code>（见 viewport.cpp 约 1988-2013 行）。Tab 键则沿 <code>find_next_valid_focus()</code> 定义的顺序换焦点。所有权视角：焦点归 Viewport 持有，Control 只是被指向的对象——这也是为什么销毁带焦点的节点前必须 release_focus，否则悬空指针事故。</p>
<p><b>Retained GUI（保留模式）。</b>Godot 的 Control 树是典型的保留模式：UI 状态存在对象字段里（按钮按下没、文本框内容、滚动条位置），事件驱动地改状态，渲染时再把状态同步到 CanvasItem。优点：状态丰富、可动画、可序列化进 .tscn；缺点：状态机复杂，编辑器/游戏共用一套树，性能随控件数量线性劣化。</p>
<p><b>Immediate GUI（立即模式）。</b>另一极：Dear ImGui、Godot 编辑器的部分调试面板。没有控件对象——每帧重新执行一遍「画一个按钮」的代码，控件的状态要么不存在，要么寄存在外部。优点：代码即 UI，无状态同步问题，天然适合调试工具；缺点：做不了复杂布局动画，每帧全量重建。</p>
<p>本课实验台用纯 Canvas 2D 同时演示两者：左半场是保留模式的三层 Control 栈（Window→Panel→Button），右半场是立即模式的 HUD 条。你可以亲手关掉某一层的「接受事件」开关，看事件包如何逐站流转、在哪里停下、又在哪里一路漏到玩法层。读完实验再回头看源码，会发现四站流水线的每一站都对应一处具体的 if。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'route',
      title: '实验：一次按键的旅程 —— 事件路由沙盘',
      height: 560,
      code: `// 事件路由沙盘：OS -> Input -> Viewport -> Control 链
// 操作：
//   鼠标点击左半场任意处 = 发一个鼠标事件包；按 W/A/S/D = 发一个键盘事件包
//   数字键 1/2/3 = 切换 Button/Panel/Window 的「接受事件」开关
//   F = 切换 immediate/retained 视图；R = 重置
// 观察右侧日志：事件包每到一个站点就打印一行决策记录

engine.run({
  setup: function (state) {
    state.seed = 12345;                       // 自带种子的 LCG（备用抖动源，不碰 Math.random）
    state.layers = [
      { name: 'Window', x: 40,  y: 70,  w: 300, h: 260, accept: true, color: '#2f4468' },
      { name: 'Panel',  x: 110, y: 120, w: 220, h: 170, accept: true, color: '#3a5a40' },
      { name: 'Button', x: 160, y: 170, w: 120, h: 46,  accept: true, color: '#b45309' }
    ];
    state.pkt = null;          // 当前飞行的事件包（一次一条，看清旅程）
    state.log = [];            // 日志流
    state.focus = 'none';      // 键盘焦点归属
    state.view = 'retained';   // retained | immediate
    state.playerX = 60;        // immediate 视图里的小人
    state.moved = 0;           // 动作统计
    pushLog(state, '就绪：点击左半场或按 WASD 发射事件包');
  },

  update: function (state, dt, input) {
    var i;
    state.seed = (state.seed * 1103515245 + 12345) % 2147483648;

    for (i = 0; i < 3; i++) {                 // 1/2/3：切换各层接受开关
      if (input.pressed('Digit' + (i + 1))) {
        state.layers[i].accept = !state.layers[i].accept;
        pushLog(state, '切换 ' + state.layers[i].name + ' 接受=' + (state.layers[i].accept ? 'ON' : 'OFF'));
      }
    }
    if (input.pressed('KeyF')) {
      state.view = state.view === 'retained' ? 'immediate' : 'retained';
      pushLog(state, '视图切到 ' + state.view);
    }
    if (input.pressed('KeyR')) {
      state.pkt = null; state.log = []; state.focus = 'none'; state.moved = 0;
      pushLog(state, '已重置');
    }

    if (!state.pkt) {                          // 空闲时发射新事件包
      var key = null;
      if (input.pressed('KeyW')) key = 'move_up';
      else if (input.pressed('KeyS')) key = 'move_down';
      else if (input.pressed('KeyA')) key = 'move_left';
      else if (input.pressed('KeyD')) key = 'move_right';
      if (key || input.mouse.clicked) {
        state.pkt = { kind: key ? 'key' : 'mouse', action: key || '',
          mx: input.mouse.x, my: input.mouse.y, station: 0, t: 0, hit: null, chain: null, ci: 0, done: false };
        pushLog(state, '[OS] 事件入队: ' + (key ? 'Key(WASD)' : 'MouseClick'));
      }
    }
    if (state.pkt && !state.pkt.done) {        // 每 0.5 秒推进一站
      state.pkt.t += dt;
      if (state.pkt.t >= 0.5) { state.pkt.t = 0; advancePacket(state); }
    }

    if (state.view === 'immediate') {          // immediate：每帧轮询电平
      var sp = 140 * dt;
      if (input.down('KeyA')) { state.playerX -= sp; state.moved++; }
      if (input.down('KeyD')) { state.playerX += sp; state.moved++; }
      if (state.playerX < 40) state.playerX = 40;
      if (state.playerX > 322) state.playerX = 322;
    }
  },

  draw: function (state, ctx) {
    var i, L;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '13px monospace';

    var sx = [40, 170, 300, 430];             // 顶部四站轨道
    var names = ['OS', 'Input', 'Viewport', 'Control 链'];
    for (i = 0; i < 4; i++) {
      ctx.fillStyle = '#16233a'; ctx.fillRect(sx[i], 12, 110, 30);
      ctx.strokeStyle = '#4a5f80'; ctx.lineWidth = 1; ctx.strokeRect(sx[i], 12, 110, 30);
      ctx.fillStyle = '#8fa7c7'; ctx.fillText(names[i], sx[i] + 8, 32);
      if (i < 3) { ctx.fillStyle = '#4a5f80'; ctx.fillText('-->', sx[i] + 113, 32); }
    }

    if (state.view === 'retained') {          // 三层 Control 矩形，z 序叠放
      for (i = 0; i < 3; i++) {
        L = state.layers[i];                  // 自底向上铺：Window, Panel, Button
        ctx.fillStyle = L.color; ctx.globalAlpha = 0.55;
        ctx.fillRect(L.x, L.y, L.w, L.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = L.accept ? '#e2e8f0' : '#f87171';
        ctx.lineWidth = L.accept ? 2 : 1;
        ctx.strokeRect(L.x, L.y, L.w, L.h);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(L.name + ' accept=' + (L.accept ? 'ON' : 'OFF'), L.x + 6, L.y + 16);
      }
      ctx.fillStyle = '#7d93b3'; ctx.lineWidth = 1;
      ctx.fillText('z 序：Button 在最上，命中测试从它开始查', 44, 350);
      ctx.fillText('白框=接受(STOP) 红框=忽略(冒泡)', 44, 370);
    } else {                                   // immediate：无控件对象，每帧全量重画
      ctx.fillStyle = '#16233a'; ctx.fillRect(40, 70, 300, 260);
      ctx.strokeStyle = '#2f4468'; ctx.strokeRect(40, 70, 300, 260);
      ctx.fillStyle = '#34d399'; ctx.fillRect(state.playerX, 180, 18, 30);
      ctx.fillStyle = '#7d93b3';
      ctx.fillText('immediate：无控件对象，每帧重画一切', 44, 350);
      ctx.fillText('按住 A/D 移动小人（每帧轮询 down()）', 44, 370);
    }

    if (state.pkt && !state.pkt.done) {        // 飞行中的信封
      var px = sx[Math.min(state.pkt.station, 3)] + 55;
      var py = 60 + Math.sin(state.pkt.t * 12) * 3;
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(px - 9, py, 18, 12);
      ctx.strokeStyle = '#78350f'; ctx.strokeRect(px - 9, py, 18, 12);
      ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px, py + 6); ctx.lineTo(px + 9, py); ctx.stroke();
    }

    ctx.fillStyle = '#0d1420'; ctx.fillRect(470, 12, 240, 320);   // 右侧日志流
    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(470, 12, 240, 320);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('日志（最新在下）', 480, 30);
    ctx.fillStyle = '#a7bdd9';
    for (i = 0; i < state.log.length; i++) ctx.fillText(clip(state.log[i], 30), 480, 52 + i * 22);

    ctx.fillStyle = '#7d93b3';
    ctx.fillText('焦点 focus=' + state.focus + '  移动计数=' + state.moved, 12, 430);
  }
});

function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '..' : s; }

function pushLog(state, s) { state.log.push(s); if (state.log.length > 12) state.log.shift(); }

// 事件包抵达下一站的决策逻辑（对应 Godot 真实行为）
function advancePacket(state) {
  var p = state.pkt;
  if (p.station === 0) {                       // OS -> Input：动作映射在此生效
    p.station = 1;
    pushLog(state, p.kind === 'key'
      ? '[Input] 查 InputMap: Key(WASD) -> action=' + p.action
      : '[Input] 鼠标事件无需映射，原样透传');
    return;
  }
  if (p.station === 1) {                       // Input -> Viewport：命中测试 / 焦点投递
    p.station = 2;
    if (p.kind === 'mouse') {
      var hit = null;                           // z 序自上而下：Button, Panel, Window
      var order = [state.layers[2], state.layers[1], state.layers[0]];
      for (var i = 0; i < 3; i++) {
        var L = order[i];
        if (p.mx >= L.x && p.mx <= L.x + L.w && p.my >= L.y && p.my <= L.y + L.h) { hit = L; break; }
      }
      p.hit = hit;
      pushLog(state, '[Viewport] 命中测试 -> ' + (hit ? hit.name : '空白处'));
      if (!hit) { pushLog(state, '[Viewport] 无人命中 -> _unhandled_input 漏给玩法'); p.done = true; }
    } else {
      pushLog(state, '[Viewport] 键盘事件 -> 投递给 focus=' + (state.focus === 'none' ? '无' : state.focus));
      if (state.focus === 'none') {
        pushLog(state, '[Viewport] 无焦点 -> _unhandled_input，玩法读 is_action_just_pressed');
        if (p.action) state.moved += 1;
        p.done = true;
      } else { p.chain = chainFrom(state.focus); p.ci = 0; p.station = 3; }
    }
    return;
  }
  if (p.station === 2) {                       // Viewport -> Control 链入口
    if (!p.hit) { p.done = true; return; }
    p.chain = chainFrom(p.hit.name); p.ci = 0; p.station = 3;
    return;
  }
  if (p.station === 3) {                       // Control 链逐层：接受则停，否则冒泡
    var nm = p.chain[p.ci];
    var lay = layerByName(state, nm);
    pushLog(state, '[Control] ' + nm + '._gui_input 收到');
    if (lay && lay.accept) {
      pushLog(state, '[Control] ' + nm + ' accept_event() -> 停止传播');
      if (nm === 'Button') { state.focus = 'Button'; pushLog(state, '[Viewport] Button grab_focus 成功'); }
      p.done = true;
    } else {
      p.ci++;
      if (p.ci >= p.chain.length) {
        pushLog(state, '[Viewport] 整条链未接受 -> _unhandled_input 兜底');
        if (p.kind === 'key' && p.action) state.moved += 1;
        p.done = true;
      } else {
        pushLog(state, '[Control] ' + nm + ' 忽略 -> 冒泡到父级 ' + p.chain[p.ci]);
      }
    }
  }
}

function chainFrom(name) {                      // Control 父链：Button -> Panel -> Window
  if (name === 'Button') return ['Button', 'Panel', 'Window'];
  if (name === 'Panel') return ['Panel', 'Window'];
  return ['Window'];
}

function layerByName(state, n) {
  for (var i = 0; i < 3; i++) if (state.layers[i].name === n) return state.layers[i];
  return null;
}
`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>关掉 Button 的 accept（按 1），再点 Button：日志应显示 Button 忽略 → 冒泡到 Panel → 再到 Window。这正是 Godot 里 <code>MOUSE_FILTER_PASS</code> 的效果——控件收得到事件，但不拦路。</li>
  <li>把三层全关，再点 Button：事件一路漏到底，最后进 <code>_unhandled_input</code>。反过来，只开 Panel 关 Button，点击落在重叠区时 Button 不接、Panel 接住——这就是「透明覆盖层吃掉点击」事故的复现现场。</li>
  <li>先让 Button 接受一次点击（它会 grab_focus），然后按 W：键盘事件不再走命中测试，而是定向投给焦点 Button。想体会「为什么我按 WASD 角色不动了」——多半是某个 UI 拿着焦点又不接键盘。</li>
  <li>按 F 切到 immediate 视图：没有控件对象、没有事件队列，小人移动完全靠每帧轮询 <code>down()</code>。对比 retained 视图里事件驱动的逐站流转，想想 Dear ImGui 和 Godot Control 各自的代价。</li>
  <li>思考题：沙盘里「接受=ON 则停」对应源码中 <code>Viewport::set_input_as_handled()</code> 置位的 <code>local_input_handled</code> 标志。为什么这个标志必须由 Viewport 集中持有，而不是每个 Control 自己记「我处理过了」？</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：四个文件走完一次旅程',
      files: [
        { path: 'core/input/input.cpp', note: 'Input 单例：_parse_input_event_impl 维护 keys_pressed / physical_keys_pressed 两张表，动作映射查询在此生效——它是「键」与「意图」的分界线。' },
        { path: 'core/input/input_event.cpp', note: 'InputEvent 家族：重点看 is_action / is_action_pressed 的匹配逻辑（exact_match 分支，约 51-67 行），理解 logical/physical 两套键码语义的差异。' },
        { path: 'scene/main/window.cpp', note: 'Window::_window_input（约 2013 行）是 OS 事件的落地入口：广播 window_input 信号后 push_input 进场景；再看 fullscreen_shortcut_enabled 那段——连快捷键都在这一层拦截。' },
        { path: 'scene/gui/control.cpp', note: 'Control::_call_gui_input（约 2579 行）三连发：gui_input 信号 → _gui_input 虚函数 → C++ gui_input()；accept_event() 转手把「已接受」交给 Viewport 的 _gui_accept_event。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回答开头的三问。<b>数据怎么流动：</b>一次输入变成 InputEvent 对象后，沿 OS → Input（记账+动作映射）→ Viewport（命中测试+三段分发 _input / gui / _unhandled）→ Control 链（_gui_input 逐个过堂）单向流动，每一站都有权把它截停。<b>所有权归谁：</b>按下状态表归 Input 单例，焦点指针和「已处理」标志归 Viewport，控件只持有自己的外观与交互状态——集中裁决保证了同帧只有一个消费者。<b>什么时候发生：</b>全部发生在主循环的一帧之内、按固定顺序；跨帧的只有「谁还按着」这类电平状态。</p>
<p>这套设计的通用性远超 Godot：Unreal 的 Slate 路由、Web 的 DOM 事件捕获/冒泡、ECS 框架里的 InputAction 系统，都是同一条流水线的变体。下一课 L7.2 讲动画系统时，你会看到同样的「服务器持有状态、节点按需查询」结构再次出现。</p>`
    }
  ]
}
