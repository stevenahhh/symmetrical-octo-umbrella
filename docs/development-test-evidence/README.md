# 개발 및 테스트 시각 증거 자료

보고서에 바로 삽입할 수 있도록 D4 건물/강의실 기능과 단위 테스트 실행 결과를 일반 문서형 이미지로 정리한 자료입니다.

## 보고서용 이미지

| 파일 | 크기 | 내용 |
|---|---:|---|
| `pdf-pages/01-d4-building-overview.png` | 2160×1440 | D4 6개 층, 두 개 동, 3·5층 연결 다리, 층별 실 수, 특수 공간 |
| `pdf-pages/02-d4-room-301-detail.png` | 2160×1440 | 301호 상세, 시간표, 냉난방, 주간 절감량 및 절감률 |
| `pdf-pages/03-solar-pv-tests.png` | 2160×1440 | 태양 위치·태양광 계산 테스트 5건과 검증값 |
| `pdf-pages/04-vworld-tests.png` | 2160×1440 | VWorld 선택·카메라·SDK 테스트 16건과 검증 경로 |
| `pdf-pages/05-conference-strategy.png` | 2160×1440 | 구현 근거에 맞춘 학회 투고 전략과 논문 프레임 |
| `pdf-pages/06-conference-primary.png` | 2160×1440 | KSII·IEIE·ACK 우선 투고 후보와 최신 마감 |
| `pdf-pages/07-conference-followup.png` | 2160×1440 | KIIT·KISM·KICS 및 센서·정보보호 특수 후보 |
| `pdf-pages/08-conference-audit.png` | 2160×1440 | 8개 후보 비교, 주의사항, 공식 출처 |

모든 보고서용 이미지는 `index.html`을 `development-test-evidence.pdf`로 인쇄한 뒤 PDF 각 페이지를 144dpi PNG로 변환한 결과입니다. 본문 18px, 제목 40px, 일반 굵기 400을 사용하며 제목 부제목과 페이지 footer는 표시하지 않습니다.

## 실제 실행 화면

| 파일 | 크기 | 내용 |
|---|---:|---|
| `00-live-d4-room-detail-2x.png` | 3840×2160 | Legacy 대시보드에서 D4 301호를 선택한 실제 화면 |
| `00-live-d4-room-schedule-2x.png` | 3840×2160 | 실제 화면에서 301호 시간표를 연 상태 |

실제 실행 화면은 1920×1080 CSS 뷰포트를 `deviceScaleFactor=2`로 캡처하여 글자와 UI 요소를 2배 물리 해상도로 저장했습니다.
두 이미지에는 단독으로 사용하더라도 데이터 성격을 오해하지 않도록 `목업·시뮬레이션 데이터 · 실측·실시간 운영값 아님` 배너를 포함했습니다.

## 실행 로그와 요약

수정하지 않은 테스트 출력:

- `logs/solar-pv-tests-raw.log`
- `logs/vworld-tests-raw.log`

실행 결과와 파생값을 설명한 가공 요약:

- `logs/d4-runtime-summary.txt`
- `logs/solar-pv-tests-summary.txt`
- `logs/vworld-tests-summary.txt`

## HTML 및 PDF 원본

`index.html`에는 기존 네 개의 2160×1440 증거 페이지와 네 개의 학회 조사 부록이 순서대로 포함되어 있습니다.
`development-test-evidence.pdf`는 동일한 여덟 페이지를 15×10인치 크기로 출력한 중간 결과입니다.

## HTML → PDF → PNG 재생성

PowerShell에서 다음 명령을 실행하면 HTML에서 PDF를 생성한 뒤 PDF 여덟 페이지를 2160×1440 PNG로 변환합니다.

```powershell
powershell -ExecutionPolicy Bypass -File docs/development-test-evidence/export-evidence.ps1
```

필요 도구:

- Node.js 및 `npx`
- Chrome
- Python 실행기 `uv` (`render-pdf.py`가 PyMuPDF 버전을 고정하여 설치)

페이지 ID:

1. `#d4-building`
2. `#d4-room`
3. `#solar-tests`
4. `#vworld-tests`
5. `#conference-strategy`
6. `#conference-primary`
7. `#conference-followup`
8. `#conference-audit`

## 실행 및 검증 명령

```powershell
bun run --cwd frontend test
node --test frontend/src/vworld/*.test.mjs
bun run --cwd frontend dev:legacy
python -m uvicorn api.app:app --app-dir weather --host 127.0.0.1 --port 8000
```

## 데이터 성격

- D4 층, 강의실, 시간표, 냉난방 및 절감량 정보는 기능 검증용 목업·시뮬레이션 데이터입니다.
- 태양광 발전량은 입력 조건에 따른 계산 결과이며 실측 발전량이 아닙니다.
- 테스트 통과 수와 테스트 이름은 이번 작업에서 다시 실행한 Node 테스트 로그를 기준으로 작성했습니다.

