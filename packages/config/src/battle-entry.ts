/** 正式战斗入口统一规则：过场最少一秒，十秒未就绪则取消。 */
export const BATTLE_ENTRY = { minimumMs: 1000, timeoutMs: 10000 } as const;
