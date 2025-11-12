import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE } from 'src/shared/queue/queue.constant';
import { QueueService } from './queue.service';

@Global()
@Module({
	imports: [
		ConfigModule,
		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				connection: {
					host: configService.get<string>('REDIS_CACHE_HOST'),
					port: configService.get<number>('REDIS_CACHE_PORT'),
					username: configService.get<string>('REDIS_CACHE_USERNAME'),
					password: configService.get<string>('REDIS_CACHE_PASSWORD'),
				},
			}),
		}),
		BullModule.registerQueue({ name: QUEUE.WORKFLOW_SYSTEM_QUEUE }, { name: QUEUE.WORKFLOW_SAVE_TO_DB_QUEUE }),
	],
	providers: [QueueService],
	exports: [QueueService],
})
export class QueueModule {}
