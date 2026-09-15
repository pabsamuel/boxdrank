package app.retrosubs

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import app.retrosubs.core.DisplayMode
import app.retrosubs.core.EngineStatus
import app.retrosubs.core.SubtitleBus
import app.retrosubs.core.SubtitleEngine
import app.retrosubs.overlay.OverlayService
import app.retrosubs.settings.Prefs
import app.retrosubs.speaker.SpeakerDetector
import app.retrosubs.speech.AndroidSpeechProvider
import app.retrosubs.speech.FakeScriptProvider
import app.retrosubs.speech.SpeechRecognitionProvider
import app.retrosubs.ui.DialogueBoxView
import com.google.android.material.materialswitch.MaterialSwitch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Control room + live preview.
 *
 * The preview renders the exact same [SubtitleBus] state as the floating overlay, so what you
 * tune here is literally what you get over WhatsApp.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var preview: DialogueBoxView
    private lateinit var status: TextView
    private lateinit var permissionHint: TextView

    /** In-app (no overlay) engine, used by the demo + preview when the overlay isn't running. */
    private var localEngine: SubtitleEngine? = null

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startSubtitleMode() else refreshHints()
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { refreshHints() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        preview = findViewById(R.id.preview)
        status = findViewById(R.id.status)
        permissionHint = findViewById(R.id.permissionHint)

        applyPrefsToPreview()
        preview.showPlaceholder("Press PLAY DEMO SCRIPT to see the box come alive.")

        findViewById<Button>(R.id.demoButton).setOnClickListener { toggleDemo() }
        findViewById<Button>(R.id.startButton).setOnClickListener { onStartPressed() }
        findViewById<Button>(R.id.stopButton).setOnClickListener { stopEverything() }

        wireLooks()
        wireLanguage()
        observeBus()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onResume() {
        super.onResume()
        refreshHints()
    }

    // ------------------------------------------------------------------ actions

    private fun toggleDemo() {
        val engine = localEngine
        if (engine != null && engine.isRunning) {
            engine.stop()
            localEngine = null
            preview.showPlaceholder("Demo stopped.")
            return
        }
        val factory: (SpeakerDetector) -> SpeechRecognitionProvider = { FakeScriptProvider() }
        localEngine = SubtitleEngine(prefs, factory).also { it.start() }
    }

    private fun onStartPressed() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        if (!OverlayService.canDrawOverlays(this)) {
            startActivity(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName"),
                )
            )
            permissionHint.text = "Grant \"Display over other apps\", then press START again."
            return
        }
        startSubtitleMode()
    }

    private fun startSubtitleMode() {
        localEngine?.stop()
        localEngine = null
        if (!OverlayService.canDrawOverlays(this)) {
            refreshHints()
            return
        }
        OverlayService.start(this, demo = false)
        permissionHint.text = "Subtitle mode is live. Switch to your call app — the box follows."
    }

    private fun stopEverything() {
        localEngine?.stop()
        localEngine = null
        OverlayService.stop(this)
        SubtitleBus.clear()
        preview.showPlaceholder("Stopped.")
    }

    // ------------------------------------------------------------------ wiring

    private fun applyPrefsToPreview() {
        preview.fontSizeSp = prefs.fontSizeSp
        preview.boxOpacity = prefs.opacity
        preview.charsPerSecond = prefs.typeSpeed
        preview.soundEnabled = prefs.soundEnabled
        preview.displayMode = prefs.displayMode
    }

    private fun wireLooks() {
        val fontSeek = findViewById<SeekBar>(R.id.fontSeek)
        val fontLabel = findViewById<TextView>(R.id.fontLabel)
        fontSeek.progress = (prefs.fontSizeSp - 10f).toInt()
        fontLabel.text = "font size — ${prefs.fontSizeSp.toInt()}sp"
        fontSeek.onChange { value ->
            val sp = 10f + value
            prefs.fontSizeSp = sp
            preview.fontSizeSp = sp
            fontLabel.text = "font size — ${sp.toInt()}sp"
        }

        val opacitySeek = findViewById<SeekBar>(R.id.opacitySeek)
        val opacityLabel = findViewById<TextView>(R.id.opacityLabel)
        opacitySeek.progress = (prefs.opacity * 100).toInt()
        opacityLabel.text = "opacity — ${(prefs.opacity * 100).toInt()}%"
        opacitySeek.onChange { value ->
            val alpha = (value / 100f).coerceIn(0.35f, 1f)
            prefs.opacity = alpha
            preview.boxOpacity = alpha
            opacityLabel.text = "opacity — ${(alpha * 100).toInt()}%"
        }

        val speedSeek = findViewById<SeekBar>(R.id.speedSeek)
        val speedLabel = findViewById<TextView>(R.id.speedLabel)
        speedSeek.progress = prefs.typeSpeed.toInt()
        speedLabel.text = "type speed — ${prefs.typeSpeed.toInt()} chars/sec"
        speedSeek.onChange { value ->
            val speed = value.toFloat()
            prefs.typeSpeed = speed
            preview.charsPerSecond = speed
            speedLabel.text = if (speed <= 0f) "type speed — instant" else "type speed — $value chars/sec"
        }

        findViewById<MaterialSwitch>(R.id.soundSwitch).apply {
            isChecked = prefs.soundEnabled
            setOnCheckedChangeListener { _, checked ->
                prefs.soundEnabled = checked
                preview.soundEnabled = checked
            }
        }
        findViewById<MaterialSwitch>(R.id.anchorSwitch).apply {
            isChecked = prefs.anchorBottom
            setOnCheckedChangeListener { _, checked -> prefs.anchorBottom = checked }
        }
        findViewById<MaterialSwitch>(R.id.speakerSwitch).apply {
            isChecked = prefs.alternateSpeakers
            setOnCheckedChangeListener { _, checked -> prefs.alternateSpeakers = checked }
        }
    }

    private fun wireLanguage() {
        val modes = DisplayMode.entries.toList()
        findViewById<Spinner>(R.id.modeSpinner).bind(
            modes.map { it.label() },
            modes.indexOf(prefs.displayMode),
        ) { index ->
            prefs.displayMode = modes[index]
            preview.displayMode = modes[index]
        }

        val tags = LANGUAGES.map { it.second }
        findViewById<Spinner>(R.id.sourceSpinner).bind(
            LANGUAGES.map { it.first },
            tags.indexOf(prefs.sourceLanguage).coerceAtLeast(0),
        ) { index -> prefs.sourceLanguage = tags[index] }

        findViewById<Spinner>(R.id.targetSpinner).bind(
            LANGUAGES.map { it.first },
            tags.indexOf(prefs.targetLanguage).coerceAtLeast(0),
        ) { index -> prefs.targetLanguage = tags[index] }
    }

    private fun observeBus() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    SubtitleBus.line.collectLatest { line -> preview.setLine(line) }
                }
                launch {
                    SubtitleBus.status.collectLatest { s ->
                        status.text = when (s) {
                            EngineStatus.IDLE -> "idle"
                            EngineStatus.LISTENING -> "listening…"
                            EngineStatus.PAUSED -> "paused"
                            EngineStatus.SILENCED_BY_SYSTEM ->
                                "another app owns the mic — see second-device mode"

                            EngineStatus.ERROR -> "speech engine error"
                        }
                    }
                }
            }
        }
    }

    private fun refreshHints() {
        val mic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        val overlay = OverlayService.canDrawOverlays(this)
        permissionHint.text = buildString {
            append(if (mic) "✓ microphone" else "✗ microphone")
            append("    ")
            append(if (overlay) "✓ overlay" else "✗ overlay")
        }
    }

    // ------------------------------------------------------------------ helpers

    private fun SeekBar.onChange(block: (Int) -> Unit) {
        setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) =
                block(progress)

            override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
            override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
        })
    }

    private fun Spinner.bind(labels: List<String>, selected: Int, onPick: (Int) -> Unit) {
        adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, labels)
        setSelection(selected.coerceIn(0, labels.lastIndex))
        onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) =
                onPick(position)

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }
    }

    private fun DisplayMode.label() = when (this) {
        DisplayMode.TRANSCRIPTION -> "transcription only"
        DisplayMode.TRANSLATION -> "translation only"
        DisplayMode.LEARNING -> "learning (both)"
    }

    private companion object {
        val LANGUAGES = listOf(
            "English" to "en-US",
            "Japanese" to "ja-JP",
            "Turkish" to "tr-TR",
            "French" to "fr-FR",
            "German" to "de-DE",
            "Spanish" to "es-ES",
            "Italian" to "it-IT",
            "Portuguese" to "pt-BR",
            "Korean" to "ko-KR",
            "Chinese" to "zh-CN",
            "Russian" to "ru-RU",
            "Arabic" to "ar-EG",
        )
    }
}
