import axios from 'axios';

import { AgentConfigType, AgentDataType, agentValidate } from './validate';
import { GeneralNodePropsType, GeneralNodeReturnType } from 'src/workflow-system/workflow-system.type';
import { isObject } from 'src/shared/utils/object.util';
import { DefaultReturnType } from 'src/shared/types/return.type';
import { returnErrorString } from 'src/shared/utils/return.util';
import { isError } from 'src/shared/utils/error.util';

export const agentExecute = async ({
	format,
	data,
	config,
}: GeneralNodePropsType<AgentDataType, AgentConfigType>): Promise<DefaultReturnType<GeneralNodeReturnType>> => {
	try {
		const validate = await agentValidate({
			format,
			data,
			config,
		});
		if (isError(validate)) {
			return {
				...validate,
				trace: [...validate.trace, 'agentExecute - agentValidate'],
			};
		}

		const { defaultData, workflowId, memoryId, userId, userFullName, tools, nextNodeAiPrompt, nextNodeSchema } =
			validate.data;
		const { apiKey, model, systemPrompt, llmHasMemory } = validate.config;
		const schema = nextNodeSchema ? nextNodeSchema[0]?.props || {} : {};

		const formattedDefaultData = typeof defaultData === 'string' ? defaultData : JSON.stringify(defaultData);

		const messages = [
			{
				role: 'system',
				content: `You are an AI agent in a workflow automation system. Converse naturally with the user and return structured data when a schema is provided.

				VERY IMPORTANT:
				- Use the UserID: ${userId} when referring to the user_id.
				- Use ${userFullName} when referring to the user.
				- Avoid phrases like “Here is…” or “Do you need more info?” — respond naturally.
				- Don’t use bullets or numbering unless asked — use plain comma-separated lists.`,
			},
		];

		if (nextNodeAiPrompt) messages.push({ role: 'system', content: nextNodeAiPrompt });
		if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
		messages.push({ role: 'system', content: `USER DATA:\n${formattedDefaultData}` });

		messages.push({
			role: 'system',
			content: `
			CRITICAL INSTRUCTION — COPY THIS EXACTLY:

			Call whatsapp_send with:

			template_name = the value after "TEMPLATE NAME as" in the prompt above
			name = the value of "name" or "username" from USER DATA
			number = the value of "number" from USER DATA

			DO NOT GUESS. DO NOT INFER FROM JSON.
			`.trim(),
		});

		const requestData: Record<string, any> = {
			workflow_id: workflowId,
			api_key: apiKey,
			model,
			user_id: userId,
			messages,
			tool_configs: tools,
			schema,
			memory_id: llmHasMemory === 'true' ? memoryId : '',
		};

		const timeout = 1200000;
		try {
			const response = await axios.post(`${process.env.PYTHON_BACKEND_URL}/execute`, requestData, {
				timeout,
			});
			console.log('Backend response received', { response: response.data });

			console.log('Backend response messages array', { messages: response?.data?.output?.messages });

			const message = response?.data?.output?.messages?.pop()?.content;
			const structuredData = response?.data?.output?.structured_response;

			if (structuredData) {
				let isError = false;

				if (!isObject(structuredData)) {
					isError = true;
					console.log('Structured data is not an object', { structuredData });
				}

				isError = Object.keys(structuredData).some((key) => {
					const isOptional = key.endsWith('_ifAny');
					const missing = !isOptional && !structuredData[key];
					console.log('Checking structured data key', { key, isOptional, missing });
					return missing;
				});

				if (isError) {
					console.log('Structured data validation failed, returning hold status', { message });
					return { status: 'hold', format: 'string', content: message };
				}
			}

			console.log('Returning successful response', { message, structuredData });
			return {
				status: 'success',
				format: 'string',
				content: { defaultData: message, ...structuredData },
			};
		} catch (error) {
			if (error.code === 'ECONNABORTED') {
				console.log('Request timed out after', { timeout, error });
				return {
					status: 'hold',
					format: 'string',
					content:
						'The campaign is still being processed. Please wait a few minutes and check the campaign status.',
				};
			}
			throw error;
		}
	} catch (error) {
		console.log('Error occurred in agentExecute', { error });
		return {
			userMessage:
				typeof error.response?.data?.detail === 'string'
					? error.response.data.detail
					: 'Internal server error! - Agent execution failed.',
			error: 'Internal server error! - Agent execution failed.',
			errorType: 'InternalServerErrorException',
			errorData: {
				error:
					typeof error.response?.data?.detail === 'string'
						? error.response.data.detail
						: returnErrorString(error),
			},
			trace: ['agentExecute - catch'],
		};
	}
};
