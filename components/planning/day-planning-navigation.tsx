import Link from "next/link";
import { History } from "lucide-react";
import { DateRangeNavigator } from "@/components/date-range-navigator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { PageHeaderActions } from "@/lib/page-header-actions-context";
import { formatWeekRangeLabel } from "@/lib/date";

type DayPlanningNavigationProps = {
  selectedDate: Date;
  selectedWeekStart: Date;
  weekHref: string;
  todayKey: string;
  previousDayKey: string;
  nextDayKey: string;
  isToday: boolean;
};

export function DayPlanningNavigation({
  selectedDate,
  selectedWeekStart,
  weekHref,
  todayKey,
  previousDayKey,
  nextDayKey,
  isToday,
}: DayPlanningNavigationProps) {
  const dayLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <PageHeaderActions>
        <DateRangeNavigator
          today={{ href: `/app/calendar/${todayKey}` }}
          todayDisabled={isToday}
          previous={{ href: `/app/calendar/${previousDayKey}` }}
          previousLabel="Previous day"
          next={{ href: `/app/calendar/${nextDayKey}` }}
          nextLabel="Next day"
        >
          <Breadcrumb className="hidden min-w-0 pl-1 md:block">
            <BreadcrumbList className="flex-nowrap gap-1">
              <BreadcrumbItem className="hidden xl:inline-flex">
                <BreadcrumbLink
                  className="max-w-44 truncate whitespace-nowrap"
                  render={<Link href={weekHref} />}
                >
                  {formatWeekRangeLabel(selectedWeekStart)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden xl:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="whitespace-nowrap">{dayLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </DateRangeNavigator>
      </PageHeaderActions>
      <PageHeaderActions align="right">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open session history"
          title="Session history"
          render={<Link href="/app/calendar/history" />}
          nativeButton={false}
        >
          <History />
        </Button>
      </PageHeaderActions>
    </>
  );
}
