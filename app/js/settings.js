// 設定の定義・検証・保存/復元（contracts/settings-schema.md 準拠）
// DOM・ブラウザ API 非依存．ストレージは注入可能（Node テスト用）

import { formatDuration } from './format.js';

// 参考プロジェクト（ppt.settings.v1）と同一ブラウザで設定が混線しないよう分離する
export const STORAGE_KEY = 'spt.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  speakers: 4,
  presentationSec: 300,
  designatedSec: 180,
  audienceSec: 300,
  changeoverSec: 120,
  remindBeforeSec: 60,
  voice: 'female',
});

// 時間項目はプリセットの列挙値のみ許可する（カスタム入力なし）
export const ALLOWED_VALUES = Object.freeze({
  presentationSec: Object.freeze([180, 300, 420, 600, 900]), // 3・5・7・10・15 分
  designatedSec: Object.freeze([60, 120, 180, 300]),         // 1・2・3・5 分
  audienceSec: Object.freeze([180, 300, 420, 600]),          // 3・5・7・10 分
  changeoverSec: Object.freeze([60, 120, 180]),              // 1・2・3 分（「なし」は設けない）
  remindBeforeSec: Object.freeze([30, 60, 180]),             // 30 秒・1 分・3 分
});

export const SPEAKERS_RULE = Object.freeze({ min: 1, max: 20 });

const VOICES = ['male', 'female'];

/**
 * 設定を検証する．
 * @returns {{ valid: boolean, errors: Object<string,string>, warnings: string[] }}
 *   errors: 保存を拒否すべきフィールドごとのメッセージ（FR-027）
 *   warnings: 保存は許可するが利用者に伝えるべき注意
 *   （リマインド時間 ≥ 発表時間 → 発表中のリマインドは行われない）
 */
export function validateSettings(settings) {
  const errors = {};
  const warnings = [];

  if (settings === null || typeof settings !== 'object') {
    return { valid: false, errors: { _all: '設定の形式が不正です' }, warnings };
  }

  for (const [field, allowed] of Object.entries(ALLOWED_VALUES)) {
    if (!allowed.includes(settings[field])) {
      errors[field] = `${allowed.map(formatDuration).join('・')} から選択してください`;
    }
  }

  const speakers = settings.speakers;
  if (
    typeof speakers !== 'number' ||
    !Number.isInteger(speakers) ||
    speakers < SPEAKERS_RULE.min ||
    speakers > SPEAKERS_RULE.max
  ) {
    errors.speakers = `発表者数は ${SPEAKERS_RULE.min}〜${SPEAKERS_RULE.max} の整数を指定してください`;
  }

  if (!VOICES.includes(settings.voice)) {
    errors.voice = '声色は male または female を指定してください';
  }

  // リマインドは発表フェーズのみが対象のため，比較相手は発表時間だけ
  if (Object.keys(errors).length === 0 && settings.remindBeforeSec >= settings.presentationSec) {
    warnings.push('リマインド時間が発表時間以上のため，発表中のリマインドは行われません');
  }

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

/**
 * ストレージから設定を読み込む．不正・欠損・旧形式はデフォルト値へ
 * フォールバックする（FR-025, FR-026）．
 * @param {{ getItem(k:string): string|null }} storage localStorage 互換
 */
export function loadSettings(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    const { valid } = validateSettings(merged);
    return valid ? merged : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 設定を検証してストレージへ保存する．検証エラー時は保存しない（FR-027）．
 * @returns {{ valid: boolean, errors: object, warnings: string[] }}
 */
export function saveSettings(storage, settings) {
  const result = validateSettings(settings);
  if (result.valid) {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }
  return result;
}
