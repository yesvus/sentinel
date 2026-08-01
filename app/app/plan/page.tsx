"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarRange, Clock3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { tasks as tasksApi, notes as notesApi, Task, Note } from "@/lib/api";
import { NoteEditor } from "@/components/note-editor";
import { TaskList } from "@/components/task-list";
import { useAuth } from "@/lib/auth-context";
import { dayKey, weekKey, addDays, startOfWeek, formatWeekRangeLabel } from "@/lib/date";

export default function PlanPage() {
  const { user } = useAuth();
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [noteList, setNoteList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([tasksApi.list(), notesApi.list()])
      .then(([t, n]) => {
        setTaskList(t);
        setNoteList(n);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleTaskCreated(task: Task) {
    setTaskList((list) => [...list, task]);
  }

  function handleTaskUpdated(task: Task) {
    setTaskList((list) => list.map((t) => (t.id === task.id ? task : t)));
  }

  function handleTaskDeleted(id: number) {
    setTaskList((list) => list.filter((t) => t.id !== id));
  }

  function handleNoteSaved(note: Note) {
    setNoteList((list) => [...list.filter((n) => !(n.scope === note.scope && n.date_key === note.date_key)), note]);
  }

  function handleNoteDeleted(scope: "day" | "week", dateKey: string) {
    setNoteList((list) => list.filter((n) => !(n.scope === scope && n.date_key === dateKey)));
  }

  const now = new Date();
  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(addDays(now, 1));
  const thisWeekKey = weekKey(now);
  const weekStart = startOfWeek(now);

  const weekTasks = taskList.filter((t) => t.scope === "week" && t.period_start === thisWeekKey);
  const todayTasks = taskList.filter((t) => t.scope === "day" && t.period_start === todayKey);
  const tomorrowTasks = taskList.filter((t) => t.scope === "day" && t.period_start === tomorrowKey);

  const reminderHour = user?.planReminderHour ?? 19;
  const showReminder = now.getHours() >= reminderHour && tomorrowTasks.length === 0;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {showReminder && (
        <div className="border-primary/30 bg-primary/5 flex items-center gap-2 rounded-md border px-4 py-3 text-sm">
          <Clock3 className="text-primary size-4 shrink-0" />
          It&apos;s after {String(reminderHour).padStart(2, "0")}:00 — want to plan tomorrow?
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <CalendarRange className="text-muted-foreground size-4" />
            This week
            <span className="text-muted-foreground text-xs font-normal">{formatWeekRangeLabel(weekStart)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TaskList
            scope="week"
            periodStart={thisWeekKey}
            tasks={weekTasks}
            onCreated={handleTaskCreated}
            onUpdated={handleTaskUpdated}
            onDeleted={handleTaskDeleted}
          />
          <NoteEditor
            scope="week"
            dateKey={thisWeekKey}
            note={noteList.find((n) => n.scope === "week" && n.date_key === thisWeekKey)}
            label="this week"
            onSaved={handleNoteSaved}
            onDeleted={() => handleNoteDeleted("week", thisWeekKey)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="text-muted-foreground size-4" />
            Today
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TaskList
            scope="day"
            periodStart={todayKey}
            tasks={todayTasks}
            onCreated={handleTaskCreated}
            onUpdated={handleTaskUpdated}
            onDeleted={handleTaskDeleted}
          />
          <NoteEditor
            scope="day"
            dateKey={todayKey}
            note={noteList.find((n) => n.scope === "day" && n.date_key === todayKey)}
            label="today"
            onSaved={handleNoteSaved}
            onDeleted={() => handleNoteDeleted("day", todayKey)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="text-muted-foreground size-4" />
            Tomorrow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TaskList
            scope="day"
            periodStart={tomorrowKey}
            tasks={tomorrowTasks}
            onCreated={handleTaskCreated}
            onUpdated={handleTaskUpdated}
            onDeleted={handleTaskDeleted}
          />
          <NoteEditor
            scope="day"
            dateKey={tomorrowKey}
            note={noteList.find((n) => n.scope === "day" && n.date_key === tomorrowKey)}
            label="tomorrow"
            onSaved={handleNoteSaved}
            onDeleted={() => handleNoteDeleted("day", tomorrowKey)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
