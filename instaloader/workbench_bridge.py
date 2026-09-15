"""Structured JSONL bridge between WorkBuddy and the Instaloader Python API."""

import json
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, IO


SUPPORTED_TARGET_TYPES = {"profile", "hashtag", "shortcode", "feed", "stories", "saved"}
SUPPORTED_AUTH_MODES = {"anonymous", "session", "browser"}
LOGIN_REQUIRED_TARGETS = {"feed", "stories", "saved"}
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
    auth = _merge_known(AUTH_DEFAULTS, request.get("auth"), "auth")

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

    if auth["mode"] not in SUPPORTED_AUTH_MODES:
        raise BridgeError("INVALID_REQUEST", "Unsupported authentication mode.")
    for key in ("username", "sessionFile", "browser", "cookieFile"):
        _validate_nullable_text(auth[key], "auth.{}".format(key))
    if auth["mode"] == "session" and not auth["username"]:
        raise BridgeError("INVALID_REQUEST", "Session authentication requires a username.")
    if auth["mode"] == "browser" and not auth["browser"]:
        raise BridgeError("INVALID_REQUEST", "Browser authentication requires a browser name.")

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
    if command_name == "validate":
        normalized = validate_download_request(command.get("request"))
        emit_event("completed", job_id, {"request": normalized})
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
