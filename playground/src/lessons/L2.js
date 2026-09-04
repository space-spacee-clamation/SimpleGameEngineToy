// L2 · 存档系统深水区:版本迁移
export default {
  id: 'L2',
  title: '存档系统深水区：版本迁移',
  est: '2 小时',
  coreQuestions: [
    '玩家三年前的存档，凭什么在新版本里还能读？',
    '存档里的「版本号」到底在标记谁？',
    '迁移链（migration chain）怎么组织？跳级迁移为什么危险？',
    '哪些字段该存、哪些字段绝不该存？'
  ],
  sections: [
  {
    type: 'text',
    title: '存档是跨时间的合同',
    html: `<p>存档文件是游戏与「三年前的自己」签的合同：老版本写下的每个字段，新版本都得能解释。版本更迭时字段会改名（name→playerName）、会拆分（score→xp+coins）、会新增（items/hp）——如果没有一套机制，老存档读出来全是 <code>undefined</code>，玩家进度凭空蒸发。</p>
<p>机制的锚点只有一个字段：<b>存档版本号</b>。它标记的不是「游戏版本」，而是「这份存档的数据结构契约版本」。读到 v2 的存档，当前代码（v4）就依次执行 v2→v3→v4 的迁移函数，把老合同逐条改写成新合同。</p>`
  },
  {
    type: 'text',
    title: '迁移链的三条军规',
    html: `<table>
  <tr><th>军规</th><th>内容</th><th>违反的后果</th></tr>
  <tr><td>只向前迁移</td><td>m1: v1→v2, m2: v2→v3, m3: v3→v4，串成链</td><td>跳级迁移会漏掉中间的字段语义变化</td></tr>
  <tr><td>迁移函数不可变</td><td>已发布的迁移函数永不修改，只新增</td><td>老玩家存档在新补丁里再次坏掉</td></tr>
  <tr><td>缺字段给默认值</td><td>新增字段必须有合理默认</td><td>undefined 渗进游戏逻辑</td></tr>
</table>
<p>与「该存什么」的纪律：只存<b>不可推导的状态</b>（进度/选择/计数），不存可推导的（怪物当前位置、UI 状态）；不存对其他版本的引用（资产路径要经 UID 间接）。Godot 的存档本质是 Resource 序列化（文本/二进制两种格式），版本管理同样靠开发者自己写版本字段与迁移。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'migration',
    title: '实验：四级存档的迁移链（开着迁移 vs 关掉迁移）',
    height: 620,
    code: `// 空格=生成一份存档  Q/E=选存档版本  回车=加载(F 关/开迁移)  R=重置
// 左=原始存档  中=迁移链流水  右=当前代码读到的游戏状态(undefined 红色警告)

var CURRENT = 4;

engine.run({
  setup: function (state) {
    state.chosen = 1;
    state.save = null;
    state.loadOn = false;
    state.migrations = [];
    state.loaded = null;
    state.log = ['空格生成存档(版本由 Q/E 选);回车加载'];
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyR')) resetAll(state);
    if (input.pressed('KeyQ')) { state.chosen = Math.max(1, state.chosen - 1); state.save = null; state.loaded = null; state.migrations = []; }
    if (input.pressed('KeyE')) { state.chosen = Math.min(CURRENT, state.chosen + 1); state.save = null; state.loaded = null; state.migrations = []; }
    if (input.pressed('Space')) {
      state.save = makeSave(state.chosen);
      state.loaded = null;
      state.migrations = [];
      pushLog(state, '生成 v' + state.chosen + ' 存档');
    }
    if (input.pressed('KeyF')) { state.loadOn = !state.loadOn; pushLog(state, state.loadOn ? '迁移:开' : '迁移:关(裸读,自担风险)'); }
    if (input.pressed('Enter') && state.save) loadSave(state);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    drawSave(state, ctx);
    drawPipeline(state, ctx);
    drawLoaded(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 四个版本的数据模型与迁移链 ----------

var FIELD_NAMES = ['name 名字', 'score 分数', 'level 等级', 'playerName 玩家名', 'xp 经验', 'coins 金币', 'items 物品', 'hp 血量'];

function makeSave(v) {
  var base = { v: v, name: '勇者阿明', score: 4200 };
  if (v >= 2) base.level = 7;
  if (v >= 3) { delete base.score; base.xp = 42000; base.coins = 4200; }
  if (v >= 3) { delete base.name; base.playerName = '勇者阿明'; }
  if (v >= 4) { base.items = ['铁剑', '红药×3']; base.hp = 86; }
  return base;
}

var MIGRATIONS = [
  { from: 1, to: 2, note: 'm1: 新增 level=1(默认值军规)', fn: function (d) { d.level = 1; } },
  { from: 2, to: 3, note: 'm2: score 拆成 xp/coins; name 改名 playerName', fn: function (d) {
      if (d.score !== undefined) { d.xp = d.score * 10; d.coins = Math.floor(d.score / 10); delete d.score; }
      if (d.name !== undefined) { d.playerName = d.name; delete d.name; }
  } },
  { from: 3, to: 4, note: 'm3: 新增 items[] 与 hp(带默认)', fn: function (d) { d.items = ['铁剑']; d.hp = 100; } }
];

function loadSave(state) {
  var d = deepCopy(state.save);
  state.migrations = [];
  if (state.loadOn) {
    while (d.v < CURRENT) {
      var m = null;
      for (var i = 0; i < MIGRATIONS.length; i++) if (MIGRATIONS[i].from === d.v) m = MIGRATIONS[i];
      if (!m) { pushLog(state, '没有 v' + d.v + ' 的迁移函数!'); break; }
      m.fn(d);
      d.v = m.to;
      state.migrations.push({ note: m.note, at: m.from + '→' + m.to });
      pushLog(state, '迁移 ' + m.from + '→' + m.to + ' 完成');
    }
  }
  state.loaded = d;
}

function deepCopy(o) {
  var out = {};
  for (var k in o) out[k] = o[k];
  return out;
}

function resetAll(state) {
  state.chosen = 1;
  state.save = null;
  state.loaded = null;
  state.migrations = [];
  state.log = ['已重置'];
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

// ---------- 绘制 ----------

function drawSave(state, ctx) {
  var x = 16, y = 52;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('原始存档(版本 v' + (state.save ? state.save.v : state.chosen) + '):', x, y - 8);
  ctx.fillStyle = '#101826';
  ctx.fillRect(x, y, 250, 250);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x, y, 250, 250);
  if (state.save) {
    var keys = [];
    for (var k in state.save) keys.push(k);
    keys.sort();
    for (var i = 0; i < keys.length; i++) {
      ctx.fillStyle = keys[i] === 'v' ? '#ffd479' : '#9db4d0';
      ctx.fillText('"' + keys[i] + '": ' + state.save[keys[i]], x + 10, y + 24 + i * 18);
    }
  } else {
    ctx.fillStyle = '#3b4d6b';
    ctx.fillText('(空格生成)', x + 10, y + 24);
  }
  ctx.fillStyle = '#5b7397';
  ctx.font = '10px monospace';
  ctx.fillText('Q/E=切换版本  空格=生成', x, y + 278);
}

function drawPipeline(state, ctx) {
  var x = 300, y = 52;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('迁移链(v1→v2→v3→v4):', x, y - 8);
  for (var i = 0; i < MIGRATIONS.length; i++) {
    var m = MIGRATIONS[i];
    var done = false;
    for (var j = 0; j < state.migrations.length; j++) {
      if (state.migrations[j].at === m.from + '→' + m.to) done = true;
    }
    var on = state.loaded && state.loadOn && done;
    ctx.fillStyle = on ? '#14301f' : '#141a24';
    ctx.fillRect(x, y + i * 58, 240, 50);
    ctx.strokeStyle = on ? '#6ee7b7' : '#3b4d6b';
    ctx.strokeRect(x, y + i * 58, 240, 50);
    ctx.fillStyle = on ? '#a7f3d0' : '#5b7397';
    ctx.fillText(m.from + '→' + m.to, x + 10, y + i * 58 + 18);
    ctx.fillText(on ? '✓ 已执行' : '待命', x + 190, y + i * 58 + 18);
    ctx.font = '10px monospace';
    ctx.fillText(m.note, x + 10, y + i * 58 + 36);
    ctx.font = '12px monospace';
  }
  if (state.loaded && !state.loadOn) {
    ctx.fillStyle = '#f87171';
    ctx.fillText('迁移关闭:裸读老存档', x, y + 180);
  }
}

function drawLoaded(state, ctx) {
  var x = 580, y = 52;
  ctx.fillStyle = '#8fa7c7';
  ctx.font = '12px monospace';
  ctx.fillText('当前代码读到的状态:', x - 20, y - 8);
  ctx.fillStyle = '#101826';
  ctx.fillRect(x - 20, y, 156, 250);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(x - 20, y, 156, 250);
  if (!state.loaded) {
    ctx.fillStyle = '#3b4d6b';
    ctx.fillText('(回车加载)', x - 10, y + 24);
    return;
  }
  var d = state.loaded;
  var names = ['playerName 名字', 'hp 血量', 'level 等级', 'xp 经验', 'coins 金币', 'items 物品'];
  var row = 0;
  for (var i = 0; i < names.length; i++) {
    var parts = names[i].split(' ');
    var key = parts[0], label = parts[1];
    var val = d[key];
    var bad = val === undefined;
    ctx.fillStyle = bad ? '#f87171' : '#a7f3d0';
    ctx.fillText((bad ? '✗ ' : '✓ ') + label + ' ' + (bad ? 'undefined' : String(val)), x - 10, y + 26 + row * 26);
    row++;
  }
  if (!state.loadOn && d.v < CURRENT) {
    ctx.fillStyle = '#f87171';
    ctx.font = '10px monospace';
    ctx.fillText('老版本字段缺失:', x - 10, y + 26 + row * 26 + 8);
    row++;
    ctx.fillText('score 拆分的 xp/coins 丢了', x - 10, y + 26 + row * 26);
  }
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 30);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('选中版本 v' + state.chosen + '  迁移:' + (state.loadOn ? '开' : '关') + '  当前代码契约:v' + CURRENT, 16, 26);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('空格=生成存档  Q/E=选版本  回车=加载  F=迁移开关  R=重置', 16, 596);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('实验:生成 v1 后按 F 关迁移、回车裸读——右栏一片红,玩家的三年就这样蒸发', 380, 596);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>标准流程：</b>选 v1 → 空格生成 → 回车加载：迁移链三格逐个点亮 ✓，右栏六个字段全绿——玩家的进度完好如初。</li>
  <li><b>按 F 关迁移再加载：</b>右栏血红：playerName/hp/level/xp/coins 全部 undefined——「字段改名」与「新增字段」同时爆炸，这就是没有版本迁移的赤裸现实。</li>
  <li><b>跳级试试：</b>迁移链必须逐级执行——如果直接跑「v1→v4 一大步」，会漏掉 m2 里「score 拆分」的语义，xp/coins 就错。所以军规是只向前、逐级走。</li>
  <li><b>盯住 v 字段：</b>它每次迁移后 +1——版本号标记的是「数据契约」，不是游戏版本；迁移函数一旦发布就永不修改（改了会让老玩家的存档在新补丁里二次损坏）。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的存档序列化',
    files: [
      { path: 'scene/resources/resource_format_text.cpp', note: '文本格式的 Resource 序列化：存档其实是带格式头的 Resource 文本——可读、可 diff、可手工修。建议搜索：ResourceFormatLoaderText、parse。' },
      { path: 'core/io/resource_format_binary.cpp', note: '二进制格式的读写：体积小加载快，同样带格式标记——版本字段是两种格式共同的合同锚点。建议搜索：ResourceLoaderBinary、format。' },
      { path: 'core/io/config_file.cpp', note: 'ConfigFile：最朴素的键值存档（section.key=value）——小项目存档的起点，版本迁移思路完全通用。建议搜索：set_value、get_value、save。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>存档系统 = 序列化格式（Godot 已备好）+ 版本号 + 不可变的迁移链。前两条是技术，第三条是纪律：每一次改数据结构都要顺手写下迁移函数——玩家的十年进度就凭这份自律不丢。</p>
<ul>
  <li><b>数据怎么流动？</b>磁盘存档(带 v)→按 v 逐级跑迁移链→当前契约的数据结构→游戏逻辑。</li>
  <li><b>所有权归谁？</b>存档归玩家，格式契约归当前代码，迁移函数归历史版本——三者用版本号对齐。</li>
  <li><b>什么时候发生？</b>迁移发生在「加载那一刻」；写迁移函数发生在「改数据结构的那次提交」——事前一行，胜过事后十行祈祷。</li>
</ul>`
  }
  ]
};
