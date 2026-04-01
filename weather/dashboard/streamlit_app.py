# dashboard/streamlit_app.py

import json
import pandas as pd
import requests
import streamlit as st
import folium
from streamlit_folium import st_folium

API_URL = "http://127.0.0.1:8000/environment/full"
GEOJSON_PATH = "data/campus_zones.geojson"

st.set_page_config(page_title="Campus Environment Dashboard", layout="wide")


def fetch_environment_data():
    response = requests.get(API_URL, timeout=15)
    response.raise_for_status()
    return response.json()


def load_geojson():
    with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_zone_color(risk_level: str) -> str:
    if risk_level == "매우 높음":
        return "#d73027"
    elif risk_level == "높음":
        return "#fc8d59"
    elif risk_level == "주의":
        return "#fee08b"
    elif risk_level == "낮음":
        return "#91cf60"
    return "#cccccc"


def build_zone_lookup(zones):
    return {zone["zone_id"]: zone for zone in zones}


def make_map(geojson_data, zone_lookup):
    m = folium.Map(location=[34.9679, 127.4847], zoom_start=17)

    for feature in geojson_data["features"]:
        zone_id = feature["properties"]["zone_id"]
        zone_name = feature["properties"]["zone_name"]
        zone_data = zone_lookup.get(zone_id, {})

        risk_level = zone_data.get("risk_level", "정보 없음")
        heat_score = zone_data.get("heat_island_score", "-")
        feels_like = zone_data.get("feels_like", "-")
        reasons = zone_data.get("reasons", [])

        popup_html = f"""
        <b>{zone_name}</b><br>
        위험도: {risk_level}<br>
        열섬 점수: {heat_score}<br>
        체감온도: {feels_like}℃<br>
        주요 해석: {" / ".join(reasons) if reasons else "특이사항 없음"}
        """

        color = get_zone_color(risk_level)

        folium.GeoJson(
            feature,
            style_function=lambda x, color=color: {
                "fillColor": color,
                "color": "black",
                "weight": 1,
                "fillOpacity": 0.6,
            },
            tooltip=folium.Tooltip(f"{zone_name} / {risk_level}"),
            popup=folium.Popup(popup_html, max_width=320),
        ).add_to(m)

    return m


st.title("스마트 캠퍼스 환경 디지털 트윈 MVP")

try:
    data = fetch_environment_data()
    geojson_data = load_geojson()

    summary = data.get("summary", {})
    base_weather = data.get("base_weather", {})
    zones = data.get("zones", [])
    forecast = data.get("forecast", [])

    zone_lookup = build_zone_lookup(zones)

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("전체 상태", summary.get("overall_status", "정보 없음"))
    col2.metric("최고 위험 구역", summary.get("highest_risk_zone", "정보 없음"))
    col3.metric("대기질 상태", summary.get("air_quality_status", "정보 없음"))
    col4.metric("평균 열섬 점수", summary.get("average_heat_island_score", "-"))

    st.caption(f"현재 데이터 기준 시각: {data.get('timestamp', '정보 없음')}")

    left, right = st.columns([2, 1])

    with left:
        st.subheader("구역별 위험도 지도")
        m = make_map(geojson_data, zone_lookup)
        st_folium(m, width=900, height=600)

    with right:
        st.subheader("현재 환경 정보")
        st.markdown(f"- **기온:** {base_weather.get('temperature', '-')}℃")
        st.markdown(f"- **습도:** {base_weather.get('humidity', '-')}%")
        st.markdown(f"- **풍속:** {base_weather.get('wind_speed', '-')} m/s")
        st.markdown(f"- **PM10:** {base_weather.get('pm10', '-')} ㎍/m³")
        st.markdown(f"- **PM2.5:** {base_weather.get('pm25', '-')} ㎍/m³")
        st.markdown(f"- **오존:** {base_weather.get('o3', '-')} ppm")

        st.subheader("구역 상세 정보")
        selected_zone = st.selectbox(
            "구역 선택",
            options=[z["zone_id"] for z in zones],
            format_func=lambda zid: zone_lookup[zid]["zone_name"],
        )

        zone_data = zone_lookup[selected_zone]
        st.markdown(f"### {zone_data['zone_name']}")
        st.markdown(f"- 위험도: **{zone_data['risk_level']}**")
        st.markdown(f"- 추정 온도: **{zone_data['estimated_temperature']}℃**")
        st.markdown(f"- 체감 온도: **{zone_data['feels_like']}℃**")
        st.markdown(f"- 열섬 점수: **{zone_data['heat_island_score']}점**")

        if zone_data["reasons"]:
            st.markdown("**주요 해석**")
            for reason in zone_data["reasons"]:
                st.markdown(f"- {reason}")

    st.subheader("예보 데이터")
    if forecast:
        forecast_df = pd.DataFrame(forecast[:12])
        st.dataframe(forecast_df, use_container_width=True)

except Exception as e:
    st.error(f"데이터를 불러오는 중 오류가 발생했습니다: {e}")