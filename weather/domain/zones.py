# domain/zones.py

ZONES = [
    {
        "zone_id": "z1",
        "zone_name": "공학관 앞 주차장",
        "zone_type": "parking",
        "risk_bias": 10,
    },
    {
        "zone_id": "z2",
        "zone_name": "중앙 도로",
        "zone_type": "road",
        "risk_bias": 8,
    },
    {
        "zone_id": "z3",
        "zone_name": "도서관 앞 보행로",
        "zone_type": "walkway",
        "risk_bias": 0,
    },
    {
        "zone_id": "z4",
        "zone_name": "잔디 광장",
        "zone_type": "green",
        "risk_bias": -5,
    },
    {
        "zone_id": "z5",
        "zone_name": "건물 밀집 구역",
        "zone_type": "building_dense",
        "risk_bias": 5,
    },
    {
        "zone_id": "z6",
        "zone_name": "운동장",
        "zone_type": "playground",
        "risk_bias": 6,
    },
]