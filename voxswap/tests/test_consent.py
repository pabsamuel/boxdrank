"""The consent gate is the one thing that must never regress."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from tests.helpers import consent_record, days_from_now, make_config, make_game_order
from voxswap.consent import phrase_for, record_revocation, verify_order
from voxswap.errors import ConsentError
from voxswap.models import Order


class ConsentTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.cfg = make_config(self.tmp)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _order(self, **consent_overrides) -> Order:
        order_dir = make_game_order(self.cfg)
        if consent_overrides:
            data = json.loads((order_dir / "order.json").read_text())
            data["consents"] = [consent_record(**consent_overrides)]
            (order_dir / "order.json").write_text(json.dumps(data), encoding="utf-8")
        return Order.load(order_dir)

    def test_valid_consent_passes(self) -> None:
        checks = verify_order(self._order())
        self.assertEqual(len(checks), 1)
        self.assertTrue(checks[0].ok)
        self.assertGreater(checks[0].sample_seconds, 0)

    def test_a_third_party_voice_must_be_spoken_for(self) -> None:
        """The phrase exists to stop "I downloaded my ex's voice notes", and that
        threat is entirely about someone else's voice."""
        order = self._order(is_self=False, person_name="Partner",
                            person_email="partner@example.com")
        (order.root / "consent" / "C-1-phrase.wav").unlink()

        with self.assertRaises(ConsentError) as caught:
            verify_order(order)
        self.assertIn("verification phrase", caught.exception.message)
        self.assertIn("not the ordering customer", caught.exception.hint)

    def test_the_customers_own_voice_needs_no_phrase(self) -> None:
        """They hold the account, they paid, they signed the declaration, and the
        samples are theirs to give. A retake per order buys nothing here."""
        order = self._order()
        (order.root / "consent" / "C-1-phrase.wav").unlink()

        checks = verify_order(order)
        self.assertTrue(checks[0].ok)

    def test_a_phrase_that_was_promised_and_is_missing_is_flagged(self) -> None:
        """Silently ignoring a broken path would hide a lost recording."""
        order = self._order()
        (order.root / "consent" / "C-1-phrase.wav").unlink()

        checks = verify_order(order)
        self.assertTrue(any("does not exist" in w for w in checks[0].warnings), checks[0].warnings)

    def test_a_phrase_supplied_anyway_is_still_checked(self) -> None:
        """Opting in must not mean opting out of the length check."""
        from voxswap.audio import tone, write_wav

        order = self._order()
        write_wav(order.root / "consent" / "C-1-phrase.wav", tone(900, sample_rate=8000))
        with self.assertRaises(ConsentError):
            verify_order(order)

    def test_short_phrase_recording_is_refused(self) -> None:
        order = self._order()
        from voxswap.audio import tone, write_wav

        write_wav(order.root / "consent" / "C-1-phrase.wav", tone(900, sample_rate=8000))
        with self.assertRaises(ConsentError):
            verify_order(order)

    def test_missing_signature_is_refused(self) -> None:
        order = self._order()
        (order.root / "consent" / "C-1-signed.md").unlink()
        with self.assertRaises(ConsentError) as caught:
            verify_order(order)
        self.assertIn("signed consent document missing", caught.exception.message)

    def test_revoked_consent_is_refused(self) -> None:
        with self.assertRaises(ConsentError) as caught:
            verify_order(self._order(revoked=True, revoked_reason="changed their mind"))
        self.assertIn("revoked", caught.exception.message)

    def test_expired_consent_is_refused(self) -> None:
        with self.assertRaises(ConsentError):
            verify_order(self._order(expires_at=days_from_now(-1)))

    def test_future_dated_consent_is_refused(self) -> None:
        with self.assertRaises(ConsentError):
            verify_order(self._order(signed_at=days_from_now(3)))

    def test_scope_must_cover_cloning(self) -> None:
        with self.assertRaises(ConsentError):
            verify_order(self._order(scope=["personal_use"]))

    def test_third_party_cannot_reuse_the_customer_address(self) -> None:
        """Someone else's voice needs their own contact route, or withdrawal
        would have to go through the person who ordered the clone."""
        with self.assertRaises(ConsentError) as caught:
            verify_order(self._order(is_self=False, person_name="Partner",
                                     person_email="customer@example.com"))
        self.assertIn("customer's email", caught.exception.message)

    def test_third_party_with_own_address_passes_with_a_warning(self) -> None:
        checks = verify_order(self._order(is_self=False, person_name="Partner",
                                          person_email="partner@example.com"))
        self.assertTrue(checks[0].ok)
        self.assertTrue(any("not the ordering customer" in w for w in checks[0].warnings))

    def test_phrase_is_order_specific(self) -> None:
        order = self._order()
        phrase = phrase_for(order, order.consents[0])
        self.assertIn(order.order_id, phrase)
        self.assertIn("Test Customer", phrase)

    def test_the_phrase_carries_a_date_a_person_would_say(self) -> None:
        """`2026-09-20` gets stumbled over and re-recorded; `20 September 2026` does not."""
        order = self._order()
        phrase = phrase_for(order, order.consents[0])
        today = date.today()
        self.assertNotIn(today.isoformat(), phrase)
        self.assertIn(str(today.day), phrase)
        self.assertIn(str(today.year), phrase)

    def test_it_is_spoken_in_the_customers_own_language(self) -> None:
        """A Turkish customer reading an English legal sentence records it worse
        and understands less of what they just agreed to."""
        order = self._order()
        consent = order.consents[0]

        turkish = phrase_for(order, consent, language="tr")
        self.assertIn("sesimi kullanma izni", turkish)
        self.assertIn(order.order_id, turkish)
        self.assertIn("Test Customer", turkish)
        self.assertTrue(any(m in turkish for m in
                            ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz",
                             "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")), turkish)

        # A language nobody wrote a phrase for falls back rather than failing.
        self.assertEqual(phrase_for(order, consent, language="xx"),
                         phrase_for(order, consent, language="en"))

    def test_the_phrase_stays_short_enough_to_read_in_one_go(self) -> None:
        """Every extra clause is another retake. The terms live in the signed
        document; the recording only has to be specific and live."""
        order = self._order()
        for language in ("en", "tr"):
            phrase = phrase_for(order, order.consents[0], language=language)
            self.assertLess(len(phrase.split()), 26, f"{language}: {phrase}")

    def test_revocation_is_written_and_audited(self) -> None:
        order = self._order()
        record_revocation(order.root, "C-1", "asked by email")
        reloaded = Order.load(order.root)
        self.assertTrue(reloaded.consents[0].revoked)
        self.assertIn("REVOKED", (order.root / "consent-audit.log").read_text())
        with self.assertRaises(ConsentError):
            verify_order(reloaded)


if __name__ == "__main__":
    unittest.main()
