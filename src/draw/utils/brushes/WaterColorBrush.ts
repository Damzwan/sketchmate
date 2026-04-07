import { BaseBrush, Point, Canvas, Path, Shadow } from 'fabric'
import * as fabric from 'fabric'
import { opacityFromOpacityHex } from '@/draw/utils/color.utils'

export class WaterColorBrush extends BaseBrush {
  declare protected _basePoints: Point[]
  declare protected _bristlePoints: Point[][]

  constructor(canvas: Canvas) {
    super(canvas)
    this.canvas = canvas
    this._basePoints = []
    this._bristlePoints = [[], [], []]
  }

  onMouseDown(pointer: Point) {
    this._basePoints = []
    this._bristlePoints = [[], [], []]

    // Live Blending Injection
    if (this.canvas.contextTop?.canvas) {
      (this.canvas.contextTop.canvas as HTMLElement).style.mixBlendMode = 'multiply'
    }

    this._addPoint(pointer)
    this._render()
  }

  onMouseMove(pointer: Point) {
    if (this._addPoint(pointer) && this._basePoints.length > 1) {
      this.canvas.clearContext(this.canvas.contextTop)
      this._render()
    }
  }

  onMouseUp() {
    const originalRenderOnAddRemove = this.canvas.renderOnAddRemove;
    this.canvas.renderOnAddRemove = false;

    let pathString = '';

    for (let b = 0; b < this._bristlePoints.length; b++) {
      const points = this._bristlePoints[b];
      if (points.length > 0) {
        let p1 = points[0];
        pathString += `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `;

        for (let i = 1; i < points.length; i++) {
          const p2 = points[i];
          const mid = p1.midPointFrom(p2);
          pathString += `Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} `;
          p1 = p2;
        }
        pathString += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `;
      }
    }

    if (pathString) {
      const baseOpacity = opacityFromOpacityHex(this.color) || 0.6;
      const bristleOpacity = baseOpacity * 0.5;

      const path = new Path(pathString, {
        fill: '',
        stroke: this.color,
        strokeWidth: this.width * 0.8,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        opacity: bristleOpacity,
        globalCompositeOperation: 'multiply',
        objectCaching: true,
        interactive: false
      });

      path.set('shadow', new Shadow({
        color: this.color,
        blur: this.width * 0.4, // Tightened the blur slightly for a crisper wet edge
        offsetX: 0,
        offsetY: 0,
        affectStroke: true
      }));

      this.canvas.fire('before:path:created', { path });
      this.canvas.add(path);
      this.canvas.fire('path:created', { path });
    }

    this.canvas.clearContext(this.canvas.contextTop);

    if (this.canvas.contextTop?.canvas) {
      (this.canvas.contextTop.canvas as HTMLElement).style.mixBlendMode = 'normal'
    }

    this.canvas.renderOnAddRemove = originalRenderOnAddRemove;
    this.canvas.requestRenderAll();

    this._basePoints = [];
    this._bristlePoints = [[], [], []];
    return false;
  }

  private _addPoint(point: Point) {
    if (this._basePoints.length > 0 && point.eq(this._basePoints[this._basePoints.length - 1])) {
      return false;
    }

    // 1. Calculate the velocity of the patient's hand
    let dist = 0;
    if (this._basePoints.length > 0) {
      const prev = this._basePoints[this._basePoints.length - 1];
      dist = prev.distanceFrom(point);
    }
    this._basePoints.push(point);

    // 2. Velocity Pigment Pooling Math
    // If moving fast (> 20px per frame), speedFactor approaches 1. If slow, approaches 0.
    const speedFactor = Math.min(1, dist / 20);
    // Slower hand = wider spread (pools). Faster hand = tighter spread (thins out).
    const spreadMultiplier = 1.2 - (speedFactor * 0.7);

    const numBristles = 3;

    for (let b = 0; b < numBristles; b++) {
      const index = this._basePoints.length;

      // Apply the spreadMultiplier to our organic tissue generation
      const wave = Math.sin(index * 0.5 + b) * (this.width * 0.15 * spreadMultiplier);
      const noiseX = (Math.random() - 0.5) * (this.width * 0.2 * spreadMultiplier);
      const noiseY = (Math.random() - 0.5) * (this.width * 0.2 * spreadMultiplier);

      this._bristlePoints[b].push(new Point(
        point.x + wave + noiseX,
        point.y + wave + noiseY
      ));
    }
    return true;
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
    if (!this._basePoints.length) return;

    this._saveAndTransform(ctx);

    const baseOpacity = opacityFromOpacityHex(this.color) || 0.6;
    ctx.globalAlpha = baseOpacity * 0.5;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width * 0.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.width * 0.4;

    // The Intensity Bug Cure: We open ONE path for all bristles
    ctx.beginPath();

    for (let b = 0; b < this._bristlePoints.length; b++) {
      const points = this._bristlePoints[b];
      if (points.length === 0) continue;

      let p1 = points[0];
      ctx.moveTo(p1.x, p1.y);

      for (let i = 1; i < points.length; i++) {
        const p2 = points[i];
        const mid = p1.midPointFrom(p2);
        ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
        p1 = p2;
      }
      ctx.lineTo(p1.x, p1.y);
    }

    // We strike the canvas ONCE, ensuring the live preview perfectly matches the final geometry
    ctx.stroke();
    ctx.restore();
  }
}