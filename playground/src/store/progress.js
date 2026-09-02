import { reactive } from 'vue'

// 学习进度：存在浏览器 localStorage，跨会话保留
const KEY = 'ged-progress-v1'

function load() {
  try {
    var raw = localStorage.getItem(KEY)
    var arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

export const progress = reactive({ done: load() })

export function isDone(id) {
  return progress.done.indexOf(id) >= 0
}

export function toggleDone(id) {
  var i = progress.done.indexOf(id)
  if (i >= 0) progress.done.splice(i, 1)
  else progress.done.push(id)
  save()
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress.done))
  } catch (e) {}
}
