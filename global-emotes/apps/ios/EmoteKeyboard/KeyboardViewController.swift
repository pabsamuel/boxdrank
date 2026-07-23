import UIKit

/// Global Emotes custom keyboard.
///
/// PRIVACY INVARIANT (master spec §4.3): this extension never reads
/// `textDocumentProxy.documentContextBeforeInput`/`AfterInput`, never logs
/// input, and — with `RequestsOpenAccess: false` — has no network capability
/// at all. It renders the app-group cache and copies/inserts tapped emotes.
///
/// Honest platform reality (§3.3): iOS cannot insert arbitrary images into
/// other apps like native emoji. Tapping an emote copies it to the pasteboard
/// and shows "Copied — paste to send". Tapping the shortcode chip inserts the
/// text shortcode via the text proxy.
final class KeyboardViewController: UIInputViewController {

    private var emotes: [CachedEmote] = []
    private var collectionView: UICollectionView!
    private let statusLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        loadCache()
        buildLayout()
    }

    private func loadCache() {
        let manifest = SharedStore.loadManifest()
        let recents = Set(manifest?.recents ?? [])
        emotes = (manifest?.emotes ?? []).sorted { a, b in
            (recents.contains(a.id) ? 0 : 1) < (recents.contains(b.id) ? 0 : 1)
        }
    }

    private func buildLayout() {
        let layout = UICollectionViewFlowLayout()
        layout.itemSize = CGSize(width: 52, height: 52)
        layout.minimumInteritemSpacing = 6
        layout.minimumLineSpacing = 6
        layout.sectionInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.register(EmoteCell.self, forCellWithReuseIdentifier: "emote")
        collectionView.dataSource = self
        collectionView.delegate = self
        collectionView.backgroundColor = .clear

        statusLabel.font = .preferredFont(forTextStyle: .footnote)
        statusLabel.textColor = .secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.text = emotes.isEmpty
            ? "Open Global Emotes and sync your packs"
            : "Tap to copy · long-press for shortcode"

        let nextKeyboardButton = UIButton(type: .system)
        nextKeyboardButton.setTitle("🌐", for: .normal)
        nextKeyboardButton.addTarget(
            self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        let footer = UIStackView(arrangedSubviews: [nextKeyboardButton, statusLabel])
        footer.axis = .horizontal
        footer.spacing = 12
        footer.alignment = .center

        let stack = UIStackView(arrangedSubviews: [collectionView, footer])
        stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.topAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            view.heightAnchor.constraint(equalToConstant: 240),
            footer.heightAnchor.constraint(equalToConstant: 32),
        ])
    }
}

extension KeyboardViewController: UICollectionViewDataSource, UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        emotes.count
    }

    func collectionView(
        _ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath
    ) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "emote", for: indexPath) as! EmoteCell
        let emote = emotes[indexPath.item]
        cell.configure(with: emote)
        cell.onLongPress = { [weak self] in
            // Shortcode insertion uses the standard text proxy — the one thing
            // a keyboard can insert everywhere.
            self?.textDocumentProxy.insertText(":\(emote.shortcode):")
        }
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        let emote = emotes[indexPath.item]
        guard let url = SharedStore.imageURL(for: emote),
              let data = try? Data(contentsOf: url) else {
            statusLabel.text = "Not synced yet — open the app"
            return
        }
        // Static → PNG pasteboard type; animated → GIF data where the target
        // app supports pasting animation.
        let type = emote.animated ? "com.compuserve.gif" : "public.png"
        UIPasteboard.general.setData(data, forPasteboardType: type)
        SharedStore.recordRecent(emote.id)
        statusLabel.text = "Copied \(emote.name) — paste to send"
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}
