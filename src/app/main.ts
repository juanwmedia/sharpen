import '@/shared/lib/buffer-shim.ts'
import '@wterm/dom/css'
import './styles/main.css'
import { createApp } from 'vue'
import { i18n } from '@/shared/i18n/index.ts'
import App from './App.vue'
import { router } from './router.ts'

document.documentElement.lang = i18n.global.locale.value

createApp(App).use(i18n).use(router).mount('#app')
