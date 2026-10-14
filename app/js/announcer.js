// 音声アナウンスの読み込み・再生（contracts/audio-manifest.md 消費側）
// Web Audio API を使用．ユーザージェスチャで unlock() を呼んでから
// play() する（iOS Safari の自動再生制限対応，FR-022）．
// 読み込み失敗時もタイマー進行を妨げない（例外を外に出さない）．

const MANIFEST_URL = 'audio/manifest.json';

export class Announcer {
  constructor() {
    this.context = null;
    this.manifest = null;
    this.buffers = new Map(); // announcementId → AudioBuffer（現在の声色分）
    this.voice = 'female';
    this.loadError = null;
  }

  /** manifest を読み込む．失敗しても throw しない */
  async loadManifest() {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = await res.json();
      this.loadError = null;
    } catch (e) {
      this.manifest = null;
      this.loadError = `音声データを読み込めませんでした（${e.message}）`;
    }
    return this.loadError === null;
  }

  /** AudioContext を（未生成なら suspended 状態で）用意する */
  _ensureContext() {
    if (!this.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.context = new Ctx();
    }
    return this.context;
  }

  /**
   * ユーザージェスチャ起点で AudioContext を有効化する．
   * @returns {Promise<boolean>} 音声が利用可能になったか
   */
  async unlock() {
    try {
      this._ensureContext();
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  get ready() {
    return this.context !== null && this.context.state === 'running' && this.manifest !== null;
  }

  /** 指定声色の全アナウンスをプリロードする（SC-004）．
      AudioContext が suspended でもデコードは可能なため，初期化時に
      先読みしておき，開始操作の unlock() で即再生できる状態にする */
  async preload(voice) {
    this.voice = voice;
    if (!this.manifest) return;
    this._ensureContext();
    this.buffers.clear();
    const entries = Object.entries(this.manifest.announcements);
    await Promise.all(
      entries.map(async ([id, entry]) => {
        try {
          const res = await fetch(`audio/${entry.files[voice]}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.arrayBuffer();
          const buffer = await this.context.decodeAudioData(data);
          this.buffers.set(id, buffer);
        } catch {
          // 個別ファイルの失敗は無視（画面表示で代替，spec エッジケース）
        }
      })
    );
  }

  /** アナウンスを再生する．未ロード・未有効化なら何もしない */
  play(announcementId) {
    if (!this.context || this.context.state !== 'running') return;
    const buffer = this.buffers.get(announcementId);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.start();
  }
}
