# 아키텍처 JSON 교환 형식

전체 예시는 앱의 ‘내보내기’로 얻을 수 있습니다. 가져오기는 `src/lib/model.ts`의 Zod 스키마로 검증합니다. Graph JSON은 5MB, 작업공간 백업은 20MB 이하입니다. 가져오기는 기존 구조를 보존하고 새 프로젝트 또는 사본으로 추가합니다.

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "api",
      "type": "component",
      "position": { "x": 100, "y": 100 },
      "width": 172,
      "height": 116,
      "data": {
        "catalogId": "api",
        "name": "주문 API",
        "note": "코드에서 확인한 역할을 적습니다.",
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

- ID: 영문·숫자·`-`·`_`, 길이 1~120. 노드·연결·요청 각각에서 중복을 허용하지 않습니다.
- `catalogId`: 라이브러리 키. 모르면 `custom`을 사용하고 `note`에 기술을 기록합니다. 미지의 키는 기본 아이콘으로 표시합니다. 임의 이미지 URL이나 HTML은 실행하지 않습니다.
- `type`: `component` 또는 `group`. 그룹의 `data.catalogId`는 `group`. 구성원의 `parentId`가 그룹 ID이며 position은 그룹 기준 상대 좌표입니다. 그룹 안의 중첩 그룹은 지원하지 않습니다.
- `basis`: `unknown`·`assumption`·`measured`. 모르는 값은 `null`. 가용성 0~100%, 시간 ms, 부하 RPS, 동시 처리 수와 대수는 정수입니다.

## 연결

```json
{
  "id": "edge-1",
  "source": "api",
  "target": "db",
  "sourceHandle": "bottom-out",
  "targetHandle": "top-in",
  "data": {
    "kind": "sync",
    "label": "주문 저장",
    "flowIds": ["create-order"],
    "calls": 1,
    "traffic": "all"
  }
}
```

`kind`: `sync`·`async`·`relation`. `traffic`: `all`·`cache-miss`. 같은 노드에서 여러 노드로 연결할 수 있습니다. source와 target은 실제 노드여야 하고 자기 연결은 허용하지 않습니다. 핸들은 생략 가능하며 source는 bottom-out/right-out, target은 top-in/left-in입니다.

## 요청

```json
{
  "id": "create-order",
  "name": "주문 생성",
  "method": "POST",
  "route": "/orders",
  "entryId": "client",
  "rps": null,
  "hitPercent": 0,
  "latencyTarget": null,
  "availabilityTarget": null,
  "requiredIds": ["api", "db"]
}
```

예시의 `client`·`db` 노드를 실제 nodes에 추가해야 검증을 통과합니다. 메서드는 GET/POST/PUT/PATCH/DELETE/EVENT입니다. entryId가 없으면 null, 경로 계산은 보류합니다. requiredIds는 완료에 필수인 요소의 ID입니다. 비동기 뒤에만 도달하는 요소는 즉시 응답 가용성·지연에서 제외합니다.

전체 작업공간 백업은 Graph를 포함한 projects, folders, currentProjectId, preferences를 포함합니다. 계정·키·이메일 같은 인증 데이터는 백업에 넣지 않습니다.
