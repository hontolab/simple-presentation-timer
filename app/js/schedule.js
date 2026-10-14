// 設定 → セグメント列（進行表）の純粋関数（data-model.md 準拠）
// 発表者 i ごとに 発表 → 指定討論 → QAセッション を並べ，最終発表者以外の末尾に
// 入れ替えを挿入する．指定討論「なし」（designatedSec === 0）のときは指定討論を
// 省いた 発表 → QAセッション の 2 フェーズ構成（Constitution v2 原則 III）．
// それ以外のフェーズ構成は固定で設定対象外．

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
  const hasDesignated = designatedSec > 0; // 0 =「なし」（002 FR-004）
  const segments = [];

  for (let speaker = 1; speaker <= speakers; speaker++) {
    const isFinal = speaker === speakers;

    segments.push({
      kind: 'presentation', speaker,
      durationSec: presentationSec,
      // 指定討論なしのときは QAセッションへの移行を促す専用文言（002 FR-005/FR-006）
      endAnnouncement: hasDesignated ? 'presentation_end' : 'presentation_end_no_designated',
    });
    if (hasDesignated) {
      segments.push({
        kind: 'designated', speaker,
        durationSec: designatedSec,
        endAnnouncement: 'designated_end',
      });
    }
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
