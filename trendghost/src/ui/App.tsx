import { useEffect, useState } from 'react';
import type { Routine, Take } from '../storage/db';
import { getRoutine } from '../storage/db';
import { Ingest } from './Ingest';
import { Library } from './Library';
import { Onboarding } from './Onboarding';
import { Photo } from './Photo';
import { Practice, type PracticeMode } from './Practice';
import { Settings } from './Settings';
import { TakeReview } from './TakeReview';
import { useSettings } from './useSettings';

type View =
  | { name: 'library' }
  | { name: 'ingest'; sharedFile?: File | null }
  | { name: 'practice'; routine: Routine; mode: PracticeMode }
  | { name: 'photo'; routine: Routine }
  | { name: 'settings' }
  | { name: 'review'; take: Take; routine: Routine };

export function App() {
  const settings = useSettings();
  const [view, setView] = useState<View>({ name: 'library' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [sharedFile, setSharedFile] = useState<File | null>(null);

  useEffect(() => {
    void settings.load();
  }, [settings]);

  // Web Share Target: the OS hands us a file, we go straight to ingest
  // (CONTENT_SOURCING.md lane 1).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'shared-file' && event.data.file instanceof File) {
        setSharedFile(event.data.file);
        setView({ name: 'ingest', sharedFile: event.data.file });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.controller?.postMessage({ type: 'claim-shared-file' });
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  if (!settings.loaded) return <div className="screen centre muted">Loading…</div>;

  if (!settings.onboarded) {
    return <Onboarding onDone={() => settings.update('onboarded', true)} />;
  }

  switch (view.name) {
    case 'ingest':
      return (
        <Ingest
          sharedFile={view.sharedFile ?? sharedFile}
          onCancel={() => setView({ name: 'library' })}
          onDone={async (routine) => {
            setSharedFile(null);
            const fresh = (await getRoutine(routine.id)) ?? routine;
            setRefreshKey((k) => k + 1);
            setView(
              fresh.kind === 'photo'
                ? { name: 'photo', routine: fresh }
                : { name: 'practice', routine: fresh, mode: 'learn' },
            );
          }}
        />
      );

    case 'practice':
      return (
        <Practice
          routine={view.routine}
          mode={view.mode}
          onTakeSaved={(take) => setView({ name: 'review', take, routine: view.routine })}
          onExit={() => {
            setRefreshKey((k) => k + 1);
            setView({ name: 'library' });
          }}
        />
      );

    case 'review':
      return (
        <TakeReview
          take={view.take}
          routine={view.routine}
          onBack={() => {
            setRefreshKey((k) => k + 1);
            setView({ name: 'library' });
          }}
        />
      );

    case 'photo':
      return <Photo routine={view.routine} onExit={() => setView({ name: 'library' })} />;

    case 'settings':
      return (
        <Settings
          onBack={() => setView({ name: 'library' })}
          onCleared={() => {
            setRefreshKey((k) => k + 1);
            setView({ name: 'library' });
          }}
        />
      );

    default:
      return (
        <Library
          refreshKey={refreshKey}
          onAdd={() => setView({ name: 'ingest' })}
          onSettings={() => setView({ name: 'settings' })}
          onReviewTake={(take, routine) => setView({ name: 'review', take, routine })}
          onOpen={(routine, mode) =>
            setView(
              mode === 'photo' ? { name: 'photo', routine } : { name: 'practice', routine, mode },
            )
          }
        />
      );
  }
}
