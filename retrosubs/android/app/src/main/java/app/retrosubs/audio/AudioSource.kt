package app.retrosubs.audio

import android.os.ParcelFileDescriptor

/**
 * Where the audio to transcribe comes from.
 *
 * The default path (phone microphone) is handled inside the platform recognizer, so it needs no
 * implementation here. This interface exists for sources we have to feed by hand — today the
 * MediaProjection playback capture of Phase 5, tomorrow a socket from a companion device.
 */
interface ExternalAudioSource {
    val id: String
    val sampleRate: Int
    val channelCount: Int

    /** Opens a fresh read-side descriptor carrying 16-bit PCM. Called once per recognizer session. */
    fun openStream(): ParcelFileDescriptor?

    fun stop()
}
