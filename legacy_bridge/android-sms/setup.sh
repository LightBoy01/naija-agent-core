#!/bin/bash

echo -e "\n🚀 --- NAIJA AGENT BRIDGE SETUP --- 🚀"
echo "Setting up your device to detect bank alerts..."

# 1. Update and Install Dependencies
echo "📦 Installing system dependencies..."
pkg update -y
pkg install -y python termux-api

# 2. Install Python Requests
echo "📦 Installing Python libraries..."
pip install requests

# 3. Final Instructions
echo -e "\n✅ SETUP COMPLETE!"
echo "------------------------------------------------"
echo "STEP 1: Ensure you have the 'Termux:API' app installed from Play Store/F-Droid."
echo "STEP 2: Start your bridge by running:"
echo "        python sms_bridge.py"
echo "------------------------------------------------"
