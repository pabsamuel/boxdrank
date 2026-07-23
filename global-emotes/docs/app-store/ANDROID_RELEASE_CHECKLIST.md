# Google Play release checklist

- [ ] Owner Play Console account; application id finalized (`gradle.properties: appId`)
- [ ] App signing by Google Play enrolled; upload key in owner vault
- [ ] Data safety form: email (account), install id, allowlisted usage events; **no keyboard input collected**; data encrypted in transit; deletion available
- [ ] IME declaration: Play policy requires prominent disclosure for keyboards — the in-app privacy explainer (`MainActivity`) and keyboard-privacy web page satisfy the disclosure; link both in the listing
- [ ] Target API level current (targetSdk 35) ✓
- [ ] Internal testing track first: sideload matrix devices, complete `docs/COMPATIBILITY_MATRIX.md`
- [ ] Store listing honest: "works across supported apps" phrasing, never "works everywhere"
- [ ] Icons/feature graphic (owner brand), screenshots incl. the fallback toast
- [ ] Pre-launch report reviewed (Play's automated device sweep)
