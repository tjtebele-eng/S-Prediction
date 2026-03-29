# GoalCast

A lightweight soccer prediction website backed by football-data.org.

## Setup

1. Get a football-data.org API token.
2. Optional: get a Google AI Studio API key, an OpenAI API key, or both if you want AI match analysis on the detail cards.
3. Create a local `.env` file in the project root.
4. Add your keys:

```env
API_FOOTBALL_KEY=your_api_key_here
API_AUTH_HEADER=X-Auth-Token
API_FOOTBALL_BASE_URL=https://api.football-data.org/v4
GOOGLE_AI_API_KEY=your_google_ai_key_here
GOOGLE_AI_MODEL=gemini-2.5-flash
GOOGLE_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

You can copy the sample file first:

```powershell
Copy-Item .env.example .env
```

5. Start the local server:

```powershell
python server.py
```

6. Open `http://127.0.0.1:8000`

## Notes

- The frontend calls `/api/matches`, not football-data.org directly, so your key stays on the server.
- `server.py` now reads `.env` automatically, so you do not need to hardcode the token in frontend files.
- The request auth header is configurable through `API_AUTH_HEADER`; the current setup uses `X-Auth-Token`.
- `.env` is ignored by git, and `.env.example` shows the expected keys.
- The server requests fixtures for Premier League, La Liga, Serie A, Bundesliga, Ligue 1, UEFA Champions League, and the South African Premiership.
- Use the date picker on the board to request fixtures for a specific day.
- Use the league multiselect to choose exactly which competitions should be queried.
- The prediction engine now uses a local statistical model built from recent form, head-to-head history, league position, goals scored/conceded, and home-vs-away splits.
- football-data.org does not provide injuries, suspensions, lineup news, or betting market movement in this app's current feed, so those signals are only used if you add them manually through your local admin overrides and then generate AI analysis.
- AI explanations are optional and use `/api/ai-analysis` when `GOOGLE_AI_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY` is present.
- If both Google AI and OpenAI are configured, the app tries Google AI first and falls back to OpenAI if the Google request fails.
- The board now shows AI-ready badges on cards and includes a `Generate AI For Visible` action for the current page of matches.
