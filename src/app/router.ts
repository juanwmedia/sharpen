import { createRouter, createWebHistory } from 'vue-router'
import { getScenarioBySlug } from '@scenarios/index.ts'
import { slugify } from '@scenarios/slug.ts'
import { ROUTE_NAMES } from '@/shared/config/index.ts'
import { ArenaPage } from '@/pages/arena/index.ts'
import { PickerPage } from '@/pages/picker/index.ts'

function scenarioPath(pack: string, title: string): string {
  return `/${pack}/${slugify(title)}`
}

function redirectLegacySlug(to: { params: { slug?: string | string[] } }): string {
  const slug = String(to.params.slug ?? '')
  const scenario = getScenarioBySlug(slug)
  return scenario ? scenarioPath(scenario.pack, scenario.title.en) : '/'
}

// Public URLs are /:pack/:slug (e.g. /git/clean-sweep). Pack is the category
// (git, typescript, …); slug comes from title.en: one URL across languages.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: ROUTE_NAMES.picker, component: PickerPage },
    { path: '/:pack/:slug', name: ROUTE_NAMES.scenario, component: ArenaPage },
    // Legacy deep links.
    { path: '/challenge/:slug', redirect: redirectLegacySlug },
    { path: '/scenarios/:slug', redirect: redirectLegacySlug },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
