import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCameraPermissions } from 'expo-camera';
import { colors } from '../theme';
import { TOPICS, randomTopic } from '../topics';
import { MatchConfig, Topic } from '../types';

const DURATIONS = [30, 45, 60];

type Props = {
  onStart: (config: MatchConfig) => void;
};

export default function SetupScreen({ onStart }: Props) {
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');
  const [topicId, setTopicId] = useState<string | 'random'>('random');
  const [customTopic, setCustomTopic] = useState('');
  const [seconds, setSeconds] = useState(45);
  const [camerasEnabled, setCamerasEnabled] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();

  const start = async () => {
    let useCameras = camerasEnabled;
    if (useCameras && !permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) useCameras = false;
    }
    let topic: Topic;
    if (customTopic.trim()) {
      topic = { id: 'custom', label: customTopic.trim(), emoji: '✨' };
    } else if (topicId === 'random') {
      topic = randomTopic();
    } else {
      topic = TOPICS.find((t) => t.id === topicId) ?? randomTopic();
    }
    onStart({
      players: [nameA.trim() || 'Player 1', nameB.trim() || 'Player 2'],
      topic,
      seconds,
      camerasEnabled: useCameras,
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>LAST ONE STANDING WINS THE FLOOR</Text>
        <Text style={styles.title}>
          FLOOR<Text style={{ color: colors.gold }}> DUEL</Text>
        </Text>
        <Text style={styles.tagline}>
          One topic. Two clocks. Say an answer, tap your side to pass the turn — if your clock hits
          zero, you lose.
        </Text>

        <Text style={styles.sectionLabel}>PLAYERS</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.nameInput, { borderColor: colors.p2 }]}
            placeholder="Player 1 (top)"
            placeholderTextColor={colors.dim}
            value={nameA}
            onChangeText={setNameA}
            maxLength={14}
          />
          <Text style={styles.vs}>VS</Text>
          <TextInput
            style={[styles.nameInput, { borderColor: colors.p1 }]}
            placeholder="Player 2 (bottom)"
            placeholderTextColor={colors.dim}
            value={nameB}
            onChangeText={setNameB}
            maxLength={14}
          />
        </View>

        <Text style={styles.sectionLabel}>TOPIC</Text>
        <View style={styles.topicGrid}>
          <TopicChip
            label="Random"
            emoji="🎰"
            selected={topicId === 'random' && !customTopic.trim()}
            onPress={() => {
              setTopicId('random');
              setCustomTopic('');
            }}
          />
          {TOPICS.map((t) => (
            <TopicChip
              key={t.id}
              label={t.label}
              emoji={t.emoji}
              selected={topicId === t.id && !customTopic.trim()}
              onPress={() => {
                setTopicId(t.id);
                setCustomTopic('');
              }}
            />
          ))}
        </View>
        <TextInput
          style={styles.customInput}
          placeholder="…or type your own topic"
          placeholderTextColor={colors.dim}
          value={customTopic}
          onChangeText={setCustomTopic}
          maxLength={30}
        />

        <Text style={styles.sectionLabel}>CLOCK PER PLAYER</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d}
              style={[styles.durationChip, seconds === d && styles.durationChipSelected]}
              onPress={() => setSeconds(d)}
            >
              <Text style={[styles.durationText, seconds === d && { color: colors.bg }]}>
                {d}s
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.cameraRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cameraLabel}>Camera feeds</Text>
            <Text style={styles.cameraHint}>
              Front camera films the top player, back camera films the bottom player. Stand the
              phone between you.
            </Text>
          </View>
          <Switch
            value={camerasEnabled}
            onValueChange={setCamerasEnabled}
            trackColor={{ true: colors.gold, false: colors.line }}
            thumbColor={colors.text}
          />
        </View>

        <Pressable onPress={start}>
          {({ pressed }) => (
            <LinearGradient
              colors={[colors.gold, '#e8930c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.startButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.startText}>STEP ON THE FLOOR</Text>
            </LinearGradient>
          )}
        </Pressable>

        <Text style={styles.rules}>
          HOW TO PLAY{'\n'}1. Face each other with the phone flat or propped between you — the top
          half is flipped for your opponent.{'\n'}2. Only the active player&apos;s clock runs. Say
          an answer that fits the topic, then tap YOUR half to pass the turn.{'\n'}3. Hesitate,
          blank, or repeat and your clock keeps draining. When a clock hits 0:00, that player is
          eliminated.
        </Text>
      </ScrollView>
    </View>
  );
}

function TopicChip({
  label,
  emoji,
  selected,
  onPress,
}: {
  label: string;
  emoji: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.topicChip, selected && styles.topicChipSelected]}
      onPress={onPress}
    >
      <Text style={styles.topicEmoji}>{emoji}</Text>
      <Text style={[styles.topicLabel, selected && { color: colors.bg, fontWeight: '800' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingTop: Platform.OS === 'android' ? 64 : 76,
    paddingBottom: 48,
    paddingHorizontal: 20,
  },
  kicker: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
  },
  tagline: {
    color: colors.dim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionLabel: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nameInput: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderRadius: 12,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  vs: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '900',
  },
  topicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topicChipSelected: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  topicEmoji: {
    fontSize: 14,
  },
  topicLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  customInput: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  durationChipSelected: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  durationText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cameraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 24,
  },
  cameraLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cameraHint: {
    color: colors.dim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  startButton: {
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 18,
    marginTop: 24,
  },
  startText: {
    color: colors.bg,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 2,
  },
  rules: {
    color: colors.dim,
    fontSize: 12,
    lineHeight: 20,
    marginTop: 28,
  },
});
