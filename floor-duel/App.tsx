import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import SetupScreen from './src/screens/SetupScreen';
import DuelScreen from './src/screens/DuelScreen';
import { MatchConfig } from './src/types';

export default function App() {
  const [match, setMatch] = useState<MatchConfig | null>(null);

  return (
    <>
      <StatusBar style="light" hidden={match !== null} />
      {match ? (
        <DuelScreen
          key={`${match.topic.id}-${match.topic.label}`}
          config={match}
          onExit={() => setMatch(null)}
        />
      ) : (
        <SetupScreen onStart={setMatch} />
      )}
    </>
  );
}
