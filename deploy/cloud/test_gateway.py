import http.client
from contextlib import closing
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from gateway import GatewayServer, worker_target

TOKEN = "transport-test-token-" + "x" * 32


class Worker(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/?stream=1":
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()
            self.wfile.write(b'{"type":"progress"}\n')
            self.wfile.flush()
            self.server.release_stream.wait(5)
            self.wfile.write(b'{"type":"complete"}\n')
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", 'attachment; filename="model.glb"')
            self.end_headers()
            self.wfile.write(b"glTF" + bytes(range(256)))

    def do_POST(self):
        data = self.rfile.read(int(self.headers["Content-Length"]))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"path": self.path, "body": data.decode(),
                                    "token": self.headers.get("x-pascal-gateway-token"),
                                    "cookie": self.headers.get("Cookie"),
                                    "forwarded": self.headers.get("X-Forwarded-Host")}).encode())


class GatewayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = ThreadingHTTPServer(("127.0.0.1", 0), Worker)
        cls.worker.release_stream = threading.Event()
        target = "http://127.0.0.1:%s" % cls.worker.server_port
        cls.gateway = GatewayServer(("127.0.0.1", 0), token=TOKEN, chat=target, studio=target, max_body=1024)
        for server in (cls.worker, cls.gateway):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.worker.release_stream.set()
        for server in (cls.gateway, cls.worker):
            server.shutdown()
            server.server_close()

    def connection(self):
        return http.client.HTTPConnection("127.0.0.1", self.gateway.server_port, timeout=2)

    def test_auth_fails_closed(self):
        for headers in ({}, {"x-pascal-gateway-token": "wrong"}):
            with closing(self.connection()) as c:
                c.request("GET", "/chat", headers=headers)
                self.assertEqual(c.getresponse().status, 401)

    def test_routes_cannot_access_owner_or_arbitrary_urls(self):
        for path in ("/api/health", "/owner", "/chat/../studio", "http://127.0.0.1:8091/", "/studio#fragment"):
            with closing(self.connection()) as c:
                c.request("GET", path, headers={"x-pascal-gateway-token": TOKEN})
                self.assertEqual(c.getresponse().status, 404)

    def test_request_and_query_forward_without_browser_credentials(self):
        with closing(self.connection()) as c:
            c.request("POST", "/chat?sceneId=cloud-test&action=chat", "hello", {
                "x-pascal-gateway-token": TOKEN, "Cookie": "private=browser-session",
                "X-Forwarded-Host": "attacker.test", "Content-Type": "application/json",
            })
            response = c.getresponse()
            self.assertEqual(response.status, 200)
            result = json.loads(response.read())
        self.assertEqual(result["body"], "hello")
        self.assertEqual(result["path"], "/?sceneId=cloud-test&action=chat")
        self.assertEqual(result["token"], TOKEN)
        self.assertIsNone(result["cookie"])
        self.assertIsNone(result["forwarded"])

    def test_download_is_byte_exact(self):
        with closing(self.connection()) as c:
            c.request("GET", "/studio?sceneId=cloud-test&action=file", headers={"x-pascal-gateway-token": TOKEN})
            response = c.getresponse()
            self.assertIn("model.glb", response.getheader("Content-Disposition"))
            self.assertEqual(response.read(), b"glTF" + bytes(range(256)))

    def test_progress_arrives_before_worker_finishes(self):
        self.worker.release_stream.clear()
        try:
            with closing(self.connection()) as c:
                c.request("GET", "/chat?stream=1", headers={"x-pascal-gateway-token": TOKEN})
                response = c.getresponse()
                self.assertEqual(response.readline(), b'{"type":"progress"}\n')
                self.assertFalse(self.worker.release_stream.is_set())
                self.worker.release_stream.set()
                self.assertEqual(response.readline(), b'{"type":"complete"}\n')
                self.assertEqual(response.read(), b"")
        finally:
            self.worker.release_stream.set()

    def test_body_limit_is_enforced(self):
        with closing(self.connection()) as c:
            c.request("POST", "/studio", b"x" * 1025, {"x-pascal-gateway-token": TOKEN})
            self.assertEqual(c.getresponse().status, 413)

    def test_upstream_configuration_cannot_target_public_or_admin_endpoints(self):
        for target in ("http://example.com", "http://47.115.206.242:8091", "http://100.64.0.1:123/a", "http://user:secret@100.64.0.1:123"):
            with self.assertRaises(ValueError):
                worker_target(target)
        self.assertEqual(worker_target("http://100.64.0.1:18091"), ("100.64.0.1", 18091))

    def test_userspace_bridge_sends_only_fixed_tailnet_target_to_local_proxy(self):
        bridge = GatewayServer(("127.0.0.1", 0), token=TOKEN,
                               chat="http://100.124.28.47:9080", studio="http://100.124.28.47:9080",
                               outbound_proxy="http://127.0.0.1:%s" % self.worker.server_port,
                               preserve_route=True)
        threading.Thread(target=bridge.serve_forever, daemon=True).start()
        try:
            with closing(http.client.HTTPConnection("127.0.0.1", bridge.server_port, timeout=2)) as c:
                c.request("POST", "/chat?sceneId=cloud-test", "body", {"x-pascal-gateway-token": TOKEN})
                response = c.getresponse()
                self.assertEqual(response.status, 200)
                result = json.loads(response.read())
                self.assertEqual(result["path"], "http://100.124.28.47:9080/chat?sceneId=cloud-test")
                self.assertEqual(result["token"], TOKEN)
        finally:
            bridge.shutdown()
            bridge.server_close()

    def test_userspace_proxy_cannot_be_remote(self):
        with self.assertRaises(ValueError):
            GatewayServer(("127.0.0.1", 0), token=TOKEN, chat="http://100.64.0.1:9080",
                          studio="http://100.64.0.1:9080", outbound_proxy="http://100.64.0.2:1055")

    def test_finished_download_does_not_exhaust_connection_budget(self):
        target = "http://127.0.0.1:%s" % self.worker.server_port
        gateway = GatewayServer(("127.0.0.1", 0), token=TOKEN, chat=target, studio=target, connections=1)
        threading.Thread(target=gateway.serve_forever, daemon=True).start()
        first = http.client.HTTPConnection('127.0.0.1', gateway.server_port, timeout=2)
        second = http.client.HTTPConnection('127.0.0.1', gateway.server_port, timeout=2)
        try:
            first.request('GET', '/studio', headers={'x-pascal-gateway-token': TOKEN})
            self.assertEqual(first.getresponse().read(), b'glTF' + bytes(range(256)))
            # The first client deliberately remains open after consuming the
            # file: later preview/download requests must still be serviceable.
            second.request('GET', '/studio', headers={'x-pascal-gateway-token': TOKEN})
            response = second.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'glTF' + bytes(range(256)))
        finally:
            first.close()
            second.close()
            gateway.shutdown()
            gateway.server_close()

    def test_preview_burst_waits_for_active_streams(self):
        target = "http://127.0.0.1:%s" % self.worker.server_port
        gateway = GatewayServer(("127.0.0.1", 0), token=TOKEN, chat=target, studio=target, connections=2)
        threading.Thread(target=gateway.serve_forever, daemon=True).start()
        clients = [http.client.HTTPConnection('127.0.0.1', gateway.server_port, timeout=3) for _ in range(3)]
        self.worker.release_stream.clear()
        try:
            streams = []
            for client in clients[:2]:
                client.request('GET', '/chat?stream=1', headers={'x-pascal-gateway-token': TOKEN})
                stream = client.getresponse()
                self.assertEqual(stream.readline(), b'{"type":"progress"}\n')
                streams.append(stream)
            timer = threading.Timer(0.1, self.worker.release_stream.set)
            timer.start()
            clients[2].request('GET', '/studio', headers={'x-pascal-gateway-token': TOKEN})
            response = clients[2].getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'glTF' + bytes(range(256)))
            timer.join()
            for stream in streams:
                self.assertEqual(stream.readline(), b'{"type":"complete"}\n')
        finally:
            self.worker.release_stream.set()
            for client in clients:
                client.close()
            gateway.shutdown()
            gateway.server_close()


if __name__ == "__main__":
    unittest.main()
