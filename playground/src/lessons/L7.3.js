// L7.3 · 音频系统：混音器与 3D 空间音频
export default {
  id: 'L7.3',
  title: '音频系统：混音器与 3D 空间音频',
  est: '1.5 小时',
  coreQuestions: [
    '游戏线程每帧只醒 60 次，声卡却要每秒 48000 个样本——这两套时钟怎么对账？谁等谁？',
    '几十个播放流、总线、效果器，一帧音频在混音器里按什么顺序被加工？谁持有哪块缓冲？',
    '玩家一卡顿，声音为什么「咔哒」断掉而不是变慢？underrun 的代价由谁付？',
    '3D 音频的距离衰减和左右声像，算在哪条线程上？跨线程传的是采样还是参数？'
  ],
  sections: [
    {
      type: 'text',
      title: '两套时钟：为什么音频不能跟着帧率跑',
      html: `<p>回想 L1.1：渲染帧的 dt 忽大忽小，物理靠「固定步长 + 累积器」把时间切成等大的小块。音频是同一味药方的另一味病人——而且病得更重：<b>声卡的时钟是硬件</b>。它按晶振节拍，每过一块缓冲（比如 512 帧）就来敲一次门：「样本呢？」48kHz 下这是每 10.7ms 一次，风雨无阻。游戏这边却是 60fps（16.7ms 一帧），还时不时因为加载、GC、复杂场景抖到 30fps 甚至停摆。</p>
<p>两个频率不同、还会各自抖动的时钟，只有三种对接方式：让声卡等游戏（做不到，硬件不等人）、让游戏精确对齐声卡（也做不到，帧时间不可控），或者<b>中间垫一个环形缓冲（ring buffer）</b>：游戏侧作为生产者，每次醒来往环里塞一段混好的块；声卡侧作为消费者，按自己的节拍从环里取定量样本。水位涨落就是两套时钟的「汇率表」：水太浅，回调来了没米下锅——<b>underrun</b>，输出静音或重复上一块，听感就是「咔哒」爆音；水太深，每个样本都要在环里多排一会儿队——<b>延迟</b>升高。工程上一般把目标水位压在两三块缓冲的深度：够扛住一次掉帧，又不至于让开枪声落后于枪口火光太多。</p>
<pre>游戏线程(生产者, 60fps)      环形缓冲(共享水位)      音频回调(消费者, 硬实时)
     |  混出一块 512 帧   ->   [ ~~~~水位~~~~ ]   ->    每次取走定量样本
     v                                                48000/s, 永不等任何人</pre>
<p>所以有一条铁律先立在这里：<b>音频回调是硬实时代码，禁止阻塞</b>。锁要抢不到就走无锁路径，绝不能在里面等游戏线程交货——它等的不是一帧，而是全机最不能迟到的那个定时器。反过来，游戏线程也从不「递送」数据给声卡，只是尽力维持水位；双方唯一的契约就是那块环形缓冲。</p>`
    },
    {
      type: 'text',
      title: '混音器架构：总线树与拉取式混音',
      html: `<p>Godot 把这套结构做成了 AudioServer（servers 层的老朋友——无头服务，节点通过 API 间接驱动，同 L5.3 的 PhysicsServer）。三问走一遍：</p>
<p><b>数据怎么流动？</b>基本单位是 <code>AudioFrame</code>：一对 float（左/右声道），定义在 servers/audio/audio_frame.h，8 字节，带加减乘和 lerp 运算符——混音的本质就是把多个 AudioFrame <b>相加</b>。流向是一条树：每个正在播的流（stream playback）产出帧 -&gt; 写进所属总线的缓冲 -&gt; 总线挂的效果器链逐个就地加工 -&gt; 沿 send 汇入父总线 -&gt; Master 总线钳位到 [-1,1]、转成整数样本交给驱动。注意方向：不是播放器「推」声音出去，而是混音器在音频回调里<b>逐总线、逐流地拉（pull）</b>——这就是 Godot 剖析器里那条 <code>audio_thread</code> 数据的含义，也是「混音器」一词的本体。</p>
<table>
  <tr><th>概念</th><th>Godot 对应</th><th>设计角色</th></tr>
  <tr><td>一组流的汇合点</td><td>AudioBus（Master / SFX / Music…）</td><td>混音树节点，自带音量(dB)、mute/solo</td></tr>
  <tr><td>总线上串的加工站</td><td>AudioEffect 链（compressor、reverb…）</td><td>就地处理整段帧数组，可旁通</td></tr>
  <tr><td>发声者</td><td>AudioStreamPlayback（每实例一份）</td><td>生产者：向目标总线缓冲累加帧</td></tr>
  <tr><td>硬件出口</td><td>AudioDriver（WASAPI/CoreAudio/…）</td><td>消费者：按节拍取走最终帧并交 DMA</td></tr>
</table>
<p><b>所有权归谁？</b>每条总线拥有自己的一段帧缓冲（长度 = 每次混多少帧，Godot 主循环里是 512）；playback 只持有解码游标和参数，不持有音频内存；效果器实例挂在总线上。谁创建谁销毁，边界干净。<b>什么时候发生？</b>混合不在 _process 里发生——它在音频线程的回调里，按声卡的节拍发生；游戏线程只负责改参数、发指令。于是引出第三个板块：两条线程之间到底传什么。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'audiobridge',
      title: '实验：双时钟环形缓冲沙盘 × 3D 声场',
      height: 560,
      code: `// 双时钟环形缓冲沙盘（纯可视化，不发声）+ 3D 声场小板块
// 上半：游戏线程(生产者, 60fps)往环形缓冲写混音块，声卡回调(消费者, 48kHz)按节拍取走
// 空格按住不放 = 模拟游戏卡顿(停止生产) -> 水位耗尽 -> underrun 爆音
// Q / W = 调小 / 调大缓冲深度(帧数) —— 找「抗抖动」与「延迟」的平衡点
// A / S = 调小 / 调大混音块大小(帧) —— Godot 把这个数硬编码为 512
// 下半：鼠标拖动三个声源，距离衰减 + 左右声像实时联动电平条

engine.run({
  setup: function (state) {
    state.rate = 48000;              // 声卡时钟：每秒 48000 帧
    state.block = 512;               // 每次混音产出的块大小（帧）
    state.capacity = 1536;           // 环形缓冲总容量（帧）
    state.level = 1024;              // 当前水位（帧）
    state.prodAcc = 0;               // 生产侧累积器（L1.1 的配方！）
    state.lagging = false; state.underruns = 0; state.drops = 0;
    state.waterHist = [];             // 水位历史，画趋势线
    state.msg = ''; state.msgT = 0;
    state.srcs = [
      { name: '枪声', x: 200, y: 392, r: 10, color: '#f87171' },
      { name: '脚步', x: 470, y: 366, r: 10, color: '#34d399' },
      { name: '音乐', x: 620, y: 414, r: 10, color: '#9b8cff' }
    ];
    state.drag = -1;
  },

  update: function (state, dt, input) {
    if (input.pressed('KeyQ')) { state.capacity = Math.max(state.block * 2, state.capacity - 512); setMsg(state, '缓冲变浅：延迟降了，但更怕卡顿'); }
    if (input.pressed('KeyW')) { state.capacity = Math.min(6144, state.capacity + 512); setMsg(state, '缓冲变深：更抗抖动，延迟随之升高'); }
    if (input.pressed('KeyA')) { state.block = Math.max(128, state.block - 128); setMsg(state, '混音块变小：每次混得少、来得勤'); }
    if (input.pressed('KeyS')) { state.block = Math.min(1024, state.block + 128); setMsg(state, '混音块变大：省调用开销，粒度变粗'); }
    if (state.level > state.capacity) state.level = state.capacity;

    // 生产者：游戏线程 60fps，每帧混出一整块 block 帧
    var lagged = input.down('Space');
    state.lagging = lagged;
    if (!lagged) {
      state.prodAcc += dt;
      var frameDt = 1 / 60;
      var guard = 0;
      while (state.prodAcc >= frameDt && guard < 4) {
        state.prodAcc -= frameDt; guard++;
        var room = state.capacity - state.level;
        if (room >= state.block) state.level += state.block;   // 整块入环
        else state.drops++;                                    // 满了丢块：生产者宁可扔也不拖慢消费者
      }
    }

    // 消费者：声卡回调按 48kHz 恒定速率取走定量样本（以本帧 dt 为观察窗口结算）
    var want = state.rate * dt;
    if (state.level >= want) {
      state.level -= want;                                     // 按时交货
    } else {
      state.level = 0;
      state.underruns++;                                       // 欠载！回调只能拿静音凑数
    }
    state.waterHist.push(state.level / state.capacity);
    if (state.waterHist.length > 220) state.waterHist.shift();
    for (var i = 0; i < 3; i++) {                              // 拖动声源
      var s = state.srcs[i];
      if (input.mouse.clicked && Math.abs(input.mouse.x - s.x) < 16 && Math.abs(input.mouse.y - s.y) < 16) state.drag = i;
      if (state.drag === i && input.mouse.down) { s.x = input.mouse.x; s.y = clamp(input.mouse.y, 344, 432); }
      if (!input.mouse.down) state.drag = -1;
    }
    state.msgT -= dt;
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('上：双时钟环形缓冲（不发声，只看水位）  下：拖声源看衰减与声像', 12, 20);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('缓冲 ' + state.capacity + ' 帧 (' + ms(state.capacity, state.rate).toFixed(1) + 'ms) · 块 ' + state.block + ' 帧 · 延迟≈' + ms(state.level, state.rate).toFixed(1) + 'ms · underrun ' + state.underruns + ' · 丢块 ' + state.drops, 12, 40);
    drawRing(state, ctx);
    drawWaterfall(state, ctx);
    ctx.strokeStyle = '#1e2a3d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 330); ctx.lineTo(engine.W, 330); ctx.stroke();
    drawField(state, ctx);
    ctx.fillStyle = state.msgT > 0 ? '#fbbf24' : '#5b7397';
    ctx.fillText(state.msg, 12, 322);
  }
});

function ms(frames, rate) { return frames / rate * 1000; }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function setMsg(state, s) { state.msg = s; state.msgT = 3; }

function drawRing(state, ctx) {
  var cx = 150, cy = 178, R = 78, r0 = 52;
  var seg = 48, i;
  for (i = 0; i < seg; i++) {                                  // 环形缓冲本体：满的格点亮
    var filled = (i + 0.5) / seg <= state.level / state.capacity;
    var a0 = -Math.PI / 2 + i / seg * Math.PI * 2;
    var a1 = -Math.PI / 2 + (i + 0.92) / seg * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
    ctx.fillStyle = filled ? '#2f6db3' : '#152238'; ctx.fill();
  }
  var ang = -Math.PI / 2 + (state.level / state.capacity) * Math.PI * 2;       // 写指针
  ctx.strokeStyle = '#34d399'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
  ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2;                              // 读指针恒在顶（消费端连续拉取）
  ctx.beginPath(); ctx.moveTo(cx, cy - r0); ctx.lineTo(cx, cy - R); ctx.stroke();
  ctx.font = '12px monospace';
  ctx.fillStyle = '#34d399'; ctx.fillText('写·游戏线程', cx + R + 6, cy - 40);
  ctx.fillStyle = '#f87171'; ctx.fillText('读·声卡', cx + R + 6, cy - 12);
  ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
  ctx.fillText(Math.round(state.level / state.capacity * 100) + '%', cx, cy + 4);
  ctx.textAlign = 'left';
  if (state.lagging) { ctx.fillStyle = '#f87171'; ctx.fillText('游戏卡顿中：停产', cx - 52, cy + R + 20); }
}

function drawWaterfall(state, ctx) {
  var x0 = 330, y0 = 78, w = 372, h = 150;
  ctx.strokeStyle = '#1e2a3d'; ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = '#7d93b3'; ctx.font = '12px monospace';
  ctx.fillText('水位趋势（横盘=健康 · 触底=underrun · 顶格=溢出丢块）', x0 + 8, y0 - 8);
  var hist = state.waterHist, n = hist.length;
  for (var i = 0; i < n; i++) {                                // 水位柱状图
    var lv = hist[i], bh = lv * h;
    ctx.fillStyle = lv <= 0.001 ? '#f87171' : (lv >= 0.999 ? '#fbbf24' : '#2f6db3');
    ctx.fillRect(x0 + 2 + i * 1.68, y0 + h - bh, 1.4, bh);
  }
  ctx.strokeStyle = 'rgba(52,211,153,0.6)'; ctx.setLineDash([4, 4]);          // 目标水位参考线
  var ty = y0 + h - h * 0.5;
  ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x0 + w, ty); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#34d399'; ctx.fillText('目标 50%', x0 + w - 78, ty - 4);
}

function drawField(state, ctx) {
  var lx = 360, ly = 352;
  ctx.strokeStyle = '#1e2a3d';                                 // 听者朝向锥
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 120, ly - 6); ctx.moveTo(lx, ly); ctx.lineTo(lx + 120, ly - 6); ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8fa7c7'; ctx.font = '12px monospace';
  ctx.fillText('听者', lx - 12, ly - 12);
  for (var i = 0; i < 3; i++) {
    var s = state.srcs[i];
    var dx = s.x - lx, dy = s.y - ly;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var gain = 1 / (1 + dist / 60);                            // 反比衰减：1/(1+d/d0)
    var pan = 0;
    if (dist > 1) pan = clamp((dx / dist) * 0.85, -1, 1);      // 方位角正弦 ≈ 声像
    var lvl = gain * (1 - Math.abs(pan) * 0.35);               // 偏置后该侧更响
    ctx.strokeStyle = 'rgba(143,167,199,0.35)';
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(s.name + ' 增益 ' + (gain * 100).toFixed(0) + '%', s.x - 24, s.y - 16);
    var bx = 664, by = 344 + i * 30;                           // 左右声道电平条
    var ll = lvl * clamp(1 - pan, 0, 1), rr = lvl * clamp(1 + pan, 0, 1);
    ctx.fillStyle = '#7d93b3'; ctx.fillText('L', bx - 14, by + 9); ctx.fillText('R', bx - 14, by + 21);
    ctx.fillStyle = '#152238'; ctx.fillRect(bx, by, 44, 9); ctx.fillRect(bx, by + 12, 44, 9);
    ctx.fillStyle = s.color; ctx.fillRect(bx, by, 44 * ll, 9); ctx.fillRect(bx, by + 12, 44 * rr, 9);
  }
  ctx.fillStyle = '#7d93b3';
  ctx.fillText('距离增大 增益下降 · 偏左则左声道更响（简化版 Godot 衰减×声像）', 12, 434);
}
`
    },
    {
      type: 'text',
      title: '3D 空间音频：每帧算参数，回调里用参数',
      html: `<p>沙盘下半截演示的就是空间化的最小闭环：<b>距离 → 增益，方位 → 声像</b>。Godot 把它拆在两条线程上，这正是本课最值钱的设计点。</p>
<p>游戏线程上，<code>AudioStreamPlayer3D</code>（scene/3d/audio_stream_player_3d.cpp）每帧读取全局听者（AudioListener）的变换，把自己换算到听者局部坐标，然后：按衰减模型算 dB——线性 <code>1/(d/unit)</code>、对数 <code>-20·log10(d/unit)</code>、自定义曲线任选；按发射方向再叠一层角度衰减；根据相对方位算出左右声道的增益系数；多普勒则投影相对速度改成 pitch。算完的结果打包成一串 <code>Vector&lt;AudioFrame&gt;</code>（<b>每个总线的左/右声道线性音量</b>，一条 AudioFrame 同时装 L 和 R，这就是为什么 AudioFrame 天生是立体声对）连同高通截止频率（空气吸收：远处声音发闷）一起，经 <code>set_playback_bus_volumes_linear</code> 之类的 API 写进 playback 的参数槽。</p>
<p>音频线程上，混音器拉取这个 playback 时<b>不碰任何场景树</b>，只读这些已算好的参数去缩放帧。于是跨线程传递的不是音频数据而是「这一帧听到的样子」，交接成本与总线数、声道数成正比，与算力无关。衰减曲线本身则是 DSP 细节，留给效果器们。</p>
<p>回头看沙盘里的 underrun 计数：真实引擎里它不会弹窗，而是直接变成听众耳朵里的爆音——所以所有引擎都默认留两三个块的余量，再把「禁止在回调里分配内存、加锁自旋、访问磁盘」写进军规。你按住的每一个空格，都是某款游戏过场加载时那声「啵」的成因。</p>`
    },
    {
      type: 'source',
      title: '源码走读：三个文件走完这条链',
      files: [
        { path: 'servers/audio/audio_driver.h', note: '驱动抽象层：virtual get_mix_rate()/lock()/unlock() 就是各家后端（WASAPI/CoreAudio…）必须兑现的合同；DEFAULT_MIX_RATE=44100；get_time_since_last_mix() 注释直言 useful for video-&gt;audio sync——两套时钟对不上账时的补偿钩子。' },
        { path: 'servers/audio/audio_server.cpp', note: '混音器本体：init() 里 buffer_size = 512 硬编码（注释说明它限定了最低约 11ms 的音频延迟）；_mix_step() 逐 playback 拉帧、按 bus_details 里的立体声音量写进各总线缓冲、再跑效果器链沿 send 汇入 Master；update() 只在游戏线程做记账与剖析。' },
        { path: 'drivers/wasapi/audio_driver_wasapi.cpp', note: 'Windows 消费者的真身：音频线程循环里 ad-&gt;lock() 后 audio_server_process(buffer_frames, samples_in)——现场拉一整块混音再写入硬件缓冲；按 GetCurrentPadding 查声卡还剩多少空位、只写写得下的量，输出设备不活跃时直接 samples_in.fill(0) 送静音——硬实时回调「宁可静音不可迟到」的活教材。' }
      ]
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>按住空格别松：看水位一路下探、触底、underrun 计数起跳——松手后水位回升的那段「爬坡」，就是恢复期。再对照 §0 第三问：混音发生在「后台线程的节拍上」，不是你的 _process 里。</li>
  <li>把缓冲一路调到 6144 帧：underrun 几乎绝迹，但顶部标注的延迟逼近 128ms——开枪声明显「跟不上画面」。再一路调回最浅：延迟好看了，随便一次卡顿就爆音。512 帧 × 两三块深的行业惯例是你亲手调出来的。</li>
  <li>只调块大小（A/S）不调容量：块越大，单次混音越省调用开销，但水位台阶越粗、响应越钝。Godot 选 512 并在注释里承认「想做成项目设置但还没做」——一个真实的未决权衡。</li>
  <li>把声源拖到听者正前方很远：增益趋近 0；拖到左侧：L 条长 R 条短。想想 VR 耳机里为什么还要 HRTF——本课的「增益×声像」只是空间化的第一级台阶。</li>
</ul>`
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>把三问钉在板上收口。<b>数据怎么流动</b>：AudioFrame 逐级相加，总线树从叶子向 Master 汇流，最后钳位转整数交给驱动 DMA。<b>所有权归谁</b>：环形缓冲是两条时钟唯一共享的东西；总线拥有帧缓冲，playback 拥有参数与解码游标，场景节点只持有对 server 的引用。<b>什么时候发生</b>：混音永远发生在音频回调里（硬实时、只许成功），游戏线程每帧只更新「听到什么样」的参数快照。至此 P7 三大玩法支撑系统（输入 L7.1、动画 L7.2、音频 L7.3）集齐——它们全是同一种生物：场景树之上的无头 Server，各自吃一条数据流，各自守一套时钟。下一站 P8，我们去看引擎怎么把「多线程」本身做成系统。</p>`
    }
  ]
}
