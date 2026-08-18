import { computed } from "vue";
import {
	deleteCompetitionComment,
	fetchCompetitionComments,
	postCompetitionComment,
} from "@/service/api/competition.api";
import { deleteInboxComment, getInboxComments } from "@/service/api/inbox.api";
import { fetchPostComments, postComment } from "@/service/api/post.api";
import { usePostStore } from "@/store/post.store";

export interface CommentSubjectProps {
	type: "post" | "inbox" | "competition";
	currItem: any;
	user: any;
	userLookup?: (userId: string) => any;
	onComment?: (item: any, message: string) => Promise<any>;
}

export function useCommentSubject(props: CommentSubjectProps) {
	const postStore = usePostStore();
	const isPost = computed(() => props.type === "post");
	const isCompetition = computed(() => props.type === "competition");

	function authorId(comment: any): string {
		return comment.author?._id || comment.author_id || comment.sender;
	}

	function resolvedAuthor(comment: any) {
		if (comment.author) return comment.author;
		return props.userLookup?.(comment.sender || comment.author_id);
	}

	function authorName(comment: any): string {
		return resolvedAuthor(comment)?.name || "Sketcher";
	}

	function authorImage(comment: any): string | undefined {
		return resolvedAuthor(comment)?.img;
	}

	async function fetchPage(beforeDate?: string) {
		const id = props.currItem._id;
		if (isPost.value) return fetchPostComments(id, 20, beforeDate);
		if (isCompetition.value)
			return fetchCompetitionComments(id, 20, beforeDate);
		return getInboxComments(id, 20, beforeDate);
	}

	async function submit(message: string) {
		if (isPost.value) {
			const { comment } = await postComment(props.currItem._id, message);
			return {
				...comment,
				author: props.user
					? {
							_id: props.user._id,
							name: props.user.name,
							img: props.user.img,
						}
					: { _id: comment.author_id, name: "You", img: "" },
			};
		}
		if (isCompetition.value) {
			return (await postCompetitionComment(props.currItem._id, message))
				.comment;
		}
		await props.onComment?.(props.currItem, message);
		return null;
	}

	async function remove(commentId: string) {
		if (isPost.value) {
			await postStore.deletePostComment(props.currItem._id, commentId);
		} else if (isCompetition.value) {
			await deleteCompetitionComment(props.currItem._id, commentId);
		} else {
			await deleteInboxComment(props.currItem._id, commentId);
		}
	}

	return {
		isPost,
		isCompetition,
		getAuthorId: authorId,
		getAuthorName: authorName,
		getAuthorImg: authorImage,
		fetchPage,
		submit,
		remove,
	};
}
