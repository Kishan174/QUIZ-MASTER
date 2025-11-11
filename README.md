# Real-time Quiz App (Manual Questions)

This is a real-time quiz where multiple users can join a contest, answer manually-added questions, and compete on a live leaderboard that updates instantly.

Features
- Real-time with Socket.IO
- Manual question management (add/edit questions in `questions.json`)
- Live leaderboard with scores
- Speed-based scoring system (faster correct answers = more points)

Quick start (Windows)

1. Install dependencies

Use `cmd.exe` to bypass PowerShell execution policy:

```cmd
cd /d d:"QUIZ APP"
npm install
```

2. Customize questions

Edit `questions.json` to add or modify questions. Each question should have:
- `id`: Unique identifier (e.g., "q11")
- `text`: Question text
- `choices`: Array of exactly 4 answer options
- `answerIndex`: 0-3, the index of the correct answer

Example:
```json
{
  "id": "q11",
  "text": "What is the capital of Japan?",
  "choices": ["Tokyo", "Osaka", "Kyoto", "Hiroshima"],
  "answerIndex": 0
}
```

3. Start the server

```cmd
npm start
```

Or from PowerShell (if restricted), run via `cmd`:

```powershell
cmd /c "cd /d 'd:QUIZ APP' && npm start"
```

4. Open multiple browser tabs to `http://localhost:3000`, create a contest in one tab, join with other tabs, then start the contest as the host.

Notes & next steps
- This app uses an in-memory store (no DB). For production, persist contests and users in a datastore.
- Questions are loaded from `questions.json` at server startup. Restart the server to pick up new questions.
- Scoring is speed-based: faster correct answers score higher (base 5 points + remaining seconds).
- Improve anti-cheat, analytics, and admin controls as needed.

Files created
- `server.js` — Node/Express + Socket.IO server and contest logic
- `public/index.html` and `public/client.js` — minimal client UI
- `package.json` — dependencies and scripts
- `questions.json` — manually-added quiz questions (edit this to customize)


