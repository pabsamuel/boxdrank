package app.retrosubs.core

/**
 * Who is talking. The MVP deliberately does not attempt real diarization
 * (see docs/00-FEASIBILITY.md); [SpeakerDetector] is the seam where it lands later.
 */
data class Speaker(
    val id: Int,
    val name: String,
) {
    companion object {
        val YOU = Speaker(0, "YOU")
        val OTHER = Speaker(1, "OTHER")
        fun numbered(n: Int) = Speaker(n, "SPEAKER $n")
    }
}

/**
 * The single thing the renderer understands.
 *
 * A growing utterance keeps the same [id] so the dialogue box is *updated* rather than
 * replaced — that is what makes it read like a game dialogue box instead of a chat log.
 */
data class DialogueLine(
    val id: Long,
    val speaker: Speaker,
    val text: String,
    val translation: String? = null,
    val isFinal: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
)

/** How the box renders text. */
enum class DisplayMode {
    /** Original transcription only. */
    TRANSCRIPTION,

    /** Translated text only. */
    TRANSLATION,

    /** Original on top, translation underneath. */
    LEARNING,
}
