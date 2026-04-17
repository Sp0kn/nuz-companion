"""
Seed data for all main-series Pokemon games and their encounter zones.
Run directly (`python seed.py`) or called automatically on app startup.
"""
import json
from pathlib import Path

from database import engine, SessionLocal
from models import Base, Game, Zone, PokemonSpecies

# ---------------------------------------------------------------------------
# Zone lists — shared across games that cover the same region
# ---------------------------------------------------------------------------

KANTO_RBY = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17", "Route 18",
    "Route 19", "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
    "Viridian Forest", "Mt. Moon", "Rock Tunnel", "Safari Zone",
    "Power Plant", "Pokemon Tower", "Seafoam Islands", "Pokemon Mansion",
    "Victory Road", "Cerulean Cave",
]

KANTO_FRLG = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17", "Route 18",
    "Route 19", "Route 20", "Route 21", "Route 22", "Route 23", "Route 24", "Route 25",
    "Viridian Forest", "Mt. Moon", "Rock Tunnel", "Safari Zone",
    "Power Plant", "Lost Cave", "Seafoam Islands", "Pokemon Mansion",
    "Victory Road", "Cerulean Cave",
]

JOHTO_GSC = [
    "Route 29", "Route 30", "Route 31", "Route 32", "Route 33", "Route 34",
    "Route 35", "Route 36", "Route 37", "Route 38", "Route 39", "Route 40",
    "Route 41", "Route 42", "Route 43", "Route 44", "Route 45", "Route 46",
    "Route 47", "Route 48",
    "Dark Cave", "Sprout Tower", "Union Cave", "Ruins of Alph", "Ilex Forest",
    "National Park", "Burned Tower", "Bell Tower", "Mt. Mortar", "Safari Zone",
    "Ice Path", "Whirl Islands", "Dragon's Den", "Mt. Silver",
]

# HGSS includes post-game Kanto access (Routes 1-28, Mt. Silver side)
JOHTO_HGSS = JOHTO_GSC + [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17", "Route 18",
    "Route 19", "Route 20", "Route 21", "Route 22", "Route 24", "Route 25",
    "Route 26", "Route 27", "Route 28",
    "Viridian Forest", "Mt. Moon", "Rock Tunnel", "Safari Zone (Kanto)",
    "Power Plant", "Seafoam Islands", "Victory Road", "Cerulean Cave",
]

HOENN = [
    "Route 101", "Route 102", "Route 103", "Route 104", "Route 105", "Route 106",
    "Route 107", "Route 108", "Route 109", "Route 110", "Route 111", "Route 112",
    "Route 113", "Route 114", "Route 115", "Route 116", "Route 117", "Route 118",
    "Route 119", "Route 120", "Route 121", "Route 122", "Route 123", "Route 124",
    "Route 125", "Route 126", "Route 127", "Route 128", "Route 129", "Route 130",
    "Route 131", "Route 132", "Route 133", "Route 134",
    "Petalburg Woods", "Rusturf Tunnel", "Granite Cave", "Fiery Path",
    "Meteor Falls", "Jagged Pass", "Mt. Chimney", "Safari Zone",
    "New Mauville", "Cave of Origin", "Seafloor Cavern", "Shoal Cave",
    "Sky Pillar", "Victory Road", "Mirage Tower", "Desert Underpass",
]

SINNOH = [
    "Route 201", "Route 202", "Route 203", "Route 204", "Route 205",
    "Route 206", "Route 207", "Route 208", "Route 209", "Route 210",
    "Route 211", "Route 212", "Route 213", "Route 214", "Route 215",
    "Route 216", "Route 217", "Route 218", "Route 219", "Route 220",
    "Route 221", "Route 222", "Route 223", "Route 224", "Route 225",
    "Route 226", "Route 227", "Route 228", "Route 229", "Route 230",
    "Oreburgh Mine", "Ravaged Path", "Wayward Cave", "Mt. Coronet",
    "Valley Windworks", "Eterna Forest", "Great Marsh", "Solaceon Ruins",
    "Iron Island", "Lake Verity", "Lake Valor", "Lake Acuity",
    "Sendoff Spring", "Spring Path", "Turnback Cave", "Snowpoint Temple",
    "Trophy Garden", "Victory Road",
]

UNOVA_BW = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17", "Route 18",
    "Pinwheel Forest", "Wellspring Cave", "Desert Resort", "Relic Castle",
    "Cold Storage", "Chargestone Cave", "Mistralton Cave", "Twist Mountain",
    "Dragonspiral Tower", "Moor of Icirrus", "Seaside Cave", "Giant Chasm",
    "Victory Road",
]

UNOVA_B2W2 = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17", "Route 18",
    "Route 19", "Route 20", "Route 21", "Route 22", "Route 23",
    "Floccesy Ranch", "Virbank Complex", "Castelia Sewers", "Lostlorn Forest",
    "Desert Resort", "Relic Castle", "Relic Passage", "Chargestone Cave",
    "Mistralton Cave", "Twist Mountain", "Dragonspiral Tower",
    "Moor of Icirrus", "Seaside Cave", "Giant Chasm", "Clay Tunnel",
    "Underground Ruins", "Reversal Mountain", "Strange House",
    "Nature Sanctuary", "Victory Road",
]

KALOS = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17", "Route 18",
    "Route 19", "Route 20", "Route 21", "Route 22",
    "Santalune Forest", "Glittering Cave", "Reflection Cave", "Connecting Cave",
    "Frost Cavern", "Azure Bay", "Terminus Cave", "Pokemon Village",
    "Victory Road",
]

ALOLA_SM = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10", "Route 11", "Route 12",
    "Route 13", "Route 14", "Route 15", "Route 16", "Route 17",
    "Mahalo Trail", "Hau'oli Cemetery", "Verdant Cavern", "Melemele Meadow",
    "Seaward Cave", "Ten Carat Hill", "Kala'e Bay", "Paniola Ranch",
    "Brooklet Hill", "Wela Volcano Park", "Lush Jungle", "Memorial Hill",
    "Blush Mountain", "Secluded Shore", "Ula'ula Meadow", "Po Town",
    "Resolution Cave", "Vast Poni Canyon", "Exeggutor Island", "Mount Lanakila",
]

ALOLA_USUM = ALOLA_SM + [
    "Poni Grove", "Poni Plains", "Poni Meadow", "Poni Coast", "Poni Gauntlet",
]

GALAR = [
    "Route 1", "Route 2", "Route 3", "Route 4", "Route 5", "Route 6",
    "Route 7", "Route 8", "Route 9", "Route 10",
    "Slumbering Weald", "Galar Mine", "Galar Mine No. 2",
    "Motostoke Outskirts", "Glimwood Tangle",
    # Wild Area zones
    "Rolling Fields", "Dappled Grove", "Watchtower Ruins",
    "East Lake Axewell", "West Lake Axewell", "Axew's Eye",
    "South Lake Miloch", "Motostoke Riverbank", "Bridge Field",
    "Stony Wilderness", "Dusty Bowl", "Giant's Mirror",
    "Hammerlocke Hills", "Giant's Cap", "Lake of Outrage",
    "Duskull Church", "Giant's Seat", "North Lake Miloch",
]

HISUI = [
    "Obsidian Fieldlands", "Crimson Mirelands", "Cobalt Coastlands",
    "Coronet Highlands", "Alabaster Icelands",
]

PALDEA = [
    "South Province (Area One)", "South Province (Area Two)",
    "South Province (Area Three)", "South Province (Area Four)",
    "South Province (Area Five)", "South Province (Area Six)",
    "East Province (Area One)", "East Province (Area Two)", "East Province (Area Three)",
    "West Province (Area One)", "West Province (Area Two)", "West Province (Area Three)",
    "North Province (Area One)", "North Province (Area Two)", "North Province (Area Three)",
    "Asado Desert", "Casseroya Lake", "Glaseado Mountain",
    "Tagtree Thicket", "Dalizapa Passage", "Area Zero",
]

# ---------------------------------------------------------------------------
# Game definitions
# ---------------------------------------------------------------------------

GAMES: list[dict] = [
    # Gen 1
    {"name": "Pokemon Red",           "slug": "red",            "generation": 1, "region": "Kanto",  "zones": KANTO_RBY},
    {"name": "Pokemon Blue",          "slug": "blue",           "generation": 1, "region": "Kanto",  "zones": KANTO_RBY},
    {"name": "Pokemon Yellow",        "slug": "yellow",         "generation": 1, "region": "Kanto",  "zones": KANTO_RBY},
    # Gen 2
    {"name": "Pokemon Gold",          "slug": "gold",           "generation": 2, "region": "Johto",  "zones": JOHTO_GSC},
    {"name": "Pokemon Silver",        "slug": "silver",         "generation": 2, "region": "Johto",  "zones": JOHTO_GSC},
    {"name": "Pokemon Crystal",       "slug": "crystal",        "generation": 2, "region": "Johto",  "zones": JOHTO_GSC},
    # Gen 3
    {"name": "Pokemon Ruby",          "slug": "ruby",           "generation": 3, "region": "Hoenn",  "zones": HOENN},
    {"name": "Pokemon Sapphire",      "slug": "sapphire",       "generation": 3, "region": "Hoenn",  "zones": HOENN},
    {"name": "Pokemon Emerald",       "slug": "emerald",        "generation": 3, "region": "Hoenn",  "zones": HOENN},
    {"name": "Pokemon FireRed",       "slug": "firered",        "generation": 3, "region": "Kanto",  "zones": KANTO_FRLG},
    {"name": "Pokemon LeafGreen",     "slug": "leafgreen",      "generation": 3, "region": "Kanto",  "zones": KANTO_FRLG},
    # Gen 4
    {"name": "Pokemon Diamond",       "slug": "diamond",        "generation": 4, "region": "Sinnoh", "zones": SINNOH},
    {"name": "Pokemon Pearl",         "slug": "pearl",          "generation": 4, "region": "Sinnoh", "zones": SINNOH},
    {"name": "Pokemon Platinum",      "slug": "platinum",       "generation": 4, "region": "Sinnoh", "zones": SINNOH},
    {"name": "Pokemon HeartGold",     "slug": "heartgold",      "generation": 4, "region": "Johto",  "zones": JOHTO_HGSS},
    {"name": "Pokemon SoulSilver",    "slug": "soulsilver",     "generation": 4, "region": "Johto",  "zones": JOHTO_HGSS},
    # Gen 5
    {"name": "Pokemon Black",         "slug": "black",          "generation": 5, "region": "Unova",  "zones": UNOVA_BW},
    {"name": "Pokemon White",         "slug": "white",          "generation": 5, "region": "Unova",  "zones": UNOVA_BW},
    {"name": "Pokemon Black 2",       "slug": "black2",         "generation": 5, "region": "Unova",  "zones": UNOVA_B2W2},
    {"name": "Pokemon White 2",       "slug": "white2",         "generation": 5, "region": "Unova",  "zones": UNOVA_B2W2},
    # Gen 6
    {"name": "Pokemon X",             "slug": "x",              "generation": 6, "region": "Kalos",  "zones": KALOS},
    {"name": "Pokemon Y",             "slug": "y",              "generation": 6, "region": "Kalos",  "zones": KALOS},
    {"name": "Pokemon Omega Ruby",    "slug": "omegaruby",      "generation": 6, "region": "Hoenn",  "zones": HOENN},
    {"name": "Pokemon Alpha Sapphire","slug": "alphasapphire",  "generation": 6, "region": "Hoenn",  "zones": HOENN},
    # Gen 7
    {"name": "Pokemon Sun",           "slug": "sun",            "generation": 7, "region": "Alola",  "zones": ALOLA_SM},
    {"name": "Pokemon Moon",          "slug": "moon",           "generation": 7, "region": "Alola",  "zones": ALOLA_SM},
    {"name": "Pokemon Ultra Sun",     "slug": "ultrasun",       "generation": 7, "region": "Alola",  "zones": ALOLA_USUM},
    {"name": "Pokemon Ultra Moon",    "slug": "ultramoon",      "generation": 7, "region": "Alola",  "zones": ALOLA_USUM},
    # Gen 8
    {"name": "Pokemon Sword",                  "slug": "sword",          "generation": 8, "region": "Galar",  "zones": GALAR},
    {"name": "Pokemon Shield",                 "slug": "shield",         "generation": 8, "region": "Galar",  "zones": GALAR},
    {"name": "Pokemon Brilliant Diamond",      "slug": "brilliantdiamond","generation": 8, "region": "Sinnoh", "zones": SINNOH},
    {"name": "Pokemon Shining Pearl",          "slug": "shiningpearl",   "generation": 8, "region": "Sinnoh", "zones": SINNOH},
    {"name": "Pokemon Legends: Arceus",        "slug": "legendsarceus",  "generation": 8, "region": "Hisui",  "zones": HISUI},
    # Gen 9
    {"name": "Pokemon Scarlet",       "slug": "scarlet",        "generation": 9, "region": "Paldea", "zones": PALDEA},
    {"name": "Pokemon Violet",        "slug": "violet",         "generation": 9, "region": "Paldea", "zones": PALDEA},
]

# ---------------------------------------------------------------------------
# Level cap data (hardcore Nuzlocke caps, per game slug)
# ---------------------------------------------------------------------------

_KANTO_RBY = [
    ("Gym 1", 14), ("Gym 2", 21), ("Gym 3", 24), ("Gym 4", 29),
    ("Gym 5", 43), ("Gym 6", 43), ("Gym 7", 47), ("Gym 8", 50),
    ("Elite Four 1", 56), ("Elite Four 2", 58), ("Elite Four 3", 60), ("Elite Four 4", 62),
    ("Champion", 65),
]
_KANTO_YELLOW = [
    ("Gym 1", 12), ("Gym 2", 21), ("Gym 3", 28), ("Gym 4", 32),
    ("Gym 5", 50), ("Gym 6", 50), ("Gym 7", 54), ("Gym 8", 55),
    ("Elite Four 1", 56), ("Elite Four 2", 58), ("Elite Four 3", 60), ("Elite Four 4", 62),
    ("Champion", 65),
]
_KANTO_FRLG = [
    ("Gym 1", 14), ("Gym 2", 21), ("Gym 3", 24), ("Gym 4", 29),
    ("Gym 5", 43), ("Gym 6", 43), ("Gym 7", 47), ("Gym 8", 50),
    ("Elite Four 1", 54), ("Elite Four 2", 56), ("Elite Four 3", 58), ("Elite Four 4", 60),
    ("Champion", 63),
]
_JOHTO_GSC = [
    ("Gym 1", 9), ("Gym 2", 16), ("Gym 3", 20), ("Gym 4", 25),
    ("Gym 5", 30), ("Gym 6", 35), ("Gym 7", 31), ("Gym 8", 40),
    ("Elite Four 1", 42), ("Elite Four 2", 44), ("Elite Four 3", 46), ("Elite Four 4", 47),
    ("Champion", 50),
    ("Kanto Gym 1", 44), ("Kanto Gym 2", 47), ("Kanto Gym 3", 45), ("Kanto Gym 4", 46),
    ("Kanto Gym 5", 39), ("Kanto Gym 6", 48), ("Kanto Gym 7", 50), ("Kanto Gym 8", 58),
    ("Red", 81),
]
_JOHTO_HGSS = [
    ("Gym 1", 13), ("Gym 2", 17), ("Gym 3", 19), ("Gym 4", 25),
    ("Gym 5", 31), ("Gym 6", 35), ("Gym 7", 34), ("Gym 8", 41),
    ("Elite Four 1", 42), ("Elite Four 2", 44), ("Elite Four 3", 46), ("Elite Four 4", 47),
    ("Champion", 50),
    ("Kanto Gym 1", 54), ("Kanto Gym 2", 54), ("Kanto Gym 3", 53), ("Kanto Gym 4", 56),
    ("Kanto Gym 5", 50), ("Kanto Gym 6", 55), ("Kanto Gym 7", 59), ("Kanto Gym 8", 60),
    ("Red", 88),
]
_HOENN_RS = [
    ("Gym 1", 15), ("Gym 2", 18), ("Gym 3", 23), ("Gym 4", 28),
    ("Gym 5", 31), ("Gym 6", 33), ("Gym 7", 42), ("Gym 8", 43),
    ("Elite Four 1", 49), ("Elite Four 2", 51), ("Elite Four 3", 53), ("Elite Four 4", 55),
    ("Champion", 58),
]
_HOENN_EMERALD = [
    ("Gym 1", 15), ("Gym 2", 19), ("Gym 3", 24), ("Gym 4", 29),
    ("Gym 5", 31), ("Gym 6", 33), ("Gym 7", 42), ("Gym 8", 46),
    ("Elite Four 1", 49), ("Elite Four 2", 51), ("Elite Four 3", 53), ("Elite Four 4", 55),
    ("Champion", 58),
    ("Steven (Rematch)", 78),
]
_HOENN_ORAS = [
    ("Gym 1", 14), ("Gym 2", 16), ("Gym 3", 21), ("Gym 4", 28),
    ("Gym 5", 30), ("Gym 6", 35), ("Gym 7", 45), ("Gym 8", 46),
    ("Elite Four 1", 52), ("Elite Four 2", 53), ("Elite Four 3", 54), ("Elite Four 4", 55),
    ("Champion", 59),
    ("E4 Rematch 1", 72), ("E4 Rematch 2", 73), ("E4 Rematch 3", 74), ("E4 Rematch 4", 75),
    ("Champion Rematch", 79),
]
_SINNOH_DP = [
    ("Gym 1", 14), ("Gym 2", 22), ("Gym 3", 30), ("Gym 4", 30),
    ("Gym 5", 36), ("Gym 6", 39), ("Gym 7", 42), ("Gym 8", 49),
    ("Elite Four 1", 57), ("Elite Four 2", 59), ("Elite Four 3", 61), ("Elite Four 4", 63),
    ("Champion", 66),
]
_SINNOH_PLATINUM = [
    ("Gym 1", 14), ("Gym 2", 22), ("Gym 3", 26), ("Gym 4", 32),
    ("Gym 5", 37), ("Gym 6", 41), ("Gym 7", 44), ("Gym 8", 50),
    ("Elite Four 1", 53), ("Elite Four 2", 55), ("Elite Four 3", 57), ("Elite Four 4", 59),
    ("Champion", 62),
]
_UNOVA_BW = [
    ("Gym 1", 14), ("Gym 2", 20), ("Gym 3", 23), ("Gym 4", 27),
    ("Gym 5", 31), ("Gym 6", 35), ("Gym 7", 39), ("Gym 8", 43),
    ("Elite Four 1", 50), ("Elite Four 2", 50), ("Elite Four 3", 50), ("Elite Four 4", 50),
    ("N", 52), ("Ghetsis", 54),
    ("E4 Rematch 1", 73), ("E4 Rematch 2", 73), ("E4 Rematch 3", 73), ("E4 Rematch 4", 73),
    ("Champion (Alder)", 77),
]
_UNOVA_B2W2 = [
    ("Gym 1", 13), ("Gym 2", 18), ("Gym 3", 24), ("Gym 4", 30),
    ("Gym 5", 33), ("Gym 6", 39), ("Gym 7", 48), ("Gym 8", 51),
    ("Elite Four 1", 58), ("Elite Four 2", 58), ("Elite Four 3", 58), ("Elite Four 4", 58),
    ("Champion", 59),
    ("E4 Rematch 1", 74), ("E4 Rematch 2", 74), ("E4 Rematch 3", 74), ("E4 Rematch 4", 74),
    ("Champion Rematch", 78),
]
_KALOS_XY = [
    ("Gym 1", 12), ("Gym 2", 25), ("Gym 3", 32), ("Gym 4", 34),
    ("Gym 5", 37), ("Gym 6", 42), ("Gym 7", 48), ("Gym 8", 59),
    ("Elite Four 1", 65), ("Elite Four 2", 65), ("Elite Four 3", 65), ("Elite Four 4", 65),
    ("Champion", 68),
    ("E4 Rematch 1", 74), ("E4 Rematch 2", 74), ("E4 Rematch 3", 74), ("E4 Rematch 4", 74),
    ("Champion Rematch", 78),
]
_ALOLA_SM = [
    ("Trial 1", 12), ("Grand Trial 1", 15),
    ("Trial 2", 20), ("Trial 3", 22), ("Trial 4", 24),
    ("Grand Trial 2", 27),
    ("Trial 5", 29), ("Trial 6", 33),
    ("Grand Trial 3", 39),
    ("Trial 7", 45),
    ("Grand Trial 4", 48),
    ("Elite Four 1", 55), ("Elite Four 2", 55), ("Elite Four 3", 55), ("Elite Four 4", 55),
    ("Champion", 58),
]
_ALOLA_USUM = [
    ("Trial 1", 10), ("Trial 2", 12),
    ("Grand Trial 1", 16),
    ("Trial 3", 20), ("Trial 4", 22), ("Trial 5", 24),
    ("Grand Trial 2", 28),
    ("Trial 6", 33), ("Trial 7", 35),
    ("Grand Trial 3", 44),
    ("Trial 8", 49),
    ("Grand Trial 4", 54),
    ("Mina", 55),
    ("Ultra Necrozma", 60),
    ("Elite Four 1", 57), ("Elite Four 2", 57), ("Elite Four 3", 57), ("Elite Four 4", 57),
    ("Champion", 60),
]
_GALAR = [
    ("Gym 1", 20), ("Gym 2", 24), ("Gym 3", 27), ("Gym 4", 36),
    ("Gym 5", 38), ("Gym 6", 42), ("Gym 7", 46), ("Gym 8", 48),
    ("Rival Battle 1", 49), ("Rival Battle 2", 49),
    ("Rival Battle 3", 53), ("Rival Battle 4", 53),
    ("Rival Battle 5", 54), ("Rival Battle 6", 55),
    ("Champion (Leon)", 65),
]

LEVEL_CAPS: dict[str, list[tuple[str, int]]] = {
    "red": _KANTO_RBY, "blue": _KANTO_RBY, "yellow": _KANTO_YELLOW,
    "gold": _JOHTO_GSC, "silver": _JOHTO_GSC, "crystal": _JOHTO_GSC,
    "ruby": _HOENN_RS, "sapphire": _HOENN_RS, "emerald": _HOENN_EMERALD,
    "firered": _KANTO_FRLG, "leafgreen": _KANTO_FRLG,
    "diamond": _SINNOH_DP, "pearl": _SINNOH_DP, "platinum": _SINNOH_PLATINUM,
    "heartgold": _JOHTO_HGSS, "soulsilver": _JOHTO_HGSS,
    "black": _UNOVA_BW, "white": _UNOVA_BW,
    "black2": _UNOVA_B2W2, "white2": _UNOVA_B2W2,
    "x": _KALOS_XY, "y": _KALOS_XY,
    "omegaruby": _HOENN_ORAS, "alphasapphire": _HOENN_ORAS,
    "sun": _ALOLA_SM, "moon": _ALOLA_SM,
    "ultrasun": _ALOLA_USUM, "ultramoon": _ALOLA_USUM,
    "sword": _GALAR, "shield": _GALAR,
    "brilliantdiamond": _SINNOH_DP, "shiningpearl": _SINNOH_DP,
}

# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

def seed() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.query(Game).count() == 0:
            for entry in GAMES:
                zone_names: list[str] = entry["zones"]
                game = Game(
                    name=entry["name"],
                    slug=entry["slug"],
                    generation=entry["generation"],
                    region=entry["region"],
                )
                db.add(game)
                db.flush()
                for i, zone_name in enumerate(zone_names):
                    db.add(Zone(game_id=game.id, name=zone_name, sort_order=i))
            db.commit()
            print(f"[seed] Inserted {len(GAMES)} games.")

        if db.query(PokemonSpecies).count() == 0:
            data_path = Path(__file__).parent.parent / "node_modules" / "pokemon" / "data" / "en.json"
            names: list[str] = json.loads(data_path.read_text(encoding="utf-8"))
            for dex_number, name in enumerate(names, start=1):
                db.add(PokemonSpecies(id=dex_number, name=name))
            db.commit()
            print(f"[seed] Inserted {len(names)} Pokémon species.")

        from models import LevelCap
        if db.query(LevelCap).count() == 0:
            games = db.query(Game).all()
            game_by_slug = {g.slug: g for g in games}
            total = 0
            for slug, caps in LEVEL_CAPS.items():
                game = game_by_slug.get(slug)
                if not game:
                    continue
                for i, (milestone, level) in enumerate(caps):
                    db.add(LevelCap(game_id=game.id, sort_order=i, milestone=milestone, level=level))
                    total += 1
            db.commit()
            print(f"[seed] Inserted {total} level cap entries.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
