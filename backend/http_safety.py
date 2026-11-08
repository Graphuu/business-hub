"""SSRF-safe outbound HTTP for API-type integrations. Validates the
target resolves to a public IP before connecting, and re-validates on
every redirect hop by hand instead of letting httpx auto-follow —
a self-contained reimplementation, no shared imports with anything
else on this machine.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

MAX_REDIRECTS = 5


class SsrfBlockedError(ValueError):
    pass


def _is_public_ip(ip_str: str) -> bool:
    ip = ipaddress.ip_address(ip_str)
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_multicast or ip.is_reserved or ip.is_unspecified
    )


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise SsrfBlockedError(f"Unsupported scheme: {parsed.scheme}")
    hostname = parsed.hostname
    if not hostname:
        raise SsrfBlockedError("URL has no hostname")
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise SsrfBlockedError(f"Could not resolve host: {hostname}") from e
    for info in infos:
        ip_str = info[4][0]
        if not _is_public_ip(ip_str):
            raise SsrfBlockedError(f"Blocked non-public address: {ip_str}")


def safe_request(method: str, url: str, *, verify: bool = True, **kwargs) -> httpx.Response:
    kwargs.setdefault("timeout", 15.0)
    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        assert_public_url(current_url)
        with httpx.Client(follow_redirects=False, verify=verify) as client:
            resp = client.request(method, current_url, **kwargs)
        if resp.is_redirect:
            location = resp.headers.get("location")
            if not location:
                return resp
            current_url = str(httpx.URL(current_url).join(location))
            continue
        return resp
    raise SsrfBlockedError("Too many redirects")


def safe_get(url: str, **kwargs) -> httpx.Response:
    return safe_request("GET", url, **kwargs)


def safe_post(url: str, **kwargs) -> httpx.Response:
    return safe_request("POST", url, **kwargs)
