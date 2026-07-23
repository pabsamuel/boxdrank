package app.globalemotes.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

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
 * Offline pack cache shared between the host app (which syncs it via
 * SyncWorker) and the IME (which only reads it). The keyboard therefore needs
 * no network access of its own — cold start is a local JSON read.
 */
class PackRepository(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }
    private val manifestFile: File get() = File(context.cacheDir, "emotes/manifest.json")

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

    fun writeManifest(manifest: CachedManifest) {
        manifestFile.parentFile?.mkdirs()
        manifestFile.writeText(json.encodeToString(CachedManifest.serializer(), manifest))
    }

    private fun readManifest(): CachedManifest? = runCatching {
        if (!manifestFile.exists()) return null
        json.decodeFromString(CachedManifest.serializer(), manifestFile.readText())
    }.getOrNull()
}
