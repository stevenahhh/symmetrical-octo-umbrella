#!/usr/bin/env python3
import http.server
import socketserver
import os
from pathlib import Path

PORT = 5000
DIRECTORY = r"c:\Users\juari\imagineer\frontend\dist"  # 빌드된 dist 폴더 서빙

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        return super().end_headers()

os.chdir(DIRECTORY)

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"✓ Server running on http://localhost:{PORT}")
    print(f"✓ Serving files from: {DIRECTORY}")
    print(f"✓ Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server stopped")
