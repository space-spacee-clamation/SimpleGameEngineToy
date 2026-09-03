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
