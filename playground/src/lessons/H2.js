// H2 · 打击感三件套：hit-stop、震屏、闪白
export default {
  id: 'H2',
  title: '打击感三件套：hit-stop、震屏、闪白',
  est: '2 小时',
  coreQuestions: [
    '顿帧为什么必须让「整个世界」停下来，而不是只把攻击动画放慢？',
    '震屏的偏移为什么要沿打击方向并随时间衰减——各轴独立随机乱抖错在哪？',
    '受击闪白该用乘色还是加色？它的衰减由玩法代码驱动，还是交给引擎补间？',
    '三件套同时触发时抢的是同一份状态吗？谁拥有这份状态、按哪条时间基准走？'
  ],
  sections: [
    {
      type: 'text',
      title: '打击感不是美术问题，是时间调度问题',
      html: '<p>先做一个思想实验。同一个挥拳动画、同一张受击贴图、同一个音效，素材一个都不改，只做一件事：<b>命中瞬间把整个世界的模拟冻结 80 毫秒</b>。玩家立刻会觉得「这一拳变重了」。这就是打击感最反直觉的地方——它往往<b>不是素材质量问题，而是时间调度问题</b>：你改变的不是画面内容，而是画面被呈现的时间分布。</p><p>拆开看，成熟的动作游戏在命中那一刻几乎总会同时做三件事，它们分别调制三种不同的感官量：</p><table><tr><th>层</th><th>调制的是什么</th><th>典型参数</th><th>失败的样子</th></tr><tr><td><b>① hit-stop 顿帧</b></td><td>时间：全局模拟冻结若干真实毫秒</td><td>轻击 40~60 ms，重击 90~140 ms</td><td>只冻攻击者不冻受击者，拳头「穿过」敌人</td></tr><tr><td><b>② camera shake 震屏</b></td><td>空间：相机沿打击方向偏移并衰减</td><td>幅度 4~12 px，频率 20~35 Hz</td><td>各轴等幅随机乱抖，像信号不良的电视</td></tr><tr><td><b>③ hit flash 闪白</b></td><td>色彩：受击 sprite 亮度脉冲快速回落</td><td>峰值满值，时长 60~120 ms</td><td>衰减太慢，角色一直发光像在回血</td></tr></table><p>三层的共同纪律是<b>快进快出</b>：上升沿在一帧内完成（从基线直接跳到峰值，不留过渡），下降沿用曲线快速回到基线。人对「突发」的注意捕获极强，但对「持续异常」适应极快——同样一次闪白，改成 200 ms 淡入再 200 ms 淡出，玩家的感受就从「打到了」变成「屏幕坏了」。</p><p>还有一条更重要的纪律：<b>这三层全都是表现层的调制，不允许反过来触碰玩法层的判定结果</b>。顿帧期间伤害早已结算、碰撞盒依然存在，只是「推进世界」这个动作被暂停了。一旦让反馈影响判定（比如在顿帧里偷偷多算一次伤害），手感就再也调不准了——因为你无法区分玩家感受到的重量有多少来自真实物理、多少来自你打的补丁。</p>'
    },
    {
      type: 'text',
      title: '一、hit-stop：冻结的是「模拟」，不是「时钟」',
      html: '<p>顿帧有两条实现路线，效果差别巨大。</p><p><b>路线 A：缩放时间。</b>把引擎的全局时间倍率设成 0.1，跑一会儿再恢复。听起来优雅，实际有三个坑。第一，非整数倍率会让固定步长的物理采样变得不均匀，解冻时经常出现一次「补步」抖动。第二，所有依赖 dt 的系统一起变慢——UI 动画、输入缓冲计时器、网络心跳全中招，你得逐个把它们排除出去。第三，也是最致命的：<b>0.1 倍速下角色仍在缓慢移动</b>，攻击者和受击者会慢慢滑开，那种「钉在一起」的凝滞感消失了。</p><p><b>路线 B：冻结模拟。</b>真实时钟继续走，但<b>跳过接下来若干真实毫秒里的世界推进</b>：不积分、不解算、不推进动画，只更新反馈层自己。这是绝大多数动作游戏的实际做法。它天然保证「双方都停」，也天然保证「停下时什么都不动」——而<b>纹丝不动正是重量感的来源</b>。</p><pre>每帧：\n  realDt = 真实经过时间\n  if freezeLeft &gt; 0:\n      freezeLeft -= realDt * 1000     // 单位毫秒，按真实时间消耗\n      只更新反馈层（震屏衰减、闪白衰减）\n      return                          // 世界一步都不走\n  else:\n      正常推进世界(dt)</pre><p>注意那个关键细节：<b>冻结剩余时间是按真实毫秒消耗的，不是按游戏帧数</b>。「冻结 5 帧」在 60 fps 下是 83 ms，在 144 fps 下只有 35 ms——同一段连招在高刷屏上打击感会莫名变弱，而且你查不出原因。所以参数必须写成毫秒，再换算成要跳过的帧数。</p><p>另一个必须处理的边界是<b>顿帧期间的输入</b>。玩家在冻结里按下的下一段攻击既不能丢，也不能立即生效（那会让顿帧形同不存在）。标准做法是把输入塞进短队列，解冻后第一帧消费——这正是上一课 H1 讲的输入缓冲窗口在此处的用武之地：<b>hit-stop 制造了一段必然存在的输入延迟，input buffer 负责把它吸收掉</b>。两节课在这里咬合成一个闭环。</p>'
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'hitfeedback',
      title: '实验：连击沙盘 —— 三件套开关与衰减观察台',
      height: 620,
      code: `// 打击感三件套沙盘：主角出拳打木桩，右侧三件套独立开关 + 参数滑杆
// J 或 空格：出拳（连按可打出三段连击，第三段为重击，三层同时放大）
// 数字键 1/2/3：切换 顿帧 / 震屏 / 闪白 三个开关
// Q W E：选中顿帧 / 震屏组 / 闪白组；左右方向键微调，也可直接鼠标点画布上的滑杆
// P：循环预设（全关软绵绵 / 只开顿帧 / 只开震屏 / 三件套全开）
// R：重置木桩血量与统计
// 左下角三条状态条实时显示各自的衰减；面板显示当前冻结剩余毫秒

engine.run({
  setup: function (state) {
    state.hero = { x: 150, anim: 0, combo: 0, comboT: 0, punching: false, struck: false };
    state.pug = { x: 400, hp: 100, maxhp: 100, knock: 0 };   // knock 是纯表现层的退让
    state.freezeLeft = 0;          // 顿帧剩余（真实毫秒）
    state.shakeAmp = 0;            // 震屏当前振幅（px）
    state.flash = 0;               // 闪白当前强度 0~1
    state.hitDir = 1;              // 本击的打击方向（左->右为正）
    state.camX = 0; state.camY = 0;
    state.on = { stop: true, shake: true, flash: true };
    state.par = { stop: 90, amp: 9, decay: 26, flash: 0.9 };  // ms / px / Hz / 0~1
    state.sel = 0;                 // 0 顿帧 1 震屏 2 闪白
    state.presets = [
      { name: '全关（软绵绵）', on: { stop: false, shake: false, flash: false } },
      { name: '只开顿帧', on: { stop: true, shake: false, flash: false } },
      { name: '只开震屏', on: { stop: false, shake: true, flash: false } },
      { name: '三件套全开', on: { stop: true, shake: true, flash: true } }
    ];
    state.preset = 3;
    state.hits = 0; state.dmgTotal = 0;
    state.ring = [];               // 命中火花环：{x,y,r}
    state.seed = 7;                // 自带种子 RNG（震屏的高频扰动项）
    state.noiseT = 0;
    state.msg = '按 J 出拳，连按三次打出重击'; state.msgT = 6;
  },

  update: function (state, dt, input) {
    var i;
    // —— 反馈层永远吃真实时间（即使世界已被冻结）——
    state.noiseT += dt;
    if (state.shakeAmp > 0) state.shakeAmp = Math.max(0, state.shakeAmp - dt * state.par.decay);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 8.5);
    for (i = state.ring.length - 1; i >= 0; i--) {
      state.ring[i].r += dt * 220;
      if (state.ring[i].r > 46) state.ring.splice(i, 1);
    }
    state.msgT -= dt;

    // —— 输入处理：顿帧期间依然响应（H1 输入缓冲在此接力）——
    if (input.pressed('Digit1')) { state.on.stop = !state.on.stop; setMsg(state, '顿帧 ' + (state.on.stop ? '开' : '关')); }
    if (input.pressed('Digit2')) { state.on.shake = !state.on.shake; setMsg(state, '震屏 ' + (state.on.shake ? '开' : '关')); }
    if (input.pressed('Digit3')) { state.on.flash = !state.on.flash; setMsg(state, '闪白 ' + (state.on.flash ? '开' : '关')); }
    if (input.pressed('KeyQ')) state.sel = 0;
    if (input.pressed('KeyW')) state.sel = 1;
    if (input.pressed('KeyE')) state.sel = 2;
    if (input.pressed('KeyP')) {
      state.preset = (state.preset + 1) % state.presets.length;
      state.on.stop = state.presets[state.preset].on.stop;
      state.on.shake = state.presets[state.preset].on.shake;
      state.on.flash = state.presets[state.preset].on.flash;
      setMsg(state, '预设：' + state.presets[state.preset].name);
    }
    if (input.pressed('KeyR')) { state.pug.hp = state.pug.maxhp; state.hits = 0; state.dmgTotal = 0; setMsg(state, '已重置'); }
    if (input.down('ArrowRight')) nudge(state, 1);
    if (input.down('ArrowLeft')) nudge(state, -1);
    if (input.mouse.clicked) clickSlider(state, input.mouse.x, input.mouse.y);

    // —— ① 冻结闸门：世界是否推进的唯一分岔口 ——
    applyCamera(state);
    if (state.freezeLeft > 0) {
      state.freezeLeft -= dt * 1000;           // 按真实毫秒消耗，不是按帧
      if (state.freezeLeft < 0) state.freezeLeft = 0;
      return;                                  // 世界一步都不走
    }

    // —— ② 正常推进世界 ——
    if (input.pressed('KeyJ') || input.pressed('Space')) tryPunch(state);
    if (state.hero.punching) {
      state.hero.anim += dt * 13;
      if (!state.hero.struck && state.hero.anim >= 0.34) { state.hero.struck = true; landHit(state); }
      if (state.hero.anim >= 1) { state.hero.punching = false; state.hero.anim = 0; }
    }
    if (state.hero.comboT > 0) { state.hero.comboT -= dt; if (state.hero.comboT <= 0) state.hero.combo = 0; }
    state.pug.knock *= 0.86;                   // 退让自己收回去（表现层）
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.save();
    ctx.translate(-state.camX, -state.camY);   // 震屏只作用于绘制变换，世界坐标保持干净
    ctx.fillStyle = '#111c2c'; ctx.fillRect(0, 340, engine.W, 100);
    ctx.strokeStyle = '#233450'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 340); ctx.lineTo(engine.W, 340); ctx.stroke();
    // 木桩：受击闪白 = 叠一层快速衰减的高透明度白（近似加色）
    var px = state.pug.x + state.pug.knock;
    ctx.fillStyle = '#3b2f22'; ctx.fillRect(px - 22, 250, 44, 90);
    ctx.fillStyle = '#5a4630'; ctx.fillRect(px - 22, 250, 44, 10);
    if (state.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (state.flash * 0.95).toFixed(3) + ')';
      ctx.fillRect(px - 22, 250, 44, 90);
    }
    ctx.strokeStyle = '#7d93b3'; ctx.lineWidth = 1; ctx.strokeRect(px - 22, 250, 44, 90);
    for (i = 0; i < state.ring.length; i++) {   // 命中火花环
      var g = 1 - state.ring[i].r / 46;
      ctx.strokeStyle = 'rgba(251,191,36,' + (g * 0.85).toFixed(2) + ')'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(state.ring[i].x, state.ring[i].y, state.ring[i].r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
    // 主角与手臂伸展
    var h = state.hero;
    var ext = h.punching ? Math.sin(Math.min(1, h.anim) * Math.PI) : 0;
    ctx.fillStyle = '#2f6fb5'; ctx.fillRect(h.x - 14, 268, 28, 72);
    ctx.fillStyle = '#60a5fa'; ctx.fillRect(h.x - 4 + ext * 34, 288, 26, 10);
    ctx.beginPath(); ctx.arc(h.x, 256, 13, 0, Math.PI * 2); ctx.fillStyle = '#dbeafe'; ctx.fill();
    ctx.restore();

    // 冻结期间的整屏染色（提示「世界停了」）
    if (state.freezeLeft > 0) {
      ctx.fillStyle = 'rgba(251,191,36,0.10)'; ctx.fillRect(0, 0, 498, engine.H);
      ctx.fillStyle = '#f59e0b'; ctx.font = '12px monospace';
      ctx.fillText('SIMULATION FROZEN', 12, 22);
    }
    // 左下角三条衰减状态条
    var bars = [
      { t: '冻结剩余', v: state.freezeLeft / 200, c: '#f59e0b', s: state.freezeLeft.toFixed(0) + ' ms' },
      { t: '震屏振幅', v: state.shakeAmp / 24, c: '#4d8fd6', s: state.shakeAmp.toFixed(1) + ' px' },
      { t: '闪白强度', v: state.flash, c: '#e2e8f0', s: state.flash.toFixed(2) }
    ];
    for (i = 0; i < 3; i++) {
      var by = 356 + i * 24;
      ctx.fillStyle = '#8fa7c7'; ctx.font = '12px monospace';
      ctx.fillText(bars[i].t, 12, by + 10);
      ctx.fillStyle = '#16233a'; ctx.fillRect(84, by, 150, 12);
      ctx.fillStyle = bars[i].c; ctx.fillRect(84, by, 150 * clamp01(bars[i].v), 12);
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(bars[i].s, 242, by + 10);
    }
    ctx.fillStyle = state.msgT > 0 ? '#fbbf24' : '#5b7397'; ctx.font = '12px monospace';
    ctx.fillText(state.msg, 12, 340);
    ctx.fillStyle = '#7d93b3';
    ctx.fillText('HP ' + state.pug.hp + '/' + state.pug.maxhp + '   连击段 ' + (state.hero.combo || 0), 12, 320);

    // —— 右侧控制面板 ——
    ctx.fillStyle = '#0e1725'; ctx.fillRect(498, 0, 222, engine.H);
    ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1; ctx.strokeRect(498.5, 0.5, 221, engine.H - 1);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#9b8cff'; ctx.fillText('三件套开关', 512, 24);
    var names = ['1 顿帧 hit-stop', '2 震屏 shake', '3 闪白 flash'];
    var flags = [state.on.stop, state.on.shake, state.on.flash];
    for (i = 0; i < 3; i++) {
      ctx.fillStyle = flags[i] ? '#34d399' : '#475569';
      ctx.fillText((flags[i] ? '[ON ] ' : '[OFF] ') + names[i], 512, 48 + i * 22);
    }
    ctx.fillStyle = '#9b8cff'; ctx.fillText('参数（Q/W/E 选择）', 512, 124);
    var rows = [
      { t: '顿帧时长 ms', v: state.par.stop, min: 0, max: 200, k: 'stop', sel: 0 },
      { t: '震屏幅度 px', v: state.par.amp, min: 0, max: 24, k: 'amp', sel: 1 },
      { t: '震屏衰减 Hz', v: state.par.decay, min: 5, max: 60, k: 'decay', sel: 1 },
      { t: '闪白强度', v: state.par.flash, min: 0, max: 1, k: 'flash', sel: 2 }
    ];
    for (i = 0; i < 4; i++) {
      var y = 146 + i * 44;
      ctx.fillStyle = rows[i].sel === state.sel ? '#fbbf24' : '#8fa7c7';
      ctx.fillText(rows[i].t + ' = ' + fmt(rows[i].v), 512, y);
      ctx.fillStyle = '#1e2a3d'; ctx.fillRect(512, y + 8, 180, 6);
      var f = (rows[i].v - rows[i].min) / (rows[i].max - rows[i].min);
      ctx.fillStyle = rows[i].sel === state.sel ? '#f59e0b' : '#4d8fd6';
      ctx.fillRect(512, y + 8, 180 * clamp01(f), 6);
      rows[i]._y = y + 8;                      // 记下位置供点击命中测试
    }
    state.rows = rows;
    ctx.fillStyle = '#9b8cff'; ctx.fillText('预设 (P)', 512, 336);
    ctx.fillStyle = '#fbbf24'; ctx.fillText('> ' + state.presets[state.preset].name, 512, 358);
    ctx.fillStyle = '#7d93b3'; ctx.font = '11px monospace';
    ctx.fillText('J/空格 出拳 · 点滑杆或左右键', 512, 384);
    ctx.fillText('命中 ' + state.hits + ' · 总伤害 ' + state.dmgTotal, 512, 402);
  }
});

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

function clampRange(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function fmt(v) {
  if (Math.abs(v) >= 10) return String(Math.round(v));
  return v.toFixed(2);
}

function setMsg(state, s) { state.msg = s; state.msgT = 5; }

// 按当前选中的组微调参数：顿帧 5ms / 震屏 1.2px 与 2Hz / 闪白 0.03
function nudge(state, d) {
  var p = state.par;
  if (state.sel === 0) p.stop = clampRange(p.stop + d * 5, 0, 200);
  else if (state.sel === 1) {
    p.amp = clampRange(p.amp + d * 1.2, 0, 24);
    p.decay = clampRange(p.decay + d * 2, 5, 60);
  } else p.flash = clampRange(p.flash + d * 0.03, 0, 1);
}

function clickSlider(state, mx, my) {
  var rows = state.rows;
  if (!rows) return;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (my > r._y - 14 && my < r._y + 16 && mx > 505 && mx < 700) {
      state.sel = r.sel;
      state.par[r.k] = r.min + clamp01((mx - 512) / 180) * (r.max - r.min);
      return;
    }
  }
}

// 定向衰减振荡：主轴对齐打击方向，垂直分量弱，另加少量种子扰动
function applyCamera(state) {
  if (state.shakeAmp <= 0) { state.camX = 0; state.camY = 0; return; }
  var a = state.shakeAmp;
  var ph = state.noiseT * 46;
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  var jit = (state.seed / 4294967296 - 0.5) * 2;
  state.camX = Math.sin(ph) * a * state.hitDir + jit * a * 0.22;
  state.camY = Math.cos(ph * 1.37) * a * 0.34 + jit * a * 0.14;
}

function tryPunch(state) {
  var h = state.hero;
  if (h.punching) return;
  h.combo = h.comboT > 0 ? Math.min(3, h.combo + 1) : 1;
  h.comboT = 0.42;                             // 连击窗口：解冻后的输入在这里被接住
  h.punching = true; h.struck = false; h.anim = 0;
}

// 命中事件：唯一事实源。三路分发，共用同一个强度系数 mul
function landHit(state) {
  var heavy = state.hero.combo >= 3;
  var dmg = heavy ? 18 : 7;
  var mul = heavy ? 1.6 : 1;
  state.pug.hp = Math.max(0, state.pug.hp - dmg);
  state.hits++; state.dmgTotal += dmg;
  state.hitDir = 1;
  if (state.on.stop) state.freezeLeft = state.par.stop * mul;
  if (state.on.shake) state.shakeAmp = Math.max(state.shakeAmp, state.par.amp * mul);
  if (state.on.flash) state.flash = Math.max(state.flash, state.par.flash);
  state.pug.knock = 12 * mul;
  state.ring.push({ x: state.pug.x - 24, y: 292, r: 6 });
  if (heavy) setMsg(state, '重击！顿帧 ' + Math.round(state.par.stop * mul) + ' ms');
}`
    },
    {
      type: 'text',
      title: '读实验结果：四个必须亲手拧出来的结论',
      html: '<p>先把 <code>P</code> 按到「全关（软绵绵）」，打一套三段连招；再切到「三件套全开」重复一次。<b>素材完全相同</b>，唯一的区别是时间的分配方式。这一步做完，「打击感是时间调度问题」就不再是一句口号，而是你的肌肉记忆。</p><ol><li><b>顿帧时长往右拧过头</b>（拉到 200 ms 附近）：重量感会在越过某个阈值后瞬间变质成「卡顿」。玩家会以为实验台掉帧了——因为冻结和掉帧在观感上其实是同一件事，区别只在于<b>它是可预期且每次都一致的</b>。</li><li><b>震屏衰减拖到 5 Hz</b>：画面变成慢悠悠的摇摆，像相机被人推了一把，玩家会怀疑是自己的操作失误。推到 60 Hz 则只剩毛刺和晕眩。中间那段 20~35 Hz 才是「被打到」的频段。</li><li><b>只开震屏、关掉顿帧</b>：画面在抖、世界却没停，抖动的每一帧都能看到拳头继续往前穿——<b>没有停顿做锚，震动就变成了噪声</b>。这解释了为什么「震屏必须有顿帧托着」几乎是行业共识。</li><li><b>只开顿帧、关掉其余两件</b>：世界停了，但停得毫无来由，玩家不知道是什么让它停的。顿帧提供重量，闪白提供「停的原因」，震屏提供「力的方向」——三者是互补的证据链，不是三份同类刺激。</li></ol><p>顺便盯一下左下角三条状态条的<b>归零顺序</b>：默认参数下闪白最先退场、震屏最后收尾、顿帧最短促。这不是巧合，而是经验配比——若震屏比顿帧长太多，你会在静止的画面上看到持续晃动，那种「世界停了镜头还在抖」非常廉价。</p>'
    },
    {
      type: 'text',
      title: '二、震屏：方向性 + 包络 + 频率，缺一不可',
      html: '<p>震屏最容易写错的形态，是「给相机的 x/y 各加一个随机数」。那样出来的东西像故障电视：眼睛找不到任何线索，长时间盯着诱发晕眩，而且<b>彻底丢失了信息</b>——玩家看不出这一击从哪个方向来。正确的震屏是一条<b>带方向的衰减振荡</b>，三个要素各司其职：</p><ul><li><b>方向</b>：主轴对齐打击向量（归一化后决定符号与权重）。一拳从左面打来，画面就往左沉一下；玩家即使不看特效，也能凭镜头倾向判断受击方位。次要轴给一个明显更小的权重（本课实验里垂直分量约为主轴的三分之一），完全等幅的双轴抖动反而显得机械。</li><li><b>包络</b>：振幅随时间<b>单调衰减</b>，线性（简单可控）或指数（更自然）都行。硬约束是初始值就是最大值，中途绝不反弹变大——中途变大等于告诉玩家「又挨了一下」。</li><li><b>频率</b>：20~35 Hz。太低像被推，太高接近刷新率的感知极限，只剩不适。</li></ul><pre>shake.t += dt\noffset = dir * amp(t) * sin(2 * PI * freq * t)\namp(t) = amp0 * (1 - t / duration)         // 线性包络，t &gt;= duration 归零</pre><p>还有一个工程上的硬约束：<b>偏移只能作用在渲染变换上，绝不能写进实体的世界坐标</b>。一旦混进 position，物理、AI、寻路、网络同步读到的都是被污染的数据，你会得到「明明瞄准了却没打到」这类最难定位的 bug。正确姿势是在视图矩阵（2D 里就是绘制前的 translate）上加偏移，世界数据始终干净——回头看实验代码，camX 与 camY 只在 ctx.translate 处出现了一次，hero.x 与 pug.x 从未被碰过。</p><p>最后是<b>可访问性</b>：前庭功能敏感的玩家会被强震屏诱发恶心，商业游戏必须提供震屏强度总开关甚至关闭项。把振幅做成参数而非常量，成本几乎为零，收益是能过平台审核。</p>'
    },
    {
      type: 'text',
      title: '三、闪白：加色脉冲，以及谁来驱动它的衰减',
      html: '<p>受击闪白的本质是<b>一次亮度脉冲</b>：把 sprite 的最终颜色推向白色，然后快速回落。技术上它有三种写法，视觉性格完全不同：</p><table><tr><th>写法</th><th>公式</th><th>观感</th><th>适用</th></tr><tr><td>乘色 modulate</td><td>color × tint</td><td>变暗或整体变色，很难真正变白</td><td>染色、致盲压暗</td></tr><tr><td>加色 add</td><td>color + white × k</td><td>从亮部开始泛白，最接近「被打到发光」</td><td>受击闪白首选</td></tr><tr><td>插值 mix</td><td>lerp(color, white, k)</td><td>均匀变白，暗部也被拉起来</td><td>剪影、能量体、死亡溶解</td></tr></table><p>为什么闪白普遍不用现成的 modulate？因为它是<b>乘法</b>：一张偏暗的贴图乘以 2.0，也只是「暗部亮一点的暗」，得不到干脆的白。Godot 的 CanvasItem 提供了两个乘色通道——modulate 沿父链逐级相乘、self_modulate 只作用于自身——如果只用 modulate 做闪白，你还得小心别把整棵子树一起染白。想干净地只让这一只怪发白，正解是给它一份独立材质，把 flash 强度作为一个 uniform 传进去做加色，也就是下一课 H4 的主题。</p><p>衰减曲线比技术选型更重要。<b>上升沿必须是 0 帧</b>：命中那一帧直接给满，不要 lerp 上去——半帧的迟疑就会把「啪」变成「嗡」。回落推荐非线性：<b>k(t) = k0 × (1 − t/T)^2</b> 或指数衰减，视觉上比线性更「脆」。T 一般 60~120 ms，超过 200 ms 玩家不再认为是受击，而认为角色在发光。</p><p>那么衰减由谁驱动？两条路：<b>玩法代码每帧手改颜色</b>（控制精细，可按部位、按连击段数改强度），或者<b>交给引擎的补间 / 材质动画</b>（省事，自动跟随时间系统）。真正的坑在于两者可能<b>走不同的时间基准</b>：如果闪白用的是被 time_scale 缩放的补间，而 hit-stop 用的是冻结模拟，世界停了白光却还在慢慢退，解冻那一刻玩家看到的是「已经快退完的白」，冲击感直接泄掉。所以三件套必须<b>共享同一条时间基准</b>：要么全都吃真实时间（unscaled），要么全都吃缩放时间，绝不能一半一半。</p>'
    },
    {
      type: 'text',
      title: '四、叠加顺序：一个事件，三路分发，互不读取',
      html: '<p>三件套各自成立之后，还要管它们的<b>合成结构</b>。因果链应当是这样一条单向流：</p><pre>命中判定（玩法层，唯一事实源）\n   |  产出一个描述性事件：{ 位置, 方向, 强度系数 }\n   +--&gt; hit-stop：freezeLeft = 基础时长 * mul\n   +--&gt; 震屏    ：amp = 基础幅度 * mul，dir = 事件方向\n   +--&gt; 闪白    ：flash = 基础强度 * mul，目标 = 受击者</pre><p>关键在于<b>三个反馈都只从同一个命中事件取参数，彼此不读取对方的状态</b>。如果让震屏去读闪白、闪白去读冻结剩余，你就造出了一个三角耦合：任何一个参数的改动都会以不可预测的方式影响另外两个，调参过程立刻失控。同理，重击与轻击的差异应当体现在<b>事件的强度系数这一个乘数</b>上（实验里的 mul），而不是给每个反馈单独写一套「重击专用参数」——前者只有一个旋钮，后者有三个会互相打架的旋钮。</p><p>还要注意<b>写入语义</b>：三者的初始化都是「取较大值」（<code>amp = max(amp, new)</code>、<code>flash = max(flash, new)</code>），而不是覆盖或累加。覆盖会让连续命中把已经拉起的震屏突然抹小；累加则会在高连击段数下爆掉屏幕。取最大值给出的是「本次命中至少有这么响」的下界语义，天然稳定。</p><p>最后一笔总账：<b>打击感的成本几乎全是「少做的事」</b>。顿帧不做＝软；震屏不做＝平；闪白不做＝糊。但三件全开且参数贪大（200 ms 冻结 + 20 px 震屏 + 300 ms 闪白）就变成了卡顿、眩晕、闪光弹。真正的手感打磨，是把三条曲线同时往回收，直到只剩「刚好能察觉」的量。</p>'
    },
    {
      type: 'source',
      title: '源码走读：引擎给了哪些底座，没给哪些',
      files: [
        { path: 'core/config/engine.h', note: '搜 time_scale。看 _time_scale、_game_time_scale、_user_time_scale 三个字段，外加独立的 freeze_time_scale 布尔，以及 get_effective_time_scale 与 get_unfrozen_time_scale 这一对读数接口。这里是本课论点的第一处铁证：引擎自己就把「缩放」和「冻结」分成两套 API，并且冻结时对外返回 0.0。' },
        { path: 'core/config/engine.cpp', note: '搜 _update_time_scale（文件开头不远）与 set_freeze_time_scale。注意缩放时一并被乘的还有 user_ips 与 max_user_physics_steps_per_frame：time_scale 牵动的不只是 delta，还有固定步长的采样密度——这正是拿它做 hit-stop 会引入补步抖动的根源。' },
        { path: 'main/main.cpp', note: '在 Main::iteration 里搜 time_scale。你会看到它只在几处被乘进去：physics_step * time_scale 与 process_step * time_scale。也就是说把倍率调到极小，节点回调依然每帧触发、只是拿到一个很小的 delta，而不是「不调用」——真停顿要靠 SceneTree.paused 或自己的逻辑门。' },
        { path: 'scene/main/scene_tree.cpp', note: '搜 process_tweens。看它如何在当帧 delta 与 unscaled_delta 之间挑选，依据是 tween 自己的 is_ignoring_time_scale()。这条分支就是「反馈层要有自己的时钟」在引擎里的落点，也是闪白与顿帧会不会脱节的决定性代码。' },
        { path: 'scene/main/canvas_item.cpp', note: '搜 set_modulate 与 get_modulate_in_tree。前者带一个 early-out（值相同就直接返回，不下发 RenderingServer），后者沿父链逐级相乘。对照理解：闪白若走 modulate，会传染给整棵子树，而且是乘色、得不到干脆的白。' },
        { path: 'servers/rendering/renderer_canvas_cull.cpp', note: '搜 modulate 相乘的那一行（Color modulate = ci->modulate * p_modulate），以及紧随其后的 alpha 近零提前 return。可见 2D 的颜色调制发生在 CPU 裁剪阶段、逐层累乘，且 alpha 参与剔除决策——所以绝不要用「压 alpha」去做受击表现。' }
      ]
    },
    {
      type: 'text',
      title: '读完源码要带走的三句话',
      html: '<p><b>第一句：引擎的 time_scale 是「缩放」，不是「停顿」。</b>从 main.cpp 能看到，它只是乘进 physics_step 与 process_step，回调照常每帧触发。想做教科书意义的 hit-stop，路径有三条：把倍率设成极小值（近似停顿，但吃补步抖动）、用 SceneTree.paused（真停顿，但要自己放行反馈层）、或者在自己的主循环里加一道冻结计数器闸门（本课实验的做法，也是多数动作游戏的做法）。第三条最朴素，却恰好给了你最想要的两件事：<b>世界纹丝不动，反馈照常衰减</b>。</p><p><b>第二句：2D 的色彩调制是 CPU 侧的逐层累乘，天生不适合做局部闪白。</b>CanvasItem 的 modulate 会沿父链传染，self_modulate 只管自己，两者都是乘法；而裁剪阶段的累乘还会把 alpha 用于剔除判断。想要「只有这只怪发白」，正解是一份独立材质加一个强度 uniform——把闪白当作材质参数，而不是节点颜色。</p><p><b>第三句：反馈层要有自己的时钟。</b>scene_tree.cpp 里那句 is_ignoring_time_scale() 揭示了一个通用原则：凡是「报告游戏状态」的东西——震屏、闪白、UI 提示、音效起振——都需要在被冻结或被缩放的世界时间之外，另开一条通道。Godot 的 Timer 与 Tween 都提供了这个选项，本质是在说：<b>世界的时间和我自己的时间，不必是同一个</b>。这也预告了 H3 的核心议题。</p>'
    },
    {
      type: 'text',
      title: '三个灵魂拷问',
      html: '<p><b>数据怎么流动？</b>命中判定是唯一的事实源，它产出一个描述性的事件（位置、方向、强度系数），三路分发到顿帧、震屏、闪白；三者互不读取彼此的状态，只在渲染前汇聚成「冻结闸门 + 相机偏移 + 颜色调制」。反馈永远排在判定的下游，绝不回流。</p><p><b>所有权归谁？</b>冻结剩余时长属于<b>全局模拟调度器</b>（只有一份，影响所有实体）；震屏的振幅与相位属于<b>相机</b>；闪白强度属于<b>受击者自己</b>（每个 sprite 一份，随它销毁而消失）。搞混这三处归属就会出现经典事故：把闪白挂在主角身上，于是每次被打都是主角在发光。</p><p><b>什么时候发生？</b>全部在<b>命中判定成立的那一帧</b>同步写入峰值（0 帧上升沿），此后每帧按<b>真实时间</b>衰减——不受 time_scale 影响，也不在后台线程。冻结的消耗发生在世界推进之前，是一道闸门，而不是一个定时器。</p>'
    },
    {
      type: 'text',
      title: '试一试（课内可选）',
      html: '<ul><li>把 <b>闪白强度</b>滑杆拉到 1，再把 <b>顿帧时长</b>设为 0：只看白闪你能感到「打到了」，却完全没有重量。反过来只留顿帧、关掉另两件：世界停了，却说不清为什么停。逐件拆解，就能看清每一层各自负责哪一种证据。</li><li>把 <b>震屏幅度</b>拉到 24 px 并连打三段：观察它在高连击下是否已经变成干扰。再把 <b>衰减 Hz</b>拉到最大，比较「大幅快衰」与「小幅慢衰」哪种更像重击——通常是前者。</li><li>改一行代码：把 <code>applyCamera</code> 里 camX 的计算改成纯粹的两轴独立随机（去掉那条 Math.sin 方向主轴），亲眼看一次「故障电视」是什么味道。</li><li>进阶改造：把 <code>landHit</code> 里的木桩退让 knock 挪进冻结闸门<b>之内</b>（即解冻后才推进），对比受击退让发生在顿帧期间与顿帧之后，两种手感差多少——这个差异就是「反馈层是否与世界共享时间」最直观的体现。</li></ul>'
    },
    {
      type: 'text',
      title: '小结',
      html: '<p>这一课把「打击感」从一个玄学形容词拆成了三条可调曲线，并给出它们共同的纪律：</p><ul><li><b>顿帧冻的是模拟，不是时钟</b>；参数必须写成真实毫秒，否则高刷屏上手感会莫名变味。</li><li><b>震屏是带方向的衰减振荡</b>：20~35 Hz、只作用于渲染变换、必须有强度开关。</li><li><b>闪白是 0 帧上升沿 + 快速回落的加色脉冲</b>，60~120 ms 内退干净；乘色做不到它。</li><li><b>三者从同一个命中事件取参、共享同一条时间基准、彼此不耦合</b>，写入语义统一为「取最大值」。</li></ul><p>回头看主线：L1.1 的时间步长实验台里，dt 是要被严格守住的量；这一课你看到了它的另一面——<b>故意违背时间的连续性，正是手感的来源</b>。而 L5.2 那次冲量求解产生的接触与穿透，在本课变成了「命中事件」的来源：物理告诉你「打到了」，反馈层决定「看起来有多重」。上一课 H1 的输入缓冲则在顿帧里找到了它的第二个客户——停顿制造的输入延迟，必须由缓冲窗口吸收。</p><p>下一课 H3 我们把时间系统本身摊开：子弹时间、时停、慢镜，以及「每个实体自己的时钟」该怎么搭。今天你已经用过它的一个特例了。</p>'
    }
  ]
}