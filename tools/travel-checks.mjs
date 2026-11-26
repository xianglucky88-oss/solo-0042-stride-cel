import assert from 'node:assert/strict';
import { continuousView, lapShift, locate, placeAt, trailPoints } from '../web/playback.mjs';

// A deliberately small stride: 450 ms at 10 FPS, root X 10 → 70. Sample points
// are 0/100/200/300/400 ms, so the 400 ms frame has not yet reached 70.
export function travelChecks() {
  return {
    travel: async ({ preview }) => {
      const document = {
        id: 'stride-450', duration: 450, fps: 10, facing: 'right', loop: true,
        keys: [{ time: 0, x: 10, y: 0, arm: 0 }, { time: 450, x: 70, y: 0, arm: 0 }],
        windows: [], events: [],
      };
      const sheet = JSON.parse(Buffer.from((await preview(document)).base64, 'base64'));
      const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
      assert.equal(sheet.frames.length, 5);
      close(placeAt(sheet, 400).frame.pose.x, 10 + 60 * 400 / 450);
      assert.equal(locate(sheet, 400).index, 4);

      // The next lap's first frame continues from the previous lap's actual
      // endpoint, not from the authored first frame.
      assert.equal(placeAt(sheet, 450).lap, 1);
      close(placeAt(sheet, 450).frame.pose.x, 70);
      close(lapShift(sheet, 2).x, 120);

      // Mirrored playback travels the other way.
      const mirrored = JSON.parse(Buffer.from((await preview({ ...document, facing: 'left' })).base64, 'base64'));
      close(placeAt(mirrored, 450).frame.pose.x, -70);
      close(placeAt(mirrored, 900).frame.pose.x, -130);

      // A real vertical jump is authored motion, so it is not repeated as
      // travel: the seam stays visible instead of being smoothed away.
      const jumping = JSON.parse(Buffer.from((await preview({
        ...document, keys: [document.keys[0], { ...document.keys[1], y: 5 }],
      })).base64, 'base64'));
      assert.equal(lapShift(jumping, 1).y, 0);
      assert.equal(placeAt(jumping, 0).frame.pose.y, 0);
      // The authored vertical jump survives at the seam instead of being
      // absorbed into accumulated travel.
      assert.equal(placeAt(jumping, 400).frame.pose.y, 5 * 400 / 450);
      assert.equal(placeAt(jumping, 450).frame.pose.y, 0);

      // The trail covers only the most recent lap and never draws ahead of the
      // playhead; just after a seam it still shows the tail of the last lap.
      const trail = trailPoints(sheet, 460);
      assert.ok(trail.some(point => point.lap === 0));
      assert.ok(trail.some(point => point.lap === 1));
      assert.ok(trail.every(point => point.lap * sheet.duration + point.time <= 460 + 1e-6));
      assert.ok(trailPoints(sheet, 460).at(-1).x <= 70 + 60 * 10 / 450);
      assert.ok(trailPoints(sheet, 450).every(point => point.x <= 70 + 1e-9));

      // Pausing in the second lap and scrubbing inside it keeps the lap count.
      const scrubbed = placeAt(sheet, 450 + 300);
      assert.equal(scrubbed.lap, 1);
      assert.equal(scrubbed.index, 3);
      assert.equal(scrubbed.frame.pose.x, 110);
      assert.equal(placeAt(sheet, 450 + 300 + 150).lap, 2);
      assert.equal(locate(sheet, 0).lap, 0);

      // Character and action boxes move together in the proof view: the box
      // keeps the same offset from the root it had in the authored lap.
      const boxed = JSON.parse(Buffer.from((await preview({
        ...document, windows: [{ id: 'mark', from: 0, to: 450, x: 5, y: -20, w: 20, h: 10 }],
      })).base64, 'base64'));
      const firstLap = continuousView(boxed, 300).boxes[0];
      const secondLap = continuousView(boxed, 450 + 300).boxes[0];
      assert.equal(firstLap.x, continuousView(boxed, 300).pose.x + 5);
      assert.equal(secondLap.x, continuousView(boxed, 450 + 300).pose.x + 5);
      assert.equal(secondLap.x - firstLap.x, 60);

      // The view is what the artifact is not: downloaded bytes stay one lap.
      const view = continuousView(sheet, 450 + 300);
      assert.equal(view.pose.x, 110);
      assert.equal(view.lap, 1);
      assert.equal(sheet.frames[0].pose.x, 10);
    },
  };
}
