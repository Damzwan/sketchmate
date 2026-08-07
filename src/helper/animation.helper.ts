import { type Animation, createAnimation } from "@ionic/vue";

export const routerAnimation = (_baseEl: HTMLElement, opts?: any) => {
	const rootAnimation = createAnimation().duration(150).easing("ease-in-out");

	const enteringAnimation = createAnimation()
		.addElement(opts.enteringEl)
		.fromTo("opacity", "0", "1");

	rootAnimation.addAnimation(enteringAnimation);

	if (opts.leavingEl) {
		const leavingAnimation = createAnimation()
			.addElement(opts.leavingEl)
			.fromTo("opacity", "1", "0");

		rootAnimation.addAnimation(leavingAnimation);
	}

	return rootAnimation;
};

export const slideTransition = (
	_baseEl: HTMLElement,
	opts?: any,
): Animation => {
	const DURATION = 300;
	const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

	const rootAnimation = createAnimation()
		.addElement(opts.enteringEl) // Ensure the base container is targeted
		.duration(DURATION)
		.easing(EASING);

	const enteringAnimation = createAnimation()
		.addElement(opts.enteringEl)
		.beforeStyles({ "z-index": 10 }); // Ensure entering element is on top

	// If there is no leaving element (initial root load), just fade in
	if (!opts.leavingEl) {
		return rootAnimation.addAnimation([
			enteringAnimation.fromTo("opacity", "0", "1"),
		]);
	}

	const leavingAnimation = createAnimation()
		.addElement(opts.leavingEl)
		.beforeStyles({ "z-index": 1 });

	if (opts.direction === "forward") {
		enteringAnimation
			.fromTo("transform", "translateX(100%)", "translateX(0)")
			.fromTo("opacity", "1", "1");

		leavingAnimation
			.fromTo("transform", "translateX(0)", "translateX(-20%)")
			.fromTo("opacity", "1", "0.5");
	} else {
		enteringAnimation
			.fromTo("transform", "translateX(-20%)", "translateX(0)")
			.fromTo("opacity", "0.5", "1");

		leavingAnimation
			.fromTo("transform", "translateX(0)", "translateX(100%)")
			.fromTo("opacity", "1", "1");
	}

	return rootAnimation.addAnimation([enteringAnimation, leavingAnimation]);
};

export const masterAnimation = (baseEl: HTMLElement, opts?: any): Animation => {
	const isSlideTransition =
		opts?.enteringEl?.classList.contains("slide-page") ||
		opts?.leavingEl?.classList.contains("slide-page");

	if (isSlideTransition) {
		return slideTransition(baseEl, opts);
	}

	return routerAnimation(baseEl, opts);
};
