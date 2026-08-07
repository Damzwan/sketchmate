import { Purchases } from "@revenuecat/purchases-capacitor";
import { isNative } from "@/helper/platform.helper";

export async function initBilling() {
	if (!isNative()) return;

	const env = import.meta.env.VITE_ENVIRONMENT;
	const testKey =
		env === "prod"
			? import.meta.env.VITE_REVENUECAT_ANDROID_KEY
			: import.meta.env.VITE_REVENUECAT_TEST_KEY;

	if (!testKey) {
		console.error("Missing RevenueCat Test Key! Check your .env file.");
		return;
	}

	try {
		await Purchases.configure({ apiKey: testKey });
		console.log("RevenueCat configured successfully with Key!");
	} catch (error) {
		console.error("Error configuring RevenueCat:", error);
	}
}
