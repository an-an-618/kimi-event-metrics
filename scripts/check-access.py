"""Read-only DNS and HTTPS checks. Run on the affected computer and independently."""
import json
import os
from pathlib import Path
import socket
import urllib.error
import urllib.parse
import urllib.request

base = os.environ.get("CHECK_URL", "https://kimi-event-metrics.vercel.app").rstrip("/")
host = urllib.parse.urlsplit(base).hostname
if not host or not base.startswith("https://"):
    raise ValueError("CHECK_URL must be an HTTPS address")
result = {"url": base, "dns": {}, "https": {}, "independent_dns": {}}
try:
    result["dns"]["addresses"] = sorted({
        address[4][0] for address in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    })
except OSError as error:
    result["dns"]["error"] = str(error)

for path in ["/", "/api/health"]:
    try:
        with urllib.request.urlopen(base + path, timeout=18) as response:
            data = response.read(4096).decode("utf-8", errors="replace")
            result["https"][path] = {
                "status": response.status,
                "content_type": response.headers.get("Content-Type"),
                "data": json.loads(data) if "/api/" in path else data[:120],
            }
    except (OSError, ValueError) as error:
        result["https"][path] = {"error": str(error)}

for record in ["A", "AAAA"]:
    resolver = "https://dns.google/resolve?" + urllib.parse.urlencode({"name": host, "type": record})
    try:
        with urllib.request.urlopen(resolver, timeout=18) as response:
            result["independent_dns"][record] = json.loads(response.read())
    except OSError as error:
        result["independent_dns"][record] = {"error": str(error)}

output = Path(os.environ.get("ACCESS_OUTPUT", "access-results"))
output.mkdir(parents=True, exist_ok=True)
output.joinpath("access.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps(result, ensure_ascii=False, indent=2))
