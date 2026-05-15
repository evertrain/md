import { initializeMermaid } from '@md/core/utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'

import { setupComponents } from './utils/setup-components'

import 'vue-sonner/style.css'

/* 每个页面公共css */
import '@/assets/index.css'
import '@/assets/less/theme.less'

// 异步初始化 mermaid，避免初始化顺序问题
initializeMermaid().catch(console.error)

setupComponents()

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

app.mount(`#app`)

/** 供 markdown-cli 等工具通过 CDP 调用主题/渲染；需配合 setActivePinia 使用 */
window.__MD_CLI__ = { pinia, setActivePinia }
