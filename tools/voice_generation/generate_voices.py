"""アナウンス音声の一括生成スクリプト（管理者用）．

Google Cloud Text-to-Speech REST API で全アナウンス文言 × 2 声色の MP3 を
生成し，app/audio/ 以下と manifest.json を出力する（FR-035〜FR-038）．
冪等: 同じ定義で再実行すれば同じ出力を上書きする．

使い方:
    pip install -r requirements.txt
    python generate_voices.py
"""

import base64
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

from announcements import AUDIO_CONFIG, VOICES, build_announcements

TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize"
REPO_ROOT = Path(__file__).resolve().parents[2]
AUDIO_DIR = REPO_ROOT / "app" / "audio"
JST = timezone(timedelta(hours=9))


def load_api_key() -> str:
    load_dotenv(REPO_ROOT / ".env")
    api_key = os.environ.get("GOOGLE_CLOUD_API_KEY")
    if not api_key:
        sys.exit(
            "エラー: 環境変数 GOOGLE_CLOUD_API_KEY が設定されていません．\n"
            f"リポジトリ直下の .env ファイル（{REPO_ROOT / '.env'}）に\n"
            "  GOOGLE_CLOUD_API_KEY=<Google Cloud の API キー>\n"
            "を記載してください（.env.example 参照）．"
        )
    return api_key


def synthesize(api_key: str, text: str, voice: dict) -> bytes:
    response = requests.post(
        TTS_ENDPOINT,
        headers={"X-goog-api-key": api_key, "Content-Type": "application/json"},
        json={"input": {"text": text}, "voice": voice, "audioConfig": AUDIO_CONFIG},
        timeout=30,
    )
    if response.status_code != 200:
        sys.exit(
            f"エラー: TTS API が失敗しました (HTTP {response.status_code})\n"
            f"{response.text}"
        )
    return base64.b64decode(response.json()["audioContent"])


def main() -> None:
    api_key = load_api_key()
    announcements = build_announcements()
    total = len(announcements) * len(VOICES)
    manifest_entries = {}
    count = 0

    for voice_key in VOICES:
        (AUDIO_DIR / voice_key).mkdir(parents=True, exist_ok=True)

    for announcement_id, text in announcements.items():
        files = {}
        for voice_key, voice in VOICES.items():
            count += 1
            relative = f"{voice_key}/{announcement_id}.mp3"
            print(f"[{count}/{total}] {relative}")
            audio = synthesize(api_key, text, voice)
            (AUDIO_DIR / relative).write_bytes(audio)
            files[voice_key] = relative
        manifest_entries[announcement_id] = {"text": text, "files": files}

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "voices": {key: {"name": voice["name"]} for key, voice in VOICES.items()},
        "announcements": manifest_entries,
    }
    manifest_path = AUDIO_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完了: {total} ファイルと {manifest_path} を生成しました")


if __name__ == "__main__":
    main()
