import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import DocView from '@/views/DocView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/docs/getting-started'
  },
  {
    path: '/docs/:slug',
    name: 'DocView',
    component: DocView
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: DocView
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' };
    }
    return { top: 0 };
  }
});
