from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


EntityType = Literal["car", "person", "scooter"]
SimulationStatus = Literal["stopped", "running", "paused"]


class EntityCounts(BaseModel):
    car: int = Field(30, ge=0, le=300)
    person: int = Field(100, ge=0, le=500)
    scooter: int = Field(30, ge=0, le=300)


class StartRequest(BaseModel):
    counts: Optional[EntityCounts] = None
    scenario: Optional[str] = None


class SpeedRequest(BaseModel):
    multiplier: float = Field(..., ge=0.1, le=10.0)


class ScenarioRequest(BaseModel):
    scenario: str
    counts: Optional[EntityCounts] = None
    risk_events_enabled: Optional[bool] = None


class EntityState(BaseModel):
    id: str
    type: EntityType
    x: float
    y: float = 0.0
    z: float
    previous_x: float
    previous_y: float = 0.0
    previous_z: float
    speed: float
    heading: float
    route_id: str
    route_progress: float
    road_id: Optional[str] = None
    state: str = "moving"
    risk_level: str = "normal"
    active: bool = True
    acceleration: float = 0.0
    signal_violation: bool = False
    in_crosswalk: bool = False
    in_risk_zone: bool = False


class RiskEvent(BaseModel):
    event_id: str
    timestamp: str
    type: str
    object_ids: List[str]
    location_id: Optional[str] = None
    distance: float
    relative_speed: float
    ttc: Optional[float] = None
    minimum_distance: float
    risk_score: int
    risk_level: str
    description: str


class SimulationUpdate(BaseModel):
    type: str = "simulation_update"
    simulation_time: float
    status: SimulationStatus
    entities: List[Dict]
    risk_events: List[Dict]
    statistics: Dict[str, int]
    traffic_lights: List[Dict] = []
    weather: Dict = {}
