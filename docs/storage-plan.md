# Archflow 저장·배포 권장안

2026-10-21. 아래는 초기 설계 제안이며, 실제 앱은 사용자별 workspaces JSONB 스냅샷과 revision 비교 저장으로 구현했다. Supabase 서울 리전 프로젝트 생성과 마이그레이션, Vercel 운영 배포를 완료했다. 실제 이메일 로그인·클라우드 복원과 일반 사용자용 SMTP는 후속 확인 항목이다. 상세 상태는 deployment.md, SQL은 supabase/migrations를 따른다.

## 권장 구성

- 웹 앱: GitHub 저장소를 Vercel에 연결해 배포한다.
- 영구 데이터: 외부 Supabase Postgres를 연결한다. Vercel에 DB 프로세스를 직접 띄우는 방식으로 구성하지 않는다.
- 로그인: Supabase Auth. 최초 버전은 개인 사용자 소유 프로젝트를 기본 비공개로 저장한다.
- 선택적 파일: 이미지/첨부를 지원할 때 Supabase Storage를 추가한다. 노드·연결·좌표 자체는 이미지가 아니라 JSON 데이터다.
- AI: 외부 AI 도구에서 사용자의 이용 한도로 실행한다. Archflow 서버는 모델 호출 없이 저장/검증/계산을 맡는다.

## 데이터 구조

- `folders`: id, owner_id, parent_id, name, sort_order.
- `projects`: id, owner_id, folder_id, name, description, created_at, updated_at.
- `architecture_documents`: id, project_id, owner_id, schema_version, revision, graph(jsonb), updated_at.
- `api_flows`: id, project_id, owner_id, name, method, route, graph_refs(jsonb), assumptions(jsonb), targets(jsonb).
- `architecture_versions`: id, project_id, owner_id, parent_version_id, title, snapshot(jsonb), source(manual/ai), created_at.
- `interview_results`: id, project_id, owner_id, summary, confirmed_facts(jsonb), unknowns(jsonb), architecture_proposal(jsonb), created_at.

초기 구현에서는 프로젝트의 그래프 문서 한 개에 nodes/edges/groups/viewports와 API별 참조를 JSONB로 저장해도 된다. 프로젝트 메타데이터와 소유권은 관계형 컬럼으로 분리한다. 노드와 엣지에 안정적인 ID를 부여하고 동기/비동기/구성 관계를 엣지의 type으로 보관한다. 그래프 스키마 버전과 revision을 저장해 마이그레이션·동시 편집 충돌을 관리한다.

## 접근·보존

- 공개 코드는 설계 데이터 공개를 뜻하지 않는다. RLS로 로그인 사용자의 소유 프로젝트만 읽고 수정하게 한다.
- 폴더 parent_id와 프로젝트 folder_id가 같은 소유자에 속하는지 검증한다. 소유자 값은 세션에서 결정하며 클라이언트 입력만 신뢰하지 않는다.
- 노드 삭제는 관련 엣지/요청 참조를 함께 정리하고 실행 취소/버전을 제공한다.
- Supabase 공개 클라이언트 키를 쓸 때 RLS를 적용한다. 관리자/서비스 역할 키와 DB 연결 문자열은 클라이언트 코드·공개 Git에 넣지 않는다.
- 자동 저장은 디바운스하고 실패·오프라인·충돌 상태를 알린다. 로컬 초안은 IndexedDB로 보조하고 JSON 내보내기로 이식성을 확보한다.
- 프리뷰와 운영 DB를 분리한다. 인증 콜백·환경 변수·RLS·사용자 간 격리·다시 로그인 후 복구를 배포 전에 확인한다.
- 무료 한도와 과금은 출시 시 제공자의 현재 정책으로 다시 확인한다. DB/호스팅 비용이 영구히 0원이라고 보장하지 않는다.

## 공식 참고

- https://vercel.com/docs/marketplace-storage
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/database/postgres/row-level-security
