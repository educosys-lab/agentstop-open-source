import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { QueueService } from 'src/shared/queue/queue.service';
import { QUEUE } from 'src/shared/queue/queue.constant';
import { WorkflowCacheService } from './cache.service';
import { WorkflowService } from 'src/workflow/workflow.service';
import { WorkflowParserService } from './parser.service';
import { WorkflowListenersService } from './listener.service';
import { WorkflowTerminatorService } from './terminate.service';
import { WorkflowExecutorService } from './executor.service';
import { log } from 'src/shared/logger/logger';
import { WorkflowValidatorService } from './validator.service';
import {
	ExecutionCacheType,
	GeneralNodeReturnType,
	ResponderDataFormatType,
	ResponderNodeConfigType,
} from '../workflow-system.type';
import { WorkflowUpdateService } from './update.service';
import { WorkflowResponderService } from './responder.service';
import { WebSocketService } from 'src/shared/websocket/websocket.service';
import { UserService } from 'src/user/user.service';
import { DefaultReturnType } from 'src/shared/types/return.type';
import { WorkflowPrivateService } from 'src/workflow/workflow.private';
import { returnErrorString } from 'src/shared/utils/return.util';
import { isError } from 'src/shared/utils/error.util';

/**
 * @summary Workflow system service
 * @description Service for handling workflow system operations
 * @functions
 * - activateWorkflow
 * - handleTriggerEvent
 * - triggerWorkflow
 * - executeWorkflow
 * - terminateWorkflow
 * - activateWorkflowInternal
 */
@Injectable()
export class WorkflowSystemService {
	constructor(
		private readonly workflowCacheService: WorkflowCacheService,
		private readonly queueService: QueueService,
		private readonly webSocketService: WebSocketService,

		private readonly userService: UserService,

		private readonly workflowService: WorkflowService,
		private readonly workflowPrivateService: WorkflowPrivateService,
		private readonly workflowParserService: WorkflowParserService,
		private readonly workflowListenersService: WorkflowListenersService,
		private readonly workflowExecutorService: WorkflowExecutorService,
		private readonly workflowTerminatorService: WorkflowTerminatorService,
		private readonly workflowValidatorService: WorkflowValidatorService,
		private readonly workflowUpdateService: WorkflowUpdateService,
		private readonly workflowResponderService: WorkflowResponderService,
	) {}

	/**
	 * Activate workflow
	 */
	async activateWorkflow(props: { userId: string; workflowId: string }): Promise<DefaultReturnType<true>> {
		const { userId, workflowId } = props;

		const workflow = await this.workflowValidatorService.workflowActivateValidator({
			userId,
			workflowId,
		});
		if (isError(workflow)) {
			return {
				...workflow,
				trace: [
					...workflow.trace,
					`WorkflowSystemService - activateWorkflow - this.workflowValidatorService.workflowActivateValidator`,
				],
			};
		}

		const triggerNodes = this.workflowParserService.getTriggerNodes({
			userId,
			workflowId,
			nodes: workflow.nodes,
			edges: workflow.edges,
		});
		if (isError(triggerNodes)) {
			return {
				...triggerNodes,
				trace: [
					...triggerNodes.trace,
					`WorkflowSystemService - activateWorkflow - this.workflowParserService.getTriggerNodes`,
				],
			};
		}

		const mapping = await this.workflowParserService.getConnectionMap(workflow);
		if (isError(mapping)) {
			return {
				...mapping,
				trace: [
					...mapping.trace,
					`WorkflowSystemService - activateWorkflow - this.workflowParserService.getConnectionMap`,
				],
			};
		}

		const addToCacheResponse = await this.workflowCacheService.setWorkflowCache({
			workflowId: workflow.id,
			data: {
				workflowId: workflow.id,
				connectionMap: mapping.connectionMap,
				nodeMap: mapping.nodeMap,
				generalSettings: workflow.generalSettings,
			},
		});
		if (isError(addToCacheResponse)) {
			return {
				...addToCacheResponse,
				trace: [
					...addToCacheResponse.trace,
					`WorkflowSystemService - activateWorkflow - this.workflowCacheService.setWorkflowCache`,
				],
			};
		}

		const listenerResponse = await this.workflowListenersService.startListener({
			userId: workflow.createdBy,
			workflowId: workflow.id,
			triggerNodes,
			config: workflow.config,
			triggerCallback: this.handleTriggerEvent.bind(this),
		});
		if (isError(listenerResponse)) {
			return {
				...listenerResponse,
				trace: [
					...listenerResponse.trace,
					`WorkflowSystemService - activateWorkflow - this.workflowListenersService.startListener`,
				],
			};
		}

		const updateResponse = await this.workflowUpdateService.activateWorkflowUpdate(workflow.id);
		if (isError(updateResponse)) {
			log(userId, 'error', {
				message: updateResponse.error,
				data: { props, ...updateResponse.errorData },
				trace: [
					...updateResponse.trace,
					`WorkflowSystemService - activateWorkflow - this.workflowUpdateService.activateWorkflowUpdate`,
				],
			});
		}

		const sendDataResponse = await this.webSocketService.sendDataToClient({
			userId,
			event: 'updateInteractStatus',
			data: { status: 'success', content: { status: 'live', workflowId: workflow.id } },
		});
		if (isError(sendDataResponse)) {
			log(userId, 'error', {
				message: sendDataResponse.error,
				data: { props, ...sendDataResponse.errorData },
				trace: [
					...sendDataResponse.trace,
					`WorkflowSystemService - activateWorkflow - this.webSocketService.sendDataToClient`,
				],
			});
		}

		return true;
	}

	/**
	 * Handle trigger event
	 */
	async handleTriggerEvent(props: {
		userId: string;
		workflowId: string;
		data: string;
		format: ResponderDataFormatType;
		triggerDetails: ResponderNodeConfigType;
	}): Promise<DefaultReturnType<true>> {
		const { userId, workflowId, data, format, triggerDetails } = props;

		try {
			const workflow = await this.workflowPrivateService.getWorkflowInternal(workflowId);
			if (isError(workflow)) {
				const response = await this.workflowResponderService.sendResponse({
					format: 'string',
					data: 'Workflow not found',
					config: triggerDetails,
				});
				if (isError(response)) {
					log(userId, 'error', {
						message: response.error,
						data: { props, ...response.errorData },
						trace: [
							...response.trace,
							'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
						],
					});
				}

				log(userId, 'error', {
					message: workflow.error,
					data: { props, ...workflow.errorData },
					trace: [
						...workflow.trace,
						'WorkflowSystemService - handleTriggerEvent - this.workflowPrivateService.getWorkflowInternal',
					],
				});
				return {
					...workflow,
					trace: [
						...workflow.trace,
						'WorkflowSystemService - handleTriggerEvent - this.workflowPrivateService.getWorkflowInternal',
					],
				};
			}

			const user = await this.userService.getUser({ id: userId });
			if (isError(user)) {
				const response = await this.workflowResponderService.sendResponse({
					format: 'string',
					data: 'User not found',
					config: triggerDetails,
				});
				if (isError(response)) {
					log(userId, 'error', {
						message: response.error,
						data: { props, ...response.errorData },
						trace: [
							...response.trace,
							'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
						],
					});
				}

				log(userId, 'error', {
					message: user.error,
					data: { props, ...user.errorData },
					trace: [...user.trace, 'WorkflowSystemService - handleTriggerEvent - this.userService.getUser'],
				});
				return {
					...user,
					trace: [...user.trace, 'WorkflowSystemService - handleTriggerEvent - this.userService.getUser'],
				};
			}

			const showResultFromAllNodes =
				workflow.generalSettings.showResultFromAllNodes && triggerDetails.type !== 'webhook';

			const isValid = await this.workflowValidatorService.workflowTriggerValidator();
			if (isError(isValid)) {
				if (showResultFromAllNodes) {
					const response = await this.workflowResponderService.sendResponse({
						format: 'string',
						data: isValid.userMessage,
						config: triggerDetails,
					});
					if (isError(response)) {
						log(userId, 'error', {
							message: response.error,
							data: { props, ...response.errorData },
							trace: [
								...response.trace,
								'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
							],
						});
					}
				}

				if (isValid.trace.length !== 0) {
					log(userId, 'error', {
						message: isValid.error,
						data: { props, ...isValid.errorData },
						trace: [
							...isValid.trace,
							'WorkflowSystemService - handleTriggerEvent - this.workflowValidatorService.workflowTriggerValidator',
						],
					});
					return {
						...isValid,
						trace: [
							...isValid.trace,
							'WorkflowSystemService - handleTriggerEvent - this.workflowValidatorService.workflowTriggerValidator',
						],
					};
				}

				return true;
			}

			const executionId = uuidv4();

			const addToCacheResponse = await this.workflowCacheService.setExecutionCache({
				executionId,
				data: {
					userId,
					userFullName: `${user.firstName} ${user.lastName}`,
					workflowId: workflow.id,
					executionId,
					triggerDetails,
					allResponses: {
						[triggerDetails.nodeId]: {
							format,
							content: { defaultData: data },
						},
					},
				},
			});
			if (isError(addToCacheResponse)) {
				if (showResultFromAllNodes) {
					const response = await this.workflowResponderService.sendResponse({
						format: 'string',
						data: 'Failed to add workflow to cache',
						config: triggerDetails,
					});
					if (isError(response)) {
						log(userId, 'error', {
							message: response.error,
							data: { props, ...response.errorData },
							trace: [
								...response.trace,
								'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
							],
						});
					}
				}

				log(userId, 'error', {
					message: addToCacheResponse.error,
					data: { props, ...addToCacheResponse.errorData },
					trace: [
						...addToCacheResponse.trace,
						'WorkflowSystemService - handleTriggerEvent - this.workflowCacheService.setExecutionCache',
					],
				});
				return {
					...addToCacheResponse,
					trace: [
						...addToCacheResponse.trace,
						'WorkflowSystemService - handleTriggerEvent - this.workflowCacheService.setExecutionCache',
					],
				};
			}

			const queueAddResponse = await this.queueService.add({
				queueName: QUEUE.WORKFLOW_SYSTEM_QUEUE,
				key: 'executeWorkflow',
				data: { executionId, workflowId: workflow.id },
			});
			if (isError(queueAddResponse)) {
				if (showResultFromAllNodes) {
					const response = await this.workflowResponderService.sendResponse({
						format: 'string',
						data: 'Failed to add workflow to queue',
						config: triggerDetails,
					});
					if (isError(response)) {
						log(userId, 'error', {
							message: response.error,
							data: { props, ...response.errorData },
							trace: [
								...response.trace,
								'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
							],
						});
					}
				}

				log(userId, 'error', {
					message: queueAddResponse.error,
					data: { props, ...queueAddResponse.errorData },
					trace: [
						...queueAddResponse.trace,
						'WorkflowSystemService - handleTriggerEvent - this.queueService.add',
					],
				});
				return {
					...queueAddResponse,
					trace: [
						...queueAddResponse.trace,
						'WorkflowSystemService - handleTriggerEvent - this.queueService.add',
					],
				};
			}

			const newReport = { executionId, executionTime: Date.now(), executionStatus: 'started' as const };

			const updateResponse = await this.workflowService.updateWorkflow({
				workflowId: workflow.id,
				updates: { report: newReport },
				userId: undefined,
			});
			if (isError(updateResponse)) {
				if (showResultFromAllNodes) {
					const response = await this.workflowResponderService.sendResponse({
						format: 'string',
						data: 'Failed to update workflow report',
						config: triggerDetails,
					});
					if (isError(response)) {
						log(userId, 'error', {
							message: response.error,
							data: { props, ...response.errorData },
							trace: [
								...response.trace,
								'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
							],
						});
					}
				}

				log(userId, 'error', {
					message: updateResponse.error,
					data: { props, ...updateResponse.errorData },
					trace: [
						...updateResponse.trace,
						'WorkflowSystemService - handleTriggerEvent - this.workflowService.updateWorkflow',
					],
				});
			}

			return true;
		} catch (error) {
			const response = await this.workflowResponderService.sendResponse({
				format: 'string',
				data: 'Error handling trigger event',
				config: triggerDetails,
			});
			if (isError(response)) {
				log(userId, 'error', {
					message: response.error,
					data: { props, ...response.errorData },
					trace: [
						...response.trace,
						'WorkflowSystemService - handleTriggerEvent - this.workflowResponderService.sendResponse',
					],
				});
			}

			log(userId, 'error', {
				message: error.message,
				data: { props, ...error.errorData },
				trace: [...error.trace, 'WorkflowSystemService - handleTriggerEvent - catch'],
			});
			return {
				userMessage: 'Error handling trigger event!',
				error: 'Error handling trigger event!',
				errorType: 'InternalServerErrorException',
				errorData: {
					props,
					error: returnErrorString(error),
				},
				trace: ['WorkflowSystemService - handleTriggerEvent - catch'],
			};
		}
	}

	/**
	 * Trigger workflow
	 */
	async triggerWorkflow(props: {
		userId: ExecutionCacheType['userId'];
		workflowId: ExecutionCacheType['workflowId'];
		data: any;
		format: ResponderDataFormatType;
		sourceData: { type: 'interact' } | { type: 'webhook'; requestId: string };
	}): Promise<DefaultReturnType<true>> {
		const { userId, workflowId, data, format, sourceData } = props;

		const workflow = await this.workflowPrivateService.getWorkflowInternal(workflowId);
		if (isError(workflow)) {
			return {
				...workflow,
				trace: [
					...workflow.trace,
					'WorkflowSystemService - triggerWorkflow - this.workflowPrivateService.getWorkflowInternal',
				],
			};
		}

		const thisNodeType = sourceData.type === 'interact' ? 'interact-trigger' : 'webhook-trigger';

		const thisNodes = workflow.nodes.find((node) => node.type === thisNodeType);
		if (!thisNodes) {
			return {
				userMessage: sourceData.type === 'interact' ? 'Chat node not found!' : 'Webhook node not found!',
				error: sourceData.type === 'interact' ? 'Chat node not found!' : 'Webhook node not found!',
				errorType: 'NotFoundException',
				errorData: { workflowId },
				trace: ['WorkflowSystemService - triggerWorkflow - this.workflowPrivateService.getWorkflowInternal'],
			};
		}

		let triggerDetails: ResponderNodeConfigType;
		if (sourceData.type === 'interact') {
			triggerDetails = { nodeId: thisNodes.id, type: sourceData.type, userId, workflowId };
		} else {
			triggerDetails = { nodeId: thisNodes.id, type: sourceData.type, userId, requestId: sourceData.requestId };
		}

		const response = await this.handleTriggerEvent({
			userId,
			workflowId,
			data,
			format,
			triggerDetails,
		});

		if (isError(response)) {
			return {
				...response,
				trace: [...response.trace, 'WorkflowSystemService - triggerWorkflow - this.handleTriggerEvent'],
			};
		}

		return true;
	}

	/**
	 * Execute workflow
	 */
	async executeWorkflow(
		executionId: string,
	): Promise<DefaultReturnType<{ status: GeneralNodeReturnType['status']; content?: string }>> {
		const response = await this.workflowExecutorService.executeWorkflow(executionId);
		if (isError(response)) {
			return {
				...response,
				trace: [
					...response.trace,
					'WorkflowSystemService - executeWorkflow - this.workflowExecutorService.executeWorkflow',
				],
			};
		}

		return response;
	}

	/**
	 * Terminate workflow
	 */
	async terminateWorkflow(props: { userId: string; workflowId: string }): Promise<DefaultReturnType<true>> {
		const { userId, workflowId } = props;

		const terminateWorkflowResponse = await this.workflowTerminatorService.terminateWorkflow(workflowId);
		if (isError(terminateWorkflowResponse)) {
			return {
				...terminateWorkflowResponse,
				trace: [
					...terminateWorkflowResponse.trace,
					'WorkflowSystemService - terminateWorkflow - this.workflowTerminatorService.terminateWorkflow',
				],
			};
		}

		const sendDataResponse = await this.webSocketService.sendDataToClient({
			userId,
			event: 'updateInteractStatus',
			data: { status: 'success', content: { status: 'inactive', workflowId } },
		});
		if (isError(sendDataResponse)) {
			log(userId, 'error', {
				message: sendDataResponse.error,
				data: sendDataResponse.errorData,
				trace: [
					...sendDataResponse.trace,
					'WorkflowSystemService - terminateWorkflow - this.webSocketService.sendDataToClient',
				],
			});
		}

		return true;
	}

	/**
	 * Activate workflow internal
	 */
	async activateWorkflowInternal(workflowId: string): Promise<DefaultReturnType<true>> {
		const workflow = await this.workflowPrivateService.getWorkflowInternal(workflowId);
		if (isError(workflow)) {
			return {
				...workflow,
				trace: [
					...workflow.trace,
					'WorkflowSystemService - activateWorkflowInternal - this.workflowPrivateService.getWorkflowInternal',
				],
			};
		}

		const triggerNodes = this.workflowParserService.getTriggerNodes({
			userId: workflow.createdBy,
			workflowId: workflow.id,
			nodes: workflow.nodes,
			edges: workflow.edges,
		});
		if (isError(triggerNodes)) {
			return {
				...triggerNodes,
				trace: [
					...triggerNodes.trace,
					'WorkflowSystemService - activateWorkflowInternal - this.workflowParserService.getTriggerNodes',
				],
			};
		}

		const listenerResponse = await this.workflowListenersService.startListener({
			userId: workflow.createdBy,
			workflowId: workflow.id,
			triggerNodes,
			config: workflow.config,
			triggerCallback: this.handleTriggerEvent.bind(this),
		});
		if (isError(listenerResponse)) {
			return {
				...listenerResponse,
				trace: [
					...listenerResponse.trace,
					'WorkflowSystemService - activateWorkflowInternal - this.workflowListenersService.startListener',
				],
			};
		}

		return true;
	}
}
