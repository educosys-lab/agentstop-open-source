import { Injectable } from '@nestjs/common';

import { WebSocketService } from '../websocket.service';
import { HandleInteractType } from '../websocket.type';
import { InteractService } from 'src/interact/interact.service';
import { Socket } from 'socket.io';
import { WorkflowSystemService } from 'src/workflow-system/services/system.service';
import { DefaultReturnType } from 'src/shared/types/return.type';
import { log } from 'src/shared/logger/logger';
import { isError } from 'src/shared/utils/error.util';

/**
 * @summary Interact sync service
 * @description Service for handling interact sync
 * @functions
 * - handleInteract
 */
@Injectable()
export class InteractSyncService {
	constructor(
		private readonly webSocketService: WebSocketService,

		private readonly interactService: InteractService,
		private readonly workflowSystemService: WorkflowSystemService,
	) {}

	/**
	 * Handle an interact
	 */
	async handleInteract({
		socket,
		props,
	}: {
		socket: Socket;
		props: HandleInteractType;
	}): Promise<DefaultReturnType<true>> {
		const socketId = socket.id;

		const client = await this.webSocketService.getClient({ socketId });
		if (isError(client)) {
			return {
				userMessage: 'Client not found!',
				error: 'Client not found!',
				errorType: 'NotFoundException',
				errorData: { socketId },
				trace: ['InteractSyncService - handleInteract - if (!client)'],
			};
		}

		switch (props.action) {
			case 'sendInteractMessage': {
				const sendInteractMessageResponse = await this.interactService.addMessage({
					...props.data,
					userId: client.userId,
					isInternal: false,
				});
				if (isError(sendInteractMessageResponse)) {
					log(client.userId, 'error', {
						message: sendInteractMessageResponse.error,
						data: sendInteractMessageResponse.errorData,
						trace: [
							...sendInteractMessageResponse.trace,
							'InteractSyncService - handleInteract - this.interactService.addMessage',
						],
					});

					socket.emit('interactError', {
						status: 'failed',
						content: sendInteractMessageResponse.userMessage,
					});
				}

				const triggerWorkflowResponse = await this.workflowSystemService.triggerWorkflow({
					userId: client.userId,
					workflowId: props.data.workflowId,
					data: props.data.content,
					format: 'string',
					sourceData: { type: 'interact' },
				});
				if (isError(triggerWorkflowResponse)) {
					log(client.userId, 'error', {
						message: triggerWorkflowResponse.error,
						data: triggerWorkflowResponse.errorData,
						trace: [
							...triggerWorkflowResponse.trace,
							'InteractSyncService - handleInteract - this.workflowSystemService.triggerWorkflow',
						],
					});

					socket.emit('interactError', {
						status: 'failed',
						content: triggerWorkflowResponse.userMessage,
					});
				}

				break;
			}
			default: {
				break;
			}
		}

		return true;
	}
}
