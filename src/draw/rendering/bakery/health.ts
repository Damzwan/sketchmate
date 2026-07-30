export const COLD_BAKE_TIMEOUT_MS = 20_000;
export const WARM_BAKE_TIMEOUT_MS = 8_000;
export const MAX_BAKERY_IN_FLIGHT = 8;
export const BAKERY_PAUSE_MS = 30_000;

const MAX_HARD_FAILURES = 5;
const MAX_CONSECUTIVE_TIMEOUTS = 8;
const MAX_PAUSES = 4;

export class BakeryHealth {
	private hardFailures = 0;
	private consecutiveTimeouts = 0;
	private pauses = 0;
	private warm = false;

	get baseTimeoutMs(): number {
		return this.warm ? WARM_BAKE_TIMEOUT_MS : COLD_BAKE_TIMEOUT_MS;
	}

	rearm(): void {
		this.hardFailures = 0;
		this.consecutiveTimeouts = 0;
		this.warm = false;
	}

	noteReply(): void {
		this.warm = true;
		this.consecutiveTimeouts = 0;
		this.hardFailures = Math.max(0, this.hardFailures - 1);
	}

	noteTimeout(): boolean {
		this.consecutiveTimeouts++;
		return this.consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS;
	}

	noteHardError(): boolean {
		this.hardFailures++;
		return this.hardFailures >= MAX_HARD_FAILURES;
	}

	notePause(): boolean {
		this.pauses++;
		return this.pauses > MAX_PAUSES;
	}
}
