package app.retrosubs.speech

import kotlin.random.Random

/**
 * VIBE MODE's word factory: plausible-looking nonsense in a chosen script.
 *
 * This exists because the *feeling* of the product — someone speaks, a game box types along with
 * them — does not actually require knowing the words. When recognition is unavailable, the
 * language is unsupported, or the room is too noisy to be accurate, honest nonsense in the right
 * cadence is a better experience than a box that sits empty or types something wrong.
 *
 * Pure Kotlin on purpose: no Android types, so it is unit-testable.
 */
class Gibberish(
    private val script: Script,
    private val random: Random = Random.Default,
) {

    enum class Script { KANA, LATIN }

    /** One more syllable of the current word. */
    fun syllable(): String = when (script) {
        Script.KANA -> KANA.random(random)
        Script.LATIN -> LATIN.random(random)
    }

    /** How many syllables the next word should have. */
    fun wordLength(): Int = when (script) {
        Script.KANA -> 2 + random.nextInt(3)
        Script.LATIN -> 1 + random.nextInt(3)
    }

    /** Sentence-ending punctuation, occasionally a question. */
    fun terminator(): String = when (script) {
        Script.KANA -> if (random.nextInt(4) == 0) "？" else "。"
        Script.LATIN -> if (random.nextInt(4) == 0) "?" else "."
    }

    /** Latin gibberish reads better capitalised like a sentence. */
    fun openWord(word: String): String =
        if (script == Script.LATIN) word.replaceFirstChar { it.uppercase() } else word

    /** Kana is written without spaces; latin needs them. */
    val wordSeparator: String get() = if (script == Script.KANA) "" else " "

    private companion object {
        /** Common hiragana, chosen to read like speech rather than like a font sample. */
        val KANA = listOf(
            "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
            "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
            "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
            "ま", "み", "む", "め", "も", "ら", "り", "る", "れ", "ろ",
            "や", "ゆ", "よ", "わ", "ん", "だ", "で", "ど", "が", "ご",
        )

        val LATIN = listOf(
            "ka", "to", "mi", "ren", "sha", "lo", "ven", "dar", "el", "nu",
            "ta", "sel", "vor", "ith", "an", "ori", "ma", "kel", "sun", "dra",
            "fen", "lor", "ish", "ume", "bal", "tor", "nea", "vik", "sae", "rin",
        )

        fun List<String>.random(random: Random): String = this[random.nextInt(size)]
    }
}

/**
 * Builds one utterance a syllable at a time, so the dialogue box grows exactly the way it does
 * with a real recognizer streaming partial hypotheses.
 */
class GibberishUtterance(private val gibberish: Gibberish) {

    private val builder = StringBuilder()
    private var syllablesLeftInWord = 0
    private var wordCount = 0

    val text: String get() = builder.toString()
    val isEmpty: Boolean get() = builder.isEmpty()

    fun advance() {
        if (syllablesLeftInWord <= 0) {
            if (wordCount > 0) builder.append(gibberish.wordSeparator)
            syllablesLeftInWord = gibberish.wordLength()
            wordCount++
            val first = gibberish.syllable()
            builder.append(if (wordCount == 1) gibberish.openWord(first) else first)
            syllablesLeftInWord--
            return
        }
        builder.append(gibberish.syllable())
        syllablesLeftInWord--
    }

    /** Closes the sentence and returns it. */
    fun finish(): String {
        if (builder.isEmpty()) return ""
        builder.append(gibberish.terminator())
        return builder.toString()
    }
}
