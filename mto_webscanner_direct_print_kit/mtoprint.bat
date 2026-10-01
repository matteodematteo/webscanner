@echo off
title Printing System Launcher

:: Go to the exact folder where your python script is
cd /d "C:\Users\LG\desktop"

echo Starting Python Server and Ngrok Tunnel...

start "Python Print Server" cmd /k "python print.py"
start "Ngrok Tunnel" cmd /k "[NGROK_URL] 5000"
