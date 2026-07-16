import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Canvas is retained only for historical compatibility and regression review.
 * This guard prevents official gameplay Vue/Pixi entrypoints from reconnecting
 * an archived Canvas module through either static or dynamic imports.
 */
const ARCHIVED_CANVAS_FILES = [
  'apps/web/src/battle/BattleField.ts',
  'apps/web/src/battle/BattleSprite.ts',
  'apps/web/src/battle/BattleEffects.ts',
  'apps/web/src/battle/BattleActions.ts',
  'apps/web/src/battle/CanvasCueAdapter.ts',
  'apps/web/src/battle/canvas/CanvasVfxPrimitives.ts',
  'apps/web/src/battle/canvas/assets.ts',
  'apps/web/src/battle/canvas/types.ts',
  'apps/web/src/components/BattleCanvas.vue',
  'apps/web/src/components/WorldCanvas.vue',
  'apps/web/src/world/Tileset.ts',
  'apps/web/src/world/CharacterSprite.ts',
  'apps/web/src/world/Camera.ts',
];

const OFFICIAL_RUNTIME_ENTRYPOINTS = [
  'apps/web/src/router.ts',
  'apps/web/src/views/BattleView.vue',
  'apps/web/src/views/WorldView.vue',
  'apps/web/src/components/PixiBattleViewport.vue',
  'apps/web/src/components/PixiWorldViewport.vue',
  'packages/renderer-pixi/src/BattleStage.ts',
  'packages/renderer-pixi/src/WorldStage.ts',
];

const forbiddenPathFragments = ARCHIVED_CANVAS_FILES
  .map((file) => file.replace(/^apps\/web\/src\//, '../').replace(/\.(ts|vue)$/, ''))
  .concat([
    'BattleCanvas', 'WorldCanvas', 'CanvasCueAdapter', 'BattleField', 'BattleSprite',
    'BattleEffects', 'BattleActions', 'CanvasVfxPrimitives', 'canvas/assets', 'canvas/types',
    'world/Tileset', 'world/CharacterSprite', 'world/Camera',
  ]);

function fail(message) {
  console.error(`✗ CANVAS ARCHIVE CHECK: ${message}`);
  process.exitCode = 1;
}

for (const file of ARCHIVED_CANVAS_FILES) {
  const path = resolve(file);
  if (!existsSync(path)) {
    fail(`required archived source is missing: ${file}`);
    continue;
  }
  if (!readFileSync(path, 'utf8').includes('@canvas-archive-only')) {
    fail(`archived source lacks @canvas-archive-only marker: ${file}`);
  }
}

for (const file of OFFICIAL_RUNTIME_ENTRYPOINTS) {
  const content = readFileSync(resolve(file), 'utf8');
  const matches = forbiddenPathFragments.filter((fragment) => content.includes(fragment));
  if (matches.length) fail(`${file} references archived Canvas module(s): ${matches.join(', ')}`);
}

if (!process.exitCode) {
  console.log(`✓ Canvas archive boundary: ${ARCHIVED_CANVAS_FILES.length} retained sources; ${OFFICIAL_RUNTIME_ENTRYPOINTS.length} official GPU entrypoints isolated`);
}
