/** Ctrl/Cmd+wheel zoom of the PDF viewers (EmbedPDF and drawn pages): the zoom a wheel step leads to, between 25 % and 500 %. */
export function wheelZoomTarget(current: number, e: WheelEvent): number {
  let deltaY = e.deltaY;
  if (e.deltaMode === 1) deltaY *= 16;
  else if (e.deltaMode === 2) deltaY *= 100;
  deltaY = Math.max(-200, Math.min(200, deltaY));
  return Math.min(Math.max(current * Math.pow(0.999, deltaY), 0.25), 5.0);
}
