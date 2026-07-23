import SwiftUI

/// Host app: onboarding, sync, and the honest permission explanation.
/// Pack sync (SyncService) runs here with the user's session; the keyboard
/// extension only ever reads the app-group cache.
struct ContentView: View {
    @State private var manifest = SharedStore.loadManifest()
    @State private var syncing = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Get set up") {
                    Label("Settings → General → Keyboard → Keyboards → Add Global Emotes",
                          systemImage: "keyboard")
                    Label("Full Access is NOT required — your packs sync here, the keyboard reads them offline",
                          systemImage: "lock.shield")
                    Label("The keyboard never reads or sends what you type",
                          systemImage: "checkmark.seal")
                }

                Section("Your packs") {
                    if let manifest, !manifest.emotes.isEmpty {
                        let packs = Dictionary(grouping: manifest.emotes, by: \.packId)
                        ForEach(packs.keys.sorted(), id: \.self) { packId in
                            HStack {
                                Text(packId.prefix(8))
                                Spacer()
                                Text("\(packs[packId]?.count ?? 0) emotes")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        Text("Nothing synced yet. Sign in on the web, then sync.")
                            .foregroundStyle(.secondary)
                    }
                    Button(syncing ? "Syncing…" : "Sync packs now") {
                        Task { await sync() }
                    }
                    .disabled(syncing)
                }

                if let message {
                    Section { Text(message).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Global Emotes")
        }
    }

    private func sync() async {
        syncing = true
        defer { syncing = false }
        do {
            let count = try await SyncService.syncManifest()
            manifest = SharedStore.loadManifest()
            message = "Synced \(count) emotes."
        } catch {
            message = "Sync failed: \(error.localizedDescription). Sign in at the website first."
        }
    }
}
