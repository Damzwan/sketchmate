import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { initializeApp } from "firebase/app";

export function initFirebase() {
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
