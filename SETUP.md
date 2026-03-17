# HyperEdit Setup & Usage Guide

This guide describes how to get HyperEdit running on a new machine and how to manage the development servers.

## Quick Start (New Machine)

If you have just cloned this repository, run the following commands in order:

1.  **Install Node Dependencies**:
    ```bash
    npm install --legacy-peer-deps
    ```
2.  **Install Python Dependencies (for Transcription)**:
    ```bash
    pip install openai-whisper torch
    ```
3.  **Configure Environment**:
    Create a `.dev.vars` file in the root directory and add your API keys:
    ```text
    GEMINI_API_KEY=your_key_here
    OPENAI_API_KEY=your_key_here
    FAL_API_KEY=your_key_here
    GIPHY_API_KEY=your_key_here
    ```

## Starting the App

You need two terminals running simultaneously:

**Terminal 1: Vite Dev Server**
```bash
npm run dev
```

**Terminal 2: FFmpeg Server**
```bash
npm run ffmpeg-server
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Stopping the App

### Normal Stop
In both terminals, press **`Ctrl+C`**.

### Manual Force Stop (If port is already in use)
If you see an `EADDRINUSE` error, the process might still be running in the background. Run these commands in a PowerShell terminal:

**To kill FFmpeg Server (Port 3333):**
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3333).OwningProcess -Force
```

**To kill Vite Server (Port 5173):**
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess -Force
```

## How Whisper Transcription Works

We've implemented a robust, three-tier fallback system for video transcription:

1.  **Local Whisper (Primary & Free)**: The server first checks if `openai-whisper` is installed locally via Python. If found, it uses your local CPU to transcribe the video. This is completely free and very accurate for word-level timestamps.
2.  **OpenAI Whisper API (Secondary)**: If local Whisper is not available, the server attempts to use the OpenAI API. This requires a valid `OPENAI_API_KEY`.
3.  **Gemini API (Final Fallback)**: If both of the above fail, it sends the audio to Gemini. While Gemini is smart, its timestamps can "drift" more than Whisper's, so local Whisper is the preferred method for perfectly synced captions.

### Why we updated the code:
-   **Windows/Unix Support**: The code now checks for both `python3` and `python` commands to ensure it works on all operating systems.
-   **Graceful Degradation**: If an API key is invalid or a local installation is missing, the server won't crash; it will simply try the next available method and log the fallback in the terminal.
