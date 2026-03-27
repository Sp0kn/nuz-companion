import enum
from datetime import datetime, timezone
from sqlalchemy import String, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    generation: Mapped[int] = mapped_column(Integer, nullable=False)
    region: Mapped[str] = mapped_column(String, nullable=False)

    zones: Mapped[list["Zone"]] = relationship(
        back_populates="game", order_by="Zone.sort_order"
    )
    runs: Mapped[list["Run"]] = relationship(back_populates="game")


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    game: Mapped["Game"] = relationship(back_populates="zones")


class RunStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    failed = "failed"


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default=RunStatus.active, nullable=False)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    game: Mapped["Game"] = relationship(back_populates="runs")
    pokemon: Mapped[list["Pokemon"]] = relationship(back_populates="run")
    redemption_types: Mapped[list["RedemptionType"]] = relationship(back_populates="run")
    nickname_queue: Mapped[list["QueuedNickname"]] = relationship(back_populates="run")


class PokemonStatus(str, enum.Enum):
    alive = "alive"
    fainted = "fainted"
    missed = "missed"  # fled, accidentally KO'd, etc.


class Pokemon(Base):
    __tablename__ = "run_pokemon"
    __table_args__ = (
        UniqueConstraint("run_id", "zone_id", name="uq_run_pokemon_run_zone"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), nullable=False)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), nullable=False)
    pokemon_name: Mapped[str] = mapped_column(String, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    twitch_username: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default=PokemonStatus.alive, nullable=False)
    impatience: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    run: Mapped["Run"] = relationship(back_populates="pokemon")
    zone: Mapped["Zone"] = relationship()


class PokemonSpecies(Base):
    __tablename__ = "pokemon_species"

    id: Mapped[int] = mapped_column(primary_key=True)  # National Dex number
    name: Mapped[str] = mapped_column(String, nullable=False)


class RedemptionType(Base):
    __tablename__ = "redemption_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "Sub Redemption"
    priority: Mapped[int] = mapped_column(Integer, nullable=False)  # lower = higher priority
    color: Mapped[str] = mapped_column(String, default="#8890b0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    run: Mapped["Run"] = relationship(back_populates="redemption_types")
    queued_nicknames: Mapped[list["QueuedNickname"]] = relationship(back_populates="redemption_type", cascade="all, delete-orphan")


class QueuedNicknameStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    skipped = "skipped"


class TwitchConfig(Base):
    __tablename__ = "twitch_config"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    channel_name: Mapped[str] = mapped_column(String, default="", nullable=False)
    bot_username: Mapped[str] = mapped_column(String, default="NUZcompanion", nullable=False)
    # Bot token — managed by the app, sourced from config.py
    bot_access_token: Mapped[str | None] = mapped_column(String, nullable=True)
    # Streamer token — set by the user via OAuth
    streamer_access_token: Mapped[str | None] = mapped_column(String, nullable=True)
    streamer_refresh_token: Mapped[str | None] = mapped_column(String, nullable=True)
    streamer_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    streamer_display_name: Mapped[str | None] = mapped_column(String, nullable=True)


class QueuedNickname(Base):
    __tablename__ = "nickname_queue"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id"), nullable=False)
    redemption_type_id: Mapped[int] = mapped_column(ForeignKey("redemption_types.id"), nullable=False)
    nickname: Mapped[str] = mapped_column(String, nullable=False)
    redeemed_by: Mapped[str | None] = mapped_column(String, nullable=True)   # Twitch username
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # when it happened on Twitch
    status: Mapped[str] = mapped_column(String, default=QueuedNicknameStatus.pending, nullable=False)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("run_pokemon.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    run: Mapped["Run"] = relationship(back_populates="nickname_queue")
    redemption_type: Mapped["RedemptionType"] = relationship(back_populates="queued_nicknames")
    assigned_to: Mapped["Pokemon | None"] = relationship()
