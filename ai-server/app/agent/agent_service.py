import json
from typing import Any
from pydantic import BaseModel, create_model
from langchain.schema.runnable import RunnableConfig
from langgraph.prebuilt import create_react_agent
from langchain.chat_models import init_chat_model
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.redis import AsyncRedisSaver
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.shared.config.config import env
from app.shared.constant.path_constant import PATHS
from app.agent.agent_type import AgentArgs
from app.shared.logger.logger import console_log
from app.shared.types.return_type import DefaultReturnType, ErrorResponseType


async def run_agent(args: AgentArgs) -> DefaultReturnType[dict[str, Any] | Any]:
    try:
        with open(PATHS.TOOLS_CONFIG_PATH) as tools_config_path:
            base_tool_configs = json.load(tools_config_path)

        tools = []

        if args.tool_configs:
            tools_config = {}

            for tool_name, user_env in args.tool_configs.items():
                if tool_name not in base_tool_configs:
                    continue  # or raise an error if strict validation is needed

                tool = base_tool_configs[tool_name].copy()
                tool["env"] = {}

                for key, value in user_env.items():
                    tool["env"][key] = value

                tools_config[tool_name] = tool
                console_log(f"Merged tool configs: {tools_config}")

                # Start MCPClient with merged tool configs
                mcp_client = MultiServerMCPClient(tools_config)
                console_log("MCP Client created successfully!")

                # Get tools from MCPClient
                try:
                    tools = await mcp_client.get_tools()
                except Exception as error:
                    return DefaultReturnType(
                        error=ErrorResponseType(
                            userMessage="Failed to get MCP tools!",
                            error=str(error),
                            errorType="InternalServerErrorException",
                            errorData={},
                            trace=["agent_service - run_agent - except Exception"],
                        )
                    )

        # Init model
        model = None
        if "gemini" in args.model:
            model = ChatGoogleGenerativeAI(model=args.model, api_key=args.api_key)
        else:
            model = init_chat_model(model=args.model, api_key=args.api_key)

        structured_format = None
        if args.schema:
            structured_format = generate_model(args.workflow_id, args.schema)

        # Setup Redis checkpoint
        # if args.memory_id:
        #     async with AsyncRedisSaver.from_conn_string(env.REDIS_URI) as checkpointer:
        #         config: RunnableConfig = {"configurable": {"thread_id": args.memory_id}}
        #         agent = create_react_agent(
        #             model=model, tools=tools, checkpointer=checkpointer, response_format=structured_format
        #         )

        #         response = await agent.ainvoke({"messages": args.messages}, config)
        #         return DefaultReturnType(data=response)
        # else:
        #     agent = create_react_agent(model=model, tools=tools, response_format=structured_format)

        #     response = await agent.ainvoke({"messages": args.messages})
        #     return DefaultReturnType(data=response)

        agent = create_react_agent(model=model, tools=tools, response_format=structured_format)

        response = await agent.ainvoke({"messages": args.messages})
        return DefaultReturnType(data=response)
    except Exception as error:
        return DefaultReturnType(
            error=ErrorResponseType(
                userMessage="Failed to run agent!",
                error=str(error),
                errorType="InternalServerErrorException",
                errorData={},
                trace=["agent_service - run_agent - except Exception"],
            )
        )


def generate_model(class_name: str, field_dict: dict) -> type[BaseModel]:
    # Convert string type names to actual Python types
    type_map = {
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "list[str]": list[str],
        "list[int]": list[int],
        "list[float]": list[float],
        "list[bool]": list[bool],
        "dict": dict,
        "Any": Any,
    }

    fields = {}

    for name, type_str in field_dict.items():
        field_type = type_map.get(type_str, str)  # default to str
        fields[name] = (field_type, ...)  # `...` means required field

    created_model = create_model(class_name, **fields)
    return created_model
