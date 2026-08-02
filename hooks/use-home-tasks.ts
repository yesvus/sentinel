import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { sessions, type Task } from "@/lib/api";
import { removeTask, upsertTask } from "@/lib/task-collections";
import { setTaskCompletion, taskMutations } from "@/lib/task-mutations";

export type SessionTasksLoadStatus = "idle" | "loading" | "loaded" | "error";

type HomeTaskOptions = {
  activeSessionId: number | null;
  isRunning: boolean;
  projectId: number | null;
  setTaskList: Dispatch<SetStateAction<Task[]>>;
  onProjectChange: (projectId: number | null) => void | Promise<void>;
  onError: (message: string) => void;
};

export function useHomeTasks({ activeSessionId, isRunning, projectId, setTaskList, onProjectChange, onError }: HomeTaskOptions) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [sessionTasksResult, setSessionTasksResult] = useState<{
    sessionId: number;
    retry: number;
    ids: number[];
    status: "loaded" | "error";
  } | null>(null);
  const [sessionTasksRetry, setSessionTasksRetry] = useState(0);
  const [recentTaskIds, setRecentTaskIds] = useState<number[]>([]);
  const [deletingTaskIds, setDeletingTaskIds] = useState<number[]>([]);
  const previousRunningRef = useRef(isRunning);

  useEffect(() => {
    const sessionWasRunning = previousRunningRef.current;
    previousRunningRef.current = isRunning;
    const timer = window.setTimeout(() => {
      if (isRunning && !sessionWasRunning) {
        setSelectedTaskIds([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isRunning]);

  useEffect(() => {
    if (activeSessionId === null) return;
    let cancelled = false;
    const sessionId = activeSessionId;
    const retry = sessionTasksRetry;
    sessions.tasks(activeSessionId).then((items) => {
      if (!cancelled) {
        setSessionTasksResult({ sessionId, retry, ids: items.map((task) => task.id), status: "loaded" });
      }
    }).catch(() => {
      if (!cancelled) setSessionTasksResult({ sessionId, retry, ids: [], status: "error" });
    });
    return () => { cancelled = true; };
  }, [activeSessionId, sessionTasksRetry]);

  const currentSessionTasksResult = activeSessionId !== null &&
    sessionTasksResult?.sessionId === activeSessionId &&
    sessionTasksResult.retry === sessionTasksRetry
    ? sessionTasksResult
    : null;
  const currentSessionTaskIds = currentSessionTasksResult?.status === "loaded" ? currentSessionTasksResult.ids : [];
  const currentSessionTasksLoadStatus: SessionTasksLoadStatus = activeSessionId === null
    ? "idle"
    : currentSessionTasksResult?.status ?? "loading";

  function selectProject(nextProjectId: number | null) {
    if (!isRunning) setSelectedTaskIds([]);
    void onProjectChange(nextProjectId);
  }

  function selectTask(task: Task, selected: boolean) {
    if (selected) {
      setSelectedTaskIds((ids) => ids.filter((id) => id !== task.id));
      return;
    }
    const nextProjectId = task.project_id ?? null;
    if (nextProjectId !== projectId) selectProject(nextProjectId);
    if (task.completed_at === null) setSelectedTaskIds((ids) => [...ids, task.id]);
  }

  function markTaskCreated(created: Task) {
    setTaskList((list) => upsertTask(list, created));
    setRecentTaskIds((ids) => [...ids, created.id]);
    window.setTimeout(() => setRecentTaskIds((ids) => ids.filter((id) => id !== created.id)), 500);
  }

  function todayTaskCreated(created: Task) {
    markTaskCreated(created);
    if (!isRunning) setSelectedTaskIds((ids) => ids.includes(created.id) ? ids : [...ids, created.id]);
  }

  function activeTaskCreated(created: Task) {
    markTaskCreated(created);
    setSessionTasksResult((result) => {
      if (!result || result.sessionId !== activeSessionId || result.retry !== sessionTasksRetry || result.status !== "loaded") return result;
      return { ...result, ids: result.ids.includes(created.id) ? result.ids : [...result.ids, created.id] };
    });
  }

  function taskUpdated(updated: Task) {
    setTaskList((list) => upsertTask(list, updated));
    if (updated.completed_at === null && updated.period_start === null) {
      setSessionTasksResult((result) => result?.status === "loaded"
        ? { ...result, ids: result.ids.filter((id) => id !== updated.id) }
        : result);
    }
  }

  async function toggleTask(task: Task) {
    try {
      taskUpdated(await setTaskCompletion(task));
    } catch {
      onError("Could not update this task.");
    }
  }

  async function deleteTask(task: Task) {
    setDeletingTaskIds((ids) => [...ids, task.id]);
    try {
      await taskMutations.remove(task);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setTaskList((list) => removeTask(list, task.id));
      setSelectedTaskIds((ids) => ids.filter((id) => id !== task.id));
      setSessionTasksResult((result) => result?.status === "loaded"
        ? { ...result, ids: result.ids.filter((id) => id !== task.id) }
        : result);
    } catch {
      onError("Could not delete this task.");
    } finally {
      setDeletingTaskIds((ids) => ids.filter((id) => id !== task.id));
    }
  }

  return {
    selectedTaskIds,
    sessionTaskIds: currentSessionTaskIds,
    sessionTasksLoadStatus: currentSessionTasksLoadStatus,
    recentTaskIds,
    deletingTaskIds,
    clearSelectedTasks: () => setSelectedTaskIds([]),
    clearSessionTasks: () => setSessionTasksResult(null),
    selectProject,
    selectTask,
    retrySessionTasks: () => setSessionTasksRetry((retry) => retry + 1),
    todayTaskCreated,
    activeTaskCreated,
    taskUpdated,
    toggleTask,
    deleteTask,
  };
}
