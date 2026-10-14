// エントリポイント: アプリの状態（設定・エンジン）を保持し，
// コアロジック・音声・Wake Lock・画面（timer-view / settings-view）を結線する
import { loadSettings, saveSettings } from './settings.js';
import { buildSchedule } from './schedule.js';
import { TimerEngine, STATUS } from './timer-engine.js';
import { Announcer } from './announcer.js';
import { WakeLockManager } from './wake-lock.js';
import { createTimerView } from './timer-view.js';
import { createSettingsView } from './settings-view.js';

const AUDIO_UNAVAILABLE_MESSAGE =
  '音声を再生できない状態です．端末の消音設定・音量をご確認ください（タイマーは動作します）';
const WAKE_LOCK_UNAVAILABLE_MESSAGE =
  'この環境では画面スリープの自動抑止を利用できません．端末の設定で自動ロックを「なし」にしてご利用ください．';

let settings = loadSettings(window.localStorage);
let engine = null;

const announcer = new Announcer();
const wakeLock = new WakeLockManager();

// ---------------------------------------------------------------- エンジン

function createEngine() {
  engine = new TimerEngine(buildSchedule(settings), settings.remindBeforeSec, {
    onAnnounce: (id) => announcer.play(id),
    onStatusChange,
  });
}

function onStatusChange(status) {
  if (status === STATUS.RUNNING) {
    wakeLock.acquire().then((ok) => {
      timerView.setNotice('wakelock', ok ? null : WAKE_LOCK_UNAVAILABLE_MESSAGE);
    });
  } else {
    wakeLock.release();
    timerView.setNotice('wakelock', null);
  }
  timerView.render();
}

// ---------------------------------------------------------------- 操作

// AudioContext.resume() が保留のままになる環境でも開始を妨げないための保険
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function startActivity() {
  const unlocked = await withTimeout(announcer.unlock(), 1500, false);
  if (unlocked && announcer.buffers.size === 0) {
    await withTimeout(announcer.preload(settings.voice), 3000, undefined);
  }
  const audioReady = unlocked && !announcer.loadError && announcer.buffers.size > 0;
  timerView.setNotice('audio', audioReady ? null : announcer.loadError ?? AUDIO_UNAVAILABLE_MESSAGE);

  engine.start(Date.now());
  timerView.render();
}

function resetActivity() {
  engine.reset();
  timerView.setNotice('audio', null);
  timerView.render();
}

/** 設定の保存．有効なら（警告付きでも）適用してエンジンを作り直す（FR-028） */
async function applySettings(candidate) {
  const result = saveSettings(window.localStorage, candidate);
  if (result.valid) {
    const voiceChanged = settings.voice !== candidate.voice;
    settings = candidate;
    createEngine();
    if (voiceChanged) {
      await announcer.preload(settings.voice);
    }
  }
  return result;
}

// ---------------------------------------------------------------- 画面

const timerView = createTimerView({
  getEngine: () => engine,
  getSettings: () => settings,
  handlers: {
    onStart: startActivity,
    onPause: () => { engine.pause(Date.now()); timerView.render(); },
    onResume: () => { engine.resume(Date.now()); timerView.render(); },
    onSkip: () => { engine.skip(Date.now()); timerView.render(); },
    onReset: resetActivity,
    onOpenSettings: () => { timerView.hide(); settingsView.show(settings); },
  },
});

const settingsView = createSettingsView({
  onSave: applySettings,
  onClose: () => { settingsView.hide(); timerView.show(); timerView.render(); },
});

// ---------------------------------------------------------------- 更新ループ

function update() {
  engine.resync(Date.now());
  timerView.render();
}

function frameLoop() {
  update();
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);
// バックグラウンド時は rAF が止まるため interval でも更新する
// （ブラウザにスロットリングされても復帰時の resync で追いつく）
setInterval(update, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    update(); // 実時刻へ即再同期（FR-030）
    wakeLock.reacquireIfWanted();
  }
});

// ---------------------------------------------------------------- 初期化

createEngine();
timerView.render();
announcer.loadManifest().then((ok) => {
  if (ok) {
    // AudioContext が suspended のままでもデコードは可能なため先読みし，
    // 開始操作の unlock() 後に即再生できるようにする
    announcer.preload(settings.voice);
  }
});
