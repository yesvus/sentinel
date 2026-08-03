import { Skeleton } from "@/components/ui/skeleton";

export function DayPlanningLoading() {
  return (
    <div className="animate-in fade-in mx-auto flex w-full max-w-6xl flex-col gap-6 duration-300">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.8fr)_minmax(16rem,0.55fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
        <div className="grid gap-4 lg:col-span-2 xl:col-span-1">
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    </div>
  );
}
