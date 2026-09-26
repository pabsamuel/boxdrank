/** Phase 7 — a single still becomes a one-frame routine. */

import { PoseEngine } from '../inference/poseLandmarker';
import { buildTimeline } from '../pose-core/timeline';
import type { Routine } from '../storage/db';
import { saveRoutine } from '../storage/db';

export type PhotoIngestResult = { ok: true; routine: Routine } | { ok: false; message: string };

export async function ingestPhoto(file: File): Promise<PhotoIngestResult> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { ok: false, message: "I couldn't read that image." };

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, message: 'Could not read that image.' };
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const engine = new PoseEngine('full', 'IMAGE');
  await engine.load();
  const result = engine.detect(canvas, 0);
  engine.close();

  if (!result?.landmarks) {
    return { ok: false, message: "I couldn't find a person in that photo." };
  }

  const id = crypto.randomUUID();
  const timeline = buildTimeline([{ t: 0, landmarks: result.landmarks }], {
    id,
    name: file.name.replace(/\.[^.]+$/, '') || 'Pose',
    duration: 1 / 30,
    sourceFps: 30,
  });

  const routine: Routine = {
    id,
    name: timeline.name,
    createdAt: Date.now(),
    duration: 0,
    kind: 'photo',
    timeline,
    moves: [],
    cues: [],
    thumbnail: canvas.toDataURL('image/jpeg', 0.6),
  };

  await saveRoutine(routine);
  return { ok: true, routine };
}
