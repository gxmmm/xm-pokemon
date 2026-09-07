<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue';

/**
 * `clickable` (default true): the tip toggles on click and stops propagation,
 * so touch devices can read it and nested click handlers don't fire.
 * Set to false for badges inside clickable parents (e.g. type badges on a
 * selectable card): the tip becomes hover-only and never blocks the parent click.
 *
 * The tooltip is teleported to the document and clamped in viewport pixels.
 * Scene transforms and scrolling panels cannot change its containing block.
 *
 * Hover shows the tip after a short dwell (500ms) so quick mouse-overs don't
 * pop tooltips constantly. Click (touch) shows it immediately.
 */
const props = withDefaults(defineProps<{ text: string; clickable?: boolean }>(), { clickable: true });
const show = ref(false);
const wrap = ref<HTMLElement | null>(null);
const box = ref<HTMLElement | null>(null);
const boxStyle = ref<Record<string, string>>({});

let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function applyPosition(): void {
  const el = wrap.value, tip = box.value;
  if (!el || !tip || !show.value) return;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const gap = 6, pad = 8;
  const localLeft = r.left, localTop = r.top, localW = r.width, localBottom = r.bottom;
  const boundsW = window.innerWidth, boundsH = window.innerHeight;
  // horizontal: center on the trigger, clamped into the stage (no left/right clip)
  let left = localLeft + localW / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, boundsW - tw - pad));
  // vertical: prefer below; flip above if it would overflow the bottom
  let top: number;
  if (localBottom + gap + th <= boundsH) top = localBottom + gap;
  else if (localTop - gap - th >= 0) top = localTop - gap - th;
  else top = Math.max(pad, Math.min(boundsH - th - pad, localBottom + gap));
  boxStyle.value = { left: left + 'px', top: top + 'px' };
}

async function open(): Promise<void> {
  show.value = true;
  await nextTick();
  applyPosition();
  // capture phase so scrolls inside any overflow container are caught too
  window.addEventListener('scroll', applyPosition, true);
  window.addEventListener('resize', applyPosition);
}
function close(): void {
  show.value = false;
  window.removeEventListener('scroll', applyPosition, true);
  window.removeEventListener('resize', applyPosition);
}
function onEnter(): void {
  // dwell 500ms before showing, so quick mouse-overs don't pop tooltips
  hoverTimer = setTimeout(() => { hoverTimer = undefined; void open(); }, 500);
}
function onLeave(): void {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = undefined; }
  close();
}
function onClick(e: MouseEvent): void {
  if (!props.clickable) return; // let the click bubble to the parent
  e.stopPropagation();
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = undefined; }
  if (show.value) close();
  else void open();
}
onUnmounted(() => {
  if (hoverTimer) clearTimeout(hoverTimer);
  close();
});
</script>

<template>
  <span
    ref="wrap"
    class="tip-wrap"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click="onClick"
  >
    <slot />
    <Teleport to="body">
    <transition name="tip-fade">
      <span v-if="show && text" ref="box" class="tip-box" role="tooltip" :style="boxStyle">{{ text }}</span>
    </transition>
    </Teleport>
  </span>
</template>

<style scoped>
.tip-wrap { position: relative; display: inline-flex; cursor: help; }
.tip-box {
  position: fixed;
  z-index: 1000;
  background: #1c2740;
  color: #eaf0ff;
  border: 1px solid #3a4a6a;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.55;
  white-space: pre-line;
  width: max-content;
  max-width: 264px;
  pointer-events: none;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}
.tip-fade-enter-active,
.tip-fade-leave-active { transition: opacity 0.12s ease; }
.tip-fade-enter-from,
.tip-fade-leave-to { opacity: 0; }
</style>
