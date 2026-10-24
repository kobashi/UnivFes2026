// 演目の登録。config.json の scenes[].id はここのキーを指定する。
import Corridor from './corridor.js';
import Mirror from './mirror.js';
import Migration from './migration.js';

export const SCENES = {
  [Corridor.id]: Corridor,
  [Mirror.id]: Mirror,
  [Migration.id]: Migration,
};
