// H4 · 反馈色光语言:闪白、暗角与色偏
export default {
  id: 'H4',
  title: '反馈色光语言：闪白、暗角与色偏',
  est: '2 小时',
  coreQuestions: [
    '为什么说屏幕效果是游戏状态的「第二语言」？',
    '暗角为什么天然表达「血量低」？色偏怎么暗示中毒/冰冻？',
    '受击闪白的时长和覆盖范围藏着什么讲究？',
    '这些后处理的强度为什么必须「有语义地」驱动，而不是随手挂上去？'
  ],
  sections: [
  {
    type: 'text',
    title: '屏幕是一块可以说话的肌肉',
    html: `<p>玩家盯着屏幕中心，所以<b>屏幕的边缘和颜色就是天生的旁白</b>：血量低时边缘泛起红色暗角——「危险从视野外包围你」；受击瞬间全屏闪白——「这一下结结实实」；中毒时绿色缓缓渗入——「状态在侵蚀」。这些效果共同构成 H 系列的「反馈语言」：不打断玩家，却持续报告状态。</p>
<table>
  <tr><th>效果</th><th>语义</th><th>驱动源</th></tr>
  <tr><td>暗角 vignette</td><td>低血量/危险迫近</td><td>HP 阈值（持续强度）+ 突发伤害（脉冲）</td></tr>
  <tr><td>闪白 flash</td><td>受击/确认/必杀瞬间</td><td>一次性事件（50~120ms 指数衰减）</td></tr>
  <tr><td>色偏 tint</td><td>状态持续（毒/冻/狂暴）</td><td>状态存在与否（低频呼吸更高级）</td></tr>
</table>`
  },
  {
    type: 'text',
    title: '实现细节里的讲究',
    html: `<p><b>闪白要指数衰减</b>：flash 强度 = exp(-t·k)，前 30ms 打满、100ms 内基本消退——线性衰减会显得「钝」。<b>暗角要两层</b>：常驻层跟 HP 走（低于 30% 缓慢渗出），脉冲层跟事件走（挨打瞬间涨一截再落回）——只做常驻层玩家会麻木，只做脉冲层又缺少持续压迫感。</p>
<p><b>色偏要有呼吸</b>：中毒的绿不是恒定叠加，而是 sin 低频呼吸（0.5~1Hz）——恒定色偏 5 秒后玩家就「看不见」了（视觉适应），呼吸让状态持续可感。本课实验把「HP/受击/状态」全部用 u_time 与 u_mouse 模拟出来：真实引擎里换成一个 uniform 就接上游戏逻辑。</p>`
  },
  {
    type: 'lab',
    lab: 'shader',
    key: 'feedback',
    title: '实验：暗角 + 闪白 + 色偏三合一（状态用时间模拟）',
    height: 620,
    code: `float4 main(float2 uv : TEXCOORD0) : SV_TARGET {
  // 模拟游戏状态:hp 周期下降回升 / 每 4 秒受击一次 / 状态色跟随鼠标高度
  float hp = 0.5 + 0.5 * sin(u_time * 0.5 - 1.2);        // 血量在 0~1 间波动
  float hit = exp(-frac(u_time / 4.0) * 12.0) * step(0.5, frac(u_time / 4.0) < 0.25 ? 1.0 : 0.0);
  float status = u_mouse.y;                               // 鼠标上下=状态强度(毒/冻)

  // 画一个极简「游戏画面」:地面网格 + 玩家(中下) + 两只巡逻怪(绕圈)
  float2 p = uv;
  float3 col = float3(0.05, 0.07, 0.11);
  float grid = (frac(p.x * 22) < 0.04 || frac(p.y * 16) < 0.04) ? 0.5 : 0.0;
  col += grid * float3(0.06, 0.09, 0.13);
  float2 player = float2(0.5, 0.32);
  float dP = length((p - player) * float2(1, 1.4));
  col = lerp(col, float3(1.0, 0.83, 0.47), smoothstep(0.045, 0.035, dP));
  float2 e1 = float2(0.5 + 0.3 * sin(u_time * 0.9), 0.62 + 0.1 * cos(u_time * 1.3));
  float2 e2 = float2(0.5 + 0.34 * cos(u_time * 0.7 + 2), 0.55 + 0.12 * sin(u_time * 1.1 + 1));
  col = lerp(col, float3(0.95, 0.44, 0.44), smoothstep(0.05, 0.04, length(p - e1)));
  col = lerp(col, float3(0.95, 0.44, 0.44), smoothstep(0.05, 0.04, length(p - e2)));

  // ① 受击闪白:全屏白,指数衰减(前 1/4 周期才触发)
  col = lerp(col, float3(1, 1, 1), hit * 0.85);

  // ② 低血量暗角:常驻层(hp 越低越浓) + 危险红
  float edge = smoothstep(0.28, 0.75, length(p - float2(0.5, 0.5)));
  float lowHp = smoothstep(0.45, 0.0, hp);
  col = lerp(col, float3(0.25, 0.0, 0.0), edge * lowHp * (0.55 + 0.2 * sin(u_time * 2.2)));

  // ③ 状态色偏:绿色毒(呼吸) 或 蓝色冻
  float breathe = 0.5 + 0.5 * sin(u_time * 3.0);
  float3 poison = float3(0.1, 0.5, 0.12);
  float3 frozen = float3(0.15, 0.4, 0.75);
  float3 tintCol = lerp(poison, frozen, step(0.5, u_mouse.x));
  col = lerp(col, tintCol, status * breathe * 0.35);

  return float4(col, 1);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>盯住 hp 曲线：</b>hp 走低时边缘的红色暗角缓缓渗出并轻微呼吸——玩家不用看血条就知道「该撤了」。</li>
  <li><b>等受击瞬间：</b>每 4 秒一次的全屏闪白以指数速度消退——把 12.0 改成 4.0 感受「钝」掉的闪白，改 25.0 感受「脆」的。</li>
  <li><b>鼠标上下滑动：</b>状态色偏的强度跟着变；<b>鼠标左右</b>切换毒绿/冰蓝——同一个色偏通道，两种语义。</li>
  <li><b>组合语义：</b>把 hp 调到最低、鼠标移到顶部——暗角红 + 毒绿呼吸 + 刚好赶上一次闪白：三层语言同时说话，玩家读出的是「残血、中毒、正在挨打」。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：引擎后处理的挂载点',
    files: [
      { path: 'servers/rendering/renderer_rd/shaders/effects/tonemap.glsl', note: '色调映射与 glow 合体的后处理大 shader：暗角/闪光这类全屏效果最终都挂在 tonemap 前后。建议搜索：tonemap、glow、vignette。' },
      { path: 'servers/rendering/renderer_rd/shaders/effects/luminance_reduce_raster.glsl', note: '自动曝光的亮度统计：暗角与色偏的强度也可以由画面亮度反馈驱动。建议搜索：luminance、reduce。' },
      { path: 'servers/rendering/renderer_rd/environment/fog.cpp', note: '环境雾的参数体系：depth fog/aerial perspective——另一种「用颜色报告距离与状态」的语言。建议搜索：fog、aerial、density。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>反馈色光是「屏幕肌肉」的语言学：暗角讲压迫、闪白讲确认、色偏讲状态——好的反馈设计让玩家<b>用余光读懂战局</b>。引擎侧它们都是全屏后处理的几个参数，真正的功夫在「用游戏状态有语义地驱动强度」。</p>
<ul>
  <li><b>数据怎么流动？</b>游戏状态（HP/事件/状态效果）→强度 uniform→全屏 shader 的三段混合（flash→vignette→tint）→输出。</li>
  <li><b>所有权归谁？</b>状态归游戏逻辑，强度归反馈系统（常驻层+脉冲层两本账），最终合成归后处理管线。</li>
  <li><b>什么时候发生？</b>事件触发脉冲（闪白/暗角脉冲）、状态驱动常驻（暗角常驻层/呼吸色偏）——持续性看状态、瞬间性看事件，永不多说一个字。</li>
</ul>`
  }
  ]
};
