<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue';

/**
 * `clickable` (default true): the tip toggles on click and stops propagation,
 * so touch devices can read it and nested click handlers don't fire.
 * Set to false for badges inside clickable parents (e.g. type badges on a
 * selectable card): the tip becomes hover-only and never blocks the parent click.
 *
 * The tooltip is `position: fixed` + clamped so it is never clipped by an
 * `overflow: auto` ancestor. IMPORTANT: `.app-stage` uses `transform: scale()`,
 * which makes it the containing block for fixed descendants -- so the tip is
 * laid out in the STAGE's local (design-px) coordinate system, not the
 * viewport. We convert the trigger's visual rect to stage-local coords and
 * clamp to the stage bounds; otherwise the tip lands outside the stage and is
 * clipped by its overflow:hidden.
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
  const tw = tip.offsetWidth, th = tip.offsetHeight; // layout px (stage-local)
  const gap = 6, pad = 8;
  // Convert the trigger's visual rect into the stage's local design-px coords
  // (the tip is position:fixed, contained by the transformed .app-stage).
  const stage = document.querySelector('.app-stage') as HTMLElement | null;
  let localLeft: number, localTop: number, localW: number, localBottom: number, boundsW: number, boundsH: number;
  if (stage) {
    const sr = stage.getBoundingClientRect();
    const scale = sr.width / 1280 || 1;
    localLeft = (r.left - sr.left) / scale;
    localTop = (r.top - sr.top) / scale;
    localW = r.width / scale;
    localBottom = localTop + r.height / scale;
    boundsW = 1280;
    boundsH = 800;
  } else {
    localLeft = r.left; localTop = r.top; localW = r.width; localBottom = r.bottom;
    boundsW = window.innerWidth; boundsH = window.innerHeight;
  }
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
    <transition name="tip-fade">
      <span v-if="show && text" ref="box" class="tip-box" role="tooltip" :style="boxStyle">{{ text }}</span>
    </transition>
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
