import type { WeatherKind } from '@pokemon-online/shared';

export const BATTLE_WEATHER_DURATION = 20;
export const BATTLE_WEATHER: Record<WeatherKind, { name: string; color: string; pixels: string[]; description: string }> = {
  sun: { name: '晴天', color: '#ffd36b', pixels: ['0001000','0100010','0011100','1011101','0011100','0100010','0001000'], description: '启用晴天特性；干燥肌肤受到的直接伤害增加25%。' },
  rain: { name: '雨天', color: '#79caff', pixels: ['0011100','0111110','1111111','0000000','0101010','1010100','0000000'], description: '启用雨盘、干燥肌肤的持续回复。' },
  snow: { name: '雪天', color: '#ccf5ff', pixels: ['1001001','0101010','0011100','1111111','0011100','0101010','1001001'], description: '雪隐的闪避率提高20%。' },
  sand: { name: '沙暴', color: '#dec08c', pixels: ['0001100','1110010','0000000','0111111','1000000','0001100','1110010'], description: '沙隐的闪避率提高20%。' },
};
/** 幻境试炼的显式遭遇配置，不从美术场景推断天气。 */
export const ENCOUNTER_WEATHER: Record<string, WeatherKind> = {
  'illusion-tower-2': 'rain', 'illusion-tower-3': 'sand',
  'illusion-tower-4': 'sun', 'illusion-tower-5': 'snow',
};
