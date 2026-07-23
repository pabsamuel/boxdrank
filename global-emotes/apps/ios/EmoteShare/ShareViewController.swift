import UIKit
import Social

/// Share extension: pick an emote, share its full-quality variant into the
/// target app. Preserves transparency where the destination supports it.
final class ShareViewController: UIViewController {

    private var emotes: [CachedEmote] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        emotes = SharedStore.loadManifest()?.emotes ?? []

        let layout = UICollectionViewFlowLayout()
        layout.itemSize = CGSize(width: 64, height: 64)
        layout.sectionInset = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        let collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.register(EmoteCell.self, forCellWithReuseIdentifier: "emote")
        collectionView.dataSource = self
        collectionView.delegate = self
        view.addSubview(collectionView)
    }
}

extension ShareViewController: UICollectionViewDataSource, UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        emotes.count
    }

    func collectionView(
        _ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath
    ) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "emote", for: indexPath) as! EmoteCell
        cell.configure(with: emotes[indexPath.item])
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        let emote = emotes[indexPath.item]
        guard let url = SharedStore.imageURL(for: emote),
              let data = try? Data(contentsOf: url) else {
            extensionContext?.cancelRequest(withError: CocoaError(.fileNoSuchFile))
            return
        }
        let provider = NSItemProvider(item: data as NSData, typeIdentifier: "public.png")
        let item = NSExtensionItem()
        item.attachments = [provider]
        SharedStore.recordRecent(emote.id)
        extensionContext?.completeRequest(returningItems: [item])
    }
}
