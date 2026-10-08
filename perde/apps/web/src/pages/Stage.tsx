import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router';
import { joinUrl, NEUTRAL_POSE, pickLocalized, type StageInbound } from '@perde/shared';
import { KaraokeBar } from '../components/KaraokeBar';
import { StageScene, type ScenePuppet } from '../components/StageScene';
import { playNareke, playSting, playTef, unlockSound, watchSound } from '../lib/sound';
import { createRoom, getRoom } from '../lib/api';
import { activate, resolvePlan } from '../lib/entitlements';
import {
  createStageModel,
  findPuppet,
  reduceStage,
  snapshotModel,
  visiblePuppets,
  type StageEvent,
  type StageModel,
} from '../lib/stage-machine';
import { openStageSocket, type ConnectionStatus } from '../lib/ws';
import { useT, useUiLang } from '../lib/ui';

/**
 * The TV. Creates (or rejoins) a room, shows QR codes until someone picks up a
 * puppet, then renders whatever the stage machine says. Everything the phones
 * send goes through the reducer; the resulting state is broadcast back.
 */

const ROOM_KEY = 'perde.stage.room';
/** The running room, saved so a reloaded TV (or a flaky TV browser) picks it back up. */
const SNAPSHOT_KEY = 'perde.stage.snapshot';

function readSnapshot(code: string): unknown {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as { code?: string };
    return snap.code === code ? snap : null;
  } catch {
    return null;
  }
}

function reducer(model: StageModel, ev: StageEvent): StageModel {
  return reduceStage(model, ev);
}

export function Stage() {
  const t = useT();
  const uiLang = useUiLang();
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';
  const [model, dispatch] = useReducer(reducer, params.get('culture') ?? 'tr', (c) =>
    createStageModel(c, demo ? 'plus' : 'free'),
  );
  const [code, setCode] = useState<string | null>(demo ? 'DEMO' : null);
  const [status, setStatus] = useState<ConnectionStatus>(demo ? 'open' : 'connecting');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof openStageSocket> | null>(null);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const onMessage = useCallback((msg: StageInbound) => {
    const at = Date.now();
    switch (msg.t) {
      case 'welcome':
        dispatch({ type: 'welcome', peers: msg.peers, at });
        break;
      case 'joined':
        dispatch({ type: 'joined', seat: msg.seat, name: msg.name, at });
        break;
      case 'left':
        dispatch({ type: 'left', seat: msg.seat });
        break;
      case 'control':
        if (msg.action === 'activate-license') {
          activate(msg.licenseKey ?? '').then((r) =>
            dispatch({
              type: 'plan',
              plan: r.ok ? 'plus' : modelRef.current.state.plan,
              notice: r.ok ? 'plus-activated' : 'license-rejected',
            }),
          );
        } else {
          dispatch({ type: 'msg', msg, at });
        }
        break;
      case 'pose':
      case 'gesture':
      case 'speech':
      case 'puppet':
        dispatch({ type: 'msg', msg, at });
        break;
      case 'error':
        setError(msg.message);
        break;
      case 'pong':
        break;
    }
  }, []);

  // Room + socket lifecycle.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      try {
        let c = params.get('room')?.toUpperCase() ?? sessionStorage.getItem(ROOM_KEY);
        if (c && !(await getRoom(c).catch(() => null))) c = null;
        if (!c) c = await createRoom();
        if (cancelled) return;
        sessionStorage.setItem(ROOM_KEY, c);
        setCode(c);
        // Same room as before the reload: carry on where the play was.
        const snapshot = readSnapshot(c);
        if (snapshot) dispatch({ type: 'restore', snapshot });
        socketRef.current = openStageSocket(c, onMessage, setStatus);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [demo, onMessage, params]);

  // Entitlements.
  useEffect(() => {
    if (demo) return;
    resolvePlan().then((r) => dispatch({ type: 'plan', plan: r.plan }));
  }, [demo]);

  // Remember the room so a reload does not lose the play.
  useEffect(() => {
    if (demo || !code) return;
    try {
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshotModel(model, code)));
    } catch {
      /* storage full or disabled: the reload falls back to the lobby */
    }
  }, [model, code, demo]);

  // Broadcast state to phones whenever it changes.
  useEffect(() => {
    socketRef.current?.send({ t: 'state', state: model.state });
  }, [model.state]);

  // Demo: two phantom puppeteers run the opening play by themselves.
  useEffect(() => {
    if (!demo) return;
    const at = Date.now();
    dispatch({ type: 'joined', seat: 'p1', name: 'Demo', at });
    dispatch({ type: 'joined', seat: 'p2', at });
    const startTimer = setTimeout(
      () =>
        dispatch({
          type: 'msg',
          msg: {
            t: 'control',
            seat: 'p1',
            action: 'start-play',
            playId: modelRef.current.pack.plays[0]?.id,
          },
          at: Date.now(),
        }),
      800,
    );
    const lineTimer = setInterval(() => {
      const ps = modelRef.current.state.play;
      if (ps && !ps.finished)
        dispatch({
          type: 'msg',
          msg: { t: 'control', seat: 'p1', action: 'next' },
          at: Date.now(),
        });
    }, 2600);
    let frame = 0;
    const poseTimer = setInterval(() => {
      frame += 1;
      const s = frame / 20;
      dispatch({
        type: 'msg',
        msg: {
          t: 'pose',
          seat: 'p1',
          pose: {
            x: Math.sin(s * 0.6) * 0.2,
            y: Math.max(0, Math.sin(s * 2.2)) * 0.3,
            lean: Math.sin(s * 1.7) * 0.5,
            arm: (Math.sin(s * 2.5) + 1) / 2,
            talking: modelRef.current.state.play?.line?.seat === 'p1',
          },
        },
        at: Date.now(),
      });
      dispatch({
        type: 'msg',
        msg: {
          t: 'pose',
          seat: 'p2',
          pose: {
            x: Math.sin(s * 0.4 + 1) * 0.15,
            y: 0,
            lean: Math.sin(s * 1.1 + 2) * 0.3,
            arm: (Math.sin(s * 1.4 + 1) + 1) / 2,
            talking: modelRef.current.state.play?.line?.seat === 'p2',
          },
        },
        at: Date.now(),
      });
    }, 50);
    return () => {
      clearTimeout(startTimer);
      clearInterval(lineTimer);
      clearInterval(poseTimer);
    };
  }, [demo]);

  // Keyboard for a laptop or a TV remote with a keyboard; ? shows the card.
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const at = Date.now();
      unlockSound();
      if (e.key === '?' || e.key === 'h') setHelp((h) => !h);
      else if (e.key === 'f') document.documentElement.requestFullscreen?.().catch(() => undefined);
      else if (e.key === 'n' || e.key === 'ArrowRight')
        dispatch({ type: 'local', action: 'next', at });
      else if (e.key === 'ArrowLeft') dispatch({ type: 'local', action: 'prev', at });
      else if (e.key === 'k') dispatch({ type: 'local', action: 'toggle-karaoke', at });
      else if (e.key === 'Escape') {
        setHelp(false);
        dispatch({ type: 'local', action: 'lobby', at });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The TV reads the lines of characters nobody holds, then moves on.
  const line = model.state.play?.line;
  const lineKey = model.state.play ? `${model.state.play.id}:${model.state.play.lineIndex}` : '';
  const voiceOn = model.state.voice ?? true;
  const playLang = model.play?.lang;
  const finished = model.state.play?.finished ?? false;
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    if (!voiceOn || !line || line.seat || !playLang || finished) return;
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = playLang;
    const voices = speechSynthesis.getVoices();
    const wanted = playLang.toLowerCase();
    const match =
      voices.find((v) => v.lang.replace('_', '-').toLowerCase() === wanted) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(wanted.slice(0, 2)));
    if (match) u.voice = match;
    u.rate = line.song ? 0.85 : 0.95;
    u.pitch = line.character === 'karagoz' ? 0.8 : 1.1;
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      const current = modelRef.current.state.play;
      if (current && `${current.id}:${current.lineIndex}` === lineKey) {
        dispatch({ type: 'local', action: 'auto-advance', at: Date.now() });
      }
    };
    u.onend = () => setTimeout(advance, 350);
    u.onerror = () => setTimeout(advance, 1200);
    const timer = setTimeout(() => speechSynthesis.speak(u), 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      speechSynthesis.cancel();
    };
  }, [lineKey, voiceOn, line, playLang, finished]);

  // First-run coaching once the first puppeteer picks up a rod.
  const [coach, setCoach] = useState(false);
  const wasLobby = useRef(true);
  useEffect(() => {
    if (wasLobby.current && model.state.mode !== 'lobby' && !demo) {
      wasLobby.current = false;
      const show = setTimeout(() => setCoach(true), 0);
      const hide = setTimeout(() => setCoach(false), 12_000);
      return () => {
        clearTimeout(show);
        clearTimeout(hide);
      };
    }
    if (model.state.mode === 'lobby') wasLobby.current = true;
  }, [model.state.mode, demo]);

  // Sound: browsers need one tap before audio may start; the TV asks for it.
  const soundOn = model.state.sound ?? true;
  const [audioReady, setAudioReady] = useState(true);
  useEffect(() => watchSound(setAudioReady), []);
  const unlockAll = () => {
    unlockSound();
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  // The göstermelik hangs while the room waits; the nareke lifts it when the
  // first puppeteer steps up, and the tef greets them.
  const mode = model.state.mode;
  const [liftedAt, setLiftedAt] = useState<number | null>(null);
  const prevMode = useRef(mode);
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = mode;
    if (was === 'lobby' && mode !== 'lobby') {
      const id = setTimeout(() => {
        setLiftedAt(performance.now());
        if (soundOn) {
          playNareke();
          setTimeout(() => playTef('entrance'), 1100);
        }
      }, 0);
      return () => clearTimeout(id);
    }
    if (mode === 'lobby' && was !== 'lobby') {
      const id = setTimeout(() => setLiftedAt(null), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [mode, soundOn]);

  // A tef roll when a section turns, a sting when the curtain falls.
  const sectionKey = model.state.play
    ? `${model.state.play.id}:${model.state.play.sectionTitle}`
    : '';
  const prevSection = useRef(sectionKey);
  const [sectionCard, setSectionCard] = useState<string | null>(null);
  useEffect(() => {
    const was = prevSection.current;
    prevSection.current = sectionKey;
    if (!sectionKey) return;
    const samePlay = !!was && was.split(':')[0] === sectionKey.split(':')[0];
    if (soundOn) playTef(samePlay ? 'section' : 'hit');
    if (!samePlay) return;
    // A title card between the parts of a play.
    const title = sectionKey.slice(sectionKey.indexOf(':') + 1);
    const show = setTimeout(() => setSectionCard(title), 0);
    const hide = setTimeout(() => setSectionCard(null), 2800);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [sectionKey, soundOn]);
  const playFinished = !!model.state.play?.finished;
  useEffect(() => {
    if (playFinished && soundOn) playSting();
  }, [playFinished, soundOn]);

  const pack = model.pack;
  const culture = pack.culture;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://perde.app';

  const scenePuppets = useMemo<ScenePuppet[]>(
    () =>
      visiblePuppets(model).map((v) => ({
        key: v.key,
        puppet: findPuppet(model, v.puppetId) ?? model.pack.puppets[0]!,
        npc: v.npc,
        slot: v.slot,
        speaking: v.speaking,
        target: model.poses[v.key] ?? NEUTRAL_POSE,
        gesture: model.gestures[v.key],
        offstage: v.offstage,
        entrance: v.entrance,
      })),
    [model],
  );

  const ps = model.state.play;
  const speakerColor = ps?.line
    ? (model.state.seats.find((s) => s.character === ps.line?.character)?.color ??
      model.play?.characters.find((c) => c.seat === ps.line?.character)?.color)
    : undefined;
  const notice = noticeText(model.state.notice, uiLang);

  return (
    <div
      className="stage"
      style={{ background: culture.stage.kind === 'booth' ? '#1c1a17' : culture.stage.backdrop }}
      onClick={unlockSound}
    >
      <StageScene
        culture={culture}
        puppets={scenePuppets}
        showpiece={{ shown: mode === 'lobby' || liftedAt !== null, liftedAt }}
      />

      <div className="stage__chrome">
        <div className="chip">
          <span className="chip__label">{t('roomCode')}</span>
          <span className="chip__code">{code ?? '····'}</span>
          <span className={`dot dot--${status}`} title={status} />
        </div>
        {!audioReady && soundOn && mode !== 'lobby' && (
          <button className="chip chip--action" onClick={unlockAll}>
            🔇 {t('tapForSound')}
          </button>
        )}
        {status !== 'open' && code && !demo && (
          <div className="chip chip--warn">{t('reconnecting')}</div>
        )}
        <button
          className="chip chip--action chip--help"
          onClick={() => setHelp((h) => !h)}
          aria-label={t('helpTitle')}
          title={t('helpTitle')}
        >
          ?
        </button>
        {ps && (
          <div className="chip chip--muted">
            {ps.title} · {ps.sectionTitle}
            {ps.spokenLines > 0 && ` · ${ps.spokenLines} ${t('spokenLines')}`}
          </div>
        )}
      </div>

      {model.state.mode === 'lobby' && code && (
        <div className="lobby">
          <h1 className="lobby__title">
            {pickLocalized(culture.name, uiLang)}
            <small>{culture.tradition}</small>
          </h1>
          <p className="lobby__code">
            {t('roomCode')}: <strong>{code}</strong>
          </p>
          <div className="lobby__seats">
            {model.state.seats.map((s) => (
              <div key={s.id} className="seat" style={{ ['--seat' as string]: s.color }}>
                <QRCodeSVG
                  value={joinUrl(origin, code, s.id)}
                  size={180}
                  bgColor="#fff8ea"
                  fgColor="#2b1d10"
                  level="M"
                  includeMargin
                />
                <div className="seat__name">{s.puppetName}</div>
                <div className="seat__hint">{t('scanToJoin')}</div>
              </div>
            ))}
          </div>
          <p className="lobby__heritage">{pickLocalized(culture.heritage, uiLang)}</p>
          <p className="lobby__waiting">{t('waitingForPuppeteers')}</p>
          {(!audioReady || !document.fullscreenElement) && (
            <button className="btn btn--primary lobby__start" onClick={unlockAll}>
              🔊 {t('startShow')}
            </button>
          )}
        </div>
      )}

      {help && (
        <div className="help" role="dialog" aria-label={t('helpTitle')}>
          <h2>{t('helpTitle')}</h2>
          <p>{t('helpKeys')}</p>
          <p>{t('helpPhone')}</p>
          <button className="btn btn--small" onClick={() => setHelp(false)}>
            {t('helpClose')}
          </button>
        </div>
      )}

      {sectionCard && ps && !ps.finished && (
        <div className="section-card" role="status">
          <small>{t('sectionLabel')}</small>
          <h2>{sectionCard}</h2>
        </div>
      )}

      {ps && ps.finished && (
        <div className="curtain">
          <h1>{t('theEnd')}</h1>
          <p>
            {ps.title} · {ps.spokenLines}/{ps.totalLines} {t('spokenLines')}
          </p>
        </div>
      )}

      {model.state.karaoke && ps && !ps.finished && (
        <div className="stage__karaoke">
          <KaraokeBar play={ps} color={speakerColor} nextLabel={t('nextUp')} />
        </div>
      )}

      {coach && (
        <div className="coach" role="status">
          <h2>{t('coachTitle')}</h2>
          <ol>
            <li>{t('coach1')}</li>
            <li>{t('coach2')}</li>
            <li>{t('coach3')}</li>
          </ol>
        </div>
      )}

      {(notice || error) && <div className="toast">{error ?? notice}</div>}
    </div>
  );
}

function noticeText(notice: string | undefined, lang: 'tr' | 'en'): string | null {
  switch (notice) {
    case 'locked':
      return lang === 'tr' ? 'Bu içerik Perde Plus ile açılır.' : 'This needs Perde Plus.';
    case 'plus-activated':
      return lang === 'tr'
        ? 'Perde Plus açıldı. Her şey senin!'
        : 'Perde Plus activated. Everything is yours.';
    case 'license-rejected':
      return lang === 'tr'
        ? 'Lisans anahtarı kabul edilmedi.'
        : 'That licence key was not accepted.';
    default:
      return null;
  }
}
