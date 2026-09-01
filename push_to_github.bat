@echo off
echo ===================================================
echo Pushing Voice Data Collector Project to GitHub
echo ===================================================

set GIT_PATH="C:\Program Files\Git\cmd\git.exe"
if exist %GIT_PATH% (
    set GIT_CMD=%GIT_PATH%
) else (
    set GIT_CMD=git
)

echo Initializing Git repository...
%GIT_CMD% init

echo Adding remote repository...
%GIT_CMD% remote remove origin >nul 2>&1
%GIT_CMD% remote add origin https://github.com/probat1/Voice-data-collector.git

echo Staging all updated files...
%GIT_CMD% add .

echo Committing changes...
%GIT_CMD% commit -m "Complete upgrade: Guided session, live audio visualizer, silence splitter, local sandbox mode, speaker search engine & Supabase schema"

echo Renaming branch to main...
%GIT_CMD% branch -M main

echo Pushing to GitHub repository...
%GIT_CMD% push -u origin main

echo ===================================================
echo Done! Code pushed to https://github.com/probat1/Voice-data-collector
echo ===================================================
pause
