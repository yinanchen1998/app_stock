#!/usr/bin/env python3
"""
量化投资分析系统 - 启动脚本
同时启动前端和后端服务
"""

import subprocess
import sys
import os
import time
import signal
from threading import Thread

def start_backend():
    """启动后端Flask服务"""
    print("🚀 启动后端服务...")
    backend_path = os.path.join(os.path.dirname(__file__), 'backend')
    return subprocess.Popen(
        [sys.executable, 'app.py'],
        cwd=backend_path,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

def start_frontend():
    """启动前端预览服务"""
    print("🌐 启动前端服务...")
    return subprocess.Popen(
        ['python3', '-m', 'http.server', '8080'],
        cwd=os.path.join(os.path.dirname(__file__), 'dist'),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

def log_output(process, name, stream):
    """输出日志"""
    while True:
        output = stream.readline()
        if output:
            print(f"[{name}] {output.strip()}")
        if process.poll() is not None:
            break

def main():
    print("=" * 60)
    print("量化投资分析系统 - 启动器")
    print("=" * 60)
    
    # 检查依赖
    try:
        import flask
        import longport
        print("✅ 依赖检查通过")
    except ImportError as e:
        print(f"⚠️ 缺少依赖: {e}")
        print("正在安装依赖...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'backend/requirements.txt'], 
                      cwd=os.path.dirname(__file__))
    
    # 启动服务
    backend = start_backend()
    time.sleep(2)  # 等待后端启动
    frontend = start_frontend()
    
    print("\n" + "=" * 60)
    print("✅ 服务已启动!")
    print("=" * 60)
    print("📊 前端界面: http://localhost:8080")
    print("🔧 后端API: http://localhost:8000")
    print("=" * 60)
    print("按 Ctrl+C 停止服务\n")
    
    # 启动日志线程 (stdout 和 stderr)
    backend_log = Thread(target=log_output, args=(backend, 'BACKEND', backend.stdout))
    backend_err = Thread(target=log_output, args=(backend, 'BACKEND', backend.stderr))
    frontend_log = Thread(target=log_output, args=(frontend, 'FRONTEND', frontend.stdout))
    frontend_err = Thread(target=log_output, args=(frontend, 'FRONTEND', frontend.stderr))
    for t in [backend_log, backend_err, frontend_log, frontend_err]:
        t.daemon = True
        t.start()
    
    # 等待中断
    try:
        while True:
            time.sleep(1)
            # 检查进程状态
            if backend.poll() is not None:
                print("❌ 后端服务已停止")
                break
            if frontend.poll() is not None:
                print("❌ 前端服务已停止")
                break
    except KeyboardInterrupt:
        print("\n🛑 正在停止服务...")
    finally:
        backend.terminate()
        frontend.terminate()
        print("✅ 服务已停止")

if __name__ == '__main__':
    main()
