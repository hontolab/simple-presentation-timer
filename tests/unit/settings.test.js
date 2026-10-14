import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_VALUES,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  SPEAKERS_RULE,
  validateSettings,
  loadSettings,
  saveSettings,
} from '../../app/js/settings.js';

// localStorage 互換のモック
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    map,
  };
}

describe('スキーマ定義（contracts/settings-schema.md）', () => {
  test('デフォルト値は 4 名・5 分・3 分・5 分・2 分・残り 1 分・女性（FR-025）', () => {
    assert.deepEqual(DEFAULT_SETTINGS, {
      speakers: 4,
      presentationSec: 300,
      designatedSec: 180,
      audienceSec: 300,
      changeoverSec: 120,
      remindBeforeSec: 60,
      voice: 'female',
    });
  });

  test('ストレージキーは参考プロジェクトと分離されている', () => {
    assert.equal(STORAGE_KEY, 'spt.settings.v1');
  });

  test('プリセット値は Clarifications Q1 のとおり', () => {
    assert.deepEqual([...ALLOWED_VALUES.presentationSec], [180, 300, 420, 600, 900]);
    assert.deepEqual([...ALLOWED_VALUES.designatedSec], [60, 120, 180, 300]);
    assert.deepEqual([...ALLOWED_VALUES.audienceSec], [180, 300, 420, 600]);
    assert.deepEqual([...ALLOWED_VALUES.changeoverSec], [60, 120, 180]);
    assert.deepEqual([...ALLOWED_VALUES.remindBeforeSec], [30, 60, 180]);
    assert.deepEqual(SPEAKERS_RULE, { min: 1, max: 20 });
  });
});

describe('validateSettings', () => {
  test('デフォルト値は有効で警告なし', () => {
    const r = validateSettings(DEFAULT_SETTINGS);
    assert.equal(r.valid, true);
    assert.deepEqual(r.errors, {});
    assert.deepEqual(r.warnings, []);
  });

  test('プリセットの全列挙値が有効', () => {
    for (const [field, values] of Object.entries(ALLOWED_VALUES)) {
      for (const value of values) {
        const r = validateSettings({ ...DEFAULT_SETTINGS, [field]: value });
        assert.equal(r.valid, true, `${field}=${value}`);
      }
    }
  });

  test('発表者数は 1 と 20 が有効（境界値）', () => {
    assert.equal(validateSettings({ ...DEFAULT_SETTINGS, speakers: 1 }).valid, true);
    assert.equal(validateSettings({ ...DEFAULT_SETTINGS, speakers: 20 }).valid, true);
  });

  test('列挙値にない時間・型違反は拒否（FR-027）', () => {
    const cases = [
      { presentationSec: 0 },
      { presentationSec: 240 },     // 4 分はプリセットにない
      { presentationSec: '300' },   // 型違反
      { designatedSec: 90 },
      { designatedSec: 420 },
      { audienceSec: 60 },
      { audienceSec: 900 },
      { changeoverSec: 0 },         // 「なし」は廃止（Clarifications Q4）
      { changeoverSec: 30 },
      { remindBeforeSec: 120 },
      { remindBeforeSec: 300 },
    ];
    for (const override of cases) {
      const r = validateSettings({ ...DEFAULT_SETTINGS, ...override });
      assert.equal(r.valid, false, JSON.stringify(override));
      assert.equal(Object.keys(r.errors).length, 1, JSON.stringify(override));
      assert.match(Object.values(r.errors)[0], /から選択してください/);
    }
  });

  test('発表者数の範囲外・非整数・型違反は拒否', () => {
    for (const speakers of [0, 21, 2.5, '4', -1, NaN]) {
      const r = validateSettings({ ...DEFAULT_SETTINGS, speakers });
      assert.equal(r.valid, false, String(speakers));
      assert.match(r.errors.speakers, /1〜20 の整数/);
    }
  });

  test('リマインド時間 ≥ 発表時間は警告付きで有効', () => {
    const r = validateSettings({ ...DEFAULT_SETTINGS, presentationSec: 180, remindBeforeSec: 180 });
    assert.equal(r.valid, true);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /発表時間以上/);
  });

  test('リマインド時間が討論時間以上でも警告しない（リマインドは発表のみ）', () => {
    const r = validateSettings({
      ...DEFAULT_SETTINGS,
      designatedSec: 60,
      audienceSec: 180,
      changeoverSec: 60,
      remindBeforeSec: 180,
    });
    assert.equal(r.valid, true);
    assert.deepEqual(r.warnings, []);
  });

  test('オブジェクト以外は拒否', () => {
    assert.equal(validateSettings(null).valid, false);
    assert.equal(validateSettings('x').valid, false);
  });
});

describe('loadSettings / saveSettings（基本）', () => {
  test('未保存時はデフォルト値を返す', () => {
    assert.deepEqual(loadSettings(makeStorage()), DEFAULT_SETTINGS);
  });

  test('保存 → 復元でラウンドトリップする（FR-026）', () => {
    const storage = makeStorage();
    const custom = { ...DEFAULT_SETTINGS, speakers: 6, designatedSec: 120, voice: 'male' };
    const r = saveSettings(storage, custom);
    assert.equal(r.valid, true);
    assert.deepEqual(loadSettings(storage), custom);
  });
});

describe('loadSettings / saveSettings（フォールバックと保存可否，US4）', () => {
  test('壊れた JSON はデフォルト値へフォールバック', () => {
    const storage = makeStorage({ [STORAGE_KEY]: '{broken' });
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  });

  test('旧スキーマ（参考プロジェクトの qaSec / rounds 等）が混入してもデフォルト値へフォールバック', () => {
    const storage = makeStorage({
      [STORAGE_KEY]: JSON.stringify({
        presentationSec: 300, qaSec: 300, remindBeforeSec: 60, bufferSec: 60, rounds: 3, voice: 'female',
        speakers: 99, // 必須項目が不正
      }),
    });
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  });

  test('検証を通らない保存済み値はデフォルト値へフォールバック', () => {
    const storage = makeStorage({
      [STORAGE_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, changeoverSec: 0 }),
    });
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  });

  test('欠損フィールドはデフォルト値で補完', () => {
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ speakers: 7 }) });
    assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS, speakers: 7 });
  });

  test('不正値は保存されない（FR-027）', () => {
    const storage = makeStorage();
    const r = saveSettings(storage, { ...DEFAULT_SETTINGS, speakers: 0 });
    assert.equal(r.valid, false);
    assert.equal(storage.map.has(STORAGE_KEY), false);
  });

  test('警告付きの有効値は保存される', () => {
    const storage = makeStorage();
    const custom = { ...DEFAULT_SETTINGS, presentationSec: 180, remindBeforeSec: 180 };
    const r = saveSettings(storage, custom);
    assert.equal(r.valid, true);
    assert.equal(r.warnings.length, 1);
    assert.deepEqual(loadSettings(storage), custom);
  });

  test('voice 不正は保存されない', () => {
    const storage = makeStorage();
    const r = saveSettings(storage, { ...DEFAULT_SETTINGS, voice: 'robot' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.voice);
    assert.equal(storage.map.has(STORAGE_KEY), false);
  });
});
