// 演目の登録。config.json の scenes[].id はここのキーを指定する。
import Corridor from './corridor.js';
import Echo from './echo.js';
import Migration from './migration.js';
import Mirror from './mirror.js';
import NightSky from './nightsky.js';
import Sequencer from './sequencer.js';

export const SCENES = Object.fromEntries([Corridor, Mirror, Migration, Sequencer, Echo, NightSky].map((S) => [S.id, S]));
