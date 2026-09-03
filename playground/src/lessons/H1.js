// H1 · 输入手感：缓冲窗口与土狼时间
export default {
  id: 'H1',
  title: '输入手感：缓冲窗口与土狼时间',
  est: '2 小时',
  coreQuestions: [
    '玩家明明「按了跳」却没跳起来，这个输入丢在哪里了？引擎该在什么时刻、以什么数据结构把它接住？',
    '土狼时间与输入缓冲各自救的是哪种失败场景？它们的计时起点和终点分别是什么？',
    '这些毫秒级的容错逻辑，应该写在游戏代码里，还是能沉到引擎层？Godot 源码里有没有现成的影子？'
  ],
  sections: [
    {
      type: 'text',
      title: '手感不是玄学：一次「没反应」的解剖',
      html: `<p>你一定有过这种体验：同一个跳跃操作，在有的游戏里「指哪打哪」，在另一些里却邪门地吞键。差别几乎不在美术和帧率，而在<b>引擎对「输入时机」的态度</b>。先用数据流的眼光解剖一次失败的跳跃。</p>
<p><b>理想世界</b>里，事件是原子的：按下空格的那一瞬间，角色恰好站在地上，于是起跳。<b>真实世界</b>里，三件事都在捣乱：</p>
<ul>
  <li><b>时间采样</b>：游戏逻辑不是连续运行的，物理步每 1/60 秒才跑一次。你按下的那个瞬间，可能落在两个物理帧之间——事件本身不会丢（Input 单例记着账），但「判定是否在地面」只在物理帧发生；</li>
  <li><b>状态时序差</b>：你想跳的时候，脚底判定（is_on_floor）可能刚刚因为走出平台边缘而翻成 false——只早了几十毫秒，这一跳就作废；</li>
  <li><b>人类精度</b>：人预判落地、提前松键、抢拍起跳，误差天然在 ±50~100ms 量级。引擎若按「零容差」裁决，就是在跟人类的生理极限作对。</li>
</ul>
<p>注意一个关键定性：<b>这三类吞键都不是 bug，输入事件被引擎完整地收到了</b>——L7.1 走过这条路由（OS → Input → Viewport → 节点），事件抵达你的代码时毫发无损。丢失发生在下一站：<b>玩法代码看了一眼事件，发现此刻条件不满足，就把它扔了</b>。扔得太干脆，就是生硬的手感；留一手，就是舒服的手感。</p>`
    },
    {
      type: 'text',
      title: '四件套：给输入装上「软垫」',
      html: `<p>业界把这些「留一手」的做法总结成四件套。它们的共同思想只有一句话：<b>把精确时刻的布尔判定，改成一段时间窗内的宽容判定</b>。逐个看：</p>
<table>
  <tr><th>机制</th><th>救什么场景</th><th>一句话规则</th></tr>
  <tr><td>① 输入缓冲 input buffer</td><td>还没落地就急着按跳（玩家<b>提前</b>了）</td><td>按跳时若在空中，别扔，记下时间戳；落地后检查「按键距今是否小于窗口（约 120ms）」，是则自动补跳</td></tr>
  <tr><td>② 土狼时间 coyote time</td><td>刚走出平台边缘再按跳（玩家<b>来晚了</b>）</td><td>离开地面后不清除可跳资格，保留一个倒计时窗（约 100ms）；窗内按跳照常起跳。名字来自土狼跑出悬崖才发现没路的卡通桥段</td></tr>
  <tr><td>③ 可变跳跃高度 variable jump</td><td>想小跳却被被迫满高</td><td>上升途中松开跳键，立刻把向上速度截断到一个下限（如乘 0.4）；按住则跳满</td></tr>
  <tr><td>④ 加速度曲线 accel/friction</td><td>起步刹车像火车一样突兀</td><td>水平速度用每秒增速/每秒减速向目标插值，而不是瞬时赋值；且<b>加速快、减速慢</b>是常见配方</td></tr>
</table>
<p>前两件是一对镜像：缓冲处理「输入早于状态」（等状态追上来），土狼处理「状态早于输入的截止」（等输入追上来）。它们都要求引擎回答同一组问题——<b>数据存在哪（谁持有这个时间戳/倒计时）？什么时候写、什么时候读、什么时候过期作废？</b>这正是三个灵魂拷问在手感层的投影。后两件不涉及窗口，改的是速度的生成方式：可变跳截的是这次跳跃的形状，加速曲线磨的是每一次换向的棱角。</p>
<p>还有一个反直觉的点：这四件套没有一件让角色<b>多做了</b>任何事——跳的高度、距离参数完全不变。变的只有玩家的意图在什么时间窗内被接受。<b>引擎多给一点容错，玩家觉得是自己厉害</b>——手感的本质是对归因的操纵，而这必须是引擎级支持：它发生在每帧的物理判定里，靠游戏脚本临时抱佛脚是做不稳的。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'feel',
      title: '实验：手感对照沙盘——四个开关，一条日志',
      height: 600,
      code: `// 手感对照沙盘：输入缓冲 / 土狼时间 / 可变跳跃 / 加速曲线
// 方向键左右移动，空格跳跃（也可点画布左侧场地 = 发一次跳跃脉冲）
// Q W E R 或鼠标点击右栏 = 独立开关四件套
// 数字 1~8 = 设缓冲窗口 40~320ms；数字 9 = 土狼窗口 60/100/160 轮转
// P = 预设循环（全关生硬版 / 全开顺滑版 / 自定义）；Enter = 重置小人
// 日志标注每次跳跃被哪个机制救了：缓冲生效 / 土狼生效 / 截断上升

engine.run({
  setup: function (state) {
    state.simT = 0;                          // 仿真时钟（秒），一切时刻都以它记账
    state.on = [false, false, false, false]; // 四件套开关：缓冲/土狼/可变跳/加速
    state.bufMs = 120;                       // 缓冲窗口 ms
    state.coyMs = 100;                       // 土狼窗口 ms（键盘三档轮转）
    state.presets = [[false,false,false,false],[true,true,true,true]];
    state.preset = -1;                       // -1 自定义，0 全关，1 全开
    state.platforms = [
      { x: 0,   y: 396, w: 250, h: 44 },
      { x: 300, y: 396, w: 180, h: 44 },
      { x: 530, y: 396, w: 190, h: 44 },
      { x: 205, y: 306, w: 110, h: 16 },
      { x: 430, y: 232, w: 120, h: 16 }
    ];
    resetPlayer(state);
    state.lastKey = ''; state.lastKeyT = -1;      // 最近一次跳跃意图：事件名 + 盖章时刻
    state.pendingUntil = -1;                      // 缓冲到期时刻（simT 秒）
    state.airborneAt = -1;                        // 本段离地的起始时刻（土狼计时起点）
    state.jumpHold = false; state.jumpCut = false;
    state.jumps = 0; state.savedBuf = 0; state.savedCoy = 0; state.cuts = 0;
    state.log = [];
    pushLog(state, '默认全关＝生硬版。按 P 切全开对比，再调窗口');
  },

  update: function (state, dt, input) {
    if (dt > 0.05) dt = 0.05;                    // 切后台回来的巨大 dt 钳制掉
    state.simT += dt;
    var i;

    for (i = 0; i < 4; i++) {                   // Q W E R：独立开关四件套
      if (input.pressed('KeyQ')) toggle(state, 0);
      if (input.pressed('KeyW')) toggle(state, 1);
      if (input.pressed('KeyE')) toggle(state, 2);
      if (input.pressed('KeyR')) toggle(state, 3);
    }
    for (i = 1; i <= 8; i++) {                  // 数字 1~8：缓冲窗口 = i*40 ms
      if (input.pressed('Digit' + i)) setBuf(state, i * 40);
    }
    if (input.pressed('Digit9')) {              // 土狼窗口三档轮转
      state.coyMs = state.coyMs === 60 ? 100 : (state.coyMs === 100 ? 160 : 60);
      pushLog(state, '土狼窗口 -> ' + state.coyMs + 'ms');
    }
    if (input.pressed('KeyP')) cyclePreset(state);
    if (input.pressed('Enter')) { resetPlayer(state); pushLog(state, '小人已重置回地面'); }

    clickUi(state, input);                      // 鼠标：开关 / 滑条 / 预设按钮

    // —— 采集跳跃意图：pressed 边沿或点场地，各算一次按跳 ——
    var pulse = input.pressed('Space') || (input.mouse.clicked && input.mouse.x < 470);
    if (pulse) {
      state.lastKey = input.pressed('Space') ? 'Space' : 'Click';
      state.lastKeyT = state.simT;              // 盖时间戳
      state.pendingUntil = state.simT + state.bufMs / 1000;   // 缓冲：定到期时刻
    }

    var p = state.player;
    var prevOn = p.onGround;

    // —— 水平运动：开关④决定瞬时赋值还是加减速插值 ——
    var dir = 0;
    if (input.down('ArrowLeft')) dir -= 1;
    if (input.down('ArrowRight')) dir += 1;
    var target = dir * 225;
    if (state.on[3]) {
      var rate = dir !== 0 ? 1500 : 1200;       // 加速比减速略快：常用配方
      var dv = clamp(target - p.vx, -rate * dt, rate * dt);
      p.vx += dv;
    } else {
      p.vx = target;                            // 生硬版：瞬时到速、瞬时停
    }

    // —— 垂直运动：重力 + 一帧步进的地面判定（AABB 落到平台上表面） ——
    p.vy += 1500 * dt;
    if (p.vy > 900) p.vy = 900;
    p.x += p.vx * dt;
    if (p.x < 4) { p.x = 4; if (p.vx < 0) p.vx = 0; }
    if (p.x > 452) { p.x = 452; if (p.vx > 0) p.vx = 0; }
    var ny = p.y + p.vy * dt;
    p.onGround = false; p.groundY = 0; p.edgeDist = 0; p.edgePlat = null;
    for (i = 0; i < state.platforms.length; i++) {
      var pl = state.platforms[i];
      if (p.x + 16 > pl.x && p.x < pl.x + pl.w &&
          p.y + 28 <= pl.y + 2 && ny + 28 >= pl.y) {
        ny = pl.y - 28; p.onGround = true; p.groundY = pl.y; p.edgePlat = pl;
      }
    }
    p.y = ny;
    if (p.y > 430) { p.y = 430; p.vy = 0; p.onGround = true; p.groundY = 440; }
    if (p.onGround && p.edgePlat) {             // 到所站平台最近边缘的距离 px
      var lft = p.x - p.edgePlat.x, rgt = p.edgePlat.x + p.edgePlat.w - (p.x + 16);
      p.edgeDist = Math.min(lft, rgt);
    }

    // —— 土狼计时：离地那一刻记起点，落地清零 ——
    if (prevOn && !p.onGround) state.airborneAt = state.simT;
    if (p.onGround) state.airborneAt = -1;
    var sinceAir = state.airborneAt < 0 ? 99999 : (state.simT - state.airborneAt) * 1000;

    // —— 起跳裁决：先问地面，再问土狼；都不满足则留给缓冲窗口 ——
    if (state.lastKeyT >= 0) {
      var t = Math.round((state.simT - state.lastKeyT) * 1000);
      if (p.onGround) {                          // 常规跳：不算被救
        if (t > 0 && state.on[0] && state.simT <= state.pendingUntil) {
          doJump(state, 480, '落地前 ' + t + 'ms 按跳 -> 缓冲生效');
          state.savedBuf++;
        } else {
          doJump(state, 480, '落地起跳（无容错参与）');
        }
      } else if (state.on[1] && sinceAir <= state.coyMs) {   // 开关②：土狼
        doJump(state, 480, '离台 ' + t + 'ms 按跳 -> 土狼生效');
        state.savedCoy++;
      }
      // 空中且无土狼：意图不消费，留在窗口里等落地兑现（开关①缓冲）
    }

    // —— 开关③可变跳：上升途中松键即截断 ——
    if (state.on[2] && state.jumpHold && !input.down('Space') && !state.jumpCut && p.vy < 0) {
      p.vy *= 0.4; state.jumpCut = true; state.cuts++;
      pushLog(state, '提前松键 -> 上升截断至 40%');
    }

    for (i = 0; i < 4; i++) {                   // 面板高亮衰减
      if (state.anim[i] > 0) state.anim[i] -= dt;
      if (state.slAnim[i] > 0) state.slAnim[i] -= dt;
    }
    state.msgT -= dt;
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '12px monospace';

    for (i = 0; i < state.platforms.length; i++) {     // 平台
      var pl = state.platforms[i];
      ctx.fillStyle = '#16233a'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.strokeStyle = '#2f4468'; ctx.lineWidth = 1; ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
    }

    var p = state.player;                              // 小人：身+头（落地绿/空中黄）
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(p.x + 4, p.y, 8, 28);
    ctx.fillStyle = p.onGround ? '#34d399' : '#fbbf24';
    ctx.fillRect(p.x + 3, p.y - 8, 10, 8);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('vx=' + Math.round(p.vx), p.x - 4, p.y + 42);
    ctx.fillText('距边缘 ' + Math.round(p.edgeDist) + 'px', p.x - 20, p.y + 56);

    drawRing(state, ctx);                              // 窗口进度环

    ctx.fillStyle = '#0d1420'; ctx.fillRect(8, 8, 460, 64);    // 左上 HUD
    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(8, 8, 460, 64);
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('跳跃 ' + state.jumps + '   缓冲救 ' + state.savedBuf +
                 '   土狼救 ' + state.savedCoy + '   截断 ' + state.cuts, 18, 28);
    ctx.fillStyle = state.msgT > 0 ? '#fbbf24' : '#5b7397';
    ctx.fillText(state.msg, 18, 50);

    ctx.fillStyle = '#0d1420'; ctx.fillRect(8, 348, 460, 84);  // 左下日志
    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(8, 348, 460, 84);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('反馈日志（最新在下）', 16, 364);
    ctx.fillStyle = '#a7bdd9';
    for (i = 0; i < state.log.length; i++) ctx.fillText(clip(state.log[i], 56), 16, 380 + i * 16);

    ctx.fillStyle = '#0d1420'; ctx.fillRect(478, 8, 234, 424); // 右控制面板
    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(478, 8, 234, 424);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('四件套开关（Q W E R / 点击）', 488, 26);
    var names = ['缓冲窗口', '土狼时间', '可变跳高', '加速曲线'];
    var keysHint = ['Q', 'W', 'E', 'R'];
    for (i = 0; i < 4; i++) {
      var y = 36 + i * 40;
      ctx.fillStyle = state.on[i] ? '#12351f' : '#1c2536';
      ctx.fillRect(488, y, 214, 32);
      ctx.strokeStyle = state.anim[i] > 0 ? '#34d399' : (state.on[i] ? '#2f7d4f' : '#4a5f80');
      ctx.lineWidth = state.anim[i] > 0 ? 2 : 1; ctx.strokeRect(488, y, 214, 32);
      ctx.fillStyle = '#e2e8f0'; ctx.fillText(keysHint[i] + ' ' + names[i], 496, y + 20);
      ctx.fillStyle = state.on[i] ? '#34d399' : '#f87171';
      ctx.fillText(state.on[i] ? 'ON' : 'OFF', 684, y + 20);
    }
    ctx.fillStyle = '#8fa7c7';                                 // 两条窗口滑条
    ctx.fillText('缓冲 ' + state.bufMs + 'ms', 488, 214);
    drawSlider(ctx, 488, 220, 214, state.bufMs / 320);
    ctx.fillText('土狼 ' + state.coyMs + 'ms', 488, 252);
    drawSlider(ctx, 488, 258, 214, (state.coyMs - 40) / 160);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('预设（P 或点击）', 488, 296);
    for (i = 0; i < 2; i++) {                                  // 预设按钮
      var py = 304 + i * 34, act = state.preset === i;
      ctx.fillStyle = act ? '#1d3350' : '#16233a'; ctx.fillRect(488, py, 214, 28);
      ctx.strokeStyle = act ? '#4d8fd6' : '#2f4468'; ctx.strokeRect(488, py, 214, 28);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(i === 0 ? '全关（生硬版）' : '全开（顺滑版）', 496, py + 18);
    }
    ctx.fillStyle = '#7d93b3'; ctx.fillText('当前：' + presetName(state), 488, 384);
    ctx.fillText('方向键移动 空格跳 Enter复位', 488, 404);
    ctx.fillText('点左侧场地 = 发一次跳脉冲', 488, 422);
  }
});

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '..' : s; }

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 4) state.log.shift();
}

function resetPlayer(state) {
  state.player = { x: 60, y: 368, vx: 0, vy: 0, onGround: true, groundY: 396, edgeDist: 0, edgePlat: null };
  state.lastKeyT = -1; state.pendingUntil = -1; state.airborneAt = -1;
  state.jumpHold = false; state.jumpCut = false;
  state.anim = [0, 0, 0, 0]; state.slAnim = [0, 0, 0, 0];
  state.msg = ''; state.msgT = 0;
}

function toggle(state, i) {
  state.on[i] = !state.on[i];
  state.preset = -1;
  state.anim[i] = 0.35;
  var nm = ['缓冲', '土狼', '可变跳', '加速'][i];
  pushLog(state, nm + (state.on[i] ? ' ON' : ' OFF'));
}

function setBuf(state, ms) {
  state.bufMs = ms; state.preset = -1; state.slAnim[0] = 0.35;
  pushLog(state, '缓冲窗口 -> ' + ms + 'ms');
}

function cyclePreset(state) {
  state.preset = state.preset < 0 ? 0 : ((state.preset + 1) % 3);
  if (state.preset === 2) {
    state.preset = -1;
    pushLog(state, '预设：自定义（保持当前开关）');
    return;
  }
  applyPresetBtn(state, state.preset);
}

function applyPresetBtn(state, idx) {
  state.preset = idx;
  var cfg = state.presets[idx];
  for (var i = 0; i < 4; i++) { state.on[i] = cfg[i]; state.anim[i] = 0.35; }
  pushLog(state, idx === 0 ? '预设：全关＝生硬版（试试连跳）' : '预设：全开＝顺滑版（缓冲120 土狼100）');
}

function presetName(state) {
  if (state.preset === 0) return '全关·生硬';
  if (state.preset === 1) return '全开·顺滑';
  return '自定义';
}

function doJump(state, v0, tag) {
  var p = state.player;
  p.vy = -v0; p.onGround = false;
  state.jumpHold = true; state.jumpCut = false;
  state.jumps++;
  state.lastKeyT = -1; state.pendingUntil = -1;   // 意图已消费，双双作废
  state.msg = tag; state.msgT = 2.2;
  pushLog(state, tag);
}

function winInfo(state) {                          // 进度环与文字共用的窗口状态
  var p = state.player;
  var rem = state.on[0] ? Math.max(0, Math.round((state.pendingUntil - state.simT) * 1000)) : 0;
  if (p.onGround) return { txt: '落地  缓冲剩 ' + rem + 'ms', col: '#34d399', frac: state.bufMs > 0 ? rem / state.bufMs : 0, c: '#34d399' };
  var air = state.airborneAt < 0 ? 99999 : Math.round((state.simT - state.airborneAt) * 1000);
  if (state.on[1] && air <= state.coyMs) return { txt: '土狼窗内 ' + air + '/' + state.coyMs + 'ms', col: '#fbbf24', frac: 1 - air / state.coyMs, c: '#fbbf24' };
  return { txt: '空中 ' + air + 'ms  窗口已过', col: '#5b7397', frac: 0, c: '#2f4468' };
}

function drawRing(state, ctx) {                    // 小人旁的时间窗进度环
  var p = state.player;
  var cx = p.x + 34, cy = p.y + 2, r = 13;
  var info = winInfo(state);
  ctx.strokeStyle = '#2f4468'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (info.frac > 0) {
    ctx.strokeStyle = info.c;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(info.frac, 0, 1)); ctx.stroke();
  }
  ctx.fillStyle = info.col; ctx.font = '11px monospace';
  ctx.fillText(info.txt, cx + r + 7, cy + 4);
  ctx.font = '12px monospace';
}

function drawSlider(ctx, x, y, w, frac) {
  ctx.strokeStyle = '#4a5f80'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + w, y + 6); ctx.stroke();
  var kx = x + w * clamp(frac, 0, 1);
  ctx.fillStyle = '#9fc3ff'; ctx.fillRect(kx - 3, y, 6, 12);
}

function clickUi(state, input) {
  if (!input.mouse.clicked) return;
  var mx = input.mouse.x, my = input.mouse.y;
  if (!(mx >= 488 && mx <= 702)) return;
  for (var i = 0; i < 4; i++) {                   // 开关行命中
    var y = 36 + i * 40;
    if (my >= y && my <= y + 32) { toggle(state, i); return; }
  }
  if (my >= 218 && my <= 234) {                  // 缓冲滑条：0~320ms，吸附 40
    var f = clamp((mx - 488) / 214, 0, 1);
    state.bufMs = Math.max(40, Math.round(f * 320 / 40) * 40);
    state.preset = -1; state.slAnim[0] = 0.35;
    pushLog(state, '缓冲窗口 -> ' + state.bufMs + 'ms'); return;
  }
  if (my >= 256 && my <= 272) {                  // 土狼滑条：40~200ms，吸附 20
    var g = clamp((mx - 488) / 214, 0, 1);
    state.coyMs = Math.max(40, Math.round((40 + g * 160) / 20) * 20);
    state.preset = -1; state.slAnim[1] = 0.35;
    pushLog(state, '土狼窗口 -> ' + state.coyMs + 'ms'); return;
  }
  for (var j = 0; j < 2; j++) {                  // 预设按钮命中
    var py = 304 + j * 34;
    if (my >= py && my <= py + 28) { applyPresetBtn(state, j); return; }
  }
}`
    },
    {
      type: 'source',
      title: '源码走读：Godot 替你记着哪些账',
      files: [
        { path: 'core/input/input.cpp', note: 'Input 单例的 action_states 哈希表。三处重点：_parse_input_event_impl（882 行起）把每个事件折算进动作缓存；1111-1123 行给 pressed/released 盖上「第几帧」的戳（注释还特别说明输入最早只能在下一个物理 tick 被响应）；is_action_just_pressed（430 行）不过是拿戳和本帧号比对。这就是本课「事件不丢、账在引擎」的实底——所谓缓冲，就是把这张表的消费主动权拿到玩法层。' },
        { path: 'scene/main/viewport.cpp', note: 'push_input（3499 行起）的三段分发：3547 行注释 not a bug, must happen before GUI 定义了 _input → gui → _unhandled 的固定顺序，每一段都先看 is_input_handled()。对照 L7.1：那一课讲事件怎么送到，这一课讲送到之后你拿它做什么——直接扔掉（无缓冲）还是盖章入库（有缓冲）。' },
        { path: 'scene/2d/physics/character_body_2d.cpp', note: 'move_and_slide 的地面账本：79-80 行先把上一帧的 on_floor 存成 was_on_floor 再清零重算；191 行「曾在地面、现在离地且没往上跳」触发 _snap_on_floor（380 行）向下吸附 floor_snap_length；411-413 行按碰撞法线与 floor_max_angle 重新认定 on_floor。官方没有 coyote time 属性，社区做法正是利用这套逐帧刷新的时间差，在 was_on_floor 为真的那几帧里自己记倒计时。' },
        { path: 'scene/main/timer.cpp', note: '最朴素的引擎级窗口参考实现：time_left 每帧递减，归零 emit timeout，one_shot 决定是一次性还是续期（60-68 行），还能选挂 idle 还是 physics 分发（51、71 行的分支）。土狼时间就是一个 one_shot Timer 的思想手写进角色状态机——读懂这 250 行，就理解了所有倒计时窗的数据结构长什么样。' }
      ]
    },
    {
      type: 'text',
      title: '概念三：往引擎层放——这些账该谁记',
      html: `<p>回到三个灵魂拷问，以土狼时间为例做一次完整的架构推演。<b>数据怎么流动：</b>键盘中断产生按下事件 → Input 单例更新动作状态（盖帧号戳）→ 物理帧里 move_and_slide 重算 on_floor → 角色控制器读取 on_floor 的历史与跳跃动作做裁决 → 输出 velocity。缓冲和土狼都是在既有流水线上<b>多加一小段历史</b>：缓冲记住最近一次按跳的时刻，土狼记住最近一次在地面的时刻。</p>
<p><b>所有权归谁：</b>这是最有意思的一问。时间戳存在哪？存全局单例，两个玩家、NPC、回放系统会互相污染；藏进某个函数的局部变量，帧与帧之间传不住。正确答案是<b>角色控制器的实例状态</b>——每个角色一份自己的 lastGroundedTime / jumpBufferTime，随角色创建销毁。Godot 的 action_states 之所以归 Input 单例持有，是因为动作的电平与边沿天然是全局输入事实；而这个动作对这个角色何时有效是角色私有判断——<b>公共事实全局记账，私有容错各扫门前雪</b>。</p>
<p><b>什么时候发生：</b>写（盖章）发生在事件到达时；读（裁决）必须固定在<b>物理帧</b>——放进渲染帧的话，144Hz 显示器上土狼窗会比 60Hz 更容易命中，手感随帧率漂移，这是新手最常踩的坑。至于过期，不需要定时器：比较时刻即可，now − stamp &gt; window 就是一句减法。实验里的 pendingUntil / airborneAt 两个标量，就是这个答案的最小实现。</p>
<p>那么 Godot 为什么不做 coyote time 属性？我认为有两层原因。其一，<b>它是玩法语义而非引擎语义</b>：窗口多少毫秒、哪些动作享受豁免、跳跃后是否清空缓冲，各项目不同，放进引擎就是无穷的参数爆炸。其二，Godot 的哲学是让 servers/节点层提供<b>稳定可靠的底座</b>——事件不丢（Input 记账）、地面判定逐帧一致（was_on_floor 与 snap）、定时机制通用（Timer）——把手感的自由度留给上层。你在实验里写的全部裁决逻辑，翻译成 GDScript 大约三十行，可以直接嫁接到 CharacterBody2D 模板里。</p>`
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: `<ul>
  <li>先按 P 切到<b>全关（生硬版）</b>：从高处起跳，试着在落地<b>前一瞬</b>连按空格——大概率第一跳落空，要再按一次。这就是吞键。再切<b>全开</b>重复同样操作：落地瞬间自动补跳，日志打出「落地前 XXms 按跳 → 缓冲生效」。</li>
  <li>关掉土狼（按 W），贴着平台边缘往外跑并起跳：出沿的那几帧按跳无效。打开土狼再试：日志出现「离台 6Xms 按跳 → 土狼生效」。盯住小人旁的黄色进度环——那就是你的剩余宽限期，它走完之前按跳都算数。</li>
  <li>把缓冲窗口拉到 40ms，你会亲眼看到顺滑如何退化成吃键；再拉到 280ms 以上，体会另一头的副作用：你已经不想跳了，角色却在落地时自作主张补了一跳。<b>窗口不是越大越好，容错过头会偷走玩家的控制感</b>。</li>
  <li>只开可变跳（E）：短按 vs 长按空格，跳高明显两档。关掉它，所有跳跃一个高度——很多游戏手感细腻的名声，主要靠这一件撑起来。</li>
  <li>只开加速曲线（R）：起步有了推背感，急停不再瞬间钉死。四件套彼此正交，随意组合着玩五分钟，你会发现每种搭配都是另一种游戏。</li>
  <li>终极对照：保持全关，强迫自己踩着落地帧按跳，感受玩家在零容错引擎里的处境；然后全开，什么都不改变躺平。两种舒服的来源不同——前者是你的手适应引擎的采样率，后者是引擎的设计适应了你的手。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>回答本课三问。<b>输入丢在哪：</b>丢在玩法代码收到事件后、发现条件不满足就丢弃的那一刻；缓冲与土狼的本质，是把一次性布尔判定改造成带时间窗的宽容判定，代价只是每角色两个浮点数。<b>两个窗口救两种失败：</b>缓冲救玩家提前（输入早于状态就绪），土狼救玩家来晚（状态早于输入截止）——一个记输入的时间戳等地面对齐，一个记地面的时间戳等输入追上，方向恰好相反。<b>该放哪层：</b>公共输入事实归引擎（Godot 的 action_states 用帧号戳实现了零成本的 just_pressed），容错窗口归角色控制器实例状态，裁决固定在物理帧。</p>
<p>最后一个视角：这四件套全是欺骗。玩家以为是自己反应好、压帧准，其实是引擎在窗口期内悄悄补了作业。但这种欺骗是善意的工程——它把机器的精确时刻翻译成人类的可感知时刻。下一课 H2（打击感三件套）会把同样的思想用到时间的另一个维度：hit-stop 骗的是这零点几秒不存在。</p>`
    }
  ]
}
