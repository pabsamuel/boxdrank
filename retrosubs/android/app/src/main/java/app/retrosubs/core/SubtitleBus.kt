package app.retrosubs.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Process-wide state of "what is on screen right now".
 *
 * Deliberately a singleton: the in-app preview and the floating overlay window are two
 * renderers of the same state, which is why they can never drift apart.
 */
object SubtitleBus {

    private val _line = MutableStateFlow<DialogueLine?>(null)
    val line: StateFlow<DialogueLine?> = _line.asStateFlow()

    private val _status = MutableStateFlow(EngineStatus.IDLE)
    val status: StateFlow<EngineStatus> = _status.asStateFlow()

    private var nextId = 1L

    @Synchronized
    fun mintId(): Long = nextId++

    /** Publish a new or updated line. */
    fun publish(line: DialogueLine) {
        _line.value = line
    }

    /**
     * Attach a translation to a line *if* it is still the line on screen and the source text
     * has not moved on. Stale translations are dropped rather than flickering old text.
     */
    fun publishTranslation(id: Long, forSourceText: String, translation: String) {
        _line.update { current ->
            if (current != null && current.id == id && current.text == forSourceText) {
                current.copy(translation = translation)
            } else {
                current
            }
        }
    }

    fun setStatus(status: EngineStatus) {
        _status.value = status
    }

    fun clear() {
        _line.value = null
    }
}

enum class EngineStatus {
    IDLE,
    LISTENING,
    PAUSED,

    /** Android silenced our microphone because something with higher priority owns it. */
    SILENCED_BY_SYSTEM,
    ERROR,
}
