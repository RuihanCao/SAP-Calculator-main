#!/usr/bin/env python3
"""Fixture spec -> real /api/battle/get battle payload.

Why this and not scripts/make-team.py
  make-team.py needs a per-run config file, needs a `tmp/replay-template.json`
  that is not in the repo, and needs ability enums to be typed by hand in
  `abilitiesByPet`. Ability enums are the part that silently degrades a pet into
  an inert model when they are wrong, so hand-typing them is the weak link.
  This builder instead takes ability enums from the extension's generated
  `abilityIdsByPetId` map (vendored into data/enum-maps.json), takes the
  template from the extension's captured `battle_override.json`, and writes one
  payload per fixture with no config step. Board editing follows the same rules
  make-team.py uses (reset per-pet battle state, rebuild Abil from the pet id).

Board orientation
  The fork's own replay parser (replay-calc-parser.ts parseBoardPets) reads
  Mins.Items into petArray[Poi.x] and then reverses it to get its front-to-back
  PetConfig array. So Poi.x = 4 is the FRONT pet on both boards. Fixture pet
  arrays are written front-to-back, so fixture index i lands at Poi.x = 4 - i.
  `--orientation back-is-4` flips this if the screen check ever disagrees.

Usage:
  build_payload.py fixtures/f01-plain-trades.json -o out/f01.json
  build_payload.py --all -d out/
"""
import argparse
import copy
import json
import os
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
TEMPLATE_PATH = os.path.join(DATA, "battle-template.json")
MAPS_PATH = os.path.join(DATA, "enum-maps.json")

USER_ID = "11111111-1111-4111-8111-111111111111"
OPP_ID = "22222222-2222-4222-8222-222222222222"
USER_BOARD_ID = "33333333-3333-4333-8333-333333333333"
OPP_BOARD_ID = "44444444-4444-4444-8444-444444444444"


def norm(name):
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())


def load_maps():
    with open(MAPS_PATH) as f:
        return json.load(f)


def reset_minion_state(m):
    """Clear everything that is per-turn or per-battle carry-over state.

    Same field list as scripts/make-team.py: a template pet arrives with a live
    mid-run state (mana, counters, temp stats, death flags) that would otherwise
    leak into the fixture.
    """
    defaults = {
        "Exp": 0, "Mana": 0, "Cou": None, "CoBr": None, "LaPP": None,
        "PeBo": False, "PeDu": None, "PeDM": None, "PeMu": None, "PeDr": 0,
        "AbDi": False, "Dead": False, "Dest": False, "DeBy": None, "Link": None,
        "Pow": None, "SeV": None, "Rwds": 0, "Rwrd": False, "MiMs": None,
        "SpMe": None, "Tri": None, "AtkC": 0, "HrtC": 0, "SpCT": 1, "OlTs": None,
        "Fro": False, "WFro": False, "AFro": False, "LastTargetsThisTurn": None,
    }
    m.update(defaults)
    for k in ("Hp", "At"):
        if isinstance(m.get(k), dict):
            m[k]["Temp"] = 0
            m[k]["Max"] = None


def make_ability(enu, level):
    return {"Enu": int(enu), "Lvl": int(level), "Nat": True, "Dur": 0, "TrCo": 0,
            "AcCo": 0, "Char": None, "Dis": False, "DisT": False, "AIML": False,
            "IgRe": False, "Grop": 0}


def exp_for_level(level):
    return {1: 0, 2: 2, 3: 5}.get(int(level), 0)


def build_minion(spec, maps, board_id, uni, poi_x, template_minion):
    pet_id = maps["petIdsByName"].get(norm(spec["pet"]))
    if pet_id is None:
        raise SystemExit(f"unknown pet '{spec['pet']}'")
    level = int(spec.get("level", 1))

    m = copy.deepcopy(template_minion) if isinstance(template_minion, dict) else {}
    reset_minion_state(m)
    m["Own"] = 1
    m["Loc"] = 1
    m["Enu"] = pet_id
    m["Lvl"] = level
    m["Exp"] = exp_for_level(level)
    m["Poi"] = {"x": poi_x, "y": 0}
    m["At"] = {"Perm": int(spec.get("attack", 1)), "Temp": 0, "Max": None}
    m["Hp"] = {"Perm": int(spec.get("health", 1)), "Temp": 0, "Max": None}
    m["Cosm"] = 0
    m["Pri"] = 3
    m["Id"] = {"BoId": board_id, "Uni": uni}

    perk = spec.get("perk")
    if perk:
        perk_id = maps["perkIdsByName"].get(norm(perk))
        if perk_id is None:
            raise SystemExit(f"unknown perk '{perk}'")
        m["Perk"] = perk_id
    else:
        m["Perk"] = None

    ability_ids = maps["abilityIdsByPetId"].get(str(pet_id), [])
    if not ability_ids:
        raise SystemExit(
            f"no ability enum known for pet '{spec['pet']}' (id {pet_id}); the game "
            "would render it inert - pick another pet or regenerate the maps"
        )
    m["Abil"] = [make_ability(a, level) for a in ability_ids]
    return m


def build_relic(toy_name, level, maps, board_id, uni):
    toy_id = maps["toyIdsByName"].get(norm(toy_name))
    if toy_id is None:
        raise SystemExit(f"unknown toy '{toy_name}'")
    ability = maps["toyAbilityEnumsByToyId"].get(str(toy_id))
    if ability is None:
        raise SystemExit(f"no ability enum known for toy '{toy_name}' (id {toy_id})")
    return {
        "Own": 1, "Enu": toy_id, "Loc": 4, "Poi": {"x": 0, "y": 0},
        "Lvl": int(level), "Exp": 0,
        "Hp": {"Perm": 1, "Temp": 0, "Max": None},
        "At": {"Perm": 1000, "Temp": 0, "Max": 1000},
        "Cou": 1, "Mana": 0, "Perk": None,
        "Abil": [make_ability(ability, level)],
        "Dead": False, "Dest": False,
        "Id": {"BoId": board_id, "Uni": uni}, "Pri": 3,
    }


def fill_board(board, pets, toy, toy_level, maps, board_id, turn, uni_base, front_is_4):
    template_minions = [m for m in board["Mins"]["Items"] if isinstance(m, dict)]
    proto = template_minions[0] if template_minions else {}

    items = [None] * 5
    for i, spec in enumerate(pets[:5]):
        if not spec:
            continue
        poi = (4 - i) if front_is_4 else i
        items[poi] = build_minion(spec, maps, board_id, uni_base + i, poi, proto)
    board["Mins"]["Size"] = {"x": 5, "y": 1}
    board["Mins"]["Items"] = items

    board["Id"] = board_id
    board["Tur"] = int(turn)
    board["Pack"] = maps["packIdsByName"].get("turtle", 0)
    board["Ti"] = 6
    board["Back"] = maps["defaults"].get("backgroundId", 0)
    board["Masc"] = maps["defaults"].get("mascotId", 18)
    board["Cosm"] = maps["defaults"].get("cosmeticId", 0)
    board["Go"] = 0
    board["FrRo"] = 0
    board["Rold"] = 0

    rel_items = [None, None]
    if toy:
        rel_items[0] = build_relic(toy, toy_level, maps, board_id, uni_base + 90)
    board["Rel"] = {"Size": {"x": 2, "y": 1}, "Items": rel_items}

    # The extension's normalizeBoardPayload contract: these must exist and have
    # the right container type or the client drops the board.
    for key in ("MiSh", "SpSh", "MSBo", "SpPl", "PrEn", "PrES", "PrES2"):
        if not isinstance(board.get(key), list):
            board[key] = []
    board.setdefault("GoGa", 0)
    board.setdefault("Wacky", None)
    board.setdefault("WMPs", None)
    board.setdefault("WMPb", False)
    if not isinstance(board.get("Bul"), dict):
        board["Bul"] = {"Size": {"x": 0, "y": 0}, "Items": None}
    return board


def build(fixture, maps, template, front_is_4=True, battle_id=None):
    b = copy.deepcopy(template)
    b["Id"] = battle_id or str(uuid.uuid4())
    b["Seed"] = int(fixture.get("seed", 0))
    b["Outcome"] = 1
    b["EndResult"] = 0
    b["ResolvedOn"] = "2026-07-31T00:00:00.000000+00:00"
    b["WatchedOn"] = "2026-07-31T00:00:01.000000+00:00"
    b["User"] = {"Id": USER_ID, "DisplayName": "Fixture P1"}
    b["Opponent"] = {"Id": OPP_ID, "DisplayName": "Fixture P2"}

    turn = fixture.get("turn", 11)
    fill_board(b["UserBoard"], fixture.get("player", []), fixture.get("playerToy"),
               fixture.get("playerToyLevel", 1), maps, USER_BOARD_ID, turn, 100, front_is_4)
    fill_board(b["OpponentBoard"], fixture.get("opponent", []), fixture.get("opponentToy"),
               fixture.get("opponentToyLevel", 1), maps, OPP_BOARD_ID, turn, 200, front_is_4)
    return b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fixture", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("-d", "--outdir")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--orientation", choices=["front-is-4", "back-is-4"], default="front-is-4")
    ap.add_argument("--wrap", action="store_true",
                    help="emit the extension's {enabled, battle} wrapper instead of a bare battle")
    args = ap.parse_args()

    maps = load_maps()
    with open(TEMPLATE_PATH) as f:
        template = json.load(f)
    front_is_4 = args.orientation == "front-is-4"

    paths = []
    if args.all:
        fdir = os.path.join(HERE, "fixtures")
        paths = [os.path.join(fdir, n) for n in sorted(os.listdir(fdir))
                 if n.endswith(".json") and not n.startswith("_")]
    elif args.fixture:
        paths = [args.fixture]
    else:
        raise SystemExit("give a fixture path or --all")

    outdir = args.outdir or os.path.join(HERE, "out")
    os.makedirs(outdir, exist_ok=True)
    for p in paths:
        with open(p) as f:
            fixture = json.load(f)
        battle = build(fixture, maps, template, front_is_4)
        payload = {"enabled": True, "battle": battle} if args.wrap else battle
        out = args.out if (args.out and len(paths) == 1) else \
            os.path.join(outdir, os.path.basename(p))
        with open(out, "w") as f:
            json.dump(payload, f, indent=1)
        print(f"{fixture['id']:26s} -> {out}")


if __name__ == "__main__":
    main()
