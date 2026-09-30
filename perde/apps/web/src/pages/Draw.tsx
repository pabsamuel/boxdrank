import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  buildRig,
  guessKeypoints,
  NEUTRAL_POSE,
  PuppetSchema,
  type Keypoints,
  type Point,
  type Pose,
  type Puppet,
} from '@perde/shared';
import { getPack } from '@perde/content';
import { StageScene, type ScenePuppet } from '../components/StageScene';
import { cutoutFromFile, type CutoutResult } from '../lib/cutout';
import { newPuppetId, savePuppet } from '../lib/puppet-store';
import { useT, useUiLang } from '../lib/ui';

/**
 * Draw your own puppet: photograph a drawing, we strip the paper, you tap a
 * few joints, it comes alive on a little stage, then it goes to the TV.
 */

type Step = 'intro' | 'cutting' | 'points' | 'preview';

const TAPS: Array<{
  key: keyof Keypoints;
  label:
    'tapHead' | 'tapNeck' | 'tapShoulder' | 'tapHand' | 'tapHips' | 'tapLeftFoot' | 'tapRightFoot';
}> = [
  { key: 'head', label: 'tapHead' },
  { key: 'neck', label: 'tapNeck' },
  { key: 'shoulder', label: 'tapShoulder' },
  { key: 'hand', label: 'tapHand' },
  { key: 'hips', label: 'tapHips' },
  { key: 'leftFoot', label: 'tapLeftFoot' },
  { key: 'rightFoot', label: 'tapRightFoot' },
];

export function Draw({ onToggleLang }: { onToggleLang: () => void }) {
  const t = useT();
  const uiLang = useUiLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const room = params.get('room');
  const seat = params.get('seat');
  const [step, setStep] = useState<Step>('intro');
  const [cut, setCut] = useState<CutoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Partial<Keypoints>>({});
  const [tapIndex, setTapIndex] = useState(0);
  const [guess, setGuess] = useState<Keypoints | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStep('cutting');
    try {
      const result = await cutoutFromFile(file);
      if (!result) {
        setError(t('cutoutFailed'));
        setStep('intro');
        return;
      }
      setCut(result);
      const g = guessKeypoints(result.mask);
      setGuess(g);
      setPoints({});
      setTapIndex(0);
      setStep('points');
    } catch (e) {
      setError(String(e));
      setStep('intro');
    }
  };

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cut || tapIndex >= TAPS.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * cut.width;
    const y = ((e.clientY - rect.top) / rect.height) * cut.height;
    const key = TAPS[tapIndex]!.key;
    const next = { ...points, [key]: [Math.round(x), Math.round(y)] as Point };
    setPoints(next);
    setTapIndex(tapIndex + 1);
  };

  const keypoints: Keypoints | null = useMemo(() => {
    const p = { ...(guess ?? {}), ...points } as Partial<Keypoints>;
    if (!p.head || !p.neck || !p.shoulder || !p.hand || !p.hips) return null;
    return p as Keypoints;
  }, [guess, points]);

  const puppet: Puppet | null = useMemo(() => {
    if (!cut || !keypoints) return null;
    const rig = buildRig({
      id: newPuppetIdOnce(),
      name: name.trim() || (uiLang === 'tr' ? 'Kuklam' : 'My puppet'),
      image: cut.image,
      width: cut.width,
      height: cut.height,
      keypoints,
      mask: cut.mask,
    });
    const parsed = PuppetSchema.safeParse(rig);
    return parsed.success ? parsed.data : null;
  }, [cut, keypoints, name, uiLang]);

  const finish = () => {
    if (!puppet) return;
    savePuppet(puppet);
    setSaved(true);
    if (room && seat)
      navigate(`/join?room=${encodeURIComponent(room)}&seat=${encodeURIComponent(seat)}`);
  };

  const culture = getPack('tr')!.culture;

  return (
    <div className="phone draw">
      <header className="controller__top">
        <Link className="brand" to={room && seat ? `/join?room=${room}&seat=${seat}` : '/'}>
          ← {t('appName')}
        </Link>
        <button className="btn btn--ghost btn--small" onClick={onToggleLang}>
          {uiLang === 'tr' ? 'TR' : 'EN'}
        </button>
      </header>

      {step === 'intro' && (
        <section className="draw__intro">
          <h1>{t('drawYourOwn')}</h1>
          <p>{t('drawIntro')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
            data-testid="gallery-input"
          />
          <button className="btn btn--primary btn--huge" onClick={() => fileRef.current?.click()}>
            📷 {t('takePhoto')}
          </button>
          <button className="btn btn--big" onClick={() => galleryRef.current?.click()}>
            🖼 {t('pickImage')}
          </button>
          {error && <p className="warn">{error}</p>}
          <ol className="draw__tips">
            <li>
              {uiLang === 'tr'
                ? 'Beyaz kâğıt, koyu kalem. Figür tek parça olsun.'
                : 'White paper, dark pen. Keep the figure in one piece.'}
            </li>
            <li>
              {uiLang === 'tr'
                ? 'Bir kol gövdeden ayrı dursun; onu oynatacağız.'
                : 'Leave one arm clear of the body; that one moves.'}
            </li>
            <li>
              {uiLang === 'tr'
                ? 'Fotoğrafı tam üstten, gölgesiz çek.'
                : 'Shoot straight from above, without shadows.'}
            </li>
          </ol>
        </section>
      )}

      {step === 'cutting' && <p className="rod__waiting">{t('cutoutWorking')}</p>}

      {step === 'points' && cut && (
        <section className="draw__points">
          <p className="draw__prompt">
            {tapIndex < TAPS.length ? t(TAPS[tapIndex]!.label) : t('tryIt')}
          </p>
          <div
            className="draw__canvas"
            style={{ aspectRatio: `${cut.width} / ${cut.height}` }}
            onPointerDown={onTap}
          >
            <img src={cut.image} alt="" draggable={false} />
            {TAPS.map(({ key }, i) => {
              const p = points[key] ?? (i >= tapIndex ? guess?.[key] : undefined);
              if (!p) return null;
              const tapped = !!points[key];
              return (
                <span
                  key={key}
                  className={`draw__marker ${tapped ? 'is-tapped' : 'is-guess'} ${i === tapIndex ? 'is-next' : ''}`}
                  style={{
                    left: `${(p[0] / cut.width) * 100}%`,
                    top: `${(p[1] / cut.height) * 100}%`,
                  }}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>
          <div className="menu__row">
            {guess && tapIndex < TAPS.length && (
              <button className="btn btn--small" onClick={() => setTapIndex(TAPS.length)}>
                ✨ {t('useGuess')}
              </button>
            )}
            <button
              className="btn btn--small"
              onClick={() => {
                setPoints({});
                setTapIndex(0);
              }}
            >
              {t('redo')}
            </button>
            <button
              className="btn btn--small btn--primary"
              disabled={!keypoints}
              onClick={() => setStep('preview')}
            >
              {t('tryIt')} ▶
            </button>
          </div>
        </section>
      )}

      {step === 'preview' && puppet && (
        <section className="draw__preview">
          <div className="draw__stage">
            <PreviewStage puppet={puppet} culture={culture} />
          </div>
          <label className="pickup__name">
            {t('puppetName')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 30))}
              placeholder={uiLang === 'tr' ? 'Kuklam' : 'My puppet'}
            />
          </label>
          <div className="menu__row">
            <button className="btn btn--small" onClick={() => setStep('points')}>
              ◀ {t('redo')}
            </button>
            <button className="btn btn--primary btn--big" onClick={finish}>
              {room && seat ? t('sendToStage') : uiLang === 'tr' ? 'Kaydet' : 'Save'}
            </button>
          </div>
          {saved && <p className="warn">{t('sentToStage')}</p>}
        </section>
      )}
    </div>
  );
}

let cachedId: string | null = null;
function newPuppetIdOnce(): string {
  if (!cachedId) cachedId = newPuppetId();
  return cachedId;
}

/** A little stage where the new puppet walks, leans and waves by itself. */
function PreviewStage({
  puppet,
  culture,
}: {
  puppet: Puppet;
  culture: ReturnType<typeof getPack> extends infer P
    ? P extends { culture: infer C }
      ? C
      : never
    : never;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (ms: number) => {
      setNow((ms - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pose: Pose = {
    ...NEUTRAL_POSE,
    x: Math.sin(now * 0.6) * 0.5,
    lean: Math.sin(now * 1.7) * 0.4,
    arm: (Math.sin(now * 2.2) + 1) / 2,
    y: Math.max(0, Math.sin(now * 2.8)) * 0.3,
    talking: Math.sin(now * 0.9) > 0.3,
  };
  const puppets: ScenePuppet[] = [
    { key: 'preview', puppet, npc: false, slot: 0, speaking: false, target: pose },
  ];
  return <StageScene culture={culture} puppets={puppets} highlightSpeaking={false} />;
}
