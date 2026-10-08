"""The FSB5 writer behind tools/games/unity_voice.py.

Rebuilding a Unity voice bundle stands or falls on FMOD accepting the bank we
write, so the layout is pinned here byte by byte. (The round trip through FMOD
itself needs UnityPy and fmod_toolkit, which the stdlib suite does not install;
`unity_voice.py verify` does that check on every real rebuild.)
"""

from __future__ import annotations

import importlib.util
import struct
import unittest
from pathlib import Path

_PATH = Path(__file__).resolve().parent.parent / "tools" / "games" / "unity_voice.py"
_spec = importlib.util.spec_from_file_location("unity_voice", _PATH)
unity_voice = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(unity_voice)


def parse(bank: bytes) -> dict:
    magic, version, n, sh_size, names, data_size, mode = struct.unpack_from("<4sIIIIII", bank, 0)
    (word,) = struct.unpack_from("<Q", bank, 60)
    return {
        "magic": magic, "version": version, "samples": n, "sample_header": sh_size,
        "names": names, "data_size": data_size, "mode": mode,
        "more_chunks": word & 1, "rate_index": (word >> 1) & 0xF, "stereo": (word >> 5) & 1,
        "offset": ((word >> 6) & 0xFFFFFFF) * 16, "frames": word >> 34,
    }


class Fsb5Tests(unittest.TestCase):
    def test_mono_pcm16_at_a_listed_rate(self) -> None:
        pcm = struct.pack("<4h", 1, -1, 300, -300)
        bank = unity_voice.fsb5_pcm16(pcm, 24000, 1)
        h = parse(bank)
        self.assertEqual(h["magic"], b"FSB5")
        self.assertEqual(h["version"], 1)
        self.assertEqual(h["samples"], 1)
        self.assertEqual(h["mode"], 2)                    # PCM16
        self.assertEqual(h["rate_index"], 6)              # 24 kHz
        self.assertEqual(h["frames"], 4)
        self.assertEqual(h["stereo"], 0)
        self.assertEqual(h["more_chunks"], 0)
        self.assertEqual(h["sample_header"], 8)
        self.assertEqual(h["names"], 0)
        # header, sample header, then the samples, padded to 32 bytes
        self.assertEqual(bank[68:68 + len(pcm)], pcm)
        self.assertEqual(h["data_size"] % 32, 0)
        self.assertEqual(len(bank), 60 + 8 + h["data_size"])

    def test_stereo_sets_the_stereo_bit_and_counts_frames(self) -> None:
        pcm = b"\x01\x00\x02\x00" * 10                     # 10 stereo frames
        h = parse(unity_voice.fsb5_pcm16(pcm, 48000, 2))
        self.assertEqual(h["stereo"], 1)
        self.assertEqual(h["frames"], 10)
        self.assertEqual(h["rate_index"], 9)

    def test_an_unlisted_rate_travels_in_a_frequency_chunk(self) -> None:
        bank = unity_voice.fsb5_pcm16(b"\0\0" * 5, 37800, 1)
        h = parse(bank)
        self.assertEqual(h["more_chunks"], 1)
        self.assertEqual(h["rate_index"], 0)
        chunk, rate = struct.unpack_from("<II", bank, 68)
        self.assertEqual(chunk >> 25, 2)                  # FREQUENCY
        self.assertEqual((chunk >> 1) & 0xFFFFFF, 4)
        self.assertEqual(rate, 37800)
        self.assertEqual(h["sample_header"], 16)

    def test_more_than_two_channels_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            unity_voice.fsb5_pcm16(b"\0" * 12, 48000, 6)


if __name__ == "__main__":
    unittest.main()
