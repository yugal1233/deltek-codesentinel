#!/bin/bash

# Quick Test Script for AI Code Review Bot
# This script helps you run your first test quickly

echo "🤖 AI Code Review Bot - Quick Test Setup"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: You need to add your Anthropic API key!"
    echo ""
    echo "Please edit the .env file and add your ANTHROPIC_API_KEY:"
    echo "  nano .env  (or use your preferred editor)"
    echo ""
    echo "Get your API key from: https://console.anthropic.com/"
    echo ""
    read -p "Press Enter after you've added your API key..."
fi

# Check if API key is set
source .env
if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "sk-ant-your-anthropic-api-key-here" ]; then
    echo "❌ ANTHROPIC_API_KEY is not set in .env file"
    echo "Please edit .env and add your actual API key"
    exit 1
fi

echo "✓ API key found"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✓ Dependencies installed"
    echo ""
fi

echo "🧪 Running test with sample code files..."
echo ""
echo "This will:"
echo "  1. Load sample files with intentional bugs"
echo "  2. Send them to Claude AI for review"
echo "  3. Display the results"
echo ""
echo "Expected cost: ~$0.02-$0.05"
echo ""
read -p "Press Enter to continue..."
echo ""

# Run the test
npm test

echo ""
echo "✅ Test complete!"
echo ""
echo "Next steps:"
echo "  1. Review the results above"
echo "  2. If successful, you're ready to deploy!"
echo "  3. See README.md for deployment instructions"
echo ""
