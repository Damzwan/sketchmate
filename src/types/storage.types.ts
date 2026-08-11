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
	guestRecovery = "guest_recovery",
	/**
	 * `{ userId, cursor }` for the incremental cloud draft pull. Stored with the
	 * account id because the local draft database outlives a logout, so a cursor
	 * carried into the next login would skip that account's whole history.
	 */
	draftSyncCursor = "draft_sync_cursor",
	recoveredGuestSession = "recovered_guest_session",
	/** Legacy migration key from the briefly forced account-linking flow. */
	guestRecoveryLinkRequired = "guest_recovery_link_required",
	/**
	 * Set on logout, cleared on login. Read by the ANDROID home-screen widget
	 * (Widget.java), which otherwise cannot tell "signed out" from "the WebView
	 * hasn't run yet" — both look like a missing `user_id`. Without it the widget
	 * has to treat every missing id as a hard logout and show an error card.
	 */
	loggedOut = "widget_logged_out",
}
