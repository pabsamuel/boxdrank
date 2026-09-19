package app.retrosubs.ui

import android.graphics.Typeface

/**
 * Single swap point for the dialogue typeface.
 *
 * The MVP uses the platform monospace face: it is chunky, universally available, licence-free
 * and — the requirement that actually matters — extremely readable at small sizes over a video
 * call. Dropping in a bundled/downloadable pixel face later touches only this object.
 */
object PixelFont {
    val body: Typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    val name: Typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
}
