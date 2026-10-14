// タイマー画面: 表示更新・通知エリア・操作ボタンの DOM 処理．
// 状態は持たず，エンジンと設定はゲッター経由で参照する（エンジンは
// 設定保存時に作り直されるため）．操作はすべて handlers に委譲する．

import { STATUS } from './timer-engine.js';
import { formatClock } from './format.js';

const PHASE_TEXT = {
  presentation: '発表',
  designated: '指定討論',
  audience: 'QAセッション', // 内部キー audience は維持（002 research R2）
  changeover: '入れ替え',
};

/**
 * @param {{
 *   getEngine: () => import('./timer-engine.js').TimerEngine,
 *   getSettings: () => object,
 *   handlers: {
 *     onStart: () => void, onPause: () => void, onResume: () => void,
 *     onSkip: () => void, onReset: () => void, onOpenSettings: () => void,
 *   },
 * }} deps
 */
export function createTimerView({ getEngine, getSettings, handlers }) {
  const $ = (id) => document.getElementById(id);
  const el = {
    view: $('timer-view'),
    speakerIndicator: $('speaker-indicator'),
    phaseLabel: $('phase-label'),
    timeDisplay: $('time-display'),
    phaseNote: $('phase-note'),
    notices: $('notices'),
    startButton: $('start-button'),
    pauseButton: $('pause-button'),
    resumeButton: $('resume-button'),
    skipButton: $('skip-button'),
    resetButton: $('reset-button'),
    settingsButton: $('settings-button'),
    confirmOverlay: $('confirm-overlay'),
    confirmOk: $('confirm-ok'),
    confirmCancel: $('confirm-cancel'),
  };

  // ---- 通知エリア（音声・Wake Lock の警告） ----

  const notices = new Map(); // key → メッセージ

  function setNotice(key, message) {
    if (message) notices.set(key, message);
    else notices.delete(key);
    el.notices.hidden = notices.size === 0;
    el.notices.innerHTML = '';
    for (const text of notices.values()) {
      const div = document.createElement('div');
      div.className = 'notice';
      div.textContent = text;
      el.notices.appendChild(div);
    }
  }

  // ---- 表示更新 ----

  function render() {
    const snap = getEngine().getSnapshot(Date.now());
    const { status, segment, remainingMs, speaker, speakersTotal } = snap;

    el.speakerIndicator.textContent = `発表者 ${speaker} / ${speakersTotal}`;

    let bodyPhase = 'idle';
    let label = '待機中';
    let note = '「開始」を押すと 1 人目の発表が始まります';
    let time = formatClock(remainingMs ?? 0);

    if (status === STATUS.RUNNING || status === STATUS.PAUSED) {
      bodyPhase = segment.kind;
      label = PHASE_TEXT[segment.kind];
      if (status === STATUS.PAUSED) {
        note = '一時停止中';
      } else if (segment.kind === 'changeover') {
        note = '次の発表者と交代してください．終了すると次の発表が自動で始まります';
      } else {
        note = '';
      }
    } else if (status === STATUS.COMPLETED) {
      bodyPhase = 'completed';
      label = '終了';
      note = 'すべての発表が終了しました．お疲れさまでした';
      time = '0:00';
    }

    document.body.dataset.phase = bodyPhase;
    el.phaseLabel.textContent = label;
    el.phaseNote.textContent = note;
    el.timeDisplay.textContent = time;
    // リマインドは発表フェーズのみ（FR-016）なので，強調表示も発表に限る
    el.timeDisplay.classList.toggle(
      'urgent',
      status === STATUS.RUNNING &&
        segment?.kind === 'presentation' &&
        remainingMs !== null &&
        remainingMs <= getSettings().remindBeforeSec * 1000
    );

    // ボタン表示（contracts/timer-states.md のボタン表示規則準拠）
    el.startButton.hidden = status !== STATUS.IDLE;
    el.pauseButton.hidden = status !== STATUS.RUNNING;
    el.resumeButton.hidden = status !== STATUS.PAUSED;
    // スキップは全セグメント種別で，実行中・一時停止中に利用できる（FR-013）
    el.skipButton.hidden = !(status === STATUS.RUNNING || status === STATUS.PAUSED);
    el.resetButton.hidden = status === STATUS.IDLE;
    el.settingsButton.hidden = status !== STATUS.IDLE; // 設定は待機中のみ（FR-028）
  }

  // ---- 操作の結線 ----

  el.startButton.addEventListener('click', handlers.onStart);
  el.pauseButton.addEventListener('click', handlers.onPause);
  el.resumeButton.addEventListener('click', handlers.onResume);
  el.skipButton.addEventListener('click', handlers.onSkip);
  el.settingsButton.addEventListener('click', handlers.onOpenSettings);

  // リセットは誤操作防止のため確認を挟む（FR-009）
  el.resetButton.addEventListener('click', () => {
    el.confirmOverlay.hidden = false;
  });
  el.confirmCancel.addEventListener('click', () => {
    el.confirmOverlay.hidden = true;
  });
  el.confirmOk.addEventListener('click', () => {
    el.confirmOverlay.hidden = true;
    handlers.onReset();
  });

  return {
    render,
    setNotice,
    show: () => { el.view.hidden = false; },
    hide: () => { el.view.hidden = true; },
  };
}
