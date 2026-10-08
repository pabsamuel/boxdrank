package app.retrosubs.speaker

import app.retrosubs.core.Speaker

/**
 * Seam for future diarization. With one microphone and no enrollment, reliable speaker ID is
 * not achievable in an MVP (see docs/00-FEASIBILITY.md), so we ship honest, cheap strategies
 * behind this interface instead of a fake that is wrong half the time.
 */
interface SpeakerDetector {
    fun onSpeechStart() {}
    fun onSpeechEnd() {}
    fun onRms(rmsDb: Float) {}
    fun currentSpeaker(): Speaker
    fun reset() {}
}

/** Everything is attributed to one label. The safe default. */
class FixedSpeakerDetector(private val speaker: Speaker = Speaker.OTHER) : SpeakerDetector {
    override fun currentSpeaker() = speaker
}

/**
 * Alternates YOU / OTHER on every utterance boundary. Correct in a strict back-and-forth
 * conversation, and obviously wrong otherwise — which is why it is opt-in in Settings.
 */
class AlternatingSpeakerDetector : SpeakerDetector {
    private var flip = false
    override fun onSpeechStart() {
        flip = !flip
    }

    override fun currentSpeaker() = if (flip) Speaker.OTHER else Speaker.YOU
    override fun reset() {
        flip = false
    }
}

/** The user taps the box to switch who is talking. Dumb, predictable, always available. */
class ManualSpeakerDetector(initial: Speaker = Speaker.OTHER) : SpeakerDetector {
    private var speaker = initial
    fun toggle(): Speaker {
        speaker = if (speaker.id == Speaker.YOU.id) Speaker.OTHER else Speaker.YOU
        return speaker
    }

    override fun currentSpeaker() = speaker
    override fun reset() {
        speaker = Speaker.OTHER
    }
}
