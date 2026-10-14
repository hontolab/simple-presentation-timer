// 設定 → セグメント列（進行表）の純粋関数（data-model.md 準拠）
// 発表者 i ごとに 発表 → 指定討論 → 聴衆討論 を並べ，最終発表者以外の末尾に
// 入れ替えを挿入する．フェーズ構成は固定で設定対象外（Constitution 原則 III）．

/**
 * @typedef {Object} Segment
 * @property {'presentation'|'designated'|'audience'|'changeover'} kind
 * @property {number} speaker 対象の発表者番号（1 起点．入れ替えは直前の発表者）
 * @property {number} durationSec
 * @property {string} endAnnouncement セグメント終了時（時間切れ・スキップ共通）のアナウンス ID
 */

/** @returns {Segment[]} */
export function buildSchedule(settings) {
  const { speakers, presentationSec, designatedSec, audienceSec, changeoverSec } = settings;
  const segments = [];

  for (let speaker = 1; speaker <= speakers; speaker++) {
    const isFinal = speaker === speakers;

    segments.push({
      kind: 'presentation', speaker,
      durationSec: presentationSec,
      endAnnouncement: 'presentation_end',
    });
    segments.push({
      kind: 'designated', speaker,
      durationSec: designatedSec,
      endAnnouncement: 'designated_end',
    });
    segments.push({
      kind: 'audience', speaker,
      durationSec: audienceSec,
      endAnnouncement: isFinal ? 'complete' : 'audience_end_changeover',
    });

    if (!isFinal) {
      segments.push({
        kind: 'changeover', speaker,
        durationSec: changeoverSec,
        endAnnouncement: 'changeover_end',
      });
    }
  }

  return segments;
}
