// D6 · 天空与大气一瞥:为什么天是渐变的
export default {
  id: 'D6',
  title: '天空与大气一瞥：为什么天是渐变的',
  est: '2 小时',
  coreQuestions: [
    '天空的渐变从哪来——为什么天顶深蓝、地平发白？',
    '日落为什么是橙红色的？大气散射在太阳低角度时做了什么？',
    '游戏引擎的「物理天空」和「渐变天空」各在买什么？',
    '星星为什么只在夜里出现、越靠天顶越亮？'
  ],
  sections: [
  {
    type: 'text',
    title: '天不是一张渐变贴图，是一条光路',
    html: `<p>白天天顶深蓝、地平线发白，是因为阳光进大气后被空气分子<b>散射</b>：波长短的蓝光散射得最厉害（Rayleigh 散射）。你抬头看到的「天空色」，是整条视线上被散射进眼睛的阳光积分——<b>视线越贴近地平线，穿过的大气越厚，蓝光被反复散射、混入更多白光，所以地平发白</b>。</p>
<p>日落时太阳贴着地平线，阳光斜穿几十倍厚度的大气，蓝绿半路被散光殆尽，只剩橙红直达你的眼睛——<b>夕阳不是太阳变红了，是蓝光在半路被扣下了</b>。引擎里的「物理天空」就是在 shader 里实时算这套散射的近似（预积分表 + Rayleigh/Mie 两项）；「渐变天空」则干脆把结果烘成一张图，便宜但日落后不会变橙。</p>`
  },
  {
    type: 'text',
    title: '本课的近似配方',
    html: `<p>实时渲染的精髓是<b>把物理攒成几项便宜的近似</b>。本课天空 = 五个成分的加法：</p>
<table>
  <tr><th>成分</th><th>近似公式</th><th>对应物理</th></tr>
  <tr><td>天顶-地平渐变</td><td>lerp(天顶色, 地平色, pow(1-up, 3))</td><td>视线穿大气厚度差</td></tr>
  <tr><td>昼夜</td><td>太阳高度 smoothstep 出 daylight，插值两套配色</td><td>太阳入射角</td></tr>
  <tr><td>日落橙</td><td>exp(-|太阳高度|·k) × 地平权重 × 朝日权重</td><td>斜穿厚大气只剩红光</td></tr>
  <tr><td>太阳盘与光晕</td><td>视线·太阳方向的 smoothstep / pow</td><td>直射 + 前向散射（Mie）</td></tr>
  <tr><td>星夜</td><td>方向网格哈希 + 夜晚权重遮罩</td><td>背景天光暗下去才可见</td></tr>
</table>
<p>Godot 的物理天空 shader（见走读）是这套配方的重装版：预积分的 Rayleigh/Mie 查表。原理同源，精度不同。</p>`
  },
  {
    type: 'lab',
    lab: 'shader',
    key: 'sky',
    title: '实验：昼夜渐变天空（u_time 驱动太阳高度）',
    height: 620,
    code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
  // 昼夜天空:太阳高度=sin(u_time*0.35),完整走过日出-正午-日落-星夜
  // 天顶-地平渐变 + 日落橙 + 太阳盘/光晕 + 夜晚星点,全部是加法近似
  float sunH = sin(u_time * 0.35) * 0.9 - 0.05;
  float3 sd = normalize(float3(0.25, sunH, 0.8));
  float3 dir = normalize(float3((uv.x - 0.5) * 1.8, (uv.y - 0.3) * 1.7, 1.0));
  float day = smoothstep(-0.12, 0.3, sunH);
  float up = clamp(dir.y, 0.0, 1.0);

  // 天顶-地平渐变:视线越平,大气越厚,越接近地平色
  float3 zen = lerp(float3(0.02, 0.03, 0.09), float3(0.20, 0.42, 0.78), day);
  float3 hor = lerp(float3(0.05, 0.07, 0.12), float3(0.66, 0.78, 0.90), day);
  float horiz = pow(1.0 - up, 3.0);
  float3 col = lerp(zen, hor, horiz);

  // 日落橙:太阳贴地平线时,朝太阳那侧染橙
  float sunDot = dot(dir, sd);
  float sunset = exp(-abs(sunH) * 5.0);
  col += float3(0.95, 0.45, 0.12) * sunset * horiz * clamp(sunDot * 0.5 + 0.5, 0.0, 1.0);

  // 太阳盘 + 前向散射光晕
  col += float3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9998, sunDot);
  col += float3(1.0, 0.85, 0.55) * pow(max(sunDot, 0.0), 350.0) * 0.6;
  col += float3(0.9, 0.6, 0.35) * pow(max(sunDot, 0.0), 8.0) * 0.18 * (1.0 - day * 0.5);

  // 星夜:方向网格哈希,夜越深星越亮,越靠天顶越可见
  float nightMask = 1.0 - smoothstep(0.0, 0.35, sunH);
  float2 gp = floor(dir.xy * 160.0);
  float sh = sin(dot(gp, float2(12.9898, 78.233))) * 43758.5453;
  float h = sh - floor(sh);
  float star = step(0.992, h) * nightMask * (0.5 + 0.5 * sin(u_time * 3.0 + h * 40.0));
  col += float3(0.9, 0.95, 1.0) * star * smoothstep(0.15, 0.5, up);

  // 轻微提亮
  col = pow(col, float3(0.92, 0.92, 0.92));
  return float4(col, 1.0);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>等一场日落：</b>让 u_time 跑，太阳落向地平线的几十秒里看橙色先从地平线两侧涨起来、再随太阳沉没熄灭——「蓝光被扣下」的直观版。</li>
  <li><b>调太阳速度：</b>把 0.35 改成 0.05，一天变成两分钟；改成 0，把任一时刻定格成永恒的黄昏。</li>
  <li><b>改配色：</b>把天顶日色 float3(0.20,0.42,0.78) 改成(0.1,0.5,0.5)，得到一颗「外星天空」——渐变结构不变，只有调色板换了。</li>
  <li><b>调日落浓度：</b>把 exp(-abs(sunH)*5.0) 的 5.0 改小到 2.0，橙色统治更久——这就是「大气厚度」旋钮的玩具版。</li>
  <li><b>看星星：</b>太阳沉到 -0.35 以下，星点浮现且越靠天顶越密——nightMask 和 up 权重各自工作。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎的天空与大气',
    files: [
      { path: 'servers/rendering/renderer_rd/environment/sky.cpp', note: '天空的宿主：PanoramaSkyMaterial（全景图）与 PhysicalSkyMaterial（物理天空）的分配与更新——「烘好的渐变」与「实时散射」在这里分岔。建议搜索：PhysicalSkyMaterial、sky_material、update。' },
      { path: 'servers/rendering/renderer_rd/shaders/environment/sky.glsl', note: '天空渲染 shader 本体：物理模式的 Rayleigh/Mie 散射近似就在这里（本课配方的工业完全体）。建议搜索：rayleigh、mie、atmosphere。' },
      { path: 'servers/rendering/renderer_rd/environment/fog.cpp', note: '大气雾：深度雾/高度雾如何与天空色衔接——地平线「白茫茫」的另一半来源。建议搜索：fog、density、aerial。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>天空的本质是「沿视线的大气光学积分」，游戏的实现是它的廉价近似：渐变贴图是零阶近似，本课的配方是一阶，物理天空的预积分查表是高阶——价格逐级上涨，肉眼差距逐级变小。</p>
<ul>
  <li><b>数据怎么流动？</b>太阳方向（时间驱动）→视线方向→五个近似成分的加权和→像素色；fog 再用同一套大气观把远处物体染向天空色。</li>
  <li><b>所有权归谁？</b>天空材质持有配色/散射参数，渲染后端持有积分实现；你的游戏只持有「几点钟」。</li>
  <li><b>什么时候发生？</b>渐变天空每帧只是几次插值；物理天空的散射表预计算一次、每帧查表——「什么时候算」的分工正是实时渲染的全部艺术。</li>
</ul>`
  }
  ]
};
