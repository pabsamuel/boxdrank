package app.globalemotes.keyboard

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pure-logic tests for delivery-method selection (runs on the JVM, no device).
 * Device-level commitContent behaviour is covered by the compatibility harness
 * (docs/COMPATIBILITY_MATRIX.md) on real hardware.
 */
class InsertionPlannerTest {

    @Test
    fun `direct insertion when editor supports webp`() {
        val plan = InsertionHelper.plan(arrayOf("image/webp", "image/png"), animated = false)
        assertEquals(InsertionHelper.Method.DIRECT, plan.method)
        assertEquals("image/webp", plan.mimeType)
    }

    @Test
    fun `animated prefers webp then gif`() {
        val gifOnly = InsertionHelper.plan(arrayOf("image/gif"), animated = true)
        assertEquals(InsertionHelper.Method.DIRECT, gifOnly.method)
        assertEquals("image/gif", gifOnly.mimeType)
    }

    @Test
    fun `wildcard image mime is accepted`() {
        val plan = InsertionHelper.plan(arrayOf("image/*"), animated = false)
        assertEquals(InsertionHelper.Method.DIRECT, plan.method)
    }

    @Test
    fun `clipboard fallback when editor accepts nothing`() {
        val plan = InsertionHelper.plan(emptyArray(), animated = false)
        assertEquals(InsertionHelper.Method.CLIPBOARD, plan.method)
    }

    @Test
    fun `text-only editor falls back to clipboard`() {
        val plan = InsertionHelper.plan(arrayOf("text/plain"), animated = true)
        assertEquals(InsertionHelper.Method.CLIPBOARD, plan.method)
    }
}
