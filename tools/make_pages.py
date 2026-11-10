r"""Build the "Know Your Opening" guess-the-move pages from data/Dunst.pgn (games with 1.Nc3).

Run from the repo folder:   python tools/make_pages.py

It rewrites content/en/games/ and the three menu pages How You Win, How You Lose and Traps.
Only the Python standard library is needed (no chess package).

  How You Win   games White won (1-0), the best-rated SAMPLE of them
  How You Lose  games White lost (0-1), the best-rated SAMPLE of them
  Traps         every game that ends in 10 to 15 moves: White won (White sets the trap) or lost (trap against White)

Each game page guesses White's moves, from the position after 1.Nc3 and Black's reply.
Change SAMPLE to show more or fewer games on the How You Win and How You Lose menus.
"""
import math, pathlib, re, shutil, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
PGN = ROOT / "data" / "Dunst.pgn"
CONTENT = ROOT / "content" / "en"
GAMES = CONTENT / "games"
HOME = CONTENT / "homepage"

SAMPLE = 40          # games on How You Win and How You Lose (the best-rated ones)
TRAP_MIN, TRAP_MAX = 10, 15
TOTAL_PAR = 100      # points shared over the moves of each game
START_PLY = 2        # 1.Nc3 and Black's reply are shown; guessing starts with White's second move
MIDDLE_START_PLY = 28   # White's 15th move (ply index 28)
MIDDLE_LAST_PLY = 60    # the middle game page stops after Black's 30th move (plies 0 to 59)
ENDGAME_START_PLY = 68  # White's 35th move (ply index 68)
SAN = re.compile(r"^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?)[+#]?$")


def strip_movetext(body):
    """Return the list of SAN moves in a PGN movetext (no comments, variations, numbers or result)."""
    body = re.sub(r"\{[^}]*\}", " ", body)          # {comments}
    body = re.sub(r";[^\n]*", " ", body)            # ;comments
    kept, depth = [], 0
    for ch in body:                                 # (variations), nested
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            kept.append(ch)
    text = "".join(kept)
    text = re.sub(r"\$\d+", " ", text)              # $1 style annotations
    text = re.sub(r"\d+\.(\.\.)?", " ", text)       # move numbers
    text = re.sub(r"(1-0|0-1|1/2-1/2|\*)\s*$", " ", text.strip())
    return text.split()


def read_games(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    for chunk in re.split(r"\n(?=\[Event )", text):
        if "[Event" not in chunk:
            continue
        head, _, body = chunk.partition("\n\n")
        headers = dict(re.findall(r'\[(\w+) "([^"]*)"\]', head))
        moves = strip_movetext(body)
        if moves and all(SAN.match(m) for m in moves):
            yield headers, moves


def surname(name):
    s = name.split(",")[0].strip() if "," in name else (name.strip().split() or ["player"])[-1]
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "player"


def split_par(total, n):
    base, extra = divmod(total, n)
    return [base] * (n - extra) + [base + 1] * extra


def elo_avg(h):
    w, b = h.get("WhiteElo", ""), h.get("BlackElo", "")
    if w.isdigit() and b.isdigit():
        return (int(w) + int(b)) / 2
    return None


def clean(s):
    return s.replace('"', "'").replace("?", "").strip()


def write_game(list_name, h, moves, start_ply=START_PLY, last_ply=None, span=None):
    """span is None for a whole game (guessing to the end); otherwise a page for a stretch of moves,
    e.g. span="from move 15 to move 30", and last_ply cuts the moves shown at that point."""
    white, black = clean(h.get("White", "?")), clean(h.get("Black", "?"))
    year = clean(h.get("Date", ""))[:4]
    place = clean(h.get("Event") or h.get("Site", ""))
    where = ", ".join(x for x in (place, year) if x)
    opening = clean(h.get("ECO", ""))
    if last_ply is not None:
        moves = moves[:last_ply]
    guess_plies = [p for p in range(start_ply, len(moves)) if p % 2 == 0]
    if not guess_plies:
        return None
    pars = split_par(TOTAL_PAR, len(guess_plies))
    if span:
        ending_text = span
    else:
        ending = "checkmate" if moves[-1].endswith("#") else "resignation"
        ending_text = f"the game ends in {ending}"

    base = f"{list_name}-{surname(h.get('White', ''))}-{surname(h.get('Black', ''))}"
    folder, n = GAMES / base, 2
    while folder.exists():
        folder = GAMES / f"{base}-{n}"
        n += 1
    folder.mkdir(parents=True)

    page = (
        "---\n"
        f'title: "{white} – {black}"\n'
        f'where: "{where}"\n'
        f"year: {year or 0}\n"
        f'opening: "{opening}"\n'
        f'list: "{list_name}"\n'
        f'moves: "{" ".join(moves)}"\n'
        f"startply: {start_ply}\n"
        'side: "w"\n'
        f"pars: [{','.join(map(str, pars))}]\n"
        "---\n"
        f"{white} – {black}, {where}. {opening}. White to find {len(guess_plies)} moves; "
        f"{ending_text}. Par for the game is {sum(pars)}.\n\n"
        "{{< guessgame >}}\n"
    )
    (folder / "index.md").write_text(page, encoding="utf-8")
    return folder


def write_menu_page(name, weight, title, intro, lists):
    body = (
        "---\n"
        f'title: "{title}"\n'
        f'header_menu_title: "{title}"\n'
        f'navigation_menu_title: "{title}"\n'
        f"weight: {weight}\n"
        "header_menu: true\n"
        "---\n"
        f"{intro}\n\n"
    )
    for heading, list_name, note in lists:
        if heading:
            body += f"## {heading}\n\n{note}\n\n"
        body += '{{< game-list list="' + list_name + '" >}}\n\n'
    (HOME / name).write_text(body, encoding="utf-8")


def main():
    if GAMES.exists():
        shutil.rmtree(GAMES)
    GAMES.mkdir(parents=True)

    games = list(read_games(PGN))
    wins = [(h, m) for h, m in games if h.get("Result") == "1-0"]
    losses = [(h, m) for h, m in games if h.get("Result") == "0-1"]

    def best(items):
        rated = [(elo_avg(h), i, h, m) for i, (h, m) in enumerate(items) if elo_avg(h) is not None]
        rated.sort(key=lambda x: (-x[0], x[1]))
        return [(h, m) for _, _, h, m in rated[:SAMPLE]]

    def short(items):
        return [(h, m) for h, m in items if TRAP_MIN <= math.ceil(len(m) / 2) <= TRAP_MAX]

    def reaching(min_plies):
        return [(h, m) for h, m in games if len(m) >= min_plies]

    made = {
        "win": best(wins),
        "lose": best(losses),
        "trap-win": short(wins),
        "trap-lose": short(losses),
        "middle": best(reaching(MIDDLE_LAST_PLY)),
        "endgame": best(reaching(ENDGAME_START_PLY + 1)),
    }
    # Middle game: guess White's moves 15 to 30 only, so each game is cut after move 30.
    # Endgame: guess from move 35 to the end of the game.
    extra = {
        "middle": dict(start_ply=MIDDLE_START_PLY, last_ply=MIDDLE_LAST_PLY, span="from move 15 to move 30"),
        "endgame": dict(start_ply=ENDGAME_START_PLY, span="from move 35 to the end"),
    }
    counts = {}
    for list_name, items in made.items():
        counts[list_name] = 0
        for h, m in items:
            if write_game(list_name, h, m, **extra.get(list_name, {})):
                counts[list_name] += 1

    HOME.mkdir(parents=True, exist_ok=True)
    write_menu_page(
        "02-how-you-win.md", 2, "How You Win",
        "Each game is White's side of a game that starts 1.Nc3 and that White won. "
        "Guess White's moves. These are the best-rated wins in the database.",
        [(None, "win", "")],
    )
    write_menu_page(
        "03-how-you-lose.md", 3, "How You Lose",
        "Each game is White's side of a game that starts 1.Nc3 and that White lost. "
        "Guess White's moves and see where it went wrong. These are the best-rated losses in the database.",
        [(None, "lose", "")],
    )
    write_menu_page(
        "04-traps.md", 4, "Traps",
        "Traps are games that ended within 10 to 15 moves. They are short, so the guessing is quick.",
        [
            ("Traps White Set", "trap-win",
             "Games White won in 10 to 15 moves. Black walked into something."),
            ("Traps against White", "trap-lose",
             "Games White lost in 10 to 15 moves. Check which move let Black in."),
        ],
    )
    write_menu_page(
        "05-middle-game.md", 5, "Middle Game",
        "White's moves 15 to 30 in games that reached move 30. Each game stops after move 30.",
        [(None, "middle", "")],
    )
    write_menu_page(
        "06-endgame.md", 6, "Endgame",
        "White's moves from move 35 to the end of games that lasted that long.",
        [(None, "endgame", "")],
    )
    print(f"read {len(games)} games: {len(wins)} White wins, {len(losses)} White losses")
    for k, v in counts.items():
        print(f"{k}: {v} guess pages")


if __name__ == "__main__":
    main()
