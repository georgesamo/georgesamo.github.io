"""Static server for the browser tests: serves the repo root with caching off,
so an edited script is never replaced by a stale copy mid-run.
usage (from the repo root): python tests/serve.py [port]   (default 4100, 127.0.0.1 only)
"""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):  # quiet: CI logs only the test results
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4100
http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
