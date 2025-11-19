import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';

import { DefaultReturnType } from '../../types/return.type';
import { WorkflowPrivateService } from 'src/workflow/workflow.private';
import { isError } from 'src/shared/utils/error.util';
import { WebSocketService } from 'src/shared/websocket/websocket.service';
import { log } from 'src/shared/logger/logger';
import { CampaignMessagesType } from 'src/campaign/campaign-message/whatsapp-campaign.type';

@Injectable()
export class WhatsAppToolWebhookService {
	constructor(
		@InjectModel('CampaignMessages') private CampaignMessageModel: Model<CampaignMessagesType>,
		private readonly workflowPrivateService: WorkflowPrivateService,
		private readonly webSocketService: WebSocketService,
	) {}

	async handleWebhookGet(
		workflowId: string,
		nodeId: string,
		mode: string,
		verifyToken: string,
		challenge: string,
	): Promise<DefaultReturnType<string>> {
		const configuredVerifyToken = await this.getVerifyToken(workflowId, nodeId);
		if (!configuredVerifyToken) {
			return {
				userMessage: 'Verification failed',
				error: 'No configured verify token found',
				errorType: 'BadRequestException',
				errorData: { workflowId, nodeId, mode, verifyToken },
				trace: ['WhatsAppToolWebhookService - handleWebhookGet'],
			};
		}

		if (mode === 'subscribe' && verifyToken === configuredVerifyToken) return challenge;

		return {
			userMessage: 'Verification failed',
			error: 'Invalid mode or verify token',
			errorType: 'BadRequestException',
			errorData: { workflowId, nodeId, mode, verifyToken },
			trace: ['WhatsAppToolWebhookService - handleWebhookGet'],
		};
	}

	async sendMessage(
		receiverMobile: string,
		messageContent: string,
		userId: string,
		workflowId: string,
		nodeId: string,
	): Promise<DefaultReturnType<{ messageId: string }>> {
		try {
			const workflow = await this.workflowPrivateService.getWorkflowInternal(workflowId);
			if (isError(workflow) || !workflow) {
				return {
					userMessage: 'Workflow not found',
					error: 'Missing phoneNumberId or accessToken',
					errorType: 'BadRequestException',
					errorData: { workflowId, nodeId, receiverMobile },
					trace: ['WhatsAppToolWebhookService - sendMessage'],
				};
			}
			const nodeConfig = workflow.config?.[nodeId];

			if (!nodeConfig) {
				return {
					userMessage: 'Node Config not found',
					error: 'Missing phoneNumberId or accessToken',
					errorType: 'BadRequestException',
					errorData: { workflowId, nodeId, receiverMobile },
					trace: ['WhatsAppToolWebhookService - sendMessage'],
				};
			}
			if (!nodeConfig.PHONE_NUMBER_ID || !nodeConfig.WHATSAPP_ACCESS_TOKEN) {
				return {
					userMessage: 'Invalid workflow or node configuration',
					error: 'Missing phoneNumberId or accessToken',
					errorType: 'BadRequestException',
					errorData: { workflowId, nodeId, receiverMobile },
					trace: ['WhatsAppToolWebhookService - sendMessage'],
				};
			}

			const isWithinCustomerServiceWindow = true;
			if (!isWithinCustomerServiceWindow) {
				return {
					userMessage: 'Cannot send text message outside customer service window',
					error: 'Customer service window closed',
					errorType: 'BadRequestException',
					errorData: { receiverMobile, workflowId, nodeId },
					trace: ['WhatsAppToolWebhookService - sendMessage'],
				};
			}

			const whatsappApiResponse = await axios.post(
				`https://graph.facebook.com/v23.0/${nodeConfig.PHONE_NUMBER_ID}/messages`,
				{
					messaging_product: 'whatsapp',
					recipient_type: 'individual',
					to: receiverMobile,
					type: 'text',
					text: { body: messageContent },
				},
				{
					headers: {
						Authorization: `Bearer ${nodeConfig.WHATSAPP_ACCESS_TOKEN}`,
						'Content-Type': 'application/json',
					},
				},
			);

			const messageId = whatsappApiResponse.data.messages[0].id;

			const timestamp = Date.now();
			const status = 'sent';

			// Find the latest campaign for the userId
			const latestCampaign = await this.CampaignMessageModel.findOne(
				{ userId },
				{},
				{ sort: { 'messages.content.timestamp': -1 } },
			).lean();

			let campaignMessage: CampaignMessagesType;
			if (latestCampaign) {
				campaignMessage = latestCampaign;
			} else {
				campaignMessage = {
					campaignId: `dynamic-campaign-${Date.now()}`,
					userId,
					messages: [],
					workflowId,
					nodeId,
				};
			}

			// Find or create the receiverMobile subdocument
			let receiverMessages = campaignMessage.messages.find((msg) => msg.receiverMobile === receiverMobile);
			if (!receiverMessages) {
				receiverMessages = { receiverMobile, content: [] };
				campaignMessage.messages.push(receiverMessages);
			}

			receiverMessages.content.push({
				messageId,
				messageContent,
				status,
				timestamp,
			});

			const updatedDoc = await this.CampaignMessageModel.findOneAndUpdate(
				{ userId, campaignId: campaignMessage.campaignId },
				{ $set: { messages: campaignMessage.messages, userId, workflowId, nodeId } },
				{ upsert: true, new: true },
			).lean();

			if (!updatedDoc) {
				return {
					userMessage: 'Failed to save message',
					error: 'Database update failed',
					errorType: 'InternalServerErrorException',
					errorData: {
						receiverMobile,
						messageId,
						campaignId: campaignMessage.campaignId,
						workflowId,
						nodeId,
					},
					trace: ['WhatsAppToolWebhookService - sendMessage'],
				};
			}

			await this.sendStatusUpdate(
				userId,
				messageId,
				status,
				timestamp,
				messageContent,
				campaignMessage.campaignId,
				receiverMobile,
			);

			return { messageId };
		} catch (error) {
			return {
				userMessage: `Failed to send message: ${error.message}`,
				error: error.message,
				errorType: 'InternalServerErrorException',
				errorData: { receiverMobile, userId, workflowId, nodeId },
				trace: ['WhatsAppToolWebhookService - sendMessage'],
			};
		}
	}

	async handleWebhookPost(
		workflowId: string,
		nodeId: string,
		payload: any,
	): Promise<DefaultReturnType<{ status: string }>> {
		if (!payload?.entry?.[0]?.changes?.[0]?.value) {
			return {
				userMessage: 'Invalid payload',
				error: 'Invalid webhook payload',
				errorType: 'BadRequestException',
				errorData: { workflowId, nodeId, payload },
				trace: ['WhatsAppToolWebhookService - handleWebhookPost'],
			};
		}

		const change = payload.entry[0].changes[0].value;

		try {
			// Handle status updates
			if (change.statuses && change.statuses.length > 0) {
				const status = change.statuses[0];
				const messageId = status.id;
				const readStatus = status.status || 'unknown';
				const timestamp = change.timestamp ? parseInt(change.timestamp) * 1000 : Date.now();

				const campaignMessage = await this.getCampaignByMessageId(messageId);
				if (!campaignMessage) return { status: 'success' };

				const receiverMobile = campaignMessage.messages.find((msg) =>
					msg.content.some((c) => c.messageId === messageId),
				)?.receiverMobile;

				if (!receiverMobile) return { status: 'success' };

				const updatedDoc = await this.CampaignMessageModel.findOneAndUpdate(
					{
						campaignId: campaignMessage.campaignId,
						'messages.receiverMobile': receiverMobile,
						'messages.content.messageId': messageId,
					},
					{
						$set: {
							'messages.$[msg].content.$[content].status': readStatus,
							'messages.$[msg].content.$[content].timestamp': timestamp,
							workflowId,
							nodeId,
						},
					},
					{
						arrayFilters: [{ 'msg.receiverMobile': receiverMobile }, { 'content.messageId': messageId }],
						new: true,
					},
				).lean();

				if (!updatedDoc) return { status: 'success' };

				await this.sendStatusUpdate(
					campaignMessage.userId || 'unknown',
					messageId,
					readStatus,
					timestamp,
					campaignMessage.messages
						.find((msg) => msg.receiverMobile === receiverMobile)
						?.content.find((c) => c.messageId === messageId)?.messageContent || 'No content',
					campaignMessage.campaignId,
					receiverMobile,
				);
			}

			// Handle inbound messages (replies)
			if (change.messages && change.messages.length > 0) {
				const message = change.messages[0];
				if (message.type !== 'text') {
					return { status: 'success' };
				}

				const messageId = message.id;
				const mobile = `+${message.from}`;
				let messageContent = message.text.body;
				messageContent = messageContent.replace(/&nbsp;/g, ' ').trim();
				const timestamp = change.timestamp ? parseInt(change.timestamp) * 1000 : Date.now();

				// Find the latest campaign by mobile
				const latestCampaign = await this.CampaignMessageModel.findOne(
					{ 'messages.receiverMobile': mobile },
					{},
					{ sort: { 'messages.content.timestamp': -1 } },
				).lean();

				let campaignMessage: CampaignMessagesType;
				if (latestCampaign) {
					campaignMessage = latestCampaign;
				} else {
					campaignMessage = {
						campaignId: `dynamic-campaign-${Date.now()}`,
						userId: 'unknown',
						messages: [],
						workflowId,
						nodeId,
					};
				}

				let receiverMessages = campaignMessage.messages.find((msg) => msg.receiverMobile === mobile);
				if (!receiverMessages) {
					receiverMessages = { receiverMobile: mobile, content: [] };
					campaignMessage.messages.push(receiverMessages);
				}

				const existingMessage = receiverMessages.content.find(
					(msg) => msg.messageId === messageId && msg.status === 'received',
				);
				if (existingMessage) {
					return { status: 'success' };
				}

				receiverMessages.content.push({
					messageId,
					messageContent,
					status: 'received',
					timestamp,
				});

				const updatedDoc = await this.CampaignMessageModel.findOneAndUpdate(
					{ campaignId: campaignMessage.campaignId },
					{
						$set: {
							messages: campaignMessage.messages,
							userId: campaignMessage.userId,
							workflowId,
							nodeId,
						},
					},
					{ upsert: true, new: true },
				).lean();

				if (!updatedDoc) return { status: 'success' };

				await this.sendCampaignUpdate(
					updatedDoc.userId || 'unknown',
					{
						messageId,
						status: 'received',
						timestamp,
						messageContent,
					},
					mobile,
					updatedDoc.campaignId,
				);
			}

			return { status: 'success' };
		} catch (error) {
			return {
				userMessage: `Failed to process webhook: ${error.message}`,
				error: error.message,
				errorType: 'InternalServerErrorException',
				errorData: { workflowId, nodeId, error: error.message },
				trace: ['WhatsAppToolWebhookService - handleWebhookPost'],
			};
		}
	}

	private async sendCampaignUpdate(
		userId: string,
		message: { messageId: string; status: string; timestamp: number; messageContent: string },
		receiverMobile: string,
		campaignId: string,
	) {
		try {
			await this.webSocketService.sendDataToClient({
				userId,
				event: 'update-campaign-chat',
				data: {
					status: 'success',
					content: { ...message, receiverMobile, campaignId },
				},
			});
		} catch (error) {
			log('system', 'error', {
				message: 'WebSocket send error:',
				data: { error: error.message, userId, messageId: message.messageId },
				trace: ['WhatsAppToolWebhookService - sendCampaignUpdate'],
			});
		}
	}

	private async sendStatusUpdate(
		userId: string,
		messageId: string,
		status: string,
		timestamp: number,
		messageContent: string,
		campaignId: string,
		receiverMobile: string,
	) {
		try {
			await this.webSocketService.sendDataToClient({
				userId,
				event: 'update-campaign-status',
				data: {
					status: 'success',
					content: { messageId, status, timestamp, messageContent, campaignId, receiverMobile },
				},
			});
		} catch (error) {
			log('system', 'error', {
				message: 'WebSocket status update error:',
				data: { error: error.message, userId, messageId },
				trace: ['WhatsAppToolWebhookService - sendStatusUpdate'],
			});
		}
	}

	private async getVerifyToken(workflowId: string, nodeId: string): Promise<string | null> {
		try {
			const workflow = await this.workflowPrivateService.getWorkflowInternal(workflowId);
			if (isError(workflow) || !workflow) return null;

			const nodeConfig = workflow.config?.[nodeId];
			const verifyToken = nodeConfig?.VERIFY_TOKEN;
			if (verifyToken) return verifyToken;

			return null;
		} catch {
			return null;
		}
	}

	private async getCampaignByMessageId(messageId: string): Promise<CampaignMessagesType | null> {
		try {
			const doc = await this.CampaignMessageModel.findOne({ 'messages.content.messageId': messageId })
				.lean()
				.exec();
			if (doc) {
				return {
					campaignId: doc.campaignId,
					userId: doc.userId,
					workflowId: doc.workflowId,
					nodeId: doc.nodeId,
					messages: doc.messages,
				};
			}
			return null;
		} catch {
			return null;
		}
	}
}
