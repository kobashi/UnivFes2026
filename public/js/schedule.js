// 展示のタイムライン（ブラウザ / Node 共通）
//
// サーバは epoch（ループ開始時刻）と演目リストだけを配る。各PCは同期済みの
// 時刻からいまどの演目の何秒目かを自分で計算するので、常時通信しなくても揃う。

import { clamp, mod } from './util.js';

export const totalDuration = (scenes) => scenes.reduce((s, x) => s + x.duration, 0);

export function sceneOffset(scenes, index) {
  let o = 0;
  for (let i = 0; i < index; i++) o += scenes[i].duration;
  return o;
}

// sch = { epoch(ms), scenes:[{id,duration(s)}], transition(s), hold: index|null }
export function sceneAt(sch, tMs) {
  const { scenes, transition = 0 } = sch;
  const elapsed = (tMs - sch.epoch) / 1000;
  let index;
  let local;
  if (sch.hold != null && scenes[sch.hold]) {
    index = sch.hold;
    local = mod(elapsed - sceneOffset(scenes, index), scenes[index].duration);
  } else {
    let e = mod(elapsed, totalDuration(scenes));
    index = 0;
    while (index < scenes.length - 1 && e >= scenes[index].duration) {
      e -= scenes[index].duration;
      index++;
    }
    local = e;
  }
  const duration = scenes[index].duration;
  const fade = transition > 0 ? clamp(Math.min(local, duration - local) / transition, 0, 1) : 1;
  return {
    index,
    id: scenes[index].id,
    local,
    duration,
    remaining: duration - local,
    fade,
    startMs: tMs - local * 1000,
    next: sch.hold != null ? index : (index + 1) % scenes.length,
  };
}
