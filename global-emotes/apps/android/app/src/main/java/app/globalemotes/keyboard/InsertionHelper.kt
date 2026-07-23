package app.globalemotes.keyboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import androidx.core.content.FileProvider
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import java.io.File

/**
 * Chooses and executes the best delivery method for an emote:
 *  1. commitContent when the target editor advertises a compatible MIME type
 *  2. clipboard copy (user pastes)
 *  3. share sheet
 * Runtime MIME detection always wins; the server compatibility registry only
 * provides copy/UX hints (IP-06). No typed text is ever read here.
 */
object InsertionHelper {

    enum class Method { DIRECT, CLIPBOARD, SHARE }

    data class Plan(val method: Method, val mimeType: String)

    /** Pure decision logic — unit-tested in InsertionPlannerTest. */
    fun plan(editorMimeTypes: Array<String>, animated: Boolean): Plan {
        val preferred = if (animated) {
            listOf("image/webp", "image/gif", "image/png")
        } else {
            listOf("image/webp", "image/png")
        }
        for (candidate in preferred) {
            if (editorMimeTypes.any { supported ->
                    ClipDescription.compareMimeTypes(candidate, supported)
                }
            ) {
                return Plan(Method.DIRECT, candidate)
            }
        }
        return Plan(Method.CLIPBOARD, if (animated) "image/gif" else "image/png")
    }

    fun editorMimeTypes(editorInfo: EditorInfo?): Array<String> =
        editorInfo?.let { EditorInfoCompat.getContentMimeTypes(it) } ?: emptyArray()

    /** Attempt direct rich-content insertion via commitContent. */
    fun commitEmote(
        context: Context,
        inputConnection: InputConnection,
        editorInfo: EditorInfo,
        emoteFile: File,
        mimeType: String,
        description: String,
    ): Boolean {
        val uri: Uri = FileProvider.getUriForFile(
            context,
            context.packageName + ".emotes",
            emoteFile,
        )
        val contentInfo = InputContentInfoCompat(
            uri,
            ClipDescription(description, arrayOf(mimeType)),
            null,
        )
        return InputConnectionCompat.commitContent(
            inputConnection,
            editorInfo,
            contentInfo,
            InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION,
            null,
        )
    }

    /** Fallback: copy the emote image to the clipboard for manual paste. */
    fun copyToClipboard(context: Context, emoteFile: File, label: String): Boolean {
        val uri = FileProvider.getUriForFile(context, context.packageName + ".emotes", emoteFile)
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newUri(context.contentResolver, label, uri))
        return true
    }

    /** Fallback: hand the emote to the share sheet. */
    fun shareIntent(context: Context, emoteFile: File, mimeType: String): Intent {
        val uri = FileProvider.getUriForFile(context, context.packageName + ".emotes", emoteFile)
        return Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
}
