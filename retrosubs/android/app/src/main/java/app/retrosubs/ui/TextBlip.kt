package app.retrosubs.ui

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

/**
 * The little "text is typing" tick, synthesised at runtime — an original square-ish blip with a
 * fast decay. No sound assets, nothing sampled from anywhere.
 */
class TextBlip {

    private val sampleRate = 22050
    private val samples: ShortArray = buildBlip()
    private var track: AudioTrack? = null

    private fun buildBlip(): ShortArray {
        val durationMs = 28
        val n = sampleRate * durationMs / 1000
        val freq = 1180.0
        return ShortArray(n) { i ->
            val t = i.toDouble() / sampleRate
            val decay = 1.0 - i.toDouble() / n
            // Half square / half sine: bright but not harsh.
            val raw = if (sin(2 * PI * freq * t) >= 0) 0.55 else -0.55
            val shaped = raw * decay * decay
            (shaped * Short.MAX_VALUE * 0.35).toInt().toShort()
        }
    }

    private fun ensureTrack(): AudioTrack? {
        track?.let { return it }
        return try {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(samples.size * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()
                .also {
                    it.write(samples, 0, samples.size)
                    track = it
                }
        } catch (t: Throwable) {
            null
        }
    }

    fun play() {
        val t = ensureTrack() ?: return
        try {
            if (t.playState == AudioTrack.PLAYSTATE_PLAYING) t.stop()
            t.reloadStaticData()
            t.setVolume(AudioTrack.getMaxVolume() * 0.25f)
            t.play()
        } catch (ignored: IllegalStateException) {
        }
    }

    fun release() {
        try {
            track?.release()
        } catch (ignored: Throwable) {
        }
        track = null
    }
}
