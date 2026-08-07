export enum LocalStorage {
	user_id = "user_id",
	backend_url = "backend_url",
	img = "img",
	unread = "unread",
	mate = "mate",
	color_history = "color_history",
	selectTip = "selectTip",
	selectHint = "selectHint",
	multiSelectHint = "multiSelectHint",
	reviewPromptCount = "reviewPromptCount",
	login = "login",
	notificationToken = "notification_token",
	installId = "install_id",
	guestUpgradeDismissed = "guest_upgrade_dismissed",
	/**
	 * Set on logout, cleared on login. Read by the ANDROID home-screen widget
	 * (Widget.java), which otherwise cannot tell "signed out" from "the WebView
	 * hasn't run yet" — both look like a missing `user_id`. Without it the widget
	 * has to treat every missing id as a hard logout and show an error card.
	 */
	loggedOut = "widget_logged_out",
}
