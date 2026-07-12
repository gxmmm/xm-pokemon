<script setup lang="ts">
import { useMessage, type ToastType } from '../stores/message.ts';

const msg = useMessage();

const ICON: Record<ToastType, string> = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
</script>

<template>
  <!-- toast stack (top-right, auto-dismiss) -->
  <div class="toast-host">
    <transition-group name="toast">
      <div
        v-for="t in msg.toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        @click="msg.dismiss(t.id)"
      >
        <span class="ico">{{ ICON[t.type] }}</span>
        <span class="txt">{{ t.text }}</span>
      </div>
    </transition-group>
  </div>

  <!-- in-game confirm modal -->
  <div v-if="msg.pending" class="modal-backdrop" @click.self="msg.resolveConfirm(false)">
    <div class="modal confirm-modal">
      <h3 v-if="msg.pending.options.title" class="h-title" style="margin:0 0 8px">{{ msg.pending.options.title }}</h3>
      <p class="confirm-text">{{ msg.pending.text }}</p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="ghost" @click="msg.resolveConfirm(false)">
          {{ msg.pending.options.cancelText ?? '取消' }}
        </button>
        <button :class="msg.pending.options.danger ? 'danger' : ''" @click="msg.resolveConfirm(true)">
          {{ msg.pending.options.okText ?? '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: min(86vw, 360px);
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1c2740;
  color: #eaf0ff;
  border-left: 4px solid var(--accent-2);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  cursor: pointer;
}
.toast .ico {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
}
.toast.success { border-left-color: var(--good); }
.toast.success .ico { background: var(--good); }
.toast.error { border-left-color: var(--bad); }
.toast.error .ico { background: var(--bad); }
.toast.warn { border-left-color: var(--warn); }
.toast.warn .ico { background: var(--warn); color: #333; }
.toast.info { border-left-color: var(--accent-2); }
.toast.info .ico { background: var(--accent-2); }
.toast .txt { white-space: pre-line; }

.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateX(40px); }
.toast-leave-to { opacity: 0; transform: translateX(40px); }
.toast-move { transition: transform 0.25s ease; }

.confirm-modal { max-width: 420px; }
.confirm-text { margin: 0; white-space: pre-line; color: var(--ink); font-size: 14px; line-height: 1.6; }
</style>
