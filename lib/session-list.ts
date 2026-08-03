import { sessions as sessionsApi, type SessionPage, type StudySession } from "@/lib/api";

export async function refreshSessionPage(loadedCount: number): Promise<SessionPage> {
  const items: StudySession[] = [];
  let cursor: string | null = null;
  do {
    const page = await sessionsApi.page(cursor, Math.min(100, loadedCount - items.length));
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < loadedCount);
  return { items, nextCursor: cursor };
}

export function mergeActiveSession(
  sessions: StudySession[],
  activeSession: StudySession | null,
  include: (session: StudySession) => boolean = () => true,
) {
  const completed = sessions.filter((session) => session.ended_at !== null);
  if (!activeSession || !include(activeSession)) return completed;
  return [activeSession, ...completed.filter((session) => session.id !== activeSession.id)]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
}
