// L3 · Mod 与脚本 API 设计
export default {
  id: 'L3',
  title: 'Mod 与脚本 API 设计',
  est: '2 小时',
  coreQuestions: [
    '「让玩家改游戏」和「让玩家毁掉游戏」的边界画在哪？',
    '沙箱、钩子、能力白名单各防什么？',
    '为什么 Mod API 的设计难度远高于内部 API？',
    '资源预算（每帧配额）为什么是防恶意 mod 的最后防线？'
  ],
  sections: [
  {
    type: 'text',
    title: 'Mod 的本质：把接口租给陌生人',
    html: `<p>Mod 支持是游戏长寿的秘诀，但它要求你把内部接口租给<b>不受信任的代码</b>。三道防线层层设卡：</p>
<table>
  <tr><th>防线</th><th>防什么</th><th>手段</th></tr>
  <tr><td>沙箱</td><td>越权访问（读文件/改内核）</td><td>VM 级隔离（GDScript 跑在自家 VM，不直接碰 C++ 内存）或声明式命令列表</td></tr>
  <tr><td>能力白名单</td><td>合法 VM 里的危险调用</td><td>只暴露白名单函数——api 里没有的东西，mod 连引用都拿不到</td></tr>
  <tr><td>资源预算</td><td>合法调用被滥用（死循环/每帧十万次）</td><td>每帧调用配额、执行时长上限，超限挂起</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '钩子与 API 设计的谦卑',
    html: `<p><b>钩子（hook）</b>是游戏逻辑里预留的「发言点」：onHit、onLoad、onTick……mod 只能在钩子里响应，不能在任意位置插入逻辑——这保证游戏主流程的主权。API 设计的谦卑在于：<b>一旦发布就再也不能改签名</b>（无数 mod 会立刻依赖它），所以宁可暴露窄而稳的小接口（+伤害、+金币），也不要暴露宽而脆的大接口（直接改内存数组）。</p>
<p>Godot 的答案是把「脚本」做成一等公民：GDScript 跑在自家 VM（天然沙箱），通过 Object 的属性/方法暴露层与信号系统通信——C++ 内核从不把裸指针交给脚本。本课用一个声明式 mod 系统演示这三道防线的配合。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'modapi',
    title: '实验：迷你 mod 加载器（白名单 + 预算 + 三种 mod）',
    height: 620,
    code: `// 空格=触发 onHit 事件  1/2/3=开关三个 mod  Q/E=每帧预算  R=重置
// 白名单只有 damage/heal;modC 想调 deleteSave/stealCoins——看它被当场拦下

var WHITELIST = { damage: true, heal: true, spawnParticle: true };

var MODS = [
  {
    name: 'modA 更高伤害', on: true, budgetUsed: 0, suspended: false, blocked: 0,
    onHit: [
      { call: 'damage', arg: 6 },
      { call: 'spawnParticle', arg: '火花' }
    ]
  },
  {
    name: 'modB 自动回血', on: false, budgetUsed: 0, suspended: false, blocked: 0,
    onHit: [
      { call: 'heal', arg: 3 },
      { call: 'damage', arg: -2 },
      { call: 'spawnParticle', arg: '治疗光' }
    ]
  },
  {
    name: 'modC 删档小丑', on: false, budgetUsed: 0, suspended: false, blocked: 0,
    onHit: [
      { call: 'deleteSave', arg: null },
      { call: 'stealCoins', arg: 9999 },
      { call: 'damage', arg: 3 },
      { call: 'damage', arg: 3 },
      { call: 'damage', arg: 3 },
      { call: 'damage', arg: 3 }
    ]
  }
];

engine.run({
  setup: function (state) {
    state.hp = 100;
    state.coins = 50;
    state.frame = 0;
    state.budget = 4;
    state.events = [];
    state.blockedLog = [];
    state.rng = mulberry32(20260903);
    state.log = ['空格触发 onHit;1/2/3 开关 mod'];
  },

  update: function (state, dt, input) {
    state.frame++;
    if (input.pressed('Digit1')) toggleMod(state, 0);
    if (input.pressed('Digit2')) toggleMod(state, 1);
    if (input.pressed('Digit3')) toggleMod(state, 2);
    if (input.pressed('KeyQ')) { state.budget = Math.max(1, state.budget - 1); pushLog(state, '每帧预算=' + state.budget); }
    if (input.pressed('KeyE')) { state.budget = Math.min(8, state.budget + 1); pushLog(state, '每帧预算=' + state.budget); }
    if (input.pressed('Space') && !state.paused) fireEvent(state, 'onHit');
    // 预算按帧重置
    for (var i = 0; i < MODS.length; i++) MODS[i].budgetUsed = 0;
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawModList(state, ctx);
    drawApiPanel(state, ctx);
    drawLog(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 事件与能力白名单 ----------

function toggleMod(state, i) {
  MODS[i].on = !MODS[i].on;
  MODS[i].suspended = false;
  pushLog(state, MODS[i].name + (MODS[i].on ? ' 已加载' : ' 已卸载'));
}

function fireEvent(state, hook) {
  state.events.push('事件 ' + hook + ' @帧' + state.frame);
  if (state.events.length > 4) state.events.shift();
  for (var i = 0; i < MODS.length; i++) {
    var mod = MODS[i];
    if (!mod.on || mod.suspended) continue;
    var cmds = mod[hook] || [];
    for (var c = 0; c < cmds.length; c++) {
      if (mod.budgetUsed >= state.budget) {
        mod.suspended = true;
        pushLog(state, mod.name + ' 超预算,本帧挂起(预算 ' + state.budget + ')');
        break;
      }
      mod.budgetUsed++;
      var cmd = cmds[c];
      if (!WHITELIST[cmd.call]) {
        mod.blocked++;
        state.blockedLog.push('帧' + state.frame + ' 拦截 ' + mod.name + ' 调用 ' + cmd.call + '()');
        if (state.blockedLog.length > 4) state.blockedLog.shift();
        continue;
      }
      invoke(state, cmd.call, cmd.arg);
    }
  }
}

function invoke(state, fn, arg) {
  if (fn === 'damage') {
    state.hp = clamp(state.hp + arg, 0, 100);
    state.events.push('damage ' + (arg > 0 ? '-' : '+') + Math.abs(arg) + ' → HP ' + Math.round(state.hp));
  } else if (fn === 'heal') {
    state.hp = clamp(state.hp + Math.abs(arg), 0, 100);
    state.events.push('heal +' + Math.abs(arg) + ' → HP ' + Math.round(state.hp));
  } else if (fn === 'spawnParticle') {
    state.events.push('spawnParticle ' + arg);
  }
  if (state.events.length > 4) state.events.shift();
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- 绘制 ----------

function drawModList(state, ctx) {
  var x = 16, y = 52;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('已加载 mod(1/2/3 开关):', x, y - 8);
  for (var i = 0; i < MODS.length; i++) {
    var m = MODS[i];
    var my = y + i * 66;
    ctx.fillStyle = m.suspended ? '#2c1a1a' : (m.on ? '#141a24' : '#10151d');
    ctx.fillRect(x, my, 340, 58);
    ctx.strokeStyle = m.suspended ? '#f87171' : (m.on ? '#6ee7b7' : '#3b4d6b');
    ctx.strokeRect(x, my, 340, 58);
    ctx.fillStyle = m.suspended ? '#f87171' : (m.on ? '#a7f3d0' : '#5b7397');
    ctx.fillText((m.on ? '● ' : '○ ') + m.name + (m.suspended ? ' [本帧挂起]' : ''), x + 10, my + 18);
    ctx.fillStyle = '#5b7397';
    ctx.font = '10px monospace';
    ctx.fillText('预算 ' + m.budgetUsed + '/' + state.budget + '  被拦截调用 ' + m.blocked + ' 次', x + 10, my + 38);
    ctx.font = '12px monospace';
  }
}

function drawApiPanel(state, ctx) {
  var x = 400, y = 52;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('能力白名单(不在表内=无法调用):', x, y - 8);
  var api = ['damage(±n)', 'heal(+n)', 'spawnParticle(s)'];
  for (var i = 0; i < api.length; i++) {
    ctx.fillStyle = '#14301f';
    ctx.fillRect(x, y + i * 26, 150, 20);
    ctx.strokeStyle = '#6ee7b7';
    ctx.strokeRect(x, y + i * 26, 150, 20);
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('✓ ' + api[i], x + 8, y + i * 26 + 14);
  }
  var banned = ['deleteSave()', 'stealCoins(n)'];
  for (var b = 0; b < banned.length; b++) {
    ctx.fillStyle = '#2c1a1a';
    ctx.fillRect(x + 160, y + b * 26, 150, 20);
    ctx.strokeStyle = '#f87171';
    ctx.strokeRect(x + 160, y + b * 26, 150, 20);
    ctx.fillStyle = '#f87171';
    ctx.fillText('✗ ' + banned[b], x + 168, y + b * 26 + 14);
  }
  // 事件流水
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('游戏事件流:', x, y + 110);
  ctx.font = '11px monospace';
  for (var e = 0; e < state.events.length; e++) {
    ctx.fillStyle = e === state.events.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.events[e], x, y + 128 + e * 15);
  }
}

function drawLog(state, ctx) {
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('拦截记录(能力白名单的执法记录):', 16, 300);
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(16, 308, 688, 90);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(16, 308, 688, 90);
  ctx.font = '11px monospace';
  if (!state.blockedLog.length) {
    ctx.fillStyle = '#3b4d6b';
    ctx.fillText('(干净:白名单没拦到任何越权调用)', 24, 326);
  }
  for (var i = 0; i < state.blockedLog.length; i++) {
    ctx.fillStyle = '#f87171';
    ctx.fillText(state.blockedLog[i], 24, 326 + i * 15);
  }
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('玩家 HP ' + Math.round(state.hp) + '/100  金币 ' + state.coins + '  每帧预算 ' + state.budget + '(Q/E)', 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('空格=触发 onHit  1/2/3=开关 mod  Q/E=预算  R=重置', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('开启 modC 再按空格:白名单拦下删档与偷金币,预算拦下刷屏——三道防线逐层设卡', 430, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>开 modA 按空格：</b>事件流里出现 damage -6 与火花粒子——「合法 mod」在白名单内顺畅运行。</li>
  <li><b>开 modC（3）再按空格：</b>它想调 deleteSave() 和 stealCoins()——拦截记录当场记红：白名单里没有的函数，mod 连引用都拿不到。</li>
  <li><b>看 modC 被预算掐死：</b>它一口气带了 4 次 damage，预算只有 4——第二次空格就把它「本帧挂起」：合法调用被滥用时，预算是最后防线。</li>
  <li><b>Q 把预算压到 1：</b>连 modB 的三个调用都跑不完——预算不只防恶意，也逼所有 mod 写得克制。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的脚本沙箱',
    files: [
      { path: 'modules/gdscript/gdscript_vm.cpp', note: 'GDScript VM：自家字节码解释器——脚本摸不到 C++ 内存，天然沙箱（本课「声明式命令」的安全等价物）。建议搜索：GDScriptFunction::_call、opcode。' },
      { path: 'modules/gdscript/gdscript.cpp', note: '脚本语言模块的注册与加载：第三方「脚本」如何被识别、加载、校验后进入游戏。建议搜索：load_source_code、init、get_template。' },
      { path: 'core/object/script_language.cpp', note: 'ScriptLanguage 接口：引擎与脚本世界之间唯一允许的桥——能力面被这个接口严格圈定。建议搜索：ScriptLanguage、debug、get_template。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>Mod API 是「礼貌的防御工事」：沙箱挡越权、白名单挡危险调用、预算挡滥用，钩子保证主权在游戏。设计它的心态不是「信任 mod 作者」，而是「假设任何 mod 都可能是恶意或低质的，然后依然让它安全地跑」。</p>
<ul>
  <li><b>数据怎么流动？</b>游戏事件→钩子分发→已加载 mod 的命令列表→白名单过滤→预算校验→受控调用→事件流水。</li>
  <li><b>所有权归谁？</b>游戏状态永远归游戏内核，mod 只拿得到白名单函数的「调用权」——所有权不外借，是租约。</li>
  <li><b>什么时候发生？</b>mod 在加载时注册钩子、事件发生时被回调、预算按帧重置——「帧」再次成为所有安全审计的会计单位。</li>
</ul>`
  }
  ]
};
