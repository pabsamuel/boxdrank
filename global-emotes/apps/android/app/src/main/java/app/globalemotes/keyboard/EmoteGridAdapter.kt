package app.globalemotes.keyboard

import android.view.ViewGroup
import android.widget.ImageView
import androidx.recyclerview.widget.RecyclerView
import app.globalemotes.data.CachedEmote
import coil.load

/** Minimal grid of cached emote thumbnails with accessibility labels. */
class EmoteGridAdapter(
    private val emotes: List<CachedEmote>,
    private val onTap: (CachedEmote) -> Unit,
) : RecyclerView.Adapter<EmoteGridAdapter.Holder>() {

    class Holder(val image: ImageView) : RecyclerView.ViewHolder(image)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val size = parent.resources.getDimensionPixelSize(R.dimen.emote_cell)
        val image = ImageView(parent.context).apply {
            layoutParams = ViewGroup.LayoutParams(size, size)
            scaleType = ImageView.ScaleType.FIT_CENTER
            val pad = size / 8
            setPadding(pad, pad, pad, pad)
        }
        return Holder(image)
    }

    override fun getItemCount(): Int = emotes.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val emote = emotes[position]
        holder.image.contentDescription = emote.name
        holder.image.load(emote.localThumbPath)
        holder.image.setOnClickListener { onTap(emote) }
    }
}
