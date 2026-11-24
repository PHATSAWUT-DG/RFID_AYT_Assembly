from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import threading
import time
import httpx
import json
import sys
import os
import signal
from sid_u861 import (
    open_net_port, close_net_port,
    inventory_g2, set_power,
    get_error_desc
)

# ===== CONFIG =====
with open("reader_config.json") as f:
    ALL_READERS = json.load(f)

ENABLED_READERS = [r for r in ALL_READERS if r.get("enabled", True)]

COOLDOWN = 10
NODE_URL  = "http://localhost:5001/api/assembly"
PORT      = 8001

# ===== STATE =====
def make_reader_state(cfg):
    return {
        "cfg":         cfg,
        "connected":   False,
        "port_handle": -1,
        "last_tags":   [],
        "seen_tags":   {},
    }

readers = [make_reader_state(cfg) for cfg in ENABLED_READERS]

# ===== SCAN LOOP =====
def scan_loop(r):
    cfg           = r["cfg"]
    reader_type   = cfg["type"]
    location_name = cfg.get("location_name", None)

    # map type → endpoint
    endpoint_map = {
        "gr_f1": "gauging-room-f1",
        "mc_f1": "mc-gauging-f1",
    }
    endpoint = endpoint_map.get(reader_type)

    while r["connected"]:
        try:
            tags = inventory_g2(r["port_handle"])
            r["last_tags"] = tags
            now = time.time()

            for tag in tags:
                if now - r["seen_tags"].get(tag, 0) >= COOLDOWN:
                    r["seen_tags"][tag] = now
                    print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] {tag}")

                    if endpoint:
                        try:
                            res = httpx.post(
                                f"{NODE_URL}/{endpoint}",
                                json={"tag_id": tag, "location_name": location_name},
                                timeout=5
                            )
                            result = res.json().get("result")

                            if result == "OK":
                                print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] OK: {tag}")

                            elif result == "TAG_NOT_FOUND":
                                print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] TAG_NOT_FOUND: {tag}")

                            elif result == "INVALID_PROCESS_ORDER":
                                # tag นี้ยังไม่ถึง process นี้ → ข้ามไปเงียบๆ ไม่ต้อง alarm
                                print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] INVALID_PROCESS_ORDER (skip): {tag}")

                            elif result == "INVALID_STATUS":
                                print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] INVALID_STATUS: {tag}")

                            elif result == "ALREADY_COMPLETED":
                                # lot นี้ completed แล้ว → ข้ามไปเงียบๆ
                                print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] ALREADY_COMPLETED (skip): {tag}")

                            else:
                                print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] WARNING {result}: {tag}")

                        except Exception as ex:
                            print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] error: {ex}")

        except Exception as ex:
            print(f"[{time.strftime('%H:%M:%S')}] [{reader_type.upper()}] read error: {ex}")
            r["connected"]   = False
            r["last_tags"]   = []
            r["port_handle"] = -1
            return

        time.sleep(1)

# ===== CONNECT & RECONNECT =====
def connect_reader(r):
    cfg = r["cfg"]
    
    # close ครั้งเดียว แต่รอให้ DLL คืน port จริงๆ
    try:
        close_net_port(r["port_handle"])
    except:
        pass
    time.sleep(5)  # ← เพิ่มจาก 2 เป็น 5 ให้ DLL release port

    result, handle = open_net_port(cfg["ip"], 6000)
    if result == 0:
        r["port_handle"] = handle
        set_power(cfg["power"], handle)
        r["connected"] = True
        threading.Thread(target=scan_loop, args=(r,), daemon=True).start()
        print(f"[{time.strftime('%H:%M:%S')}] [OK] [{cfg['type']}] Connected: {cfg['ip']}")
    else:
        r["connected"] = False
        r["port_handle"] = -1
        print(f"[{time.strftime('%H:%M:%S')}] [FAIL] {cfg['ip']}: {get_error_desc(result)}")

def reconnect_loop(r):
    fail_count = 0
    while True:
        if not r["connected"]:
            print(f"[{time.strftime('%H:%M:%S')}] Reconnecting {r['cfg']['ip']}...")
            connect_reader(r)
            if not r["connected"]:
                fail_count += 1
                if fail_count >= 3:
                    print(f"[FAIL] {r['cfg']['ip']} too many retries → restarting service")
                    os._exit(1)  # ← start_rfid.py จะ restart ทั้ง process ใหม่
            else:
                fail_count = 0
        time.sleep(5)
        
# ===== FASTAPI =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {len(readers)} readers...")
    for i, r in enumerate(readers):
        cfg = r["cfg"]
        threading.Thread(target=reconnect_loop, args=(r,), daemon=True).start()
        print(f"  [{i}] {cfg['type']} @ {cfg['ip']}")
    yield
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ===== ROUTES =====
@app.get("/status")
def status():
    return {"readers": [
        {
            "index": i,
            "type":      r["cfg"]["type"],
            "ip":        r["cfg"]["ip"],
            "connected": r["connected"],
        }
        for i, r in enumerate(readers)
    ]}

@app.get("/tags/{index}")
def get_tags(index: int):
    if index >= len(readers):
        return {"error": "Reader not found"}
    r = readers[index]
    return {"tags": r["last_tags"], "count": len(r["last_tags"])}

@app.post("/restart")
def restart():
    def do_restart():
        time.sleep(1)
        os.kill(os.getpid(), signal.SIGTERM)
    threading.Thread(target=do_restart, daemon=True).start()
    return {"result": "OK"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
