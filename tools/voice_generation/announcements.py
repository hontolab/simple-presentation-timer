"""アナウンス文言・ボイスパラメータの定義．

管理者はこのファイルを編集して generate_voices.py を再実行するだけで
音声を再生成・差し替えできる（FR-037）．
契約: specs/001-simple-presentation-timer/contracts/audio-manifest.md
"""

# 声色ごとの Google Cloud TTS ボイス設定
VOICES = {
    "female": {
        "languageCode": "ja-JP",
        "name": "ja-JP-Neural2-B",
    },
    "male": {
        "languageCode": "ja-JP",
        "name": "ja-JP-Neural2-C",
    },
}

# 全声色共通の音声パラメータ（話速・ピッチはここで一括調整する）
AUDIO_CONFIG = {
    "audioEncoding": "MP3",
    "speakingRate": 1.0,
    "pitch": 0.0,
}

# リマインドとして設定可能な値（秒）．設定 UI のプリセット
# （app/js/settings.js の ALLOWED_VALUES.remindBeforeSec）と一致させること
REMIND_SECONDS = (30, 60, 180)


def _duration_label(seconds: int) -> str:
    """秒数を「1分30秒」のような読み上げ用ラベルにする．"""
    minutes, rest = divmod(seconds, 60)
    if minutes and rest:
        return f"{minutes}分{rest}秒"
    if minutes:
        return f"{minutes}分"
    return f"{rest}秒"


def build_announcements() -> dict[str, str]:
    """アナウンス ID → 文言の対応表（全 9 件）を返す．

    進行: 発表 → 指定討論 → 聴衆討論 →（入れ替え → 次の発表者）… → 完了
    リマインドは発表フェーズのみ（Clarifications Q3）．
    """
    announcements = {
        "start": "進捗報告会を開始します．1 人目の発表を始めてください．",
        "presentation_end": (
            "発表時間が終了しました．指定討論者は質疑を始めてください．"
        ),
        "designated_end": (
            "指定討論の時間が終了しました．聴衆からの質疑に移ってください．"
        ),
        "audience_end_changeover": (
            "質疑の時間が終了しました．次の発表者と交代してください．"
        ),
        "changeover_end": "次の発表を始めてください．",
        "complete": "すべての発表が終了しました．お疲れさまでした．",
    }

    for seconds in REMIND_SECONDS:
        label = _duration_label(seconds)
        announcements[f"remind_presentation_{seconds}"] = (
            f"発表時間は残り{label}となりました．"
        )

    return announcements
