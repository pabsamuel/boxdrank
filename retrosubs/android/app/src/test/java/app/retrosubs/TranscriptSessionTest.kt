package app.retrosubs

import app.retrosubs.core.Speaker
import app.retrosubs.core.SubtitleBus
import app.retrosubs.core.TranscriptSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class TranscriptSessionTest {

    @Before
    fun setUp() {
        SubtitleBus.clear()
    }

    @Test
    fun `growing hypothesis updates the same dialogue box`() {
        val session = TranscriptSession()
        session.onPartial("What", Speaker.OTHER)
        val first = SubtitleBus.line.value!!
        session.onPartial("What are you", Speaker.OTHER)
        val second = SubtitleBus.line.value!!

        assertEquals(first.id, second.id)
        assertEquals("What are you", second.text)
        assertTrue(!second.isFinal)
    }

    @Test
    fun `a final phrase closes the line and the next one opens a new box`() {
        val session = TranscriptSession()
        session.onPartial("Are you coming", Speaker.OTHER)
        val partialId = SubtitleBus.line.value!!.id
        session.onFinal("Are you coming tomorrow?", Speaker.OTHER)
        val finalLine = SubtitleBus.line.value!!
        assertEquals(partialId, finalLine.id)
        assertTrue(finalLine.isFinal)

        session.onPartial("I think", Speaker.YOU)
        assertNotEquals(partialId, SubtitleBus.line.value!!.id)
    }

    @Test
    fun `a speaker change starts a new box mid-stream`() {
        val session = TranscriptSession()
        session.onPartial("hello", Speaker.OTHER)
        val a = SubtitleBus.line.value!!.id
        session.onPartial("hello", Speaker.YOU)
        assertNotEquals(a, SubtitleBus.line.value!!.id)
    }

    @Test
    fun `stale translations are dropped`() {
        val session = TranscriptSession()
        session.onPartial("明日", Speaker.OTHER)
        val line = SubtitleBus.line.value!!
        session.onPartial("明日は何をするの", Speaker.OTHER)

        SubtitleBus.publishTranslation(line.id, "明日", "Tomorrow")
        assertEquals(null, SubtitleBus.line.value!!.translation)

        SubtitleBus.publishTranslation(line.id, "明日は何をするの", "What are you doing tomorrow?")
        assertEquals("What are you doing tomorrow?", SubtitleBus.line.value!!.translation)
    }

    @Test
    fun `blank text never creates a box`() {
        val session = TranscriptSession()
        session.onPartial("   ", Speaker.OTHER)
        assertEquals(null, SubtitleBus.line.value)
    }
}
