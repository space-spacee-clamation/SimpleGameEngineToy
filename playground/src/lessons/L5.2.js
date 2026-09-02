// L5.2 · 从零写刚体求解：冲量与穿透修正
export default {
  id: 'L5.2',
  title: '从零写刚体求解：冲量与穿透修正',
  est: '3 小时',
  coreQuestions: [
    '碰撞发生后，两个物体如何「合理地」弹开？（冲量法）',
    '为什么物体会互相穿透？怎么修？（位置修正及其代价）',
    '堆叠的物体为什么需要多次迭代求解？'
  ],
  sections: [
    {
      type: 'text',
      title: '碰撞三段式',
      html: `<p>上一课解决了「谁碰上了」（检测），这一课解决「碰上之后怎么办」。物理引擎每步做三件事：</p>
<pre>① 积分     v += g·h ;  x += v·h        // 半隐式欧拉（先速度后位置，更稳定）
② 检测     collide(a, b) → 相交信息（法线 n、穿透深度 depth）
③ 响应     resolve(a, b, hit) → 改变速度 + 分开重叠</pre>
<p>响应的标准武器是<b>冲量（impulse）</b>——瞬时速度改变量。核心公式只有两行：</p>
<pre>v_rel · n &gt; 0 时跳过（两球正在分开，别多管闲事）
j = -(1 + e) · (v_rel · n) / (1/m_a + 1/m_b)     // e = 弹性系数
v_a -= j·n / m_a ;   v_b += j·n / m_b</pre>
<p>而「穿透」是离散步长的宿命：这一步结束时两球已经重叠了。做法是<b>位置修正</b>：把两球沿法线硬性分开（乘个 0.8 的系数，留余量防抖动——又是一个工程取舍）。</p>`
    },
    {
      type: 'lab',
      lab: 'physics',
      key: 'solver',
      title: '实验：你的 2D 物理引擎（参考实现已能跑，改进它）',
      height: 540,
      code: `// 物理沙盒：下面是一个「能跑的参考实现」。
// 积分与墙碰撞由运行器完成；你面前的是检测与响应两段。
// 试着改进它：调反弹、加摩擦、改修正系数看抖动……

physics.run({
  // 碰撞检测：两球是否重叠？返回法线（a→b）与穿透深度
  collide: function (a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var r = a.r + b.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 === 0) return null;
    var d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  },

  // 冲量响应：让两球「合理地」弹开并分开重叠
  resolve: function (a, b, hit, params) {
    // 1) 位置修正：按质量反比分开 80% 的穿透（1.0 会抖，试试看）
    var corr = hit.depth * 0.8;
    var invA = 1 / a.m;
    var invB = 1 / b.m;
    var invSum = invA + invB;
    a.x -= hit.nx * corr * (invA / invSum);
    a.y -= hit.ny * corr * (invA / invSum);
    b.x += hit.nx * corr * (invB / invSum);
    b.y += hit.ny * corr * (invB / invSum);

    // 2) 冲量：只在相互靠近时施加（velN > 0 表示正在分开）
    var rvx = b.vx - a.vx;
    var rvy = b.vy - a.vy;
    var velN = rvx * hit.nx + rvy * hit.ny;
    if (velN > 0) return;

    var e = params.restitution;
    var j = -(1 + e) * velN / invSum;
    a.vx -= j * invA * hit.nx;  a.vy -= j * invA * hit.ny;
    b.vx += j * invB * hit.nx;  b.vy += j * invB * hit.ny;
  }
});
`
    },
    {
      type: 'text',
      title: '试一试',
      html: `<ul>
  <li>反弹滑条拉到 0：完全非弹性碰撞，球堆慢慢「融化」成一坨——真实的黏土物理。</li>
  <li>把修正系数 <code>0.8</code> 改成 <code>1.0</code>，再让球堆落地：重叠被 100% 消除，但球堆开始<b>抖动</b>（jitter）——过度修正与反复唤醒的经典案例。</li>
  <li>加摩擦（进阶）：算切向速度 <code>t = (-ny, nx)</code>，对切向相对速度也来一次小冲量——球落地后会滚会停。</li>
  <li>把「子步」滑条从 2 拉到 8，扔一堆球叠塔：迭代越多堆叠越稳——真实引擎叫 solver iterations，代价是 CPU。</li>
</ul>`
    },
    {
      type: 'source',
      files: [
        { path: 'modules/godot_physics_2d/godot_space_2d.cpp', note: 'Godot 2D 物理每步的调度中枢：检测→求解→修正的顺序与迭代次数都在这个空间（space）文件里。' }
      ]
    },
    {
      type: 'text',
      title: '小结',
      html: `<p>80 行你就拥有了一个可玩的物理引擎核心。商业引擎在这之上加的是：旋转（角动量）、任意凸形（GJK/EPA）、堆叠稳定性（顺序冲量 + warm starting）、休眠机制……L5.3 我们看 Godot 如何把这层包成「无头 Server」，让物理与场景树彻底解耦。</p>`
    }
  ]
}
