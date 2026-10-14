# シンプルプレゼンテーションタイマー

研究室の進捗報告会（発表者が数人，各人「発表 → 指定討論 → QAセッション」）の
進行を自動化するタイマー Web アプリです．PC・iPhone・iPad のブラウザで動作し，
リマインドやフェーズの切り替えを音声アナウンス（男女 2 声色．進行役が口頭で
合図する場合は「なし」も選べます）で知らせます．
UI は[ペアプレゼンテーションタイマー](../pair-presentation-timer)と共通です．

## 進行の流れ

発表者 1 人につき 3 つのフェーズを順に進め，次の発表者との間に入れ替え時間を
挟みます．指定討論者を置かない回は指定討論時間を「なし」にすると，発表から
直接 QAセッションに進む 2 フェーズ構成になります．開始後は最後の発表者の
QAセッションが終わるまで操作不要です．

```text
発表（X 分）→ 指定討論（Y 分，「なし」も可）→ QAセッション（Z 分）
        └──────── 発表者 1 人分 ────────┘
→ 入れ替え（M 分）→ 次の発表者 → … → 最後の発表者の QAセッション → 終了
```

- 発表の残り時間が設定値に達すると音声でリマインドします（リマインドは発表のみ）
- 各フェーズの終了時に，次に何をするかを音声で案内します
- どのフェーズでも「スキップして次へ」で即座に次のフェーズへ進めます
  （発表や質疑が早く終わったとき用．確認なしで実行されます）

## クイックスタート

```bash
# ローカルで起動（ビルド不要）
python3 -m http.server 8000 --directory app
# → http://localhost:8000 を開き，「開始」を押す
```

`file://` で index.html を直接開くと ES Modules と fetch が動かないため，
必ず HTTP サーバ経由で開いてください．iPhone / iPad から試すときは，同じ
Wi-Fi 上で `http://<Mac の IP>:8000` にアクセスします．

## 設定

タイマー画面右上の ⚙ から変更できます（待機中のみ）．設定は端末に保存されます．

| 項目 | 選択肢 | デフォルト |
|------|--------|-----------|
| 発表者数 | 1〜7 名 | 4 名 |
| 発表時間 | 3 分・5 分・7 分・10 分・15 分 | 5 分 |
| 指定討論時間 | なし・1 分・2 分・3 分・5 分 | 3 分 |
| QAセッション時間 | 3 分・5 分・7 分・10 分 | 5 分 |
| 入れ替え時間 | 1 分・2 分・3 分 | 2 分 |
| リマインド（発表の残り時間） | 30 秒・1 分・3 分 | 1 分 |
| アナウンスの声 | 女性／男性／なし（音声を再生しない） | 女性 |

プリセットの値を変えたい場合は `app/js/settings.js` の `ALLOWED_VALUES` を
編集します（設定画面のチップと検証の両方に反映されます）．リマインドの値を
増やす場合は，対応する音声の再生成も必要です（後述）．

## プロジェクト構成

```text
app/                        # Timer 本体（静的 Web アプリ．ビルド不要）
├── index.html              # タイマー画面＋設定画面
├── css/style.css
├── js/
│   ├── main.js             # エントリポイント（状態保持と各部の結線）
│   ├── timer-engine.js     # コア: 状態機械・残り時間計算・スキップ（DOM 非依存）
│   ├── schedule.js         # コア: 設定 → フェーズ列の生成（DOM 非依存）
│   ├── settings.js         # コア: 設定の検証・保存/復元（DOM 非依存）
│   ├── format.js           # 時間表示のフォーマッタ（DOM 非依存）
│   ├── timer-view.js       # タイマー画面の DOM 処理
│   ├── settings-view.js    # 設定画面の DOM 処理
│   ├── announcer.js        # 音声のプリロード・再生（Web Audio）
│   └── wake-lock.js        # 画面スリープ抑止（Screen Wake Lock）
└── audio/                  # 生成済み音声（10 文言 × 2 声色）＋ manifest.json

tools/voice_generation/     # 管理者用の音声生成スクリプト（Google Cloud TTS）
tests/unit/                 # コアロジックの単体テスト
.github/workflows/          # GitHub Pages への自動デプロイ
```

タイマーの残り時間は実時刻（デッドライン）基準で計算しており，タブの
バックグラウンド化や画面ロックから復帰しても実時間どおりに追いつきます．

## テスト

コアロジック（timer-engine / schedule / settings）は DOM 非依存のため，
Node.js だけでテストできます（依存パッケージなし．Node.js 20+）．

```bash
npm test
```

push 時には GitHub Actions でも同じテストが実行され，成功した場合のみ
デプロイされます．

## 音声アナウンスの再生成（管理者向け）

音声は Google Cloud Text-to-Speech で事前生成した MP3 で，アプリは実行時に
音声合成 API を呼びません．文言や声を調整する手順:

1. リポジトリ直下に `.env` を用意し，`GOOGLE_CLOUD_API_KEY` を設定する
   （`.env.example` 参照．**`.env` は絶対にコミットしないこと**）
2. `tools/voice_generation/announcements.py` の文言・ボイス名・話速を編集する
3. 再生成を実行する:

   ```bash
   cd tools/voice_generation
   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   .venv/bin/python generate_voices.py
   ```

`app/audio/{male,female}/` に 10 文言 × 2 声色 = 20 ファイルと
`app/audio/manifest.json` が上書き生成されます．

## デプロイ（GitHub Pages）

`main` / `master` ブランチへ push すると，GitHub Actions
（[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)）が
単体テストを実行したうえで `app/` を GitHub Pages へ自動デプロイします．

初回のみリポジトリ側の設定が必要です:

1. GitHub のリポジトリで Settings → Pages → Source を **GitHub Actions** にする
2. push してワークフローの完了を待つ（Actions タブで確認）

独自ドメインを使う場合は DNS を設定したうえで Settings → Pages → Custom domain
を設定し，Enforce HTTPS をオンにします（Wake Lock は HTTPS 配信で動作します）．
