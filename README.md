# 🎮 SimpleGameEngineToy — 游戏引擎设计学习工坊

> 借开源引擎 [Godot](https://github.com/godotengine/godot) 的源码，系统学习「游戏引擎设计与复杂系统架构」。
> 核心不是学会「怎么用 Godot」，而是理解「引擎为什么这样设计」。

## 这是什么

一个为「用过引擎、熟悉 C++/C#、但没研究过引擎内部」的玩家定制的私人课程：

- **每课一个写完就能跑的实践板块**（没有课后作业，一切练习课内即时完成）
- 三种实验组件：**CodeLab**（JS 实验台）、**ShaderLab**（HLSL 实时转译 WebGL）、**PhysicsLab**（2D 刚体沙盒）
- 每课附带 **Godot 真实源码走读清单**（路径都经过质检脚本核验）
- 课程范围：主循环 / 对象系统与 ECS / 数学与四元数 / 渲染管线与 Shader / 物理 / 资源 / 输入·动画·音频 / 多线程·网络·编辑器 / 毕业项目，另有进阶深水区专题（碰撞策略 / 液体渲染 / 可破坏场景 / ECS 手写 / 游戏手感 / 程序化生成 / PBR / IK 等）

## 快速开始

```bash
# 1) 克隆（godot 是 git 子模块，记得 --recurse-submodules）
git clone --recurse-submodules <本仓库地址>
cd SimpleGameEngineToy

# 2) 安装依赖并构建（dist 缺失时 start.py 也会尝试自动构建）
cd playground && pnpm install && pnpm build && cd ..

# 3) 启动本地服务（或直接双击 start.bat）
python start.py       # 浏览器自动打开 http://127.0.0.1:5217/
```

> ⚠️ 不要直接双击 dist/index.html：ES module 产物被浏览器禁止在 file:// 下加载，必须走本地服务（start.py 就是干这个的）。

## 目录结构

| 路径 | 说明 |
|---|---|
| `start.py` / `start.bat` | 一键启动：本地服务 + 自动打开浏览器 |
| `COURSE_PLAN.md` | 课程规划主文档（大纲 / 约定 / 给 AI 会话的工作流） |
| `ADVANCED_PLAN.md` | 进阶专题规划（12 方向 57 课：碰撞策略 / 液体渲染 / 可破坏场景 / ECS / 手感 / 程序化生成等，✅ 全部 57 课已上线） |
| `playground/` | 学习平台（Vue 3 + Vite + CodeMirror 5） |
| `playground/src/lessons/` | 课程数据模块（每课一个 JS 文件） |
| `playground/src/lib/hlsl2glsl.js` | HLSL → GLSL 实时转译器 |
| `playground/tools/check-lesson.mjs` | 课程质检脚本 |
| `godot/` | **git 子模块**：Godot 引擎源码（浅克隆主干） |

## 课程总览（主线 9 阶段 27 课 ✅ 全部上线（含补充课 L3.1A）+ 进阶专题 P10 57 课 ✅ 全部上线）

| 阶段 | 主题 | 状态 |
|---|---|---|
| P0 | 引擎全景 | ✅ |
| P1 | 时间与主循环 | ✅ |
| P2 | 对象系统与架构模式（场景树 vs ECS / Variant / 内存 / 脚本绑定） | ✅ |
| P3 | 数学与空间（四元数 / 数学库设计） | ✅ |
| P4 | 渲染系统（GPU 管线 / HLSL Shader / 渲染器架构 / 后处理） | ✅ |
| P5 | 物理系统（空间网格 / 刚体求解 / PhysicsServer 与 Jolt） | ✅ |
| P6 | 资源系统（.tres / pck / 热重载） | ✅ |
| P7 | 玩法支撑（输入 UI / 动画 / 音频） | ✅ |
| P8 | 引擎级进阶（Job System / 网络同步 / 编辑器架构） | ✅ |
| P9 | 毕业实战（阅读方法论 / 毕业项目） | ✅ |
| P10 | 进阶专题（碰撞物理深水区 / 液体渲染 / 可破坏场景 / mini-ECS / 大世界与粒子 / 网络确定性 / 玩法算法与工具链 / 角色动画 / 手感反馈 / 程序化生成 / 图形管线 / 音频 DSP / 引擎系统补遗） | ✅ 已上线 57/57 |

进度以平台内打卡（localStorage）为准；✅ = 平台上已有可上课的实践内容。

进阶深水区按 12 方向规划共 57 课（碰撞物理 / 渲染 / ECS / 大世界 / 网络确定性 / 玩法算法 / 角色动画 / 手感反馈 / 程序化生成 / 图形管线 / 音频 DSP / 引擎系统补遗），完整大纲与已上线清单见 `ADVANCED_PLAN.md`。

## 开发备忘

```bash
cd playground
pnpm dev                        # 开发模式（热更新）
pnpm build                      # 产出 dist/
node tools/check-lesson.mjs L0.1  # 课程质检（默认代码干跑 + 源码路径核验），进阶课同理：node tools/check-lesson.mjs A1
```

- Shader 一律写 **HLSL**，由 `hlsl2glsl.js` 实时转译给 WebGL（与 DirectX / Godot shader 语法同源）
- 新课流程见 `COURSE_PLAN.md` §4：产出 lessons/LX.Y.js → 注册 → 质检 → 构建

## 提交代码

仓库配有本地专用提交脚本 `push.bat`（已被 .gitignore，不入库）：

```bash
push.bat 修复某实验            # 带提交信息
push.bat                       # 会提示输入信息
```

SSH 推送使用仓库级配置的专用密钥（`core.sshCommand`，仅本机生效，不入库）。
