import { alertController } from "@ionic/vue";

export interface ConfirmOptions {
	header: string;
	message?: string;
	subHeader?: string;
	confirmText?: string;
	cancelText?: string;
	destructive?: boolean;
	backdropDismiss?: boolean;
}

/** Present the app's standard two-action alert and resolve the user's choice. */
export function useConfirm() {
	async function confirm({
		header,
		message,
		subHeader,
		confirmText = "Confirm",
		cancelText = "Cancel",
		destructive = false,
		backdropDismiss = true,
	}: ConfirmOptions): Promise<boolean> {
		const confirmRole = destructive ? "destructive" : "confirm";
		const alert = await alertController.create({
			header,
			...(subHeader ? { subHeader } : {}),
			...(message ? { message } : {}),
			cssClass: "liquid-alert",
			backdropDismiss,
			buttons: [
				{
					text: cancelText,
					role: "cancel",
					cssClass: "alert-button-cancel",
				},
				{
					text: confirmText,
					role: confirmRole,
					// The theme colours the confirm button off this class, so a
					// destructive confirm has to say so here — Ionic's own
					// `alert-button-role-*` class is not what liquid-glass.css targets.
					cssClass: destructive
						? "alert-button-destructive"
						: "alert-button-confirm",
				},
			],
		});
		await alert.present();
		const { role } = await alert.onDidDismiss();
		return role === confirmRole;
	}

	return { confirm };
}
