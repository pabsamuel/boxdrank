package app.retrosubs.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.AttributeSet
import android.view.View
import app.retrosubs.core.DialogueLine
import app.retrosubs.core.DisplayMode
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * The retro JRPG dialogue box. Everything is drawn: chamfered pixel border, bevel, scanline
 * wash, name plate, procedural speaker sigil, typewriter body text and a blinking caret.
 *
 * It is a plain [View] on purpose — it has to live inside a `WindowManager` overlay window that
 * has no Activity, no lifecycle owner and no Compose host.
 */
class DialogueBoxView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    var theme: RetroTheme = RetroTheme.MOONWELL
        set(value) {
            field = value
            invalidate()
        }

    /** Body text size in sp. */
    var fontSizeSp: Float = 16f
        set(value) {
            field = value.coerceIn(10f, 34f)
            rebuildPaints()
            requestLayout()
        }

    /** Panel opacity, 0.35..1. Chrome and text stay fully opaque so text never gets muddy. */
    var boxOpacity: Float = 0.92f
        set(value) {
            field = value.coerceIn(0.35f, 1f)
            invalidate()
        }

    /** Typewriter speed in characters per second. 0 = instant. */
    var charsPerSecond: Float = 45f

    var soundEnabled: Boolean = false

    var displayMode: DisplayMode = DisplayMode.TRANSCRIPTION
        set(value) {
            field = value
            requestLayout()
            invalidate()
        }

    /** How many body lines are visible before the box "pages" to the newest text. */
    var maxBodyLines: Int = 3
        set(value) {
            field = value.coerceIn(1, 8)
            requestLayout()
        }

    private val density = resources.displayMetrics.density
    /** One retro "pixel": all chrome is a whole multiple of this, so edges stay crisp. */
    private val px get() = 3f * density

    private val panelPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bevelPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val scanPaint = Paint()
    private val sigilPaint = Paint()
    private val sigilFramePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val bodyPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
    private val transPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
    private val caretPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private var line: DialogueLine? = null
    private var bodyLayout: StaticLayout? = null
    private var transLayout: StaticLayout? = null

    private var revealedChars = 0
    private var revealStartedAt = 0L
    private var revealBaseline = 0
    private var lastBlipAt = 0L
    private val blip by lazy { TextBlip() }

    private var placeholder: String? = "Waiting for someone to speak..."

    init {
        rebuildPaints()
    }

    private fun rebuildPaints() {
        bodyPaint.apply {
            typeface = PixelFont.body
            textSize = fontSizeSp * resources.displayMetrics.scaledDensity
            letterSpacing = 0.04f
            setShadowLayer(0f, 0f, 0f, Color.TRANSPARENT)
        }
        transPaint.apply {
            typeface = PixelFont.body
            textSize = fontSizeSp * 0.86f * resources.displayMetrics.scaledDensity
            letterSpacing = 0.03f
        }
        namePaint.apply {
            typeface = PixelFont.name
            textSize = fontSizeSp * 0.8f * resources.displayMetrics.scaledDensity
            letterSpacing = 0.18f
        }
    }

    /** Push a line. Growing text of the same line keeps typing; a new line restarts the reveal. */
    fun setLine(newLine: DialogueLine?) {
        val previous = line
        line = newLine
        if (newLine == null) {
            revealedChars = 0
            bodyLayout = null
            transLayout = null
            invalidate()
            return
        }
        if (previous == null || previous.id != newLine.id) {
            // New utterance: start typing from scratch.
            revealedChars = 0
            revealBaseline = 0
            revealStartedAt = now()
        } else if (newLine.text.length < previous.text.length ||
            !newLine.text.startsWith(previous.text.take(min(previous.text.length, 8)))
        ) {
            // The recognizer rewrote its hypothesis; keep what is already typed, don't rewind.
            revealedChars = min(revealedChars, newLine.text.length)
            revealBaseline = revealedChars
            revealStartedAt = now()
        }
        placeholder = null
        requestLayout()
        invalidate()
    }

    fun showPlaceholder(text: String?) {
        placeholder = text
        line = null
        revealedChars = 0
        requestLayout()
        invalidate()
    }

    private fun now() = System.currentTimeMillis()

    // ---------------------------------------------------------------- measure

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val inner = (width - 2 * contentInset()).toInt().coerceAtLeast(1)
        buildLayouts(inner)

        val bodyLines = bodyLayout?.let { min(it.lineCount, maxBodyLines) } ?: 1
        val bodyH = (bodyLayout?.getLineBottom(0)?.toFloat() ?: bodyPaint.textSize) * bodyLines
        val transH = transLayout?.let { l ->
            min(l.lineCount, 2) * l.getLineBottom(0).toFloat() + 2 * px
        } ?: 0f

        val height = contentInset() * 2 + nameRowHeight() + bodyH + transH + px * 2
        setMeasuredDimension(width, height.toInt())
    }

    private fun contentInset() = px * 5

    private fun nameRowHeight() = namePaint.textSize * 1.9f

    private fun buildLayouts(innerWidth: Int) {
        val current = line
        val body = current?.text ?: placeholder ?: ""
        bodyLayout = makeLayout(body, bodyPaint, innerWidth)

        val translation = current?.translation
        transLayout = if (translation != null && displayMode == DisplayMode.LEARNING) {
            makeLayout(translation, transPaint, innerWidth)
        } else {
            null
        }
    }

    private fun makeLayout(text: String, paint: TextPaint, width: Int): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(false)
            .setLineSpacing(px * 1.2f, 1f)
            .build()

    /** What the body actually renders, honouring the display mode. */
    private fun bodyText(): String {
        val l = line ?: return placeholder ?: ""
        return when (displayMode) {
            DisplayMode.TRANSCRIPTION -> l.text
            DisplayMode.LEARNING -> l.text
            DisplayMode.TRANSLATION -> l.translation ?: l.text
        }
    }

    // ---------------------------------------------------------------- draw

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        drawChrome(canvas, w, h)

        val left = contentInset()
        var top = contentInset()

        drawNamePlate(canvas, left, top)
        top += nameRowHeight()

        advanceReveal()
        drawBody(canvas, left, top)
        drawCaret(canvas, w, h)

        if (needsAnimation()) postInvalidateOnAnimation()
    }

    private fun drawChrome(canvas: Canvas, w: Float, h: Float) {
        val cut = px * 2
        val outer = chamfered(0f, 0f, w, h, cut)
        borderPaint.color = theme.border
        canvas.drawPath(outer, borderPaint)

        val bevel = chamfered(px, px, w - px, h - px, cut)
        bevelPaint.color = theme.bevel
        canvas.drawPath(bevel, bevelPaint)

        val panelRect = chamfered(px * 2, px * 2, w - px * 2, h - px * 2, cut)
        panelPaint.color = withAlpha(theme.panel, boxOpacity)
        canvas.drawPath(panelRect, panelPaint)

        // Vertical wash: a slightly deeper lower half, drawn as a clipped rect.
        canvas.save()
        canvas.clipPath(panelRect)
        panelPaint.color = withAlpha(theme.panelDeep, boxOpacity * 0.85f)
        canvas.drawRect(0f, h * 0.55f, w, h, panelPaint)

        // Scanlines — every other retro pixel row, very low alpha.
        scanPaint.color = withAlpha(theme.scanline, 0.16f * boxOpacity)
        var y = 0f
        while (y < h) {
            canvas.drawRect(0f, y, w, y + px * 0.5f, scanPaint)
            y += px * 1.5f
        }
        canvas.restore()
    }

    private fun chamfered(l: Float, t: Float, r: Float, b: Float, cut: Float): Path =
        Path().apply {
            moveTo(l + cut, t)
            lineTo(r - cut, t)
            lineTo(r, t + cut)
            lineTo(r, b - cut)
            lineTo(r - cut, b)
            lineTo(l + cut, b)
            lineTo(l, b - cut)
            lineTo(l, t + cut)
            close()
        }

    private fun drawNamePlate(canvas: Canvas, left: Float, top: Float) {
        val speaker = line?.speaker
        val sigilSize = namePaint.textSize
        var x = left
        if (speaker != null) {
            drawSigil(canvas, x, top, sigilSize, speaker.id)
            x += sigilSize + px * 2
        }
        namePaint.color = theme.accent
        val name = speaker?.name ?: "RETROSUBS"
        canvas.drawText(name, x, top + sigilSize * 0.9f, namePaint)

        // Separator rule under the name row.
        bevelPaint.color = withAlpha(theme.bevel, 0.75f)
        canvas.drawRect(
            left,
            top + nameRowHeight() - px * 2,
            width - contentInset(),
            top + nameRowHeight() - px * 2 + px * 0.5f,
            bevelPaint,
        )
    }

    /**
     * A tiny original 5x5 sigil, derived deterministically from the speaker id and mirrored —
     * the same speaker always gets the same mark, and no artwork is shipped.
     */
    private fun drawSigil(canvas: Canvas, x: Float, y: Float, size: Float, speakerId: Int) {
        val cells = 5
        val cell = size / cells
        var hash = (speakerId * 2654435761L.toInt()) xor 0x5f3759df
        sigilPaint.color = theme.accent
        for (row in 0 until cells) {
            for (col in 0 until (cells + 1) / 2) {
                hash = hash * 1103515245 + 12345
                if (abs(hash / 65536) % 3 == 0) continue
                val mirrored = cells - 1 - col
                canvas.drawRect(
                    x + col * cell, y + row * cell,
                    x + col * cell + cell, y + row * cell + cell, sigilPaint,
                )
                canvas.drawRect(
                    x + mirrored * cell, y + row * cell,
                    x + mirrored * cell + cell, y + row * cell + cell, sigilPaint,
                )
            }
        }
        sigilFramePaint.color = withAlpha(theme.border, 0.55f)
        sigilFramePaint.strokeWidth = px * 0.4f
        canvas.drawRect(x - px * 0.6f, y - px * 0.6f, x + size + px * 0.6f, y + size + px * 0.6f, sigilFramePaint)
    }

    private fun advanceReveal() {
        val target = bodyText().length
        if (charsPerSecond <= 0f) {
            revealedChars = target
            return
        }
        val elapsed = (now() - revealStartedAt).coerceAtLeast(0)
        val wanted = revealBaseline + (elapsed * charsPerSecond / 1000f).toInt()
        // Never fall more than a line behind live speech: catch up instead of lagging.
        val floor = max(0, target - 90)
        val next = min(target, max(wanted, floor))
        if (next > revealedChars) {
            if (soundEnabled && now() - lastBlipAt > 55) {
                blip.play()
                lastBlipAt = now()
            }
            revealedChars = next
        }
    }

    private fun drawBody(canvas: Canvas, left: Float, top: Float) {
        val layout = bodyLayout ?: return
        val isPlaceholder = line == null
        bodyPaint.color = if (isPlaceholder) withAlpha(theme.ink, 0.45f) else theme.ink
        val shown = if (isPlaceholder) layout.text.length else revealedChars

        val lastLine = max(0, layout.getLineForOffset(shown.coerceAtMost(layout.text.length)))
        val startLine = max(0, lastLine - (maxBodyLines - 1))
        val lineHeight = layout.getLineBottom(0).toFloat()

        canvas.save()
        canvas.translate(left, top)
        for (i in startLine..lastLine) {
            val lineStart = layout.getLineStart(i)
            val lineEnd = min(layout.getLineEnd(i), shown.coerceAtMost(layout.text.length))
            if (lineEnd <= lineStart) continue
            val text = layout.text.subSequence(lineStart, lineEnd).toString().trimEnd('\n')
            val y = (i - startLine) * lineHeight + layout.getLineBaseline(0)
            canvas.drawText(text, 0f, y, bodyPaint)
        }
        canvas.restore()

        val trans = transLayout
        if (trans != null) {
            transPaint.color = theme.secondary
            canvas.save()
            val bodyLines = (lastLine - startLine + 1)
            canvas.translate(left, top + bodyLines * lineHeight + px)
            for (i in 0 until min(trans.lineCount, 2)) {
                val text = trans.text.subSequence(trans.getLineStart(i), trans.getLineEnd(i)).toString()
                canvas.drawText(text, 0f, i * trans.getLineBottom(0).toFloat() + trans.getLineBaseline(0), transPaint)
            }
            canvas.restore()
        }
    }

    private fun drawCaret(canvas: Canvas, w: Float, h: Float) {
        val l = line ?: return
        val done = revealedChars >= bodyText().length
        if (!done || !l.isFinal) return
        // Blink at 1.6 Hz.
        if ((now() / 320) % 2 == 0L) return
        caretPaint.color = theme.accent
        val size = px * 2.2f
        val cx = w - contentInset()
        val cy = h - contentInset() * 0.7f
        val path = Path().apply {
            moveTo(cx - size, cy - size)
            lineTo(cx + size, cy - size)
            lineTo(cx, cy + size * 0.6f)
            close()
        }
        canvas.drawPath(path, caretPaint)
    }

    private fun needsAnimation(): Boolean {
        val l = line ?: return false
        return revealedChars < bodyText().length || l.isFinal
    }

    private fun withAlpha(color: Int, alpha: Float): Int =
        Color.argb((255 * alpha.coerceIn(0f, 1f)).toInt(), Color.red(color), Color.green(color), Color.blue(color))

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        blip.release()
    }
}
