package app.retrosubs.audio

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.annotation.RequiresApi
import java.io.FileOutputStream
import kotlin.concurrent.thread

/**
 * PHASE 5: capture what *other apps are playing* via MediaProjection and pipe it into the
 * recognizer.
 *
 * Hard platform limit (verified, see docs/00-FEASIBILITY.md): only USAGE_MEDIA / USAGE_GAME /
 * USAGE_UNKNOWN playback can be captured. VoIP call audio is USAGE_VOICE_COMMUNICATION and is
 * **never** capturable by a third-party app. So this gives us video/voice-note/stream subtitles,
 * not WhatsApp-call subtitles — and the UI says so rather than pretending.
 */
@RequiresApi(Build.VERSION_CODES.Q)
class PlaybackCaptureSource(
    private val projection: MediaProjection,
) : ExternalAudioSource {

    override val id = "media-projection"
    override val sampleRate = 16_000
    override val channelCount = 1

    private var record: AudioRecord? = null
    @Volatile private var running = false

    @SuppressLint("MissingPermission")
    override fun openStream(): ParcelFileDescriptor? {
        stop()
        val config = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()

        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(4096)

        val recorder = runCatching {
            AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(minBuffer * 2)
                .setAudioPlaybackCaptureConfig(config)
                .build()
        }.getOrElse {
            Log.w(TAG, "playback capture unavailable", it)
            return null
        }

        val pipe = ParcelFileDescriptor.createPipe()
        val read = pipe[0]
        val write = pipe[1]

        record = recorder
        running = true
        recorder.startRecording()

        thread(name = "retrosubs-playback-capture") {
            val out = FileOutputStream(write.fileDescriptor)
            val buf = ByteArray(minBuffer)
            try {
                while (running) {
                    val n = recorder.read(buf, 0, buf.size)
                    if (n > 0) out.write(buf, 0, n) else if (n < 0) break
                }
            } catch (t: Throwable) {
                Log.d(TAG, "capture pipe closed: ${t.message}")
            } finally {
                runCatching { out.close() }
                runCatching { write.close() }
            }
        }
        return read
    }

    override fun stop() {
        running = false
        runCatching { record?.stop() }
        runCatching { record?.release() }
        record = null
    }

    private companion object {
        const val TAG = "PlaybackCapture"
    }
}
