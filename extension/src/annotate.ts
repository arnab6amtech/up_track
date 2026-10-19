// Screenshot annotation: arrows, boxes, text and blur, drawn on a canvas at the screenshot's full
// resolution. Shapes are kept as data so they can be undone and re-drawn crisply.

export type Tool = "arrow" | "rect" | "text" | "blur";

/** Shapes defined by a drag from one corner/end to the other. */
type DragShape = { kind: "arrow" | "rect" | "blur"; x1: number; y1: number; x2: number; y2: number; color: string };
type Shape = DragShape | { kind: "text"; x: number; y: number; text: string; color: string };

export class Annotator {
  tool: Tool = "arrow";
  color = "#e11d48";
  private shapes: Shape[] = [];
  private draft: Shape | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly lineWidth: number;
  private readonly fontSize: number;
  onChange?: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly image: ImageBitmap,
    private readonly textInput: HTMLTextAreaElement,
  ) {
    canvas.width = image.width;
    canvas.height = image.height;
    this.ctx = canvas.getContext("2d")!;
    // Scale strokes and text with the screenshot so they look the same on retina and normal captures.
    this.lineWidth = Math.max(3, Math.round(image.width / 320));
    this.fontSize = Math.max(16, Math.round(image.width / 55));
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", () => this.cancelDraft());
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.commitText();
      } else if (e.key === "Escape") {
        this.hideTextInput();
      }
    });
    textInput.addEventListener("blur", () => this.commitText());
    this.render();
  }

  get count() {
    return this.shapes.length;
  }

  undo() {
    this.shapes.pop();
    this.render();
    this.onChange?.();
  }

  clear() {
    this.shapes = [];
    this.render();
    this.onChange?.();
  }

  /** The annotated screenshot as a PNG at full resolution. */
  toBlob(): Promise<Blob> {
    this.commitText();
    this.render();
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't export the screenshot."))), "image/png"),
    );
  }

  private point(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * this.canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * this.canvas.height) / rect.height,
    };
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const { x, y } = this.point(e);
    if (this.tool === "text") {
      e.preventDefault();
      this.showTextInput(e, x, y);
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.draft = { kind: this.tool, x1: x, y1: y, x2: x, y2: y, color: this.color };
  };

  private onMove = (e: PointerEvent) => {
    if (!this.draft || this.draft.kind === "text") return;
    const { x, y } = this.point(e);
    this.draft.x2 = x;
    this.draft.y2 = y;
    this.render();
  };

  private onUp = () => {
    const d = this.draft;
    this.draft = null;
    // Ignore clicks that didn't drag far enough to mean anything.
    if (d && d.kind !== "text" && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > this.lineWidth * 2) {
      this.shapes.push(d);
      this.onChange?.();
    }
    this.render();
  };

  private cancelDraft() {
    this.draft = null;
    this.render();
  }

  private pendingText: { x: number; y: number } | null = null;

  private showTextInput(e: PointerEvent, x: number, y: number) {
    this.commitText();
    const rect = this.canvas.getBoundingClientRect();
    const scale = rect.width / this.canvas.width;
    this.pendingText = { x, y };
    Object.assign(this.textInput.style, {
      left: `${e.clientX - rect.left}px`,
      top: `${e.clientY - rect.top}px`,
      fontSize: `${Math.max(12, this.fontSize * scale)}px`,
      color: this.color,
    });
    this.textInput.value = "";
    this.textInput.hidden = false;
    // Focus right away: keys typed before focus would reach the page and trigger tool shortcuts.
    this.textInput.focus();
  }

  private hideTextInput() {
    this.pendingText = null;
    this.textInput.hidden = true;
  }

  private commitText() {
    const text = this.textInput.value.trim();
    if (this.pendingText && text) {
      this.shapes.push({ kind: "text", ...this.pendingText, text, color: this.color });
      this.onChange?.();
    }
    this.hideTextInput();
    this.render();
  }

  private render() {
    const { ctx, image } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(image, 0, 0);
    const shapes = this.draft ? [...this.shapes, this.draft] : this.shapes;
    // Blur first, so arrows and text drawn over a blurred area stay sharp.
    for (const s of shapes) if (s.kind === "blur") this.drawBlur(s, s === this.draft);
    for (const s of shapes) if (s.kind !== "blur") this.drawShape(s);
  }

  private drawBlur(s: DragShape, preview: boolean) {
    const x = Math.min(s.x1, s.x2);
    const y = Math.min(s.y1, s.y2);
    const w = Math.abs(s.x2 - s.x1);
    const h = Math.abs(s.y2 - s.y1);
    if (w < 1 || h < 1) return;
    // Pixelate: shrink the area a lot, then scale it back up without smoothing.
    const block = Math.max(10, Math.round(this.image.width / 110));
    const small = new OffscreenCanvas(Math.max(1, Math.ceil(w / block)), Math.max(1, Math.ceil(h / block)));
    small.getContext("2d")!.drawImage(this.image, x, y, w, h, 0, 0, small.width, small.height);
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    if (preview) {
      this.ctx.setLineDash([this.lineWidth * 2, this.lineWidth * 2]);
      this.ctx.lineWidth = Math.max(1, this.lineWidth / 2);
      this.ctx.strokeStyle = "#0a0a0a";
      this.ctx.strokeRect(x, y, w, h);
    }
    this.ctx.restore();
  }

  private drawShape(s: Shape) {
    const { ctx, lineWidth } = this;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (s.kind === "rect") {
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    } else if (s.kind === "arrow") {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = lineWidth * 4.5;
      // Stop the line short of the tip so the round cap doesn't poke through the arrowhead.
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2 - Math.cos(angle) * head * 0.8, s.y2 - Math.sin(angle) * head * 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(angle - Math.PI / 7), s.y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(s.x2 - head * Math.cos(angle + Math.PI / 7), s.y2 - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === "text") {
      ctx.font = `600 ${this.fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      // A white outline keeps the text readable on any background.
      ctx.lineWidth = Math.max(3, this.fontSize / 5);
      ctx.strokeStyle = "#ffffff";
      s.text.split("\n").forEach((line, i) => {
        const y = s.y + i * this.fontSize * 1.25;
        ctx.strokeText(line, s.x, y);
        ctx.fillText(line, s.x, y);
      });
    }
    ctx.restore();
  }
}
