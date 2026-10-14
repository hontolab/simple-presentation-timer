// 画面スリープ抑止（FR-029, FR-031）
// Screen Wake Lock API のラッパ．非対応・取得失敗を検出して呼び出し側へ返す．

export class WakeLockManager {
  constructor() {
    this.sentinel = null;
    this.wanted = false; // タイマー実行中は true（可視復帰時の再取得判断に使う）
  }

  get supported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  /** @returns {Promise<boolean>} 取得できたか */
  async acquire() {
    this.wanted = true;
    if (!this.supported) return false;
    if (this.sentinel && !this.sentinel.released) return true;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      this.sentinel = null;
      return false;
    }
  }

  async release() {
    this.wanted = false;
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // 解放失敗は無視（ページ遷移等で自動解放される）
      }
      this.sentinel = null;
    }
  }

  /** 可視復帰時に呼ぶ．実行中なら再取得する */
  async reacquireIfWanted() {
    if (this.wanted) return this.acquire();
    return false;
  }
}
