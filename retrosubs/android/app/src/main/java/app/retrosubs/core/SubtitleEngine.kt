package app.retrosubs.core

import android.util.Log
import app.retrosubs.settings.Prefs
import app.retrosubs.speaker.AlternatingSpeakerDetector
import app.retrosubs.speaker.FixedSpeakerDetector
import app.retrosubs.speaker.SpeakerDetector
import app.retrosubs.speech.SpeechRecognitionProvider
import app.retrosubs.translate.MlKitTranslator
import app.retrosubs.translate.NoopTranslator
import app.retrosubs.translate.Translator

/**
 * Owns one run of the pipeline: provider → session → bus, with translation hung off the side.
 *
 * Nothing in here knows which provider it is driving, and nothing in the UI knows this class
 * exists — it only watches [SubtitleBus].
 */
class SubtitleEngine(
    private val prefs: Prefs,
    private val providerFactory: (SpeakerDetector) -> SpeechRecognitionProvider,
) {
    private val speakerDetector: SpeakerDetector =
        if (prefs.alternateSpeakers) AlternatingSpeakerDetector() else FixedSpeakerDetector(Speaker.OTHER)

    private var provider: SpeechRecognitionProvider? = null
    private var translator: Translator = NoopTranslator
    private val session = TranscriptSession()

    /** Last text we asked to translate per line, so we don't re-translate on every keystroke. */
    private var lastTranslatedId = -1L
    private var lastTranslatedLength = 0

    val isRunning: Boolean get() = provider?.isRunning == true

    fun start() {
        if (isRunning) return
        translator = if (prefs.displayMode == DisplayMode.TRANSCRIPTION) NoopTranslator else MlKitTranslator()
        session.reset()
        speakerDetector.reset()
        val p = providerFactory(speakerDetector).also { provider = it }
        p.languageTag = prefs.sourceLanguage
        SubtitleBus.setStatus(EngineStatus.LISTENING)
        p.start(listener)
    }

    fun stop() {
        provider?.stop()
        provider = null
        translator.close()
        translator = NoopTranslator
        SubtitleBus.setStatus(EngineStatus.IDLE)
    }

    private val listener = object : SpeechRecognitionProvider.Listener {
        override fun onPartial(text: String, speaker: Speaker) {
            session.onPartial(text, speaker)
            maybeTranslate(final = false)
        }

        override fun onFinal(text: String, speaker: Speaker) {
            session.onFinal(text, speaker)
            maybeTranslate(final = true)
        }

        override fun onStatus(status: SpeechRecognitionProvider.Status, detail: String?) {
            Log.d(TAG, "provider status=$status detail=$detail")
            SubtitleBus.setStatus(
                when (status) {
                    SpeechRecognitionProvider.Status.LISTENING,
                    SpeechRecognitionProvider.Status.STARTING,
                    SpeechRecognitionProvider.Status.RESTARTING,
                    -> EngineStatus.LISTENING

                    SpeechRecognitionProvider.Status.SILENCED -> EngineStatus.SILENCED_BY_SYSTEM
                    SpeechRecognitionProvider.Status.ERROR -> EngineStatus.ERROR
                    SpeechRecognitionProvider.Status.STOPPED -> EngineStatus.IDLE
                }
            )
        }
    }

    /**
     * Translation is fire-and-forget and strictly behind the transcript: we only fire on a final
     * phrase, or when a partial has grown by a meaningful chunk, so the box never stutters.
     */
    private fun maybeTranslate(final: Boolean) {
        if (prefs.displayMode == DisplayMode.TRANSCRIPTION) return
        val line = SubtitleBus.line.value ?: return
        val grown = line.id != lastTranslatedId || line.text.length - lastTranslatedLength >= 12
        if (!final && !grown) return
        lastTranslatedId = line.id
        lastTranslatedLength = line.text.length
        val source = line.text
        translator.translate(source, prefs.sourceLanguage, prefs.targetLanguage) { translated ->
            SubtitleBus.publishTranslation(line.id, source, translated)
        }
    }

    private companion object {
        const val TAG = "SubtitleEngine"
    }
}
