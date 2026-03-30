import pandas as pd
from faker import Faker
import random
from datetime import datetime, timedelta

fake = Faker('ko_KR')
NUM_DATA = 100

# 1. 5단계 등급 및 가중치 설정
USER_GRADES = {
    'Iron': 1.0, 'Bronze': 1.2, 'Silver': 1.5, 'Gold': 2.0, 'Platinum': 3.0
}
CATEGORIES = ['시설물 파손', '공사 구역', '불법 주차', '위험 운전', '교내 위험물', '재난']
LAT_RANGE, LNG_RANGE = (34.965, 34.970), (127.475, 127.485)

data_list = []
for i in range(NUM_DATA):
    grade = random.choice(list(USER_GRADES.keys()))
    category = random.choice(CATEGORIES)
    
    # 카테고리가 불법 주차일 때만 AI가 점수를 매기도록 설정
    ai_score = random.uniform(0.5, 0.95) if category == '불법 주차' else 0.0

    data_list.append({
        "report_id": f"RPT-2026-{i:03d}",
        "category": category,
        "latitude": random.uniform(*LAT_RANGE),
        "longitude": random.uniform(*LNG_RANGE),
        "timestamp": fake.date_time_between(start_date='-1h', end_date='now'),
        "user_grade": grade,
        "user_weight": USER_GRADES[grade],
        "ai_confidence": ai_score, # AI 신뢰도
        "status": "신규"
    })

# 2. 시나리오 A 데이터 추가 (도서관 앞 시설물 파손)
now = datetime.now()
for i in range(3):
    data_list.append({
        "report_id": f"SCN-A-{i}",
        "category": "시설물 파손",
        "latitude": 34.9680, "longitude": 127.4800,
        "timestamp": now - timedelta(minutes=i*5),
        "user_grade": "Platinum",
        "user_weight": 3.0,
        "ai_confidence": 0.0, # 시설물 파손은 AI 인식이 없으므로 0점
        "status": "신규"
    })

# 3. 시나리오 B 데이터 추가 (도서관 앞 불법 주차 - 실제 AI 데이터 연동)
data_list.append({
    "report_id": "SCN-B-SINGLE",
    "category": "불법 주차",
    "latitude": 34.9690, "longitude": 127.4810,
    "timestamp": now,
    "user_grade": "Iron",
    "user_weight": 1.0,     
    "ai_confidence": 0.4943,        # 👈 진짜 AI가 뽑아준 신뢰도 (49.4%)
    "extracted_text": "193보2803",  # 👈 진짜 AI가 뽑아준 번호판 텍스트
    "status": "신규"
})

df = pd.DataFrame(data_list)
df.to_csv("campus_safety_combined.csv", index=False, encoding="utf-8-sig")
print("'campus_safety_combined.csv'가 성공적으로 생성되었습니다!")