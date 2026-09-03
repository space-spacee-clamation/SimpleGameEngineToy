// L6.1 · 资源与导入管线：.tres / pck / 热重载
export default {
  id: 'L6.1',
  title: '资源与导入管线：.tres / pck / 热重载',
  est: '2 小时',
  coreQuestions: [
    '一张 png 从磁盘到 Sprite2D 显示出来，中间经过哪几站？每站发生在编辑器还是运行时、跑一次还是每帧？',
    '谁持有资源？多个节点引用同一张贴图时，内存里到底有几份？',
    '.tres 文件里存的是数据本体还是引用？加载一个场景时引用图怎么被还原成对象图？',
    '外部文件变了，引擎怎么做到「节点不动、数据换血」的热重载？'
  ],
  sections: [
    {
      type: 'text',
      title: '资源是数据，节点是行为：先分清两条命脉',
      html: `<p>L2.1 我们说过场景树是「行为骨架」。这一课看另一半：<b>Resource 是数据载体</b>。Node 活在场景树里、有父子、有 _process；Resource 活在引用里、没有位置、不接收帧回调。Texture2D、Mesh、Animation、GDScript 本身全是 Resource。这条分界线不是风格洁癖，它换来三样东西：</p>
<table>
  <tr><th>因为「资源 ≠ 节点」</th><th>所以能做什么</th></tr>
  <tr><td>资源可被多方共享引用</td><td>1000 个敌人共用一张贴图，显存只有一份</td></tr>
  <tr><td>资源可脱离场景序列化</td><td>.tres / .res 单独存盘、跨项目复用</td></tr>
  <tr><td>资源可在运行时整体替换</td><td>换贴图不改节点 → 热重载、皮肤系统、DLC</td></tr>
</table>
<p>于是本课的主线是一个问题：<b>磁盘上的字节，怎么变成内存里那个「唯一的一份」，再被 N 个节点同时指着？</b>答案分三段：导入管线（编辑器离线做一次）、加载与缓存（运行时按需、每个路径一次）、序列化格式（.tres 存引用、pck 打包发布）。顺带一提，RefCounted 的引用计数在 L2.2 结尾留了个尾巴——那正是这里「唯一一份被 N 个持有者安全共享」的底层保证。</p>`
    },
    {
      type: 'text',
      title: '一张 png 的五站旅程：谁在哪一站动手',
      html: `<p>Godot 项目里 res://player.png 旁边会有一个 player.png.import 文本文件——它是「已导入」的凭证。<b>引擎运行时读不了原始 png</b>（默认情况下），它读的是导入产物。五站如下：</p>
<table>
  <tr><th>站点</th><th>数据形态</th><th>谁执行</th><th>频率</th></tr>
  <tr><td>① 源文件 png</td><td>RGBA8888 位图，为「人眼看」优化</td><td>美术保存</td><td>随改随存</td></tr>
  <tr><td>② .import 侧车</td><td>键值对参数：compress/mode、mipmaps/generate…</td><td>编辑器（Inspector 勾选写回）</td><td>改参数才重写</td></tr>
  <tr><td>③ 转码</td><td>按参数生成 mipmap、选 WebP/VRAM/BasisU 编码</td><td>编辑器导入线程</td><td><b>只在导入时一次</b></td></tr>
  <tr><td>④ .ctex 载体</td><td>压缩字节 + 头部标志位，落在 .godot/imported/</td><td>编辑器写出，导出时被塞进 pck</td><td>每次导入重写</td></tr>
  <tr><td>⑤ load() 上内存</td><td>CompressedTexture2D 对象，注册进 ResourceCache</td><td>运行时（或编辑器进程内跑游戏时）</td><td>同路径<b>仅第一次真读盘</b></td></tr>
</table>
<p>关键结论：<b>昂贵的解码与压缩全部前置到构建期</b>。运行时不做「png→纹理」，只做「ctex 字节→GPU 纹理」。这与 Unreal 把资产 cook 成平台格式、Unity 的 Library/AssetImportWorker 是同一个思路：导入器本质是<b>离线编译器</b>，输入源文件+参数，输出针对目标平台优化的二进制载体，而 .import 就是它的编译选项清单。</p>
<p>还有一层常被忽略：<b>为什么缓存用 path 做 key</b>？因为「load(路径) 返回同一个对象」这个语义必须由路径唯一性来兑现；代价是文件改名会撕裂引用，所以 Godot 4.4 起又给每个资源配了 UID 间接层（resource_uid.cpp），由 UID→path 的映射表兜底。这是典型的「主键稳定性 vs 引用透明」权衡。</p>`
    },
    {
      type: 'lab',
      lab: 'code',
      key: 'respipeline',
      title: '实验：导入管线五站 + 资源缓存沙盘',
      height: 560,
      code: `// 上半屏：一张 png 的五站旅程 —— ← → 单步走，看每站的数据形态与归属
// 下半屏：场景节点表 vs 资源缓存表 —— A/D 增删引用者，B 切换「各 load 一份」
// R：模拟外部文件变动触发热重载，看「节点不动、数据换血」

engine.run({
  setup: function (state) {
    state.stage = 0;            // 当前站点 0..4
    state.refs = 3;             // 场景里引用这张贴图的节点数
    state.duplicate = false;    // true = 关掉缓存，每个节点各 load 一份
    state.hotT = 0;             // 热重载动画计时
    state.hot = false;
    state.pulse = 0;
    state.msg = '← → 走站点；A/D 增减引用者；B 切缓存模式；R 触发热重载';
    state.stages = [
      { name: 'png 源文件', where: '磁盘 / 美术', cost: 'RGBA8888 未压缩', editor: true, once: false },
      { name: '.import 侧车', where: '编辑器 Inspector', cost: '参数清单（文本）', editor: true, once: false },
      { name: '压缩转码', where: '编辑器后台线程', cost: 'mipmap + 编码，最贵', editor: true, once: true },
      { name: '.ctex 载体', where: '.godot/imported/', cost: '压缩字节 + 头', editor: true, once: true },
      { name: 'load 进缓存', where: '运行时首次', cost: 'CompressedTexture2D', editor: false, once: true }
    ];
  },

  update: function (state, dt, input) {
    state.pulse += dt;
    if (input.pressed('ArrowRight')) { state.stage = Math.min(4, state.stage + 1); say(state, '第 ' + (state.stage + 1) + ' 站：' + state.stages[state.stage].name); }
    if (input.pressed('ArrowLeft')) { state.stage = Math.max(0, state.stage - 1); say(state, '第 ' + (state.stage + 1) + ' 站：' + state.stages[state.stage].name); }
    if (input.pressed('KeyA')) { state.refs = Math.min(9, state.refs + 1); say(state, '新节点 load(同一路径)：缓存命中，引用计数 +1'); }
    if (input.pressed('KeyD')) { state.refs = Math.max(1, state.refs - 1); say(state, '一个节点释放：引用计数 -1，归零才真正 free'); }
    if (input.pressed('KeyB')) { state.duplicate = !state.duplicate; say(state, state.duplicate ? '缓存关闭：每个节点各拿一份独立拷贝' : '缓存开启：同路径永远同一个对象'); }
    if (input.pressed('KeyR')) { state.hot = true; state.hotT = 1.6; say(state, '外部 png 变了 → 重导入 → 缓存失效 → 所有引用者看到新数据'); }
    if (state.hot) { state.hotT -= dt; if (state.hotT <= 0) { state.hot = false; } }
  },

  draw: function (state, ctx) {
    var i;
    ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 0, engine.W, engine.H);
    ctx.font = '13px monospace';

    // ---- 上半：五站流水线 ----
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('① 导入管线：一张 png 的五站（黄=当前位置）', 12, 22);
    for (i = 0; i < 5; i++) {
      var x = 12 + i * 142, on = (i === state.stage);
      ctx.fillStyle = on ? '#3a2e10' : '#111a2b';
      ctx.fillRect(x, 34, 132, 62);
      ctx.strokeStyle = on ? '#fbbf24' : '#2f4468';
      ctx.lineWidth = on ? 2.5 : 1;
      ctx.strokeRect(x, 34, 132, 62);
      ctx.fillStyle = on ? '#fbbf24' : '#7d93b3';
      ctx.fillText((i + 1) + '. ' + state.stages[i].name, x + 8, 54);
      ctx.fillStyle = '#5b7397';
      ctx.fillText(state.stages[i].where, x + 8, 72);
      ctx.fillStyle = state.stages[i].editor ? '#34d399' : '#60a5fa';
      ctx.fillText(state.stages[i].once ? '一次·离线' : '可反复', x + 8, 88);
      if (i < 4) { ctx.strokeStyle = '#2f4468'; ctx.beginPath(); ctx.moveTo(x + 132, 65); ctx.lineTo(x + 142, 65); ctx.stroke(); }
    }
    ctx.fillStyle = '#9b8cff';
    ctx.fillText('数据形态: ' + state.stages[state.stage].cost, 12, 116);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('规则：贵的转码留在编辑器；运行时只做 字节 → GPU 纹理', 200, 116);

    // ---- 下半左：场景节点（行为）----
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('② 场景节点表（行为，各有 transform）', 12, 152);
    for (i = 0; i < state.refs; i++) {
      var nx = 20 + (i % 5) * 68, ny = 168 + Math.floor(i / 5) * 62;
      var flash = state.hot ? (0.4 + 0.6 * Math.abs(Math.sin(state.pulse * 6))) : 0;
      ctx.fillStyle = '#16233a'; ctx.fillRect(nx, ny, 58, 46);
      ctx.strokeStyle = flash > 0 ? 'rgba(52,211,153,' + flash.toFixed(2) + ')' : '#4a5f80';
      ctx.lineWidth = 1.5; ctx.strokeRect(nx, ny, 58, 46);
      ctx.fillStyle = '#e2e8f0'; ctx.fillText('Sprite' + (i + 1), nx + 6, ny + 20);
      ctx.fillStyle = '#7d93b3'; ctx.fillText('pos=' + (i * 7), nx + 6, ny + 36);
    }

    // ---- 下半右：资源缓存表（数据）----
    ctx.fillStyle = '#8fa7c7';
    ctx.fillText('③ ResourceCache（数据，按 path 索引）', 372, 152);
    var entries = state.duplicate ? state.refs : 1;
    var rowH = 40;
    for (i = 0; i < entries; i++) {
      var ey = 166 + i * rowH;
      var blink = state.hot ? (0.3 + 0.7 * Math.abs(Math.sin(state.pulse * 6 + i))) : 1;
      ctx.fillStyle = '#101a2a'; ctx.fillRect(372, ey, 336, rowH - 6);
      ctx.strokeStyle = state.hot ? 'rgba(251,191,36,' + blink.toFixed(2) + ')' : '#2f4468';
      ctx.strokeRect(372, ey, 336, rowH - 6);
      ctx.fillStyle = '#9b8cff';
      ctx.fillText('res://player.ctex' + (state.duplicate ? '#' + (i + 1) : ''), 380, ey + 14);
      ctx.fillStyle = '#7d93b3';
      ctx.fillText(state.duplicate ? 'rc=1（独立拷贝）' : 'rc=' + state.refs + '  shared', 380, ey + 30);
      ctx.fillStyle = '#5b7397';
      ctx.fillText(state.duplicate ? 'bytes=4.1M' : 'bytes=4.1M ×1', 600, ey + 30);
    }
    var total = entries * 4.1;
    ctx.fillStyle = state.duplicate ? '#f87171' : '#34d399';
    ctx.fillText('显存合计 ≈ ' + total.toFixed(1) + ' MB   （节点 ' + state.refs + ' 个 / 资源 ' + entries + ' 份）', 372, 152 + 20 + Math.max(entries, 1) * rowH);
    ctx.fillStyle = '#5b7397';
    ctx.fillText('资源是数据、节点是行为：分离才有共享与热重载', 12, 420);
    ctx.fillStyle = state.hot ? '#fbbf24' : '#5b7397';
    ctx.fillText(state.msg, 12, 442);
  }
});

function say(state, s) { state.msg = s; }
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>按 <b>A</b> 连按五次把引用者加到 9：左侧节点变多、右侧缓存始终一行，rc 跟着涨。这就是「load 同路径返回同一对象」的观感——省的不是磁盘字节，而是<b>解码成本与显存</b>。</li>
  <li>按 <b>B</b> 关掉缓存：右侧立刻裂成 N 行、显存翻 N 倍。现实中没人这么干（除非故意用 CacheMode CACHE_MODE_REPLACE 之类绕开缓存），但把它当反面教材看一眼：共享的前提是「路径即身份」。</li>
  <li>按 <b>R</b> 触发热重载：节点方块不动（transform、脚本状态全保留），只有缓存行的 rc 闪烁后换新数据。热重载之所以可能，正因为节点持有的只是<b>对资源的引用</b>，而不是资源内容本身。</li>
  <li>回到上半屏用 <b>← →</b> 逐站看「谁执行」那一行：绿色=编辑器（构建期），蓝色=运行时。想清楚第③站的昂贵转换永不发生在玩家机器上，就理解了导入管线的存在理由。</li>
</ul>`
    },
    {
      type: 'source',
      title: '源码走读：三条线各取一段',
      files: [
        { path: 'core/io/resource_loader.cpp', note: '找 ResourceCache::get_ref(local_path) 与 set_path_cache 那段：加载前先查缓存、命中就直接返回旧对象并丢弃刚解出来的实例——本课「同路径只有一份」的铁证；再看 load_threaded_get_status 四态机，理解按需异步加载。' },
        { path: 'scene/resources/resource_format_text.cpp', note: '.tres/.tscn 的解析器。看 ResourceLoaderText::load() 的两遍扫描：先收集所有 [ext_resource] 标签并对每个外部引用调 ResourceLoader::_load_start 发起（可并行的）加载，再建 [sub_resource] 与根资源并把 id 换成真对象——序列化存的是引用图，不是数据副本。' },
        { path: 'core/io/file_access_pack.cpp', note: 'PackedData / PckArchive：add_pack 时把包内文件名解析成一棵 PackedDir 哈希树，get_file 按 path 查表得到 offset+size 再从同一个大文件里切片打开。发布版没有散文件，res:// 只是查表的键。' },
        { path: 'editor/import/resource_importer_texture.cpp', note: '贴图导入器本体：get_save_extension 返回 ctex，_get_import_options 列出 compress/mode、mipmaps/generate 等参数（就是 .import 里那些键），save_to_ctex_format 按模式选 WebP lossy/lossless 或 VRAM 块压缩并写入 FORMAT_BIT_HAS_MIPMAPS 标志位——第③站的真实代码。' },
        { path: 'core/io/resource_importer.cpp', note: 'ResourceFormatImporter：exists/recognize_path 的判断条件是 p_path + ".import" 是否存在——运行时把源文件当资源读之前，先靠侧车找到对应的 ctex 路径；load_on_startup 函数指针则演示了「核心模块不依赖编辑器，但允许编辑器注入策略」的解耦手法。' }
      ]
    },
    {
      type: 'text',
      title: '小结：三个拷问的答案',
      html: `<p><b>数据怎么流动？</b>源文件 →（编辑器：参数+转码）→ .ctex 字节 →（运行时：一次）→ ResourceCache 里的对象 → N 个节点的引用 → RenderingServer 上传 GPU 纹理。每一段箭头都恰好跨越一次所有权边界，且都只走一次。</p>
<p><b>所有权归谁？</b>资源对象归 ResourceCache（以 path 为键）持有，使用方靠 Ref 的引用计数续命，rc 归零才 free；节点只拥有「我对某份数据的引用」。这解释了热重载：换的是缓存里那份数据，节点一根手指都不用动。</p>
<p><b>什么时候发生？</b>转码在编辑器（构建期，一次）；打包在导出时（把 imported/ 塞进 pck）；解析与缓存在运行时首次 load（每路径一次）；GPU 上传在渲染器需要时（还可能延迟/流式）。把这条时间轴记牢，任何引擎的资源系统你都能拆出同样的四层。</p>`
    }
  ]
}
