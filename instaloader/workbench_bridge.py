"""Structured JSONL bridge between WorkBuddy and the Instaloader Python API."""

import json
import os
import re
import sys
import uuid
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Any, Callable, Dict, IO, Optional

from .__main__ import bc3_library, filterstr_to_filterfunc, import_session
from .exceptions import (AbortDownloadException, ConnectionException, InstaloaderException, InvalidArgumentException,
                         LoginException, LoginRequiredException, PrivateProfileNotFollowedException,
                         ProfileNotExistsException, TooManyRequestsException)
from .instaloader import Instaloader
from .lateststamps import LatestStamps
from .structures import Post, StoryItem


SUPPORTED_TARGET_TYPES = {"profile", "hashtag", "shortcode", "feed", "stories", "saved"}
SUPPORTED_AUTH_MODES = {"anonymous", "session", "browser"}
LOGIN_REQUIRED_TARGETS = {"hashtag", "feed", "stories", "saved"}
LOGIN_REQUIRED_CONTENT = {"stories", "highlights", "comments", "geotags"}

CONTENT_DEFAULTS = {
    "profilePic": True,
    "posts": True,
    "stories": False,
    "highlights": False,
    "tagged": False,
    "reels": False,
    "igtv": False,
    "comments": False,
    "geotags": False,
    "captions": True,
    "metadataJson": True,
}
FILTER_DEFAULTS = {
    "fastUpdate": False,
    "latestStampsFile": None,
    "maxCount": None,
    "postFilter": None,
    "storyItemFilter": None,
}
OUTPUT_DEFAULTS = {
    "directory": None,
    "dirnamePattern": "{target}",
    "filenamePattern": "{date_utc}_UTC",
    "sanitizePaths": True,
    "resume": True,
}
AUTH_DEFAULTS = {
    "mode": "anonymous",
    "username": None,
    "sessionFile": None,
    "browser": None,
    "cookieFile": None,
}

_PROFILE_RE = re.compile(r"^[A-Za-z0-9._]+$")
_HASHTAG_RE = re.compile(r"^\w+$", re.UNICODE)
_SHORTCODE_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class BridgeError(Exception):
    """Expected, safe error surfaced through the WorkBuddy bridge."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _require_mapping(value: Any, field: str) -> Dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise BridgeError("INVALID_REQUEST", "{} must be an object.".format(field))
    return value


def _merge_known(defaults: Dict[str, Any], supplied: Any, field: str) -> Dict[str, Any]:
    values = _require_mapping(supplied, field)
    return {key: values.get(key, default) for key, default in defaults.items()}


def _normalize_target(target: Any) -> Dict[str, str]:
    if not isinstance(target, dict):
        raise BridgeError("INVALID_REQUEST", "Each target must be an object.")
    target_type = target.get("type")
    if target_type not in SUPPORTED_TARGET_TYPES:
        raise BridgeError("INVALID_REQUEST", "Unsupported target type.")
    raw_value = target.get("value", "")
    if raw_value is None:
        raw_value = ""
    if not isinstance(raw_value, str):
        raise BridgeError("INVALID_REQUEST", "Target value must be text.")
    value = raw_value.strip()

    if target_type == "profile":
        if not value or not _PROFILE_RE.fullmatch(value):
            raise BridgeError("INVALID_REQUEST", "Invalid Instagram profile target.")
    elif target_type == "hashtag":
        value = value.lstrip("#")
        if not value or not _HASHTAG_RE.fullmatch(value):
            raise BridgeError("INVALID_REQUEST", "Invalid hashtag target.")
    elif target_type == "shortcode":
        value = value.lstrip("-")
        if not value or not _SHORTCODE_RE.fullmatch(value):
            raise BridgeError("INVALID_REQUEST", "Invalid shortcode target.")
    else:
        value = ":" + target_type
    return {"type": target_type, "value": value}


def _validate_boolean_options(values: Dict[str, Any], defaults: Dict[str, Any], field: str) -> None:
    for key, default in defaults.items():
        if isinstance(default, bool) and not isinstance(values[key], bool):
            raise BridgeError("INVALID_REQUEST", "{}.{} must be true or false.".format(field, key))


def _validate_nullable_text(value: Any, field: str) -> None:
    if value is not None and not isinstance(value, str):
        raise BridgeError("INVALID_REQUEST", "{} must be text or null.".format(field))


def _normalize_auth(auth_input: Any) -> Dict[str, Any]:
    auth = _merge_known(AUTH_DEFAULTS, auth_input, "auth")
    if auth["mode"] not in SUPPORTED_AUTH_MODES:
        raise BridgeError("INVALID_REQUEST", "Unsupported authentication mode.")
    for key in ("username", "sessionFile", "browser", "cookieFile"):
        _validate_nullable_text(auth[key], "auth.{}".format(key))
    if auth["mode"] == "session" and not auth["username"]:
        raise BridgeError("INVALID_REQUEST", "Session authentication requires a username.")
    if auth["mode"] == "browser" and not auth["browser"]:
        raise BridgeError("INVALID_REQUEST", "Browser authentication requires a browser name.")
    return auth


def normalize_download_request(request: Any) -> Dict[str, Any]:
    """Validate and canonicalize a WorkBuddy download request without side effects."""
    if not isinstance(request, dict):
        raise BridgeError("INVALID_REQUEST", "request must be an object.")

    raw_targets = request.get("targets")
    if not isinstance(raw_targets, list) or not raw_targets:
        raise BridgeError("INVALID_REQUEST", "At least one download target is required.")
    targets = [_normalize_target(target) for target in raw_targets]

    content = _merge_known(CONTENT_DEFAULTS, request.get("content"), "content")
    filters = _merge_known(FILTER_DEFAULTS, request.get("filters"), "filters")
    output = _merge_known(OUTPUT_DEFAULTS, request.get("output"), "output")
    auth = _normalize_auth(request.get("auth"))

    _validate_boolean_options(content, CONTENT_DEFAULTS, "content")
    _validate_boolean_options(filters, FILTER_DEFAULTS, "filters")
    _validate_boolean_options(output, OUTPUT_DEFAULTS, "output")

    for key in ("latestStampsFile", "postFilter", "storyItemFilter"):
        _validate_nullable_text(filters[key], "filters.{}".format(key))
    if filters["maxCount"] is not None:
        if (isinstance(filters["maxCount"], bool) or not isinstance(filters["maxCount"], int)
                or filters["maxCount"] <= 0):
            raise BridgeError("INVALID_REQUEST", "filters.maxCount must be a positive integer or null.")

    for key in ("directory", "dirnamePattern", "filenamePattern"):
        _validate_nullable_text(output[key], "output.{}".format(key))
    if not output["dirnamePattern"] or not output["filenamePattern"]:
        raise BridgeError("INVALID_REQUEST", "Output naming patterns cannot be empty.")

    requires_login = (any(target["type"] in LOGIN_REQUIRED_TARGETS for target in targets)
                      or any(content[key] for key in LOGIN_REQUIRED_CONTENT))
    if requires_login and auth["mode"] == "anonymous":
        raise BridgeError("AUTH_REQUIRED", "This download configuration requires an authenticated Instagram session.")

    return {
        "targets": targets,
        "content": content,
        "filters": filters,
        "output": output,
        "auth": auth,
    }


def validate_download_request(request: Any) -> Dict[str, Any]:
    """Return the normalized request if validation succeeds."""
    return normalize_download_request(request)


def _translate_exception(exc: Exception) -> BridgeError:
    if isinstance(exc, BridgeError):
        return exc
    if isinstance(exc, TooManyRequestsException):
        return BridgeError("RATE_LIMITED", "Instagram rate-limited the request. Try again later.")
    if isinstance(exc, ProfileNotExistsException):
        return BridgeError("TARGET_NOT_FOUND", "The requested Instagram profile or target was not found.")
    if isinstance(exc, (LoginRequiredException, PrivateProfileNotFollowedException)):
        return BridgeError("AUTH_REQUIRED", "This Instagram content requires an authenticated account with access.")
    if isinstance(exc, LoginException):
        return BridgeError("AUTH_FAILED", "Instagram authentication could not be verified.")
    if isinstance(exc, AbortDownloadException):
        return BridgeError("DOWNLOAD_ABORTED", "The download was aborted.")
    if isinstance(exc, InvalidArgumentException):
        return BridgeError("INVALID_REQUEST", "Instaloader rejected one of the requested options.")
    if isinstance(exc, ConnectionException):
        return BridgeError("NETWORK_ERROR", "A network error occurred while contacting Instagram.")
    if isinstance(exc, InstaloaderException):
        return BridgeError("NETWORK_ERROR", "Instaloader could not complete the Instagram request.")
    return BridgeError("INTERNAL_ERROR", "The WorkBuddy bridge encountered an unexpected internal error.")


def _authenticate_loader(loader: Any, auth: Dict[str, Any]) -> Dict[str, Any]:
    mode = auth["mode"]
    if mode == "anonymous":
        return {
            "authenticated": False,
            "username": None,
            "authMode": "anonymous",
            "message": "Anonymous mode",
        }

    if mode == "session":
        try:
            loader.load_session_from_file(auth["username"], auth["sessionFile"])
            username = loader.test_login()
        except (FileNotFoundError, LoginException, ConnectionException, OSError) as exc:
            raise BridgeError("AUTH_FAILED", "The local Instaloader session could not be verified.") from exc
        if not username:
            raise BridgeError("AUTH_FAILED", "The local Instaloader session is not logged in.")
        loader.context.username = username
        return {
            "authenticated": True,
            "username": username,
            "authMode": "session",
            "message": "Session verified",
        }

    if not bc3_library:
        raise BridgeError(
            "AUTH_FAILED",
            "Browser cookie authentication requires the optional browser_cookie3 dependency.",
        )
    try:
        with redirect_stdout(sys.stderr):
            import_session(auth["browser"].lower(), loader, auth["cookieFile"])
        username = loader.context.username or loader.test_login()
    except (LoginException, ConnectionException, OSError, ValueError) as exc:
        raise BridgeError("AUTH_FAILED", "Browser cookies could not be verified for Instagram.") from exc
    if not username:
        raise BridgeError("AUTH_FAILED", "Browser cookies did not provide a logged-in Instagram session.")
    return {
        "authenticated": True,
        "username": username,
        "authMode": "browser",
        "message": "Browser session verified",
    }


def check_account_status(auth: Any, loader_factory: Callable[..., Any] = Instaloader) -> Dict[str, Any]:
    """Verify authentication without returning cookie or session material."""
    normalized_auth = _normalize_auth(auth)
    if normalized_auth["mode"] == "anonymous":
        return {
            "authenticated": False,
            "username": None,
            "authMode": "anonymous",
            "message": "Anonymous mode",
        }

    loader = loader_factory(quiet=True)
    try:
        return _authenticate_loader(loader, normalized_auth)
    finally:
        loader.close()


def _loader_options(request: Dict[str, Any]) -> Dict[str, Any]:
    content = request["content"]
    output = request["output"]
    dirname_pattern = output["dirnamePattern"]
    if output["directory"]:
        dirname_pattern = os.path.join(
            os.path.abspath(os.path.expanduser(output["directory"])),
            dirname_pattern,
        )
    return {
        "quiet": False,
        "dirname_pattern": dirname_pattern,
        "filename_pattern": output["filenamePattern"],
        "download_geotags": content["geotags"],
        "download_comments": content["comments"],
        "save_metadata": content["metadataJson"],
        "post_metadata_txt_pattern": None if content["captions"] else "",
        "resume_prefix": "iterator" if output["resume"] else None,
        "sanitize_paths": output["sanitizePaths"],
    }


def _route_target(loader: Any, target: Dict[str, str], request: Dict[str, Any],
                  post_filter: Optional[Callable], story_filter: Optional[Callable],
                  latest_stamps: Optional[LatestStamps]) -> None:
    content = request["content"]
    filters = request["filters"]
    target_type = target["type"]
    value = target["value"]

    if target_type == "profile":
        profile = loader.check_profile_id(value, latest_stamps)
        loader.download_profiles(
            profiles={profile},
            profile_pic=content["profilePic"],
            posts=content["posts"],
            tagged=content["tagged"],
            igtv=content["igtv"],
            highlights=content["highlights"],
            stories=content["stories"],
            fast_update=filters["fastUpdate"],
            post_filter=post_filter,
            storyitem_filter=story_filter,
            raise_errors=True,
            latest_stamps=latest_stamps,
            max_count=filters["maxCount"],
            reels=content["reels"],
        )
    elif target_type == "hashtag":
        loader.download_hashtag(
            hashtag=value,
            max_count=filters["maxCount"],
            fast_update=filters["fastUpdate"],
            post_filter=post_filter,
            profile_pic=content["profilePic"],
            posts=content["posts"],
        )
    elif target_type == "shortcode":
        loader.download_post(Post.from_shortcode(loader.context, value), "-" + value)
    elif target_type == "feed":
        loader.download_feed_posts(
            max_count=filters["maxCount"],
            fast_update=filters["fastUpdate"],
            post_filter=post_filter,
        )
    elif target_type == "stories":
        loader.download_stories(
            fast_update=filters["fastUpdate"],
            storyitem_filter=story_filter,
        )
    elif target_type == "saved":
        loader.download_saved_posts(
            max_count=filters["maxCount"],
            fast_update=filters["fastUpdate"],
            post_filter=post_filter,
        )
    else:
        raise BridgeError("INVALID_REQUEST", "Unsupported target type.")


def execute_download(request: Any, loader_factory: Callable[..., Any] = Instaloader,
                     event_sink: Optional[Callable[[str, Dict[str, Any]], None]] = None) -> Dict[str, Any]:
    """Execute a normalized WorkBuddy request through public Instaloader operations."""
    normalized = normalize_download_request(request)
    sink = event_sink or (lambda event, data: None)

    sink("progress", {"stage": "准备任务"})
    loader = loader_factory(**_loader_options(normalized))
    try:
        sink("progress", {"stage": "验证身份"})
        _authenticate_loader(loader, normalized["auth"])

        filters = normalized["filters"]
        try:
            post_filter = (filterstr_to_filterfunc(filters["postFilter"], Post)
                           if filters["postFilter"] else None)
            story_filter = (filterstr_to_filterfunc(filters["storyItemFilter"], StoryItem)
                            if filters["storyItemFilter"] else None)
            latest_stamps = LatestStamps(filters["latestStampsFile"]) if filters["latestStampsFile"] else None
        except (InvalidArgumentException, OSError, ValueError) as exc:
            raise BridgeError("INVALID_REQUEST", "One of the filter or latest-stamps options is invalid.") from exc

        sink("progress", {"stage": "解析目标"})
        sink("progress", {"stage": "下载中"})
        completed = 0
        for target in normalized["targets"]:
            try:
                _route_target(loader, target, normalized, post_filter, story_filter, latest_stamps)
                completed += 1
                sink("log", {
                    "message": "Target completed",
                    "target": {"type": target["type"], "value": target["value"]},
                })
            except Exception as exc:
                raise _translate_exception(exc) from exc

        sink("progress", {"stage": "保存元数据"})
        result = {
            "status": "completed",
            "targetsRequested": len(normalized["targets"]),
            "targetsCompleted": completed,
            "targetsFailed": 0,
            "downloaded": None,
            "skipped": None,
            "outputDirectory": normalized["output"]["directory"] or os.getcwd(),
            "authMode": normalized["auth"]["mode"],
        }
        sink("progress", {"stage": "完成"})
        return result
    except BridgeError:
        raise
    except Exception as exc:
        raise _translate_exception(exc) from exc
    finally:
        loader.close()


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def emit_event(event: str, job_id: str, data: Dict[str, Any], stream: IO[str] = sys.stdout) -> None:
    """Write exactly one machine-readable event line."""
    json.dump({
        "event": event,
        "jobId": job_id,
        "timestamp": _timestamp(),
        "data": data,
    }, stream, ensure_ascii=False, separators=(",", ":"))
    stream.write("\n")
    stream.flush()


def _handle_command(command: Dict[str, Any], job_id: str) -> int:
    command_name = command.get("command")
    event_stream = sys.stdout
    if command_name == "validate":
        normalized = validate_download_request(command.get("request"))
        emit_event("completed", job_id, {"request": normalized}, stream=event_stream)
        return 0
    if command_name == "account_status":
        with redirect_stdout(sys.stderr):
            status = check_account_status(command.get("auth"))
        emit_event("completed", job_id, status, stream=event_stream)
        return 0
    if command_name == "download":
        with redirect_stdout(sys.stderr):
            result = execute_download(
                command.get("request"),
                event_sink=lambda event, data: emit_event(event, job_id, data, stream=event_stream),
            )
        emit_event("completed", job_id, result, stream=event_stream)
        return 0
    raise BridgeError("INVALID_REQUEST", "Unsupported bridge command.")


def main() -> int:
    """Read one JSON command from stdin and emit JSONL events to stdout."""
    job_id = str(uuid.uuid4())
    try:
        raw = sys.stdin.read()
        try:
            command = json.loads(raw)
        except (TypeError, ValueError) as exc:
            raise BridgeError("INVALID_REQUEST", "Bridge input must be valid JSON.") from exc
        if not isinstance(command, dict):
            raise BridgeError("INVALID_REQUEST", "Bridge input must be a JSON object.")
        return _handle_command(command, job_id)
    except BridgeError as exc:
        emit_event("failed", job_id, {"code": exc.code, "message": exc.message})
        return 2
    except Exception:
        emit_event("failed", job_id, {
            "code": "INTERNAL_ERROR",
            "message": "The WorkBuddy bridge encountered an unexpected internal error.",
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
