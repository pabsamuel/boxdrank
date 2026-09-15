import { useEffect, useState } from 'react';
import {
  deleteRoutine,
  listRoutines,
  listTakes,
  storageUsage,
  type Routine,
  type Take,
} from '../storage/db';

interface Props {
  onOpen: (routine: Routine, mode: 'learn' | 'practice' | 'record' | 'photo') => void;
  onAdd: () => void;
  onSettings: () => void;
  onReviewTake: (take: Take, routine: Routine) => void;
  refreshKey: number;
}

export function Library({ onOpen, onAdd, onSettings, onReviewTake, refreshKey }: Props) {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);

  useEffect(() => {
    void listRoutines().then(setRoutines);
    void listTakes().then(setTakes);
    void storageUsage().then(setUsage);
  }, [refreshKey]);

  const remove = async (id: string) => {
    await deleteRoutine(id);
    setRoutines(await listRoutines());
    setTakes(await listTakes());
    setUsage(await storageUsage());
  };

  return (
    <div className="screen">
      <header className="app-header">
        <h1>
          <span aria-hidden>👻</span> TrendGhost
        </h1>
        <button className="text-button" onClick={onSettings}>
          Settings
        </button>
      </header>

      {routines === null && <p className="muted">Loading…</p>}

      {routines?.length === 0 && (
        <div className="empty">
          <h2>Copy any trend</h2>
          <ol>
            <li>Add a video of the dance or pose you want to learn.</li>
            <li>Prop your phone up and step back until you fit in the frame.</li>
            <li>Follow the ghost — you go green when you match it.</li>
          </ol>
          <button className="primary" onClick={onAdd}>
            Add your first routine
          </button>
        </div>
      )}

      {routines && routines.length > 0 && (
        <>
          <button className="primary block" onClick={onAdd}>
            + Add routine
          </button>
          <ul className="routine-list">
            {routines.map((routine) => (
              <li key={routine.id} className="routine-card">
                <div className="thumb">
                  {routine.thumbnail ? (
                    <img src={routine.thumbnail} alt="" />
                  ) : (
                    <span aria-hidden>👻</span>
                  )}
                </div>
                <div className="routine-meta">
                  <strong>{routine.name}</strong>
                  <span className="muted">
                    {routine.kind === 'photo'
                      ? 'Photo pose'
                      : `${routine.duration.toFixed(1)}s · ${routine.moves.length} moves`}
                    {routine.bestAccuracy
                      ? ` · best ${Math.round(routine.bestAccuracy * 100)}%`
                      : ''}
                  </span>
                  <div className="row wrap">
                    {routine.kind === 'photo' ? (
                      <button onClick={() => onOpen(routine, 'photo')}>Match pose</button>
                    ) : (
                      <>
                        <button onClick={() => onOpen(routine, 'learn')}>Learn</button>
                        <button onClick={() => onOpen(routine, 'practice')}>Practice</button>
                        <button onClick={() => onOpen(routine, 'record')}>Record</button>
                      </>
                    )}
                    {latestTake(takes, routine.id) && (
                      <button onClick={() => onReviewTake(latestTake(takes, routine.id)!, routine)}>
                        Last take
                      </button>
                    )}
                    <button className="text-button danger" onClick={() => void remove(routine.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {usage && usage.usedBytes > 0 && (
        <p className="muted small">
          Using {(usage.usedBytes / 1024 / 1024).toFixed(1)} MB on this device. Nothing is uploaded.
        </p>
      )}
    </div>
  );
}

function latestTake(takes: Take[], routineId: string): Take | undefined {
  return takes.find((take) => take.routineId === routineId);
}
