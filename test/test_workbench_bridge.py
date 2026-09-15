"""Unit tests for the WorkBuddy JSONL bridge."""

import json
import subprocess
import sys
import unittest

from instaloader.workbench_bridge import BridgeError, normalize_download_request


class TestWorkbenchBridgeValidation(unittest.TestCase):

    def test_empty_targets_are_rejected(self):
        with self.assertRaises(BridgeError) as error:
            normalize_download_request({"targets": []})
        self.assertEqual(error.exception.code, "INVALID_REQUEST")

    def test_feed_requires_authenticated_mode(self):
        with self.assertRaises(BridgeError) as error:
            normalize_download_request({
                "targets": [{"type": "feed", "value": ":feed"}],
                "auth": {"mode": "anonymous"},
            })
        self.assertEqual(error.exception.code, "AUTH_REQUIRED")

    def test_login_required_content_is_rejected_for_anonymous_mode(self):
        for option in ("stories", "highlights", "comments", "geotags"):
            with self.subTest(option=option):
                with self.assertRaises(BridgeError) as error:
                    normalize_download_request({
                        "targets": [{"type": "profile", "value": "instagram"}],
                        "content": {option: True},
                        "auth": {"mode": "anonymous"},
                    })
                self.assertEqual(error.exception.code, "AUTH_REQUIRED")

    def test_valid_profile_request_is_normalized_with_safe_defaults(self):
        request = normalize_download_request({
            "targets": [{"type": "profile", "value": "instagram"}],
            "auth": {
                "mode": "anonymous",
                "password": "must-not-survive",
                "cookie": "must-not-survive",
            },
        })
        self.assertEqual(request["targets"], [{"type": "profile", "value": "instagram"}])
        self.assertTrue(request["content"]["profilePic"])
        self.assertTrue(request["content"]["posts"])
        self.assertTrue(request["content"]["captions"])
        self.assertTrue(request["content"]["metadataJson"])
        self.assertEqual(request["output"]["dirnamePattern"], "{target}")
        self.assertEqual(request["output"]["filenamePattern"], "{date_utc}_UTC")
        self.assertTrue(request["output"]["sanitizePaths"])
        self.assertTrue(request["output"]["resume"])
        self.assertEqual(request["auth"], {
            "mode": "anonymous",
            "username": None,
            "sessionFile": None,
            "browser": None,
            "cookieFile": None,
        })
        self.assertNotIn("password", json.dumps(request).lower())
        self.assertNotIn("must-not-survive", json.dumps(request))

    def test_target_values_are_canonicalized(self):
        request = normalize_download_request({
            "targets": [
                {"type": "hashtag", "value": "#kitten"},
                {"type": "shortcode", "value": "-ABC_123"},
                {"type": "stories", "value": ""},
            ],
            "auth": {"mode": "session", "username": "tester"},
        })
        self.assertEqual(request["targets"], [
            {"type": "hashtag", "value": "kitten"},
            {"type": "shortcode", "value": "ABC_123"},
            {"type": "stories", "value": ":stories"},
        ])

    def test_invalid_target_type_is_rejected(self):
        with self.assertRaises(BridgeError) as error:
            normalize_download_request({
                "targets": [{"type": "location", "value": "123"}],
                "auth": {"mode": "anonymous"},
            })
        self.assertEqual(error.exception.code, "INVALID_REQUEST")


class TestWorkbenchBridgeProtocol(unittest.TestCase):

    @staticmethod
    def run_bridge(payload):
        process = subprocess.run(
            [sys.executable, "-m", "instaloader.workbench_bridge"],
            input=payload,
            text=True,
            capture_output=True,
            check=False,
        )
        events = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
        return process, events

    def test_validate_command_returns_completed_event(self):
        process, events = self.run_bridge(json.dumps({
            "command": "validate",
            "request": {
                "targets": [{"type": "profile", "value": "instagram"}],
                "auth": {"mode": "anonymous"},
            },
        }))
        self.assertEqual(process.returncode, 0)
        self.assertEqual(events[-1]["event"], "completed")
        self.assertEqual(events[-1]["data"]["request"]["targets"][0]["type"], "profile")

    def test_malformed_json_returns_safe_invalid_request_event(self):
        process, events = self.run_bridge("{not-json")
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(events[-1]["event"], "failed")
        self.assertEqual(events[-1]["data"]["code"], "INVALID_REQUEST")
        self.assertNotIn("traceback", events[-1]["data"]["message"].lower())


if __name__ == "__main__":
    unittest.main()
