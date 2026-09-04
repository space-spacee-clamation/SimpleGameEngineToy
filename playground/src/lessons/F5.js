// F5 · UI 深水区:合批、裁剪与 9-slice
export default {
  id: 'F5',
  title: 'UI 深水区：合批、裁剪与 9-slice',
  est: '2 小时',
  coreQuestions: [
    'retained UI 为什么比 immediate UI 更适合合批？',
    '一个按钮=几次 draw call？9-slice 怎么把任意尺寸的边框装进一张小图？',
    '裁剪（clip）是怎么做到的？脏矩形让重绘贵在哪？',
    '一万控件怎么被画成十几次 draw call？'
  ],
  sections: [
  {
    type: 'text',
    title: 'retained UI 的合批账本',
    html: `<p>UI 是典型的 <b>retained 模式</b>（回扣主线 L7.1）：控件树常驻，只有变化时才重绘。它的性能三板斧：</p>
<table>
  <tr><th>技术</th><th>解决什么</th><th>原理</th></tr>
  <tr><td>合批 batching</td><td>几十控件=几十次提交的灾难</td><td>同图集（atlas）的控件排成一队，一次提交全画——draw call 从 N 塌缩到图集数</td></tr>
  <tr><td>裁剪 clip</td><td>滚动列表画出一屏之外</td><td>先算「子树可见矩形」，交给 scissor/相交测试，画之前就丢掉不可见部分</td></tr>
  <tr><td>脏矩形 dirty rect</td><td>一个标签变了却重绘全屏</td><td>只重绘「变了的矩形」，其余像素原样保留</td></tr>
</table>
<p><b>9-slice</b> 是合批的黄金搭档：把一张带圆角边框的小图切成 9 块（四角不拉伸、四边单轴拉伸、中心自由拉伸），任意尺寸的按钮/面板都能从同一张图集取材——<b>这正是「同一图集」的前提，合批得以成立</b>。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'uibatch',
    title: '实验：同屏 UI 的两种画法（draw call 计数器）',
    height: 620,
    code: `// Tab=合批开/关  左键点按钮=改文字(脏矩形亮起)  S=滚动列表  V=看 9-slice 切块  空格=脏矩形风暴
// 右上角:draw call / 重绘区域 / 重绘耗时——同一屏 UI 的两本账

var BTN = 40;

engine.run({
  setup: function (state) {
    state.batch = true;
    state.scroll = 0;
    state.nineViz = false;
    state.calls = 0;
    state.rects = [];
    state.dirty = [];
    state.dirtyArea = 0;
    state.repaintMs = 0;
    state.btnLabel = [];
    state.btnDirty = [];
    for (var i = 0; i < BTN; i++) {
      state.btnLabel.push('按钮 ' + i);
      state.btnDirty.push(-1);
    }
    state.lastFrameCalls = 0;
    state.lastFrameArea = 0;
    state.log = ['Tab 切换合批;点按钮看脏矩形'];
  },

  update: function (state, dt, input) {
    state.t = (state.t || 0) + dt;
    if (input.pressed('Tab')) { state.batch = !state.batch; pushLog(state, state.batch ? '合批:开(按图集分组提交)' : '合批:关(每控件独立提交)'); }
    if (input.pressed('KeyV')) { state.nineViz = !state.nineViz; }
    if (input.pressed('KeyS')) { state.scroll = (state.scroll + 1) % 5; state.dirty.push({ x: 470, y: 44, w: 230, h: 220, life: 0.4 }); }
    if (input.pressed('Space')) {
      for (var q = 0; q < BTN; q += 3) state.btnDirty[q] = 0.5;
      pushLog(state, '脏矩形风暴:13 个控件同时变化');
    }
    if (input.mouse.down) {
      // 点到按钮:改文字+标脏
      for (var i = 0; i < BTN; i++) {
        var r = btnRect(state, i);
        if (input.mouse.x >= r.x && input.mouse.x <= r.x + r.w && input.mouse.y >= r.y && input.mouse.y <= r.y + r.h) {
          state.btnLabel[i] = '已点击 ' + Math.floor(state.t);
          state.btnDirty[i] = 0.5;
        }
      }
    }
    for (var d = 0; d < BTN; d++) if (state.btnDirty[d] > 0) state.btnDirty[d] -= dt;
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    var t0 = performance.now();
    state.calls = 0;
    state.rects = [];
    state.dirtyArea = 0;
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.batch) {
      // 合批:按图集分组。page1=面板/按钮底, page2=文字, page3=图标
      submitBatch(state, ctx, 'page1:panel', function () { drawPanels(state, ctx, true); drawButtons(state, ctx, true); });
      submitBatch(state, ctx, 'page2:text', function () { drawTexts(state, ctx, true); drawList(state, ctx, true); });
      submitBatch(state, ctx, 'page3:icon', function () { drawBars(state, ctx, true); });
    } else {
      // 逐控件:每个矩形/文字都是一次独立提交
      drawPanels(state, ctx, false);
      drawButtons(state, ctx, false);
      drawTexts(state, ctx, false);
      drawList(state, ctx, false);
      drawBars(state, ctx, false);
    }
    state.repaintMs = performance.now() - t0;
    state.lastFrameCalls = state.calls;
    for (var i = 0; i < state.rects.length; i++) state.dirtyArea += state.rects[i].w * state.rects[i].h;
    state.lastFrameArea = state.dirtyArea / (720 * 460) * 100;
    drawDirtyOverlay(state, ctx);
    drawNineViz(state, ctx);
    drawHud(state, ctx);
  }
});

// ---------- 提交计数:合批=每个图集组只提交一次 ----------

function submitBatch(state, ctx, page, fn) {
  state.calls++;
  fn();
}

function callOne(state) {
  state.calls++;
}

// ---------- 各部件 ----------

function drawPanels(state, ctx, batched) {
  if (!batched) callOne(state);
  ctx.fillStyle = '#16202f';
  ctx.fillRect(14, 40, 440, 420);
  if (!batched) callOne(state);
  ctx.fillStyle = '#16202f';
  ctx.fillRect(466, 40, 240, 232);
  if (!batched) callOne(state);
  ctx.fillStyle = '#131c2b';
  ctx.fillRect(466, 282, 240, 130);
}

function btnRect(state, i) {
  var col = i % 4, row = Math.floor(i / 4);
  return { x: 26 + col * 106, y: 56 + row * 64, w: 96, h: 52 };
}

function drawButtons(state, ctx, batched) {
  for (var i = 0; i < BTN; i++) {
    var r = btnRect(state, i);
    nineSlice(ctx, r.x, r.y, r.w, r.h, batched ? 0 : 1, state);
  }
}

// 9-slice:batched 时画成「一次提交的 9 块拼图」(这里以一次 fill 代表一次 batch 内绘制)
function nineSlice(ctx, x, y, w, h, naive, state) {
  var c = 9;
  if (naive) callOne(state);
  ctx.fillStyle = '#1d2b42';
  ctx.fillRect(x, y, w, h);
  if (naive) callOne(state);
  ctx.strokeStyle = '#5b8fd6';
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  if (!naive) {
    // 合批态:9 块都以「从图集取材」的方式绘制(此处以四角标记示意)
    ctx.fillStyle = '#5b8fd6';
    ctx.fillRect(x, y, c, c);
    ctx.fillRect(x + w - c, y, c, c);
    ctx.fillRect(x, y + h - c, c, c);
    ctx.fillRect(x + w - c, y + h - c, c, c);
  }
  state.rects.push({ x: x, y: y, w: w, h: h });
}

function drawTexts(state, ctx, batched) {
  ctx.font = '11px monospace';
  for (var i = 0; i < BTN; i++) {
    var r = btnRect(state, i);
    if (!batched) callOne(state);
    ctx.fillStyle = state.btnDirty[i] > 0 ? '#ffd479' : '#9db4d0';
    ctx.fillText(state.btnLabel[i], r.x + 8, r.y + 24);
  }
  ctx.fillStyle = '#8fa7c7';
  if (!batched) callOne(state);
  ctx.fillText('滚动列表(S 键) →', 466, 380);
}

function drawList(state, ctx, batched) {
  var clipX = 470, clipY = 48, clipW = 226, clipH = 220;
  if (!batched) callOne(state);
  ctx.strokeStyle = '#2c3e55';
  ctx.strokeRect(clipX, clipY, clipW, clipH);
  ctx.fillStyle = '#1a2537';
  ctx.fillRect(clipX, clipY, clipW, clipH);
  // 裁剪:可见性测试——出裁剪框的行直接跳过(引擎里是 scissor)
  var drawn = 0, skipped = 0;
  ctx.font = '11px monospace';
  for (var i = 0; i < 20; i++) {
    var iy = clipY + 8 + ((i * 28 - state.scroll * 28) % 280 + 280) % 280;
    if (iy < clipY || iy > clipY + clipH - 20) { skipped++; continue; }
    if (!batched) callOne(state);
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('列表项 ' + i + ' (可见才画)', clipX + 10, iy + 12);
    drawn++;
  }
  ctx.fillStyle = '#3b4d6b';
  ctx.fillText('裁剪框内 ' + drawn + ' 行,裁掉 ' + skipped + ' 行', clipX + 8, clipY + clipH + 22);
}

function drawBars(state, ctx, batched) {
  for (var i = 0; i < 3; i++) {
    var v = (Math.sin((state.t || 0) * 1.2 + i * 2) + 1) / 2;
    if (!batched) callOne(state);
    ctx.fillStyle = '#131c2b';
    ctx.fillRect(478, 300 + i * 34, 216, 16);
    if (!batched) callOne(state);
    ctx.fillStyle = ['#6ee7b7', '#5b8fd6', '#f59e0b'][i];
    ctx.fillRect(478, 300 + i * 34, 216 * v, 16);
  }
}

function drawDirtyOverlay(state, ctx) {
  for (var i = 0; i < BTN; i++) {
    if (state.btnDirty[i] > 0) {
      var r = btnRect(state, i);
      ctx.strokeStyle = 'rgba(255,212,121,' + state.btnDirty[i] * 2 + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      ctx.lineWidth = 1;
    }
  }
  ctx.strokeStyle = 'rgba(248,113,113,0.5)';
  for (var d = 0; d < state.dirty.length; d++) {
    var rr = state.dirty[d];
    ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
  }
}

function drawNineViz(state, ctx) {
  if (!state.nineViz) return;
  var x = 250, y = 250, w = 180, h = 110, c = 26;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#1d2b42';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffd479';
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#f87171';
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + c, y + h);
  ctx.moveTo(x + w - c, y); ctx.lineTo(x + w - c, y + h);
  ctx.moveTo(x, y + c); ctx.lineTo(x + w, y + c);
  ctx.moveTo(x, y + h - c); ctx.lineTo(x + w, y + h - c);
  ctx.stroke();
  ctx.fillStyle = '#ffd479';
  ctx.font = '10px monospace';
  ctx.fillText('9-slice:四角不拉伸 四边单轴 中心自由', x - 4, y + h + 16);
  ctx.globalAlpha = 1;
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 26);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  ctx.fillText('合批:' + (state.batch ? '开' : '关') + '  本帧 draw call ' + state.lastFrameCalls +
    '  重绘覆盖 ' + state.lastFrameArea.toFixed(1) + '%  耗时 ' + state.repaintMs.toFixed(2) + 'ms', 16, 24);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('Tab=合批开关  点按钮=改文字  S=滚动列表  V=9-slice 切块  空格=脏矩形风暴', 16, 40);
  for (var i = 0; i < state.log.length; i++) {
    ctx.fillStyle = i === state.log.length - 1 ? '#ffd479' : '#5b7397';
    ctx.fillText(state.log[i], 250, 40 + i * 0 + i * 12);
  }
}`

  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>Tab 对比账单：</b>同一屏 40 按钮+列表+进度条——合批关着几十次 draw call，开着只剩 3 次（按图集分组）。「一万控件十几次提交」的原理就这么直白。</li>
  <li><b>点一个按钮：</b>它变黄、周围亮起脏矩形框——retained UI 只重绘「变了的矩形」；其余 99% 的像素原地不动。</li>
  <li><b>空格触发脏矩形风暴：</b>13 个控件同时变化，重绘覆盖率和耗时跟着涨——脏矩形不是免费的，它的大小正比于「变化」的大小。</li>
  <li><b>S 滚动列表：</b>20 行里只有可见的十几行被绘制，其余在裁剪测试就被丢弃——「画之前丢掉」永远比「画完再遮挡」便宜。</li>
  <li><b>V 看切块：</b>四角标红的 9 宫格——任意尺寸按钮都从这一张小图取材，这正是全屏按钮能合进同一个图集批次的原因。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Control 树与 canvas 批处理',
    files: [
      { path: 'scene/gui/control.cpp', note: 'Control 基类：控件树、最小/脏矩形与 notifica­tion 排序——retained UI 的「保留」二字落在这里。建议搜索：queue_redraw、NOTIFICATION_DRAW、get_global_rect。' },
      { path: 'scene/gui/label.cpp', note: '最常用的叶子控件：文字如何被排进 canvas item、最小尺寸怎么算——每个 label 都是一次潜在的批成员。建议搜索：_notification、set_text、draw_string。' },
      { path: 'servers/rendering/renderer_canvas_cull.cpp', note: 'canvas item 的收集与批处理：同图集的 item 在这里排成一队提交——「draw call 塌缩」的引擎现场。建议搜索：_render_canvas_item、batch、material。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>UI 性能三板斧各管一段：<b>合批</b>管「提交多少次」、<b>裁剪</b>管「要不要画」、<b>脏矩形</b>管「重画多少」；9-slice 图集则是让合批成立的前置工程。retained UI 的所有优雅，都建立在「控件树常驻 + 变化局部化」这两件事上。</p>
<ul>
  <li><b>数据怎么流动？</b>控件变化→标脏→本帧重绘脏区域→canvas item 树重建→按图集合批提交。</li>
  <li><b>所有权归谁？</b>控件树归场景，图集归主题（theme），脏矩形归重绘调度——谁变化谁标脏，谁标脏谁重绘。</li>
  <li><b>什么时候发生？</b>布局在变化时重算、绘制在帧中、提交在帧末批处理——UI 的帧成本几乎完全由「这帧变了多少」决定。</li>
</ul>`
  }
  ]
};
