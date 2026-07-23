package app.globalemotes.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File

/**
 * Host-app background sync: fetches /v1/sync/manifest with the session cookie,
 * downloads keyboard + share variants into the cache the IME reads. Runs via
 * WorkManager (periodic + on-demand after login/unlock). The IME itself never
 * talks to the network.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val apiUrl = inputData.getString("apiUrl") ?: return Result.failure()
        val sessionCookie = inputData.getString("sessionCookie") ?: return Result.failure()
        val client = OkHttpClient()

        val request = Request.Builder()
            .url("$apiUrl/v1/sync/manifest")
            .header("cookie", sessionCookie)
            .build()
        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            return if (response.code in 500..599) Result.retry() else Result.failure()
        }
        val body = response.body?.string() ?: return Result.retry()
        val manifest = JSONObject(body)

        val emoteDir = File(applicationContext.cacheDir, "emotes").apply { mkdirs() }
        val cached = mutableListOf<CachedEmote>()
        val packs = manifest.getJSONArray("packs")
        for (p in 0 until packs.length()) {
            val pack = packs.getJSONObject(p)
            val emotes = pack.getJSONArray("emotes")
            for (e in 0 until emotes.length()) {
                val emote = emotes.getJSONObject(e)
                val hash = emote.getString("contentHash")
                val thumb = download(client, emote.getString("keyboardUrl"), File(emoteDir, "$hash-kb.webp"))
                val share = download(client, emote.getString("shareUrl"), File(emoteDir, "$hash-share.webp"))
                if (thumb != null && share != null) {
                    cached.add(
                        CachedEmote(
                            id = emote.getString("id"),
                            shortcode = emote.getString("shortcode"),
                            name = emote.getString("name"),
                            animated = emote.getBoolean("animated"),
                            contentHash = hash,
                            packId = pack.getString("packId"),
                            localThumbPath = thumb.absolutePath,
                            localSharePath = share.absolutePath,
                        ),
                    )
                }
            }
        }

        // Tombstones: drop cached files for packs the server says are removed.
        val repository = PackRepository(applicationContext)
        repository.writeManifest(CachedManifest(cursor = manifest.getString("cursor"), emotes = cached))
        return Result.success()
    }

    private fun download(client: OkHttpClient, url: String, target: File): File? {
        if (target.exists() && target.length() > 0) return target // content-addressed: cache hit
        val response = client.newCall(Request.Builder().url(url).build()).execute()
        if (!response.isSuccessful) return null
        response.body?.byteStream()?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        }
        return target
    }
}
