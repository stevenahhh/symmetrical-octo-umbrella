## Frontend (legacy + VWorld 분기)

이 디렉토리는 `dev-vw` 브랜치에서 Legacy 화면과 VWorld 화면을 동시에 운용할 수 있게 구성된 실행 가이드입니다.

### 실행 전제

필수 환경 변수: `frontend/.env.local`

```text
VITE_API_URL=http://127.0.0.1:8000
```

`VITE_VWORLD_API_KEY`는 VWorld 모드에서만 필요합니다.

#### 모드별 `.env.local` 예시

- **Legacy (기본)만 필요한 경우**

```text
VITE_API_URL=http://127.0.0.1:8000
```

- **VWorld 실행 시 추가**

```text
VITE_API_URL=http://127.0.0.1:8000
VITE_VWORLD_API_KEY=발급받은_VWORLD_API_KEY
```

- Legacy 모드: `VITE_API_URL`만 있으면 실행 가능
- VWorld 모드: `VITE_VWORLD_API_KEY` 추가 필요

### 실행 런북 (항상 같은 순서)

```powershell
cd C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella\frontend
bun install
```

#### Legacy

```powershell
bun run dev:legacy
```

- 브라우저: `http://127.0.0.1:5173`

#### VWorld

```powershell
bun run dev:vworld
```

- 브라우저: `http://127.0.0.1:5173/index-vworld.html`

### 빌드

```powershell
bun run build             # Legacy (dist/)
bun run build:vworld       # VWorld (dist-vworld/)
```

```powershell
cd C:\Users\steve\Desktop\projects\qwe\symmetrical-octo-umbrella\frontend
bun run preview
```

### 체크리스트

#### 공통

- 지도 상 건물 클릭 시 오른쪽 패널/팝업이 표시되는지
- D4(공과대학 3호관) 좌표 마커 클릭 동작 확인
- 개발자 도구 콘솔에 `vw` 객체 생성 오류가 없는지

#### 실행 모드별

- **Legacy 모드**: `bun run dev:legacy`
  - `http://127.0.0.1:5173` 접속
- **VWorld 모드**: `bun run dev:vworld`
  - `http://127.0.0.1:5173/index-vworld.html` 접속

### 빠른 동작 점검 체크리스트

- 공통
  - 앱 진입 후 화면이 렌더링되는지 확인
  - 좌측/우측 패널 전환이 정상 동작하는지 확인
- VWorld 모드
  - 지도 SDK 스크립트 오류 없이 지도 렌더링 확인
  - `.env.local`의 `VITE_VWORLD_API_KEY`가 유효한지 확인
