# -*- coding: utf-8 -*-
"""
游戏引擎设计 · 学习工坊 —— 一键启动本地服务

用法:
    python start.py               启动服务并自动打开浏览器
    python start.py --no-browser  启动服务但不自动开浏览器

说明:
    构建产物是 ES module, 浏览器禁止在 file:// 下加载, 必须走 http,
    所以需要这个小服务器。它只服务 playground/dist 静态文件。
"""
import os
import socket
import subprocess
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "playground", "dist")
PLAYGROUND = os.path.join(ROOT, "playground")
PORT_BASE = 5217


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静默访问日志, 保持控制台清爽


def have_dist():
    return os.path.isfile(os.path.join(DIST, "index.html"))


def try_build():
    print("[*] 未找到构建产物, 尝试执行 pnpm build ...")
    try:
        rc = subprocess.call("pnpm build", cwd=PLAYGROUND, shell=True)
    except Exception as e:
        print("[!] 自动构建失败:", e)
        return False
    return rc == 0 and have_dist()


def find_port():
    port = PORT_BASE
    for _ in range(50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                port += 1
    return PORT_BASE


def main():
    if not have_dist() and not try_build():
        print("[!] 缺少 playground/dist, 且自动构建失败。")
        print("    请先在 playground 目录执行: pnpm install && pnpm build")
        input("按回车键退出...")
        return
    port = find_port()
    url = "http://127.0.0.1:%d/" % port
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    line = "=" * 56
    print(line)
    print("  游戏引擎设计 · 学习工坊 已启动")
    print("")
    print("  本地地址 : %s" % url)
    print("  关闭服务 : 本窗口按 Ctrl+C, 或直接关闭窗口")
    print(line)
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    print("")
    print("服务已停止。")


if __name__ == "__main__":
    main()
