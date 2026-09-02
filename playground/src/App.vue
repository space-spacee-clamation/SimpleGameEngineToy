<script setup>
import { computed } from 'vue'
import { progress } from './store/progress.js'
import { ALL_LESSONS } from './data/course.js'

const readyList = computed(function () {
  return ALL_LESSONS.filter(function (l) { return l.status === 'ready' })
})
const doneReady = computed(function () {
  return readyList.value.filter(function (l) { return progress.done.indexOf(l.id) >= 0 }).length
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <router-link to="/" class="brand">▸ 游戏引擎设计<span class="accent"> · 学习工坊</span></router-link>
      <div class="chip">实践课进度 {{ doneReady }} / {{ readyList.length }}</div>
    </header>
    <main class="main"><router-view /></main>
    <footer class="footer">借开源引擎 Godot 学「游戏引擎设计与复杂系统架构」 · 课程页与实践板块由导师随堂制作 · 进度保存在本浏览器</footer>
  </div>
</template>

<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: #0b0f17; color: #d7e0ea;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
  font-size: 15px; line-height: 1.65;
}
.app { min-height: 100vh; display: flex; flex-direction: column; }
.main { flex: 1; }
.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 24px; border-bottom: 1px solid #1e2a3d;
  background: #0d1220; position: sticky; top: 0; z-index: 100;
}
.brand { color: #d7e0ea; text-decoration: none; font-weight: 700; font-size: 16px; letter-spacing: 0.4px; }
.brand:hover .accent { color: #6db1e8; }
.accent { color: #4d8fd6; }
.chip {
  font-size: 12.5px; color: #9db4d0; border: 1px solid #24334c;
  border-radius: 999px; padding: 4px 12px; background: #101827;
}
.footer { padding: 16px 24px; color: #586d8a; font-size: 12.5px; border-top: 1px solid #1e2a3d; }
.wrap { max-width: 1060px; margin: 0 auto; padding: 0 24px; }
.btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
  border-radius: 8px; border: 1px solid #2a3a55; background: #152033;
  color: #d7e0ea; cursor: pointer; font-size: 13px; text-decoration: none;
  transition: border-color .15s, background .15s;
}
.btn:hover { border-color: #4d8fd6; }
.btn.primary { background: #2760a0; border-color: #2e6fb8; color: #fff; }
.btn.primary:hover { background: #2f70b8; }
.btn.done { background: #123529; border-color: #1f6f4d; color: #6ee7b7; }
code {
  font-family: ui-monospace, Consolas, 'Cascadia Mono', monospace;
  background: #101a2b; border: 1px solid #1c2a42; border-radius: 5px;
  padding: 1px 6px; font-size: 0.92em; color: #a8c7ee;
}
pre {
  background: #0d1524; border: 1px solid #1c2a42; border-radius: 10px;
  padding: 14px 16px; overflow: auto; font-size: 13px; line-height: 1.55;
}
pre code { background: none; border: none; padding: 0; color: #cfe3ff; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { border: 1px solid #1e2a3d; padding: 7px 12px; text-align: left; }
th { background: #101a2b; color: #9db4d0; font-weight: 600; }
a { color: #6db1e8; }
</style>
