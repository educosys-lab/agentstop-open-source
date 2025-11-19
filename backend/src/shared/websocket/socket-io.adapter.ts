import { INestApplication, Injectable } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SocketIoAdapter extends IoAdapter {
	constructor(
		private app: INestApplication,
		private config: ConfigService,
	) {
		super(app);
	}

	override createIOServer(port: number, options?: ServerOptions): Server {
		const finalOptions = {
			...(options ?? {}),
			cors: { origin: [process.env.FRONTEND_URL], credentials: true },
		};

		return super.createIOServer(port, finalOptions);
	}
}
