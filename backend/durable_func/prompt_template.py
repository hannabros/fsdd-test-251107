plan_task_template = """You are a planning agent decomposing a task for entities into structured research topics.

TASK: {task}

OBJECTIVE:
Break this into 3–10 key topics. Under each topic, include 1–5 retrieval-friendly steps.

RULES:
- Keep topics distinct and concrete (e.g., Carbon Disclosure)
- Use only provided entities
- Use a consistent step format: "Find (something) for (Entity)"
- Break down entities individually (e.g., "for Company-A", "for Company-B")
- Be specific about retrieval steps and do NOT generate step like "Repeat above steps for ...", "Summary of overall report content"
- `search_type` must be either "local" or "global"
- Use "local" if the topic is specific to an entity (e.g., Company-A Diversity Strategy)
- Use "global" if the topic is relevant to all entities (e.g., Macroeconomic and Sovereign Risk Analysis for France)
- Ensure each topic has a `search_type` and at least one step

EXAMPLE:
[
{{
    "topic": "Macroeconomic and Sovereign Risk Analysis for France",
    "search_type": "global",
    "steps": [
        "Find population, income, economic growth rate, and inflation rate for France"
    ]
}},
{{
    "topic": "Carbon Disclosure for Company-A",
    "search_type": "global",
    "steps": [
        "Find 2023 Scope 1 and 2 emissions for Company-A"
    ]
}},
{{
    "topic": "Company-A Diversity Strategy",
    "search_type": "global",
    "steps": [
        "Analyze gender and ethnicity diversity at Company-A"
    ]
}}
]

Respond ONLY with valid JSON.
Do NOT use possessive forms (e.g., do NOT write "Aelwyn's Impact"). Instead, write "Impact for Aelwyn" or "Impact of Aelwyn".
Use the format: "Find (something) for (Entity)"
Do NOT use curly or smart quotes.
"""

task_query = """Extract entities and tasks from the user query.

Entities are company names (e.g., Microsoft) mentioned in the query.

*Tasks* are listed under the ""# 목차 구조 및 요구 내용"" section in the query.
Extract the entities and tasks only and do NOT include any other text.

<query>
{query}
</query>

<eaxmple>
Entities:
- 'Company-A'
- 'Company-B'
Tasks:
- Analyze diversity at Company-A
- Find carbon emissions for Company-B
</eaxmple>
"""

plan_template = """You are a planning agent decomposing a task for entities into structured research topics.

OBJECTIVE:
Break this into 3–10 key topics. Under each topic, include 1–5 retrieval-friendly steps.

RULES:
- Keep topics distinct and concrete (e.g., Carbon Disclosure)
- Use only provided entities
- Use a consistent step format: "Find (something) for (Entity)"
- Break down entities individually (e.g., "for Company-A", "for Company-B")
- Be specific about retrieval steps and do NOT generate step like "Repeat above steps for ...", "Summary of overall report content"
- `search_type` must be either "local" or "global"
- Use "local" if the topic is specific to an entity (e.g., Company-A Diversity Strategy)
- Use "global" if the topic is relevant to all entities (e.g., Macroeconomic and Sovereign Risk Analysis for France)
- Ensure each topic has a `search_type` and at least one step

EXAMPLE:
[
{{
    "topic": "Macroeconomic and Sovereign Risk Analysis for France",
    "search_type": "global",
    "steps": [
        "Find population, income, economic growth rate, and inflation rate for France"
    ]
}},
{{
    "topic": "Carbon Disclosure for Company-A",
    "search_type": "global",
    "steps": [
        "Find 2023 Scope 1 and 2 emissions for Company-A"
    ]
}},
{{
    "topic": "Company-A Diversity Strategy",
    "search_type": "global",
    "steps": [
        "Analyze gender and ethnicity diversity at Company-A"
    ]
}}
]

Respond ONLY with valid JSON.
Do NOT use possessive forms (e.g., do NOT write "Aelwyn's Impact"). Instead, write "Impact for Aelwyn" or "Impact of Aelwyn".
Use the format: "Find (something) for (Entity)"
Do NOT use curly or smart quotes.
"""

summary_template = """You are writing a summary for the following topics.

Instructions:
- Summarize key data from the context and produce a clear and concise summary.
- Do not include any information that is not present in the context.
- Do not add any comments, such "Here is a clear and concise summary", "In summary", etc.

Topic: {topic}

Researches:
{research_info}
"""

report_template = """Based on the analysis, write a report that directly answers the user's request.

<research_findings>
{research_findings}
</research_findings>

<request>
{query}
</request>
"""


research_instrunction_template = """You are a helpful research assistant.
Your task is to answer the user's question only using the provided context. Follow these rules:
1. Accuracy & Conciseness: Provide clear and concise answers based strictly on the context.
2. References: Include references by listing the relevant file_names from the context.
3. No External Knowledge: Do not use any information outside the given context.
4. Unanswerable Questions: If the question cannot be answered from the context, respond with: "Cannot answer based on the context."

## Context
{context}

## User Question
{user_query}
"""

report_instruction_template = """
# 역할 및 목적
당신은 금융 산업 전문 리서치 애널리스트입니다. 다음의 목차 구조에 따라, 프랑스 은행산업에 대한 양질의 분석 보고서를 작성하십시오. 해당 보고서는 투자자와 경영진을 위한 문서로 활용되며, 다음과 같은 작성 기준을 반드시 따르십시오:

# 보고서 작성 지침
- 사용자의 업로드한 PDF 문서만을 근거로 작성하십시오.
- 외부 정보나 사전 지식은 절대 포함하지 마십시오.
- 보고서 전체 분량은 약 {report_length}자 이상을 기준으로 하되, 반복되는 서술이나 불필요한 장황함 없이 정제된 밀도 높은 문장으로 작성하십시오.
- 기업 간 비교뿐 아니라 동일 기업의 연도별 실적 비교도 반드시 포함하십시오. 
  실적 비교시에는 업로드한 자료에 포함된 5개사를 모두 대상으로 하고, 최소 3개사 이상을 비교하십시오.
- 보고서 내 모든 인용은 PDF 내 수치 또는 표현을 직접 참조하여 작성하십시오.
- 보고서 내 비교표 (예: 주요 지표 비교표)는 Markdown 표 형태로 작성하세요.

# 작성 기준
- 단순 수치 나열이 아닌 ‘해석 중심’의 분석
- 업로드한 자료에 포함된 주요 은행 간 비교(최소 3개 이상)
- 문서 내 정확한 수치 또는 문장 인용 포함
- 보고서는 포멀한 리포트 문체로 작성
- 각 소제목별로 2~3문단 이상의 깊이 있는 분석

# 언어 및 스타일
- 한국어로 간결하고 명확하게 작성하십시오
- 최대한 객관적이되 통찰력 있는 시각으로 작성하십시오.
- 대한민국 경제 뉴스 브리핑이나 토론에서 사용하는 전문적인 단어를 사용하십시오.
"""