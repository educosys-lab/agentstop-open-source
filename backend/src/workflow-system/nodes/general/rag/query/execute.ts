import axios from 'axios';

import { ragQueryValidate, RagQueryConfigType, RagQueryDataType } from './validate';
import { GeneralNodePropsType, GeneralNodeReturnType } from 'src/workflow-system/workflow-system.type';
import { DefaultReturnType } from 'src/shared/types/return.type';
import { returnErrorString } from 'src/shared/utils/return.util';
import { isError } from 'src/shared/utils/error.util';

export const ragQueryExecute = async ({
	format,
	data,
	config,
}: GeneralNodePropsType<RagQueryDataType, RagQueryConfigType>): Promise<DefaultReturnType<GeneralNodeReturnType>> => {
	try {
		const validate = await ragQueryValidate({
			format,
			data,
			config,
		});
		if (isError(validate)) {
			return {
				...validate,
				trace: [...validate.trace, 'ragQueryExecute - ragQueryValidate'],
			};
		}

		const { sourceName } = validate.config;
		const { defaultData, userId } = validate.data;

		const formattedDefaultData =
			typeof (defaultData as any).data === 'string'
				? (defaultData as any).data
				: JSON.stringify((defaultData as any).data);

		const response = await axios.post(`${process.env.PYTHON_BACKEND_URL}/rag/query`, {
			question: formattedDefaultData,
			mode: 'docs_only',
			source_name: sourceName.map((name) => `${name}`),
		});

		return { status: 'success', format: 'string', content: { defaultData: response.data.answer } };
	} catch (error) {
		return {
			userMessage: 'Error getting response! Please try again later!',
			error: 'Internal server error!',
			errorType: 'InternalServerErrorException',
			errorData: {
				error: returnErrorString(error),
			},
			trace: ['ragQueryExecute - catch'],
		};
	}
};
