// 設定画面: 発表者数・プリセットチップ・声色の入力と検証結果表示．
// 保存の実処理（検証・永続化・エンジン再構築）は onSave に委譲する．

import { ALLOWED_VALUES, SPEAKERS_RULE } from './settings.js';
import { formatDuration } from './format.js';

// 時間選択チップ: settings.js の ALLOWED_VALUES から生成するため，
// プリセットの変更は ALLOWED_VALUES の編集だけで UI と検証の両方に反映される
function createPresetPicker(groupEl, allowedValues) {
  let value = allowedValues[0];

  const refresh = () => {
    for (const button of groupEl.querySelectorAll('.chip')) {
      button.classList.toggle('selected', Number(button.dataset.sec) === value);
    }
  };

  for (const sec of allowedValues) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = formatDuration(sec);
    button.dataset.sec = String(sec);
    button.addEventListener('click', () => {
      value = sec;
      refresh();
    });
    groupEl.appendChild(button);
  }

  return {
    get: () => value,
    set(sec) {
      value = sec;
      refresh();
    },
  };
}

/**
 * @param {{
 *   onSave: (candidate: object) => Promise<{valid: boolean, errors: object, warnings: string[]}>,
 *   onClose: () => void,
 * }} deps
 */
export function createSettingsView({ onSave, onClose }) {
  const $ = (id) => document.getElementById(id);
  const el = {
    view: $('settings-view'),
    form: $('settings-form'),
    messages: $('settings-messages'),
    inputSpeakers: $('input-speakers'),
    closeButton: $('settings-close'),
  };

  const pickers = {
    presentation: createPresetPicker($('preset-presentation'), ALLOWED_VALUES.presentationSec),
    designated: createPresetPicker($('preset-designated'), ALLOWED_VALUES.designatedSec),
    audience: createPresetPicker($('preset-audience'), ALLOWED_VALUES.audienceSec),
    changeover: createPresetPicker($('preset-changeover'), ALLOWED_VALUES.changeoverSec),
    remind: createPresetPicker($('preset-remind'), ALLOWED_VALUES.remindBeforeSec),
  };

  for (let n = SPEAKERS_RULE.min; n <= SPEAKERS_RULE.max; n++) {
    const option = document.createElement('option');
    option.value = String(n);
    option.textContent = `${n} 名`;
    el.inputSpeakers.appendChild(option);
  }

  function clearMessages() {
    el.messages.hidden = true;
    el.messages.innerHTML = '';
  }

  function showMessages(texts, className) {
    el.messages.hidden = false;
    for (const text of texts) {
      const p = document.createElement('p');
      p.className = className;
      p.textContent = text;
      el.messages.appendChild(p);
    }
  }

  el.closeButton.addEventListener('click', onClose);

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const candidate = {
      speakers: Number(el.inputSpeakers.value),
      presentationSec: pickers.presentation.get(),
      designatedSec: pickers.designated.get(),
      audienceSec: pickers.audience.get(),
      changeoverSec: pickers.changeover.get(),
      remindBeforeSec: pickers.remind.get(),
      voice: el.form.elements.voice.value,
    };

    const result = await onSave(candidate);
    clearMessages();
    if (!result.valid) {
      showMessages(Object.values(result.errors), 'error'); // 保存拒否（FR-027）
      return;
    }
    if (result.warnings.length > 0) {
      showMessages(result.warnings, 'warning'); // 警告は見せたまま画面に留まる
      return;
    }
    onClose();
  });

  return {
    show(settings) {
      el.inputSpeakers.value = String(settings.speakers);
      pickers.presentation.set(settings.presentationSec);
      pickers.designated.set(settings.designatedSec);
      pickers.audience.set(settings.audienceSec);
      pickers.changeover.set(settings.changeoverSec);
      pickers.remind.set(settings.remindBeforeSec);
      el.form.elements.voice.value = settings.voice;
      clearMessages();
      el.view.hidden = false;
    },
    hide: () => { el.view.hidden = true; },
  };
}
