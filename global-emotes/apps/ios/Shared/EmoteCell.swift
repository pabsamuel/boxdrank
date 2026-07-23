import UIKit

/// Emote thumbnail cell shared by the keyboard and share extensions.
public final class EmoteCell: UICollectionViewCell {
    private let imageView = UIImageView()
    public var onLongPress: (() -> Void)?

    public override init(frame: CGRect) {
        super.init(frame: frame)
        imageView.contentMode = .scaleAspectFit
        imageView.frame = contentView.bounds.insetBy(dx: 4, dy: 4)
        imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        contentView.addSubview(imageView)
        contentView.layer.cornerRadius = 8
        contentView.backgroundColor = .secondarySystemBackground
        let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(longPressed(_:)))
        contentView.addGestureRecognizer(recognizer)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    public func configure(with emote: CachedEmote) {
        isAccessibilityElement = true
        accessibilityLabel = emote.name
        if let url = SharedStore.imageURL(for: emote), let data = try? Data(contentsOf: url) {
            imageView.image = UIImage(data: data)
        } else {
            imageView.image = nil
        }
    }

    @objc private func longPressed(_ recognizer: UILongPressGestureRecognizer) {
        if recognizer.state == .began { onLongPress?() }
    }
}
