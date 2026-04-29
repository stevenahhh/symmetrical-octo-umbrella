<<<<<<< HEAD
import pandas as pd

# 1. 기여도 정산 결과 데이터 로드
try:
    df_results = pd.read_csv("final_merit_result.csv")
except FileNotFoundError:
    print("'final_merit_result.csv' 파일이 없습니다. process_data.py를 먼저 실행해주세요.")
    exit()

# 2. 등급 및 가중치 판별 함수
def get_grade_info(xp):
    # 승급 기준: 브론즈(5회 제보/50XP), 실버(10회/100XP), 골드(20)회/200XP), 플래티넘(40회/400XP)
    if xp >= 400: return 'Platinum', 3.0
    elif xp >= 200: return 'Gold', 2.0
    elif xp >= 100: return 'Silver', 1.5
    elif xp >= 50: return 'Bronze', 1.2
    else: return 'Iron', 1.0

# 3. 승급 검증 시뮬레이션
def verify_fixed_upgrades(df):
    print("\n" + "실시간 사용자 등급 승격 시뮬레이션".center(60))
    print("="*60)
    
    # 중복 로그 방지: 동일 ID 제보가 여러 개 있어도 화면에는 한 번만 출력
    # subset='report_id'를 통해 각 리포트 ID당 하나의 행만 대표로 검증합니다.
    confirmed_reports = df[df['status'] == '확정'].drop_duplicates(subset=['report_id'])

    # 가상 유저 DB: 10 XP 단위 보상을 고려하여 임계값 직전의 XP로 설정
    mock_user_xp_db = {
        'SCN-A-0': 40,   # 이번에 10 XP 얻으면 딱 50 XP (Bronze 승급)
        'SCN-A-1': 190,  # 이번에 10 XP 얻으면 딱 200 XP (Gold 승급)
        'SCN-A-2': 390,  # 이번에 10 XP 얻으면 딱 400 XP (Platinum 승급)
    }

    for _, row in confirmed_reports.iterrows():
        user_id = row['report_id']
        
        # 시뮬레이션 대상 유저인 경우에만 로직 가동
        if user_id in mock_user_xp_db:
            # A. 기존 상태 계산 (Before)
            old_xp = mock_user_xp_db[user_id]
            old_grade, _ = get_grade_info(old_xp)
            
            # B. 새로운 상태 계산 (After: 기존 XP + 이번 제보 10 XP)
            earned_xp = row['earned_contribution']
            total_xp = old_xp + earned_xp
            new_grade, new_weight = get_grade_info(total_xp)
            
            # C. 결과 출력 (로그 저장과는 별개로 화면에만 안내)
            print(f"👤 유저 ID: {user_id}")
            print(f"   - 현재 상태: {old_grade} ({old_xp} XP)")
            print(f"   - 획득 기여: +{earned_xp} XP")
            print(f"   - 최종 합계: {total_xp} XP")
            
            # D. 등급 승격 판정 (상태 변화가 있을 때만 축하 메시지)
            if old_grade != new_grade:
                print(f"   🎊 [LEVEL UP] {old_grade} ➡️ {new_grade} 승격 완료!")
            else:
                print(f"   ✨ [KEEP] {new_grade} 등급 유지 중")
            print("-" * 60)

# 최종 검증 함수 실행
verify_fixed_upgrades(df_results)

# 파일 저장
def save_updated_profiles(df):
    updated_users = []
    
    # 가상 DB의 모든 유저에 대해 최종 상태 계산
    mock_user_xp_db = {'SCN-A-0': 40, 'SCN-A-1': 190, 'SCN-A-2': 390}
    
    for user_id, old_xp in mock_user_xp_db.items():
        # 이번에 얻은 XP 찾기 (df에서 해당 ID의 점수 합산)
        earned_xp = df[df['report_id'] == user_id]['earned_contribution'].sum()
        total_xp = old_xp + earned_xp
        new_grade, new_weight = get_grade_info(total_xp)
        
        updated_users.append({
            'user_id': user_id,
            'total_xp': total_xp,
            'current_grade': new_grade,
            'current_weight': new_weight
        })
    
    # 새로운 파일로 저장 (사용자 정보 데이터베이스 역할)
    profile_df = pd.DataFrame(updated_users)
    profile_df.to_csv("user_profiles_updated.csv", index=False, encoding="utf-8-sig")
    print("\n✅ [저장 완료] 'user_profiles_updated.csv'에 사용자 등급 정보가 기록되었습니다.")

# 실행
=======
import pandas as pd

# 1. 기여도 정산 결과 데이터 로드
try:
    df_results = pd.read_csv("final_merit_result.csv")
except FileNotFoundError:
    print("'final_merit_result.csv' 파일이 없습니다. process_data.py를 먼저 실행해주세요.")
    exit()

# 2. 등급 및 가중치 판별 함수
def get_grade_info(xp):
    # 승급 기준: 브론즈(5회 제보/50XP), 실버(10회/100XP), 골드(20)회/200XP), 플래티넘(40회/400XP)
    if xp >= 400: return 'Platinum', 3.0
    elif xp >= 200: return 'Gold', 2.0
    elif xp >= 100: return 'Silver', 1.5
    elif xp >= 50: return 'Bronze', 1.2
    else: return 'Iron', 1.0

# 3. 승급 검증 시뮬레이션
def verify_fixed_upgrades(df):
    print("\n" + "실시간 사용자 등급 승격 시뮬레이션".center(60))
    print("="*60)
    
    # 중복 로그 방지: 동일 ID 제보가 여러 개 있어도 화면에는 한 번만 출력
    # subset='report_id'를 통해 각 리포트 ID당 하나의 행만 대표로 검증합니다.
    confirmed_reports = df[df['status'] == '확정'].drop_duplicates(subset=['report_id'])

    # 가상 유저 DB: 10 XP 단위 보상을 고려하여 임계값 직전의 XP로 설정
    mock_user_xp_db = {
        'SCN-A-0': 40,   # 이번에 10 XP 얻으면 딱 50 XP (Bronze 승급)
        'SCN-A-1': 190,  # 이번에 10 XP 얻으면 딱 200 XP (Gold 승급)
        'SCN-A-2': 390,  # 이번에 10 XP 얻으면 딱 400 XP (Platinum 승급)
    }

    for _, row in confirmed_reports.iterrows():
        user_id = row['report_id']
        
        # 시뮬레이션 대상 유저인 경우에만 로직 가동
        if user_id in mock_user_xp_db:
            # A. 기존 상태 계산 (Before)
            old_xp = mock_user_xp_db[user_id]
            old_grade, _ = get_grade_info(old_xp)
            
            # B. 새로운 상태 계산 (After: 기존 XP + 이번 제보 10 XP)
            earned_xp = row['earned_contribution']
            total_xp = old_xp + earned_xp
            new_grade, new_weight = get_grade_info(total_xp)
            
            # C. 결과 출력 (로그 저장과는 별개로 화면에만 안내)
            print(f"👤 유저 ID: {user_id}")
            print(f"   - 현재 상태: {old_grade} ({old_xp} XP)")
            print(f"   - 획득 기여: +{earned_xp} XP")
            print(f"   - 최종 합계: {total_xp} XP")
            
            # D. 등급 승격 판정 (상태 변화가 있을 때만 축하 메시지)
            if old_grade != new_grade:
                print(f"   🎊 [LEVEL UP] {old_grade} ➡️ {new_grade} 승격 완료!")
            else:
                print(f"   ✨ [KEEP] {new_grade} 등급 유지 중")
            print("-" * 60)

# 최종 검증 함수 실행
verify_fixed_upgrades(df_results)

# 파일 저장
def save_updated_profiles(df):
    updated_users = []
    
    # 가상 DB의 모든 유저에 대해 최종 상태 계산
    mock_user_xp_db = {'SCN-A-0': 40, 'SCN-A-1': 190, 'SCN-A-2': 390}
    
    for user_id, old_xp in mock_user_xp_db.items():
        # 이번에 얻은 XP 찾기 (df에서 해당 ID의 점수 합산)
        earned_xp = df[df['report_id'] == user_id]['earned_contribution'].sum()
        total_xp = old_xp + earned_xp
        new_grade, new_weight = get_grade_info(total_xp)
        
        updated_users.append({
            'user_id': user_id,
            'total_xp': total_xp,
            'current_grade': new_grade,
            'current_weight': new_weight
        })
    
    # 새로운 파일로 저장 (사용자 정보 데이터베이스 역할)
    profile_df = pd.DataFrame(updated_users)
    profile_df.to_csv("user_profiles_updated.csv", index=False, encoding="utf-8-sig")
    print("\n✅ [저장 완료] 'user_profiles_updated.csv'에 사용자 등급 정보가 기록되었습니다.")

# 실행
>>>>>>> 89cde61 (fix: App.jsx 클릭 에러 수정중,  전체 프로젝트 업데이트)
save_updated_profiles(df_results)