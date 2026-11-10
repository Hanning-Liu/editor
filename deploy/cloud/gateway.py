"""Small fixed-route AI gateway. TLS is terminated by the dedicated Caddy site.

No inference, scene database, shell execution, arbitrary URL forwarding, or
access to the existing Pocket Rudiment services belongs in this process.
"""
import hmac
import http.client
import ipaddress
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


def worker_target(value):
    target = urlsplit(value)
    ip = ipaddress.ip_address(target.hostname or "")
    if (target.scheme != "http" or target.username or target.password
            or target.path not in ("", "/") or target.query or target.fragment
            or not (ip.is_loopback or ip in ipaddress.ip_network("100.64.0.0/10"))):
        raise ValueError("Worker must be a fixed loopback or Tailscale IPv4 HTTP origin")
    return target.hostname, target.port or 80


class GatewayServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def __init__(self, address, *, token, chat, studio, max_body=30 * 1024 * 1024, connections=4,
                 outbound_proxy=None, preserve_route=False):
        if len(token) < 32:
            raise ValueError("Gateway token must contain at least 32 characters")
        self.token = token
        self.targets = {"/chat": worker_target(chat), "/studio": worker_target(studio)}
        self.outbound_proxy = worker_target(outbound_proxy) if outbound_proxy else None
        if self.outbound_proxy and not ipaddress.ip_address(self.outbound_proxy[0]).is_loopback:
            raise ValueError("Userspace Tailscale proxy must bind to loopback")
        self.preserve_route = preserve_route
        self.max_body = max_body
        self.slots = threading.BoundedSemaphore(connections)
        super().__init__(address, GatewayHandler)

    def process_request(self, request, client_address):
        # Bound active request memory while allowing short preview/download
        # bursts to wait for an existing stream rather than fail immediately.
        if not self.slots.acquire(timeout=10):
            try:
                request.settimeout(1)
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nRetry-After: 2\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            except OSError:
                pass
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class GatewayHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "PascalGateway"
    sys_version = ""
    timeout = 30

    def log_message(self, fmt, *args):
        # Paths contain user/project identifiers; never log them or auth headers.
        pass

    def fail(self, status):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def proxy(self):
        supplied = self.headers.get("x-pascal-gateway-token", "")
        if not hmac.compare_digest(supplied.encode(), self.server.token.encode()):
            self.fail(401)
            return
        target = urlsplit(self.path)
        if target.scheme or target.netloc or target.fragment or target.path not in self.server.targets:
            self.fail(404)
            return
        if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) > 1:
            self.fail(400)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.fail(400)
            return
        if length < 0 or length > self.server.max_body:
            self.fail(413)
            return
        if self.command == "POST" and "Content-Length" not in self.headers:
            self.fail(411)
            return
        worker = self.server.targets[target.path]
        conn = http.client.HTTPConnection(*(self.server.outbound_proxy or worker), timeout=900)
        started = False
        try:
            body = self.rfile.read(length) if length else None
            if body is not None and len(body) != length:
                self.fail(400)
                return
            headers = {"x-pascal-gateway-token": self.server.token}
            for key in ("Content-Type", "Range", "If-None-Match"):
                if self.headers.get(key):
                    headers[key] = self.headers[key]
            upstream_path = (target.path if self.server.preserve_route else "/") + ("?" + target.query if target.query else "")
            if self.server.outbound_proxy:
                upstream_path = "http://%s:%s%s" % (*worker, upstream_path)
            conn.request(self.command, upstream_path, body, headers)
            response = conn.getresponse()
            self.send_response(response.status)
            for key in ("Content-Type", "Content-Disposition", "Content-Range", "Accept-Ranges", "ETag", "Retry-After"):
                if response.getheader(key):
                    self.send_header(key, response.getheader(key))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Accel-Buffering", "no")
            self.send_header("X-Content-Type-Options", "nosniff")
            # The semaphore counts handler connections, not HTTP messages.
            # An idle keep-alive client must not retain a worker slot.
            self.send_header("Connection", "close")
            self.close_connection = True
            has_body = self.command != "HEAD" and response.status not in (204, 304)
            if has_body:
                self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            started = True
            if has_body:
                while data := response.read1(65536):
                    self.wfile.write(("%x\r\n" % len(data)).encode() + data + b"\r\n")
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
        except (OSError, http.client.HTTPException):
            if started:
                self.close_connection = True
            else:
                self.fail(502)
        finally:
            conn.close()

    do_GET = proxy
    do_POST = proxy
    do_DELETE = proxy
    do_HEAD = proxy


if __name__ == "__main__":
    server = GatewayServer(
        ("127.0.0.1", int(os.environ.get("PASCAL_GATEWAY_PORT", "9080"))),
        token=os.environ["PASCAL_GATEWAY_TOKEN"],
        chat=os.environ["PASCAL_CHAT_WORKER"],
        studio=os.environ["PASCAL_STUDIO_WORKER"],
        outbound_proxy=os.environ.get("PASCAL_GATEWAY_PROXY"),
        preserve_route=os.environ.get("PASCAL_GATEWAY_PRESERVE_ROUTE") == "1",
    )
    print("Pascal AI gateway ready on loopback", flush=True)
    server.serve_forever()
