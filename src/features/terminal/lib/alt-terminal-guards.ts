export function installAltTerminalMouseGuards(element: HTMLElement): () => void {
  const documentNode = element.ownerDocument;
  const swallowAltModifiedEvent = (event: MouseEvent | WheelEvent) => {
    if (!event.altKey) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const listenerOptions: AddEventListenerOptions = { capture: true };
  element.addEventListener("mousedown", swallowAltModifiedEvent, listenerOptions);
  documentNode.addEventListener("mousemove", swallowAltModifiedEvent, listenerOptions);
  documentNode.addEventListener("mouseup", swallowAltModifiedEvent, listenerOptions);
  documentNode.addEventListener("wheel", swallowAltModifiedEvent, listenerOptions);

  return () => {
    element.removeEventListener("mousedown", swallowAltModifiedEvent, listenerOptions);
    documentNode.removeEventListener("mousemove", swallowAltModifiedEvent, listenerOptions);
    documentNode.removeEventListener("mouseup", swallowAltModifiedEvent, listenerOptions);
    documentNode.removeEventListener("wheel", swallowAltModifiedEvent, listenerOptions);
  };
}
