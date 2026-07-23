import Foundation

/// Emote metadata cached in the app group, written by the host app's sync and
/// read by the keyboard + share extensions. Content-addressed image files live
/// beside it, so extensions work fully offline and without Full Access.
public struct CachedEmote: Codable, Identifiable, Equatable {
    public let id: String
    public let shortcode: String
    public let name: String
    public let animated: Bool
    public let contentHash: String
    public let packId: String
    public let fileName: String
}

public struct CachedManifest: Codable, Equatable {
    public var cursor: String
    public var emotes: [CachedEmote]
    public var recents: [String]

    public init(cursor: String, emotes: [CachedEmote], recents: [String] = []) {
        self.cursor = cursor
        self.emotes = emotes
        self.recents = recents
    }
}

public enum SharedStore {
    public static let appGroupId = "group.app.globalemotes.shared"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    }

    static var manifestURL: URL? {
        containerURL?.appendingPathComponent("emotes/manifest.json")
    }

    public static func loadManifest() -> CachedManifest? {
        guard let url = manifestURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(CachedManifest.self, from: data)
    }

    public static func saveManifest(_ manifest: CachedManifest) throws {
        guard let url = manifestURL else { throw CocoaError(.fileNoSuchFile) }
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(manifest)
        try data.write(to: url, options: .atomic)
    }

    public static func imageURL(for emote: CachedEmote) -> URL? {
        containerURL?.appendingPathComponent("emotes/\(emote.fileName)")
    }

    public static func recordRecent(_ emoteId: String) {
        guard var manifest = loadManifest() else { return }
        manifest.recents = ([emoteId] + manifest.recents.filter { $0 != emoteId }).prefix(30).map { $0 }
        try? saveManifest(manifest)
    }
}
