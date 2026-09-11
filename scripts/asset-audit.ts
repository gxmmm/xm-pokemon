import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { BATTLE_ASSET_MANIFEST, BATTLE_ART_PROFILES, SPECIES_LIST, validateBattleArtConfiguration } from '@pokemon-online/config';

/** 所有发布文件必须来自当前 manifest 或明确的署名记录，避免重新夹带弃用素材。 */
const root = resolve('apps/web/public');
const expected = new Set<string>(['sprites/icons/pokeball.png', 'sprites/icons/CREDITS.md']);
for (const file of ['import-report.json', 'UPSTREAM-credit_names.txt', 'UPSTREAM-LICENSE.md', 'UPSTREAM-README.md']) expected.add(`sprites/pmd-v1/${file}`);
for (const species of SPECIES_LIST) {
  const dir = `sprites/pmd-v1/${String(species.id).padStart(4, '0')}`;
  for (const file of ['source.json', 'credits.txt']) expected.add(`${dir}/${file}`);
}
for (const asset of BATTLE_ASSET_MANIFEST) {
  if (asset.kind === 'fallback-shape') continue;
  assert.equal(asset.sourceId, 'pmdcollab-v1', '战斗角色只使用当前 PMD 来源');
  for (const url of [asset.url, asset.metadataUrl].filter(Boolean) as string[]) expected.add(url.replace(/^\//, ''));
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), '发布目录不允许链接文件');
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path).split(sep).join('/')];
  });
}
const actual = walk(root);
assert.deepEqual(actual.filter(file => !expected.has(file)), [], '发现未登记的发布资源');
const actualSet = new Set(actual);
assert.deepEqual([...expected].filter(file => !actualSet.has(file)), [], '缺少当前发布资源或署名');
for (const file of expected) {
  const path = resolve(root, file);
  assert(statSync(path).size > 0, `${file} 不能为空`);
  if (file.endsWith('.png')) assert.equal(readFileSync(path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} 必须是 PNG`);
}
assert.equal(BATTLE_ART_PROFILES.length, 151);
for (const issues of Object.values(validateBattleArtConfiguration())) assert.equal(issues.length, 0, '美术配置引用有效');
console.log(`✓ 当前资产：${actual.length} 文件、${BATTLE_ASSET_MANIFEST.length} manifest 条目、151 只 PMD 角色，署名完整，无多余发布文件`);
