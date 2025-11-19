import {
	WebSocketGateway,
	WebSocketServer,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { WebSocketService } from './websocket.service';
import { HandleInteractType } from './websocket.type';
import { InteractSyncService } from './services/interact-sync.service';
import { log } from '../logger/logger';
import { isError } from '../utils/error.util';

// Redis Adapter in a Custom Gateway Adapter, Redis WebSocket adapter

/**
 * @summary Socket gateway
 * @description Gateway for handling WebSocket connections
 * @functions
 * - afterInit
 * - handleConnection
 * - handleDisconnect
 * - handleInteract
 */
@WebSocketGateway()
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	constructor(
		private readonly webSocketService: WebSocketService,
		private readonly interactSyncService: InteractSyncService,
	) {}

	/**
	 * Handle WebSocket initialization
	 */
	afterInit() {
		this.webSocketService.handleInit();
	}

	/**
	 * Handle WebSocket connection
	 */
	async handleConnection(socket: Socket) {
		const response = await this.webSocketService.handleConnection(socket);
		if (isError(response)) {
			log('system', 'error', {
				message: response.error,
				data: response.errorData,
				trace: [...response.trace, 'SocketGateway - handleConnection - this.webSocketService.handleConnection'],
			});
		}
	}

	/**
	 * Handle WebSocket disconnection
	 */
	async handleDisconnect(socket: Socket) {
		await this.webSocketService.handleDisconnect(socket);
	}

	/**
	 * Handle an interact
	 */
	@SubscribeMessage('interact')
	async handleInteract(socket: Socket, props: HandleInteractType): Promise<void | boolean> {
		const response = await this.interactSyncService.handleInteract({ socket, props });
		if (isError(response)) {
			const client = await this.webSocketService.getClient({ socketId: socket.id });

			log(isError(client) ? 'system' : client.userId, 'error', {
				message: response.error,
				data: response.errorData,
				trace: [...response.trace, 'SocketGateway - handleInteract - this.interactSyncService.handleInteract'],
			});

			socket.emit('interactError', { status: 'failed', content: response.userMessage });
		}
	}
}
