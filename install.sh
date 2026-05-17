#!/bin/bash
# TARRIFIC HOSTING BOT - INSTALL SCRIPT

echo "Installing TARRIFIC HOSTING BOT..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js not found! Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Create directories
mkdir -p database hosted_bots logs media

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if welcome image exists
if [ ! -f "media/welcome.jpg" ]; then
    echo "WARNING: media/welcome.jpg not found!"
    echo "Please add a welcome image before starting."
fi

# Check config
echo ""
echo "IMPORTANT: Edit config.js before starting!"
echo "1. Add your bot token"
echo "2. Set your admin ID"
echo "3. Set force join channels"
echo "4. Set proof channel"
echo ""
echo "Start with: npm start"
echo "Or with PM2: npm run pm2"
