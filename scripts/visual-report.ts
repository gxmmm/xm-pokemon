import { BATTLE_ENVIRONMENTS, GPU_WORLD_MAP_IDS, SKILL_VISUAL_RECIPES, validateSkillVisualRecipes, validateWorldSceneBudgets, WORLD_SCENES, worldSceneBudgetReport, worldSceneFingerprintHash } from '@pokemon-online/config';

const report = validateSkillVisualRecipes();
const worldReport = validateWorldSceneBudgets();
const failures = [
  ['missing recipes', report.missingSkillIds],
  ['duplicate recipes', report.duplicateSkillIds],
  ['over particle budget', report.overBudgetRecipeIds],
  ['invalid signature references', report.invalidSignatureSkillIds],
  ['duplicate world scene ids', worldReport.duplicateSceneIds],
  ['duplicate world map ids', worldReport.duplicateMapIds],
  ['GPU maps missing scene packs', worldReport.missingGpuSceneMapIds],
  ['unknown world preload keys', worldReport.unknownPreloadKeys],
  ['world scenes over budget', worldReport.overBudgetSceneIds],
  ['world scene baseline mismatches', worldReport.mismatchedBaselineMapIds],
] as const;

console.log(`Skill visual recipes: ${SKILL_VISUAL_RECIPES.length}`);
console.log(`Battle environments: ${Object.keys(BATTLE_ENVIRONMENTS).join(', ')}`);
console.log(`Controlled GPU world maps: ${GPU_WORLD_MAP_IDS.join(', ')}`);
for (const scene of WORLD_SCENES) {
  const budget = worldSceneBudgetReport(scene);
  console.log(`World scene ${budget.mapId}: landmarks=${budget.landmarkCount}/${scene.resources.landmarkLimit}, static=${budget.staticContainerCount}/${scene.resources.staticContainerLimit}, entities=${budget.dynamicEntityCount}/${scene.resources.entityLimit}, cinematicParticles=${budget.cinematicAmbientParticles}/${scene.resources.ambientParticleLimit}, preload=${budget.preloadKeyCount}, baseline=${worldSceneFingerprintHash(scene)}, fingerprint=${budget.fingerprint}`);
}
for (const [label, entries] of failures) console.log(`${label}: ${entries.length}${entries.length ? ` (${entries.join(', ')})` : ''}`);
if (failures.some(([, entries]) => entries.length > 0)) process.exit(1);
console.log('✓ visual recipe configuration report');
