import type { PaneDropEdge } from "../../../domain/layout/types";

const DRAG_START_DISTANCE_PX = 6;
const EDGE_ZONE_RATIO = 0.24;
const GLOBAL_DRAG_CLASS = "pane-dragging";
const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "a[href]",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[data-pane-drag-disabled="true"]',
].join(", ");

export interface PaneHeaderMouseStartEvent {
  button: number;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  preventDefault: () => void;
}

export interface PaneHeaderMouseMoveEvent {
  clientX: number;
  clientY: number;
}

export interface PaneHeaderMouseDragEnvironment {
  addEventListener: (type: "mousemove" | "mouseup", listener: (event: PaneHeaderMouseMoveEvent) => void) => void;
  removeEventListener: (type: "mousemove" | "mouseup", listener: (event: PaneHeaderMouseMoveEvent) => void) => void;
  elementFromPoint: (x: number, y: number) => Element | null;
}

export interface PaneDropTarget {
  targetTabId: string;
  edge: PaneDropEdge;
}

interface BeginPaneHeaderMouseDragOptions {
  sourceTabId: string;
  startEvent: PaneHeaderMouseStartEvent;
  environment?: PaneHeaderMouseDragEnvironment;
  onStart: () => void;
  onTargetChange: (target: PaneDropTarget | null) => void;
  onCommit: (target: PaneDropTarget) => void;
  onCancel: () => void;
}

export function beginPaneHeaderMouseDrag({
  sourceTabId,
  startEvent,
  environment = document,
  onStart,
  onTargetChange,
  onCommit,
  onCancel,
}: BeginPaneHeaderMouseDragOptions): void {
  if (startEvent.button !== 0 || shouldIgnorePaneHeaderDrag(startEvent.target)) {
    return;
  }

  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  let didStart = false;
  let activeTarget: PaneDropTarget | null = null;

  const handleMouseMove = (event: PaneHeaderMouseMoveEvent) => {
    if (!didStart) {
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.hypot(deltaX, deltaY) < DRAG_START_DISTANCE_PX) {
        return;
      }

      didStart = true;
      startEvent.preventDefault();
      setGlobalPaneDragSelectionSuppressed(true);
      onStart();
    }

    const nextTarget = resolvePaneDropTargetAtPoint(environment, sourceTabId, event.clientX, event.clientY);
    if (isSamePaneDropTarget(activeTarget, nextTarget)) {
      return;
    }

    activeTarget = nextTarget;
    onTargetChange(nextTarget);
  };

  const stopDrag = () => {
    environment.removeEventListener("mousemove", handleMouseMove);
    environment.removeEventListener("mouseup", stopDrag);

    if (!didStart) {
      return;
    }

    setGlobalPaneDragSelectionSuppressed(false);

    if (activeTarget) {
      onCommit(activeTarget);
      return;
    }

    onCancel();
  };

  environment.addEventListener("mousemove", handleMouseMove);
  environment.addEventListener("mouseup", stopDrag);
}

function setGlobalPaneDragSelectionSuppressed(active: boolean): void {
  const body = document.body;
  if (!body) {
    return;
  }

  if (active) {
    body.classList.add(GLOBAL_DRAG_CLASS);
    window.getSelection?.()?.removeAllRanges();
    return;
  }

  body.classList.remove(GLOBAL_DRAG_CLASS);
}

function shouldIgnorePaneHeaderDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
}

function resolvePaneDropTargetAtPoint(
  environment: Pick<PaneHeaderMouseDragEnvironment, "elementFromPoint">,
  sourceTabId: string,
  clientX: number,
  clientY: number,
): PaneDropTarget | null {
  const targetElement = environment.elementFromPoint(clientX, clientY);
  if (!(targetElement instanceof Element)) {
    return null;
  }

  const paneElement = targetElement.closest<HTMLElement>("[data-pane-id]");
  const targetTabId = paneElement?.dataset.paneId?.trim() ?? "";
  if (!paneElement || targetTabId.length === 0 || targetTabId === sourceTabId) {
    return null;
  }

  return {
    targetTabId,
    edge: resolvePaneDropEdge(clientX, clientY, paneElement.getBoundingClientRect()),
  };
}

function resolvePaneDropEdge(clientX: number, clientY: number, rect: DOMRect): PaneDropEdge {
  const horizontalZone = rect.width * EDGE_ZONE_RATIO;
  const verticalZone = rect.height * EDGE_ZONE_RATIO;

  if (clientX <= rect.left + horizontalZone) {
    return "left";
  }

  if (clientX >= rect.right - horizontalZone) {
    return "right";
  }

  if (clientY <= rect.top + verticalZone) {
    return "top";
  }

  if (clientY >= rect.bottom - verticalZone) {
    return "bottom";
  }

  const distances: Array<[PaneDropEdge, number]> = [
    ["left", Math.abs(clientX - rect.left)],
    ["right", Math.abs(rect.right - clientX)],
    ["top", Math.abs(clientY - rect.top)],
    ["bottom", Math.abs(rect.bottom - clientY)],
  ];
  distances.sort((left, right) => left[1] - right[1]);
  return distances[0][0];
}

function isSamePaneDropTarget(left: PaneDropTarget | null, right: PaneDropTarget | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.targetTabId === right.targetTabId && left.edge === right.edge;
}
