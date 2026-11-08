#!/usr/bin/env python3
"""Business Hub launcher.

No Docker, no migrations, no multi-service orchestration — just a
Python backend and a once-built frontend. `python run.py` on its own
is all most people need; the rest are conveniences for development.

    python run.py                  start Business Hub (auto-setup on first run)
    python run.py start --seed     start, then seed mock demo data once it's up
    python run.py setup            install backend + frontend deps, build the frontend
    python run.py build            rebuild the frontend only
    python run.py dev              backend + Vite dev server together, live-reloading
    python run.py reset            delete local DuckDB/SQLite data files
"""

import argparse
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DATA = ROOT / "data"
VENV = BACKEND / ".venv"

PORT = 8420
BASE_URL = f"http://127.0.0.1:{PORT}"
HEALTH_URL = f"{BASE_URL}/api/health"

IS_WINDOWS = sys.platform == "win32"
VENV_PYTHON = VENV / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")
NPM = "npm.cmd" if IS_WINDOWS else "npm"


def _run(cmd, cwd=None):
    print(f"$ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def ensure_backend_env():
    if VENV_PYTHON.exists():
        print("Backend virtual environment already present.")
        return
    print("Setting up backend virtual environment...")
    _run([sys.executable, "-m", "venv", str(VENV)])
    _run([str(VENV_PYTHON), "-m", "pip", "install", "--upgrade", "pip", "--quiet"])
    _run([str(VENV_PYTHON), "-m", "pip", "install", "-r", "requirements.txt", "--quiet"], cwd=BACKEND)


def ensure_frontend_build(force=False):
    if not (FRONTEND / "node_modules").exists():
        print("Installing frontend dependencies...")
        _run([NPM, "install", "--silent"], cwd=FRONTEND)
    if force or not (FRONTEND / "dist" / "index.html").exists():
        print("Building frontend...")
        _run([NPM, "run", "build"], cwd=FRONTEND)
    else:
        print("Frontend build already present (use `python run.py build` to rebuild).")


def is_healthy(timeout=1.5):
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, ConnectionError, OSError):
        return False


def wait_for_health(timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_healthy(timeout=1.5):
            return True
        time.sleep(0.5)
    return False


def seed_demo_data():
    print("Seeding mock demo data...")
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/seed/mock", method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            print("Demo data seeded." if resp.status == 200 else f"Seed request returned status {resp.status}.")
    except Exception as e:
        print(f"Seeding failed: {e}")


def _terminate(proc, label):
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        print(f"{label} did not stop in time — killing it.")
        proc.kill()


def cmd_start(args):
    if is_healthy():
        print(f"Business Hub is already running at {BASE_URL}")
        if args.seed:
            seed_demo_data()
        if not args.no_browser:
            webbrowser.open(BASE_URL)
        return

    ensure_backend_env()
    ensure_frontend_build()

    print(f"\nStarting Business Hub on {BASE_URL} (Ctrl+C to stop)\n")
    proc = subprocess.Popen([str(VENV_PYTHON), "main.py"], cwd=BACKEND)
    try:
        if wait_for_health():
            print(f"\nBusiness Hub is up: {BASE_URL}")
            if args.seed:
                seed_demo_data()
            if not args.no_browser:
                webbrowser.open(BASE_URL)
        else:
            print("Server did not become healthy in time — check the log output above.")
        proc.wait()
    except KeyboardInterrupt:
        print("\nStopping Business Hub...")
        _terminate(proc, "Backend")


def cmd_setup(args):
    ensure_backend_env()
    ensure_frontend_build(force=True)
    print("\nSetup complete. Run `python run.py` to launch Business Hub.")


def cmd_build(args):
    print("Building frontend...")
    _run([NPM, "run", "build"], cwd=FRONTEND)


def cmd_dev(args):
    ensure_backend_env()
    if not (FRONTEND / "node_modules").exists():
        print("Installing frontend dependencies...")
        _run([NPM, "install", "--silent"], cwd=FRONTEND)

    print(f"\nStarting backend on :{PORT} and the Vite dev server on :5173 (Ctrl+C to stop)")
    print("Work against http://localhost:5173 — it proxies /api to the backend.\n")
    backend_proc = subprocess.Popen([str(VENV_PYTHON), "main.py"], cwd=BACKEND)
    frontend_proc = subprocess.Popen([NPM, "run", "dev"], cwd=FRONTEND)
    try:
        while backend_proc.poll() is None and frontend_proc.poll() is None:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        print("\nStopping...")
        _terminate(backend_proc, "Backend")
        _terminate(frontend_proc, "Frontend dev server")


def cmd_reset(args):
    files = [DATA / "business_hub.duckdb", DATA / "mock_orders.sqlite"]
    existing = [f for f in files if f.exists()]
    if not existing:
        print("Nothing to reset — no data files found.")
        return
    print("This will permanently delete:")
    for f in existing:
        print(f"  - {f}")
    if not args.yes:
        if input("Continue? [y/N] ").strip().lower() != "y":
            print("Cancelled.")
            return
    for f in existing:
        f.unlink()
    print("Reset complete — restart Business Hub to begin with a clean slate.")


def main():
    parser = argparse.ArgumentParser(description="Business Hub launcher")
    sub = parser.add_subparsers(dest="command")

    p_start = sub.add_parser("start", help="Start Business Hub (default)")
    p_start.add_argument("--seed", action="store_true", help="Seed mock demo data once the server is up")
    p_start.add_argument("--no-browser", action="store_true", help="Don't auto-open the browser")
    p_start.set_defaults(func=cmd_start)

    p_setup = sub.add_parser("setup", help="Install backend + frontend dependencies and build the frontend")
    p_setup.set_defaults(func=cmd_setup)

    p_build = sub.add_parser("build", help="Rebuild the frontend only")
    p_build.set_defaults(func=cmd_build)

    p_dev = sub.add_parser("dev", help="Run backend + Vite dev server together, for live frontend reloading")
    p_dev.set_defaults(func=cmd_dev)

    p_reset = sub.add_parser("reset", help="Delete local DuckDB/SQLite data files")
    p_reset.add_argument("--yes", action="store_true", help="Skip the confirmation prompt")
    p_reset.set_defaults(func=cmd_reset)

    args = parser.parse_args()
    if args.command is None:
        args = parser.parse_args(["start"])

    try:
        args.func(args)
    except subprocess.CalledProcessError as e:
        print(f"\nCommand failed ({e.returncode}): {' '.join(str(c) for c in e.cmd)}")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"\n{e}\nMake sure Python/Node.js are installed and on PATH.")
        sys.exit(1)


if __name__ == "__main__":
    main()
