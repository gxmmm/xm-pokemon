import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.ts';
import { useGameStore } from './stores/game.ts';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/load-error', name: 'load-error', component: () => import('./views/LoadErrorView.vue') },
    { path: '/new', name: 'new', component: () => import('./views/NewGameView.vue'), meta: { requiresAuth: true } },
    { path: '/', redirect: '/world' },
    { path: '/world', name: 'world', component: () => import('./views/WorldView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/battle', name: 'battle', component: () => import('./views/BattleView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/team', name: 'team', component: () => import('./views/TeamView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/pokemon/:uid', name: 'pokemon', component: () => import('./views/PokemonDetailView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/breed', name: 'breed', component: () => import('./views/BreedView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/pokedex', name: 'pokedex', component: () => import('./views/PokedexView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/pvp', name: 'pvp', component: () => import('./views/PvpView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/shop', name: 'shop', component: () => import('./views/ShopView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/battle-stage-sandbox', name: 'battle-stage-sandbox', component: () => import('./views/BattleStageSandboxView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/battle-sandbox', name: 'battle-sandbox', component: () => import('./views/BattleSandboxView.vue') },
    { path: '/vfx-lab', name: 'vfx-lab', component: () => import('./views/VfxLabView.vue'), meta: { publicSandbox: true } },

    { path: '/world-stage-sandbox', name: 'world-stage-sandbox', component: () => import('./views/WorldStageSandboxView.vue'), meta: { requiresAuth: true, requiresSave: true } },
    { path: '/:pathMatch(.*)*', redirect: '/world' },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.publicSandbox || to.name === 'battle-sandbox' || to.name === 'vfx-lab') return true;
  const visualRegressionMode = to.query['visual-regression'] === '1'
    && (to.name === 'world-stage-sandbox' || to.name === 'battle-stage-sandbox');
  if (visualRegressionMode) return true;
  if (to.name === 'load-error') return true;
  const auth = useAuthStore();
  if (!auth.ready && !await auth.restore()) return { name: 'load-error' };
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login' };
  if (auth.isAuthenticated) {
    const game = useGameStore();
    if (!game.loaded && !await game.load()) return { name: 'load-error' };
    if (to.name === 'login') return { name: game.hasSave ? 'world' : 'new' };
    if (to.name === 'new' && game.hasSave) return { name: 'world' };
    if (to.meta.requiresSave && !game.hasSave) return { name: 'new' };
  }
  return true;
});
