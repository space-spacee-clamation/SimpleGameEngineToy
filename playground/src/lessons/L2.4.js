// L2.4 · 脚本如何驱动 C++：GDScript VM 与绑定层
export default {
  id: 'L2.4',
  title: '脚本如何驱动 C++：GDScript VM 与绑定层',
  est: '2.5 小时',
  coreQuestions: [
    '一行 player.take_damage(10)，从字节码取指令到 C++ 函数执行，途中经过哪几站？成本集中在哪？',
    '同一句调用，静态类型标注与不标注，走的竟是两条成本差一截的分发路径——编译器把哪几步提前付掉了？',
    '一次调用里有三种时间尺度：编译一次 / 每次调用一次 / 每条指令一次——性能账为什么必须分开算？',
    '调用在飞的过程里所有权归谁：VM 栈帧谁分配谁回收，参数和返回值在边界上经历了什么？'
  ],
  sections: [
    {
      type: 'text',
      title: '衔接：把镜头从「登记处」切到「运行时」',
      html: `<p>L2.2 讲的是<b>静态账本</b>：启动时宏注册把每个 C++ 方法包成 MethodBind 登记进 ClassDB，Variant 作为跨语言货币，信号做解耦通知。那一课结尾留了条链路「脚本按名字查表、拆箱、转调」——这一课就让一次真实的 GDScript 调用<b>从头到尾穿透一遍</b>：你写的每个 <code>_process</code>、每次响应按钮的信号回调，最终都走这条路抵达 C++。不重复讲反射机制，只看运行时。</p>
<p>先给整条旅程画一张图。源码 <code>player.take_damage(10)</code> 一行，背后是十来个动作：</p>
<ol>
  <li><b>分词 → AST → 类型解析 → 字节码</b>——发生在脚本载入时（GDScript::reload 把四步串起来），一辈子只干一次；</li>
  <li>VM 开栈帧、逐条<b>取指令</b>——函数每被调用一次干一组；</li>
  <li>遇到调用：查函数表 / 查哈希，确认 take_damage 是<b>C++ 绑定方法</b>还是脚本函数；</li>
  <li>参数以 <b>Variant 货币</b>递交，MethodBind 在边界上<b>拆箱</b>还原成 int；</li>
  <li><b>C++ 原生执行</b>成员函数——从这里开始才是你熟悉的世界；</li>
  <li>返回值<b>装箱回 Variant</b> 压回栈，指令指针 ip 前进，VM 继续下一条指令。</li>
</ol>
<p>读码前先立好三种时间尺度的账，这是全课的骨架：</p>
<table>
  <tr><th>尺度</th><th>发生频率</th><th>例子</th></tr>
  <tr><td>编译期</td><td>脚本载入一次</td><td>分词、AST、类型解析、字节码发射</td></tr>
  <tr><td>每次调用</td><td>脚本每调用一个函数</td><td>开栈帧、方法分发（查表或查哈希）、拆装箱、返回值装箱</td></tr>
  <tr><td>每条指令</td><td>VM 最热循环</td><td>取指令、computed goto 跳转、操作数寻址</td></tr>
</table>
<p>热游戏里真正要算的是后两行——而 GDScript 编译器的全部心机，就是<b>把每次调用的固定成本能搬的都搬去编译期</b>。下一段的三条分发路径，正是这场搬迁的三种完成度。</p>`
    },
    {
      type: 'text',
      title: 'VM 内核与分发三态：从 CALL 到 CALL_METHOD_BIND',
      html: `<p><b>先认识 VM 本体。</b>GDScript 的执行核心是 <code>GDScriptFunction::call</code>（在 gdscript_vm.cpp）。要点全是工程账：栈帧用 <code>alloca</code> <b>在 C 栈上一次圈出整块</b>——局部变量槽与实参指针一锅端，没有逐变量堆分配，函数返回随 C 栈帧自动归还；栈顶三个地址固定是 <b>self / class / nil</b>，每条指令按下标直达；另有 <code>MAX_CALL_DEPTH = 2048</code> 拦无限递归爆栈。取指循环不用 switch 逐级比较，而是 <b>computed goto 跳转表</b>：<code>goto *switch_table_ops[opcode]</code>——解释器经典提速。关键认知：栈上所有值<b>都是 Variant 箱子</b>，这是后面一切成本的伏笔。</p>
<p><b>看方法调用怎么分发——三代产物同堂。</b>最朴素的是 <code>OPCODE_CALL</code>：指令只携带方法名，运行期 <code>base-&gt;callp(...)</code>。先看 Variant 类型标签（OBJECT 转 Object::callp，内建类型查各自方法哈希表）；Object::callp 有一条必背规矩：<b>先问 script_instance</b>——挂脚本的同名方法优先，C++ 版被劫持；脚本报 INVALID_METHOD，才按名字在类成员表做<b>哈希查找</b>拿 MethodBind。中间一代 <code>OPCODE_CALL_METHOD_BIND</code>：只要分析器从类型标注推断出 player 是 Player，编译期就把 MethodBind 指针塞进字节码方法表，运行期<b>按下标直取</b>——零哈希，也不再问脚本。最激进的一代是 <code>VALIDATED</code> 系列与 <code>ptrcall</code>：编译器核实参数类型与签名严格一致，跳掉逐参数判断，指针直接进函数。</p>
<p><b>边界上的真实花销。</b>栈上 dmg 本来就是 Variant(10)，递交方式是<b>指针数组</b>——箱子不重建；真正花钱在 MethodBind 转调：<code>call_with_variant_args</code> 先核参数数、缺的补默认值，再用 VariantInternal <b>按类型直读拆箱</b>（String 传给 int 参数会触发一次完整类型转换）；C++ 返回值经 <code>PtrToArg::encode</code> <b>装箱成 Variant 写回栈</b>。三态对比：</p>
<table>
  <tr><th>路径</th><th>哈希/查表</th><th>问不问脚本</th><th>参数处理</th><th>谁在用</th></tr>
  <tr><td>OPCODE_CALL（动态）</td><td>名字哈希查成员表</td><td>先问 script_instance</td><td>装箱数组递交 + 拆箱，类型不符再转换</td><td>无类型标注 / Object 引用</td></tr>
  <tr><td>CALL_METHOD_BIND</td><td>编译期定表，按下标直取</td><td>不问，直调 C++ 绑定</td><td>同样拆箱，省一次查表</td><td>player: Player 标注后</td></tr>
  <tr><td>VALIDATED / ptrcall</td><td>无</td><td>不问</td><td>类型已核实，裸指针直读</td><td>引擎热路径、信号 emit</td></tr>
  <tr><td>C++ 直接调用</td><td>无</td><td>无此概念</td><td>寄存器传参，可内联</td><td>基线</td></tr>
</table>
<p>还有一条<b>语义缝隙</b>：动态路径每次先问脚本、静态路径编译期就把 MethodBind 焊死——同一对象若挂脚本重写了同名方法，<b>改个类型标注可能改变命中的实现</b>。「类型即分发策略」，这是所有「脚本驱动 C++」引擎通用的张力。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'pipeline',
      title: '实验：一次调用的穿透流水线',
      height: 520,
      code: `// 穿透流水线：一行 GDScript 调用怎样抵达 C++
// 回车 / 空格 = 单步推进   A = 自动播放   T = 开关「player: Player」类型标注
// C = 切到纯 C++ 直调基线对照   R = 重置
// 三栏联动：左边代码与 VM 栈帧，中间旅程步骤条，右边成本账

engine.run({
  setup: function (state) {
    state.mode = 'script';   // 'script' | 'cpp'
    state.typed = true;      // player 是否写了类型标注
    state.auto = false;
    state.t = 0;
    build(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('Enter') || input.pressed('Space')) stepFwd(state);
    if (input.pressed('KeyA')) state.auto = !state.auto;
    if (state.auto) {
      state.t += dt;
      if (state.t >= 0.34) { state.t = 0; stepFwd(state); }
    } else {
      state.t = 0;
    }
    if (input.pressed('KeyT') && state.mode === 'script') build(state, 'toggleType');
    if (input.pressed('KeyC')) { state.mode = (state.mode === 'script') ? 'cpp' : 'script'; build(state); }
    if (input.pressed('KeyR')) build(state);
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('一次调用的穿透流水线 · 第 ' + (state.runs + 1) + ' 遍', 12, 20);
    ctx.fillStyle = state.mode === 'cpp' ? '#34d399' : (state.typed ? '#5aa9e6' : '#f59e0b');
    ctx.fillText('[' + state.badge + ']', 268, 20);

    // —— 左栏：源码 + 字节码 + 栈帧图 ——
    ctx.fillStyle = '#101826'; ctx.fillRect(10, 32, 266, state.lines.length * 18 + 8);
    ctx.fillStyle = '#5b7397'; ctx.fillText(state.file, 16, 44);
    var cur = state.cur >= 0 ? state.steps[state.cur] : null;
    for (i = 0; i < state.lines.length; i++) {
      var lit = cur !== null && cur.line === i;
      if (lit) { ctx.fillStyle = 'rgba(47,68,104,0.55)'; ctx.fillRect(12, 50 + i * 18 - 12, 262, 17); }
      ctx.fillStyle = lit ? '#fbbf24' : '#c9d7ea';
      ctx.fillText(state.lines[i], 16, 50 + i * 18);
    }
    var ay = 50 + state.lines.length * 18 + 16;
    ctx.fillStyle = '#7d93b3'; ctx.fillText('字节码：', 12, ay);
    ay += 14;
    var asm2 = wrapCjk(ctx, state.asm, 258);
    for (i = 0; i < asm2.length; i++) { ctx.fillStyle = '#9b8cff'; ctx.fillText(asm2[i], 12, ay + i * 13); }
    drawFrame(state, ctx, ay + asm2.length * 14 + 8);

    // —— 中栏：步骤条 ——
    var RY = 40, RH = 21.5;
    ctx.fillStyle = '#5b7397'; ctx.fillText('旅程 ' + state.steps.length + ' 步（回车单步）', 288, RY);
    RY += 8;
    for (i = 0; i < state.steps.length; i++) {
      var s = state.steps[i], col = tagColor(s.tag);
      ctx.fillStyle = i === state.cur ? col : '#16233a';
      ctx.fillRect(288, RY + i * RH, 176, RH - 3);
      ctx.fillStyle = i === state.cur ? '#0b0f17' : (i < state.cur ? '#9fb4cf' : '#55708f');
      var tt = (i < 9 ? ' ' : '') + (i + 1) + '·' + s.title;
      ctx.fillText(tt.length > 19 ? tt.slice(0, 18) + '…' : tt, 292, RY + i * RH + 11);
    }

    // —— 右栏：本步说明 + 成本账 + 对比条 ——
    var PX = 474;
    ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1; ctx.strokeRect(PX, 32, 234, 118);
    ctx.fillStyle = '#9b8cff'; ctx.fillText('当前步', PX + 8, 48);
    if (cur) {
      ctx.fillStyle = tagColor(cur.tag); ctx.fillText(cur.title.slice(0, 17), PX + 62, 48);
      var dl = wrapCjk(ctx, cur.desc, 220);
      for (i = 0; i < dl.length && i < 6; i++) { ctx.fillStyle = '#c9d7ea'; ctx.fillText(dl[i], PX + 8, 66 + i * 14); }
    } else {
      ctx.fillStyle = '#5b7397'; ctx.fillText('按 回车 开始单步', PX + 8, 70);
    }
    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(PX, 156, 234, 106);
    ctx.fillStyle = '#f59e0b'; ctx.fillText('累计成本账（每进一步计一次）', PX + 8, 172);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('VM 指令步 : ' + state.cnt.ops, PX + 8, 192);
    ctx.fillText('拆箱/装箱 : ' + state.cnt.box, PX + 8, 210);
    ctx.fillText('哈希查找 : ' + state.cnt.hash, PX + 8, 228);
    ctx.fillText('帧内存分配 : ' + state.cnt.alloc, PX + 8, 246);
    ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(PX, 268, 234, 100);
    ctx.fillStyle = '#6ee7b7'; ctx.fillText('同一逻辑一遍的指令步对比', PX + 8, 284);
    var rows = [
      { n: 'C++ 直调', v: state.cmp.cpp, on: state.mode === 'cpp' },
      { n: '脚本·静态', v: state.cmp.typed, on: state.mode === 'script' && state.typed },
      { n: '脚本·动态', v: state.cmp.dyn, on: state.mode === 'script' && !state.typed }
    ];
    for (i = 0; i < rows.length; i++) {
      var ww = Math.max(2, 120 * rows[i].v / state.cmp.max);
      ctx.fillStyle = rows[i].on ? '#e2e8f0' : '#5b7397';
      ctx.fillText(rows[i].n, PX + 8, 304 + i * 20);
      ctx.fillStyle = rows[i].on ? '#f59e0b' : '#2f4468';
      ctx.fillRect(PX + 92, 294 + i * 20, ww, 10);
      ctx.fillStyle = rows[i].on ? '#e2e8f0' : '#5b7397';
      ctx.fillText('' + rows[i].v, PX + 96 + ww, 304 + i * 20);
    }
    ctx.fillStyle = '#5b7397';
    ctx.fillText('回车/空格 单步 · A 自动 · T 类型标注 · C 对照C++ · R 重置', 12, engine.H - 8);
  }
});

function build(state, why) {
  state.auto = false;
  if (why === 'toggleType') state.typed = !state.typed;
  state.steps = makeSteps(state.mode, state.typed);
  var c1 = totOf(makeSteps('cpp', true)), c2 = totOf(makeSteps('script', true)), c3 = totOf(makeSteps('script', false));
  state.cmp = { cpp: c1.ops, typed: c2.ops, dyn: c3.ops, max: Math.max(c1.ops, c2.ops, c3.ops) };
  state.cur = -1; state.runs = 0;
  state.cnt = { ops: 0, box: 0, hash: 0, alloc: 0 };
  if (state.mode === 'cpp') {
    state.badge = 'C++ 直调基线';
    state.file = 'player.cpp —— 同样的逻辑写在 C++ 侧';
    state.lines = ['void Player::attack() {', '    Player *player = this;', '    player->take_damage(10);', '}'];
    state.asm = 'call Player::take_damage ; 编译期已定位（可能被整个内联）';
  } else {
    state.badge = state.typed ? 'GDScript · 静态类型' : 'GDScript · 动态名查找';
    state.file = 'attack.gd —— 玩家脚本';
    state.lines = ['extends Node', '', 'func attack():', '    var dmg = 10',
      state.typed ? '    var player: Player = self' : '    var player = self      # 不写类型标注',
      '    player.set_health(100)', '    player.take_damage(dmg)'];
    state.asm = state.typed
      ? 'OPCODE_CALL_METHOD_BIND argc=1 meth=#0（方法表下标）'
      : 'OPCODE_CALL argc 携带名字 Variant("take_damage") 运行期查哈希';
  }
}

function makeSteps(mode, typed) {
  if (mode === 'cpp') {
    return [
      { line: 1, tag: '编', title: '编译期：类型已知', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
        desc: '编译期已知 player 是 Player*，调用目标解析成一条 call 指令的地址——连查表这个动作都不存在。' },
      { line: 2, tag: 'C', title: '一条 call + 寄存器传参', f: -1, ops: 1, box: 0, hash: 0, alloc: 0,
        desc: '参数 10 走寄存器。函数帧用原生 ABI，栈槽是编译期静态布局，没有分配动作。' },
      { line: 2, tag: 'C', title: '返回原生 int，无包装', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
        desc: '返回值就是裸 int。若被内联连这条 call 也省——这是「热路径下沉 C++」的基线。' }
    ];
  }
  var s = [];
  s.push({ line: 0, tag: '编', title: '分词：字符流→词法流', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
    desc: 'tokenizer 把源码切成词法单元。发生在脚本载入时，一次，不摊进每帧成本。' });
  s.push({ line: 2, tag: '编', title: '解析：词法→AST', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
    desc: 'GDScriptParser 产出语法树。此刻还不知道 take_damage 是什么，只懂结构。' });
  if (typed) {
    s.push({ line: 4, tag: '编', title: '分析：player 是 Player', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
      desc: '有了类型标注，分析器编译期就查 ClassDB：take_damage 对应哪条 MethodBind？答案是确定的那一条。' });
    s.push({ line: 6, tag: '编', title: '编译：CALL_METHOD_BIND', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
      desc: '字节码里存方法表下标而非名字——哈希查表被搬到编译期预付了。' });
  } else {
    s.push({ line: 4, tag: '编', title: '分析：只能推出 Variant', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
      desc: '没有标注，分析器不知道 player 是什么，给不出方法表下标——把决定推迟到运行期。' });
    s.push({ line: 6, tag: '编', title: '编译：通用的 CALL 指令', f: -1, ops: 0, box: 0, hash: 0, alloc: 0,
      desc: '方法名 take_damage 登记进全局名表，指令只携带一个名字，分发全靠运行期临场。' });
  }
  s.push({ line: 6, tag: 'V', title: 'alloca 圈出函数栈帧', f: 0, ops: 0, box: 0, hash: 0, alloc: 1,
    desc: 'GDScriptFunction::call 在 C 栈一次圈下整帧（局部槽+实参指针）；固定地址 self/class/nil 就位；另查 call_depth，上限 2048 防无限递归爆栈。' });
  s.push({ line: 6, tag: 'V', title: '实参就位：dmg 拷进槽位', f: 1, ops: 0, box: 1, hash: 0, alloc: 0,
    desc: 'VM 栈上万物皆 Variant：dmg 已是 Variant(10)。进函数帧做一次 Variant 拷贝构造——若传的是对象，引用计数在这里 +1。' });
  if (typed) {
    s.push({ line: 6, tag: 'V', title: '取指令：跳转表直达', f: 1, ops: 2, box: 0, hash: 0, alloc: 0,
      desc: 'computed goto：goto *switch_table[opcode] 一步跳进 handler，零比较。' });
    s.push({ line: 6, tag: '界', title: 'LOAD_INSTRUCTION_ARGS', f: 1, ops: 1, box: 0, hash: 0, alloc: 0,
      desc: '把操作数的 Variant 栈地址收进 instruction_args 指针数组——递交的是指针，不是重建箱子。' });
  } else {
    s.push({ line: 6, tag: 'V', title: 'OPCODE_CALL 按名分发', f: 1, ops: 2, box: 0, hash: 0, alloc: 0,
      desc: '取指令后执行 base 上的按名调用：方法与参数都还是 Variant 世界的事。' });
    s.push({ line: 6, tag: '界', title: 'Variant::callp 类型分流', f: 2, ops: 1, box: 0, hash: 0, alloc: 0,
      desc: '看类型标签：OBJECT 转给 Object::callp；若是内建类型（String 的 to_int、Array 的 append），查各自的方法哈希表。' });
    s.push({ line: 6, tag: '界', title: '先问脚本：劫持点', f: 2, ops: 1, box: 0, hash: 1, alloc: 0,
      desc: 'Object::callp 先问 script_instance：你挂的脚本若重写了 take_damage，C++ 版在这里被劫持、根本轮不到；只有报 INVALID_METHOD 才落回。' });
    s.push({ line: 6, tag: '界', title: '成员表哈希→MethodBind', f: 2, ops: 1, box: 0, hash: 1, alloc: 0,
      desc: '以 StringName 为键在类成员表哈希查找，才拿到那条编译期本就能确定的 MethodBind。按 T 切回静态版，这步直接消失。' });
  }
  s.push({ line: 6, tag: '界', title: 'MethodBind::call 边界站', f: 2, ops: 1, box: 0, hash: 0, alloc: 0,
    desc: '通用转调入口：DEBUG 构建先数参数——多了/少了报调用错误，缺的用默认值补齐。每个跨语言调用都逃不掉的一站。' });
  s.push({ line: 6, tag: '界', title: '拆箱：Variant 读裸 int', f: 2, ops: 1, box: 1, hash: 0, alloc: 0,
    desc: 'VariantInternal 按目标参数类型直接读。类型不匹配（String "10" 传给 int）会就地来一次完整转换——脏数据在边界最贵。' });
  s.push({ line: 6, tag: 'C', title: '执行 take_damage(10)', f: 3, ops: 1, box: 0, hash: 0, alloc: 0,
    desc: '真正的 C++ 成员函数。从这里开始是你熟悉的世界：可以被内联、被向量化。' });
  s.push({ line: 6, tag: '界', title: '返回值装箱压回栈', f: 4, ops: 1, box: 1, hash: 0, alloc: 0,
    desc: 'C++ 返回值装箱成 Variant 写进目的栈槽，void 装箱 NIL；ip 前进，栈帧随 C 返回自动归还，VM 继续下一条指令。' });
  return s;
}

function totOf(steps) {
  var t = { ops: 0, box: 0, hash: 0, alloc: 0 };
  for (var i = 0; i < steps.length; i++) {
    t.ops += steps[i].ops; t.box += steps[i].box; t.hash += steps[i].hash; t.alloc += steps[i].alloc;
  }
  return t;
}

function stepFwd(state) {
  var n = state.steps.length;
  if (n === 0) return;
  if (state.cur >= n - 1) { state.cur = 0; state.runs++; }
  else { state.cur++; }
  var s = state.steps[state.cur];
  state.cnt.ops += s.ops; state.cnt.box += s.box; state.cnt.hash += s.hash; state.cnt.alloc += s.alloc;
}

function tagColor(tag) {
  if (tag === '编') return '#9b8cff';
  if (tag === 'V') return '#5aa9e6';
  if (tag === '界') return '#f59e0b';
  return '#34d399';
}

function drawFrame(state, ctx, top) {
  if (state.mode === 'cpp') {
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText('栈帧 = 原生 ABI，编译期定死', 12, top + 16);
    return;
  }
  var s = state.cur >= 0 ? state.steps[state.cur] : null;
  var f = s ? s.f : -1;
  var slots = ['self', 'class', 'nil', 'dmg', 'ret'];
  ctx.fillStyle = '#5b7397'; ctx.fillText('VM 栈帧（alloca 一次圈出 · 全是 Variant）', 12, top + 4);
  for (var i = 0; i < slots.length; i++) {
    var x = 12 + i * 52;
    var hot = (f === 0 && i < 3) || (f >= 1 && f <= 3 && i === 3) || (f === 4 && (i === 3 || i === 4));
    ctx.fillStyle = '#16233a';
    ctx.fillRect(x, top + 10, 48, 30);
    if (hot) { ctx.fillStyle = 'rgba(251,191,36,0.18)'; ctx.fillRect(x, top + 10, 48, 30); }
    ctx.strokeStyle = i < 3 ? '#2f4468' : '#478cbf';
    ctx.lineWidth = hot ? 2.2 : 1;
    ctx.strokeRect(x, top + 10, 48, 30);
    ctx.fillStyle = '#c9d7ea'; ctx.fillText(slots[i], x + 6, top + 29);
  }
}

function wrapCjk(ctx, s, maxW) {
  var out = [], line = '';
  for (var i = 0; i < s.length; i++) {
    var nxt = line + s.charAt(i);
    if (line.length > 0 && ctx.measureText(nxt).width > maxW) { out.push(line); line = s.charAt(i); }
    else { line = nxt; }
  }
  if (line.length > 0) out.push(line);
  return out;
}
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>按 <b>Enter</b> 单步走完静态类型版，盯右侧账本：<b>哈希查找那一行始终为 0</b>。再按 <b>T</b> 去掉类型标注重走——动态版在「先问脚本」和「成员表哈希」两步各 +1，指令步整条上浮。</li>
  <li>按 <b>C</b> 切到纯 C++ 直调基线：一遍只记 1 个指令步。右下角三根条就是同一逻辑的成本阶梯；反复按 T 观察「脚本·静态」与「脚本·动态」哪根在动。</li>
  <li>按 <b>A</b> 自动连跑三遍，看累计账怎么翻三倍：这些数字摊到每帧几百次跨语言调用上，就是「热点逻辑请下沉 C++」的全部理由。</li>
  <li>走到静态版的「取指令：跳转表直达」回想：为什么这条路径跳过了「先问脚本」？去源码段确认 OPCODE_CALL_METHOD_BIND 的 handler 是否真的直接 method-&gt;call——然后想想这对「脚本重写 C++ 同名方法」意味着什么。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：三个站点',
      files: [
        { path: 'modules/gdscript/gdscript_vm.cpp', note: 'VM 本体：GDScriptFunction::call——alloca 栈帧、固定地址 self/class/nil、MAX_CALL_DEPTH=2048、computed goto 取指；重点对照 OPCODE_CALL（约 1904 行，运行期按名分发）与 OPCODE_CALL_METHOD_BIND（约 2035 行，_methods_ptr 按下标直取后直接 method->call）两个 handler。' },
        { path: 'core/object/object.cpp', note: '分发路口 Object::callp（约 851 行）：第一件事是问 script_instance->callp——脚本劫持 C++ 方法的现场；报 INVALID_METHOD 落空后，才查类型成员表拿 MethodBind 转调。' },
        { path: 'core/object/method_bind_common.h', note: 'MethodBindT 模板：同一个成员函数指针的三副面孔——call（数参数/补默认值，拆箱转调）、validated_call（类型已核实，VariantInternal 直读）、ptrcall（裸指针，连箱子都不开）。配 method_bind.h 的抽象基类一起看，三档成本阶梯一目了然。' }
      ]
    },
    {
      type: 'text',
      title: '小结：三本账，一条路',
      html: `<p>倒过来复述一遍旅程才看得清：最后一步才是 C++ 成员函数执行；前一步是 MethodBind 的核对与拆箱；再往前是取指令与分发——静态时按下标直取方法表，动态时走 Variant::callp → Object::callp → 脚本优先 → 成员表哈希；更早，栈帧在 C 栈上被 alloca 圈出、参数作为 Variant 拷进槽位；而这一切的剧本——存名字还是存下标——是<b>编译期由类型推断写定的</b>。三本账各归各的尺度：编译一次的动作不要钱；每次调用的分发与拆装箱要盯着；每条指令的取指跳转已由跳转表压到最低。</p>
<p>所有权收口：VM 栈帧随 C 栈自动归还，不需要 GC 关照；参数与返回值以 Variant 身份跨界拷贝（对象参数即引用计数增减，见 L2.3）；真正的常驻对象——Player 本体——所有权自始至终在场景树手里，脚本调用只是路过。边界两端谁都不许直接持有对方的裸内存，这正是 L2.2 立下的规矩运行时的报销。</p>
<p>至此 P2 的对象系统与脚本层闭环：<b>ClassDB 是登记处，Variant 是货币，信号是电话线，MethodBind 是海关，VM 是发动机</b>。下一站进 P3 数学与空间——被这些方法读写、搬运的 Vector 与 Transform，本身也是一套值得设计的数据结构。</p>`
    }
  ]
}
