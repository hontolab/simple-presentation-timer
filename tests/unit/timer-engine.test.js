import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, STATUS } from '../../app/js/timer-engine.js';
import { buildSchedule } from '../../app/js/schedule.js';
import { DEFAULT_SETTINGS } from '../../app/js/settings.js';

// 短い設定（発表 10 秒・指定討論 5 秒・聴衆討論 8 秒・入れ替え 3 秒・2 名）
const SHORT = {
  ...DEFAULT_SETTINGS,
  speakers: 2,
  presentationSec: 10,
  designatedSec: 5,
  audienceSec: 8,
  changeoverSec: 3,
  remindBeforeSec: 3,
};
const S = 1000;

function makeEngine(settings = SHORT) {
  const announced = [];
  const statuses = [];
  const engine = new TimerEngine(buildSchedule(settings), settings.remindBeforeSec, {
    onAnnounce: (id) => announced.push(id),
    onStatusChange: (st) => statuses.push(st),
  });
  return { engine, announced, statuses };
}

describe('状態一覧（contracts/timer-states.md）', () => {
  test('状態は idle / running / paused / completed の 4 つのみ', () => {
    assert.deepEqual(Object.values(STATUS).sort(), ['completed', 'idle', 'paused', 'running']);
    assert.equal(STATUS.AWAITING_NEXT_ROUND, undefined);
  });

  test('空のセグメント列は拒否', () => {
    assert.throws(() => new TimerEngine([], 60));
  });
});

describe('開始・一時停止・再開・リセット（FR-009, FR-018）', () => {
  test('start で running になり start アナウンスが 1 回通知される', () => {
    const { engine, announced, statuses } = makeEngine();
    engine.start(0);
    assert.equal(engine.status, STATUS.RUNNING);
    assert.deepEqual(announced, ['start']);
    assert.deepEqual(statuses, [STATUS.RUNNING]);
    assert.equal(engine.deadline, 10 * S);
  });

  test('idle 以外で start しても何も起きない', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.start(1 * S);
    assert.deepEqual(announced, ['start']);
    assert.equal(engine.deadline, 10 * S);
  });

  test('pause は残り ms を凍結し，resume はそこから再開する', () => {
    const { engine } = makeEngine();
    engine.start(0);
    engine.pause(4 * S);
    assert.equal(engine.status, STATUS.PAUSED);
    assert.equal(engine.remainingAtPauseMs, 6 * S);
    assert.equal(engine.deadline, null);
    engine.resync(100 * S); // 停止中は時間が経っても進まない
    assert.equal(engine.status, STATUS.PAUSED);
    engine.resume(100 * S);
    assert.equal(engine.status, STATUS.RUNNING);
    assert.equal(engine.deadline, 106 * S);
    assert.equal(engine.remainingAtPauseMs, null);
  });

  test('reset は idle へ戻し，内部状態を破棄する', () => {
    const { engine, statuses } = makeEngine();
    engine.start(0);
    engine.resync(12 * S);
    engine.reset();
    assert.equal(engine.status, STATUS.IDLE);
    assert.equal(engine.segmentIndex, 0);
    assert.equal(engine.deadline, null);
    assert.equal(engine.remainingAtPauseMs, null);
    assert.deepEqual(statuses, [STATUS.RUNNING, STATUS.IDLE]);
  });
});

describe('自動遷移（FR-005, FR-006, FR-008, FR-017）', () => {
  test('発表 → 指定討論 → 聴衆討論 → 入れ替え → 次の発表 の順に遷移し，境界ごとに endAnnouncement が 1 回通知される', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);

    engine.resync(10 * S);
    assert.equal(engine.segments[engine.segmentIndex].kind, 'designated');
    assert.equal(engine.deadline, 15 * S);

    engine.resync(15 * S);
    assert.equal(engine.segments[engine.segmentIndex].kind, 'audience');
    assert.equal(engine.deadline, 23 * S);

    engine.resync(23 * S);
    assert.equal(engine.segments[engine.segmentIndex].kind, 'changeover');
    assert.equal(engine.deadline, 26 * S);

    engine.resync(26 * S);
    const seg = engine.segments[engine.segmentIndex];
    assert.equal(seg.kind, 'presentation');
    assert.equal(seg.speaker, 2);
    assert.equal(engine.deadline, 36 * S);

    assert.deepEqual(announced, [
      'start',
      'presentation_end',
      'designated_end',
      'audience_end_changeover',
      'changeover_end',
    ]);
  });

  test('次セグメントの deadline は前セグメントの終了時刻起点（遅れて resync しても累積しない）', () => {
    const { engine } = makeEngine();
    engine.start(0);
    engine.resync(10.7 * S); // 0.7 秒遅れて検知
    assert.equal(engine.deadline, 15 * S);
  });

  test('最終発表者の聴衆討論満了で completed になり complete が通知される', () => {
    const { engine, announced, statuses } = makeEngine();
    engine.start(0);
    // 2 名分: 10+5+8+3 + 10+5+8 = 49 秒
    for (const t of [10, 15, 23, 26, 36, 41, 49]) engine.resync(t * S);
    assert.equal(engine.status, STATUS.COMPLETED);
    assert.equal(engine.deadline, null);
    assert.equal(announced[announced.length - 1], 'complete');
    assert.equal(announced.filter((id) => id === 'complete').length, 1);
    assert.deepEqual(statuses, [STATUS.RUNNING, STATUS.COMPLETED]);
  });

  test('completed 以降の resync は何もしない', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.resync(49 * S);
    const count = announced.length;
    engine.resync(1000 * S);
    assert.equal(engine.status, STATUS.COMPLETED);
    assert.equal(announced.length, count);
  });
});

describe('複数セグメント跨ぎの再同期（FR-030）', () => {
  test('複数境界を一度に跨いでも正しいセグメントに追いつき，アナウンスは最新 1 件のみ', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.resync(24 * S); // 発表・指定討論・聴衆討論を跨いで入れ替えの途中
    assert.equal(engine.segments[engine.segmentIndex].kind, 'changeover');
    assert.equal(engine.deadline, 26 * S);
    assert.deepEqual(announced, ['start', 'audience_end_changeover']);
  });

  test('報告会終了時刻を大きく過ぎて復帰しても completed で安定し complete のみ通知', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.resync(500 * S);
    assert.equal(engine.status, STATUS.COMPLETED);
    assert.deepEqual(announced, ['start', 'complete']);
  });
});

describe('getSnapshot（表示用）', () => {
  test('idle: 先頭セグメント長と発表者 1 / 総数', () => {
    const { engine } = makeEngine();
    const snap = engine.getSnapshot(0);
    assert.equal(snap.status, STATUS.IDLE);
    assert.equal(snap.remainingMs, 10 * S);
    assert.equal(snap.segment.kind, 'presentation');
    assert.equal(snap.speaker, 1);
    assert.equal(snap.speakersTotal, 2);
  });

  test('running: deadline − now を返し，0 未満にならない', () => {
    const { engine } = makeEngine();
    engine.start(0);
    assert.equal(engine.getSnapshot(4 * S).remainingMs, 6 * S);
    assert.equal(engine.getSnapshot(10.5 * S).remainingMs, 0);
  });

  test('paused: 凍結した残り ms を返す', () => {
    const { engine } = makeEngine();
    engine.start(0);
    engine.pause(7 * S);
    assert.equal(engine.getSnapshot(999 * S).remainingMs, 3 * S);
  });

  test('入れ替え中は直前の発表者番号，次の発表に入ると番号が進む', () => {
    const { engine } = makeEngine();
    engine.start(0);
    engine.resync(24 * S);
    assert.equal(engine.getSnapshot(24 * S).speaker, 1);
    engine.resync(26 * S);
    assert.equal(engine.getSnapshot(26 * S).speaker, 2);
  });

  test('completed: segment は null，remainingMs は null，speaker は最終発表者', () => {
    const { engine } = makeEngine();
    engine.start(0);
    engine.resync(49 * S);
    const snap = engine.getSnapshot(49 * S);
    assert.equal(snap.status, STATUS.COMPLETED);
    assert.equal(snap.segment, null);
    assert.equal(snap.remainingMs, null);
    assert.equal(snap.speaker, 2);
    assert.equal(snap.speakersTotal, 2);
  });
});

describe('スキップ（FR-011〜FR-015, US2）', () => {
  test('発表・指定討論・聴衆討論・入れ替えの各セグメントで skip すると次セグメントに now 起点で入り，endAnnouncement が 1 回通知される', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    const expected = [
      ['presentation', 'presentation_end', 'designated', 5],
      ['designated', 'designated_end', 'audience', 8],
      ['audience', 'audience_end_changeover', 'changeover', 3],
      ['changeover', 'changeover_end', 'presentation', 10],
    ];
    let now = 1 * S;
    for (const [kind, announcement, nextKind, nextDuration] of expected) {
      assert.equal(engine.segments[engine.segmentIndex].kind, kind);
      const before = announced.length;
      engine.skip(now);
      assert.equal(engine.status, STATUS.RUNNING);
      assert.equal(engine.segments[engine.segmentIndex].kind, nextKind);
      assert.equal(engine.deadline, now + nextDuration * S);
      assert.deepEqual(announced.slice(before), [announcement]);
      now += 1 * S;
    }
    assert.equal(engine.segments[engine.segmentIndex].speaker, 2);
  });

  test('最終セグメントで skip すると completed になり complete が通知される', () => {
    const { engine, announced, statuses } = makeEngine();
    engine.start(0);
    for (let i = 0; i < 6; i++) engine.skip((i + 1) * S); // 最終 audience まで進める
    assert.equal(engine.segments[engine.segmentIndex].kind, 'audience');
    assert.equal(engine.segments[engine.segmentIndex].speaker, 2);
    engine.skip(7 * S);
    assert.equal(engine.status, STATUS.COMPLETED);
    assert.equal(engine.deadline, null);
    assert.equal(announced[announced.length - 1], 'complete');
    assert.deepEqual(statuses, [STATUS.RUNNING, STATUS.COMPLETED]);
  });

  test('paused から skip すると次セグメントが running で始まり，凍結値は破棄される（FR-013）', () => {
    const { engine, announced, statuses } = makeEngine();
    engine.start(0);
    engine.pause(4 * S);
    engine.skip(50 * S);
    assert.equal(engine.status, STATUS.RUNNING);
    assert.equal(engine.segments[engine.segmentIndex].kind, 'designated');
    assert.equal(engine.deadline, 55 * S);
    assert.equal(engine.remainingAtPauseMs, null);
    assert.deepEqual(announced, ['start', 'presentation_end']);
    assert.deepEqual(statuses, [STATUS.RUNNING, STATUS.PAUSED, STATUS.RUNNING]);
  });

  test('paused かつ最終セグメントで skip すると completed', () => {
    const { engine } = makeEngine({ ...SHORT, speakers: 1 });
    engine.start(0);
    engine.skip(1 * S);
    engine.skip(2 * S);
    engine.pause(3 * S);
    engine.skip(4 * S);
    assert.equal(engine.status, STATUS.COMPLETED);
    assert.equal(engine.remainingAtPauseMs, null);
  });

  test('残り 0 到達と同時の skip は満了処理のみで遷移 1 回・通知 1 回（FR-015）', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.skip(10 * S); // deadline ちょうど
    assert.equal(engine.segments[engine.segmentIndex].kind, 'designated');
    assert.equal(engine.deadline, 15 * S); // 満了処理なので前セグメント終了時刻起点
    assert.deepEqual(announced, ['start', 'presentation_end']);
  });

  test('deadline を過ぎてから skip しても遷移は満了分のみ（スキップ分は進まない）', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.skip(11 * S);
    assert.equal(engine.segments[engine.segmentIndex].kind, 'designated');
    assert.deepEqual(announced, ['start', 'presentation_end']);
  });

  test('idle・completed では skip は無視される', () => {
    const { engine, announced } = makeEngine();
    engine.skip(0);
    assert.equal(engine.status, STATUS.IDLE);
    assert.deepEqual(announced, []);
    engine.start(0);
    engine.resync(49 * S);
    const count = announced.length;
    engine.skip(50 * S);
    assert.equal(engine.status, STATUS.COMPLETED);
    assert.equal(announced.length, count);
  });

  test('skip 後の新セグメントではリマインドが改めて発火できる', () => {
    const { engine, announced } = makeEngine({ ...SHORT, speakers: 1, designatedSec: 10 });
    engine.start(0);
    engine.resync(7 * S); // 発表残り 3 秒 → リマインド
    engine.skip(8 * S);   // 指定討論へ
    engine.skip(9 * S);   // 聴衆討論へ（リマインド対象外）
    assert.deepEqual(announced, ['start', 'remind_presentation_3', 'presentation_end', 'designated_end']);
  });
});

describe('リマインド（FR-016, FR-023, US3）', () => {
  test('発表で残り ≤ remindBeforeSec になると remind_presentation_<sec> が 1 回だけ通知される', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.resync(6.9 * S);
    assert.deepEqual(announced, ['start']);
    engine.resync(7 * S);
    engine.resync(8 * S);
    engine.resync(9 * S);
    assert.deepEqual(announced, ['start', 'remind_presentation_3']);
  });

  test('指定討論・聴衆討論・入れ替えでは残り時間が閾値以下でも通知しない', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.skip(1 * S); // designated（5 秒）
    engine.resync(1 * S + 3 * S);
    engine.resync(1 * S + 4.9 * S);
    engine.skip(7 * S); // audience（8 秒）
    engine.resync(7 * S + 6 * S);
    engine.skip(14 * S); // changeover（3 秒）
    engine.resync(14 * S + 1 * S);
    assert.deepEqual(announced, [
      'start', 'presentation_end', 'designated_end', 'audience_end_changeover',
    ]);
  });

  test('remindBeforeSec ≥ 発表時間なら発表でも通知しない', () => {
    const { engine, announced } = makeEngine({ ...SHORT, remindBeforeSec: 10 });
    engine.start(0);
    engine.resync(1 * S);
    engine.resync(9 * S);
    assert.deepEqual(announced, ['start']);
  });

  test('paused 中は通知しない', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    engine.pause(5 * S);
    engine.resync(100 * S);
    assert.deepEqual(announced, ['start']);
    engine.resume(100 * S); // 残り 5 秒から再開
    engine.resync(102 * S); // 残り 3 秒
    assert.deepEqual(announced, ['start', 'remind_presentation_3']);
  });

  test('跨ぎ後にリマインド時刻も過ぎていた場合は追い再生しない', () => {
    const { engine, announced } = makeEngine();
    engine.start(0);
    // 入れ替え(26 秒まで) → 2 人目の発表(36 秒まで) の残り 2 秒に復帰
    engine.resync(34 * S);
    assert.equal(engine.segments[engine.segmentIndex].kind, 'presentation');
    assert.equal(engine.segments[engine.segmentIndex].speaker, 2);
    assert.deepEqual(announced, ['start', 'changeover_end']);
    engine.resync(35 * S);
    assert.deepEqual(announced, ['start', 'changeover_end']); // 追い再生なし
  });
});

describe('指定討論なしの進行表（002 US1）でもエンジンは無変更で動く', () => {
  test('2 名: start → 満了 ×4 → completed，アナウンス ID は専用の発表終了文言を使う', () => {
    const settings = { ...DEFAULT_SETTINGS, speakers: 2, designatedSec: 0,
      presentationSec: 10, audienceSec: 10, changeoverSec: 10, remindBeforeSec: 30 };
    const announced = [];
    const engine = new TimerEngine(buildSchedule(settings), settings.remindBeforeSec, {
      onAnnounce: (id) => announced.push(id),
    });
    let now = 0;
    engine.start(now);
    for (let i = 0; i < 5; i++) {
      now += 10_000;
      engine.resync(now);
    }
    assert.equal(engine.getSnapshot(now).status, STATUS.COMPLETED);
    assert.deepEqual(announced, [
      'start',
      'presentation_end_no_designated',
      'audience_end_changeover',
      'changeover_end',
      'presentation_end_no_designated',
      'complete',
    ]);
  });
});
