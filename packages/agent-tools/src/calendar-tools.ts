import { softFail, parseDateInput } from './util';
import type { ToolDef } from './types';

const str = (value: unknown): string => String(value ?? '').trim();

export function buildCalendarTools(prisma: any): Record<string, ToolDef> {
  async function audit(ctx: any, action: string, metadata: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          action,
          resource: 'tool',
          resourceId: 'calendar',
          metadata: { runId: ctx.runId, ...metadata } as any,
        },
      });
    } catch {}
  }

  function serialize(event: any) {
    return {
      id: event.id,
      title: event.title,
      description: event.description ?? null,
      location: event.location ?? null,
      start: event.startAt.toISOString(),
      end: event.endAt.toISOString(),
      allDay: event.allDay,
      url: event.url ?? null,
      createdAt: event.createdAt?.toISOString?.() ?? null,
    };
  }

  function resolveWindow(input: Record<string, unknown>) {
    const now = new Date();
    const from = input.from || input.start ? parseDateInput(input.from ?? input.start, now) : new Date(now.getTime() - 7 * 86400_000);
    const to = input.to || input.end ? parseDateInput(input.to ?? input.end, new Date(from.getTime() + 60 * 86400_000)) : new Date(from.getTime() + 60 * 86400_000);
    return { from, to };
  }

  function eventTimes(input: Record<string, unknown>, existing?: any): { startAt: Date; endAt: Date } {
    const allDay = input.allDay !== undefined ? input.allDay === true || input.allDay === 'true' : Boolean(existing?.allDay);
    const startRaw = input.start ?? input.startAt ?? input.when;
    const startAt = startRaw !== undefined ? parseDateInput(startRaw, existing?.startAt ?? new Date()) : existing?.startAt;
    if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) throw new Error('start is required (an ISO date/time string)');
    const endRaw = input.end ?? input.endAt;
    let endAt: Date;
    if (endRaw !== undefined) {
      endAt = parseDateInput(endRaw, startAt);
    } else if (existing?.endAt) {
      endAt = existing.endAt;
    } else {
      endAt = new Date(startAt.getTime() + (allDay ? 24 : 1) * 3600_000);
    }
    if (endAt.getTime() <= startAt.getTime()) throw new Error('end must be after start');
    return { startAt, endAt };
  }

  return {
    calendar_list_events: {
      name: 'calendar_list_events',
      description:
        'List workspace calendar events in a date window. Input: { from?: ISO date (default: 7 days ago), to?: ISO date (default: +60 days), limit?: number (1-100, default 25) }.',
      category: 'Calendar',
      scope: 'calendar:read',
      requiresApproval: false,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const { from, to } = resolveWindow(input);
          const limit = Math.min(Math.max(Number(input.limit ?? 25) || 25, 1), 100);
          const events = await prisma.calendarEvent.findMany({
            where: { organizationId: ctx.user.organizationId, startAt: { gte: from, lte: to } },
            orderBy: { startAt: 'asc' },
            take: limit,
          });
          return {
            from: from.toISOString(),
            to: to.toISOString(),
            count: events.length,
            events: events.map(serialize),
          };
        }),
    },

    calendar_create_event: {
      name: 'calendar_create_event',
      description:
        'Create a workspace calendar event. This is a write side effect and requires human approval. Input: { title: string, start: ISO date/time, end?: ISO date/time (defaults to +1 hour, or +1 day when allDay), description?: string, location?: string, allDay?: boolean }.',
      category: 'Calendar',
      scope: 'calendar:write',
      requiresApproval: true,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const title = str(input.title ?? input.name);
          if (!title) throw new Error('title is required');
          if (title.length > 300) throw new Error('title must be 300 characters or fewer');
          const { startAt, endAt } = eventTimes(input);
          const allDay = input.allDay === true || input.allDay === 'true';
          const event = await prisma.calendarEvent.create({
            data: {
              organizationId: ctx.user.organizationId,
              title,
              description: str(input.description) || null,
              location: str(input.location) || null,
              startAt,
              endAt,
              allDay,
              runId: ctx.runId,
              createdBy: ctx.user.id,
            },
          });
          await audit(ctx, 'tool.calendar.create', { eventId: event.id, title, start: startAt.toISOString() });
          return { created: true, event: serialize(event) };
        }),
    },

    calendar_update_event: {
      name: 'calendar_update_event',
      description:
        'Update a workspace calendar event. This is a write side effect and requires human approval. Input: { eventId: string, title?: string, start?: ISO date/time, end?: ISO date/time, description?: string, location?: string, allDay?: boolean }.',
      category: 'Calendar',
      scope: 'calendar:write',
      requiresApproval: true,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const eventId = str(input.eventId ?? input.id);
          if (!eventId) throw new Error('eventId is required');
          const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, organizationId: ctx.user.organizationId } });
          if (!existing) throw new Error(`Calendar event ${eventId} not found`);
          const timeFields: Record<string, unknown> = {};
          if (input.start ?? input.startAt ?? input.when ?? input.end ?? input.endAt) {
            Object.assign(timeFields, eventTimes(input, existing));
          }
          const data: Record<string, unknown> = {
            ...(str(input.title ?? input.name) ? { title: str(input.title ?? input.name) } : {}),
            ...(input.description !== undefined ? { description: str(input.description) || null } : {}),
            ...(input.location !== undefined ? { location: str(input.location) || null } : {}),
            ...(input.allDay !== undefined ? { allDay: input.allDay === true || input.allDay === 'true' } : {}),
            ...timeFields,
          };
          if (!Object.keys(data).length) throw new Error('Provide at least one field to update');
          const event = await prisma.calendarEvent.update({ where: { id: existing.id }, data });
          await audit(ctx, 'tool.calendar.update', { eventId: event.id, fields: Object.keys(data) });
          return { updated: true, event: serialize(event) };
        }),
    },

    calendar_delete_event: {
      name: 'calendar_delete_event',
      description:
        'Delete a workspace calendar event. This is a write side effect and requires human approval. Input: { eventId: string }.',
      category: 'Calendar',
      scope: 'calendar:write',
      requiresApproval: true,
      execute: (input: Record<string, unknown>, ctx: any) =>
        softFail(async () => {
          const eventId = str(input.eventId ?? input.id);
          if (!eventId) throw new Error('eventId is required');
          const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, organizationId: ctx.user.organizationId } });
          if (!existing) throw new Error(`Calendar event ${eventId} not found`);
          await prisma.calendarEvent.delete({ where: { id: existing.id } });
          await audit(ctx, 'tool.calendar.delete', { eventId, title: existing.title });
          return { deleted: true, eventId, title: existing.title };
        }),
    },
  };
}
