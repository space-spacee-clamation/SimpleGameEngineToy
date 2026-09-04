// 课程总数据：9 个阶段 · 26 课（与 COURSE_PLAN.md 保持同步）
// status: 'ready' = 平台上有可上课的实践课；'planned' = 待导师随堂制作

export const STAGES = [
  {
    id: 'P0', name: '阶段 0 · 引擎全景', color: '#478cbf',
    goal: '建立「引擎 = 循环 + 分层服务」的心智模型，拿到一张引擎解剖图。',
    lessons: [
      { id: 'L0.1', title: '用 100 行代码造一个「引擎」', est: '60–90 分钟', status: 'ready',
        brief: '主循环、帧、更新与绘制：引擎的最小内核在浏览器里跑起来。' },
      { id: 'L0.2', title: '引擎解剖图：Godot / Unity / Unreal 分层对比', est: '90 分钟', status: 'ready',
        brief: '运行时与工具链的边界；为什么 Godot 有 servers/ 这一层。' }
    ]
  },
  {
    id: 'P1', name: '阶段 1 · 时间与主循环', color: '#5aa9e6',
    goal: '吃透引擎的时间观：固定步长、累积器、插值与螺旋死亡。',
    lessons: [
      { id: 'L1.1', title: '时间步长实验台：固定步长与螺旋死亡', est: '90 分钟', status: 'ready',
        brief: '可变 dt 为什么不可靠；固定步长 + 累积器；亲手制造一次 spiral of death。' },
      { id: 'L1.2', title: '走读 Godot 的一帧：Main::iteration', est: '2 小时', status: 'ready',
        brief: '从 OS 消息循环到你的 _process，一帧的完整调用链。' }
    ]
  },
  {
    id: 'P2', name: '阶段 2 · 对象系统与架构模式', color: '#9b8cff',
    goal: '看懂引擎的对象模型：场景树 vs ECS、Variant、信号与内存策略。',
    lessons: [
      { id: 'L2.1', title: '场景树 vs ECS：两种世界观', est: '2.5 小时', status: 'ready',
        brief: '组合优于继承如何落地；数据导向为什么缓存友好。' },
      { id: 'L2.2', title: 'Godot 对象模型：Object / Variant / 信号', est: '2 小时', status: 'ready',
        brief: 'C++ 类如何长出反射、脚本与序列化能力。' },
      { id: 'L2.3', title: '引擎内存管理：引用计数、Arena 与 COW', est: '2 小时', status: 'ready',
        brief: '引擎为什么慎用通用堆；四种策略各自的坑。' },
      { id: 'L2.4', title: '脚本如何驱动 C++：GDScript VM 与绑定层', est: '2.5 小时', status: 'ready',
        brief: '一次 GDScript 调用穿透到 C++ 的完整路径。' }
    ]
  },
  {
    id: 'P3', name: '阶段 3 · 数学与空间', color: '#6ee7b7',
    goal: '变换、四元数与引擎数学库的设计取舍。',
    lessons: [
      { id: 'L3.1', title: '变换与四元数：万向节死锁可视化', est: '2 小时', status: 'ready',
        brief: '为什么旋转不用欧拉角；slerp 为什么安全。' },
      { id: 'L3.1A', title: '四元数的数学原理：从复数到旋转公式', est: '2 小时', status: 'ready',
        brief: 'L3.1 补充：哈密顿积、夹心公式 q·v·q*、双倍覆盖与 slerp 的数学推导，全部可拖可验。' },
      { id: 'L3.2', title: '引擎数学库设计：SIMD、缓存与布局', est: '1.5 小时', status: 'ready',
        brief: '引擎数学库和教科书数学差在哪。' }
    ]
  },
  {
    id: 'P4', name: '阶段 4 · 渲染系统', color: '#f472b6',
    goal: '从第一个三角形到渲染器架构，建立完整的 GPU 心智模型。',
    lessons: [
      { id: 'L4.1', title: 'GPU 管线总览 + 第一个三角形', est: '2.5 小时', status: 'ready',
        brief: '一次 draw call 里 GPU 做了什么；CPU/GPU 的边界。' },
      { id: 'L4.2', title: 'Shader 实验室：用 HLSL 手写光照', est: '2–3 小时', status: 'ready',
        brief: '实时编辑片元着色器：渐变 → 圆盘 → Lambert → Blinn-Phong → 菲涅尔。' },
      { id: 'L4.3', title: '渲染器架构：RenderingServer 与剔除', est: '2.5 小时', status: 'ready',
        brief: '场景树和渲染数据为什么是两棵树；视锥剔除可视化。' },
      { id: 'L4.4', title: '帧缓冲与后处理：HDR、Bloom 与阴影', est: '2 小时', status: 'ready',
        brief: '多 Pass 渲染：场景 → 亮度提取 → 模糊 → 合成。' }
    ]
  },
  {
    id: 'P5', name: '阶段 5 · 物理系统', color: '#f59e0b',
    goal: '从零实现最小物理引擎，理解 PhysicsServer 的分层。',
    lessons: [
      { id: 'L5.1', title: '碰撞检测：空间网格 vs 暴力 O(n²)', est: '2 小时', status: 'ready',
        brief: 'broadphase 的意义：同一场景，配对数差出一个数量级。' },
      { id: 'L5.2', title: '从零写刚体求解：冲量与穿透修正', est: '3 小时', status: 'ready',
        brief: '可编辑的 2D 物理沙盒：检测、冲量、修正三段式。' },
      { id: 'L5.3', title: 'PhysicsServer：无头服务层与 Jolt', est: '2 小时', status: 'ready',
        brief: '物理为什么做成 Server；换后端的接口边界画在哪。' }
    ]
  },
  {
    id: 'P6', name: '阶段 6 · 资源系统', color: '#34d399',
    goal: '资源与节点的分离、序列化与导入管线。',
    lessons: [
      { id: 'L6.1', title: '资源与导入管线：.tres / pck / 热重载', est: '2 小时', status: 'ready',
        brief: '一张 png 到场景可用之间发生了什么。' }
    ]
  },
  {
    id: 'P7', name: '阶段 7 · 玩法支撑系统', color: '#60a5fa',
    goal: '输入、UI、动画、音频四大支撑系统的架构。',
    lessons: [
      { id: 'L7.1', title: '输入、事件与 UI：事件路由与 Immediate GUI', est: '2 小时', status: 'ready',
        brief: '一次按键的旅程：OS → Input → Viewport → Control。' },
      { id: 'L7.2', title: '动画系统：骨骼、蒙皮与状态机', est: '2.5 小时', status: 'ready',
        brief: '动画数据长什么样；混合树解决什么。' },
      { id: 'L7.3', title: '音频系统：混音器与 3D 空间音频', est: '1.5 小时', status: 'ready',
        brief: '60fps 游戏如何平滑输出 48kHz 音频（两套时钟）。' }
    ]
  },
  {
    id: 'P8', name: '阶段 8 · 引擎级进阶', color: '#c084fc',
    goal: '多线程、网络、编辑器——引擎级复杂系统架构。',
    lessons: [
      { id: 'L8.1', title: '多线程与 Job System：任务并行', est: '2.5 小时', status: 'ready',
        brief: '主线程/渲染线程分工；WorkerThreadPool 与任务图。' },
      { id: 'L8.2', title: '网络同步：状态同步、帧同步与回滚', est: '2.5 小时', status: 'ready',
        brief: '本地延迟模拟沙盒：亲手治疗网络拉扯。' },
      { id: 'L8.3', title: '编辑器架构：Undo/Redo 与编辑器即场景', est: '2 小时', status: 'ready',
        brief: '命令模式；反射生成 Inspector。' }
    ]
  },
  {
    id: 'P9', name: '阶段 9 · 毕业实战', color: '#fbbf24',
    goal: '方法论沉淀与毕业项目。',
    lessons: [
      { id: 'L9.1', title: '大型 C++ 项目阅读方法论', est: '2 小时', status: 'ready',
        brief: '垂直走读 vs 水平走读；三条 Godot 走读线路。' },
      { id: 'L9.2', title: '毕业项目：给 Godot 加功能 / mini-engine / 深度报告', est: '自定', status: 'ready',
        brief: '可展示、可讲述、可被追问。' }
    ]
  },
  {
    id: 'P10', name: '阶段 10 · 进阶专题', color: '#38bdf8',
    goal: '毕业后的深水区：一课打穿一个细节（大纲见 ADVANCED_PLAN.md）。',
    lessons: [
      { id: 'A1', title: '连续碰撞检测 CCD：子弹为什么能穿过薄墙', est: '2 小时', status: 'ready',
        brief: '离散检测的时间盲区；子步细分 vs 前瞻接触 vs 扫掠判定的取舍。' },
      { id: 'A3', title: '求解器进阶：迭代、暖启动与 island', est: '2.5 小时', status: 'ready',
        brief: 'sequential impulse 全景；为什么塔会抖、会果冻。' },
      { id: 'B1', title: '液体渲染 I：2D 粒子流体（SPH）', est: '2.5 小时', status: 'ready',
        brief: '密度、压强、黏性三项力；先造行为再造外观。' },
      { id: 'B2', title: '液体渲染 II：让粒子看起来像水', est: '2 小时', status: 'ready',
        brief: 'metaball 密度场挤出、屏幕空间平滑、法线重建。' },
      { id: 'B3', title: '液体渲染 III：波动方程水面', est: '2 小时', status: 'ready',
        brief: 'heightfield 波动方程、法线重建、折射反射配色。' },
      { id: 'B4', title: '可破坏场景 I：像素/体素破坏', est: '2.5 小时', status: 'ready',
        brief: '破坏 mask、连通域分析、孤岛坠落。' },
      { id: 'B5', title: '可破坏场景 II：预分片与运行时切割', est: '2 小时', status: 'ready',
        brief: 'Voronoi 预切、碰撞激活脱落、二次破碎。' },
      { id: 'C2', title: '手写 mini-ECS I：Query 与 System', est: '2.5 小时', status: 'ready',
        brief: '200 行落地 archetype 存储、位掩码 Query 与 System。' },
      { id: 'H1', title: '输入手感：缓冲窗口与土狼时间', est: '2 小时', status: 'ready',
        brief: '为什么有的跳跃「就是舒服」：输入缓冲、土狼时间、可变跳高。' },
      { id: 'H2', title: '打击感三件套：hit-stop、震屏、闪白', est: '2 小时', status: 'ready',
        brief: '时间停顿+空间震动+色彩脉冲的三层叠加。' },
      { id: 'I2', title: '波函数坍缩 WFC：从瓦片到无限城市', est: '2.5 小时', status: 'ready',
        brief: '最小熵坍缩+约束传播+回溯，局部规则涌现全局结构。' },
      { id: 'J1', title: 'PBR：从 Blinn-Phong 到金属度/粗糙度', est: '2.5 小时', status: 'ready',
        brief: '能量守恒、菲涅尔、微表面——L4.2 的直系进阶。' },
      { id: 'G1', title: 'IK 反向运动学：脚要踩在地上', est: '2 小时', status: 'ready',
        brief: '解析解与迭代法；动画管动作，IK 管最后几厘米。' },
      { id: 'A2', title: '接触流形：两个盒子的接触不止一个点', est: '2 小时', status: 'ready',
        brief: 'SAT→选面→裁剪；多点流形才有稳定堆叠。' },
      { id: 'A4', title: '约束的艺术：关节、马达与布娃娃', est: '2 小时', status: 'ready',
        brief: '关节=每步成立的约束方程；可断关节=阈值移除。' },
      { id: 'B6', title: '阴影专题：shadow mapping 的十大坑', est: '2.5 小时', status: 'ready',
        brief: 'acne、peter-panning、PCF、CSM——bias 在漏检与误伤间走钢丝。' },
      { id: 'A5', title: '软体入门：PBD——把「力」换成「位置」', est: '2 小时', status: 'ready',
        brief: 'Verlet 布料、距离约束投影、撕裂与迭代次数；Godot 内置软体就是 PBD，Jolt 是 XPBD。' },
      { id: 'B7', title: '透明物排序与 OIT 一瞥', est: '2 小时', status: 'ready',
        brief: '混合不可交换；穿插玻璃板的四种活法；Godot 2D z 桶/y-sort 与 3D 透明列表排序。' },
      { id: 'B8', title: 'Raymarching 专题：没有网格的渲染', est: '2 小时', status: 'ready',
        brief: 'SDF、sphere tracing、布尔 CSG 白送、数值法线；引擎里字面命名的 raymarch 在 voxel_gi。' },
      { id: 'C1', title: 'ECS 世界观：archetype vs sparse set vs Node', est: '2 小时', status: 'ready',
        brief: '三种存储的内存布局与遍历命运；查询便宜是布局送的，不是代码送的。' },
      { id: 'C3', title: '手写 mini-ECS II：调度、脏标记与事件', est: '2.5 小时', status: 'ready',
        brief: '拓扑调度、版本号脏标记、帧末事件派发——给 C2 的骨架装上管家婆三层。' },
      { id: 'C4', title: 'ECS 落地：渲染/物理/网络怎么吃 ECS', est: '2.5 小时', status: 'ready',
        brief: '同一款小游戏双架构各写一遍：帧耗时、快照体积、选型决策表——C 系列收官。' },
      { id: 'D1', title: '高度场地形 I：从噪声到法线', est: '2.5 小时', status: 'ready',
        brief: '多倍频噪声、中央差分法线、坡度分层——heightmap 管线全景三联视图。' },
      { id: 'D2', title: '高度场地形 II：LOD 与裙边', est: '2 小时', status: 'ready',
        brief: 'chunk 分级、边界 T-junction 裂缝、裙边与迟滞——顶点经济学沙盘。' },
      { id: 'D3', title: '无限世界流式加载：cell 与内存预算', est: '2 小时', status: 'ready',
        brief: '同步硬加载的尖峰 vs 异步预算的平滑；LRU 卸载——需求与供给的帧时间战争。' },
      { id: 'D4', title: '粒子系统架构：CPU vs GPU 粒子', est: '2 小时', status: 'ready',
        brief: 'emitter×affector×pool 三段式；万级 SoA 粒子池与模拟/绘制成本分离。' },
      { id: 'D5', title: '植被与 instancing：一棵草到一万棵草', est: '2 小时', status: 'ready',
        brief: '逐个画 vs 批量画的帧耗时实测；数据存一份、位置走属性流。' },
      { id: 'D6', title: '天空与大气一瞥：为什么天是渐变的', est: '2 小时', status: 'ready',
        brief: '昼夜渐变、日落橙、太阳盘与星夜——大气散射的加法近似配方。' },
      { id: 'E1', title: '定点数与确定性：帧同步的地基', est: '2 小时', status: 'ready',
        brief: 'float vs 定点对照跑万步，哈希对账分叉现场——确定性是帧同步的命。' },
      { id: 'E2', title: '增量压缩与快照：带宽经济学', est: '2 小时', status: 'ready',
        brief: '文本全量/定长量化/增量位打包三条曲线同屏对账，MTU 预算下数着比特过日子。' },
      { id: 'E3', title: '兴趣管理 AOI：只发看得见的', est: '2 小时', status: 'ready',
        brief: '200 实体全发 16KB/s、圈定兴趣集只剩零头——大世界的网络裁剪。' },
      { id: 'E4', title: '录制与回放：反外挂的引擎地基', est: '2 小时', status: 'ready',
        brief: '只录输入重跑全世界；改一帧看哈希链崩盘，首个分叉帧当场点名。' },
      { id: 'E5', title: '时间同步与时钟漂移', est: '2 小时', status: 'ready',
        brief: 'ping 估偏移的噪声、硬跳与缓调的性格、双时钟重采样——克隆角色的卡顿账。' },
      { id: 'F1', title: '寻路：A*、JPS 与 navmesh', est: '2.5 小时', status: 'ready',
        brief: '启发权重旋钮、开放集扩散可视化、string pulling 平滑——网格到 navmesh 的桥。' },
      { id: 'F2', title: '群体避障：boids、flow field 与 RVO 一瞥', est: '2 小时', status: 'ready',
        brief: '500 单位三种大脑实时切换：涌现的活感、查表的秩序、几何的礼让。' },
      { id: 'F3', title: '相机系统：跟随、震屏与遮挡处理', est: '2 小时', status: 'ready',
        brief: '四种跟随策略 + trauma 震屏——手感是被滤波出来的。' },
      { id: 'G2', title: '程序化动画与弹簧骨骼', est: '2 小时', status: 'ready',
        brief: '12 节弹簧链：刚度/阻尼两个旋钮调出千种尾巴，鞭子效应现场甩给你看。' },
      { id: 'F4', title: '行为树与 AI 决策：BT vs GOAP vs HTN', est: '2 小时', status: 'ready',
        brief: '黑板+打断+调试视图：每帧重 tick 的 AI 为什么天生可打断。' },
      { id: 'F5', title: 'UI 深水区：合批、裁剪与 9-slice', est: '2 小时', status: 'ready',
        brief: '同屏 UI 两本账：draw call 从几十塌缩到 3；脏矩形与裁剪的可视化。' },
      { id: 'F6', title: '引擎调试工具链：debug draw、控制台与 HUD', est: '2 小时', status: 'ready',
        brief: '五层观察沙盘：碰撞框/速度/射线/网格/剖析条，带帧号的引擎自省。' },
      { id: 'G3', title: '样条与路径：Catmull-Rom 与 Bézier', est: '2 小时', status: 'ready',
        brief: '过点 vs 逼近两种哲学；弧长重参数化治好「忽快忽慢」的走点。' },
      { id: 'G4', title: '变形目标：BlendShape 与表情', est: '2 小时', status: 'ready',
        brief: 'final = base + Σwᵢ·deltaᵢ：权重叠加表情，冲突区现场演示。' },
      { id: 'H3', title: '时间系统架构：timeScale 与分层时间', est: '2 小时', status: 'ready',
        brief: '子弹时间/顿帧/区域减速——全局缩放+实体时钟+真实秒计时器四件套。' },
      { id: 'H4', title: '反馈色光语言：闪白、暗角与色偏', est: '2 小时', status: 'ready',
        brief: '暗角讲压迫、闪白讲确认、色偏讲状态——屏幕肌肉的语言学。' },
      { id: 'I1', title: '噪声大观：Perlin、Simplex 与 Worley', est: '2 小时', status: 'ready',
        brief: '四噪声全家福四联屏：格点存数值还是存梯度、fbm 旋钮、Worley 细胞。' },
      { id: 'I3', title: 'L-system 与结构生长', est: '2 小时', status: 'ready',
        brief: '重写规则+龟绘图：角度/衰减/迭代三旋钮，看着一棵树从字符串里长出来。' },
      { id: 'I4', title: '引擎级随机数：种子流与确定性', est: '2 小时', status: 'ready',
        brief: '种子/流分离/坏算法的条纹——存档回放敢押注的地基。' },
      { id: 'J2', title: '颜色空间：gamma 的骗局', est: '2 小时', status: 'ready',
        brief: '三联屏对比：sRGB 直接混合的糊、线性混合的净、忘编码的泛白。' },
      { id: 'J3', title: 'mipmap 与纹理走样：远处为什么闪烁', est: '2 小时', status: 'ready',
        brief: '欠采样的摩尔纹烟花 vs 三线性与各向异性的安静糊法。' },
      { id: 'J4', title: '2D 光照与视野多边形', est: '2 小时', status: 'ready',
        brief: '墙角三射线求可见多边形；格子 FOV——同一道几何题的连续与离散版。' },
      { id: 'K1', title: 'DSP 基础：采样、量化与混叠', est: '2 小时', status: 'ready',
        brief: '奈奎斯特线外的频率折返成假音；量化阶梯——示波器+频谱双视角。' },
      { id: 'K2', title: '程序化音效：振荡器、包络与滤波', est: '2 小时', status: 'ready',
        brief: '波形×包络×滤波三件套：示波器+谐波条，8-bit 音效的合成现场。' }
    ]
  }
]

export const ALL_LESSONS = STAGES.reduce(function (arr, s) { return arr.concat(s.lessons) }, [])

export function findLesson(id) {
  for (var i = 0; i < ALL_LESSONS.length; i++) {
    if (ALL_LESSONS[i].id === id) return ALL_LESSONS[i]
  }
  return null
}

export function findStageOf(id) {
  for (var i = 0; i < STAGES.length; i++) {
    var ls = STAGES[i].lessons
    for (var j = 0; j < ls.length; j++) {
      if (ls[j].id === id) return STAGES[i]
    }
  }
  return null
}
