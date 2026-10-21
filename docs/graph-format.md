# 아키텍처 JSON 교환 형식

앱의 **AI 인터뷰 → AI가 만든 구조 적용**에서 검증하고 새 프로젝트로 추가합니다. 수동 내보내기·가져오기·버전 UI는 제공하지 않습니다. 프롬프트의 ‘현재 캔버스 포함’으로 현재 Graph를 AI에 전달할 수 있습니다. Graph는 5MB 이하이며 `src/lib/model.ts`의 Zod 스키마를 따릅니다.

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "api",
      "type": "component",
      "position": { "x": 100, "y": 100 },
      "width": 200,
      "height": 140,
      "data": {
        "catalogId": "api",
        "name": "주문 API",
        "note": "확인한 역할과 근거",
        "params": {
          "meanMs": null,
          "slots": null,
          "replicas": 1,
          "availability": null,
          "networkMs": null,
          "budgetMs": null,
          "demand": null,
          "basis": "unknown"
        }
      }
    }
  ],
  "edges": [],
  "flows": []
}
```

- ID는 영문·숫자·`-`·`_`, 1~120자이며 각 목록 안에서 고유합니다. 모든 참조는 실제 ID여야 합니다.
- 기술은 `catalogId`, 역할은 `name`입니다. 이름을 바꿔도 디자인은 유지됩니다. 주요 ID 목록은 프롬프트에, 전체 목록은 AI 구조 적용의 **기술 ID 전체 복사**에 있습니다. 예: `api`(Spring Boot), `tech-postgresql`, `s3`, `sqs`, `aws-compute-lambda`, `aws-networkingcontentdelivery-cloudfront`, `tech-fcm`, `tech-slack`.
- 모르는 ID는 미리보기에서 교체해야 적용할 수 있습니다. `custom`은 명시적 사용자 정의 기본 디자인입니다. 아래 정식 `data.style` 외 임의 CSS·아이콘 URL은 지원하지 않으며, 알 수 없는 필드를 제외한다는 확인 전에는 적용을 막습니다. 라이브러리 아이콘 로드 실패도 매핑 목록에 표시합니다.
- 카드 표시 최소 크기는 200×140px입니다. 작은 입력은 경고하되 원본 크기를 보존하며 표시 크기에만 최소값을 적용합니다. 역할은 최대 두 줄이고 전체 이름은 title·상세 정보로 확인합니다. note는 상세에서만 표시합니다.
- `type:"group"`, `catalogId:"group"`으로 그룹을 만들고 자식 `parentId`를 지정합니다. 자식 position은 부모 기준입니다. 중첩 그룹은 지원하지 않습니다. 제목 여백 48px, 경계 여백 28px을 권장합니다. ‘자식 범위에 그룹 맞추기’는 절대 좌표를 유지하며 실행 취소할 수 있습니다.
- JSON의 위치·크기·그룹은 그대로 보관합니다. ‘배치 미리보기’는 고정하지 않은 카드를 200×140으로 정리하고 주 흐름을 좌우로 배치합니다. `data.positionLocked:true`인 요소 및 고정 자식이 든 그룹의 위치·크기는 유지합니다. 적용 전 변경을 보여주며, 가져오기 화면의 이전 배치 되돌리기와 편집기 적용 후 실행 취소를 지원합니다.

## 카드 디자인과 위치 고정

`type:"component"`의 `data.style`은 선택 필드이며 아래 네 키만 허용합니다. 기존 JSON에 없으면 기본값으로 표시하고, AI용 현재 캔버스 복사에는 적용 중인 기본값도 포함합니다. 생성 시 라이브러리와 선택 후 속성에서 같은 설정을 사용합니다.

```json
"style": {
  "backgroundColor": "#EFF6FF",
  "fontSize": 17,
  "fontWeight": 600,
  "iconSize": 32
}
```

- `backgroundColor`: `#FFFFFF`(기본), `#F5F3FF`, `#EFF6FF`, `#F0FDF4`, `#FFF7ED`, `#F8FAFC`.
- `fontSize`: 16/17/18px(기본 17), `fontWeight`: 600/700(기본 600).
- `iconSize`: 28/32/36/40px(기본 32). 가로형 로고는 비율을 유지합니다.
- 역할 이름은 왼쪽 정렬·최대 두 줄, 기술 이름은 작은 보조 정보입니다. 경고는 선택 배경을 유지하면서 테두리·아이콘·문구로 표시합니다.
- `data.positionLocked:true`는 카드와 그룹의 드래그·자동 배치 위치 변경을 막습니다. 고정 자식이 있으면 부모 그룹도 유지합니다. 크기 조절과 상세 편집은 별도 동작입니다.
- 디자인·위치 고정은 기존 자동 저장·재열기·AI JSON 적용에서 유지됩니다. 그룹 배경 스타일이나 노드 최상위 `style`, 임의 CSS·아이콘 URL은 지원하지 않습니다.

## 연결

```json
{
  "id": "save-order",
  "source": "api",
  "target": "db",
  "data": {
    "kind": "sync",
    "label": "주문 저장",
    "note": "긴 설명과 근거",
    "flowIds": ["create-order"],
    "calls": 1,
    "callsBasis": "unknown",
    "traffic": "all",
    "purpose": "delivery",
    "condition": ""
  }
}
```

- `kind`: `sync`(실선), `async`(점선), `relation`(촘촘한 점선). 구성 관계는 요청 계산에서 제외합니다.
- `purpose`: `delivery`(전달 계산 포함), `dependency`(상태 확인·의존 표시, 계산 제외). 이 구분은 자동으로 추정하지 않습니다. DB 읽기·쓰기 표현이 되돌아온다고 실제 순환 호출인 것은 아닙니다. 호출 계산이 필요한 DB 접근까지 일괄 제외하지 마세요.
- `traffic`: `all` 또는 `cache-miss`. 추가 조건은 `condition` 200자 이하입니다. 조건 문자열은 설명이며 임의 확률을 추정하지 않습니다.
- `label` 최대 100자, 캔버스에서는 최대 12자로 축약합니다. `note` 최대 4,000자. 라벨 배치가 불가능하면 글자를 겹쳐 그리지 않고 선택 상세로 확인합니다. 숨기기/선택한 연결만/모두 보기, 70% 미만 확대율에서 설명 숨김을 지원합니다.
- `calls`는 0~10,000의 필수 숫자입니다. 미확인 기본값 1과 실측은 `callsBasis`로 구분합니다. 자기 연결은 허용하지 않으며 1:N/N:M은 지원합니다.
- 핸들은 생략하면 네 방향 중 자동 선택합니다. 명시할 경우 source는 `top-out`/`right-out`/`bottom-out`/`left-out`, target은 대응하는 `-in`입니다.

## 요청과 수치 근거

```json
{
  "id": "create-order",
  "name": "주문 생성",
  "method": "POST",
  "route": "/orders",
  "entryId": "api",
  "responseId": "db",
  "completionId": null,
  "rps": null,
  "trafficBasis": "unknown",
  "hitPercent": 0,
  "cacheBasis": "unknown",
  "latencyTarget": null,
  "availabilityTarget": null,
  "requiredIds": ["api", "db"]
}
```

예시 연결·요청을 사용하려면 `db` 노드를 nodes에 추가해야 합니다. 메서드는 GET/POST/PUT/PATCH/DELETE/EVENT입니다.

- 처리·용량·가용성·네트워크·부하·목표 수치만 모르면 null입니다. **replicas=1, calls=1, hitPercent=0은 null 대신 형식 기본값**을 사용합니다.
- `params.basis`, `callsBasis`, `trafficBasis`, `cacheBasis`: `unknown`/`assumption`/`measured`. 근거가 미확인이면 관련 성능 결론을 보류합니다. 선택 필드가 없는 이전 형식의 호출·RPS·캐시는 기존 설계 가정으로 읽습니다. 새 흐름의 근거는 unknown입니다.
- 가용성 %, 시간 ms, 부하 RPS입니다. 슬롯·대수는 정수입니다. 서버가 시작점이면 그 서버의 처리·연결 지연부터 포함합니다. 클라이언트 시작점은 비용 0입니다.
- `responseId`와 `completionId`는 각각 HTTP 응답과 비동기 최종 완료의 **표시 지점**입니다. 계산 범위는 여전히 `entryId`·`requiredIds`·동기 도달 경로로 명시합니다. FCM 수락은 사용자 기기의 표시 완료를 보장하지 않습니다.
- 필수 요소는 독립 고장 가정으로 곱합니다. 같은 PostgreSQL/JVM의 논리 영역이나 공통 장애를 독립 인스턴스로 추정하지 않습니다. 공유 DB는 그룹과 메모로 구분하세요.
- ‘선택 흐름만 보기’는 포함된 연결의 양 끝과 시작·완료 지점 및 부모 그룹만 남깁니다. 원본 좌표는 유지하고 자동 맞춤은 카드 범위만 사용합니다. 최소 85%로 읽기 크기를 유지하며 큰 경로는 시작점에서 탐색합니다. ‘전체 윤곽’은 축소 개요입니다. ‘연결 따라가기’는 연결 탐색이며 분기의 실행 순서를 보장하지 않습니다.
- ‘전체 안에서 강조’는 나머지 노드와 연결도 흐리게 남깁니다. 전체 구조로 돌아가면 원본 전체가 표시됩니다.

## 구조 비교

AI 구조 적용의 ‘현재 프로젝트와 비교’에서 추가/삭제/이동/그룹 변경/크기/이름·기술/연결 종류 차이를 확인합니다. 초록은 추가, 주황은 변경, 빨강은 삭제입니다. ‘같은 ID의 이름·크기·절대 위치를 맞춰 비교’는 보기만 맞추며 입력 JSON을 덮어쓰지 않습니다. 원래 배치 비교로 전환할 수 있습니다.
