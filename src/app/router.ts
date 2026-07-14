import { createRouter, createWebHistory } from 'vue-router'
import { ROUTE_NAMES } from '@/shared/config/index.ts'
import { ArenaPage } from '@/pages/arena/index.ts'
import { PickerPage } from '@/pages/picker/index.ts'

// Every challenge gets its own URL: /challenge/<slug>, slug derived from the
// title (same slug in every language). Visiting one starts a fresh run.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: ROUTE_NAMES.picker, component: PickerPage },
    { path: '/challenge/:slug', name: ROUTE_NAMES.challenge, component: ArenaPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
