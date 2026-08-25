import { createApp } from 'vue'; import { createRouter,createWebHistory } from 'vue-router'; import App from './App.vue'; import './style.css'; import './extra.css'; import './path-colors.css';
import ProgressBar from './components/ProgressBar.vue';
const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:()=>import('./views/DashboardView.vue')},{path:'/paths',component:()=>import('./views/PathsView.vue')},{path:'/items',component:()=>import('./views/ItemsView.vue')},{path:'/timeline',component:()=>import('./views/TimelineView.vue')} ]});
createApp(App).component('ProgressBar',ProgressBar).use(router).mount('#app');
