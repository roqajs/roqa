import { defineComponent, cell, get, set } from 'rift-js';
import { HN_API_BASE } from './feeds.js';
import { timeAgo } from './utils/timeAgo.js';
import './comment-item.css';

function CommentItem({ comment, depth = 0 }) {
	const collapsed = cell(false);
	const childComments = cell([]);
	const loadingChildren = cell(false);
	const childrenLoaded = cell(false);

	const fetchChildComments = async () => {
		if (!comment || !comment.kids || comment.kids.length === 0) return;
		if (get(childrenLoaded)) return; // Already loaded

		set(loadingChildren, true);
		try {
			const commentPromises = comment.kids.map(async (id) => {
				const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
				return response.json();
			});
			const fetchedComments = await Promise.all(commentPromises);
			const validComments = fetchedComments.filter((c) => c && !c.deleted && !c.dead);
			set(childComments, validComments);
			set(childrenLoaded, true);
		} catch (err) {
			console.error('Failed to fetch child comments:', err);
		} finally {
			set(loadingChildren, false);
		}
	};

	const toggleCollapse = () => {
		const wasCollapsed = get(collapsed);
		set(collapsed, !wasCollapsed);

		// Load children when expanding for the first time
		if (wasCollapsed && !get(childrenLoaded) && comment?.kids?.length > 0) {
			fetchChildComments();
		}
	};

	// Set comment HTML text after mount
	this.connected(() => {
		const textEl = this.querySelector('.comment-text');
		if (textEl && comment?.text) {
			textEl.innerHTML = comment.text;
		}

		// Auto-load first level of children (depth 0 only)
		// Use requestAnimationFrame to ensure DOM refs are set up
		if (depth === 0 && comment?.kids?.length > 0) {
			requestAnimationFrame(() => {
				fetchChildComments();
			});
		}
	});

	// Handle missing comment data
	const authorName = comment?.by || '[unknown]';
	const commentTime = comment?.time ? timeAgo(comment.time) : '';
	const hasChildren = comment?.kids && comment.kids.length > 0;
	const isDeleted = comment?.deleted || comment?.dead;
	const childCount = comment?.kids?.length || 0;

	return (
		<div class="comment-wrapper">
			<div class={isDeleted ? 'comment deleted' : get(collapsed) ? 'comment collapsed' : 'comment'}>
				<div class={isDeleted ? 'comment-header hidden' : 'comment-header'}>
					<button class="collapse-btn" onclick={toggleCollapse}>
						{get(collapsed) ? '[+]' : '[-]'}
					</button>
					<span class="comment-author">{authorName}</span>
					<span class="comment-time">{commentTime}</span>
					<span class={get(collapsed) && hasChildren ? 'child-count visible' : 'child-count'}>
						{'(' + childCount + ' ' + (childCount === 1 ? 'reply' : 'replies') + ')'}
					</span>
				</div>
				<div
					class={
						isDeleted ? 'deleted-text' : get(collapsed) ? 'comment-body hidden' : 'comment-body'
					}
				>
					<div class={isDeleted ? 'hidden' : 'comment-text'}></div>
					<span class={isDeleted ? '' : 'hidden'}>[deleted]</span>
				</div>
			</div>
			<div
				class={
					isDeleted || get(collapsed) || !hasChildren
						? 'comment-children hidden'
						: 'comment-children'
				}
			>
				<div class={get(loadingChildren) ? 'loading-children visible' : 'loading-children'}>
					Loading replies...
				</div>
				<For each={childComments}>
					{(childComment) => <comment-item comment={childComment} depth={depth + 1}></comment-item>}
				</For>
			</div>
		</div>
	);
}

defineComponent('comment-item', CommentItem);
