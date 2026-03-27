import os
import subprocess
import sys
import threading
import time
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PYTHON_EXECUTABLE = sys.executable

SERVICES = [
    ("web", BASE_DIR / "khaicute.py"),
    ("sender", BASE_DIR / "sender.py"),
]


def _stream_output(prefix, stream):
    try:
        for line in iter(stream.readline, ""):
            if not line:
                break
            sys.stdout.write(f"[{prefix}] {line}")
    finally:
        try:
            stream.close()
        except Exception:
            pass


def _start_service(name, script_path, shared_env):
    process = subprocess.Popen(
        [PYTHON_EXECUTABLE, "-u", str(script_path)],
        cwd=BASE_DIR,
        env=shared_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    reader_thread = threading.Thread(
        target=_stream_output,
        args=(name, process.stdout),
        daemon=True,
    )
    reader_thread.start()
    return process


def _stop_process(process):
    if process.poll() is not None:
        return

    process.terminate()

    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main():
    shared_env = os.environ.copy()
    shared_env.setdefault("PYTHONIOENCODING", "utf-8")
    shared_env.setdefault("PYTHONUTF8", "1")
    shared_env.setdefault("PYTHONUNBUFFERED", "1")
    shared_env.setdefault("SENDER_STARTUP_TEST", "0")

    processes = []

    try:
        print("Starting bot services:")
        print(f"  - web: {SERVICES[0][1].name}")
        print(f"  - sender: {SERVICES[1][1].name}")

        for name, script_path in SERVICES:
            processes.append((name, _start_service(name, script_path, shared_env)))

        while True:
            for name, process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    raise RuntimeError(f"Service '{name}' exited with code {exit_code}")
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nStopping bot services...")
    finally:
        for _, process in reversed(processes):
            _stop_process(process)


if __name__ == "__main__":
    main()
