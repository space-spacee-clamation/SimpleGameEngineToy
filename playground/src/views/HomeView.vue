<script setup>
import { computed, ref } from 'vue'
import { STAGES, ALL_LESSONS } from '../data/course.js'
import { progress } from '../store/progress.js'

const readyLessons = computed(function () {
  return ALL_LESSONS.filter(function (l) { return l.status === 'ready' })
})
const doneCount = computed(function () {
  return readyLessons.value.filter(function (l) { return progress.done.indexOf(l.id) >= 0 }).length
})
const nextLesson = computed(function () {
  for (var i = 0; i < ALL_LESSONS.length; i++) {
    var l = ALL_LESSONS[i]
    if (l.status === 'ready' && progress.done.indexOf(l.id) < 0) return l
  }
  return null
})
const stageDone = computed(function () {
  var map = {}
  STAGES.forEach(function (s) {
    var ready = s.lessons.filter(function (l) { return l.status === 'ready' })
    var done = ready.filter(function (l) { return progress.done.indexOf(l.id) >= 0 })
    map[s.id] = done.length + ' / ' + ready.length
  })
  return map
})

const copied = ref('')
function copyText(text) {
  var ok = function () { flash(text) }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, function () { fallbackCopy(text, ok) })
  } else {
    fallbackCopy(text, ok)
  }
}
function fallbackCopy(text, ok) {
  var ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch (e) {}
  document.body.removeChild(ta)
  ok()
}
function flash(text) {
  copied.value = text
  setTimeout(function () { if (copied.value === text) copied.value = '' }, 1800)
}

var PROMPTS = [
  { k: 'continue', label: '继续下一课', text: '打开 COURSE_PLAN.md 看进度，我们继续上下一课。' },
  { k: 'make', label: '现做指定课', text: '按 COURSE_PLAN.md 的课程表，给我现做 L4.1（GPU 管线 + 第一个三角形）：按平台规范加一节带实践板块的课程页。' },
  { k: 'deepen', label: '深化实验', text: '我想把 L0.1 的实验再深入一点：帮我加一个 …（描述想要的效果）。' }
]
</script>

<template>
  <div class="wrap">
    <section class="hero">
      <div class="kicker">GAME ENGINE DESIGN · 学习工坊</div>
      <h1>游戏引擎设计<span class="accent"> · 以 Godot 源码为镜</span></h1>
      <p class="sub">
        借开源引擎 Godot 学「引擎设计与复杂系统架构」。我们学的不是怎么用 Godot，
        而是引擎为什么这样设计。每课一个<b>写完就能跑</b>的实践板块：JS 实验台 · HLSL Shader 实验室 · 物理沙盒。
      </p>
      <div class="stats">
        <span class="chip">实践课 {{ doneCount }} / {{ readyLessons.length }} 已完成</span>
        <span class="chip">{{ ALL_LESSONS.length }} 课 · {{ STAGES.length }} 阶段</span>
        <span class="chip">Shader 用 HLSL</span>
        <span class="chip">没有课后作业</span>
      </div>
    </section>

    <section v-if="nextLesson" class="continue-card">
      <div>
        <div class="cc-label">接下来上</div>
        <div class="cc-title">{{ nextLesson.id }} · {{ nextLesson.title }}</div>
        <div class="cc-sub">{{ nextLesson.brief }}</div>
      </div>
      <router-link class="btn primary" :to="'/lesson/' + nextLesson.id">▶ 开始学习</router-link>
    </section>

    <section v-for="s in STAGES" :key="s.id" class="stage">
      <header class="stage-head">
        <span class="stage-dot" :style="{ background: s.color }"></span>
        <h2>{{ s.name }}</h2>
        <span class="stage-count">{{ stageDone[s.id] }}</span>
      </header>
      <p class="stage-goal">{{ s.goal }}</p>
      <div class="lesson-list">
        <template v-for="l in s.lessons" :key="l.id">
          <router-link v-if="l.status === 'ready'" class="lesson-row ready" :to="'/lesson/' + l.id">
            <span class="lid">{{ l.id }}</span>
            <span class="ltitle">{{ l.title }}</span>
            <span class="lmeta">{{ l.est }}</span>
            <span class="badge ready-b">可上课</span>
          </router-link>
          <div v-else class="lesson-row planned">
            <span class="lid">{{ l.id }}</span>
            <span class="ltitle">{{ l.title }}<span class="lbrief">{{ l.brief }}</span></span>
            <span class="lmeta">{{ l.est }}</span>
            <span class="badge plan-b">随堂现做</span>
          </div>
        </template>
      </div>
    </section>

    <section class="prompts">
      <h2>和导师配合</h2>
      <p class="muted">开新会话，复制一句开场白：</p>
      <div v-for="p in PROMPTS" :key="p.k" class="prompt-row">
        <span class="p-label">{{ p.label }}</span>
        <code class="p-text">{{ p.text }}</code>
        <button class="btn" @click="copyText(p.text)">复制</button>
      </div>
      <div v-if="copied" class="copied">已复制：{{ copied }}</div>
    </section>
  </div>
</template>

<style scoped>
.hero { padding: 46px 0 10px; }
.kicker { color: #4d8fd6; font-size: 12px; letter-spacing: 2px; font-family: ui-monospace, Consolas, monospace; }
h1 { font-size: 30px; margin: 8px 0 10px; }
h1 .accent { color: #4d8fd6; font-size: 22px; }
.sub { color: #9db4d0; max-width: 760px; }
.sub b { color: #d7e0ea; }
.stats { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.chip { color: #9db4d0; border: 1px solid #24334c; border-radius: 999px; padding: 4px 12px; background: #101827; font-size: 12.5px; }
.continue-card {
  margin-top: 26px; display: flex; justify-content: space-between; align-items: center; gap: 16px;
  background: linear-gradient(135deg, #12233c, #0f1a2c); border: 1px solid #2a4a74;
  border-radius: 14px; padding: 18px 22px; flex-wrap: wrap;
}
.cc-label { color: #6ee7b7; font-size: 12.5px; letter-spacing: 1px; }
.cc-title { font-size: 18px; font-weight: 700; margin: 2px 0; }
.cc-sub { color: #9db4d0; font-size: 13.5px; }
.stage { margin-top: 34px; }
.stage-head { display: flex; align-items: center; gap: 10px; }
.stage-head h2 { font-size: 18px; margin: 0; color: #cfe3ff; }
.stage-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.stage-count { margin-left: auto; color: #7d93b3; font-size: 12.5px; font-family: ui-monospace, Consolas, monospace; }
.stage-goal { color: #7d93b3; font-size: 13.5px; margin: 4px 0 12px; }
.lesson-list { border: 1px solid #1e2a3d; border-radius: 12px; overflow: hidden; }
.lesson-row {
  display: flex; align-items: center; gap: 12px; padding: 11px 16px;
  border-bottom: 1px solid #16202f; background: #0e1626;
}
.lesson-row:last-child { border-bottom: none; }
.lesson-row.ready { cursor: pointer; }
.lesson-row.ready:hover { background: #12203a; }
.lesson-row.planned { opacity: 0.62; }
.lid { font-family: ui-monospace, Consolas, monospace; color: #4d8fd6; font-size: 13px; width: 46px; flex: none; }
.ltitle { flex: 1; font-size: 14.5px; }
.lbrief { display: block; color: #7d93b3; font-size: 12.5px; }
.lmeta { color: #7d93b3; font-size: 12.5px; flex: none; }
.badge { flex: none; font-size: 11.5px; border-radius: 999px; padding: 2px 10px; }
.ready-b { background: #123529; color: #6ee7b7; border: 1px solid #1f6f4d; }
.plan-b { background: #1a2233; color: #7d93b3; border: 1px solid #24334c; }
.prompts { margin: 44px 0 30px; }
.prompts h2 { font-size: 18px; color: #cfe3ff; }
.muted { color: #7d93b3; font-size: 13.5px; }
.prompt-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; flex-wrap: wrap; }
.p-label { color: #6ee7b7; font-size: 13px; width: 92px; flex: none; }
.p-text { flex: 1; min-width: 260px; }
.copied { color: #6ee7b7; font-size: 13px; margin-top: 6px; }
</style>
