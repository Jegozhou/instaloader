"""Unit tests for the WorkBuddy JSONL bridge."""

import json
import subprocess
import sys
import unittest
from unittest.mock import patch

from instaloader.exceptions import ProfileNotExistsException
from instaloader.workbench_bridge import (BridgeError, check_account_status, execute_download,
                                          normalize_download_request)


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

    def test_hashtag_requires_authenticated_mode(self):
        with self.assertRaises(BridgeError) as error:
            normalize_download_request({
                "targets": [{"type": "hashtag", "value": "#kitten"}],
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


class FakeContext:
    def __init__(self):
        self.is_logged_in = False
        self.username = None

    def update_cookies(self, cookies):
        del cookies


class FakeLoader:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.context = FakeContext()
        self.calls = []
        FakeLoader.instances.append(self)

    def load_session_from_file(self, username, filename=None):
        if filename == "missing":
            raise FileNotFoundError(filename)
        self.context.is_logged_in = True
        self.context.username = username
        self.calls.append(("load_session_from_file", username, filename))

    def test_login(self):
        return self.context.username if self.context.is_logged_in else None

    def close(self):
        self.calls.append(("close",))

    def check_profile_id(self, username, latest_stamps=None):
        profile = object()
        self.calls.append(("check_profile_id", username, latest_stamps, profile))
        return profile

    def download_profiles(self, *args, **kwargs):
        self.calls.append(("download_profiles", args, kwargs))

    def download_hashtag(self, *args, **kwargs):
        self.calls.append(("download_hashtag", args, kwargs))

    def download_post(self, *args, **kwargs):
        self.calls.append(("download_post", args, kwargs))

    def download_feed_posts(self, *args, **kwargs):
        self.calls.append(("download_feed_posts", args, kwargs))

    def download_stories(self, *args, **kwargs):
        self.calls.append(("download_stories", args, kwargs))

    def download_saved_posts(self, *args, **kwargs):
        self.calls.append(("download_saved_posts", args, kwargs))


class MissingProfileLoader(FakeLoader):
    def check_profile_id(self, username, latest_stamps=None):
        del latest_stamps
        raise ProfileNotExistsException("{} not found".format(username))


class TestWorkbenchBridgeAuthentication(unittest.TestCase):

    def setUp(self):
        FakeLoader.instances = []

    def test_anonymous_account_status_is_safe(self):
        status = check_account_status({"mode": "anonymous"}, loader_factory=FakeLoader)
        self.assertEqual(status, {
            "authenticated": False,
            "username": None,
            "authMode": "anonymous",
            "message": "Anonymous mode",
        })

    def test_missing_session_file_is_auth_failed(self):
        with self.assertRaises(BridgeError) as error:
            check_account_status({
                "mode": "session",
                "username": "tester",
                "sessionFile": "missing",
            }, loader_factory=FakeLoader)
        self.assertEqual(error.exception.code, "AUTH_FAILED")

    def test_session_status_returns_no_session_material(self):
        status = check_account_status({
            "mode": "session",
            "username": "tester",
            "sessionFile": "/private/session-tester",
        }, loader_factory=FakeLoader)
        self.assertEqual(status["authenticated"], True)
        self.assertEqual(status["username"], "tester")
        self.assertEqual(status["authMode"], "session")
        self.assertEqual(set(status), {"authenticated", "username", "authMode", "message"})

    def test_browser_mode_without_optional_dependency_is_auth_failed(self):
        with patch("instaloader.workbench_bridge.bc3_library", False):
            with self.assertRaises(BridgeError) as error:
                check_account_status({
                    "mode": "browser",
                    "browser": "firefox",
                }, loader_factory=FakeLoader)
        self.assertEqual(error.exception.code, "AUTH_FAILED")


class TestWorkbenchBridgeExecution(unittest.TestCase):

    def setUp(self):
        FakeLoader.instances = []

    def test_profile_request_maps_options_and_emits_stages(self):
        request = {
            "targets": [{"type": "profile", "value": "instagram"}],
            "content": {
                "comments": True,
                "geotags": True,
                "captions": False,
                "metadataJson": False,
            },
            "output": {
                "directory": "/tmp/downloads",
                "sanitizePaths": True,
                "resume": False,
            },
            "auth": {"mode": "session", "username": "tester"},
        }
        events = []

        result = execute_download(
            request,
            loader_factory=FakeLoader,
            event_sink=lambda event, data: events.append((event, data)),
        )

        loader = FakeLoader.instances[-1]
        self.assertTrue(loader.kwargs["download_comments"])
        self.assertTrue(loader.kwargs["download_geotags"])
        self.assertFalse(loader.kwargs["save_metadata"])
        self.assertEqual(loader.kwargs["post_metadata_txt_pattern"], "")
        self.assertIsNone(loader.kwargs["resume_prefix"])
        self.assertTrue(loader.kwargs["sanitize_paths"])
        self.assertTrue(loader.kwargs["dirname_pattern"].endswith("{target}"))
        profile_call = next(call for call in loader.calls if call[0] == "download_profiles")
        self.assertTrue(profile_call[2]["raise_errors"])
        stages = [data["stage"] for event, data in events if event == "progress"]
        self.assertEqual(stages, ["准备任务", "验证身份", "解析目标", "下载中", "保存元数据", "完成"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["targetsCompleted"], 1)

    def test_each_non_profile_target_routes_to_existing_loader_method(self):
        cases = [
            ("hashtag", "#kitten", "download_hashtag"),
            ("shortcode", "-ABC123", "download_post"),
            ("feed", ":feed", "download_feed_posts"),
            ("stories", ":stories", "download_stories"),
            ("saved", ":saved", "download_saved_posts"),
        ]
        for target_type, value, expected_method in cases:
            with self.subTest(target_type=target_type):
                FakeLoader.instances = []
                auth = {"mode": "anonymous"}
                if target_type in ("hashtag", "feed", "stories", "saved"):
                    auth = {"mode": "session", "username": "tester"}
                request = {
                    "targets": [{"type": target_type, "value": value}],
                    "auth": auth,
                }
                with patch("instaloader.workbench_bridge.Post.from_shortcode", return_value=object()):
                    execute_download(request, loader_factory=FakeLoader)
                loader = FakeLoader.instances[-1]
                self.assertTrue(any(call[0] == expected_method for call in loader.calls))

    def test_profile_not_found_maps_to_stable_error_code(self):
        request = {
            "targets": [{"type": "profile", "value": "missingprofile"}],
            "auth": {"mode": "anonymous"},
        }
        with self.assertRaises(BridgeError) as error:
            execute_download(request, loader_factory=MissingProfileLoader)
        self.assertEqual(error.exception.code, "TARGET_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
