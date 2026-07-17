import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { colors } from '../theme';
import { MatchConfig } from '../types';

type Phase = 'countdown' | 'playing' | 'paused' | 'over';
type PlayerIndex = 0 | 1;

type Props = {
  config: MatchConfig;
  onExit: () => void;
};

const TICK_MS = 100;

// Player 0 sits across the table: top half, front camera, red.
// Player 1 holds the phone side: bottom half, back camera, blue.
const ACCENTS: [string, string] = [colors.p2, colors.p1];
const ACCENTS_DARK: [string, string] = [colors.p2Dark, colors.p1Dark];

export default function DuelScreen({ config, onExit }: Props) {
  useKeepAwake();
  const totalMs = config.seconds * 1000;

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [active, setActive] = useState<PlayerIndex>(0);
  const [remaining, setRemaining] = useState<[number, number]>([totalMs, totalMs]);
  const [loser, setLoser] = useState<PlayerIndex | null>(null);
  const [cameraFailed, setCameraFailed] = useState<[boolean, boolean]>([false, false]);
  const startingPlayer = useRef<PlayerIndex>(0);
  const remainingRef = useRef<[number, number]>([totalMs, totalMs]);
  const lastTick = useRef(0);

  // Pre-duel 3-2-1 countdown, then the starting player's clock begins to drain.
  useEffect(() => {
    if (phase !== 'countdown') return;
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase('playing');
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCountdown(count);
      }
    }, 900);
    return () => clearInterval(interval);
  }, [phase]);

  // Chess-clock engine: only the active player's clock drains, measured off
  // wall-clock deltas so ticks stay accurate even if the interval jitters.
  useEffect(() => {
    if (phase !== 'playing') return;
    lastTick.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick.current;
      lastTick.current = now;
      const before = remainingRef.current[active];
      const after = Math.max(0, before - delta);
      remainingRef.current[active] = after;
      setRemaining([remainingRef.current[0], remainingRef.current[1]]);
      if (after > 0 && after <= 5000 && Math.ceil(after / 1000) !== Math.ceil(before / 1000)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      if (after <= 0) {
        clearInterval(interval);
        setLoser(active);
        setPhase('over');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [phase, active]);

  const passTurn = useCallback(
    (pressed: PlayerIndex) => {
      if (phase !== 'playing' || pressed !== active) return;
      Haptics.selectionAsync();
      setActive((pressed === 0 ? 1 : 0) as PlayerIndex);
    },
    [phase, active],
  );

  const rematch = () => {
    startingPlayer.current = startingPlayer.current === 0 ? 1 : 0;
    remainingRef.current = [totalMs, totalMs];
    setRemaining([totalMs, totalMs]);
    setActive(startingPlayer.current);
    setLoser(null);
    setPhase('countdown');
  };

  const markCameraFailed = (index: PlayerIndex) =>
    setCameraFailed((prev) => (index === 0 ? [true, prev[1]] : [prev[0], true]));

  return (
    <View style={styles.root}>
      <View style={styles.flipped}>
        <PlayerPanel
          index={0}
          name={config.players[0]}
          remainingMs={remaining[0]}
          isActive={active === 0}
          phase={phase}
          cameraOn={config.camerasEnabled && !cameraFailed[0]}
          facing="front"
          topicEmoji={config.topic.emoji}
          onPress={() => passTurn(0)}
          onCameraError={() => markCameraFailed(0)}
        />
      </View>

      <View style={styles.dividerBlock}>
        <View style={styles.flippedStrip}>
          <TopicStrip label={config.topic.label} emoji={config.topic.emoji} />
        </View>
        <TopicStrip label={config.topic.label} emoji={config.topic.emoji} />
        <Pressable
          style={styles.pauseButton}
          onPress={() => phase === 'playing' && setPhase('paused')}
          hitSlop={12}
        >
          <Text style={styles.pauseIcon}>❚❚</Text>
        </Pressable>
      </View>

      <PlayerPanel
        index={1}
        name={config.players[1]}
        remainingMs={remaining[1]}
        isActive={active === 1}
        phase={phase}
        cameraOn={config.camerasEnabled && !cameraFailed[1]}
        facing="back"
        topicEmoji={config.topic.emoji}
        onPress={() => passTurn(1)}
        onCameraError={() => markCameraFailed(1)}
      />

      {phase === 'countdown' && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTopic}>
            {config.topic.emoji} {config.topic.label.toUpperCase()}
          </Text>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.overlayHint}>
            {config.players[active]} goes first — say one, then tap your side!
          </Text>
        </View>
      )}

      {phase === 'paused' && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>PAUSED</Text>
          <Pressable style={styles.overlayButton} onPress={() => setPhase('playing')}>
            <Text style={styles.overlayButtonText}>RESUME</Text>
          </Pressable>
          <Pressable style={[styles.overlayButton, styles.overlayButtonGhost]} onPress={onExit}>
            <Text style={[styles.overlayButtonText, { color: colors.text }]}>QUIT DUEL</Text>
          </Pressable>
        </View>
      )}

      {phase === 'over' && loser !== null && (
        <View style={styles.overlay}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={[styles.winnerName, { color: ACCENTS[loser === 0 ? 1 : 0] }]}>
            {config.players[loser === 0 ? 1 : 0]}
          </Text>
          <Text style={styles.overlayTitle}>TAKES THE FLOOR</Text>
          <Text style={styles.overlayHint}>
            {config.players[loser]} ran out of time on “{config.topic.label}”.
          </Text>
          <Pressable style={styles.overlayButton} onPress={rematch}>
            <Text style={styles.overlayButtonText}>REMATCH</Text>
          </Pressable>
          <Pressable style={[styles.overlayButton, styles.overlayButtonGhost]} onPress={onExit}>
            <Text style={[styles.overlayButtonText, { color: colors.text }]}>NEW TOPIC</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function PlayerPanel({
  index,
  name,
  remainingMs,
  isActive,
  phase,
  cameraOn,
  facing,
  topicEmoji,
  onPress,
  onCameraError,
}: {
  index: PlayerIndex;
  name: string;
  remainingMs: number;
  isActive: boolean;
  phase: Phase;
  cameraOn: boolean;
  facing: 'front' | 'back';
  topicEmoji: string;
  onPress: () => void;
  onCameraError: () => void;
}) {
  const accent = ACCENTS[index];
  const live = phase === 'playing';
  const timerColor =
    isActive && remainingMs <= 5000
      ? colors.danger
      : isActive && remainingMs <= 10000
        ? colors.warn
        : isActive
          ? accent
          : colors.dim;

  return (
    <Pressable style={styles.panel} onPress={onPress}>
      {cameraOn ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          animateShutter={false}
          onMountError={onCameraError}
        />
      ) : (
        <LinearGradient
          colors={[ACCENTS_DARK[index], colors.bg]}
          style={StyleSheet.absoluteFill}
        >
          <Text style={styles.fallbackEmoji}>{topicEmoji}</Text>
        </LinearGradient>
      )}
      <View
        style={[
          styles.scrim,
          isActive && live && { backgroundColor: '#00000033', borderColor: accent },
        ]}
      >
        <View style={styles.panelHeader}>
          <View style={[styles.nameTag, { borderColor: accent }]}>
            <Text style={[styles.nameText, { color: accent }]}>{name.toUpperCase()}</Text>
          </View>
          {isActive && live && (
            <View style={[styles.liveDot, { backgroundColor: accent }]} />
          )}
        </View>
        <Text style={[styles.timer, { color: timerColor }]}>{formatMs(remainingMs)}</Text>
        <Text style={styles.turnHint}>
          {isActive
            ? live
              ? 'SAY ONE, THEN TAP YOUR SIDE'
              : 'YOU GO FIRST'
            : 'OPPONENT’S TURN — CLOCK FROZEN'}
        </Text>
      </View>
    </Pressable>
  );
}

function TopicStrip({ label, emoji }: { label: string; emoji: string }) {
  return (
    <View style={styles.topicStrip}>
      <Text style={styles.topicStripText}>
        {emoji} TOPIC: {label.toUpperCase()}
      </Text>
    </View>
  );
}

function formatMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10000) return (clamped / 1000).toFixed(1);
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flipped: {
    flex: 1,
    transform: [{ rotate: '180deg' }],
  },
  flippedStrip: {
    transform: [{ rotate: '180deg' }],
  },
  panel: {
    flex: 1,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000055',
    borderColor: 'transparent',
    borderWidth: 3,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameTag: {
    borderWidth: 1.5,
    borderRadius: 999,
    backgroundColor: '#000000aa',
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timer: {
    fontSize: 88,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textShadowColor: '#000000cc',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
    marginVertical: 2,
  },
  turnHint: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    backgroundColor: '#000000aa',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  fallbackEmoji: {
    position: 'absolute',
    right: 18,
    bottom: 14,
    fontSize: 40,
    opacity: 0.35,
  },
  dividerBlock: {
    backgroundColor: colors.divider,
    borderColor: colors.gold,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  topicStrip: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  topicStripText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  pauseButton: {
    position: 'absolute',
    right: 14,
    alignSelf: 'center',
    backgroundColor: '#00000080',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pauseIcon: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070810ee',
    paddingHorizontal: 32,
  },
  overlayTopic: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  countdownNumber: {
    color: colors.text,
    fontSize: 140,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  overlayTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 8,
  },
  overlayHint: {
    color: colors.dim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  trophy: {
    fontSize: 56,
    marginBottom: 8,
  },
  winnerName: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 1,
  },
  overlayButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 12,
  },
  overlayButtonGhost: {
    backgroundColor: 'transparent',
    borderColor: colors.line,
    borderWidth: 1.5,
  },
  overlayButtonText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
