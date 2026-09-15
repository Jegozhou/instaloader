"""Regression tests for WorkBuddy bridge compatibility with Instaloader 4.15.x."""

import os
import unittest

from instaloader.workbench_bridge import BridgeError, execute_download, normalize_download_request


class FakeContext:
    def __init__(self):
        self.is_logged_in = False
        self.username = None


class FakeProfileLoader:
    instances = []
    profile = object()

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.context = FakeContext()
        self.calls = []
        self.__class__.instances.append(self)

    def close(self):
        self.calls.append(("close",))

    def check_profile_id(self, username, latest_stamps=None):
        self.calls.append(("check_profile_id", username, latest_stamps))
        return self.profile

    def download_profiles(self, profiles, **kwargs):
        self.calls.append(("download_profiles", profiles, kwargs))


class TestBridgeInstaloaderCompatibility(unittest.TestCase):

    def setUp(self):
        FakeProfileLoader.instances = []

    def test_hashtag_requires_authenticated_mode_on_instaloader_4_15(self):
        with self.assertRaises(BridgeError) as error:
            normalize_download_request({
                "targets": [{"type": "hashtag", "value": "#kitten"}],
                "auth": {"mode": "anonymous"},
            })
        self.assertEqual(error.exception.code, "AUTH_REQUIRED")

    def test_profile_route_uses_check_profile_id_and_forwards_count_and_errors(self):
        request = {
            "targets": [{"type": "profile", "value": "instagram"}],
            "filters": {"maxCount": 7},
            "content": {"reels": True},
            "auth": {"mode": "anonymous"},
        }

        result = execute_download(request, loader_factory=FakeProfileLoader)

        self.assertEqual(result["status"], "completed")
        loader = FakeProfileLoader.instances[-1]
        check_call = next(call for call in loader.calls if call[0] == "check_profile_id")
        self.assertEqual(check_call[1], "instagram")
        download_call = next(call for call in loader.calls if call[0] == "download_profiles")
        self.assertEqual(download_call[1], {FakeProfileLoader.profile})
        self.assertEqual(download_call[2]["max_count"], 7)
        self.assertTrue(download_call[2]["raise_errors"])
        self.assertTrue(download_call[2]["reels"])

    def test_result_reports_runtime_directory_when_output_directory_is_not_explicit(self):
        result = execute_download({
            "targets": [{"type": "profile", "value": "instagram"}],
            "auth": {"mode": "anonymous"},
        }, loader_factory=FakeProfileLoader)
        self.assertEqual(result["outputDirectory"], os.getcwd())


if __name__ == "__main__":
    unittest.main()
