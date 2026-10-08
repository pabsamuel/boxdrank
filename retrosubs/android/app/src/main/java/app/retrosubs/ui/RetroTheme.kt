package app.retrosubs.ui

import android.graphics.Color

/**
 * An ORIGINAL retro-handheld palette. Nothing here is traced, ripped or sampled from any
 * existing game: five flat colours, drawn chrome, no bitmap assets, no third-party font.
 *
 * Future themes (Visual Novel / Cyberpunk terminal / Minimal) become new instances of this
 * class — the pipeline and the view never change.
 */
data class RetroTheme(
    val name: String,
    /** Panel fill. */
    val panel: Int,
    /** Panel fill, lower half — a very subtle vertical wash. */
    val panelDeep: Int,
    /** Outer pixel border. */
    val border: Int,
    /** Inner bevel line, one pixel-unit inside the border. */
    val bevel: Int,
    /** Body text. */
    val ink: Int,
    /** Speaker name plate text + caret. */
    val accent: Int,
    /** Secondary (translation) text. */
    val secondary: Int,
    /** Scanline wash colour, drawn at low alpha. */
    val scanline: Int,
) {
    companion object {
        /** "Moonwell" — deep indigo panel, bone-white chrome, amber accent. */
        val MOONWELL = RetroTheme(
            name = "Moonwell",
            panel = Color.parseColor("#141A3C"),
            panelDeep = Color.parseColor("#0C1030"),
            border = Color.parseColor("#F5EFDC"),
            bevel = Color.parseColor("#5C6BC0"),
            ink = Color.parseColor("#F7F3E3"),
            accent = Color.parseColor("#F2C14E"),
            secondary = Color.parseColor("#8BD3DD"),
            scanline = Color.parseColor("#000018"),
        )
    }
}
