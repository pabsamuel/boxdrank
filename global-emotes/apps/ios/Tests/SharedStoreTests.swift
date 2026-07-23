import XCTest

/// Unit tests for the shared cache model. Run via the GlobalEmotesTests scheme
/// after `xcodegen generate` (add a unit-test target when opening the project;
/// documented in apps/ios/README.md).
final class SharedStoreTests: XCTestCase {

    func testManifestRoundTrip() throws {
        let manifest = CachedManifest(
            cursor: "123",
            emotes: [
                CachedEmote(
                    id: "e1", shortcode: "hype", name: "Hype", animated: false,
                    contentHash: "abc", packId: "p1", fileName: "abc-kb.webp"),
            ],
            recents: ["e1"])
        let data = try JSONEncoder().encode(manifest)
        let decoded = try JSONDecoder().decode(CachedManifest.self, from: data)
        XCTAssertEqual(decoded, manifest)
    }

    func testManifestToleratesUnknownFieldsFromNewerServers() throws {
        let json = """
        {"cursor":"1","emotes":[{"id":"e","shortcode":"s","name":"n","animated":true,
        "contentHash":"h","packId":"p","fileName":"f","futureField":123}],"recents":[]}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(CachedManifest.self, from: json)
        XCTAssertEqual(decoded.emotes.first?.animated, true)
    }
}
