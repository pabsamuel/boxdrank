package app.retrosubs.speech

import app.retrosubs.core.Speaker

/**
 * The swap point for transcription. Anything that can emit growing hypotheses fits:
 * Android's on-device recognizer (MVP), Whisper/whisper.cpp, or a cloud streaming STT socket.
 *
 * Contract:
 *  - [Listener.onPartial] may be called many times for one utterance, each time with the
 *    *whole* hypothesis so far (not a delta).
 *  - [Listener.onFinal] ends the utterance.
 *  - Implementations must never block the caller's thread.
 */
interface SpeechRecognitionProvider {

    val id: String

    /** BCP-47 tag the provider is currently recognizing, e.g. "en-US", "ja-JP". */
    var languageTag: String

    fun start(listener: Listener)

    fun stop()

    val isRunning: Boolean

    interface Listener {
        fun onPartial(text: String, speaker: Speaker)
        fun onFinal(text: String, speaker: Speaker)
        fun onStatus(status: Status, detail: String? = null)
    }

    enum class Status { STARTING, LISTENING, RESTARTING, SILENCED, ERROR, STOPPED }
}
