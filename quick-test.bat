@echo off
setlocal enabledelayedexpansion

REM Quick Test Script for AI Code Review Bot (Windows)
REM This script helps you run your first test quickly

echo.
echo ====================================
echo AI Code Review Bot - Quick Test
echo ====================================
echo.

REM Check if .env exists
if not exist .env (
    echo Creating .env file...
    copy .env.example .env >nul
    echo Done: .env file created
    echo.
    echo IMPORTANT: You need to add your Anthropic API key!
    echo.
    echo Please edit the .env file and add your ANTHROPIC_API_KEY
    echo You can use: notepad .env
    echo.
    echo Get your API key from: https://console.anthropic.com/
    echo.
    pause
)

REM Check if node_modules exists
if not exist node_modules (
    echo.
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
    echo Done: Dependencies installed
    echo.
)

echo.
echo Running test with sample code files...
echo.
echo This will:
echo   1. Load sample files with intentional bugs
echo   2. Send them to Claude AI for review
echo   3. Display the results
echo.
echo Expected cost: ~$0.02-$0.05
echo.
pause
echo.

REM Run the test
call npm test

echo.
echo ====================================
echo Test Complete!
echo ====================================
echo.
echo Next steps:
echo   1. Review the results above
echo   2. If successful, you're ready to deploy
echo   3. See README.md for deployment instructions
echo.
pause
