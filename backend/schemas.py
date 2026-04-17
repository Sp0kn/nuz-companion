from datetime import datetime
from pydantic import BaseModel

from models import RunStatus, PokemonStatus, QueuedNicknameStatus


class PokemonSpeciesOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class ZoneOut(BaseModel):
    id: int
    game_id: int
    name: str
    sort_order: int

    model_config = {"from_attributes": True}


class GameOut(BaseModel):
    id: int
    name: str
    slug: str
    generation: int
    region: str

    model_config = {"from_attributes": True}


class GameWithZones(GameOut):
    zones: list[ZoneOut]


# --- Runs ---

class RunCreate(BaseModel):
    game_id: int
    name: str


class RunUpdate(BaseModel):
    name: str | None = None
    status: RunStatus | None = None
    notes: str | None = None


class RunOut(BaseModel):
    id: int
    game_id: int
    name: str
    status: RunStatus
    notes: str | None
    created_at: datetime
    game: GameOut

    model_config = {"from_attributes": True}


# --- Pokemon ---

class PokemonCreate(BaseModel):
    run_id: int
    zone_id: int
    pokemon_name: str
    nickname: str | None = None
    status: PokemonStatus | None = None


class PokemonUpdate(BaseModel):
    pokemon_name: str | None = None
    nickname: str | None = None
    twitch_username: str | None = None
    status: PokemonStatus | None = None
    impatience: int | None = None
    on_team: bool | None = None


class PokemonOut(BaseModel):
    id: int
    run_id: int
    zone_id: int
    pokemon_name: str
    nickname: str | None
    twitch_username: str | None
    status: PokemonStatus
    impatience: int
    on_team: bool
    created_at: datetime
    zone: ZoneOut

    model_config = {"from_attributes": True}


# --- Redemption Types ---

class RedemptionTypeCreate(BaseModel):
    run_id: int
    name: str
    priority: int
    color: str = "#8890b0"


class RedemptionTypeUpdate(BaseModel):
    name: str | None = None
    priority: int | None = None
    color: str | None = None


class RedemptionTypeReorder(BaseModel):
    ids: list[int]


class RedemptionTypeOut(BaseModel):
    id: int
    run_id: int
    name: str
    priority: int
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Nickname Queue ---

class QueuedNicknameCreate(BaseModel):
    run_id: int
    redemption_type_id: int
    nickname: str
    redeemed_by: str | None = None
    redeemed_at: datetime | None = None


class QueuedNicknameUpdate(BaseModel):
    status: QueuedNicknameStatus | None = None
    assigned_to_id: int | None = None


class QueuedNicknameOut(BaseModel):
    id: int
    run_id: int
    redemption_type_id: int
    nickname: str
    redeemed_by: str | None
    redeemed_at: datetime | None
    status: QueuedNicknameStatus
    assigned_to_id: int | None
    created_at: datetime
    redemption_type: RedemptionTypeOut

    model_config = {"from_attributes": True}


class TwitchRewardsOut(BaseModel):
    nickname_reward_id: str | None
    nickname_reward_cost: int
    impatience_reward_id: str | None
    impatience_reward_cost: int
    impatience_points_normal: int
    impatience_points_vip: int
    impatience_points_sub: int
    impatience_priority: str

    model_config = {"from_attributes": True}


class TwitchRewardsUpdate(BaseModel):
    nickname_reward_cost: int | None = None
    impatience_reward_cost: int | None = None
    impatience_points_normal: int | None = None
    impatience_points_vip: int | None = None
    impatience_points_sub: int | None = None
    impatience_priority: str | None = None


class TwitchConfigOut(BaseModel):
    channel_name: str
    streamer_display_name: str | None
    has_streamer_token: bool
    has_bot_token: bool

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_masked(cls, obj):
        return cls(
            channel_name=obj.channel_name,
            streamer_display_name=getattr(obj, "streamer_display_name", None),
            has_streamer_token=bool(obj.streamer_access_token),
            has_bot_token=bool(obj.bot_access_token),
        )


# --- Level Caps ---

class LevelCapOut(BaseModel):
    id: int
    game_id: int
    sort_order: int
    milestone: str
    level: int

    model_config = {"from_attributes": True}


class RunLevelCapOut(BaseModel):
    id: int
    run_id: int
    sort_order: int
    milestone: str
    level: int
    is_cleared: bool

    model_config = {"from_attributes": True}


class RunLevelCapCreate(BaseModel):
    run_id: int
    milestone: str
    level: int
    sort_order: int | None = None


class RunLevelCapUpdate(BaseModel):
    milestone: str | None = None
    level: int | None = None
    is_cleared: bool | None = None
    sort_order: int | None = None
