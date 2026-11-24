import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { preferenceInput } from '@cbt/contracts/results';
import { actorOf } from '../results/actor';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@Req() req: any, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.svc.list(actorOf(req), { unreadOnly: unread === 'true', limit: limit ? Number(limit) : undefined });
  }
  @Get('unread-count') count(@Req() req: any) { return this.svc.unreadCount(actorOf(req)); }
  @Post('read-all') readAll(@Req() req: any) { return this.svc.markAllRead(actorOf(req)); }
  @Post(':id/read') read(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markRead(actorOf(req), id); }
  @Get('preferences') prefs(@Req() req: any) { return this.svc.getPreferences(actorOf(req)); }
  @Put('preferences') setPrefs(@Req() req: any, @Body() body: unknown) {
    return this.svc.setPreferences(actorOf(req), preferenceInput.parse(body));
  }
}
