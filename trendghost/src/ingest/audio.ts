/**
 * Pulling the audio track out of a user's video so we can find its beat.
 *
 * Thin Web Audio wrapper only — the DSP lives in `src/coach/beats.ts` and stays
 * platform-free. Decoding a video's audio is not supported everywhere and can
 * fail on odd codecs, so every failure returns null and ingest carries on
 * without a beat grid (CUE_ENGINE.md: "Never block ingest on it").
 */

export async function decodeAudio(
  file: File,
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  const AudioContextClass =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  let context: AudioContext | null = null;
  try {
    const bytes = await file.arrayBuffer();
    context = new AudioContextClass();
    const buffer = await context.decodeAudioData(bytes);
    if (buffer.length === 0) return null;

    // Mono mix: beats are in the whole mix, not one channel.
    const channels = buffer.numberOfChannels;
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) mono[i]! += data[i]! / channels;
    }

    return { samples: mono, sampleRate: buffer.sampleRate };
  } catch {
    // Silent video, unsupported codec, or a browser that will not decode video
    // audio. Not an error the user needs to see — they just get no beat snapping.
    return null;
  } finally {
    void context?.close().catch(() => undefined);
  }
}
