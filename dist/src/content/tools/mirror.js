

(function () {
  'use strict';

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

  BP.getMirroredPositions = function (x, y, mirrorH, mirrorV, size) {
    const positions = [];
    const mx = size - 1 - x;
    const my = size - 1 - y;

    if (mirrorH) {
      positions.push({ x: mx, y });
    }
    if (mirrorV) {
      positions.push({ x, y: my });
    }
    if (mirrorH && mirrorV) {
      positions.push({ x: mx, y: my });
    }

    return positions;
  };

  let isMirrorDispatching = false;

  BP.handleMirrorEvent = function (event, canvas, mirrorH, mirrorV) {
    if (isMirrorDispatching) return;
    if (!mirrorH && !mirrorV) return;

    if (event.type === 'pointermove' && event.buttons === 0) return;
    if (event.type !== 'pointerdown' && event.type !== 'pointermove' && event.type !== 'pointerup') return;

    const bitmap = BP.screenToPixel(canvas, event.clientX, event.clientY);
    const logical = BP.bitmapToLogical(canvas, bitmap.x, bitmap.y);
    const logicalSize = BP.getLogicalSize(canvas);

    if (logical.x < 0 || logical.x >= logicalSize || logical.y < 0 || logical.y >= logicalSize) return;

    const mirrors = BP.getMirroredPositions(logical.x, logical.y, mirrorH, mirrorV, logicalSize);

    isMirrorDispatching = true;
    try {
      for (const pos of mirrors) {
        BP.simulatePointerEvent(canvas, event.type, pos.x, pos.y);
      }
    } finally {
      isMirrorDispatching = false;
    }
  };

  BP.installMirrorInterceptor = function (canvas, getMirrorState) {
    const eventTypes = ['pointerdown', 'pointermove', 'pointerup'];
    const handlers = {};

    for (const type of eventTypes) {
      handlers[type] = (event) => {
        const state = getMirrorState();
        BP.handleMirrorEvent(event, canvas, state.mirrorH, state.mirrorV);
      };
      canvas.addEventListener(type, handlers[type], { passive: true });
    }

    return () => {
      for (const type of eventTypes) {
        canvas.removeEventListener(type, handlers[type]);
      }
    };
  };

  console.log('[basepaint-plugin] Mirror tool loaded');
})();
