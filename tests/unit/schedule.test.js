import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule } from '../../app/js/schedule.js';
import { DEFAULT_SETTINGS } from '../../app/js/settings.js';

describe('buildSchedule（data-model.md 生成規則）', () => {
  test('デフォルト設定: 発表者 4 名 = 15 セグメント（4×4 − 1）', () => {
    const segs = buildSchedule(DEFAULT_SETTINGS);
    assert.equal(segs.length, 15);
    assert.equal(segs.filter((s) => s.kind === 'changeover').length, 3);
  });

  test('発表者 1 名: 入れ替えなしの 3 セグメント，最終は complete', () => {
    const segs = buildSchedule({ ...DEFAULT_SETTINGS, speakers: 1 });
    assert.deepEqual(
      segs.map((s) => [s.kind, s.speaker, s.endAnnouncement]),
      [
        ['presentation', 1, 'presentation_end'],
        ['designated', 1, 'designated_end'],
        ['audience', 1, 'complete'],
      ]
    );
  });

  test('発表者 2 名: 7 セグメントで種別順序と endAnnouncement が規則どおり', () => {
    const segs = buildSchedule({ ...DEFAULT_SETTINGS, speakers: 2 });
    assert.equal(segs.length, 7);
    assert.deepEqual(
      segs.map((s) => [s.kind, s.speaker, s.endAnnouncement]),
      [
        ['presentation', 1, 'presentation_end'],
        ['designated', 1, 'designated_end'],
        ['audience', 1, 'audience_end_changeover'],
        ['changeover', 1, 'changeover_end'],
        ['presentation', 2, 'presentation_end'],
        ['designated', 2, 'designated_end'],
        ['audience', 2, 'complete'],
      ]
    );
  });

  test('入れ替えの speaker は直前の発表者番号', () => {
    const segs = buildSchedule({ ...DEFAULT_SETTINGS, speakers: 3 });
    const changeovers = segs.filter((s) => s.kind === 'changeover');
    assert.deepEqual(changeovers.map((s) => s.speaker), [1, 2]);
  });

  test('各セグメントの時間が設定を反映する', () => {
    const segs = buildSchedule({
      ...DEFAULT_SETTINGS,
      speakers: 2,
      presentationSec: 420,
      designatedSec: 120,
      audienceSec: 180,
      changeoverSec: 60,
    });
    assert.deepEqual(
      segs.map((s) => s.durationSec),
      [420, 120, 180, 60, 420, 120, 180]
    );
  });

  test('発表者 20 名でも最終セグメントのみ complete', () => {
    const segs = buildSchedule({ ...DEFAULT_SETTINGS, speakers: 20 });
    assert.equal(segs.length, 79);
    assert.equal(segs.filter((s) => s.endAnnouncement === 'complete').length, 1);
    assert.equal(segs[segs.length - 1].kind, 'audience');
    assert.equal(segs[segs.length - 1].speaker, 20);
  });

  test('half・awaitAfter など参考プロジェクト由来のフィールドを持たない', () => {
    const [seg] = buildSchedule(DEFAULT_SETTINGS);
    assert.deepEqual(Object.keys(seg).sort(), ['durationSec', 'endAnnouncement', 'kind', 'speaker']);
  });
});
