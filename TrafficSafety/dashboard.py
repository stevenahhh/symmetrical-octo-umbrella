import streamlit as st
import pandas as pd
import folium
from streamlit_folium import st_folium
import plotly.express as px

# 1. 페이지 기본 설정 (넓은 화면 사용)
st.set_page_config(page_title="순천대 스마트 캠퍼스 안전망", page_icon="🛡️", layout="wide")

# 2. 데이터 불러오기 (우리가 만든 백엔드의 결과물!)
@st.cache_data
def load_data():
    try:
        df = pd.read_csv("final_merit_result.csv")
        return df
    except FileNotFoundError:
        st.error("🚨 'final_merit_result.csv' 파일이 없습니다. 백엔드 로직을 먼저 실행해주세요!")
        return pd.DataFrame()

df = load_data()

# 3. 대시보드 헤더
st.title("🛡️ 순천대학교 스마트 캠퍼스 안전망 (PoC)")
st.markdown("**AI 비전 패스트트랙**과 **NLP 집단지성**이 결합된 실시간 위험 감지 대시보드입니다.")
st.divider()

if not df.empty:
    # 4. 상단 핵심 요약 지표 (KPI)
    col1, col2, col3, col4 = st.columns(4)
    total_reports = len(df)
    confirmed_reports = len(df[df['status'] == '확정'])
    ai_fast_track = len(df[(df['status'] == '확정') & (df['ai_confidence'] >= 0.45)])
    total_points_given = df['earned_points'].sum()

    col1.metric("총 접수된 제보", f"{total_reports}건")
    col2.metric("검증 완료 (확정)", f"{confirmed_reports}건", "보안팀 출동 대기")
    col3.metric("🤖 AI 즉시 확정 (패스트트랙)", f"{ai_fast_track}건", "0초 만에 처리됨")
    col4.metric("지급된 총 보상 포인트", f"{total_points_given} P")
    
    st.divider()

    # 5. 메인 레이아웃: 좌측(지도) / 우측(데이터 및 차트)
    map_col, chart_col = st.columns([3, 2])

    with map_col:
        st.subheader("📍 실시간 캠퍼스 위험 구역 지도")
        
        # 순천대 공학관 인근 중심 좌표
        m = folium.Map(location=[34.9690, 127.4810], zoom_start=16)
        
        # 데이터프레임을 돌면서 지도에 핀(Marker) 꽂기
        for idx, row in df.iterrows():
            # 상태가 '확정'이면 빨간색 위험 핀, '신규(대기)'면 회색 핀
            if row['status'] == '확정':
                pin_color = 'red'
                icon_type = 'info-sign'
            else:
                pin_color = 'lightgray'
                icon_type = 'question-sign'
                
            # 핀을 클릭했을 때 나올 팝업 내용 구성
            popup_html = f"""
            <b>분류:</b> {row['category']}<br>
            <b>상태:</b> {row['status']}<br>
            <b>AI 신뢰도:</b> {row.get('ai_confidence', 0):.2f}<br>
            <b>추출 텍스트:</b> {row.get('extracted_text', '없음')}<br>
            """
            
            folium.Marker(
                location=[row['latitude'], row['longitude']],
                popup=folium.Popup(popup_html, max_width=300),
                tooltip=row['category'],
                icon=folium.Icon(color=pin_color, icon=icon_type)
            ).add_to(m)

        # Streamlit 화면에 Folium 지도 렌더링
        st_folium(m, width=700, height=500)

    with chart_col:
        st.subheader("📊 유저 등급별 기여도 현황")
        # 상태가 확정된 데이터만 모아서 등급별로 그룹핑
        confirmed_df = df[df['status'] == '확정']
        if not confirmed_df.empty:
            grade_summary = confirmed_df.groupby('user_grade')['earned_contribution'].sum().reset_index()
            
            # Plotly
            fig = px.bar(grade_summary, x='user_grade', y='earned_contribution', 
                         title="어떤 등급의 유저가 가장 많이 기여했을까?",
                         labels={'user_grade': '유저 등급', 'earned_contribution': '획득한 기여도(XP)'},
                         color='user_grade')
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("아직 확정된 제보가 없어 통계를 낼 수 없습니다.")

    st.divider()
    
    # 6. 하단: 전체 데이터 테이블
    st.subheader("📁 전체 제보 데이터 (Raw Data)")
    st.dataframe(df[['report_id', 'category', 'status', 'ai_confidence', 'extracted_text', 'user_grade', 'final_trust_score']], use_container_width=True)