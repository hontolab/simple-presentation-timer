// 音声マニフェスト（生成物）とアプリが使用するアナウンス ID の整合を検証する
// （contracts/audio-manifest.md）．manifest が未生成の環境では明示的にスキップする．
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSchedule } from '../../app/js/schedule.js';
import { ALLOWED_VALUES, DEFAULT_SETTINGS } from '../../app/js/settings.js';

const AUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/audio');
const MANIFEST_PATH = path.join(AUDIO_DIR, 'manifest.json');
const skip = existsSync(MANIFEST_PATH) ? false : '音声アセット未生成（T021 未実施）';

/** アプリが再生し得る全アナウンス ID */
function requiredIds() {
  const ids = new Set(['start']);
  for (const seg of buildSchedule({ ...DEFAULT_SETTINGS, speakers: 2 })) ids.add(seg.endAnnouncement);
  for (const sec of ALLOWED_VALUES.remindBeforeSec) ids.add(`remind_presentation_${sec}`);
  return [...ids];
}

describe('audio/manifest.json', { skip }, () => {
  const manifest = skip ? null : JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

  test('形式: version 1，男女 2 声色', () => {
    assert.equal(manifest.version, 1);
    assert.deepEqual(Object.keys(manifest.voices).sort(), ['female', 'male']);
  });

  test('アプリが使用する全 ID（9 件）が定義されている', () => {
    const ids = requiredIds();
    assert.equal(ids.length, 9);
    for (const id of ids) {
      assert.ok(manifest.announcements[id], `missing announcement: ${id}`);
      assert.ok(manifest.announcements[id].text, `missing text: ${id}`);
    }
  });

  test('各 ID の男女ファイルが app/audio/ 配下に実在する', () => {
    for (const id of requiredIds()) {
      for (const voice of ['male', 'female']) {
        const rel = manifest.announcements[id].files[voice];
        assert.equal(rel, `${voice}/${id}.mp3`);
        assert.ok(existsSync(path.join(AUDIO_DIR, rel)), `missing file: ${rel}`);
      }
    }
  });

  test('manifest に参考プロジェクト由来の ID が残っていない', () => {
    for (const id of Object.keys(manifest.announcements)) {
      assert.doesNotMatch(id, /qa|round|buffer/, `stale id: ${id}`);
    }
  });
});
