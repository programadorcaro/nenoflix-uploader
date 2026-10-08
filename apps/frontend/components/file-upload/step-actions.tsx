import * as React from "react";
import { Button } from "@/components/ui/button";

interface StepActionsProps {
  /** Secondary action (usually "Voltar"); omitted on the first step. */
  back?: { label?: string; onClick: () => void; disabled?: boolean };
  primary: { label: string; onClick: () => void; disabled?: boolean };
}

/**
 * Step buttons. On mobile they stick to the bottom of the screen so the
 * next action is always one tap away; on desktop they sit right-aligned.
 */
export function StepActions({ back, primary }: StepActionsProps) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-border bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
      <div className={back ? "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 sm:flex sm:justify-end" : "flex sm:justify-end"}>
        {back && (
          <Button
            type="button"
            variant="outline"
            onClick={back.onClick}
            disabled={back.disabled}
            className="h-12 text-base sm:h-11 sm:min-w-28"
          >
            {back.label ?? "Voltar"}
          </Button>
        )}
        <Button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className="h-12 w-full text-base font-semibold sm:h-11 sm:w-auto sm:min-w-44"
        >
          {primary.label}
        </Button>
      </div>
    </div>
  );
}
