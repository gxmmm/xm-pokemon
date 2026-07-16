# Battle Asset Source and B-3 Import Record

**Status:** B-3 preparation only — no new character bitmap has been added as of 2026-07-16.

## Decision state

The first real character-art vertical slice remains **Charizard #006** (`showcase:flame-wing`). The recommended future form is a high-quality, pixel-readable **2D PNG frame sequence with JSON metadata**, supplied as separate front and back manifest assets. This is an import contract, not a claim that the asset has been produced.

The visual direction and rights source have **not yet been approved**. Therefore the production entries
`battle:flame-wing:front:sequence` and `battle:flame-wing:back:sequence` are intentionally absent from `BATTLE_ASSET_MANIFEST`; the #006 profile continues to use its already-recorded PokeAPI front/back sprites and the common procedural fallback.

## Existing asset provenance

| Source ID | Applies to | Source / evidence | Licence / attribution record |
| --- | --- | --- | --- |
| `pokeapi-sprites` | Existing 151 front/back static sprites | <https://github.com/PokeAPI/sprites> | Upstream repository terms and Pokémon IP rights apply. `README.md` attribution remains authoritative: “Sprites © PokeAPI”; project use is non-commercial fan-project use. |
| `procedural-fallback` | `battle:fallback-shape` | Internal Pixi renderer source | MIT project code; generated geometry imports no character artwork. |

The machine-readable counterparts are `BATTLE_ASSET_SOURCES` and `BattleAssetManifestEntry.sourceId` in `packages/config/src/battle-art.ts`. Validation rejects entries with a missing source record or incomplete source, licence-evidence, or attribution fields.

## Approval gate before importing a new character bitmap

1. Confirm visual direction and the actual source (original commission, explicit licence, or other documented permission).
2. Add a new `BATTLE_ASSET_SOURCES` record with source URL, licence evidence URL, attribution, and review status.
3. Add front/back `sprite-sheet` (or approved bitmap) entries exclusively through `BATTLE_ASSET_MANIFEST`; only it may contain public paths.
4. Atomically change #006's `BattleArtProfile` front/back asset IDs, retaining `battle:fallback-shape`.
5. Keep the contract's required motions: `idle`, `attack`, `cast`, `charge`, `channel`, `hit`, `faint`; all unavailable or failed loads remain on the generic Pixi fallback.
6. Re-run configuration validation, smoke, typecheck, web build, diff-check, and browser/manual visual acceptance. Do not add species/skill/path branches to renderer, Vue, or cue adapters.

Canvas sources remain retained but unmounted; they are neither an import path nor a fallback.
