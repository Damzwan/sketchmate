export class FrameScheduler {
	private frameId = 0;
	private scheduled = false;

	constructor(private readonly render: () => void) {}

	get hasPendingFrame(): boolean {
		return this.scheduled;
	}

	request(): void {
		if (this.scheduled) return;
		this.scheduled = true;
		this.frameId = requestAnimationFrame(() => {
			this.frameId = 0;
			this.scheduled = false;
			this.render();
		});
	}

	renderImmediately(): void {
		if (this.frameId) cancelAnimationFrame(this.frameId);
		this.frameId = 0;
		this.scheduled = false;
		this.render();
	}

	cancel(): void {
		if (this.frameId) cancelAnimationFrame(this.frameId);
		this.frameId = 0;
		this.scheduled = false;
	}
}
