import { BaseBrush, Point, Canvas, Shadow, FabricImage } from 'fabric'

interface StrokePoint {
  x: number;
  y: number;
  width: number;
}

interface InkDrop {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

export class CalligraphyBrush extends BaseBrush {
  width = 40;
  minWidth = 4;

  declare private _strokePoints: StrokePoint[];
  declare private _splatters: InkDrop[];
  declare private _lastTime: number;

  declare private _latestRenderIndex: number;
  declare private _latestSplatterIndex: number;

  constructor(canvas: Canvas) {
    super(canvas);
    this.canvas = canvas;
    this._strokePoints = [];
    this._splatters = [];
    this._lastTime = 0;
    this._latestRenderIndex = 0;
    this._latestSplatterIndex = 0;
  }

  onMouseDown(pointer: Point) {
    this._strokePoints = [];
    this._splatters = [];
    this._latestRenderIndex = 0;
    this._latestSplatterIndex = 0;
    this._lastTime = Date.now();
    this.canvas.clearContext(this.canvas.contextTop);

    this._strokePoints.push({
      x: pointer.x,
      y: pointer.y,
      width: this.width * 0.6
    });

    this._renderChunk();
  }

  onMouseMove(pointer: Point) {
    if (this._addPoint(pointer)) {
      this._renderChunk();
    }
  }

  onMouseUp() {
    const originalRenderOnAddRemove = this.canvas.renderOnAddRemove;
    this.canvas.renderOnAddRemove = false;

    if (this._strokePoints.length > 1) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (let i = 0; i < this._strokePoints.length; i++) {
        const p = this._strokePoints[i];
        const halfWidth = p.width / 2;
        if (p.x - halfWidth < minX) minX = p.x - halfWidth;
        if (p.y - halfWidth < minY) minY = p.y - halfWidth;
        if (p.x + halfWidth > maxX) maxX = p.x + halfWidth;
        if (p.y + halfWidth > maxY) maxY = p.y + halfWidth;
      }

      for (let i = 0; i < this._splatters.length; i++) {
        const drop = this._splatters[i];
        const maxRadius = Math.max(drop.radiusX, drop.radiusY);
        if (drop.x - maxRadius < minX) minX = drop.x - maxRadius;
        if (drop.y - maxRadius < minY) minY = drop.y - maxRadius;
        if (drop.x + maxRadius > maxX) maxX = drop.x + maxRadius;
        if (drop.y + maxRadius > maxY) maxY = drop.y + maxRadius;
      }

      const padding = 40;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const physicalWidth = maxX - minX;
      const physicalHeight = maxY - minY;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = physicalWidth * dpr;
      offscreenCanvas.height = physicalHeight * dpr;
      const ctx = offscreenCanvas.getContext('2d');

      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.translate(-minX, -minY);

        this._drawStrokeToContext(
          ctx,
          0,
          this._strokePoints.length,
          0,
          this._splatters.length
        );

        const calligraphyImage = new FabricImage(offscreenCanvas, {
          left: minX,
          top: minY,
          originX: 'left',
          originY: 'top',
          scaleX: 1 / dpr,
          scaleY: 1 / dpr,
          objectCaching: true,
          interactive: false
        });

        this.shadow && calligraphyImage.set('shadow', new Shadow(this.shadow));
        this.canvas.fire('before:path:created', { path: calligraphyImage });
        this.canvas.add(calligraphyImage);
        this.canvas.fire('path:created', { path: calligraphyImage });
      }
    }

    this.canvas.clearContext(this.canvas.contextTop);
    this._resetShadow();
    this.canvas.renderOnAddRemove = originalRenderOnAddRemove;
    this.canvas.requestRenderAll();

    this._strokePoints = [];
    this._splatters = [];
  }

  private _addPoint(pointer: Point) {
    const lastPoint = this._strokePoints[this._strokePoints.length - 1];

    const dx = pointer.x - lastPoint.x;
    const dy = pointer.y - lastPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 2) return false;

    const now = Date.now();
    const timeDiff = now - this._lastTime;
    this._lastTime = now;

    const velocity = timeDiff > 0 ? distance / timeDiff : 0;
    const velocityFactor = Math.min(1, velocity / 3);
    const targetWidth = this.width - (this.width - this.minWidth) * velocityFactor;
    const smoothedWidth = lastPoint.width + (targetWidth - lastPoint.width) * 0.2;

    this._strokePoints.push({
      x: pointer.x,
      y: pointer.y,
      width: smoothedWidth
    });

    const angle = Math.atan2(dy, dx);

    // 🌾 HIHAKU (FLYING WHITE) BRISTLES
    if (velocity > 1.2) {
      const numBristles = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < numBristles; i++) {
        const perpAngle = angle + (Math.PI / 2);
        const offsetDist = (Math.random() - 0.5) * (smoothedWidth * 1.5);
        this._splatters.push({
          x: pointer.x + Math.cos(perpAngle) * offsetDist,
          y: pointer.y + Math.sin(perpAngle) * offsetDist,
          radiusX: Math.random() * velocity * 6 + 4,
          radiusY: Math.random() * 0.5 + 0.3,
          rotation: angle
        });
      }
    }

    // 🩸 REFINED ORGANIC INK BLOBS
    if (velocity > 1.8 && Math.random() > 0.8) {
      const numDrops = Math.floor(Math.random() * 2) + 1;

      for (let i = 0; i < numDrops; i++) {
        // 1. Determine which side of the brush the ink flies off (left or right)
        const side = Math.random() > 0.5 ? 1 : -1;
        const perpAngle = angle + ((Math.PI / 2) * side);

        // 2. Guarantee lateral clearance so it never lands inside the stroke
        const lateralClearance = (smoothedWidth / 2) + (Math.random() * 10 + 5);
        const forwardThrow = Math.random() * velocity * 8;

        // Calculate exact landing coordinates
        const dropX = pointer.x + Math.cos(perpAngle) * lateralClearance + Math.cos(angle) * forwardThrow;
        const dropY = pointer.y + Math.sin(perpAngle) * lateralClearance + Math.sin(angle) * forwardThrow;

        // 3. Realistic Liquid Sizing (Much smaller, rounder base)
        const baseSize = Math.random() * 2.5 + 1;
        const stretch = 1 + (Math.random() * velocity * 0.15); // Capped stretch so they don't look like pills

        // The rotation angle precisely aligns with the trajectory from the brush center to the drop
        const flightAngle = Math.atan2(dropY - pointer.y, dropX - pointer.x);

        this._splatters.push({
          x: dropX,
          y: dropY,
          radiusX: baseSize * stretch,
          radiusY: baseSize,
          rotation: flightAngle
        });

        // 4. Satellite Droplets (Simulates liquid surface tension tearing)
        if (Math.random() > 0.4) {
          const tailX = dropX - Math.cos(flightAngle) * (baseSize * 2.5);
          const tailY = dropY - Math.sin(flightAngle) * (baseSize * 2.5);

          this._splatters.push({
            x: tailX,
            y: tailY,
            radiusX: baseSize * 0.4, // Tiny dot trailing behind
            radiusY: baseSize * 0.4,
            rotation: flightAngle
          });
        }
      }
    }

    return true;
  }

  private _renderChunk() {
    const ctx = this.canvas.contextTop;
    this._saveAndTransform(ctx);

    const startIdx = Math.max(0, this._latestRenderIndex - 1);

    this._drawStrokeToContext(
      ctx,
      startIdx,
      this._strokePoints.length,
      this._latestSplatterIndex,
      this._splatters.length
    );

    ctx.restore();
    this._latestRenderIndex = this._strokePoints.length;
    this._latestSplatterIndex = this._splatters.length;
  }

  private _drawStrokeToContext(
    ctx: CanvasRenderingContext2D,
    startIdx: number,
    endIdx: number,
    splatStart: number,
    splatEnd: number
  ) {
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = startIdx; i < endIdx - 1; i++) {
      const p1 = this._strokePoints[i];
      const p2 = this._strokePoints[i + 1];

      ctx.beginPath();
      ctx.lineWidth = p1.width;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p2.x, p2.y, p2.width / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = splatStart; i < splatEnd; i++) {
      const drop = this._splatters[i];
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y, drop.radiusX, drop.radiusY, drop.rotation, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}