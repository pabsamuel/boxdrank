package app.globalemotes

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import app.globalemotes.data.PackRepository

/**
 * Host app: keyboard setup + add-your-own-emote, fully offline. No login, no
 * server — emotes are stored on-device and read by the keyboard extension.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var repo: PackRepository

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@registerForActivityResult
        val bmp = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        if (bmp == null) {
            Toast.makeText(this, R.string.read_image_failed, Toast.LENGTH_SHORT).show()
            return@registerForActivityResult
        }
        repo.addEmote(bmp, "Emote")
        refreshCount()
        Toast.makeText(this, R.string.added_toast, Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        repo = PackRepository(applicationContext)
        repo.ensureSeed()
        refreshCount()

        findViewById<Button>(R.id.add_emote).setOnClickListener { pickImage.launch("image/*") }
        findViewById<Button>(R.id.enable_keyboard).setOnClickListener {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }
        findViewById<Button>(R.id.switch_keyboard).setOnClickListener {
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).showInputMethodPicker()
        }
    }

    private fun refreshCount() {
        val count = repo.loadUnlockedEmotes().size
        findViewById<TextView>(R.id.pack_count).text = getString(R.string.pack_count, count)
    }
}
