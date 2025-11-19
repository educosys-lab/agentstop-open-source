import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
	AddInteractMessageType,
	InteractType,
	AddInteractMembersType,
	UserInteractsType,
	DeleteInteractMembersType,
} from './interact.type';
import {
	addMessageValidation,
	getInteractValidation,
	getUserInteractsValidation,
	addMembersValidation,
	deleteMembersValidation,
} from './interact.validate';
import { WorkflowService } from 'src/workflow/workflow.service';
import { UserType } from 'src/user/user.type';
import { WorkflowType } from 'src/workflow/workflow.type';
import { WebSocketService } from 'src/shared/websocket/websocket.service';
import { DefaultReturnType } from 'src/shared/types/return.type';
import { validate } from 'src/shared/utils/zod.util';
import { UserPrivateService } from 'src/user/user.private';
import { WorkflowPrivateService } from 'src/workflow/workflow.private';
import { isError } from 'src/shared/utils/error.util';

/**
 * @summary Interact service
 * @description Service for interact operations
 * @functions
 * - getInteract
 * - getUserInteracts
 * - addMessage
 * - addMembers
 * - deleteMembers
 *
 * @private
 * - checkLinkedWorkflow
 * - getInteractUsers
 */
@Injectable()
export class InteractService {
	constructor(
		private readonly webSocketService: WebSocketService,

		@InjectModel('Interact') private InteractModel: Model<InteractType>,
		private readonly workflowService: WorkflowService,
		private readonly userPrivateService: UserPrivateService,
		private readonly workflowPrivateService: WorkflowPrivateService,
	) {}

	/**
	 * Get interact
	 */
	async getInteract(workflowId: string): Promise<DefaultReturnType<InteractType>> {
		const validationResult = validate({ data: { workflowId }, schema: getInteractValidation });
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'InteractService - getInteract - validate'],
			};
		}

		const interact = await this.InteractModel.findOne({ workflowId: validationResult.workflowId, isDeleted: false })
			.lean()
			.exec();
		if (!interact) {
			return {
				userMessage: 'Chat not found!',
				error: 'Chat not found!',
				errorType: 'BadRequestException',
				errorData: { workflowId },
				trace: ['InteractService - getInteract - this.InteractModel.findOne'],
			};
		}

		return interact;
	}

	/**
	 * Get user interacts
	 */
	async getUserInteracts(userId: string): Promise<DefaultReturnType<UserInteractsType[]>> {
		const validationResult = validate({ data: { userId }, schema: getUserInteractsValidation });
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'InteractService - getUserInteracts - validate'],
			};
		}

		const interacts = await this.InteractModel.find({ 'members.userId': userId, isDeleted: false }).lean().exec();
		if (!interacts) {
			return {
				userMessage: 'User chats not found!',
				error: 'User chats not found!',
				errorType: 'BadRequestException',
				errorData: { userId },
				trace: ['InteractService - getUserInteracts - this.InteractModel.find'],
			};
		}

		if (interacts.length === 0) return [];

		const workflowIds = interacts.map((interact) => interact.workflowId);

		const selectedWorkflowsData = await this.workflowPrivateService.getMultipleWorkflowsInternal(workflowIds);
		if (isError(selectedWorkflowsData)) {
			return {
				...selectedWorkflowsData,
				trace: [
					...selectedWorkflowsData.trace,
					'InteractService - getUserInteracts - this.workflowService.getMultipleWorkflows',
				],
			};
		}

		const userInteracts: UserInteractsType[] = [];
		const validWorkflows = selectedWorkflowsData.filter((workflow) => workflow.status !== 'deleted');

		interacts.forEach((interact) => {
			const thisWorkflow = validWorkflows.find((workflow) => workflow.id === interact.workflowId);
			if (!thisWorkflow) return;

			userInteracts.push({
				workflowId: interact.workflowId,
				workflowTitle: thisWorkflow.title,
				status: thisWorkflow.status,
			});
		});

		return userInteracts;
	}

	/**
	 * Add message to interact
	 */
	async addMessage(props: AddInteractMessageType): Promise<DefaultReturnType<true>> {
		const validationResult = validate({ data: props, schema: addMessageValidation });
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'InteractService - addMessage - validate'],
			};
		}

		const { userId, workflowId, id, format, content, isInternal, showTempData } = validationResult;

		const interact = await this.InteractModel.findOne({ workflowId, isDeleted: false }).lean().exec();
		if (!interact) {
			return {
				userMessage: 'Chat not found!',
				error: 'Chat not found!',
				errorType: 'BadRequestException',
				errorData: props,
				trace: ['InteractService - addMessage - this.InteractModel.findOne'],
			};
		}

		const checkedWorkflowData = await this.checkLinkedWorkflow(interact.workflowId);
		if (isError(checkedWorkflowData)) {
			return {
				...checkedWorkflowData,
				trace: [...checkedWorkflowData.trace, 'InteractService - addMessage - this.checkLinkedWorkflow'],
			};
		}

		if (showTempData) {
			await this.webSocketService.sendDataToClient({
				userId,
				event: 'showTempData',
				data: {
					status: 'success',
					content: {
						id,
						createTime: Date.now(),
						name: 'System',
						username: 'system',
						content,
						format,
					},
				},
			});
			return true;
		}

		const newMessage = {
			id,
			createTime: Date.now(),
			senderId: isInternal ? 'system' : userId,
			content,
			format,
		};
		interact.messages.push(newMessage);

		const updatedData = await this.InteractModel.findOneAndUpdate(
			{ workflowId },
			{ messages: interact.messages },
			{ new: true },
		)
			.lean()
			.exec();
		if (!updatedData) {
			return {
				userMessage: 'Failed to update chat!',
				error: 'Failed to update chat!',
				errorType: 'InternalServerErrorException',
				errorData: props,
				trace: ['InteractService - addMessage - this.InteractModel.findOneAndUpdate'],
			};
		}

		const interactUsers = await this.getInteractUsers(interact.members);
		if (isError(interactUsers)) {
			return {
				...interactUsers,
				trace: [...interactUsers.trace, 'InteractService - addMessage - this.getInteractUsers'],
			};
		}

		if (isInternal) {
			await this.webSocketService.sendDataToClient({
				userId,
				event: 'updateInteractMessage',
				data: {
					status: 'success',
					content: {
						id: newMessage.id,
						createTime: newMessage.createTime,
						name: 'System',
						username: 'system',
						content: newMessage.content,
						format: newMessage.format,
					},
				},
			});
		}

		return true;
	}

	/**
	 * Add members to interact
	 */
	async addMembers(props: AddInteractMembersType): Promise<DefaultReturnType<true>> {
		const validationResult = validate({ data: props, schema: addMembersValidation });
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'InteractService - addMembers - validate'],
			};
		}

		const { workflowId, emailOrUsername } = validationResult;

		const interact = await this.InteractModel.findOne({ id: workflowId, isDeleted: false }).lean().exec();
		if (!interact) {
			return {
				userMessage: 'Chat not found!',
				error: 'Chat not found!',
				errorType: 'BadRequestException',
				errorData: props,
				trace: ['InteractService - addMembers - this.InteractModel.findOne'],
			};
		}

		const checkedWorkflowData = await this.checkLinkedWorkflow(interact.workflowId);
		if (isError(checkedWorkflowData)) {
			return {
				...checkedWorkflowData,
				trace: [...checkedWorkflowData.trace, 'InteractService - addMembers - this.checkLinkedWorkflow'],
			};
		}

		const emails: string[] = [];
		const usernames: string[] = [];

		emailOrUsername.forEach((item) => {
			if (item.includes('@')) emails.push(item);
			else usernames.push(item);
		});

		const addedUsersData = await this.userPrivateService.getMultipleUsersInternal({
			email: emails,
			username: usernames,
		});
		if (isError(addedUsersData)) {
			return {
				...addedUsersData,
				trace: [...addedUsersData.trace, 'InteractService - addMembers - this.userService.getMultipleUsers'],
			};
		}

		const updatedMembers = interact.members;

		for (const user of addedUsersData) {
			const existingMember = updatedMembers.find((member) => member.userId === user.id) as any;
			if (existingMember) continue;

			updatedMembers.push({ userId: user.id, joinTime: Date.now(), isDeleted: false });
		}

		const updatedData = await this.InteractModel.findOneAndUpdate(
			{ workflowId, isDeleted: false },
			{ members: updatedMembers },
			{ new: true },
		)
			.lean()
			.exec();
		if (!updatedData) {
			return {
				userMessage: 'Failed to update chat!',
				error: 'Failed to update chat!',
				errorType: 'InternalServerErrorException',
				errorData: props,
				trace: ['InteractService - addMembers - this.InteractModel.findOneAndUpdate'],
			};
		}

		return true;
	}

	/**
	 * Delete members from interact
	 */
	async deleteMembers(props: DeleteInteractMembersType): Promise<DefaultReturnType<true>> {
		const validationResult = validate({ data: props, schema: deleteMembersValidation });
		if (isError(validationResult)) {
			return {
				...validationResult,
				trace: [...validationResult.trace, 'InteractService - deleteMembers - validate'],
			};
		}

		const { workflowId, emailOrUsername } = validationResult;

		const interact = await this.InteractModel.findOne({ workflowId, isDeleted: false }).lean().exec();
		if (!interact) {
			return {
				userMessage: 'Chat not found!',
				error: 'Chat not found!',
				errorType: 'BadRequestException',
				errorData: props,
				trace: ['InteractService - deleteMembers - this.InteractModel.findOne'],
			};
		}

		const checkedWorkflowData = await this.checkLinkedWorkflow(interact.workflowId);
		if (isError(checkedWorkflowData)) {
			return {
				...checkedWorkflowData,
				trace: [...checkedWorkflowData.trace, 'InteractService - deleteMembers - this.checkLinkedWorkflow'],
			};
		}

		const emails: string[] = [];
		const usernames: string[] = [];

		emailOrUsername.forEach((item) => {
			if (item.includes('@')) emails.push(item);
			else usernames.push(item);
		});

		const deletedUsersData = await this.userPrivateService.getMultipleUsersInternal({
			email: emails,
			username: usernames,
		});
		if (isError(deletedUsersData)) {
			return {
				...deletedUsersData,
				trace: [
					...deletedUsersData.trace,
					'InteractService - deleteMembers - this.userService.getMultipleUsers',
				],
			};
		}

		const deleteMemberIds = deletedUsersData.map((user) => user.id);
		const updatedMembers = interact.members.map((member) => ({
			...member,
			isDeleted: deleteMemberIds.includes(member.userId) ? true : false,
		}));

		const updatedData = await this.InteractModel.findOneAndUpdate(
			{ workflowId, isDeleted: false },
			{ members: updatedMembers },
			{ new: true },
		)
			.lean()
			.exec();
		if (!updatedData) {
			return {
				userMessage: 'Failed to update chat!',
				error: 'Failed to update chat!',
				errorType: 'InternalServerErrorException',
				errorData: props,
				trace: ['InteractService - deleteMembers - this.InteractModel.findOneAndUpdate'],
			};
		}

		return true;
	}

	/**
	 * Check if workflow is linked to user
	 */
	private async checkLinkedWorkflow(workflowId: string): Promise<DefaultReturnType<WorkflowType>> {
		const workflow = await this.workflowPrivateService.getWorkflowInternal(workflowId);
		if (isError(workflow)) {
			return {
				...workflow,
				trace: [...workflow.trace, 'InteractService - checkLinkedWorkflow - this.workflowService.getWorkflow'],
			};
		}

		if (workflow.status === 'deleted') {
			return {
				userMessage: 'Mission is deleted!',
				error: 'Mission is deleted!',
				errorType: 'BadRequestException',
				errorData: { workflowId },
				trace: ['InteractService - checkLinkedWorkflow - workflowData.status === "deleted"'],
			};
		}

		return workflow;
	}

	/**
	 * Get interact users
	 */
	private async getInteractUsers(members: InteractType['members']): Promise<DefaultReturnType<UserType[]>> {
		const interactUsers = await this.userPrivateService.getMultipleUsersInternal({
			id: members.map((member) => member.userId),
		});
		if (isError(interactUsers)) {
			return {
				...interactUsers,
				trace: [
					...interactUsers.trace,
					'InteractService - getInteractUsers - this.userService.getMultipleUsers',
				],
			};
		}

		return interactUsers;
	}
}
