// src/config/fonts.ts

export interface FontOption {
	value: string;
	label: string;
	family: string;
	preview: string;
}

export const FONTS: FontOption[] = [
	{
		value: "sketch",
		label: "Sketch",
		family: '"Cabin Sketch", sans-serif',
		preview: "Artistic",
	},
	{
		value: "amatic",
		label: "Amatic",
		family: '"Amatic SC", cursive',
		preview: "Handmade",
	},
	{
		value: "anton",
		label: "Anton",
		family: '"Anton", sans-serif',
		preview: "BOLD",
	},
	{
		value: "chokokutai",
		label: "Choko",
		family: '"Chokokutai", cursive',
		preview: "チョコ",
	},
	{
		value: "dancing",
		label: "Dancing",
		family: '"Dancing Script", cursive',
		preview: "Elegant",
	},
	{
		value: "indie",
		label: "Indie Flower",
		family: '"Indie Flower", cursive',
		preview: "Playful",
	},
	{
		value: "krub",
		label: "Krub",
		family: '"Krub", sans-serif',
		preview: "Clean",
	},
	{
		value: "puddles",
		label: "Puddles",
		family: '"Rubik Puddles", cursive',
		preview: "Bubbly",
	},
];

export const resolveFontFamily = (key: string): string =>
	FONTS.find((f) => f.value === key)?.family ?? '"Cabin Sketch", sans-serif';
