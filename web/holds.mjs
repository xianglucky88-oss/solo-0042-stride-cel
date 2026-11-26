// Game-time span of each hit-stop hold, derived from the sheet's hold list.
export function holdSpans(sheet) {
  const spans=[]; let shift=0;
  for(const hold of sheet.holds??[]) {
    spans.push({reach:hold.at+shift,resume:hold.at+shift+hold.duration});
    shift+=hold.duration;
  }
  return spans;
}

// Integer comparison: does the frame start on the game clock inside a hold?
export function heldFrame(sheet,spans,frame) {
  const start=frame.index*1000;
  return spans.some(span=>start>=span.reach*sheet.fps && start<span.resume*sheet.fps);
}
