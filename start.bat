@echo off
echo Starting SnapSignFit local server at http://localhost:3000 ...
start http://localhost:3000
node tests/serve.cjs
pause
