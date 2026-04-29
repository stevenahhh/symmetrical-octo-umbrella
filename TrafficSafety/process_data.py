<<<<<<< HEAD
import pandas as pd
from datetime import timedelta
import easyocr
import cv2
import re

# ---  NLP 교차 검증용 ---
from sentence_transformers import SentenceTransformer, util

# 1. 시나리오가 포함된 데이터를 읽어옵니다.
df = pd.read_csv("campus_safety_combined.csv")
df['timestamp'] = pd.to_datetime(df['timestamp'])


# [AI 모델 사전 로딩] 비전(Vision) 및 자연어(NLP) 모델 준비
print("\n AI 비전(EasyOCR) 및 자연어(NLP) 모델을 불러오는 중입니다...")
reader = easyocr.Reader(['ko', 'en'])
nlp_model = SentenceTransformer('jhgan/ko-sroberta-multitask') # 한국어 특화 NLP 등판!

IMAGE_PATH = 'test_car.jpg' 
img = cv2.imread(IMAGE_PATH)

if img is not None:
    # 비전 AI 전처리 및 번호판 추출
    img_resized = cv2.resize(img, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    processed_img = cv2.convertScaleAbs(img_resized, alpha=1.5, beta=0)
    
    results = reader.readtext(processed_img, detail=1)
    plate_pattern = re.compile(r'\d{2,3}[가-힣]\d{4}')
    
    final_confidence = 0.0
    final_plate = "알 수 없음"
    
    for bbox, text, confidence in results:
        clean_text = re.sub(r'[^가-힣0-9]', '', text) 
        match = plate_pattern.search(clean_text)
        if match:
            final_plate = match.group()
            final_confidence = confidence
            print(f" 비전 AI 판독 완료: 번호판 '{final_plate}' (신뢰도: {final_confidence:.4f})\n")
            break 

    # SCN-B-SINGLE 데이터에 실시간 비전 결과 덮어쓰기
    idx = df.index[df['report_id'] == 'SCN-B-SINGLE'].tolist()
    if idx:
        df.at[idx[0], 'ai_confidence'] = final_confidence
        df.at[idx[0], 'extracted_text'] = final_plate
else:
    print(f"❌ '{IMAGE_PATH}' 사진을 찾을 수 없어 기존 데이터를 사용합니다.\n")
# =====================================================================


# 2. 판별 및 보상 로직: 듀얼 트랙 (비전 즉시 확정 + NLP 기반 집단지성)
def run_merit_system(df):
    df['status'] = '신규'
    df['final_trust_score'] = 0.0
    df['earned_points'] = 0      
    df['earned_contribution'] = 0 
    
    FIXED_REWARD_POINT = 100
    FIXED_CONTRIBUTION_XP = 10
    
    for i, row in df.iterrows():
        
        # ---------------------------------------------------------
        # [트랙 1: AI 패스트트랙] 비전 신뢰도가 0.45 이상인 불법 주차인가?
        if row['category'] == '불법 주차' and row.get('ai_confidence', 0) >= 0.45:
            df.at[i, 'status'] = '확정'
            df.at[i, 'earned_points'] = FIXED_REWARD_POINT
            df.at[i, 'earned_contribution'] = FIXED_CONTRIBUTION_XP
            
            print(f"🤖 [비전 AI 즉시 확정] {row['category']} 발생! (ID: {row['report_id']})")
            print(f"   ㄴ 보안팀 차량 이동 알림 발송 (신뢰도 {row.get('ai_confidence', 0):.2f})")
            print(f"   ㄴ 보상: 단독 기여 유저에게 {FIXED_REWARD_POINT}p 및 {FIXED_CONTRIBUTION_XP}XP 지급\n")
            continue # 즉시 확정되었으므로 아래 교차 검증(NLP) 로직은 건너뜀

        # ---------------------------------------------------------
        # [트랙 2: NLP 기반 집단지성] 1차 방어선 - 시공간(GPS/Time) 필터링
        mask = (
            (df['category'] == row['category']) &
            (df['timestamp'].between(row['timestamp'] - timedelta(minutes=30), row['timestamp'] + timedelta(minutes=30))) &
            (abs(df['latitude'] - row['latitude']) < 0.0001) &
            (abs(df['longitude'] - row['longitude']) < 0.0001)
        )
        
        related_reports = df[mask]
        valid_indices = []
        
        # 💡 핵심: 제보 텍스트가 있다면 가져오고, 없으면 카테고리명으로 임시 대체
        row_text = str(row.get('description', row['category']))
        row_emb = nlp_model.encode(row_text)
        
        # 2차 방어선 - NLP 문맥 필터링 (10m 이내 제보들을 진짜 같은 사건인지 텍스트로 비교)
        for rel_i, rel_row in related_reports.iterrows():
            rel_text = str(rel_row.get('description', rel_row['category']))
            rel_emb = nlp_model.encode(rel_text)
            
            # 코사인 유사도 계산
            sim = util.cos_sim(row_emb, rel_emb).item()
            
            # 유사도가 0.45 이상일 때만 (즉, 문맥상 같은 사건일 때만) 합산 대상에 포함
            if sim >= 0.45:
                valid_indices.append(rel_i)
                
        # NLP 필터링을 통과한 제보들만 남김
        final_related_reports = df.loc[valid_indices]
        
        # 가중치(user_weight) 합산
        total_weight = final_related_reports['user_weight'].sum()
        df.at[i, 'final_trust_score'] = total_weight
        
        # [확정 판정] 합산 점수가 3.0 이상일 때 확정
        if total_weight >= 3.0:
            df.at[i, 'status'] = '확정'
            df.at[i, 'earned_points'] = FIXED_REWARD_POINT
            df.at[i, 'earned_contribution'] = FIXED_CONTRIBUTION_XP
            
            print(f"🚨 [NLP 집단지성 확정] {row['category']} 발생! (ID: {row['report_id']})")
            print(f"   ㄴ 10m 이내 제보 중 문맥 유사도 45% 이상인 제보만 교차 검증 완료.")
            print(f"   ㄴ 누적 신뢰도: {total_weight:.1f}점 / 보상 지급 완료\n")
            
    return df

# 3. 로직 실행
final_df = run_merit_system(df)

# 4. 결과 요약
summary = final_df[final_df['status'] == '확정'].groupby('user_grade').agg({
    'earned_points': 'sum',
    'earned_contribution': 'sum'
})

print("="*50)
print("📊 보상 및 기여도 정산 요약")
print("="*50)
print(summary)
print("="*50)

=======
import pandas as pd
from datetime import timedelta
import easyocr
import cv2
import re

# ---  NLP 교차 검증용 ---
from sentence_transformers import SentenceTransformer, util

# 1. 시나리오가 포함된 데이터를 읽어옵니다.
df = pd.read_csv("campus_safety_combined.csv")
df['timestamp'] = pd.to_datetime(df['timestamp'])


# [AI 모델 사전 로딩] 비전(Vision) 및 자연어(NLP) 모델 준비
print("\n AI 비전(EasyOCR) 및 자연어(NLP) 모델을 불러오는 중입니다...")
reader = easyocr.Reader(['ko', 'en'])
nlp_model = SentenceTransformer('jhgan/ko-sroberta-multitask') # 한국어 특화 NLP 등판!

IMAGE_PATH = 'test_car.jpg' 
img = cv2.imread(IMAGE_PATH)

if img is not None:
    # 비전 AI 전처리 및 번호판 추출
    img_resized = cv2.resize(img, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    processed_img = cv2.convertScaleAbs(img_resized, alpha=1.5, beta=0)
    
    results = reader.readtext(processed_img, detail=1)
    plate_pattern = re.compile(r'\d{2,3}[가-힣]\d{4}')
    
    final_confidence = 0.0
    final_plate = "알 수 없음"
    
    for bbox, text, confidence in results:
        clean_text = re.sub(r'[^가-힣0-9]', '', text) 
        match = plate_pattern.search(clean_text)
        if match:
            final_plate = match.group()
            final_confidence = confidence
            print(f" 비전 AI 판독 완료: 번호판 '{final_plate}' (신뢰도: {final_confidence:.4f})\n")
            break 

    # SCN-B-SINGLE 데이터에 실시간 비전 결과 덮어쓰기
    idx = df.index[df['report_id'] == 'SCN-B-SINGLE'].tolist()
    if idx:
        df.at[idx[0], 'ai_confidence'] = final_confidence
        df.at[idx[0], 'extracted_text'] = final_plate
else:
    print(f"❌ '{IMAGE_PATH}' 사진을 찾을 수 없어 기존 데이터를 사용합니다.\n")
# =====================================================================


# 2. 판별 및 보상 로직: 듀얼 트랙 (비전 즉시 확정 + NLP 기반 집단지성)
def run_merit_system(df):
    df['status'] = '신규'
    df['final_trust_score'] = 0.0
    df['earned_points'] = 0      
    df['earned_contribution'] = 0 
    
    FIXED_REWARD_POINT = 100
    FIXED_CONTRIBUTION_XP = 10
    
    for i, row in df.iterrows():
        
        # ---------------------------------------------------------
        # [트랙 1: AI 패스트트랙] 비전 신뢰도가 0.45 이상인 불법 주차인가?
        if row['category'] == '불법 주차' and row.get('ai_confidence', 0) >= 0.45:
            df.at[i, 'status'] = '확정'
            df.at[i, 'earned_points'] = FIXED_REWARD_POINT
            df.at[i, 'earned_contribution'] = FIXED_CONTRIBUTION_XP
            
            print(f"🤖 [비전 AI 즉시 확정] {row['category']} 발생! (ID: {row['report_id']})")
            print(f"   ㄴ 보안팀 차량 이동 알림 발송 (신뢰도 {row.get('ai_confidence', 0):.2f})")
            print(f"   ㄴ 보상: 단독 기여 유저에게 {FIXED_REWARD_POINT}p 및 {FIXED_CONTRIBUTION_XP}XP 지급\n")
            continue # 즉시 확정되었으므로 아래 교차 검증(NLP) 로직은 건너뜀

        # ---------------------------------------------------------
        # [트랙 2: NLP 기반 집단지성] 1차 방어선 - 시공간(GPS/Time) 필터링
        mask = (
            (df['category'] == row['category']) &
            (df['timestamp'].between(row['timestamp'] - timedelta(minutes=30), row['timestamp'] + timedelta(minutes=30))) &
            (abs(df['latitude'] - row['latitude']) < 0.0001) &
            (abs(df['longitude'] - row['longitude']) < 0.0001)
        )
        
        related_reports = df[mask]
        valid_indices = []
        
        # 💡 핵심: 제보 텍스트가 있다면 가져오고, 없으면 카테고리명으로 임시 대체
        row_text = str(row.get('description', row['category']))
        row_emb = nlp_model.encode(row_text)
        
        # 2차 방어선 - NLP 문맥 필터링 (10m 이내 제보들을 진짜 같은 사건인지 텍스트로 비교)
        for rel_i, rel_row in related_reports.iterrows():
            rel_text = str(rel_row.get('description', rel_row['category']))
            rel_emb = nlp_model.encode(rel_text)
            
            # 코사인 유사도 계산
            sim = util.cos_sim(row_emb, rel_emb).item()
            
            # 유사도가 0.45 이상일 때만 (즉, 문맥상 같은 사건일 때만) 합산 대상에 포함
            if sim >= 0.45:
                valid_indices.append(rel_i)
                
        # NLP 필터링을 통과한 제보들만 남김
        final_related_reports = df.loc[valid_indices]
        
        # 가중치(user_weight) 합산
        total_weight = final_related_reports['user_weight'].sum()
        df.at[i, 'final_trust_score'] = total_weight
        
        # [확정 판정] 합산 점수가 3.0 이상일 때 확정
        if total_weight >= 3.0:
            df.at[i, 'status'] = '확정'
            df.at[i, 'earned_points'] = FIXED_REWARD_POINT
            df.at[i, 'earned_contribution'] = FIXED_CONTRIBUTION_XP
            
            print(f"🚨 [NLP 집단지성 확정] {row['category']} 발생! (ID: {row['report_id']})")
            print(f"   ㄴ 10m 이내 제보 중 문맥 유사도 45% 이상인 제보만 교차 검증 완료.")
            print(f"   ㄴ 누적 신뢰도: {total_weight:.1f}점 / 보상 지급 완료\n")
            
    return df

# 3. 로직 실행
final_df = run_merit_system(df)

# 4. 결과 요약
summary = final_df[final_df['status'] == '확정'].groupby('user_grade').agg({
    'earned_points': 'sum',
    'earned_contribution': 'sum'
})

print("="*50)
print("📊 보상 및 기여도 정산 요약")
print("="*50)
print(summary)
print("="*50)

>>>>>>> 89cde61 (fix: App.jsx 클릭 에러 수정중,  전체 프로젝트 업데이트)
final_df.to_csv("final_merit_result.csv", index=False, encoding="utf-8-sig")