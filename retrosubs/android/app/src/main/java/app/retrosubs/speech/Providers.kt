package app.retrosubs.speech

import android.content.Context
import app.retrosubs.core.EngineMode
import app.retrosubs.settings.Prefs
import app.retrosubs.speaker.SpeakerDetector

/**
 * The one place that decides which [SpeechRecognitionProvider] runs, so the in-app preview and
 * the overlay can never disagree about it.
 */
fun buildProvider(
    context: Context,
    prefs: Prefs,
    detector: SpeakerDetector,
): SpeechRecognitionProvider = when (prefs.engineMode) {
    EngineMode.REAL -> AndroidSpeechProvider(context, detector)
    EngineMode.VIBE_KANA -> VibeProvider(detector, Gibberish.Script.KANA)
    EngineMode.VIBE_LATIN -> VibeProvider(detector, Gibberish.Script.LATIN)
}
