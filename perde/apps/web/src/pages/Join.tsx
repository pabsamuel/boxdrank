import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
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
  computePose,
  createMotionSource,
  poseChanged,
  requestMotionPermission,
  type MotionPermission,
  type MotionSource,
} from '../lib/motion';
import { createSpeechSession, speechSupported, type SpeechSession } from '../lib/speech';
import { openControllerSocket, type ConnectionStatus } from '../lib/ws';
import { useT, useUiLang } from '../lib/ui';

/**
 * The phone. Three screens: enter/confirm the room, pick up the puppet
 * (permissions need a tap), then the controller itself.
 */

type Step = 'form' | 'pickup' | 'play';

export function Join({ onToggleLang }: { onToggleLang: () => void }) {
  const t = useT();
  const uiLang = useUiLang();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState((params.get('room') ?? '').toUpperCase());
  const [seat, setSeat] = useState(params.get('seat') ?? 'p1');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('perde.name') ?? '';
    } catch {
      return '';
    }
  });
  const [step, setStep] = useState<Step>(params.get('room') ? 'pickup' : 'form');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Z]{4}$/.test(code)) return;
    setParams({ room: code, seat });
    setStep('pickup');
  };

  if (step === 'form') {
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
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 4),
                )
              }
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              maxLength={4}
            />
          </label>
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
          <button className="btn btn--primary btn--big" type="submit" disabled={code.length !== 4}>
            {t('join')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <Controller
      code={code}
      seat={seat}
      name={name}
      onName={setName}
      step={step}
      setStep={setStep}
      onToggleLang={onToggleLang}
    />
  );
}

interface ControllerProps {
  code: string;
  seat: string;
  name: string;
  onName: (n: string) => void;
  step: Step;
  setStep: (s: Step) => void;
  onToggleLang: () => void;
}

function Controller({ code, seat, name, onName, step, setStep, onToggleLang }: ControllerProps) {
  const t = useT();
  const uiLang = useUiLang();
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
  const [touchX, setTouchX] = useState<number | null>(null);
  const [knobX, setKnobX] = useState(0);
  const socketRef = useRef<ReturnType<typeof openControllerSocket> | null>(null);
  const motionRef = useRef<MotionSource | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const poseRef = useRef<Pose>(NEUTRAL_POSE);
  const talkingRef = useRef(false);
  const touchRef = useRef<number | null>(null);
  const stateRef = useRef<StageState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const lineKeyRef = useRef<string>('');

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

  const onMessage = useCallback((msg: ControllerInbound) => {
    switch (msg.t) {
      case 'welcome':
        setStageOnline(msg.stageConnected);
        break;
      case 'stage':
        setStageOnline(msg.online);
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
  }, []);

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
      motionRef.current = createMotionSource();
      motionRef.current.start();
      setTimeout(() => motionRef.current?.recenter(), 600);
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
    try {
      await (
        navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<unknown> } }
      ).wakeLock?.request('screen');
    } catch {
      /* not critical */
    }
    socketRef.current = openControllerSocket(code, seat, name, onMessage, setStatus);
    setStep('play');
  };

  // Pose loop at ~30 Hz, sending only when something moved.
  useEffect(() => {
    if (step !== 'play') return;
    const timer = setInterval(() => {
      const m = motionRef.current;
      const next = computePose({
        orientation: m?.orientation ?? { alpha: null, beta: null, gamma: null },
        calibration: m?.calibration ?? { alpha0: 0, beta0: 40 },
        bounce: m?.bounce ?? 0,
        touchX: touchRef.current,
        talking: talkingRef.current,
        prev: poseRef.current,
      });
      if (poseChanged(poseRef.current, next)) {
        if (Math.abs(next.x - poseRef.current.x) > 0.01) setKnobX(next.x);
        poseRef.current = next;
        socketRef.current?.send({ t: 'pose', pose: next });
      }
    }, 33);
    return () => clearInterval(timer);
  }, [step]);

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
  const gesture = (g: Gesture) => {
    send({ t: 'gesture', gesture: g });
    navigator.vibrate?.(20);
  };

  const onPad = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    touchRef.current = Math.max(-1, Math.min(1, x));
    setTouchX(touchRef.current);
  };
  const onPadEnd = () => {
    // Keep the last touched position: the puppet stays where you left it.
    setTouchX(null);
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
          <button className="btn btn--primary btn--huge" onClick={pickUp}>
            🎭 {t('pickUpPuppet')}
          </button>
          <p className="pickup__hint">{t('motionPermission')}</p>
          {!speechSupported() && (
            <p className="pickup__hint pickup__hint--warn">{t('micUnavailable')}</p>
          )}
          {error && <p className="pickup__hint pickup__hint--warn">{error}</p>}
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
          {!stageOnline && <span className="warn">{t('stageOffline')}</span>}
          <button
            className="btn btn--ghost btn--small"
            onClick={() => motionRef.current?.recenter()}
            disabled={motion !== 'granted'}
          >
            {t('recenter')}
          </button>
          <button
            className="btn btn--ghost btn--small"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
          >
            ☰
          </button>
        </div>
      </header>

      {ps && !ps.finished && (
        <section className={`controller__line ${myLine ? 'is-mine' : ''}`}>
          <KaraokeBar play={ps} color={color} compact label={lineLabel} />
          {myLine && (
            <div className="controller__listen">
              {speechOk ? (
                <span className={`listen ${talking ? 'is-talking' : ''}`}>
                  🎤 {t('listening')} {heard && <em>{heard.slice(-60)}</em>}
                </span>
              ) : (
                <span className="warn">{t('micUnavailable')}</span>
              )}
              <button className="btn btn--small" onClick={() => control('said-it')}>
                ✓ {t('saidIt')}
              </button>
            </div>
          )}
        </section>
      )}
      {ps?.finished && (
        <section className="controller__line">
          <h2>{t('theEnd')}</h2>
          <button className="btn" onClick={() => control('lobby')}>
            {t('backToLobby')}
          </button>
        </section>
      )}
      {!ps && state && (
        <section className="controller__line controller__line--idle">
          <p>
            {me?.isHost
              ? uiLang === 'tr'
                ? 'Serbest oyun. Menüden bir oyun seç.'
                : 'Free play. Pick a play from the menu.'
              : t('freePlay')}
          </p>
        </section>
      )}

      <div
        className="pad"
        onPointerDown={onPad}
        onPointerMove={(e) => e.buttons > 0 && onPad(e)}
        onPointerUp={onPadEnd}
        onPointerCancel={onPadEnd}
        role="slider"
        aria-label="stage position"
        aria-valuenow={Math.round(((touchX ?? knobX) + 1) * 50)}
      >
        <p className="pad__hint">
          {uiLang === 'tr'
            ? 'Sürükle: sahnede yürü · Telefonu eğ: eğil · Öne yatır: kolunu kaldır · Salla: zıpla'
            : 'Drag: walk · Tilt: lean · Tip forward: raise arm · Shake: hop'}
        </p>
        <div className="pad__track">
          <div className="pad__knob" style={{ left: `${((touchX ?? knobX) + 1) * 50}%` }} />
        </div>
        {motion === 'denied' && (
          <p className="warn">
            {uiLang === 'tr'
              ? 'Hareket izni verilmedi; sürükleyerek oynat.'
              : 'Motion access denied; drag to play.'}
          </p>
        )}
      </div>

      <div className="gestures">
        <button className="btn btn--gesture" onClick={() => gesture('wave')}>
          👋 {t('wave')}
        </button>
        <button className="btn btn--gesture" onClick={() => gesture('jump')}>
          ⬆️ {t('jump')}
        </button>
        <button className="btn btn--gesture" onClick={() => gesture('spin')}>
          🌀 {t('spin')}
        </button>
        <button className="btn btn--gesture" onClick={() => gesture('bow')}>
          🙇 {t('bow')}
        </button>
        {!speechOk && (
          <button
            className="btn btn--gesture btn--talk"
            onPointerDown={() => {
              talkingRef.current = true;
              setTalking(true);
            }}
            onPointerUp={() => {
              talkingRef.current = false;
              setTalking(false);
            }}
          >
            🗣 {uiLang === 'tr' ? 'Konuş (basılı tut)' : 'Talk (hold)'}
          </button>
        )}
      </div>

      {menu && state && (
        <div className="menu" role="dialog">
          <div className="menu__head">
            <strong>{t('choosePlay')}</strong>
            <button className="btn btn--ghost btn--small" onClick={() => setMenu(false)}>
              ✕
            </button>
          </div>
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
                    {locked(p) ? '🔒 ' + t('locked') : `${p.durationMin} dk · ${p.ageRange ?? ''}`}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          <div className="menu__row">
            <button className="btn btn--small" onClick={() => control('free-play')}>
              {t('freePlay')}
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
        </div>
      )}
    </div>
  );
}
