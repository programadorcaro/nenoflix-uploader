"use client";

import React, { useRef, useEffect } from "react";
import confetti from "canvas-confetti";

export interface ConfettiRef {
  fire: (options?: confetti.Options) => void;
}

interface ConfettiProps {
  className?: string;
  onMouseEnter?: () => void;
}

const ConfettiComponent = React.forwardRef<ConfettiRef, ConfettiProps>(
  ({ className, onMouseEnter }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const confettiInstanceRef = useRef<ReturnType<typeof confetti.create> | null>(null);

    useEffect(() => {
      if (canvasRef.current) {
        confettiInstanceRef.current = confetti.create(canvasRef.current, {
          resize: true,
          useWorker: true,
        });

        // Expose fire method via ref
        if (typeof ref === "object" && ref !== null && "current" in ref) {
          (ref as React.MutableRefObject<ConfettiRef>).current = {
            fire: (options?: confetti.Options) => {
              confettiInstanceRef.current?.(options);
            },
          };
        }
      }
    }, [ref]);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        onMouseEnter={onMouseEnter}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 100,
        }}
      />
    );
  }
);

ConfettiComponent.displayName = "Confetti";

export const Confetti = ConfettiComponent;

