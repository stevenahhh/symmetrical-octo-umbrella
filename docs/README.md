# SCNU Digital Twin

국립순천대학교 캠퍼스 디지털 트윈 프로토타입 저장소입니다.

## VWorld 렌더러 전환 요약 (`dev-vw`)

- 기존 `dev`의 시뮬레이션/대시보드/미기후 API 연동 기능은 유지하면서,
  3D 뷰 렌더러는 VWorld로 교체했습니다.
- 건물 선택은 `MODEL_NAME` 기반 `BLD_*` ID로 먼저 매핑하고,
  VWorld 내에 실제 모델이 없는 D4은 좌표 마커 폴백으로 처리합니다.
- Legacy 화면과 VWorld 화면을 별도 엔트리(`index.html`, `index-vworld.html`)로 병행 실행할 수 있습니다.

## 관련 폴더

- `frontend/src/vworld/`: VWorld 렌더러 본체와 선택/카메라/마커 핸들러
- `weather/api/app.py`: 미기후 팝업용 엔드포인트(
  `/microclimate/elements/{element_id}/popup`
  등)
- `vision_api.py`: 트래픽 탭에서 사용하는 카메라/차량 카운팅 API

## 실행 인수인계(복붙용)

```powershell
# 1) Weather Backend (127.0.0.1:8000)
cd C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella\weather
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload

# 2) Vision API (127.0.0.1:8001)
cd C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella
python -m venv .venv-vision
.\.venv-vision\Scripts\Activate.ps1
python -m pip install -r car_vision_model\requirements_server.txt
python vision_api.py --source 0 --port 8001

# 3) Frontend (127.0.0.1:5173)
cd C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella\frontend
@"
VITE_VWORLD_API_KEY=발급받은_VWORLD_API_KEY
VITE_API_URL=http://127.0.0.1:8000
"@ | Set-Content .env.local
bun install

# Legacy 모드
bun run dev:legacy

# VWorld 모드
bun run dev:vworld
```

## 확인 포인트

- Legacy/VWorld 모두:
  - 브라우저 접속 후 지도가 정상 렌더링되는지
- VWorld 모드만:
  - 지도가 안 뜨면 `.env.local`의 `VITE_VWORLD_API_KEY` 값 확인

- 지도가 안 보이면 `VITE_VWORLD_API_KEY` 누락/오타 여부 확인
- 미기후 팝업이 비어 있으면 백엔드에서 `/microclimate/elements/{id}/popup` 응답을 확인
- Weather API 외부 호출 지연 시 `/environment/full`은 실패할 수 있으므로,
  미기후 팝업(백엔드 내부 microclimate) 중심으로 우선 검증
