import { defineComponent } from "rift-js";
import { getDomain } from "./utils/getDomain.js";
import { timeAgo } from "./utils/timeAgo";
import "./story-item.css";

function StoryItem({ story, index }) {
	const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
	const domain = getDomain(story.url);
	const domainDisplay = domain ? `(${domain})` : "";

	return (
		<article class="story">
			<span class="rank">{index + 1}.</span>
			<div class="story-content">
				<div class="story-title">
					<a href={storyUrl} target="_blank" rel="noopener noreferrer" class="title-link">
						{story.title}
					</a>
					<span class="domain">{domainDisplay}</span>
				</div>
				<div class="story-meta">
					<span class="score">{story.score + " points"}</span>
					<span class="separator">|</span>
					<span class="author">{"by " + story.by}</span>
					<span class="separator">|</span>
					<span class="time">{timeAgo(story.time)}</span>
					<span class="separator">|</span>
					<a
						href="#"
						onclick={() => this.emit("viewcomments", { storyId: story.id })}
						class="comments"
					>
						{(story.descendants || 0) + " comments"}
					</a>
				</div>
			</div>
		</article>
	);
}

defineComponent("story-item", StoryItem);
