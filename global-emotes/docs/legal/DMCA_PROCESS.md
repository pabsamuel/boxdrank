# Copyright / DMCA-style Reporting Process — DRAFT

> **DRAFT — requires qualified legal review; register a designated agent where applicable.**

**Report** (in-product `POST /v1/public/reports` category `copyright`, or [CONTACT]): identify the work, the infringing material (pack/emote URL), your contact info, a good-faith statement, a statement of accuracy under penalty of perjury, and signature. Stored in `copyright_reports` with a moderation case.

**Our action**: prompt review; on a valid notice we remove the material from new distribution (emote `takedown` status → excluded from all manifests; clients tombstone on next sync) and notify the uploader with the notice.

**Counter-notice**: uploader may respond with identification of the removed material, a good-faith statement of mistake, consent to jurisdiction, and signature. We forward it to the claimant; absent court action within 10–14 business days, we may reinstate.

**Repeat infringers**: strikes tracked per account; termination per policy. **Abuse**: knowingly false notices may incur liability; report flooding is rate-limited and may be actioned.
