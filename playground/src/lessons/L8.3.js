// L8.3 · 编辑器架构：Undo/Redo 与编辑器即场景
export default {
  id: 'L8.3',
  title: '编辑器架构：Undo/Redo 与编辑器即场景',
  est: '2 小时',
  coreQuestions: [
    '一次「操作」怎么变成可回放的数据？命令对象里到底存什么，undo 凭什么把世界倒回去？',
    'Inspector 为什么能显示任意节点的属性？控件列表是从哪张表反射生成的？',
    '连续拖动一个方块，为什么会往栈里灌进上百条命令？事务合并的判据是什么？',
    '编辑器凭什么自己也是一个场景——这个设计买到了什么？'
  ],
  sections: [
    {
      type: 'text',
      title: "游戏引擎的一半其实是编辑器",
      html: `<p>很多初学者以为引擎 = 运行时。但打开 Godot 的目录你会发现：<b>editor/ 的代码量几乎和 scene/ + servers/ 加起来一样大</b>。运行时要快、要省；编辑器要的是另一组品质——所见即所得、随时改、改错了能撤。这组品质靠的不是 if-else 堆出来的工具代码，而是一整套架构决定。本课拆其中三条：</p>
<ul>
  <li><b>一切操作皆命令。</b>移动、改色、删除、新建……不直接改数据，而是打包成一个「命令对象」压进历史栈。撤销 = 沿反方向重放，重做 = 沿正方向重放。</li>
  <li><b>UI 从元数据反射生成。</b>Inspector 面板没有一行手写代码知道「Sprite2D 有 texture 属性」——它查 L2.2 讲过的 ClassDB 属性表，按每个属性的类型和 hint 现场生成对应控件。</li>
  <li><b>编辑器本身就是一个场景。</b>Godot 编辑器的窗口布局就是一棵 Node/Control 树，用引擎自己的场景系统搭出来、跑起来。</li>
</ul>
<p>先立住第一条。它的名字叫<b>命令模式（Command Pattern）</b>：把「一次操作」从函数调用升格为数据结构。</p>`
    },
    {
      type: 'text',
      title: "命令模式：把操作变成可回放的数据",
      html: `<p>直觉做法是改之前拷贝一份整个场景快照，撤销时恢复。内存会爆炸：拖一下鼠标就复制全部节点？命令模式的折中是——<b>只记录这次操作的最小差分</b>。一个命令对象里装三样东西：目标对象、do 参数（做完之后的值）、undo 参数（动手之前的值）。撤销不是「回滚到过去」，而是「反向执行一条已提交的操作」。</p>
<p>两个推论立刻浮出水面。<b>其一，所有权：</b>被引用的对象必须比引用它的命令活得久——Godot 的命令对目标对象持弱引用（按 ObjectID 查实例），你删掉的节点不会因躺在历史栈里而偷偷活着。<b>其二，时机：</b>命令只在用户操作完成的那一刻入栈；每帧循环不产生命令，所以 60fps 的游戏运行本身根本不需要 Undo。</p>
<p>Godot 的实现分两层。底层是 <code>core/object/undo_redo.cpp</code> 的 <b>UndoRedo</b>：一张扁平的 actions 数组加一个 <code>current_action</code> 指针，undo 就是指针左移并执行 undo_ops，redo 就是右移并执行 do_ops；在指针不在顶端时创建新命令，就把尾巴整段截掉——这就是所有编辑器共有的「重做分支被丢弃」。上层是 <code>editor/editor_undo_redo_manager.cpp</code> 的 <b>EditorUndoRedoManager</b>：给每个打开的场景各发一条独立历史栈（外加全局设置栈、远程调试栈），undo 时挑时间戳最新的那条来弹栈；它还管「脏标记」——commit_action 默认把这条历史标成未保存，标题栏才会长出那个星号。</p>
<p>然后是命令模式最容易被忽略的一环：<b>事务合并</b>。按住鼠标拖动方块，鼠标每动一下都会 create_action 一次——不合并的话，拖一次 = 往栈里灌几百条命令，Z 键要按几百次才能退回起点。Godot 的对策写在 undo_redo.cpp 的 create_action 里：同名命令、且上一条的 last_tick 距今不超过 <b>800 毫秒</b>，就不新建 Action，而是把新操作的 do 端拼接到上一条上——一整次拖动最终只留一条命令。这正是下一节实验台要你亲手复现的东西。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'minieditor',
      title: '实验：迷你编辑器沙盘——命令栈、反射 Inspector、Ctrl+Z',
      height: 560,
      code: `// 迷你编辑器沙盘：中间是场景视口，右边是 Inspector，左边是 Undo/Redo 历史栈
// 鼠标点选方块 → 拖动移动 / 按 C 循环换色 / Delete 删除 / N 新建
// Z（或 Ctrl+Z）撤销，Y（或 Ctrl+Y）重做；指针退到中间后再操作 = 重做分支被丢弃
// M 开关事务合并：关掉后连续拖动不再合并，拖一次栈就爆给你看
// 右侧 Inspector 不是手画的——由 CLASS_DB 属性表按选中节点的类型反射生成

engine.run({
  setup: function (state) {
    state.nodes = [
      { id: 1, type: 'Block', x: 170, y: 90,  w: 46, h: 46, colorIdx: 0, r: 0 },
      { id: 2, type: 'Block', x: 260, y: 160, w: 46, h: 46, colorIdx: 1, r: 0 },
      { id: 3, type: 'Disc',  x: 200, y: 250, w: 40, h: 40, colorIdx: 2, r: 20 },
      { id: 4, type: 'Disc',  x: 300, y: 300, w: 40, h: 40, colorIdx: 3, r: 20 }
    ];
    state.nextId = 5;
    state.sel = 1;                       // 选中节点 id（0 = 无选中）
    state.undoStack = [];                // 已提交命令（旧 → 新）
    state.redoStack = [];                // 被撤销的命令（近 → 远，栈顶最近）
    state.mergeOn = true;                // 事务合并开关
    state.drag = null;                   // 当前拖动会话
    state.msg = '点选方块 → 拖动/C换色/Delete删除/N新建 · Z撤销 Y重做 · M切换合并';
  },

  update: function (state, dt, input) {
    var m = input.mouse;
    if (input.pressed('KeyM')) {
      state.mergeOn = !state.mergeOn;
      state.msg = '事务合并 = ' + (state.mergeOn ? '开（同节点同类操作并入栈顶一条命令）' : '关（每步单独入栈，去拖一下试试）');
    }
    if (!state.drag) {
      if (input.pressed('KeyZ')) doUndo(state);        // Ctrl+Z 同样触发（按下的是 KeyZ）
      else if (input.pressed('KeyY')) doRedo(state);   // Ctrl+Y 同理
      if (input.pressed('Delete') || input.pressed('Backspace')) deleteSelected(state);
      if (input.pressed('KeyN')) addNode(state);
      if (input.pressed('KeyC')) cycleColor(state);
    }
    if (m.clicked) {                      // 按下：先问 Inspector 命中哪个控件，再问视口命中谁
      var hit = inspectorHit(state, m.x, m.y);
      if (hit >= 0 && state.sel > 0) applyInspector(state, hit);
      else {
        var n = pickNode(state, m.x, m.y);
        state.sel = n ? n.id : 0;
        if (n) state.drag = { id: n.id, sx: m.x, sy: m.y, lx: n.x, ly: n.y };
      }
    }
    if (state.drag && !m.down) state.drag = null;   // 松手：本次拖动落定
    if (state.drag) {                       // 拖动中：每个微小位移都走一遍 pushCmd
      var dn = byId(state, state.drag.id);
      if (dn) {
        var nx = clamp(m.x - state.drag.sx + state.drag.lx, 126, 462);
        var ny = clamp(m.y - state.drag.sy + state.drag.ly, 52, 388);
        if (nx !== dn.x || ny !== dn.y) {
          var oldX = dn.x, oldY = dn.y; dn.x = nx; dn.y = ny;
          pushCmd(state, { name: 'Move #' + dn.id, kind: 'move', nodeId: dn.id, oldX: oldX, oldY: oldY, newX: nx, newY: ny });
        }
      }
    }
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#111a2b'; ctx.fillRect(120, 44, 360, 356);   // 视口
    ctx.strokeStyle = '#2f4468'; ctx.lineWidth = 1; ctx.strokeRect(120, 44, 360, 356);
    for (var i = 0; i < state.nodes.length; i++) {                // 场景节点
      var n = state.nodes[i];
      ctx.fillStyle = PALETTE[n.colorIdx % PALETTE.length];
      if (n.type === 'Disc') { ctx.beginPath(); ctx.arc(n.x + n.w / 2, n.y + n.h / 2, n.r, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(n.x, n.y, n.w, n.h);
      if (n.id === state.sel) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.strokeRect(n.x - 4, n.y - 4, n.w + 8, n.h + 8);
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#9fb3d1'; ctx.fillText(n.type + '#' + n.id, n.x, n.y - 8);
    }
    ctx.fillStyle = '#5b7397'; ctx.fillText('视口 Viewport（编辑器场景里的一个子画布）', 124, 412);
    drawStack(state, ctx);                                        // 左：历史栈
    drawInspector(state, ctx);                                    // 右：反射生成的 Inspector
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('节点数: ' + state.nodes.length + '   命令总数: ' + state.undoStack.length + '   合并: ' + (state.mergeOn ? '开' : '关'), 12, 434);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('点击色块换色 · 点 +/- 改数值 · Z 撤销 / Y 重做 · M 切换合并', 12, 452);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(state.msg, 12, 470);
  }
});

var PALETTE = ['#478cbf', '#f59e0b', '#34d399', '#f472b6', '#9b8cff'];

// —— ClassDB 属性表：Inspector 的唯一真相源（仿 PropertyInfo：名字 / Variant 类型 / hint）——
var CLASS_DB = {
  Block: [
    { prop: 'x', label: 'Position X', type: 'number', step: 8 },
    { prop: 'y', label: 'Position Y', type: 'number', step: 8 },
    { prop: 'w', label: 'Width', type: 'number', step: 4 },
    { prop: 'colorIdx', label: 'Color', type: 'enum' }
  ],
  Disc: [
    { prop: 'x', label: 'Position X', type: 'number', step: 8 },
    { prop: 'y', label: 'Position Y', type: 'number', step: 8 },
    { prop: 'r', label: 'Radius', type: 'number', step: 2 },
    { prop: 'colorIdx', label: 'Color', type: 'enum' }
  ]
};

function byId(state, id) {
  for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) return state.nodes[i];
  return null;
}
function pickNode(state, mx, my) {
  for (var i = state.nodes.length - 1; i >= 0; i--) {
    var n = state.nodes[i];
    if (mx >= n.x - 4 && mx <= n.x + n.w + 4 && my >= n.y - 4 && my <= n.y + n.h + 4) return n;
  }
  return null;
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// —— 命令入栈：统一入口。合并 = 改写栈顶命令的 do 端；不合并或新种类 = 压新命令并清空 redo 栈 ——
function pushCmd(state, cmd) {
  var top = state.undoStack[state.undoStack.length - 1];
  if (state.mergeOn && top && top.kind === cmd.kind && top.nodeId === cmd.nodeId) {
    state.redoStack.length = 0;                                   // 新操作照样丢弃重做分支
    mergeEnds(top, cmd);                                          // MERGE_ENDS：undo 端保持最早原值，do 端换成最新值
    return;
  }
  state.redoStack.length = 0;                                     // 历史是一条线不是一棵树
  state.undoStack.push(cmd);
}
function mergeEnds(pend, cmd) {
  if (cmd.kind === 'move') { pend.newX = cmd.newX; pend.newY = cmd.newY; }
  else if (cmd.kind === 'color') pend.newIdx = cmd.newIdx;
  else if (cmd.kind === 'prop' && pend.prop === cmd.prop) pend.newVal = cmd.newVal;
}

function execCmd(state, cmd, isUndo) {                        // 回放：正向执行 do 端，反向执行 undo 端
  if (cmd.kind === 'add') {
    if (isUndo) removeById(state, cmd.nodeId);
    else state.nodes.push(cloneNode(cmd.node));
  } else if (cmd.kind === 'del') {
    if (isUndo) state.nodes.push(cloneNode(cmd.node));
    else removeById(state, cmd.nodeId);
  } else {
    var n = byId(state, cmd.nodeId);
    if (!n) return;                                            // 目标已删：弱引用语义，空操作
    if (cmd.kind === 'move') { n.x = isUndo ? cmd.oldX : cmd.newX; n.y = isUndo ? cmd.oldY : cmd.newY; }
    else if (cmd.kind === 'color') n.colorIdx = isUndo ? cmd.oldIdx : cmd.newIdx;
    else if (cmd.kind === 'prop') {
      n[cmd.prop] = isUndo ? cmd.oldVal : cmd.newVal;
      if (n.type === 'Disc' && cmd.prop === 'r') n.w = n.h = n.r * 2;
    }
  }
  if (state.sel !== 0 && !byId(state, state.sel)) state.sel = 0;
}
function removeById(state, id) {
  for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) { state.nodes.splice(i, 1); return; }
}
function cloneNode(n) {
  return { id: n.id, type: n.type, x: n.x, y: n.y, w: n.w, h: n.h, colorIdx: n.colorIdx, r: n.r };
}

function doUndo(state) {
  if (state.undoStack.length === 0) { state.msg = '栈底了：没有可撤销的命令'; return; }
  var cmd = state.undoStack.pop();
  execCmd(state, cmd, true);
  state.redoStack.push(cmd);
  state.msg = '撤销：' + cmd.name + '（指针左移，' + state.redoStack.length + ' 条可重做）';
}
function doRedo(state) {
  if (state.redoStack.length === 0) { state.msg = '没有可重做的命令'; return; }
  var cmd = state.redoStack.pop();
  execCmd(state, cmd, false);
  state.undoStack.push(cmd);
  state.msg = '重做：' + cmd.name + '（指针右移）';
}

function deleteSelected(state) {
  var n = byId(state, state.sel);
  if (!n) { state.msg = '没有选中节点，删不了'; return; }
  pushCmd(state, { name: 'Remove #' + n.id, kind: 'del', nodeId: n.id, node: cloneNode(n) });
  removeById(state, n.id);
  state.sel = 0;
  state.msg = '删除 #' + n.id + '：命令里存了节点全量快照，Z 键能复活它';
}
function addNode(state) {
  var id = state.nextId++;
  var node = { id: id, type: 'Block', x: 160 + (id * 37) % 220, y: 80 + (id * 53) % 260, w: 46, h: 46, colorIdx: id % 5, r: 0 };
  pushCmd(state, { name: 'Add #' + id, kind: 'add', nodeId: id, node: cloneNode(node) });
  state.nodes.push(node);
  state.sel = id;
  state.msg = '新建 #' + id + '：连创建都是命令，撤销它 = 执行它的 undo 端';
}
function cycleColor(state) {
  var n = byId(state, state.sel);
  if (!n) { state.msg = '先点选一个方块再按 C'; return; }
  pushCmd(state, { name: 'Color #' + n.id, kind: 'color', nodeId: n.id, oldIdx: n.colorIdx, newIdx: (n.colorIdx + 1) % 5 });
  n.colorIdx = (n.colorIdx + 1) % 5;
  state.msg = '换色 #' + n.id + '：命令只存新旧索引两个 int——这就是最小差分';
}

// —— Inspector：遍历 CLASS_DB[节点类型] 生成行；绘制与命中测试共用同一套坐标公式 ——
function inspRowY(i) { return 118 + i * 40; }
function inspRows(state) {
  var rows = [];
  var n = byId(state, state.sel);
  if (!n) return rows;
  var props = CLASS_DB[n.type] || [];
  for (var i = 0; i < props.length; i++) {
    var def = props[i];
    var row = { def: def, y: inspRowY(i) };
    if (def.type === 'number') { row.minus = { x: 520, y: row.y, w: 22, h: 22 }; row.plus = { x: 676, y: row.y, w: 22, h: 22 }; }
    else {
      row.chips = [];
      for (var c = 0; c < 5; c++) row.chips.push({ idx: c, x: 520 + c * 36, y: row.y, w: 28, h: 22 });
    }
    rows.push(row);
  }
  return rows;
}
function hitRect(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function inspectorHit(state, x, y) {
  if (x < 496) return -1;
  var rows = inspRows(state);
  for (var i = 0; i < rows.length; i++) {
    var rw = rows[i];
    if (rw.def.type === 'number') {
      if (hitRect(rw.minus, x, y)) return i * 10 + 1;            // 编码：行号*10 + 槽位
      if (hitRect(rw.plus, x, y)) return i * 10 + 2;
    } else {
      for (var c = 0; c < rw.chips.length; c++) if (hitRect(rw.chips[c], x, y)) return i * 10 + 3 + c;
    }
  }
  return -1;
}
function applyInspector(state, code) {                           // 控件回调：同样只走 pushCmd
  var n = byId(state, state.sel);
  if (!n) return;
  var def = (CLASS_DB[n.type] || [])[Math.floor(code / 10)];
  if (!def) return;
  var slot = code % 10;
  if (def.type === 'enum') {
    var idx = slot - 3;
    if (idx < 0 || idx >= 5 || idx === n.colorIdx) return;
    pushCmd(state, { name: 'Color #' + n.id, kind: 'color', nodeId: n.id, oldIdx: n.colorIdx, newIdx: idx });
    n.colorIdx = idx;
    state.msg = 'Inspector 下拉换色：走的同样是命令栈，和按 C 没有区别';
  } else {
    var d = slot === 1 ? -def.step : def.step;
    var oldV = n[def.prop], newV = Math.max(4, oldV + d);
    if (newV === oldV) return;
    pushCmd(state, { name: def.label + ' #' + n.id, kind: 'prop', nodeId: n.id, prop: def.prop, oldVal: oldV, newVal: newV });
    n[def.prop] = newV;
    if (n.type === 'Disc' && def.prop === 'r') n.w = n.h = newV * 2;
    state.msg = 'Inspector 步进改 ' + def.label + '：一次点击 = 一条命令';
  }
}

function shortName(s) { return s.length > 11 ? s.slice(0, 10) + '…' : s; }
function drawStack(state, ctx) {
  ctx.fillStyle = '#9b8cff'; ctx.fillText('UNDO 栈（底 → 顶）', 12, 58);
  var first = Math.max(0, state.undoStack.length - 8);
  for (var i = first; i < state.undoStack.length; i++) {
    var y = 76 + (i - first) * 26;
    ctx.fillStyle = '#16233a'; ctx.fillRect(12, y, 100, 20);
    ctx.fillStyle = '#cbd8ea'; ctx.fillText('#' + (i + 1) + ' ' + shortName(state.undoStack[i].name), 16, y + 14);
  }
  if (state.undoStack.length > 8) { ctx.fillStyle = '#5b7397'; ctx.fillText('… 还有 ' + (state.undoStack.length - 8) + ' 条', 16, 76 + 8 * 26 + 12); }
  var py = 76 + Math.min(state.undoStack.length, 8) * 26 + 8;
  ctx.fillStyle = '#fbbf24'; ctx.fillText('指针 |（Z 向左 / Y 向右）', 12, py);
  var ry = py + 14;
  ctx.fillStyle = '#34d399'; ctx.fillText('REDO 栈（顶 → 底）', 12, ry);
  for (var j = 0; j < Math.min(state.redoStack.length, 3); j++) {
    ctx.fillStyle = '#12321f'; ctx.fillRect(12, ry + 8 + j * 22, 100, 18);
    ctx.fillStyle = '#9fd6b8'; ctx.fillText(shortName(state.redoStack[state.redoStack.length - 1 - j].name), 16, ry + 21 + j * 22);
  }
  if (state.redoStack.length > 3) { ctx.fillStyle = '#5b7397'; ctx.fillText('… 共 ' + state.redoStack.length + ' 条', 16, ry + 8 + 3 * 22 + 10); }
}

function drawBtn(r, label, ctx) {
  ctx.fillStyle = '#16233a'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#4a5f80'; ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#e2e8f0'; ctx.fillText(label, r.x + 7, r.y + 15);
}
function drawInspector(state, ctx) {
  ctx.fillStyle = '#111a2b'; ctx.fillRect(496, 44, 212, 356);
  ctx.strokeStyle = '#2f4468'; ctx.strokeRect(496, 44, 212, 356);
  ctx.fillStyle = '#9b8cff'; ctx.fillText('INSPECTOR（反射生成）', 508, 58);
  var n = byId(state, state.sel);
  if (!n) {
    ctx.fillStyle = '#5b7397';
    ctx.fillText('未选中任何对象', 508, 96);
    ctx.fillText('get_property_list(null)', 508, 116);
    ctx.fillText('→ 空面板', 508, 136);
    return;
  }
  ctx.fillStyle = '#e2e8f0'; ctx.fillText(n.type + '#' + n.id + '  ← 按类型查表', 508, 80);
  var rows = inspRows(state);
  for (var i = 0; i < rows.length; i++) {
    var rw = rows[i], def = rw.def;
    ctx.fillStyle = '#8fa7c7'; ctx.fillText(def.label, 508, rw.y + 15);
    if (def.type === 'number') {
      drawBtn(rw.minus, '-', ctx);
      ctx.fillStyle = '#0b0f17'; ctx.fillRect(548, rw.y, 122, 22);
      ctx.strokeStyle = '#4a5f80'; ctx.strokeRect(548, rw.y, 122, 22);
      ctx.fillStyle = '#e2e8f0'; ctx.fillText(String(Math.round(n[def.prop])), 556, rw.y + 15);
      drawBtn(rw.plus, '+', ctx);
    } else {
      for (var c = 0; c < rw.chips.length; c++) {
        var ch = rw.chips[c];
        ctx.fillStyle = PALETTE[ch.idx]; ctx.fillRect(ch.x, ch.y, ch.w, ch.h);
        if (n.colorIdx === ch.idx) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.strokeRect(ch.x - 1, ch.y - 1, ch.w + 2, ch.h + 2); ctx.lineWidth = 1; }
      }
    }
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('换选不同类型 → 控件列表整个重建', 508, 386);
}`
    },
    {
      type: 'text',
      title: "试一试",
      html: `<ul>
  <li>按住一个方块<b>连续拖动</b>一段距离再松手：合并开着，栈里只多一条 Move。按 M 关掉合并再拖同样一趟——每一步位移各成一条命令，Z 要按到手酸。这就是没做事务合并的编辑器长什么样。</li>
  <li>撤销两次（指针退到栈中部），然后新建一个节点：观察右侧 REDO 栈瞬间清空。想找回刚才撤销掉的东西？找不回来了——<b>历史是一条线，不是一棵树</b>。Godot 的 undo_redo.cpp 里对应的动作叫 discard_redo：直接把 current_action 之后的尾巴 resize 掉。</li>
  <li>选中圆形节点，点 Inspector 里 Radius 行的 +/-：注意这一行在 Block 的面板里根本没有——控件列表是查 CLASS_DB 按类型现生成的。换选回 Block，行又变了。真实引擎里这张表来自 GDCLASS 宏的注册，见 L2.2。</li>
  <li>删除一个节点，再撤销：节点原样复活。命令里存的不是「删除函数」，而是<b>被删对象的完整快照 + 两条方向相反的指令</b>——「操作」已经彻底变成了数据。</li>
  <li>思考题：如果两条 Move 命令之间夹了一条 Color 命令，还能合并吗？沙盘里同 kind + 同 nodeId 才允许——真实引擎还要求「同名 + 800ms 内」。合并条件太松会把不相干的操作搅成一坨。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读',
      files: [
        { path: 'editor/editor_undo_redo_manager.h', note: '先看 History 结构：undo_stack 与 redo_stack 两条 List<Action>，Action 只有名字、时间戳、merge_mode——命令正文在 UndoRedo 里，这里只是账本。再看 SpecialHistory 枚举：每个打开的场景各有独立历史。' },
        { path: 'editor/editor_undo_redo_manager.cpp', note: 'commit_action 把 pending_action 压入 undo_stack 的同时 history.redo_stack.clear()——重做分支被丢弃的全部真相就这一行；undo()/redo() 在两条栈之间搬 Action 并按 timestamp 挑「最新那条历史」。' },
        { path: 'core/object/undo_redo.cpp', note: 'discard_redo()：actions.resize(current_action + 1) 一刀截断未来；create_action() 的合并判据：同名 + backward_undo_ops 一致 + last_tick + 800 > now，命中则 merging = true，本次操作并进上一条而不新建。' },
        { path: 'core/object/class_db.cpp', note: 'get_property_list / get_method_list：按类名查启动时注册好的元数据表——Inspector 反射的供料管道，接 L2.2 的 ClassDB 链路。' },
        { path: 'editor/inspector/editor_inspector.cpp', note: 'instantiate_property_editor()：输入只有 Variant 类型 + PropertyHint + usage 三个元数据，输出一个具体 EditorProperty 控件；parse 主流程遍历属性表逐行 add_child。没有一行代码认识 Sprite2D。' }
      ]
    },
    {
      type: 'text',
      title: "编辑器即场景：第三个惊喜",
      html: `<p>最后补上第三块拼图。看 <code>editor/editor_node.h</code>：<code>class EditorNode : public BoxContainer</code>——<b>编辑器的主窗口本身是一个 Control 节点</b>，挂进 MainLoop 的场景树里，跟着引擎一起 _process、一起 layout、一起绘制。工具栏是 HBoxContainer，停靠面板是 TabContainer，3D 视口是 SubViewport 套 SubViewportContainer。</p>
<p>这意味着 Godot 吃自己的狗粮：编辑器 UI 用的就是引擎自己的 GUI 系统（L7.1 的主角），写引擎的人不需要维护第二套界面框架。代价也真实存在——编辑器崩溃会带着引擎一起崩；编辑器性能受限于自己的渲染器。但收益更大：<b>场景树、资源、信号、Inspector、Undo 这套积木同时服务运行时和工具链</b>，插件（EditorPlugin）能以第一公民身份往编辑器里塞面板，因为它本来就是在往一棵场景树里 add_child。</p>
<p>把三个决定连起来看，就是本课的全景图：</p>
<table>
  <tr><th>设计决定</th><th>数据怎么流动</th><th>所有权归谁</th><th>什么时候发生</th></tr>
  <tr><td>命令栈</td><td>用户操作 → 打包成 Action（do/undo 双端）→ 入栈；指针左右移动 = 回放</td><td>历史栈持有命令对象；命令对目标对象持弱引用（ObjectID）</td><td>仅操作提交时入栈；undo/redo 按需触发，与每帧循环无关</td></tr>
  <tr><td>反射 Inspector</td><td>GDCLASS 宏启动时注册 → ClassDB 属性表 → parse 遍历 → 逐行实例化 EditorProperty</td><td>ClassDB 拥有元数据表；Inspector 拥有临时生成的控件树</td><td>注册在启动；生成在选中对象变化时；读写在每次点击时</td></tr>
  <tr><td>编辑器即场景</td><td>OS 事件 → 编辑器自己的 Input/Control 路由 → 工具逻辑 → 命令栈</td><td>Main 拥有 EditorNode 所在的场景树</td><td>与游戏共用同一个主循环，每帧照常 process/draw</td></tr>
</table>`
    },
    {
      type: 'text',
      title: "小结",
      html: `<p>本课的三个答案合在一起是一种架构观：<b>让「操作」成为数据（命令栈），让「界面」成为元数据的投影（反射 Inspector），让「工具」成为引擎的普通用户（编辑器即场景）</b>。三者共享同一条底层能力——L2.2 的 ClassDB 反射：没有属性表就没有 Inspector，没有 set/get 方法绑定就连命令的 undo 端都调不动。这套思想并不 Godot 专属：Unity 的 Undo.RegisterCompleteObjectUndo、Unreal 的 FEditCommand 与 Details Customization，骨架完全相同。下次你在任何软件里按 Ctrl+Z，你触发的都是一条被重放的差分数据。</p>`
    }
  ]
}
