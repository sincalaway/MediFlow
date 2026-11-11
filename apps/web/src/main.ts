// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import naive from 'naive-ui'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'

createApp(App).use(createPinia()).use(router).use(naive).mount('#app')
