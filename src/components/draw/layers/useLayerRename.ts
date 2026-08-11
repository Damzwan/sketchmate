import { alertController } from "@ionic/vue";
import type { useLayersStore } from "@/draw/layers/layers.store";

export function useLayerRename(layers: ReturnType<typeof useLayersStore>) {
	async function renameLayer(id: string) {
		const layer = layers.layers.find((candidate) => candidate.id === id);
		if (!layer) return;

		const alert = await alertController.create({
			header: "Rename layer",
			cssClass: "liquid-alert",
			inputs: [
				{
					name: "name",
					type: "text",
					value: layer.name,
					attributes: { maxlength: 24 },
				},
			],
			buttons: [
				{ text: "Cancel", role: "cancel" },
				{ text: "Save", role: "confirm" },
			],
		});
		await alert.present();
		const { role, data } = await alert.onDidDismiss();
		if (role !== "confirm") return;

		const name = String(data?.values?.name ?? "").trim();
		if (name) layers.renameLayer(id, name);
	}

	return { renameLayer };
}
