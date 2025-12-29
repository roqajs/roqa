import { defineComponent, cell, get, set } from "rift-js";
import { HN_API_BASE } from "./feeds.js";
import { getDomain } from "./utils/getDomain.js";
import { timeAgo } from "./utils/timeAgo.js";
import "./comment-page.css";
import "./comment-item.jsx";

function CommentPage() {
	const story = cell(null);
	const comments = cell([]);
	const loading = cell(false);
	const error = cell(false);

	// Track pending load request
	let pendingStoryId = null;

	const fetchComments = async (kids) => {
		if (!kids || kids.length === 0) return [];

		const commentPromises = kids.map(async (id) => {
			const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
			return response.json();
		});

		const fetchedComments = await Promise.all(commentPromises);
		return fetchedComments.filter((c) => c && !c.deleted && !c.dead);
	};

	// Public method - stores the request for processing after connected
	this.loadStory = (storyId) => {
		pendingStoryId = storyId;
	};

	// Do the actual loading work
	this.connected(() => {
		requestAnimationFrame(() => {
			if (pendingStoryId !== null) {
				const storyId = pendingStoryId;
				pendingStoryId = null;
				doLoad(storyId);
			}
		});

		// Override loadStory to work directly now that we're connected
		this.loadStory = (storyId) => {
			requestAnimationFrame(() => doLoad(storyId));
		};
	});

	const doLoad = async (storyId) => {
		set(loading, true);
		set(error, false);
		set(story, null);
		set(comments, []);

		try {
			// Fetch the story
			const response = await fetch(`${HN_API_BASE}/item/${storyId}.json`);
			const storyData = await response.json();

			if (!storyData) {
				set(error, true);
				return;
			}

			set(story, storyData);

			// Update the story text HTML if present
			requestAnimationFrame(() => {
				const textEl = this.querySelector(".story-text");
				if (textEl && storyData.text) {
					textEl.innerHTML = storyData.text;
				}
			});

			// Fetch top-level comments
			if (storyData.kids && storyData.kids.length > 0) {
				const topComments = await fetchComments(storyData.kids);
				console.log("Fetched top comments:", topComments);
				console.log("Setting comments, length:", topComments.length);
				set(comments, topComments);
				console.log("Comments set done");
			}
		} catch (err) {
			console.error("Failed to fetch story:", err);
			set(error, true);
		} finally {
			set(loading, false);
		}
	};

	return (
		<section class="comment-page">
			<Show when={get(loading)}>
				<div class="loading">
					<div class="loading-spinner"></div>
					<span>Loading comments...</span>
				</div>
			</Show>
			<Show when={get(error)}>
				<div class="error">
					<p>Failed to load story. Please try again.</p>
					<button class="back-btn" onclick={() => this.emit("back")}>
						← Back to stories
					</button>
				</div>
			</Show>
			<Show when={!get(loading) && !get(error) && get(story)}>
				<div class="content">
					<button class="back-btn" onclick={() => this.emit("back")}>
						← Back to stories
					</button>
					<article class="story-detail">
						<h1 class="story-title">
							<a
								href={get(story)?.url || "#"}
								target="_blank"
								rel="noopener noreferrer"
								class="title-link"
							>
								{get(story)?.title || ""}
							</a>
							<span class="domain">
								{get(story)?.url ? "(" + getDomain(get(story).url) + ")" : ""}
							</span>
						</h1>
						<div class="story-meta">
							<span class="score">{(get(story)?.score || 0) + " points"}</span>
							<span class="separator">|</span>
							<span class="author">{"by " + (get(story)?.by || "")}</span>
							<span class="separator">|</span>
							<span class="time">{get(story) ? timeAgo(get(story).time) : ""}</span>
							<span class="separator">|</span>
							<span class="comment-count">{(get(story)?.descendants || 0) + " comments"}</span>
						</div>
						<div class="story-text"></div>
					</article>
					<div class="comments-section">
						<h2 class="comments-header">Comments</h2>
						<div class={get(comments).length === 0 ? "no-comments visible" : "no-comments"}>
							No comments yet.
						</div>
						<div class="comments-list">
							<For each={comments}>
								{(comment) => {
									console.log("Rendering comment:", comment);
									return <comment-item comment={comment} depth={0}></comment-item>;
								}}
							</For>
						</div>
					</div>
				</div>
			</Show>
		</section>
	);
}

defineComponent("comment-page", CommentPage);
