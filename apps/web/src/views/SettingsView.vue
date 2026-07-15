<script setup lang="ts">
import { useGameStore } from '../stores/game.ts';
import { useAuthStore } from '../stores/auth.ts';
import { useMessage } from '../stores/message.ts';
import { useRouter } from 'vue-router';
import BackHub from '../components/BackHub.vue';
import { updateVisualRuntimeSettings, visualRuntimeCapabilities, visualRuntimeSettings } from '../visuals/runtime-settings.ts';
import type { CameraIntensity, QualityPreference } from '@pokemon-online/renderer';

const game = useGameStore();
const auth = useAuthStore();
const msg = useMessage();
const router = useRouter();

function setSpeed(s: number): void { game.updateSettings({ battleSpeed: s }); }
function toggleMusic(): void { game.updateSettings({ music: !game.save!.settings.music }); }
function toggleSfx(): void { game.updateSettings({ sfx: !game.save!.settings.sfx }); }
function setQualityPreference(qualityPreference: QualityPreference): void { updateVisualRuntimeSettings({ qualityPreference }); }
function toggleReduceFlicker(): void { updateVisualRuntimeSettings({ reduceFlicker: !visualRuntimeSettings.value.reduceFlicker }); }
function setCameraIntensity(cameraIntensity: CameraIntensity): void { updateVisualRuntimeSettings({ cameraIntensity }); }

async function logout(): Promise<void> {
  if (!await msg.confirm('确定退出登录？本地未保存的进度将丢失。', { title: '退出登录', danger: true })) return;
  await game.persist(true);
  auth.logout();
  game.reset();
  router.replace({ name: 'login' });
}

async function manualSave(): Promise<void> {
  await game.persist(true);
  msg.success('已手动保存到云端');
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
      <div>
        <div class="between" style="margin-bottom:6px"><span>GPU 质量</span><span class="tiny muted">当前：{{ visualRuntimeCapabilities.quality }}</span></div>
        <div class="row">
          <button v-for="option in [
            { value: 'auto', label: '自动' },
            { value: 'cinematic', label: '电影' },
            { value: 'standard', label: '标准' },
            { value: 'compatibility', label: '兼容' },
          ]" :key="option.value" :class="{ gold: visualRuntimeSettings.qualityPreference === option.value }" @click="setQualityPreference(option.value as QualityPreference)">{{ option.label }}</button>
        </div>
        <div class="tiny muted" style="margin-top:6px">自动模式会依据 WebGL / WebGL2、设备内存与像素密度选择档位；手动档会立即作用于已开启的 GPU 世界与战斗 renderer。</div>
      </div>
      <div class="between" style="margin-top:12px">
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
        <button class="good" @click="manualSave">手动保存到云端</button>
        <button class="danger" @click="logout">退出登录</button>
      </div>
    </div>
  </div>
</template>
