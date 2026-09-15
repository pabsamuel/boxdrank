package app.retrosubs.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.retrosubs.MainActivity
import app.retrosubs.R
import app.retrosubs.core.EngineStatus
import app.retrosubs.core.SubtitleBus
import app.retrosubs.core.SubtitleEngine
import app.retrosubs.settings.Prefs
import app.retrosubs.speaker.SpeakerDetector
import app.retrosubs.speech.AndroidSpeechProvider
import app.retrosubs.speech.FakeScriptProvider
import app.retrosubs.speech.SpeechRecognitionProvider
import app.retrosubs.ui.DialogueBoxView
import app.retrosubs.ui.RetroTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * PHASE 3: the floating dialogue box.
 *
 * A typed foreground service owning a `TYPE_APPLICATION_OVERLAY` window, so the box survives the
 * user switching to WhatsApp / Discord / Meet / anything else. Drag, collapse, pause and close
 * live in a slim control strip that sits *above* the box so it never covers call controls.
 */
class OverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var prefs: Prefs
    private var root: LinearLayout? = null
    private var box: DialogueBoxView? = null
    private var params: WindowManager.LayoutParams? = null
    private var engine: SubtitleEngine? = null
    private var paused = false
    private var collapsed = false
    private var demoMode = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = Prefs(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopEverything()
                return START_NOT_STICKY
            }

            ACTION_TOGGLE_PAUSE -> {
                togglePause()
                return START_STICKY
            }
        }

        demoMode = intent?.getBooleanExtra(EXTRA_DEMO, false) == true
        startForegroundCompat()
        if (root == null) showOverlay()
        startEngine()
        return START_STICKY
    }

    // ------------------------------------------------------------------ engine

    private fun startEngine() {
        if (engine?.isRunning == true) return
        val factory: (SpeakerDetector) -> SpeechRecognitionProvider = { detector ->
            if (demoMode) FakeScriptProvider() else AndroidSpeechProvider(this, detector)
        }
        engine = SubtitleEngine(prefs, factory).also { it.start() }
        scope.launch {
            SubtitleBus.line.collectLatest { line ->
                if (!paused) box?.setLine(line)
            }
        }
        scope.launch {
            SubtitleBus.status.collectLatest { status ->
                if (status == EngineStatus.SILENCED_BY_SYSTEM) {
                    box?.showPlaceholder("Another app is using the mic — try second-device mode.")
                }
            }
        }
    }

    private fun togglePause() {
        paused = !paused
        if (paused) {
            engine?.stop()
            SubtitleBus.setStatus(EngineStatus.PAUSED)
            box?.showPlaceholder("Paused.")
        } else {
            startEngine()
            box?.showPlaceholder("Listening...")
        }
        updateControls()
    }

    private fun stopEverything() {
        engine?.stop()
        engine = null
        scope.cancel()
        root?.let { runCatching { windowManager.removeView(it) } }
        root = null
        SubtitleBus.clear()
        SubtitleBus.setStatus(EngineStatus.IDLE)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ------------------------------------------------------------------ window

    private fun showOverlay() {
        if (!canDrawOverlays(this)) {
            stopEverything()
            return
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), 0, dp(8), dp(8))
        }
        container.addView(buildControls(), LinearLayout.LayoutParams(MATCH, WRAP))

        val dialogue = DialogueBoxView(this).apply {
            theme = RetroTheme.MOONWELL
            fontSizeSp = prefs.fontSizeSp
            boxOpacity = prefs.opacity
            charsPerSecond = prefs.typeSpeed
            soundEnabled = prefs.soundEnabled
            displayMode = prefs.displayMode
            showPlaceholder(if (demoMode) "Demo running..." else "Listening...")
        }
        box = dialogue
        container.addView(dialogue, LinearLayout.LayoutParams(MATCH, WRAP))

        val lp = WindowManager.LayoutParams(
            MATCH,
            WRAP,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = (if (prefs.anchorBottom) Gravity.BOTTOM else Gravity.TOP) or Gravity.START
            y = prefs.overlayOffsetY
        }
        params = lp
        root = container
        windowManager.addView(container, lp)
    }

    private fun overlayType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

    private var pauseButton: TextView? = null

    private fun buildControls(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, 0, 0, dp(4))
        }
        val handle = chip("⠿").apply { setOnTouchListener(dragListener()) }
        pauseButton = chip("❚❚") { togglePause() }
        val collapse = chip("▁") { toggleCollapse() }
        val flip = chip("⇅") { flipAnchor() }
        val close = chip("✕") { stopEverything() }

        row.addView(handle)
        row.addView(FrameLayout(this), LinearLayout.LayoutParams(0, 1, 1f))
        row.addView(flip)
        row.addView(collapse)
        row.addView(pauseButton)
        row.addView(close)
        return row
    }

    private fun updateControls() {
        pauseButton?.text = if (paused) "▶" else "❚❚"
    }

    private fun chip(label: String, onClick: (() -> Unit)? = null): TextView =
        TextView(this).apply {
            text = label
            setTextColor(Color.parseColor("#F5EFDC"))
            setBackgroundColor(Color.parseColor("#CC141A3C"))
            setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(12), dp(6), dp(12), dp(6))
            val lp = LinearLayout.LayoutParams(WRAP, WRAP)
            lp.marginStart = dp(4)
            layoutParams = lp
            onClick?.let { action -> setOnClickListener { action() } }
        }

    private fun toggleCollapse() {
        collapsed = !collapsed
        box?.visibility = if (collapsed) View.GONE else View.VISIBLE
    }

    private fun flipAnchor() {
        prefs.anchorBottom = !prefs.anchorBottom
        prefs.overlayOffsetY = 0
        params?.let { lp ->
            lp.gravity = (if (prefs.anchorBottom) Gravity.BOTTOM else Gravity.TOP) or Gravity.START
            lp.y = 0
            root?.let { windowManager.updateViewLayout(it, lp) }
        }
    }

    /** Vertical drag on the handle; the box always spans the screen width for readability. */
    private fun dragListener() = object : View.OnTouchListener {
        private var startY = 0f
        private var startOffset = 0

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            val lp = params ?: return false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startY = event.rawY
                    startOffset = lp.y
                    return true
                }

                MotionEvent.ACTION_MOVE -> {
                    val delta = (event.rawY - startY).roundToInt()
                    lp.y = (startOffset + if (prefs.anchorBottom) -delta else delta).coerceAtLeast(0)
                    root?.let { windowManager.updateViewLayout(it, lp) }
                    return true
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    prefs.overlayOffsetY = lp.y
                    v.performClick()
                    return true
                }
            }
            return false
        }
    }

    // ------------------------------------------------------------------ notification

    private fun startForegroundCompat() {
        val channelId = "retrosubs.overlay"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(channelId) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(channelId, "Subtitle mode", NotificationManager.IMPORTANCE_LOW)
                )
            }
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, OverlayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = Notification.Builder(this, channelId)
            .setContentTitle("Retro subtitles are on")
            .setContentText("Listening to the room")
            .setSmallIcon(R.drawable.ic_stat_subtitles)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null as Icon?, "Stop", stop).build())
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        engine?.stop()
        root?.let { runCatching { windowManager.removeView(it) } }
        root = null
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

    companion object {
        const val ACTION_STOP = "app.retrosubs.STOP"
        const val ACTION_TOGGLE_PAUSE = "app.retrosubs.TOGGLE_PAUSE"
        const val EXTRA_DEMO = "demo"
        private const val NOTIFICATION_ID = 41
        private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

        fun canDrawOverlays(context: Context): Boolean = Settings.canDrawOverlays(context)

        fun start(context: Context, demo: Boolean) {
            val intent = Intent(context, OverlayService::class.java).putExtra(EXTRA_DEMO, demo)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_STOP))
        }
    }
}
