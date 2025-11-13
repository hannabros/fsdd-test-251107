import logging
import os
from urllib import response
from azure.storage.blob import BlobServiceClient
import azure.functions as func
import azure.durable_functions as df
from azure.identity import DefaultAzureCredential
import json
import time
from datetime import timedelta

from agent_framework import (
    AgentRunUpdateEvent, 
    AgentRunEvent,
    AgentExecutorResponse, 
    executor,
    AgentExecutor,
    WorkflowBuilder,
    WorkflowContext,
    WorkflowOutputEvent, 
    WorkflowViz,
    ChatAgent,
)
from agent_framework.azure import AzureOpenAIChatClient

import asyncio
from utils import ResearchTopics, AISearchTool
from prompt_template import plan_template, task_query, summary_template, report_template, report_instruction_template

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

chat_client = AzureOpenAIChatClient(
    api_key=os.environ.get("AZURE_OPENAI_API_KEY", ""),
    end_point=os.environ.get("AZURE_OPENAI_ENDPOINT", ""),
    deployment_name=os.environ.get("MODEL_DEPLOYMENT_NAME", "gpt-4.1-mini")
)

my_app = df.DFApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# add http trigger function
"""
# Example curl command to start the orchestration
jq -n --arg query "$(cat ./prompt_report.md)" '{query: $query, orchestrator: "report_seq_orchestrator"}' \
    | curl -X POST http://localhost:7071/api/httptrigger -H "Content-Type: application/json" -d @- | jq

curl "http://localhost:7071/runtime/webhooks/durabletask/instances/3ba14e06646e4efa86fff69f96d5e56a?taskHub=default"
"""
@my_app.route(route="httptrigger", methods=["get", "post"], auth_level=func.AuthLevel.ANONYMOUS)
@my_app.durable_client_input(client_name="client")
async def HttpStart(req: func.HttpRequest, client) -> func.HttpResponse:

    # get request body
    request_body = req.get_json()

    query = request_body.get("query", "")
    report_length = request_body.get("report_length", "medium")
    orchestrator = request_body.get("orchestrator", "report_seq_orchestrator")

    instance_id = await client.start_new(orchestrator, client_input={"query": query, "report_length": report_length})

    #return json.dumps({ "instance_id": instance_id })
    response = client.create_check_status_response(req, instance_id)
    return response


@my_app.orchestration_trigger(context_name="context")
def report_seq_orchestrator(context):
    _input: dict = context.get_input()

    input: str = _input.get("query", "")
    report_length: str = _input.get("report_length", "medium")

    context.set_custom_status({"message": "'task extraction' in progress", "progress": 0.0})
    # 1. Task extraction
    task_result = yield context.call_activity("task_executor", input)

    # 1.1 Human approval
    context.set_custom_status({"message": "'Human Approval' is needed", "human_feedback": task_result, "progress": 0.1})
    human_feedback = yield context.wait_for_external_event("HumanApproval")

    feedback_action = human_feedback.get("action", "continue")
    if not feedback_action == "continue":
        context.set_custom_status({"message": "Orchestration terminated by user", "progress": 0.0})
        return {"status": "terminated by user"}
    print("Human feedback received:", human_feedback['action'])

    # 2. Planning
    context.set_custom_status({"message": "'planning' in progress", "progress": 0.25})
    plan_result = yield context.call_activity("plan_executor", task_result)
    search_tasks = plan_result.get("topics", [])

    topic_count = len(search_tasks)

    # 3. Research sequentially
    results = []
    step_results_all = []
    for i, topic in enumerate(search_tasks):

        #print(f"Topic: {topic['topic']}, Search Type: {topic['search_type']}, Steps: {topic['steps']}")

        topic_results = {"topic": topic['topic'], "search_type": topic['search_type'], "summary": ""}
        tasks = []
        for step in topic['steps']:
            #print(f"- {step}")
            search_input = {"query": step, "search_type": topic['search_type']}
            tasks.append(context.call_activity("search_executor", search_input))

        context.set_custom_status({"message": f"'research & summary ({topic['topic']})' in progress", "progress": 0.5 + i / topic_count * 0.25})
        # 3-1 search steps for the topic
        step_results = yield context.task_all(tasks)
        step_results_all.append(step_results)

        # 3-2 summarize the search results for the topic
        summary_result = yield context.call_activity("summary_executor", {"topic": topic, "step_results": step_results})

        topic_results["summary"] = summary_result
        
        results.append(topic_results)

    context.set_custom_status({"message": "'report generation' in progress", "progress": 0.75})
    report_input = {
        "query": input,
        "research_results": results,
        "report_length": report_length
    }   
    report_result = yield context.call_activity("report_executor", report_input)

    context.set_custom_status({"message": "'report generation' completed", "progress": 1.0})
    #return {"report": report_result, "report_input": report_input}
    return {"final_report": report_result, "report_input": report_input, "search_results": step_results_all, "search_tasks": search_tasks}

# Sub Orchestrator example
# https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-sub-orchestrations?tabs=python
@my_app.orchestration_trigger(context_name="context")
def report_parallel_orchestrator(context):
    input: str = context.get_input()

    # 1. Task extraction
    task_result = yield context.call_activity("task_executor", input)

    # 2. Planning
    plan_result = yield context.call_activity("plan_executor", task_result)
    search_tasks = plan_result.get("topics", [])

    # 3. Research sub-orchestration
    tasks = []
    for i, topic in enumerate(search_tasks):

        tasks.append(context.call_sub_orchestrator("research_orchestrator", topic))

        # run only 3 topics in parallel to mitigate bursting
        if (i+1) % 3 == 0 and i > 0:
            results = yield context.task_all(tasks)
            tasks = []

    if tasks:
        results += yield context.task_all(tasks)

    report_input = {
        "query": input,
        "research_results": results
    }   
    report_result = yield context.call_activity("report_executor", report_input)
    return report_result

@my_app.orchestration_trigger(context_name="context")
def research_orchestrator(context):
    topic: dict = context.get_input()

    topic_results = {"topic": topic['topic'], "search_type": topic['search_type'], "summary": ""}

    # 3-1 search steps for the topic
    tasks = []
    for step in topic['steps']:
        search_input = {"query": step, "search_type": topic['search_type']}
        tasks.append(context.call_activity("search_executor", search_input))
    
    step_results = yield context.task_all(tasks)

    # 3-2 summarize the search results for the topic
    summary_result = yield context.call_activity("summary_executor", {"topic": topic, "step_results": step_results})
    topic_results["summary"] = summary_result

    return topic_results


@my_app.activity_trigger(input_name='task_input')
def task_executor(task_input):

    task_agent = ChatAgent(
        name="TaskExtractor",
        instructions=(
            "You are a helpful assistant that extracts tasks from the user query.",
            "User query contains some instruction and tasks.",
        ),
        chat_client=chat_client,
    )

    modified_query = task_query.format(query=task_input)
    response = asyncio.run(task_agent.run(modified_query))

    return response.text

@my_app.activity_trigger(input_name='plan_input')
def plan_executor(plan_input):

    planner = ChatAgent(
        name="Planner",
        instructions=plan_template,
        response_format=ResearchTopics,
        chat_client=chat_client,
    )

    result = asyncio.run(planner.run(plan_input))

    plan_json = json.loads(result.text)

    return plan_json

@my_app.activity_trigger(input_name='search_input')
def search_executor(search_input):

    query = search_input.get("query", "")

    input_data = {
        "query": query,
        "search_type": "semantic"
    }

    aisearch_tool = AISearchTool()
    result = aisearch_tool.research_query(input_data)

    return {"query": query, "result": result}

@my_app.activity_trigger(input_name='summary_input')
def summary_executor(summary_input):

    topic = summary_input['topic']
    research_info = json.dumps(summary_input['step_results'], ensure_ascii=False, indent=2)
    
    summarizer = ChatAgent(name="Summarizer",
        instructions=(
            "You are a helpful assistant that summarizes research findings into clear and concise summaries."
            "Add references by listing the relevant file_names of summary result from the context."
        ),
        chat_client=chat_client,
    )

    response = asyncio.run(summarizer.run(summary_template.format(topic=topic, research_info=research_info)))
    return response.text

@my_app.activity_trigger(input_name='report_input')
def report_executor(report_input):

    query = report_input['query']
    research_results = report_input['research_results']
    _report_length = report_input.get('report_length', "medium")
    # long: 12000, medium: 6000, short: 1500
    if _report_length == "long":
        report_length = 12000
    elif _report_length == "medium":
        report_length = 6000
    else:
        report_length = 1500

    report_writer = ChatAgent(name="ReportWriter",
        instructions=report_instruction_template.format(report_length=report_length),
        chat_client=chat_client,
    )

    research_findings = "\n".join([f"# {summary['topic']}\n{summary['summary']}\n\n" for summary in research_results])

    report_query = report_template.format(research_findings=research_findings, query=query)
    result = asyncio.run(report_writer.run(report_query))

    return result.text