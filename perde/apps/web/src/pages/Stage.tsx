import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router';
import { joinUrl, NEUTRAL_POSE, pickLocalized, type StageInbound } from '@perde/shared';
import { getPack } from '@perde/content';
import { KaraokeBar } from '../components/KaraokeBar';
import { StageScene, type ScenePuppet } from '../components/StageScene';
import { createRoom, getRoom } from '../lib/api';
import { activate, resolvePlan } from '../lib/entitlements';
import {
  createStageModel,
  reduceStage,
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
        for (const p of msg.peers) dispatch({ type: 'joined', seat: p.seat, name: p.name, at });
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
          msg: { t: 'control', seat: 'p1', action: 'start-play', playId: 'giris' },
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
            x: -0.5 + Math.sin(s * 0.6) * 0.2,
            y: Math.max(0, Math.sin(s * 2.2)) * 0.3,
            lean: Math.sin(s * 1.7) * 0.5,
            arm: (Math.sin(s * 2.5) + 1) / 2,
            talking: modelRef.current.state.play?.line?.character === 'karagoz',
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
            x: 0.5 + Math.sin(s * 0.4 + 1) * 0.15,
            y: 0,
            lean: Math.sin(s * 1.1 + 2) * 0.3,
            arm: (Math.sin(s * 1.4 + 1) + 1) / 2,
            talking: modelRef.current.state.play?.line?.character === 'hacivat',
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

  // Keyboard for testing on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const at = Date.now();
      if (e.key === 'f') document.documentElement.requestFullscreen?.().catch(() => undefined);
      else if (e.key === 'n' || e.key === 'ArrowRight')
        dispatch({ type: 'local', action: 'next', at });
      else if (e.key === 'ArrowLeft') dispatch({ type: 'local', action: 'prev', at });
      else if (e.key === 'k') dispatch({ type: 'local', action: 'toggle-karaoke', at });
      else if (e.key === 'Escape') dispatch({ type: 'local', action: 'lobby', at });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pack = model.pack;
  const culture = pack.culture;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://perde.app';

  const scenePuppets = useMemo<ScenePuppet[]>(
    () =>
      visiblePuppets(model).map((v) => ({
        key: v.key,
        puppet: getPack(model.state.cultureId)!.puppets.find((p) => p.id === v.puppetId)!,
        npc: v.npc,
        slot: v.slot,
        speaking: v.speaking,
        target: model.poses[v.key] ?? NEUTRAL_POSE,
        gesture: model.gestures[v.key],
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
    >
      <StageScene culture={culture} puppets={scenePuppets} />

      <div className="stage__chrome">
        <div className="chip">
          <span className="chip__label">{t('roomCode')}</span>
          <span className="chip__code">{code ?? '····'}</span>
          <span className={`dot dot--${status}`} title={status} />
        </div>
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
          <KaraokeBar play={ps} color={speakerColor} />
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
