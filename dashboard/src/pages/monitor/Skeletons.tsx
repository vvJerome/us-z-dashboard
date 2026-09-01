import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { card } from "./Panels";

// Placeholders below mirror each real panel's own card()/sectionTitle
// structure (same wrapper, same col-span, same chart/row heights) so the
// loading state is pixel-close to the loaded one - swapping one for the
// other doesn't reflow anything, unlike a generic "N bars" skeleton would.
function StateSkeleton() {
  return card(
    <>
      <Skeleton className="mb-2 h-3.5 w-28" />
      <div className="grid grid-cols-2 gap-y-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Fragment key={i}>
            <div className="flex h-6 items-center">
              <Skeleton className="h-3.5 w-24" />
            </div>
            <div className="flex h-6 items-center justify-end">
              <Skeleton className="h-3.5 w-10" />
            </div>
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex h-5 items-center justify-between border-t pt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </>,
    "col-span-12 md:col-span-4",
  );
}

function ThroughputSkeleton() {
  return card(
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-[85px] w-full" />
      <div className="mt-2 grid grid-cols-4 gap-3 border-t pt-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>,
    "col-span-12 md:col-span-5",
  );
}

function PipelineHealthSkeleton() {
  return card(
    <>
      <Skeleton className="mb-2 h-3.5 w-28" />
      <div className="space-y-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-12" />
          </div>
        ))}
      </div>
    </>,
    "col-span-12 md:col-span-3",
  );
}

function SmtpSkeleton() {
  return card(
    <>
      <Skeleton className="mb-2 h-3.5 w-40" />
      <Skeleton className="mb-1.5 h-3 w-36" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex h-5 items-center justify-between gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-8" />
          </div>
        ))}
      </div>
    </>,
    "col-span-12 lg:col-span-4",
  );
}

function CostSkeleton() {
  return card(
    <div className="flex flex-col">
      <Skeleton className="mb-2 h-3.5 w-14" />
      <div className="flex h-10 items-center">
        <Skeleton className="h-7 w-20" />
      </div>
      <Skeleton className="mt-2 h-2 w-full" />
      <div className="mt-1 flex h-4 items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="mt-2 space-y-1 border-t pt-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex h-4 items-center justify-between">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-auto flex h-4 items-center justify-between pt-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>,
    "col-span-12 lg:col-span-3",
  );
}

function DiscoverySkeleton() {
  return card(
    <div className="flex flex-col">
      <Skeleton className="mb-2 h-3.5 w-36" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
      <div className="mt-auto pt-3">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="mt-1.5 h-3 w-40" />
      </div>
    </div>,
    "col-span-12 lg:col-span-5",
  );
}

// These three mirror CollapsibleCard's trigger row only (title + subtitle +
// a chevron-shaped placeholder), not the chart/table body below it - the
// real cards default to collapsed now, so that row is the entire visible
// shape until someone opens one.
function RunHistorySkeleton() {
  return card(
    <div className="mb-2 flex h-5 flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>,
    "col-span-12",
  );
}

function RecentSkeleton() {
  return card(
    <div className="mb-2 flex h-5 items-center justify-between gap-2">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>,
    "col-span-12 lg:col-span-7",
  );
}

function RunEventsSkeleton() {
  return card(
    <div className="mb-2 flex h-5 items-center justify-between gap-2">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>,
    "col-span-12 lg:col-span-7",
  );
}

function ErrorsSkeleton() {
  return card(
    <div className="mb-2 flex h-5 items-center justify-between gap-2">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>,
    "col-span-12 lg:col-span-5",
  );
}

// Matches the real 9-panel grid (../MonitorPage.tsx) exactly, col-span for
// col-span, so swapping this for the real grid once data arrives doesn't
// shift anything on screen.
export function MonitorSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-1.5">
      <StateSkeleton />
      <ThroughputSkeleton />
      <PipelineHealthSkeleton />
      <SmtpSkeleton />
      <CostSkeleton />
      <DiscoverySkeleton />
      <RunHistorySkeleton />
      <RecentSkeleton />
      <RunEventsSkeleton />
      <ErrorsSkeleton />
    </div>
  );
}
