import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import LessonView from './views/LessonView.vue'

// hash 路由：保证 dist 产物在 file:// 下也能正常工作
export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
    { path: '/lesson/:id', component: LessonView, props: true }
  ]
})
