// タイマー状態機械（contracts/timer-states.md 準拠）
// 現在時刻は必ず引数で受け取る（FR-010．テストで時刻を注入可能にするため
// 内部で Date.now() は呼ばない）．残り時間はデッドライン方式で算出する．

export const STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
});

export class TimerEngine {
  /**
   * @param {import('./schedule.js').Segment[]} segments
   * @param {number} remindBeforeSec
   * @param {{ onAnnounce?: (id:string)=>void, onStatusChange?: (status:string)=>void }} callbacks
   */
  constructor(segments, remindBeforeSec, callbacks = {}) {
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('segments must be a non-empty array');
    }
    this.segments = segments;
    this.remindBeforeSec = remindBeforeSec;
    this.onAnnounce = callbacks.onAnnounce ?? (() => {});
    this.onStatusChange = callbacks.onStatusChange ?? (() => {});

    this.status = STATUS.IDLE;
    this.segmentIndex = 0;
    this.deadline = null;
    this.remainingAtPauseMs = null;
    this.firedReminder = false;
  }

  _setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange(status);
    }
  }

  _enterSegment(index, now) {
    this.segmentIndex = index;
    this.deadline = now + this.segments[index].durationSec * 1000;
    this.firedReminder = false;
  }

  /** 待機中からの報告会開始（FR-018） */
  start(now) {
    if (this.status !== STATUS.IDLE) return;
    this._enterSegment(0, now);
    this._setStatus(STATUS.RUNNING);
    this.onAnnounce('start');
  }

  pause(now) {
    if (this.status !== STATUS.RUNNING) return;
    this.remainingAtPauseMs = Math.max(0, this.deadline - now);
    this.deadline = null;
    this._setStatus(STATUS.PAUSED);
  }

  resume(now) {
    if (this.status !== STATUS.PAUSED) return;
    this.deadline = now + this.remainingAtPauseMs;
    this.remainingAtPauseMs = null;
    this._setStatus(STATUS.RUNNING);
  }

  /** 1 人目の待機状態へ戻す．確認 UI は呼び出し側の責務（FR-009） */
  reset() {
    if (this.status === STATUS.IDLE) return;
    this.segmentIndex = 0;
    this.deadline = null;
    this.remainingAtPauseMs = null;
    this.firedReminder = false;
    this._setStatus(STATUS.IDLE);
  }

  /**
   * 現在のフェーズを即座に終了して次へ進む（FR-011〜FR-015）．
   * 時間切れ遷移と同じ endAnnouncement を通知し，次セグメントは now 起点で
   * 設定時間フルから始める．paused からも利用でき，次セグメントは running．
   * 満了済み（now ≥ deadline）のときは満了処理のみ行い，二重遷移を防ぐ．
   */
  skip(now) {
    if (this.status === STATUS.RUNNING && now >= this.deadline) {
      this.resync(now);
      return;
    }
    if (this.status !== STATUS.RUNNING && this.status !== STATUS.PAUSED) return;

    const seg = this.segments[this.segmentIndex];
    this.remainingAtPauseMs = null;
    if (this.segmentIndex === this.segments.length - 1) {
      this.deadline = null;
      this._setStatus(STATUS.COMPLETED);
    } else {
      this._enterSegment(this.segmentIndex + 1, now);
      this._setStatus(STATUS.RUNNING);
    }
    this.onAnnounce(seg.endAnnouncement);
  }

  /**
   * 現在時刻に基づいて状態を進める．表示更新ループと可視復帰時の再同期を
   * 兼ねる（FR-005, FR-030）．複数セグメントを跨いだ場合，アナウンスは
   * 最後の遷移の 1 件のみ再生する（spec エッジケース準拠）．
   */
  resync(now) {
    if (this.status !== STATUS.RUNNING) return;

    let crossings = 0;
    let lastAnnouncement = null;

    while (this.status === STATUS.RUNNING && now >= this.deadline) {
      const seg = this.segments[this.segmentIndex];
      const segmentEnd = this.deadline;
      crossings += 1;
      lastAnnouncement = seg.endAnnouncement;

      if (this.segmentIndex === this.segments.length - 1) {
        this.deadline = null;
        this._setStatus(STATUS.COMPLETED);
      } else {
        this.segmentIndex += 1;
        // 実時刻基準: 次セグメントは前セグメントの終了時刻から始まる
        this.deadline = segmentEnd + this.segments[this.segmentIndex].durationSec * 1000;
        this.firedReminder = false;
      }
    }

    if (crossings > 0) {
      // 跨ぎ後にリマインド時刻も過ぎていた場合は発火済み扱いにする
      // （古いリマインドを追い再生しない）
      if (this.status === STATUS.RUNNING && this._reminderDue(now)) {
        this.firedReminder = true;
      }
      if (lastAnnouncement !== null) this.onAnnounce(lastAnnouncement);
      return;
    }

    if (this._reminderDue(now)) {
      this.firedReminder = true;
      this.onAnnounce(`remind_presentation_${this.remindBeforeSec}`);
    }
  }

  /** リマインドは発表フェーズのみ（FR-016．Clarifications Q3） */
  _reminderDue(now) {
    if (this.status !== STATUS.RUNNING || this.firedReminder) return false;
    const seg = this.segments[this.segmentIndex];
    if (seg.kind !== 'presentation') return false;
    if (this.remindBeforeSec >= seg.durationSec) return false;
    return this.deadline - now <= this.remindBeforeSec * 1000;
  }

  /** 表示用スナップショット */
  getSnapshot(now) {
    const segment =
      this.status === STATUS.COMPLETED ? null : this.segments[this.segmentIndex];
    let remainingMs = null;
    if (this.status === STATUS.RUNNING) {
      remainingMs = Math.max(0, this.deadline - now);
    } else if (this.status === STATUS.PAUSED) {
      remainingMs = this.remainingAtPauseMs;
    } else if (this.status === STATUS.IDLE) {
      remainingMs = segment.durationSec * 1000;
    }
    const lastSegment = this.segments[this.segments.length - 1];
    return {
      status: this.status,
      segmentIndex: this.segmentIndex,
      segment,
      remainingMs,
      speaker: segment ? segment.speaker : lastSegment.speaker,
      speakersTotal: lastSegment.speaker,
    };
  }
}
