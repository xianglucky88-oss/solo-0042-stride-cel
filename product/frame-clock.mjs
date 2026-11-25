export function frameCount(duration, fps) {
  return Math.ceil(duration * fps / 1000);
}

export function frameTime(index, fps) {
  return index * 1000 / fps;
}

export function eventFrame(time, fps) {
  // The event belongs to the frame interval containing its source time.
  return Math.floor(time * fps / 1000);
}
