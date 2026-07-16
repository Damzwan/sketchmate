import { alertController } from "@ionic/vue";

/**
 * Families-policy parental gate: a quick mental-math challenge that a young
 * child is unlikely to pass but any adult can. Operands are SPELLED OUT so the
 * question can't be pasted into a calculator verbatim, and the pair is
 * randomized per attempt.
 */
const SMALL = ["six", "seven", "eight", "nine"]; // 6..9
const TEENS = [
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
]; // 12..19

export type AdultGateResult = "pass" | "fail" | "cancel";

export async function presentAdultGate(): Promise<AdultGateResult> {
	const ai = Math.floor(Math.random() * SMALL.length);
	const bi = Math.floor(Math.random() * TEENS.length);
	const answer = (ai + 6) * (bi + 12);

	return new Promise((resolve) => {
		let settled = false;
		const settle = (r: AdultGateResult) => {
			if (settled) return;
			settled = true;
			resolve(r);
		};

		alertController
			.create({
				header: "Grown-ups only",
				subHeader: "Ask a parent or guardian",
				message: `What is ${SMALL[ai]} times ${TEENS[bi]}?`,
				cssClass: "liquid-alert",
				backdropDismiss: false,
				inputs: [
					{
						name: "answer",
						type: "number",
						placeholder: "Answer",
						attributes: { inputmode: "numeric" },
					},
				],
				buttons: [
					{
						text: "Cancel",
						role: "cancel",
						handler: () => settle("cancel"),
					},
					{
						text: "Continue",
						handler: (data) => {
							settle(Number(data?.answer) === answer ? "pass" : "fail");
							return true;
						},
					},
				],
			})
			.then((alert) => {
				alert.onDidDismiss().then(() => settle("cancel"));
				void alert.present();
			});
	});
}
