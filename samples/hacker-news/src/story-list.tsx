import { defineComponent, cell, get, For, type RoqaElement, set, Show } from "roqa";
import "./story-list.css";
import "./story-item";

export interface StoryListMethods {
	setLoading: (loading: boolean) => void;
	setError: (error: boolean) => void;
	setStories: (stories: unknown[]) => void;
}

function StoryList(this: RoqaElement<StoryListMethods>) {
	const stories = cell<unknown[]>([]);
	const loading = cell(true);
	const error = cell(false);

	// Expose methods for parent to call
	this.setStories = (value) => set(stories, value);
	this.setLoading = (value) => set(loading, value);
	this.setError = (value) => set(error, value);

	return (
		<section class="story-list">
			<Show when={get(loading)}>
				<div class="loading visible">
					<div class="loading-spinner"></div>
					<span>Loading stories...</span>
				</div>
			</Show>
			<Show when={get(error)}>
				<div class="error visible">
					<p>Failed to load stories. Please try again.</p>
				</div>
			</Show>
			<Show when={!get(loading) && !get(error)}>
				<div class="stories visible">
					<For each={stories}>
						{(story, index) => <story-item story={story} index={index}></story-item>}
					</For>
				</div>
			</Show>
		</section>
	);
}

defineComponent("story-list", StoryList);
