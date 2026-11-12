"""Script/subtitle parsing — the customer's own text is always better than ASR."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from voxswap.errors import AssetError
from voxswap.scripts import parse_script


class ScriptParsingTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write(self, name: str, content: str) -> Path:
        path = self.tmp / name
        path.write_text(content, encoding="utf-8")
        return path

    def test_srt_timings_and_speakers(self) -> None:
        path = self._write("a.srt",
            "1\n00:00:01,000 --> 00:00:03,500\nHERO: Get down!\n\n"
            "2\n00:01:02,250 --> 00:01:04,000\nJust breathing.\n")
        lines = parse_script(path)
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0].start_ms, 1000)
        self.assertEqual(lines[0].end_ms, 3500)
        self.assertEqual(lines[0].speaker, "Hero")
        self.assertEqual(lines[0].text, "Get down!")
        self.assertEqual(lines[1].start_ms, 62250)
        self.assertEqual(lines[1].speaker, "")

    def test_srt_strips_markup_and_joins_wrapped_lines(self) -> None:
        path = self._write("b.srt",
            "1\n00:00:01,000 --> 00:00:04,000\n<i>We are not</i>\ngoing back.\n")
        lines = parse_script(path)
        self.assertEqual(lines[0].text, "We are not going back.")

    def test_srt_dash_cue_becomes_two_lines(self) -> None:
        """'- A\\n- B' is two characters in one cue; dubbing them as one line
        would put both voices in one mouth."""
        path = self._write("c.srt",
            "1\n00:00:02,000 --> 00:00:06,000\n- Is it done?\n- It is done.\n")
        lines = parse_script(path)
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0].text, "Is it done?")
        self.assertEqual(lines[1].text, "It is done.")
        self.assertGreater(lines[1].start_ms, lines[0].start_ms)

    def test_vtt_with_dot_timestamps(self) -> None:
        path = self._write("d.vtt", "WEBVTT\n\n00:00:05.500 --> 00:00:07.000\nHold the line.\n")
        lines = parse_script(path)
        self.assertEqual(lines[0].start_ms, 5500)
        self.assertEqual(lines[0].text, "Hold the line.")

    def test_csv_with_alias_columns(self) -> None:
        path = self._write("e.csv", "filename,character,dialogue\nv_01.wav,V,\"Wake up, samurai.\"\n")
        lines = parse_script(path)
        self.assertEqual(lines[0].file_hint, "v_01.wav")
        self.assertEqual(lines[0].speaker, "V")
        self.assertEqual(lines[0].text, "Wake up, samurai.")

    def test_csv_with_semicolons(self) -> None:
        path = self._write("f.csv", "file;speaker;text\na.wav;Hero;Move out\nb.wav;Hero;Now\n")
        lines = parse_script(path)
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[1].text, "Now")

    def test_csv_timecodes_and_seconds_both_work(self) -> None:
        path = self._write("g.csv", "file,text,start,end\na.wav,Hi,00:00:02.500,00:00:04.000\n")
        lines = parse_script(path)
        self.assertEqual(lines[0].start_ms, 2500)
        self.assertEqual(lines[0].end_ms, 4000)

    def test_json_array_and_wrapped_object(self) -> None:
        flat = self._write("h.json", json.dumps([{"file": "a.wav", "speaker": "V", "text": "Hello"}]))
        wrapped = self._write("i.json", json.dumps({"lines": [{"file": "a.wav", "text": "Hello"}]}))
        self.assertEqual(parse_script(flat)[0].speaker, "V")
        self.assertEqual(parse_script(wrapped)[0].text, "Hello")

    def test_unsupported_format_is_a_clear_error(self) -> None:
        path = self._write("j.docx", "nope")
        with self.assertRaises(AssetError) as caught:
            parse_script(path)
        self.assertIn("Supported", caught.exception.hint)

    def test_table_without_text_column_is_rejected(self) -> None:
        path = self._write("k.csv", "file,speaker\na.wav,V\n")
        with self.assertRaises(AssetError):
            parse_script(path)


if __name__ == "__main__":
    unittest.main()
