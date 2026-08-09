"""推甄戰備室 — 本機開發伺服器

開發時關閉快取，避免改了檔案卻被瀏覽器或 Service Worker 擋住看不到變化。
正式部署（GitHub Pages）不會用到這支。

用法：
    python serve.py          # 啟動並自動開瀏覽器
    python serve.py 8771     # 換一個埠
    Ctrl+C                   # 停止
"""

import os
import sys
import http.server
import socketserver
import threading
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8770


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 預設每個請求都印一行，開發時太吵；只留錯誤
        if not args or not str(args[0]).startswith(("GET", "HEAD")):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    # 多執行緒：內容模組是分檔的 ES Module，一次會發十幾個請求，
    # 單執行緒的 TCPServer 會把並行請求排成一列，實測會偶發逾時。
    daemon_threads = True

    # Windows 的 SO_REUSEADDR 語意跟 Unix 不同——它會允許第二個程序綁上
    # 「已經在使用中」的埠，導致兩個伺服器搶同一個 port。所以 Windows 一律
    # 關閉，寧可直接噴 "埠被佔用" 也不要安靜地壞掉。
    allow_reuse_address = os.name != "nt"


def main():
    try:
        httpd = Server(("", PORT), NoCacheHandler)
    except OSError as err:
        print(f"\n無法啟動：埠 {PORT} 已經被佔用了。\n")
        print("可能是你已經開過一個伺服器，或 Claude 的 Preview 還在跑。")
        print("解法二選一：")
        print(f"  1. 直接打開 http://localhost:{PORT} ，那個伺服器就能用")
        print(f"  2. 換一個埠：python serve.py {PORT + 1}\n")
        print(f"（原始錯誤：{err}）")
        sys.exit(1)

    url = f"http://localhost:{PORT}"
    print(f"推甄戰備室開發伺服器：{url}")
    print(f"根目錄：{os.getcwd()}")
    print("按 Ctrl+C 停止。\n")

    # 等伺服器真的開始監聽再開瀏覽器，否則偶爾會開到「無法連線」
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
