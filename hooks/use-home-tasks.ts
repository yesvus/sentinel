import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { sessions, type Task } from "@/lib/api";
import { removeTask, upsertTask } from "@/lib/task-collections";
import { setTaskCompletion, taskMutations } from "@/lib/task-mutations";

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
  const [sessionTaskIds, setSessionTaskIds] = useState<number[]>([]);
  const [recentTaskIds, setRecentTaskIds] = useState<number[]>([]);
  const [deletingTaskIds, setDeletingTaskIds] = useState<number[]>([]);
  const previousRunningRef = useRef(isRunning);

  useEffect(() => {
    const sessionWasRunning = previousRunningRef.current;
    previousRunningRef.current = isRunning;
    const timer = window.setTimeout(() => {
      if (isRunning && !sessionWasRunning) {
        setSelectedTaskIds([]);
        setSessionTaskIds([]);
      } else if (!isRunning && sessionWasRunning) {
        setSessionTaskIds([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isRunning]);

  useEffect(() => {
    if (activeSessionId === null) return;
    let cancelled = false;
    sessions.tasks(activeSessionId).then((items) => {
      if (!cancelled) setSessionTaskIds(items.map((task) => task.id));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeSessionId]);

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

  function taskCreated(created: Task) {
    setTaskList((list) => upsertTask(list, created));
    setRecentTaskIds((ids) => [...ids, created.id]);
    if (isRunning) setSessionTaskIds((ids) => ids.includes(created.id) ? ids : [...ids, created.id]);
    else setSelectedTaskIds((ids) => [...ids, created.id]);
    window.setTimeout(() => setRecentTaskIds((ids) => ids.filter((id) => id !== created.id)), 500);
  }

  function taskUpdated(updated: Task) {
    setTaskList((list) => upsertTask(list, updated));
    if (updated.completed_at === null && updated.period_start === null) {
      setSessionTaskIds((ids) => ids.filter((id) => id !== updated.id));
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
      setSessionTaskIds((ids) => ids.filter((id) => id !== task.id));
    } catch {
      onError("Could not delete this task.");
    } finally {
      setDeletingTaskIds((ids) => ids.filter((id) => id !== task.id));
    }
  }

  return {
    selectedTaskIds,
    sessionTaskIds,
    recentTaskIds,
    deletingTaskIds,
    clearSelectedTasks: () => setSelectedTaskIds([]),
    clearSessionTasks: () => setSessionTaskIds([]),
    selectProject,
    selectTask,
    taskCreated,
    taskUpdated,
    toggleTask,
    deleteTask,
  };
}
