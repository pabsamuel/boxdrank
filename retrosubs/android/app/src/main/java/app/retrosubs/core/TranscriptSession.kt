package app.retrosubs.core

/**
 * Wires a [app.retrosubs.speech.SpeechRecognitionProvider] to the bus: it owns the rule that a
 * *growing* hypothesis reuses one line id, and a finalized phrase mints the next one.
 */
class TranscriptSession(
    private val bus: SubtitleBus = SubtitleBus,
    private val onLine: (DialogueLine) -> Unit = {},
) {
    private var currentId: Long = -1
    private var currentSpeaker: Speaker = Speaker.OTHER

    fun onPartial(text: String, speaker: Speaker) {
        if (text.isBlank()) return
        if (currentId < 0 || speaker != currentSpeaker) {
            currentId = bus.mintId()
            currentSpeaker = speaker
        }
        val line = DialogueLine(id = currentId, speaker = speaker, text = text, isFinal = false)
        bus.publish(line)
        onLine(line)
    }

    fun onFinal(text: String, speaker: Speaker) {
        if (text.isBlank()) {
            currentId = -1
            return
        }
        if (currentId < 0) currentId = bus.mintId()
        val line = DialogueLine(id = currentId, speaker = speaker, text = text, isFinal = true)
        bus.publish(line)
        onLine(line)
        // Next utterance starts a fresh box.
        currentId = -1
    }

    fun reset() {
        currentId = -1
    }
}
