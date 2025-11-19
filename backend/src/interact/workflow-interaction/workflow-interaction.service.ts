import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { createInteractValidation, deleteInteractValidation } from './workflow-interaction.validate';
import { UserService } from 'src/user/user.service';
import { WorkflowType } from 'src/workflow/workflow.type';
import { InteractType } from 'src/interact/interact.type';
import { WebSocketService } from 'src/shared/websocket/websocket.service';
import { DefaultReturnType } from 'src/shared/types/return.type';
import { validate } from 'src/shared/utils/zod.util';
import { isError } from 'src/shared/utils/error.util';

/**
 * @summary Workflow interaction service
 * @description Service for interact operations from workflow, otherwise it was creating cyclic dependency
 * @functions
 * - interactExists
 * - createInteract
 * - deleteInteract
 */
@Injectable()
export class WorkflowInteractionService {
	constructor(
		private readonly webSocketService: WebSocketService,

		@InjectModel('Interact') private InteractModel: Model<InteractType>,
		private readonly userService: UserService,
	) {}

	/**
	 * Check if interact exists
	 */
	async interactExists(workflowId: string): Promise<DefaultReturnType<boolean>> {
		const interact = await this.InteractModel.findOne({ workflowId, isDeleted: false });
		if (!interact) return false;
		return true;
	}

	/**
	 * Create interact
	 */
	async createInteract(props: { userId: string; workflow: WorkflowType }): Promise<DefaultReturnType<true>> {
		const { userId, workflow } = props;

		const validationResult = validate({
			data: { workflowId: workflow.id, workflowCreatedBy: workflow.createdBy },
			schema: createInteractValidation,
		});
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'WorkflowInteractionService - createInteract - validate'],
			};
		}

		const { workflowId, workflowCreatedBy } = validationResult;

		const user = await this.userService.getUser({ id: workflowCreatedBy });
		if (isError(user)) {
			return {
				...user,
				trace: [...user.trace, 'WorkflowInteractionService - createInteract - user'],
			};
		}

		const newInteract = {
			workflowId: workflowId,
			messages: [],
			members: [{ userId: user.id }],
		};

		const interact = await this.InteractModel.create(newInteract);
		if (!interact) {
			return {
				userMessage: 'Failed to create chat!',
				error: 'Failed to create chat!',
				errorType: 'InternalServerErrorException',
				errorData: { workflowId },
				trace: ['WorkflowInteractionService - createInteract - this.InteractModel.create'],
			};
		}

		const response = await this.webSocketService.sendDataToClient({
			userId,
			event: 'addUserInteracts',
			data: {
				status: 'success',
				content: { workflowId: workflow.id, workflowTitle: workflow.title },
			},
		});
		if (isError(response)) {
			return {
				...response,
				trace: [
					...response.trace,
					'WorkflowInteractionService - createInteract - this.webSocketService.sendDataToClient',
				],
			};
		}

		return true;
	}

	/**
	 * Delete interact from user
	 */
	async deleteInteract(props: { userId: string | undefined; workflowId: string }): Promise<DefaultReturnType<true>> {
		const validationResult = validate({
			data: props,
			schema: deleteInteractValidation,
		});
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'WorkflowInteractionService - deleteInteract - validate'],
			};
		}

		const { userId, workflowId } = validationResult;

		const interact = await this.InteractModel.findOneAndDelete({
			workflowId,
		});
		if (!interact) {
			return {
				userMessage: 'Failed to delete chat!',
				error: 'Failed to delete chat!',
				errorType: 'InternalServerErrorException',
				errorData: { props },
				trace: ['WorkflowInteractionService - deleteInteract - this.InteractModel.findOneAndUpdate'],
			};
		}

		if (userId) {
			const response = await this.webSocketService.sendDataToClient({
				userId,
				event: 'deleteUserInteracts',
				data: { status: 'success', content: workflowId },
			});
			if (isError(response)) {
				return {
					...response,
					trace: [
						...response.trace,
						'WorkflowInteractionService - deleteInteract - this.webSocketService.sendDataToClient',
					],
				};
			}
		}

		return true;
	}
}
