package app.retrosubs.speech

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import app.retrosubs.audio.ExternalAudioSource
import app.retrosubs.speaker.SpeakerDetector

/**
 * PHASE 2 provider: Android's own streaming recognizer.
 *
 * Chosen for the MVP because it is the best latency/complexity/accuracy trade available with
 * zero infrastructure: partial results in ~200-400 ms, free, and on-device (offline) on modern
 * devices. [SpeechRecognizer] is not built for continuous listening, so this class emulates it
 * with a restart loop plus backoff, and reports honestly when the system silences us.
 */
class AndroidSpeechProvider(
    private val context: Context,
    private val speakerDetector: SpeakerDetector,
    private val preferOnDevice: Boolean = true,
    /** Phase 5: feed the recognizer from MediaProjection instead of the mic. */
    private val externalAudio: ExternalAudioSource? = null,
) : SpeechRecognitionProvider {

    override val id = "android-speech"
    override var languageTag: String = "en-US"

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listener: SpeechRecognitionProvider.Listener? = null
    private var running = false
    private var consecutiveErrors = 0
    private var lastPartial: String = ""

    override val isRunning: Boolean get() = running

    override fun start(listener: SpeechRecognitionProvider.Listener) {
        if (running) return
        this.listener = listener
        running = true
        listener.onStatus(SpeechRecognitionProvider.Status.STARTING)
        main.post { createAndListen() }
    }

    override fun stop() {
        running = false
        main.removeCallbacksAndMessages(null)
        main.post {
            runCatching { recognizer?.cancel() }
            runCatching { recognizer?.destroy() }
            recognizer = null
            externalAudio?.stop()
            listener?.onStatus(SpeechRecognitionProvider.Status.STOPPED)
            listener = null
        }
    }

    private fun onDeviceAvailable(): Boolean =
        preferOnDevice &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    private fun createAndListen() {
        if (!running) return
        runCatching { recognizer?.destroy() }
        recognizer = when {
            onDeviceAvailable() -> SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            SpeechRecognizer.isRecognitionAvailable(context) -> SpeechRecognizer.createSpeechRecognizer(context)
            else -> {
                listener?.onStatus(
                    SpeechRecognitionProvider.Status.ERROR,
                    "No speech recognition service on this device.",
                )
                running = false
                return
            }
        }
        recognizer?.setRecognitionListener(recognitionListener)
        recognizer?.startListening(buildIntent())
    }

    private fun buildIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            putExtra(RecognizerIntent.EXTRA_MASK_OFFENSIVE_WORDS, false)
        }
        if (onDeviceAvailable()) {
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        // Keep a phrase alive through natural pauses instead of cutting every breath.
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1500L)

        // EXTRA_AUDIO_SOURCE (API 31+) lets us hand the recognizer a PCM pipe instead of the mic.
        val external = externalAudio
        if (external != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val fd = external.openStream()
            if (fd != null) {
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, fd)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, external.sampleRate)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, external.channelCount)
            }
        }
    }

    private fun restart(delayMs: Long) {
        if (!running) return
        listener?.onStatus(SpeechRecognitionProvider.Status.RESTARTING)
        main.postDelayed({ createAndListen() }, delayMs)
    }

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            consecutiveErrors = 0
            listener?.onStatus(SpeechRecognitionProvider.Status.LISTENING)
        }

        override fun onBeginningOfSpeech() {
            speakerDetector.onSpeechStart()
        }

        override fun onRmsChanged(rmsdB: Float) {
            speakerDetector.onRms(rmsdB)
        }

        override fun onBufferReceived(buffer: ByteArray?) = Unit

        override fun onEndOfSpeech() {
            speakerDetector.onSpeechEnd()
        }

        override fun onError(error: Int) {
            val speaker = speakerDetector.currentSpeaker()
            if (lastPartial.isNotBlank()) {
                listener?.onFinal(lastPartial, speaker)
                lastPartial = ""
            }
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                -> restart(120)

                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> restart(600)

                SpeechRecognizer.ERROR_CLIENT -> restart(400)

                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    listener?.onStatus(
                        SpeechRecognitionProvider.Status.ERROR,
                        "Microphone permission was denied.",
                    )
                    running = false
                }

                SpeechRecognizer.ERROR_AUDIO -> {
                    // Typically another app (a VoIP call) owns the mic: see docs/00-FEASIBILITY.md.
                    listener?.onStatus(
                        SpeechRecognitionProvider.Status.SILENCED,
                        "Another app is holding the microphone.",
                    )
                    restart(1200)
                }

                else -> {
                    consecutiveErrors++
                    restart(minOf(400L * consecutiveErrors, 4000L))
                }
            }
        }

        override fun onResults(results: Bundle?) {
            val text = results.firstText()
            val speaker = speakerDetector.currentSpeaker()
            if (!text.isNullOrBlank()) listener?.onFinal(text, speaker)
            lastPartial = ""
            restart(80)
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults.firstText() ?: return
            if (text.isBlank() || text == lastPartial) return
            lastPartial = text
            listener?.onPartial(text, speakerDetector.currentSpeaker())
        }

        override fun onEvent(eventType: Int, params: Bundle?) = Unit

        private fun Bundle?.firstText(): String? =
            this?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
    }
}
