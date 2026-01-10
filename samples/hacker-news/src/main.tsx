import { defineComponent, cell, get, type RoqaElement, set, Show } from "roqa";
import type { CommentPageMethods } from "./comment-page";
import type { StoryListMethods } from "./story-list";
import { HN_API_BASE, ENDPOINTS, FEEDS, type FeedType } from "./feeds";
import "./main.css";
import "./header";
import "./story-list";
import "./comment-page";

function App(this: RoqaElement) {
	const currentFeed = cell<FeedType>(FEEDS.top);
	const showStoryList = cell(true);
	const currentStoryId = cell<number | null>(null);

	const fetchStory = async (id: number) => {
		const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
		return response.json();
	};

	const fetchFeed = async (feed: FeedType) => {
		const storyList = this.querySelector<RoqaElement<StoryListMethods>>("story-list");
		if (!storyList) return;
		storyList.setLoading(true);
		storyList.setError(false);
		storyList.setStories([]);
		try {
			const endpoint = ENDPOINTS[feed];
			const response = await fetch(`${HN_API_BASE}/${endpoint}.json`);
			const storyIds = await response.json();

			// Fetch first 30 stories
			const topStoryIds = storyIds.slice(0, 30);
			const storyPromises = topStoryIds.map(fetchStory);
			const fetchedStories = await Promise.all(storyPromises);

			// Filter out deleted stories
			const validStories = fetchedStories.filter((story) => story && !story.deleted);
			storyList.setStories(validStories);
		} catch (err) {
			console.error("Failed to fetch stories:", err);
			storyList.setError(true);
		} finally {
			storyList.setLoading(false);
		}
	};

	const handleFeedChange = (feed: FeedType) => {
		set(currentFeed, feed);
		set(showStoryList, true);
		fetchFeed(feed);
	};

	const handleViewComments = (storyId: number) => {
		set(currentStoryId, storyId);
		set(showStoryList, false);

		// Load the comments page
		requestAnimationFrame(() => {
			const commentPage = this.querySelector<RoqaElement<CommentPageMethods>>("comment-page");
			if (commentPage) {
				commentPage.loadStory(storyId);
			}
		});
	};

	this.connected(() => {
		// Initial fetch - defer to next tick so child components are rendered
		requestAnimationFrame(() => {
			fetchFeed(get(currentFeed));
		});

		// Listen for comment view requests from story items
		this.on("viewcomments", (e: CustomEvent<{ storyId: number }>) => {
			handleViewComments(e.detail.storyId);
		});

		// Listen for back navigation from comment page
		this.on("back", () => {
			set(showStoryList, true);
			set(currentStoryId, null);
		});
	});

	return (
		<>
			<hn-header changeFeed={handleFeedChange}></hn-header>
			<main>
				<Show when={get(showStoryList)}>
					<story-list></story-list>
				</Show>
				<Show when={!get(showStoryList)}>
					<comment-page></comment-page>
				</Show>
			</main>
		</>
	);
}

defineComponent("hacker-news", App);
