import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { sessions, type Task } from "@/lib/api";
import { upsertTask } from "@/lib/task-collections";
import { setAttachedTaskCompletion } from "@/lib/task-mutations";

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
  const [detachingTaskIds, setDetachingTaskIds] = useState<number[]>([]);
  const [optimisticSessionTaskIds, setOptimisticSessionTaskIds] = useState<number[]>([]);
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
    if (activeSessionId < 0) return;
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
  const currentSessionTaskIds = currentSessionTasksResult?.status === "loaded"
    ? currentSessionTasksResult.ids
    : optimisticSessionTaskIds;
  const currentSessionTasksLoadStatus: SessionTasksLoadStatus = activeSessionId === null
    ? "idle"
    : currentSessionTasksResult?.status ?? "loading";

  function selectProject(nextProjectId: number | null) {
    if (!isRunning) setSelectedTaskIds([]);
    void onProjectChange(nextProjectId);
  }

  function selectProjectTasks(nextProjectId: number | null, projectTasks: Task[]) {
    void onProjectChange(nextProjectId);
    const openTaskIds = projectTasks.filter((task) => task.completed_at === null).map((task) => task.id);
    setSelectedTaskIds((current) =>
      openTaskIds.length > 0 && openTaskIds.every((id) => current.includes(id)) ? [] : openTaskIds,
    );
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

  async function detachFromSession(task: Task) {
    if (activeSessionId === null) return;
    setDetachingTaskIds((ids) => [...ids, task.id]);
    try {
      await sessions.detachTask(activeSessionId, task.id);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      setSessionTasksResult((result) => result?.status === "loaded"
        ? { ...result, ids: result.ids.filter((id) => id !== task.id) }
        : result);
    } catch {
      onError("Could not remove this task from the session.");
    } finally {
      setDetachingTaskIds((ids) => ids.filter((id) => id !== task.id));
    }
  }

  async function toggleTask(task: Task) {
    try {
      taskUpdated(await setAttachedTaskCompletion(task));
    } catch {
      onError("Could not update this task.");
    }
  }

  async function detachTask(task: Task) {
    await detachFromSession(task);
  }

  return {
    selectedTaskIds,
    sessionTaskIds: currentSessionTaskIds,
    sessionTasksLoadStatus: currentSessionTasksLoadStatus,
    recentTaskIds,
    detachingTaskIds,
    seedSessionTasks: (ids: number[]) => setOptimisticSessionTaskIds(ids),
    clearOptimisticSessionTasks: () => setOptimisticSessionTaskIds([]),
    clearSelectedTasks: () => setSelectedTaskIds([]),
    clearSessionTasks: () => {
      setSessionTasksResult(null);
      setOptimisticSessionTaskIds([]);
    },
    selectProject,
    selectProjectTasks,
    selectTask,
    retrySessionTasks: () => setSessionTasksRetry((retry) => retry + 1),
    todayTaskCreated,
    activeTaskCreated,
    taskUpdated,
    toggleTask,
    detachTask,
  };
}
