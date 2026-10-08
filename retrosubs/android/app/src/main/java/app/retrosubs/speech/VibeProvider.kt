package app.retrosubs.speech

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import app.retrosubs.speaker.SpeakerDetector
import kotlin.concurrent.thread
import kotlin.math.sqrt

/**
 * VIBE MODE: no recognition at all.
 *
 * It listens to the microphone, works out *when* someone is speaking from the signal energy, and
 * types plausible nonsense in time with them. No words are understood and none are claimed to be
 * — the app labels this mode clearly.
 *
 * Why it earns its place: it works where real recognition does not (no recognizer installed, an
 * unsupported language, a room too noisy to be accurate), it needs no network, and for the
 * nostalgia demo the cadence is most of the magic.
 */
class VibeProvider(
    private val speakerDetector: SpeakerDetector,
    script: Gibberish.Script,
) : SpeechRecognitionProvider {

    override val id = "vibe-${script.name.lowercase()}"
    override var languageTag: String = "en-US"

    private val gibberish = Gibberish(script)
    private val main = Handler(Looper.getMainLooper())
    private var listener: SpeechRecognitionProvider.Listener? = null
    @Volatile private var running = false
    private var recorder: AudioRecord? = null

    override val isRunning: Boolean get() = running

    override fun start(listener: SpeechRecognitionProvider.Listener) {
        if (running) return
        this.listener = listener
        running = true
        listener.onStatus(SpeechRecognitionProvider.Status.STARTING)
        thread(name = "retrosubs-vibe") { loop() }
    }

    override fun stop() {
        running = false
        runCatching { recorder?.stop() }
        runCatching { recorder?.release() }
        recorder = null
        main.post {
            listener?.onStatus(SpeechRecognitionProvider.Status.STOPPED)
            listener = null
        }
    }

    @SuppressLint("MissingPermission")
    private fun loop() {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(2048)

        val record = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuffer * 2,
            )
        }.getOrNull()

        if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
            post { it.onStatus(SpeechRecognitionProvider.Status.ERROR, "Could not open the microphone.") }
            running = false
            return
        }
        recorder = record
        record.startRecording()
        post { it.onStatus(SpeechRecognitionProvider.Status.LISTENING) }

        val buffer = ShortArray(minBuffer)
        var utterance = GibberishUtterance(gibberish)
        var speaking = false
        var lastVoiceAt = 0L
        var lastSyllableAt = 0L
        var noiseFloor = 0.004f
        var silentChunks = 0

        while (running) {
            val read = record.read(buffer, 0, buffer.size)
            if (read <= 0) continue
            val level = rms(buffer, read)
            val now = System.currentTimeMillis()

            // The system hands a silenced app a stream of perfect zeros; say so rather than
            // looking broken. (See docs/00-FEASIBILITY.md — a VoIP call takes the mic.)
            if (level == 0f) {
                if (++silentChunks == SILENCE_CHUNKS_BEFORE_WARNING) {
                    post {
                        it.onStatus(
                            SpeechRecognitionProvider.Status.SILENCED,
                            "The microphone is returning silence.",
                        )
                    }
                }
                continue
            }
            silentChunks = 0

            // Slow-moving noise floor, so a quiet room and a loud cafe both work.
            noiseFloor = if (level < noiseFloor) {
                noiseFloor * 0.9f + level * 0.1f
            } else {
                noiseFloor * 0.995f + level * 0.005f
            }
            val voiced = level > maxOf(noiseFloor * VOICE_OVER_FLOOR, MIN_VOICE_LEVEL)

            if (voiced) {
                lastVoiceAt = now
                if (!speaking) {
                    speaking = true
                    speakerDetector.onSpeechStart()
                    utterance = GibberishUtterance(gibberish)
                    lastSyllableAt = 0L
                }
                // Louder speech types a little faster, which reads as emphasis.
                val interval = (SYLLABLE_MS_SLOW - (level * 900f)).toLong()
                    .coerceIn(SYLLABLE_MS_FAST, SYLLABLE_MS_SLOW)
                if (now - lastSyllableAt >= interval) {
                    lastSyllableAt = now
                    utterance.advance()
                    val partial = utterance.text
                    post { it.onPartial(partial, speakerDetector.currentSpeaker()) }
                    if (partial.length >= MAX_UTTERANCE_CHARS) {
                        finish(utterance)
                        utterance = GibberishUtterance(gibberish)
                    }
                }
            } else if (speaking && now - lastVoiceAt > END_OF_SPEECH_MS) {
                speaking = false
                speakerDetector.onSpeechEnd()
                finish(utterance)
                utterance = GibberishUtterance(gibberish)
            }
        }

        runCatching { record.stop() }
        runCatching { record.release() }
    }

    private fun finish(utterance: GibberishUtterance) {
        if (utterance.isEmpty) return
        val text = utterance.finish()
        post { it.onFinal(text, speakerDetector.currentSpeaker()) }
    }

    private fun post(block: (SpeechRecognitionProvider.Listener) -> Unit) {
        main.post { listener?.let(block) }
    }

    private fun rms(buffer: ShortArray, length: Int): Float {
        var sum = 0.0
        for (i in 0 until length) {
            val sample = buffer[i] / 32768.0
            sum += sample * sample
        }
        return sqrt(sum / length).toFloat()
    }

    private companion object {
        const val SAMPLE_RATE = 16_000
        const val VOICE_OVER_FLOOR = 2.6f
        const val MIN_VOICE_LEVEL = 0.012f
        const val END_OF_SPEECH_MS = 550L
        const val SYLLABLE_MS_FAST = 70L
        const val SYLLABLE_MS_SLOW = 150L
        const val MAX_UTTERANCE_CHARS = 70
        const val SILENCE_CHUNKS_BEFORE_WARNING = 40
    }
}
