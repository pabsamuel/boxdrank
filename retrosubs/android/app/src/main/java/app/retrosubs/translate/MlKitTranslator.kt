package app.retrosubs.translate

import android.util.Log
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator as MlTranslator
import com.google.mlkit.nl.translate.TranslatorOptions

/**
 * PHASE 4: on-device translation. Free, offline once the ~30 MB language pair is downloaded,
 * and fast enough (~150-400 ms) that a translated line lands a beat after the original —
 * exactly the behaviour the product wants.
 */
class MlKitTranslator : Translator {

    override val id = "mlkit"

    private val clients = HashMap<String, MlTranslator>()
    private val ready = HashSet<String>()

    override fun translate(
        text: String,
        sourceTag: String,
        targetTag: String,
        onResult: (String) -> Unit,
    ) {
        val source = TranslateLanguage.fromLanguageTag(sourceTag.substringBefore('-')) ?: return
        val target = TranslateLanguage.fromLanguageTag(targetTag.substringBefore('-')) ?: return
        if (source == target) return
        val key = "$source>$target"
        val client = clients.getOrPut(key) {
            Translation.getClient(
                TranslatorOptions.Builder()
                    .setSourceLanguage(source)
                    .setTargetLanguage(target)
                    .build()
            )
        }

        fun run() = client.translate(text)
            .addOnSuccessListener { translated -> onResult(translated) }
            .addOnFailureListener { Log.w(TAG, "translate failed", it) }

        if (key in ready) {
            run()
        } else {
            client.downloadModelIfNeeded(DownloadConditions.Builder().build())
                .addOnSuccessListener {
                    ready += key
                    run()
                }
                .addOnFailureListener { Log.w(TAG, "model download failed for $key", it) }
        }
    }

    override fun close() {
        clients.values.forEach { it.close() }
        clients.clear()
        ready.clear()
    }

    private companion object {
        const val TAG = "MlKitTranslator"
    }
}
