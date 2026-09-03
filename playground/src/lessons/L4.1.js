// L4.1 · GPU 管线总览 + 第一个三角形
export default {
  id: 'L4.1',
  title: 'GPU 管线总览 + 第一个三角形',
  est: '2.5 小时',
  coreQuestions: [
    '一次 draw call 的生命周期里，数据穿过几层边界？谁拥有顶点内存、谁拥有最终像素？',
    '3 个顶点怎么变成几百个像素？六个站点各把数据变成什么，执行次数差几个数量级？',
    '片元先着色再被深度测试丢弃——这段算力是谁买单的？early-z 为什么能救回来？',
    'CPU 提交一千次 draw 只用几毫秒，帧却卡成 20fps——瓶颈到底在哪一侧？'
  ],
  sections: [
    {
      type: 'text',
      title: '两台计算机：CPU 与 GPU 的边界',
      html: `<p>引擎面对的是<b>两台各有内存和时钟的计算机</b>。CPU 这边是你的游戏逻辑和 Godot 的 C++ 代码；GPU 那边是几千个小核心组成的吞吐机器，它有自己的显存（VRAM），而且<b>不共享 CPU 的内存</b>。所有渲染最后都归结为一种姿势：<b>CPU 写命令 → 驱动排队 → GPU 异步执行</b>。</p>
<p><b>draw call 就是这条边界上的一次投递。</b>你在 GDScript 里永远看不见它——场景树里的 MeshInstance3D 每帧只是更新自己的变换，真正产生 draw call 的是 RenderingServer：它在每帧末尾把可见物体整理成命令，交给 RenderingDevice，再往下才是 Vulkan/D3D12/Metal 的 <code>vkCmdDraw</code> 一族。Vulkan 逼你亲手管理命令缓冲区和队列同步，所以它是理解这条边界的最好教材——Godot 的 RenderingDevice 就是把这套脏活包起来的统一抽象。</p>
<table>
  <tr><th>边界两侧</th><th>CPU 侧做什么</th><th>GPU 侧做什么</th></tr>
  <tr><td>资源上传</td><td>网格/纹理打包拷进显存，一次性</td><td>持有并只读访问自己的显存</td></tr>
  <tr><td>录制命令</td><td>绑定管线/uniform/顶点缓冲，记录 draw</td><td>不执行，只在命令缓冲区里躺着</td></tr>
  <tr><td>提交与执行</td><td>提交后立刻返回，继续跑下一帧逻辑</td><td>稍后并行回放整条队列，可能慢好几帧</td></tr>
  <tr><td>回读结果</td><td>要拿结果必须等栅栏（fence）</td><td>画完换屏，从不主动通知 CPU</td></tr>
</table>`
    },
    {
      type: 'text',
      title: '六个站点：从 3 个顶点到一屏像素',
      html: `<p>一个 draw call 进入 GPU 后走一条<b>固定站点 + 可编程插槽</b>的流水线。站点的顺序和职责由硬件规定，你能改写的只有其中几个插槽的内容（顶点着色器、片元着色器）。以「3 个顶点画 1 个三角形」为例：</p>
<table>
  <tr><th>站点</th><th>输入 → 输出</th><th>执行粒度</th><th>可编程吗</th></tr>
  <tr><td>① 顶点着色</td><td>每个顶点 × MVP 矩阵 → 齐次裁剪空间 (x,y,z,w)</td><td>3 次 / 每顶点</td><td>可编程</td></tr>
  <tr><td>② 图元装配</td><td>索引连成三角形，背面剔除、裁剪到视锥</td><td>1 次 / 每图元</td><td>固定（开关可选）</td></tr>
  <tr><td>③ 光栅化</td><td>逐像素判断覆盖，重心坐标插值出属性</td><td>几十万次 / 每像素</td><td>固定</td></tr>
  <tr><td>④ 片元着色</td><td>插值属性 → 这个片元的颜色和深度</td><td>几十万次 / 每片元</td><td>可编程</td></tr>
  <tr><td>⑤ 测试与混合</td><td>深度/模板裁决，alpha 混合</td><td>同片元</td><td>固定（参数可配）</td></tr>
  <tr><td>⑥ 写入帧缓冲</td><td>通过测试的颜色写进显存里的 framebuffer</td><td>更少 / 幸存片元</td><td>固定</td></tr>
</table>
<p><b>注意执行次数的数量级跳变</b>：①只跑 3 次，③④却要跑几万到几百万次——这就是为什么「优化 shader」几乎总是指优化片元着色器，也是为什么大三角形和 overdraw 贵。②还藏着一个便宜的英雄机制：背对摄像机的三角形在装配站就被丢掉，后面四个站点一次都不跑。</p>
<p>④⑤的顺序值得单独说：规范上<b>先着色、后测试</b>，被遮挡的片元照样白白算了一遍颜色；现代硬件用 <b>early-z</b> 把深度测试提前到着色之前来省这笔钱，但只要你的 shader 里有 discard 或副作用，提前测就不合法了——「什么时候发生」从来不是物理定律，而是契约与优化的拉锯。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'pipeline',
      title: '实验：draw call 流水线模拟台',
      height: 520,
      code: `// draw call 流水线模拟台：把一次 draw 拆成六个站点，亲眼看数据怎么流过去
// Enter：CPU 提交 1 次 draw；S：一次提交 20 次；空格：单步推进（光栅/着色/测试逐格走）
// A：自动播放；R：重置整台；C：切换背面剔除；D：切换前景遮挡墙；B：切换半透明
// 鼠标左键拖拽：旋转相机——变的只是矩阵，三个顶点始终躺在「显存」里
// 注：投影做了温和的透视近似，重点是管线结构，不是投影数学

engine.run({
  setup: function (state) {
    state.stages = ['顶点着色', '图元装配', '光栅化', '片元着色', '测试与混合', '写入帧缓冲'];
    state.subMax = [1, 1, 49, 49, 49, 1];         // 每站的子步数：三站按 7x7 格逐格走
    state.verts = [                                // 三个顶点：模型空间位置 + 颜色
      { pos: [0, 0.8, 0], col: [0.95, 0.35, 0.35] },
      { pos: [-0.7, -0.5, 0], col: [0.35, 0.85, 0.4] },
      { pos: [0.7, -0.5, 0], col: [0.35, 0.55, 0.95] }
    ];
    state.yaw = 0; state.pitch = 0;                // 相机角（鼠标拖拽）
    state.stage = 0; state.sub = 0; state.auto = false; state.timer = 0;
    state.queue = [];                              // CPU 已提交、GPU 未执行的 draw 队列
    state.drawsSubmitted = 0; state.drawsDone = 0;
    state.cpuUs = 0; state.gpuMs = 0;              // 累计：CPU 提交耗时 vs GPU 执行耗时
    state.cull = true; state.wallOn = true; state.blend = false;   // 剔除 / 遮挡墙 / 混合
    state.rngSeed = 7;                             // 自带种子随机，不碰 Math.random
    state.log = '第一步：按 Enter 提交一次 draw，再按空格逐站推进'; state.logT = 8;
    state.drag = false; state.lastX = 0; state.lastY = 0;
    computeStage(state);
  },

  update: function (state, dt, input) {
    // 空格：点按单步；按住连走（手动模式逐格推进才有手感）
    state.holdT = (state.holdT || 0) - dt;
    if (input.pressed('Space') || (input.down('Space') && state.holdT <= 0)) {
      if (input.down('Space')) state.holdT = 0.09;
      advanceStep(state);
    }
    if (input.pressed('KeyA')) { state.auto = !state.auto; say(state, state.auto ? '自动播放开：GPU 连续走完六站' : '自动播放关：空格单步'); }
    if (input.pressed('Enter')) submitDraw(state, 1);
    if (input.pressed('KeyS')) submitDraw(state, 20);
    if (input.pressed('KeyR')) { resetAll(state); say(state, '重置完成'); }
    if (input.pressed('KeyC')) { state.cull = !state.cull; computeStage(state); say(state, '背面剔除 ' + (state.cull ? '开：背面三角形死在装配站' : '关：两面都画')); }
    if (input.pressed('KeyD')) { state.wallOn = !state.wallOn; say(state, '遮挡墙 ' + (state.wallOn ? '放下：远处片元将被丢弃' : '移除：全部通过')); }
    if (input.pressed('KeyB')) { state.blend = !state.blend; say(state, state.blend ? '半透明开：新颜色与旧像素加权混合' : '不透明：直接覆盖'); }
    if (input.mouse.down && !state.drag) { state.drag = true; state.lastX = input.mouse.x; state.lastY = input.mouse.y; }
    if (!input.mouse.down) state.drag = false;
    if (state.drag) {                              // 拖拽转相机：改变的是矩阵，不是顶点数据
      state.yaw += (input.mouse.x - state.lastX) * 0.012;
      state.pitch += (input.mouse.y - state.lastY) * 0.01;
      if (state.pitch > 0.62) state.pitch = 0.62;   // 俯仰限制在小角度：三角形保持可见，深度又足够拉开
      if (state.pitch < -0.62) state.pitch = -0.62;
      state.lastX = input.mouse.x; state.lastY = input.mouse.y;
      computeStage(state);
    }
    if (state.auto && state.queue.length > 0) {    // 自动播放：按节拍换站（逐格推进的站在自动模式下整站点亮）
      state.timer += dt;
      while (state.timer > 0.45) {
        state.timer -= 0.45;
        if (state.subMax[state.stage] > 1) { state.sub = state.subMax[state.stage]; advanceStep(state); }
        else advanceStep(state);
      }
    }
    state.logT -= dt;
  },

  draw: function (state, ctx) {
    var i, sy;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('Enter提交 S提交x20 空格单步 A自动 R重置 C剔除 D遮挡墙 B混合 拖拽转相机', 12, 18);

    for (i = 0; i < 6; i++) {                      // ===== 左侧：六站竖排 =====
      sy = 34 + i * 64;
      var active = (i === state.stage);
      ctx.strokeStyle = active ? '#fbbf24' : (i < state.stage ? '#34d399' : '#2f4468');
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(12, sy, 150, 56);
      ctx.fillStyle = active ? '#fbbf24' : '#9db4d0';
      ctx.fillText((i + 1) + '. ' + state.stages[i], 20, sy + 16);
      ctx.fillStyle = active ? '#e2e8f0' : '#5b7397';
      ctx.fillText(STAGE_TAG[i] + (active ? '  ' + state.sub + '/' + state.subMax[i] : ''), 20, sy + 38);
    }

    ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1; ctx.strokeRect(176, 34, 250, 210);   // 世界预览
    ctx.fillStyle = '#8fa7c7'; ctx.fillText('世界空间预览（拖拽旋转）', 186, 50);
    drawWorld(state, ctx, 176, 34, 250, 210);

    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(176, 250, 250, 150);                     // 当前站详情
    drawDetail(state, ctx, 176, 250);

    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(434, 34, 274, 366);                       // CPU/GPU 计数器
    ctx.fillStyle = '#f472b6'; ctx.fillText('CPU 侧（游戏线程）', 446, 52);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('提交 draw 次数: ' + state.drawsSubmitted, 446, 74);
    ctx.fillText('累计提交耗时: ' + state.cpuUs.toFixed(1) + ' us', 446, 92);
    ctx.fillStyle = '#7d93b3'; ctx.fillText('每次提交仅微秒级：录好命令就返回', 446, 112);
    ctx.fillStyle = '#34d399'; ctx.fillText('GPU 侧（异步执行）', 446, 142);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('已完成 draw: ' + state.drawsDone, 446, 164);
    ctx.fillText('累计执行耗时: ' + state.gpuMs.toFixed(2) + ' ms', 446, 182);
    ctx.fillStyle = '#7d93b3'; ctx.fillText('真正走完六个站点的时间在这里', 446, 202);
    ctx.fillStyle = '#fbbf24'; ctx.fillText('待执行队列: ' + state.queue.length + ' 次', 446, 234);
    for (i = 0; i < state.queue.length && i < 20; i++) {
      ctx.fillStyle = i === 0 ? '#fbbf24' : '#5b7397';
      ctx.fillRect(446 + i * 12, 242, 9, 14);
    }
    if (state.queue.length > 20) { ctx.fillStyle = '#5b7397'; ctx.fillText('+' + (state.queue.length - 20), 446 + 20 * 12, 254); }
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('结论：提交快 != 画面快。', 446, 282);
    ctx.fillText('队列堆积时瓶颈在 GPU 侧；', 446, 300);
    ctx.fillText('队列为空且卡顿才可能是 CPU 侧。', 446, 318);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('试试：按 S 灌 20 次再看两个计数器。', 446, 344);

    if (state.logT > 0) { ctx.fillStyle = '#fbbf24'; ctx.fillText(state.log, 12, 432); }
  }
});

// ---------- 辅助函数（声明提升，可在上面调用） ----------

var STAGE_TAG = ['v x3 -> clip', 'tri x1', 'cells 7x7', 'frag per px', 'z-test mix', '-> fb'];
var WALL_Z = 0.38;                                 // 遮挡墙的归一化深度（越小越近）

function say(state, s) { state.log = s; state.logT = 5; }

function rand(state) {                             // 自带 LCG 种子随机，绝不碰 Math.random
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) % 4294967296;
  return state.rngSeed / 4294967296;
}

function submitDraw(state, n) {                    // CPU 提交：录命令、入队、返回——不等 GPU
  for (var i = 0; i < n; i++) {
    state.queue.push(1);
    state.drawsSubmitted++;
    state.cpuUs += 0.8 + rand(state) * 0.6;        // 单次提交约 1us 量级
  }
  say(state, 'CPU 提交了 ' + n + ' 次 draw，累计 ' + state.cpuUs.toFixed(1) + 'us——它现在就去干别的了');
}

function resetAll(state) {
  state.yaw = 0; state.pitch = 0; state.drag = false;
  state.stage = 0; state.sub = 0; state.auto = false; state.timer = 0;
  state.queue = []; state.drawsSubmitted = 0; state.drawsDone = 0;
  state.cpuUs = 0; state.gpuMs = 0;
  computeStage(state);
}

function advanceStep(state) {                      // 推进一个子步；子步用完换站
  if (state.queue.length === 0) { say(state, '队列为空：先按 Enter 提交一次 draw'); return; }
  if (state.stage === 1 && state.sub >= 1) {       // 即将离开装配站：背面 + 剔除开启 -> 提前结束
    if (state.culledNow) { finishDraw(state, true); return; }
  }
  state.sub++;
  if (state.sub > state.subMax[state.stage]) {
    state.sub = 0;
    state.stage++;
    if (state.stage > 5) { finishDraw(state, false); return; }
  }
}

function countStats(state) {                       // 本次 draw 的片元统计（供展示与记账）
  var covered = 0, discarded = 0;
  for (var i = 0; i < state.cells.length; i++) {
    if (state.cells[i].inside) {
      covered++;
      if (state.wallOn && cellDepth(state, state.cells[i].b) >= WALL_Z) discarded++;
    }
  }
  return { covered: covered, discarded: discarded };
}

function finishDraw(state, culled) {               // 这次 draw 在 GPU 上执行完毕
  state.drawsDone++;
  var st = countStats(state);
  if (culled) {
    state.gpuMs += 0.02;                           // 死在装配站：几乎免费
    say(state, '背面剔除！这次 draw 只跑了顶点+装配两站，后面四站 0 次执行');
  } else {
    state.gpuMs += 0.05 + st.covered * 0.02 + (st.covered - st.discarded) * 0.01;
    if (st.discarded === st.covered && st.covered > 0) say(state, '全部 ' + st.covered + ' 个片元被深度测试丢弃——颜色全白算了');
    else say(state, 'draw 完成：' + st.covered + ' 片元着色，' + st.discarded + ' 丢弃，' + (st.covered - st.discarded) + ' 写入帧缓冲');
  }
  state.stage = 0; state.sub = 0;
  state.queue.shift();                             // 队列头部执行完毕
  computeStage(state);
}

function viewOf(state, x, y, z) {                  // 旋转到相机空间并沿 -z 推开 2.6
  var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
  var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
  var rx = cy * x - sy * z;
  var rz2 = sy * x + cy * z;
  var ry = cp * y - sp * rz2;
  var rz = sp * y + cp * rz2;
  return [rx, ry, rz - 2.6];
}

function projOf(state) {                           // 每顶点：view -> clip(x,y,z,w) -> NDC，含背面/覆盖预计算
  var NEAR = 1.0, FAR = 10.0;
  var A = (FAR + NEAR) / (NEAR - FAR), B = (2 * FAR * NEAR) / (NEAR - FAR);
  var FOV = 2.8;                                   // 简化焦距（把三角形放大到网格大半屏）
  state.clip = [];
  for (var i = 0; i < 3; i++) {
    var v = viewOf(state, state.verts[i].pos[0], state.verts[i].pos[1], state.verts[i].pos[2]);
    var w = -v[2];                                 // 透视：w = 视距
    state.clip.push([v[0] * FOV, v[1] * FOV, A * v[2] + B, w]);
  }
  state.ndc = state.clip.map(function (c) {        // 透视除法：clip / w
    return [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
  });
  var ax = state.ndc[1][0] - state.ndc[0][0], ay = state.ndc[1][1] - state.ndc[0][1];
  var bx = state.ndc[2][0] - state.ndc[0][0], by = state.ndc[2][1] - state.ndc[0][1];
  state.crossZ = ax * by - ay * bx;                // 叉积定正反：>0 正面（CCW）
  state.culledNow = state.cull && state.crossZ < 0;
  state.cells = [];                                // 光栅化预演：7x7 格心是否在三角形内
  for (var r = 0; r < 7; r++) for (var cIdx = 0; cIdx < 7; cIdx++) {
    var b = bary(state, (cIdx + 0.5) / 7, (r + 0.5) / 7);
    state.cells.push({ inside: b !== null, b: b });
  }
}

function computeStage(state) { projOf(state); }    // 统一入口：重算所有几何中间量

function cellDepth(state, b) {                     // 重心插值深度（仿射近似，真实硬件是 1/w 校正插值）
  return b[0] * state.ndc[0][2] + b[1] * state.ndc[1][2] + b[2] * state.ndc[2][2];
}

function bary(state, u, v) {                       // NDC 三角形映到 0..1 求重心坐标；在外返回 null
  var p0 = ndcUv(state, 0), p1 = ndcUv(state, 1), p2 = ndcUv(state, 2);
  var d = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
  if (Math.abs(d) < 1e-9) return null;
  var l0 = ((p1[1] - p2[1]) * (u - p2[0]) + (p2[0] - p1[0]) * (v - p2[1])) / d;
  var l1 = ((p2[1] - p0[1]) * (u - p2[0]) + (p0[0] - p2[0]) * (v - p2[1])) / d;
  var l2 = 1 - l0 - l1;
  if (l0 < -0.001 || l1 < -0.001 || l2 < -0.001) return null;
  return [l0, l1, l2];
}

function ndcUv(state, i) {
  return [(state.ndc[i][0] + 1) / 2, (state.ndc[i][1] + 1) / 2];
}

function drawWorld(state, ctx, ox, oy, w, h) {     // 把投影后的三角形画进预览框
  var pts = [];
  for (var i = 0; i < 3; i++) pts.push([ox + 20 + (state.ndc[i][0] + 1) / 2 * (w - 40), oy + h - 20 - (state.ndc[i][1] + 1) / 2 * (h - 40)]);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.closePath();
  ctx.strokeStyle = state.culledNow ? '#f87171' : '#34d399'; ctx.lineWidth = 1.5; ctx.stroke();
  for (i = 0; i < 3; i++) {
    var c = state.verts[i].col;
    ctx.fillStyle = 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 4, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = '#5b7397';
  ctx.fillText('yaw ' + state.yaw.toFixed(2) + '  pitch ' + state.pitch.toFixed(2), ox + 10, oy + h - 8);
  if (state.culledNow) { ctx.fillStyle = '#f87171'; ctx.fillText('背面！开了剔除将死在站点2', ox + 10, oy + 24); }
}

function drawDetail(state, ctx, ox, oy) {          // 当前站点的数值细节
  var i;
  ctx.fillStyle = '#9b8cff'; ctx.fillText('站点 ' + (state.stage + 1) + ' 进行中：' + state.stages[state.stage], ox + 10, oy + 20);
  if (state.stage === 0) {                         // 顶点着色：打印 NDC 数值
    ctx.fillStyle = '#7d93b3'; ctx.fillText('NDC (x, y, z) = clip / w:', ox + 10, oy + 40);
    for (i = 0; i < 3; i++) {
      var c = state.ndc[i];
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText('v' + i + ' (' + c[0].toFixed(2) + ', ' + c[1].toFixed(2) + ', ' + c[2].toFixed(2) + ')', ox + 10, oy + 58 + i * 16);
    }
    ctx.fillStyle = '#7d93b3'; ctx.fillText('每顶点跑一次，共 3 次；拖相机只改矩阵，', ox + 10, oy + 112);
    ctx.fillText('顶点数据本身一直躺在显存里', ox + 10, oy + 130);
  } else if (state.stage === 1) {                  // 图元装配
    ctx.fillStyle = state.culledNow ? '#f87171' : '#34d399';
    ctx.fillText(state.culledNow ? '叉积 z=' + state.crossZ.toFixed(2) + ' < 0 -> 背面，剔除！' : '叉积 z=' + state.crossZ.toFixed(2) + ' > 0 -> 正面，保留', ox + 10, oy + 44);
    ctx.fillStyle = '#7d93b3'; ctx.fillText('透视除法已完成：clip / w = NDC', ox + 10, oy + 66);
    ctx.fillText('被剔的三角形不再消耗任何片元', ox + 10, oy + 84);
    ctx.fillText('（再按一次空格走出本站，触发剔除判定）', ox + 10, oy + 102);
  } else if (state.stage === 2) {                  // 光栅化：逐格覆盖测试
    drawCellGrid(state, ctx, ox, oy, 'cover');
  } else if (state.stage === 3) {                  // 片元着色：逐格上色
    drawCellGrid(state, ctx, ox, oy, 'shade');
  } else if (state.stage === 4) {                  // 测试与混合：逐格裁决
    drawCellGrid(state, ctx, ox, oy, 'test');
  } else {                                         // 写入帧缓冲
    var st = countStats(state);
    ctx.fillStyle = '#7d93b3'; ctx.fillText('幸存片元 -> 写进显存 framebuffer', ox + 10, oy + 44);
    ctx.fillText('着色 ' + st.covered + ' 个，丢弃 ' + st.discarded + ' 个，写入 ' + (st.covered - st.discarded) + ' 个', ox + 10, oy + 66);
    ctx.fillText('本次 draw 结束；队列里还有 ' + state.queue.length + ' 次等着执行', ox + 10, oy + 86);
    ctx.fillText('GPU 执行期间，CPU 早已返回去准备下一帧', ox + 10, oy + 108);
  }
}

function drawCellGrid(state, ctx, ox, oy, mode) {  // 光栅化/着色/测试共用的小格子视图
  var i, x, y, cell;
  for (i = 0; i < 49; i++) {
    x = ox + 12 + (i % 7) * 16; y = oy + 36 + Math.floor(i / 7) * 16;
    cell = state.cells[i];
    if (mode === 'cover') {                        // 光栅化：逐格判内外
      if (i < state.sub) {
        ctx.fillStyle = cell.inside ? '#2f4468' : '#1a2233';
        ctx.fillRect(x, y, 14, 14);
        if (!cell.inside) { ctx.strokeStyle = '#5b7397'; ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + 11, y + 11); ctx.moveTo(x + 11, y + 3); ctx.lineTo(x + 3, y + 11); ctx.stroke(); }
      } else if (i === state.sub) {
        ctx.strokeStyle = '#fbbf24'; ctx.strokeRect(x, y, 14, 14);
      }
    } else if (mode === 'shade') {                 // 着色：内部格逐格上色
      if (cell.inside && i < state.sub) {
        var cc = fragColor(state, cell.b, i);
        ctx.fillStyle = 'rgb(' + cc.join(',') + ')'; ctx.fillRect(x, y, 14, 14);
      } else if (cell.inside && i === state.sub) {
        ctx.strokeStyle = '#fbbf24'; ctx.strokeRect(x, y, 14, 14);
      }
    } else {                                       // 测试：丢弃格画红叉
      if (cell.inside && i < state.sub) {
        var dead = state.wallOn && cellDepth(state, cell.b) >= WALL_Z;
        var cc2 = fragColor(state, cell.b, i);
        ctx.fillStyle = 'rgb(' + cc2.join(',') + ')'; ctx.fillRect(x, y, 14, 14);
        if (dead) { ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 12, y + 12); ctx.moveTo(x + 12, y + 2); ctx.lineTo(x + 2, y + 12); ctx.stroke(); ctx.lineWidth = 1; }
      } else if (cell.inside && i === state.sub) {
        ctx.strokeStyle = '#fbbf24'; ctx.strokeRect(x, y, 14, 14);
      }
    }
  }
  ctx.fillStyle = '#7d93b3';
  var tips = { cover: '逐格判内外：内部格 = 产生片元', shade: '每片元一次：col = l0*c0 + l1*c1 + l2*c2', test: '深度 >= ' + WALL_Z.toFixed(2) + ' 红叉丢弃（颜色已白算）' };
  ctx.fillText(tips[mode], ox + 10, oy + 146);
}

function fragColor(state, b, i) {                  // 重心插值三色 + 固定抖动（体现逐片元独立执行）
  var j = (i * 7) % 13 - 6;
  var out = [];
  for (var k = 0; k < 3; k++) {
    var v = b[0] * state.verts[0].col[k] + b[1] * state.verts[1].col[k] + b[2] * state.verts[2].col[k];
    if (state.blend) v = v * 0.6 + 0.4 * 0.15;     // 粗略模拟与暗背景混合
    out.push(Math.max(0, Math.min(255, Math.round(v * 255 + j))));
  }
  return out;
}
`
    },
    {
      type: 'source',
      title: '源码走读：一次 draw call 在 Godot 里的三层落点',
      files: [
        { path: 'servers/rendering/rendering_device.h', note: 'RenderingDevice 的 draw list API：draw_list_begin / bind_render_pipeline / bind_uniform_set / bind_vertex_array / draw_list_draw（1556~1568 行附近）——一次 draw call 在 CPU 侧就是这一串录制动作，离真正执行还隔着整个驱动队列。' },
        { path: 'servers/rendering/renderer_rd/pipeline_cache_rd.h', note: '图形管线状态缓存：shader + 拓扑 + 光栅化 + 深度/模板 + 混合状态打包成一个 RID 版本表，get_render_pipeline 查不到才生成——管线是一组状态的组合键，在这里写得明明白白。' },
        { path: 'drivers/vulkan/rendering_device_driver_vulkan.cpp', note: '边界的最下游：command_render_draw 直接转发 vkCmdDraw（5782 行附近）——Godot 的统一抽象到这里才变成厂商 API，对应关系一目了然。' }
      ]
    },
    {
      type: 'text',
      title: '源码里的三个设计决定',
      html: `<p><b>一、draw call 在 CPU 侧只是一段录制。</b>看 <code>rendering_device.h</code> 里 draw list 这一族方法：<code>draw_list_bind_render_pipeline</code> → <code>draw_list_bind_uniform_set</code> → <code>draw_list_bind_vertex_array</code> → <code>draw_list_draw</code>。没有一步在「画」，全在「写说明书」。说明书攒够了一次 submit，GPU 才开始干活——这正是模拟台右侧两个计数器的距离。</p>
<p><b>二、管线是一个对象，不是一段代码。</b><code>PipelineCacheRD</code> 把 shader、图元类型、光栅化、深度/模板、混合状态<b>整套打包成一个缓存键</b>：<code>get_render_pipeline()</code> 命中就直接复用 RID，miss 才向驱动新建。所以切材质如果只换 uniform 很便宜，一旦换了混合模式或深度配置，就是一整条管线的重建——这是「状态机合并」思想在渲染层的翻版，也是 Unity/UE 里 PSO（pipeline state object）概念的同款。</p>
<p><b>三、厂商差异在最后一层才被摊平。</b><code>rendering_device_driver_vulkan.cpp</code> 的 <code>command_render_draw</code> 里只有一行 <code>vkCmdDraw</code>；OpenGL/D3D12/Metal 后端各有一份同样的薄壳。上层（含你熟悉的 RenderingServer 接口）完全不知道用的是哪家 GPU——分层架构里「可替换的那一刀」就切在这里。</p>`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>按 <code>S</code> 连提 20 次 draw，观察右侧：CPU 计数器瞬间涨到二十几微秒就完事，GPU 侧「待执行队列」堆成一排慢慢消化——<b>提交和执行是两条独立时钟</b>。这就是帧率被 GPU 拖住时，CPU 看起来「很闲」的原因。</li>
  <li>拖拽鼠标转到三角形背面，按空格走到站点 2 后再推一步：背面剔除直接把这次 draw 掐死，后面四个站点一次都不跑。<b>剔除是最便宜的优化</b>，因为它省掉的是片元级的数量级。</li>
  <li>按 <code>D</code> 放下遮挡墙，再上下拖拽相机改变俯仰：站点 5 里有的格子亮着通过、有的被红叉丢弃——同一个三角形，不同像素深度不同。想想为什么带 <code>discard</code> 的 shader 会破坏 early-z 的提前测试。</li>
  <li>按 <code>B</code> 开半透明再单步一遍：同一个格子的颜色不再是覆盖，而是新旧加权——混合要求「先知道底下是什么」，于是强制按序读写，带宽和排序都成了成本。</li>
  <li>反复跑完整轮而不清队列，注意 GPU 耗时一直涨而画面几乎不变：同样的像素被重画了 N 遍（overdraw）。真实引擎靠排序与合并减少这种浪费，这是 L4.3 的主题。</li>
</ul>`
    },
    {
      type: 'lab',
      lab: 'shader',
      key: 'tri',
      title: '选做实验：在片元着色器里手画一个三角形',
      height: 480,
      code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
    // 用边缘函数（重心坐标）自己当一次光栅化器：
    // 对每个像素问一句「你在三角形里面吗？」——这就是站点3的全部秘密
    float2 p = uv * 2.0 - 1.0;

    // 三个顶点（NDC 风格坐标，左下 -1 右上 +1）
    float2 a = float2(0.0, 0.8);
    float2 b = float2(-0.7, -0.5);
    float2 c = float2(0.7, -0.5);

    // 三条边的边缘函数：点在每条边的哪一侧？
    float e_ab = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    float e_bc = (p.x - b.x) * (c.y - b.y) - (p.y - b.y) * (c.x - b.x);
    float e_ca = (p.x - c.x) * (a.y - c.y) - (p.y - c.y) * (a.x - c.x);

    bool inside = (e_ab <= 0.0 && e_bc <= 0.0 && e_ca <= 0.0);

    // 到某条对边的距离 = 对面顶点的重心权重；除以总面积归一化
    float area = abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    float wA = abs(e_bc) / area;   // 对边 bc -> 顶点 a 的权重
    float wB = abs(e_ca) / area;   // 对边 ca -> 顶点 b 的权重
    float wC = abs(e_ab) / area;   // 对边 ab -> 顶点 c 的权重

    if (!inside) {
        // 三角形外：淡淡的网格提醒你——这里每个像素都被「测试过又丢弃」
        float2 g = frac(uv * 14.0);
        float grid = step(0.96, max(g.x, g.y));
        return float4(0.04 + grid * 0.05, 0.05 + grid * 0.05, 0.08 + grid * 0.06, 1.0);
    }

    // 三角形内：重心坐标插值三个顶点的颜色——站点3顺手做的插值
    float3 ca = float3(0.95, 0.35, 0.35);
    float3 cb = float3(0.35, 0.85, 0.40);
    float3 cc = float3(0.35, 0.55, 0.95);
    float3 col = ca * wA + cb * wB + cc * wC;

    // 边缘高亮：让你看清「覆盖判定」的边界长什么样
    float edge = min(min(abs(e_ab), abs(e_bc)), abs(e_ca)) / area;
    col += saturate(0.02 - edge) * 3.0;

    return float4(col, 1.0);
}
`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回到本课的四问。<b>数据怎么流动</b>：顶点在显存里经 MVP 进裁剪空间，装配成图元，光栅化成片元，逐片元着色，过测试与混合，写进帧缓冲——每一步都是「复制一份更小的数据」，而不是搬动原件。<b>所有权归谁</b>：顶点缓冲属于 RenderingDevice 的资源对象，生命周期随 RID；像素的所有权在「最后一次通过测试的那个 draw」手里，混合则是新旧颜色的加权谈判。<b>什么时候发生</b>：CPU 侧录制与提交发生在游戏线程的一帧之内、微秒级；GPU 的执行在之后的某个时刻异步开始，跨帧重叠；early-z 这类「提前」是硬件在不改变语义前提下的自由裁量。</p>
<p>你已经看过一次 draw call 的完整旅程，也亲手当过一回光栅化器。下一站 L4.2：我们回到站点 4，把那个「每像素跑一次」的小程序写成光照——本课里用重心坐标插出来的颜色，到时候由你自己定义怎么算。</p>`
    }
  ]
}
