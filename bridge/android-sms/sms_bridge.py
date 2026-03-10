import subprocess
import json
import time
import requests
import os
import sys

# --- Merchant-Ready Configuration (Phase 5.13) ---
CONFIG_FILE = "config.json"

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return None

def save_config(api_url, bridge_secret):
    config = {
        "api_url": api_url.rstrip('/'),
        "bridge_secret": bridge_secret,
        "check_interval": 30,
        "heartbeat_interval": 300 # 5 minutes
    }
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)
    return config

def get_latest_sms():
    try:
        # Requires Termux:API app and 'pkg install termux-api'
        result = subprocess.run(['termux-sms-list', '-l', '10'], capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Error: Is Termux:API installed?")
            return []
        return json.loads(result.stdout)
    except Exception as e:
        print(f"❌ Failed to fetch SMS: {e}")
        return []

def forward_sms(config, sms):
    headers = {
        "x-bridge-secret": config['bridge_secret'],
        "Content-Type": "application/json"
    }
    payload = {
        "from": sms['number'],
        "body": sms['body'],
        "timestamp": int(time.time() * 1000)
    }
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            url = f"{config['api_url']}/bridge/sms"
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            if response.status_code == 200:
                print(f"✅ Forwarded alert from {sms['number']}")
                return True
            elif response.status_code == 403:
                print("❌ Auth Failed: Check your Bridge Secret.")
                return False # Don't retry auth errors
            else:
                print(f"⚠️ Attempt {attempt+1} failed ({response.status_code})")
        except Exception as e:
            print(f"❌ Attempt {attempt+1} connection failed: {e}")
        
        if attempt < max_retries - 1:
            wait = (attempt + 1) * 5
            print(f"🔄 Retrying in {wait}s...")
            time.sleep(wait)
            
    return False

def send_heartbeat(config):
    headers = {
        "x-bridge-secret": config['bridge_secret'],
        "Content-Type": "application/json"
    }
    try:
        url = f"{config['api_url']}/bridge/heartbeat"
        response = requests.post(url, json={}, headers=headers, timeout=10)
        if response.status_code == 200:
            print("💓 Heartbeat sent.")
            return True
    except:
        pass
    return False

def main():
    print("\n🚀 --- NAIJA AGENT BRIDGE --- 🚀")
    config = load_config()

    if not config:
        print("\nWelcome! Let's set up your business bridge.")
        api_url = input("Enter your Dashboard API URL: ").strip()
        bridge_secret = input("Enter your Bridge Secret: ").strip()
        config = save_config(api_url, bridge_secret)
        print("✅ Configuration saved to config.json\n")

    print(f"Watching for bank alerts for secret: {config['bridge_secret'][:4]}***")
    processed_ids = set()
    last_heartbeat = 0

    while True:
        now = time.time()
        
        # 1. Heartbeat
        if now - last_heartbeat > config['heartbeat_interval']:
            send_heartbeat(config)
            last_heartbeat = now

        # 2. Check SMS
        messages = get_latest_sms()
        for msg in messages:
            msg_id = f"{msg['number']}_{msg['received']}"
            
            # Smart Filter for Nigerian alerts
            keywords = ["Amt", "Credit", "Cr:", "Bal:", "Transfer", "Received", "Inflow"]
            if any(k.lower() in msg['body'].lower() for k in keywords):
                if msg_id not in processed_ids:
                    if forward_sms(config, msg):
                        processed_ids.add(msg_id)
        
        time.sleep(config['check_interval'])

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Bridge stopped by user.")
        sys.exit(0)
