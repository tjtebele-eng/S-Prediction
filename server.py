import json
import mimetypes
import os
import statistics
import urllib.error
import urllib.parse
import urllib.request
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


ROOT = Path(__file__).parent.resolve()


def load_env_file(path):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key:
            os.environ[key] = value


load_env_file(ROOT / ".env")

API_BASE_URL = os.getenv("API_FOOTBALL_BASE_URL", "https://api.football-data.org/v4")
API_KEY = os.getenv("API_FOOTBALL_KEY", "") or os.getenv("API_AUTH_TOKEN", "")
API_AUTH_HEADER = os.getenv("API_AUTH_HEADER", "x-apisports-key")
GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
GOOGLE_AI_BASE_URL = os.getenv("GOOGLE_AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
GOOGLE_AI_MODEL = os.getenv("GOOGLE_AI_MODEL", "gemini-2.5-flash")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
DEFAULT_LEAGUES = {
    "Premier League": "PL",
    "La Liga": "PD",
    "Serie A": "SA",
    "Bundesliga": "BL1",
    "Ligue 1": "FL1",
    "UEFA Champions League": "CL",
    "South African Premiership": "PPL",
}
CACHE_TTL_SECONDS = 300
API_CACHE = {}


def get_ai_status():
    providers = []

    if GOOGLE_AI_API_KEY:
        providers.append({
            "id": "google",
            "label": "Google AI",
            "model": GOOGLE_AI_MODEL,
        })

    if OPENAI_API_KEY:
        providers.append({
            "id": "openai",
            "label": "OpenAI",
            "model": OPENAI_MODEL,
        })

    return {
        "enabled": bool(providers),
        "providers": providers,
        "preferredProvider": providers[0]["id"] if providers else None,
    }


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def safe_divide(value, divisor, fallback=0.0):
    if not divisor:
        return fallback
    return value / divisor


def parse_request_json(handler):
    content_length = int(handler.headers.get("Content-Length", "0") or 0)
    if content_length <= 0:
        return {}

    raw_body = handler.rfile.read(content_length)
    if not raw_body:
        return {}

    return json.loads(raw_body.decode("utf-8"))


def api_get(path, params=None):
    if not API_KEY:
        raise RuntimeError("Missing API_FOOTBALL_KEY or API_AUTH_TOKEN environment variable.")

    params = params or {}
    cache_key = (path, tuple(sorted(params.items())))
    cached_entry = API_CACHE.get(cache_key)
    now = time.time()

    if cached_entry and now - cached_entry["timestamp"] < CACHE_TTL_SECONDS:
        return cached_entry["payload"]

    query = urllib.parse.urlencode(params)
    url = f"{API_BASE_URL}{path}"
    if query:
        url = f"{url}?{query}"

    request = urllib.request.Request(
        url,
        headers={
            API_AUTH_HEADER: API_KEY,
        },
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)

    API_CACHE[cache_key] = {
        "timestamp": now,
        "payload": payload,
    }
    return payload


def get_scoreline(match):
    score = match.get("score", {})
    full_time = score.get("fullTime", {})
    home_goals = full_time.get("home")
    away_goals = full_time.get("away")

    if home_goals is None or away_goals is None:
        return "vs"

    return f"{home_goals} - {away_goals}"


def get_match_status(match):
    return match.get("status", "")


def get_full_time_goals(match):
    score = match.get("score", {})
    full_time = score.get("fullTime", {})
    return (
        full_time.get("home"),
        full_time.get("away"),
    )


def get_standings_index(league_code):
    payload = api_get(f"/competitions/{league_code}/standings")
    standings_groups = payload.get("standings", [])
    chosen_group = None

    for group in standings_groups:
        if group.get("type") == "TOTAL":
            chosen_group = group
            break

    if chosen_group is None and standings_groups:
        chosen_group = standings_groups[0]

    index = {}
    for row in (chosen_group or {}).get("table", []):
        team = row.get("team", {})
        team_id = team.get("id")
        if not team_id:
            continue

        played_games = row.get("playedGames") or 0
        index[team_id] = {
            "position": row.get("position") or 0,
            "playedGames": played_games,
            "points": row.get("points") or 0,
            "won": row.get("won") or 0,
            "draw": row.get("draw") or 0,
            "lost": row.get("lost") or 0,
            "goalsFor": row.get("goalsFor") or 0,
            "goalsAgainst": row.get("goalsAgainst") or 0,
            "goalDifference": row.get("goalDifference") or 0,
            "pointsPerMatch": safe_divide(row.get("points") or 0, played_games),
            "goalsForPerMatch": safe_divide(row.get("goalsFor") or 0, played_games),
            "goalsAgainstPerMatch": safe_divide(row.get("goalsAgainst") or 0, played_games),
            "goalDifferencePerMatch": safe_divide(row.get("goalDifference") or 0, played_games),
        }

    return index


def get_head_to_head(match_id, last=3):
    try:
        payload = api_get(f"/matches/{match_id}/head2head", {"limit": last})
        return payload.get("matches", [])
    except Exception:
        return []


def get_last_results(team_id, last=5):
    try:
        payload = api_get(
            f"/teams/{team_id}/matches",
            {
                "status": "FINISHED",
                "last": last,
                "limit": last,
            },
        )
        return payload.get("matches", [])
    except Exception:
        return []


def summarize_team_results(results, team_id):
    summary = {
        "matches": 0,
        "points": 0,
        "wins": 0,
        "draws": 0,
        "losses": 0,
        "goalsFor": 0,
        "goalsAgainst": 0,
        "homeMatches": 0,
        "homePoints": 0,
        "homeGoalsFor": 0,
        "homeGoalsAgainst": 0,
        "awayMatches": 0,
        "awayPoints": 0,
        "awayGoalsFor": 0,
        "awayGoalsAgainst": 0,
    }

    for item in results:
        home_goals, away_goals = get_full_time_goals(item)
        if home_goals is None or away_goals is None:
            continue

        is_home = item.get("homeTeam", {}).get("id") == team_id
        team_goals = home_goals if is_home else away_goals
        conceded_goals = away_goals if is_home else home_goals

        summary["matches"] += 1
        summary["goalsFor"] += team_goals
        summary["goalsAgainst"] += conceded_goals

        if team_goals > conceded_goals:
            summary["wins"] += 1
            summary["points"] += 3
            match_points = 3
        elif team_goals == conceded_goals:
            summary["draws"] += 1
            summary["points"] += 1
            match_points = 1
        else:
            summary["losses"] += 1
            match_points = 0

        venue_key = "home" if is_home else "away"
        summary[f"{venue_key}Matches"] += 1
        summary[f"{venue_key}Points"] += match_points
        summary[f"{venue_key}GoalsFor"] += team_goals
        summary[f"{venue_key}GoalsAgainst"] += conceded_goals

    summary["pointsPerMatch"] = safe_divide(summary["points"], summary["matches"])
    summary["goalsForPerMatch"] = safe_divide(summary["goalsFor"], summary["matches"])
    summary["goalsAgainstPerMatch"] = safe_divide(summary["goalsAgainst"], summary["matches"])
    summary["goalDifferencePerMatch"] = safe_divide(
        summary["goalsFor"] - summary["goalsAgainst"],
        summary["matches"],
    )
    summary["homePointsPerMatch"] = safe_divide(summary["homePoints"], summary["homeMatches"])
    summary["awayPointsPerMatch"] = safe_divide(summary["awayPoints"], summary["awayMatches"])
    summary["homeGoalsForPerMatch"] = safe_divide(summary["homeGoalsFor"], summary["homeMatches"])
    summary["homeGoalsAgainstPerMatch"] = safe_divide(summary["homeGoalsAgainst"], summary["homeMatches"])
    summary["awayGoalsForPerMatch"] = safe_divide(summary["awayGoalsFor"], summary["awayMatches"])
    summary["awayGoalsAgainstPerMatch"] = safe_divide(summary["awayGoalsAgainst"], summary["awayMatches"])
    return summary


def summarize_head_to_head(results, home_team_id, away_team_id):
    summary = {
        "matches": 0,
        "homeWins": 0,
        "awayWins": 0,
        "draws": 0,
        "homeGoals": 0,
        "awayGoals": 0,
    }

    for item in results:
        home_goals, away_goals = get_full_time_goals(item)
        if home_goals is None or away_goals is None:
            continue

        item_home_id = item.get("homeTeam", {}).get("id")
        item_away_id = item.get("awayTeam", {}).get("id")
        mapped_home_goals = 0
        mapped_away_goals = 0

        if item_home_id == home_team_id and item_away_id == away_team_id:
            mapped_home_goals = home_goals
            mapped_away_goals = away_goals
        elif item_home_id == away_team_id and item_away_id == home_team_id:
            mapped_home_goals = away_goals
            mapped_away_goals = home_goals
        else:
            continue

        summary["matches"] += 1
        summary["homeGoals"] += mapped_home_goals
        summary["awayGoals"] += mapped_away_goals

        if mapped_home_goals > mapped_away_goals:
            summary["homeWins"] += 1
        elif mapped_home_goals < mapped_away_goals:
            summary["awayWins"] += 1
        else:
            summary["draws"] += 1

    summary["goalDeltaPerMatch"] = safe_divide(
        summary["homeGoals"] - summary["awayGoals"],
        summary["matches"],
    )
    return summary


def build_prediction_note(home_team, away_team, home_standing, away_standing, home_form, away_form, h2h_summary):
    reasons = []

    if home_standing and away_standing:
        position_gap = (away_standing.get("position") or 0) - (home_standing.get("position") or 0)
        if abs(position_gap) >= 3:
            leader = home_team if position_gap > 0 else away_team
            reasons.append(f"{leader} carry the stronger league position.")

    form_gap = home_form.get("pointsPerMatch", 0) - away_form.get("pointsPerMatch", 0)
    if abs(form_gap) >= 0.35:
        leader = home_team if form_gap > 0 else away_team
        reasons.append(f"{leader} arrive with better recent form.")

    venue_gap = home_form.get("homePointsPerMatch", 0) - away_form.get("awayPointsPerMatch", 0)
    if abs(venue_gap) >= 0.4:
        reasons.append(f"{home_team} hold the stronger home-vs-away split.")

    goal_gap = (
        home_form.get("goalsForPerMatch", 0) - away_form.get("goalsAgainstPerMatch", 0)
        - (away_form.get("goalsForPerMatch", 0) - home_form.get("goalsAgainstPerMatch", 0))
    )
    if abs(goal_gap) >= 0.3:
        leader = home_team if goal_gap > 0 else away_team
        reasons.append(f"{leader} rate better on scoring and concession trend.")

    if h2h_summary.get("matches"):
        if h2h_summary.get("homeWins", 0) > h2h_summary.get("awayWins", 0):
            reasons.append(f"{home_team} have had the better head-to-head run recently.")
        elif h2h_summary.get("awayWins", 0) > h2h_summary.get("homeWins", 0):
            reasons.append(f"{away_team} have edged the recent head-to-head meetings.")

    if not reasons:
        reasons.append("The matchup looks balanced, so the model leans on recent scoring and venue strength.")

    return " ".join(reasons[:3])


def build_statistical_prediction(fixture, standings_index, team_results_cache):
    home_team = fixture["homeTeam"]
    away_team = fixture["awayTeam"]
    home_team_id = home_team.get("id")
    away_team_id = away_team.get("id")

    home_results = team_results_cache.get(home_team_id) or []
    away_results = team_results_cache.get(away_team_id) or []
    home_form = summarize_team_results(home_results, home_team_id)
    away_form = summarize_team_results(away_results, away_team_id)
    home_standing = standings_index.get(home_team_id, {})
    away_standing = standings_index.get(away_team_id, {})
    h2h_results = []
    h2h_summary = summarize_head_to_head(h2h_results, home_team_id, away_team_id)

    home_strength = (
        0.30 * home_standing.get("pointsPerMatch", 1.2)
        + 0.18 * home_standing.get("goalDifferencePerMatch", 0)
        + 0.25 * home_form.get("pointsPerMatch", 1.0)
        + 0.18 * home_form.get("homePointsPerMatch", home_form.get("pointsPerMatch", 1.0))
        + 0.09 * h2h_summary.get("goalDeltaPerMatch", 0)
    )
    away_strength = (
        0.30 * away_standing.get("pointsPerMatch", 1.2)
        + 0.18 * away_standing.get("goalDifferencePerMatch", 0)
        + 0.25 * away_form.get("pointsPerMatch", 1.0)
        + 0.18 * away_form.get("awayPointsPerMatch", away_form.get("pointsPerMatch", 1.0))
        - 0.09 * h2h_summary.get("goalDeltaPerMatch", 0)
    )

    home_expected = clamp(
        1.15
        + 0.34 * home_form.get("goalsForPerMatch", 1.1)
        + 0.24 * away_form.get("goalsAgainstPerMatch", 1.1)
        + 0.18 * home_form.get("homeGoalsForPerMatch", home_form.get("goalsForPerMatch", 1.1))
        + 0.14 * home_standing.get("goalDifferencePerMatch", 0)
        + 0.12 * h2h_summary.get("goalDeltaPerMatch", 0),
        0.4,
        3.6,
    )
    away_expected = clamp(
        0.88
        + 0.34 * away_form.get("goalsForPerMatch", 1.0)
        + 0.24 * home_form.get("goalsAgainstPerMatch", 1.0)
        + 0.18 * away_form.get("awayGoalsForPerMatch", away_form.get("goalsForPerMatch", 1.0))
        + 0.14 * away_standing.get("goalDifferencePerMatch", 0)
        - 0.12 * h2h_summary.get("goalDeltaPerMatch", 0),
        0.3,
        3.2,
    )

    expected_gap = home_expected - away_expected
    strength_gap = home_strength - away_strength + 0.22
    confidence = round(clamp(54 + abs(expected_gap) * 12 + abs(strength_gap) * 9, 52, 84))

    projected_home = int(round(home_expected))
    projected_away = int(round(away_expected))

    if abs(expected_gap) < 0.22:
        winner = "Draw"
        projected_home = max(0, int(round(statistics.mean([home_expected, away_expected]))))
        projected_away = projected_home
    elif expected_gap > 0:
        winner = f"{home_team['name']} win"
    else:
        winner = f"{away_team['name']} win"

    score = f"{projected_home} - {projected_away}"
    note = build_prediction_note(
        home_team["name"],
        away_team["name"],
        home_standing,
        away_standing,
        home_form,
        away_form,
        h2h_summary,
    )

    return {
        "winner": winner,
        "advice": note,
        "confidence": confidence,
        "score": score,
        "model": {
            "homeForm": home_form,
            "awayForm": away_form,
            "homeStanding": home_standing,
            "awayStanding": away_standing,
            "headToHead": h2h_summary,
            "expectedGoals": {
                "home": round(home_expected, 2),
                "away": round(away_expected, 2),
            },
            "signalSummary": [
                "team form",
                "recent results",
                "head-to-head history",
                "league position",
                "goals scored/conceded",
                "home vs away strength",
            ],
            "missingSignals": [
                "injuries",
                "suspensions",
                "lineup news",
                "betting market movement",
            ],
        },
    }


def transform_fixture(fixture, prediction):
    competition = fixture["competition"]
    home_team = fixture["homeTeam"]
    away_team = fixture["awayTeam"]
    area_name = fixture.get("area", {}).get("name", "")
    home = home_team["name"]
    away = away_team["name"]

    prediction = prediction or {
        "winner": "Draw",
        "advice": "Model data was incomplete for this fixture.",
        "confidence": 52,
        "score": "1 - 1",
        "model": {
            "signalSummary": [],
            "missingSignals": [],
        },
    }

    return {
        "fixtureId": fixture["id"],
        "league": competition["name"],
        "country": area_name,
        "countryCode": fixture.get("area", {}).get("code", ""),
        "countryFlag": fixture.get("area", {}).get("flag"),
        "leagueCode": competition.get("code", ""),
        "leagueLogo": competition.get("emblem"),
        "homeTeamId": home_team["id"],
        "awayTeamId": away_team["id"],
        "home": home,
        "away": away,
        "homeLogo": home_team.get("crest"),
        "awayLogo": away_team.get("crest"),
        "kickoffIso": fixture["utcDate"],
        "status": get_match_status(fixture),
        "liveScore": get_scoreline(fixture),
        "prediction": prediction["winner"],
        "score": prediction["score"],
        "confidence": prediction["confidence"],
        "note": prediction["advice"],
        "market": "GoalCast statistical model",
        "modelSignals": prediction.get("model", {}),
        "headToHead": [],
        "lastResults": {
            "home": [],
            "away": [],
        },
    }

def format_last_results(results, team_id):
    return [
        {
            "opponent": item["awayTeam"]["name"] if item["homeTeam"]["id"] == team_id else item["homeTeam"]["name"],
            "result": (
                "W"
                if (
                    (
                        item["homeTeam"]["id"] == team_id
                        and (item.get("score", {}).get("fullTime", {}).get("home") or 0) > (item.get("score", {}).get("fullTime", {}).get("away") or 0)
                    )
                    or (
                        item["awayTeam"]["id"] == team_id
                        and (item.get("score", {}).get("fullTime", {}).get("away") or 0) > (item.get("score", {}).get("fullTime", {}).get("home") or 0)
                    )
                )
                else "D"
                if (item.get("score", {}).get("fullTime", {}).get("home") == item.get("score", {}).get("fullTime", {}).get("away"))
                else "L"
            ),
            "score": get_scoreline(item),
        }
        for item in results
    ]


def fetch_matches(selected_date=None, selected_leagues=None):
    today = selected_date or datetime.now(timezone.utc).date()
    collected = []
    chosen_leagues = selected_leagues or list(DEFAULT_LEAGUES.keys())
    next_day = today + timedelta(days=1)
    chosen_codes = {DEFAULT_LEAGUES.get(league_name) for league_name in chosen_leagues}
    chosen_codes.discard(None)

    payload = api_get(
        "/matches",
        {
            "dateFrom": today.isoformat(),
            "dateTo": next_day.isoformat(),
        },
    )
    response = payload.get("matches", [])

    for fixture in response:
        if fixture.get("status") == "FINISHED":
            continue

        competition_code = fixture.get("competition", {}).get("code")
        if chosen_codes and competition_code not in chosen_codes:
            continue

        prediction = build_statistical_prediction(fixture, {}, {})
        collected.append(transform_fixture(fixture, prediction))

    collected.sort(key=lambda match: (match["kickoffIso"], match["league"], match["home"]))
    return collected


def fetch_match_details(fixture_id, home_team_id, away_team_id):
    head_to_head_results = get_head_to_head(fixture_id, last=3)
    home_last_results = get_last_results(home_team_id, last=5)
    away_last_results = get_last_results(away_team_id, last=5)

    return {
        "fixtureId": fixture_id,
        "headToHead": [
            {
                "home": item["homeTeam"]["name"],
                "away": item["awayTeam"]["name"],
                "score": get_scoreline(item),
                "date": item["utcDate"],
                "league": item.get("competition", {}).get("name", ""),
            }
            for item in head_to_head_results
        ],
        "lastResults": {
            "home": format_last_results(home_last_results, home_team_id),
            "away": format_last_results(away_last_results, away_team_id),
        },
    }


def extract_google_ai_output(payload):
    for candidate in payload.get("candidates", []):
        content = candidate.get("content", {})
        for part in content.get("parts", []):
            text_value = part.get("text")
            if isinstance(text_value, str) and text_value.strip():
                return text_value.strip()

    return ""


def extract_openai_output(payload):
    if isinstance(payload.get("output_text"), str) and payload.get("output_text").strip():
        return payload["output_text"].strip()

    for item in payload.get("output", []):
        for content in item.get("content", []):
            text_value = content.get("text")
            if isinstance(text_value, str) and text_value.strip():
                return text_value.strip()

    return ""


def build_ai_prompt_payload(match_payload):
    model_signals = match_payload.get("modelSignals", {})
    return {
        "match": {
            "league": match_payload.get("league"),
            "home": match_payload.get("home"),
            "away": match_payload.get("away"),
            "kickoffIso": match_payload.get("kickoffIso"),
            "prediction": match_payload.get("prediction"),
            "projectedScore": match_payload.get("score"),
            "confidence": match_payload.get("confidence"),
            "status": match_payload.get("status"),
        },
        "signals": {
            "expectedGoals": model_signals.get("expectedGoals", {}),
            "homeStanding": model_signals.get("homeStanding", {}),
            "awayStanding": model_signals.get("awayStanding", {}),
            "homeForm": model_signals.get("homeForm", {}),
            "awayForm": model_signals.get("awayForm", {}),
            "headToHead": model_signals.get("headToHead", {}),
            "signalSummary": model_signals.get("signalSummary", []),
            "missingSignals": model_signals.get("missingSignals", []),
        },
        "details": {
            "headToHead": match_payload.get("headToHead", []),
            "lastResults": match_payload.get("lastResults", {}),
        },
        "contextNote": match_payload.get("adminContext") or match_payload.get("note") or "",
    }


def build_ai_analysis_schema():
    return {
        "type": "object",
        "properties": {
            "headline": {"type": "string"},
            "summary": {"type": "string"},
            "predicted_score": {"type": "string"},
            "confidence_band": {"type": "string", "enum": ["low", "medium", "high"]},
            "key_factors": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 2,
                "maxItems": 4,
            },
            "watchouts": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 3,
            },
            "missing_signals": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "headline",
            "summary",
            "predicted_score",
            "confidence_band",
            "key_factors",
            "watchouts",
            "missing_signals",
        ],
    }


def build_ai_system_instruction():
    return (
        "You are an honest soccer match analyst inside a local prediction dashboard. "
        "Explain likely scorelines using only the supplied data. "
        "Do not invent injuries, suspensions, betting moves, or lineup information. "
        "If signals are missing, say so briefly."
    )


def create_google_ai_analysis(match_payload):
    if not GOOGLE_AI_API_KEY:
        raise RuntimeError("Missing GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable.")

    prompt_payload = build_ai_prompt_payload(match_payload)
    schema = build_ai_analysis_schema()

    request_payload = {
        "system_instruction": {
            "parts": [
                {
                    "text": build_ai_system_instruction()
                }
            ]
        },
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Analyze this soccer fixture for a fan-facing dashboard and respond in JSON.\n"
                            + json.dumps(prompt_payload, ensure_ascii=True)
                        )
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": schema,
            "temperature": 0.8,
            "maxOutputTokens": 400,
        },
    }

    request = urllib.request.Request(
        f"{GOOGLE_AI_BASE_URL.rstrip('/')}/models/{GOOGLE_AI_MODEL}:generateContent",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "x-goog-api-key": GOOGLE_AI_API_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    output_text = extract_google_ai_output(payload)
    if not output_text:
        raise RuntimeError("Google AI returned an empty analysis.")

    analysis = json.loads(output_text)
    analysis["provider"] = "google"
    analysis["model"] = GOOGLE_AI_MODEL
    return analysis


def create_openai_analysis(match_payload):
    if not OPENAI_API_KEY:
        raise RuntimeError("Missing OPENAI_API_KEY environment variable.")

    prompt_payload = build_ai_prompt_payload(match_payload)
    schema = build_ai_analysis_schema()
    request_payload = {
        "model": OPENAI_MODEL,
        "instructions": build_ai_system_instruction(),
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Analyze this soccer fixture for a fan-facing dashboard and respond in JSON.\n"
                            + json.dumps(prompt_payload, ensure_ascii=True)
                        ),
                    }
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "soccer_match_analysis",
                "schema": schema,
                "strict": True,
            },
            "verbosity": "low",
        },
        "max_output_tokens": 400,
    }

    request = urllib.request.Request(
        f"{OPENAI_BASE_URL.rstrip('/')}/responses",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    output_text = extract_openai_output(payload)
    if not output_text:
        raise RuntimeError("OpenAI returned an empty analysis.")

    analysis = json.loads(output_text)
    analysis["provider"] = "openai"
    analysis["model"] = OPENAI_MODEL
    return analysis


def create_ai_analysis(match_payload):
    ai_status = get_ai_status()
    if not ai_status["enabled"]:
        raise RuntimeError("Missing GOOGLE_AI_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY environment variable.")

    provider_errors = []

    if GOOGLE_AI_API_KEY:
        try:
            return create_google_ai_analysis(match_payload)
        except Exception as error:
            provider_errors.append(f"Google AI: {error}")

    if OPENAI_API_KEY:
        try:
            return create_openai_analysis(match_payload)
        except Exception as error:
            provider_errors.append(f"OpenAI: {error}")

    raise RuntimeError("AI analysis failed. " + " | ".join(provider_errors))


def fetch_standings(selected_leagues=None):
    chosen_leagues = selected_leagues or list(DEFAULT_LEAGUES.keys())
    standings_payload = []

    for league_name in chosen_leagues:
        league_code = DEFAULT_LEAGUES.get(league_name)
        if not league_code:
            continue

        try:
            payload = api_get(f"/competitions/{league_code}/standings")
        except Exception:
            continue

        tables = []
        for standing_group in payload.get("standings", []):
            table_rows = []
            for row in standing_group.get("table", [])[:8]:
                team = row.get("team", {})
                table_rows.append({
                    "position": row.get("position"),
                    "team": team.get("shortName") or team.get("name"),
                    "crest": team.get("crest"),
                    "played": row.get("playedGames"),
                    "points": row.get("points"),
                    "goalDifference": row.get("goalDifference"),
                })

            if table_rows:
                tables.append({
                    "stage": standing_group.get("stage", ""),
                    "type": standing_group.get("type", ""),
                    "table": table_rows,
                })

        if tables:
            standings_payload.append({
                "league": payload.get("competition", {}).get("name", league_name),
                "leagueCode": payload.get("competition", {}).get("code", league_code),
                "leagueLogo": payload.get("competition", {}).get("emblem"),
                "country": payload.get("area", {}).get("name", ""),
                "countryFlag": payload.get("area", {}).get("flag"),
                "tables": tables,
            })

    return standings_payload


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/matches":
            self.handle_matches()
            return
        if path == "/api/match-details":
            self.handle_match_details()
            return
        if path == "/api/standings":
            self.handle_standings()
            return

        if path == "/":
            path = "/index.html"

        self.serve_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/ai-analysis":
            self.handle_ai_analysis()
            return

        self.send_error(404)

    def handle_matches(self):
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            selected_date_raw = query.get("date", [None])[0]
            leagues_raw = query.get("leagues", [""])[0]
            selected_date = None
            selected_leagues = []

            if selected_date_raw:
                selected_date = datetime.strptime(selected_date_raw, "%Y-%m-%d").date()
            if leagues_raw:
                selected_leagues = [
                    league for league in leagues_raw.split(",")
                    if league in DEFAULT_LEAGUES
                ]

            if not selected_leagues:
                selected_leagues = list(DEFAULT_LEAGUES.keys())

            payload = {
                "source": "football-data.org",
                "date": selected_date.isoformat() if selected_date else datetime.now(timezone.utc).date().isoformat(),
                "leagues": list(DEFAULT_LEAGUES.keys()),
                "selectedLeagues": selected_leagues,
                "aiStatus": get_ai_status(),
                "matches": fetch_matches(selected_date, selected_leagues),
            }
            self.send_json(200, payload)
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            self.send_json(
                error.code,
                {
                    "error": "football-data.org rate limit reached. Please wait a minute and refresh."
                    if error.code == 429
                    else "football-data.org request failed.",
                    "details": details,
                    "code": "rate_limited" if error.code == 429 else "upstream_error",
                },
            )
        except Exception as error:
            self.send_json(
                500,
                {
                    "error": str(error),
                    "code": "missing_api_key" if "API_FOOTBALL_KEY" in str(error) else "internal_error",
                },
            )

    def handle_match_details(self):
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            fixture_id = int(query.get("fixture", [0])[0])
            home_team_id = int(query.get("home_team_id", [0])[0])
            away_team_id = int(query.get("away_team_id", [0])[0])

            if not fixture_id or not home_team_id or not away_team_id:
                self.send_json(400, {"error": "Missing fixture or team identifiers."})
                return

            self.send_json(
                200,
                fetch_match_details(fixture_id, home_team_id, away_team_id),
            )
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def handle_standings(self):
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            leagues_raw = query.get("leagues", [""])[0]
            selected_leagues = []

            if leagues_raw:
                selected_leagues = [
                    league for league in leagues_raw.split(",")
                    if league in DEFAULT_LEAGUES
                ]

            if not selected_leagues:
                selected_leagues = list(DEFAULT_LEAGUES.keys())

            self.send_json(
                200,
                {
                    "source": "football-data.org",
                    "selectedLeagues": selected_leagues,
                    "standings": fetch_standings(selected_leagues),
                },
            )
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            self.send_json(
                error.code,
                {
                    "error": "football-data.org standings request failed.",
                    "details": details,
                },
            )
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def handle_ai_analysis(self):
        try:
            payload = parse_request_json(self)
            if not payload:
                self.send_json(400, {"error": "Missing match payload."})
                return

            self.send_json(
                200,
                {
                    "analysis": create_ai_analysis(payload),
                    "aiStatus": get_ai_status(),
                },
            )
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            self.send_json(
                error.code,
                {
                    "error": "Google AI analysis request failed.",
                    "details": details,
                },
            )
        except Exception as error:
            self.send_json(
                500,
                {
                    "error": str(error),
                    "code": (
                        "missing_ai_provider_key"
                        if "GOOGLE_AI_API_KEY" in str(error) or "GEMINI_API_KEY" in str(error) or "OPENAI_API_KEY" in str(error)
                        else "internal_error"
                    ),
                },
            )

    def serve_static(self, path):
        safe_path = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in safe_path.parents and safe_path != ROOT:
            self.send_error(403)
            return

        if not safe_path.exists() or not safe_path.is_file():
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(str(safe_path))[0] or "application/octet-stream"
        data = safe_path.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format_string, *args):
        return


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), AppHandler)
    print(f"Serving GoalCast at http://{HOST}:{PORT}")
    server.serve_forever()
