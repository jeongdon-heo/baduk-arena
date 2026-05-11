# Baduk Arena

온라인 1:1 바둑 / 오목 대국장. React + Vite + Firebase로 만든 정적 웹앱입니다.

- **로컬 대국**: 같은 화면에서 둘이 두기, 또는 AI 대전 (MCTS 기반 바둑 AI, Minimax 기반 오목 AI)
- **온라인 대국**: 방 코드로 입장하는 1:1 실시간 대국 (Firebase Firestore 동기화)
- **지원 게임**: 바둑 (9·13·19줄, 따냄·집 계산·패 규칙·덤 6.5집), 오목 (13·15·19줄, 5목 승리 판정)

---

## 빠른 시작

### 1. 설치

```bash
npm install
```

### 2. 로컬 모드만 실행 (Firebase 없이도 동작)

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 열기. "온라인 대국" 버튼은 Firebase 미설정 안내로 이어집니다.

### 3. 온라인 모드를 활성화하려면 Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트 생성
2. **Authentication** → **Sign-in method** → **Anonymous** 켜기
3. **Firestore Database** → **데이터베이스 만들기** (프로덕션 모드, 리전 선택)
4. **Firestore Database** → **Rules** 탭에 [`firestore.rules`](./firestore.rules) 내용 붙여넣기 → 게시
5. 프로젝트 개요 → 웹 앱 추가 (`</>` 아이콘) → 표시되는 `firebaseConfig` 값 복사
6. 이 저장소 루트에 `.env.local` 파일을 만들고 [`.env.example`](./.env.example) 형식대로 채우기:

   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123...
   VITE_FIREBASE_APP_ID=1:123...:web:...
   ```

7. 개발 서버 재시작 — 이제 "온라인 대국"이 동작합니다.

---

## Vercel에 배포

1. 이 저장소를 GitHub에 푸시
2. [Vercel](https://vercel.com/) 가입 → **Add New Project** → 이 GitHub 저장소 선택
3. Framework: **Vite** (자동 감지됨), 다른 설정은 기본값
4. **Environment Variables** 섹션에서 `.env.local`의 6개 변수를 모두 추가 (Production/Preview/Development 전부 체크)
5. **Deploy** 클릭 → 약 1분 후 배포 완료

이후 `main` 브랜치에 푸시할 때마다 자동 재배포됩니다. PR마다 별도 미리보기 URL도 생성됩니다.

---

## 프로젝트 구조

```
src/
├── main.jsx          진입점
├── App.jsx           최상위 (BoardArena 렌더)
├── BoardArena.jsx    홈/설정/로컬 게임 화면
├── OnlineLobby.jsx   방 만들기/입장 UI
├── OnlineGame.jsx    온라인 대국 (Firestore 구독)
├── BoardView.jsx     SVG 보드 (로컬·온라인 공유)
├── gameLogic.js      바둑/오목 규칙 + AI
├── styles.js         디자인 토큰
├── firebase.js       Firebase 초기화 (env 미설정 시 graceful fallback)
└── index.css         글로벌 스타일
```

---

## 게임 규칙 메모

### 바둑
- 두 번 연속 패스 → 종국, 영역 계산 (집 + 살아있는 돌 + 백 6.5집 덤)
- 따냄 및 자살수 금지, 단순 패(劫) 규칙 적용
- 9줄 기본 (빠른 한 판), 13·19줄 선택 가능

### 오목
- 5목 먼저 만들면 승리
- 금수 규칙은 적용하지 않음 (간이 규칙)

---

## 보안 모델 (중요)

현재 버전은 **친구·지인 간 대국**을 가정합니다.

- 클라이언트가 직접 Firestore에 수를 기록합니다.
- 룰 검증은 클라이언트에서만 수행하므로, 개발자도구를 조작해 반칙을 만들 여지가 있습니다.
- 공개 서비스로 키울 경우 Cloud Functions로 서버 측 수 검증을 추가하세요.

자세한 내용은 [`firestore.rules`](./firestore.rules)의 주석 참고.

---

## 빌드

```bash
npm run build      # dist/ 로 정적 파일 생성
npm run preview    # 빌드 결과를 로컬에서 미리 보기
```

---

## 라이선스

MIT
