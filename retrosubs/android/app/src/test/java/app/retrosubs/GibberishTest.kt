package app.retrosubs

import app.retrosubs.speech.Gibberish
import app.retrosubs.speech.GibberishUtterance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class GibberishTest {

    @Test
    fun `an utterance grows one syllable at a time`() {
        val utterance = GibberishUtterance(Gibberish(Gibberish.Script.KANA, Random(7)))
        assertTrue(utterance.isEmpty)

        var previous = ""
        repeat(12) {
            utterance.advance()
            val text = utterance.text
            assertTrue("text must only grow: '$previous' -> '$text'", text.length > previous.length)
            assertTrue("text must extend the previous hypothesis", text.startsWith(previous))
            previous = text
        }
    }

    @Test
    fun `kana utterances are written without spaces and end in kana punctuation`() {
        val utterance = GibberishUtterance(Gibberish(Gibberish.Script.KANA, Random(1)))
        repeat(10) { utterance.advance() }
        assertTrue(!utterance.text.contains(" "))

        val finished = utterance.finish()
        assertTrue(finished.endsWith("。") || finished.endsWith("？"))
    }

    @Test
    fun `latin utterances are spaced, capitalised and end in latin punctuation`() {
        val utterance = GibberishUtterance(Gibberish(Gibberish.Script.LATIN, Random(3)))
        repeat(20) { utterance.advance() }
        assertTrue(utterance.text.contains(" "))
        assertTrue(utterance.text.first().isUpperCase())

        val finished = utterance.finish()
        assertTrue(finished.endsWith(".") || finished.endsWith("?"))
    }

    @Test
    fun `finishing an untouched utterance yields nothing`() {
        assertEquals("", GibberishUtterance(Gibberish(Gibberish.Script.KANA, Random(5))).finish())
    }
}
