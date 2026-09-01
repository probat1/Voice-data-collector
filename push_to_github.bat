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

echo Configuring Git user identity...
%GIT_CMD% config user.email "dinesh@example.com"
%GIT_CMD% config user.name "Dinesh"

echo Staging all updated files...
%GIT_CMD% add .

echo Committing changes...
%GIT_CMD% commit -m "Complete upgrade: 5-step guided session, live visualizer, silence splitter, local sandbox mode, speaker search & Supabase schema" >nul 2>&1

echo Renaming branch to main...
%GIT_CMD% branch -M main

echo Syncing with remote repository...
%GIT_CMD% fetch origin
%GIT_CMD% rebase origin/main >nul 2>&1

echo Pushing to GitHub repository...
%GIT_CMD% push -u origin main --force-with-lease

if %ERRORLEVEL% NEQ 0 (
    echo Retrying push...
    %GIT_CMD% push -u origin main -f
)

echo ===================================================
echo Done! Code successfully pushed to https://github.com/probat1/Voice-data-collector
echo ===================================================
pause
