# Supabase와 Vercel 배포

이 저장소는 Vercel에 배포할 수 있는 Vite 앱입니다. 운영 DB와 배포 계정은 사용자의 Supabase·Vercel 프로젝트에 연결합니다. 저장소에 인증 정보가 포함되어 있지 않습니다.

## 1. Supabase 만들기

1. Supabase에서 프로젝트를 생성합니다. 조직·리전·요금제는 사용자의 계정에서 선택합니다.
2. SQL Editor에서 `supabase/migrations/202610210001_workspaces.sql` 전체를 한 번 실행합니다. 기존 데이터 테이블을 삭제하는 SQL은 없습니다. 동일 정책을 중복 생성하지 않도록 최초 한 번만 적용합니다.
3. Project Settings의 API 또는 Connect 화면에서 **Project URL**과 **publishable key**를 확인합니다. 기존 프로젝트는 anon key도 지원합니다.
4. Auth에서 Email provider가 활성화되어 있는지 확인합니다.

마이그레이션은 `workspaces`와 `save_workspace` 함수를 만듭니다. RLS는 `auth.uid()`와 `owner_id`가 같은 행만 읽게 합니다. 클라이언트의 직접 INSERT/UPDATE 권한은 주지 않고, 저장 함수가 현재 로그인 사용자의 행만 revision 비교 후 갱신합니다.

## 2. 로컬 연결

```bash
cp .env.example .env.local
# .env.local에 URL과 publishable key를 입력합니다.
npm ci
npm run dev
```

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`VITE_*`는 빌드된 브라우저 코드에 공개됩니다. publishable/anon key만 넣으세요. `service_role`·secret key·DB 비밀번호는 필요하지 않습니다. 실제 `.env.local`은 Git에서 제외됩니다.

Supabase Auth → URL Configuration:

- 로컬 Site URL: `http://localhost:5173`
- 로컬 Redirect URL: `http://localhost:5173`
- 테스트 시 `127.0.0.1`을 사용하면 그 주소도 별도로 등록합니다.

로그인 버튼에서 이메일을 입력하고 메일의 링크를 엽니다. 링크는 발송한 브라우저에서 여는 것이 좋습니다. 기본 이메일 제공자의 발송 제한이 있으므로 공개 서비스 운영 전에는 Supabase의 현재 SMTP 안내에 맞춰 사용자 소유 발송 서비스를 설정하세요.

## 3. Vercel에 연결

1. Vercel → Add New → Project에서 `smiinii/archflow`를 가져옵니다.
2. Framework: **Vite**, Root Directory: 저장소 루트.
3. Build Command: `npm run build`, Output Directory: `dist`, Install Command: `npm ci`.
4. Node.js는 24 LTS를 선택합니다.
5. 위 환경 변수 두 개를 Production에 등록합니다. Preview 환경은 별도 Supabase 프로젝트를 권장합니다.
6. Deploy를 실행합니다. `vercel.json`이 정적 앱 빌드·라우팅을 설정합니다.
7. Supabase Auth의 Site URL을 실제 HTTPS 배포 주소로 바꿉니다. Redirect URLs에도 정확히 같은 origin을 등록합니다.
8. 환경 변수를 나중에 바꾸었다면 Vercel에서 다시 배포합니다. Vite는 빌드 시 값을 포함합니다.

현재 앱은 한 페이지이며 로그인 후 기본 origin으로 돌아옵니다. 임의의 외부 리디렉션 주소를 사용자 입력으로 받지 않습니다. 불필요한 모든 도메인 와일드카드를 허용하지 마세요.

## 4. 배포 후 확인

- 로그인 전 이름을 바꾸고 새로고침했을 때 로컬 초안이 복구되는지 확인합니다.
- 이메일 로그인 후 폴더·프로젝트를 만들고 ‘클라우드 저장됨’을 확인합니다.
- 다른 기기에서 동일 계정으로 로그인하여 복구되는지 확인합니다.
- 두 계정을 각각 사용하여 다른 사용자의 프로젝트가 보이지 않는지 확인합니다.
- 두 탭에서 같은 revision을 수정했을 때 충돌 안내와 ‘사본으로 합치기’가 나오는지 확인합니다.
- 오프라인 수정 후 다시 연결하여 동기화하고, 저장 실패 시 JSON 백업을 확인합니다.
- 노드 삭제와 실행 취소, 동기/비동기 선, 그룹 크기 조절, 모션 토글을 확인합니다.

로컬 테스트는 DB 권한·계산·동기화 로직을 검증하지만, 실제 이메일 제공자와 운영 리디렉션 설정을 대신하지 않습니다.

## 저장 방식과 한도

`workspaces(owner_id, revision, data, updated_at)` 한 행에 사용자별 폴더, 프로젝트, 그래프, API, 인터뷰, 버전을 저장합니다. JSONB 스냅샷이라 그래프/요청 참조를 한 번에 저장할 수 있고, revision으로 다른 수정본의 덮어쓰기를 막습니다. 현재는 개인 사용을 우선한 구조입니다.

저장 중 새 수정이 생기면 새 수정의 dirty 상태를 유지합니다. 충돌 시 서버 사본을 별도 프로젝트로 합치고 다시 저장합니다. 기기 캐시는 guest·계정 ID별로 분리합니다. 로그인 전 초안은 계정에 자동 업로드하지 않고 ‘로컬 프로젝트를 사본으로 가져오기’를 눌러 옮깁니다.

작업공간 20MB 제한이 있습니다. 큰 파일·이미지 업로드는 아직 지원하지 않습니다. 운영 비용과 무료 한도는 Supabase·Vercel의 현재 정책을 확인하세요.

## 공식 문서

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Supabase React Auth](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 선택: GitHub Actions 자동 검사

`docs/ci.example.yml`을 `.github/workflows/ci.yml`로 복사해 커밋하면 자동 검사를 켤 수 있습니다. 워크플로 파일 생성에는 GitHub 토큰 또는 앱의 workflow 쓰기 권한이 필요합니다. 기본 앱과 Vercel 배포는 이 설정 없이 동작합니다.
