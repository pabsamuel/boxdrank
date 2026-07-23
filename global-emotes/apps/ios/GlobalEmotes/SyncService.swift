import Foundation

/// Downloads /v1/sync/manifest with the app's session cookie and materializes
/// keyboard/share variants into the app-group container. Content-addressed
/// filenames make re-syncs cheap.
enum SyncService {
    struct ManifestResponse: Codable {
        struct Pack: Codable {
            struct Emote: Codable {
                let id: String
                let shortcode: String
                let name: String
                let animated: Bool
                let keyboardUrl: String
                let shareUrl: String
                let contentHash: String
            }
            let packId: String
            let emotes: [Emote]
        }
        let cursor: String
        let packs: [Pack]
    }

    static var apiBaseURL = URL(string: "http://localhost:3001")!

    static func syncManifest() async throws -> Int {
        let url = apiBaseURL.appendingPathComponent("v1/sync/manifest")
        // Session cookie comes from ASWebAuthenticationSession login (stored in
        // the shared cookie jar); local dev can inject one manually.
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.userAuthenticationRequired)
        }
        let manifest = try JSONDecoder().decode(ManifestResponse.self, from: data)

        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: SharedStore.appGroupId) else {
            throw URLError(.fileDoesNotExist)
        }
        let emoteDir = container.appendingPathComponent("emotes")
        try FileManager.default.createDirectory(at: emoteDir, withIntermediateDirectories: true)

        var cached: [CachedEmote] = []
        for pack in manifest.packs {
            for emote in pack.emotes {
                let fileName = "\(emote.contentHash)-kb.webp"
                let target = emoteDir.appendingPathComponent(fileName)
                if !FileManager.default.fileExists(atPath: target.path),
                   let remote = URL(string: emote.keyboardUrl) {
                    let (bytes, _) = try await URLSession.shared.data(from: remote)
                    try bytes.write(to: target, options: .atomic)
                }
                cached.append(CachedEmote(
                    id: emote.id,
                    shortcode: emote.shortcode,
                    name: emote.name,
                    animated: emote.animated,
                    contentHash: emote.contentHash,
                    packId: pack.packId,
                    fileName: fileName))
            }
        }
        let previousRecents = SharedStore.loadManifest()?.recents ?? []
        try SharedStore.saveManifest(
            CachedManifest(cursor: manifest.cursor, emotes: cached, recents: previousRecents))
        return cached.count
    }
}
