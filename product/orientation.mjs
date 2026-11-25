export function orientPose(pose, facing) {
  return facing === 'left' ? { ...pose, x:-pose.x, arm:-pose.arm } : pose;
}

export function worldBox(box, pose, facing) {
  return { id:box.id, x:pose.x+(facing==='left' ? -box.x-box.w : box.x), y:pose.y+box.y, w:box.w, h:box.h };
}
