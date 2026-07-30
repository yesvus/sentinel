import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/server/db";
import { COOKIE_OPTIONS, createToken, getUserId, unauthorized } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const noContent = () => new NextResponse(null, { status: 204 });
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const body = (request: NextRequest) => request.json().catch(() => ({}));
const FOCUS_AUDIO_TYPES = new Set(["white", "pink", "brown", "speech-blocker", "binaural-40hz"]);

function validProductionPercentage(value: unknown): value is number | null {
  return value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 && value % 10 === 0);
}

function productionPercentageError(value: unknown) {
  return value !== undefined && !validProductionPercentage(value)
    ? error("productionPercentage must be null or an integer from 0 to 100 in increments of 10")
    : null;
}

function sessionCursor(startedAt: string, id: number) {
  return Buffer.from(JSON.stringify([startedAt, id])).toString("base64url");
}

function parseSessionCursor(cursor: string | null): [string, number] | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown;
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      typeof value[1] === "number" &&
      Number.isInteger(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {}
  return null;
}

async function activeSession(userId: number) {
  const result = await db.execute({
    sql: `
      SELECT sessions.id, sessions.started_at, sessions.ended_at,
             sessions.duration_seconds, sessions.description, sessions.production_percentage,
             project_id, projects.name AS project_name, projects.icon AS project_icon,
             projects.archived AS project_archived,
             CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
                  WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
             COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
             COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
             COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
      FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id
      LEFT JOIN projects parent ON parent.id = projects.parent_id
      LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id
      WHERE sessions.user_id = ? AND sessions.ended_at IS NULL
    `,
    args: [userId],
  });
  return result.rows[0] ?? null;
}

function uniqueActiveError(value: unknown) {
  return value instanceof Error && "code" in value &&
    (value as { code?: string }).code === "SQLITE_CONSTRAINT" &&
    value.message.includes("sessions.user_id");
}

async function authRoutes(request: NextRequest, parts: string[]) {
  const action = parts[1];
  if (action === "register" && request.method === "POST") {
    const data = await body(request);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const password = data.password;
    if (!email || typeof password !== "string" || password.length < 8) {
      return error("Email and a password of at least 8 characters are required");
    }
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE lower(email) = ?", args: [email] });
    if (existing.rows.length) return error("Email already registered", 409);
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.execute({
      sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      args: [email, passwordHash],
    });
    const id = Number(result.lastInsertRowid);
    const response = NextResponse.json({
      id, email, name: null, avatar: null, shareSessionDescriptions: false, autoStartNoise: false,
      focusAudioType: "speech-blocker",
      defaultSessionType: "learning",
    }, { status: 201 });
    response.cookies.set("token", createToken(id), COOKIE_OPTIONS);
    return response;
  }
  if (action === "login" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.email !== "string" || typeof data.password !== "string") return error("Email and password are required");
    const result = await db.execute({
      sql: "SELECT id, email, password_hash, name, avatar, share_session_descriptions, auto_start_noise, focus_audio_type, default_session_type FROM users WHERE lower(email) = ?",
      args: [data.email.trim().toLowerCase()],
    });
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(data.password, user.password_hash as string))) return error("Invalid email or password", 401);
    const response = NextResponse.json({
      id: Number(user.id), email: user.email, name: user.name, avatar: user.avatar,
      shareSessionDescriptions: Boolean(user.share_session_descriptions),
      autoStartNoise: Boolean(user.auto_start_noise),
      focusAudioType: user.focus_audio_type ?? "speech-blocker",
      defaultSessionType: user.default_session_type ?? "learning",
    });
    response.cookies.set("token", createToken(Number(user.id)), COOKIE_OPTIONS);
    return response;
  }
  if (action === "logout" && request.method === "POST") {
    const response = noContent();
    response.cookies.set("token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return response;
  }

  const userId = getUserId(request);
  if (!userId) return unauthorized();
  if (action === "me" && request.method === "GET") {
    const result = await db.execute({
      sql: "SELECT id, email, name, avatar, share_session_descriptions, auto_start_noise, focus_audio_type, default_session_type FROM users WHERE id = ?",
      args: [userId],
    });
    const user = result.rows[0];
    if (!user) return error("User not found", 404);
    return NextResponse.json({
      id: Number(user.id), email: user.email, name: user.name, avatar: user.avatar,
      shareSessionDescriptions: Boolean(user.share_session_descriptions),
      autoStartNoise: Boolean(user.auto_start_noise),
      focusAudioType: user.focus_audio_type ?? "speech-blocker",
      defaultSessionType: user.default_session_type ?? "learning",
    });
  }
  if (action === "me" && request.method === "PATCH") {
    const data = await body(request);
    await db.execute({
      sql: "UPDATE users SET name = ?, avatar = ? WHERE id = ?",
      args: [data.name ?? null, data.avatar ?? null, userId],
    });
    return NextResponse.json({ name: data.name ?? null, avatar: data.avatar ?? null });
  }
  if (action === "privacy" && request.method === "PATCH") {
    const data = await body(request);
    if (typeof data.shareSessionDescriptions !== "boolean") return error("shareSessionDescriptions must be a boolean");
    await db.execute({
      sql: "UPDATE users SET share_session_descriptions = ? WHERE id = ?",
      args: [data.shareSessionDescriptions ? 1 : 0, userId],
    });
    return NextResponse.json({ shareSessionDescriptions: data.shareSessionDescriptions });
  }
  if (action === "audio-settings" && request.method === "PATCH") {
    const data = await body(request);
    if (data.autoStartNoise !== undefined && typeof data.autoStartNoise !== "boolean") {
      return error("autoStartNoise must be a boolean");
    }
    if (data.focusAudioType !== undefined && !FOCUS_AUDIO_TYPES.has(data.focusAudioType)) {
      return error("Invalid focus audio type");
    }
    if (data.autoStartNoise === undefined && data.focusAudioType === undefined) {
      return error("At least one audio setting is required");
    }
    await db.execute({
      sql: `UPDATE users
            SET auto_start_noise = COALESCE(?, auto_start_noise),
                focus_audio_type = COALESCE(?, focus_audio_type)
            WHERE id = ?`,
      args: [
        data.autoStartNoise === undefined ? null : data.autoStartNoise ? 1 : 0,
        data.focusAudioType ?? null,
        userId,
      ],
    });
    const result = await db.execute({
      sql: "SELECT auto_start_noise, focus_audio_type FROM users WHERE id = ?",
      args: [userId],
    });
    return NextResponse.json({
      autoStartNoise: Boolean(result.rows[0].auto_start_noise),
      focusAudioType: result.rows[0].focus_audio_type,
    });
  }
  if (action === "session-settings" && request.method === "PATCH") {
    const data = await body(request);
    if (data.defaultSessionType !== "learning" && data.defaultSessionType !== "producing") {
      return error("defaultSessionType must be learning or producing");
    }
    await db.execute({
      sql: "UPDATE users SET default_session_type = ? WHERE id = ?",
      args: [data.defaultSessionType, userId],
    });
    return NextResponse.json({ defaultSessionType: data.defaultSessionType });
  }
  if (action === "change-password" && request.method === "POST") {
    const data = await body(request);
    if (typeof data.currentPassword !== "string" || typeof data.newPassword !== "string" || data.newPassword.length < 8) {
      return error("Current password and a new password of at least 8 characters are required");
    }
    const result = await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] });
    if (!result.rows[0] || !(await bcrypt.compare(data.currentPassword, result.rows[0].password_hash as string))) {
      return error("Current password is incorrect", 401);
    }
    await db.execute({
      sql: "UPDATE users SET password_hash = ? WHERE id = ?",
      args: [await bcrypt.hash(data.newPassword, 10), userId],
    });
    return noContent();
  }
  return error("Not found", 404);
}

async function sessionRoutes(request: NextRequest, parts: string[], userId: number) {
  const action = parts[1];
  if (action === "active" && request.method === "GET") return NextResponse.json(await activeSession(userId));
  if (action === "start" && request.method === "POST") {
    const data = await body(request);
    const startedAt = new Date().toISOString();
    try {
      const result = await db.execute({
        sql: "INSERT INTO sessions (user_id, started_at, description, project_id) VALUES (?, ?, ?, ?)",
        args: [userId, startedAt, data.description ?? null, data.projectId ?? null],
      });
      return NextResponse.json({ id: Number(result.lastInsertRowid), startedAt }, { status: 201 });
    } catch (caught) {
      if (!uniqueActiveError(caught)) throw caught;
      return NextResponse.json({ error: "A session is already in progress", session: await activeSession(userId) }, { status: 409 });
    }
  }
  if (!action && request.method === "GET") {
    const requestedLimit = request.nextUrl.searchParams.get("limit");
    const limit = requestedLimit ? Number(requestedLimit) : null;
    if (requestedLimit && (!Number.isInteger(limit) || limit! < 1 || limit! > 100)) {
      return error("limit must be an integer between 1 and 100");
    }
    const cursorParam = request.nextUrl.searchParams.get("cursor");
    const cursor = parseSessionCursor(cursorParam);
    if (cursorParam && !cursor) return error("Invalid session cursor");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if ((from && Number.isNaN(new Date(from).getTime())) || (to && Number.isNaN(new Date(to).getTime()))) {
      return error("from and to must be valid dates");
    }
    const cursorClause = cursor
      ? "AND (sessions.started_at < ? OR (sessions.started_at = ? AND sessions.id < ?))"
      : "";
    const rangeClause = `${from ? "AND sessions.started_at >= ?" : ""} ${to ? "AND sessions.started_at < ?" : ""}`;
    const args: (string | number)[] = [userId];
    if (from) args.push(new Date(from).toISOString());
    if (to) args.push(new Date(to).toISOString());
    if (cursor) args.push(cursor[0], cursor[0], cursor[1]);
    if (limit !== null) args.push(limit + 1);
    const result = await db.execute({
      sql: `
        SELECT sessions.id, sessions.started_at, sessions.ended_at,
               sessions.duration_seconds, sessions.description, sessions.production_percentage,
               project_id, projects.name AS project_name, projects.icon AS project_icon,
               projects.archived AS project_archived,
               CASE WHEN grandparent.id IS NOT NULL THEN grandparent.name || ' / ' || parent.name || ' / ' || projects.name
                    WHEN parent.id IS NOT NULL THEN parent.name || ' / ' || projects.name ELSE projects.name END AS project_path,
               COALESCE(grandparent.id, parent.id, projects.id) AS root_project_id,
               COALESCE(grandparent.name, parent.name, projects.name) AS root_project_name,
               COALESCE(grandparent.icon, parent.icon, projects.icon) AS root_project_icon
        FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id
        LEFT JOIN projects parent ON parent.id = projects.parent_id
        LEFT JOIN projects grandparent ON grandparent.id = parent.parent_id
        WHERE sessions.user_id = ? ${rangeClause} ${cursorClause}
        ORDER BY sessions.started_at DESC, sessions.id DESC
        ${limit !== null ? "LIMIT ?" : ""}
      `,
      args,
    });
    if (limit !== null) {
      const hasMore = result.rows.length > limit;
      const items = result.rows.slice(0, limit);
      const last = items.at(-1);
      return NextResponse.json({
        items,
        nextCursor:
          hasMore && last
            ? sessionCursor(last.started_at as string, Number(last.id))
            : null,
      });
    }
    return NextResponse.json(result.rows);
  }
  if (!action && request.method === "POST") {
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    if (typeof data.startedAt !== "string" || typeof data.endedAt !== "string") return error("startedAt and endedAt are required");
    const start = new Date(data.startedAt);
    const end = new Date(data.endedAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return error("startedAt and endedAt must be valid dates");
    if (end <= start) return error("endedAt must be after startedAt");
    const durationSeconds = Math.round((end.getTime() - start.getTime()) / 1000);
    const result = await db.execute({
      sql: "INSERT INTO sessions (user_id, started_at, ended_at, duration_seconds, description, project_id, production_percentage) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [userId, start.toISOString(), end.toISOString(), durationSeconds, data.description ?? null, data.projectId ?? null, data.productionPercentage ?? null],
    });
    return NextResponse.json({
      id: Number(result.lastInsertRowid), startedAt: start.toISOString(), endedAt: end.toISOString(), durationSeconds,
      productionPercentage: data.productionPercentage ?? null,
    }, { status: 201 });
  }

  const id = Number(action);
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (parts[2] === "stop" && request.method === "PATCH") {
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const existing = await db.execute({
      sql: "SELECT started_at, description FROM sessions WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    if (!existing.rows[0]) return error("Session not found", 404);
    const endedAt = new Date();
    const durationSeconds = Math.round((endedAt.getTime() - new Date(existing.rows[0].started_at as string).getTime()) / 1000);
    const description =
      data.description !== undefined ? data.description : existing.rows[0].description;
    await db.execute({
      sql: "UPDATE sessions SET ended_at = ?, duration_seconds = ?, description = ?, production_percentage = ? WHERE id = ? AND user_id = ?",
      args: [endedAt.toISOString(), durationSeconds, description ?? null, data.productionPercentage ?? null, id, userId],
    });
    return NextResponse.json({
      id,
      endedAt: endedAt.toISOString(),
      durationSeconds,
      description: description ?? null,
      productionPercentage: data.productionPercentage ?? null,
    });
  }
  if (request.method === "DELETE") {
    const result = await db.execute({ sql: "DELETE FROM sessions WHERE id = ? AND user_id = ?", args: [id, userId] });
    return result.rowsAffected ? noContent() : error("Session not found", 404);
  }
  if (request.method === "PATCH") {
    const data = await body(request);
    const allocationError = productionPercentageError(data.productionPercentage);
    if (allocationError) return allocationError;
    const existing = await db.execute({
      sql: "SELECT started_at, ended_at, description, project_id, production_percentage FROM sessions WHERE id = ? AND user_id = ?",
      args: [id, userId],
    });
    const session = existing.rows[0];
    if (!session) return error("Session not found", 404);
    const start = new Date(data.startedAt ?? session.started_at as string);
    const wasActive = session.ended_at === null;
    const end = data.endedAt !== undefined ? new Date(data.endedAt) : wasActive ? null : new Date(session.ended_at as string);
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return error("startedAt and endedAt must be valid dates");
    if (wasActive && start.getTime() > Date.now()) return error("startedAt cannot be in the future");
    if (end && end <= start) return error("endedAt must be after startedAt");
    const durationSeconds = end ? Math.round((end.getTime() - start.getTime()) / 1000) : null;
    const description = data.description !== undefined ? data.description : session.description;
    const projectId = data.projectId !== undefined ? data.projectId : session.project_id;
    const productionPercentage = data.productionPercentage !== undefined
      ? data.productionPercentage
      : session.production_percentage;
    await db.execute({
      sql: "UPDATE sessions SET description = ?, project_id = ?, started_at = ?, ended_at = ?, duration_seconds = ?, production_percentage = ? WHERE id = ? AND user_id = ?",
      args: [description ?? null, projectId ?? null, start.toISOString(), end?.toISOString() ?? null, durationSeconds, productionPercentage ?? null, id, userId],
    });
    return NextResponse.json({
      id, description: description ?? null, projectId: projectId ?? null,
      startedAt: start.toISOString(), endedAt: end?.toISOString() ?? null, durationSeconds,
      productionPercentage: productionPercentage ?? null,
    });
  }
  return error("Not found", 404);
}

type ProjectRow = {
  id: number; name: string; icon: string | null; description: string | null;
  parent_id: number | null; pinned: number; archived: number; last_used_at: string | null;
};

async function userProjects(userId: number) {
  const result = await db.execute({
    sql: `SELECT projects.id, projects.name, projects.icon, projects.description,
                 projects.parent_id, projects.pinned, projects.archived,
                 MAX(sessions.started_at) AS last_used_at
          FROM projects LEFT JOIN sessions ON sessions.project_id = projects.id
          WHERE projects.user_id = ?
          GROUP BY projects.id`,
    args: [userId],
  });
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    pinned: Number(row.pinned),
    archived: Number(row.archived),
  })) as unknown as ProjectRow[];
}

function decorateProjects(rows: ProjectRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathFor = (row: ProjectRow) => {
    const names = [row.name];
    let parentId = row.parent_id;
    const seen = new Set([row.id]);
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return names;
  };
  return rows.map((row) => {
    const names = pathFor(row);
    return {
      id: row.id, name: row.name, icon: row.icon, description: row.description,
      parentId: row.parent_id, pinned: Boolean(row.pinned), archived: Boolean(row.archived),
      path: names.join(" / "), depth: names.length, lastUsedAt: row.last_used_at,
    };
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) ||
    (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.path.localeCompare(b.path));
}

function validateProjectParent(rows: ProjectRow[], id: number | null, parentId: number | null) {
  if (parentId === null) return null;
  if (parentId === id) return "A project cannot be its own parent";
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!byId.has(parentId)) return "Parent project not found";
  let depth = 1;
  let cursor: number | null = parentId;
  const ancestors = new Set<number>();
  while (cursor !== null) {
    if (cursor === id) return "A project cannot be moved below its descendant";
    if (ancestors.has(cursor)) return "Project hierarchy contains a cycle";
    ancestors.add(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
    depth += 1;
  }
  const descendants = (projectId: number): number =>
    1 + Math.max(0, ...rows.filter((row) => row.parent_id === projectId).map((row) => descendants(row.id)));
  const subtreeDepth = id === null ? 1 : descendants(id);
  return depth - 1 + subtreeDepth > 3 ? "Projects can be nested to a maximum of three levels" : null;
}

async function projectRoutes(request: NextRequest, parts: string[], userId: number) {
  const id = parts[1] ? Number(parts[1]) : null;
  if (id === null && request.method === "GET") {
    return NextResponse.json(decorateProjects(await userProjects(userId)));
  }
  if (id === null && request.method === "POST") {
    const data = await body(request);
    if (typeof data.name !== "string" || !data.name.trim()) return error("Name is required");
    const parentId = data.parentId == null ? null : Number(data.parentId);
    const rows = await userProjects(userId);
    const parentError = validateProjectParent(rows, null, parentId);
    if (parentError) return error(parentError);
    const description = typeof data.description === "string" ? data.description.trim() || null : null;
    const result = await db.execute({
      sql: "INSERT INTO projects (user_id, name, icon, description, parent_id, pinned) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, data.name.trim(), data.icon ?? null, description, parentId, data.pinned ? 1 : 0],
    });
    const projects = decorateProjects(await userProjects(userId));
    return NextResponse.json(projects.find((project) => project.id === Number(result.lastInsertRowid)), { status: 201 });
  }
  if (!Number.isInteger(id)) return error("Not found", 404);
  if (request.method === "PATCH") {
    const data = await body(request);
    const rows = await userProjects(userId);
    const existing = rows.find((row) => row.id === id);
    if (!existing) return error("Project not found", 404);
    const parentId = data.parentId !== undefined
      ? (data.parentId === null ? null : Number(data.parentId))
      : existing.parent_id;
    const parentError = validateProjectParent(rows, id, parentId);
    if (parentError) return error(parentError);
    const name = data.name !== undefined ? (typeof data.name === "string" ? data.name.trim() : "") : existing.name;
    if (!name) return error("Name is required");
    const description = data.description !== undefined
      ? (typeof data.description === "string" ? data.description.trim() || null : null)
      : existing.description;
    const archived = data.archived !== undefined ? Boolean(data.archived) : Boolean(existing.archived);
    const result = await db.execute({
      sql: "UPDATE projects SET name = ?, icon = ?, description = ?, parent_id = ?, pinned = ?, archived = ? WHERE id = ? AND user_id = ?",
      args: [name, data.icon !== undefined ? data.icon : existing.icon, description, parentId,
        data.pinned !== undefined ? (data.pinned ? 1 : 0) : existing.pinned,
        archived ? 1 : 0, id!, userId],
    });
    if (!result.rowsAffected) return error("Project not found", 404);
    if (data.archived !== undefined) {
      const descendants = new Set<number>([id!]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if (row.parent_id !== null && descendants.has(row.parent_id) && !descendants.has(row.id)) {
          descendants.add(row.id); changed = true;
        }
      }
      for (const descendantId of descendants) {
        await db.execute({ sql: "UPDATE projects SET archived = ? WHERE id = ? AND user_id = ?", args: [archived ? 1 : 0, descendantId, userId] });
      }
    }
    return NextResponse.json(decorateProjects(await userProjects(userId)).find((project) => project.id === id));
  }
  if (request.method === "DELETE") {
    await db.execute({
      sql: "UPDATE sessions SET project_id = NULL WHERE project_id = ? AND user_id = ?",
      args: [id!, userId],
    });
    const result = await db.execute({
      sql: "DELETE FROM projects WHERE id = ? AND user_id = ?",
      args: [id!, userId],
    });
    return result.rowsAffected ? noContent() : error("Project not found", 404);
  }
  return error("Not found", 404);
}

async function noteRoutes(request: NextRequest, parts: string[], userId: number) {
  if (!parts[1] && request.method === "GET") {
    const result = await db.execute({
      sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ?",
      args: [userId],
    });
    return NextResponse.json(result.rows);
  }
  const scope = parts[1];
  const dateKey = parts[2];
  if ((scope !== "day" && scope !== "week") || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "")) return error("Invalid note scope or date");
  if (request.method === "DELETE") {
    await db.execute({
      sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
      args: [userId, scope, dateKey],
    });
    return noContent();
  }
  if (request.method === "PUT") {
    const data = await body(request);
    if (typeof data.content !== "string") return error("content is required");
    const content = data.content.trim();
    if (!content) {
      await db.execute({
        sql: "DELETE FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
        args: [userId, scope, dateKey],
      });
      return noContent();
    }
    const updatedAt = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO notes (user_id, scope, date_key, content, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id, scope, date_key)
            DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      args: [userId, scope, dateKey, content, updatedAt],
    });
    const result = await db.execute({
      sql: "SELECT id, scope, date_key, content, updated_at FROM notes WHERE user_id = ? AND scope = ? AND date_key = ?",
      args: [userId, scope, dateKey],
    });
    return NextResponse.json(result.rows[0]);
  }
  return error("Not found", 404);
}

function socialUser(row: Record<string, unknown>) {
  return { id: Number(row.user_id), name: row.name ?? null, email: row.email, avatar: row.avatar ?? null };
}

async function socialRoutes(request: NextRequest, parts: string[], userId: number) {
  const section = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;
  if (section === "connections" && id === null && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT f.id, f.status, f.requester_id, f.addressee_id,
                   u.id AS user_id, u.name, u.email, u.avatar
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
            WHERE f.requester_id = ? OR f.addressee_id = ?
            ORDER BY f.created_at DESC`,
      args: [userId, userId, userId],
    });
    return NextResponse.json(result.rows.map((row) => ({
      friendshipId: Number(row.id), status: row.status,
      direction: row.status === "accepted" ? "friend" : Number(row.requester_id) === userId ? "outgoing" : "incoming",
      user: socialUser(row),
    })));
  }
  if (section === "requests" && id === null && request.method === "POST") {
    const data = await body(request);
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!email) return error("Email is required");
    const found = await db.execute({
      sql: "SELECT id, name, email, avatar FROM users WHERE lower(email) = ?",
      args: [email],
    });
    const target = found.rows[0];
    if (!target) return error("No Sentinel user has that email", 404);
    const targetId = Number(target.id);
    if (targetId === userId) return error("You cannot send a friend request to yourself");
    const existing = await db.execute({
      sql: `SELECT id, status, requester_id FROM friendships
            WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      args: [userId, targetId, targetId, userId],
    });
    const connection = existing.rows[0];
    if (connection?.status === "accepted") return error("You are already friends", 409);
    if (connection && Number(connection.requester_id) === targetId) {
      await db.execute({
        sql: "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?",
        args: [connection.id],
      });
      return NextResponse.json({
        friendshipId: Number(connection.id), status: "accepted", direction: "friend",
        user: { id: targetId, name: target.name, email: target.email, avatar: target.avatar },
      });
    }
    if (connection) return error("Friend request already sent", 409);
    const result = await db.execute({
      sql: "INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)",
      args: [userId, targetId],
    });
    return NextResponse.json({
      friendshipId: Number(result.lastInsertRowid), status: "pending", direction: "outgoing",
      user: { id: targetId, name: target.name, email: target.email, avatar: target.avatar },
    }, { status: 201 });
  }
  if (section === "requests" && id !== null && request.method === "PATCH") {
    const data = await body(request);
    if (data.action !== "accept" && data.action !== "decline") return error("Action must be accept or decline");
    const found = await db.execute({
      sql: "SELECT id FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'",
      args: [id, userId],
    });
    if (!found.rows[0]) return error("Friend request not found", 404);
    if (data.action === "accept") {
      await db.execute({
        sql: "UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?",
        args: [id],
      });
    } else await db.execute({ sql: "DELETE FROM friendships WHERE id = ?", args: [id] });
    return noContent();
  }
  if (section === "connections" && id !== null && request.method === "DELETE") {
    const result = await db.execute({
      sql: "DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)",
      args: [id, userId, userId],
    });
    return result.rowsAffected ? noContent() : error("Connection not found", 404);
  }
  if (section === "activity" && request.method === "GET") {
    const result = await db.execute({
      sql: `SELECT s.id, s.user_id, s.started_at, s.ended_at, s.duration_seconds,
                   CASE WHEN u.share_session_descriptions = 1 THEN s.description ELSE NULL END AS description,
                   p.name AS project_name, p.icon AS project_icon,
                   u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
            JOIN sessions s ON s.user_id = u.id LEFT JOIN projects p ON p.id = s.project_id
            WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
            ORDER BY (s.ended_at IS NULL) DESC, s.started_at DESC LIMIT 100`,
      args: [userId, userId, userId],
    });
    return NextResponse.json(result.rows);
  }
  return error("Not found", 404);
}

async function handle(request: NextRequest, context: Context) {
  await ensureDb();
  const { path } = await context.params;
  if (path[0] === "health") return NextResponse.json({ ok: true });
  if (path[0] === "auth") return authRoutes(request, path);
  const userId = getUserId(request);
  if (!userId) return unauthorized();
  if (path[0] === "sessions") return sessionRoutes(request, path, userId);
  if (path[0] === "projects") return projectRoutes(request, path, userId);
  if (path[0] === "notes") return noteRoutes(request, path, userId);
  if (path[0] === "social") return socialRoutes(request, path, userId);
  return error("Not found", 404);
}

async function safely(request: NextRequest, context: Context) {
  try {
    const response = await handle(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (caught) {
    console.error(caught);
    return error("Internal server error", 500);
  }
}

export const GET = safely;
export const POST = safely;
export const PUT = safely;
export const PATCH = safely;
export const DELETE = safely;
