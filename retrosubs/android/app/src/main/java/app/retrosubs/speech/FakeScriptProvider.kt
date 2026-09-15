package app.retrosubs.speech

import android.os.Handler
import android.os.Looper
import app.retrosubs.core.Speaker

/**
 * PHASE 1 provider: replays a scripted conversation with realistic partial-hypothesis growth,
 * so the whole rendering pipeline can be proven without a microphone, a permission or a network.
 *
 * It is also the demo mode in the app and the fixture for UI work.
 */
class FakeScriptProvider(
    private val script: List<Turn> = DEFAULT_SCRIPT,
) : SpeechRecognitionProvider {

    data class Turn(val speaker: Speaker, val text: String, val pauseAfterMs: Long = 1400)

    override val id = "fake-script"
    override var languageTag: String = "en-US"

    private val handler = Handler(Looper.getMainLooper())
    private var listener: SpeechRecognitionProvider.Listener? = null
    private var running = false

    override val isRunning: Boolean get() = running

    override fun start(listener: SpeechRecognitionProvider.Listener) {
        if (running) return
        this.listener = listener
        running = true
        listener.onStatus(SpeechRecognitionProvider.Status.LISTENING)
        playTurn(0)
    }

    override fun stop() {
        running = false
        handler.removeCallbacksAndMessages(null)
        listener?.onStatus(SpeechRecognitionProvider.Status.STOPPED)
        listener = null
    }

    private fun playTurn(index: Int) {
        if (!running) return
        val turn = script[index % script.size]
        // Grow the hypothesis word by word, like a streaming recognizer does.
        val words = turn.text.split(" ")
        var delay = 0L
        for (i in words.indices) {
            val partial = words.take(i + 1).joinToString(" ")
            delay += 120L + partial.length * 11L
            handler.postDelayed({
                if (!running) return@postDelayed
                if (i == words.lastIndex) {
                    listener?.onFinal(turn.text, turn.speaker)
                } else {
                    listener?.onPartial(partial, turn.speaker)
                }
            }, delay)
        }
        handler.postDelayed({ playTurn(index + 1) }, delay + turn.pauseAfterMs)
    }

    companion object {
        val DEFAULT_SCRIPT = listOf(
            Turn(Speaker.OTHER.copy(name = "YUKI"), "Are you coming tomorrow?"),
            Turn(Speaker.YOU, "I think so, what time does it start?"),
            Turn(Speaker.OTHER.copy(name = "YUKI"), "Around seven, by the old station."),
            Turn(Speaker.YOU, "Perfect. I'll bring the tickets."),
            Turn(
                Speaker.OTHER.copy(name = "YUKI"),
                "Don't be late this time, the last train leaves before midnight.",
                pauseAfterMs = 2200,
            ),
        )
    }
}
