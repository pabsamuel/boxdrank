package app.retrosubs.settings

import android.content.Context
import androidx.core.content.edit
import app.retrosubs.core.DisplayMode
import app.retrosubs.core.EngineMode

/** Every user-tunable knob, in one place. No accounts, no cloud, no sync — just prefs. */
class Prefs(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences("retrosubs", Context.MODE_PRIVATE)

    var fontSizeSp: Float
        get() = sp.getFloat(KEY_FONT, 16f)
        set(v) = sp.edit { putFloat(KEY_FONT, v) }

    var opacity: Float
        get() = sp.getFloat(KEY_OPACITY, 0.92f)
        set(v) = sp.edit { putFloat(KEY_OPACITY, v) }

    var typeSpeed: Float
        get() = sp.getFloat(KEY_SPEED, 45f)
        set(v) = sp.edit { putFloat(KEY_SPEED, v) }

    var soundEnabled: Boolean
        get() = sp.getBoolean(KEY_SOUND, false)
        set(v) = sp.edit { putBoolean(KEY_SOUND, v) }

    /** Overlay anchor: true = bottom of the screen, false = top. */
    var anchorBottom: Boolean
        get() = sp.getBoolean(KEY_ANCHOR, true)
        set(v) = sp.edit { putBoolean(KEY_ANCHOR, v) }

    /** Last dragged y offset, in px, from the anchored edge. */
    var overlayOffsetY: Int
        get() = sp.getInt(KEY_OFFSET_Y, 0)
        set(v) = sp.edit { putInt(KEY_OFFSET_Y, v) }

    var engineMode: EngineMode
        get() = runCatching { EngineMode.valueOf(sp.getString(KEY_ENGINE, null) ?: "") }
            .getOrDefault(EngineMode.REAL)
        set(v) = sp.edit { putString(KEY_ENGINE, v.name) }

    var displayMode: DisplayMode
        get() = runCatching { DisplayMode.valueOf(sp.getString(KEY_MODE, null) ?: "") }
            .getOrDefault(DisplayMode.TRANSCRIPTION)
        set(v) = sp.edit { putString(KEY_MODE, v.name) }

    var sourceLanguage: String
        get() = sp.getString(KEY_SRC, "en-US") ?: "en-US"
        set(v) = sp.edit { putString(KEY_SRC, v) }

    var targetLanguage: String
        get() = sp.getString(KEY_DST, "en-US") ?: "en-US"
        set(v) = sp.edit { putString(KEY_DST, v) }

    /** YOU/OTHER alternation heuristic. Off by default: honest beats clever. */
    var alternateSpeakers: Boolean
        get() = sp.getBoolean(KEY_ALT_SPEAKERS, false)
        set(v) = sp.edit { putBoolean(KEY_ALT_SPEAKERS, v) }

    private companion object {
        const val KEY_FONT = "font_sp"
        const val KEY_OPACITY = "opacity"
        const val KEY_SPEED = "type_speed"
        const val KEY_SOUND = "sound"
        const val KEY_ANCHOR = "anchor_bottom"
        const val KEY_OFFSET_Y = "offset_y"
        const val KEY_MODE = "display_mode"
        const val KEY_ENGINE = "engine_mode"
        const val KEY_SRC = "src_lang"
        const val KEY_DST = "dst_lang"
        const val KEY_ALT_SPEAKERS = "alt_speakers"
    }
}
