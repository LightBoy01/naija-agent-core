import subprocess
import json
import time
import requests
import os

# --- Configuration ---
API_URL = "https://your-railway-api-url.com/bridge/sms"
API_KEY = "your-admin-api-key"
PHONE_ID = "your-whatsapp-phone-id" # To identify your business
CHECK_INTERVAL = 30 # Seconds

def get_latest_sms():
    try:
        # Requires Termux:API app and 'pkg install termux-api'
        result = subprocess.run(['termux-sms-list', '-l', '5'], capture_output=True, text=True)
        if result.returncode != 0:
            print("Error running termux-sms-list. Is Termux:API installed?")
            return []
        return json.loads(result.stdout)
    except Exception as e:
        print(f"Failed to fetch SMS: {e}")
        return []

def forward_sms(sms):
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "from": sms['number'],
        "body": sms['body'],
        "timestamp": int(time.time() * 1000), # Simple timestamp
        "phoneId": PHONE_ID
    }
    
    try:
        response = requests.post(API_URL, json=payload, headers=headers)
        if response.status_code == 200:
            print(f"✅ Forwarded alert from {sms['number']}")
            return True
        else:
            print(f"❌ Failed to forward: {response.text}")
            return False
    except Exception as e:
        print(f"Request failed: {e}")
        return False

def main():
    print(f"🚀 Naija Agent Bridge Starting... (Watching for SMS every {CHECK_INTERVAL}s)")
    processed_ids = set()

    while True:
        messages = get_latest_sms()
        for msg in messages:
            msg_id = f"{msg['number']}_{msg['received']}" # Composite ID
            
            # Simple keyword filter for Nigerian bank alerts
            keywords = ["Amt", "Credit", "Cr:", "Bal:", "Transfer", "Received"]
            if any(k.lower() in msg['body'].lower() for k in keywords):
                if msg_id not in processed_ids:
                    if forward_sms(msg):
                        processed_ids.add(msg_id)
        
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    main()
