import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import * as cookie from 'cookie';

import { AuthService } from 'src/auth/auth.service';
import { CacheService } from '../cache/cache.service';
import { DefaultReturnType } from '../types/return.type';
import { isError } from '../utils/error.util';

/**
 * @summary WebSocket service
 * @description Service for handling WebSocket connections
 * @functions
 * - handleInit
 * - handleConnection
 * - handleDisconnect
 * - getClient
 * - sendDataToClient
 *
 * @private
 * - getUserIdFromSocket
 * - getSocketKey
 * - getUserKey
 * - getUserSocketIds
 * - addUserSocketId
 * - removeUserSocketId
 */
@Injectable()
export class WebSocketService {
	// socketId -> Socket (kept in memory as Socket objects cannot be serialized)
	private readonly sockets: Map<string, Socket> = new Map();

	constructor(
		private readonly authService: AuthService,
		private readonly cacheService: CacheService,
	) {}

	/**
	 * Handle WebSocket initialization
	 */
	handleInit(): void {}

	/**
	 * Handle WebSocket connection
	 */
	async handleConnection(socket: Socket): Promise<DefaultReturnType<true>> {
		const idFromToken = await this.getUserIdFromSocket(socket);
		if (isError(idFromToken)) {
			return {
				...idFromToken,
				trace: [...idFromToken.trace, 'WebSocketService - handleConnection - this.getUserIdFromSocket'],
			};
		}

		const socketId = socket.id;
		const userId = idFromToken;

		// Store socketId -> userId in Redis
		const setSocketResult = await this.cacheService.set({
			key: this.getSocketKey(socketId),
			data: userId,
			ttl: 'infinity',
		});
		if (isError(setSocketResult)) {
			return {
				...setSocketResult,
				trace: [...setSocketResult.trace, 'WebSocketService - handleConnection - this.cacheService.set socket'],
			};
		}

		// Add socketId to user's socket list in Redis
		const addSocketResult = await this.addUserSocketId(userId, socketId);
		if (isError(addSocketResult)) {
			return {
				...addSocketResult,
				trace: [...addSocketResult.trace, 'WebSocketService - handleConnection - this.addUserSocketId'],
			};
		}

		// Store Socket object in memory (cannot be serialized)
		this.sockets.set(socketId, socket);

		return true;
	}

	/**
	 * Handle WebSocket disconnection
	 */
	async handleDisconnect(socket: Socket): Promise<DefaultReturnType<true>> {
		const socketId = socket.id;

		// Get userId from Redis
		const userIdResult = await this.cacheService.get<string>(this.getSocketKey(socketId));
		if (isError(userIdResult)) {
			// Socket not found in Redis, might have been already cleaned up
			this.sockets.delete(socketId);
			return true;
		}

		const userId = userIdResult;

		// Remove socketId -> userId mapping from Redis
		await this.cacheService.delete(this.getSocketKey(socketId));

		// Remove socketId from user's socket list in Redis
		const removeSocketResult = await this.removeUserSocketId(userId, socketId);
		if (isError(removeSocketResult)) {
			return {
				...removeSocketResult,
				trace: [...removeSocketResult.trace, 'WebSocketService - handleDisconnect - this.removeUserSocketId'],
			};
		}

		// Remove Socket object from memory
		this.sockets.delete(socketId);

		return true;
	}

	/**
	 * Get a client
	 */
	async getClient(props: {
		userId?: string;
		socketId?: string;
	}): Promise<DefaultReturnType<{ userId: string; socket: Socket }>> {
		const { userId, socketId } = props;

		if (!userId && !socketId) {
			return {
				userMessage: 'Client not found!',
				error: 'No userId or socketId provided!',
				errorType: 'BadRequestException',
				errorData: { props },
				trace: ['WebSocketService - getClient - if (!userId && !socketId)'],
			};
		}

		if (userId) {
			// Get socketIds for this user from Redis
			const socketIdsResult = await this.getUserSocketIds(userId);
			if (isError(socketIdsResult)) {
				return {
					userMessage: 'Client not found!',
					error: 'No sockets found for the provided userId!',
					errorType: 'NotFoundException',
					errorData: { userId },
					trace: ['WebSocketService - getClient - this.getUserSocketIds'],
				};
			}

			// Get the first available socket for this user
			const socketIds = socketIdsResult;
			if (socketIds.length === 0) {
				return {
					userMessage: 'Client not found!',
					error: 'No sockets found for the provided userId!',
					errorType: 'NotFoundException',
					errorData: { userId },
					trace: ['WebSocketService - getClient - socketIds.length === 0'],
				};
			}

			// Find the first socket that exists in memory
			let socket: Socket | undefined;
			for (const sid of socketIds) {
				socket = this.sockets.get(sid);
				if (socket) break;
			}

			if (!socket) {
				return {
					userMessage: 'Client not found!',
					error: 'No active socket found for the provided userId!',
					errorType: 'NotFoundException',
					errorData: { userId },
					trace: ['WebSocketService - getClient - !socket'],
				};
			}

			return { userId, socket };
		} else if (socketId) {
			// Get userId from Redis
			const userIdResult = await this.cacheService.get<string>(this.getSocketKey(socketId));
			if (isError(userIdResult)) {
				return {
					userMessage: 'Client not found!',
					error: 'No userId found for the provided socketId!',
					errorType: 'NotFoundException',
					errorData: { socketId },
					trace: ['WebSocketService - getClient - this.cacheService.get socketId'],
				};
			}

			const userIdFromSocket = userIdResult;

			// Get Socket from memory
			const socket = this.sockets.get(socketId);
			if (!socket) {
				return {
					userMessage: 'Client not found!',
					error: 'No socket found for the provided socketId!',
					errorType: 'NotFoundException',
					errorData: { userId: userIdFromSocket, socketId },
					trace: ['WebSocketService - getClient - this.sockets.get'],
				};
			}

			return { userId: userIdFromSocket, socket };
		}

		return {
			userMessage: 'Client not found!',
			error: 'No userId or socketId provided!',
			errorType: 'BadRequestException',
			errorData: { props },
			trace: ['WebSocketService - getClient - if (!userId && !socketId)'],
		};
	}

	/**
	 * Send data to a client
	 */
	async sendDataToClient(props: {
		userId: string;
		socketId?: undefined;
		event: string;
		data: { status: 'success' | 'failed'; content: any };
	}): Promise<DefaultReturnType<true>>;
	async sendDataToClient(props: {
		userId?: undefined;
		socketId: string;
		event: string;
		data: { status: 'success' | 'failed'; content: any };
	}): Promise<DefaultReturnType<true>>;
	async sendDataToClient(props: {
		userId?: string;
		socketId?: string;
		event: string;
		data: { status: 'success' | 'failed'; content: any };
	}): Promise<DefaultReturnType<boolean>> {
		const { userId, socketId, event, data } = props;

		if (!userId && !socketId) {
			return false;
		}

		if (userId) {
			// Get socketIds for this user from Redis
			const socketIdsResult = await this.getUserSocketIds(userId);
			if (isError(socketIdsResult) || socketIdsResult.length === 0) {
				return false;
			}

			// Send to all sockets for this user
			let sent = false;
			for (const sid of socketIdsResult) {
				const socket = this.sockets.get(sid);
				if (socket) {
					socket.emit(event, data);
					sent = true;
				}
			}

			return sent;
		} else if (socketId) {
			// Get Socket from memory
			const socket = this.sockets.get(socketId);
			if (!socket) {
				return false;
			}

			socket.emit(event, data);
			return true;
		}

		return false;
	}

	/**
	 * Get user id from socket
	 */
	private async getUserIdFromSocket(socket: Socket): Promise<DefaultReturnType<string>> {
		const parsedCookies = cookie.parse(socket.handshake.headers.cookie || '');
		const refreshToken = parsedCookies['refreshToken'] || '';

		const dataFromToken = await this.authService.verifyUserRefreshToken(refreshToken);
		if (isError(dataFromToken)) {
			return {
				...dataFromToken,
				trace: [
					...dataFromToken.trace,
					'WebSocketService - getUserIdFromSocket - this.authService.verifyToken',
				],
			};
		}

		return dataFromToken.id;
	}

	/**
	 * Get Redis key for socket mapping
	 */
	private getSocketKey(socketId: string): string {
		return `ws:socket:${socketId}`;
	}

	/**
	 * Get Redis key for user socket list
	 */
	private getUserKey(userId: string): string {
		return `ws:user:${userId}`;
	}

	/**
	 * Get socket IDs for a user from Redis
	 */
	private async getUserSocketIds(userId: string): Promise<DefaultReturnType<string[]>> {
		const userKey = this.getUserKey(userId);
		const socketIdsResult = await this.cacheService.get<string[]>(userKey);
		if (isError(socketIdsResult)) {
			return [];
		}
		return socketIdsResult || [];
	}

	/**
	 * Add socket ID to user's socket list in Redis
	 */
	private async addUserSocketId(userId: string, socketId: string): Promise<DefaultReturnType<true>> {
		const userKey = this.getUserKey(userId);
		const socketIdsResult = await this.getUserSocketIds(userId);
		const socketIds = isError(socketIdsResult) ? [] : socketIdsResult;

		if (!socketIds.includes(socketId)) {
			socketIds.push(socketId);
		}

		const setResult = await this.cacheService.set({
			key: userKey,
			data: socketIds,
			ttl: 'infinity',
		});

		if (isError(setResult)) {
			return {
				...setResult,
				trace: [...setResult.trace, 'WebSocketService - addUserSocketId - this.cacheService.set'],
			};
		}

		return true;
	}

	/**
	 * Remove socket ID from user's socket list in Redis
	 */
	private async removeUserSocketId(userId: string, socketId: string): Promise<DefaultReturnType<true>> {
		const userKey = this.getUserKey(userId);
		const socketIdsResult = await this.getUserSocketIds(userId);
		const socketIds = isError(socketIdsResult) ? [] : socketIdsResult;

		const filteredSocketIds = socketIds.filter((id) => id !== socketId);

		if (filteredSocketIds.length === 0) {
			// Remove the key if no sockets remain
			await this.cacheService.delete(userKey);
		} else {
			const setResult = await this.cacheService.set({
				key: userKey,
				data: filteredSocketIds,
				ttl: 'infinity',
			});

			if (isError(setResult)) {
				return {
					...setResult,
					trace: [...setResult.trace, 'WebSocketService - removeUserSocketId - this.cacheService.set'],
				};
			}
		}

		return true;
	}
}
