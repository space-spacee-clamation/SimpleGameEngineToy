<script setup>
import CodeLab from './CodeLab.vue'
import ShaderLab from './ShaderLab.vue'
import PhysicsLab from './PhysicsLab.vue'

defineProps({ block: { type: Object, required: true }, lessonId: { type: String, required: true } })
</script>

<template>
  <section class="block">
    <h3 v-if="block.title && block.type === 'text'" class="block-title">{{ block.title }}</h3>
    <div v-if="block.type === 'text'" class="rich" v-html="block.html"></div>

    <template v-else-if="block.type === 'lab'">
      <CodeLab
        v-if="block.lab === 'code'"
        :code="block.code" :title="block.title"
        :height="block.height || 460"
        :persist-key="lessonId + ':' + (block.key || block.title)" />
      <ShaderLab
        v-else-if="block.lab === 'shader'"
        :code="block.code" :title="block.title"
        :height="block.height || 460"
        :persist-key="lessonId + ':' + (block.key || block.title)" />
      <PhysicsLab
        v-else-if="block.lab === 'physics'"
        :code="block.code" :title="block.title"
        :height="block.height || 460"
        :persist-key="lessonId + ':' + (block.key || block.title)" />
    </template>

    <div v-else-if="block.type === 'source'" class="source">
      <div class="src-head">📁 源码走读 <span class="src-note">（相对 godot/ 目录）</span></div>
      <ul>
        <li v-for="(f, i) in block.files" :key="i">
          <code>{{ f.path }}</code>
          <span class="src-note">—— {{ f.note }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.block { margin: 34px 0; }
.block-title {
  font-size: 17px; color: #cfe3ff; margin: 0 0 10px;
  padding-left: 10px; border-left: 3px solid #4d8fd6;
}
.rich :deep(p) { margin: 10px 0; }
.rich :deep(ul) { margin: 8px 0; padding-left: 22px; }
.rich :deep(li) { margin: 4px 0; }
.rich :deep(h4) { margin: 18px 0 6px; color: #9fc3ff; }
.source {
  background: #0e1626; border: 1px solid #1e2a3d; border-radius: 12px;
  padding: 14px 18px;
}
.src-head { color: #ffd479; font-weight: 600; margin-bottom: 8px; }
.src-head .src-note { color: #7d93b3; font-weight: 400; font-size: 12.5px; }
.source ul { margin: 0; padding-left: 20px; }
.source li { margin: 6px 0; }
.src-note { color: #7d93b3; font-size: 13px; }
</style>
