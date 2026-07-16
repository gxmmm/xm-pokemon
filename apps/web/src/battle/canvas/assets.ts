/**
 * @canvas-archive-only
 * Archived Canvas compatibility/regression source. It must remain in the
 * repository, but must not be imported, mounted, dynamically loaded, offered
 * as a fallback, or extended by official GPU/Pixi world or battle runtime code.
 */
const fxImages = new Map<string, HTMLImageElement>();
let fxAtlasPromise: Promise<void> | null = null;

/** Optional Canvas compatibility assets. Missing images always fall back to
 * procedural primitives, so renderer behavior remains functional offline. */
export function loadCanvasFxAssets(): Promise<void> {
  if (fxAtlasPromise) return fxAtlasPromise;
  fxAtlasPromise = (async () => {
    try {
      const response = await fetch('/sprites/effects/atlas.json', { cache: 'force-cache' });
      if (!response.ok) return;
      const data = (await response.json()) as { images?: string[] };
      await Promise.all((data.images ?? []).map(loadOne));
    } catch {
      // Procedural-only fallback.
    }
  })();
  return fxAtlasPromise;
}

function loadOne(name: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = `/sprites/effects/${name}.png`;
    image.onload = () => { fxImages.set(name, image); resolve(); };
    image.onerror = () => resolve();
  });
}

export function getCanvasFxImage(name: string): HTMLImageElement | null {
  return fxImages.get(name) ?? null;
}
