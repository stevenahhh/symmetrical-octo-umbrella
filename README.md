# SCNU DT

### [바로가기]
- [VWorld 전환(dev-vw) 실행 인수인계](#vworld-전환dev-vw-실행-인수인계)
- [Frontend 실행 방법 (Bun)](#frontend-실행-방법-bun)
- [Weather Backend 실행 방법 (Python)](#weather-backend-실행-방법-python)
- [기존 작업 절차](#기존-작업-절차)
  - [**중요!**](#중요)

---

## VWorld 전환(dev-vw) 실행 인수인계

`dev-vw` 브랜치는 `dev` 기능을 유지하면서, Legacy와 VWorld 두 엔트리를 병행 실행할 수 있게 구성한 버전입니다.

- 건물 선택은 VWorld `MODEL_NAME` 기반 `BLD_*` 매핑을 우선 사용
- D4(공과대학 3호관)은 모델 미확인으로 인해 좌표 폴백 마커로 표시
- 단위 테스트: VWorld 선택/카메라/선택 어댑터/로더 관련 테스트 통과(총 16개)
- 빌드: `bun run build`(Legacy 기본), `bun run build:vworld`(VWorld 엔트리)

### 실행 전 필수 체크

1. Weather API는 외부 기상청 호출이 존재해 일시적으로 지연/타임아웃이 날 수 있습니다.
   (`/environment/full` 실패가 있어도 VWorld 지도/팝업 기능은 별도 영향이 작을 수 있음)
2. Vision API는 YOLO/카메라 모델 의존성이 있어 환경에 따라 최초 구동이 느릴 수 있습니다.

### PowerShell 3개 창 동시 기동

#### 1) Weather Backend (`127.0.0.1:8000`)

```powershell
cd "C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella\weather"
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload
```

#### 2) Vision API (`127.0.0.1:8001`)

```powershell
cd "C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella"
python -m venv .venv-vision
.\.venv-vision\Scripts\Activate.ps1
python -m pip install -r car_vision_model\requirements_server.txt
python vision_api.py --source 0 --port 8001
```

#### 3) Frontend (`127.0.0.1:5173`)

```powershell
cd "C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella\frontend"
@"
VITE_VWORLD_API_KEY=발급받은_VWORLD_API_KEY
VITE_API_URL=http://127.0.0.1:8000
"@ | Set-Content .env.local

bun install
bun run dev:legacy
```

VWorld 모드로 직접 실행하려면:

```powershell
bun run dev:vworld
```

### 실행 후 확인

1. 브라우저에서 `http://127.0.0.1:5173` 접속
2. 지도 건물 클릭 시 `BLD_*` 팝업이 열리는지 확인
3. D4 좌표 마커 클릭 시에도 동일 팝업 동작 확인
4. Traffic 탭에서 `http://localhost:8001/api/traffic` 응답 갱신 확인
5. VWorld는 `http://127.0.0.1:5173/index-vworld.html`에서 접속
6. VWorld 지도가 뜨지 않으면 `.env.local`의 `VITE_VWORLD_API_KEY` 값 확인

---

## Frontend 실행 방법 (Bun)

1. **Bun 설치** (설치되어 있지 않은 경우)
   - Windows (PowerShell):
     ```powershell
     powershell -c "irm bun.sh/install.ps1 | iex"
     ```
2. **의존성 설치**
   - `frontend` 디렉토리로 이동 후 설치:
     ```bash
     cd frontend
     bun install
     ```
3. **개발 서버 실행**
   ```bash
   bun run dev
   ```

---

## Weather Backend 실행 방법 (Python)

1. **가상환경 생성 및 활성화**
   - `weather` 디렉토리로 이동:
     ```bash
     cd weather
     ```
   - 가상환경 생성:
     ```bash
     python -m venv venv
     ```
   - 활성화 (Windows):
     ```bash
     .\venv\Scripts\activate
     ```
2. **패키지 설치**
   ```bash
   pip install -r requirements.txt
   ```
3. **서버 실행**
   ```bash
   python main.py
   ```
   *또는 FastAPI API 직접 실행:*
   ```bash
   uvicorn api.app:app --reload
   ```

---

## 기존 작업 절차
절차 등 **branch**를 나눠서 작업할 예정입니다.  
<br>
#### **중요!**
* **기능 추가는 Pull requests 기능을 이용하세요! 한 파일을 다수가 동시에 수정하면 안됩니다!**
* `main` 브랜치는 현재 상태로 유지합니다. 배포할 소스코드만 업로드합니다.
* 모든 작업은 이 브랜치(`dev`)에서 끝납니다. Merge, push, commit 등 모든 액션에서 확인 후 시작하세요!
* 이 Repository는 공개되지 않습니다. 종료 전까지 공개하지 않을 예정이오나 사업단 또는 그 외 증빙이 필요할 경우 공개될 수 있습니다.
---

1. 로컬 동기화: 작업 시작 전 원격 `dev` 브랜치의 최신 상태를 로컬로 가져옴
```bash
```
2. 기능 브랜치(Feature Branch) 생성: 각 작업자는 `dev` 브랜치에서 분기하여 독립적인 작업 브랜치 생성.
- 명명 규칙(`feature/login`, `feature/api-setup`) 적용.
```bash
```
3. 독립 작업 및 커밋: 할당된 기능 구현 후 로컬 환경에 커밋.
```bash
```
4. 원격 푸시: 작업이 완료된 기능 브랜치를 원격 저장소에 업로드.
```bash
```
5. Pull Request (PR) 생성: GitHub 웹 인터페이스에서 작업 브랜치(`feature/작업명`)를 타겟 브랜치(`dev`)로 병합(Merge)해달라고 요청.
6. 코드 리뷰 및 병합: 팀원 검토 후 이상이 없으면 `dev`으로 병합. 병합 완료 후 원격 및 로컬의 `feature` 브랜치 삭제.
7. 사이클 반복: 새로운 기능 개발 시 1번 단계부터 다시 수행.

동시 작업 충돌(Conflict) 통제 원칙
* 작업 단위 분리: 개발자 간 동일 파일 수정이 겹치지 않도록 기능 및 컴포넌트 단위를 명확히 분할.
* 주기적 동기화: 작업 기간이 길어질 경우, 원격 `dev`에 업데이트된 다른 팀원의 코드를 자신의 `feature` 브랜치로 수시로 병합하여 릴리스 직전의 대규모 충돌 방지.
```bash
```
* **로컬 충돌 해결:** PR 생성 전 로컬 환경에서 발생하는 충돌을 먼저 해결한 뒤 원격에 반영.
