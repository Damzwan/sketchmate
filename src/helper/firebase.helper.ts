import { Capacitor } from "@capacitor/core";
import {
	FirebaseAuthentication,
	type User as FirebaseUser,
} from "@capacitor-firebase/authentication";

export async function initFirebase() {
	// Native authentication is provided by the Capacitor plugin and the native
	// Firebase SDK. Loading the web SDK as well only adds parsing/allocation work
	// to Android startup. Keep it available for the PWA, but in a separate chunk.
	if (Capacitor.isNativePlatform()) return;

	const { initializeApp } = await import("firebase/app");
	const firebaseConfig = {
		apiKey: "AIzaSyA0QXGKwWkDCMkyL4SEvdHGlaVQNyc7FUk",
		authDomain: "sketchmate-b5977.firebaseapp.com",
		projectId: "sketchmate-b5977",
		storageBucket: "sketchmate-b5977.appspot.com",
		messagingSenderId: "454566721535",
		appId: "1:454566721535:web:019875100e884ea61519ca",
		measurementId: "G-GD43HDZD3D",
	};

	initializeApp(firebaseConfig);
}

export const getCurrentUser = async () => {
	const result = await FirebaseAuthentication.getCurrentUser();
	return result.user;
};

export async function getCurrentAuthUser() {
	const result = await FirebaseAuthentication.getCurrentUser();
	return result.user;
}

const NON_LINKED_PROVIDER_IDS = new Set(["firebase", "anonymous", "custom"]);

/**
 * Native Firebase includes its internal `firebase` user-info row in
 * `providerData`, even for anonymous and custom-token sessions. Only an actual
 * sign-in provider such as `password` or `google.com` protects the account.
 */
export function hasDurableSignInProvider(user: {
	providerData: Array<Pick<FirebaseUser["providerData"][number], "providerId">>;
}): boolean {
	return user.providerData.some(
		(provider) => !NON_LINKED_PROVIDER_IDS.has(provider.providerId),
	);
}
