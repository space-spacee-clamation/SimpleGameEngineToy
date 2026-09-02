<script setup>
import { computed, ref, watch } from 'vue'
import { ALL_LESSONS, findLesson, findStageOf } from '../data/course.js'
import { LESSONS } from '../lessons/index.js'
import { isDone, toggleDone } from '../store/progress.js'
import LabBlock from '../components/LabBlock.vue'

const props = defineProps({ id: { type: String, required: true } })

const meta = computed(function () { return findLesson(props.id) })
const stage = computed(function () { return findStageOf(props.id) })
const content = computed(function () { return LESSONS[props.id] || null })
const idx = computed(function () {
  for (var i = 0; i < ALL_LESSONS.length; i++) {
    if (ALL_LESSONS[i].id === props.id) return i
  }
  return -1
})
const prevL = computed(function () { return idx.value > 0 ? ALL_LESSONS[idx.value - 1] : null })
const nextL = computed(function () {
  return idx.value >= 0 && idx.value < ALL_LESSONS.length - 1 ? ALL_LESSONS[idx.value + 1] : null
})
const done = computed(function () { return isDone(props.id) })

watch(function () { return props.id }, function () { window.scrollTo(0, 0) })

const copied = ref(false)
function makePrompt() {
  return '按 COURSE_PLAN.md 给我现做 ' + props.id + '《' + (meta.value ? meta.value.title : '') + '》：按平台规范加一节带实践板块的课程页。'
}
function copyMakePrompt() {
  var text = makePrompt()
  var ok = function () { copied.value = true }
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
</script>

<template>
  <div class="wrap" v-if="meta">
    <nav class="crumbs">
      <router-link to="/">门户</router-link>
      <span class="sep">/</span>
      <span v-if="stage" :style="{ color: stage.color }">{{ stage.name }}</span>
    </nav>

    <header class="lesson-head">
      <div class="lh-row">
        <span class="lid">{{ meta.id }}</span>
        <h1>{{ meta.title }}</h1>
        <span class="est">{{ meta.est }}</span>
        <button class="btn" :class="done ? 'done' : ''" @click="toggleDone(meta.id)">
          {{ done ? '✓ 已完成' : '标记完成' }}
        </button>
      </div>
      <ul class="questions" v-if="content && content.coreQuestions">
        <li v-for="(q, i) in content.coreQuestions" :key="i">{{ q }}</li>
      </ul>
    </header>

    <template v-if="content">
      <LabBlock v-for="(b, i) in content.sections" :key="i" :block="b" :lesson-id="content.id" />
    </template>

    <div v-else class="planned-panel">
      <h2>这一课还没制作</h2>
      <p>{{ meta.brief }}</p>
      <p class="muted">每课的实践板块由导师按你的学习节奏随堂现做。复制下面的话发给导师：</p>
      <code class="make-prompt">{{ makePrompt() }}</code>
      <div class="make-actions">
        <button class="btn primary" @click="copyMakePrompt">复制开场白</button>
        <span v-if="copied" class="ok">已复制 ✓</span>
      </div>
    </div>

    <nav class="pager">
      <router-link v-if="prevL" class="btn" :to="'/lesson/' + prevL.id">← {{ prevL.id }}</router-link>
      <span v-else></span>
      <router-link v-if="nextL" class="btn" :to="'/lesson/' + nextL.id">{{ nextL.id }} →</router-link>
    </nav>
  </div>

  <div class="wrap" v-else>
    <p>课程不存在：<code>{{ id }}</code></p>
  </div>
</template>

<style scoped>
.crumbs { padding-top: 22px; font-size: 13px; color: #7d93b3; }
.crumbs .sep { margin: 0 8px; color: #3a4d6b; }
.lesson-head { margin-top: 14px; }
.lh-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lh-row h1 { font-size: 24px; margin: 0; flex: 1; min-width: 280px; }
.lid { font-family: ui-monospace, Consolas, monospace; color: #4d8fd6; font-size: 15px; }
.est { color: #7d93b3; font-size: 13px; }
.questions { margin: 14px 0 0; padding: 14px 18px; list-style: none; background: #0e1626; border: 1px solid #1e2a3d; border-radius: 12px; }
.questions li { margin: 4px 0; color: #9db4d0; font-size: 14px; }
.questions li::before { content: '❓ '; opacity: 0.7; }
.planned-panel {
  margin-top: 26px; padding: 26px; background: #0e1626;
  border: 1px dashed #2a3a55; border-radius: 14px;
}
.planned-panel h2 { margin: 0 0 8px; font-size: 19px; }
.planned-panel .muted { color: #7d93b3; font-size: 13.5px; }
.make-prompt { display: block; margin: 12px 0; padding: 10px 14px; }
.make-actions { display: flex; align-items: center; gap: 12px; }
.ok { color: #6ee7b7; font-size: 13px; }
.pager { display: flex; justify-content: space-between; margin: 40px 0 10px; }
</style>
