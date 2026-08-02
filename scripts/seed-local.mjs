import path from "node:path";
import bcrypt from "bcrypt";
import { createClient } from "@libsql/client";

const DEMO_EMAIL = "really_hardworking_man@yesvus.com";
const DEMO_PASSWORD = "IWorkTooMuch123";
const databasePath = path.resolve(process.cwd(), "local.db");
const workspacePath = `${path.resolve(process.cwd())}${path.sep}`;

if (!databasePath.startsWith(workspacePath)) {
  throw new Error("Local seed target must stay inside the project workspace");
}

const db = createClient({ url: `file:${databasePath}` });

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const weekday = next.getDay();
  next.setDate(next.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return next;
}

function localTime(day, time) {
  return new Date(`${day}T${time}:00`).toISOString();
}

async function ensureProject(userId, details) {
  const existing = await db.execute({
    sql: "SELECT id FROM projects WHERE user_id = ? AND name = ? AND parent_id IS ? LIMIT 1",
    args: [userId, details.name, details.parentId],
  });
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    await db.execute({
      sql: "UPDATE projects SET icon = ?, description = ?, resources = ?, pinned = ?, archived = 0 WHERE id = ?",
      args: [details.icon, details.description, details.resources ?? null, details.pinned ? 1 : 0, id],
    });
    return id;
  }
  const inserted = await db.execute({
    sql: "INSERT INTO projects (user_id, name, icon, description, resources, parent_id, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [userId, details.name, details.icon, details.description, details.resources ?? null, details.parentId, details.pinned ? 1 : 0],
  });
  return Number(inserted.lastInsertRowid);
}

async function ensureTask(userId, details) {
  const existing = await db.execute({
    sql: "SELECT id FROM tasks WHERE user_id = ? AND title = ? LIMIT 1",
    args: [userId, details.title],
  });
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    await db.execute({
      sql: "UPDATE tasks SET period_start = ?, project_id = ?, description = ?, completed_at = ? WHERE id = ?",
      args: [details.periodStart, details.projectId, details.description ?? null, details.completedAt, id],
    });
    return id;
  }
  const inserted = await db.execute({
    sql: "INSERT INTO tasks (user_id, period_start, project_id, title, description, completed_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [userId, details.periodStart, details.projectId, details.title, details.description ?? null, details.completedAt],
  });
  return Number(inserted.lastInsertRowid);
}

async function ensureSession(userId, details) {
  const existing = await db.execute({
    sql: "SELECT id FROM sessions WHERE user_id = ? AND description = ? LIMIT 1",
    args: [userId, details.description],
  });
  const durationSeconds = Math.round(
    (new Date(details.endedAt).getTime() - new Date(details.startedAt).getTime()) / 1000,
  );
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    await db.execute({
      sql: "UPDATE sessions SET started_at = ?, ended_at = ?, duration_seconds = ?, project_id = ?, production_percentage = ? WHERE id = ?",
      args: [details.startedAt, details.endedAt, durationSeconds, details.projectId, details.productionPercentage, id],
    });
    return id;
  }
  const inserted = await db.execute({
    sql: `INSERT INTO sessions
          (user_id, started_at, ended_at, duration_seconds, description, project_id, production_percentage)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      details.startedAt,
      details.endedAt,
      durationSeconds,
      details.description,
      details.projectId,
      details.productionPercentage,
    ],
  });
  return Number(inserted.lastInsertRowid);
}

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const existingUser = await db.execute({
    sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
    args: [DEMO_EMAIL],
  });
  let userId;
  if (existingUser.rows[0]) {
    userId = Number(existingUser.rows[0].id);
    await db.execute({
      sql: `UPDATE users SET password_hash = ?, name = ?, plan_context = ?,
            track_production_split = 1 WHERE id = ?`,
      args: [
        passwordHash,
        "Alex Rivera",
        "Building Sentinel into a calm, reliable planning and focus system.",
        userId,
      ],
    });
  } else {
    const inserted = await db.execute({
      sql: `INSERT INTO users (email, password_hash, name, plan_context, track_production_split)
            VALUES (?, ?, ?, ?, 1)`,
      args: [
        DEMO_EMAIL,
        passwordHash,
        "Alex Rivera",
        "Building Sentinel into a calm, reliable planning and focus system.",
      ],
    });
    userId = Number(inserted.lastInsertRowid);
  }

  const sentinelProjectId = await ensureProject(userId, {
    name: "Sentinel beta",
    icon: "code",
    description: "Planning, focus, and review workflows for the beta release.",
    resources: "Product brief: https://example.com/sentinel-brief\nRepository: https://github.com/example/sentinel",
    parentId: null,
    pinned: true,
  });
  const researchProjectId = await ensureProject(userId, {
    name: "Product research",
    icon: "book",
    description: "Usability notes and workflow research.",
    resources: "Research index: https://example.com/research",
    parentId: null,
    pinned: false,
  });
  await ensureProject(userId, {
    name: "Calendar experience",
    icon: "palette",
    description: "Week and day planning views, navigation, and activity summaries.",
    resources: "Interaction notes: https://example.com/calendar-notes",
    parentId: sentinelProjectId,
    pinned: true,
  });
  const projectWorkspaceId = await ensureProject(userId, {
    name: "Project workspace",
    icon: "briefcase",
    description: "The project tree, dedicated detail pages, and project backlog workflows.",
    resources: "Drag-and-drop reference: https://dndkit.com/",
    parentId: sentinelProjectId,
    pinned: false,
  });
  await ensureProject(userId, {
    name: "Detail editor",
    icon: "pen",
    description: "Autosaving descriptions, resources, and direct edit entry points.",
    resources: "Design review: https://example.com/project-editor",
    parentId: projectWorkspaceId,
    pinned: false,
  });

  const today = dateKey(new Date());
  const yesterday = dateKey(addDays(new Date(), -1));
  const tomorrow = dateKey(addDays(new Date(), 1));
  const weekStart = dateKey(startOfWeek(new Date()));
  const firstEnd = localTime(today, "07:20");
  const secondEnd = localTime(today, "08:20");
  const thirdEnd = localTime(today, "09:00");

  const routedPageTaskId = await ensureTask(userId, {
    title: "Replace the day planner dialog with a routed page",
    description: "Give each day a durable URL with week-aware navigation back to the planning overview.",
    periodStart: today,
    projectId: sentinelProjectId,
    completedAt: firstEnd,
  });
  const sessionDescriptionTaskId = await ensureTask(userId, {
    title: "Show session descriptions in the planning page",
    description: "Make the work log readable without opening individual sessions.",
    periodStart: today,
    projectId: sentinelProjectId,
    completedAt: secondEnd,
  });
  const headerTaskId = await ensureTask(userId, {
    title: "Anchor date navigation in the app header",
    periodStart: today,
    projectId: sentinelProjectId,
    completedAt: thirdEnd,
  });
  await ensureTask(userId, {
    title: "Review the planning page on a narrow screen",
    description: "Check task actions, long descriptions, and the fixed header at phone width.",
    periodStart: today,
    projectId: sentinelProjectId,
    completedAt: null,
  });
  await ensureTask(userId, {
    title: "Summarize the next round of usability notes",
    periodStart: tomorrow,
    projectId: researchProjectId,
    completedAt: null,
  });
  await ensureTask(userId, {
    title: "Polish breadcrumb transitions",
    description: "Keep the planning hierarchy legible while navigation changes in place.",
    periodStart: null,
    projectId: sentinelProjectId,
    completedAt: null,
  });
  await ensureTask(userId, {
    title: "Compare task recovery patterns",
    periodStart: null,
    projectId: researchProjectId,
    completedAt: null,
  });
  await ensureTask(userId, {
    title: "Add usernames, public profiles, and session reactions",
    description: "Expand the social layer with unique usernames, shareable public profiles, and lightweight reactions on user sessions.",
    periodStart: null,
    projectId: sentinelProjectId,
    completedAt: null,
  });
  await ensureTask(userId, {
    title: "Show current and longest streak on public profiles",
    description: "Bring streak and longest-streak context into the profile experience as the social surface grows.",
    periodStart: null,
    projectId: sentinelProjectId,
    completedAt: null,
  });
  await ensureTask(userId, {
    title: "Unfinished mobile review from yesterday",
    periodStart: yesterday,
    projectId: sentinelProjectId,
    completedAt: null,
  });

  const routeSessionId = await ensureSession(userId, {
    startedAt: localTime(today, "06:30"),
    endedAt: firstEnd,
    description: "Mapped the modal flow into a durable day URL and preserved the selected week in the breadcrumb return path.",
    projectId: sentinelProjectId,
    productionPercentage: 80,
  });
  const descriptionSessionId = await ensureSession(userId, {
    startedAt: localTime(today, "07:35"),
    endedAt: secondEnd,
    description: "Turned the session list into a chronological work log and made descriptions the primary line of each entry.",
    projectId: sentinelProjectId,
    productionPercentage: 70,
  });
  const headerSessionId = await ensureSession(userId, {
    startedAt: localTime(today, "08:30"),
    endedAt: thirdEnd,
    description: "Moved week and day controls into a fixed header zone, separated from Activity, Notifications, and Focus Audio.",
    projectId: sentinelProjectId,
    productionPercentage: 90,
  });

  for (const [sessionId, taskId] of [
    [routeSessionId, routedPageTaskId],
    [descriptionSessionId, sessionDescriptionTaskId],
    [headerSessionId, headerTaskId],
  ]) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO session_tasks (session_id, task_id) VALUES (?, ?)",
      args: [sessionId, taskId],
    });
  }

  for (const note of [
    {
      scope: "day",
      dateKey: today,
      content: "Keep descriptions readable, verify the fixed header controls, and finish with a narrow-screen pass.",
    },
    {
      scope: "week",
      dateKey: weekStart,
      content: "Ship the routed planning workflow and make the relationship between sessions and completed tasks obvious.",
    },
    {
      scope: "long-term",
      dateKey: "long-term",
      content: "Build a planning system that makes the history of real work as useful as the plan itself.",
    },
  ]) {
    await db.execute({
      sql: `INSERT INTO notes (user_id, scope, date_key, content)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id, scope, date_key)
            DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
      args: [userId, note.scope, note.dateKey, note.content],
    });
  }

  console.log(`Seeded local.db for ${DEMO_EMAIL}`);
  console.log(`Open http://localhost:3000/demo-login, then /app/plan/${today}`);
}

try {
  await seed();
} finally {
  db.close();
}
