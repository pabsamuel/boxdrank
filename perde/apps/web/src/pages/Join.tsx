import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  NEUTRAL_POSE,
  PLAYER_SEATS,
  pickLocalized,
  type ControlAction,
  type ControllerInbound,
  type Gesture,
  type Pose,
  type StageState,
} from '@perde/shared';
import { cultures, getPack, isUnlocked } from '@perde/content';
import { KaraokeBar } from '../components/KaraokeBar';
import {
  DEFAULT_TUNING,
  MotionModel,
  createMotionSource,
  loadTuning,
  poseChanged,
  requestMotionPermission,
  resetTuning,
  saveTuning,
  type MotionPermission,
  type MotionReadout,
  type MotionSource,
  type MotionTuning,
} from '../lib/motion';
import { deletePuppet, listPuppets } from '../lib/puppet-store';
import { createSpeechSession, speechSupported, type SpeechSession } from '../lib/speech';
import { getRoom } from '../lib/api';
import { openControllerSocket, type ConnectionStatus } from '../lib/ws';
import { useT, useUiLang } from '../lib/ui';

/**
 * The phone. Three screens: enter/confirm the room, pick up the puppet
 * (permissions need a tap), then the rod itself: no buttons, just the line to
 * say. The hand does everything; the menu in the corner is for set-up.
 */

type Step = 'pickup' | 'play';
type RoomProblem = 'unknown' | 'no-stage';

/** Ask the relay whether a code is real. Network trouble is not the family's fault: let them through. */
async function lookUpRoom(code: string): Promise<RoomProblem | null> {
  try {
    const info = await getRoom(code);
    if (info === null) return 'unknown';
    return info.stage ? null : 'no-stage';
  } catch {
    return null;
  }
}

export function Join({ onToggleLang }: { onToggleLang: () => void }) {
  const t = useT();
  const uiLang = useUiLang();
  const [params, setParams] = useSearchParams();
  const room = (params.get('room') ?? '').toUpperCase();
  const [draft, setDraft] = useState(room);
  const [seat, setSeat] = useState(params.get('seat') ?? 'p1');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('perde.name') ?? '';
    } catch {
      return '';
    }
  });
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<RoomProblem | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Z]{4}$/.test(draft) || checking) return;
    setChecking(true);
    const found = await lookUpRoom(draft);
    setChecking(false);
    if (found === 'unknown') {
      setProblem(found);
      return;
    }
    setProblem(null);
    setParams({ room: draft, seat });
  };

  // Leaving keeps the last code in the box so a single wrong letter is a one-tap fix.
  const leave = () => {
    setProblem(null);
    setParams({});
  };

  if (!room) {
    return (
      <div className="phone phone--center">
        <button className="lang-toggle" onClick={onToggleLang}>
          {t('appName')} · {uiLang === 'tr' ? 'TR' : 'EN'}
        </button>
        <form className="join-form" onSubmit={submit}>
          <h1>{t('joinWithPhone')}</h1>
          <label>
            {t('enterCode')}
            <input
              value={draft}
              onChange={(e) => {
                setProblem(null);
                setDraft(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 4),
                );
              }}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              maxLength={4}
              aria-invalid={problem === 'unknown'}
            />
          </label>
          {problem === 'unknown' && (
            <p className="join-form__problem" role="alert">
              {t('roomNotFound')}
            </p>
          )}
          <label>
            {t('culture')}
            <select value={seat} onChange={(e) => setSeat(e.target.value)}>
              {PLAYER_SEATS.map((s, i) => (
                <option key={s} value={s}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            {uiLang === 'tr' ? 'Adın (isteğe bağlı)' : 'Your name (optional)'}
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} />
          </label>
          <button
            className="btn btn--primary btn--big"
            type="submit"
            disabled={draft.length !== 4 || checking}
          >
            {checking ? t('checking') : t('join')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <Controller
      key={room}
      code={room}
      seat={seat}
      name={name}
      onName={setName}
      onLeave={leave}
      onToggleLang={onToggleLang}
    />
  );
}

interface ControllerProps {
  code: string;
  seat: string;
  name: string;
  onName: (n: string) => void;
  onLeave: () => void;
  onToggleLang: () => void;
}

const POSE_INTERVAL_MS = 20;
const DRAG_START_PX = 12;
const DOUBLE_TAP_MS = 350;

function Controller({ code, seat, name, onName, onLeave, onToggleLang }: ControllerProps) {
  const t = useT();
  const uiLang = useUiLang();
  const [step, setStep] = useState<Step>('pickup');
  const [roomProblem, setRoomProblem] = useState<RoomProblem | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('closed');
  const [stageOnline, setStageOnline] = useState(true);
  const [state, setState] = useState<StageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [motion, setMotion] = useState<MotionPermission | null>(null);
  const [speechOk, setSpeechOk] = useState<boolean>(speechSupported());
  const [talking, setTalking] = useState(false);
  const [heard, setHeard] = useState('');
  const [menu, setMenu] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [tuning, setTuning] = useState<MotionTuning>(() => loadTuning());
  const [readout, setReadout] = useState<MotionReadout | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof openControllerSocket> | null>(null);
  const modelRef = useRef<MotionModel>(new MotionModel(tuning));
  const motionRef = useRef<MotionSource | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const poseRef = useRef<Pose>(NEUTRAL_POSE);
  const talkingRef = useRef(false);
  const touchRef = useRef<number | null>(null);
  const dragRef = useRef<{ startPx: number; startX: number; width: number; moved: boolean } | null>(
    null,
  );
  const lastTapRef = useRef(0);
  const lastPassRef = useRef(0);
  const stateRef = useRef<StageState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const lineKeyRef = useRef<string>('');

  // Until the TV has spoken, ask the relay why: a typo (no such room) and a
  // TV that closed its tab look identical from a silent socket.
  const hasState = state !== null;
  useEffect(() => {
    if (hasState) return;
    let cancelled = false;
    const check = () =>
      lookUpRoom(code).then((found) => {
        if (!cancelled) setRoomProblem(found);
      });
    void check();
    const timer = setInterval(() => void check(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, hasState]);

  const me = state?.seats.find((s) => s.id === seat);
  const pack = state ? getPack(state.cultureId) : undefined;
  const ps = state?.play ?? null;
  const myLine = !!ps?.line && (ps.line.seat === seat || ps.line.seat === undefined);
  const lineLabel = !ps?.line
    ? ''
    : ps.line.seat === seat
      ? t('yourLine')
      : ps.line.seat === undefined
        ? t('anyonesLine')
        : t('theirLine');

  const [mine, setMine] = useState(() => listPuppets());
  const sendPuppet = useCallback((id: string) => {
    const p = listPuppets().find((x) => x.id === id);
    if (p) socketRef.current?.send({ t: 'puppet', puppet: p });
  }, []);

  // After (re)connecting, or when the TV comes back: the newest drawing and the
  // current pose travel with the phone so the figure stands where the hand is.
  const resync = useCallback(() => {
    setTimeout(() => {
      const sock = socketRef.current;
      if (!sock) return;
      sock.send({ t: 'pose', pose: poseRef.current });
      const newest = listPuppets()[0];
      if (newest) sock.send({ t: 'puppet', puppet: newest });
    }, 300);
  }, []);

  const onMessage = useCallback(
    (msg: ControllerInbound) => {
      switch (msg.t) {
        case 'welcome':
          setStageOnline(msg.stageConnected);
          resync();
          break;
        case 'stage':
          setStageOnline(msg.online);
          // A reloaded TV starts from its snapshot; give it our pose and drawing again.
          if (msg.online) resync();
          break;
        case 'state':
          setState(msg.state);
          break;
        case 'error':
          setError(msg.message);
          break;
        default:
          break;
      }
    },
    [resync],
  );

  // Phones sleep: when the screen comes back, take the wake lock and the
  // microphone again and tell the TV where the rod is.
  const requestWakeLock = useCallback(() => {
    (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<unknown> } }).wakeLock
      ?.request('screen')
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (step !== 'play') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      requestWakeLock();
      speechRef.current?.start();
      resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [step, requestWakeLock, resync]);

  const pickUp = async () => {
    setError(null);
    try {
      localStorage.setItem('perde.name', name);
    } catch {
      /* ignore */
    }
    const perm = await requestMotionPermission();
    setMotion(perm);
    if (perm === 'granted') {
      motionRef.current = createMotionSource(modelRef.current);
      motionRef.current.start();
      setTimeout(() => motionRef.current?.recenter(), 700);
    }
    if (speechSupported()) {
      const lang = stateRef.current
        ? (getPack(stateRef.current.cultureId)?.culture.lang ?? 'tr-TR')
        : uiLang === 'tr'
          ? 'tr-TR'
          : 'en-GB';
      speechRef.current = createSpeechSession(lang, {
        onTranscript: (transcript, final) => {
          setHeard(transcript);
          const st = stateRef.current;
          const line = st?.play?.line;
          if (!st?.play || st.play.finished || !line) return;
          if (line.seat && line.seat !== seat) return;
          socketRef.current?.send({ t: 'speech', transcript, final, lineIndex: st.play.lineIndex });
        },
        onTalking: (on) => {
          talkingRef.current = on;
          setTalking(on);
        },
        onError: () => setSpeechOk(false),
      });
      speechRef.current?.start();
    }
    requestWakeLock();
    socketRef.current = openControllerSocket(code, seat, name, onMessage, setStatus);
    setStep('play');
  };

  // Pose loop at 50 Hz, sending only when something moved; hand gestures ride along.
  useEffect(() => {
    if (step !== 'play') return;
    const timer = setInterval(() => {
      const model = modelRef.current;
      const next = model.pose(touchRef.current, talkingRef.current);
      if (poseChanged(poseRef.current, next)) {
        poseRef.current = next;
        socketRef.current?.send({ t: 'pose', pose: next });
      }
      for (const g of model.takeGestures()) {
        const gesture: Gesture = g === 'turn' ? 'turn' : 'bow';
        socketRef.current?.send({ t: 'gesture', gesture });
        navigator.vibrate?.(15);
      }
    }, POSE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [step]);

  // Live readings for the tuning panel.
  useEffect(() => {
    if (!menu) return;
    const timer = setInterval(() => setReadout(modelRef.current.current()), 125);
    return () => clearInterval(timer);
  }, [menu]);

  // Reset the transcript buffer whenever the line changes; follow the culture's language.
  useEffect(() => {
    const key = ps ? `${ps.id}:${ps.lineIndex}` : '';
    if (key !== lineKeyRef.current) {
      lineKeyRef.current = key;
      speechRef.current?.reset();
      setHeard('');
      if (ps && ps.lineIndex > 0) navigator.vibrate?.(40);
    }
    if (pack) speechRef.current?.setLang(pack.culture.lang);
  }, [ps, pack]);

  useEffect(
    () => () => {
      socketRef.current?.close();
      motionRef.current?.stop();
      speechRef.current?.stop();
    },
    [],
  );

  const send = (msg: Parameters<NonNullable<typeof socketRef.current>['send']>[0]) =>
    socketRef.current?.send(msg);
  const control = (action: ControlAction, extra: Record<string, string> = {}) =>
    send({ t: 'control', action, ...extra });
  const applyTuning = (next: MotionTuning) => {
    setTuning(next);
    saveTuning(next);
    modelRef.current.setTuning(next);
  };
  const recenter = () => {
    motionRef.current?.recenter();
    modelRef.current.recenter();
    setFlash(t('recenter'));
    setTimeout(() => setFlash(null), 700);
  };
  const passLine = () => {
    const now = Date.now();
    if (now - lastPassRef.current < 600) return;
    lastPassRef.current = now;
    if (myLine) control('said-it');
  };

  // The whole screen is the rod: drag sideways to walk, double-tap the line to count it as said.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      startPx: e.clientX,
      startX: poseRef.current.x,
      width: rect.width,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startPx;
    if (!d.moved && Math.abs(dx) < DRAG_START_PX) return;
    d.moved = true;
    touchRef.current = Math.max(-1, Math.min(1, d.startX + dx / (d.width * 0.45)));
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    touchRef.current = null;
    if (!d || d.moved) return;
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      passLine();
    } else {
      lastTapRef.current = now;
    }
  };

  const color = me?.color ?? '#f2c94c';

  if (step === 'pickup') {
    return (
      <div className="phone phone--center" style={{ ['--seat' as string]: color }}>
        <button className="lang-toggle" onClick={onToggleLang}>
          {t('appName')} · {uiLang === 'tr' ? 'TR' : 'EN'}
        </button>
        <div className="pickup">
          <p className="pickup__code">
            {t('roomCode')} <strong>{code}</strong> · {seat.toUpperCase()}
          </p>
          <label className="pickup__name">
            {uiLang === 'tr' ? 'Adın (isteğe bağlı)' : 'Your name (optional)'}
            <input value={name} onChange={(e) => onName(e.target.value.slice(0, 40))} />
          </label>
          {roomProblem && (
            <p className="pickup__hint pickup__hint--warn" role="alert">
              {roomProblem === 'unknown' ? t('roomNotFound') : t('roomNoStage')}
            </p>
          )}
          <button
            className="btn btn--primary btn--huge"
            onClick={pickUp}
            disabled={roomProblem === 'unknown'}
          >
            🎭 {t('pickUpPuppet')}
          </button>
          <p className="pickup__hint">{t('motionPermission')}</p>
          <p className="pickup__hint">{t('holdLikeARod')}</p>
          {!speechSupported() && (
            <p className="pickup__hint pickup__hint--warn">{t('micUnavailable')}</p>
          )}
          {error && <p className="pickup__hint pickup__hint--warn">{error}</p>}
          <button
            className={`btn pickup__back ${roomProblem === 'unknown' ? 'btn--primary btn--big' : 'btn--ghost'}`}
            onClick={onLeave}
          >
            ← {t('changeCode')}
          </button>
        </div>
      </div>
    );
  }

  const plays = pack?.plays ?? [];
  const locked = (item: { premium: boolean }) => !isUnlocked(item, state?.plan ?? 'free');

  return (
    <div className="phone controller" style={{ ['--seat' as string]: color }}>
      <header className="controller__top">
        <div className="controller__who">
          <span className="controller__puppet">{me?.puppetName ?? '…'}</span>
          {me?.isHost && <span className="badge badge--host">host</span>}
        </div>
        <div className="controller__status">
          <span className={`dot dot--${status}`} />
          <button
            className="btn btn--ghost btn--icon"
            onClick={recenter}
            disabled={motion !== 'granted'}
            aria-label={t('recenter')}
            title={t('recenter')}
          >
            ⌖
          </button>
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label="menu"
          >
            ☰
          </button>
        </div>
      </header>

      <main
        className={`rod ${myLine ? 'is-mine' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={passLine}
      >
        {status !== 'open' && <p className="warn rod__reconnect">{t('reconnecting')}</p>}
        {!stageOnline && state && (
          <section className="rod__problem">
            <p className="warn">{t('stageOffline')}</p>
            <button className="btn btn--small" onClick={onLeave}>
              ← {t('changeCode')}
            </button>
          </section>
        )}
        {ps && !ps.finished && (
          <section className="rod__line">
            <KaraokeBar
              play={ps}
              color={color}
              compact
              label={lineLabel}
              nextLabel={ps.next?.seat === seat ? t('nextUp') : undefined}
            />
            {myLine && (
              <p className="rod__listen">
                {speechOk ? (
                  <span className={`listen ${talking ? 'is-talking' : ''}`}>
                    🎤 {t('listening')} {heard && <em>{heard.slice(-60)}</em>}
                  </span>
                ) : (
                  <span className="warn">{t('micUnavailable')}</span>
                )}
              </p>
            )}
            {myLine && <p className="rod__tap">{t('tapTwiceToPass')}</p>}
          </section>
        )}
        {ps?.finished && (
          <section className="rod__line rod__line--end">
            <h2>{t('theEnd')}</h2>
            <p>
              {ps.spokenLines}/{ps.totalLines} {t('spokenLines')}
            </p>
          </section>
        )}
        {!ps && state && (
          <section className="rod__line rod__line--idle">
            <p>
              {me?.isHost
                ? uiLang === 'tr'
                  ? 'Serbest oyun. Oyun seçmek için ☰.'
                  : 'Free play. ☰ to pick a play.'
                : t('freePlay')}
            </p>
          </section>
        )}
        {!state && (
          <section className="rod__problem">
            <p
              className={roomProblem ? 'warn' : 'rod__waiting'}
              role={roomProblem ? 'alert' : undefined}
            >
              {roomProblem === 'unknown'
                ? t('roomNotFound')
                : roomProblem === 'no-stage'
                  ? t('roomNoStage')
                  : t('waitingForStage')}
            </p>
            <button className="btn btn--small" onClick={onLeave}>
              ← {t('changeCode')}
            </button>
          </section>
        )}
        {flash && <div className="rod__flash">{flash}</div>}
        <p className="rod__hint">{t('holdLikeARod')}</p>
        {motion === 'denied' && (
          <p className="warn">
            {uiLang === 'tr'
              ? 'Hareket izni verilmedi; ekranda sürükleyerek oynat.'
              : 'Motion access denied; drag on the screen to play.'}
          </p>
        )}
      </main>

      {menu && (
        <div className="menu" role="dialog">
          <div className="menu__head">
            <strong>{t('choosePlay')}</strong>
            <button className="btn btn--ghost btn--small" onClick={() => setMenu(false)}>
              ✕
            </button>
          </div>
          {state && (
            <>
              <ul className="menu__plays">
                {plays.map((p) => (
                  <li key={p.id}>
                    <button
                      className={`btn btn--row ${locked(p) ? 'is-locked' : ''}`}
                      onClick={() => {
                        control('start-play', { playId: p.id });
                        setMenu(false);
                      }}
                    >
                      <span>
                        {p.title} <small>{p.subtitle}</small>
                      </span>
                      <small>
                        {locked(p)
                          ? '🔒 ' + t('locked')
                          : `${p.durationMin} dk · ${p.ageRange ?? ''}`}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="menu__row">
                <button className="btn btn--small" onClick={() => control('free-play')}>
                  {t('freePlay')}
                </button>
                <button className="btn btn--small" onClick={() => control('lobby')}>
                  {t('backToLobby')}
                </button>
                <button className="btn btn--small" onClick={() => control('toggle-karaoke')}>
                  {state.karaoke ? t('karaokeOn') : t('karaokeOff')}
                </button>
                {ps && (
                  <>
                    <button className="btn btn--small" onClick={() => control('prev')}>
                      ◀ {t('prevLine')}
                    </button>
                    <button className="btn btn--small" onClick={() => control('next')}>
                      {t('nextLine')} ▶
                    </button>
                  </>
                )}
              </div>
              <div className="menu__row">
                <span>{t('leniency')}:</span>
                {(['kids', 'normal', 'strict'] as const).map((l) => (
                  <button
                    key={l}
                    className={`btn btn--small ${state.leniency === l ? 'is-active' : ''}`}
                    onClick={() => control('set-leniency', { leniency: l })}
                  >
                    {t(l)}
                  </button>
                ))}
              </div>
              <div className="menu__row">
                <span>{me?.puppetName}:</span>
                {state.customPuppets?.map((p) => (
                  <button
                    key={p.id}
                    className={`btn btn--small ${me?.puppetId === p.id ? 'is-active' : ''}`}
                    onClick={() => control('set-puppet', { puppetId: p.id })}
                  >
                    ✏️ {p.name}
                  </button>
                ))}
                {pack?.puppets.map((p) => (
                  <button
                    key={p.id}
                    className={`btn btn--small ${me?.puppetId === p.id ? 'is-active' : ''} ${locked(p) ? 'is-locked' : ''}`}
                    onClick={() => control('set-puppet', { puppetId: p.id })}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="menu__row menu__mine">
                <Link
                  className="btn btn--small btn--primary"
                  to={`/draw?room=${encodeURIComponent(code)}&seat=${encodeURIComponent(seat)}`}
                >
                  ✏️ {t('drawYourOwn')}
                </Link>
                {mine.length > 0 && <span>{t('myPuppets')}:</span>}
                {mine.map((p) => (
                  <span key={p.id} className="menu__chip">
                    <button className="btn btn--small" onClick={() => sendPuppet(p.id)}>
                      {p.name} ↗
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      aria-label={t('deletePuppet')}
                      onClick={() => {
                        deletePuppet(p.id);
                        setMine(listPuppets());
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="menu__row">
                <button className="btn btn--small" onClick={() => control('toggle-voice')}>
                  {(state.voice ?? true) ? t('voiceOn') : t('voiceOff')}
                </button>
                <button className="btn btn--small" onClick={() => control('toggle-sound')}>
                  {(state.sound ?? true) ? t('soundOn') : t('soundOff')}
                </button>
              </div>
              <div className="menu__row">
                <span>{t('culture')}:</span>
                {cultures.map((c) => (
                  <button
                    key={c.id}
                    className={`btn btn--small ${state.cultureId === c.id ? 'is-active' : ''} ${locked(c) ? 'is-locked' : ''}`}
                    onClick={() => control('set-culture', { cultureId: c.id })}
                  >
                    {pickLocalized(c.name, uiLang)}
                  </button>
                ))}
              </div>
              {state.plan === 'free' && (
                <form
                  className="menu__row menu__license"
                  onSubmit={(e) => {
                    e.preventDefault();
                    control('activate-license', { licenseKey: licenseKey.trim() });
                  }}
                >
                  <input
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder={
                      uiLang === 'tr' ? 'Perde Plus lisans anahtarı' : 'Perde Plus licence key'
                    }
                  />
                  <button
                    className="btn btn--small btn--primary"
                    type="submit"
                    disabled={licenseKey.trim().length < 16}
                  >
                    {t('premium')}
                  </button>
                </form>
              )}
              {state.notice && <p className="warn">{state.notice}</p>}

              <TuningPanel
                tuning={tuning}
                readout={readout}
                onChange={applyTuning}
                onReset={() => applyTuning(resetTuning())}
              />
            </>
          )}
          <div className="menu__row menu__leave">
            <button className="btn btn--small" onClick={onLeave}>
              ⏏ {t('leaveRoom')}
            </button>
            <small>
              {t('roomCode')} <strong>{code}</strong> · {seat.toUpperCase()}
            </small>
          </div>
        </div>
      )}
    </div>
  );
}

interface TuningPanelProps {
  tuning: MotionTuning;
  readout: MotionReadout | null;
  onChange: (t: MotionTuning) => void;
  onReset: () => void;
}

function TuningPanel({ tuning, readout, onChange, onReset }: TuningPanelProps) {
  const t = useT();
  const slider = (
    key: keyof MotionTuning,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="tuning__row" key={key}>
      <span>
        {label} <b>{String(tuning[key])}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(tuning[key])}
        onChange={(e) => onChange({ ...tuning, [key]: Number(e.target.value) })}
      />
    </label>
  );
  const toggle = (key: 'invertX' | 'invertLean', label: string) => (
    <label className="tuning__row tuning__row--toggle" key={key}>
      <input
        type="checkbox"
        checked={tuning[key]}
        onChange={(e) => onChange({ ...tuning, [key]: e.target.checked })}
      />
      <span>{label}</span>
    </label>
  );
  const copy = () => {
    const text = JSON.stringify(tuning, null, 2);
    navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  return (
    <details className="tuning">
      <summary>{t('tuning')}</summary>
      {slider('travelCm', t('tuningTravel'), 0, 60, 1)}
      {slider('yawRangeDeg', t('tuningYaw'), 10, 120, 1)}
      {slider('leanRangeDeg', t('tuningLean'), 10, 70, 1)}
      {slider('armRangeDeg', t('tuningArm'), 10, 80, 1)}
      {slider('hopCm', t('tuningHop'), 0, 30, 1)}
      {slider('smoothing', t('tuningSmoothing'), 0, 0.9, 0.05)}
      {slider('deadband', t('tuningDeadband'), 0.1, 1.5, 0.05)}
      {toggle('invertX', t('tuningInvertX'))}
      {toggle('invertLean', t('tuningInvertLean'))}
      <label className="tuning__row tuning__row--toggle">
        <input
          type="checkbox"
          checked={tuning.accelSign === -1}
          onChange={(e) => onChange({ ...tuning, accelSign: e.target.checked ? -1 : 1 })}
        />
        <span>{t('tuningAccelSign')}</span>
      </label>
      {readout && (
        <pre className="tuning__live">
          {t('tuningLive')}
          {'\n'}heading {readout.headingDeg.toFixed(0)}° · lean {readout.leanDeg.toFixed(0)}° ·
          pitch {readout.pitchDeg.toFixed(0)}°{'\n'}
          a→ {readout.lateralAccel.toFixed(2)} · a↑ {readout.upAccel.toFixed(2)} m/s²{'\n'}x{' '}
          {readout.lateralCm.toFixed(1)} cm · y {readout.upCm.toFixed(1)} cm
          {readout.hasOrientation ? '' : ' · no orientation events'}
        </pre>
      )}
      <div className="menu__row">
        <button className="btn btn--small" onClick={onReset}>
          {t('tuningReset')}
        </button>
        <button className="btn btn--small" onClick={copy}>
          {t('tuningCopy')}
        </button>
        <small>
          {JSON.stringify(DEFAULT_TUNING) === JSON.stringify({ ...tuning, accelSign: 1 })
            ? 'defaults'
            : 'custom'}
        </small>
      </div>
    </details>
  );
}
