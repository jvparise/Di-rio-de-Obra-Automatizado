@echo off
cd /d "%~dp0"
node bot.js >> "%~dp0bot_output.txt" 2>&1
