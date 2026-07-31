#!/usr/bin/env python3
"""Client for driver.py. Drops a command file, waits for the reply, prints it.

  ctl.py shot --path /tmp/a.jpg
  ctl.py click --x 640 --y 478
  ctl.py eval --js "document.title"
  ctl.py record_start --outdir /root/autodl-tmp/sap-data/anim01/clips/f01
"""
import json
import os
import sys
import time
import uuid

BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")
WORK = os.path.join(BASE, "work")
CMD = os.path.join(WORK, "cmd")
RESP = os.path.join(WORK, "resp")


def main():
    if len(sys.argv) < 2:
        print("usage: ctl.py <op> [--k v ...]")
        sys.exit(2)
    c = {"op": sys.argv[1]}
    args = sys.argv[2:]
    i = 0
    while i < len(args):
        k = args[i].lstrip("-")
        v = args[i + 1]
        try:
            v = int(v)
        except ValueError:
            try:
                v = float(v)
            except ValueError:
                pass
        c[k] = v
        i += 2

    timeout = float(c.pop("timeout", 900))
    name = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}.json"
    os.makedirs(CMD, exist_ok=True)
    tmp = os.path.join(CMD, name + ".tmp")
    with open(tmp, "w") as f:
        json.dump(c, f)
    os.rename(tmp, os.path.join(CMD, name))

    deadline = time.time() + timeout
    rp = os.path.join(RESP, name)
    while time.time() < deadline:
        if os.path.exists(rp):
            with open(rp) as f:
                print(f.read())
            os.remove(rp)
            return
        time.sleep(0.2)
    print(json.dumps({"error": "timeout waiting for driver"}))
    sys.exit(1)


main()
