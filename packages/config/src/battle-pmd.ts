import type { BattleArtImportContract, BattleAssetManifestEntry, BattleAssetSourceRecord } from './battle-art.ts';
import { SPECIES_LIST } from './pokemon.ts';
import { PMD_BATTLE_FRAME_SIZES } from './pmd-battle.generated.ts';

/** 单一像素输出标准；覆盖角色、所有特效与世界场景。 */
export const PIXEL_ART_STYLE = { screenPixelSize: 2 } as const;
export const PMD_SOURCE: BattleAssetSourceRecord = {
  id: 'pmdcollab-v1', label: 'PMDCollab 像素动作资源',
  sourceUrl: 'https://github.com/PMDCollab/SpriteCollab/tree/1f201ba3f969dd0eb4447744dffaeaaef26f5ae7',
  licenseLabel: '社区素材 CC BY-NC 4.0；官方来源权利仍归相应权利方，详见逐角色 credits',
  licenseEvidenceUrl: '/sprites/pmd-v1/UPSTREAM-LICENSE.md',
  attribution: 'CHUNSOFT 与 PMDCollab 贡献者；每个物种目录保留 credits.txt、source.json，作者名见 UPSTREAM-credit_names.txt。',
  reviewStatus: 'recorded-existing',
};

export const PMD_ASSETS: readonly BattleAssetManifestEntry[] = SPECIES_LIST.flatMap(({ id }) =>
  (['front', 'back'] as const).flatMap((side) => [
    { id: `pmd:${id}:${side}`, kind: 'sprite-sheet' as const, url: `/sprites/pmd-v1/${String(id).padStart(4, '0')}/${side}.png`,
      metadataUrl: `/sprites/pmd-v1/${String(id).padStart(4, '0')}/${side}.json`, sourceId: PMD_SOURCE.id, quality: 'all' as const },
    { id: `pmd:${id}:${side}:icon`, kind: 'static-sprite' as const, url: `/sprites/pmd-v1/${String(id).padStart(4, '0')}/${side}-idle.png`,
      sourceId: PMD_SOURCE.id, quality: 'all' as const },
  ]));

const MOTIONS = ['idle', 'locomotion', 'enter', 'exit', 'attack', 'cast', 'charge', 'channel', 'recover', 'hit', 'faint'] as const;
export const PMD_IMPORT_CONTRACTS: readonly BattleArtImportContract[] = SPECIES_LIST.map(({ id }) => ({
  id: `pmd-import:${id}`, profileId: `species:${id}`, modelId: `pmd:${id}`, status: 'integrated', sourceId: PMD_SOURCE.id,
  format: 'png-sequence-json', sourceRevision: 'pmd-source-1f201ba3-native-pixels-v1',
  plannedFrontAssetId: `pmd:${id}:front`, plannedBackAssetId: `pmd:${id}:back`, fallbackAssetId: 'battle:fallback-shape',
  requiredMotions: MOTIONS,
  sequence: { frameWidth: PMD_BATTLE_FRAME_SIZES[id]!.width, frameHeight: PMD_BATTLE_FRAME_SIZES[id]!.height, fps: 60,
    chromaKey: 'transparent-alpha', requiredClips: MOTIONS,
    transitions: [] },
}));

export function pokemonIconUrl(speciesId: number, back = false): string {
  return PMD_ASSETS.find((asset) => asset.id === `pmd:${speciesId}:${back ? 'back' : 'front'}:icon`)?.url ?? '';
}

export function battleUiAssetsFor(speciesId: number): readonly BattleAssetManifestEntry[] {
  return PMD_ASSETS.filter(asset => asset.id === `pmd:${speciesId}:front:icon` || asset.id === `pmd:${speciesId}:back:icon`);
}
