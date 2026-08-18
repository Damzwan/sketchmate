import { actionSheetController } from "@ionic/vue";
import { mdiDeleteOutline, mdiFlagVariantOutline } from "@mdi/js";
import type { Ref } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { svg } from "@/helper/general.helper";
import { useToast } from "@/service/toast.service";
import { useModerationStore } from "@/store/moderation.store";
import type { CommentSubjectProps } from "./useCommentSubject";

interface CommentActionsOptions {
	props: CommentSubjectProps;
	comments: Ref<any[]>;
	authorId: (comment: any) => string;
	authorName: (comment: any) => string;
	remove: (commentId: string) => Promise<void>;
}

export function useCommentActions(options: CommentActionsOptions) {
	const { props, comments, authorId, authorName, remove } = options;
	const moderation = useModerationStore();
	const { confirm } = useConfirm();
	const { toast } = useToast();

	async function openCommentActions(comment: any) {
		const isMine = authorId(comment) === props.user?._id;
		const buttons = [
			isMine
				? {
						text: "Delete Comment",
						role: "destructive",
						icon: svg(mdiDeleteOutline),
						handler: () => confirmDelete(comment),
					}
				: {
						text: "Report Comment",
						role: "destructive",
						icon: svg(mdiFlagVariantOutline),
						handler: () => report(comment),
					},
			{ text: "Cancel", role: "cancel" },
		];
		const sheet = await actionSheetController.create({
			header: "Comment Options",
			cssClass: "liquid-action-sheet",
			buttons,
		});
		await sheet.present();
	}

	function report(comment: any) {
		moderation.openReport({
			type:
				props.type === "post"
					? "comment"
					: props.type === "competition"
						? "competition_comment"
						: "inbox_comment",
			id: comment._id,
			label: `${authorName(comment)}'s comment`,
		});
	}

	async function confirmDelete(comment: any) {
		const approved = await confirm({
			header: "Delete Comment?",
			subHeader: "This can't be undone.",
			message: "Are you sure you want to remove this comment?",
			confirmText: "Delete",
			destructive: true,
		});
		if (!approved || !props.currItem) return;
		try {
			await remove(comment._id);
			comments.value = comments.value.filter(
				(item) => item._id !== comment._id,
			);
			if (props.currItem.comments) {
				props.currItem.comments = props.currItem.comments.filter(
					(item: any) => item._id !== comment._id,
				);
			}
			if ((props.currItem.comment_count ?? 0) > 0)
				props.currItem.comment_count--;
			toast("Comment deleted");
		} catch {
			toast("Failed to delete comment", { color: "danger" });
		}
	}

	return { openCommentActions };
}
