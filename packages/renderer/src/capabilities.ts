import type { QualityProfile } from './contracts.ts';

export interface RendererCapabilities {
  webgl: boolean;
  webgl2: boolean;
  devicePixelRatio: number;
  quality: QualityProfile;
  reason?: 'webgl-unavailable' | 'webgl2-unavailable' | 'reduced-device-memory' | 'high-device-pixel-ratio' | 'manual';
}

export interface CapabilityDetectionOptions {
  preferredQuality?: QualityProfile;
  /** Injectable for deterministic tests and non-browser callers. */
  webgl?: boolean;
  webgl2?: boolean;
  devicePixelRatio?: number;
  deviceMemoryGb?: number;
}

/** A DOM-free policy function. Browser feature probing belongs in the web bridge;
 * this pure function makes the downgrade rules testable in Node. */
export function selectQualityProfile(options: CapabilityDetectionOptions = {}): RendererCapabilities {
  const webgl = options.webgl ?? false;
  const webgl2 = options.webgl2 ?? false;
  const devicePixelRatio = options.devicePixelRatio ?? 1;
  const deviceMemoryGb = options.deviceMemoryGb;
  if (options.preferredQuality === 'compatibility' || !webgl) {
    return { webgl, webgl2, devicePixelRatio, quality: 'compatibility', reason: options.preferredQuality === 'compatibility' ? 'manual' : 'webgl-unavailable' };
  }
  if (options.preferredQuality === 'standard' || !webgl2 || (deviceMemoryGb !== undefined && deviceMemoryGb < 4) || devicePixelRatio > 2.5) {
    return {
      webgl,
      webgl2,
      devicePixelRatio,
      quality: 'standard',
      reason: options.preferredQuality === 'standard'
        ? 'manual'
        : !webgl2
          ? 'webgl2-unavailable'
          : deviceMemoryGb !== undefined && deviceMemoryGb < 4
            ? 'reduced-device-memory'
            : 'high-device-pixel-ratio',
    };
  }
  return { webgl, webgl2, devicePixelRatio, quality: 'cinematic', reason: options.preferredQuality === 'cinematic' ? 'manual' : undefined };
}
