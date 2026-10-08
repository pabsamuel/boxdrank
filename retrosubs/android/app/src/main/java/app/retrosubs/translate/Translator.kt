package app.retrosubs.translate

/**
 * Optional, asynchronous, and never in the transcription path: the original text is already on
 * screen by the time a translation arrives.
 */
interface Translator {
    val id: String

    /** @param onResult called on an arbitrary thread; may never be called if translation fails. */
    fun translate(text: String, sourceTag: String, targetTag: String, onResult: (String) -> Unit)

    fun close() {}
}

object NoopTranslator : Translator {
    override val id = "noop"
    override fun translate(
        text: String,
        sourceTag: String,
        targetTag: String,
        onResult: (String) -> Unit,
    ) = Unit
}
