export type DragAxis = "horizontal" | "vertical";

export interface AxisMouseStartEvent {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface AxisMouseMoveEvent {
  clientX: number;
  clientY: number;
}

export interface AxisMouseDragEnvironment {
  addEventListener: (type: "mousemove" | "mouseup", listener: (event: AxisMouseMoveEvent) => void) => void;
  removeEventListener: (type: "mousemove" | "mouseup", listener: (event: AxisMouseMoveEvent) => void) => void;
}

interface BeginAxisMouseDragOptions {
  axis: DragAxis;
  startEvent: AxisMouseStartEvent;
  environment?: AxisMouseDragEnvironment;
  onDelta: (deltaPx: number) => void;
  onEnd?: () => void;
}

export function beginAxisMouseDrag({
  axis,
  startEvent,
  environment = window,
  onDelta,
  onEnd,
}: BeginAxisMouseDragOptions): void {
  startEvent.preventDefault();
  startEvent.stopPropagation();

  let lastCoordinate = axis === "horizontal" ? startEvent.clientX : startEvent.clientY;
  const handleMouseMove = (event: AxisMouseMoveEvent) => {
    const nextCoordinate = axis === "horizontal" ? event.clientX : event.clientY;
    const deltaPx = nextCoordinate - lastCoordinate;
    lastCoordinate = nextCoordinate;
    if (deltaPx !== 0) {
      onDelta(deltaPx);
    }
  };

  const stopDrag = () => {
    environment.removeEventListener("mousemove", handleMouseMove);
    environment.removeEventListener("mouseup", stopDrag);
    onEnd?.();
  };

  environment.addEventListener("mousemove", handleMouseMove);
  environment.addEventListener("mouseup", stopDrag);
}
