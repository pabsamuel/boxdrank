package app.globalemotes.keyboard

import android.inputmethodservice.InputMethodService
import android.view.View
import android.widget.Toast
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import app.globalemotes.data.CachedEmote
import app.globalemotes.data.PackRepository

/**
 * Global Emotes IME.
 *
 * PRIVACY INVARIANT (master spec §4.3): this service never calls
 * getTextBeforeCursor/getTextAfterCursor/getSelectedText, never logs key
 * events, and performs no network I/O in the input path. It renders the
 * offline pack cache and inserts the tapped emote — nothing else.
 */
class EmoteKeyboardService : InputMethodService() {

    private lateinit var repository: PackRepository

    override fun onCreate() {
        super.onCreate()
        repository = PackRepository(applicationContext)
    }

    override fun onCreateInputView(): View {
        val view = layoutInflater.inflate(R.layout.keyboard_view, null)
        val recycler = view.findViewById<RecyclerView>(R.id.emote_grid)
        recycler.layoutManager = GridLayoutManager(this, 6)
        recycler.adapter = EmoteGridAdapter(repository.loadUnlockedEmotes()) { emote ->
            insertEmote(emote)
        }
        return view
    }

    private fun insertEmote(emote: CachedEmote) {
        val editorInfo = currentInputEditorInfo ?: return
        val inputConnection = currentInputConnection ?: return
        val file = repository.emoteFile(emote) ?: run {
            Toast.makeText(this, R.string.emote_not_cached, Toast.LENGTH_SHORT).show()
            return
        }
        val plan = InsertionHelper.plan(
            InsertionHelper.editorMimeTypes(editorInfo),
            emote.animated,
        )
        val inserted = when (plan.method) {
            InsertionHelper.Method.DIRECT -> InsertionHelper.commitEmote(
                this, inputConnection, editorInfo, file, plan.mimeType, emote.shortcode,
            )
            else -> false
        }
        if (!inserted) {
            // Honest fallback: copy + tell the user to paste (spec §14).
            InsertionHelper.copyToClipboard(this, file, emote.shortcode)
            Toast.makeText(this, R.string.copied_paste_to_send, Toast.LENGTH_SHORT).show()
        }
        repository.recordRecent(emote.id)
    }
}
