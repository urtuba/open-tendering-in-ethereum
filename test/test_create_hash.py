# Checks for create_hash.py. Run from the repository root:
#   python -m unittest discover -s test -v
#
# test/vectors.json holds hashes made with create_hash.py. This file checks that the
# helper still produces them, and (with the independent keccak of eth_utils) that the
# text it hashes is the text the contract hashes. test/tender.test.js checks that both
# contracts accept the same vectors, so helper and contract agree.

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import create_hash as ch  # noqa: E402
from eth_utils import keccak  # noqa: E402

VECTORS = json.loads((ROOT / "test" / "vectors.json").read_text())


def run_cli(*args):
    return subprocess.run(
        [sys.executable, "-I", str(ROOT / "create_hash.py"), *args],
        capture_output=True, text=True,
    )


def field(output, label):
    return re.search(rf"^{label}\s+(\S+)$", output, re.MULTILINE).group(1)


class KnownAnswer(unittest.TestCase):
    def test_bid_vector(self):
        v = VECTORS["bid"]
        self.assertEqual(ch.bid_hash(v["value"], v["secret"]), v["hash"])

    def test_tender_vector(self):
        v = VECTORS["tender"]
        self.assertEqual(ch.tender_hash(v["estimated"], v["minimum"], v["maximum"], v["secret"]), v["hash"])

    def test_bid_hash_is_keccak_of_value_and_secret(self):
        v = VECTORS["bid"]
        self.assertEqual(ch.bid_hash(v["value"], v["secret"]),
                         "0x" + keccak(text=v["value"] + v["secret"]).hex())

    def test_tender_hash_is_keccak_of_est_min_max_and_secret(self):
        v = VECTORS["tender"]
        text = f'{v["estimated"]}+{v["minimum"]}+{v["maximum"]}{v["secret"]}'
        self.assertEqual(ch.tender_hash(v["estimated"], v["minimum"], v["maximum"], v["secret"]),
                         "0x" + keccak(text=text).hex())

    def test_hash_is_0x_and_64_hex_digits(self):
        self.assertRegex(ch.bid_hash("1", "a"), r"^0x[0-9a-f]{64}$")


class RandomString(unittest.TestCase):
    def test_length_and_alphabet(self):
        s = ch.random_string(40)
        self.assertEqual(len(s), 40)
        self.assertRegex(s, r"^[0-9a-z]+$")

    def test_two_strings_differ(self):
        self.assertNotEqual(ch.random_string(32), ch.random_string(32))

    def test_zero_length_is_empty(self):
        self.assertEqual(ch.random_string(0), "")


class Numbers(unittest.TestCase):
    def test_plain_numbers_are_accepted(self):
        for text in ("0", "7", "1500", str(2**256 - 1)):
            self.assertEqual(ch.check_number(text, "x"), text)

    def test_other_text_is_rejected(self):
        # The contract writes numbers without leading zeros, sign or spaces, so these could never match.
        for text in ("", "007", "-1", "+1", "1.5", " 5", "5 ", "1e3", "abc", "١", str(2**256)):
            with self.assertRaises(ValueError, msg=repr(text)):
                ch.check_number(text, "x")


class CommandLine(unittest.TestCase):
    def test_bid_with_argument(self):
        r = run_cli("bid", "1500")
        self.assertEqual(r.returncode, 0, r.stderr)
        secret = field(r.stdout, "RANDOM STRING:")
        self.assertEqual(field(r.stdout, "BID:"), "1500")
        self.assertEqual(len("1500" + secret), ch.BID_SECURITY)
        self.assertEqual(field(r.stdout, "HASH:"), "0x" + keccak(text="1500" + secret).hex())

    def test_bid_from_stdin(self):
        r = subprocess.run([sys.executable, "-I", str(ROOT / "create_hash.py"), "bid"],
                           input="42\n", capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        secret = field(r.stdout, "RANDOM STRING:")
        self.assertEqual(field(r.stdout, "HASH:"), "0x" + keccak(text="42" + secret).hex())

    def test_tender_with_arguments(self):
        r = run_cli("tender", "1000", "500", "1500")
        self.assertEqual(r.returncode, 0, r.stderr)
        secret = field(r.stdout, "RANDOM STRING:")
        self.assertEqual(field(r.stdout, "ESTIMATED:"), "1000")
        self.assertEqual(field(r.stdout, "MINIMUM:"), "500")
        self.assertEqual(field(r.stdout, "MAXIMUM:"), "1500")
        self.assertEqual(len("100050015" + "00" + secret), ch.TENDER_SECURITY)
        self.assertEqual(field(r.stdout, "HASH:"), "0x" + keccak(text="1000+500+1500" + secret).hex())

    def test_a_bad_number_is_an_error(self):
        r = run_cli("bid", "007")
        self.assertEqual(r.returncode, 1)
        self.assertIn("error:", r.stderr)
        self.assertEqual(r.stdout, "")

    def test_no_mode_prints_usage(self):
        r = run_cli()
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)

    def test_wrong_number_of_arguments_prints_usage(self):
        self.assertEqual(run_cli("tender", "1", "2").returncode, 2)
        self.assertEqual(run_cli("bid", "1", "2").returncode, 2)
        self.assertEqual(run_cli("other").returncode, 2)


if __name__ == "__main__":
    unittest.main()
