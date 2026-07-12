import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * In-game message framework. Replaces native alert()/confirm() with embedded,
 * reusable UI so prompts feel like part of the game (梦幻式 inline messages).
 *
 *  - Toasts: transient top-right notifications (success/error/info/warn),
 *    auto-dismiss after a duration; click to dismiss early.
 *  - Confirm: a single in-game modal returned as a Promise<boolean>, so callers
 *    can `await msg.confirm(...)` exactly like the old blocking confirm().
 *
 * Usage:
 *   const msg = useMessage();
 *   msg.success('炼妖成功！');
 *   if (!await msg.confirm('确定放生？', { danger: true })) return;
 */

export type ToastType = 'success' | 'error' | 'info' | 'warn';

export interface ToastItem {
  id: number;
  type: ToastType;
  text: string;
}

export interface ConfirmOptions {
  title?: string;
  danger?: boolean;
  /** Label overrides for the two buttons. */
  okText?: string;
  cancelText?: string;
}

interface PendingConfirm {
  text: string;
  options: ConfirmOptions;
  resolve: (v: boolean) => void;
}

let nextId = 1;

export const useMessage = defineStore('message', () => {
  const toasts = ref<ToastItem[]>([]);
  const pending = ref<PendingConfirm | null>(null);

  function push(type: ToastType, text: string, duration = 3200): void {
    const id = nextId++;
    toasts.value.push({ id, type, text });
    // cap the stack so a burst of messages doesn't flood the screen
    if (toasts.value.length > 5) toasts.value.splice(0, toasts.value.length - 5);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
  }

  function dismiss(id: number): void {
    const i = toasts.value.findIndex((t) => t.id === id);
    if (i >= 0) toasts.value.splice(i, 1);
  }

  const success = (text: string, duration?: number) => push('success', text, duration);
  const error = (text: string, duration?: number) => push('error', text, duration ?? 4500);
  const info = (text: string, duration?: number) => push('info', text, duration);
  const warn = (text: string, duration?: number) => push('warn', text, duration);

  function confirm(text: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      pending.value = { text, options, resolve };
    });
  }

  function resolveConfirm(v: boolean): void {
    if (pending.value) {
      pending.value.resolve(v);
      pending.value = null;
    }
  }

  return { toasts, pending, push, dismiss, success, error, info, warn, confirm, resolveConfirm };
});
