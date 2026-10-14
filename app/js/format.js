// 表示用フォーマッタ（DOM 非依存）

/** 秒数を「5分」「30秒」「1分30秒」形式にする．0 は「なし」 */
export function formatDuration(sec) {
  if (sec === 0) return 'なし';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m && s) return `${m}分${s}秒`;
  return m ? `${m}分` : `${s}秒`;
}

/** 残りミリ秒を「m:ss」形式にする（秒は切り上げ） */
export function formatClock(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}
