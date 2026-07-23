package app.globalemotes.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream

@Serializable
data class CachedEmote(
    val id: String,
    val shortcode: String,
    val name: String,
    val animated: Boolean,
    val contentHash: String,
    val packId: String,
    val localThumbPath: String,
    val localSharePath: String,
)

@Serializable
data class CachedManifest(
    val cursor: String,
    val emotes: List<CachedEmote>,
    val recents: List<String> = emptyList(),
)

/**
 * Standalone-capable pack cache. In this build the app works with no backend:
 * emotes live in the app's cache dir, shared between the host app (which adds
 * them) and the IME (which reads them and inserts the tapped one). A first-run
 * seed gives you a starter set so the keyboard has content immediately.
 */
class PackRepository(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }
    private val dir: File get() = File(context.cacheDir, "emotes").apply { mkdirs() }
    private val manifestFile: File get() = File(dir, "manifest.json")

    fun loadUnlockedEmotes(): List<CachedEmote> {
        val manifest = readManifest() ?: return emptyList()
        val recentsFirst = manifest.recents.toSet()
        return manifest.emotes.sortedByDescending { recentsFirst.contains(it.id) }
    }

    fun emoteFile(emote: CachedEmote): File? {
        val file = File(emote.localSharePath)
        return if (file.exists()) file else null
    }

    fun recordRecent(emoteId: String) {
        val manifest = readManifest() ?: return
        val recents = (listOf(emoteId) + manifest.recents.filter { it != emoteId }).take(30)
        writeManifest(manifest.copy(recents = recents))
    }

    /** Create the starter pack the first time the app runs. Idempotent. */
    fun ensureSeed() {
        if (manifestFile.exists()) return
        val defs = listOf(
            Triple("🔥", 0xFFFF7A45.toInt(), "onFire"),
            Triple("😂", 0xFFFFD23F.toInt(), "deadLol"),
            Triple("💜", 0xFF8A6BFF.toInt(), "purpleLove"),
            Triple("🎉", 0xFFFF5D8F.toInt(), "hype"),
            Triple("😎", 0xFF39C0C8.toInt(), "bigCool"),
            Triple("👀", 0xFF9AA3FF.toInt(), "sus"),
            Triple("🥳", 0xFFFF9F1C.toInt(), "letsGo"),
            Triple("💀", 0xFF7A7F95.toInt(), "imDead"),
            Triple("⭐", 0xFFFFD23F.toInt(), "poggers"),
            Triple("🤝", 0xFF37D29F.toInt(), "ggwp"),
            Triple("🧠", 0xFFC77DFF.toInt(), "bigBrain"),
            Triple("🫶", 0xFFFF6B9D.toInt(), "loveYou"),
        )
        val emotes = defs.mapIndexed { i, (glyph, bg, code) ->
            val file = File(dir, "seed$i.png")
            saveBitmap(renderGlyph(glyph, bg), file)
            CachedEmote(
                id = "s$i",
                shortcode = code,
                name = code.replaceFirstChar { it.uppercase() },
                animated = false,
                contentHash = "seed$i",
                packId = "starter",
                localThumbPath = file.absolutePath,
                localSharePath = file.absolutePath,
            )
        }
        writeManifest(CachedManifest(cursor = "seed", emotes = emotes))
    }

    /** Add one of your own images to the pack (no server needed). */
    fun addEmote(source: Bitmap, name: String) {
        val id = "u" + System.currentTimeMillis()
        val file = File(dir, "$id.png")
        saveBitmap(square(source, 128), file)
        val manifest = readManifest() ?: CachedManifest("local", emptyList())
        val code = name.filter { it.isLetterOrDigit() }.ifEmpty { "emote" }
        val emote = CachedEmote(id, code, name, false, id, "starter", file.absolutePath, file.absolutePath)
        writeManifest(manifest.copy(emotes = manifest.emotes + emote))
    }

    fun writeManifest(manifest: CachedManifest) {
        manifestFile.writeText(json.encodeToString(CachedManifest.serializer(), manifest))
    }

    private fun readManifest(): CachedManifest? = runCatching {
        if (!manifestFile.exists()) return null
        json.decodeFromString(CachedManifest.serializer(), manifestFile.readText())
    }.getOrNull()

    // --- image helpers ---

    private fun saveBitmap(bmp: Bitmap, file: File) {
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun renderGlyph(glyph: String, bg: Int): Bitmap {
        val size = 128
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = bg
        c.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), 30f, 30f, p)
        p.color = Color.WHITE
        p.textSize = 84f
        p.textAlign = Paint.Align.CENTER
        val fm = p.fontMetrics
        c.drawText(glyph, size / 2f, size / 2f - (fm.ascent + fm.descent) / 2, p)
        return bmp
    }

    private fun square(src: Bitmap, size: Int): Bitmap {
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val scale = minOf(size.toFloat() / src.width, size.toFloat() / src.height)
        val w = src.width * scale
        val h = src.height * scale
        val dst = RectF((size - w) / 2f, (size - h) / 2f, (size + w) / 2f, (size + h) / 2f)
        c.drawBitmap(src, null, dst, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        return out
    }
}
