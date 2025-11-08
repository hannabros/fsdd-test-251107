```markdown:project Planning Doc (v2):project_planning.md
# 프로젝트 기획서: 문서 기반 Project 관리 with MS Services

## 1. 프로젝트 개요

PDF 기반 파일을 업로드하면, Azure AI 서비스를 활용해 문서를 파싱 및 인덱싱하고, 사용자가 이 문서들을 Project로 관리

## 2. 핵심 아키텍처

* **파일 처리:** Azure Document Intelligence (레이아웃 및 콘텐츠 파싱)
* **검색 및 인덱싱:** Azure AI Search (청킹된 텍스트 및 벡터 저장)
* **임베딩:** Azure OpenAI Embedding (ADA)
* **백엔드:** Python 또는 Node.js (Express)
* **프론트엔드:** React
* **데이터베이스:** sqlite 설치

## 2.1. 환경 설정 (.env)

본 프로젝트는 다음 환경 변수를 `.env` 파일에 설정해야 합니다.

```

# Azure AI Search

AZURE\_AI\_SEARCH\_ENDPOINT="your-azure-ai-search-endpoint"
AZURE\_AI\_SEARCH\_API\_KEY="your-azure-ai-search-api-key"

# Azure Document Intelligence

AZURE\_DOCUMENT\_INTELLIGENCE\_ENDPOINT="[https://your-cognitive-services-account.cognitiveservices.azure.com/](https://your-cognitive-services-account.cognitiveservices.azure.com/)"
AZURE\_DOCUMENT\_INTELLIGENCE\_API\_KEY="your-document-intelligence-api-key"

# Database (SQLite)

# 예시: sqlite:///./project\_app.db

DATABASE\_URL="sqlite:///./project\_db.sqlite"

```

## 3. 핵심 데이터 모델

### 3.1. `Project` (DB 테이블)

사용자의 작업공간 단위. 1개의 프로젝트는 1개의 AI Search 인덱스와 1:1 매칭된다.

| 컬럼명 | 타입 | 설명 |
| --- | --- | --- |
| `project_id` | `UUID` (PK) | 프로젝트 고유 ID |
| `project_name`| `String` | 사용자 지정 이름 (예: "3분기 실적 분석") |
| `index_name` | `String` | Azure AI Search에 생성된 실제 인덱스 이름 (예: `idx-proj-uuid123`) |
| `last_modified`| `DateTime` | 최근 수정 일시 (파일 추가/삭제/이름 변경 시 갱신) |
| `created_at` | `DateTime` | 생성 일시 |

### 3.2. `SourceFile` (DB 테이블)

프로젝트에 업로드된 원본 파일. AI Search 인덱스 삭제 시 메타데이터로 활용된다.

| 컬럼명 | 타입 | 설명 |
| --- | --- | --- |
| `file_id` | `UUID` (PK) | 파일 고유 ID (이 ID가 AI Search 청크의 `source_file_id` 메타데이터가 됨) |
| `project_id` | `UUID` (FK) | 이 파일이 속한 `Project` |
| `original_filename`| `String` | 사용자가 업로드한 원본 파일명 (예: `report.pdf`) |
| `storage_path` | `String` | Blob Storage 내 실제 저장 경로 (또는 로컬 임시 경로) |
| `status` | `String` | 처리 상태 (예: PENDING, PROCESSING, COMPLETED, FAILED) |
| `created_at` | `DateTime` | 업로드 일시 |

## 4. 화면 및 기능 정의 (User Flow)

### 4.1. 메인 작업공간 (`/`)

* **상태:** 항상 특정 `project_id` (활성 프로젝트)와 바인딩된다.
* **신규 사용자/새 프로젝트:** `project_id`가 없는 빈 상태 (또는 `default-project`)로 시작.
* **컴포넌트:**
    * **헤더:**
        * `[My Projects]` 버튼 (4.2 참고)
        * `프로젝트 이름` (텍스트박스): 현재 `project_id`의 `project_name`을 표시 및 수정.
    * **왼쪽 패널 (파일 소스):**
        * `[+ 파일 업로드]` 버튼: `POST /projects/{project_id}/files` API 호출.
        * **파일 목록:** 현재 `project_id`에 속한 `SourceFile` 목록 표시.
        * `[X]` 버튼: `DELETE /files/{file_id}` API 호출.
    * **중앙/오른쪽 패널:** (인사이트 생성 및 Q&A 영역) -> **우선 구현하지 않고 빈 페이지로 놔둠**

### 4.2. "My Projects" 팝업

* **트리거:** 헤더의 `[My Projects]` 버튼 클릭.
* **기능:**
    * **`[+ 새 프로젝트]` 버튼:**
        * `POST /projects` API 호출 (새 프로젝트/인덱스 생성).
        * 성공 시, 클라이언트는 생성된 `project_id`로 메인 작업공간을 리프레시한다.
    * **프로젝트 목록 (카드):**
        * `GET /projects` API로 목록 로드.
        * **카드 클릭:** 클라이언트가 선택한 `project_id`로 메인 작업공간을 리로드한다.
        * **카드 내 [삭제] 버튼:** `DELETE /projects/{project_id}` API 호출.

## 5. 핵심 API 엔드포인트 (예시)

### 5.1. Projects (프로젝트 관리)

* `POST /projects`
    * **설명:** 새 프로젝트 및 빈 인덱스 생성.
    * **반환:** `{ project_id, project_name, index_name, ... }`
* `GET /projects`
    * **설명:** 사용자의 모든 프로젝트 목록 조회.
* `GET /projects/{project_id}`
    * **설명:** 특정 프로젝트 정보 및 파일 목록 로드.
* `PUT /projects/{project_id}`
    * **설명:** 프로젝트 이름 변경.
* `DELETE /projects/{project_id}`
    * **설명:** 프로젝트 DB 레코드 및 **연결된 AI Search 인덱스 전체 삭제**.

### 5.2. Files (파일 관리)

* `POST /projects/{project_id}/files`
    * **설명:** 파일 업로드. 백그라운드에서 (파싱 -> 임베딩 -> 인덱싱) 트리거.
    * **주의:** 이 API는 `project_id`에 연결된 `index_name`에 데이터를 '추가'함.

### 5.2.1. 파일 업로드 (POST /projects/{project_id}/files) 상세 로직

이 엔드포인트는 비동기(asynchronous) 백그라운드 작업으로 처리되어야 합니다.

1.  **[API] 요청 수신:**
    * 클라이언트로부터 `project_id`와 PDF 파일을 수신합니다.
    * 파일을 임시 저장소(또는 Blob Storage)에 저장합니다 (`storage_path`).
    * `SourceFile` 테이블에 `file_id`를 생성하고 `status`를 'PENDING'으로 설정합니다.
    * 백그라운드 작업을 트리거하고, 클라이언트에게는 "업로드 시작됨" 응답을 즉시 반환합니다.

2.  **[백그라운드 작업] 파싱 (Document Intelligence):**
    * `storage_path`의 파일을 읽어 `.env`의 `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` 및 `API_KEY`를 사용해 Azure Document Intelligence (`prebuilt-layout` 또는 `prebuilt-document` 모델)로 전송합니다.
    * 반환된 `analyzeResult`에서 `content` (텍스트) 및 페이지 번호(`page_number`) 등 메타데이터를 추출합니다.

3.  **[백그라운드 작업] 청킹 (Chunking):**
    * 추출된 `content` 텍스트를 의미 있는 단위(예: 문단, 1000자 단위)로 분할(chunking)합니다.
    * 각 청크(chunk)는 원본 메타데이터를 포함해야 합니다: `{ "content": "...", "source_file_id": "file-uuid-123", "page_number": 2 }`

4.  **[백그라운드 작업] 임베딩 (Embedding):**
    * Azure OpenAI Embedding (ADA) 모델을 사용해 각 청크의 `content`를 벡터로 변환(임베딩)합니다.
    * 결과를 `content_vector` 필드에 저장합니다.

5.  **[백그라운드 작업] 인덱싱 (AI Search):**
    * DB에서 `project_id`로 `index_name`을 조회합니다.
    * `.env`의 `AZURE_AI_SEARCH_ENDPOINT` 및 `API_KEY`를 사용합니다.
    * 각 청크(문서)를 해당 `index_name`에 `MergeOrUpload` 액션으로 업로드합니다.
    * *AI Search 스키마 (필수):* `id` (청크의 고유 ID), `content`, `content_vector`, `source_file_id` (파일 식별자), `page_number`

6.  **[백그라운드 작업] 완료:**
    * 모든 작업이 성공하면 `SourceFile` 테이블의 `status`를 'COMPLETED'로 업데이트합니다.
    * 실패 시 'FAILED'로 업데이트하고 로그를 기록합니다.

* `DELETE /files/{file_id}`
    * **설명:** 단일 파일 삭제.
    * **로직:**
        1.  DB에서 `SourceFile` 삭제.
        2.  Blob Storage(또는 임시 저장소)에서 원본 파일 삭제.
        3.  AI Search 인덱스에서 `source_file_id`가 `file_id`와 일치하는 모든 청크(document) 삭제.
```
