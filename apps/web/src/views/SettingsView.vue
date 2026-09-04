<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore } from '../stores/game.ts';
import { useAuthStore } from '../stores/auth.ts';
import { useMessage } from '../stores/message.ts';
import { useRouter } from 'vue-router';
import BackHub from '../components/BackHub.vue';
import { updateVisualRuntimeSettings, visualRuntimeSettings } from '../visuals/runtime-settings.ts';
import type { CameraIntensity } from '@pokemon-online/renderer';

const game = useGameStore();
const auth = useAuthStore();
const msg = useMessage();
const router = useRouter();
const leaving = ref(false);

function setSpeed(s: number): void { game.updateSettings({ battleSpeed: s }); }
function toggleMusic(): void { game.updateSettings({ music: !game.save!.settings.music }); }
function toggleSfx(): void { game.updateSettings({ sfx: !game.save!.settings.sfx }); }
function toggleReduceFlicker(): void { updateVisualRuntimeSettings({ reduceFlicker: !visualRuntimeSettings.value.reduceFlicker }); }
function setCameraIntensity(cameraIntensity: CameraIntensity): void { updateVisualRuntimeSettings({ cameraIntensity }); }

async function logout(): Promise<void> {
  if (leaving.value) return;
  leaving.value = true;
  try {
    if (!await msg.confirm('保存当前进度后退出登录？', { title: '退出登录' })) return;
    do {
      if (!await game.persist(true)) {
        msg.error('保存失败，已保留当前进度。请重试后再退出。');
        return;
      }
      // Settings or team edits made during a slow request need another flush.
    } while (game.unsaved);
    auth.logout();
    game.reset();
    await router.replace({ name: 'login' });
  } finally {
    leaving.value = false;
  }
}

async function manualSave(): Promise<void> {
  if (await game.persist(true)) msg.success('已手动保存到云端');
  else msg.error('保存失败，请检查网络后重试');
}
</script>

<template>
  <div v-if="game.save">
    <div class="panel" style="margin-bottom:12px">
      <div class="between" style="margin-bottom:8px">
        <h2 class="h-title" style="margin:0">设置</h2>
        <BackHub />
      </div>
      <div class="tiny muted">账号：{{ auth.username }} · 玩家ID：{{ auth.playerId }}</div>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bold" style="margin-bottom:8px">战斗速度</div>
      <div class="row">
        <button v-for="s in [1,2,3]" :key="s" :class="{ gold: game.save.settings.battleSpeed===s }" @click="setSpeed(s)">{{ s }}x</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="between">
        <span>背景音乐</span>
        <button class="sm" :class="{ gold: game.save.settings.music }" @click="toggleMusic">{{ game.save.settings.music ? '开' : '关' }}</button>
      </div>
      <div class="between" style="margin-top:8px">
        <span>音效</span>
        <button class="sm" :class="{ gold: game.save.settings.sfx }" @click="toggleSfx">{{ game.save.settings.sfx ? '开' : '关' }}</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bold" style="margin-bottom:8px">视觉与可访问性</div>
      <div class="between">
        <div><span>减少闪烁</span><div class="tiny muted">降低 GPU 特效、转场与环境动态的闪烁感</div></div>
        <button class="sm" :class="{ gold: visualRuntimeSettings.reduceFlicker }" @click="toggleReduceFlicker">{{ visualRuntimeSettings.reduceFlicker ? '开' : '关' }}</button>
      </div>
      <div style="margin-top:12px">
        <div class="between" style="margin-bottom:6px"><span>镜头强度</span><span class="tiny muted">仅影响 GPU 演出镜头</span></div>
        <div class="row">
          <button v-for="option in [
            { value: 'full', label: '标准' },
            { value: 'reduced', label: '降低' },
            { value: 'off', label: '关闭' },
          ]" :key="option.value" :class="{ gold: visualRuntimeSettings.cameraIntensity === option.value }" @click="setCameraIntensity(option.value as CameraIntensity)">{{ option.label }}</button>
        </div>
      </div>
      <div class="tiny muted" style="margin-top:10px">这些偏好仅保存在当前浏览器，不会写入云端存档，也不会影响战斗规则。</div>
    </div>

    <div class="panel" style="margin-bottom:12px">
      <div class="bold" style="margin-bottom:8px">存档统计</div>
      <div class="tiny">
        战斗 {{ game.save.stats.battles }} 场 · 胜利 {{ game.save.stats.wins }} · 捕捉 {{ game.save.stats.caught }} · 炼妖 {{ game.save.stats.bred }}
      </div>
      <div class="tiny muted" v-if="game.lastSavedAt">上次保存：{{ new Date(game.lastSavedAt).toLocaleString() }}</div>
    </div>

    <div class="panel">
      <div class="col" style="gap:8px">
        <button class="good" :disabled="game.saving || leaving" @click="manualSave">{{ game.saving ? '保存中…' : '手动保存到云端' }}</button>
        <button class="danger" :disabled="game.saving || leaving" @click="logout">退出登录</button>
      </div>
    </div>
  </div>
</template>
